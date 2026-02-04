import api from "./client";

const BASE = "/api/predicates";

export interface GeneratedPredicate {
  id: string;
  attribute: string;
  operator: string;
  value: string | number | boolean;
  value2?: string | number;
  match_count: number;
  precision: number;
  recall: number;
  f1_score: number;
  is_structural: boolean;
  attribute_type: "numeric" | "categorical" | "boolean" | "temporal";
  node_type?: string;
  applicable_node_types?: string[];
  label_scope?: string | string[];
}

export interface InferredPredicate {
  space: "attribute" | "topology";
  fol_expression: string;
  coverage: number;
  selectivity: number;
  quality_score: number;
  matching_nodes: string[];
}

export interface InferredAttributePredicate extends InferredPredicate {
  space: "attribute";
  attribute: string;
  operator: string;
  value: string | number | boolean;
}

export interface InferredTopologyPredicate extends InferredPredicate {
  space: "topology";
  metric: string;
  operator: string;
  threshold: number | string;
}

export interface SelectionPredicateRequest {
  selected_nodes: string[];
  include_cross_space?: boolean;
  max_predicates_per_type?: number;
  min_coverage?: number;
  min_selectivity?: number;
}

export interface SelectionPredicateResponse {
  attribute_predicates: InferredAttributePredicate[];
  topology_predicates: InferredTopologyPredicate[];
  selection_size: number;
  total_predicates: number;
}

export interface PredicateSet {
  id: string;
  predicates: GeneratedPredicate[];
  combine_op: "and" | "or";
  match_count: number;
  precision: number;
  recall: number;
  f1_score: number;
}


export interface ApplyPredicateSpec {
  attribute: string;
  operator: string;
  value: string | number | boolean;
  value2?: string | number;
  is_structural: boolean;
  attribute_type: "numeric" | "categorical" | "boolean" | "temporal";
  label_scope?: string | string[];
  node_type?: string;
}

export interface ApplyPredicatesRequest {
  predicates: ApplyPredicateSpec[];
  combine_op?: "and" | "or";
  node_type_filter?: string;
}

export interface ApplyPredicatesResponse {
  matching_node_ids: string[];
  count: number;
}

export async function applyPredicates(
  request: ApplyPredicatesRequest,
): Promise<ApplyPredicatesResponse> {
  const payload: Record<string, unknown> = {
    predicates: request.predicates,
    combine_op: request.combine_op ?? "and",
  };

  if (request.node_type_filter) {
    payload.node_type_filter = request.node_type_filter;
  }

  const { data } = await api.post<ApplyPredicatesResponse>(
    `${BASE}/apply`,
    payload,
  );
  return data;
}

export type PatternType =
  | "community"
  | "component"
  | "bridge"
  | "isolate"
  | "leaf"
  | "star";

export interface CrossSpacePredicateRequest {
  expression: string;
  description?: string;
  project_variables?: string[];
}

export interface NeighborhoodPredicateRequest {
  quantifier: "ALL" | "SOME" | "EXACTLY" | "AT_LEAST" | "AT_MOST";
  quantifier_count?: number;
  relation: "neighbors" | "k_hop" | "connected_components";
  k_parameter?: number;
  target_variable: string;
  constraint_type: "attribute" | "topology";
  constraint_predicate: Record<string, string | number | boolean>;
  starting_filters: string[];
}

export interface NeighborhoodPredicateWithFiltersRequest {
  neighborhood_request: NeighborhoodPredicateRequest;
  starting_filter_results: Record<string, string[]>;
}

export interface TemplatePredicateRequest {
  template_key: string;
  domain?: string;
}

export interface FOLFilterRequest {
  type: "fol";
  expression?: string;
  template_key?: string;
  neighborhood_config?: NeighborhoodPredicateRequest;
}

export interface ProjectionResult {
  primary_node: string;
  projected_variables: Record<string, string[]>;
}

export interface CrossSpacePredicateResponse {
  id: string;
  expression: string;
  description: string;
  matching_nodes: string[];
  projections?: ProjectionResult[];
  evaluation_stats: {
    total_evaluated: number;
    cache_hits: number;
    cache_misses: number;
    evaluation_time_ms: number;
    nodes_matched: number;
  };
  validation_result: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

export interface TemplateListResponse {
  templates: Record<
    string,
    {
      name: string;
      description: string;
      expression: string;
      domain: string;
    }
  >;
  domains: string[];
}





export interface TopologyPredicate {
  id: string;
  attribute: string;
  operator: string;
  value: number | string;
  value2?: number;
  node_type?: string;
  applicable_node_types?: string[];
  description: string;
  applicable_nodes: string[];
}

export interface AttributePredicate {
  id: string;
  attribute: string;
  operator: string;
  value: string | number | boolean;
  value2?: string | number;
  attribute_type: "numeric" | "categorical" | "boolean";
  node_type?: string;
  applicable_node_types?: string[];
  description: string;
  applicable_nodes: string[];
}


export interface DescribeSelectionRequest {
  selected_ids: string[];
  spaces?: ("topology" | "attribute")[];
  node_type_filter?: string;
}

export interface DescribeSelectionResponse {
  selection_count: number;
  total_nodes: number;
  node_type_distribution: Record<string, number>;
  topology_predicates: TopologyPredicate[];
  attribute_predicates: AttributePredicate[];
  diagnostics?: Record<string, string | number | boolean>;
}

export async function describeSelection(
  request: DescribeSelectionRequest,
): Promise<DescribeSelectionResponse> {
  const payload: Record<string, unknown> = {
    selected_ids: request.selected_ids,
    spaces: request.spaces ?? ["topology", "attribute"],
  };

  if (request.node_type_filter) {
    payload.node_type_filter = request.node_type_filter;
  }

  const { data } = await api.post<DescribeSelectionResponse>(
    `${BASE}/describe`,
    payload,
  );
  return data;
}

export interface FilterRequest {
  predicates: Array<{
    type: "topology" | "attribute";
    predicate: TopologyPredicate | AttributePredicate;
  }>;
  operator: "and" | "or";
}

export interface FilterResponse {
  matching_node_ids: string[];
  count: number;
}

export async function applyPredicateFilter(
  request: FilterRequest,
): Promise<FilterResponse> {
  if (request.predicates.length === 0) {
    return {
      matching_node_ids: [],
      count: 0,
    };
  }

  const nodeSets: Set<string>[] = [];

  for (const item of request.predicates) {
    let nodeSet: Set<string>;

    if (item.type === "topology") {
      const pred = item.predicate as TopologyPredicate;
      nodeSet = new Set(pred.applicable_nodes || []);
    } else if (item.type === "attribute") {
      const pred = item.predicate as AttributePredicate;
      nodeSet = new Set(pred.applicable_nodes || []);
    } else {
      nodeSet = new Set();
    }

    nodeSets.push(nodeSet);
  }

  let result: string[];

  if (request.operator === "and") {
    if (nodeSets.length === 0) {
      result = [];
    } else if (nodeSets.length === 1) {
      result = Array.from(nodeSets[0]);
    } else {
      const firstSet = nodeSets[0];
      result = Array.from(firstSet).filter((nodeId) =>
        nodeSets.every((nodeSet) => nodeSet.has(nodeId)),
      );
    }
  } else {
    const combined = new Set<string>();
    for (const nodeSet of nodeSets) {
      for (const nodeId of nodeSet) {
        combined.add(nodeId);
      }
    }
    result = Array.from(combined);
  }

  return {
    matching_node_ids: result,
    count: result.length,
  };
}

export async function evaluateCrossSpacePredicate(
  request: CrossSpacePredicateRequest,
): Promise<CrossSpacePredicateResponse> {
  const { data } = await api.post<CrossSpacePredicateResponse>(
    `${BASE}/cross-space/evaluate`,
    request,
  );
  return data;
}

export async function evaluateTemplatePredicate(
  request: TemplatePredicateRequest,
): Promise<CrossSpacePredicateResponse> {
  const { data } = await api.post<CrossSpacePredicateResponse>(
    `${BASE}/cross-space/template`,
    request,
  );
  return data;
}

export async function evaluateNeighborhoodPredicate(
  request: NeighborhoodPredicateWithFiltersRequest,
): Promise<CrossSpacePredicateResponse> {
  const { data } = await api.post<CrossSpacePredicateResponse>(
    `${BASE}/cross-space/neighborhood`,
    request,
  );
  return data;
}

export async function getPredicateTemplates(
  domain?: string,
): Promise<TemplateListResponse> {
  const url = domain
    ? `${BASE}/cross-space/templates?domain=${domain}`
    : `${BASE}/cross-space/templates`;
  const { data } = await api.get<TemplateListResponse>(url);
  return data;
}

export async function validateFOLExpression(
  expression: string,
): Promise<{ valid: boolean; errors: string[] }> {
  const { data } = await api.post<{ valid: boolean; errors: string[] }>(
    `${BASE}/cross-space/validate`,
    {
      expression,
    },
  );
  return data;
}

export async function inferSelectionPredicates(
  request: SelectionPredicateRequest,
): Promise<SelectionPredicateResponse> {
  const { data } = await api.post<SelectionPredicateResponse>(
    `${BASE}/infer-selection-predicates`,
    request,
  );
  return data;
}
