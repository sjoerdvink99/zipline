import api from './client';

export interface HopConstraint {
  id: string;
  hopIndex: number;
  target: "node" | "edge";
  attribute: string;
  operator: string;
  value: string | number | boolean;
  value2?: number;
}

export interface PathQueryParams {
  source: string;
  target: string;
  minHops: number;
  maxHops: number;
  constraints: HopConstraint[];
  combineOp: "AND" | "OR";
  excludeNodes?: string[];
  limit?: number;
}

export interface PathQueryResponse {
  paths: string[][];
  total_count: number;
  matching_nodes: string[];
  source: string;
  target: string;
  message?: string;
}

export interface AttributeInfo {
  type: 'numeric' | 'categorical' | 'boolean' | 'array';
  values: string[];
  examples: string[];
}

export interface GraphSchema {
  node_attributes: Record<string, AttributeInfo>;
  edge_attributes: Record<string, AttributeInfo>;
  topology_attributes: Record<string, AttributeInfo>;
}

export interface NeighborValuesResponse {
  values: string[];
  count: number;
  neighbor_count: number;
}

export interface NeighborConstraintValidation {
  valid: boolean;
  matching_neighbors: number;
  total_neighbors?: number;
  will_have_results: boolean;
  error?: string;
}

export async function findConstrainedPaths(
  params: PathQueryParams
): Promise<PathQueryResponse> {
  const request = {
    source: params.source,
    target: params.target,
    min_hops: params.minHops,
    max_hops: params.maxHops,
    constraints: params.constraints.map((c) => ({
      hop_index: c.hopIndex === -1 ? "any" : c.hopIndex,
      target: c.target,
      attribute: c.attribute,
      operator: c.operator,
      value: c.value,
      value2: c.value2,
    })),
    combine_op: params.combineOp === "AND" ? "intersection" : "union",
    exclude_nodes: params.excludeNodes || [],
    limit: params.limit || 50,
  };

  const { data } = await api.post<PathQueryResponse>(
    "/api/graph/find_paths",
    request
  );
  return data;
}

export async function getGraphSchema(): Promise<GraphSchema> {
  const { data } = await api.get<GraphSchema>("/api/graph/schema");
  return data;
}

export async function getNeighborValues(nodeIds: string[], attribute: string): Promise<NeighborValuesResponse> {
  const { data } = await api.get<NeighborValuesResponse>("/api/graph/neighbor_values", {
    params: {
      node_ids: nodeIds.join(","),
      attribute
    }
  });
  return data;
}

export async function validateNeighborConstraint(
  nodeIds: string[],
  attribute: string,
  operator: string,
  value: string
): Promise<NeighborConstraintValidation> {
  const { data } = await api.get<NeighborConstraintValidation>("/api/graph/validate_neighbor_constraint", {
    params: {
      node_ids: nodeIds.join(","),
      attribute,
      operator,
      value
    }
  });
  return data;
}