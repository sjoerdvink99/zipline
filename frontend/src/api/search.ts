import api from "./client";

export interface SearchResult {
  node_id: string;
  label: string;
  score: number;
  match_type: string;
  attributes: Record<string, unknown>;
  highlights: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  total_count: number;
  query: string;
  limit: number;
  error?: string;
  active_dataset?: string;
  requested_dataset?: string;
}

export interface SearchRequest {
  query: string;
  limit?: number;
  exact_match?: boolean;
  dataset?: string;
}

export async function searchNodes(request: SearchRequest): Promise<SearchResponse> {
  const { data } = await api.post<SearchResponse>('/api/graph/search', {
    query: request.query,
    limit: request.limit || 10,
    exact_match: request.exact_match || false,
    dataset: request.dataset,
  });

  return data;
}