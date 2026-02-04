import { useCallback, useMemo } from "react";
import {
  usePredicateStore,
  createPredicatePillFromAttribute,
  createPredicatePillFromTopology,
  createPredicatePillFromType,
  createPredicatePillFromLifted,
} from "../../store/folStore";
import { formatFOL } from "../../utils/fol";
import { ConnectiveToggle } from "./visual/ConnectiveToggle";
import type { Connective } from "./visual/types";
import type {
  PredicatePill,
  NeighborhoodBlock,
  Quantifier,
  ProjectionResult,
} from "../../types/fol";

interface PredicateBuilderProps {
  onEvaluate?: (
    matchingNodes: string[],
    projections?: ProjectionResult[],
  ) => void;
  onClear?: () => void;
}

export function PredicateBuilder({
  onEvaluate,
  onClear,
}: PredicateBuilderProps) {
  const {
    predicates,
    neighborhoodBlocks,
    connective,
    evaluation,
    isEvaluating,
    errors,
    inferredPredicates,
    addPredicate,
    removePredicate,
    setConnective,
    addNeighborhoodBlock,
    updateNeighborhoodBlock,
    removeNeighborhoodBlock,
    addBracketGroup,
    evaluate,
    clear,
  } = usePredicateStore();

  const folExpression = useMemo(() => {
    if (predicates.length === 0 && neighborhoodBlocks.length === 0) return "";

    const exprs = predicates.map((p) => p.folString);
    neighborhoodBlocks.forEach((b) => {
      if (b.constraints.length > 0) {
        const constraint = b.constraints.map((c) => c.folString).join(" ∧ ");
        const q =
          b.quantifier === "∀" || b.quantifier === "∃"
            ? b.quantifier
            : `${b.quantifier}(${b.count})`;
        const rel =
          b.relation === "k_hop" ? `N_${b.kParameter || 2}(x)` : "neighbors(x)";
        exprs.push(`${q}y ∈ ${rel} : ${constraint}`);
      }
    });

    if (exprs.length === 0) return "";
    if (exprs.length === 1) return exprs[0];

    return connective === "∧" ? exprs.join(" ∧ ") : exprs.join(" ∨ ");
  }, [predicates, neighborhoodBlocks, connective]);

  const handleEvaluate = useCallback(async () => {
    await evaluate();
    const state = usePredicateStore.getState();
    if (state.evaluation && onEvaluate) {
      onEvaluate(state.evaluation.matchingNodes, state.evaluation.projections);
    }
  }, [evaluate, onEvaluate]);

  const handleClear = useCallback(() => {
    clear();
    onClear?.();
  }, [clear, onClear]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      try {
        const data = e.dataTransfer.getData("application/json");
        if (!data) return;

        const dragData = JSON.parse(data);

        if (dragData.type === "inferred-predicate") {
          const pred = dragData.predicate;
          if (pred.space === "attribute") {
            addPredicate(
              createPredicatePillFromAttribute(pred.attribute, "=", pred.value),
            );
          } else {
            addPredicate(
              createPredicatePillFromTopology(
                pred.metric,
                pred.operator,
                pred.threshold,
              ),
            );
          }
        } else if (dragData.type === "type-predicate") {
          addPredicate(createPredicatePillFromType(dragData.typeName));
        } else if (dragData.type === "lifted-predicate") {
          addPredicate(
            createPredicatePillFromLifted(dragData.attribute, dragData.value),
          );
        }
      } catch {
      }
    },
    [addPredicate],
  );

  const handleCreateNeighborhoodBlock = useCallback(() => {
    const block: NeighborhoodBlock = {
      id: `nb_${Date.now()}`,
      quantifier: "∀",
      relation: "neighbors",
      targetPredicateIds: predicates.map((p) => p.id),
      constraints: [],
      resultMode: "primary_only",
    };
    addNeighborhoodBlock(block);
  }, [predicates, addNeighborhoodBlock]);

  const handleCreateBracketGroup = useCallback(() => {
    if (predicates.length < 2) return;
    addBracketGroup(
      predicates.map((p) => p.id),
      "∧",
    );
  }, [predicates, addBracketGroup]);

  return (
    <div className="flex flex-col gap-4 p-4 bg-white border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-violet-600"
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
          <h2 className="text-lg font-semibold text-gray-900">
            Predicate Builder
          </h2>
          <span className="px-2 py-0.5 text-xs bg-violet-100 text-violet-700 rounded-full">
            FOL
          </span>
        </div>

        <div className="flex items-center gap-2">
          {(predicates.length > 0 || neighborhoodBlocks.length > 0) && (
            <>
              <button
                onClick={handleEvaluate}
                disabled={isEvaluating}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isEvaluating ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
                Evaluate
              </button>
              <button
                onClick={handleClear}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      <div
        className="min-h-[100px] p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:border-blue-400 transition-colors"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={handleDrop}
      >
        {predicates.length === 0 && neighborhoodBlocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg
              className="w-8 h-8 mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <p className="text-sm">
              Drag predicates here or select from the panels
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {predicates.map((pill, index) => (
              <div key={pill.id} className="flex items-center gap-1">
                {index > 0 && (
                  <ConnectiveToggle
                    value={connective as Connective}
                    onChange={(newConnective) => setConnective(newConnective as import("../../types/fol").Connective)}
                    size="sm"
                  />
                )}
                <PredicatePillComponent
                  pill={pill}
                  onRemove={() => removePredicate(pill.id)}
                />
              </div>
            ))}

            {neighborhoodBlocks.map((block) => (
              <NeighborhoodBlockComponent
                key={block.id}
                block={block}
                onUpdate={(updates) =>
                  updateNeighborhoodBlock(block.id, updates)
                }
                onRemove={() => removeNeighborhoodBlock(block.id)}
              />
            ))}
          </div>
        )}
      </div>

      {predicates.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateNeighborhoodBlock}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Add Neighborhood
          </button>
          {predicates.length > 1 && (
            <button
              onClick={handleCreateBracketGroup}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <span className="font-mono">()</span>
              Group with Brackets
            </button>
          )}
        </div>
      )}

      {folExpression && (
        <div className="p-3 bg-gray-900 text-gray-100 rounded-lg font-mono text-sm overflow-x-auto">
          <span className="text-gray-500 mr-2">FOL:</span>
          {formatFOL(folExpression)}
        </div>
      )}

      {errors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          {errors.map((error, i) => (
            <p key={i} className="text-sm text-red-700">
              {error}
            </p>
          ))}
        </div>
      )}

      {evaluation && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-green-800">
              {evaluation.matchingNodes.length} matching nodes
            </span>
            <span className="text-xs text-green-600">
              {evaluation.evaluationTimeMs.toFixed(1)}ms
            </span>
          </div>
          {evaluation.projections && evaluation.projections.length > 0 && (
            <div className="mt-2 text-xs text-green-700">
              {evaluation.projections.length} projected results
            </div>
          )}
        </div>
      )}

      {(inferredPredicates.attribute.length > 0 ||
        inferredPredicates.topology.length > 0) && (
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Suggested Predicates
          </h3>
          <div className="flex flex-wrap gap-2">
            {inferredPredicates.attribute.slice(0, 5).map((pred, i) => (
              <button
                key={i}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/json",
                    JSON.stringify({
                      type: "inferred-predicate",
                      predicate: pred,
                    }),
                  );
                }}
                onClick={() =>
                  addPredicate(
                    createPredicatePillFromAttribute(
                      pred.attribute,
                      "=",
                      pred.value,
                    ),
                  )
                }
                className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200 cursor-grab transition-colors"
              >
                {pred.attribute}: {pred.value}
              </button>
            ))}
            {inferredPredicates.topology.slice(0, 3).map((pred, i) => (
              <button
                key={i}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/json",
                    JSON.stringify({
                      type: "inferred-predicate",
                      predicate: pred,
                    }),
                  );
                }}
                onClick={() =>
                  addPredicate(
                    createPredicatePillFromTopology(
                      pred.metric,
                      pred.operator,
                      pred.threshold,
                    ),
                  )
                }
                className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200 cursor-grab transition-colors"
              >
                {pred.metric} {pred.operator} {pred.threshold}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PredicatePillComponentProps {
  pill: PredicatePill;
  onRemove: () => void;
}

function PredicatePillComponent({
  pill,
  onRemove,
}: PredicatePillComponentProps) {
  const bgColor = pill.space === "attribute" ? "bg-green-100" : "bg-blue-100";
  const textColor =
    pill.space === "attribute" ? "text-green-800" : "text-blue-800";
  const borderColor =
    pill.space === "attribute" ? "border-green-300" : "border-blue-300";

  return (
    <div
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border ${bgColor} ${borderColor}`}
    >
      <span className={`text-sm font-medium ${textColor}`}>
        {pill.displayText}
      </span>
      <button
        onClick={onRemove}
        className={`ml-1 p-0.5 rounded hover:bg-white/50 ${textColor}`}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

interface NeighborhoodBlockComponentProps {
  block: NeighborhoodBlock;
  onUpdate: (updates: Partial<NeighborhoodBlock>) => void;
  onRemove: () => void;
}

function NeighborhoodBlockComponent({
  block,
  onUpdate,
  onRemove,
}: NeighborhoodBlockComponentProps) {
  return (
    <div className="flex items-center gap-2 p-2 bg-violet-50 border border-violet-200 rounded-lg">
      <select
        value={block.quantifier}
        onChange={(e) => onUpdate({ quantifier: e.target.value as Quantifier })}
        className="px-2 py-1 text-xs bg-white border border-violet-300 rounded"
      >
        <option value="∀">∀ (all)</option>
        <option value="∃">∃ (some)</option>
        <option value="exactly">exactly</option>
        <option value="at_least">at least</option>
        <option value="at_most">at most</option>
      </select>

      {["exactly", "at_least", "at_most"].includes(block.quantifier) && (
        <input
          type="number"
          value={block.count || 1}
          onChange={(e) => onUpdate({ count: parseInt(e.target.value) || 1 })}
          className="w-12 px-2 py-1 text-xs bg-white border border-violet-300 rounded"
          min={1}
        />
      )}

      <span className="text-xs text-violet-600">y ∈</span>

      <select
        value={block.relation}
        onChange={(e) =>
          onUpdate({ relation: e.target.value as "neighbors" | "k_hop" })
        }
        className="px-2 py-1 text-xs bg-white border border-violet-300 rounded"
      >
        <option value="neighbors">neighbors(x)</option>
        <option value="k_hop">N_k(x)</option>
      </select>

      {block.relation === "k_hop" && (
        <input
          type="number"
          value={block.kParameter || 2}
          onChange={(e) =>
            onUpdate({ kParameter: parseInt(e.target.value) || 2 })
          }
          className="w-12 px-2 py-1 text-xs bg-white border border-violet-300 rounded"
          min={1}
          max={5}
        />
      )}

      <span className="text-xs text-violet-600">:</span>

      <div className="flex items-center gap-1 px-2 py-1 bg-white border border-violet-300 rounded text-xs">
        {block.constraints.length === 0 ? (
          <span className="text-gray-400 italic">drop constraint</span>
        ) : (
          block.constraints.map((c) => (
            <span key={c.id} className="text-violet-700">
              {c.displayText}
            </span>
          ))
        )}
      </div>

      <button
        onClick={onRemove}
        className="p-1 text-violet-600 hover:text-violet-800 hover:bg-violet-100 rounded"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
