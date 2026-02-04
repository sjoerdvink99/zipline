import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useVisualBuilderStore } from "./store";
import {
  useGraphSchema,
  getAttributeType,
  getValueSuggestions,
} from "../../../hooks/useGraphSchema";
import type { Comparator } from "./types";

type Tab = "attribute" | "topology" | "type";

const NUMERIC_OPS: { value: Comparator; label: string }[] = [
  { value: "=", label: "=" },
  { value: "!=", label: "≠" },
  { value: ">", label: ">" },
  { value: ">=", label: "≥" },
  { value: "<", label: "<" },
  { value: "<=", label: "≤" },
];

const CATEGORICAL_OPS: { value: Comparator; label: string }[] = [
  { value: "=", label: "=" },
  { value: "!=", label: "≠" },
];

const TYPE_KEYS = ["node_type", "type", "label"] as const;
const POPOVER_WIDTH = 240;

function opsForFieldType(
  fieldType: string | null,
): { value: Comparator; label: string }[] {
  if (fieldType === "numeric") return NUMERIC_OPS;
  if (fieldType === "boolean") return [{ value: "=", label: "=" }];
  return CATEGORICAL_OPS;
}

export const QuickAddPopover = memo(function QuickAddPopover() {
  const { addAttributePredicate, addTopologyPredicate, addTypePredicate } =
    useVisualBuilderStore();
  const { schema, loading } = useGraphSchema();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("attribute");
  const [field, setField] = useState("");
  const [op, setOp] = useState<Comparator>("=");
  const [val, setVal] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const attributeFields = useMemo(() => {
    if (!schema) return [];
    return Object.keys(schema.node_attributes)
      .filter((k) => !(TYPE_KEYS as readonly string[]).includes(k))
      .sort();
  }, [schema]);

  const topologyFields = useMemo(() => {
    if (!schema) return [];
    return Object.keys(schema.topology_attributes).sort();
  }, [schema]);

  const typeValues = useMemo(() => {
    if (!schema) return [];
    for (const key of TYPE_KEYS) {
      const info = schema.node_attributes[key];
      if (info?.values?.length) return info.values;
    }
    return [];
  }, [schema]);

  const fieldType = useMemo(() => {
    if (tab === "type" || !field) return null;
    return getAttributeType(
      schema,
      field,
      tab === "topology" ? "topology" : "attribute",
    );
  }, [schema, tab, field]);

  const valueOptions = useMemo(() => {
    if (tab === "type") return typeValues;
    if (!field) return [];
    return getValueSuggestions(
      schema,
      field,
      tab === "topology" ? "topology" : "attribute",
    );
  }, [schema, tab, field, typeValues]);

  const ops = useMemo(() => opsForFieldType(fieldType), [fieldType]);

  const canAdd = useMemo(() => {
    if (tab === "type") return val.trim() !== "";
    if (!field || !val.trim()) return false;
    if (fieldType === "numeric") return !isNaN(parseFloat(val));
    return true;
  }, [tab, field, val, fieldType]);

  useEffect(() => {
    setField("");
    setOp("=");
    setVal("");
  }, [tab]);

  useEffect(() => {
    setField("");
    setVal("");
    setOp("=");
    setTab("attribute");
  }, [schema]);

  useEffect(() => {
    setOp("=");
    setVal("");
  }, [field]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !panelRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = useCallback(() => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({
        top: r.bottom + 6,
        left: Math.max(8, r.right - POPOVER_WIDTH),
      });
    }
    setOpen((v) => !v);
  }, []);

  const handleAdd = useCallback(() => {
    if (!canAdd) return;

    if (tab === "type") {
      addTypePredicate(val.trim());
    } else if (tab === "topology") {
      addTopologyPredicate(field, op, parseFloat(val));
    } else {
      addAttributePredicate(
        field,
        op,
        fieldType === "numeric" ? parseFloat(val) : val.trim(),
      );
    }

    setField("");
    setVal("");
    setOp("=");
    setOpen(false);
  }, [
    canAdd,
    tab,
    field,
    op,
    val,
    fieldType,
    addAttributePredicate,
    addTopologyPredicate,
    addTypePredicate,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleAdd();
      if (e.key === "Escape") setOpen(false);
    },
    [handleAdd],
  );

  const fieldList = tab === "topology" ? topologyFields : attributeFields;
  const showValueSelect = fieldType !== "numeric" && valueOptions.length > 0;

  return (
    <div>
      <button
        ref={btnRef}
        onClick={handleToggle}
        disabled={loading}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-40"
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
            d="M12 4v16m8-8H4"
          />
        </svg>
        Add
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed z-50 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
          style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
          onKeyDown={handleKeyDown}
        >
          <div className="flex border-b border-gray-100">
            {(["attribute", "topology", "type"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`
                  flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors
                  ${
                    tab === t
                      ? "text-gray-800 border-b-2 border-gray-800 -mb-px"
                      : "text-gray-400 hover:text-gray-600"
                  }
                `}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-3 space-y-2.5">
            {tab !== "type" && (
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">
                  {tab === "topology" ? "Metric" : "Field"}
                </label>
                <select
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  <option value="">Select…</option>
                  {fieldList.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {tab !== "type" && field && (
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">
                  Operator
                </label>
                <div className="flex gap-1">
                  {ops.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setOp(o.value)}
                      className={`
                        flex-1 py-1 text-xs font-mono rounded border transition-all
                        ${
                          op === o.value
                            ? "bg-gray-800 border-gray-800 text-white"
                            : "bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700"
                        }
                      `}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(tab === "type" || field) && (
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">
                  Value
                </label>
                {fieldType === "numeric" ? (
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder="Enter number…"
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                ) : showValueSelect ? (
                  <select
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
                  >
                    <option value="">Select…</option>
                    {valueOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder="Enter value…"
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                )}
              </div>
            )}
          </div>

          <div className="px-3 pb-3">
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="w-full py-1.5 text-xs font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-30 transition-all"
            >
              Add predicate
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
