import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import * as PIXI from "pixi.js";
import api, { isAbortedRequest } from "../api";
import type {
  D3Node,
  D3Edge,
  BackendNode,
  BackendEdge,
  SelectionKind,
} from "../types";
import { getKindColor, getKindColorHex } from "../utils";

const BLUE = 0x3b82f6;
const BG = 0xf9fafb;

type LayoutAlgo = "force" | "grid" | "circle" | "radial";

function getId(x: string | D3Node): string {
  return typeof x === "string" ? x : x.id;
}

interface GraphCanvasProps {
  onSelectionChange?: (
    kind: SelectionKind,
    hasSelection: boolean,
    nodes: string[],
    edge: string | null
  ) => void;
  externalSelectedNodes?: string[];
}

interface QuadtreeNode {
  node: D3Node;
  x: number;
  y: number;
}

function buildQuadtree(nodes: D3Node[]) {
  const points: QuadtreeNode[] = nodes.map((n) => ({
    node: n,
    x: n.x ?? 0,
    y: n.y ?? 0,
  }));
  return d3
    .quadtree<QuadtreeNode>()
    .x((d) => d.x)
    .y((d) => d.y)
    .addAll(points);
}

function findNodeAt(
  quadtree: d3.Quadtree<QuadtreeNode>,
  x: number,
  y: number,
  radius: number
): D3Node | null {
  let found: D3Node | null = null;
  let minDist = radius;

  quadtree.visit((quad, x0, y0, x1, y1) => {
    if (!quad.length) {
      let q: d3.QuadtreeLeaf<QuadtreeNode> | undefined =
        quad as d3.QuadtreeLeaf<QuadtreeNode>;
      do {
        const d = q.data;
        const dx = d.x - x;
        const dy = d.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          found = d.node;
        }
      } while ((q = q.next));
    }
    return (
      x0 > x + radius || x1 < x - radius || y0 > y + radius || y1 < y - radius
    );
  });

  return found;
}

function findNodesInPolygon(
  quadtree: d3.Quadtree<QuadtreeNode>,
  polygon: [number, number][]
): D3Node[] {
  const result: D3Node[] = [];
  const inside = d3.polygonContains;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [px, py] of polygon) {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }

  quadtree.visit((quad, x0, y0, x1, y1) => {
    if (!quad.length) {
      let q: d3.QuadtreeLeaf<QuadtreeNode> | undefined =
        quad as d3.QuadtreeLeaf<QuadtreeNode>;
      do {
        const d = q.data;
        if (inside(polygon, [d.x, d.y])) {
          result.push(d.node);
        }
      } while ((q = q.next));
    }
    return x0 > maxX || x1 < minX || y0 > maxY || y1 < minY;
  });

  return result;
}

interface LayoutState {
  graphHash: string;
  isLayoutComplete: boolean;
  simulation: d3.Simulation<D3Node, D3Edge> | null;
}

function computeGraphHash(nodes: D3Node[], edges: D3Edge[]): string {
  const nodeIds = nodes
    .map((n) => n.id)
    .sort()
    .join(",");
  const edgeIds = edges
    .map((e) => e.id)
    .sort()
    .join(",");
  return `${nodes.length}:${edges.length}:${nodeIds.slice(
    0,
    100
  )}:${edgeIds.slice(0, 100)}`;
}

function runStableForceLayout({
  nodes,
  edges,
  width,
  height,
  onTick,
  onEnd,
}: {
  nodes: D3Node[];
  edges: D3Edge[];
  width: number;
  height: number;
  onTick: () => void;
  onEnd: () => void;
}): d3.Simulation<D3Node, D3Edge> {
  const n = nodes.length;
  const e = edges.length;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!Number.isFinite(node.x as number)) {
      const angle = (i / nodes.length) * 2 * Math.PI;
      const radius = Math.min(width, height) * 0.3;
      node.x = width / 2 + radius * Math.cos(angle);
      node.y = height / 2 + radius * Math.sin(angle);
    }
  }

  const isLarge = n > 5000;
  const isHuge = n > 50000;
  const isMassive = n > 200000;

  const chargeStrength = isMassive ? -2 : isHuge ? -5 : isLarge ? -30 : -120;
  const linkDistance = isMassive ? 10 : isHuge ? 20 : isLarge ? 40 : 60;
  const linkStrength = isMassive ? 0.05 : isHuge ? 0.1 : isLarge ? 0.3 : 0.7;
  const alphaDecay = isMassive ? 0.1 : isHuge ? 0.05 : isLarge ? 0.03 : 0.0228;
  const velocityDecay = isMassive ? 0.7 : isHuge ? 0.6 : isLarge ? 0.5 : 0.4;

  let sampledEdges = edges;
  if (isMassive && e > 50000) {
    const sampleRate = 50000 / e;
    sampledEdges = edges.filter(() => Math.random() < sampleRate);
  } else if (isHuge && e > 100000) {
    const sampleRate = 100000 / e;
    sampledEdges = edges.filter(() => Math.random() < sampleRate);
  }

  const sim = d3
    .forceSimulation<D3Node>(nodes)
    .force(
      "link",
      d3
        .forceLink<D3Node, D3Edge>(sampledEdges)
        .id((d) => d.id)
        .distance(linkDistance)
        .strength(linkStrength)
    )
    .force(
      "charge",
      d3
        .forceManyBody()
        .strength(chargeStrength)
        .distanceMax(isMassive ? 50 : isHuge ? 100 : isLarge ? 200 : 500)
        .theta(isMassive ? 1.5 : isHuge ? 1.2 : 0.9)
    )
    .force("center", d3.forceCenter(width / 2, height / 2))
    .alphaDecay(alphaDecay)
    .velocityDecay(velocityDecay);

  if (!isHuge) {
    const collideRadius = isLarge ? 8 : 16;
    sim.force("collide", d3.forceCollide(collideRadius));
  }

  let ticks = 0;
  const maxTicks = isMassive ? 30 : isHuge ? 50 : isLarge ? 100 : 300;
  const minTicks = isMassive ? 10 : isHuge ? 20 : isLarge ? 30 : 50;
  const stopAlpha = isMassive ? 0.15 : isHuge ? 0.1 : isLarge ? 0.05 : 0.01;

  const tickInterval = isMassive ? 5 : isHuge ? 3 : 1;

  sim.on("tick", () => {
    ticks += 1;
    if (ticks % tickInterval === 0) {
      onTick();
    }
    if ((ticks > minTicks && sim.alpha() < stopAlpha) || ticks > maxTicks) {
      sim.stop();
      onTick();
      onEnd();
    }
  });

  return sim;
}

function applyGridLayout(ns: D3Node[], width: number, height: number) {
  const n = Math.max(ns.length, 1);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const pad = 40;
  const cellW = Math.max((width - pad * 2) / cols, 1);
  const cellH = Math.max((height - pad * 2) / rows, 1);
  ns.forEach((node, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    node.x = pad + c * cellW + cellW / 2;
    node.y = pad + r * cellH + cellH / 2;
  });
}

function applyCircleLayout(ns: D3Node[], width: number, height: number) {
  const R = Math.max(Math.min(width, height) / 2 - 50, 50);
  const cx = width / 2;
  const cy = height / 2;
  ns.forEach((node, i) => {
    const a = (2 * Math.PI * i) / Math.max(ns.length, 1);
    node.x = cx + R * Math.cos(a);
    node.y = cy + R * Math.sin(a);
  });
}

function connectedComponents(ns: D3Node[], es: D3Edge[]) {
  const id2idx = new Map(ns.map((n, i) => [n.id, i]));
  const parent = ns.map((_, i) => i);
  const find = (x: number): number =>
    parent[x] === x ? x : (parent[x] = find(parent[x]));
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  es.forEach((e) => {
    const iu = id2idx.get(getId(e.source));
    const iv = id2idx.get(getId(e.target));
    if (iu != null && iv != null) unite(iu, iv);
  });
  const groups = new Map<number, D3Node[]>();
  ns.forEach((n, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(n);
  });
  return [...groups.values()];
}

function applyRadialByCluster(
  ns: D3Node[],
  es: D3Edge[],
  width: number,
  height: number
) {
  const comps = connectedComponents(ns, es);
  const bigR = Math.max(Math.min(width, height) / 2 - 80, 80);
  const cx = width / 2;
  const cy = height / 2;
  const K = Math.max(comps.length, 1);

  comps.forEach((group, gi) => {
    const theta = (2 * Math.PI * gi) / K;
    const gx = cx + bigR * Math.cos(theta);
    const gy = cy + bigR * Math.sin(theta);
    const rSmall = Math.max(40, Math.min(120, 14 * Math.sqrt(group.length)));
    group.forEach((node, j) => {
      const a = (2 * Math.PI * j) / Math.max(group.length, 1);
      node.x = gx + rSmall * Math.cos(a);
      node.y = gy + rSmall * Math.sin(a);
    });
  });
}

const PATH_COLOR = 0x8b5cf6;


interface VisualizationSettings {
  showLabels: "auto" | "always" | "never";
  nodeSize: "auto" | "small" | "medium" | "large";
}

const DEFAULT_SETTINGS: VisualizationSettings = {
  showLabels: "auto",
  nodeSize: "auto",
};

class GraphRenderer {
  private app: PIXI.Application | null = null;
  private edgeGraphics: PIXI.Graphics | null = null;
  private nodeContainer: PIXI.Container | null = null;
  private selectionGraphics: PIXI.Graphics | null = null;
  private lassoGraphics: PIXI.Graphics | null = null;
  private pathGraphics: PIXI.Graphics | null = null;
  private labelContainer: PIXI.Container | null = null;

  private nodes: D3Node[] = [];
  private edges: D3Edge[] = [];
  private nodeIndex: Map<string, D3Node> = new Map();
  private selectedNodes: Set<string> = new Set();
  private selectedEdge: string | null = null;
  private pathNodes: string[] = [];

  private transform = { x: 0, y: 0, k: 1 };
  private width = 800;
  private height = 600;

  private needsRender = false;
  private renderScheduled = false;
  private isInitialized = false;
  private isDestroyed = false;
  private container: HTMLDivElement | null = null;
  private settings: VisualizationSettings = { ...DEFAULT_SETTINGS };

  async init(
    container: HTMLDivElement,
    width: number,
    height: number
  ): Promise<boolean> {
    if (this.isDestroyed || this.isInitialized) return false;

    this.width = width;
    this.height = height;
    this.container = container;

    try {
      this.app = new PIXI.Application();

      await this.app.init({
        width,
        height,
        backgroundColor: BG,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        powerPreference: "high-performance",
        preferWebGLVersion: 2,
      });

      if (this.isDestroyed) {
        this.app.destroy(true);
        this.app = null;
        return false;
      }

      if (!this.app.canvas || !this.app.stage) {
        console.error("PIXI Application failed to initialize properly");
        this.app.destroy(true);
        this.app = null;
        return false;
      }

      container.appendChild(this.app.canvas);

      this.edgeGraphics = new PIXI.Graphics();
      this.nodeContainer = new PIXI.Container();
      this.selectionGraphics = new PIXI.Graphics();
      this.pathGraphics = new PIXI.Graphics();
      this.lassoGraphics = new PIXI.Graphics();
      this.labelContainer = new PIXI.Container();

      this.app.stage.addChild(this.edgeGraphics);
      this.app.stage.addChild(this.nodeContainer);
      this.app.stage.addChild(this.pathGraphics);
      this.app.stage.addChild(this.selectionGraphics);
      this.app.stage.addChild(this.lassoGraphics);
      this.app.stage.addChild(this.labelContainer);

      this.nodeContainer.sortableChildren = false;

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error("Failed to initialize PIXI:", error);
      if (this.app) {
        try {
          this.app.destroy(true);
        } catch (destroyError) {
          console.warn("Error during cleanup:", destroyError);
        }
        this.app = null;
      }
      return false;
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    this.isInitialized = false;

    if (this.app) {
      try {
        if (
          this.container &&
          this.app.canvas &&
          this.app.canvas.parentNode === this.container
        ) {
          this.container.removeChild(this.app.canvas);
        }
        this.app.destroy(true, { children: true, texture: true });
      } catch (e) {
        console.warn("Error destroying PIXI app:", e);
      }
      this.app = null;
    }

    this.edgeGraphics = null;
    this.nodeContainer = null;
    this.selectionGraphics = null;
    this.pathGraphics = null;
    this.lassoGraphics = null;
    this.labelContainer = null;
    this.container = null;
  }

  isReady(): boolean {
    return this.isInitialized && !this.isDestroyed && this.app !== null;
  }

  resize(width: number, height: number): void {
    if (!this.isReady()) return;

    this.width = width;
    this.height = height;
    try {
      this.app!.renderer.resize(width, height);
      this.scheduleRender();
    } catch (e) {
      console.warn("Error resizing renderer:", e);
    }
  }

  setData(
    nodes: D3Node[],
    edges: D3Edge[],
    nodeIndex: Map<string, D3Node>
  ): void {
    this.nodes = nodes;
    this.edges = edges;
    this.nodeIndex = nodeIndex;
    this.scheduleRender();
  }

  setTransform(x: number, y: number, k: number): void {
    this.transform = { x, y, k };
    this.scheduleRender();
  }

  setSelection(selectedNodes: Set<string>, selectedEdge: string | null): void {
    this.selectedNodes = selectedNodes;
    this.selectedEdge = selectedEdge;
    this.scheduleRender();
  }

  setPath(pathNodes: string[]): void {
    this.pathNodes = pathNodes;
    this.scheduleRender();
  }

  setSettings(settings: VisualizationSettings): void {
    this.settings = settings;
    this.scheduleRender();
  }

  drawLasso(points: [number, number][], closed: boolean): void {
    if (!this.isReady() || !this.lassoGraphics) return;
    this.lassoGraphics.clear();

    if (points.length < 2) return;

    const screenPts = points.map(([x, y]) => [
      x * this.transform.k + this.transform.x,
      y * this.transform.k + this.transform.y,
    ]);

    this.lassoGraphics.moveTo(screenPts[0][0], screenPts[0][1]);
    for (let i = 1; i < screenPts.length; i++) {
      this.lassoGraphics.lineTo(screenPts[i][0], screenPts[i][1]);
    }
    if (closed) {
      this.lassoGraphics.closePath();
      this.lassoGraphics.fill({ color: BLUE, alpha: 0.1 });
    }
    this.lassoGraphics.stroke({ width: 2, color: BLUE });
  }

  clearLasso(): void {
    if (this.lassoGraphics) {
      this.lassoGraphics.clear();
    }
  }

  private scheduleRender(): void {
    if (!this.isReady()) return;

    this.needsRender = true;
    if (!this.renderScheduled) {
      this.renderScheduled = true;
      requestAnimationFrame(() => this.render());
    }
  }

  private render(): void {
    this.renderScheduled = false;
    if (!this.needsRender || !this.isReady()) return;
    this.needsRender = false;

    const { x, y, k } = this.transform;

    const lod = k < 0.1 ? 0 : k < 0.3 ? 1 : k < 0.6 ? 2 : 3;

    const baseRadius = lod === 0 ? 2 : lod === 1 ? 4 : lod === 2 ? 7 : 10;
    const nodeSizeMultiplier = this.settings.nodeSize === "small" ? 0.6
      : this.settings.nodeSize === "medium" ? 1
      : this.settings.nodeSize === "large" ? 1.5
      : 1;
    const nodeRadius = Math.max(2, Math.round(baseRadius * nodeSizeMultiplier));

    const showEdges = lod > 0 || this.edges.length < 50000;

    const autoShowLabels = lod === 3 && this.nodes.length < 500;
    const showLabels = this.settings.showLabels === "always"
      ? true
      : this.settings.showLabels === "never"
        ? false
        : autoShowLabels;

    if (this.edgeGraphics) {
      this.edgeGraphics.clear();

      if (showEdges) {
        const edgeAlpha =
          lod === 0 ? 0.1 : lod === 1 ? 0.3 : lod === 2 ? 0.5 : 0.6;
        const edgeWidth = lod === 0 ? 0.2 : lod === 1 ? 0.5 : 1;

        this.edgeGraphics.setStrokeStyle({
          width: edgeWidth,
          color: 0xcccccc,
          alpha: edgeAlpha,
        });

        for (const edge of this.edges) {
          const source =
            typeof edge.source === "string"
              ? this.nodeIndex.get(edge.source)
              : (edge.source as D3Node);
          const target =
            typeof edge.target === "string"
              ? this.nodeIndex.get(edge.target)
              : (edge.target as D3Node);

          if (!source || !target) continue;

          const x1 = (source.x ?? 0) * k + x;
          const y1 = (source.y ?? 0) * k + y;
          const x2 = (target.x ?? 0) * k + x;
          const y2 = (target.y ?? 0) * k + y;

          if (x1 < -50 && x2 < -50) continue;
          if (y1 < -50 && y2 < -50) continue;
          if (x1 > this.width + 50 && x2 > this.width + 50) continue;
          if (y1 > this.height + 50 && y2 > this.height + 50) continue;

          this.edgeGraphics.moveTo(x1, y1);
          this.edgeGraphics.lineTo(x2, y2);
        }
        this.edgeGraphics.stroke();

        if (this.selectedEdge) {
          const [srcId, tgtId] = this.selectedEdge.split("->");
          const source = this.nodeIndex.get(srcId);
          const target = this.nodeIndex.get(tgtId);
          if (source && target) {
            this.edgeGraphics.setStrokeStyle({ width: 3, color: BLUE });
            this.edgeGraphics.moveTo(
              (source.x ?? 0) * k + x,
              (source.y ?? 0) * k + y
            );
            this.edgeGraphics.lineTo(
              (target.x ?? 0) * k + x,
              (target.y ?? 0) * k + y
            );
            this.edgeGraphics.stroke();
          }
        }
      }
    }

    if (this.nodeContainer) {
      this.nodeContainer.removeChildren();

      const batchGraphics = new PIXI.Graphics();

      const nodesByLabel = new Map<string, D3Node[]>();
      for (const node of this.nodes) {
        const label = node.label || "default";
        if (!nodesByLabel.has(label)) nodesByLabel.set(label, []);
        nodesByLabel.get(label)!.push(node);
      }

      for (const [label, labelNodes] of nodesByLabel) {
        const color = getKindColor(label);

        for (const node of labelNodes) {
          const nx = (node.x ?? 0) * k + x;
          const ny = (node.y ?? 0) * k + y;

          if (nx < -nodeRadius || nx > this.width + nodeRadius) continue;
          if (ny < -nodeRadius || ny > this.height + nodeRadius) continue;

          if (this.selectedNodes.has(node.id)) continue;

          batchGraphics.circle(nx, ny, nodeRadius);
          batchGraphics.fill(color);
        }
      }

      this.nodeContainer.addChild(batchGraphics);
    }

    if (this.selectionGraphics) {
      this.selectionGraphics.clear();

      for (const nodeId of this.selectedNodes) {
        const node = this.nodeIndex.get(nodeId);
        if (!node) continue;

        const nx = (node.x ?? 0) * k + x;
        const ny = (node.y ?? 0) * k + y;
        const color = getKindColor(node.label);

        this.selectionGraphics.circle(nx, ny, nodeRadius);
        this.selectionGraphics.fill(color);

        this.selectionGraphics.circle(nx, ny, nodeRadius + 3);
        this.selectionGraphics.stroke({ width: 2, color: BLUE });
      }
    }

    if (this.pathGraphics) {
      this.pathGraphics.clear();

      if (this.pathNodes.length >= 2) {
        for (let i = 0; i < this.pathNodes.length - 1; i++) {
          const sourceId = this.pathNodes[i];
          const targetId = this.pathNodes[i + 1];
          const source = this.nodeIndex.get(sourceId);
          const target = this.nodeIndex.get(targetId);

          if (source && target) {
            const x1 = (source.x ?? 0) * k + x;
            const y1 = (source.y ?? 0) * k + y;
            const x2 = (target.x ?? 0) * k + x;
            const y2 = (target.y ?? 0) * k + y;

            this.pathGraphics.setStrokeStyle({
              width: 4,
              color: PATH_COLOR,
              alpha: 0.8,
            });
            this.pathGraphics.moveTo(x1, y1);
            this.pathGraphics.lineTo(x2, y2);
            this.pathGraphics.stroke();
          }
        }

        for (let i = 0; i < this.pathNodes.length; i++) {
          const nodeId = this.pathNodes[i];
          const node = this.nodeIndex.get(nodeId);
          if (!node) continue;

          const nx = (node.x ?? 0) * k + x;
          const ny = (node.y ?? 0) * k + y;

          if (this.selectedNodes.has(nodeId)) continue;

          const isEndpoint = i === 0 || i === this.pathNodes.length - 1;
          const radius = isEndpoint ? nodeRadius + 2 : nodeRadius;

          this.pathGraphics.circle(nx, ny, radius);
          this.pathGraphics.fill(PATH_COLOR);

          if (isEndpoint) {
            this.pathGraphics.circle(nx, ny, radius + 4);
            this.pathGraphics.stroke({
              width: 2,
              color: PATH_COLOR,
              alpha: 0.5,
            });
          }
        }
      }
    }

    if (this.labelContainer) {
      this.labelContainer.removeChildren();

      if (showLabels) {
        for (const node of this.nodes) {
          const nx = (node.x ?? 0) * k + x;
          const ny = (node.y ?? 0) * k + y;

          if (nx < 0 || nx > this.width || ny < 0 || ny > this.height) continue;

          const label = node.label || node.id;
          const text = new PIXI.Text({
            text: label.slice(0, 15),
            style: {
              fontSize: 10,
              fill: 0x374151,
              fontFamily: "sans-serif",
            },
          });
          text.anchor.set(0.5, 0);
          text.position.set(nx, ny + nodeRadius + 3);
          this.labelContainer.addChild(text);
        }
      }
    }
  }

  getCanvas(): HTMLCanvasElement | null {
    if (!this.isReady()) return null;
    return this.app?.canvas ?? null;
  }
}

export const GraphCanvas = ({
  onSelectionChange,
  externalSelectedNodes,
}: GraphCanvasProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);

  const [nodes, setNodes] = useState<D3Node[]>([]);
  const [edges, setEdges] = useState<D3Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [rendererReady, setRendererReady] = useState(false);

  const [layout, setLayout] = useState<LayoutAlgo>("force");
  const [selNodes, setSelNodes] = useState<string[]>([]);
  const [selEdge, setSelEdge] = useState<string | null>(null);

  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const drawingRef = useRef(false);
  const isLassoingRef = useRef(false);
  const justFinishedDrawingRef = useRef(false);
  const lassoPtsRef = useRef<[number, number][]>([]);
  const quadtreeRef = useRef<d3.Quadtree<QuadtreeNode> | null>(null);
  const nodeIndexRef = useRef<Map<string, D3Node>>(new Map());
  const layoutStateRef = useRef<LayoutState>({
    graphHash: "",
    isLayoutComplete: false,
    simulation: null,
  });

  const [brushedPath, setBrushedPath] = useState<string[]>([]);
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [settings, setSettings] = useState<VisualizationSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);


  const selectedNodesSet = useMemo(() => new Set(selNodes), [selNodes]);

  const uniqueLabels = useMemo(() => {
    const labels = new Set<string>();
    nodes.forEach((n) => {
      if (n.label) labels.add(n.label);
    });
    return Array.from(labels).sort();
  }, [nodes]);

  const adjacencyMap = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    for (const edge of edges) {
      const sourceId = getId(edge.source);
      const targetId = getId(edge.target);

      if (!adj.has(sourceId)) adj.set(sourceId, new Set());
      if (!adj.has(targetId)) adj.set(targetId, new Set());

      adj.get(sourceId)!.add(targetId);
      adj.get(targetId)!.add(sourceId);
    }
    return adj;
  }, [edges]);

  const expandSelection = useCallback(() => {
    if (selNodes.length === 0) return;

    const expanded = new Set(selNodes);
    for (const nodeId of selNodes) {
      const neighbors = adjacencyMap.get(nodeId);
      if (neighbors) {
        for (const neighbor of neighbors) {
          expanded.add(neighbor);
        }
      }
    }

    setSelNodes(Array.from(expanded));
  }, [selNodes, adjacencyMap]);

  const nodesRef = useRef(nodes);
  const fetchAbortRef = useRef<AbortController | null>(null);
  nodesRef.current = nodes;

  const fetchElements = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/graph/elements?t=${Date.now()}`, {
        signal,
      });
      const ns: D3Node[] = res.data.nodes.map((n: BackendNode) => {
        const { id, label, ...rest } = n.data;
        return {
          ...rest,
          id: String(id),
          label: label,
          x: n.position?.x,
          y: n.position?.y,
        };
      });
      const es: D3Edge[] = res.data.edges.map((e: BackendEdge, i: number) => ({
        source: String(e.data.source),
        target: String(e.data.target),
        id: `e${i}:${String(e.data.source)}->${String(e.data.target)}`,
      }));

      const idx = new Map<string, D3Node>();
      for (const n of ns) idx.set(n.id, n);
      nodeIndexRef.current = idx;

      setNodes(ns);
      setEdges(es);

      layoutStateRef.current = {
        graphHash: "",
        isLayoutComplete: false,
        simulation: null,
      };
    } catch (e) {
      if (!isAbortedRequest(e)) {
        console.error("/graph/elements error:", e);
        setNodes([]);
        setEdges([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = new AbortController();

    fetchElements(fetchAbortRef.current.signal);

    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [fetchElements]);

  useEffect(() => {
    const handler = () => {
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = new AbortController();

      setSelNodes([]);
      setSelEdge(null);
      setBrushedPath([]);
      if (layoutStateRef.current.simulation) {
        layoutStateRef.current.simulation.stop();
        layoutStateRef.current.simulation = null;
      }
      layoutStateRef.current = {
        graphHash: "",
        isLayoutComplete: false,
        simulation: null,
      };
      fetchElements(fetchAbortRef.current.signal);
    };
    window.addEventListener("gb:graph-switched", handler);
    return () => window.removeEventListener("gb:graph-switched", handler);
  }, [fetchElements]);

  const selectionKind = useMemo<SelectionKind>(() => {
    if (brushedPath.length >= 2) {
      return "path";
    }
    if (selEdge) return "edge";
    if (selNodes.length === 1) return "node";
    if (selNodes.length > 1) return "subgraph";
    return "subgraph";
  }, [selNodes, selEdge, brushedPath]);

  useEffect(() => {
    if (onSelectionChange) {
      const hasSelected =
        selectionKind === "path"
          ? brushedPath.length >= 2
          : selectionKind === "edge"
          ? !!selEdge
          : selNodes.length > 0;

      onSelectionChange(selectionKind, hasSelected, selNodes, selEdge);
    }
  }, [selectionKind, selNodes, selEdge, brushedPath, onSelectionChange]);

  useEffect(() => {
    if (!containerRef.current || loading) return;

    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const renderer = new GraphRenderer();
    rendererRef.current = renderer;

    let isMounted = true;

    renderer.init(container, width, height).then((success) => {
      if (!isMounted) return;

      if (success) {
        setRendererReady(true);
        if (nodes.length > 0) {
          renderer.setData(nodes, edges, nodeIndexRef.current);
        }
      } else {
        console.error("Failed to initialize WebGL renderer");
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && renderer.isReady()) {
          renderer.resize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      isMounted = false;
      setRendererReady(false);
      resizeObserver.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [loading]);

  useEffect(() => {
    if (loading || !rendererReady || nodes.length === 0) return;

    const renderer = rendererRef.current;
    if (!renderer || !renderer.isReady()) return;

    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const currentHash = computeGraphHash(nodes, edges);
    const layoutState = layoutStateRef.current;

    const needsLayoutRecompute =
      layoutState.graphHash !== currentHash || !layoutState.isLayoutComplete;

    if (layout === "force") {
      if (needsLayoutRecompute) {
        if (layoutState.simulation) {
          layoutState.simulation.stop();
        }

        setIsLayoutRunning(true);
        layoutState.graphHash = currentHash;
        layoutState.isLayoutComplete = false;

        const onTick = () => {
          quadtreeRef.current = buildQuadtree(nodes);
          if (rendererRef.current?.isReady()) {
            rendererRef.current.setData(nodes, edges, nodeIndexRef.current);
          }
        };

        const onEnd = () => {
          layoutState.isLayoutComplete = true;
          setIsLayoutRunning(false);
          quadtreeRef.current = buildQuadtree(nodes);
          if (rendererRef.current?.isReady()) {
            rendererRef.current.setData(nodes, edges, nodeIndexRef.current);
          }
        };

        layoutState.simulation = runStableForceLayout({
          nodes,
          edges,
          width,
          height,
          onTick,
          onEnd,
        });
      } else {
        renderer.setData(nodes, edges, nodeIndexRef.current);
      }
    } else {
      if (layoutState.simulation) {
        layoutState.simulation.stop();
        layoutState.simulation = null;
      }

      if (layout === "grid") applyGridLayout(nodes, width, height);
      else if (layout === "circle") applyCircleLayout(nodes, width, height);
      else applyRadialByCluster(nodes, edges, width, height);

      layoutState.graphHash = currentHash;
      layoutState.isLayoutComplete = true;
      quadtreeRef.current = buildQuadtree(nodes);
      renderer.setData(nodes, edges, nodeIndexRef.current);
    }
  }, [nodes, edges, loading, layout, rendererReady]);

  useEffect(() => {
    if (rendererReady && rendererRef.current?.isReady()) {
      rendererRef.current.setSelection(selectedNodesSet, selEdge);
    }
  }, [selectedNodesSet, selEdge, rendererReady]);

  useEffect(() => {
    if (rendererReady && rendererRef.current?.isReady()) {
      rendererRef.current.setSettings(settings);
    }
  }, [settings, rendererReady]);

  useEffect(() => {
    if (!showSettings) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettings]);

  useEffect(() => {
    if (loading || !rendererReady) return;

    const renderer = rendererRef.current;
    if (!renderer || !renderer.isReady()) return;

    const canvas = renderer.getCanvas();
    if (!canvas) return;

    const toData = (clientX: number, clientY: number): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      const t = transformRef.current;
      return [(screenX - t.x) / t.k, (screenY - t.y) / t.k];
    };

    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.01, 20])
      .filter((ev) => {
        if (ev.shiftKey) return false;
        return true;
      })
      .on("zoom", (ev) => {
        transformRef.current = {
          x: ev.transform.x,
          y: ev.transform.y,
          k: ev.transform.k,
        };
        renderer.setTransform(ev.transform.x, ev.transform.y, ev.transform.k);
      });

    const canvasSelection = d3.select(canvas);
    canvasSelection.call(zoom as any);

    const handleClick = (ev: MouseEvent) => {
      if (justFinishedDrawingRef.current) {
        justFinishedDrawingRef.current = false;
        return;
      }

      const [x, y] = toData(ev.clientX, ev.clientY);

      if (quadtreeRef.current) {
        const clickRadius = 20 / transformRef.current.k;
        const node = findNodeAt(quadtreeRef.current, x, y, clickRadius);

        if (node) {
          setSelEdge(null);

          if (ev.shiftKey) {
            setSelNodes((prev) =>
              prev.includes(node.id) ? prev : [...prev, node.id]
            );
          } else if (ev.ctrlKey || ev.metaKey) {
            setSelNodes((prev) =>
              prev.includes(node.id)
                ? prev.filter((id) => id !== node.id)
                : [...prev, node.id]
            );
          } else {
            setSelNodes([node.id]);
          }
        } else if (!ev.shiftKey) {
          setSelNodes([]);
          setSelEdge(null);
        }
      }
    };

    let lassoStartPos: [number, number] | null = null;
    const LASSO_DRAG_THRESHOLD = 5;

    const handlePointerDown = (ev: PointerEvent) => {
      if (!ev.shiftKey) return;

      lassoStartPos = [ev.clientX, ev.clientY];
      const p = toData(ev.clientX, ev.clientY);
      lassoPtsRef.current = [p];

      canvas.setPointerCapture(ev.pointerId);
    };

    const handlePointerMove = (ev: PointerEvent) => {
      if (!lassoStartPos) return;

      if (!isLassoingRef.current) {
        const dx = ev.clientX - lassoStartPos[0];
        const dy = ev.clientY - lassoStartPos[1];
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist >= LASSO_DRAG_THRESHOLD) {
          isLassoingRef.current = true;
          drawingRef.current = true;
        } else {
          return;
        }
      }

      const p = toData(ev.clientX, ev.clientY);
      lassoPtsRef.current.push(p);
      renderer.drawLasso(lassoPtsRef.current, true);
    };

    const handlePointerUp = (ev: PointerEvent) => {
      const wasLassoing = isLassoingRef.current;
      lassoStartPos = null;

      if (!wasLassoing) {
        try {
          canvas.releasePointerCapture(ev.pointerId);
        } catch {}
        return;
      }

      drawingRef.current = false;
      isLassoingRef.current = false;
      justFinishedDrawingRef.current = true;

      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {}

      const pts = lassoPtsRef.current;

      if (pts.length >= 3) {
        const polygon = pts.concat([pts[0]]) as [number, number][];

        if (quadtreeRef.current) {
          const selected = findNodesInPolygon(quadtreeRef.current, polygon);
          setSelEdge(null);

          if (ev.ctrlKey || ev.metaKey) {
            setSelNodes((prev) => {
              const newIds = selected.map((n) => n.id);
              const combined = new Set([...prev, ...newIds]);
              return Array.from(combined);
            });
          } else {
            setSelNodes(selected.map((n) => n.id));
          }
        }
      }

      lassoPtsRef.current = [];
      renderer.clearLasso();
    };

    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerUp);

    return () => {
      canvasSelection.on(".zoom", null);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerUp);
    };
  }, [loading, rendererReady]);

  useEffect(() => {
    if (externalSelectedNodes && externalSelectedNodes.length > 0) {
      setSelNodes(externalSelectedNodes);
      setSelEdge(null);
      setBrushedPath([]);
    }
  }, [externalSelectedNodes]);

  return (
    <div className="h-full flex flex-col p-3">
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden rounded-md bg-gray-50 relative"
      >
        {(loading || !rendererReady) && (
          <div className="absolute inset-0 flex items-center gap-2 justify-center text-xs text-gray-400 z-20 bg-gray-50">
            <div className="animate-spin h-3 w-3 border border-gray-300 border-t-gray-600 rounded-full" />
            <span>
              {loading ? "Loading data..." : "Initializing renderer..."}
            </span>
          </div>
        )}
        {!loading && rendererReady && (
          <>
            {uniqueLabels.length > 0 && (
              <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1.5 shadow-sm border border-gray-100 z-10">
                <div className="flex items-center gap-3 text-[10px]">
                  {uniqueLabels.map((label) => (
                    <div key={label} className="flex items-center gap-1">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: getKindColorHex(label) }}
                      />
                      <span className="text-gray-600 capitalize">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="absolute top-3 left-3 z-10">
              <div className="bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-gray-100 text-[10px] text-gray-500">
                {nodes.length.toLocaleString()} nodes · {edges.length.toLocaleString()} edges
                {isLayoutRunning && (
                  <span className="ml-2">
                    <span className="inline-block animate-spin">⟳</span>
                  </span>
                )}
              </div>
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
              <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-gray-100">
                <span className="text-[10px] text-gray-400">Layout</span>
                <select
                  className="text-[10px] border-0 bg-transparent text-gray-600 focus:ring-0 cursor-pointer pr-4"
                  value={layout}
                  onChange={(e) => {
                    layoutStateRef.current.isLayoutComplete = false;
                    setLayout(e.target.value as LayoutAlgo);
                  }}
                  disabled={isLayoutRunning}
                >
                  <option value="force">Force</option>
                  <option value="grid">Grid</option>
                  <option value="circle">Circle</option>
                  <option value="radial">Radial</option>
                </select>
              </div>
              {selNodes.length > 0 && (
                <button
                  onClick={expandSelection}
                  disabled={isLayoutRunning}
                  className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-gray-100 text-[10px] text-gray-600 hover:text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  title="Expand selection to neighbors"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                  Expand
                  <span className="text-gray-400">({selNodes.length})</span>
                </button>
              )}
              <div className="relative" ref={settingsRef}>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="flex items-center justify-center w-6 h-6 bg-white/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                  title="Visualization settings"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                </button>
                {showSettings && (
                  <div className="absolute top-8 right-0 bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[180px] z-20">
                    <div className="text-[11px] font-medium text-gray-700 mb-2">Display Settings</div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Labels</label>
                        <select
                          value={settings.showLabels}
                          onChange={(e) => setSettings({ ...settings, showLabels: e.target.value as "auto" | "always" | "never" })}
                          className="w-full text-[10px] border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value="auto">Auto</option>
                          <option value="always">Always</option>
                          <option value="never">Never</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Node Size</label>
                        <select
                          value={settings.nodeSize}
                          onChange={(e) => setSettings({ ...settings, nodeSize: e.target.value as "auto" | "small" | "medium" | "large" })}
                          className="w-full text-[10px] border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value="auto">Auto</option>
                          <option value="small">Small</option>
                          <option value="medium">Medium</option>
                          <option value="large">Large</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
