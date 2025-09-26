import api from "./client";

const BASE = "/api/predicates";


export interface GeneratedPredicate {
  id: string;
  attribute: string;
  operator: string;
  value: string | number | boolean;
  value2?: number;
  match_count: number;
  precision: number;
  recall: number;
  f1_score: number;
  is_structural: boolean;
  attribute_type: "numeric" | "categorical" | "boolean";
  node_type?: string; // Node type constraint from backend
  applicable_node_types?: string[]; // From backend predicate data
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
  threshold: number;
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

export interface SelectionMatch {
  pattern_type: string;
  pattern_id: string;
  jaccard: number;
  precision: number;
  recall: number;
  f1_score: number;
  intersection_size: number;
  selection_size: number;
  pattern_size: number;
  description: string;
  pattern_node_ids: string[];
}



export interface ApplyPredicateSpec {
  attribute: string;
  operator: string;
  value: string | number | boolean;
  value2?: number;
  is_structural: boolean;
  attribute_type: "numeric" | "categorical" | "boolean";
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
  request: ApplyPredicatesRequest
): Promise<ApplyPredicatesResponse> {
  const payload: Record<string, unknown> = {
    predicates: request.predicates,
    combine_op: request.combine_op ?? "and",
    
  };

  if (request.node_type_filter) {
    payload.node_type_filter = request.node_type_filter;
  }

  const { data } = await api.post<ApplyPredicatesResponse>(`${BASE}/apply`, payload);
  return data;
}


export type PatternType = "community" | "component" | "bridge" | "isolate" | "leaf" | "star";

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
  constraint_predicate: Record<string, any>;
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
  primary_nodes: string[];
  projected_relations: Record<string, string[][]>;
  variable_mappings: Record<string, string>;
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

export interface PredicateEvaluationRequest {
  expression: string;
  project_variables?: string[];
}

export interface PredicateEvaluationResponse {
  result: {
    matching_nodes: string[];
    projections?: ProjectionResult[];
  };
  stats: Record<string, number>;
  validation: Record<string, any>;
}

export interface TemplateListResponse {
  templates: Record<string, {
    name: string;
    description: string;
    expression: string;
    domain: string;
  }>;
  domains: string[];
}

export interface DomainPredicate {
  name: string;
  description: string;
  expression: string;
  complexity: string;
}

export interface BiologyPredicatesResponse {
  predicates: Record<string, DomainPredicate & {
    use_cases: string[];
  }>;
  attribute_mappings: Record<string, any>;
  templates: Record<string, string>;
}

export interface CybersecurityPredicatesResponse {
  predicates: Record<string, DomainPredicate & {
    mitre_techniques: string[];
    threat_types: string[];
  }>;
  attribute_mappings: Record<string, any>;
  templates: Record<string, string>;
  threat_profiles: Record<string, any>;
}

export interface EnergyPredicatesResponse {
  predicates: Record<string, DomainPredicate & {
    grid_components: string[];
    reliability_impact: string;
  }>;
  attribute_mappings: Record<string, any>;
  templates: Record<string, string>;
  reliability_metrics: Record<string, any>;
}

export interface PatternFeatures {
  pattern_type: string;
  pattern_id: string;
  node_count: number;
  density: number;
  avg_degree: number;
  avg_clustering: number;
  diameter: number | null;
  attribute_aggregates?: Record<string, string | number>;
}

export interface PatternPredicatesRequest {
  pattern_type: PatternType;
  pattern_id: string;
  pattern_nodes?: string[];
  top_k?: number;
  
}

export interface PatternPredicatesResponse {
  pattern_type: string;
  pattern_id: string;
  pattern_features: PatternFeatures;
  predicates: GeneratedPredicate[];
  predicate_sets: PredicateSet[];
  background_patterns: PatternFeatures[];
  node_predicates: GeneratedPredicate[];
  node_predicate_sets: PredicateSet[];
  diagnostics?: {
    pattern_node_count?: number;
    total_nodes?: number;
    pattern_coverage?: number;
    background_pattern_count?: number;
    pattern_predicate_reason?: string;
    node_predicate_reason?: string;
  };
}

export async function getPatternPredicates(
  request: PatternPredicatesRequest
): Promise<PatternPredicatesResponse> {
  const payload: Record<string, unknown> = {
    pattern_type: request.pattern_type,
    pattern_id: request.pattern_id,
    top_k: request.top_k ?? 10,
    
  };

  if (request.pattern_nodes) {
    payload.pattern_nodes = request.pattern_nodes;
  }

  const { data } = await api.post<PatternPredicatesResponse>(
    `${BASE}/pattern`,
    payload
  );
  return data;
}

export interface TopologyPredicate {
  id: string;
  attribute: string;
  operator: string;
  value: number;
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
  value: any;
  value2?: any;
  attribute_type: "numeric" | "categorical" | "boolean";
  node_type?: string;
  applicable_node_types?: string[];
  description: string;
  applicable_nodes: string[];
}

export interface PatternPredicate {
  id: string;
  pattern_type: string;
  pattern_id?: string;
  description: string;
  node_ids: string[];
  confidence: number;
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
  diagnostics?: Record<string, any>;
}

export async function describeSelection(
  request: DescribeSelectionRequest
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
    payload
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

export interface PatternFilterRequest {
  pattern_type: PatternType;
  pattern_id?: string;
  node_ids?: string[];
  mode?: "exact" | "similar";
  similarity_threshold?: number;
  feature_weights?: {
    size: number;
    density: number;
    attributes: number;
  };
  
}

export interface SimilarPattern {
  pattern_type: string;
  pattern_id: string;
  node_ids: string[];
  similarity_score: number;
  features: PatternFeatures;
}

export interface PatternFilterResponse {
  matching_patterns?: SimilarPattern[];
  total_matching_nodes: string[];
  count: number;
}

export async function applyPatternFilter(
  request: PatternFilterRequest
): Promise<PatternFilterResponse> {
  const payload: Record<string, unknown> = {
    pattern_type: request.pattern_type,
    mode: request.mode ?? "exact",
    
  };

  if (request.pattern_id) {
    payload.pattern_id = request.pattern_id;
  }

  if (request.node_ids) {
    payload.node_ids = request.node_ids;
  }

  if (request.mode === "similar") {
    payload.similarity_threshold = request.similarity_threshold ?? 0.7;
    payload.feature_weights = request.feature_weights ?? {
      size: 0.3,
      density: 0.3,
      attributes: 0.4,
    };
  }

  const { data } = await api.post<PatternFilterResponse>(`${BASE}/filter-by-pattern`, payload);
  return data;
}


export async function applyPredicateFilter(
  request: FilterRequest
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
      result = Array.from(firstSet).filter(nodeId =>
        nodeSets.every(nodeSet => nodeSet.has(nodeId))
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
  _sessionId: string = "default"
): Promise<CrossSpacePredicateResponse> {
  const { data } = await api.post<CrossSpacePredicateResponse>(
    `${BASE}/cross-space/evaluate`,
    request
  );
  return data;
}

export async function evaluateTemplatePredicate(
  request: TemplatePredicateRequest,
  _sessionId: string = "default"
): Promise<CrossSpacePredicateResponse> {
  const { data } = await api.post<CrossSpacePredicateResponse>(
    `${BASE}/cross-space/template`,
    request
  );
  return data;
}

export async function evaluateNeighborhoodPredicate(
  request: NeighborhoodPredicateWithFiltersRequest,
  _sessionId: string = "default"
): Promise<CrossSpacePredicateResponse> {
  const { data } = await api.post<CrossSpacePredicateResponse>(
    `${BASE}/cross-space/neighborhood`,
    request
  );
  return data;
}

export async function getPredicateTemplates(
  domain?: string
): Promise<TemplateListResponse> {
  const url = domain ? `${BASE}/cross-space/templates?domain=${domain}` : `${BASE}/cross-space/templates`;
  const { data } = await api.get<TemplateListResponse>(url);
  return data;
}

export async function validateFOLExpression(
  expression: string,
  _sessionId: string = "default"
): Promise<any> {
  const { data } = await api.post(`${BASE}/cross-space/validate`, {
    expression
  });
  return data;
}

export async function getBiologyPredicates(): Promise<BiologyPredicatesResponse> {
  const { data } = await api.get<BiologyPredicatesResponse>(`${BASE}/domains/biology/predicates`);
  return data;
}

export async function getCybersecurityPredicates(): Promise<CybersecurityPredicatesResponse> {
  const { data } = await api.get<CybersecurityPredicatesResponse>(`${BASE}/domains/cybersecurity/predicates`);
  return data;
}

export async function getEnergyPredicates(): Promise<EnergyPredicatesResponse> {
  const { data } = await api.get<EnergyPredicatesResponse>(`${BASE}/domains/energy/predicates`);
  return data;
}

export async function evaluatePredicateWithProjection(
  request: PredicateEvaluationRequest,
  _sessionId: string = "default"
): Promise<PredicateEvaluationResponse> {
  const { data } = await api.post<PredicateEvaluationResponse>(
    `${BASE}/evaluate-with-projection`,
    request
  );
  return data;
}

export async function inferSelectionPredicates(
  request: SelectionPredicateRequest
): Promise<SelectionPredicateResponse> {
  const { data } = await api.post<SelectionPredicateResponse>(
    `${BASE}/infer-selection-predicates`,
    request
  );
  return data;
}

