import { useState, useCallback, useRef, useEffect } from "react";
import { createNeighborhood, getVariableForLevel } from "../../../utils/fol";
import type {
  NeighborhoodConstraint,
  FilterItem,
  ConstraintItem,
} from "../../../types/fol";
import { AutocompleteInput } from "../../ui/AutocompleteInput";
import {
  useGraphSchema,
  getAttributeSuggestions,
  getValueSuggestions,
} from "../../../hooks/useGraphSchema";
import { useNeighborSuggestions } from "../../../hooks/useNeighborSuggestions";
import { useConstraintValidation } from "../../../hooks/useConstraintValidation";
import { NestedConstraintPill } from "../pills/NestedConstraintPill";
import { NeighborhoodContextMenu } from "./NeighborhoodContextMenu";
import { ConnectiveToggle } from "../visual/ConnectiveToggle";
import type { Connective } from "../visual/types";

const stringToConnective = (str: "and" | "or"): Connective =>
  str === "and" ? "∧" : "∨";
const connectiveToString = (conn: Connective): "and" | "or" =>
  conn === "∧" ? "and" : "or";

interface NeighborhoodBlockProps {
  constraint: NeighborhoodConstraint;
  predicates: FilterItem[];
  onUpdate: (constraint: NeighborhoodConstraint) => void;
  onRemove: () => void;
  matchingCount?: number;
  projectionCount?: number;
}

const quantifierColors = {
  ALL: "bg-blue-100 text-blue-800 border-blue-200",
  SOME: "bg-green-100 text-green-800 border-green-200",
  EXACTLY: "bg-purple-100 text-purple-800 border-purple-200",
  AT_LEAST: "bg-amber-100 text-amber-800 border-amber-200",
  AT_MOST: "bg-red-100 text-red-800 border-red-200",
};

function ConstraintValidationIndicator({
  constraint,
  targetPredicateIds,
}: {
  constraint: {
    attribute: string;
    operator: string;
    value: string | number | boolean;
  };
  targetPredicateIds: string[];
}) {
  const {
    validation,
    loading,
    willHaveResults,
    matchingNeighbors,
    totalNeighbors,
  } = useConstraintValidation({
    targetPredicateIds,
    attribute: constraint.attribute,
    operator: constraint.operator,
    value: String(constraint.value),
    enabled: !!(constraint.attribute && constraint.value),
  });

  if (!constraint.attribute || !constraint.value || loading) {
    return null;
  }

  if (!validation) {
    return null;
  }

  const hasResults = willHaveResults && matchingNeighbors > 0;
  const percentage =
    totalNeighbors > 0
      ? Math.round((matchingNeighbors / totalNeighbors) * 100)
      : 0;

  return (
    <div className="absolute -right-1 -top-1">
      <div
        className={`w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${
          hasResults ? "bg-green-500" : "bg-red-500"
        }`}
        title={
          hasResults
            ? `✓ ${matchingNeighbors} of ${totalNeighbors} neighbors match (${percentage}%)`
            : `✗ No neighbors match this constraint`
        }
      >
        {hasResults ? (
          <svg
            className="w-3 h-3 text-white"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg
            className="w-3 h-3 text-white"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

export function NeighborhoodBlock({
  constraint,
  predicates,
  onUpdate,
  onRemove,
  matchingCount = 0,
  projectionCount = 0,
}: NeighborhoodBlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
  } | null>(null);
  const { schema, loading: schemaLoading } = useGraphSchema();

  const [editing, setEditing] = useState<NeighborhoodConstraint>(() => {
    const migrated = { ...constraint };

    if ((migrated as any).constraint && !migrated.constraints) {
      const oldConstraint = (migrated as any).constraint;
      migrated.constraints = [
        {
          id: `constraint_item_${Date.now()}`,
          type: oldConstraint.type,
          attribute: oldConstraint.attribute,
          operator: oldConstraint.operator,
          value: oldConstraint.value,
        },
      ];
      delete (migrated as any).constraint;
    }

    if (!migrated.constraints) {
      migrated.constraints = [
        {
          id: `constraint_item_${Date.now()}`,
          type: "attribute",
          attribute: "",
          operator: "=",
          value: "",
        },
      ];
    }

    if (migrated.level === undefined) {
      migrated.level = 1;
    }

    return migrated;
  });
  const blockRef = useRef<HTMLDivElement>(null);

  const getTargetInfo = () => {
    if (constraint.targetType === "all_predicates") {
      return {
        type: "all_predicates",
        items: predicates,
        count: predicates.length,
      };
    } else if (
      constraint.targetType === "constraints" ||
      constraint.parentConstraintId
    ) {
      return {
        type: "constraints",
        items: [],
        count: 1,
        parentId: constraint.parentConstraintId,
      };
    }
    const targetPredicates = predicates.filter((p) =>
      constraint.targetPredicateIds.includes(p.id),
    );
    return {
      type: "predicates",
      items: targetPredicates,
      count: targetPredicates.length,
    };
  };

  const targetInfo = getTargetInfo();

  const constraintExpressions = (() => {
    if (constraint.constraints && constraint.constraints.length > 0) {
      return constraint.constraints
        .map(
          (c, i) =>
            `${c.attribute} ${c.operator} ${c.value}${i < constraint.constraints.length - 1 ? ` ${c.combineOp || "and"} ` : ""}`,
        )
        .join("");
    } else if ((constraint as any).constraint) {
      const c = (constraint as any).constraint;
      return `${c.attribute} ${c.operator} ${c.value}`;
    }
    return "no constraints";
  })();

  const folExpression = createNeighborhood(
    constraint.quantifier,
    constraint.count,
    constraint.relation,
    constraintExpressions,
    constraint.projectionVariable || "y",
  );

  const handleSave = useCallback(() => {
    onUpdate(editing);
    setIsEditing(false);
  }, [editing, onUpdate]);

  const handleCancel = useCallback(() => {
    const migrated = { ...constraint };
    if ((migrated as any).constraint && !migrated.constraints) {
      const oldConstraint = (migrated as any).constraint;
      migrated.constraints = [
        {
          id: `constraint_item_${Date.now()}`,
          type: oldConstraint.type,
          attribute: oldConstraint.attribute,
          operator: oldConstraint.operator,
          value: oldConstraint.value,
        },
      ];
      delete (migrated as any).constraint;
    }
    if (!migrated.constraints) {
      migrated.constraints = [
        {
          id: `constraint_item_${Date.now()}`,
          type: "attribute",
          attribute: "",
          operator: "=",
          value: "",
        },
      ];
    }
    if (migrated.level === undefined) {
      migrated.level = 1;
    }
    setEditing(migrated);
    setIsEditing(false);
  }, [constraint]);

  const convertFilterItemToConstraint = useCallback(
    (filterItem: FilterItem): ConstraintItem => {
      let attribute = "";
      let operator = "=";
      let value: string | number | boolean = "";
      let nodeType = "";

      if (filterItem.type === "attribute") {
        const predicate = filterItem.predicate;
        attribute = predicate.attribute || "";
        operator = predicate.operator || "=";
        value = predicate.value ?? "";
        nodeType = predicate.node_type || "";
      } else if (filterItem.type === "topology") {
        const predicate = filterItem.predicate;
        attribute = predicate.attribute || "";
        operator = predicate.operator || "=";
        value = predicate.value ?? "";
        nodeType = predicate.node_type || "";
      } else if (filterItem.type === "fol") {
        attribute = filterItem.predicate.expression || "";
        operator = "=";
        value = "true";
      }

      const constraintType: "attribute" | "topology" =
        filterItem.type === "topology" ? "topology" : "attribute";

      return {
        id: `constraint_${Date.now()}`,
        type: constraintType,
        attribute,
        operator,
        value,
        node_type: nodeType,
        sourceFilterId: filterItem.id,
        displayText: filterItem.description,
      } as ConstraintItem;
    },
    [],
  );

  const handlePillDrop = useCallback(
    (draggedItem: any, targetIndex?: number) => {
      if (draggedItem.type === "filter-item") {
        const newConstraint = convertFilterItemToConstraint(
          draggedItem.filterItem,
        );

        if (isEditing) {
          setEditing((prev) => {
            const newConstraints = [...prev.constraints];
            if (typeof targetIndex === "number") {
              newConstraints.splice(targetIndex, 0, newConstraint);
            } else {
              newConstraints.push(newConstraint);
            }
            return { ...prev, constraints: newConstraints };
          });
        } else {
          const newConstraints = [...(constraint.constraints || [])];
          if (typeof targetIndex === "number") {
            newConstraints.splice(targetIndex, 0, newConstraint);
          } else {
            newConstraints.push(newConstraint);
          }
          onUpdate({ ...constraint, constraints: newConstraints });
        }
      }
    },
    [convertFilterItemToConstraint, isEditing, constraint, onUpdate],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isEditing) {
        handleCancel();
      }
    };

    if (isEditing) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditing, handleCancel]);

  const firstConstraint = editing.constraints[0];

  const neighborSuggestions = useNeighborSuggestions({
    targetPredicateIds: constraint.targetPredicateIds,
    attribute: firstConstraint?.attribute || "",
    enabled:
      firstConstraint?.type === "attribute" && !!firstConstraint.attribute,
  });

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;

      e.preventDefault();
      setContextMenu({
        position: { x: e.clientX, y: e.clientY },
      });
    },
    [isEditing],
  );

  const handleContextMenuSave = useCallback(
    (updatedConstraint: NeighborhoodConstraint) => {
      onUpdate(updatedConstraint);
      setContextMenu(null);
    },
    [onUpdate],
  );

  const handleContextMenuCancel = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleContextMenuDelete = useCallback(() => {
    onRemove();
    setContextMenu(null);
  }, [onRemove]);

  if (isEditing) {
    return (
      <div
        ref={blockRef}
        className="border-2 border-violet-300 rounded-lg p-4 bg-violet-50/50"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-violet-800">
              Edit Neighborhood Constraint
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-3 py-1 text-xs font-medium bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Quantifier
              </label>
              <select
                value={editing.quantifier}
                onChange={(e) =>
                  setEditing((prev) => ({
                    ...prev,
                    quantifier: e.target.value as any,
                  }))
                }
                className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
              >
                <option value="ALL">ALL (∀)</option>
                <option value="SOME">SOME (∃)</option>
                <option value="EXACTLY">EXACTLY(n)</option>
                <option value="AT_LEAST">AT_LEAST(n)</option>
                <option value="AT_MOST">AT_MOST(n)</option>
              </select>
            </div>

            {["EXACTLY", "AT_LEAST", "AT_MOST"].includes(
              editing.quantifier,
            ) && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Count
                </label>
                <input
                  type="number"
                  min="1"
                  value={editing.count || 1}
                  onChange={(e) =>
                    setEditing((prev) => ({
                      ...prev,
                      count: parseInt(e.target.value) || 1,
                    }))
                  }
                  className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Relation
              </label>
              <select
                value={editing.relation}
                onChange={(e) =>
                  setEditing((prev) => ({
                    ...prev,
                    relation: e.target.value as any,
                  }))
                }
                className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
              >
                <option value="neighbors">neighbors(x)</option>
                <option value="k_hop">k-hop(x)</option>
                <option value="connected_components">connected(x)</option>
              </select>
            </div>

            {editing.relation === "k_hop" && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  k-hops
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={editing.kParameter || 2}
                  onChange={(e) =>
                    setEditing((prev) => ({
                      ...prev,
                      kParameter: parseInt(e.target.value) || 2,
                    }))
                  }
                  className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-700">
                Constraints
              </label>
              <button
                onClick={() => {
                  const newConstraint = {
                    id: `constraint_item_${Date.now()}`,
                    type: "attribute" as const,
                    attribute: "",
                    operator: "=",
                    value: "",
                    combineOp: "and" as const,
                  };
                  setEditing((prev) => ({
                    ...prev,
                    constraints: [...prev.constraints, newConstraint],
                  }));
                }}
                className="px-2 py-1 text-xs bg-violet-100 text-violet-700 border border-violet-200 rounded hover:bg-violet-200 transition-colors"
              >
                + Add Constraint
              </button>
            </div>

            <div
              className="space-y-2 p-2 bg-violet-50/30 border border-dashed border-violet-300 rounded-lg"
              data-constraint-drop-zone="true"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.types.includes("application/json")) {
                  e.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const data = e.dataTransfer.getData("application/json");
                if (data) {
                  try {
                    const draggedItem = JSON.parse(data);
                    handlePillDrop(draggedItem);
                  } catch (error) {
                    void error;
                  }
                }
              }}
            >
              <div className="text-xs text-gray-500 mb-2">
                Drop attribute/topology pills here or configure manually:
              </div>
              {editing.constraints.map((c, index) => (
                <div key={c.id} className="space-y-2">
                  <div className="grid grid-cols-5 gap-2">
                    <select
                      value={c.type}
                      onChange={(e) => {
                        const newType = e.target.value as
                          | "attribute"
                          | "topology";
                        const newConstraints: ConstraintItem[] = [
                          ...editing.constraints,
                        ];
                        newConstraints[index] = {
                          ...c,
                          type: newType,
                        } as ConstraintItem;
                        setEditing((prev) => ({
                          ...prev,
                          constraints: newConstraints,
                        }));
                      }}
                      className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                    >
                      <option value="attribute">Attribute</option>
                      <option value="topology">Topology</option>
                    </select>

                    <select
                      value={c.attribute}
                      onChange={(e) => {
                        const newConstraints = [...editing.constraints];
                        newConstraints[index] = {
                          ...c,
                          attribute: e.target.value,
                        };
                        setEditing((prev) => ({
                          ...prev,
                          constraints: newConstraints,
                        }));
                      }}
                      className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                      disabled={schemaLoading}
                    >
                      <option value="">
                        {schemaLoading
                          ? "Loading attributes..."
                          : "Select attribute..."}
                      </option>
                      {!schemaLoading &&
                        getAttributeSuggestions(
                          schema,
                          c.type === "topology" ? "topology" : "attribute",
                        ).map((attr) => (
                          <option key={attr} value={attr}>
                            {attr}
                          </option>
                        ))}
                      {!schemaLoading &&
                        schema &&
                        getAttributeSuggestions(
                          schema,
                          c.type === "topology" ? "topology" : "attribute",
                        ).length === 0 && (
                          <option value="" disabled>
                            No attributes available
                          </option>
                        )}
                    </select>

                    <select
                      value={c.operator}
                      onChange={(e) => {
                        const newConstraints = [...editing.constraints];
                        newConstraints[index] = {
                          ...c,
                          operator: e.target.value,
                        };
                        setEditing((prev) => ({
                          ...prev,
                          constraints: newConstraints,
                        }));
                      }}
                      className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                    >
                      <option value="=">=</option>
                      <option value="!=">≠</option>
                      <option value=">">&gt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<">&lt;</option>
                      <option value="<=">&lt;=</option>
                    </select>

                    <div className="relative">
                      <AutocompleteInput
                        value={String(c.value)}
                        onChange={(newValue) => {
                          const newConstraints = [...editing.constraints];
                          newConstraints[index] = { ...c, value: newValue };
                          setEditing((prev) => ({
                            ...prev,
                            constraints: newConstraints,
                          }));
                        }}
                        suggestions={
                          c.type === "attribute" &&
                          c.attribute === firstConstraint?.attribute &&
                          neighborSuggestions.values.length > 0
                            ? neighborSuggestions.values
                            : getValueSuggestions(
                                schema,
                                c.attribute,
                                c.type === "topology"
                                  ? "topology"
                                  : "attribute",
                              )
                        }
                        placeholder="value"
                        className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                      />
                      <ConstraintValidationIndicator
                        constraint={c}
                        targetPredicateIds={constraint.targetPredicateIds}
                      />
                    </div>

                    <button
                      onClick={() => {
                        const newConstraints = editing.constraints.filter(
                          (_, i) => i !== index,
                        );
                        setEditing((prev) => ({
                          ...prev,
                          constraints: newConstraints,
                        }));
                      }}
                      disabled={editing.constraints.length <= 1}
                      className="px-2 py-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ✕
                    </button>
                  </div>

                  {index < editing.constraints.length - 1 && (
                    <div className="flex items-center gap-2">
                      <ConnectiveToggle
                        value={stringToConnective(c.combineOp || "and")}
                        onChange={(newConnective) => {
                          const newConstraints = [...editing.constraints];
                          newConstraints[index] = {
                            ...c,
                            combineOp: connectiveToString(newConnective),
                          };
                          setEditing((prev) => ({
                            ...prev,
                            constraints: newConstraints,
                          }));
                        }}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-violet-200">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Result Mode
              </label>
              <div className="space-y-2">
                <label className="flex items-center text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={editing.resultMode === "primary_only"}
                    onChange={() =>
                      setEditing((prev) => ({
                        ...prev,
                        resultMode: "primary_only",
                        projectionVariable: undefined,
                      }))
                    }
                    className="mr-2 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="flex-1">Primary entities only</span>
                  <span className="text-gray-500 ml-2">Default</span>
                </label>

                <label className="flex items-center text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={editing.resultMode === "primary_and_projected"}
                    onChange={() =>
                      setEditing((prev) => ({
                        ...prev,
                        resultMode: "primary_and_projected",
                        projectionVariable:
                          prev.projectionVariable || "neighbor",
                      }))
                    }
                    className="mr-2 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="flex-1">Primary + projected neighbors</span>
                  <span className="text-amber-600 ml-2 font-medium">
                    Show relations
                  </span>
                </label>
              </div>
            </div>

            {editing.resultMode === "primary_and_projected" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Variable name for projection
                </label>
                <input
                  type="text"
                  value={editing.projectionVariable || ""}
                  onChange={(e) =>
                    setEditing((prev) => ({
                      ...prev,
                      projectionVariable: e.target.value || "neighbor",
                    }))
                  }
                  className="w-full text-xs px-2 py-1 border border-gray-300 rounded font-mono focus:ring-violet-500"
                  placeholder="neighbor"
                />
              </div>
            )}
          </div>

          <div className="space-y-3 pt-3 border-t border-violet-200">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-gray-700">
                Nested Constraints{" "}
                <span className="text-gray-500">
                  ({getVariableForLevel(editing.level + 1)} level)
                </span>
              </label>
              <button
                onClick={() => {
                  const newNestedConstraint: NeighborhoodConstraint = {
                    id: `constraint_${Date.now()}`,
                    targetPredicateIds: [],
                    quantifier: "SOME",
                    relation: "neighbors",
                    constraints: [
                      {
                        id: `constraint_item_${Date.now()}`,
                        type: "attribute",
                        attribute: "",
                        operator: "=",
                        value: "",
                      },
                    ],
                    resultMode: "primary_only",
                    level: editing.level + 1,
                    parentConstraintId: editing.id,
                  };
                  setEditing((prev) => ({
                    ...prev,
                    nestedConstraints: [
                      ...(prev.nestedConstraints || []),
                      newNestedConstraint,
                    ],
                  }));
                }}
                className="px-2 py-1 text-xs bg-violet-100 text-violet-700 border border-violet-200 rounded hover:bg-violet-200 transition-colors"
              >
                + Add Nested Constraint
              </button>
            </div>

            <div className="text-xs text-gray-500 mb-2">
              Add constraints on the neighbors of the current constraint's
              matching nodes. For example: find nodes with neighbors that have
              property A, and those neighbors also have neighbors with property
              B.
            </div>

            {editing.nestedConstraints &&
              editing.nestedConstraints.length > 0 && (
                <div className="space-y-3 pl-4 border-l-2 border-violet-200 bg-violet-50/50 rounded-r-lg p-3">
                  {editing.nestedConstraints.map((nestedConstraint, index) => (
                    <div key={nestedConstraint.id} className="relative">
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-xs font-medium text-violet-800">
                          Level {nestedConstraint.level} (
                          {getVariableForLevel(nestedConstraint.level)})
                        </div>
                        <button
                          onClick={() => {
                            const newNestedConstraints =
                              editing.nestedConstraints?.filter(
                                (_, i) => i !== index,
                              ) || [];
                            setEditing((prev) => ({
                              ...prev,
                              nestedConstraints: newNestedConstraints,
                            }));
                          }}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded transition-colors"
                          title="Remove nested constraint"
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

                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <select
                          value={nestedConstraint.quantifier}
                          onChange={(e) => {
                            const newNestedConstraints = [
                              ...(editing.nestedConstraints || []),
                            ];
                            newNestedConstraints[index] = {
                              ...nestedConstraint,
                              quantifier: e.target.value as any,
                            };
                            setEditing((prev) => ({
                              ...prev,
                              nestedConstraints: newNestedConstraints,
                            }));
                          }}
                          className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                        >
                          <option value="ALL">ALL (∀)</option>
                          <option value="SOME">SOME (∃)</option>
                          <option value="EXACTLY">EXACTLY(n)</option>
                          <option value="AT_LEAST">AT_LEAST(n)</option>
                          <option value="AT_MOST">AT_MOST(n)</option>
                        </select>

                        <select
                          value={nestedConstraint.relation}
                          onChange={(e) => {
                            const newNestedConstraints = [
                              ...(editing.nestedConstraints || []),
                            ];
                            newNestedConstraints[index] = {
                              ...nestedConstraint,
                              relation: e.target.value as any,
                            };
                            setEditing((prev) => ({
                              ...prev,
                              nestedConstraints: newNestedConstraints,
                            }));
                          }}
                          className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                        >
                          <option value="neighbors">neighbors</option>
                          <option value="k_hop">k-hop</option>
                          <option value="connected_components">
                            connected
                          </option>
                        </select>
                      </div>

                      {["EXACTLY", "AT_LEAST", "AT_MOST"].includes(
                        nestedConstraint.quantifier,
                      ) && (
                        <div className="mb-2">
                          <input
                            type="number"
                            min="1"
                            value={nestedConstraint.count || 1}
                            onChange={(e) => {
                              const newNestedConstraints = [
                                ...(editing.nestedConstraints || []),
                              ];
                              newNestedConstraints[index] = {
                                ...nestedConstraint,
                                count: parseInt(e.target.value) || 1,
                              };
                              setEditing((prev) => ({
                                ...prev,
                                nestedConstraints: newNestedConstraints,
                              }));
                            }}
                            className="w-20 text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                            placeholder="count"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        {nestedConstraint.constraints.map(
                          (c, constraintIndex) => (
                            <div key={c.id} className="grid grid-cols-4 gap-2">
                              <select
                                value={c.attribute}
                                onChange={(e) => {
                                  const newNestedConstraints = [
                                    ...(editing.nestedConstraints || []),
                                  ];
                                  const newConstraints = [
                                    ...newNestedConstraints[index].constraints,
                                  ];
                                  newConstraints[constraintIndex] = {
                                    ...c,
                                    attribute: e.target.value,
                                  };
                                  newNestedConstraints[index] = {
                                    ...nestedConstraint,
                                    constraints: newConstraints,
                                  };
                                  setEditing((prev) => ({
                                    ...prev,
                                    nestedConstraints: newNestedConstraints,
                                  }));
                                }}
                                className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                              >
                                <option value="">Select attribute...</option>
                                {getAttributeSuggestions(
                                  schema,
                                  "attribute",
                                ).map((attr) => (
                                  <option key={attr} value={attr}>
                                    {attr}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={c.operator}
                                onChange={(e) => {
                                  const newNestedConstraints = [
                                    ...(editing.nestedConstraints || []),
                                  ];
                                  const newConstraints = [
                                    ...newNestedConstraints[index].constraints,
                                  ];
                                  newConstraints[constraintIndex] = {
                                    ...c,
                                    operator: e.target.value,
                                  };
                                  newNestedConstraints[index] = {
                                    ...nestedConstraint,
                                    constraints: newConstraints,
                                  };
                                  setEditing((prev) => ({
                                    ...prev,
                                    nestedConstraints: newNestedConstraints,
                                  }));
                                }}
                                className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                              >
                                <option value="=">=</option>
                                <option value="!=">≠</option>
                                <option value=">">&gt;</option>
                                <option value=">=">&gt;=</option>
                                <option value="<">&lt;</option>
                                <option value="<=">&lt;=</option>
                              </select>

                              <input
                                type="text"
                                value={String(c.value)}
                                onChange={(e) => {
                                  const newNestedConstraints = [
                                    ...(editing.nestedConstraints || []),
                                  ];
                                  const newConstraints = [
                                    ...newNestedConstraints[index].constraints,
                                  ];
                                  newConstraints[constraintIndex] = {
                                    ...c,
                                    value: e.target.value,
                                  };
                                  newNestedConstraints[index] = {
                                    ...nestedConstraint,
                                    constraints: newConstraints,
                                  };
                                  setEditing((prev) => ({
                                    ...prev,
                                    nestedConstraints: newNestedConstraints,
                                  }));
                                }}
                                className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                                placeholder="value"
                              />

                              <button
                                onClick={() => {
                                  const newNestedConstraints = [
                                    ...(editing.nestedConstraints || []),
                                  ];
                                  const newConstraints = newNestedConstraints[
                                    index
                                  ].constraints.filter(
                                    (_, i) => i !== constraintIndex,
                                  );
                                  if (newConstraints.length === 0) {
                                    newConstraints.push({
                                      id: `constraint_item_${Date.now()}`,
                                      type: "attribute",
                                      attribute: "",
                                      operator: "=",
                                      value: "",
                                    });
                                  }
                                  newNestedConstraints[index] = {
                                    ...nestedConstraint,
                                    constraints: newConstraints,
                                  };
                                  setEditing((prev) => ({
                                    ...prev,
                                    nestedConstraints: newNestedConstraints,
                                  }));
                                }}
                                className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                              >
                                ✕
                              </button>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative border-2 border-violet-200 rounded-lg p-3 bg-gradient-to-r from-violet-50 to-violet-100/30"
      onContextMenu={handleContextMenu}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium ${quantifierColors[constraint.quantifier]}`}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
            {constraint.quantifier}
            {constraint.count && ` (${constraint.count})`}
          </div>

          <div className="text-xs text-violet-700 font-mono">
            {folExpression}
          </div>
        </div>

        <button
          onClick={onRemove}
          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded transition-colors"
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

      <div className="space-y-3">
        <div className="space-y-2">
          <div className="text-xs text-gray-600 font-medium">Applied to:</div>
          <div className="flex flex-wrap gap-1.5">
            {targetInfo.type === "all_predicates" ? (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs bg-indigo-100 text-indigo-800 border-indigo-200">
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>All Predicates ({targetInfo.count})</span>
              </div>
            ) : targetInfo.type === "constraints" ? (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs bg-purple-100 text-purple-800 border-purple-200">
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  Previous Constraint
                  {targetInfo.parentId ? ` (${targetInfo.parentId})` : ""}
                </span>
              </div>
            ) : (
              targetInfo.items.map((pred) => {
                const styles = {
                  topology: "bg-blue-100 text-blue-800 border-blue-200",
                  attribute:
                    "bg-emerald-100 text-emerald-800 border-emerald-200",
                  fol: "bg-violet-100 text-violet-800 border-violet-200",
                }[pred.type];

                return (
                  <div
                    key={pred.id}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${styles}`}
                  >
                    <span className="truncate max-w-[100px]">
                      {pred.description}
                    </span>
                  </div>
                );
              })
            )}
            {targetInfo.count === 0 && targetInfo.type === "predicates" && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs bg-gray-100 text-gray-600 border-gray-200">
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
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <span>No targets selected</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-gray-600 font-medium">Constraints:</div>
          <div
            className="flex flex-wrap gap-1.5 min-h-[28px] p-2 bg-violet-50/50 border border-dashed border-violet-200 rounded-lg"
            data-constraint-drop-zone="true"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.types.includes("application/json")) {
                e.dataTransfer.dropEffect = "copy";
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const data = e.dataTransfer.getData("application/json");
              if (data) {
                try {
                  const draggedItem = JSON.parse(data);
                  handlePillDrop(draggedItem);
                } catch (error) {
                  void error;
                }
              }
            }}
          >
            {(constraint.constraints || []).length === 0 ? (
              <div className="text-xs text-gray-400 italic">
                Drop attribute/topology pills here
              </div>
            ) : (
              (constraint.constraints || []).map((constraintItem, index) => (
                <NestedConstraintPill
                  key={constraintItem.id}
                  constraint={constraintItem}
                  index={index}
                  showOperator={index > 0}
                  operation={constraintItem.combineOp || "and"}
                  onOperationChange={(op) => {
                    if (op === "not") return;
                    const newConstraints = [...(constraint.constraints || [])];
                    newConstraints[index] = {
                      ...constraintItem,
                      combineOp: op,
                    };
                    onUpdate({ ...constraint, constraints: newConstraints });
                  }}
                  onRemove={() => {
                    const newConstraints = (
                      constraint.constraints || []
                    ).filter((_, i) => i !== index);
                    onUpdate({ ...constraint, constraints: newConstraints });
                  }}
                  onPillDrop={handlePillDrop}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-violet-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-violet-400"></span>
              <span className="font-medium text-gray-700">Result Mode:</span>
              <span
                className={
                  constraint.resultMode === "primary_and_projected"
                    ? "text-amber-700 font-medium"
                    : "text-gray-600"
                }
              >
                {constraint.resultMode === "primary_only"
                  ? "Primary only"
                  : `Primary + ${constraint.projectionVariable || "neighbors"}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <span className="font-medium">{matchingCount}</span>
              <span>primary</span>
            </div>
            {constraint.resultMode === "primary_and_projected" && (
              <div className="flex items-center gap-1">
                <span>+</span>
                <span className="font-medium">{projectionCount}</span>
                <span>projected</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {contextMenu && (
        <NeighborhoodContextMenu
          constraint={constraint}
          position={contextMenu.position}
          isVisible={!!contextMenu}
          onSave={handleContextMenuSave}
          onCancel={handleContextMenuCancel}
          onDelete={handleContextMenuDelete}
        />
      )}
    </div>
  );
}
