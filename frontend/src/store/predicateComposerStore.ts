import { create } from 'zustand';
import type { NeighborhoodBlock } from '../components/predicate-builder/constraints/NeighborhoodConstraintBlock';
import {
  evaluateCompositePredicate,
  serializeNeighborhoodBlock,
  type CompositePredicateRequest,
  type CompositePredicateResponse
} from '../api/predicateComposer';

interface FilterItem {
  id: string;
  type: 'topology' | 'attribute' | 'fol';
  predicate: any;
  description: string;
  nodeTypes?: string[];
}

export interface LogicalExpression {
  type: 'predicate' | 'compound';
  operator?: 'and' | 'or' | 'not';
  predicates?: string[];
  children?: LogicalExpression[];
}

export interface ProjectionVariable {
  name: string;
  type: 'neighbor' | 'witness';
  enabled: boolean;
}

export interface ProjectionResult {
  primary_nodes: string[];
  projected_relations: Record<string, string[]>;
  variable_mappings: Record<string, any>;
}

export interface DragState {
  isDragging: boolean;
  draggedItem: FilterItem | null;
  dropZoneId: string | null;
}

export interface ValidationError {
  type: 'syntax' | 'semantic' | 'missing_variable';
  message: string;
  position?: number;
}

export interface EvaluationResult {
  matching_nodes: string[];
  projections?: ProjectionResult[];
  expression: string;
  is_valid: boolean;
}

interface PredicateComposerState {
  queryCanvas: {
    predicates: FilterItem[];
    logicalStructure: LogicalExpression;
    neighbourhoodConstraints: NeighborhoodBlock[];
  };

  projection: {
    enabled: boolean;
    variables: ProjectionVariable[];
    results: ProjectionResult[];
  };

  ui: {
    dragState: DragState;
    hoveredElements: string[];
    validationErrors: ValidationError[];
    isEvaluating: boolean;
  };

  currentEvaluation: EvaluationResult | null;

  addPredicate: (predicate: FilterItem) => void;
  removePredicate: (predicateId: string) => void;
  updatePredicate: (predicateId: string, updates: Partial<FilterItem>) => void;
  reorderPredicates: (fromIndex: number, toIndex: number) => void;

  addNeighborhoodConstraint: (constraint: NeighborhoodBlock) => void;
  updateNeighborhoodConstraint: (constraintId: string, updates: Partial<NeighborhoodBlock>) => void;
  removeNeighborhoodConstraint: (constraintId: string) => void;

  setLogicalOperator: (operator: 'and' | 'or' | 'not') => void;
  updateLogicalStructure: (structure: LogicalExpression) => void;

  toggleProjection: (variable: string) => void;
  addProjectionVariable: (variable: ProjectionVariable) => void;
  removeProjectionVariable: (variableName: string) => void;

  setDragState: (state: Partial<DragState>) => void;
  setHoveredElements: (elements: string[]) => void;
  addValidationError: (error: ValidationError) => void;
  clearValidationErrors: () => void;

  evaluateExpression: () => Promise<void>;
  clearEvaluation: () => void;

  reset: () => void;
}

function generateUniqueId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const initialState = {
  queryCanvas: {
    predicates: [] as FilterItem[],
    logicalStructure: { type: 'compound', operator: 'and', predicates: [] } as LogicalExpression,
    neighbourhoodConstraints: [] as NeighborhoodBlock[],
  },

  projection: {
    enabled: false,
    variables: [] as ProjectionVariable[],
    results: [] as ProjectionResult[],
  },

  ui: {
    dragState: {
      isDragging: false,
      draggedItem: null,
      dropZoneId: null,
    },
    hoveredElements: [] as string[],
    validationErrors: [] as ValidationError[],
    isEvaluating: false,
  },

  currentEvaluation: null as EvaluationResult | null,
};

export const usePredicateComposerStore = create<PredicateComposerState>((set, get) => ({
  ...initialState,

  addPredicate: (predicate) => {
    const { queryCanvas } = get();
    const updatedPredicates = [...queryCanvas.predicates, predicate];
    const updatedStructure = {
      ...queryCanvas.logicalStructure,
      predicates: updatedPredicates.map(p => p.id),
    };

    set({
      queryCanvas: {
        ...queryCanvas,
        predicates: updatedPredicates,
        logicalStructure: updatedStructure,
      },
    });

    get().evaluateExpression();
  },

  removePredicate: (predicateId) => {
    const { queryCanvas } = get();
    const updatedPredicates = queryCanvas.predicates.filter(p => p.id !== predicateId);

    const updatedConstraints = queryCanvas.neighbourhoodConstraints.map(constraint => ({
      ...constraint,
      targetPredicateIds: constraint.targetPredicateIds.filter(id => id !== predicateId),
    })).filter(constraint => constraint.targetPredicateIds.length > 0);

    const updatedStructure = {
      ...queryCanvas.logicalStructure,
      predicates: updatedPredicates.map(p => p.id),
    };

    set({
      queryCanvas: {
        ...queryCanvas,
        predicates: updatedPredicates,
        neighbourhoodConstraints: updatedConstraints,
        logicalStructure: updatedStructure,
      },
    });

    if (updatedPredicates.length > 0) {
      get().evaluateExpression();
    } else {
      get().clearEvaluation();
    }
  },

  updatePredicate: (predicateId, updates) => {
    const { queryCanvas } = get();
    const updatedPredicates = queryCanvas.predicates.map(p =>
      p.id === predicateId ? { ...p, ...updates } : p
    );

    set({
      queryCanvas: {
        ...queryCanvas,
        predicates: updatedPredicates,
      },
    });

    get().evaluateExpression();
  },

  reorderPredicates: (fromIndex, toIndex) => {
    const { queryCanvas } = get();
    const updatedPredicates = [...queryCanvas.predicates];
    const [removed] = updatedPredicates.splice(fromIndex, 1);
    updatedPredicates.splice(toIndex, 0, removed);

    set({
      queryCanvas: {
        ...queryCanvas,
        predicates: updatedPredicates,
      },
    });
  },

  addNeighborhoodConstraint: (constraint) => {
    const { queryCanvas } = get();
    const constraintWithId = {
      ...constraint,
      id: constraint.id || generateUniqueId(),
    };

    set({
      queryCanvas: {
        ...queryCanvas,
        neighbourhoodConstraints: [...queryCanvas.neighbourhoodConstraints, constraintWithId],
      },
    });

    get().evaluateExpression();
  },

  updateNeighborhoodConstraint: (constraintId, updates) => {
    const { queryCanvas } = get();
    const updatedConstraints = queryCanvas.neighbourhoodConstraints.map(c =>
      c.id === constraintId ? { ...c, ...updates } : c
    );

    set({
      queryCanvas: {
        ...queryCanvas,
        neighbourhoodConstraints: updatedConstraints,
      },
    });

    get().evaluateExpression();
  },

  removeNeighborhoodConstraint: (constraintId) => {
    const { queryCanvas } = get();
    const updatedConstraints = queryCanvas.neighbourhoodConstraints.filter(c => c.id !== constraintId);

    set({
      queryCanvas: {
        ...queryCanvas,
        neighbourhoodConstraints: updatedConstraints,
      },
    });

    get().evaluateExpression();
  },

  setLogicalOperator: (operator) => {
    const { queryCanvas } = get();
    const updatedStructure = {
      ...queryCanvas.logicalStructure,
      operator,
    };

    set({
      queryCanvas: {
        ...queryCanvas,
        logicalStructure: updatedStructure,
      },
    });

    get().evaluateExpression();
  },

  updateLogicalStructure: (structure) => {
    const { queryCanvas } = get();
    set({
      queryCanvas: {
        ...queryCanvas,
        logicalStructure: structure,
      },
    });

    get().evaluateExpression();
  },

  toggleProjection: (variable) => {
    const { projection } = get();
    const updatedVariables = projection.variables.map(v =>
      v.name === variable ? { ...v, enabled: !v.enabled } : v
    );

    set({
      projection: {
        ...projection,
        enabled: updatedVariables.some(v => v.enabled),
        variables: updatedVariables,
      },
    });

    get().evaluateExpression();
  },

  addProjectionVariable: (variable) => {
    const { projection } = get();
    const exists = projection.variables.some(v => v.name === variable.name);
    if (exists) return;

    const updatedVariables = [...projection.variables, variable];
    set({
      projection: {
        ...projection,
        variables: updatedVariables,
        enabled: updatedVariables.some(v => v.enabled),
      },
    });
  },

  removeProjectionVariable: (variableName) => {
    const { projection } = get();
    const updatedVariables = projection.variables.filter(v => v.name !== variableName);

    set({
      projection: {
        ...projection,
        variables: updatedVariables,
        enabled: updatedVariables.some(v => v.enabled),
      },
    });

    get().evaluateExpression();
  },

  setDragState: (state) => {
    const { ui } = get();
    set({
      ui: {
        ...ui,
        dragState: { ...ui.dragState, ...state },
      },
    });
  },

  setHoveredElements: (elements) => {
    const { ui } = get();
    set({
      ui: {
        ...ui,
        hoveredElements: elements,
      },
    });
  },

  addValidationError: (error) => {
    const { ui } = get();
    set({
      ui: {
        ...ui,
        validationErrors: [...ui.validationErrors, error],
      },
    });
  },

  clearValidationErrors: () => {
    const { ui } = get();
    set({
      ui: {
        ...ui,
        validationErrors: [],
      },
    });
  },

  evaluateExpression: async () => {
    const { queryCanvas, projection, ui } = get();

    if (queryCanvas.predicates.length === 0) {
      get().clearEvaluation();
      return;
    }

    set({
      ui: { ...ui, isEvaluating: true },
    });

    get().clearValidationErrors();

    try {
      const request: CompositePredicateRequest = {
        predicates: queryCanvas.predicates.map(predicate => ({
          type: predicate.type,
          predicate: predicate.predicate,
        })),
        logical_structure: queryCanvas.logicalStructure,
        neighborhood_constraints: queryCanvas.neighbourhoodConstraints.map(serializeNeighborhoodBlock),
        projection_settings: projection.enabled ? {
          enabled: true,
          variables: projection.variables.filter(v => v.enabled),
        } : undefined,
      };

      const response: CompositePredicateResponse = await evaluateCompositePredicate(request);

      const result: EvaluationResult = {
        matching_nodes: response.matching_nodes,
        expression: response.expression,
        is_valid: response.is_valid,
        projections: response.projections,
      };

      set({ currentEvaluation: result });

      if (response.validation_errors) {
        response.validation_errors.forEach(error => {
          get().addValidationError({
            type: error.type as any,
            message: error.message,
            position: error.position,
          });
        });
      }

    } catch (error) {
      console.error('Failed to evaluate expression:', error);

      const mockResult: EvaluationResult = {
        matching_nodes: Array.from({ length: Math.floor(Math.random() * 100) + 10 },
          (_, i) => `node_${i}`),
        expression: `${queryCanvas.predicates.length} predicates with ${queryCanvas.neighbourhoodConstraints.length} constraints`,
        is_valid: true,
        projections: projection.enabled ? [{
          primary_node: 'mock_primary',
          projected_variables: {
            neighbor: Array.from({ length: Math.floor(Math.random() * 10) + 3 },
              (_, i) => `neighbor_${i}`),
          },
        }] : undefined,
      };

      set({ currentEvaluation: mockResult });

      get().addValidationError({
        type: 'semantic',
        message: 'Using mock data - API connection failed',
      });
    } finally {
      set({
        ui: { ...get().ui, isEvaluating: false },
      });
    }
  },

  clearEvaluation: () => {
    set({ currentEvaluation: null });
  },

  reset: () => {
    set(initialState);
  },
}));