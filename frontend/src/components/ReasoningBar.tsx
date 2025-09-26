import { useMemo, useState, useCallback } from "react";
import { queryNodesByPredicate } from "../api/layers";
import { formatValue, getOperatorLabel, getOperatorSymbol } from "../utils";

export type PredicateCategory = "attribute" | "topological" | "pattern";
export type SetOperation = "union" | "intersection" | "difference";

export interface Predicate {
  id: string;
  attribute: string;
  type: "numeric" | "categorical" | "boolean";
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "between";
  value: string | number | boolean;
  value2?: number;
  nodeIds: string[];
  category?: PredicateCategory;
  combineOp?: SetOperation;
}

export interface SavedReasoningSet {
  id: string;
  name: string;
  description: string;
  predicates: Predicate[];
  createdAt: string;
}

export interface ReasoningBlock {
  id: string;
  name: string;
  predicates: Predicate[];
  expanded: boolean;
  combineOp?: SetOperation;
}

interface ReasoningBarProps {
  predicates: Predicate[];
  blocks: ReasoningBlock[];
  onUpdatePredicate: (id: string, updates: Partial<Predicate>) => void;
  onRemovePredicate: (id: string) => void;
  onReorderPredicates: (fromIndex: number, toIndex: number) => void;
  onUpdateBlock: (id: string, updates: Partial<ReasoningBlock>) => void;
  onRemoveBlock: (id: string) => void;
  onClearAll: () => void;
  onApply: (nodeIds: string[]) => void;
  onSave: (name: string, description: string) => void;
  onOpenSaved: () => void;
}

export function applySetOp(
  a: Set<string>,
  b: string[],
  op: SetOperation
): Set<string> {
  const bSet = new Set(b);
  switch (op) {
    case "union":
      return new Set([...a, ...b]);
    case "intersection":
      return new Set([...a].filter((id) => bSet.has(id)));
    case "difference":
      return new Set([...a].filter((id) => !bSet.has(id)));
  }
}

export function computePredicateResult(predicates: Predicate[]): string[] {
  if (predicates.length === 0) return [];
  if (predicates.length === 1) return predicates[0].nodeIds;

  let result = new Set(predicates[0].nodeIds);
  for (let i = 1; i < predicates.length; i++) {
    const op = predicates[i].combineOp || "intersection";
    result = applySetOp(result, predicates[i].nodeIds, op);
  }
  return [...result];
}

function computeBlockResult(block: ReasoningBlock): string[] {
  return computePredicateResult(block.predicates);
}

export function computeCombinedResult(
  blocks: ReasoningBlock[],
  predicates: Predicate[]
): string[] {
  if (blocks.length === 0 && predicates.length === 0) return [];

  type ResultItem = { nodeIds: string[]; combineOp?: SetOperation };
  const items: ResultItem[] = [];

  for (const block of blocks) {
    items.push({
      nodeIds: computeBlockResult(block),
      combineOp: block.combineOp,
    });
  }

  for (const pred of predicates) {
    items.push({
      nodeIds: pred.nodeIds,
      combineOp: pred.combineOp,
    });
  }

  if (items.length === 0) return [];
  if (items.length === 1) return items[0].nodeIds;

  let result = new Set(items[0].nodeIds);
  for (let i = 1; i < items.length; i++) {
    const op = items[i].combineOp || "intersection";
    result = applySetOp(result, items[i].nodeIds, op);
  }
  return [...result];
}

export const ReasoningBar = ({
  predicates,
  blocks,
  onUpdatePredicate,
  onRemovePredicate,
  onReorderPredicates,
  onUpdateBlock,
  onRemoveBlock,
  onClearAll,
  onApply,
  onSave,
  onOpenSaved,
}: ReasoningBarProps) => {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [editingPredId, setEditingPredId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editValue2, setEditValue2] = useState<string>("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const resultNodeIds = useMemo(
    () => computeCombinedResult(blocks, predicates),
    [blocks, predicates]
  );

  const totalPredicateCount = useMemo(() => {
    const blockPreds = blocks.reduce((sum, b) => sum + b.predicates.length, 0);
    return blockPreds + predicates.length;
  }, [blocks, predicates]);

  const handleApply = () => {
    if (resultNodeIds.length > 0) {
      onApply(resultNodeIds);
    }
  };

  const handleSaveClick = () => {
    setSaveName("");
    setSaveDescription("");
    setSaveDialogOpen(true);
  };

  const handleSaveConfirm = () => {
    if (saveName.trim()) {
      onSave(saveName.trim(), saveDescription.trim());
      setSaveDialogOpen(false);
      setSaveName("");
      setSaveDescription("");
    }
  };

  const handleSaveCancel = () => {
    setSaveDialogOpen(false);
    setSaveName("");
    setSaveDescription("");
  };

  const startEditing = (pred: Predicate) => {
    setEditingPredId(pred.id);
    setEditValue(String(pred.value));
    setEditValue2(pred.value2 !== undefined ? String(pred.value2) : "");
  };

  const cancelEditing = () => {
    setEditingPredId(null);
    setEditValue("");
    setEditValue2("");
  };

  const confirmEdit = useCallback(
    async (pred: Predicate) => {
      let newValue: string | number | boolean = editValue;
      let newValue2: number | undefined = undefined;

      if (pred.type === "numeric") {
        const parsed = parseFloat(editValue);
        if (!isNaN(parsed)) {
          newValue = parsed;
        }
        if (pred.operator === "between" && editValue2) {
          const parsed2 = parseFloat(editValue2);
          if (!isNaN(parsed2)) {
            newValue2 = parsed2;
          }
        }
      } else if (pred.type === "boolean") {
        newValue =
          editValue.toLowerCase() === "true" ||
          editValue.toLowerCase() === "yes" ||
          editValue === "1";
      }

      const apiCategory = pred.category === "topological" ? "topological" : "attribute";
      const requestBody = {
        attribute: pred.attribute,
        attribute_type: pred.type,
        operator: pred.operator,
        value: newValue,
        value2: newValue2,
        category: apiCategory as "attribute" | "topological",
      };

      try {
        const result = await queryNodesByPredicate(requestBody);

        onUpdatePredicate(pred.id, {
          value: newValue,
          ...(newValue2 !== undefined ? { value2: newValue2 } : {}),
          nodeIds: result.node_ids,
        });
      } catch (error) {
        console.error("Failed to recalculate nodeIds:", error);
        onUpdatePredicate(pred.id, {
          value: newValue,
          ...(newValue2 !== undefined ? { value2: newValue2 } : {}),
        });
      }

      cancelEditing();
    },
    [editValue, editValue2, onUpdatePredicate, cancelEditing]
  );

  const cycleComparisonOp = useCallback(
    async (pred: Predicate) => {
      let nextOp: Predicate["operator"];

      if (pred.type === "numeric") {
        const ops: Predicate["operator"][] = [
          "=",
          ">",
          "<",
          ">=",
          "<=",
          "!=",
          "between",
        ];
        const currentIdx = ops.indexOf(pred.operator);
        nextOp = ops[(currentIdx + 1) % ops.length];
      } else if (pred.type === "categorical") {
        const ops: Predicate["operator"][] = ["=", "!=", "in"];
        const currentIdx = ops.indexOf(pred.operator);
        nextOp = ops[(currentIdx + 1) % ops.length];
      } else if (pred.type === "boolean") {
        nextOp = pred.operator === "=" ? "!=" : "=";
      } else {
        return;
      }

      const apiCategory = pred.category === "topological" ? "topological" : "attribute";
      const requestBody = {
        attribute: pred.attribute,
        attribute_type: pred.type,
        operator: nextOp,
        value: pred.value,
        value2: pred.value2,
        category: apiCategory as "attribute" | "topological",
      };

      try {
        const result = await queryNodesByPredicate(requestBody);

        onUpdatePredicate(pred.id, {
          operator: nextOp,
          nodeIds: result.node_ids,
        });
      } catch (error) {
        console.error("Failed to recalculate nodeIds:", error);
        onUpdatePredicate(pred.id, { operator: nextOp });
      }
    },
    [onUpdatePredicate]
  );

  const cycleOperator = (
    predId: string,
    currentOp: SetOperation = "intersection"
  ) => {
    const ops: SetOperation[] = ["intersection", "union", "difference"];
    const currentIdx = ops.indexOf(currentOp);
    const nextOp = ops[(currentIdx + 1) % ops.length];
    onUpdatePredicate(predId, { combineOp: nextOp });
  };

  if (predicates.length === 0 && blocks.length === 0) {
    return (
      <div className="w-full px-2 pt-2">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
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
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
              </div>
            </div>
            <span className="text-xs text-gray-500">
              Select nodes and add predicates from the right panel to build your
              query
            </span>
            <div className="flex-1" />
            <button
              onClick={onOpenSaved}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              Saved
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {saveDialogOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                Save Reasoning Set
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Save your current predicates for later use
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g., High-degree hub nodes"
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && saveName.trim()) {
                      handleSaveConfirm();
                    } else if (e.key === "Escape") {
                      handleSaveCancel();
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Description{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Describe what this reasoning set captures..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent resize-none transition-all"
                />
              </div>
              <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-200">
                <span className="font-bold text-gray-800">
                  {totalPredicateCount}
                </span>{" "}
                predicate{totalPredicateCount !== 1 ? "s" : ""} will be saved
                {blocks.length > 0 && (
                  <span className="text-gray-500">
                    {" "}
                    (from {blocks.length} block{blocks.length !== 1 ? "s" : ""}{" "}
                    + {predicates.length} new)
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100 bg-gray-50">
              <button
                onClick={handleSaveCancel}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfirm}
                disabled={!saveName.trim()}
                className="px-5 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full px-2 pt-2">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3 max-w-full">
            <div className="flex items-center gap-2 shrink-0">
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
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
              </div>
            </div>

            <div className="w-px h-6 bg-gray-200 shrink-0" />

            <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-1">
                {blocks.map((block, blockIdx) => (
                  <div key={block.id} className="flex items-center shrink-0">
                    {blockIdx > 0 && (
                      <button
                        onClick={() => {
                          const ops: SetOperation[] = [
                            "intersection",
                            "union",
                            "difference",
                          ];
                          const currentIdx = ops.indexOf(
                            block.combineOp || "intersection"
                          );
                          const nextOp = ops[(currentIdx + 1) % ops.length];
                          onUpdateBlock(block.id, { combineOp: nextOp });
                        }}
                        className="group flex items-center gap-0.5 px-1.5 py-0.5 mx-1 rounded hover:bg-gray-100 transition-colors"
                        title={`Click to change operator (currently ${getOperatorLabel(
                          block.combineOp
                        )})`}
                      >
                        <span className="text-[11px] text-gray-600 font-bold">
                          {getOperatorSymbol(block.combineOp)}
                        </span>
                        <span className="text-[9px] text-gray-400 group-hover:text-gray-600 transition-colors">
                          {getOperatorLabel(block.combineOp)}
                        </span>
                      </button>
                    )}

                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 border border-gray-300 hover:border-gray-400 transition-colors">
                      <button
                        onClick={() =>
                          onUpdateBlock(block.id, { expanded: !block.expanded })
                        }
                        className="text-gray-500 hover:text-gray-700 transition-colors"
                        title={
                          block.expanded ? "Collapse block" : "Expand block"
                        }
                      >
                        <svg
                          className={`w-3 h-3 transition-transform ${
                            block.expanded ? "rotate-90" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>

                      <span className="text-[11px] font-medium text-gray-700">
                        {block.name}
                      </span>
                      <span className="text-[9px] text-gray-400 tabular-nums">
                        ({block.predicates.length} pred,{" "}
                        {computePredicateResult(block.predicates).length} nodes)
                      </span>

                      <button
                        onClick={() => onRemoveBlock(block.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                        title="Remove block"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>

                    {block.expanded && (
                      <div className="flex items-center ml-1 pl-1 border-l-2 border-gray-300">
                        {block.predicates.map((pred, predIdx) => (
                          <div
                            key={pred.id}
                            className="flex items-center shrink-0"
                          >
                            {predIdx > 0 && (
                              <span className="text-[9px] text-gray-400 mx-1">
                                {getOperatorSymbol(pred.combineOp)}
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                                pred.category === "topological"
                                  ? "bg-gray-100 text-gray-600"
                                  : "bg-gray-50 text-gray-600"
                              }`}
                            >
                              <span className="font-mono">
                                {pred.attribute}{" "}
                                {pred.operator === "between"
                                  ? "∈"
                                  : pred.operator}{" "}
                                {pred.operator === "between" &&
                                pred.value2 !== undefined
                                  ? `[${formatValue(pred.value)}, ${formatValue(
                                      pred.value2
                                    )}]`
                                  : formatValue(pred.value)}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {predicates.map((pred, i) => (
                  <div
                    key={pred.id}
                    className={`flex items-center shrink-0 ${
                      draggedIndex === i ? "opacity-50" : ""
                    } ${dragOverIndex === i ? "border-l-2 border-blue-400 pl-1" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      setDraggedIndex(i);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
                        onReorderPredicates(draggedIndex, dragOverIndex);
                      }
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedIndex !== null && draggedIndex !== i) {
                        setDragOverIndex(i);
                      }
                    }}
                    onDragLeave={() => {
                      setDragOverIndex(null);
                    }}
                  >
                    {(i > 0 || blocks.length > 0) && (
                      <button
                        onClick={() => cycleOperator(pred.id, pred.combineOp)}
                        className="group flex items-center gap-0.5 px-1.5 py-0.5 mx-1 rounded hover:bg-gray-100 transition-colors"
                        title={`Click to change operator (currently ${getOperatorLabel(
                          pred.combineOp
                        )})`}
                      >
                        <span className="text-[11px] text-gray-600 font-bold">
                          {getOperatorSymbol(pred.combineOp)}
                        </span>
                        <span className="text-[9px] text-gray-400 group-hover:text-gray-600 transition-colors">
                          {getOperatorLabel(pred.combineOp)}
                        </span>
                      </button>
                    )}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] group transition-colors cursor-grab active:cursor-grabbing ${
                        pred.category === "topological"
                          ? "bg-gray-100 border border-gray-200 hover:border-gray-300"
                          : "bg-gray-50 border border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {pred.category === "topological" && (
                        <svg
                          className="w-3 h-3 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <circle cx="5" cy="12" r="2" />
                          <circle cx="19" cy="6" r="2" />
                          <circle cx="19" cy="18" r="2" />
                          <path
                            strokeLinecap="round"
                            d="M7 11.5L17 6.5M7 12.5L17 17.5"
                          />
                        </svg>
                      )}
                      {pred.category === "pattern" && (
                        <svg
                          className="w-3 h-3 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 3l7 4v6l-7 4-7-4V7l7-4z"
                          />
                          <circle cx="12" cy="10" r="2" />
                        </svg>
                      )}

                      {editingPredId === pred.id ? (
                        <span className="font-mono flex items-center gap-1">
                          <span className="text-gray-700">
                            {pred.attribute}
                          </span>
                          <button
                            onClick={() => cycleComparisonOp(pred)}
                            className="text-gray-500 hover:text-gray-700 px-0.5 rounded hover:bg-white/50"
                            title="Click to change operator"
                          >
                            {pred.operator === "between" ? "∈" : pred.operator}
                          </button>
                          {pred.operator === "between" ? (
                            <span className="flex items-center gap-0.5">
                              <span className="text-gray-400">[</span>
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") confirmEdit(pred);
                                  if (e.key === "Escape") cancelEditing();
                                }}
                                className="w-12 px-1 py-0.5 text-[11px] text-gray-700 bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                                autoFocus
                              />
                              <span className="text-gray-400">,</span>
                              <input
                                type="text"
                                value={editValue2}
                                onChange={(e) => setEditValue2(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") confirmEdit(pred);
                                  if (e.key === "Escape") cancelEditing();
                                }}
                                className="w-12 px-1 py-0.5 text-[11px] text-gray-700 bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                              />
                              <span className="text-gray-400">]</span>
                            </span>
                          ) : (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") confirmEdit(pred);
                                if (e.key === "Escape") cancelEditing();
                              }}
                              className="w-16 px-1 py-0.5 text-[11px] text-gray-700 bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                              autoFocus
                            />
                          )}
                          <button
                            onClick={() => confirmEdit(pred)}
                            className="text-gray-500 hover:text-gray-700 ml-0.5"
                            title="Confirm (Enter)"
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
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="text-gray-400 hover:text-red-500 ml-0.5"
                            title="Cancel (Esc)"
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
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </span>
                      ) : (
                        <span className="font-mono flex items-center">
                          <span className="text-gray-700">
                            {pred.attribute}
                          </span>
                          <button
                            onClick={() => cycleComparisonOp(pred)}
                            className="text-gray-400 mx-1 hover:text-gray-600 hover:bg-white/50 px-0.5 rounded"
                            title="Click to change operator"
                          >
                            {pred.operator === "between" ? "∈" : pred.operator}
                          </button>
                          <button
                            onClick={() => startEditing(pred)}
                            className="text-gray-600 hover:text-gray-800 hover:bg-gray-100 px-1 rounded cursor-pointer"
                            title="Click to edit value"
                          >
                            {pred.operator === "between" &&
                            pred.value2 !== undefined
                              ? `[${formatValue(pred.value)}, ${formatValue(
                                  pred.value2
                                )}]`
                              : formatValue(pred.value)}
                          </button>
                        </span>
                      )}

                      <span className="text-[9px] text-gray-400 tabular-nums">
                        ({pred.nodeIds.length})
                      </span>
                      <button
                        onClick={() => onRemovePredicate(pred.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-[11px] font-medium text-gray-500">
                  Result:
                </span>
                <span className="text-sm font-bold text-gray-800 tabular-nums">
                  {resultNodeIds.length.toLocaleString()}
                </span>
              </div>

              <button
                onClick={onOpenSaved}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                title="View saved reasoning sets"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
                Saved
              </button>
              <button
                onClick={handleSaveClick}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                title="Save current reasoning set"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                  />
                </svg>
                Save
              </button>
              <button
                onClick={onClearAll}
                className="px-3 py-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleApply}
                disabled={resultNodeIds.length === 0}
                className="px-4 py-1.5 text-[11px] bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Select
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
