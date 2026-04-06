import { memo, useState } from "react";
import type { LearnedPredicate } from "../../../api/learning";
import { highlightFOL } from "../../../utils/folHighlight";
import { ClauseRenderer } from "./ClauseRenderer";
import { HeartIcon } from "../../ui/Icons";

interface LearnedPredicateCardProps {
  predicate: LearnedPredicate;
  rank: number;
  selectionSize: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onAddToBuilder: () => void;
  onHover: (nodeIds: string[] | null) => void;
}

interface MetricBarProps {
  label: string;
  value: number;
  displayValue: string;
  color: string;
}

const MetricBar = ({ label, value, displayValue, color }: MetricBarProps) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] text-gray-400 w-14 shrink-0">{label}</span>
    <div className="flex-1 relative h-[4px] rounded-full bg-gray-100">
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${color} transition-all duration-300`}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
    <span className="text-[10px] text-gray-500 w-8 text-right tabular-nums font-medium">
      {displayValue}
    </span>
  </div>
);

function EnrichmentBadge({ value }: { value: number }) {
  const color =
    value >= 3
      ? "text-emerald-600"
      : value >= 1.5
        ? "text-amber-500"
        : "text-gray-400";

  return (
    <span className={`text-[11px] font-semibold tabular-nums ${color}`}>
      {value.toFixed(1)}×
    </span>
  );
}

export const LearnedPredicateCard = memo(function LearnedPredicateCard({
  predicate,
  rank,
  selectionSize,
  isFavorite,
  onToggleFavorite,
  onAddToBuilder,
  onHover,
}: LearnedPredicateCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showFOL, setShowFOL] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        type: "learned-predicate",
        predicate: {
          fol_expression: predicate.fol_expression,
          display_expression: predicate.display_expression,
          literals: predicate.literals,
          clauses: predicate.clauses,
          is_disjunction: predicate.is_disjunction,
        },
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragEnd = () => setIsDragging(false);

  const coveragePct = (predicate.coverage ?? 0) * 100;
  const precisionPct = (predicate.precision ?? 0) * 100;
  const enrichment = predicate.quality_score ?? 0;
  const matchedCount = predicate.p ?? 0;
  const otherCount = predicate.n ?? 0;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => onHover(predicate.matching_nodes)}
      onMouseLeave={() => onHover(null)}
      className={`
        rounded-lg border transition-all duration-150 cursor-grab active:cursor-grabbing
        ${
          isDragging
            ? "border-violet-300 bg-violet-50 opacity-60 scale-[0.98]"
            : "bg-white border-gray-100 hover:border-violet-200 hover:shadow-sm"
        }
      `}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-50">
        <span className="text-[10px] font-medium text-gray-300 tabular-nums">
          #{rank}
        </span>
        <span className="text-gray-200">·</span>
        <span className="text-[10px] text-gray-400 tabular-nums">
          {selectionSize > 0
            ? `${matchedCount} of ${selectionSize} nodes`
            : `${predicate.matching_nodes.length} nodes`}
        </span>
        {predicate.is_disjunction && (
          <span className="text-violet-600 bg-violet-50 border border-violet-100 rounded px-1 text-[10px] font-semibold">
            OR
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={isFavorite ? "Remove from favorites" : "Save to favorites"}
          className={`p-0.5 rounded transition-colors duration-150 ${
            isFavorite ? "text-rose-400" : "text-gray-200 hover:text-rose-400"
          }`}
        >
          <HeartIcon filled={isFavorite} className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-2.5">
        <ClauseRenderer
          literals={predicate.literals}
          clauses={predicate.clauses}
          isDisjunction={predicate.is_disjunction}
          folExpression={predicate.fol_expression}
        />
      </div>

      {showFOL && (
        <div className="px-3 pb-2">
          <div className="bg-gray-50 rounded-md px-2.5 py-2 border border-gray-100">
            {highlightFOL(predicate.fol_expression)}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5 px-3 pb-2.5 border-t border-gray-50 pt-2">
        <MetricBar
          label="Coverage"
          value={coveragePct}
          displayValue={`${coveragePct.toFixed(0)}%`}
          color="bg-emerald-400"
        />
        <MetricBar
          label="Precision"
          value={precisionPct}
          displayValue={`${precisionPct.toFixed(0)}%`}
          color="bg-sky-400"
        />
        <div className="flex items-center gap-1.5 pt-0.5">
          <EnrichmentBadge value={enrichment} />
          <span className="text-[10px] text-gray-300">enriched</span>
          <span className="text-gray-200 mx-0.5">·</span>
          <span className="text-[10px] text-gray-400 tabular-nums">
            {matchedCount} matched
            {otherCount > 0 && (
              <span className="text-gray-300">, {otherCount} non-selected</span>
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 px-3 pb-2.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddToBuilder();
          }}
          className="text-[10px] text-gray-300 hover:text-violet-500 transition-colors duration-150"
        >
          + Add to builder
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowFOL((v) => !v);
          }}
          className="text-[10px] text-gray-300 hover:text-gray-500 transition-colors duration-150 ml-auto"
        >
          {showFOL ? "Hide logic ↑" : "Show logic ↓"}
        </button>
      </div>
    </div>
  );
});
