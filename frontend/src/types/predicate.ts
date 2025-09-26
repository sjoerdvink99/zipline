export interface BaseFilterItem {
  id: string;
  description: string;
  nodeTypes?: string[];
}

export interface AttributeFilterItem extends BaseFilterItem {
  type: 'attribute';
  predicate: {
    attribute: string;
    operator: string;
    value: string | number | boolean;
    value2?: string | number;
    node_type?: string;
  };
}

export interface TopologyFilterItem extends BaseFilterItem {
  type: 'topology';
  predicate: {
    attribute: string;
    operator: string;
    value: string | number;
    value2?: string | number;
    node_type?: string;
  };
}

export interface FOLFilterItem extends BaseFilterItem {
  type: 'fol';
  predicate: {
    expression: string;
    description?: string;
  };
}

export type FilterItem = AttributeFilterItem | TopologyFilterItem | FOLFilterItem;

export interface BaseConstraintItem {
  id: string;
  combineOp?: 'and' | 'or';
  sourceFilterId?: string;
  displayText?: string;
}

export interface AttributeConstraintItem extends BaseConstraintItem {
  type: 'attribute';
  attribute: string;
  operator: string;
  value: string | number | boolean;
  node_type?: string;
}

export interface TopologyConstraintItem extends BaseConstraintItem {
  type: 'topology';
  attribute: string;
  operator: string;
  value: string | number;
  node_type?: string;
}

export interface NestedPillConstraintItem extends BaseConstraintItem {
  type: 'nested_pill';
  attribute: string;
  operator: string;
  value: string | number | boolean;
  node_type?: string;
}

export type ConstraintItem = AttributeConstraintItem | TopologyConstraintItem | NestedPillConstraintItem;

export interface NeighborhoodConstraint {
  id: string;
  targetPredicateIds: string[];
  targetType?: 'predicates' | 'constraints' | 'all_predicates'; // New: specify what this constraint applies to
  quantifier: 'ALL' | 'SOME' | 'EXACTLY' | 'AT_LEAST' | 'AT_MOST';
  count?: number;
  relation: 'neighbors' | 'k_hop' | 'connected_components';
  kParameter?: number;
  constraints: ConstraintItem[];
  resultMode: 'primary_only' | 'primary_and_projected';
  projectionVariable?: string;
  level: number;
  parentConstraintId?: string; // New: for nested constraints
  nestedConstraints?: NeighborhoodConstraint[];
}

export interface ProjectionResult {
  primary_nodes: string[];
  projected_relations: Record<string, string[][]>;
  variable_mappings: Record<string, string>;
}

export interface EvaluationResult {
  matching_nodes: string[];
  projections?: ProjectionResult[];
  expression: string;
  is_valid: boolean;
}

export interface ValidationError {
  type: 'syntax' | 'semantic' | 'missing_variable' | 'validation';
  message: string;
  position?: number;
}

export type SetOperation = 'and' | 'or' | 'not';

export type AttributeType = 'boolean' | 'numeric' | 'categorical' | 'array' | 'temporal';

export type SelectionSource = 'topology' | 'attribute' | 'predicate_bridge' | 'umap' | 'schema';

export interface LogicalExpression {
  type: 'predicate' | 'compound';
  operator?: 'and' | 'or' | 'not';
  predicates?: string[];
}