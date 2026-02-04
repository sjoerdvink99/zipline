import { memo, useCallback, useState, useEffect } from "react";
import { useVisualBuilderStore } from "./store";
import { isPill, isGroup, isNeighborhood, type BuilderNode } from "./types";
import { VisualPill } from "./VisualPill";
import { VisualGroup } from "./VisualGroup";
import { NeighborhoodContainer } from "./NeighborhoodContainer";
import { ConnectiveToggle } from "./ConnectiveToggle";
import { QuickAddPopover } from "./QuickAddPopover";
import { useAnalysisStore } from "../../../store/analysisStore";

import type { ProjectionResult } from "./types";

interface VisualPredicateBuilderProps {
  onEvaluate?: (
    matchingNodes: string[],
    projections?: ProjectionResult[],
  ) => void;
  onClear?: () => void;
  className?: string;
}

export const VisualPredicateBuilder = memo(function VisualPredicateBuilder({
  onEvaluate,
  onClear,
  className = "",
}: VisualPredicateBuilderProps) {
  const {
    children,
    localConnectives,
    rootConnective,
    isEvaluating,
    evaluationResult,
    errors,
    addNode,
    removeNode,
    updateNode,
    moveNode,
    groupNodes,
    groupTwoPills,
    addPillToGroup,
    ungroupNodes,
    reorderNode,
    setLocalConnective,
    addNeighborhood,
    updateNeighborhood,
    evaluate,
    clear,
    addAttributePredicate,
    addTopologyPredicate,
    addTypePredicate,
    addLiftedPredicate,
  } = useVisualBuilderStore();

  const { clearPredicateMatches } = useAnalysisStore();

  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    new Set(),
  );
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleAddFilterItem = (event: CustomEvent) => {
      const item = event.detail;
      if (item.type === "attribute" && item.predicate) {
        const pred = item.predicate;

        const LIFTED_PREFIXES = new Set([
          "tactics",
          "platforms",
          "domains",
          "aliases",
          "techniques",
          "procedures",
          "mitigations",
          "data_sources",
          "kill_chain_phases",
        ]);

        const TOPOLOGY_ATTRIBUTES = new Set([
          "degree",
          "k_core",
          "pagerank",
          "betweenness_centrality",
          "closeness_centrality",
          "clustering_coefficient",
          "louvain_community",
          "component",
        ]);

        if (LIFTED_PREFIXES.has(pred.attribute)) {
          addLiftedPredicate(pred.attribute, pred.value);
        } else if (TOPOLOGY_ATTRIBUTES.has(pred.attribute)) {
          addTopologyPredicate(
            pred.attribute,
            pred.operator || "=",
            pred.value,
          );
        } else if (pred.operator === "between" && pred.value2 !== undefined) {
          addAttributePredicate(pred.attribute, ">=", pred.value);
          addAttributePredicate(pred.attribute, "<=", pred.value2);
        } else {
          addAttributePredicate(
            pred.attribute,
            pred.operator || "=",
            pred.value,
          );
        }
      } else if (item.type === "topology" && item.predicate) {
        const pred = item.predicate;
        addTopologyPredicate(pred.attribute, pred.operator, pred.value);
      }
    };

    window.addEventListener(
      "gb:add-filter-item",
      handleAddFilterItem as EventListener,
    );
    return () =>
      window.removeEventListener(
        "gb:add-filter-item",
        handleAddFilterItem as EventListener,
      );
  }, [addAttributePredicate, addTopologyPredicate, addLiftedPredicate]);

  const handleDrop = useCallback(
    (e: React.DragEvent, parentId?: string) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      setDragOverIndex(null);

      try {
        const data = e.dataTransfer.getData("application/json");
        if (!data) {
          return;
        }

        const dragData = JSON.parse(data);

        if (dragData.type === "reorder-node" && dragOverIndex !== null) {
          reorderNode(dragData.nodeId, dragOverIndex);
          return;
        }

        if (dragData.type === "move-pill" && dragData.pillId) {
          const isAtRoot = children.some((c) => c.id === dragData.pillId);
          if (!isAtRoot) {
            moveNode(dragData.pillId, null);
          }
          return;
        }

        if (dragData.type === "inferred-predicate") {
          const pred = dragData.predicate;
          if (pred.space === "attribute") {
            addAttributePredicate(pred.attribute, "=", pred.value, parentId);
          } else {
            addTopologyPredicate(
              pred.metric,
              pred.operator,
              pred.threshold,
              parentId,
            );
          }
        } else if (dragData.type === "type-predicate") {
          addTypePredicate(dragData.typeName, parentId);
        } else if (dragData.type === "lifted-predicate") {
          addLiftedPredicate(dragData.attribute, dragData.value, parentId);
        } else if (dragData.type === "filter-item") {
          const item = dragData.filterItem;
          if (item.type === "attribute") {
            const pred = item.predicate;
            addAttributePredicate(
              pred.attribute,
              pred.operator || "=",
              pred.value,
              parentId,
            );
          } else if (item.type === "topology") {
            const pred = item.predicate;
            addTopologyPredicate(
              pred.attribute,
              pred.operator,
              pred.value as number,
              parentId,
            );
          }
        }
      } catch (err) {
        void err;
      }
    },
    [
      addAttributePredicate,
      addTopologyPredicate,
      addTypePredicate,
      addLiftedPredicate,
      reorderNode,
      moveNode,
      children,
      dragOverIndex,
    ],
  );

  const handleEvaluate = useCallback(async () => {
    const result = await evaluate();
    if (result) {
      onEvaluate?.(result.matchingNodes, result.projections);
    }
  }, [evaluate, onEvaluate]);

  const handleClear = useCallback(() => {
    clear();
    clearPredicateMatches();
    setSelectedNodeIds(new Set());
    onClear?.();
  }, [clear, clearPredicateMatches, onClear]);

  const handleGroupSelected = useCallback(() => {
    if (selectedNodeIds.size >= 2) {
      groupNodes(Array.from(selectedNodeIds));
      setSelectedNodeIds(new Set());
    }
  }, [selectedNodeIds, groupNodes]);

  const handleAddNeighborhood = useCallback(() => {
    addNeighborhood();
  }, [addNeighborhood]);

  const toggleNodeSelection = useCallback((nodeId: string) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const renderNode = (node: BuilderNode, index: number) => {
    const showConnective = index > 0;
    const isSelected = selectedNodeIds.has(node.id);
    const currentConnective = localConnectives[node.id] ?? rootConnective;

    return (
      <div key={node.id} className="flex items-start gap-1.5">
        {showConnective && (
          <div className="flex items-center h-8">
            <ConnectiveToggle
              value={currentConnective}
              onChange={(newConnective) =>
                setLocalConnective(node.id, newConnective)
              }
              size="sm"
            />
          </div>
        )}

        <div
          className={`
            relative transition-all rounded-lg
            ${isSelected ? "ring-2 ring-blue-500 ring-offset-1" : ""}
          `}
          onClick={(e) => {
            if (e.shiftKey) {
              e.stopPropagation();
              toggleNodeSelection(node.id);
            }
          }}
        >
          {isPill(node) && (
            <VisualPill
              pill={node}
              onRemove={() => removeNode(node.id)}
              onUpdate={(updates) => updateNode(node.id, updates)}
              onGroupWith={(otherPillId) => {
                groupTwoPills(node.id, otherPillId);
              }}
            />
          )}

          {isGroup(node) && (
            <VisualGroup
              group={node}
              onUpdate={(updates) => updateNode(node.id, updates)}
              onRemove={() => removeNode(node.id)}
              onRemoveChild={(childId) => removeNode(childId)}
              onUpdateChild={(childId, updates) => updateNode(childId, updates)}
              onAddToGroup={(pillData) => addPillToGroup(node.id, pillData)}
              onUngroup={() => ungroupNodes(node.id)}
            />
          )}

          {isNeighborhood(node) && (
            <NeighborhoodContainer
              neighborhood={node}
              onUpdate={(updates) => updateNeighborhood(node.id, updates)}
              onRemove={() => removeNode(node.id)}
              onRemoveChild={(childId) => removeNode(childId)}
              onUpdateChild={(childId, updates) => updateNode(childId, updates)}
              onUpdateGroup={(groupId, updates) => updateNode(groupId, updates)}
              onAddToNestedGroup={(groupId, pillData) =>
                addPillToGroup(groupId, pillData)
              }
              onGroupTwoPills={(targetPillId, droppedPillId) =>
                groupTwoPills(targetPillId, droppedPillId)
              }
              onAddConstraint={(child) => {
                const cmd = child as { type: string; pillId?: string };
                if (cmd.type === "move-pill" && cmd.pillId) {
                  moveNode(cmd.pillId, node.id);

                  if (isNeighborhood(node)) {
                    updateNode(cmd.pillId, { variable: node.boundVariable });
                  }
                } else {
                  addNode(child as BuilderNode, node.id);
                }
              }}
            />
          )}
        </div>
      </div>
    );
  };

  const isEmpty = children.length === 0;

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Expression Builder
        </span>

        <div className="flex items-center gap-1.5">
          <QuickAddPopover />
          {!isEmpty && (
            <>
              {selectedNodeIds.size >= 2 && (
                <button
                  onClick={handleGroupSelected}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium hover:bg-blue-100 transition-colors"
                >
                  Group
                </button>
              )}

              <button
                onClick={handleClear}
                className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Clear
              </button>

              <button
                onClick={handleEvaluate}
                disabled={isEvaluating}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 text-white text-xs font-medium rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {isEvaluating ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
                Run
              </button>
            </>
          )}
        </div>
      </div>

      <div
        className={`
          flex-1 p-4 min-h-[120px] rounded-lg border-2 border-dashed transition-colors
          ${isDragOver ? "border-blue-400 bg-blue-50/50" : "border-gray-200 bg-white"}
        `}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false);
          }
        }}
        onDrop={(e) => {
          const target = e.target as HTMLElement;
          const pillTarget = target.closest("[data-pill-drop-target]");
          const neighborhoodTarget = target.closest(
            "[data-neighborhood-drop-target]",
          );

          if (pillTarget || neighborhoodTarget) {
            return;
          }

          handleDrop(e);
        }}
      >
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 py-6">
            <svg
              className={`w-7 h-7 mb-2 ${isDragOver ? "text-violet-400" : "text-gray-200"} transition-colors`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <p className="text-xs text-gray-300">
              Drop predicates here to build expression
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start gap-2">
              {children.map((node, index) => (
                <div key={node.id} className="flex items-start">
                  <div
                    className={`
                      w-1 self-stretch mx-0.5 rounded-sm transition-all
                      ${dragOverIndex === index ? "bg-blue-400 w-1.5" : "bg-transparent hover:bg-gray-200"}
                    `}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverIndex(index);
                    }}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverIndex(null);
                      try {
                        const data = JSON.parse(
                          e.dataTransfer.getData("application/json"),
                        );
                        const sourceId = data.nodeId || data.pillId;
                        if (sourceId && sourceId !== node.id) {
                          reorderNode(sourceId, index);
                        }
                      } catch (err) {
                        void err;
                      }
                    }}
                  />
                  {renderNode(node, index)}
                </div>
              ))}
              <div
                className={`
                  w-1 self-stretch mx-0.5 rounded-sm transition-all min-h-[2rem]
                  ${dragOverIndex === children.length ? "bg-blue-400 w-1.5" : "bg-transparent hover:bg-gray-200"}
                `}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverIndex(children.length);
                }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverIndex(null);
                  try {
                    const data = JSON.parse(
                      e.dataTransfer.getData("application/json"),
                    );
                    const sourceId = data.nodeId || data.pillId;
                    if (sourceId) {
                      reorderNode(sourceId, children.length);
                    }
                  } catch (err) {
                    void err;
                  }
                }}
              />
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={handleAddNeighborhood}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-violet-600 bg-violet-50 rounded hover:bg-violet-100 transition-colors border border-violet-100"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Neighborhood
              </button>

              <span className="text-[10px] text-gray-300">
                Shift+click to select, drag pill onto another to group
              </span>
            </div>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="mt-2 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
          {errors.map((error, i) => (
            <div key={i} className="text-xs text-red-700">
              {error}
            </div>
          ))}
        </div>
      )}

      {evaluationResult && (
        <div className="mt-2 px-3 py-2 bg-emerald-50/80 rounded-lg border border-emerald-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-700">
              {evaluationResult.matchingNodes.length} nodes match
            </span>
            <span className="text-[10px] text-emerald-500 tabular-nums">
              {evaluationResult.evaluationTimeMs.toFixed(1)}ms
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

export default VisualPredicateBuilder;
