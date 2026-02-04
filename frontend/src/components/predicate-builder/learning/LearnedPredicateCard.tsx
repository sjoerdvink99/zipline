import { memo, useState } from "react";
import type { LearnedPredicate } from "../../../api/learning";
import { highlightFOL } from "../../../utils/folHighlight";
import { HeartIcon } from "../../ui/Icons";

interface LearnedPredicateCardProps {
  predicate: LearnedPredicate;
  rank: number;
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
    <span className="text-[10px] text-gray-400 w-8 shrink-0">{label}</span>
    <div className="flex-1 relative h-[3px] rounded-full bg-gray-100">
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${color} transition-all duration-300`}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
    <span className="text-[10px] text-gray-400 w-8 text-right tabular-nums">
      {displayValue}
    </span>
  </div>
);

export const LearnedPredicateCard = memo(function LearnedPredicateCard({
  predicate,
  rank,
  isFavorite,
  onToggleFavorite,
  onAddToBuilder,
  onHover,
}: LearnedPredicateCardProps) {
  const [isDragging, setIsDragging] = useState(false);

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
          {predicate.matching_nodes.length} nodes
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
        {highlightFOL(predicate.fol_expression)}
      </div>

      <div className="flex flex-col gap-1.5 px-3 pb-2.5 border-t border-gray-50 pt-2">
        <MetricBar
          label="cov"
          value={coveragePct}
          displayValue={`${coveragePct.toFixed(0)}%`}
          color="bg-emerald-400"
        />
        <MetricBar
          label="prec"
          value={precisionPct}
          displayValue={`${precisionPct.toFixed(0)}%`}
          color="bg-sky-400"
        />
        <div className="flex gap-4 pt-0.5">
          {[
            ["p", String(predicate.p ?? 0)],
            ["n", String(predicate.n ?? 0)],
            ["enr", enrichment.toFixed(1)],
          ].map(([label, val]) => (
            <span key={label} className="text-[10px] text-gray-400 tabular-nums">
              {label}{" "}
              <span className="text-gray-600">{val}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="px-3 pb-2.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddToBuilder();
          }}
          className="text-[10px] text-gray-300 hover:text-violet-500 transition-colors duration-150"
        >
          + Add to builder
        </button>
      </div>
    </div>
  );
});
