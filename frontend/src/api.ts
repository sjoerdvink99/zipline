import axios from "axios";

const env = import.meta.env?.VITE_API_URL as string | undefined;

function guessBase(): string {
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:5178`;
}

const baseURL = env && env.trim().length > 0 ? env : guessBase();

export function isAbortedRequest(err: unknown): boolean {
  if (axios.isCancel(err)) return true;
  const code = (err as { code?: string })?.code;
  return code === "ECONNABORTED" || code === "ERR_CANCELED";
}

const api = axios.create({
  baseURL,
  withCredentials: false,
  timeout: 60000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (isAbortedRequest(err)) {
      return Promise.reject(err);
    }
    const msg =
      err?.response?.data?.detail ||
      err?.message ||
      "Network Error (API unreachable)";
    console.warn("[api] error:", msg);
    return Promise.reject(err);
  }
);

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

export default api;
