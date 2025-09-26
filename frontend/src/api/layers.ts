import api from "../api";

const BASE = "/api/layers";

export interface DistributionBin {
  min: number;
  max: number;
  count: number;
  node_ids: string[];
}

export interface DistributionValue {
  label: string;
  count: number;
  node_ids: string[];
}

export interface NumericDistribution {
  type: "numeric";
  min: number;
  max: number;
  bins: DistributionBin[];
}

export interface CategoricalDistribution {
  type: "categorical";
  values: DistributionValue[];
  total_unique: number;
}

export interface BooleanDistribution {
  type: "boolean";
  values: DistributionValue[];
}

export type AttributeDistribution =
  | NumericDistribution
  | CategoricalDistribution
  | BooleanDistribution;

export interface DistributionsResponse {
  distributions: Record<string, AttributeDistribution>;
}

export async function getDistributions(
  sessionId = "default"
): Promise<DistributionsResponse> {
  const { data } = await api.get<DistributionsResponse>(
    `${BASE}/distributions`,
    { params: { session_id: sessionId } }
  );
  return data;
}

export async function getTopologicalDistributions(
  sessionId = "default"
): Promise<DistributionsResponse> {
  const { data } = await api.get<DistributionsResponse>(`${BASE}/topological`, {
    params: { session_id: sessionId },
  });
  return data;
}

export interface QueryNodesRequest {
  attribute: string;
  attribute_type: "numeric" | "categorical" | "boolean";
  operator: string;
  value: string | number | boolean;
  value2?: number;
  category: "attribute" | "topological";
}

export interface QueryNodesResponse {
  node_ids: string[];
  count: number;
}

export async function queryNodesByPredicate(
  request: QueryNodesRequest,
  sessionId = "default"
): Promise<QueryNodesResponse> {
  const { data } = await api.post<QueryNodesResponse>(
    `${BASE}/query-nodes`,
    request,
    { params: { session_id: sessionId } }
  );
  return data;
}

// Pattern Detection Types
export interface DetectedPattern {
  index: number;
  id: string;
  name: string;
  type: string;
  level: string;
  description: string;
  confidence: number;
  score: number;
  size: number;
  nodes: string[];
  edges: [string, string][];
  features: Record<string, number>;
  center_node: string | null;
  hub_nodes: string[];
  boundary_nodes: string[];
}

export interface PatternDetectionRequest {
  selection_type: "node" | "edge" | "path" | "subgraph";
  selected_ids: string[];
  session_id?: string;
}

export interface PatternDetectionResponse {
  patterns: DetectedPattern[];
}

export async function detectPatterns(
  request: PatternDetectionRequest
): Promise<PatternDetectionResponse> {
  const { data } = await api.post<PatternDetectionResponse>(
    `${BASE}/patterns`,
    {
      selection_type: request.selection_type,
      selected_ids: request.selected_ids,
      session_id: request.session_id || "default",
    }
  );
  return data;
}
