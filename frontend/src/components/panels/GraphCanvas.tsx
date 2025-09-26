import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import * as PIXI from "pixi.js";
import { api, isAbortedRequest } from "../../api";
import type {
  D3Node,
  D3Edge,
  BackendNode,
  BackendEdge,
  SelectionKind,
} from "../../types";
import { PIXI_COLORS, NODE_TYPE_COLORS, getNodeType } from "../../config/pixiColors";
import { buildQuadtree, findNodeAt, findNodesInPolygon, type QuadtreeNode } from "../../utils/quadtree";
import { createCanvasZoom, createDataToScreenTransform, type ZoomTransform } from "../../utils/zoom";
import { SchemaView } from "../SchemaView";
type LayoutAlgo = "force" | "grid" | "circle" | "radial" | "kpartite";

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
  hoveredNodes?: string[];
  showSchemaView?: boolean;
  onSchemaViewChange?: (show: boolean) => void;
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

  let nodesInitialized = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!Number.isFinite(node.x as number)) {
      const angle = (i / nodes.length) * 2 * Math.PI;
      const radius = Math.min(width, height) * 0.3;
      node.x = width / 2 + radius * Math.cos(angle);
      node.y = height / 2 + radius * Math.sin(angle);
      nodesInitialized++;
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

function applyKPartiteLayout(
  ns: D3Node[],
  width: number,
  height: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal'
) {
  const partitions = new Map<string, D3Node[]>();
  ns.forEach(node => {
    const nodeType = getNodeType(node.label || '', node);
    if (!partitions.has(nodeType)) partitions.set(nodeType, []);
    partitions.get(nodeType)!.push(node);
  });


  const partitionArray = Array.from(partitions.entries())
    .sort(([,a], [,b]) => b.length - a.length);

  const numPartitions = partitionArray.length;

  if (numPartitions === 0) return;

  const padding = Math.max(40, Math.min(80, width * 0.08));

  if (orientation === 'horizontal') {
    const availableHeight = height - 2 * padding;
    const partitionSpacing = numPartitions > 1 ? availableHeight / (numPartitions - 1) : 0;

    partitionArray.forEach(([, nodes], partitionIndex) => {
      const y = numPartitions === 1
        ? height / 2
        : padding + partitionIndex * partitionSpacing;

      if (nodes.length === 0) return;

      const availableWidth = width - 2 * padding;

      if (nodes.length === 1) {
        nodes[0].x = width / 2;
        nodes[0].y = y;
      } else {
        const nodeSpacing = availableWidth / (nodes.length - 1);
        nodes.forEach((node, nodeIndex) => {
          node.x = padding + nodeIndex * nodeSpacing;
          node.y = y;
        });
      }
    });
  } else {
    const availableWidth = width - 2 * padding;
    const partitionSpacing = numPartitions > 1 ? availableWidth / (numPartitions - 1) : 0;

    partitionArray.forEach(([, nodes], partitionIndex) => {
      const x = numPartitions === 1
        ? width / 2
        : padding + partitionIndex * partitionSpacing;

      if (nodes.length === 0) return;

      const availableHeight = height - 2 * padding;

      if (nodes.length === 1) {
        nodes[0].x = x;
        nodes[0].y = height / 2;
      } else {
        const nodeSpacing = availableHeight / (nodes.length - 1);
        nodes.forEach((node, nodeIndex) => {
          node.x = x;
          node.y = padding + nodeIndex * nodeSpacing;
        });
      }
    });
  }
}



interface VisualizationSettings {
  showLabels: "auto" | "always" | "never";
  nodeSize: "auto" | "small" | "medium" | "large";
}

const DEFAULT_SETTINGS: VisualizationSettings = {
  showLabels: "never",
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
  private hoveredNodes: Set<string> = new Set();
  private selectedEdge: string | null = null;
  private pathNodes: string[] = [];
  private embeddings: Map<string, [number, number]> | null = null;
  private isEmbeddingView = false;

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
        backgroundColor: PIXI_COLORS.BG,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        powerPreference: "high-performance",
        preferWebGLVersion: 2,
        hello: false, // Suppress PIXI hello message
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
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

      this.app.canvas.addEventListener('webglcontextlost', (event) => {
        console.warn('WebGL context lost, preventing default');
        event.preventDefault();
      }, false);

      this.app.canvas.addEventListener('webglcontextrestored', () => {
        console.log('WebGL context restored, reinitializing...');
      }, false);

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

  setHoveredNodes(hoveredNodes: Set<string>): void {
    this.hoveredNodes = hoveredNodes;
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

  setEmbeddings(embeddings: Map<string, [number, number]> | null): void {
    this.embeddings = embeddings;

    if (this.isEmbeddingView && embeddings) {
      this.applyEmbeddingPositions();
    }

    this.scheduleRender();
  }

  setEmbeddingView(isEmbeddingView: boolean): void {
    this.isEmbeddingView = isEmbeddingView;

    if (isEmbeddingView && this.embeddings) {
      this.applyEmbeddingPositions();
    }

    this.scheduleRender();
  }

  private applyEmbeddingPositions(): void {
    if (!this.embeddings) return;

    const coords: [number, number][] = Array.from(this.embeddings.values());
    if (coords.length === 0) return;

    const xExtent = [Math.min(...coords.map(c => c[0])), Math.max(...coords.map(c => c[0]))];
    const yExtent = [Math.min(...coords.map(c => c[1])), Math.max(...coords.map(c => c[1]))];

    const padding = 50;
    const xScale = (x: number) => {
      const range = xExtent[1] - xExtent[0];
      if (range === 0) return this.width / 2;
      return padding + (x - xExtent[0]) * (this.width - 2 * padding) / range;
    };

    const yScale = (y: number) => {
      const range = yExtent[1] - yExtent[0];
      if (range === 0) return this.height / 2;
      return padding + (y - yExtent[0]) * (this.height - 2 * padding) / range;
    };

    this.nodes.forEach(node => {
      const embedding = this.embeddings!.get(node.id);
      if (embedding) {
        node.x = xScale(embedding[0]);
        node.y = yScale(embedding[1]);
      }
    });

    this.scheduleRender();
  }


  private getNodeColorByType(label: string, nodeData?: any): number {
    const nodeType = getNodeType(label, nodeData);
    return NODE_TYPE_COLORS[nodeType];
  }

  getUniqueNodeTypes(): Array<{ type: string, color: number, count: number }> {
    const typeMap = new Map<string, number>();

    for (const node of this.nodes) {
      const nodeType = getNodeType(node.label || '', node);
      typeMap.set(nodeType, (typeMap.get(nodeType) || 0) + 1);
    }

    return Array.from(typeMap.entries())
      .map(([type, count]) => ({
        type,
        color: NODE_TYPE_COLORS[type as keyof typeof NODE_TYPE_COLORS],
        count
      }))
      .sort((a, b) => b.count - a.count); // Sort by count descending
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
      this.lassoGraphics.fill({ color: PIXI_COLORS.BLUE, alpha: 0.1 });
    }
    this.lassoGraphics.stroke({ width: 2, color: PIXI_COLORS.BLUE });
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

    const showEdges = !this.isEmbeddingView && (lod > 0 || this.edges.length < 50000);

    const autoShowLabels = (lod === 3 && this.nodes.length < 500) || (this.isEmbeddingView && this.nodes.length < 200);
    const showLabels = this.settings.showLabels === "always"
      ? true
      : this.settings.showLabels === "never"
        ? false
        : autoShowLabels;

    if (this.edgeGraphics) {
      this.edgeGraphics.clear();

      if (showEdges) {
        const baseAlpha = lod === 0 ? 0.1 : lod === 1 ? 0.3 : lod === 2 ? 0.5 : 0.6;
        const edgeAlpha = this.isEmbeddingView ? baseAlpha * 0.4 : baseAlpha; // Dimmer edges in embedding view
        const baseWidth = lod === 0 ? 0.2 : lod === 1 ? 0.5 : 1;
        const edgeWidth = this.isEmbeddingView ? baseWidth * 0.6 : baseWidth; // Thinner edges in embedding view

        const edgeColor = this.isEmbeddingView ? 0x888888 : 0xcccccc;

        this.edgeGraphics.setStrokeStyle({
          width: edgeWidth,
          color: edgeColor,
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
            this.edgeGraphics.setStrokeStyle({ width: 3, color: PIXI_COLORS.BLUE });
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

      const nodesByType = new Map<string, D3Node[]>();
      for (const node of this.nodes) {
        const nodeType = getNodeType(node.label || '', node);
        if (!nodesByType.has(nodeType)) nodesByType.set(nodeType, []);
        nodesByType.get(nodeType)!.push(node);
      }

      for (const [nodeType, typeNodes] of nodesByType) {
        const nodeColor = NODE_TYPE_COLORS[nodeType as keyof typeof NODE_TYPE_COLORS];

        for (const node of typeNodes) {
          const nx = (node.x ?? 0) * k + x;
          const ny = (node.y ?? 0) * k + y;

          if (nx < -nodeRadius || nx > this.width + nodeRadius) continue;
          if (ny < -nodeRadius || ny > this.height + nodeRadius) continue;

          if (this.selectedNodes.has(node.id)) continue;
          if (this.hoveredNodes.has(node.id)) continue;

          batchGraphics.circle(nx, ny, nodeRadius);
          batchGraphics.fill(nodeColor);
        }
      }

      this.nodeContainer.addChild(batchGraphics);
    }

    if (this.selectionGraphics) {
      this.selectionGraphics.clear();

      const HOVER_ORANGE = PIXI_COLORS.HOVER_ORANGE;

      for (const nodeId of this.hoveredNodes) {
        if (this.selectedNodes.has(nodeId)) continue;

        const node = this.nodeIndex.get(nodeId);
        if (!node) continue;

        const nx = (node.x ?? 0) * k + x;
        const ny = (node.y ?? 0) * k + y;

        this.selectionGraphics.circle(nx, ny, nodeRadius);
        this.selectionGraphics.fill(HOVER_ORANGE);

        this.selectionGraphics.circle(nx, ny, nodeRadius + 3);
        this.selectionGraphics.stroke({ width: 2, color: HOVER_ORANGE });
      }

      for (const nodeId of this.selectedNodes) {
        const node = this.nodeIndex.get(nodeId);
        if (!node) continue;

        const nx = (node.x ?? 0) * k + x;
        const ny = (node.y ?? 0) * k + y;

        const nodeColor = this.getNodeColorByType(node.label || '', node);

        this.selectionGraphics.circle(nx, ny, nodeRadius);
        this.selectionGraphics.fill(nodeColor);

        this.selectionGraphics.circle(nx, ny, nodeRadius + 3);
        this.selectionGraphics.stroke({ width: 2, color: PIXI_COLORS.BLUE });
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
              color: PIXI_COLORS.PATH_COLOR,
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
          this.pathGraphics.fill(PIXI_COLORS.PATH_COLOR);

          if (isEndpoint) {
            this.pathGraphics.circle(nx, ny, radius + 4);
            this.pathGraphics.stroke({
              width: 2,
              color: PIXI_COLORS.PATH_COLOR,
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
  hoveredNodes,
  showSchemaView = false,
  onSchemaViewChange,
}: GraphCanvasProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);

  const [nodes, setNodes] = useState<D3Node[]>([]);
  const [edges, setEdges] = useState<D3Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [rendererReady, setRendererReady] = useState(false);
  const [debugStatus, setDebugStatus] = useState<string>("Initializing...");

  const [layout, setLayout] = useState<LayoutAlgo>("force");
  const [kPartiteOrientation, setKPartiteOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [selNodes, setSelNodes] = useState<string[]>([]);
  const [selEdge, setSelEdge] = useState<string | null>(null);

  const transformRef = useRef<ZoomTransform>({ x: 0, y: 0, k: 1 });
  const drawingRef = useRef(false);
  const isLassoingRef = useRef(false);
  const justFinishedDrawingRef = useRef(false);
  const lassoPtsRef = useRef<[number, number][]>([]);
  const quadtreeRef = useRef<d3.Quadtree<QuadtreeNode<D3Node>> | null>(null);
  const nodeIndexRef = useRef<Map<string, D3Node>>(new Map());
  const layoutStateRef = useRef<LayoutState>({
    graphHash: "",
    isLayoutComplete: false,
    simulation: null,
  });
  const isExternalSelectionRef = useRef(false);

  const [brushedPath, setBrushedPath] = useState<string[]>([]);
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [settings, setSettings] = useState<VisualizationSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [legendData, setLegendData] = useState<Array<{ type: string, color: number, count: number }>>([]);
  const [selectedNodeTypes, setSelectedNodeTypes] = useState<string[]>([]);





  const selectedNodesSet = useMemo(() => new Set(selNodes), [selNodes]);

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

  const handleNodeTypeSelect = useCallback((nodeType: string, nodeIds: string[], isMultiSelect: boolean) => {
    if (nodeType === '') {
      setSelectedNodeTypes([]);
      return;
    }

    if (isMultiSelect) {
      setSelectedNodeTypes(prevTypes => {
        const isSelected = prevTypes.includes(nodeType);
        if (isSelected) {
          const newTypes = prevTypes.filter(type => type !== nodeType);
          return newTypes;
        } else {
          return [...prevTypes, nodeType];
        }
      });
    } else {
      setSelectedNodeTypes(prevTypes => {
        const isSelected = prevTypes.includes(nodeType);
        if (isSelected && prevTypes.length === 1) {
          return [];
        } else {
          return [nodeType];
        }
      });
    }
  }, []);

  useEffect(() => {
    if (selectedNodeTypes.length === 0) {
      setSelNodes([]);
      if (onSelectionChange) {
        onSelectionChange("subgraph", false, [], null);
      }
    } else {
      const allSelectedNodeIds = selectedNodeTypes.flatMap(nodeType => {
        const typeData = legendData.find(item => item.type === nodeType);
        if (!typeData) return [];
        return nodes.filter(node => getNodeType(node.label || '', node) === nodeType).map(node => node.id);
      });

      setSelNodes(allSelectedNodeIds);
      if (onSelectionChange) {
        onSelectionChange("subgraph", allSelectedNodeIds.length > 0, allSelectedNodeIds, null);
      }
    }
  }, [selectedNodeTypes, nodes, legendData, onSelectionChange]);

  const nodesRef = useRef(nodes);
  const fetchAbortRef = useRef<AbortController | null>(null);
  nodesRef.current = nodes;

  const fetchElements = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setDebugStatus("Fetching graph data from API...");
    try {
      const res = await api.get('/api/graph/elements', {
        signal,
      });
      const ns: D3Node[] = res.data.nodes.map((n: BackendNode, index: number) => {
        const { id, label, ...rest } = n.data;

        // Ensure nodes always have initial positions for immediate rendering
        const angle = (index / res.data.nodes.length) * 2 * Math.PI;
        const radius = 200; // Initial radius
        const centerX = 400; // Initial center
        const centerY = 300;

        return {
          ...rest,
          id: String(id),
          label: label,
          x: n.position?.x || (centerX + radius * Math.cos(angle)),
          y: n.position?.y || (centerY + radius * Math.sin(angle)),
        };
      });
      setDebugStatus(`Loaded ${ns.length} nodes, ${res.data.edges.length} edges`);
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
      setDebugStatus("Data loaded, initializing renderer...");
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

    const updateHandler = () => {
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = new AbortController();
      fetchElements(fetchAbortRef.current.signal);
    };

    window.addEventListener("gb:graph-switched", handler);
    window.addEventListener("gb:graph-updated", updateHandler);
    return () => {
      window.removeEventListener("gb:graph-switched", handler);
      window.removeEventListener("gb:graph-updated", updateHandler);
    };
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
    if (isExternalSelectionRef.current) {
      isExternalSelectionRef.current = false;
      return;
    }

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
        setDebugStatus("Renderer ready!");
        setRendererReady(true);
        if (nodes.length > 0) {
          renderer.setData(nodes, edges, nodeIndexRef.current);
        }
      } else {
        console.error("❌ GraphCanvas: Failed to initialize WebGL renderer");
        setDebugStatus("❌ WebGL renderer failed to initialize");
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
      else if (layout === "kpartite") applyKPartiteLayout(nodes, width, height, kPartiteOrientation);
      else applyRadialByCluster(nodes, edges, width, height);

      layoutState.graphHash = currentHash;
      layoutState.isLayoutComplete = true;
      quadtreeRef.current = buildQuadtree(nodes);
      renderer.setData(nodes, edges, nodeIndexRef.current);
    }
  }, [nodes, edges, loading, layout, kPartiteOrientation, rendererReady]);


  useEffect(() => {
    if (rendererReady && rendererRef.current?.isReady()) {
      rendererRef.current.setSelection(selectedNodesSet, selEdge);
    }
  }, [selectedNodesSet, selEdge, rendererReady]);

  useEffect(() => {
    if (rendererReady && rendererRef.current?.isReady()) {
      rendererRef.current.setHoveredNodes(new Set(hoveredNodes || []));
    }
  }, [hoveredNodes, rendererReady]);

  useEffect(() => {
    if (rendererReady && rendererRef.current?.isReady()) {
      rendererRef.current.setSettings(settings);
    }
  }, [settings, rendererReady]);

  useEffect(() => {
    if (nodes.length > 0) {
      const typeMap = new Map<string, number>();

      for (const node of nodes) {
        const nodeType = getNodeType(node.label || '', node);
        typeMap.set(nodeType, (typeMap.get(nodeType) || 0) + 1);
      }

      const computedLegendData = Array.from(typeMap.entries())
        .map(([type, count]) => ({
          type,
          color: NODE_TYPE_COLORS[type as keyof typeof NODE_TYPE_COLORS] || 0x94a3b8,
          count
        }))
        .sort((a, b) => b.count - a.count);

      setLegendData(computedLegendData);
    } else {
      setLegendData([]);
    }
  }, [nodes]);

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
      return createDataToScreenTransform(clientX, clientY, canvas, transformRef.current);
    };

    const zoom = createCanvasZoom([0.01, 20], (transform) => {
      transformRef.current = transform;
      renderer.setTransform(transform.x, transform.y, transform.k);
    });

    const canvasSelection = d3.select(canvas);
    canvasSelection.call(zoom as d3.ZoomBehavior<HTMLCanvasElement, unknown>);

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
        } catch {
        }
        return;
      }

      drawingRef.current = false;
      isLassoingRef.current = false;
      justFinishedDrawingRef.current = true;

      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {
      }

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
      isExternalSelectionRef.current = true;
      setSelNodes(externalSelectedNodes);
      setSelEdge(null);
      setBrushedPath([]);
    }
  }, [externalSelectedNodes]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-gray-50">
      <div
        className={`absolute inset-0 bg-gray-50 overflow-hidden transition-opacity duration-200 ${
          showSchemaView ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
        }`}
      >
        <SchemaView
          nodes={nodes}
          edges={edges}
          onNodeTypeSelect={handleNodeTypeSelect}
          selectedNodeTypes={selectedNodeTypes}
          isVisible={showSchemaView}
        />
      </div>
      <div
        ref={containerRef}
        className={`absolute inset-0 bg-gray-50 overflow-hidden transition-opacity duration-200 ${
          !showSchemaView ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
        }`}
        title="Graph topology visualization. Shift+drag to lasso select. Click nodes to select. Mouse wheel to zoom."
      >
        {(loading || !rendererReady) && (
          <div className="absolute inset-0 flex items-center gap-2 justify-center text-xs text-gray-400 z-20 bg-gray-50">
            <div className="animate-spin h-3 w-3 border border-gray-300 border-t-gray-600 rounded-full" />
            <span>
              {loading ? "Loading data..." : "Initializing renderer..."}
            </span>
            <div className="text-xs text-gray-300 mt-1">{debugStatus}</div>
          </div>
        )}
        {!loading && rendererReady && (
          <>
            <div className="absolute bottom-3 left-3 z-10">
              <div className="bg-white/90 backdrop-blur-sm rounded-md px-2.5 py-1.5 shadow-sm border border-gray-100 mb-2">
                <div className="text-[10px] text-gray-600 font-medium">
                  {nodes.length.toLocaleString()} nodes · {edges.length.toLocaleString()} edges
                  {isLayoutRunning && (
                    <span className="ml-2 text-blue-500">
                      <span className="inline-block animate-spin">⟳</span>
                      <span className="ml-1">Computing layout...</span>
                    </span>
                  )}
                </div>
                {layout === 'kpartite' && legendData.length > 0 && (
                  <div className="text-[9px] text-gray-500 mt-1">
                    {legendData.length} partition{legendData.length !== 1 ? 's' : ''} · {kPartiteOrientation}
                  </div>
                )}
              </div>
            </div>
            {legendData.length > 1 && (
              <div className="absolute bottom-16 left-3 z-10">
                <div className="bg-white/90 backdrop-blur-sm rounded-md px-2.5 py-2 shadow-sm border border-gray-100">
                  <div className="text-[9px] font-medium text-gray-500 mb-1.5">Node Types</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {legendData.map(({ type, color, count }) => {
                      const displayName = type === 'effect/phenotype' ? 'Effect/Phenotype'
                        : type === 'gene/protein' ? 'Gene/Protein'
                        : type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

                      return (
                        <div key={type} className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
                          />
                          <span className="text-[9px] text-gray-700 leading-tight">
                            {displayName}
                          </span>
                          <span className="text-[8px] text-gray-400 ml-auto">
                            ({count})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      {!showSchemaView && (
        <div className="absolute top-3 right-3 z-20">
          <div className="flex items-center gap-2">
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
                title="Choose layout algorithm for node positioning"
              >
                <option value="force">Force-Directed</option>
                <option value="grid">Grid</option>
                <option value="circle">Circle</option>
                <option value="radial">Radial by Component</option>
                <option value="kpartite">K-Partite by Type</option>
              </select>
            </div>
            {layout === "kpartite" && (
              <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-gray-100">
                <span className="text-[10px] text-gray-400">Orient</span>
                <select
                  className="text-[10px] border-0 bg-transparent text-gray-600 focus:ring-0 cursor-pointer pr-4"
                  value={kPartiteOrientation}
                  onChange={(e) => {
                    setKPartiteOrientation(e.target.value as 'horizontal' | 'vertical');
                    layoutStateRef.current.isLayoutComplete = false; // Force re-layout
                  }}
                  disabled={isLayoutRunning}
                  title="Orientation of k-partite layout partitions"
                >
                  <option value="horizontal">Horizontal Lines</option>
                  <option value="vertical">Vertical Lines</option>
                </select>
              </div>
            )}
            {selNodes.length > 0 && (
              <button
                onClick={expandSelection}
                disabled={isLayoutRunning}
                className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-gray-100 text-[10px] text-gray-600 hover:text-gray-800 hover:bg-white transition-colors disabled:opacity-50"
                title="Expand selection to include all neighbor nodes"
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
        </div>
      )}
    </div>
  );
};
