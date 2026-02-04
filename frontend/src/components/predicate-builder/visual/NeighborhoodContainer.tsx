
import {
  memo,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  lazy,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import type {
  NeighborhoodBlock,
  BuilderNode,
  Quantifier,
  Comparator,
  PredicatePill,
  PredicateGroup,
} from "./types";
import {
  isPill,
  isNeighborhood,
  isGroup,
  createPill,
} from "./types";
import { VisualPill } from "./VisualPill";
import { ConnectiveToggle } from "./ConnectiveToggle";
import { useVisualBuilderStore } from "./store";

const VisualGroup = lazy(() =>
  import("./VisualGroup").then((m) => ({ default: m.VisualGroup })),
);

type MoveCommand = { type: "move-pill"; pillId: string };

interface NeighborhoodProps {
  neighborhood: NeighborhoodBlock;
  onUpdate: (updates: Partial<NeighborhoodBlock>) => void;
  onRemove: () => void;
  onRemoveChild: (childId: string) => void;
  onUpdateChild?: (childId: string, updates: Partial<PredicatePill>) => void;
  onUpdateGroup?: (groupId: string, updates: Partial<PredicateGroup>) => void;
  onAddToNestedGroup?: (groupId: string, data: unknown) => void;
  onGroupTwoPills?: (targetPillId: string, droppedPillId: string) => void;
  onAddConstraint?: (node: BuilderNode | MoveCommand) => void;
  depth?: number;
}

const VAR_CHAIN: Record<string, string> = { x: "y", y: "z", z: "w", w: "v" };

const quantifierOptions: {
  value: Quantifier;
  label: string;
  symbol: string;
  description: string;
}[] = [
  {
    value: "∀",
    label: "all",
    symbol: "∀",
    description: "All neighbors must satisfy",
  },
  {
    value: "∃",
    label: "some",
    symbol: "∃",
    description: "At least one neighbor must satisfy",
  },
  {
    value: "exactly",
    label: "exactly",
    symbol: "=",
    description: "Exactly N neighbors must satisfy",
  },
  {
    value: "at_least",
    label: "at least",
    symbol: "≥",
    description: "At least N neighbors must satisfy",
  },
  {
    value: "at_most",
    label: "at most",
    symbol: "≤",
    description: "At most N neighbors must satisfy",
  },
];

function getNodeDescription(node: BuilderNode): string {
  if (isPill(node)) {
    if (node.type === "type") {
      return node.typeName || "Type";
    } else if (node.type === "attribute") {
      return `${node.attribute} ${node.comparator} ${node.value}`;
    } else if (node.type === "topology") {
      return `${node.attribute} ${node.comparator} ${node.value}`;
    } else if (node.type === "lifted") {
      return `${node.liftedAttribute}: ${node.liftedValue}`;
    }
  } else if (isGroup(node)) {
    const childCount = node.children.length;
    return `Group (${childCount} item${childCount !== 1 ? "s" : ""})`;
  } else if (isNeighborhood(node)) {
    return `∃${node.boundVariable} ∈ N(${node.targetVariable})`;
  }
  return "Node";
}

function getNodeIcon(node: BuilderNode): React.ReactNode {
  if (isPill(node)) {
    if (node.type === "type" || node.type === "attribute") {
      return (
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
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
      );
    } else if (node.type === "topology") {
      return (
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
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      );
    }
  } else if (isGroup(node)) {
    return (
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
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
    );
  } else if (isNeighborhood(node)) {
    return (
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
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
        />
      </svg>
    );
  }
  return null;
}

function getNodeColor(node: BuilderNode): {
  bg: string;
  border: string;
  text: string;
  iconBg: string;
} {
  if (isPill(node)) {
    if (node.type === "type" || node.type === "attribute") {
      return {
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        text: "text-emerald-700",
        iconBg: "bg-emerald-500",
      };
    } else if (node.type === "topology") {
      return {
        bg: "bg-sky-50",
        border: "border-sky-200",
        text: "text-sky-700",
        iconBg: "bg-sky-500",
      };
    } else if (node.type === "lifted") {
      return {
        bg: "bg-violet-50",
        border: "border-violet-200",
        text: "text-violet-700",
        iconBg: "bg-violet-500",
      };
    }
  } else if (isGroup(node)) {
    return {
      bg: "bg-slate-50",
      border: "border-slate-300",
      text: "text-slate-700",
      iconBg: "bg-slate-500",
    };
  } else if (isNeighborhood(node)) {
    return {
      bg: "bg-indigo-50",
      border: "border-indigo-200",
      text: "text-indigo-700",
      iconBg: "bg-indigo-500",
    };
  }
  return {
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-700",
    iconBg: "bg-gray-500",
  };
}

export const NeighborhoodContainer = memo(function NeighborhoodContainer({
  neighborhood,
  onUpdate,
  onRemove,
  onRemoveChild,
  onUpdateChild,
  onUpdateGroup,
  onAddToNestedGroup,
  onGroupTwoPills,
  onAddConstraint,
  depth = 0,
}: NeighborhoodProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const targetSelectorRef = useRef<HTMLDivElement>(null);
  const targetButtonRef = useRef<HTMLButtonElement>(null);

  const rootChildren = useVisualBuilderStore((state) => state.children);

  const selectableTargets = useMemo(() => {
    return rootChildren.filter((c) => c.id !== neighborhood.id);
  }, [rootChildren, neighborhood.id]);

  const selectedTargetIds = useMemo(() => {
    return neighborhood.targetNodeIds || [];
  }, [neighborhood.targetNodeIds]);

  const isNodeSelected = useCallback(
    (nodeId: string) => {
      if (selectedTargetIds.length === 0) return true;
      return selectedTargetIds.includes(nodeId);
    },
    [selectedTargetIds],
  );

  const targetDescription = useMemo(() => {
    if (selectableTargets.length === 0) {
      return "all nodes";
    }

    if (selectedTargetIds.length === 0) {
      if (selectableTargets.length === 1) {
        return getNodeDescription(selectableTargets[0]);
      }
      return `all ${selectableTargets.length} predicates`;
    }

    const selectedNodes = selectableTargets.filter((n) =>
      selectedTargetIds.includes(n.id),
    );

    if (selectedNodes.length === 0) {
      return "no selection";
    }

    if (selectedNodes.length === 1) {
      return getNodeDescription(selectedNodes[0]);
    }

    if (selectedNodes.length === selectableTargets.length) {
      return `all ${selectedNodes.length} predicates`;
    }

    return `${selectedNodes.length} of ${selectableTargets.length} predicates`;
  }, [selectableTargets, selectedTargetIds]);

  const toggleTargetNode = useCallback(
    (nodeId: string) => {
      const clicked = rootChildren.find((c) => c.id === nodeId);
      const currentSelected = neighborhood.targetNodeIds || [];

      if (clicked && isNeighborhood(clicked)) {
        if (currentSelected.includes(nodeId)) {
          onUpdate({
            targetNodeIds: undefined,
            targetVariable: "x",
            boundVariable: VAR_CHAIN["x"],
          });
        } else {
          const newTargetVar = clicked.boundVariable;
          onUpdate({
            targetNodeIds: [nodeId],
            targetVariable: newTargetVar,
            boundVariable: VAR_CHAIN[newTargetVar] || "z",
          });
        }
      } else {
        if (currentSelected.length === 0) {
          onUpdate({ targetNodeIds: [nodeId] });
        } else if (currentSelected.includes(nodeId)) {
          const newSelection = currentSelected.filter((id) => id !== nodeId);
          onUpdate({
            targetNodeIds: newSelection.length === 0 ? undefined : newSelection,
          });
        } else {
          onUpdate({ targetNodeIds: [...currentSelected, nodeId] });
        }
      }
    },
    [neighborhood.targetNodeIds, rootChildren, onUpdate],
  );

  const selectAllTargets = useCallback(() => {
    onUpdate({
      targetNodeIds: undefined,
      targetVariable: "x",
      boundVariable: VAR_CHAIN["x"],
    });
  }, [onUpdate]);

  useEffect(() => {
    if (!showTargetSelector) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        targetSelectorRef.current &&
        !targetSelectorRef.current.contains(e.target as Node) &&
        targetButtonRef.current &&
        !targetButtonRef.current.contains(e.target as Node)
      ) {
        setShowTargetSelector(false);
        setDropdownPosition(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTargetSelector]);

  const needsCount = ["exactly", "at_least", "at_most"].includes(
    neighborhood.quantifier,
  );

  const currentQuantifier = quantifierOptions.find(
    (q) => q.value === neighborhood.quantifier,
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (!onAddConstraint) {
        return;
      }

      try {
        const rawData = e.dataTransfer.getData("application/json");
        const data = JSON.parse(rawData);

        if (data.type === "move-pill" && data.pillId) {
          onAddConstraint({ type: "move-pill", pillId: data.pillId });
          return;
        }

        if (data.type === "inferred-predicate" && data.predicate) {
          const pred = data.predicate;
          const variable = neighborhood.boundVariable;

          if (pred.space === "attribute") {
            const pill = createPill("attribute", {
              variable,
              attribute: pred.attribute,
              comparator: "=" as Comparator,
              value: pred.value,
            });
            onAddConstraint(pill);
          } else if (pred.space === "topology") {
            const pill = createPill("topology", {
              variable,
              attribute: pred.metric,
              comparator: (pred.operator || ">") as Comparator,
              value: pred.threshold,
            });
            onAddConstraint(pill);
          }
          return;
        }

        if (data.type === "type-predicate" && data.typeName) {
          const pill = createPill("type", {
            variable: neighborhood.boundVariable,
            typeName: data.typeName,
          });
          onAddConstraint(pill);
          return;
        }

        if (data.type === "lifted-predicate") {
          const pill = createPill("lifted", {
            variable: neighborhood.boundVariable,
            liftedAttribute: data.attribute,
            liftedValue: data.value,
          });
          onAddConstraint(pill);
          return;
        }

        if (data.type === "filter-item" && data.filterItem) {
          const item = data.filterItem;
          const variable = neighborhood.boundVariable;

          if (item.type === "attribute") {
            const pred = item.predicate;
            const pill = createPill("attribute", {
              variable,
              attribute: pred.attribute,
              comparator: (pred.operator || "=") as Comparator,
              value: pred.value,
            });
            onAddConstraint(pill);
          } else if (item.type === "topology") {
            const pred = item.predicate;
            const pill = createPill("topology", {
              variable,
              attribute: pred.attribute,
              comparator: pred.operator as Comparator,
              value: pred.value,
            });
            onAddConstraint(pill);
          }
          return;
        }
      } catch (err) {
        void err;
      }
    },
    [onAddConstraint, neighborhood.boundVariable],
  );


  const renderChild = (child: BuilderNode, index: number) => {
    const showConnective = index > 0;

    return (
      <div key={child.id} className="flex items-center gap-1.5">
        {showConnective && (
          <ConnectiveToggle
            value={neighborhood.childConnective}
            onChange={(newConnective) => onUpdate({ childConnective: newConnective })}
            size="sm"
          />
        )}

        {isPill(child) && (
          <VisualPill
            pill={child}
            onRemove={() => onRemoveChild(child.id)}
            onUpdate={(updates) => onUpdateChild?.(child.id, updates)}
            onGroupWith={(otherPillId) => onGroupTwoPills?.(child.id, otherPillId)}
            isNested
          />
        )}

        {isGroup(child) && (
          <Suspense
            fallback={
              <div className="px-2 py-1 text-xs text-gray-400">Loading...</div>
            }
          >
            <VisualGroup
              group={child}
              onUpdate={(updates) => onUpdateGroup?.(child.id, updates)}
              onRemove={() => onRemoveChild(child.id)}
              onRemoveChild={onRemoveChild}
              onUpdateChild={onUpdateChild}
              onAddToGroup={(data) => onAddToNestedGroup?.(child.id, data)}
              onUngroup={() => {}}
              depth={depth + 1}
            />
          </Suspense>
        )}

        {isNeighborhood(child) && (
          <NeighborhoodContainer
            neighborhood={child}
            onUpdate={() => {}}
            onRemove={() => onRemoveChild(child.id)}
            onRemoveChild={onRemoveChild}
            depth={depth + 1}
          />
        )}
      </div>
    );
  };

  return (
    <div
      data-neighborhood-drop-target="true"
      className={`
        group/neighborhood relative rounded-lg border transition-all
        bg-gradient-to-b from-slate-50 to-white border-slate-200
        ${isDragOver ? "border-blue-400 ring-2 ring-blue-100" : ""}
        shadow-sm
      `}
      style={{ overflow: 'visible' }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={`
          absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border shadow-sm z-10
          flex items-center justify-center opacity-0 group-hover/neighborhood:opacity-100
          transition-opacity text-slate-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200
        `}
        title="Remove neighborhood"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <span className="text-slate-500 font-medium">For</span>

          <button
            onClick={() => {
              const currentIdx = quantifierOptions.findIndex(
                (q) => q.value === neighborhood.quantifier,
              );
              const nextIdx = (currentIdx + 1) % quantifierOptions.length;
              onUpdate({ quantifier: quantifierOptions[nextIdx].value });
            }}
            className="px-1.5 py-0.5 bg-blue-100 text-blue-700 font-semibold rounded hover:bg-blue-200 transition-colors"
            title="Click to cycle quantifier"
          >
            {currentQuantifier?.label || "all"}
          </button>

          {needsCount && (
            <input
              type="number"
              value={neighborhood.count || 1}
              onChange={(e) =>
                onUpdate({ count: Math.max(1, parseInt(e.target.value) || 1) })
              }
              className="w-8 px-1 py-0.5 text-[11px] bg-white border border-slate-200 rounded text-center font-semibold focus:outline-none focus:ring-1 focus:ring-blue-400"
              min={1}
            />
          )}

          {neighborhood.typedPath ? (
            <span
              className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 font-semibold rounded font-mono text-[10px]"
              title={`Schema-constrained path: N_{${neighborhood.typedPath}}`}
            >
              {neighborhood.typedPath}
            </span>
          ) : (
            <button
              onClick={() => {
                const nextK =
                  neighborhood.kHops >= 3 ? 1 : neighborhood.kHops + 1;
                onUpdate({ kHops: nextK });
              }}
              className="px-1.5 py-0.5 bg-amber-100 text-amber-700 font-semibold rounded hover:bg-amber-200 transition-colors"
              title="Click to change hop distance (1-3)"
            >
              {neighborhood.kHops}-hop
            </button>
          )}

          <span className="text-slate-500 font-medium">neighbors of</span>

          <div className="relative">
            <button
              ref={targetButtonRef}
              onClick={() => {
                if (!showTargetSelector && targetButtonRef.current) {
                  const rect = targetButtonRef.current.getBoundingClientRect();
                  setDropdownPosition({
                    top: rect.bottom + 4,
                    left: Math.max(
                      8,
                      Math.min(rect.left, window.innerWidth - 288),
                    ),
                  });
                  setShowTargetSelector(true);
                } else {
                  setShowTargetSelector(false);
                  setDropdownPosition(null);
                }
              }}
              className={`
                px-2 py-0.5 rounded font-medium max-w-[180px] truncate
                flex items-center gap-1.5 transition-all
                ${
                  showTargetSelector
                    ? "bg-blue-100 text-blue-700 ring-2 ring-blue-300"
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                }
                ${selectableTargets.length === 0 ? "cursor-default" : "cursor-pointer"}
              `}
              title={
                selectableTargets.length > 0
                  ? "Click to select which predicates this applies to"
                  : "No predicates to select"
              }
              disabled={selectableTargets.length === 0}
            >
              <span className="truncate">{targetDescription}</span>
              {selectableTargets.length > 0 && (
                <svg
                  className={`w-3 h-3 flex-shrink-0 transition-transform ${showTargetSelector ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              )}
            </button>

            {showTargetSelector &&
              selectableTargets.length > 0 &&
              dropdownPosition &&
              createPortal(
                <div
                  ref={targetSelectorRef}
                  className="fixed bg-white rounded-lg shadow-xl border border-gray-200 w-[280px] z-[9999]"
                  style={{
                    top: dropdownPosition.top,
                    left: dropdownPosition.left,
                  }}
                >
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">
                        Apply to predicates
                      </span>
                      <button
                        onClick={selectAllTargets}
                        className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Select all
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Click to toggle which predicates this neighborhood
                      constraint applies to
                    </p>
                  </div>

                  <div className="max-h-[250px] overflow-y-auto p-1.5">
                    {selectableTargets.map((node) => {
                      const selected = isNodeSelected(node.id);
                      const colors = getNodeColor(node);

                      return (
                        <button
                          key={node.id}
                          onClick={() => toggleTargetNode(node.id)}
                          className={`
                          w-full flex items-center gap-2 px-2 py-1.5 rounded-md mb-1 last:mb-0
                          transition-all text-left
                          ${
                            selected
                              ? `${colors.bg} ${colors.border} border ring-1 ring-offset-1 ring-blue-400`
                              : "bg-white hover:bg-gray-50 border border-transparent"
                          }
                        `}
                        >
                          <div
                            className={`
                          w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0
                          transition-all
                          ${
                            selected
                              ? "border-blue-500 bg-blue-500"
                              : "border-gray-300 bg-white"
                          }
                        `}
                          >
                            {selected && (
                              <svg
                                className="w-2.5 h-2.5 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>

                          <div
                            className={`
                          w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                          ${colors.iconBg} text-white
                        `}
                          >
                            {getNodeIcon(node)}
                          </div>

                          <span
                            className={`
                          text-xs font-medium truncate
                          ${selected ? colors.text : "text-gray-700"}
                        `}
                          >
                            {getNodeDescription(node)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 rounded-b-lg">
                    <p className="text-[10px] text-slate-400 text-center">
                      {selectedTargetIds.length === 0
                        ? "Applies to all predicates"
                        : `Applies to ${selectedTargetIds.length} of ${selectableTargets.length}`}
                    </p>
                  </div>
                </div>,
                document.body,
              )}
          </div>

          <div className="flex-1" />

          <button
            onClick={() =>
              onUpdate({ includeInResult: !neighborhood.includeInResult })
            }
            className={`
              px-1.5 py-0.5 rounded text-[10px] font-medium transition-all
              ${
                neighborhood.includeInResult
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }
            `}
            title={
              neighborhood.includeInResult
                ? "Neighbors will be included in results"
                : "Neighbors will NOT be in results"
            }
          >
            {neighborhood.includeInResult ? "↳ include" : "↳ exclude"}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div
          className={`
            px-3 py-2 min-h-[40px] transition-all
            ${isDragOver ? "bg-blue-50/50" : ""}
          `}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsDragOver(false);
            }
          }}
          onDrop={handleDrop}
        >
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
              where neighbor
            </span>
            <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1 rounded">
              {neighborhood.boundVariable}
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
              satisfies
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {neighborhood.children.length === 0 ? (
              <div
                className={`
                  w-full py-4 text-center border-2 border-dashed rounded-lg transition-colors
                  ${isDragOver ? "border-blue-300 bg-blue-50/50" : "border-slate-200"}
                `}
              >
                <p className="text-[11px] text-slate-400">
                  Drop predicates here to define neighbor constraints
                </p>
              </div>
            ) : (
              neighborhood.children.map((child, index) =>
                renderChild(child, index),
              )
            )}
          </div>
        </div>
      )}

      {!isExpanded && (
        <div className="px-3 py-1.5 text-[10px] text-slate-500">
          {neighborhood.children.length === 0 ? (
            <span className="italic">No constraints defined</span>
          ) : (
            <span>
              {neighborhood.children.length} constraint
              {neighborhood.children.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default NeighborhoodContainer;
