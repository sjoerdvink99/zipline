import api from "./client";

const BASE = "/api/predicates/learn";

export interface LiteralInfo {
  type: string;
  attribute: string;
  operator: string;
  value: string | number | boolean;
  coverage: number;
  precision: number;
}

export interface LearnedPredicate {
  fol_expression: string;
  display_expression: string;
  p: number;
  n: number;
  coverage: number;
  precision: number;
  quality_score: number;
  complexity: number;
  matching_nodes: string[];
  literals: LiteralInfo[];
  clauses: LiteralInfo[][];
  is_disjunction: boolean;
}

export interface LearnPredicateRequest {
  selected_nodes: string[];
  negative_nodes?: string[];
  beam_width?: number;
  max_depth?: number;
  max_predicates?: number;
  min_coverage?: number;
  min_precision?: number;
  coverage_weight?: number;
  precision_weight?: number;
  complexity_weight?: number;
}

export interface LearnPredicateResponse {
  predicates: LearnedPredicate[];
  best_predicate: LearnedPredicate | null;
  learning_time_ms: number;
  selection_size: number;
  total_nodes: number;
  contrast_size?: number;
}

export async function learnPredicate(
  request: LearnPredicateRequest,
): Promise<LearnPredicateResponse> {
  const { data } = await api.post<LearnPredicateResponse>(BASE, request);
  return data;
}

export async function quickLearn(
  selectedNodes: string[],
  contrastNodes?: string[],
): Promise<LearnPredicateResponse> {
  const body: Record<string, unknown> = { selected_nodes: selectedNodes };
  if (contrastNodes && contrastNodes.length > 0) {
    body.contrast_nodes = contrastNodes;
  }
  const { data } = await api.post<LearnPredicateResponse>(`${BASE}/quick`, body);
  return data;
}
