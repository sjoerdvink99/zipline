import { useState, useEffect, useCallback, useRef } from "react";
import { useAnalysisStore } from "../../store/analysisStore";
import {
  type TopologyPredicate,
  type AttributePredicate,
  inferSelectionPredicates,
  type SelectionPredicateResponse,
} from "../../api/predicates";
import { debounce } from "../../utils/debounce";
import { createPattern, type PatternCreate } from "../../api/patterns";
import { FilterBuilder } from "../predicate-builder/FilterBuilder";

interface PredicateBridgeProps {
  selectedNodeIds: string[];
  onPredicateSelect: (predicate: any) => void;
  onPredicateFilter: (predicates: any[], operator: "and" | "or") => void;
}

interface GroupedAttributePredicates {
  [nodeType: string]: {
    count: number;
    predicates: AttributePredicate[];
  };
}


function TopologyPredicateCard({
  predicate,
  onSelect,
  onDrag,
}: {
  predicate: TopologyPredicate;
  onSelect: () => void;
  onDrag: (predicate: TopologyPredicate) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const { setHighlightedNodes, clearHighlights, addCrossSpaceHighlight, removeCrossSpaceHighlight } = useAnalysisStore();

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    const filterItem = {
      id: `topology-${predicate.id}`,
      type: "topology" as const,
      predicate: predicate,
      description: predicate.description,
      nodeTypes: predicate.applicable_node_types
    };
    const dragData = {
      type: "filter-item",
      filterItem: filterItem,
      legacyType: "topology",
      predicate: predicate
    };
    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = "copy";
    onDrag(predicate);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleMouseEnter = () => {
    setHighlightedNodes(predicate.applicable_nodes);
    addCrossSpaceHighlight(
      `topology-${predicate.id}`,
      predicate.applicable_nodes,
      "#0ea5e9", // sky-500
      `Topology: ${predicate.attribute.replace(/_/g, " ")}`
    );
  };

  const handleMouseLeave = () => {
    clearHighlights();
    removeCrossSpaceHighlight(`topology-${predicate.id}`);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onSelect}
      className={`p-3 border rounded-lg cursor-grab transition-all ${
        isDragging
          ? "border-sky-400 bg-sky-100 opacity-70 scale-105"
          : "border-sky-200 bg-sky-50/30 hover:border-sky-300 hover:bg-sky-50"
      }`}
      title="Click to select, drag to filter builder, hover to highlight nodes"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-sky-700">
          {predicate.attribute.replace(/_/g, " ")}
        </span>
        <span className="text-xs text-sky-600">
          {predicate.applicable_nodes.length} matches
        </span>
      </div>
      <p className="text-xs text-gray-600 mb-1">{predicate.description}</p>
    </div>
  );
}

function AttributePredicateCard({
  predicate,
  onSelect,
  onDrag,
}: {
  predicate: AttributePredicate;
  onSelect: () => void;
  onDrag: (predicate: AttributePredicate) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const { setHighlightedNodes, clearHighlights, addCrossSpaceHighlight, removeCrossSpaceHighlight } = useAnalysisStore();

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    const filterItem = {
      id: `attribute-${predicate.id}`,
      type: "attribute" as const,
      predicate: predicate,
      description: predicate.description,
      nodeTypes: predicate.applicable_node_types
    };
    const dragData = {
      type: "filter-item",
      filterItem: filterItem,
      legacyType: "attribute",
      predicate: predicate
    };
    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = "copy";
    onDrag(predicate);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleMouseEnter = () => {
    setHighlightedNodes(predicate.applicable_nodes);
    addCrossSpaceHighlight(
      `attribute-${predicate.id}`,
      predicate.applicable_nodes,
      "#10b981", // emerald-500
      `Attribute: ${predicate.attribute}`
    );
  };

  const handleMouseLeave = () => {
    clearHighlights();
    removeCrossSpaceHighlight(`attribute-${predicate.id}`);
  };

  const typeColor = "text-emerald-700";
  const borderColor = "border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 hover:bg-emerald-50";
  const draggingColor = "border-emerald-400 bg-emerald-100 opacity-70 scale-105";

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onSelect}
      className={`p-3 border rounded-lg cursor-grab transition-all ${
        isDragging ? draggingColor : borderColor
      }`}
      title="Click to select, drag to filter builder, hover to highlight nodes"
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-semibold ${typeColor}`}>
          {predicate.attribute}
        </span>
        <span className="text-xs text-gray-600">
          {predicate.applicable_nodes.length} matches
        </span>
      </div>
      <p className="text-xs text-gray-600 mb-1">{predicate.description}</p>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="capitalize">{predicate.attribute_type}</span>
        {predicate.node_type && (
          <span className="bg-gray-100 px-2 py-0.5 rounded">
            {predicate.node_type}
          </span>
        )}
      </div>
    </div>
  );
}


function SkeletonPredicateCard() {
  return (
    <div className="p-3 border border-gray-200 rounded-lg bg-gray-50/30">
      <div className="flex items-center justify-between mb-2">
        <div className="h-4 bg-gray-300 rounded animate-pulse w-20"></div>
        <div className="h-3 bg-gray-300 rounded animate-pulse w-12"></div>
      </div>
      <div className="h-3 bg-gray-300 rounded animate-pulse w-full mb-2"></div>
      <div className="h-3 bg-gray-300 rounded animate-pulse w-3/4"></div>
    </div>
  );
}

function SpaceLoadingState({
  title,
  icon,
  color = "gray"
}: {
  title: string;
  icon: React.ReactNode;
  color?: "gray" | "sky" | "emerald" | "slate";
}) {
  const colorClasses = {
    gray: "text-gray-600",
    sky: "text-sky-600",
    emerald: "text-emerald-600",
    slate: "text-slate-600"
  };

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={colorClasses[color]}>
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <div className="h-4 bg-gray-300 rounded animate-pulse w-8"></div>
      </div>
      <div className="space-y-2">
        <SkeletonPredicateCard />
        <SkeletonPredicateCard />
      </div>
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <p className="text-sm text-gray-600 font-medium mb-1">{title}</p>
      <p className="text-xs text-gray-400 max-w-[200px] text-center">{subtitle}</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="p-4">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-red-600 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-800 mb-1">
              Failed to generate predicates
            </h3>
            <p className="text-sm text-red-700 mb-3">{error}</p>
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-800 bg-red-100 hover:bg-red-200 border border-red-300 rounded-md transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function PersistentFilterBuilder({
  onFilterApply,
  onFilterClear,
  onFilterSave,
}: {
  onFilterApply: (matchingNodeIds: string[]) => void;
  onFilterClear: () => void;
  onFilterSave: (filterName: string, filterItems: any[], operator: "and" | "or") => void;
}) {
  return (
    <div className="shrink-0 border-b border-gray-100">
      <FilterBuilder
        onFilterApply={onFilterApply}
        onFilterClear={onFilterClear}
        onFilterSave={onFilterSave}
      />
    </div>
  );
}

export function PredicateBridge({
  selectedNodeIds,
  onPredicateSelect,
  onPredicateFilter,
}: PredicateBridgeProps) {
  const { saveFilterChain, setSelection } = useAnalysisStore();
  const [fastResponse, setFastResponse] = useState<SelectionPredicateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadPredicates = useCallback(async (nodeIds: string[]) => {
    // Cancel previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!nodeIds.length) {
      setFastResponse(null);
      setLoading(false);
      return;
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);
    setError(null);

    try {
      // Always use fast inference first - it's more performant
      const fastResult = await inferSelectionPredicates({
        selected_nodes: nodeIds,
        min_coverage: 0.6,
        min_selectivity: 0.1,
        max_predicates_per_type: 10
      });

      if (signal.aborted) return;
      setFastResponse(fastResult);

    } catch (err) {
      if (signal.aborted) return;
      console.warn("Fast inference failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load predicates");
      setFastResponse(null);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // Debounced version with 300ms delay to prevent multiple rapid calls
  const debouncedLoadPredicates = useCallback(
    debounce(loadPredicates, 300),
    [loadPredicates]
  );

  useEffect(() => {
    debouncedLoadPredicates(selectedNodeIds);

    // Cleanup function to abort ongoing requests
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [selectedNodeIds, debouncedLoadPredicates]);

  const groupedAttributePredicates: GroupedAttributePredicates = {};

  if (fastResponse) {
    fastResponse.attribute_predicates.forEach((predicate) => {
      const nodeType = "all";
      if (!groupedAttributePredicates[nodeType]) {
        groupedAttributePredicates[nodeType] = {
          count: 0,
          predicates: [],
        };
      }

      const legacyPredicate: AttributePredicate = {
        id: `fast-${predicate.attribute}-${predicate.operator}-${String(predicate.value).replace(/\s+/g, '-')}`,
        attribute: predicate.attribute,
        operator: predicate.operator,
        value: predicate.value,
        description: `${predicate.attribute} ${predicate.operator} ${predicate.value} (Coverage: ${(predicate.coverage * 100).toFixed(0)}%)`,
        attribute_type: typeof predicate.value === 'number' ? 'numeric' : 'categorical',
        applicable_nodes: predicate.matching_nodes,
        applicable_node_types: ["all"]
      };

      groupedAttributePredicates[nodeType].predicates.push(legacyPredicate);
      groupedAttributePredicates[nodeType].count += 1;
    });
  }

  const topologyPredicates: TopologyPredicate[] = (() => {
    if (fastResponse) {
      return fastResponse.topology_predicates.map((predicate) => {
        return {
          id: `fast-topo-${predicate.metric}-${predicate.operator}-${predicate.threshold}`,
          attribute: predicate.metric, // Map metric to attribute for TopologyPredicate interface
          operator: predicate.operator,
          value: predicate.threshold, // Map threshold to value for TopologyPredicate interface
          description: `${predicate.metric} ${predicate.operator} ${predicate.threshold.toFixed(3)} (Coverage: ${(predicate.coverage * 100).toFixed(0)}%)`,
          applicable_nodes: predicate.matching_nodes
        };
      });
    }
    return [];
  })();

  const handlePredicateDrag = (predicate: TopologyPredicate | AttributePredicate) => {
    console.log("Predicate dragged:", predicate);
  };

  const handleFilterApply = (matchingNodeIds: string[]) => {
    console.log("Filter applied, matching nodes:", matchingNodeIds);

    setSelection(matchingNodeIds, "predicate");

    onPredicateFilter(matchingNodeIds, "and");
  };

  const handleFilterClear = () => {
    console.log("Filter cleared");
    onPredicateFilter([], "and");
  };

  const handleFilterSave = async (filterName: string, filterItems: any[], operator: "and" | "or") => {
    try {
      const { selectedNodes } = useAnalysisStore.getState();

      const patternData: PatternCreate = {
        name: filterName,
        description: `Custom pattern created from predicate combination: ${filterItems.map(item => item.description).join(` ${operator} `)}`,
        node_ids: selectedNodes,
        pattern_type: 'custom',
        domain: 'user_defined',
        metadata: {
          predicates: filterItems,
          operator: operator,
          created_from: 'predicate_builder',
          timestamp: new Date().toISOString()
        },
        confidence: 0.9 // Default confidence for user-created patterns
      };

      const savedPattern = await createPattern(patternData);
      console.log("Pattern saved successfully:", savedPattern);

      const predicateIds = filterItems.map((item: any) => item.id);
      const setOperations: Record<string, "and" | "or" | "not"> = {};

      filterItems.forEach((item: any) => {
        setOperations[item.id] = operator;
      });

      saveFilterChain(filterName, predicateIds, setOperations);
      console.log("Filter saved:", { filterName, filterItems, operator });
    } catch (error) {
      console.error("Failed to save pattern:", error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      
      <div className="shrink-0 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gray-100 rounded-lg">
            <svg
              className="w-4 h-4 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Predicate Bridge</h2>
            <p className="text-[10px] text-gray-500">
              {selectedNodeIds.length > 0
                ? `${selectedNodeIds.length} nodes selected`
                : "Descriptive predicates for your selection"
              }
            </p>
          </div>
        </div>
      </div>

      

      
      <PersistentFilterBuilder
        onFilterApply={handleFilterApply}
        onFilterClear={handleFilterClear}
        onFilterSave={handleFilterSave}
      />

      
      <div className="flex-1 min-h-0 overflow-y-auto">
        {selectedNodeIds.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              title="No selection yet"
              subtitle="Select nodes to generate descriptive predicates across topology and attribute spaces"
            />
          </div>
        ) : loading ? (
          <div className="space-y-6">
            <SpaceLoadingState
              title="Topology Predicates"
              color="sky"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="19" cy="6" r="2" />
                  <circle cx="19" cy="18" r="2" />
                  <path strokeLinecap="round" d="M7 11.5L17 6.5M7 12.5L17 17.5" />
                </svg>
              }
            />
            <SpaceLoadingState
              title="Attribute Predicates"
              color="emerald"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            />
          </div>
        ) : error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              setError(null);
              loadPredicates(selectedNodeIds);
            }}
          />
        ) : (
          fastResponse && (
            <div className="space-y-6">


              <section className="px-4 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg
                    className="w-4 h-4 text-sky-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="19" cy="6" r="2" />
                    <circle cx="19" cy="18" r="2" />
                    <path strokeLinecap="round" d="M7 11.5L17 6.5M7 12.5L17 17.5" />
                  </svg>
                  <h3 className="text-sm font-semibold text-gray-800">Topology Predicates</h3>
                  <span className="text-xs text-gray-500">
                    ({topologyPredicates.length})
                  </span>
                </div>

                {topologyPredicates.length === 0 ? (
                  <EmptyState
                    title="No topology predicates"
                    subtitle="No distinguishing structural characteristics found"
                  />
                ) : (
                  <div className="space-y-2">
                    {topologyPredicates.map((predicate) => (
                      <TopologyPredicateCard
                        key={predicate.id}
                        predicate={predicate}
                        onSelect={() => onPredicateSelect(predicate)}
                        onDrag={handlePredicateDrag}
                      />
                    ))}
                  </div>
                )}
              </section>

              
              <section className="px-4 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg
                    className="w-4 h-4 text-emerald-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  <h3 className="text-sm font-semibold text-gray-800">Attribute Predicates</h3>
                  <span className="text-xs text-gray-500">
                    ({Object.values(groupedAttributePredicates).reduce((sum, group) => sum + group.count, 0)})
                  </span>
                </div>

                {Object.keys(groupedAttributePredicates).length === 0 ? (
                  <EmptyState
                    title="No attribute predicates"
                    subtitle="No distinguishing attribute characteristics found"
                  />
                ) : (
                  <div className="space-y-4">
                    {Object.entries(groupedAttributePredicates).map(([nodeType, group]) => (
                      <div key={nodeType}>
                        {Object.keys(groupedAttributePredicates).length > 1 && (
                          <div className="mb-2">
                            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                              {nodeType === "all" ? "All Nodes" : `${nodeType} Nodes`}
                              <span className="ml-1 text-gray-400">({group.count})</span>
                            </h4>
                          </div>
                        )}
                        <div className="space-y-2">
                          {group.predicates.map((predicate) => (
                            <AttributePredicateCard
                              key={predicate.id}
                              predicate={predicate}
                              onSelect={() => onPredicateSelect(predicate)}
                              onDrag={handlePredicateDrag}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )
        )}
      </div>
    </div>
  );
}