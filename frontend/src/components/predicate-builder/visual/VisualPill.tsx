import { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { PredicatePill, Comparator } from "./types";
import {
  useGraphSchema,
  getValueSuggestions,
  getAttributeType,
} from "../../../hooks/useGraphSchema";

interface PillProps {
  pill: PredicatePill;
  onRemove: () => void;
  onUpdate?: (updates: Partial<PredicatePill>) => void;
  onGroupWith?: (otherPillId: string) => void;
  onContextMenu?: (position: { x: number; y: number }) => void;
  isNested?: boolean;
  isDragging?: boolean;
}

interface EditMenuState {
  x: number;
  y: number;
}

const OPERATORS = {
  NUMERIC: [
    { value: "=" as const, label: "=" },
    { value: "!=" as const, label: "≠" },
    { value: ">" as const, label: ">" },
    { value: ">=" as const, label: "≥" },
    { value: "<" as const, label: "<" },
    { value: "<=" as const, label: "≤" },
  ],
  CATEGORICAL: [
    { value: "=" as const, label: "=" },
    { value: "!=" as const, label: "≠" },
  ],
  BOOLEAN: [{ value: "=" as const, label: "=" }],
} as const;

const PILL_STYLES = {
  attribute: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    icon: "bg-emerald-500",
    hoverBg: "hover:bg-emerald-100",
    badge: "bg-emerald-100 text-emerald-600",
  },
  topology: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-700",
    icon: "bg-sky-500",
    hoverBg: "hover:bg-sky-100",
    badge: "bg-sky-100 text-sky-600",
  },
  type: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    icon: "bg-emerald-500",
    hoverBg: "hover:bg-emerald-100",
    badge: "bg-emerald-100 text-emerald-600",
  },
  lifted: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    icon: "bg-emerald-500",
    hoverBg: "hover:bg-emerald-100",
    badge: "bg-emerald-100 text-emerald-600",
  },
} as const;

const PILL_ICONS = {
  attribute: (
    <svg
      className="w-3 h-3 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
  ),
  topology: (
    <svg
      className="w-3 h-3 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  ),
  type: (
    <svg
      className="w-3 h-3 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  ),
  lifted: (
    <svg
      className="w-3 h-3 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  ),
} as const;

const TYPE_SUGGESTIONS = [
  "mitigation",
  "technique",
  "group",
  "software",
  "tactic",
];

function formatComparator(comp: string | undefined): string {
  const map: Record<string, string> = {
    "=": "=",
    "!=": "≠",
    ">": ">",
    ">=": "≥",
    "<": "<",
    "<=": "≤",
  };
  return map[comp || "="] || comp || "=";
}

function getInitialEditValue(pill: PredicatePill): string {
  switch (pill.type) {
    case "lifted":
      return pill.liftedValue || "";
    case "type":
      return pill.typeName || "";
    default:
      return String(pill.value ?? "");
  }
}

function getEditMenuHeader(pill: PredicatePill): string {
  switch (pill.type) {
    case "lifted":
      return `${pill.liftedAttribute}_${pill.liftedValue}`;
    case "type":
      return pill.typeName || "";
    default:
      return pill.attribute || "";
  }
}

function createUpdateProps(
  pill: PredicatePill,
  operator: Comparator,
  value: string | number | boolean,
): Partial<PredicatePill> {
  switch (pill.type) {
    case "lifted":
      return {
        liftedValue: String(value),
        displayText: `${pill.liftedAttribute}: ${value}`,
      };
    case "type":
      return {
        typeName: String(value),
        displayText: String(value),
      };
    default:
      return {
        comparator: operator,
        value,
        displayText: `${pill.attribute} ${operator} ${value}`,
      };
  }
}

export const VisualPill = memo(function VisualPill({
  pill,
  onRemove,
  onUpdate,
  onGroupWith,
  onContextMenu,
  isNested = false,
  isDragging = false,
}: PillProps) {
  const style = PILL_STYLES[pill.type];
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [editMenu, setEditMenu] = useState<EditMenuState | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editOperator, setEditOperator] = useState<Comparator>("=");
  const [showValueDropdown, setShowValueDropdown] = useState(false);
  const [filteredValues, setFilteredValues] = useState<string[]>([]);
  const valueInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { schema } = useGraphSchema();

  const dataType = useMemo(() => {
    if (!["attribute", "topology", "lifted", "type"].includes(pill.type))
      return null;
    if (pill.type === "lifted" || pill.type === "type") return "categorical";
    return getAttributeType(schema, pill.attribute || "", pill.type);
  }, [schema, pill.attribute, pill.type]);

  const availableValues = useMemo(() => {
    if (!["attribute", "topology", "lifted", "type"].includes(pill.type))
      return [];
    if (pill.type === "lifted") return ["true", "false"];
    if (pill.type === "type") return TYPE_SUGGESTIONS;
    return getValueSuggestions(schema, pill.attribute || "", pill.type);
  }, [schema, pill.attribute, pill.type]);

  const availableOperators = useMemo(() => {
    if (dataType === "numeric") return OPERATORS.NUMERIC;
    if (dataType === "boolean") return OPERATORS.BOOLEAN;
    return OPERATORS.CATEGORICAL;
  }, [dataType]);

  useEffect(() => {
    if (!editMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setEditMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editMenu]);

  useEffect(() => {
    if (dataType === "numeric") {
      setFilteredValues(availableValues.slice(0, 5));
    } else {
      const query = editValue.toLowerCase();
      const filtered = availableValues.filter((v) =>
        v.toLowerCase().includes(query),
      );
      setFilteredValues(filtered.slice(0, 10));
    }
  }, [editValue, availableValues, dataType]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!["attribute", "topology", "lifted", "type"].includes(pill.type)) {
        return;
      }

      const x = Math.min(e.clientX, window.innerWidth - 220);
      const y = Math.min(e.clientY, window.innerHeight - 200);

      setEditOperator((pill.comparator as Comparator) || "=");
      setEditValue(getInitialEditValue(pill));
      setEditMenu({ x, y });
      setShowValueDropdown(false);
      onContextMenu?.({ x, y });
    },
    [onContextMenu, pill],
  );

  const handleSaveEdit = useCallback(() => {
    if (!onUpdate) return;

    let finalValue: string | number | boolean = editValue;

    if (dataType === "numeric") {
      const num = parseFloat(editValue);
      if (!isNaN(num)) {
        finalValue = num;
      }
    } else if (dataType === "boolean") {
      finalValue = editValue.toLowerCase() === "true";
    }

    if (dataType === "categorical" && availableValues.length > 0) {
      if (!availableValues.includes(editValue)) {
        if (valueInputRef.current) {
          valueInputRef.current.classList.add("ring-2", "ring-red-500");
          setTimeout(() => {
            valueInputRef.current?.classList.remove("ring-2", "ring-red-500");
          }, 500);
        }
        return;
      }
    }

    onUpdate(createUpdateProps(pill, editOperator, finalValue));
    setEditMenu(null);
  }, [onUpdate, editOperator, editValue, dataType, availableValues, pill]);

  const handleSelectValue = useCallback((value: string) => {
    setEditValue(value);
    setShowValueDropdown(false);
    valueInputRef.current?.focus();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      if (e.dataTransfer.types.includes("application/json")) {
        e.dataTransfer.dropEffect = "move";
        setIsDropTarget(true);
      }
    } catch {}
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDropTarget(false);

      if (!onGroupWith) return;

      try {
        const rawData = e.dataTransfer.getData("application/json");
        const data = JSON.parse(rawData);

        if (
          data.type === "move-pill" &&
          data.pillId &&
          data.pillId !== pill.id
        ) {
          onGroupWith(data.pillId);
        }
      } catch {}
    },
    [onGroupWith, pill.id],
  );

  const renderContent = () => {
    switch (pill.type) {
      case "type":
        return <span className="font-medium">{pill.typeName}</span>;
      case "lifted":
        return (
          <>
            <span className="text-gray-500">{pill.liftedAttribute}:</span>
            <span className="font-medium ml-1">{pill.liftedValue}</span>
          </>
        );
      case "attribute":
      case "topology":
        return (
          <>
            <span className="font-medium">{pill.attribute}</span>
            <span className="mx-1.5 font-mono text-gray-500">
              {formatComparator(pill.comparator)}
            </span>
            <span className="font-semibold">{pill.value}</span>
          </>
        );
    }
  };

  return (
    <div
      data-pill-drop-target="true"
      className={`
        group relative flex items-center gap-2 px-3 py-1.5 rounded-lg border
        transition-all duration-150 cursor-grab active:cursor-grabbing
        ${style.bg} ${style.border} ${style.hoverBg}
        ${isDragging ? "opacity-50 scale-95" : ""}
        ${isNested ? "text-sm py-1" : ""}
        ${isDropTarget ? "ring-2 ring-blue-500 ring-offset-2 scale-105 shadow-lg" : ""}
      `}
      draggable
      onDragStart={(e) => {
        const dragData = {
          type: "move-pill",
          pillId: pill.id,
        };
        e.dataTransfer.setData("application/json", JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
    >
      <div
        className={`w-4 h-4 rounded-full ${style.icon} flex items-center justify-center flex-shrink-0`}
      >
        {PILL_ICONS[pill.type]}
      </div>

      <div className={`flex items-center ${style.text} text-sm`}>
        {renderContent()}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={`
          absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border shadow-sm
          flex items-center justify-center opacity-0 group-hover:opacity-100
          transition-opacity ${style.text} hover:bg-red-50 hover:text-red-500 hover:border-red-200
        `}
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {editMenu && (
        <div
          ref={menuRef}
          className="fixed bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-50 min-w-[200px]"
          style={{ left: editMenu.x, top: editMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-700">
              Edit: {getEditMenuHeader(pill)}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
              {dataType}
            </span>
          </div>

          {pill.type !== "type" && (
            <div className="mb-3">
              <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">
                Operator
              </label>
              <div className="flex flex-wrap gap-1">
                {availableOperators.map((op) => (
                  <button
                    key={op.value}
                    onClick={() => setEditOperator(op.value)}
                    className={`
                      px-2 py-1 text-xs font-mono rounded border transition-all
                      ${
                        editOperator === op.value
                          ? "bg-blue-100 border-blue-300 text-blue-700"
                          : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                      }
                    `}
                  >
                    {op.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-3 relative">
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">
              {pill.type === "type" ? "Type Name" : "Value"}
            </label>
            {dataType === "boolean" ? (
              <div className="flex gap-1">
                <button
                  onClick={() => setEditValue("true")}
                  className={`
                    flex-1 px-2 py-1.5 text-xs rounded border transition-all
                    ${
                      editValue === "true"
                        ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }
                  `}
                >
                  true
                </button>
                <button
                  onClick={() => setEditValue("false")}
                  className={`
                    flex-1 px-2 py-1.5 text-xs rounded border transition-all
                    ${
                      editValue === "false"
                        ? "bg-red-100 border-red-300 text-red-700"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }
                  `}
                >
                  false
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  ref={valueInputRef}
                  type={dataType === "numeric" ? "number" : "text"}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onFocus={() => setShowValueDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSaveEdit();
                    } else if (e.key === "Escape") {
                      setEditMenu(null);
                    }
                  }}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  placeholder={
                    dataType === "numeric"
                      ? "Enter number..."
                      : "Type to search..."
                  }
                />

                {showValueDropdown &&
                  filteredValues.length > 0 &&
                  dataType !== "numeric" && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[150px] overflow-y-auto z-10">
                      {filteredValues.map((value) => (
                        <button
                          key={value}
                          onClick={() => handleSelectValue(value)}
                          className={`
                          w-full px-2 py-1.5 text-left text-xs hover:bg-blue-50 transition-colors
                          ${editValue === value ? "bg-blue-50 text-blue-700" : "text-gray-700"}
                        `}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  )}

                {dataType === "numeric" && availableValues.length > 0 && (
                  <div className="mt-1 text-[10px] text-gray-400">
                    Examples: {availableValues.slice(0, 3).join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => setEditMenu(null)}
              className="flex-1 px-2 py-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="flex-1 px-2 py-1.5 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors"
            >
              Save
            </button>
          </div>

          <button
            onClick={() => {
              onRemove();
              setEditMenu(null);
            }}
            className="w-full mt-2 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded transition-colors border border-transparent hover:border-red-200"
          >
            Remove predicate
          </button>
        </div>
      )}
    </div>
  );
});

export default VisualPill;
