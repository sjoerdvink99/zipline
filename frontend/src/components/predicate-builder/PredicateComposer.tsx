import { useState, useCallback } from "react";
import { FOLExpressionDisplay } from "./FOLExpressionDisplay";
import {
  NeighborhoodConstraintBlock,
  type NeighborhoodBlock,
} from "./constraints/NeighborhoodConstraintBlock";
import { ProjectionResults } from "../results/ProjectionResults";
import { usePredicateComposerStore } from "../../store/predicateComposerStore";
import { useRealtimeValidation } from "../../hooks/useRealtimeValidation";

interface FilterItem {
  id: string;
  type: "topology" | "attribute" | "fol";
  predicate: any;
  description: string;
  nodeTypes?: string[];
}

import type { ProjectionResult } from "../../types/fol";

interface PredicateComposerProps {
  filterItems: FilterItem[];
  setOperations: Record<string, "and" | "or" | "not">;
  onFilterApply: (
    matchingNodeIds: string[],
    projectionResults?: ProjectionResult[],
  ) => void;
  onFilterClear: () => void;
}

export function PredicateComposer({
  filterItems,
  setOperations,
  onFilterApply,
  onFilterClear,
}: PredicateComposerProps) {
  const [selectedPredicateIds, setSelectedPredicateIds] = useState<string[]>(
    [],
  );
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [resultMode, setResultMode] = useState<
    "primary_only" | "primary_and_projected"
  >("primary_only");

  const {
    queryCanvas,
    currentEvaluation,
    ui: { isEvaluating, validationErrors },
    addNeighborhoodConstraint,
    updateNeighborhoodConstraint,
    removeNeighborhoodConstraint,
    evaluateExpression,
    clearEvaluation,
  } = usePredicateComposerStore();

  const neighbourhoodConstraints = queryCanvas.neighbourhoodConstraints;

  useRealtimeValidation(filterItems, setOperations);

  const startNeighborhoodConstraint = useCallback(() => {
    if (filterItems.length === 0) return;
    setIsSelectionMode(true);
    setSelectedPredicateIds([]);
  }, [filterItems.length]);

  const cancelSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedPredicateIds([]);
  }, []);

  const togglePredicateSelection = useCallback((predicateId: string) => {
    setSelectedPredicateIds((prev) =>
      prev.includes(predicateId)
        ? prev.filter((id) => id !== predicateId)
        : [...prev, predicateId],
    );
  }, []);

  const createNeighborhoodBlock = useCallback(() => {
    if (selectedPredicateIds.length === 0) return;

    const newBlock: NeighborhoodBlock = {
      id: `neighborhood_${Date.now()}`,
      targetPredicateIds: selectedPredicateIds,
      targetType:
        selectedPredicateIds.length === filterItems.length
          ? "all_predicates"
          : "predicates",
      quantifier: "ALL",
      relation: "neighbors",
      constraint: {
        type: "attribute",
        attribute: "type",
        operator: "=",
        value: "",
      },
      resultMode: "primary_only",
    };

    addNeighborhoodConstraint(newBlock);
    setIsSelectionMode(false);
    setSelectedPredicateIds([]);
  }, [selectedPredicateIds, addNeighborhoodConstraint, filterItems.length]);

  const handleEvaluate = useCallback(async () => {
    await evaluateExpression();
    if (currentEvaluation) {
      onFilterApply(
        currentEvaluation.matching_nodes,
        currentEvaluation.projections as ProjectionResult[] | undefined,
      );
    }
  }, [evaluateExpression, currentEvaluation, onFilterApply]);

  const handleClear = useCallback(() => {
    clearEvaluation();
    onFilterClear();
  }, [clearEvaluation, onFilterClear]);

  if (typeof window !== "undefined") {
    (
      window as unknown as {
        predicateSelectionMode: {
          isActive: boolean;
          selectedIds: string[];
          toggle: (id: string) => void;
        };
      }
    ).predicateSelectionMode = {
      isActive: isSelectionMode,
      selectedIds: selectedPredicateIds,
      toggle: togglePredicateSelection,
    };
  }

  const hasPredicates = filterItems.length > 0;
  const hasConstraints = neighbourhoodConstraints.length > 0;
  const hasResults = (currentEvaluation?.matching_nodes?.length ?? 0) > 0;
  const hasNoMatches =
    currentEvaluation &&
    (currentEvaluation.matching_nodes?.length ?? 0) === 0 &&
    validationErrors.length === 0;

  return (
    <div className="space-y-4 p-4 bg-white border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
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
              Predicate Composer
            </h2>
          </div>
          <div className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded-full font-medium">
            FOL Engine
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasPredicates && (
            <>
              <button
                onClick={handleEvaluate}
                disabled={isEvaluating}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isEvaluating ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
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
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {hasPredicates && (
        <div className="relative">
          <FOLExpressionDisplay
            filterItems={filterItems}
            setOperations={setOperations}
            neighborhoodConstraints={queryCanvas.neighbourhoodConstraints}
          />
          {validationErrors.length === 0 && (
            <div className="absolute top-2 right-2">
              <div className="flex items-center gap-1 px-2 py-1 bg-green-100 border border-green-200 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-xs text-green-700 font-medium">
                  Valid
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-red-500 mt-0.5 shrink-0"
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
            <div>
              <h4 className="text-sm font-medium text-red-800 mb-1">
                Expression Validation ({validationErrors.length} issue
                {validationErrors.length !== 1 ? "s" : ""})
              </h4>
              <ul className="space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index} className="text-xs text-red-700">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                      <span className="font-medium capitalize">
                        {error.type}:
                      </span>
                      {error.message}
                      {error.position && (
                        <span className="text-red-500 font-mono ml-1">
                          (pos: {error.position})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {!isSelectionMode ? (
          <button
            onClick={startNeighborhoodConstraint}
            disabled={!hasPredicates}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
              hasPredicates
                ? "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                : "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
            }`}
            title={
              hasPredicates
                ? "Add neighborhood constraint to selected predicates"
                : "Add predicates first"
            }
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                clipRule="evenodd"
              />
            </svg>
            Add Neighborhood Constraint
          </button>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-200 rounded-lg">
            <div className="flex-1">
              <span className="text-sm font-medium text-violet-800">
                Select predicates for constraint ({selectedPredicateIds.length}{" "}
                selected)
              </span>
              <p className="text-xs text-violet-600 mt-1">
                Click on predicate pills above to select them for the
                neighborhood constraint.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={createNeighborhoodBlock}
                disabled={selectedPredicateIds.length === 0}
                className="px-3 py-2 text-sm font-medium bg-violet-600 text-white rounded hover:bg-violet-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Create
              </button>
              <button
                onClick={cancelSelection}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {hasConstraints && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500"></div>
            Neighborhood Constraints ({neighbourhoodConstraints.length})
          </h3>
          {neighbourhoodConstraints.map((constraint) => (
            <NeighborhoodConstraintBlock
              key={constraint.id}
              block={constraint}
              filterItems={filterItems}
              onUpdate={(updatedBlock) =>
                updateNeighborhoodConstraint(constraint.id, updatedBlock)
              }
              onRemove={() => removeNeighborhoodConstraint(constraint.id)}
              matchingCount={Math.floor(Math.random() * 50) + 10}
              projectionCount={
                constraint.resultMode === "primary_and_projected"
                  ? Math.floor(Math.random() * 20) + 5
                  : 0
              }
            />
          ))}
        </div>
      )}

      {hasResults && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <h3 className="text-sm font-semibold text-gray-700">
              Evaluation Results
            </h3>
          </div>

          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Result Mode:
              </span>
              <div className="flex bg-white border border-gray-300 rounded-lg p-1">
                <button
                  onClick={() => setResultMode("primary_only")}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    resultMode === "primary_only"
                      ? "bg-blue-100 text-blue-800"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Primary Only
                </button>
                <button
                  onClick={() => setResultMode("primary_and_projected")}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    resultMode === "primary_and_projected"
                      ? "bg-amber-100 text-amber-800"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Primary + Projected
                </button>
              </div>
            </div>
          </div>

          {currentEvaluation?.projections && (
            <ProjectionResults
              projections={currentEvaluation.projections}
              resultMode={resultMode}
              onNodeHighlight={() => {}}
            />
          )}
        </div>
      )}

      {hasNoMatches && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-amber-600 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-800 mb-1">
                No Matches Found
              </h3>
              <p className="text-sm text-amber-700 mb-2">
                Your predicate expression was evaluated successfully, but no
                nodes in the current dataset satisfy the specified criteria.
              </p>
              <div className="text-xs text-amber-600 bg-amber-100 border border-amber-200 rounded px-2 py-1 inline-block">
                <span className="font-medium">Expression:</span>{" "}
                {currentEvaluation?.expression}
              </div>
            </div>
          </div>
        </div>
      )}

      {!hasPredicates && !hasConstraints && (
        <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
          <div className="text-center">
            <svg
              className="w-12 h-12 text-blue-500 mx-auto mb-3"
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
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Build Your FOL Expression
            </h3>
            <p className="text-sm text-blue-700 mb-4">
              Drag predicates from the topology and attribute panels to start
              building your cross-space query.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-white border border-blue-200 rounded">
                <div className="font-medium text-blue-800 mb-1">
                  1. Add Predicates
                </div>
                <div className="text-blue-600">
                  Drag topology and attribute filters
                </div>
              </div>
              <div className="p-3 bg-white border border-blue-200 rounded">
                <div className="font-medium text-blue-800 mb-1">
                  2. Add Constraints
                </div>
                <div className="text-blue-600">
                  Create neighborhood relationships
                </div>
              </div>
              <div className="p-3 bg-white border border-blue-200 rounded">
                <div className="font-medium text-blue-800 mb-1">
                  3. Evaluate
                </div>
                <div className="text-blue-600">
                  Generate cross-space results
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
