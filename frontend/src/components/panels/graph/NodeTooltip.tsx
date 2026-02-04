import { useEffect, useRef, type RefObject } from "react";
import type { D3Node } from "../../../types";
import type { ZoomTransform } from "../../../utils/zoom";

interface NodeTooltipProps {
  node: D3Node;
  legendData: Array<{ type: string; color: number; count: number }>;
  containerRef: RefObject<HTMLDivElement | null>;
  transformRef: RefObject<ZoomTransform>;
}

const SKIP_KEYS = new Set([
  "id", "label", "x", "y", "vx", "vy", "fx", "fy", "index", "__indexColor",
]);

const PRIORITY_ATTRS = ["degree", "pagerank", "k_core", "louvain_community"];

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    if (Math.abs(value) < 0.001 && value !== 0) return value.toExponential(2);
    return value.toFixed(4);
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function formatKey(key: string): string {
  return key.replace(/_/g, " ");
}

export function NodeTooltip({ node, legendData, containerRef, transformRef }: NodeTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Find node type color
  const nodeType = node.node_type as string | undefined ?? node.type as string | undefined;
  const typeColor = nodeType
    ? legendData.find((d) => d.type === nodeType)?.color
    : undefined;
  const typeColorHex = typeColor !== undefined
    ? `#${typeColor.toString(16).padStart(6, "0")}`
    : "#94a3b8";

  // Build attribute rows
  const attrEntries: [string, unknown][] = [];
  const seen = new Set<string>();

  for (const key of PRIORITY_ATTRS) {
    if (key in node && !SKIP_KEYS.has(key) && key !== "node_type" && key !== "type") {
      attrEntries.push([key, node[key]]);
      seen.add(key);
    }
  }

  for (const key of Object.keys(node)) {
    if (seen.has(key) || SKIP_KEYS.has(key) || key === "node_type" || key === "type") continue;
    attrEntries.push([key, node[key]]);
    seen.add(key);
    if (attrEntries.length >= 8) break;
  }

  // RAF loop for position tracking
  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;

    let rafId: number;

    const update = () => {
      const t = transformRef.current;
      const container = containerRef.current;
      if (!t || !container || node.x == null || node.y == null) {
        rafId = requestAnimationFrame(update);
        return;
      }

      const screenX = node.x * t.k + t.x;
      const screenY = node.y * t.k + t.y;

      const containerRect = container.getBoundingClientRect();
      const containerW = containerRect.width;
      const containerH = containerRect.height;

      const tooltipW = el.offsetWidth || 220;
      const tooltipH = el.offsetHeight || 100;
      const nodeRadius = 8 * t.k;
      const gap = 16;

      // Default: centered below node
      let tx = screenX - tooltipW / 2;
      let ty = screenY + nodeRadius + gap;

      // Flip above if near bottom edge
      if (ty + tooltipH > containerH - 8) {
        ty = screenY - nodeRadius - gap - tooltipH;
      }

      // Clamp horizontal within container
      const padding = 8;
      tx = Math.max(padding, Math.min(tx, containerW - tooltipW - padding));

      el.style.transform = `translate(${tx}px,${ty}px)`;
      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [node, containerRef, transformRef]);

  return (
    <div
      ref={tooltipRef}
      className="absolute top-0 left-0 pointer-events-none z-50"
      style={{ willChange: "transform" }}
    >
      <div
        className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200/60 max-w-[220px] px-3 py-2.5"
        style={{ opacity: 1, transition: "opacity 150ms" }}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {typeColor !== undefined && (
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: typeColorHex }}
            />
          )}
          <span className="text-[11px] font-semibold text-gray-800 leading-tight truncate">
            {node.label}
          </span>
        </div>
        {nodeType && (
          <div className="text-[9px] text-gray-400 mb-1.5 pl-4 leading-none truncate">
            {nodeType}
          </div>
        )}

        {attrEntries.length > 0 && (
          <>
            <div className="border-t border-gray-100 my-1.5" />
            <div className="space-y-0.5">
              {attrEntries.map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-2">
                  <span className="text-[9px] text-gray-500 flex-shrink-0">{formatKey(key)}</span>
                  <span className="text-[9px] text-gray-800 font-medium text-right truncate max-w-[100px]">
                    {formatValue(value)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
