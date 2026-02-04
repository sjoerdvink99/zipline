import { create } from "zustand";
import {
  formatFOL,
  createPredicate,
  createNeighborhood,
  combine,
  getVariableForLevel,
} from "../utils/fol";
import type {
  FilterItem,
  NeighborhoodConstraint,
  ValidationError,
} from "../types/fol";
import { saveSessionState, loadSessionState } from "../utils/persistence";
import { useAnalysisStore } from "./analysisStore";

import type { ProjectionResult } from "../types/fol";

interface EvaluationResult {
  matching_nodes: string[];
  projections?: ProjectionResult[];
  fol_expression?: string;
  expression?: string;
  evaluation_time_ms?: number;
  errors?: string[];
  is_valid?: boolean;
}

interface PredicateState {
  predicates: FilterItem[];
  constraints: NeighborhoodConstraint[];
  setOperations: Record<string, "and" | "or" | "not">;
  evaluation: EvaluationResult | null;
  errors: ValidationError[];
  isEvaluating: boolean;
  selectionMode: boolean;
  selectedIds: string[];

  addPredicate: (predicate: FilterItem) => void;
  updatePredicate: (id: string, updates: Partial<FilterItem>) => void;
  removePredicate: (id: string) => void;
  reorderPredicates: (from: number, to: number) => void;
  setOperation: (id: string, op: "and" | "or" | "not") => void;

  addConstraint: (constraint: NeighborhoodConstraint) => void;
  updateConstraint: (
    id: string,
    updates: Partial<NeighborhoodConstraint>,
  ) => void;
  removeConstraint: (id: string) => void;

  setSelectionMode: (active: boolean) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;

  evaluate: () => Promise<void>;
  clear: () => void;

  addError: (error: ValidationError) => void;
  clearErrors: () => void;

  savePredicateState: () => void;
  loadPredicateState: () => boolean;
  clearPredicateState: () => void;
}

const generateId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

async function generateFOLExpression(
  predicates: FilterItem[],
  constraints: NeighborhoodConstraint[],
  setOperations: Record<string, "and" | "or" | "not">,
): Promise<string> {
  if (predicates.length === 0 && constraints.length === 0) return "";

  const predicateStrings = predicates.map((item, index) => {
    let str = "";

    if (item.type === "attribute") {
      const pred = item.predicate;
      str = createPredicate(
        "attribute",
        pred.attribute,
        pred.operator,
        pred.value,
        pred.value2,
        pred.node_type,
      );
    } else if (item.type === "topology") {
      const pred = item.predicate;
      str = createPredicate(
        "topology",
        pred.attribute,
        pred.operator,
        pred.value,
        pred.value2,
        pred.node_type,
      );
    } else {
      str = item.predicate.expression || item.description;
    }

    const op = setOperations[item.id] || "and";
    if (index > 0 && op === "not") {
      str = `¬(${str})`;
    }

    return str;
  });

  function generateNeighborhoodConstraint(
    constraint: NeighborhoodConstraint,
  ): string {
    const currentVariable = getVariableForLevel(constraint.level);
    const parentVariable =
      constraint.level > 0 ? getVariableForLevel(constraint.level - 1) : "x";

    const validConstraints = constraint.constraints.filter(
      (c) =>
        c &&
        c.attribute &&
        c.operator &&
        c.value !== undefined &&
        c.value !== null &&
        c.value !== "",
    );

    const constraintExpressions = validConstraints.map((c) => {
      const predicateType = c.type === "topology" ? "topology" : "attribute";
      return createPredicate(
        predicateType,
        c.attribute,
        c.operator,
        c.value,
        undefined,
        c.node_type,
        currentVariable,
      );
    });

    let constraintExpression = "";

    if (constraintExpressions.length > 0) {
      constraintExpression =
        constraintExpressions.length > 1
          ? combine(
              constraintExpressions,
              constraint.constraints[0]?.combineOp || "and",
            )
          : constraintExpressions[0];
    }

    if (
      constraint.nestedConstraints &&
      constraint.nestedConstraints.length > 0
    ) {
      const nestedExpressions = constraint.nestedConstraints.map(
        generateNeighborhoodConstraint,
      );
      constraintExpression = constraintExpression
        ? combine([constraintExpression, ...nestedExpressions], "and")
        : combine(nestedExpressions, "and");
    }

    if (!constraintExpression || constraintExpression.trim() === "") {
      return "";
    }

    return createNeighborhood(
      constraint.quantifier,
      constraint.count,
      constraint.relation,
      constraintExpression,
      currentVariable,
      parentVariable,
    );
  }

  const processedConstraints = new Set<string>();
  const constraintStrings: string[] = [];

  constraints.forEach((constraint) => {
    if (processedConstraints.has(constraint.id)) return;

    const isReferencedAsNested = constraints.some(
      (c) =>
        c.nestedConstraints &&
        c.nestedConstraints.some((nc) => nc.id === constraint.id),
    );

    if (!isReferencedAsNested) {
      const constraintStr = generateNeighborhoodConstraint(constraint);
      if (constraintStr && constraintStr.trim() !== "") {
        constraintStrings.push(constraintStr);
      }
      processedConstraints.add(constraint.id);
    }
  });

  const allExpressions = [...predicateStrings, ...constraintStrings].filter(
    (s) => s && s.trim() !== "",
  );
  if (allExpressions.length === 0) return "";

  const hasOr = Object.values(setOperations).includes("or");
  return formatFOL(combine(allExpressions, hasOr ? "or" : "and"));
}

export const usePredicateStore = create<PredicateState>((set, get) => ({
  predicates: [],
  constraints: [],
  setOperations: {},
  evaluation: null,
  errors: [],
  isEvaluating: false,
  selectionMode: false,
  selectedIds: [],

  addPredicate: (predicate) => {
    set((state) => {
      const newPredicates: FilterItem[] = [...state.predicates, predicate];
      return {
        predicates: newPredicates,
        evaluation: null,
      };
    });
  },

  updatePredicate: (id, updates) => {
    set((state) => {
      const newPredicates: FilterItem[] = state.predicates.map((p) =>
        p.id === id ? ({ ...p, ...updates } as FilterItem) : p,
      );
      return {
        predicates: newPredicates,
        evaluation: null,
      };
    });
  },

  removePredicate: (id) => {
    set((state) => {
      const updatedConstraints = state.constraints
        .map((c) => ({
          ...c,
          targetPredicateIds: c.targetPredicateIds.filter((pid) => pid !== id),
        }))
        .filter((c) => c.targetPredicateIds.length > 0);

      const updatedOperations = { ...state.setOperations };
      delete updatedOperations[id];

      return {
        predicates: state.predicates.filter((p) => p.id !== id),
        constraints: updatedConstraints,
        setOperations: updatedOperations,
        selectedIds: state.selectedIds.filter((sid) => sid !== id),
        evaluation: null,
      };
    });
  },

  reorderPredicates: (from, to) => {
    set((state) => {
      const predicates = [...state.predicates];
      const [item] = predicates.splice(from, 1);
      predicates.splice(to, 0, item);
      return { predicates };
    });
  },

  setOperation: (id, op) => {
    set((state) => ({
      setOperations: { ...state.setOperations, [id]: op },
    }));
  },

  addConstraint: (constraint) => {
    interface LegacyConstraint extends NeighborhoodConstraint {
      constraint?: {
        type: string;
        attribute: string;
        operator: string;
        value: string | number | boolean;
      };
    }

    const legacyConstraint = constraint as LegacyConstraint;
    const migratedConstraint = {
      ...constraint,
      id: constraint.id || generateId(),
      constraints: legacyConstraint.constraint
        ? [
            {
              id: `constraint_item_${Date.now()}`,
              type: legacyConstraint.constraint.type as
                | "attribute"
                | "topology",
              attribute: legacyConstraint.constraint.attribute,
              operator: legacyConstraint.constraint.operator,
              value: legacyConstraint.constraint.value,
            },
          ]
        : constraint.constraints || [],
    } as NeighborhoodConstraint;

    set((state) => ({
      constraints: [...state.constraints, migratedConstraint],
      evaluation: null,
    }));
  },

  updateConstraint: (id, updates) => {
    set((state) => ({
      constraints: state.constraints.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
      evaluation: null,
    }));
  },

  removeConstraint: (id) => {
    set((state) => ({
      constraints: state.constraints.filter((c) => c.id !== id),
      evaluation: null,
    }));
  },

  setSelectionMode: (active) => {
    set({ selectionMode: active, selectedIds: active ? [] : [] });
  },

  toggleSelection: (id) => {
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((sid) => sid !== id)
        : [...state.selectedIds, id],
    }));
  },

  clearSelection: () => {
    set({ selectedIds: [], selectionMode: false });
  },

  evaluate: async () => {
    const { predicates, constraints, setOperations } = get();
    if (predicates.length === 0 && constraints.length === 0) return;

    set({ isEvaluating: true, errors: [] });

    try {
      const expression = await generateFOLExpression(
        predicates,
        constraints,
        setOperations,
      );

      if (!expression) {
        set({ evaluation: null });
        get().addError({
          type: "validation",
          message:
            "Expression not complete. Please ensure all constraints have valid attributes and values.",
        });
        return;
      }

      if (
        expression.includes("undefined") ||
        expression.includes("null") ||
        expression.includes('""')
      ) {
        get().addError({
          type: "validation",
          message:
            "Expression not complete. Please check that all constraints have valid attributes and values.",
        });
        return;
      }

      const response = await fetch("/api/predicates/evaluate-fol", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expression: expression,
          project_variables: constraints.some(
            (c) => c.resultMode === "primary_and_projected",
          )
            ? ["y"]
            : null,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      const result: EvaluationResult = {
        matching_nodes: data.matching_nodes || [],
        expression: expression,
        is_valid: !data.errors || data.errors.length === 0,
        projections: data.projections || undefined,
      };

      set({ evaluation: result });

      if (data.errors && data.errors.length > 0) {
        data.errors.forEach((error: string) => {
          let userFriendlyMessage = error;
          if (error.includes("Invalid atomic predicate format: undefined")) {
            userFriendlyMessage =
              "Expression not complete. Please ensure all neighborhood constraints have valid attribute predicates.";
          } else if (
            error.includes("Failed to parse predicate") &&
            error.includes("undefined")
          ) {
            userFriendlyMessage =
              "Expression not complete. Please check that all constraints are properly filled out.";
          }

          get().addError({ type: "semantic", message: userFriendlyMessage });
        });
      }
    } catch (error) {
      void error;
      let userFriendlyMessage = "Evaluation failed";

      if (error instanceof Error) {
        if (
          error.message.includes("Invalid atomic predicate format: undefined")
        ) {
          userFriendlyMessage =
            "Expression not complete. Please ensure all neighborhood constraints have valid attribute predicates.";
        } else if (error.message.includes("undefined")) {
          userFriendlyMessage =
            "Expression not complete. Please check that all constraints are properly filled out.";
        } else {
          userFriendlyMessage = error.message;
        }
      }

      get().addError({
        type: "semantic",
        message: userFriendlyMessage,
      });
    } finally {
      set({ isEvaluating: false });
    }
  },

  clear: () => {
    set({
      predicates: [],
      constraints: [],
      setOperations: {},
      evaluation: null,
      errors: [],
      selectedIds: [],
      selectionMode: false,
    });
  },

  addError: (error) => {
    set((state) => ({ errors: [...state.errors, error] }));
  },

  clearErrors: () => {
    set({ errors: [] });
  },

  savePredicateState: () => {
    const { predicates, constraints, setOperations } = get();

    const dataset = useAnalysisStore.getState().currentDataset;

    const existingState = loadSessionState(dataset);
    const updatedState = existingState
      ? {
          ...existingState,
          predicates,
          constraints,
          setOperations,
        }
      : {
          selectedNodes: [],
          selectionSource: null,
          activeFilterItems: [],
          activeFilterOperations: {},
          predicates,
          constraints,
          setOperations,
        };

    saveSessionState(dataset, updatedState);
  },

  loadPredicateState: () => {
    try {
      const dataset = useAnalysisStore.getState().currentDataset;
      const state = loadSessionState(dataset);

      if (
        state &&
        (state.predicates || state.constraints || state.setOperations)
      ) {
        set({
          predicates: state.predicates || [],
          constraints: state.constraints || [],
          setOperations: state.setOperations || {},
          evaluation: null,
          errors: [],
        });
        return true;
      }
      return false;
    } catch (error) {
      void error;
      return false;
    }
  },

  clearPredicateState: () => {
    const dataset = useAnalysisStore.getState().currentDataset;

    const existingState = loadSessionState(dataset);
    if (existingState) {
      const updatedState = {
        ...existingState,
        predicates: [],
        constraints: [],
        setOperations: {},
      };
      saveSessionState(dataset, updatedState);
    }
  },
}));

if (typeof window !== "undefined") {
  (
    window as Window & { __predicateStore?: typeof usePredicateStore }
  ).__predicateStore = usePredicateStore;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

usePredicateStore.subscribe((state) => {
  if (
    state.predicates.length === 0 &&
    state.constraints.length === 0 &&
    Object.keys(state.setOperations).length === 0
  ) {
    return;
  }

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    state.savePredicateState();
  }, 1000);
});
