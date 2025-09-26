export type SelectionKind = "node" | "edge" | "path" | "subgraph";

export interface PropertyNode {
  id: string;
  label: string;
  attributes: Record<string, unknown>;
}

export interface PropertyEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  attributes: Record<string, unknown>;
}

export interface BackendNode {
  data: {
    id: string;
    label: string;
    [key: string]: unknown;
  };
  position?: { x: number; y: number };
}

export interface BackendEdge {
  data: {
    id: string;
    source: string;
    target: string;
    label: string;
    [key: string]: unknown;
  };
}

export interface D3Node {
  id: string;
  label: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  [key: string]: unknown;
}

export interface D3Edge {
  id: string;
  source: string | D3Node;
  target: string | D3Node;
  label: string;
  [key: string]: unknown;
}

export function toD3Node(backend: BackendNode): D3Node {
  const { id, label, ...rest } = backend.data;
  return {
    id,
    label: label || id,
    x: backend.position?.x,
    y: backend.position?.y,
    ...rest,
  };
}

export function toD3Edge(backend: BackendEdge): D3Edge {
  const { id, source, target, label, ...rest } = backend.data;
  return {
    id,
    source,
    target,
    label: label || "",
    ...rest,
  };
}
