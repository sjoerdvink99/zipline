import { create } from "zustand";
import { api, isAbortedRequest } from "../api";
import type { D3Node, D3Edge, BackendNode, BackendEdge } from "../types";
import { getNodeType, NODE_TYPE_COLORS } from "../config/pixiColors";

function getId(x: string | D3Node): string {
  return typeof x === "string" ? x : x.id;
}

interface GraphDataState {
  nodes: D3Node[];
  edges: D3Edge[];
  nodeIndex: Map<string, D3Node>;
  adjacencyMap: Map<string, Set<string>>;
  legendData: Array<{ type: string; color: number; count: number }>;
  numericAttributes: string[];
  loading: boolean;
  graphHash: string;
  isLayoutComplete: boolean;
  savedViewport: { x: number; y: number; k: number } | null;

  fetchElements: (signal?: AbortSignal) => Promise<void>;
  setLayoutComplete: (hash: string, complete: boolean) => void;
  setSavedViewport: (transform: { x: number; y: number; k: number } | null) => void;
  reset: () => void;
}

let _abortController: AbortController | null = null;

export const useGraphDataStore = create<GraphDataState>((set) => ({
  nodes: [],
  edges: [],
  nodeIndex: new Map(),
  adjacencyMap: new Map(),
  legendData: [],
  numericAttributes: [],
  loading: true,
  graphHash: "",
  isLayoutComplete: false,
  savedViewport: null,

  fetchElements: async (signal?: AbortSignal) => {
    _abortController?.abort();
    if (!signal) {
      _abortController = new AbortController();
    }
    const effectiveSignal = signal ?? _abortController!.signal;

    set({ loading: true });
    try {
      const res = await api.get("/api/graph/elements", { signal: effectiveSignal });

      const ns: D3Node[] = res.data.nodes.map((n: BackendNode, index: number) => {
        const { id, label, ...rest } = n.data;
        const angle = (index / res.data.nodes.length) * 2 * Math.PI;
        const radius = 200;
        const centerX = 400;
        const centerY = 300;
        return {
          ...rest,
          id: String(id),
          label: label,
          x: n.position?.x || centerX + radius * Math.cos(angle),
          y: n.position?.y || centerY + radius * Math.sin(angle),
        };
      });

      const es: D3Edge[] = res.data.edges.map((e: BackendEdge, i: number) => ({
        source: String(e.data.source),
        target: String(e.data.target),
        id: `e${i}:${String(e.data.source)}->${String(e.data.target)}`,
      }));

      const nodeIndex = new Map<string, D3Node>();
      const typeMap = new Map<string, number>();
      const numericAttrs = new Set<string>();

      for (const n of ns) {
        nodeIndex.set(n.id, n);
        const nodeType = getNodeType(n.label || "", n);
        typeMap.set(nodeType, (typeMap.get(nodeType) || 0) + 1);
        if (n.attributes) {
          for (const [key, value] of Object.entries(n.attributes as Record<string, unknown>)) {
            if (typeof value === "number" && isFinite(value)) {
              numericAttrs.add(key);
            }
          }
        }
      }

      const adjacencyMap = new Map<string, Set<string>>();
      for (const edge of es) {
        const sourceId = getId(edge.source);
        const targetId = getId(edge.target);
        if (!adjacencyMap.has(sourceId)) adjacencyMap.set(sourceId, new Set());
        if (!adjacencyMap.has(targetId)) adjacencyMap.set(targetId, new Set());
        adjacencyMap.get(sourceId)!.add(targetId);
        adjacencyMap.get(targetId)!.add(sourceId);
      }

      const legendData = Array.from(typeMap.entries())
        .map(([type, count]) => ({
          type,
          color: (NODE_TYPE_COLORS as Record<string, number>)[type] ?? 0x94a3b8,
          count,
        }))
        .sort((a, b) => b.count - a.count);

      set({
        nodes: ns,
        edges: es,
        nodeIndex,
        adjacencyMap,
        legendData,
        numericAttributes: Array.from(numericAttrs).sort(),
        loading: false,
        graphHash: "",
        isLayoutComplete: false,
      });
    } catch (e) {
      if (!isAbortedRequest(e)) {
        set({
          nodes: [],
          edges: [],
          nodeIndex: new Map(),
          adjacencyMap: new Map(),
          legendData: [],
          numericAttributes: [],
          loading: false,
        });
      }
    }
  },

  setLayoutComplete: (hash, complete) => {
    set({ graphHash: hash, isLayoutComplete: complete });
  },

  setSavedViewport: (transform) => {
    set({ savedViewport: transform });
  },

  reset: () => {
    _abortController?.abort();
    _abortController = null;
    set({
      nodes: [],
      edges: [],
      nodeIndex: new Map(),
      adjacencyMap: new Map(),
      legendData: [],
      numericAttributes: [],
      loading: true,
      graphHash: "",
      isLayoutComplete: false,
      savedViewport: null,
    });
  },
}));
