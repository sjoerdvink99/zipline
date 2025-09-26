import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { isAbortedRequest } from "../../api";
import { getDistributions } from "../../api/attributes";
import type {
  AttributeDistribution,
  NumericDistribution,
  CategoricalDistribution,
  BooleanDistribution,
  TemporalDistribution,
  DistributionsByLabelResponse,
  LabelDistributions,
} from "../../api/attributes";
import { useAnalysisStore } from "../../store/analysisStore";
import type { GeneratedPredicate } from "../../api/predicates";
import { getLabelColor } from "../../config/labelColors";
import { getNodeType, NODE_TYPE_COLORS } from "../../config/pixiColors";
import { UmapVisualization } from "../panels/UmapVisualization";

const pixiColorToHex = (color: number): string => {
  return `#${color.toString(16).padStart(6, '0')}`;
};

const getTopologyColor = (label: string): string => {
  const nodeType = getNodeType(label);
  const color = NODE_TYPE_COLORS[nodeType];
  return pixiColorToHex(color);
};

const estimateMean = (dist: NumericDistribution): number => {
  let totalSum = 0;
  let totalCount = 0;
  for (const bin of dist.bins) {
    const midpoint = (bin.min + bin.max) / 2;
    totalSum += midpoint * bin.count;
    totalCount += bin.count;
  }
  return totalCount > 0 ? totalSum / totalCount : 0;
};

const Histogram = ({
  dist,
  attributeName,
  labelScope,
  selectedNodes,
  onSelectBin,
  onCreatePredicate,
}: {
  dist: NumericDistribution;
  attributeName: string;
  labelScope?: string | string[];
  selectedNodes: string[];
  onSelectBin: (nodeIds: string[]) => void;
  onCreatePredicate: (predicate: GeneratedPredicate) => void;
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; bin: typeof dist.bins[0] } | null>(null);
  const maxCount = Math.max(...dist.bins.map((b) => b.count), 1);
  const selectedSet = useMemo(() => new Set(selectedNodes), [selectedNodes]);
  const hasSelection = selectedNodes.length > 0;

  const mean = useMemo(() => estimateMean(dist), [dist]);
  const meanPosition = useMemo(() => {
    if (dist.max === dist.min) return 50;
    return ((mean - dist.min) / (dist.max - dist.min)) * 100;
  }, [mean, dist.min, dist.max]);

  const formatLabel = useCallback((val: number) => {
    if (Math.abs(val) < 0.001 && val !== 0) return val.toExponential(1);
    if (Math.abs(val) >= 10000) return val.toExponential(1);
    if (val % 1 === 0) return val.toString();
    return val.toFixed(2);
  }, []);

  const formatTemporalLabel = useCallback((dateStr: string, binType: string) => {
    try {
      const date = new Date(dateStr);
      switch (binType) {
        case 'hours':
          return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        case 'days':
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        case 'months':
          return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        case 'years':
          return date.getFullYear().toString();
        default:
          return date.toLocaleDateString('en-US');
      }
    } catch {
      return dateStr;
    }
  }, []);

  const handleBarClick = useCallback(
    (e: React.MouseEvent, bin: (typeof dist.bins)[0]) => {
      if (e.shiftKey) {
        const predicate: GeneratedPredicate = {
          id: `attr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          attribute: attributeName,
          operator: "between",
          value: bin.min,
          value2: bin.max,
          match_count: bin.count,
          precision: 1,
          recall: 1,
          f1_score: 1,
          is_structural: false,
          attribute_type: "numeric",
          label_scope: labelScope,
        };
        onCreatePredicate(predicate);
      } else {
        onSelectBin(bin.node_ids);
      }
    },
    [onSelectBin, onCreatePredicate, attributeName, labelScope]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, bin: typeof dist.bins[0]) => {
      e.preventDefault();
      const menuWidth = 140;
      const menuHeight = 60;
      const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
      const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
      setContextMenu({ x, y, bin });
    },
    []
  );

  const handleCreatePredicate = useCallback(() => {
    if (!contextMenu) return;
    const { bin } = contextMenu;
    const predicate: GeneratedPredicate = {
      id: `attr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      attribute: attributeName,
      operator: "between",
      value: bin.min,
      value2: bin.max,
      match_count: bin.count,
      precision: 1,
      recall: 1,
      f1_score: 1,
      is_structural: false,
      attribute_type: "numeric",
      label_scope: labelScope,
    };
    onCreatePredicate(predicate);
    setContextMenu(null);
  }, [contextMenu, attributeName, labelScope, onCreatePredicate]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  return (
    <div className="mt-2">
      <div className="relative h-10 flex items-end gap-px bg-gray-50/50 rounded p-1">
        {dist.bins.map((bin, i) => {
          const totalHeight = (bin.count / maxCount) * 90; // Leave some padding
          const selectedInBin = bin.node_ids.filter((id) =>
            selectedSet.has(id)
          ).length;
          const selectedHeight = hasSelection
            ? (selectedInBin / maxCount) * 90
            : 0;

          return (
            <button
              key={i}
              className="flex-1 min-w-0 h-full relative group transition-all duration-150 hover:scale-105"
              onClick={(e) => handleBarClick(e, bin)}
              onContextMenu={(e) => handleContextMenu(e, bin)}
              title={`${formatLabel(bin.min)}${bin.min !== bin.max ? ` – ${formatLabel(bin.max)}` : ""}: ${bin.count} nodes (shift-click to add filter)`}
            >
              <div
                className="absolute bottom-0 left-0 right-0 rounded-sm bg-gray-300/80 group-hover:bg-gray-400 transition-all duration-150"
                style={{ height: `${Math.max(totalHeight, 6)}%` }}
              />
              {hasSelection && selectedInBin > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-sm bg-slate-400 shadow-sm"
                  style={{ height: `${Math.max(selectedHeight, 4)}%` }}
                />
              )}
            </button>
          );
        })}
        {dist.max !== dist.min && (
          <div
            className="absolute bottom-1 w-0.5 h-[calc(100%-8px)] bg-slate-500 pointer-events-none z-10 rounded-full shadow-sm"
            style={{ left: `calc(${meanPosition}% + 4px)` }}
            title={`Mean: ${formatLabel(mean)}`}
          />
        )}
      </div>
      <div className="flex justify-between text-[9px] text-gray-500 mt-2 px-1">
        <span className="font-mono">{formatLabel(dist.min)}</span>
        <span className="text-slate-600 font-medium">μ={formatLabel(mean)}</span>
        <span className="font-mono">{formatLabel(dist.max)}</span>
      </div>

      {contextMenu && (
        <div
          className="fixed bg-white rounded-md shadow-lg border border-gray-200 py-1.5 z-50 min-w-[130px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { onSelectBin(contextMenu.bin.node_ids); setContextMenu(null); }}
            className="w-full px-3 py-2 text-left text-[11px] text-gray-700 hover:bg-gray-50 hover:text-gray-800 transition-colors duration-150 font-medium"
          >
            Select nodes
          </button>
          <button
            onClick={handleCreatePredicate}
            className="w-full px-3 py-2 text-left text-[11px] text-gray-700 hover:bg-gray-50 hover:text-gray-800 transition-colors duration-150 font-medium"
          >
            Add as filter
          </button>
        </div>
      )}
    </div>
  );
};

const TemporalHistogram = ({
  dist,
  attributeName,
  labelScope,
  selectedNodes,
  onSelectBin,
  onCreatePredicate,
}: {
  dist: TemporalDistribution;
  attributeName: string;
  labelScope?: string | string[];
  selectedNodes: string[];
  onSelectBin: (nodeIds: string[]) => void;
  onCreatePredicate: (predicate: GeneratedPredicate) => void;
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; bin: typeof dist.bins[0] } | null>(null);
  const maxCount = Math.max(...dist.bins.map((b) => b.count), 1);
  const selectedSet = useMemo(() => new Set(selectedNodes), [selectedNodes]);
  const hasSelection = selectedNodes.length > 0;

  const formatTemporalLabel = useCallback((dateStr: string, binType: string) => {
    try {
      const date = new Date(dateStr);
      switch (binType) {
        case 'hours':
          return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        case 'days':
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        case 'months':
          return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        case 'years':
          return date.getFullYear().toString();
        default:
          return date.toLocaleDateString('en-US');
      }
    } catch {
      return dateStr;
    }
  }, []);

  const handleBarClick = useCallback(
    (e: React.MouseEvent, bin: typeof dist.bins[0]) => {
      if (e.shiftKey) {
        const predicate: GeneratedPredicate = {
          id: `attr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          attribute: attributeName,
          operator: "between",
          value: bin.min_date,
          value2: bin.max_date,
          match_count: bin.count,
          precision: 1,
          recall: 1,
          f1_score: 1,
          is_structural: false,
          attribute_type: "temporal",
          label_scope: labelScope,
        };
        onCreatePredicate(predicate);
      } else {
        onSelectBin(bin.node_ids);
      }
    },
    [onSelectBin, onCreatePredicate, attributeName, labelScope]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, bin: typeof dist.bins[0]) => {
      e.preventDefault();
      const menuWidth = 140;
      const menuHeight = 60;
      const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
      const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
      setContextMenu({ x, y, bin });
    },
    []
  );

  const handleCreatePredicate = useCallback(() => {
    if (!contextMenu) return;
    const { bin } = contextMenu;
    const predicate: GeneratedPredicate = {
      id: `attr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      attribute: attributeName,
      operator: "between",
      value: bin.min_date,
      value2: bin.max_date,
      match_count: bin.count,
      precision: 1,
      recall: 1,
      f1_score: 1,
      is_structural: false,
      attribute_type: "temporal",
      label_scope: labelScope,
    };
    onCreatePredicate(predicate);
    setContextMenu(null);
  }, [contextMenu, attributeName, labelScope, onCreatePredicate]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  return (
    <div className="mt-2">
      <div className="relative h-10 flex items-end gap-px bg-gray-50/50 rounded p-1">
        {dist.bins.map((bin, i) => {
          const totalHeight = (bin.count / maxCount) * 90;
          const selectedInBin = bin.node_ids.filter((id) =>
            selectedSet.has(id)
          ).length;
          const selectedHeight = hasSelection
            ? (selectedInBin / maxCount) * 90
            : 0;

          const startDate = formatTemporalLabel(bin.min_date, dist.bin_type);
          const endDate = formatTemporalLabel(bin.max_date, dist.bin_type);
          const tooltip = startDate === endDate ?
            `${startDate}: ${bin.count} nodes` :
            `${startDate} – ${endDate}: ${bin.count} nodes`;

          return (
            <button
              key={i}
              className="flex-1 min-w-0 h-full relative group transition-all duration-150 hover:scale-105"
              onClick={(e) => handleBarClick(e, bin)}
              onContextMenu={(e) => handleContextMenu(e, bin)}
              title={`${tooltip} (shift-click to add filter)`}
            >
              <div
                className="absolute bottom-0 left-0 right-0 rounded-sm bg-gray-300/80 group-hover:bg-gray-400 transition-all duration-150"
                style={{ height: `${Math.max(totalHeight, 6)}%` }}
              />
              {hasSelection && selectedInBin > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-sm bg-slate-400 shadow-sm"
                  style={{ height: `${Math.max(selectedHeight, 4)}%` }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-gray-500 mt-2 px-1">
        <span className="font-mono">
          {formatTemporalLabel(dist.min_date, dist.bin_type)}
        </span>
        <span className="text-slate-600 font-medium capitalize">
          {dist.bin_type}
        </span>
        <span className="font-mono">
          {formatTemporalLabel(dist.max_date, dist.bin_type)}
        </span>
      </div>

      {contextMenu && (
        <div
          className="fixed bg-white rounded-md shadow-lg border border-gray-200 py-1.5 z-50 min-w-[130px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { onSelectBin(contextMenu.bin.node_ids); setContextMenu(null); }}
            className="w-full px-3 py-2 text-left text-[11px] text-gray-700 hover:bg-gray-50 hover:text-gray-800 transition-colors duration-150 font-medium"
          >
            Select nodes
          </button>
          <button
            onClick={handleCreatePredicate}
            className="w-full px-3 py-2 text-left text-[11px] text-gray-700 hover:bg-gray-50 hover:text-gray-800 transition-colors duration-150 font-medium"
          >
            Add as filter
          </button>
        </div>
      )}
    </div>
  );
};

const BarChart = ({
  dist,
  attributeName,
  labelScope,
  selectedNodes,
  onSelectValue,
  onCreatePredicate,
}: {
  dist: CategoricalDistribution | BooleanDistribution;
  attributeName: string;
  labelScope?: string | string[];
  selectedNodes: string[];
  onSelectValue: (nodeIds: string[]) => void;
  onCreatePredicate: (predicate: GeneratedPredicate) => void;
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; value: typeof dist.values[0] } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAll, setShowAll] = useState(false);
  const maxCount = Math.max(...dist.values.map((v) => v.count), 1);
  const selectedSet = new Set(selectedNodes);
  const hasSelection = selectedNodes.length > 0;

  const handleBarClick = useCallback(
    (e: React.MouseEvent, value: (typeof dist.values)[0]) => {
      if (e.shiftKey) {
        const isBool = dist.type === "boolean";
        const predicate: GeneratedPredicate = {
          id: `attr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          attribute: attributeName,
          operator: "=",
          value: isBool ? value.label === "true" : value.label,
          match_count: value.count,
          precision: 1,
          recall: 1,
          f1_score: 1,
          is_structural: false,
          attribute_type: isBool ? "boolean" : "categorical",
          label_scope: labelScope,
        };
        onCreatePredicate(predicate);
      } else {
        onSelectValue(value.node_ids);
      }
    },
    [onSelectValue, onCreatePredicate, attributeName, dist.type, labelScope]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, value: typeof dist.values[0]) => {
      e.preventDefault();
      const menuWidth = 140;
      const menuHeight = 60;
      const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
      const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
      setContextMenu({ x, y, value });
    },
    []
  );

  const handleCreatePredicate = useCallback(() => {
    if (!contextMenu) return;
    const { value } = contextMenu;
    const isBool = dist.type === "boolean";
    const predicate: GeneratedPredicate = {
      id: `attr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      attribute: attributeName,
      operator: "=",
      value: isBool ? value.label === "true" : value.label,
      match_count: value.count,
      precision: 1,
      recall: 1,
      f1_score: 1,
      is_structural: false,
      attribute_type: isBool ? "boolean" : "categorical",
      label_scope: labelScope,
    };
    onCreatePredicate(predicate);
    setContextMenu(null);
  }, [contextMenu, attributeName, dist.type, labelScope, onCreatePredicate]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const filteredValues = useMemo(() => {
    const filtered = dist.values.filter(value =>
      value.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const limit = showAll ? filtered.length : Math.min(filtered.length, 8);
    return filtered.slice(0, limit);
  }, [dist.values, searchTerm, showAll]);

  const hasSearch = dist.values.length > 20;
  const hiddenCount = dist.values.filter(value =>
    value.label.toLowerCase().includes(searchTerm.toLowerCase())
  ).length - filteredValues.length;

  return (
    <div className="space-y-1.5 relative mt-2">
      {hasSearch && (
        <div className="mb-2">
          <input
            type="text"
            placeholder="Search values..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-[10px] px-2 py-1.5 border border-gray-200 rounded-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
          />
        </div>
      )}
      {filteredValues.map((value) => {
        const width = (value.count / maxCount) * 100;
        const selectedInValue = value.node_ids.filter((id) =>
          selectedSet.has(id)
        ).length;
        const selectedWidth = hasSelection
          ? (selectedInValue / maxCount) * 100
          : 0;

        return (
          <button
            key={value.label}
            className="w-full group hover:bg-gray-50/50 rounded-sm p-1 transition-colors duration-150"
            onClick={(e) => handleBarClick(e, value)}
            onContextMenu={(e) => handleContextMenu(e, value)}
            title={`${value.label}: ${value.count} nodes (shift-click to add filter)`}
          >
            <div className="flex items-center gap-2.5">
              <span className={`text-[9px] w-16 truncate text-left font-medium ${
                value.label.startsWith('[') && value.label.endsWith(']')
                  ? 'text-gray-400 italic'
                  : 'text-gray-600'
              }`}>
                {value.label}
              </span>
              <div className="flex-1 h-3.5 bg-gray-100 rounded-sm relative overflow-hidden shadow-inner">
                <div
                  className="absolute left-0 top-0 h-full bg-gray-300 group-hover:bg-gray-400 transition-all duration-150 rounded-sm"
                  style={{ width: `${Math.max(width, 2)}%` }}
                />
                {hasSelection && selectedInValue > 0 && (
                  <div
                    className="absolute left-0 top-0 h-full bg-slate-400 rounded-sm shadow-sm"
                    style={{ width: `${Math.max(selectedWidth, 1)}%` }}
                  />
                )}
              </div>
              <span className="text-[9px] text-gray-500 w-7 text-right font-mono">
                {value.count}
              </span>
            </div>
          </button>
        );
      })}
      {hiddenCount > 0 && (
        <div className="flex items-center justify-center gap-2 text-[9px] text-gray-400 mt-2 py-1 border-t border-gray-100">
          <span>+{hiddenCount} more values</span>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-gray-500 hover:text-gray-700 underline"
          >
            {showAll ? "show less" : "show all"}
          </button>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed bg-white rounded-md shadow-lg border border-gray-200 py-1.5 z-50 min-w-[130px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { onSelectValue(contextMenu.value.node_ids); setContextMenu(null); }}
            className="w-full px-3 py-2 text-left text-[11px] text-gray-700 hover:bg-gray-50 hover:text-gray-800 transition-colors duration-150 font-medium"
          >
            Select nodes
          </button>
          <button
            onClick={handleCreatePredicate}
            className="w-full px-3 py-2 text-left text-[11px] text-gray-700 hover:bg-gray-50 hover:text-gray-800 transition-colors duration-150 font-medium"
          >
            Add as filter
          </button>
        </div>
      )}
    </div>
  );
};

const getSelectionSummary = (
  distribution: AttributeDistribution,
  selectedNodes: string[]
): string | null => {
  if (selectedNodes.length === 0) return null;

  const selectedSet = new Set(selectedNodes);

  if (distribution.type === "temporal") {
    const selectedBins = distribution.bins.filter(bin =>
      bin.node_ids.some(id => selectedSet.has(id))
    );

    if (selectedBins.length === 0) return null;
    if (selectedBins.length === 1) {
      try {
        const date = new Date(selectedBins[0].min_date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      } catch {
        return selectedBins[0].label;
      }
    }

    const minDate = new Date(Math.min(...selectedBins.map(bin => new Date(bin.min_date).getTime())));
    const maxDate = new Date(Math.max(...selectedBins.map(bin => new Date(bin.max_date).getTime())));

    const formatDate = (date: Date) => {
      try {
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      } catch {
        return date.toString();
      }
    };

    return `${formatDate(minDate)} – ${formatDate(maxDate)}`;
  } else if (distribution.type === "numeric") {
    const selectedValues: number[] = [];
    for (const bin of distribution.bins) {
      const matchCount = bin.node_ids.filter((id) => selectedSet.has(id)).length;
      if (matchCount > 0) {
        const midpoint = (bin.min + bin.max) / 2;
        for (let i = 0; i < matchCount; i++) {
          selectedValues.push(midpoint);
        }
      }
    }

    if (selectedValues.length === 0) return null;
    if (selectedValues.length === 1) {
      const v = selectedValues[0];
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }

    const min = Math.min(...selectedValues);
    const max = Math.max(...selectedValues);
    const avg =
      selectedValues.reduce((a, b) => a + b, 0) / selectedValues.length;

    if (min === max) {
      return Number.isInteger(min) ? String(min) : min.toFixed(2);
    }

    const formatNum = (n: number) =>
      Number.isInteger(n) ? String(n) : n.toFixed(1);
    return `μ ${formatNum(avg)} (${formatNum(min)}–${formatNum(max)})`;
  } else {
    const valueCounts: Record<string, number> = {};
    for (const val of distribution.values) {
      const matchCount = val.node_ids.filter((id) => selectedSet.has(id)).length;
      if (matchCount > 0) {
        valueCounts[val.label] = matchCount;
      }
    }

    const entries = Object.entries(valueCounts);
    if (entries.length === 0) return null;
    if (entries.length === 1) return entries[0][0];

    entries.sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, c]) => sum + c, 0);
    const top = entries[0];

    if (top[1] === total) return top[0];
    return `${top[0]} (${Math.round((top[1] / total) * 100)}%)`;
  }
};

const AttributeRow = ({
  attributeName,
  distribution,
  labelScope,
  selectedNodes,
  onSelectNodes,
  onCreatePredicate,
}: {
  attributeName: string;
  distribution: AttributeDistribution;
  labelScope?: string | string[];
  selectedNodes: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onCreatePredicate: (predicate: GeneratedPredicate) => void;
}) => {
  const selectionSummary = useMemo(
    () => getSelectionSummary(distribution, selectedNodes),
    [distribution, selectedNodes]
  );

  return (
    <div className="px-3 py-1 relative">
      <div className="w-full flex items-center justify-between py-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold text-gray-700 truncate">
            {attributeName}
          </span>
        </div>
        {selectionSummary && (
          <span
            className="text-[9px] text-slate-700 font-semibold ml-2 truncate max-w-[45%] bg-slate-100 px-1.5 py-0.5 rounded"
            title={selectionSummary}
          >
            {selectionSummary}
          </span>
        )}
      </div>
      <div className="pb-2">
        {distribution.type === "numeric" ? (
          <Histogram
            dist={distribution}
            attributeName={attributeName}
            labelScope={labelScope}
            selectedNodes={selectedNodes}
            onSelectBin={onSelectNodes}
            onCreatePredicate={onCreatePredicate}
          />
        ) : distribution.type === "temporal" ? (
          <TemporalHistogram
            dist={distribution}
            attributeName={attributeName}
            labelScope={labelScope}
            selectedNodes={selectedNodes}
            onSelectBin={onSelectNodes}
            onCreatePredicate={onCreatePredicate}
          />
        ) : (
          <BarChart
            dist={distribution}
            attributeName={attributeName}
            labelScope={labelScope}
            selectedNodes={selectedNodes}
            onSelectValue={onSelectNodes}
            onCreatePredicate={onCreatePredicate}
          />
        )}
      </div>
    </div>
  );
};

const LabelSection = ({
  label,
  labelData,
  selectedNodes,
  onSelectNodes,
  onCreatePredicate,
}: {
  label: string;
  labelData: LabelDistributions;
  selectedNodes: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onCreatePredicate: (predicate: GeneratedPredicate) => void;
}) => {
  const colors = getLabelColor(label);

  const selectedSet = useMemo(() => new Set(selectedNodes), [selectedNodes]);
  const selectedInLabel = useMemo(() => {
    return labelData.node_ids.filter((id) => selectedSet.has(id)).length;
  }, [labelData.node_ids, selectedSet]);

  const sortedAttrs = useMemo(() => {
    return Object.entries(labelData.attributes).sort(([a], [b]) => a.localeCompare(b));
  }, [labelData.attributes]);

  const hasAttributes = sortedAttrs.length > 0;

  const topologyColor = getTopologyColor(label);

  return (
    <div className="overflow-hidden">
      <div className={`w-full flex items-center justify-between px-3 py-3 ${selectedInLabel > 0 ? colors.bg : 'bg-transparent'} rounded-lg`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: topologyColor }}
          />
          <span className={`text-[11px] font-bold ${selectedInLabel > 0 ? colors.text : 'text-gray-700'} truncate`}>
            {label}
          </span>
          <span className="text-[9px] text-gray-500 font-medium bg-gray-100 px-1.5 py-0.5 rounded">
            {labelData.label_count} nodes
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {selectedInLabel > 0 && (
            <span className="text-[9px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
              {selectedInLabel} selected
            </span>
          )}
          {!hasAttributes && (
            <span className="text-[9px] text-gray-400 italic font-medium">
              no unique attrs
            </span>
          )}
        </div>
      </div>
      {hasAttributes && (
        <div className="mt-2">
          {sortedAttrs.map(([attrName, dist]) => (
            <AttributeRow
              key={attrName}
              attributeName={attrName}
              distribution={dist}
              labelScope={label}
              selectedNodes={selectedNodes}
              onSelectNodes={onSelectNodes}
              onCreatePredicate={onCreatePredicate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SharedAttributesSection = ({
  sharedAttributes,
  selectedNodes,
  onSelectNodes,
  onCreatePredicate,
}: {
  sharedAttributes: Record<string, AttributeDistribution>;
  selectedNodes: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onCreatePredicate: (predicate: GeneratedPredicate) => void;
}) => {
  const sortedAttrs = useMemo(() => {
    return Object.entries(sharedAttributes).sort(([a], [b]) => a.localeCompare(b));
  }, [sharedAttributes]);

  if (sortedAttrs.length === 0) return null;

  return (
    <div className="overflow-hidden">
      <div className="w-full flex items-center justify-between px-3 py-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[11px] font-bold text-gray-700">
            Shared Attributes
          </span>
          <span className="text-[9px] text-gray-500 font-medium bg-gray-100 px-1.5 py-0.5 rounded">
            {sortedAttrs.length} attrs across labels
          </span>
        </div>
      </div>
      <div className="mt-2">
        {sortedAttrs.map(([attrName, dist]) => {
          const labels = (dist as AttributeDistribution & { labels?: string[] }).labels || [];
          return (
            <div key={attrName}>
              <AttributeRow
                attributeName={attrName}
                distribution={dist}
                labelScope={labels}
                selectedNodes={selectedNodes}
                onSelectNodes={onSelectNodes}
                onCreatePredicate={onCreatePredicate}
              />
              {labels.length > 0 && (
                <div className="ml-3 -mt-1 mb-2">
                  <div className="flex flex-wrap gap-1">
                    {labels.map((lbl) => {
                      const lblColors = getLabelColor(lbl);
                      return (
                        <span
                          key={lbl}
                          className={`text-[8px] px-1.5 py-0.5 rounded ${lblColors.bg} ${lblColors.text}`}
                        >
                          {lbl}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

type TabType = "attributes" | "umap";

export const AttributePanel = () => {
  const {
    selectedNodes,
    setSelection,
    savePredicateDirect,
  } = useAnalysisStore();

  const [activeTab, setActiveTab] = useState<TabType>("attributes");
  const [distributionsData, setDistributionsData] = useState<DistributionsByLabelResponse | null>(null);
  const [distLoading, setDistLoading] = useState(true);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string[]>([]);

  const distAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const fetchDistributions = async (signal?: AbortSignal) => {
      setDistLoading(true);
      try {
        const result = await getDistributions();
        if (!signal?.aborted) {
          setDistributionsData(result);
        }
      } catch (error) {
        if (!isAbortedRequest(error) && !signal?.aborted) {
          console.error("Failed to fetch distributions:", error);
        }
      } finally {
        if (!signal?.aborted) {
          setDistLoading(false);
        }
      }
    };

    distAbortRef.current?.abort();
    distAbortRef.current = new AbortController();
    fetchDistributions(distAbortRef.current.signal);

    const handleGraphSwitch = () => {
      distAbortRef.current?.abort();
      distAbortRef.current = new AbortController();
      fetchDistributions(distAbortRef.current.signal);
      setNodeTypeFilter([]);
    };

    window.addEventListener("gb:graph-switched", handleGraphSwitch);
    return () => {
      distAbortRef.current?.abort();
      window.removeEventListener("gb:graph-switched", handleGraphSwitch);
    };
  }, []);

  const handleSelectNodes = useCallback(
    (nodeIds: string[]) => {
      setSelection(nodeIds, "attribute");
    },
    [setSelection]
  );

  const handleAddFilter = useCallback(
    (predicate: GeneratedPredicate) => {
      savePredicateDirect(predicate);
    },
    [savePredicateDirect]
  );

  const sortedLabels = useMemo(() => {
    if (!distributionsData?.distributions_by_label) return [];
    return Object.entries(distributionsData.distributions_by_label)
      .sort(([, a], [, b]) => b.label_count - a.label_count);
  }, [distributionsData]);

  const filteredLabels = useMemo(() => {
    if (nodeTypeFilter.length === 0) return sortedLabels;
    return sortedLabels.filter(([label]) => nodeTypeFilter.includes(label));
  }, [sortedLabels, nodeTypeFilter]);

  const availableNodeTypes = useMemo(() => {
    return sortedLabels.map(([label]) => label);
  }, [sortedLabels]);

  const handleNodeTypeToggle = useCallback((nodeType: string, shiftKey: boolean = false) => {
    if (shiftKey) {
      // Shift+click: Create node type predicate directly
      const predicate: GeneratedPredicate = {
        id: `node_type_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        attribute: "node_type",
        operator: "=",
        value: nodeType,
        match_count: sortedLabels.find(([label]) => label === nodeType)?.[1]?.label_count || 0,
        precision: 1,
        recall: 1,
        f1_score: 1,
        is_structural: false,
        attribute_type: "categorical",
        label_scope: undefined,
      };
      handleAddFilter(predicate);
    } else {
      // Regular click: Toggle filter
      setNodeTypeFilter(prev =>
        prev.includes(nodeType)
          ? prev.filter(t => t !== nodeType)
          : [...prev, nodeType]
      );
    }
  }, [sortedLabels, handleAddFilter]);

  const handleSelectAllTypes = useCallback(() => {
    setNodeTypeFilter(availableNodeTypes);
  }, [availableNodeTypes]);

  const handleClearTypeFilter = useCallback(() => {
    setNodeTypeFilter([]);
  }, []);

  useEffect(() => {
    setNodeTypeFilter([]);
  }, [distributionsData]);

  const hasLabels = sortedLabels.length > 0;
  const hasSharedAttrs = distributionsData?.shared_attributes && Object.keys(distributionsData.shared_attributes).length > 0;
  const hasFilteredResults = filteredLabels.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="shrink-0 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gray-100 rounded-lg">
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                Attribute Space
              </h2>
              <p className="text-[10px] text-gray-500">
                Explore node attributes
              </p>
            </div>
          </div>

          
          <div className="flex border border-gray-200 rounded p-0.5 bg-gray-50">
            <button
              onClick={() => setActiveTab("attributes")}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-all duration-150 ${
                activeTab === "attributes"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              Attrs
            </button>
            <button
              onClick={() => setActiveTab("umap")}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-all duration-150 ${
                activeTab === "umap"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              UMAP
            </button>
          </div>
        </div>
      </div>

      
      {activeTab === "attributes" && hasLabels && (
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-700">
                Filter by node type
              </span>
              <div className="flex gap-1">
                {nodeTypeFilter.length > 0 && nodeTypeFilter.length < availableNodeTypes.length && (
                  <button
                    onClick={handleSelectAllTypes}
                    className="text-[9px] text-gray-500 hover:text-gray-700 underline px-1"
                  >
                    select all
                  </button>
                )}
                {nodeTypeFilter.length > 0 && (
                  <button
                    onClick={handleClearTypeFilter}
                    className="text-[9px] text-gray-500 hover:text-gray-700 underline px-1"
                  >
                    clear
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {availableNodeTypes.map(nodeType => {
                const isFilterActive = nodeTypeFilter.length > 0;
                const isSelected = nodeTypeFilter.includes(nodeType);
                const colors = getLabelColor(nodeType);
                const topologyColor = getTopologyColor(nodeType);

                return (
                  <button
                    key={nodeType}
                    onClick={(e) => handleNodeTypeToggle(nodeType, e.shiftKey)}
                    className={`text-[9px] px-2 py-1 rounded transition-all duration-150 font-medium border flex items-center gap-1.5 ${
                      isFilterActive && isSelected
                        ? `${colors.bg} ${colors.text} border-current`
                        : isFilterActive && !isSelected
                        ? 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                        : 'bg-gray-50 text-gray-700 border-gray-200 opacity-50 hover:opacity-100'
                    }`}
                    title={`${nodeType} (shift-click to add as predicate)`}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: topologyColor }}
                    />
                    {nodeType}
                  </button>
                );
              })}
            </div>

            {nodeTypeFilter.length > 0 && (
              <div className="text-[9px] text-gray-500">
                Showing {filteredLabels.length} of {availableNodeTypes.length} node types
              </div>
            )}
          </div>
        </div>
      )}

      
      {activeTab === "attributes" ? (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="p-4 space-y-4 overflow-hidden">
            {distLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-gray-600 rounded-full" />
              </div>
            ) : !hasLabels && !hasSharedAttrs ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 bg-gray-100 rounded-full mb-4">
                  <svg
                    className="w-8 h-8 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-gray-600 font-semibold mb-1">
                  No attributes available
                </p>
                <p className="text-xs text-gray-500">
                  Load a graph with node attributes to explore
                </p>
              </div>
            ) : nodeTypeFilter.length > 0 && !hasFilteredResults ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 bg-gray-100 rounded-full mb-4">
                  <svg
                    className="w-8 h-8 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-gray-600 font-semibold mb-1">
                  No matching node types
                </p>
                <p className="text-xs text-gray-500">
                  Try adjusting your node type filter
                </p>
              </div>
            ) : (
              <>
                {filteredLabels.map(([label, labelData]) => (
                  <LabelSection
                    key={label}
                    label={label}
                    labelData={labelData}
                    selectedNodes={selectedNodes}
                    onSelectNodes={handleSelectNodes}
                    onCreatePredicate={handleAddFilter}
                  />
                ))}

                {(nodeTypeFilter.length === 0 || hasFilteredResults) && hasSharedAttrs && distributionsData && (
                  <SharedAttributesSection
                    sharedAttributes={distributionsData.shared_attributes}
                    selectedNodes={selectedNodes}
                    onSelectNodes={handleSelectNodes}
                    onCreatePredicate={handleAddFilter}
                  />
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <UmapVisualization />
        </div>
      )}

      {selectedNodes.length > 0 && (
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 bg-gray-50/80">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600 font-medium">
              <span className="font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                {selectedNodes.length}
              </span>{" "}
              nodes selected
            </span>
            <button
              onClick={() => setSelection([], null)}
              className="text-gray-500 hover:text-gray-700 hover:bg-gray-200 px-2 py-1 rounded transition-all duration-150 font-medium text-[11px]"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
