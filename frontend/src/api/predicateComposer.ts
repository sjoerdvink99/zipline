import type { NeighborhoodBlock } from '../components/predicate-builder/constraints/NeighborhoodConstraintBlock';

export interface CompositePredicateRequest {
  predicates: Array<{
    type: 'topology' | 'attribute' | 'fol';
    predicate: any;
  }>;
  logical_structure: {
    type: 'compound';
    operator: 'and' | 'or' | 'not';
    predicates: string[];
  };
  neighborhood_constraints: NeighborhoodBlock[];
  projection_settings?: {
    enabled: boolean;
    variables: Array<{
      name: string;
      type: 'neighbor' | 'witness';
    }>;
  };
}

export interface CompositePredicateResponse {
  expression: string;
  matching_nodes: string[];
  projections?: Array<{
    primary_node: string;
    projected_variables: Record<string, string[]>;
  }>;
  evaluation_time: number;
  is_valid: boolean;
  validation_errors?: Array<{
    type: string;
    message: string;
    position?: number;
  }>;
}

export interface PredicateValidationRequest {
  expression: string;
  context?: {
    available_attributes: string[];
    available_node_types: string[];
  };
}

export interface PredicateValidationResponse {
  is_valid: boolean;
  errors: Array<{
    type: 'syntax' | 'semantic' | 'missing_variable';
    message: string;
    position?: number;
  }>;
  suggestions?: Array<{
    text: string;
    type: 'completion' | 'correction';
  }>;
}

export interface PredicateSuggestionsRequest {
  partial_expression?: string;
  context: {
    current_predicates: string[];
    available_attributes: string[];
    node_types: string[];
  };
}

export interface PredicateSuggestionsResponse {
  suggestions: Array<{
    text: string;
    description: string;
    type: 'predicate' | 'operator' | 'quantifier' | 'relation';
    category: string;
    priority: number;
  }>;
}

export async function evaluateCompositePredicate(
  request: CompositePredicateRequest
): Promise<CompositePredicateResponse> {
  const response = await fetch('/api/predicates/compose', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to evaluate composite predicate: ${response.statusText}`);
  }

  return response.json();
}

export async function validatePredicate(
  request: PredicateValidationRequest
): Promise<PredicateValidationResponse> {
  const response = await fetch('/api/predicates/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to validate predicate: ${response.statusText}`);
  }

  return response.json();
}

export async function getPredicateSuggestions(
  request: PredicateSuggestionsRequest,
  _sessionId: string = 'default'
): Promise<PredicateSuggestionsResponse> {
  const response = await fetch('/api/predicates/suggestions', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get predicate suggestions: ${response.statusText}`);
  }

  return response.json();
}

export function serializeNeighborhoodBlock(block: NeighborhoodBlock): any {
  return {
    id: block.id,
    target_predicate_ids: block.targetPredicateIds,
    quantifier: block.quantifier,
    count: block.count,
    relation: block.relation,
    k_parameter: block.kParameter,
    constraint_type: block.constraint.type,
    constraint_predicate: {
      attribute: block.constraint.attribute,
      operator: block.constraint.operator,
      value: block.constraint.value,
    },
    result_mode: block.resultMode,
    projection_variable: block.projectionVariable,
  };
}

export function deserializeNeighborhoodBlock(data: any): NeighborhoodBlock {
  return {
    id: data.id,
    targetPredicateIds: data.target_predicate_ids || [],
    quantifier: data.quantifier || 'ALL',
    count: data.count,
    relation: data.relation || 'neighbors',
    kParameter: data.k_parameter,
    constraint: {
      type: data.constraint_type || 'attribute',
      attribute: data.constraint_predicate?.attribute || '',
      operator: data.constraint_predicate?.operator || '=',
      value: data.constraint_predicate?.value || '',
    },
    resultMode: data.result_mode || 'primary_only',
    projectionVariable: data.projection_variable,
  };
}