import { useState, useCallback, memo } from "react";
import { useAnalysisStore } from "../../store/analysisStore";
import { VisualPredicateBuilder } from "../predicate-builder/visual";
import { LearnedPredicatesPanel } from "../predicate-builder/learning";
import { highlightFOL } from "../../utils/folHighlight";

interface PredicateBridgeProps {
  selectedNodeIds: string[];
  onPredicateFilter?: (predicates: string[], operator: "and" | "or") => void;
}

const OPERATOR_SYMBOLS: Record<string, string> = {
  ">=": "≥",
  "<=": "≤",
  "!=": "≠",
};

const toUnicodeOp = (op: string) => OPERATOR_SYMBOLS[op] ?? op;

const CoverageBar = memo(function CoverageBar({
  value,
  color = "bg-sky-400",
}: {
  value: number;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 relative h-[3px] rounded-full bg-gray-100">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${color} transition-all duration-300`}
          style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-400 w-8 text-right tabular-nums">
        {value.toFixed(0)}%
      </span>
    </div>
  );
});

const SuggestedCard = memo(function SuggestedCard({
  space,
  expr,
  nodeCount,
  coverage,
  matchingNodes,
  dragData,
}: {
  space: "topology" | "attribute";
  expr: string;
  nodeCount: number;
  coverage: number;
  matchingNodes: string[];
  dragData: unknown;
}) {
  const { setHighlightedNodes, clearHighlights } = useAnalysisStore();
  const [isDragging, setIsDragging] = useState(false);
  const isTopo = space === "topology";

  return (
    <div
      draggable
      onDragStart={(e) => {
        setIsDragging(true);
        e.dataTransfer.setData("application/json", JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDragEnd={() => setIsDragging(false)}
      onMouseEnter={() => setHighlightedNodes(matchingNodes)}
      onMouseLeave={clearHighlights}
      className={`group/card rounded-lg border transition-all duration-150 cursor-grab active:cursor-grabbing ${
        isDragging
          ? `${isTopo ? "border-sky-300 bg-sky-50/50" : "border-emerald-300 bg-emerald-50/50"} opacity-60 scale-[0.98]`
          : `bg-white border-gray-100 ${isTopo ? "hover:border-sky-200" : "hover:border-emerald-200"} hover:shadow-sm`
      }`}
    >
      <div className="px-3 py-2 flex items-center gap-2">
        <span
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${
            isTopo
              ? "text-sky-600 bg-sky-50 border border-sky-100"
              : "text-emerald-600 bg-emerald-50 border border-emerald-100"
          }`}
        >
          {isTopo ? "topo" : "attr"}
        </span>
        <div className="flex-1 min-w-0">{highlightFOL(expr)}</div>
        <span className="text-[10px] text-gray-300 tabular-nums shrink-0">
          {nodeCount}
        </span>
      </div>
      <div className="px-3 pb-2">
        <CoverageBar
          value={coverage * 100}
          color={isTopo ? "bg-sky-400" : "bg-emerald-400"}
        />
      </div>
    </div>
  );
});

const PredicateSkeleton = () => (
  <div className="rounded-lg border border-gray-100 bg-white">
    <div className="px-3 py-2.5 flex items-center gap-2">
      <div className="h-4 w-9 bg-gray-50 rounded animate-pulse shrink-0" />
      <div className="flex-1 h-4 bg-gray-50 rounded animate-pulse" />
      <div className="h-3 w-5 bg-gray-50 rounded animate-pulse shrink-0" />
    </div>
    <div className="px-3 pb-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-[3px] bg-gray-50 rounded animate-pulse" />
        <div className="h-3 w-7 bg-gray-50 rounded animate-pulse" />
      </div>
    </div>
  </div>
);

const SectionHeader = memo(function SectionHeader({
  label,
  count,
  meta,
  children,
}: {
  label: string;
  count?: number;
  meta?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
        {label}
      </span>
      {count !== undefined && (
        <span className="text-[10px] text-gray-300 tabular-nums">{count}</span>
      )}
      {meta && (
        <>
          <span className="text-gray-200">·</span>
          <span className="text-[10px] text-gray-300 tabular-nums">{meta}</span>
        </>
      )}
      <div className="flex-1 border-t border-gray-100" />
      {children}
    </div>
  );
});

export function PredicateBridge({
  selectedNodeIds,
  onPredicateFilter,
}: PredicateBridgeProps) {
  const setPredicateMatchNodes = useAnalysisStore((s) => s.setPredicateMatchNodes);
  const setSelection = useAnalysisStore((s) => s.setSelection);
  const pinnedSelections = useAnalysisStore((s) => s.pinnedSelections);
  const topologyPredicates = useAnalysisStore((s) => s.topologyPredicates);
  const attributePredicates = useAnalysisStore((s) => s.attributePredicates);
  const loading = useAnalysisStore((s) => s.isGeneratingPredicates);

  const handleEvaluate = useCallback(
    (matchingNodes: string[]) => {
      if (matchingNodes.length > 0) {
        setSelection(matchingNodes, "predicate");
      } else {
        setSelection([], null);
      }
      setPredicateMatchNodes(matchingNodes);
      onPredicateFilter?.(matchingNodes, "and");
    },
    [setSelection, setPredicateMatchNodes, onPredicateFilter],
  );

  const handleClear = useCallback(() => {
    setPredicateMatchNodes([]);
    onPredicateFilter?.([], "and");
  }, [setPredicateMatchNodes, onPredicateFilter]);

  const hasSelection = selectedNodeIds.length > 0 || pinnedSelections.length > 0;
  const hasPredicates =
    topologyPredicates.length > 0 || attributePredicates.length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50/30">

      <div className="shrink-0 px-4 py-4 bg-white border-b border-gray-100">
        <VisualPredicateBuilder
          onEvaluate={handleEvaluate}
          onClear={handleClear}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!hasSelection ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-100/80 flex items-center justify-center mb-4">
              <svg
                className="w-7 h-7 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">
              Select nodes in the graph
            </p>
            <p className="text-xs text-gray-400 mt-1.5 max-w-[240px] leading-relaxed">
              Click, shift-click, or lasso select nodes to receive explanations
              and build predicates
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-5">
            <LearnedPredicatesPanel selectedNodeIds={selectedNodeIds} />

            <section>
              <SectionHeader
                label="Suggested Predicates"
                count={topologyPredicates.length + attributePredicates.length}
              />

              {loading ? (
                <div className="space-y-2">
                  <PredicateSkeleton />
                  <PredicateSkeleton />
                  <PredicateSkeleton />
                </div>
              ) : !hasPredicates ? (
                <div className="py-6 text-center">
                  <p className="text-xs text-gray-400">
                    No distinguishing predicates found
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topologyPredicates.map((pred, i) => {
                    const threshold = pred.value;
                    const expr = typeof threshold === "string"
                      ? `${pred.attribute}(x) ${toUnicodeOp(pred.operator)} "${threshold}"`
                      : `${pred.attribute}(x) ${toUnicodeOp(pred.operator)} ${Number(threshold) < 1 ? Number(threshold).toFixed(3) : Number(threshold).toFixed(0)}`;
                    const coverage = pred.applicable_nodes.length / Math.max(selectedNodeIds.length, 1);
                    return (
                      <SuggestedCard
                        key={`topo-${i}`}
                        space="topology"
                        expr={expr}
                        nodeCount={pred.applicable_nodes.length}
                        coverage={coverage}
                        matchingNodes={pred.applicable_nodes}
                        dragData={{
                          type: "inferred-predicate",
                          predicate: {
                            space: "topology",
                            metric: pred.attribute,
                            operator: pred.operator,
                            threshold: pred.value,
                          },
                        }}
                      />
                    );
                  })}

                  {attributePredicates.map((pred, i) => {
                    const op = toUnicodeOp(pred.operator || "=");
                    const val =
                      typeof pred.value === "string"
                        ? `"${pred.value}"`
                        : String(pred.value);
                    const expr = `${pred.attribute}(x) ${op} ${val}`;
                    const coverage = pred.applicable_nodes.length / Math.max(selectedNodeIds.length, 1);
                    return (
                      <SuggestedCard
                        key={`attr-${i}`}
                        space="attribute"
                        expr={expr}
                        nodeCount={pred.applicable_nodes.length}
                        coverage={coverage}
                        matchingNodes={pred.applicable_nodes}
                        dragData={{
                          type: "inferred-predicate",
                          predicate: {
                            space: "attribute",
                            attribute: pred.attribute,
                            operator: pred.operator || "=",
                            value: pred.value,
                          },
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export default PredicateBridge;
