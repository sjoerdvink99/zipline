import api from "./client";
import type {
  EvaluateRequest,
  EvaluateResponse,
  DescribeRequest,
  DescribeResponse,
  AttributePredicate,
  TopologyPredicate,
  ProjectionResult,
} from "../types/fol";

const BASE = "/api/predicates";

export interface EvaluateFOLRequest {
  expression: string;
  project_variables?: string[];
}

export interface EvaluateFOLResponse {
  matching_nodes: string[];
  count: number;
  projections?: Array<{
    primary_node: string;
    [key: string]: string | string[];
  }>;
  fol_expression: string;
  evaluation_time_ms: number;
  errors: string[];
}

export interface DescribeSelectionRequest {
  selected_nodes: string[];
  min_coverage?: number;
  min_selectivity?: number;
}

export interface DescribeSelectionResponse {
  selection_size: number;
  total_nodes: number;
  attribute_predicates: Array<{
    attribute: string;
    value: string;
    fol_expression: string;
    coverage: number;
    selectivity: number;
    quality_score: number;
    matching_nodes: string[];
  }>;
  topology_predicates: Array<{
    metric: string;
    operator: string;
    threshold: number | string;
    fol_expression: string;
    coverage: number;
    selectivity: number;
    quality_score: number;
    matching_nodes: string[];
  }>;
}

export interface ApplyPredicateSpec {
  attribute: string;
  operator: string;
  value: string | number | boolean;
  is_structural?: boolean;
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

export interface LiftedPredicatesResponse {
  predicates: Record<string, string[]>;
}

export async function evaluateFOL(
  request: EvaluateFOLRequest,
): Promise<EvaluateFOLResponse> {
  const { data } = await api.post<EvaluateFOLResponse>(
    `${BASE}/evaluate-fol`,
    request,
  );
  return data;
}

export async function evaluate(
  expression: string,
  projectVariables?: string[],
): Promise<EvaluateResponse> {
  const response = await evaluateFOL({
    expression,
    project_variables: projectVariables,
  });

  const projections: ProjectionResult[] | undefined = response.projections?.map(
    (p) => ({
      primaryNode: p.primary_node,
      projectedVariables: Object.fromEntries(
        Object.entries(p).filter(([k]) => k !== "primary_node"),
      ) as Record<string, string[]>,
    }),
  );

  return {
    matchingNodes: response.matching_nodes,
    projections,
    folExpression: response.fol_expression,
    evaluationTimeMs: response.evaluation_time_ms,
    errors: response.errors,
  };
}

export async function describeSelection(
  selectedNodes: string[],
  minCoverage = 0.6,
  minSelectivity = 0.1,
): Promise<DescribeResponse> {
  const { data } = await api.post<DescribeSelectionResponse>(
    `${BASE}/describe`,
    {
      selected_nodes: selectedNodes,
      min_coverage: minCoverage,
      min_selectivity: minSelectivity,
    },
  );

  return {
    selectionSize: data.selection_size,
    totalNodes: data.total_nodes,
    attributePredicates: data.attribute_predicates.map((p) => ({
      space: "attribute" as const,
      attribute: p.attribute,
      value: p.value,
      folExpression: p.fol_expression,
      coverage: p.coverage,
      selectivity: p.selectivity,
      qualityScore: p.quality_score,
      matchingNodes: p.matching_nodes,
    })),
    topologyPredicates: data.topology_predicates.map((p) => ({
      space: "topology" as const,
      metric: p.metric,
      operator: p.operator,
      threshold: p.threshold,
      folExpression: p.fol_expression,
      coverage: p.coverage,
      selectivity: p.selectivity,
      qualityScore: p.quality_score,
      matchingNodes: p.matching_nodes,
    })),
  };
}

export async function applyPredicates(
  request: ApplyPredicatesRequest,
): Promise<ApplyPredicatesResponse> {
  const { data } = await api.post<ApplyPredicatesResponse>(
    `${BASE}/apply`,
    request,
  );
  return data;
}

export async function getLiftedPredicates(): Promise<LiftedPredicatesResponse> {
  const { data } = await api.get<LiftedPredicatesResponse>(`${BASE}/lifted`);
  return data;
}

export type {
  EvaluateRequest,
  EvaluateResponse,
  DescribeRequest,
  DescribeResponse,
  AttributePredicate,
  TopologyPredicate,
  ProjectionResult,
};
