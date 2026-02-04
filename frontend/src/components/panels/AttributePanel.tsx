import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
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
  DistributionBin,
  TemporalBin,
  DistributionValue,
} from "../../api/attributes";
import { useAnalysisStore } from "../../store/analysisStore";
import type { GeneratedPredicate } from "../../api/predicates";
import { getNodeType, NODE_TYPE_COLORS } from "../../config/pixiColors";
import { PanelHeader } from "../ui/PanelHeader";
import { AttributeIcon } from "../ui/Icons";

const pixiColorToHex = (color: number): string => {
  return `#${color.toString(16).padStart(6, "0")}`;
};

const getTopologyColor = (label: string): string => {
  const nodeType = getNodeType(label, { node_type: label });
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

const Histogram = memo(function Histogram({
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
}) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    bin: DistributionBin;
  } | null>(null);
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

  const handleBarClick = useCallback(
    (e: React.MouseEvent, bin: DistributionBin) => {
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
    [onSelectBin, onCreatePredicate, attributeName, labelScope],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, bin: DistributionBin) => {
      e.preventDefault();
      const menuWidth = 140;
      const menuHeight = 60;
      const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
      const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
      setContextMenu({ x, y, bin });
    },
    [],
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
    <div className="mt-1.5">
      <div className="relative h-8 flex items-end gap-[1px] rounded-md overflow-hidden bg-gray-50 p-0.5">
        {dist.bins.map((bin, i) => {
          const totalHeight = (bin.count / maxCount) * 100;
          const selectedInBin = bin.node_ids.filter((id) =>
            selectedSet.has(id),
          ).length;
          const selectedHeight = hasSelection
            ? (selectedInBin / maxCount) * 100
            : 0;

          return (
            <button
              key={i}
              className="flex-1 min-w-0 h-full relative group"
              onClick={(e) => handleBarClick(e, bin)}
              onContextMenu={(e) => handleContextMenu(e, bin)}
              title={`${formatLabel(bin.min)}${bin.min !== bin.max ? ` – ${formatLabel(bin.max)}` : ""}: ${bin.count} nodes (shift-click to add filter)`}
            >
              <div
                className="absolute bottom-0 left-0 right-0 bg-gray-200 group-hover:bg-gray-300 transition-colors rounded-[2px]"
                style={{ height: `${Math.max(totalHeight, 4)}%` }}
              />
              {hasSelection && selectedInBin > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-emerald-400 rounded-[2px]"
                  style={{ height: `${Math.max(selectedHeight, 4)}%` }}
                />
              )}
            </button>
          );
        })}
        {dist.max !== dist.min && (
          <div
            className="absolute bottom-0.5 w-0.5 h-[calc(100%-4px)] bg-gray-500/70 pointer-events-none z-10 rounded-full"
            style={{ left: `calc(${meanPosition}% + 2px)` }}
            title={`Mean: ${formatLabel(mean)}`}
          />
        )}
      </div>
      <div className="flex justify-between text-[9px] text-gray-400 mt-1 px-0.5">
        <span className="font-mono">{formatLabel(dist.min)}</span>
        <span className="text-gray-500 font-medium">μ={formatLabel(mean)}</span>
        <span className="font-mono">{formatLabel(dist.max)}</span>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onSelect={() => {
            onSelectBin(contextMenu.bin.node_ids);
            setContextMenu(null);
          }}
          onFilter={handleCreatePredicate}
        />
      )}
    </div>
  );
});

const ContextMenu = ({
  x,
  y,
  onSelect,
  onFilter,
}: {
  x: number;
  y: number;
  onSelect: () => void;
  onFilter: () => void;
}) => (
  <div
    className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[120px]"
    style={{ left: x, top: y }}
    onClick={(e) => e.stopPropagation()}
  >
    <button
      onClick={onSelect}
      className="w-full px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
    >
      Select nodes
    </button>
    <button
      onClick={onFilter}
      className="w-full px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
    >
      Add as filter
    </button>
  </div>
);

const TemporalHistogram = memo(function TemporalHistogram({
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
}) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    bin: TemporalBin;
  } | null>(null);
  const maxCount = Math.max(...dist.bins.map((b) => b.count), 1);
  const selectedSet = useMemo(() => new Set(selectedNodes), [selectedNodes]);
  const hasSelection = selectedNodes.length > 0;

  const formatTemporalLabel = useCallback(
    (dateStr: string, binType: string) => {
      try {
        const date = new Date(dateStr);
        switch (binType) {
          case "hours":
            return date.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            });
          case "days":
            return date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
          case "months":
            return date.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
            });
          case "years":
            return date.getFullYear().toString();
          default:
            return date.toLocaleDateString("en-US");
        }
      } catch {
        return dateStr;
      }
    },
    [],
  );

  const handleBarClick = useCallback(
    (e: React.MouseEvent, bin: TemporalBin) => {
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
    [onSelectBin, onCreatePredicate, attributeName, labelScope],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, bin: TemporalBin) => {
      e.preventDefault();
      const menuWidth = 140;
      const menuHeight = 60;
      const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
      const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
      setContextMenu({ x, y, bin });
    },
    [],
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
    <div className="mt-1.5">
      <div className="relative h-8 flex items-end gap-[1px] rounded-md overflow-hidden bg-gray-50 p-0.5">
        {dist.bins.map((bin, i) => {
          const totalHeight = (bin.count / maxCount) * 100;
          const selectedInBin = bin.node_ids.filter((id) =>
            selectedSet.has(id),
          ).length;
          const selectedHeight = hasSelection
            ? (selectedInBin / maxCount) * 100
            : 0;

          const startDate = formatTemporalLabel(bin.min_date, dist.bin_type);
          const endDate = formatTemporalLabel(bin.max_date, dist.bin_type);
          const tooltip =
            startDate === endDate
              ? `${startDate}: ${bin.count} nodes`
              : `${startDate} – ${endDate}: ${bin.count} nodes`;

          return (
            <button
              key={i}
              className="flex-1 min-w-0 h-full relative group"
              onClick={(e) => handleBarClick(e, bin)}
              onContextMenu={(e) => handleContextMenu(e, bin)}
              title={`${tooltip} (shift-click to add filter)`}
            >
              <div
                className="absolute bottom-0 left-0 right-0 bg-gray-200 group-hover:bg-gray-300 transition-colors rounded-[2px]"
                style={{ height: `${Math.max(totalHeight, 4)}%` }}
              />
              {hasSelection && selectedInBin > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-emerald-400 rounded-[2px]"
                  style={{ height: `${Math.max(selectedHeight, 4)}%` }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-gray-400 mt-1 px-0.5">
        <span className="font-mono">
          {formatTemporalLabel(dist.min_date, dist.bin_type)}
        </span>
        <span className="text-gray-500 font-medium capitalize">
          {dist.bin_type}
        </span>
        <span className="font-mono">
          {formatTemporalLabel(dist.max_date, dist.bin_type)}
        </span>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onSelect={() => {
            onSelectBin(contextMenu.bin.node_ids);
            setContextMenu(null);
          }}
          onFilter={handleCreatePredicate}
        />
      )}
    </div>
  );
});

const BarChart = memo(function BarChart({
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
}) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    value: DistributionValue;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAll, setShowAll] = useState(false);
  const maxCount = Math.max(...dist.values.map((v) => v.count), 1);
  const selectedSet = useMemo(() => new Set(selectedNodes), [selectedNodes]);
  const hasSelection = selectedNodes.length > 0;

  const handleBarClick = useCallback(
    (e: React.MouseEvent, value: DistributionValue) => {
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
    [onSelectValue, onCreatePredicate, attributeName, dist.type, labelScope],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, value: DistributionValue) => {
      e.preventDefault();
      const menuWidth = 140;
      const menuHeight = 60;
      const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
      const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
      setContextMenu({ x, y, value });
    },
    [],
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
    const filtered = dist.values.filter((value) =>
      value.label.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    if (hasSelection) {
      filtered.sort((a, b) => {
        const aSelected = a.node_ids.filter((id) => selectedSet.has(id)).length;
        const bSelected = b.node_ids.filter((id) => selectedSet.has(id)).length;
        return bSelected - aSelected || b.count - a.count;
      });
    } else {
      filtered.sort((a, b) => b.count - a.count);
    }

    const limit = showAll ? filtered.length : Math.min(filtered.length, 8);
    return filtered.slice(0, limit);
  }, [dist.values, searchTerm, showAll, hasSelection, selectedSet]);

  const hasSearch = dist.values.length > 20;
  const hiddenCount =
    dist.values.filter((value) =>
      value.label.toLowerCase().includes(searchTerm.toLowerCase()),
    ).length - filteredValues.length;

  return (
    <div className="space-y-1 relative mt-1.5">
      {hasSearch && (
        <div className="mb-1.5">
          <input
            type="text"
            placeholder="Search values..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-[10px] px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white placeholder:text-gray-400"
          />
        </div>
      )}
      {filteredValues.map((value) => {
        const width = (value.count / maxCount) * 100;
        const selectedInValue = value.node_ids.filter((id) =>
          selectedSet.has(id),
        ).length;
        const selectedWidth = hasSelection
          ? (selectedInValue / maxCount) * 100
          : 0;

        return (
          <button
            key={value.label}
            className="w-full group hover:bg-gray-50 rounded p-0.5 transition-colors"
            onClick={(e) => handleBarClick(e, value)}
            onContextMenu={(e) => handleContextMenu(e, value)}
            title={`${value.label}: ${value.count} nodes (shift-click to add filter)`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-[9px] w-14 truncate text-left ${
                  value.label.startsWith("[") && value.label.endsWith("]")
                    ? "text-gray-400 italic"
                    : "text-gray-600"
                }`}
              >
                {value.label}
              </span>
              <div className="flex-1 h-3 bg-gray-50 rounded relative overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full bg-gray-200 group-hover:bg-gray-300 transition-colors rounded"
                  style={{ width: `${Math.max(width, 2)}%` }}
                />
                {hasSelection && selectedInValue > 0 && (
                  <div
                    className="absolute left-0 top-0 h-full bg-emerald-400 rounded"
                    style={{ width: `${Math.max(selectedWidth, 1)}%` }}
                  />
                )}
              </div>
              <span className="text-[9px] text-gray-400 w-6 text-right font-mono">
                {value.count}
              </span>
            </div>
          </button>
        );
      })}
      {hiddenCount > 0 && (
        <div className="flex items-center justify-center gap-2 text-[9px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-100">
          <span>+{hiddenCount} more</span>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-gray-500 hover:text-gray-700 underline"
          >
            {showAll ? "less" : "all"}
          </button>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onSelect={() => {
            onSelectValue(contextMenu.value.node_ids);
            setContextMenu(null);
          }}
          onFilter={handleCreatePredicate}
        />
      )}
    </div>
  );
});

const getSelectionSummary = (
  distribution: AttributeDistribution,
  selectedNodes: string[],
): string | null => {
  if (selectedNodes.length === 0) return null;

  const selectedSet = new Set(selectedNodes);

  if (distribution.type === "temporal") {
    const selectedBins = distribution.bins.filter((bin) =>
      bin.node_ids.some((id) => selectedSet.has(id)),
    );

    if (selectedBins.length === 0) return null;
    if (selectedBins.length === 1) {
      try {
        const date = new Date(selectedBins[0].min_date);
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      } catch {
        return selectedBins[0].label;
      }
    }

    const minDate = new Date(
      Math.min(...selectedBins.map((bin) => new Date(bin.min_date).getTime())),
    );
    const maxDate = new Date(
      Math.max(...selectedBins.map((bin) => new Date(bin.max_date).getTime())),
    );

    const formatDate = (date: Date) => {
      try {
        return date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        });
      } catch {
        return date.toString();
      }
    };

    return `${formatDate(minDate)} – ${formatDate(maxDate)}`;
  } else if (distribution.type === "numeric") {
    const selectedValues: number[] = [];
    for (const bin of distribution.bins) {
      const matchCount = bin.node_ids.filter((id) =>
        selectedSet.has(id),
      ).length;
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
      const matchCount = val.node_ids.filter((id) =>
        selectedSet.has(id),
      ).length;
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

const AttributeRow = memo(function AttributeRow({
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
}) {
  const selectionSummary = useMemo(
    () => getSelectionSummary(distribution, selectedNodes),
    [distribution, selectedNodes],
  );

  return (
    <div className="px-2 py-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-gray-600 truncate">
          {attributeName}
        </span>
        {selectionSummary && (
          <span
            className="text-[8px] text-emerald-700 font-medium ml-2 truncate max-w-[40%] bg-emerald-50 px-1.5 py-0.5 rounded"
            title={selectionSummary}
          >
            {selectionSummary}
          </span>
        )}
      </div>
      <div className="pb-1">
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
});

const LabelSection = memo(function LabelSection({
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
}) {
  const selectedSet = useMemo(() => new Set(selectedNodes), [selectedNodes]);
  const selectedInLabel = useMemo(() => {
    return labelData.node_ids.filter((id) => selectedSet.has(id)).length;
  }, [labelData.node_ids, selectedSet]);

  const sortedAttrs = useMemo(() => {
    return Object.entries(labelData.attributes).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [labelData.attributes]);

  const hasAttributes = sortedAttrs.length > 0;
  const topologyColor = getTopologyColor(label);

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div
        className={`flex items-center justify-between px-3 py-2.5 ${
          selectedInLabel > 0
            ? "bg-emerald-50 border-b border-emerald-100"
            : "bg-gray-50/50 border-b border-gray-100"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white"
            style={{ backgroundColor: topologyColor }}
          />
          <span className="text-[11px] font-semibold text-gray-800 truncate">
            {label}
          </span>
          <span className="text-[9px] text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-100">
            {labelData.label_count}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selectedInLabel > 0 && (
            <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
              {selectedInLabel} selected
            </span>
          )}
          {!hasAttributes && (
            <span className="text-[9px] text-gray-400 italic">no attrs</span>
          )}
        </div>
      </div>

      {hasAttributes && (
        <div className="py-1.5 divide-y divide-gray-50">
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
});

const SharedAttributesSection = memo(function SharedAttributesSection({
  sharedAttributes,
  selectedNodes,
  onSelectNodes,
  onCreatePredicate,
}: {
  sharedAttributes: Record<string, AttributeDistribution>;
  selectedNodes: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onCreatePredicate: (predicate: GeneratedPredicate) => void;
}) {
  const sortedAttrs = useMemo(() => {
    return Object.entries(sharedAttributes).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [sharedAttributes]);

  if (sortedAttrs.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50/80 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-gray-400 ring-2 ring-white" />
          <span className="text-[11px] font-semibold text-gray-800">
            Shared Attributes
          </span>
          <span className="text-[9px] text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-100">
            {sortedAttrs.length}
          </span>
        </div>
      </div>

      <div className="py-1.5 divide-y divide-gray-50">
        {sortedAttrs.map(([attrName, dist]) => {
          const labels =
            (dist as AttributeDistribution & { labels?: string[] }).labels ||
            [];
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
                <div className="px-2 pb-2 -mt-1">
                  <div className="flex flex-wrap gap-1">
                    {labels.map((lbl) => {
                      const topologyColor = getTopologyColor(lbl);
                      return (
                        <span
                          key={lbl}
                          className="text-[8px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 flex items-center gap-1"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: topologyColor }}
                          />
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
});

export const AttributePanel = ({
  showHeader = true,
}: {
  showHeader?: boolean;
}) => {
  const {
    selectedNodes,
    predicateMatchNodes,
    setSelection,
    savePredicateDirect,
  } = useAnalysisStore();

  const effectiveSelectedNodes =
    selectedNodes.length > 0 ? selectedNodes : predicateMatchNodes;

  const [distributionsData, setDistributionsData] =
    useState<DistributionsByLabelResponse | null>(null);
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
          void error;
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
    [setSelection],
  );

  const handleAddFilter = useCallback(
    (predicate: GeneratedPredicate) => {
      savePredicateDirect(predicate);
    },
    [savePredicateDirect],
  );

  const sortedLabels = useMemo(() => {
    if (!distributionsData?.distributions_by_label) return [];
    return Object.entries(distributionsData.distributions_by_label).sort(
      ([, a], [, b]) => b.label_count - a.label_count,
    );
  }, [distributionsData]);

  const filteredLabels = useMemo(() => {
    if (nodeTypeFilter.length === 0) return sortedLabels;
    return sortedLabels.filter(([label]) => nodeTypeFilter.includes(label));
  }, [sortedLabels, nodeTypeFilter]);

  const availableNodeTypes = useMemo(() => {
    return sortedLabels.map(([label]) => label);
  }, [sortedLabels]);

  const handleNodeTypeToggle = useCallback(
    (nodeType: string, shiftKey: boolean = false) => {
      if (shiftKey) {
        const predicate: GeneratedPredicate = {
          id: `node_type_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          attribute: "node_type",
          operator: "=",
          value: nodeType,
          match_count:
            sortedLabels.find(([label]) => label === nodeType)?.[1]
              ?.label_count || 0,
          precision: 1,
          recall: 1,
          f1_score: 1,
          is_structural: false,
          attribute_type: "categorical",
          label_scope: undefined,
        };
        handleAddFilter(predicate);
      } else {
        setNodeTypeFilter((prev) =>
          prev.includes(nodeType)
            ? prev.filter((t) => t !== nodeType)
            : [...prev, nodeType],
        );
      }
    },
    [sortedLabels, handleAddFilter],
  );

  const handleClearTypeFilter = useCallback(() => {
    setNodeTypeFilter([]);
  }, []);

  useEffect(() => {
    setNodeTypeFilter([]);
  }, [distributionsData]);

  const hasLabels = sortedLabels.length > 0;
  const hasSharedAttrs =
    distributionsData?.shared_attributes &&
    Object.keys(distributionsData.shared_attributes).length > 0;
  const hasFilteredResults = filteredLabels.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {showHeader && (
        <PanelHeader
          icon={<AttributeIcon className="w-4 h-4 text-gray-600" />}
          title="Attribute Space"
          subtitle="Explore node properties"
        />
      )}

      {hasLabels && (
        <div className="shrink-0 px-4 py-2.5 border-b border-gray-100 bg-gray-50/30">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                Node Types
              </span>
              {nodeTypeFilter.length > 0 && (
                <button
                  onClick={handleClearTypeFilter}
                  className="text-[9px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1">
              {availableNodeTypes.map((nodeType) => {
                const isFilterActive = nodeTypeFilter.length > 0;
                const isSelected = nodeTypeFilter.includes(nodeType);
                const topologyColor = getTopologyColor(nodeType);

                return (
                  <button
                    key={nodeType}
                    onClick={(e) => handleNodeTypeToggle(nodeType, e.shiftKey)}
                    className={`text-[9px] px-2 py-1 rounded-md transition-all font-medium flex items-center gap-1.5 ${
                      isFilterActive && isSelected
                        ? "bg-gray-800 text-white"
                        : isFilterActive && !isSelected
                          ? "bg-white text-gray-400 border border-gray-200 hover:text-gray-600"
                          : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                    }`}
                    title={`${nodeType} (shift-click to add as filter)`}
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
              <p className="text-[9px] text-gray-400">
                {filteredLabels.length} of {availableNodeTypes.length} types
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-3 space-y-3">
          {distLoading ? (
            <LoadingSkeleton />
          ) : !hasLabels && !hasSharedAttrs ? (
            <EmptyState
              icon={<AttributeIcon className="w-4 h-4 text-gray-600" />}
              title="No attributes available"
              subtitle="Load a graph with node attributes to explore"
            />
          ) : nodeTypeFilter.length > 0 && !hasFilteredResults ? (
            <EmptyState
              icon={<AttributeIcon className="w-4 h-4 text-gray-600" />}
              title="No matching types"
              subtitle="Try adjusting your filter"
            />
          ) : (
            <>
              {filteredLabels.map(([label, labelData]) => (
                <LabelSection
                  key={label}
                  label={label}
                  labelData={labelData}
                  selectedNodes={effectiveSelectedNodes}
                  onSelectNodes={handleSelectNodes}
                  onCreatePredicate={handleAddFilter}
                />
              ))}

              {(nodeTypeFilter.length === 0 || hasFilteredResults) &&
                hasSharedAttrs &&
                distributionsData && (
                  <SharedAttributesSection
                    sharedAttributes={distributionsData.shared_attributes}
                    selectedNodes={effectiveSelectedNodes}
                    onSelectNodes={handleSelectNodes}
                    onCreatePredicate={handleAddFilter}
                  />
                )}
            </>
          )}
        </div>
      </div>

      {selectedNodes.length > 0 && (
        <div className="shrink-0 px-4 py-2.5 border-t border-gray-100 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                {selectedNodes.length}
              </span>
              <span className="text-[10px] text-gray-500">nodes selected</span>
            </div>
            <button
              onClick={() => setSelection([], null)}
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const LoadingSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="rounded-xl border border-gray-100 bg-white p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-8 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-8 bg-gray-50 rounded animate-pulse" />
          <div className="h-3 w-full bg-gray-50 rounded animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
      {icon}
    </div>
    <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
    <p className="text-xs text-gray-400 max-w-[200px]">{subtitle}</p>
  </div>
);
