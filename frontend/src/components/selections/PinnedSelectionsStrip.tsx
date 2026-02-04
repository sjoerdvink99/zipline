import { memo, useState, useCallback, useRef } from "react";
import { useAnalysisStore } from "../../store/analysisStore";
import { PIN_COLORS } from "../../config/pixiColors";

export const PinnedSelectionsStrip = memo(function PinnedSelectionsStrip() {
  const {
    pinnedSelections,
    unpinSelection,
    renamePinnedSelection,
    applySetOperation,
    setHighlightedNodes,
    clearHighlights,
  } = useAnalysisStore();

  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const togglePin = useCallback((id: string) => {
    setToggledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 2) {
          const [first] = next;
          next.delete(first);
        }
        next.add(id);
      }
      return next;
    });
  }, []);

  const startEdit = useCallback((id: string, label: string) => {
    setEditingId(id);
    setEditValue(label);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const commitEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      renamePinnedSelection(editingId, editValue.trim());
    }
    setEditingId(null);
  }, [editingId, editValue, renamePinnedSelection]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") commitEdit();
      if (e.key === "Escape") setEditingId(null);
    },
    [commitEdit],
  );

  const handleSetOp = useCallback(
    (op: "intersection" | "union" | "difference") => {
      const ids = Array.from(toggledIds);
      if (ids.length !== 2) return;
      applySetOperation(op, ids[0], ids[1]);
      setToggledIds(new Set());
    },
    [toggledIds, applySetOperation],
  );

  const handleMouseEnter = useCallback(
    (nodes: string[]) => {
      setHighlightedNodes(nodes);
    },
    [setHighlightedNodes],
  );

  const handleMouseLeave = useCallback(() => {
    clearHighlights();
  }, [clearHighlights]);

  const twoToggled = toggledIds.size === 2;

  return (
    <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
      {pinnedSelections.map((pin) => {
        const color = PIN_COLORS[pin.colorIndex % PIN_COLORS.length];
        const isToggled = toggledIds.has(pin.id);
        const tw = color.tw;

        return (
          <div
            key={pin.id}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md font-medium border cursor-pointer transition-colors ${
              isToggled
                ? `bg-${tw}-100 text-${tw}-700 border-${tw}-300`
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
            onClick={() => togglePin(pin.id)}
            onMouseEnter={() => handleMouseEnter(pin.nodes)}
            onMouseLeave={handleMouseLeave}
            title={`${pin.nodes.length} nodes — click to select for set operation`}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: `#${color.pixi.toString(16).padStart(6, "0")}`,
              }}
            />
            {editingId === pin.id ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleKeyDown}
                className="text-[10px] w-28 outline-none bg-transparent"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startEdit(pin.id, pin.label);
                }}
                className="max-w-[120px] truncate"
                title={pin.label}
              >
                {pin.label}
              </span>
            )}
            <span className="text-[9px] opacity-60 ml-0.5">
              {pin.nodes.length}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setToggledIds((prev) => {
                  const next = new Set(prev);
                  next.delete(pin.id);
                  return next;
                });
                unpinSelection(pin.id);
              }}
              className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
              title="Remove pin"
            >
              ×
            </button>
          </div>
        );
      })}
      {twoToggled && (
        <>
          <div className="border-l border-gray-200 h-4 mx-0.5" />
          <button
            onClick={() => handleSetOp("intersection")}
            className="text-[10px] text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded border border-gray-200 hover:border-gray-300 transition-colors"
            title="Intersection: nodes in both selections"
          >
            ∩
          </button>
          <button
            onClick={() => handleSetOp("union")}
            className="text-[10px] text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded border border-gray-200 hover:border-gray-300 transition-colors"
            title="Union: all nodes from both selections"
          >
            ∪
          </button>
          <button
            onClick={() => handleSetOp("difference")}
            className="text-[10px] text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded border border-gray-200 hover:border-gray-300 transition-colors"
            title="Difference: nodes in first but not second selection"
          >
            A\B
          </button>
        </>
      )}
    </div>
  );
});
