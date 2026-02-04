import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnalysisStore } from "../../../store/analysisStore";
import { useGraphDataStore } from "../../../store/graphDataStore";
import { getNodeType } from "../../../config/pixiColors";
import type { D3Node } from "../../../types";

interface SelectionStripProps {
  selectedNodeIds: string[];
}

function nodeTypeOf(node: D3Node): string {
  return getNodeType(node.label, {
    node_type: node.node_type as string | undefined,
    type: node.type as string | undefined,
  });
}

export const SelectionStrip = memo(function SelectionStrip({
  selectedNodeIds,
}: SelectionStripProps) {
  const {
    contrastMode,
    contrastNodes,
    activeSlot,
    setActiveSlot,
    setSelection,
    setContrastNodes,
    removeSharedFromContrast,
    pinSelection,
  } = useAnalysisStore();

  const { nodes, adjacencyMap, nodeIndex, legendData } = useGraphDataStore();

  const expandNeighbors = useCallback(
    (slot: "positive" | "negative", typeFilter: string | null = null) => {
      const current = slot === "positive" ? selectedNodeIds : contrastNodes;
      if (current.length === 0) return;

      if (typeFilter) {
        const expanded = new Set<string>();
        for (const id of current) {
          for (const neighbor of adjacencyMap.get(id) ?? []) {
            const node = nodeIndex.get(neighbor);
            if (!node) continue;
            if (nodeTypeOf(node) === typeFilter) expanded.add(neighbor);
          }
        }
        const result = Array.from(expanded);
        if (slot === "positive") {
          setSelection(result, "topology");
        } else {
          setContrastNodes(result);
        }
      } else {
        const expanded = new Set(current);
        for (const id of current) {
          for (const neighbor of adjacencyMap.get(id) ?? []) {
            expanded.add(neighbor);
          }
        }
        const result = Array.from(expanded);
        if (slot === "positive") {
          setSelection(result, "topology");
        } else {
          setContrastNodes(result);
        }
      }
    },
    [selectedNodeIds, contrastNodes, adjacencyMap, nodeIndex, setSelection, setContrastNodes],
  );

  const expandSameTypes = useCallback(
    (slot: "positive" | "negative") => {
      const current = slot === "positive" ? selectedNodeIds : contrastNodes;
      if (current.length === 0) return;
      const positiveSet = new Set(selectedNodeIds);
      const types = new Set<string>();
      for (const id of current) {
        const node = nodeIndex.get(id);
        if (node) types.add(nodeTypeOf(node));
      }
      const result = nodes
        .filter((n) => {
          if (!types.has(nodeTypeOf(n))) return false;
          if (slot === "negative" && positiveSet.has(n.id)) return false;
          return true;
        })
        .map((n) => n.id);
      if (slot === "positive") {
        setSelection(result, "topology");
      } else {
        setContrastNodes(result);
      }
    },
    [selectedNodeIds, contrastNodes, nodes, nodeIndex, setSelection, setContrastNodes],
  );

  const invertForContrast = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const positiveSet = new Set(selectedNodeIds);
    const types = new Set<string>();
    for (const id of selectedNodeIds) {
      const node = nodeIndex.get(id);
      if (node) types.add(nodeTypeOf(node));
    }
    const result = nodes
      .filter((n) => !positiveSet.has(n.id) && types.has(nodeTypeOf(n)))
      .map((n) => n.id);
    setContrastNodes(result);
  }, [selectedNodeIds, nodes, nodeIndex, setContrastNodes]);

  const sampleBackground = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const positiveSet = new Set(selectedNodeIds);
    const pool = nodes.filter((n) => !positiveSet.has(n.id));
    const count = Math.min(Math.max(selectedNodeIds.length * 2, 10), 50);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setContrastNodes(pool.slice(0, count).map((n) => n.id));
  }, [selectedNodeIds, nodes, setContrastNodes]);

  const effectiveSlot = contrastMode ? activeSlot : "positive";
  const showContrastActions = contrastMode && activeSlot === "negative";

  const currentSlotNodes =
    effectiveSlot === "positive" ? selectedNodeIds : contrastNodes;

  const [activeTypes, setActiveTypes] = useState<Set<string> | null>(null);
  const baseNodesRef = useRef<string[]>([]);
  const filteringRef = useRef(false);

  useEffect(() => {
    if (filteringRef.current) {
      filteringRef.current = false;
      return;
    }
    setActiveTypes(null);
    baseNodesRef.current = [];
  }, [currentSlotNodes]);

  const handleTypeToggle = useCallback(
    (slot: "positive" | "negative", type: string) => {
      let next: Set<string>;
      if (activeTypes === null) {
        baseNodesRef.current = [...(slot === "positive" ? selectedNodeIds : contrastNodes)];
        next = new Set([type]);
      } else {
        next = new Set(activeTypes);
        if (next.has(type)) {
          next.delete(type);
          if (next.size === 0) {
            filteringRef.current = true;
            setActiveTypes(null);
            const base = baseNodesRef.current;
            baseNodesRef.current = [];
            if (slot === "positive") setSelection(base, "topology");
            else setContrastNodes(base);
            return;
          }
        } else {
          next.add(type);
        }
      }
      filteringRef.current = true;
      setActiveTypes(next);
      const result = baseNodesRef.current.filter((id) => {
        const node = nodeIndex.get(id);
        return node && next.has(nodeTypeOf(node));
      });
      if (slot === "positive") setSelection(result, "topology");
      else setContrastNodes(result);
    },
    [activeTypes, selectedNodeIds, contrastNodes, nodeIndex, setSelection, setContrastNodes],
  );

  const clearTypeFilter = useCallback(() => {
    if (activeTypes === null) return;
    filteringRef.current = true;
    setActiveTypes(null);
    const base = baseNodesRef.current;
    baseNodesRef.current = [];
    if (effectiveSlot === "positive") setSelection(base, "topology");
    else setContrastNodes(base);
  }, [activeTypes, effectiveSlot, setSelection, setContrastNodes]);

  const selectionTypes = useMemo(() => {
    const source = activeTypes !== null ? baseNodesRef.current : currentSlotNodes;
    if (source.length === 0) return [];
    const typeCounts = new Map<string, number>();
    for (const id of source) {
      const node = nodeIndex.get(id);
      if (!node) continue;
      const type = nodeTypeOf(node);
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
    if (typeCounts.size <= 1) return [];
    const typeColorMap = new Map<string, number>(
      legendData.map(({ type, color }) => [type, color]),
    );
    return Array.from(typeCounts.entries())
      .map(([type, count]) => ({ type, count, color: typeColorMap.get(type) ?? 0x94a3b8 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [activeTypes, currentSlotNodes, nodeIndex, legendData]);

  const neighborTypes = useMemo(() => {
    if (currentSlotNodes.length === 0) return [];
    const currentSet = new Set(currentSlotNodes);
    const typeCounts = new Map<string, number>();
    for (const id of currentSlotNodes) {
      for (const neighbor of adjacencyMap.get(id) ?? []) {
        if (currentSet.has(neighbor)) continue;
        const node = nodeIndex.get(neighbor);
        if (!node) continue;
        const type = nodeTypeOf(node);
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
  }, [currentSlotNodes, adjacencyMap, nodeIndex, legendData]);

  const sharedCount = useMemo(() => {
    const contrastSet = new Set(contrastNodes);
    return selectedNodeIds.filter((n) => contrastSet.has(n)).length;
  }, [selectedNodeIds, contrastNodes]);

  if (selectedNodeIds.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
      {contrastMode ? (
        <>
          <button
            onClick={() => setActiveSlot("positive")}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
              activeSlot === "positive"
                ? "bg-blue-100 text-blue-600"
                : "text-blue-400 hover:text-blue-600"
            }`}
          >
            S+ {selectedNodeIds.length}
          </button>
          <span className="text-[10px] text-gray-300">↔</span>
          <button
            onClick={() => setActiveSlot("negative")}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
              activeSlot === "negative"
                ? "bg-amber-100 text-amber-600"
                : "text-amber-400 hover:text-amber-600"
            }`}
          >
            S− {contrastNodes.length > 0 ? contrastNodes.length : "?"}
          </button>
        </>
      ) : (
        <span className="text-[10px] font-medium text-blue-500 tabular-nums">
          S+ {selectedNodeIds.length}
        </span>
      )}
      {selectionTypes.length > 0 && (
        <>
          <div className="border-t border-gray-100 w-3" />
          {selectionTypes.map(({ type, count, color }) => {
            const hexColor = `#${color.toString(16).padStart(6, "0")}`;
            const isOn = activeTypes?.has(type) ?? false;
            const isFiltering = activeTypes !== null;
            return (
              <button
                key={type}
                onClick={() => handleTypeToggle(effectiveSlot, type)}
                className={`text-[10px] transition-colors px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                  isFiltering
                    ? isOn
                      ? "font-medium border"
                      : "text-gray-300 border border-dashed border-gray-200"
                    : "text-gray-400 hover:text-gray-700"
                }`}
                style={
                  isFiltering && isOn
                    ? { backgroundColor: `${hexColor}15`, color: hexColor, borderColor: `${hexColor}40` }
                    : undefined
                }
              >
                <span
                  className={`w-1.5 h-1.5 rounded-sm flex-shrink-0 ${isFiltering && !isOn ? "opacity-30" : ""}`}
                  style={{ backgroundColor: hexColor }}
                />
                {type} {count}
              </button>
            );
          })}
          {activeTypes !== null && (
            <button
              onClick={clearTypeFilter}
              className="text-[10px] text-gray-300 hover:text-gray-500 transition-colors px-0.5"
              title="Clear type filter"
            >
              ×
            </button>
          )}
        </>
      )}
      <div className="flex-1 border-t border-gray-100" />
      <button
        onClick={() => pinSelection()}
        className="text-[10px] text-gray-400 hover:text-teal-600 transition-colors px-1"
        title="Pin this selection"
        disabled={selectedNodeIds.length === 0}
      >
        pin
      </button>
      <button
        onClick={() => expandNeighbors(effectiveSlot, null)}
        className="text-[10px] text-gray-400 hover:text-gray-700 transition-colors px-1"
        title={`Add 1-hop neighbors to ${showContrastActions ? "S−" : "S+"}`}
      >
        neighbors
      </button>
      {neighborTypes.length > 1 &&
        neighborTypes.slice(0, 3).map(({ type, count, color }) => (
          <button
            key={type}
            onClick={() => expandNeighbors(effectiveSlot, type)}
            className="text-[10px] text-gray-400 hover:text-gray-700 transition-colors px-1 flex items-center gap-0.5"
            title={`Replace ${showContrastActions ? "S−" : "S+"} with ${type} neighbors`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: `#${color.toString(16).padStart(6, "0")}`,
              }}
            />
            {type} {count}
          </button>
        ))}
      <button
        onClick={() => expandSameTypes(effectiveSlot)}
        className="text-[10px] text-gray-400 hover:text-gray-700 transition-colors px-1"
        title={`Add all nodes of same type(s) to ${showContrastActions ? "S−" : "S+"}`}
      >
        same type
      </button>
      {showContrastActions && (
        <>
          <span className="text-[10px] text-gray-200">·</span>
          {sharedCount > 0 && (
            <button
              onClick={removeSharedFromContrast}
              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors px-1"
              title={`Remove ${sharedCount} nodes shared between S+ and S−`}
            >
              −shared ({sharedCount})
            </button>
          )}
          <button
            onClick={invertForContrast}
            className="text-[10px] text-gray-400 hover:text-amber-500 transition-colors px-1"
            title="Populate S− with same-type nodes not in S+"
          >
            invert
          </button>
          <button
            onClick={sampleBackground}
            className="text-[10px] text-gray-400 hover:text-amber-500 transition-colors px-1"
            title="Populate S− with a random background sample"
          >
            sample
          </button>
        </>
      )}
    </div>
  );
});
