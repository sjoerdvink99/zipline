import { memo, useCallback, useEffect } from "react";
import { useLearningStore } from "../../../store/learningStore";
import { useAnalysisStore } from "../../../store/analysisStore";
import { SelectionStrip } from "./SelectionStrip";
import { useVisualBuilderStore } from "../visual/store";
import type { LearnedPredicate, LiteralInfo } from "../../../api/learning";
import { createPill, createGroup, createNeighborhood } from "../visual/types";
import type {
  Comparator,
  PredicatePill,
  BuilderNode,
  NeighborhoodBlock,
} from "../visual/types";
import { convertLearnedToBuilderNodes } from "../../../utils/learnedPredicateParser";
import { LearnedPredicateCard } from "./LearnedPredicateCard";
import { PinnedSelectionsStrip } from "../../selections/PinnedSelectionsStrip";

interface LearnedPredicatesPanelProps {
  selectedNodeIds: string[];
}

const literalToPill = (
  literal: LiteralInfo,
): PredicatePill | NeighborhoodBlock => {
  const variable = "x";

  if (literal.type === "neighborhood") {
    const neighborhoodBlock = createNeighborhood(variable);
    const spec = (
      literal as LiteralInfo & {
        neighborhood_spec?: {
          quantifier?: string;
          count?: number;
          path_str?: string;
          k_hops?: number;
          base_literal_attribute?: string;
          base_literal_value?: string;
        };
      }
    ).neighborhood_spec;
    if (spec) {
      if (spec.quantifier === "exists") {
        neighborhoodBlock.quantifier = "∃";
      } else if (spec.quantifier === "forall") {
        neighborhoodBlock.quantifier = "∀";
      } else if (spec.quantifier === "exactly") {
        neighborhoodBlock.quantifier = "exactly";
        neighborhoodBlock.count = spec.count || 1;
      } else if (spec.quantifier === "at_least") {
        neighborhoodBlock.quantifier = "at_least";
        neighborhoodBlock.count = spec.count || 1;
      } else if (spec.quantifier === "at_most") {
        neighborhoodBlock.quantifier = "at_most";
        neighborhoodBlock.count = spec.count || 1;
      }
      if (spec.path_str) {
        neighborhoodBlock.typedPath = spec.path_str;
        neighborhoodBlock.kHops = 2;
      } else {
        neighborhoodBlock.kHops = spec.k_hops || 1;
      }
      if (spec.base_literal_attribute && spec.base_literal_value) {
        const innerPill = createPill("topology", {
          variable: neighborhoodBlock.boundVariable,
          attribute: spec.base_literal_attribute,
          comparator: "=",
          value: spec.base_literal_value,
        });
        neighborhoodBlock.children = [innerPill];
      }
    } else {
      if (literal.operator === "exists") {
        neighborhoodBlock.quantifier = "∃";
      } else if (literal.operator === "forall") {
        neighborhoodBlock.quantifier = "∀";
      } else if (literal.operator.startsWith("exactly")) {
        neighborhoodBlock.quantifier = "exactly";
        const match = literal.operator.match(/exactly\((\d+)\)/);
        neighborhoodBlock.count = match ? parseInt(match[1]) : 1;
      } else if (literal.operator.startsWith("at_least")) {
        neighborhoodBlock.quantifier = "at_least";
        const match = literal.operator.match(/at_least\((\d+)\)/);
        neighborhoodBlock.count = match ? parseInt(match[1]) : 1;
      } else if (literal.operator.startsWith("at_most")) {
        neighborhoodBlock.quantifier = "at_most";
        const match = literal.operator.match(/at_most\((\d+)\)/);
        neighborhoodBlock.count = match ? parseInt(match[1]) : 1;
      }
    }
    return neighborhoodBlock;
  }

  if (literal.type === "type") {
    return createPill("type", { variable, typeName: String(literal.value) });
  } else if (literal.type === "lifted") {
    return createPill("lifted", {
      variable,
      liftedAttribute: literal.attribute,
      liftedValue: String(literal.value),
    });
  } else if (literal.type === "topology") {
    const value = isNaN(Number(literal.value)) ? 0 : Number(literal.value);
    return createPill("topology", {
      variable,
      attribute: literal.attribute,
      comparator: literal.operator as Comparator,
      value,
    });
  } else {
    const value =
      literal.value === null ||
      literal.value === undefined ||
      (typeof literal.value === "number" && isNaN(literal.value))
        ? ""
        : literal.value;
    return createPill("attribute", {
      variable,
      attribute: literal.attribute,
      comparator: (literal.operator || "=") as Comparator,
      value,
    });
  }
};

export const LearnedPredicatesPanel = memo(function LearnedPredicatesPanel({
  selectedNodeIds,
}: LearnedPredicatesPanelProps) {
  const {
    learnedPredicates = [],
    isLearning,
    learningTimeMs,
    error,
    quickLearn: doQuickLearn,
    clearLearned,
    lastSelectedNodes = [],
    lastContrastNodes = [],
  } = useLearningStore();

  const {
    setHighlightedNodes,
    clearHighlights,
    favoritedClauses,
    addFavoriteClause,
    removeFavoriteClause,
    contrastMode,
    contrastNodes,
    enterContrastMode,
    exitContrastMode,
    pinnedSelections,
  } = useAnalysisStore();

  const { addNodesWithDeduplication, setRootConnective } =
    useVisualBuilderStore();

  const handleAddToBuilder = useCallback(
    (predicate: LearnedPredicate) => {
      try {
        const { nodes, rootConnective } =
          convertLearnedToBuilderNodes(predicate);
        if (nodes.length > 0) {
          setRootConnective(rootConnective);
          addNodesWithDeduplication(nodes);
          return;
        }
      } catch {}

      if (
        predicate.is_disjunction &&
        predicate.clauses &&
        predicate.clauses.length > 1
      ) {
        setRootConnective("∨");
        const clauseGroups: BuilderNode[] = predicate.clauses.map((clause) => {
          const nodes = clause.map(literalToPill);
          return nodes.length === 1 ? nodes[0] : createGroup(nodes, "∧");
        });
        addNodesWithDeduplication(clauseGroups);
      } else if (predicate.literals && predicate.literals.length > 0) {
        addNodesWithDeduplication(predicate.literals.map(literalToPill));
      }
    },
    [addNodesWithDeduplication, setRootConnective],
  );

  const handleToggleFavorite = useCallback(
    (predicate: LearnedPredicate) => {
      const existing = favoritedClauses.find(
        (c) => c.predicate.fol_expression === predicate.fol_expression,
      );
      if (existing) {
        removeFavoriteClause(existing.id);
      } else {
        addFavoriteClause(predicate);
      }
    },
    [favoritedClauses, addFavoriteClause, removeFavoriteClause],
  );

  const handleHover = useCallback(
    (nodeIds: string[] | null) => {
      if (nodeIds) {
        setHighlightedNodes(nodeIds);
      } else {
        clearHighlights();
      }
    },
    [setHighlightedNodes, clearHighlights],
  );

  useEffect(() => {
    if (selectedNodeIds.length > 0 && selectedNodeIds.length <= 500) {
      const nodesChanged =
        selectedNodeIds.length !== lastSelectedNodes.length ||
        !selectedNodeIds.every((n, i) => lastSelectedNodes[i] === n);
      const contrastChanged =
        contrastNodes.length !== lastContrastNodes.length ||
        !contrastNodes.every((n, i) => lastContrastNodes[i] === n);
      if (nodesChanged || contrastChanged) {
        const contrast = contrastNodes.length > 0 ? contrastNodes : undefined;
        doQuickLearn(selectedNodeIds, contrast);
      }
    } else if (selectedNodeIds.length === 0 && learnedPredicates?.length > 0) {
      clearLearned();
    }
  }, [
    selectedNodeIds,
    lastSelectedNodes,
    contrastNodes,
    lastContrastNodes,
    doQuickLearn,
    clearLearned,
    learnedPredicates,
  ]);

  if (
    selectedNodeIds.length === 0 &&
    (!learnedPredicates || learnedPredicates.length === 0) &&
    pinnedSelections.length === 0
  ) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Explanations
        </span>
        {learnedPredicates && learnedPredicates.length > 0 && (
          <>
            <span className="text-[10px] text-gray-300 tabular-nums">
              {learnedPredicates.length}
            </span>
            <span className="text-gray-200">·</span>
            <span className="text-[10px] text-gray-300 tabular-nums">
              {learningTimeMs.toFixed(0)}ms
            </span>
          </>
        )}
        <div className="flex-1 border-t border-gray-100" />
        {isLearning && (
          <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        )}
        {!contrastMode && selectedNodeIds.length > 0 && (
          <button
            onClick={enterContrastMode}
            className="text-[10px] text-gray-300 hover:text-amber-500 transition-colors px-1"
            title="Compare: select a contrast group (S−)"
          >
            ↔
          </button>
        )}
        {contrastMode && (
          <button
            onClick={exitContrastMode}
            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors px-1"
            title="Exit contrast mode"
          >
            ×
          </button>
        )}
      </div>
      {pinnedSelections.length > 0 && <PinnedSelectionsStrip />}
      <SelectionStrip selectedNodeIds={selectedNodeIds} />

      {error && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error}
        </div>
      )}

      {learnedPredicates && learnedPredicates.length > 0 && (
        <div className="flex flex-col gap-2">
          {learnedPredicates.map((pred, i) => (
            <LearnedPredicateCard
              key={i}
              predicate={pred}
              rank={i + 1}
              isFavorite={favoritedClauses.some(
                (c) => c.predicate.fol_expression === pred.fol_expression,
              )}
              onToggleFavorite={() => handleToggleFavorite(pred)}
              onAddToBuilder={() => handleAddToBuilder(pred)}
              onHover={handleHover}
            />
          ))}
        </div>
      )}
    </section>
  );
});

export default LearnedPredicatesPanel;
