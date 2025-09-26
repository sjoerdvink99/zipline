import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as d3 from "d3";
import * as PIXI from "pixi.js";
import { isAbortedRequest } from "../../api";
import { computeUmap } from "../../api/attributes";
import type { UmapResponse } from "../../api/attributes";
import { useAnalysisStore } from "../../store/analysisStore";
import { PIXI_COLORS, NODE_TYPE_COLORS, getNodeType } from "../../config/pixiColors";
import { buildQuadtree, findNodeAt, findNodesInPolygon, type QuadtreeNode } from "../../utils/quadtree";
import { createCanvasZoom, createDataToScreenTransform, type ZoomTransform } from "../../utils/zoom";

interface UmapVisualizationProps {
  className?: string;
}

interface UmapControls {
  n_neighbors: number;
  min_dist: number;
  metric: string;
}

interface UmapNode {
  id: string;
  label: string;
  x: number;
  y: number;
  originalX: number; // UMAP coordinates
  originalY: number; // UMAP coordinates
}


class UmapRenderer {
  private app: PIXI.Application | null = null;
  private nodeContainer: PIXI.Container | null = null;
  private selectionGraphics: PIXI.Graphics | null = null;
  private lassoGraphics: PIXI.Graphics | null = null;
  private labelContainer: PIXI.Container | null = null;

  private nodes: UmapNode[] = [];
  private nodeIndex: Map<string, UmapNode> = new Map();
  private selectedNodes: Set<string> = new Set();
  private hoveredNodes: Set<string> = new Set();

  private transform = { x: 0, y: 0, k: 1 };
  private width = 800;
  private height = 600;

  private needsRender = false;
  private renderScheduled = false;
  private isInitialized = false;
  private isDestroyed = false;
  private container: HTMLDivElement | null = null;

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

      this.nodeContainer = new PIXI.Container();
      this.selectionGraphics = new PIXI.Graphics();
      this.lassoGraphics = new PIXI.Graphics();
      this.labelContainer = new PIXI.Container();

      this.app.stage.addChild(this.nodeContainer);
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

    this.nodeContainer = null;
    this.selectionGraphics = null;
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

  setData(nodes: UmapNode[]): void {
    this.nodes = nodes;
    this.nodeIndex.clear();
    for (const node of nodes) {
      this.nodeIndex.set(node.id, node);
    }
    this.scheduleRender();
  }

  setTransform(x: number, y: number, k: number): void {
    this.transform = { x, y, k };
    this.scheduleRender();
  }

  setSelection(selectedNodes: Set<string>): void {
    this.selectedNodes = selectedNodes;
    this.scheduleRender();
  }

  setHoveredNodes(hoveredNodes: Set<string>): void {
    this.hoveredNodes = hoveredNodes;
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
    const nodeRadius = Math.max(4, Math.round(8 * Math.min(k, 1)));

    if (this.nodeContainer) {
      this.nodeContainer.removeChildren();

      const batchGraphics = new PIXI.Graphics();

      const nodesByType = new Map<string, UmapNode[]>();
      for (const node of this.nodes) {
        const nodeType = getNodeType(node.label || '');
        if (!nodesByType.has(nodeType)) nodesByType.set(nodeType, []);
        nodesByType.get(nodeType)!.push(node);
      }

      for (const [nodeType, typeNodes] of nodesByType) {
        const nodeColor = NODE_TYPE_COLORS[nodeType as keyof typeof NODE_TYPE_COLORS];

        for (const node of typeNodes) {
          const nx = node.x * k + x;
          const ny = node.y * k + y;

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

      for (const nodeId of this.hoveredNodes) {
        if (this.selectedNodes.has(nodeId)) continue;

        const node = this.nodeIndex.get(nodeId);
        if (!node) continue;

        const nx = node.x * k + x;
        const ny = node.y * k + y;

        this.selectionGraphics.circle(nx, ny, nodeRadius);
        this.selectionGraphics.fill(PIXI_COLORS.HOVER_ORANGE);

        this.selectionGraphics.circle(nx, ny, nodeRadius + 3);
        this.selectionGraphics.stroke({ width: 2, color: PIXI_COLORS.HOVER_ORANGE });
      }

      for (const nodeId of this.selectedNodes) {
        const node = this.nodeIndex.get(nodeId);
        if (!node) continue;

        const nx = node.x * k + x;
        const ny = node.y * k + y;

        const nodeType = getNodeType(node.label || '');
        const nodeColor = NODE_TYPE_COLORS[nodeType as keyof typeof NODE_TYPE_COLORS];

        this.selectionGraphics.circle(nx, ny, nodeRadius);
        this.selectionGraphics.fill(nodeColor);

        this.selectionGraphics.circle(nx, ny, nodeRadius + 3);
        this.selectionGraphics.stroke({ width: 2, color: PIXI_COLORS.BLUE });
      }
    }
  }

  getCanvas(): HTMLCanvasElement | null {
    if (!this.isReady()) return null;
    return this.app?.canvas ?? null;
  }
}

export const UmapVisualization = ({ className = "" }: UmapVisualizationProps) => {
  const { selectedNodes, setSelection } = useAnalysisStore();

  const [umapData, setUmapData] = useState<UmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState<UmapControls>({
    n_neighbors: 15,
    min_dist: 0.1,
    metric: "euclidean"
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<UmapRenderer | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const transformRef = useRef<ZoomTransform>({ x: 0, y: 0, k: 1 });
  const quadtreeRef = useRef<d3.Quadtree<QuadtreeNode<UmapNode>> | null>(null);

  const [rendererReady, setRendererReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const isLassoingRef = useRef(false);
  const justFinishedDrawingRef = useRef(false);
  const lassoPtsRef = useRef<[number, number][]>([]);

  const fetchUmapData = useCallback(async (params: UmapControls, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const result = await computeUmap("default", {
        ...params,
        n_components: 2
      });

      if (!signal?.aborted) {
        setUmapData(result);
      }
    } catch (err: unknown) {
      if (!isAbortedRequest(err) && !signal?.aborted) {
        console.error("Failed to compute UMAP:", err);
        const errorMessage = err && typeof err === 'object' && 'response' in err &&
          err.response && typeof err.response === 'object' && 'data' in err.response &&
          err.response.data && typeof err.response.data === 'object' && 'detail' in err.response.data
          ? String(err.response.data.detail)
          : "Failed to compute UMAP";
        setError(errorMessage);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    fetchUmapData(controls, abortRef.current.signal);

    const handleGraphSwitch = () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      fetchUmapData(controls, abortRef.current.signal);
    };

    window.addEventListener("gb:graph-switched", handleGraphSwitch);
    return () => {
      abortRef.current?.abort();
      window.removeEventListener("gb:graph-switched", handleGraphSwitch);
    };
  }, [fetchUmapData, controls]);

  const handleControlChange = useCallback((newControls: Partial<UmapControls>) => {
    setControls(prev => ({ ...prev, ...newControls }));
  }, []);

  const nodes = useMemo(() => {
    if (!umapData || !umapData.embedding || !umapData.node_ids || !umapData.node_labels) {
      return [];
    }

    const width = containerRef.current?.clientWidth || 400;
    const height = containerRef.current?.clientHeight || 400;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const point of umapData.embedding) {
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]);
      maxY = Math.max(maxY, point[1]);
    }

    const padding = 50;
    const scaleX = (width - 2 * padding) / (maxX - minX);
    const scaleY = (height - 2 * padding) / (maxY - minY);
    const scale = Math.min(scaleX, scaleY);

    return umapData.embedding.map((point, idx): UmapNode => ({
      id: umapData.node_ids[idx],
      label: umapData.node_labels[idx],
      originalX: point[0],
      originalY: point[1],
      x: (point[0] - minX) * scale + padding + (width - (maxX - minX) * scale) / 2,
      y: (point[1] - minY) * scale + padding + (height - (maxY - minY) * scale) / 2,
    }));
  }, [umapData]);

  useEffect(() => {
    if (!containerRef.current || loading || !umapData) return;

    const container = containerRef.current;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    const renderer = new UmapRenderer();
    rendererRef.current = renderer;

    let isMounted = true;

    renderer.init(container, width, height).then((success) => {
      if (!isMounted) return;

      if (success) {
        setRendererReady(true);
        if (nodes.length > 0) {
          renderer.setData(nodes);
          quadtreeRef.current = buildQuadtree(nodes);
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
  }, [loading, umapData]);

  useEffect(() => {
    if (rendererReady && rendererRef.current?.isReady() && nodes.length > 0) {
      rendererRef.current.setData(nodes);
      quadtreeRef.current = buildQuadtree(nodes);
    }
  }, [nodes, rendererReady]);

  useEffect(() => {
    if (rendererReady && rendererRef.current?.isReady()) {
      rendererRef.current.setSelection(new Set(selectedNodes));
    }
  }, [selectedNodes, rendererReady]);

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
    if (!rendererReady || !rendererRef.current?.isReady()) return;

    const renderer = rendererRef.current;
    const canvas = renderer.getCanvas();
    if (!canvas) return;

    const toData = (clientX: number, clientY: number): [number, number] => {
      return createDataToScreenTransform(clientX, clientY, canvas, transformRef.current);
    };

    const zoom = createCanvasZoom([0.1, 10], (transform) => {
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
          if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
            const newSelection = selectedNodes.includes(node.id)
              ? selectedNodes.filter(id => id !== node.id)
              : [...selectedNodes, node.id];
            setSelection(newSelection, "umap");
          } else {
            setSelection([node.id], "umap");
          }
        } else if (!ev.shiftKey) {
          setSelection([], null);
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

          if (ev.ctrlKey || ev.metaKey) {
            const newIds = selected.map((n) => n.id);
            const combined = new Set([...selectedNodes, ...newIds]);
            setSelection(Array.from(combined), "umap");
          } else {
            setSelection(selected.map((n) => n.id), "umap");
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
  }, [rendererReady, selectedNodes, setSelection]);

  if (loading) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex items-center justify-center flex-1 py-12">
          <div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-gray-600 rounded-full" />
          <span className="ml-3 text-sm text-gray-600">Computing UMAP...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
          <div className="p-4 bg-red-100 rounded-full mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-sm text-red-700 font-semibold mb-1">UMAP computation failed</p>
          <p className="text-xs text-red-600">{error}</p>
          <button
            onClick={() => fetchUmapData(controls)}
            className="mt-4 px-3 py-2 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!umapData) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex items-center justify-center flex-1 py-12">
          <p className="text-sm text-gray-500">No UMAP data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full relative overflow-hidden bg-gray-50 ${className}`}>
      <div
        ref={containerRef}
        className="absolute inset-0 bg-gray-50 overflow-hidden"
      >
        {(loading || !rendererReady) && (
          <div className="absolute inset-0 flex items-center gap-2 justify-center text-xs text-gray-400 z-20 bg-gray-50">
            <div className="animate-spin h-3 w-3 border border-gray-300 border-t-gray-600 rounded-full" />
            <span>
              {loading ? "Computing UMAP..." : "Initializing renderer..."}
            </span>
          </div>
        )}
        {rendererReady && (
          <>
            
            <div className="absolute top-3 left-3 z-10">
              <div className="bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-gray-100 text-[10px] text-gray-500">
                {nodes.length.toLocaleString()} nodes
              </div>
            </div>

            
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
              <div className="relative" ref={settingsRef}>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="flex items-center justify-center w-6 h-6 bg-white/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                  title="UMAP settings"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                </button>
                {showSettings && (
                  <div className="absolute top-8 right-0 bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[180px] z-20">
                    <div className="text-[11px] font-medium text-gray-700 mb-2">UMAP Settings</div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Neighbors</label>
                        <input
                          type="range"
                          min="2"
                          max="50"
                          value={controls.n_neighbors}
                          onChange={(e) => handleControlChange({ n_neighbors: parseInt(e.target.value) })}
                          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="text-xs text-gray-500 mt-1 text-center">{controls.n_neighbors}</div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Min Distance</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={controls.min_dist}
                          onChange={(e) => handleControlChange({ min_dist: parseFloat(e.target.value) })}
                          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="text-xs text-gray-500 mt-1 text-center">{controls.min_dist}</div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Metric</label>
                        <select
                          value={controls.metric}
                          onChange={(e) => handleControlChange({ metric: e.target.value })}
                          className="w-full text-[10px] border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value="euclidean">Euclidean</option>
                          <option value="manhattan">Manhattan</option>
                          <option value="cosine">Cosine</option>
                          <option value="correlation">Correlation</option>
                        </select>
                      </div>
                      {umapData && umapData.feature_names.length > 0 && (
                        <div className="pt-2 border-t border-gray-200">
                          <p className="text-[9px] text-gray-600">
                            <span className="font-medium">Features:</span> {umapData.feature_names.join(", ")}
                          </p>
                        </div>
                      )}
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