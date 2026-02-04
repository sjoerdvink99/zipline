import { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { NODE_TYPE_COLORS, getNodeType } from "../config/pixiColors";
import type { FilterItem } from "../types/fol";
import { usePredicateStore } from "../store/predicates";
import { useGraphDataStore } from "../store/graphDataStore";
import * as d3 from "d3";

interface SchemaViewProps {
  onSelectionChange: (nodeIds: string[]) => void;
}

export const SchemaView = ({ onSelectionChange }: SchemaViewProps) => {
  const { nodes, edges } = useGraphDataStore();
  const { addPredicate } = usePredicateStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<any, undefined> | null>(null);
  const [isLayoutStable, setIsLayoutStable] = useState(false);
  const [initialLayoutComplete, setInitialLayoutComplete] = useState(false);
  const frameRef = useRef<number | null>(null);
  const [selectedNodeTypes, setSelectedNodeTypes] = useState<string[]>([]);
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; });

  const nodeTypeCache = useMemo(() => {
    const cache = new Map<string, string>();
    for (const node of nodes) {
      cache.set(node.id, getNodeType(node.label || "", node));
    }
    return cache;
  }, [nodes]);

  const schemaData = useMemo(() => {
    if (!nodes || nodes.length === 0) {
      return { schemaNodes: [], schemaEdges: [], nodeTypeToIds: new Map() };
    }
    const typeToNodes = new Map<string, typeof nodes>();
    const nodeTypeToIds = new Map<string, string[]>();

    for (const node of nodes) {
      const nodeType = nodeTypeCache.get(node.id)!;
      if (!typeToNodes.has(nodeType)) {
        typeToNodes.set(nodeType, []);
        nodeTypeToIds.set(nodeType, []);
      }
      typeToNodes.get(nodeType)!.push(node);
      nodeTypeToIds.get(nodeType)!.push(node.id);
    }
    const schemaNodes = Array.from(typeToNodes.entries()).map(([type, typeNodes]) => ({
      id: type,
      type,
      count: typeNodes.length,
      color: NODE_TYPE_COLORS[type as keyof typeof NODE_TYPE_COLORS] || 0x94a3b8,
      x: 0,
      y: 0,
      fx: null as number | null,
      fy: null as number | null,
    }));
    const typeConnections = new Map<string, Set<string>>();

    if (edges && edges.length > 0) {
      for (const edge of edges) {
        const edgeData = (edge as any).data || edge;
        const sourceId =
          typeof edgeData.source === "string" ? edgeData.source : (edgeData.source as any)?.id;
        const targetId =
          typeof edgeData.target === "string" ? edgeData.target : (edgeData.target as any)?.id;
        const sourceType = nodeTypeCache.get(sourceId);
        const targetType = nodeTypeCache.get(targetId);
        if (sourceType && targetType) {
          if (sourceType !== targetType) {
            if (!typeConnections.has(sourceType)) typeConnections.set(sourceType, new Set());
            if (!typeConnections.has(targetType)) typeConnections.set(targetType, new Set());
            typeConnections.get(sourceType)!.add(targetType);
            typeConnections.get(targetType)!.add(sourceType);
          }
        }
      }
    }
    const schemaEdges: Array<{ id: string; source: string; target: string }> = [];
    const processedPairs = new Set<string>();
    for (const [sourceType, targets] of typeConnections.entries()) {
      for (const targetType of targets) {
        const pairKey = [sourceType, targetType].sort().join("-");
        if (!processedPairs.has(pairKey)) {
          schemaEdges.push({ id: `${sourceType}-${targetType}`, source: sourceType, target: targetType });
          processedPairs.add(pairKey);
        }
      }
    }
    return { schemaNodes, schemaEdges, nodeTypeToIds };
  }, [nodes, edges, nodeTypeCache]);

  useEffect(() => {
    const allNodeIds = selectedNodeTypes.flatMap((type) => schemaData.nodeTypeToIds.get(type) || []);
    onSelectionChangeRef.current(allNodeIds);
  }, [selectedNodeTypes, schemaData.nodeTypeToIds]);

  const handleNodeTypeClick = useCallback(
    (nodeType: string, isShiftPressed: boolean) => {
      if (isShiftPressed) {
        const predicateId = `node_type_${nodeType}_${Date.now()}`;
        const nodeTypePredicate: FilterItem = {
          id: predicateId,
          type: "attribute",
          predicate: {
            attribute: "node_type",
            operator: "=",
            value: nodeType,
            node_type: undefined,
          },
          description: `Node type = "${nodeType}"`,
          nodeTypes: [nodeType],
        };
        addPredicate(nodeTypePredicate);
      } else {
        setSelectedNodeTypes((prev) => {
          if (prev.includes(nodeType)) {
            return prev.filter((t) => t !== nodeType);
          }
          return [nodeType];
        });
      }
    },
    [addPredicate],
  );

  useEffect(() => {
    if (!svgRef.current || schemaData.schemaNodes.length === 0) return;
    if (simulationRef.current) simulationRef.current.stop();

    const svg = d3.select(svgRef.current);
    const container = containerRef.current;
    if (!container) return;

    svg.selectAll("*").remove();

    const width = container.clientWidth;
    const height = container.clientHeight;
    const centerX = width / 2;
    const centerY = height / 2;
    const nodeCount = schemaData.schemaNodes.length;
    schemaData.schemaNodes.forEach((node, i) => {
      if (nodeCount === 1) {
        node.x = centerX;
        node.y = centerY;
      } else {
        const angle = (2 * Math.PI * i) / nodeCount;
        const radius = Math.min(width, height) * 0.25;
        node.x = centerX + radius * Math.cos(angle);
        node.y = centerY + radius * Math.sin(angle);
      }
    });

    const zoom = d3.zoom().scaleExtent([0.1, 10]).on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
    svg.call(zoom as any);

    svg.on("click", (event) => {
      if (event.target === svg.node()) {
        setSelectedNodeTypes([]);
      }
    });

    const g = svg.append("g");
    const schemaNodeCount = schemaData.schemaNodes.length;
    const linkDistance = schemaNodeCount > 8 ? 140 : schemaNodeCount > 4 ? 160 : 180;
    const chargeStrength = schemaNodeCount > 8 ? -800 : schemaNodeCount > 4 ? -1000 : -1200;
    const nodeRadius = (d: any) => Math.max(35, Math.sqrt(d.count) * 5);
    const collisionRadius = (d: any) => nodeRadius(d) + 25;

    const simulation = d3
      .forceSimulation(schemaData.schemaNodes as any)
      .force("link", d3.forceLink(schemaData.schemaEdges as any).id((d: any) => d.id).distance(linkDistance).strength(0.4))
      .force("charge", d3.forceManyBody().strength(chargeStrength).distanceMax(400))
      .force("center", d3.forceCenter(centerX, centerY).strength(0.05))
      .force("collision", d3.forceCollide().radius(collisionRadius).strength(0.9).iterations(3))
      .force("x", d3.forceX(centerX).strength(0.02))
      .force("y", d3.forceY(centerY).strength(0.02))
      .alphaDecay(0.02)
      .velocityDecay(0.85)
      .alpha(1);

    simulationRef.current = simulation;

    const linksGroup = g.append("g").attr("class", "edges");
    const links = linksGroup
      .selectAll("line")
      .data(schemaData.schemaEdges)
      .join("line")
      .attr("stroke", "#cccccc")
      .attr("stroke-width", 2)
      .attr("opacity", 0.6)
      .attr("stroke-linecap", "round");

    const drag = d3
      .drag()
      .on("start", (event, d: any) => {
        setIsLayoutStable(false);
        if (!event.active && simulation.alpha() < 0.01) simulation.alphaTarget(0.03).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d: any) => {
        d.fx = event.x;
        d.fy = event.y;
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
          if (simulation.alpha() < 0.01) simulation.alpha(0.01);
        });
      })
      .on("end", (event, d: any) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        setTimeout(() => setIsLayoutStable(true), 200);
      });

    const nodesGroup = g.append("g").attr("class", "nodes");
    const nodeGroups = nodesGroup
      .selectAll("g")
      .data(schemaData.schemaNodes)
      .join("g")
      .style("cursor", "pointer")
      .attr("title", (d: any) => `${d.type} (${d.count} nodes)\nClick to select, Shift+click to add predicate`)
      .call(drag as any)
      .on("click", (event, d: any) => {
        event.stopPropagation();
        if (simulation.alpha() > 0.1) return;
        handleNodeTypeClick(d.type, event.shiftKey);
      });

    nodeGroups
      .append("circle")
      .attr("r", (d: any) => Math.max(35, Math.sqrt(d.count) * 5))
      .attr("fill", (d: any) => `#${d.color.toString(16).padStart(6, "0")}`)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2)
      .attr("opacity", 0.9);

    nodeGroups
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", "11px")
      .attr("font-weight", "bold")
      .attr("fill", "#ffffff")
      .attr("pointer-events", "none")
      .text((d: any) => {
        const displayName =
          d.type === "effect/phenotype"
            ? "Effect/Phenotype"
            : d.type === "gene/protein"
              ? "Gene/Protein"
              : d.type.split("_").map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
        return displayName.length > 12 ? displayName.substring(0, 10) + "..." : displayName;
      });

    const countLabels = nodeGroups.append("g").attr("transform", "translate(0, 45)");
    countLabels
      .append("rect")
      .attr("x", (d: any) => -(`${d.count} nodes`.length * 3.5))
      .attr("y", -8)
      .attr("width", (d: any) => `${d.count} nodes`.length * 7)
      .attr("height", 16)
      .attr("fill", "white")
      .attr("rx", 8)
      .attr("stroke", "#e5e7eb")
      .attr("opacity", 0.9);

    countLabels
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", "10px")
      .attr("font-weight", "600")
      .attr("fill", "#374151")
      .attr("pointer-events", "none")
      .text((d: any) => `${d.count} nodes`);

    let tickCount = 0;
    const maxTicks = 150;
    let lastTickTime = 0;
    const minTickInterval = 16;

    simulation.on("tick", () => {
      tickCount++;
      const now = performance.now();
      if (now - lastTickTime < minTickInterval && tickCount < maxTicks) return;
      lastTickTime = now;
      links
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      nodeGroups.attr("transform", (d: any) => `translate(${d.x}, ${d.y})`);
      if (simulation.alpha() < 0.008 || tickCount >= maxTicks) {
        simulation.stop();
        setIsLayoutStable(true);
        setInitialLayoutComplete(true);
      }
    });

    simulation.restart();

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      simulation.stop();
      simulationRef.current = null;
    };
  }, [schemaData, handleNodeTypeClick, initialLayoutComplete]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const nodeGroups = svg.selectAll(".nodes g");
    nodeGroups
      .select("circle")
      .attr("stroke", (d: any) => selectedNodeTypes.includes(d.type) ? "#3b82f6" : "#ffffff")
      .attr("stroke-width", (d: any) => selectedNodeTypes.includes(d.type) ? 3 : 2)
      .style("filter", (d: any) =>
        selectedNodeTypes.includes(d.type)
          ? "drop-shadow(0px 2px 4px rgba(59, 130, 246, 0.3))"
          : "none",
      );
  }, [selectedNodeTypes]);

  useEffect(() => {
    setInitialLayoutComplete(false);
    setIsLayoutStable(false);
  }, [schemaData.schemaNodes.length, schemaData.schemaEdges.length]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
    };
  }, []);

  if (schemaData.schemaNodes.length === 0) {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4">Schema View</h3>
        <div className="text-center text-gray-500">
          <div>No schema data available</div>
          <div className="text-sm mt-2">
            Nodes: {nodes?.length || 0} | Edges: {edges?.length || 0}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full bg-gray-50 relative overflow-hidden">
      <svg ref={svgRef} width="100%" height="100%" className="absolute inset-0" />
      <div className="absolute bottom-3 left-3 z-10">
        <div className="bg-white/90 backdrop-blur-sm rounded-md px-2.5 py-1.5 shadow-sm border border-gray-100 mb-2">
          <div className="text-[10px] text-gray-600 font-medium">
            {schemaData.schemaNodes.length} type{schemaData.schemaNodes.length !== 1 ? "s" : ""} ·{" "}
            {schemaData.schemaEdges.length} connection{schemaData.schemaEdges.length !== 1 ? "s" : ""} ·{" "}
            {nodes.length.toLocaleString()} total nodes
            {!isLayoutStable && (
              <span className="ml-2 text-blue-500">
                <span className="inline-block animate-spin">⟳</span>
                <span className="ml-1">Computing layout...</span>
              </span>
            )}
          </div>
          {selectedNodeTypes.length > 0 && (
            <div className="text-[9px] text-gray-500 mt-1">
              {selectedNodeTypes.length} type{selectedNodeTypes.length > 1 ? "s" : ""} selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
