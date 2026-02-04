import * as PIXI from "pixi.js";
import type { D3Node, D3Edge } from "../../../types";
import {
  PIXI_COLORS,
  NODE_TYPE_COLORS,
  getNodeType,
} from "../../../config/pixiColors";

function getId(x: string | D3Node): string {
  return typeof x === "string" ? x : x.id;
}

export interface VisualizationSettings {
  showLabels: "auto" | "always" | "never";
  nodeSize: "auto" | "small" | "medium" | "large";
  nodeSizeBy: "fixed" | "degree" | "attribute";
  nodeSizeAttribute: string | null;
  edgeOpacity: number;
  showEdges: boolean;
}

export const DEFAULT_SETTINGS: VisualizationSettings = {
  showLabels: "never",
  nodeSize: "auto",
  nodeSizeBy: "fixed",
  nodeSizeAttribute: null,
  edgeOpacity: 1,
  showEdges: true,
};

export class GraphRenderer {
  private app: PIXI.Application | null = null;
  private edgeGraphics: PIXI.Graphics | null = null;
  private pathEdgeGraphics: PIXI.Graphics | null = null;
  private nodeContainer: PIXI.Container | null = null;
  private batchGraphics: PIXI.Graphics | null = null;
  private dimmedBatch: PIXI.Graphics | null = null;
  private selectionGraphics: PIXI.Graphics | null = null;
  private pathGraphics: PIXI.Graphics | null = null;
  private lassoGraphics: PIXI.Graphics | null = null;
  private labelContainer: PIXI.Container | null = null;
  private labelPool: PIXI.Text[] = [];
  private activeLabelCount: number = 0;
  private labelsDirty: boolean = false;
  private lastLod: number = -1;

  private pinnedGraphics: PIXI.Graphics | null = null;
  private pinnedSelections: Array<{ nodes: Set<string>; color: number }> = [];

  private nodes: D3Node[] = [];
  private edges: D3Edge[] = [];
  private nodeIndex: Map<string, D3Node> = new Map();
  private selectedNodes: Set<string> = new Set();
  private contrastNodes: Set<string> = new Set();
  private hoveredNodes: Set<string> = new Set();
  private neighborhoodFocusNode: string | null = null;
  private neighborhoodFocusAdjacentNodes: Set<string> = new Set();
  private selectedEdge: string | null = null;
  private pathNodes: Set<string> = new Set();
  private pathEdges: Array<{ source: string; target: string }> = [];
  private paths: string[][] = [];
  private constellationMode = false;
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

  private _dimNonSelected = false;
  private nodesByTypeCache: Map<string, D3Node[]> | null = null;
  private degreeMap: Map<string, number> = new Map();
  private maxDegree = 1;
  private attributeRange: { min: number; max: number } = { min: 0, max: 1 };
  public onCenterRequest:
    | ((transform: { x: number; y: number; k: number }) => void)
    | null = null;

  getTransform(): { x: number; y: number; k: number } {
    return { ...this.transform };
  }

  getNodeBounds(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null {
    if (this.nodes.length === 0) return null;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const node of this.nodes) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, maxX, minY, maxY };
  }

  getCenterViewTransform(): { x: number; y: number; k: number } | null {
    const bounds = this.getNodeBounds();
    if (!bounds) return null;

    const { minX, maxX, minY, maxY } = bounds;
    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    if (graphWidth === 0 && graphHeight === 0) {
      return { x: this.width / 2 - minX, y: this.height / 2 - minY, k: 1 };
    }

    const padding = 60;
    const availableWidth = this.width - padding * 2;
    const availableHeight = this.height - padding * 2;

    const scaleX = availableWidth / Math.max(graphWidth, 1);
    const scaleY = availableHeight / Math.max(graphHeight, 1);
    const scale = Math.min(scaleX, scaleY, 2);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
      x: this.width / 2 - centerX * scale,
      y: this.height / 2 - centerY * scale,
      k: scale,
    };
  }

  requestCenterView(): void {
    const transform = this.getCenterViewTransform();
    if (transform && this.onCenterRequest) {
      this.onCenterRequest(transform);
    }
  }

  async init(
    container: HTMLDivElement,
    width: number,
    height: number,
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
        hello: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });

      if (this.isDestroyed) {
        this.app.destroy(true);
        this.app = null;
        return false;
      }

      if (!this.app.canvas || !this.app.stage) {
        this.app.destroy(true);
        this.app = null;
        return false;
      }

      container.appendChild(this.app.canvas);

      this.app.canvas.addEventListener(
        "webglcontextlost",
        (event) => {
          event.preventDefault();
        },
        false,
      );

      this.app.canvas.addEventListener("webglcontextrestored", () => {}, false);

      this.edgeGraphics = new PIXI.Graphics();
      this.pathEdgeGraphics = new PIXI.Graphics();
      this.nodeContainer = new PIXI.Container();
      this.batchGraphics = new PIXI.Graphics();
      this.dimmedBatch = new PIXI.Graphics();
      this.nodeContainer.addChild(this.dimmedBatch);
      this.nodeContainer.addChild(this.batchGraphics);
      this.pinnedGraphics = new PIXI.Graphics();
      this.selectionGraphics = new PIXI.Graphics();
      this.pathGraphics = new PIXI.Graphics();
      this.lassoGraphics = new PIXI.Graphics();
      this.labelContainer = new PIXI.Container();

      this.app.stage.addChild(this.edgeGraphics);
      this.app.stage.addChild(this.pathEdgeGraphics);
      this.app.stage.addChild(this.nodeContainer);
      this.app.stage.addChild(this.pinnedGraphics);
      this.app.stage.addChild(this.selectionGraphics);
      this.app.stage.addChild(this.pathGraphics);
      this.app.stage.addChild(this.lassoGraphics);
      this.app.stage.addChild(this.labelContainer);

      this.nodeContainer.sortableChildren = false;

      this.isInitialized = true;
      return true;
    } catch {
      if (this.app) {
        try {
          this.app.destroy(true);
        } catch {}
        this.app = null;
      }
      return false;
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    this.isInitialized = false;

    for (const text of this.labelPool) {
      try { text.destroy(); } catch {}
    }
    this.labelPool = [];
    this.activeLabelCount = 0;

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
      } catch {}
      this.app = null;
    }

    this.edgeGraphics = null;
    this.pathEdgeGraphics = null;
    this.nodeContainer = null;
    this.batchGraphics = null;
    this.dimmedBatch = null;
    this.pinnedGraphics = null;
    this.selectionGraphics = null;
    this.pathGraphics = null;
    this.lassoGraphics = null;
    this.labelContainer = null;
    this.container = null;
    this.nodesByTypeCache = null;
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
    } catch {}
  }

  setGraphData(
    nodes: D3Node[],
    edges: D3Edge[],
    nodeIndex: Map<string, D3Node>,
  ): void {
    this.nodes = nodes;
    this.edges = edges;
    this.nodeIndex = nodeIndex;
    this.nodesByTypeCache = null;
    this.computeDegreeMap();
    this.updateAttributeRange();
    this.labelsDirty = true;

    const targetPoolSize = Math.min(nodes.length, 500);
    if (this.labelPool.length > targetPoolSize * 2) {
      const excess = this.labelPool.splice(targetPoolSize);
      for (const text of excess) {
        try { text.destroy(); } catch {}
      }
      this.activeLabelCount = Math.min(this.activeLabelCount, this.labelPool.length);
    }

    this.scheduleRender();
  }

  setData(
    nodes: D3Node[],
    edges: D3Edge[],
    nodeIndex: Map<string, D3Node>,
  ): void {
    this.setGraphData(nodes, edges, nodeIndex);
  }

  updatePositions(): void {
    this.scheduleRender();
  }

  private computeDegreeMap(): void {
    this.degreeMap.clear();
    this.maxDegree = 1;
    for (const node of this.nodes) this.degreeMap.set(node.id, 0);
    for (const edge of this.edges) {
      const sourceId = getId(edge.source);
      const targetId = getId(edge.target);
      this.degreeMap.set(sourceId, (this.degreeMap.get(sourceId) || 0) + 1);
      this.degreeMap.set(targetId, (this.degreeMap.get(targetId) || 0) + 1);
    }
    for (const deg of this.degreeMap.values()) {
      if (deg > this.maxDegree) this.maxDegree = deg;
    }
  }

  private updateAttributeRange(): void {
    const attr = this.settings.nodeSizeAttribute;
    if (!attr || this.settings.nodeSizeBy !== "attribute") {
      this.attributeRange = { min: 0, max: 1 };
      return;
    }
    let min = Infinity,
      max = -Infinity;
    for (const node of this.nodes) {
      const val = (node as Record<string, unknown>)[attr];
      if (typeof val === "number" && Number.isFinite(val)) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 1;
    if (max === min) max = min + 1;
    this.attributeRange = { min, max };
  }

  private getNodeRadius(node: D3Node, baseRadius: number): number {
    const minScale = 0.4;
    const maxScale = 2.5;

    if (this.settings.nodeSizeBy === "degree") {
      const degree = this.degreeMap.get(node.id) || 0;
      const t = this.maxDegree > 0 ? degree / this.maxDegree : 0;
      const scale = minScale + t * (maxScale - minScale);
      return Math.max(2, baseRadius * scale);
    }

    if (
      this.settings.nodeSizeBy === "attribute" &&
      this.settings.nodeSizeAttribute
    ) {
      const val = (node as Record<string, unknown>)[
        this.settings.nodeSizeAttribute
      ];
      if (typeof val === "number" && Number.isFinite(val)) {
        const { min, max } = this.attributeRange;
        const t = (val - min) / (max - min);
        const scale = minScale + t * (maxScale - minScale);
        return Math.max(2, baseRadius * scale);
      }
    }

    return baseRadius;
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

  setContrastNodes(nodes: Set<string>): void {
    this.contrastNodes = nodes;
    this.scheduleRender();
  }

  setHoveredNodes(hoveredNodes: Set<string>): void {
    this.hoveredNodes = hoveredNodes;
    this.scheduleRender();
  }

  setNeighborhoodFocus(
    nodeId: string | null,
    adjacentNodes: Set<string>,
  ): void {
    this.neighborhoodFocusNode = nodeId;
    this.neighborhoodFocusAdjacentNodes = adjacentNodes;
    this.scheduleRender();
  }

  setPath(
    pathNodes: Set<string>,
    pathEdges: Array<{ source: string; target: string }>,
    paths: string[][] = [],
  ): void {
    this.pathNodes = pathNodes;
    this.paths = paths;
    this.constellationMode = pathNodes.size > 40;
    if (this.constellationMode) {
      this.pathEdges = [];
    } else if (pathEdges.length > 0) {
      this.pathEdges = pathEdges;
    } else if (paths.length > 0) {
      const seen = new Set<string>();
      const computed: Array<{ source: string; target: string }> = [];
      for (const path of paths) {
        for (let i = 0; i < path.length - 1; i++) {
          const key = `${path[i]}::${path[i + 1]}`;
          if (!seen.has(key)) {
            seen.add(key);
            computed.push({ source: path[i], target: path[i + 1] });
          }
        }
      }
      this.pathEdges = computed;
    } else {
      this.pathEdges = [];
    }
    this.scheduleRender();
  }

  setPinnedSelections(pins: Array<{ nodes: Set<string>; color: number }>): void {
    this.pinnedSelections = pins;
    this.scheduleRender();
  }

  setSettings(settings: VisualizationSettings): void {
    const attrChanged =
      settings.nodeSizeAttribute !== this.settings.nodeSizeAttribute ||
      settings.nodeSizeBy !== this.settings.nodeSizeBy;
    this.settings = settings;
    if (attrChanged) this.updateAttributeRange();
    this.scheduleRender();
  }

  setEmbeddings(embeddings: Map<string, [number, number]> | null): void {
    this.embeddings = embeddings;
    if (this.isEmbeddingView && embeddings) this.applyEmbeddingPositions();
    this.scheduleRender();
  }

  setEmbeddingView(isEmbeddingView: boolean): void {
    this.isEmbeddingView = isEmbeddingView;
    if (isEmbeddingView && this.embeddings) this.applyEmbeddingPositions();
    this.scheduleRender();
  }

  private applyEmbeddingPositions(): void {
    if (!this.embeddings) return;
    const coords: [number, number][] = Array.from(this.embeddings.values());
    if (coords.length === 0) return;

    const xExtent = [
      Math.min(...coords.map((c) => c[0])),
      Math.max(...coords.map((c) => c[0])),
    ];
    const yExtent = [
      Math.min(...coords.map((c) => c[1])),
      Math.max(...coords.map((c) => c[1])),
    ];

    const padding = 50;
    const xScale = (x: number) => {
      const range = xExtent[1] - xExtent[0];
      if (range === 0) return this.width / 2;
      return padding + ((x - xExtent[0]) * (this.width - 2 * padding)) / range;
    };
    const yScale = (y: number) => {
      const range = yExtent[1] - yExtent[0];
      if (range === 0) return this.height / 2;
      return padding + ((y - yExtent[0]) * (this.height - 2 * padding)) / range;
    };

    this.nodes.forEach((node) => {
      const embedding = this.embeddings!.get(node.id);
      if (embedding) {
        node.x = xScale(embedding[0]);
        node.y = yScale(embedding[1]);
      }
    });

    this.scheduleRender();
  }

  private getNodeColorByType(label: string, nodeData?: unknown): number {
    const nodeType = getNodeType(
      label,
      nodeData as Parameters<typeof getNodeType>[1],
    );
    return (
      NODE_TYPE_COLORS[nodeType as keyof typeof NODE_TYPE_COLORS] ??
      NODE_TYPE_COLORS.default
    );
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
    if (this.lassoGraphics) this.lassoGraphics.clear();
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
    const nodeSizeMultiplier =
      this.settings.nodeSize === "small"
        ? 0.6
        : this.settings.nodeSize === "medium"
          ? 1
          : this.settings.nodeSize === "large"
            ? 1.5
            : 1;
    const defaultNodeRadius = Math.max(
      2,
      Math.round(baseRadius * nodeSizeMultiplier),
    );
    const useVariableSize = this.settings.nodeSizeBy !== "fixed";

    if (lod !== this.lastLod) {
      this.lastLod = lod;
      this.labelsDirty = true;
    }

    const shouldShowEdges =
      this.settings.showEdges &&
      !this.isEmbeddingView &&
      (lod > 0 || this.edges.length < 50000);

    let visibleNodeCount = 0;
    if (lod === 3 || this.isEmbeddingView) {
      for (const node of this.nodes) {
        const nx = (node.x ?? 0) * k + x;
        const ny = (node.y ?? 0) * k + y;
        if (nx >= 0 && nx <= this.width && ny >= 0 && ny <= this.height) {
          visibleNodeCount++;
        }
      }
    }

    const autoShowLabels =
      (lod === 3 && visibleNodeCount < 200) ||
      (this.isEmbeddingView && this.nodes.length < 200);
    const showLabels =
      this.settings.showLabels === "always"
        ? true
        : this.settings.showLabels === "never"
          ? false
          : autoShowLabels;

    if (this.edgeGraphics) {
      this.edgeGraphics.clear();

      if (shouldShowEdges) {
        const baseAlpha =
          lod === 0 ? 0.25 : lod === 1 ? 0.48 : lod === 2 ? 0.68 : 0.85;
        const densityFactor = Math.max(
          0.2,
          Math.min(1.0, Math.sqrt(400 / (this.edges.length + 1))),
        );
        const edgeAlpha =
          (this.isEmbeddingView ? baseAlpha * 0.4 : baseAlpha) *
          densityFactor *
          this.settings.edgeOpacity;
        const baseWidth = lod === 0 ? 0.4 : lod === 1 ? 0.8 : 1.5;
        const edgeWidth = this.isEmbeddingView ? baseWidth * 0.6 : baseWidth;
        const edgeColor = this.isEmbeddingView ? 0x888888 : 0x94a3b8;

        const hasFocus = this.neighborhoodFocusNode !== null;
        const hasPathActive = this.pathNodes.size > 0;
        if (!hasFocus && !hasPathActive) {
          this.edgeGraphics.setStrokeStyle({
            width: edgeWidth,
            color: edgeColor,
            alpha: this._dimNonSelected ? edgeAlpha * 0.08 : edgeAlpha,
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
        } else if (hasFocus) {
          type EC = { x1: number; y1: number; x2: number; y2: number };
          const adjCoords: EC[] = [];
          const dimCoords: EC[] = [];
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
            const srcId = getId(edge.source);
            const tgtId = getId(edge.target);
            const isAdj =
              srcId === this.neighborhoodFocusNode ||
              tgtId === this.neighborhoodFocusNode;
            (isAdj ? adjCoords : dimCoords).push({ x1, y1, x2, y2 });
          }
          this.edgeGraphics.setStrokeStyle({
            width: edgeWidth,
            color: edgeColor,
            alpha: edgeAlpha * 0.08,
          });
          for (const { x1, y1, x2, y2 } of dimCoords) {
            this.edgeGraphics.moveTo(x1, y1);
            this.edgeGraphics.lineTo(x2, y2);
          }
          this.edgeGraphics.stroke();
          this.edgeGraphics.setStrokeStyle({
            width: Math.max(2, edgeWidth * 2.5),
            color: 0x888888,
            alpha: Math.min(1, edgeAlpha * 1.8),
          });
          for (const { x1, y1, x2, y2 } of adjCoords) {
            this.edgeGraphics.moveTo(x1, y1);
            this.edgeGraphics.lineTo(x2, y2);
          }
          this.edgeGraphics.stroke();
        } else {
          type EC = { x1: number; y1: number; x2: number; y2: number };
          const dimCoords: EC[] = [];
          const pathEdgeSet = new Set<string>();
          if (!this.constellationMode) {
            for (const e of this.pathEdges) {
              pathEdgeSet.add(`${e.source}::${e.target}`);
              pathEdgeSet.add(`${e.target}::${e.source}`);
            }
          }
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
            const srcId = getId(edge.source);
            const tgtId = getId(edge.target);
            if (this.constellationMode || !pathEdgeSet.has(`${srcId}::${tgtId}`)) {
              dimCoords.push({ x1, y1, x2, y2 });
            }
          }
          this.edgeGraphics.setStrokeStyle({
            width: edgeWidth,
            color: edgeColor,
            alpha: edgeAlpha * 0.1,
          });
          for (const { x1, y1, x2, y2 } of dimCoords) {
            this.edgeGraphics.moveTo(x1, y1);
            this.edgeGraphics.lineTo(x2, y2);
          }
          this.edgeGraphics.stroke();
        }

        if (this.selectedEdge) {
          const [srcId, tgtId] = this.selectedEdge.split("->");
          const source = this.nodeIndex.get(srcId);
          const target = this.nodeIndex.get(tgtId);
          if (source && target) {
            this.edgeGraphics.setStrokeStyle({
              width: 3,
              color: PIXI_COLORS.BLUE,
            });
            this.edgeGraphics.moveTo(
              (source.x ?? 0) * k + x,
              (source.y ?? 0) * k + y,
            );
            this.edgeGraphics.lineTo(
              (target.x ?? 0) * k + x,
              (target.y ?? 0) * k + y,
            );
            this.edgeGraphics.stroke();
          }
        }
      }
    }

    if (this.batchGraphics && this.dimmedBatch) {
      this.batchGraphics.clear();
      this.dimmedBatch.clear();

      const hasFocusNodes = this.neighborhoodFocusNode !== null;
      const hasPathNodes = this.pathNodes.size > 0;
      this.dimmedBatch.visible = hasFocusNodes || hasPathNodes;
      this.dimmedBatch.alpha = hasFocusNodes ? 0.12 : 0.18;

      if (!this.nodesByTypeCache) {
        this.nodesByTypeCache = new Map<string, D3Node[]>();
        for (const node of this.nodes) {
          const nodeType = getNodeType(node.label || "", node);
          if (!this.nodesByTypeCache.has(nodeType))
            this.nodesByTypeCache.set(nodeType, []);
          this.nodesByTypeCache.get(nodeType)!.push(node);
        }
      }

      for (const [nodeType, typeNodes] of this.nodesByTypeCache) {
        const nodeColor =
          NODE_TYPE_COLORS[nodeType as keyof typeof NODE_TYPE_COLORS];

        for (const node of typeNodes) {
          const nx = (node.x ?? 0) * k + x;
          const ny = (node.y ?? 0) * k + y;
          const radius = useVariableSize
            ? this.getNodeRadius(node, defaultNodeRadius)
            : defaultNodeRadius;

          if (nx < -radius || nx > this.width + radius) continue;
          if (ny < -radius || ny > this.height + radius) continue;

          if (this.selectedNodes.has(node.id)) continue;
          if (this.contrastNodes.has(node.id)) continue;
          if (this.hoveredNodes.has(node.id)) continue;
          if (node.id === this.neighborhoodFocusNode) continue;

          const dimThisNode =
            (hasFocusNodes && !this.neighborhoodFocusAdjacentNodes.has(node.id)) ||
            (hasPathNodes && !this.pathNodes.has(node.id));
          const targetBatch = dimThisNode ? this.dimmedBatch : this.batchGraphics;

          targetBatch.circle(nx, ny, radius);
          targetBatch.fill(this._dimNonSelected ? 0xd1d5db : nodeColor);
        }
      }
    }

    if (this.pinnedGraphics) {
      this.pinnedGraphics.clear();
      if (this.pinnedSelections.length > 0) {
        for (let pinIdx = 0; pinIdx < this.pinnedSelections.length; pinIdx++) {
          const pin = this.pinnedSelections[pinIdx];
          const ringOffset = (pinIdx + 1) * 4;
          for (const nodeId of pin.nodes) {
            const node = this.nodeIndex.get(nodeId);
            if (!node) continue;
            const nx = (node.x ?? 0) * k + x;
            const ny = (node.y ?? 0) * k + y;
            const radius = useVariableSize
              ? this.getNodeRadius(node, defaultNodeRadius)
              : defaultNodeRadius;
            this.pinnedGraphics.circle(nx, ny, radius + ringOffset);
            this.pinnedGraphics.stroke({ width: 2, color: pin.color, alpha: 0.6 });
          }
        }
      }
    }

    if (this.selectionGraphics) {
      this.selectionGraphics.clear();
      const HOVER_ORANGE = PIXI_COLORS.HOVER_ORANGE;

      if (
        this.neighborhoodFocusNode &&
        !this.selectedNodes.has(this.neighborhoodFocusNode)
      ) {
        const focusNode = this.nodeIndex.get(this.neighborhoodFocusNode);
        if (focusNode) {
          const nx = (focusNode.x ?? 0) * k + x;
          const ny = (focusNode.y ?? 0) * k + y;
          const radius = useVariableSize
            ? this.getNodeRadius(focusNode, defaultNodeRadius)
            : defaultNodeRadius;
          this.selectionGraphics.circle(nx, ny, radius);
          this.selectionGraphics.fill(HOVER_ORANGE);
          this.selectionGraphics.circle(nx, ny, radius + 3);
          this.selectionGraphics.stroke({ width: 2, color: HOVER_ORANGE });
        }
      }

      for (const nodeId of this.hoveredNodes) {
        if (this.selectedNodes.has(nodeId)) continue;
        const node = this.nodeIndex.get(nodeId);
        if (!node) continue;
        const nx = (node.x ?? 0) * k + x;
        const ny = (node.y ?? 0) * k + y;
        const radius = useVariableSize
          ? this.getNodeRadius(node, defaultNodeRadius)
          : defaultNodeRadius;
        this.selectionGraphics.circle(nx, ny, radius);
        this.selectionGraphics.fill(HOVER_ORANGE);
        this.selectionGraphics.circle(nx, ny, radius + 3);
        this.selectionGraphics.stroke({ width: 2, color: HOVER_ORANGE });
      }

      for (const nodeId of this.contrastNodes) {
        if (this.selectedNodes.has(nodeId)) continue;
        const node = this.nodeIndex.get(nodeId);
        if (!node) continue;
        const nx = (node.x ?? 0) * k + x;
        const ny = (node.y ?? 0) * k + y;
        const nodeColor = this.getNodeColorByType(node.label || "", node);
        const radius = useVariableSize
          ? this.getNodeRadius(node, defaultNodeRadius)
          : defaultNodeRadius;
        this.selectionGraphics.circle(nx, ny, radius);
        this.selectionGraphics.fill(nodeColor);
        this.selectionGraphics.circle(nx, ny, radius + 3);
        this.selectionGraphics.stroke({
          width: 2,
          color: PIXI_COLORS.CONTRAST_AMBER,
        });
      }

      for (const nodeId of this.selectedNodes) {
        const node = this.nodeIndex.get(nodeId);
        if (!node) continue;
        const nx = (node.x ?? 0) * k + x;
        const ny = (node.y ?? 0) * k + y;
        const nodeColor = this.getNodeColorByType(node.label || "", node);
        const radius = useVariableSize
          ? this.getNodeRadius(node, defaultNodeRadius)
          : defaultNodeRadius;
        this.selectionGraphics.circle(nx, ny, radius);
        this.selectionGraphics.fill(nodeColor);
        this.selectionGraphics.circle(nx, ny, radius + 3);
        this.selectionGraphics.stroke({ width: 2, color: PIXI_COLORS.BLUE });
      }
    }

    if (this.pathEdgeGraphics) {
      this.pathEdgeGraphics.clear();
    }
    if (this.pathGraphics) {
      this.pathGraphics.clear();
    }

    if (this.pathNodes.size > 0) {
      const edgesToDraw = this.constellationMode
        ? []
        : this.pathEdges.length > 0
          ? this.pathEdges
          : this.paths.flatMap((path) =>
              path
                .slice(0, -1)
                .map((source, i) => ({ source, target: path[i + 1] })),
            );

      if (edgesToDraw.length > 0 && this.pathEdgeGraphics) {
        type EC = { x1: number; y1: number; x2: number; y2: number };
        const edgeCoords: EC[] = [];

        for (const edge of edgesToDraw) {
          const source = this.nodeIndex.get(edge.source);
          const target = this.nodeIndex.get(edge.target);
          if (!source || !target) continue;
          edgeCoords.push({
            x1: (source.x ?? 0) * k + x,
            y1: (source.y ?? 0) * k + y,
            x2: (target.x ?? 0) * k + x,
            y2: (target.y ?? 0) * k + y,
          });
        }

        if (edgeCoords.length > 0) {
          for (const { x1, y1, x2, y2 } of edgeCoords) {
            this.pathEdgeGraphics.moveTo(x1, y1);
            this.pathEdgeGraphics.lineTo(x2, y2);
          }
          this.pathEdgeGraphics.stroke({ width: 8, color: PIXI_COLORS.PATH_COLOR, alpha: 0.15 });

          for (const { x1, y1, x2, y2 } of edgeCoords) {
            this.pathEdgeGraphics.moveTo(x1, y1);
            this.pathEdgeGraphics.lineTo(x2, y2);
          }
          this.pathEdgeGraphics.stroke({ width: 3, color: PIXI_COLORS.PATH_COLOR, alpha: 0.85 });
        }
      }

      if (this.pathGraphics) {
        for (const nodeId of this.pathNodes) {
          const node = this.nodeIndex.get(nodeId);
          if (!node) continue;
          const nx = (node.x ?? 0) * k + x;
          const ny = (node.y ?? 0) * k + y;
          const basePathRadius = useVariableSize
            ? this.getNodeRadius(node, defaultNodeRadius)
            : defaultNodeRadius;

          if (this.selectedNodes.has(nodeId)) {
            this.pathGraphics.circle(nx, ny, basePathRadius + 6);
            this.pathGraphics.stroke({ width: 3, color: PIXI_COLORS.PATH_COLOR, alpha: 1.0 });
          } else {
            this.pathGraphics.circle(nx, ny, basePathRadius + 5);
            this.pathGraphics.stroke({ width: 3, color: PIXI_COLORS.PATH_COLOR, alpha: 1.0 });
          }
        }
      }
    }

    if (this.labelContainer) {
      if (showLabels) {
        const visibleNodes: { node: D3Node; nx: number; ny: number; radius: number }[] = [];
        for (const node of this.nodes) {
          const nx = (node.x ?? 0) * k + x;
          const ny = (node.y ?? 0) * k + y;
          if (nx < 0 || nx > this.width || ny < 0 || ny > this.height) continue;
          const radius = useVariableSize
            ? this.getNodeRadius(node, defaultNodeRadius)
            : defaultNodeRadius;
          visibleNodes.push({ node, nx, ny, radius });
        }

        while (this.labelPool.length < visibleNodes.length) {
          const text = new PIXI.Text({
            text: "",
            style: { fontSize: 10, fill: 0x374151, fontFamily: "sans-serif" },
          });
          text.anchor.set(0.5, 0);
          this.labelContainer.addChild(text);
          this.labelPool.push(text);
        }

        for (let i = 0; i < visibleNodes.length; i++) {
          const { node, nx, ny, radius } = visibleNodes[i];
          const labelText = (node.label || node.id).slice(0, 15);
          const poolEntry = this.labelPool[i];
          if (this.labelsDirty || poolEntry.text !== labelText) {
            poolEntry.text = labelText;
          }
          poolEntry.position.set(nx, ny + radius + 3);
          poolEntry.visible = true;
        }

        for (let i = visibleNodes.length; i < this.activeLabelCount; i++) {
          this.labelPool[i].visible = false;
        }

        this.activeLabelCount = visibleNodes.length;
        this.labelsDirty = false;
      } else {
        for (let i = 0; i < this.activeLabelCount; i++) {
          this.labelPool[i].visible = false;
        }
        this.activeLabelCount = 0;
      }
    }
  }

  getCanvas(): HTMLCanvasElement | null {
    if (!this.isReady()) return null;
    return this.app?.canvas ?? null;
  }

  exportHighRes(scale: number = 2, selectedOnly: boolean = false, dimBackground: boolean = false): HTMLCanvasElement | null {
    if (!this.isReady() || !this.app) return null;

    const savedTransform = { ...this.transform };
    const savedSettings = { ...this.settings };
    const savedNodes = this.nodes;
    const savedEdges = this.edges;
    const savedNodeIndex = this.nodeIndex;
    const savedSelectedNodes = this.selectedNodes;
    const savedNodesByTypeCache = this.nodesByTypeCache;

    if (selectedOnly && this.selectedNodes.size > 0) {
      const filteredNodes = this.nodes.filter((n) => this.selectedNodes.has(n.id));
      const filteredSet = new Set(filteredNodes.map((n) => n.id));
      const filteredEdges = this.edges.filter((e) => {
        const src = getId(e.source);
        const tgt = getId(e.target);
        return filteredSet.has(src) && filteredSet.has(tgt);
      });
      this.nodes = filteredNodes;
      this.edges = filteredEdges;
      this.nodeIndex = new Map(filteredNodes.map((n) => [n.id, n]));
      this.nodesByTypeCache = null;
      this.computeDegreeMap();
      this.updateAttributeRange();
      this.selectedNodes = new Set();
    }

    const fitTransform = this.getCenterViewTransform();
    if (fitTransform) {
      this.transform = fitTransform;
    }

    this._dimNonSelected = dimBackground && this.selectedNodes.size > 0;

    this.needsRender = true;
    this.render();

    let exportCanvas: HTMLCanvasElement | null = null;
    try {
      exportCanvas = this.app.renderer.extract.canvas({
        target: this.app.stage,
        resolution: scale,
      }) as HTMLCanvasElement;
    } catch {
    }

    this._dimNonSelected = false;

    if (selectedOnly && savedNodes !== this.nodes) {
      this.nodes = savedNodes;
      this.edges = savedEdges;
      this.nodeIndex = savedNodeIndex;
      this.nodesByTypeCache = savedNodesByTypeCache;
      this.computeDegreeMap();
      this.updateAttributeRange();
      this.selectedNodes = savedSelectedNodes;
    }

    this.transform = savedTransform;
    this.settings = savedSettings;
    this.needsRender = true;
    this.render();

    return exportCanvas;
  }
}
