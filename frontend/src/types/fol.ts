export type Quantifier = "∀" | "∃" | "exactly" | "at_least" | "at_most";

export interface EdgeStep {
  edgeType: string;
}

export type Connective = "∧" | "∨" | "¬";

export type Comparator = "=" | "!=" | ">" | ">=" | "<" | "<=";

export interface Variable {
  name: string;
}

export interface UnaryPredicate {
  type: "unary";
  name: string;
  variable: Variable;
}

export interface TypePredicate {
  type: "type";
  typeName: string;
  variable: Variable;
}

export interface ComparisonPredicate {
  type: "comparison";
  attribute: string;
  variable: Variable;
  comparator: Comparator;
  value: string | number | boolean;
}

export interface Conjunction {
  type: "conjunction";
  operands: FOLExpression[];
}

export interface Disjunction {
  type: "disjunction";
  operands: FOLExpression[];
}

export interface Negation {
  type: "negation";
  operand: FOLExpression;
}

export interface NeighborhoodQuantification {
  type: "neighborhood";
  quantifier: Quantifier;
  boundVariable: Variable;
  targetVariable: Variable;
  k: number;
  path?: EdgeStep[];
  body: FOLExpression;
  count?: number;
}

export type FOLExpression =
  | UnaryPredicate
  | TypePredicate
  | ComparisonPredicate
  | Conjunction
  | Disjunction
  | Negation
  | NeighborhoodQuantification;

export interface ResultStructure {
  variables: Variable[];
  predicate: FOLExpression;
}

export interface Binding {
  [variable: string]: string;
}

export interface EvaluationResult {
  matchingNodes: string[];
  bindings: Binding[];
  projections?: ProjectionResult[];
  folExpression: string;
  evaluationTimeMs: number;
  errors: string[];
}

export interface ProjectionResult {
  primaryNode: string;
  projectedVariables: Record<string, string[]>;
  primary_node?: string;
  projected_variables?: Record<string, string[]>;
}

export interface PredicatePill {
  id: string;
  space: "attribute" | "topology";
  expression: FOLExpression;
  displayText: string;
  folString: string;
}

export interface NeighborhoodBlock {
  id: string;
  quantifier: Quantifier;
  count?: number;
  relation: "neighbors" | "k_hop";
  kParameter?: number;
  targetPredicateIds: string[];
  constraints: PredicatePill[];
  resultMode: "primary_only" | "primary_and_projected";
}

export interface QueryCanvas {
  predicates: PredicatePill[];
  connective: Connective;
  neighborhoodBlocks: NeighborhoodBlock[];
  brackets: BracketGroup[];
}

export interface BracketGroup {
  id: string;
  predicateIds: string[];
  connective: Connective;
}

export interface InferredPredicate {
  space: "attribute" | "topology";
  folExpression: string;
  coverage: number;
  selectivity: number;
  qualityScore: number;
  matchingNodes: string[];
}

export interface AttributePredicate extends InferredPredicate {
  space: "attribute";
  attribute: string;
  value: string;
}

export interface TopologyPredicate extends InferredPredicate {
  space: "topology";
  metric: string;
  operator: string;
  threshold: number | string;
}

export interface DescribeResponse {
  selectionSize: number;
  totalNodes: number;
  attributePredicates: AttributePredicate[];
  topologyPredicates: TopologyPredicate[];
}

export interface EvaluateRequest {
  expression: string;
  projectVariables?: string[];
}

export interface EvaluateResponse {
  matchingNodes: string[];
  projections?: ProjectionResult[];
  folExpression: string;
  evaluationTimeMs: number;
  errors: string[];
}

export interface DescribeRequest {
  selectedNodes: string[];
  minCoverage?: number;
  minSelectivity?: number;
}

export type SelectionSource =
  | "topology"
  | "attribute"
  | "predicate_bridge"
  | "schema";

export interface BaseFilterItem {
  id: string;
  description: string;
  nodeTypes?: string[];
}

export interface AttributeFilterItem extends BaseFilterItem {
  type: "attribute";
  predicate: {
    attribute: string;
    operator: string;
    value: string | number | boolean;
    value2?: string | number;
    node_type?: string;
  };
}

export interface TopologyFilterItem extends BaseFilterItem {
  type: "topology";
  predicate: {
    attribute: string;
    operator: string;
    value: string | number;
    value2?: string | number;
    node_type?: string;
  };
}

export interface FOLFilterItem extends BaseFilterItem {
  type: "fol";
  predicate: {
    expression: string;
    description?: string;
  };
}

export type FilterItem =
  | AttributeFilterItem
  | TopologyFilterItem
  | FOLFilterItem;

export interface BaseConstraintItem {
  id: string;
  combineOp?: "and" | "or";
  sourceFilterId?: string;
  displayText?: string;
}

export interface AttributeConstraintItem extends BaseConstraintItem {
  type: "attribute";
  attribute: string;
  operator: string;
  value: string | number | boolean;
  node_type?: string;
}

export interface TopologyConstraintItem extends BaseConstraintItem {
  type: "topology";
  attribute: string;
  operator: string;
  value: string | number;
  node_type?: string;
}

export type ConstraintItem = AttributeConstraintItem | TopologyConstraintItem;

export interface NeighborhoodConstraint {
  id: string;
  targetPredicateIds: string[];
  targetType?: "predicates" | "constraints" | "all_predicates";
  quantifier: "ALL" | "SOME" | "EXACTLY" | "AT_LEAST" | "AT_MOST";
  count?: number;
  relation: "neighbors" | "k_hop" | "typed_path" | "connected_components";
  path?: EdgeStep[];
  kParameter?: number;
  constraints: ConstraintItem[];
  resultMode: "primary_only" | "primary_and_projected";
  projectionVariable?: string;
  level: number;
  parentConstraintId?: string;
  nestedConstraints?: NeighborhoodConstraint[];
}

export interface ValidationError {
  type: "syntax" | "semantic" | "missing_variable" | "validation";
  message: string;
  position?: number;
}

export type SetOperation = "and" | "or" | "not";
