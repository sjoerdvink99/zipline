import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { select } from "d3-selection";
import "d3-transition";
import { zoomIdentity, type ZoomBehavior } from "d3-zoom";
import type { Simulation } from "d3-force";
import type { Quadtree } from "d3-quadtree";
import type { D3Node, D3Edge, SelectionKind } from "../../../types";
import {
  buildQuadtree,
  findNodeAt,
  findNodesInPolygon,
  type QuadtreeNode,
} from "../../../utils/quadtree";
import {
  createCanvasZoom,
  createDataToScreenTransform,
  type ZoomTransform,
} from "../../../utils/zoom";
import { useAnalysisStore } from "../../../store/analysisStore";
import { useGraphDataStore } from "../../../store/graphDataStore";
import { PathSelectionButton } from "../../topology/PathSelectionButton";
import { usePathSelection } from "../../../hooks/usePathSelection";
import {
  GraphRenderer,
  DEFAULT_SETTINGS,
  type VisualizationSettings,
} from "./GraphRenderer";
import { GraphToolbar } from "./GraphToolbar";
import { ExportModal } from "./ExportModal";
import { NodeTooltip } from "./NodeTooltip";
import {
  computeGraphHash,
  runStableForceLayout,
  runForceAtlas2Layout,
  applyGridLayout,
  applyCircleLayout,
  applyRadialByCluster,
  applyKPartiteLayout,
  type LayoutAlgo,
  type FA2LayoutHandle,
} from "../../../utils/graphLayout";
import { getNodeType, PIN_COLORS } from "../../../config/pixiColors";

interface GraphViewProps {
  onSelectionChange?: (
    kind: SelectionKind,
    hasSelection: boolean,
    nodes: string[],
    edge: string | null,
  ) => void;
  externalSelectedNodes?: string[];
  hoveredNodes?: string[];
}

export const GraphView = ({
  onSelectionChange,
  externalSelectedNodes,
  hoveredNodes,
}: GraphViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);

  const {
    nodes,
    edges,
    nodeIndex,
    adjacencyMap,
    legendData,
    numericAttributes,
    loading,
    graphHash: storeHash,
    isLayoutComplete: storeLayoutComplete,
    setLayoutComplete,
    setSavedViewport,
  } = useGraphDataStore();

  const pathSelection = useAnalysisStore((s) => s.pathSelection);
  const contrastMode = useAnalysisStore((s) => s.contrastMode);
  const contrastNodes = useAnalysisStore((s) => s.contrastNodes);
  const activeSlot = useAnalysisStore((s) => s.activeSlot);
  const pinnedSelections = useAnalysisStore((s) => s.pinnedSelections);
  const pinSelection = useAnalysisStore((s) => s.pinSelection);
  const storeSelectedNodes = useAnalysisStore((s) => s.selectedNodes);
  const clearSelection = useAnalysisStore((s) => s.clearSelection);
  const {
    pathAnchorNodes,
    canFindPaths,
    isLoadingPaths,
    pathError,
    findPaths,
    clearPathSelection,
  } = usePathSelection();

  const [rendererReady, setRendererReady] = useState(false);
  const [debugStatus, setDebugStatus] = useState<string>("Initializing...");

  const [layout, setLayout] = useState<LayoutAlgo>("force");
  const [kPartiteOrientation, setKPartiteOrientation] = useState<
    "horizontal" | "vertical"
  >("horizontal");
  const [selNodes, setSelNodes] = useState<string[]>([]);
  const [selEdge, setSelEdge] = useState<string | null>(null);

  const transformRef = useRef<ZoomTransform>({ x: 0, y: 0, k: 1 });
  const drawingRef = useRef(false);
  const isLassoingRef = useRef(false);
  const justFinishedDrawingRef = useRef(false);
  const lassoPtsRef = useRef<[number, number][]>([]);
  const quadtreeRef = useRef<Quadtree<QuadtreeNode<D3Node>> | null>(null);
  const nodeIndexRef = useRef<Map<string, D3Node>>(nodeIndex);
  const simulationRef = useRef<Simulation<D3Node, D3Edge> | null>(null);
  const fa2Ref = useRef<FA2LayoutHandle | null>(null);
  const isExternalSelectionRef = useRef(false);
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  });
  const adjacencyMapRef = useRef<Map<string, Set<string>>>(adjacencyMap);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverNodeRef = useRef<string | null>(null);
  const [tooltipNode, setTooltipNode] = useState<D3Node | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<
    HTMLCanvasElement,
    unknown
  > | null>(null);

  const handleClearPath = useCallback(() => {
    clearPathSelection();
    clearSelection();
  }, [clearPathSelection, clearSelection]);

  const [brushedPath, setBrushedPath] = useState<string[]>([]);
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [settings, setSettings] =
    useState<VisualizationSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    nodeIndexRef.current = nodeIndex;
  }, [nodeIndex]);

  useEffect(() => {
    adjacencyMapRef.current = adjacencyMap;
  }, [adjacencyMap]);

  const selectedNodesSet = useMemo(() => new Set(selNodes), [selNodes]);
  const contrastNodesSet = useMemo(
    () => new Set(contrastNodes),
    [contrastNodes],
  );

  const rendererSelectedNodes = useMemo(
    () =>
      contrastMode && externalSelectedNodes && externalSelectedNodes.length > 0
        ? new Set(externalSelectedNodes)
        : selectedNodesSet,
    [contrastMode, externalSelectedNodes, selectedNodesSet],
  );

  const neighborTypes = useMemo(() => {
    if (selNodes.length === 0) return [];
    const selSet = new Set(selNodes);
    const typeCounts = new Map<string, number>();
    for (const nodeId of selNodes) {
      const neighbors = adjacencyMap.get(nodeId);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (selSet.has(neighbor)) continue;
        const node = nodeIndex.get(neighbor);
        if (!node) continue;
        const type = getNodeType(node.label, {
          node_type: node.node_type as string | undefined,
          type: node.type as string | undefined,
        });
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      }
    }
    const typeColorMap = new Map<string, number>(
      legendData.map(({ type, color }) => [type, color]),
    );
    return Array.from(typeCounts.entries())
      .map(([type, count]) => ({
        type,
        count,
        color: typeColorMap.get(type) ?? 0x94a3b8,
      }))
      .sort((a, b) => b.count - a.count);
  }, [selNodes, adjacencyMap, nodeIndex, legendData]);

  const expandSelection = useCallback(
    (typeFilter?: string | null) => {
      if (selNodes.length === 0) return;
      if (typeFilter) {
        const expanded = new Set<string>();
        for (const nodeId of selNodes) {
          const neighbors = adjacencyMap.get(nodeId);
          if (!neighbors) continue;
          for (const neighbor of neighbors) {
            const node = nodeIndex.get(neighbor);
            if (!node) continue;
            const type = getNodeType(node.label, {
              node_type: node.node_type as string | undefined,
              type: node.type as string | undefined,
            });
            if (type === typeFilter) expanded.add(neighbor);
          }
        }
        setSelNodes(Array.from(expanded));
      } else {
        const expanded = new Set(selNodes);
        for (const nodeId of selNodes) {
          const neighbors = adjacencyMap.get(nodeId);
          if (neighbors) {
            for (const neighbor of neighbors) expanded.add(neighbor);
          }
        }
        setSelNodes(Array.from(expanded));
      }
    },
    [selNodes, adjacencyMap, nodeIndex],
  );

  const selectionKind = useMemo<SelectionKind>(() => {
    if (brushedPath.length >= 2) return "path";
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
    const cb = onSelectionChangeRef.current;
    if (cb) {
      const hasSelected =
        selectionKind === "path"
          ? brushedPath.length >= 2
          : selectionKind === "edge"
            ? !!selEdge
            : selNodes.length > 0;
      cb(selectionKind, hasSelected, selNodes, selEdge);
    }
  }, [selectionKind, selNodes, selEdge, brushedPath]);

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
      } else {
        setDebugStatus("WebGL renderer failed to initialize");
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0 && renderer.isReady()) {
          renderer.resize(w, h);
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
    return () => {
      setSavedViewport({ ...transformRef.current });
    };
  }, [setSavedViewport]);

  useEffect(() => {
    simulationRef.current?.stop();
    simulationRef.current = null;
    fa2Ref.current?.stop();
    fa2Ref.current = null;
  }, []);

  useEffect(() => {
    if (loading || !rendererReady || nodes.length === 0) return;

    const renderer = rendererRef.current;
    if (!renderer || !renderer.isReady()) return;

    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const currentHash = computeGraphHash(nodes, edges);
    const needsLayoutRecompute =
      storeHash !== currentHash || !storeLayoutComplete;

    if (layout === "force") {
      fa2Ref.current?.stop();
      fa2Ref.current = null;

      if (needsLayoutRecompute) {
        simulationRef.current?.stop();

        setIsLayoutRunning(true);

        let forceTick = 0;
        const onTick = () => {
          forceTick++;
          if (nodes.length <= 5000 || forceTick % 5 === 0) {
            quadtreeRef.current = buildQuadtree(nodes);
          }
          if (rendererRef.current?.isReady()) {
            rendererRef.current.updatePositions();
          }
        };

        const onEnd = () => {
          setLayoutComplete(currentHash, true);
          setIsLayoutRunning(false);
          quadtreeRef.current = buildQuadtree(nodes);
          if (rendererRef.current?.isReady()) {
            rendererRef.current.setGraphData(nodes, edges, nodeIndexRef.current);
          }
        };

        simulationRef.current = runStableForceLayout({
          nodes,
          edges,
          width,
          height,
          onTick,
          onEnd,
        });
      } else {
        quadtreeRef.current = buildQuadtree(nodes);
        renderer.setGraphData(nodes, edges, nodeIndexRef.current);
      }
    } else if (layout === "forceatlas2") {
      simulationRef.current?.stop();
      simulationRef.current = null;
      fa2Ref.current?.stop();
      fa2Ref.current = null;

      if (needsLayoutRecompute) {
        setIsLayoutRunning(true);

        let fa2Tick = 0;
        const onTick = () => {
          fa2Tick++;
          if (nodes.length <= 5000 || fa2Tick % 5 === 0) {
            quadtreeRef.current = buildQuadtree(nodes);
          }
          if (rendererRef.current?.isReady()) {
            rendererRef.current.updatePositions();
          }
        };

        const onEnd = () => {
          setLayoutComplete(currentHash, true);
          setIsLayoutRunning(false);
          quadtreeRef.current = buildQuadtree(nodes);
          if (rendererRef.current?.isReady()) {
            rendererRef.current.setGraphData(nodes, edges, nodeIndexRef.current);
            rendererRef.current.requestCenterView();
          }
        };

        fa2Ref.current = runForceAtlas2Layout({
          nodes,
          edges,
          width,
          height,
          onTick,
          onEnd,
        });
      } else {
        quadtreeRef.current = buildQuadtree(nodes);
        renderer.setGraphData(nodes, edges, nodeIndexRef.current);
      }
    } else {
      simulationRef.current?.stop();
      simulationRef.current = null;
      fa2Ref.current?.stop();
      fa2Ref.current = null;

      if (layout === "grid") applyGridLayout(nodes, width, height);
      else if (layout === "circle") applyCircleLayout(nodes, width, height);
      else if (layout === "kpartite")
        applyKPartiteLayout(nodes, width, height, kPartiteOrientation);
      else applyRadialByCluster(nodes, edges, width, height);

      setLayoutComplete(currentHash, true);
      quadtreeRef.current = buildQuadtree(nodes);
      renderer.setData(nodes, edges, nodeIndexRef.current);
    }

    return () => {
      simulationRef.current?.stop();
      fa2Ref.current?.stop();
    };
  }, [
    nodes,
    edges,
    loading,
    layout,
    kPartiteOrientation,
    rendererReady,
    storeHash,
    storeLayoutComplete,
    setLayoutComplete,
  ]);

  const prevContrastStateRef = useRef({
    mode: false,
    slot: "negative" as "positive" | "negative",
  });
  useEffect(() => {
    const prev = prevContrastStateRef.current;
    const shouldClear =
      (contrastMode && !prev.mode) ||
      (contrastMode && activeSlot !== prev.slot);
    if (shouldClear) setSelNodes([]);
    prevContrastStateRef.current = { mode: contrastMode, slot: activeSlot };
  }, [contrastMode, activeSlot]);

  useEffect(() => {
    if (rendererReady && rendererRef.current?.isReady()) {
      rendererRef.current.setSelection(rendererSelectedNodes, selEdge);
    }
  }, [rendererSelectedNodes, selEdge, rendererReady]);

  useEffect(() => {
    if (rendererReady && rendererRef.current?.isReady()) {
      rendererRef.current.setContrastNodes(contrastNodesSet);
    }
  }, [contrastNodesSet, rendererReady]);

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
    if (rendererReady && rendererRef.current?.isReady()) {
      if (pathSelection.isActive && pathSelection.paths.length > 0) {
        rendererRef.current.setPath(
          pathSelection.pathNodes,
          pathSelection.pathEdges,
          pathSelection.paths,
        );
      } else {
        rendererRef.current.setPath(new Set(), [], []);
      }
    }
  }, [pathSelection, rendererReady]);

  useEffect(() => {
    if (rendererReady && rendererRef.current?.isReady()) {
      const pins = pinnedSelections.map((pin) => ({
        nodes: new Set(pin.nodes),
        color: PIN_COLORS[pin.colorIndex % PIN_COLORS.length].pixi,
      }));
      rendererRef.current.setPinnedSelections(pins);
    }
  }, [pinnedSelections, rendererReady]);

  useEffect(() => {
    if (!showSettings) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
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
      return createDataToScreenTransform(
        clientX,
        clientY,
        canvas,
        transformRef.current,
      );
    };

    const zoom = createCanvasZoom([0.001, 20], (transform) => {
      transformRef.current = transform;
      renderer.setTransform(transform.x, transform.y, transform.k);
    });

    zoomBehaviorRef.current = zoom;

    const canvasSelection = select(canvas);
    canvasSelection.call(zoom as ZoomBehavior<HTMLCanvasElement, unknown>);

    const savedVp = useGraphDataStore.getState().savedViewport;
    if (savedVp) {
      const t = zoomIdentity
        .translate(savedVp.x, savedVp.y)
        .scale(savedVp.k);

      canvasSelection.call(zoom.transform as never, t);
      transformRef.current = savedVp;
      renderer.setTransform(savedVp.x, savedVp.y, savedVp.k);
    }

    renderer.onCenterRequest = (newTransform) => {
      const t = zoomIdentity
        .translate(newTransform.x, newTransform.y)
        .scale(newTransform.k);
      canvasSelection
        .transition()
        .duration(300)
        .call(zoom.transform as never, t);
    };

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
          setTooltipNode(node);
          setSelEdge(null);
          if (ev.shiftKey) {
            setSelNodes((prev) =>
              prev.includes(node.id) ? prev : [...prev, node.id],
            );
          } else if (ev.ctrlKey || ev.metaKey) {
            setSelNodes((prev) =>
              prev.includes(node.id)
                ? prev.filter((id) => id !== node.id)
                : [...prev, node.id],
            );
          } else {
            setSelNodes([node.id]);
          }
        } else if (!ev.shiftKey) {
          setTooltipNode(null);
          setSelNodes([]);
          setSelEdge(null);
        }
      }
    };

    let lassoStartPos: [number, number] | null = null;
    const LASSO_DRAG_THRESHOLD = 5;

    const handlePointerDown = (ev: PointerEvent) => {
      if (!ev.shiftKey) return;
      setTooltipNode(null);
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

    const handleMouseMove = (ev: MouseEvent) => {
      if (isLassoingRef.current) return;
      const [px, py] = toData(ev.clientX, ev.clientY);
      if (!quadtreeRef.current) return;
      const hoverRadius = 20 / transformRef.current.k;
      const node = findNodeAt(quadtreeRef.current, px, py, hoverRadius);
      const nodeId = node?.id ?? null;
      if (nodeId === hoverNodeRef.current) return;
      hoverNodeRef.current = nodeId;
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      renderer.setNeighborhoodFocus(null, new Set());
      if (nodeId) {
        hoverTimeoutRef.current = setTimeout(() => {
          const neighbors =
            adjacencyMapRef.current.get(nodeId) ?? new Set<string>();
          renderer.setNeighborhoodFocus(nodeId, neighbors);
        }, 2000);
      }
    };

    const handleMouseLeave = () => {
      hoverNodeRef.current = null;
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      renderer.setNeighborhoodFocus(null, new Set());
    };

    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerUp);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      canvasSelection.on(".zoom", null);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerUp);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
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
        ref={containerRef}
        className="absolute inset-0 bg-gray-50 overflow-hidden"
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
        {tooltipNode && !loading && rendererReady && (
          <NodeTooltip
            node={tooltipNode}
            legendData={legendData}
            containerRef={containerRef}
            transformRef={transformRef}
          />
        )}
        {!loading && rendererReady && (
          <>
            <div className="absolute bottom-3 left-3 z-10">
              <div className="bg-white/90 backdrop-blur-sm rounded-md px-2.5 py-1.5 shadow-sm border border-gray-100 mb-2">
                <div className="text-[10px] text-gray-600 font-medium">
                  {nodes.length.toLocaleString()} nodes ·{" "}
                  {edges.length.toLocaleString()} edges
                  {isLayoutRunning && (
                    <span className="ml-2 text-blue-500">
                      <span className="inline-block animate-spin">⟳</span>
                      <span className="ml-1">Computing layout...</span>
                    </span>
                  )}
                </div>
                {layout === "kpartite" && legendData.length > 0 && (
                  <div className="text-[9px] text-gray-500 mt-1">
                    {legendData.length} partition
                    {legendData.length !== 1 ? "s" : ""} · {kPartiteOrientation}
                  </div>
                )}
              </div>
            </div>
            {legendData.length > 1 && (
              <div className="absolute bottom-16 left-3 z-10">
                <div className="bg-white/90 backdrop-blur-sm rounded-md px-2.5 py-2 shadow-sm border border-gray-100">
                  <div className="text-[9px] font-medium text-gray-500 mb-1.5">
                    Node Types
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {legendData.map(({ type, color, count }) => {
                      const displayName =
                        type === "effect/phenotype"
                          ? "Effect/Phenotype"
                          : type === "gene/protein"
                            ? "Gene/Protein"
                            : type
                                .split("_")
                                .map(
                                  (word) =>
                                    word.charAt(0).toUpperCase() +
                                    word.slice(1),
                                )
                                .join(" ");
                      return (
                        <div key={type} className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: `#${color.toString(16).padStart(6, "0")}`,
                            }}
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

      {!loading && rendererReady && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-start justify-between pointer-events-none">
          <div className="pointer-events-auto">
            {contrastMode && (
              activeSlot === "positive" ? (
                <div className="bg-blue-50 border border-blue-200 text-blue-600 text-[10px] font-medium px-3 py-1.5 rounded-full shadow-sm">
                  selecting S+
                </div>
              ) : contrastNodes.length === 0 ? (
                <div className="bg-amber-50 border border-amber-300 text-amber-700 text-[10px] font-medium px-3 py-1.5 rounded-full shadow-sm">
                  select S−
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-300 text-amber-700 text-[10px] font-medium px-3 py-1.5 rounded-full shadow-sm">
                  S− · {contrastNodes.length}
                </div>
              )
            )}
          </div>
          <div className="pointer-events-auto">
            <GraphToolbar
              layout={layout}
              kPartiteOrientation={kPartiteOrientation}
              selNodes={selNodes}
              isLayoutRunning={isLayoutRunning}
              settings={settings}
              numericAttributes={numericAttributes}
              showSettings={showSettings}
              settingsRef={settingsRef}
              onLayoutChange={(newLayout) => {
                useGraphDataStore.getState().setLayoutComplete("", false);
                setLayout(newLayout);
              }}
              onOrientationChange={(orient) => {
                useGraphDataStore.getState().setLayoutComplete("", false);
                setKPartiteOrientation(orient);
              }}
              neighborTypes={neighborTypes}
              onExpandSelection={expandSelection}
              onCenterView={() => rendererRef.current?.requestCenterView()}
              onExport={() => setExportModalOpen(true)}
              onToggleSettings={() => setShowSettings(!showSettings)}
              onSettingsChange={setSettings}
            />
          </div>
        </div>
      )}

      {canFindPaths && !pathSelection.isActive && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30">
          <PathSelectionButton
            anchorNodes={pathAnchorNodes}
            onPathFind={findPaths}
            onClear={handleClearPath}
            isLoading={isLoadingPaths}
            error={pathError}
          />
        </div>
      )}
      {(pathSelection.isActive || storeSelectedNodes.length > 0) && (
        <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5">
          {pathSelection.isActive && (
            <button
              onClick={handleClearPath}
              className="text-[10px] font-medium px-2 py-1 rounded-md bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 shadow-sm transition-colors"
              title="Clear path"
            >
              clear
            </button>
          )}
          <button
            onClick={() => pinSelection()}
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 shadow-sm transition-colors"
            title="Pin this selection"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
            </svg>
            pin
          </button>
        </div>
      )}

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        rendererRef={rendererRef}
      />
    </div>
  );
};
