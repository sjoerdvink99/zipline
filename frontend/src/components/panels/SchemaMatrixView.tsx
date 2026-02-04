import { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { NODE_TYPE_COLORS, getNodeType } from "../../config/pixiColors";
import { useGraphDataStore } from "../../store/graphDataStore";

const HEADER = 80;

interface SchemaMatrixViewProps {
  onSelectionChange: (nodeIds: string[]) => void;
}

function getDisplayName(type: string): string {
  if (type === "effect/phenotype") return "Effect/Phenotype";
  if (type === "gene/protein") return "Gene/Protein";
  return type.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function typeHex(type: string): number {
  return NODE_TYPE_COLORS[type as keyof typeof NODE_TYPE_COLORS] ?? NODE_TYPE_COLORS.default;
}

function typeCSS(type: string): string {
  return `#${typeHex(type).toString(16).padStart(6, "0")}`;
}

function typeRgba(type: string, alpha: number): string {
  const hex = typeHex(type);
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

export const SchemaMatrixView = ({ onSelectionChange }: SchemaMatrixViewProps) => {
  const { nodes, edges } = useGraphDataStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const onSelChangeRef = useRef(onSelectionChange);
  useEffect(() => { onSelChangeRef.current = onSelectionChange; });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setDimensions({ width: r.width, height: r.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const nodeTypeCache = useMemo(() => {
    const cache = new Map<string, string>();
    for (const node of nodes) {
      cache.set(node.id, getNodeType(node.label || "", node));
    }
    return cache;
  }, [nodes]);

  const schemaData = useMemo(() => {
    if (!nodes.length) {
      return { types: [] as string[], nodeTypeToIds: new Map<string, string[]>(), connections: new Set<string>() };
    }
    const nodeTypeToIds = new Map<string, string[]>();
    for (const node of nodes) {
      const t = nodeTypeCache.get(node.id)!;
      if (!nodeTypeToIds.has(t)) nodeTypeToIds.set(t, []);
      nodeTypeToIds.get(t)!.push(node.id);
    }
    const types = Array.from(nodeTypeToIds.keys()).sort();
    const connections = new Set<string>();
    for (const edge of edges) {
      const d = (edge as any).data || edge;
      const srcId = typeof d.source === "string" ? d.source : (d.source as any)?.id;
      const tgtId = typeof d.target === "string" ? d.target : (d.target as any)?.id;
      const srcType = nodeTypeCache.get(srcId);
      const tgtType = nodeTypeCache.get(tgtId);
      if (srcType && tgtType) {
        connections.add([srcType, tgtType].sort().join("\0"));
      }
    }
    return { types, nodeTypeToIds, connections };
  }, [nodes, edges, nodeTypeCache]);

  useEffect(() => {
    const ids = Array.from(selectedTypes).flatMap((t) => schemaData.nodeTypeToIds.get(t) ?? []);
    onSelChangeRef.current(ids);
  }, [selectedTypes, schemaData.nodeTypeToIds]);

  const handleTypeClick = useCallback((type: string) => {
    setSelectedTypes((prev) => {
      if (prev.size === 1 && prev.has(type)) return new Set();
      return new Set([type]);
    });
  }, []);

  const handleCellClick = useCallback((rowType: string, colType: string) => {
    if (rowType === colType) {
      handleTypeClick(rowType);
    } else {
      setSelectedTypes((prev) => {
        if (prev.size === 2 && prev.has(rowType) && prev.has(colType)) return new Set();
        return new Set([rowType, colType]);
      });
    }
  }, [handleTypeClick]);

  const { types, connections } = schemaData;

  if (!types.length) {
    return (
      <div className="h-full w-full bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">No schema data available</p>
      </div>
    );
  }

  const avail = dimensions.width > 0
    ? Math.min(dimensions.width - HEADER, dimensions.height - HEADER)
    : 200;
  const cellSize = Math.max(20, Math.min(64, Math.floor(avail / types.length)));
  const svgW = HEADER + types.length * cellSize;
  const svgH = HEADER + types.length * cellSize;

  return (
    <div ref={containerRef} className="h-full w-full bg-gray-50 relative overflow-auto">
      {dimensions.width > 0 && (
        <svg
          width={svgW}
          height={svgH}
          className="block"
          onClick={() => setSelectedTypes(new Set())}
        >
          {/* Selection strips — rendered first so cells appear on top */}
          {types.map((type, i) =>
            selectedTypes.has(type) ? (
              <g key={`strip-${type}`} pointerEvents="none">
                <rect
                  x={HEADER} y={HEADER + i * cellSize}
                  width={types.length * cellSize} height={cellSize}
                  fill="rgba(59,130,246,0.08)"
                />
                <rect
                  x={HEADER + i * cellSize} y={HEADER}
                  width={cellSize} height={types.length * cellSize}
                  fill="rgba(59,130,246,0.08)"
                />
              </g>
            ) : null
          )}

          {/* Cells */}
          {types.map((rowType, i) =>
            types.map((colType, j) => {
              const key = [rowType, colType].sort().join("\0");
              const connected = connections.has(key);
              const isDiag = rowType === colType;
              const isRowSel = selectedTypes.has(rowType);
              const isColSel = selectedTypes.has(colType);
              const isCellSel = isRowSel && isColSel;
              const cellX = HEADER + j * cellSize;
              const cellY = HEADER + i * cellSize;

              let fill: string;
              if (isCellSel && connected) {
                fill = typeRgba(rowType, 0.9);
              } else if (isCellSel) {
                fill = isDiag ? "rgba(209,213,219,0.7)" : "rgba(59,130,246,0.12)";
              } else if (connected) {
                fill = typeRgba(rowType, isDiag ? 0.45 : 0.72);
              } else if (isDiag) {
                fill = "rgba(226,232,240,0.5)";
              } else {
                fill = "white";
              }

              return (
                <rect
                  key={`${i}-${j}`}
                  x={cellX + 0.5}
                  y={cellY + 0.5}
                  width={cellSize - 1}
                  height={cellSize - 1}
                  fill={fill}
                  stroke={isCellSel && (connected || isDiag) ? "#3b82f6" : "#e5e7eb"}
                  strokeWidth={isCellSel && (connected || isDiag) ? 1.5 : 0.5}
                  style={{ cursor: connected || isDiag ? "pointer" : "default" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (connected || isDiag) handleCellClick(rowType, colType);
                  }}
                />
              );
            })
          )}

          {/* Row headers */}
          {types.map((type, i) => {
            const y = HEADER + i * cellSize;
            const cy = y + cellSize / 2;
            const selected = selectedTypes.has(type);
            const label = getDisplayName(type);
            const count = schemaData.nodeTypeToIds.get(type)?.length ?? 0;
            const short = label.length > 11 ? label.slice(0, 10) + "…" : label;
            const fs = Math.min(10, Math.max(7, Math.floor(cellSize * 0.55)));
            return (
              <g key={`row-${type}`} onClick={(e) => { e.stopPropagation(); handleTypeClick(type); }} style={{ cursor: "pointer" }}>
                {selected && (
                  <rect x={0} y={y} width={HEADER} height={cellSize} fill="rgba(59,130,246,0.08)" />
                )}
                <circle cx={HEADER - 8} cy={cy} r={4} fill={typeCSS(type)} opacity={0.9} />
                <text
                  x={HEADER - 16}
                  y={cy}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={fs}
                  fontWeight={selected ? "600" : "400"}
                  fill={selected ? "#2563eb" : "#374151"}
                >
                  {short} ({count})
                </text>
              </g>
            );
          })}

          {/* Column headers */}
          {types.map((type, j) => {
            const x = HEADER + j * cellSize;
            const cx = x + cellSize / 2;
            const selected = selectedTypes.has(type);
            const label = getDisplayName(type);
            const short = label.length > 11 ? label.slice(0, 10) + "…" : label;
            const fs = Math.min(10, Math.max(7, Math.floor(cellSize * 0.55)));
            return (
              <g key={`col-${type}`} onClick={(e) => { e.stopPropagation(); handleTypeClick(type); }} style={{ cursor: "pointer" }}>
                {selected && (
                  <rect x={x} y={0} width={cellSize} height={HEADER} fill="rgba(59,130,246,0.08)" />
                )}
                <circle cx={cx} cy={HEADER - 8} r={4} fill={typeCSS(type)} opacity={0.9} />
                <g transform={`translate(${cx},${HEADER - 14})`}>
                  <text
                    transform="rotate(-45)"
                    textAnchor="start"
                    fontSize={fs}
                    fontWeight={selected ? "600" : "400"}
                    fill={selected ? "#2563eb" : "#374151"}
                  >
                    {short}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Axis lines */}
          <line x1={HEADER} y1={0} x2={HEADER} y2={svgH} stroke="#d1d5db" strokeWidth={1} />
          <line x1={0} y1={HEADER} x2={svgW} y2={HEADER} stroke="#d1d5db" strokeWidth={1} />
        </svg>
      )}

      {/* Status bar */}
      <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-sm rounded-md px-2.5 py-1.5 shadow-sm border border-gray-100">
          <div className="text-[10px] text-gray-600 font-medium">
            {types.length} type{types.length !== 1 ? "s" : ""} · {nodes.length.toLocaleString()} nodes
          </div>
          {selectedTypes.size > 0 && (
            <div className="text-[10px] text-blue-600 mt-0.5">
              {Array.from(selectedTypes).join(", ")} selected
            </div>
          )}
          <div className="text-[9px] text-gray-400 mt-0.5">
            Click label or cell to select · Click background to deselect
          </div>
        </div>
      </div>
    </div>
  );
};
