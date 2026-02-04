import { create } from "zustand";
import {
  createPredicate,
  createNeighborhoodQuantification,
  createConjunction,
  createDisjunction,
  createNegation,
  toAscii,
} from "../utils/fol";
import { evaluate as evaluateFOL, describeSelection } from "../api/fol";
import type {
  Comparator,
  Connective,
  PredicatePill,
  NeighborhoodBlock,
  EvaluationResult,
  AttributePredicate,
  TopologyPredicate,
} from "../types/fol";

interface PredicateStoreState {
  predicates: PredicatePill[];
  neighborhoodBlocks: NeighborhoodBlock[];
  connective: Connective;
  bracketGroups: BracketGroup[];

  evaluation: EvaluationResult | null;
  isEvaluating: boolean;
  errors: string[];

  inferredPredicates: {
    attribute: AttributePredicate[];
    topology: TopologyPredicate[];
  };

  addPredicate: (pill: PredicatePill) => void;
  removePredicate: (id: string) => void;
  updatePredicate: (id: string, updates: Partial<PredicatePill>) => void;
  reorderPredicates: (from: number, to: number) => void;

  setConnective: (connective: Connective) => void;

  addNeighborhoodBlock: (block: NeighborhoodBlock) => void;
  updateNeighborhoodBlock: (
    id: string,
    updates: Partial<NeighborhoodBlock>,
  ) => void;
  removeNeighborhoodBlock: (id: string) => void;

  addBracketGroup: (predicateIds: string[], connective: Connective) => void;
  removeBracketGroup: (id: string) => void;

  inferPredicatesFromSelection: (selectedNodes: string[]) => Promise<void>;
  clearInferredPredicates: () => void;

  evaluate: () => Promise<void>;
  clear: () => void;
  clearErrors: () => void;
}

interface BracketGroup {
  id: string;
  predicateIds: string[];
  connective: Connective;
}

const generateId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

function buildFOLExpression(state: PredicateStoreState): string {
  const { predicates, neighborhoodBlocks, connective, bracketGroups } = state;

  if (predicates.length === 0 && neighborhoodBlocks.length === 0) {
    return "";
  }

  const bracketedIds = new Set(bracketGroups.flatMap((g) => g.predicateIds));

  const expressions: string[] = [];

  for (const group of bracketGroups) {
    const groupExprs = group.predicateIds
      .map((id) => predicates.find((p) => p.id === id)?.folString)
      .filter((e): e is string => !!e);

    if (groupExprs.length > 0) {
      const grouped =
        group.connective === "∧"
          ? createConjunction(groupExprs, true)
          : group.connective === "∨"
            ? createDisjunction(groupExprs, true)
            : createNegation(groupExprs[0]);
      expressions.push(grouped);
    }
  }

  for (const pred of predicates) {
    if (!bracketedIds.has(pred.id)) {
      expressions.push(pred.folString);
    }
  }

  for (const block of neighborhoodBlocks) {
    const constraintExprs = block.constraints.map((c) => c.folString);
    const constraintExpr =
      constraintExprs.length > 1
        ? createConjunction(constraintExprs)
        : constraintExprs[0] || "";

    if (constraintExpr) {
      const k = block.relation === "k_hop" ? block.kParameter || 2 : 1;
      const neighborExpr = createNeighborhoodQuantification(
        block.quantifier,
        "y",
        "x",
        k,
        constraintExpr,
        block.count,
      );
      expressions.push(neighborExpr);
    }
  }

  if (expressions.length === 0) return "";
  if (expressions.length === 1) return expressions[0];

  return connective === "∧"
    ? createConjunction(expressions)
    : connective === "∨"
      ? createDisjunction(expressions)
      : createNegation(expressions[0]);
}

export const usePredicateStore = create<PredicateStoreState>((set, get) => ({
  predicates: [],
  neighborhoodBlocks: [],
  connective: "∧",
  bracketGroups: [],
  evaluation: null,
  isEvaluating: false,
  errors: [],
  inferredPredicates: {
    attribute: [],
    topology: [],
  },

  addPredicate: (pill) => {
    set((state) => ({
      predicates: [...state.predicates, pill],
      evaluation: null,
    }));
  },

  removePredicate: (id) => {
    set((state) => ({
      predicates: state.predicates.filter((p) => p.id !== id),
      bracketGroups: state.bracketGroups
        .map((g) => ({
          ...g,
          predicateIds: g.predicateIds.filter((pid) => pid !== id),
        }))
        .filter((g) => g.predicateIds.length > 0),
      neighborhoodBlocks: state.neighborhoodBlocks
        .map((b) => ({
          ...b,
          targetPredicateIds: b.targetPredicateIds.filter((pid) => pid !== id),
        }))
        .filter((b) => b.targetPredicateIds.length > 0),
      evaluation: null,
    }));
  },

  updatePredicate: (id, updates) => {
    set((state) => ({
      predicates: state.predicates.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      ),
      evaluation: null,
    }));
  },

  reorderPredicates: (from, to) => {
    set((state) => {
      const newPredicates = [...state.predicates];
      const [moved] = newPredicates.splice(from, 1);
      newPredicates.splice(to, 0, moved);
      return { predicates: newPredicates, evaluation: null };
    });
  },

  setConnective: (connective) => {
    set({ connective, evaluation: null });
  },

  addNeighborhoodBlock: (block) => {
    set((state) => ({
      neighborhoodBlocks: [...state.neighborhoodBlocks, block],
      evaluation: null,
    }));
  },

  updateNeighborhoodBlock: (id, updates) => {
    set((state) => ({
      neighborhoodBlocks: state.neighborhoodBlocks.map((b) =>
        b.id === id ? { ...b, ...updates } : b,
      ),
      evaluation: null,
    }));
  },

  removeNeighborhoodBlock: (id) => {
    set((state) => ({
      neighborhoodBlocks: state.neighborhoodBlocks.filter((b) => b.id !== id),
      evaluation: null,
    }));
  },

  addBracketGroup: (predicateIds, connective) => {
    set((state) => ({
      bracketGroups: [
        ...state.bracketGroups,
        { id: generateId(), predicateIds, connective },
      ],
      evaluation: null,
    }));
  },

  removeBracketGroup: (id) => {
    set((state) => ({
      bracketGroups: state.bracketGroups.filter((g) => g.id !== id),
      evaluation: null,
    }));
  },

  inferPredicatesFromSelection: async (selectedNodes) => {
    if (selectedNodes.length === 0) {
      set({
        inferredPredicates: { attribute: [], topology: [] },
      });
      return;
    }

    try {
      const response = await describeSelection(selectedNodes);
      set({
        inferredPredicates: {
          attribute: response.attributePredicates,
          topology: response.topologyPredicates,
        },
      });
    } catch {
      set({
        inferredPredicates: { attribute: [], topology: [] },
      });
    }
  },

  clearInferredPredicates: () => {
    set({
      inferredPredicates: { attribute: [], topology: [] },
    });
  },

  evaluate: async () => {
    const state = get();
    const expression = buildFOLExpression(state);

    if (!expression) {
      set({ evaluation: null, errors: ["No predicates to evaluate"] });
      return;
    }

    set({ isEvaluating: true, errors: [] });

    try {
      const asciiExpression = toAscii(expression);
      const result = await evaluateFOL(asciiExpression);

      set({
        evaluation: {
          matchingNodes: result.matchingNodes,
          bindings: result.matchingNodes.map((n) => ({ x: n })),
          projections: result.projections,
          folExpression: result.folExpression,
          evaluationTimeMs: result.evaluationTimeMs,
          errors: result.errors,
        },
        errors: result.errors,
        isEvaluating: false,
      });
    } catch (e) {
      set({
        evaluation: null,
        errors: [e instanceof Error ? e.message : "Evaluation failed"],
        isEvaluating: false,
      });
    }
  },

  clear: () => {
    set({
      predicates: [],
      neighborhoodBlocks: [],
      bracketGroups: [],
      connective: "∧",
      evaluation: null,
      errors: [],
      inferredPredicates: { attribute: [], topology: [] },
    });
  },

  clearErrors: () => {
    set({ errors: [] });
  },
}));

export function createPredicatePillFromAttribute(
  attribute: string,
  operator: string,
  value: string | number | boolean,
): PredicatePill {
  const folString = createPredicate("attribute", attribute, operator, value);
  return {
    id: generateId(),
    space: "attribute",
    expression: {
      type: "comparison",
      attribute,
      variable: { name: "x" },
      comparator: operator as Comparator,
      value,
    },
    displayText: `${attribute} ${operator} ${value}`,
    folString,
  };
}

export function createPredicatePillFromTopology(
  metric: string,
  operator: string,
  value: number | string,
): PredicatePill {
  const folString = createPredicate("topology", metric, operator, value);
  return {
    id: generateId(),
    space: "topology",
    expression: {
      type: "comparison",
      attribute: metric,
      variable: { name: "x" },
      comparator: operator as Comparator,
      value,
    },
    displayText: `${metric} ${operator} ${value}`,
    folString,
  };
}

export function createPredicatePillFromType(typeName: string): PredicatePill {
  const folString = `${typeName}(x)`;
  return {
    id: generateId(),
    space: "attribute",
    expression: {
      type: "type",
      typeName,
      variable: { name: "x" },
    },
    displayText: typeName,
    folString,
  };
}

export function createPredicatePillFromLifted(
  attribute: string,
  value: string,
): PredicatePill {
  const predName = `${attribute}_${value}`;
  const folString = `${predName}(x)`;
  return {
    id: generateId(),
    space: "attribute",
    expression: {
      type: "unary",
      name: predName,
      variable: { name: "x" },
    },
    displayText: `${attribute}: ${value}`,
    folString,
  };
}
