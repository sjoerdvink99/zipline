import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import api, { isAbortedRequest } from "../api";
import { getDistributions, getTopologicalDistributions } from "../api/layers";
import type {
  AttributeDistribution,
  NumericDistribution,
  CategoricalDistribution,
  BooleanDistribution,
} from "../api/layers";
import type { Predicate } from "./ReasoningBar";
import { PatternSection } from "./PatternSection";

interface RightPanelProps {
  hasSelection: boolean;
  selectedNodes: string[];
  onSelectNodes?: (nodeIds: string[]) => void;
  onAddPredicate?: (predicate: Predicate) => void;
}

interface GraphSummary {
  directed: boolean;
  n_nodes: number;
  n_edges: number;
  active: string;
  node_types: Record<string, number>;
  density: number;
  avg_degree: number;
}

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

const TOPO_NAMES: Record<string, string> = {
  degree: "degree",
  in_degree: "in-degree",
  out_degree: "out-degree",
  centrality: "centrality",
};

const TOPO_PRIORITY = ["degree", "in_degree", "out_degree", "centrality"];

const DISCRETE_METRICS = new Set(["degree", "in_degree", "out_degree"]);

type PredicateCategory = "attribute" | "topological";

const Histogram = ({
  dist,
  attributeName,
  selectedNodes,
  onSelectBin,
  onAddPredicate,
  category,
}: {
  dist: NumericDistribution;
  attributeName: string;
  selectedNodes: string[];
  onSelectBin: (nodeIds: string[]) => void;
  onAddPredicate: (pred: Predicate) => void;
  category: PredicateCategory;
}) => {
  const maxCount = Math.max(...dist.bins.map((b) => b.count), 1);
  const selectedSet = useMemo(() => new Set(selectedNodes), [selectedNodes]);
  const hasSelection = selectedNodes.length > 0;
  const isDiscrete = category === "topological" && DISCRETE_METRICS.has(attributeName);

  const mean = useMemo(() => estimateMean(dist), [dist]);
  const meanPosition = useMemo(() => {
    if (dist.max === dist.min) return 50;
    return ((mean - dist.min) / (dist.max - dist.min)) * 100;
  }, [mean, dist.min, dist.max]);

  const formatLabel = useCallback((val: number) => {
    if (isDiscrete) return Math.round(val).toString();
    if (Math.abs(val) < 0.001 && val !== 0) return val.toExponential(1);
    if (Math.abs(val) >= 10000) return val.toExponential(1);
    if (val % 1 === 0) return val.toString();
    return val.toFixed(2);
  }, [isDiscrete]);

  const handleBarClick = useCallback((bin: typeof dist.bins[0], e: React.MouseEvent) => {
    const value = isDiscrete ? Math.round(bin.min) : bin.min;
    const value2 = isDiscrete ? Math.round(bin.max) : bin.max;

    if (e.shiftKey) {
      onAddPredicate({
        id: `${attributeName}-${Date.now()}`,
        attribute: attributeName,
        type: "numeric",
        operator: "between",
        value,
        value2,
        nodeIds: bin.node_ids,
        category,
      });
    } else {
      onSelectBin(bin.node_ids);
    }
  }, [attributeName, isDiscrete, onAddPredicate, onSelectBin, category]);

  return (
    <div>
      <div className="relative h-10 flex items-end gap-px">
        {dist.bins.map((bin, i) => {
          const totalHeight = (bin.count / maxCount) * 100;
          const selectedInBin = bin.node_ids.filter((id) => selectedSet.has(id)).length;
          const selectedHeight = hasSelection ? (selectedInBin / maxCount) * 100 : 0;

          return (
            <button
              key={i}
              className="flex-1 min-w-0 h-full relative group"
              onClick={(e) => handleBarClick(bin, e)}
              title={`${formatLabel(bin.min)}${bin.min !== bin.max ? ` – ${formatLabel(bin.max)}` : ""}: ${bin.count} nodes`}
            >
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t bg-gray-200 group-hover:bg-gray-300 transition-colors"
                style={{ height: `${Math.max(totalHeight, 4)}%` }}
              />
              {hasSelection && selectedInBin > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-t bg-gray-500"
                  style={{ height: `${Math.max(selectedHeight, 3)}%` }}
                />
              )}
            </button>
          );
        })}
        <div
          className="absolute bottom-0 w-px h-full bg-blue-500 pointer-events-none z-10"
          style={{ left: `${meanPosition}%` }}
          title={`Mean: ${formatLabel(mean)}`}
        />
      </div>
      <div className="flex justify-between text-[9px] text-gray-400 mt-1 px-0.5">
        <span>{formatLabel(dist.min)}</span>
        <span className="text-blue-500">μ={formatLabel(mean)}</span>
        <span>{formatLabel(dist.max)}</span>
      </div>
    </div>
  );
};

const BarChart = ({
  dist,
  attributeName,
  selectedNodes,
  onSelectValue,
  onAddPredicate,
}: {
  dist: CategoricalDistribution | BooleanDistribution;
  attributeName: string;
  selectedNodes: string[];
  onSelectValue: (nodeIds: string[]) => void;
  onAddPredicate: (pred: Predicate) => void;
}) => {
  const maxCount = Math.max(...dist.values.map((v) => v.count), 1);
  const selectedSet = new Set(selectedNodes);
  const hasSelection = selectedNodes.length > 0;

  const handleBarClick = useCallback((value: typeof dist.values[0], e: React.MouseEvent) => {
    if (e.shiftKey) {
      onAddPredicate({
        id: `${attributeName}-${Date.now()}`,
        attribute: attributeName,
        type: "categorical",
        operator: "=",
        value: value.label,
        nodeIds: value.node_ids,
        category: "attribute",
      });
    } else {
      onSelectValue(value.node_ids);
    }
  }, [attributeName, onAddPredicate, onSelectValue]);

  return (
    <div className="space-y-1">
      {dist.values.slice(0, 8).map((value) => {
        const width = (value.count / maxCount) * 100;
        const selectedInValue = value.node_ids.filter((id) => selectedSet.has(id)).length;
        const selectedWidth = hasSelection ? (selectedInValue / maxCount) * 100 : 0;

        return (
          <button
            key={value.label}
            className="w-full group"
            onClick={(e) => handleBarClick(value, e)}
            title={`${value.label}: ${value.count} nodes`}
          >
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-500 w-16 truncate text-left">{value.label}</span>
              <div className="flex-1 h-3 bg-gray-100 rounded relative overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full bg-gray-200 group-hover:bg-gray-300 transition-colors rounded"
                  style={{ width: `${width}%` }}
                />
                {hasSelection && selectedInValue > 0 && (
                  <div
                    className="absolute left-0 top-0 h-full bg-gray-500 rounded"
                    style={{ width: `${selectedWidth}%` }}
                  />
                )}
              </div>
              <span className="text-[9px] text-gray-400 w-6 text-right">{value.count}</span>
            </div>
          </button>
        );
      })}
      {dist.values.length > 8 && (
        <div className="text-[9px] text-gray-400 text-center">
          +{dist.values.length - 8} more
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

  if (distribution.type === "numeric") {
    const selectedValues: number[] = [];
    for (const bin of distribution.bins) {
      const matchCount = bin.node_ids.filter(id => selectedSet.has(id)).length;
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
    const avg = selectedValues.reduce((a, b) => a + b, 0) / selectedValues.length;

    if (min === max) {
      return Number.isInteger(min) ? String(min) : min.toFixed(2);
    }

    const formatNum = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);
    return `μ ${formatNum(avg)} (${formatNum(min)}–${formatNum(max)})`;
  } else {
    const valueCounts: Record<string, number> = {};
    for (const val of distribution.values) {
      const matchCount = val.node_ids.filter(id => selectedSet.has(id)).length;
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
    return `${top[0]} (${Math.round(top[1] / total * 100)}%)`;
  }
};

const DistributionSection = ({
  attributeName,
  distribution,
  selectedNodes,
  onSelectNodes,
  onAddPredicate,
  defaultExpanded,
}: {
  attributeName: string;
  distribution: AttributeDistribution;
  selectedNodes: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onAddPredicate: (pred: Predicate) => void;
  defaultExpanded: boolean;
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const selectionSummary = useMemo(
    () => getSelectionSummary(distribution, selectedNodes),
    [distribution, selectedNodes]
  );

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden hover:border-gray-200 transition-all">
      <button
        className="w-full flex items-center justify-between px-3 py-2 transition-colors bg-gray-50/50 hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className={`w-3 h-3 transition-transform text-gray-400 shrink-0 ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[11px] font-medium text-gray-700 truncate">{attributeName}</span>
        </div>
        {selectionSummary && (
          <span className="text-[10px] text-gray-500 font-medium ml-2 truncate max-w-[50%]" title={selectionSummary}>
            {selectionSummary}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          {distribution.type === "numeric" ? (
            <Histogram
              dist={distribution}
              attributeName={attributeName}
              selectedNodes={selectedNodes}
              onSelectBin={onSelectNodes}
              onAddPredicate={onAddPredicate}
              category="attribute"
            />
          ) : (
            <BarChart
              dist={distribution}
              attributeName={attributeName}
              selectedNodes={selectedNodes}
              onSelectValue={onSelectNodes}
              onAddPredicate={onAddPredicate}
            />
          )}
        </div>
      )}
    </div>
  );
};

const TopologyDistributionSection = ({
  attributeName,
  distribution,
  selectedNodes,
  onSelectNodes,
  onAddPredicate,
  defaultExpanded,
}: {
  attributeName: string;
  distribution: AttributeDistribution;
  selectedNodes: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onAddPredicate: (pred: Predicate) => void;
  defaultExpanded: boolean;
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const displayName = TOPO_NAMES[attributeName] || attributeName;

  const selectionSummary = useMemo(
    () => getSelectionSummary(distribution, selectedNodes),
    [distribution, selectedNodes]
  );

  if (distribution.type !== "numeric") return null;

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden hover:border-gray-200 transition-all">
      <button
        className="w-full flex items-center justify-between px-3 py-2 transition-colors bg-gray-50/50 hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className={`w-3 h-3 transition-transform text-gray-400 shrink-0 ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[11px] font-medium text-gray-700">{displayName}</span>
        </div>
        {selectionSummary && (
          <span className="text-[10px] text-gray-500 font-medium ml-2 truncate max-w-[50%]" title={selectionSummary}>
            {selectionSummary}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          <Histogram
            dist={distribution}
            attributeName={attributeName}
            selectedNodes={selectedNodes}
            onSelectBin={onSelectNodes}
            onAddPredicate={onAddPredicate}
            category="topological"
          />
        </div>
      )}
    </div>
  );
};

const TopologyOverview = ({
  distributions,
  selectedNodes,
  onSelectNodes,
  onAddPredicate,
}: {
  distributions: Record<string, AttributeDistribution>;
  selectedNodes: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onAddPredicate: (pred: Predicate) => void;
}) => {
  const sortedDistributions = useMemo(() => {
    return Object.entries(distributions).sort(([a], [b]) => {
      const aIdx = TOPO_PRIORITY.indexOf(a);
      const bIdx = TOPO_PRIORITY.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [distributions]);

  return (
    <div className="space-y-1.5">
      {sortedDistributions.map(([attr, dist], index) => (
        <TopologyDistributionSection
          key={attr}
          attributeName={attr}
          distribution={dist}
          selectedNodes={selectedNodes}
          onSelectNodes={onSelectNodes}
          onAddPredicate={onAddPredicate}
          defaultExpanded={index < 2}
        />
      ))}
    </div>
  );
};

const AttributesOverview = ({
  distributions,
  selectedNodes,
  onSelectNodes,
  onAddPredicate,
}: {
  distributions: Record<string, AttributeDistribution>;
  selectedNodes: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onAddPredicate: (pred: Predicate) => void;
}) => {
  const sortedDistributions = useMemo(() => {
    return Object.entries(distributions).sort(([a], [b]) => {
      const priority = ["label", "name", "type", "weight", "id"];
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aIdx = priority.findIndex((p) => aLower.includes(p));
      const bIdx = priority.findIndex((p) => bLower.includes(p));
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [distributions]);

  return (
    <div className="space-y-1.5">
      {sortedDistributions.map(([attr, dist], index) => (
        <DistributionSection
          key={attr}
          attributeName={attr}
          distribution={dist}
          selectedNodes={selectedNodes}
          onSelectNodes={onSelectNodes}
          onAddPredicate={onAddPredicate}
          defaultExpanded={index < 2}
        />
      ))}
    </div>
  );
};

export const RightPanel = ({
  hasSelection,
  selectedNodes,
  onSelectNodes,
  onAddPredicate,
}: RightPanelProps) => {
  const [distributions, setDistributions] = useState<
    Record<string, AttributeDistribution>
  >({});
  const [topologicalDistributions, setTopologicalDistributions] = useState<
    Record<string, AttributeDistribution>
  >({});
  const [distLoading, setDistLoading] = useState(true);
  const [topoLoading, setTopoLoading] = useState(true);
  const [graphSummary, setGraphSummary] = useState<GraphSummary | null>(null);
  const [topoExpanded, setTopoExpanded] = useState(true);
  const [attrsExpanded, setAttrsExpanded] = useState(true);

  const summaryAbortRef = useRef<AbortController | null>(null);
  const distAbortRef = useRef<AbortController | null>(null);
  const topoAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const fetchSummary = async (signal?: AbortSignal) => {
      try {
        const res = await api.get("/api/graph/summary", { signal });
        setGraphSummary(res.data);
      } catch (error) {
        if (!isAbortedRequest(error)) {
          console.error("Failed to fetch graph summary:", error);
        }
      }
    };

    summaryAbortRef.current?.abort();
    summaryAbortRef.current = new AbortController();
    fetchSummary(summaryAbortRef.current.signal);

    const handleGraphSwitch = () => {
      summaryAbortRef.current?.abort();
      summaryAbortRef.current = new AbortController();
      fetchSummary(summaryAbortRef.current.signal);
    };

    window.addEventListener("gb:graph-switched", handleGraphSwitch);
    return () => {
      summaryAbortRef.current?.abort();
      window.removeEventListener("gb:graph-switched", handleGraphSwitch);
    };
  }, []);

  useEffect(() => {
    const fetchDistributions = async (signal?: AbortSignal) => {
      setDistLoading(true);
      try {
        const result = await getDistributions();
        if (!signal?.aborted) {
          setDistributions(result.distributions || {});
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
    };

    window.addEventListener("gb:graph-switched", handleGraphSwitch);
    return () => {
      distAbortRef.current?.abort();
      window.removeEventListener("gb:graph-switched", handleGraphSwitch);
    };
  }, []);

  useEffect(() => {
    const fetchTopological = async (signal?: AbortSignal) => {
      setTopoLoading(true);
      try {
        const result = await getTopologicalDistributions();
        if (!signal?.aborted) {
          setTopologicalDistributions(result.distributions || {});
        }
      } catch (error) {
        if (!isAbortedRequest(error) && !signal?.aborted) {
          console.error("Failed to fetch topological distributions:", error);
        }
      } finally {
        if (!signal?.aborted) {
          setTopoLoading(false);
        }
      }
    };

    topoAbortRef.current?.abort();
    topoAbortRef.current = new AbortController();
    fetchTopological(topoAbortRef.current.signal);

    const handleGraphSwitch = () => {
      topoAbortRef.current?.abort();
      topoAbortRef.current = new AbortController();
      fetchTopological(topoAbortRef.current.signal);
    };

    window.addEventListener("gb:graph-switched", handleGraphSwitch);
    return () => {
      topoAbortRef.current?.abort();
      window.removeEventListener("gb:graph-switched", handleGraphSwitch);
    };
  }, []);

  const handleSelectNodes = useCallback(
    (nodeIds: string[]) => {
      onSelectNodes?.(nodeIds);
    },
    [onSelectNodes]
  );

  const handleAddPredicate = useCallback(
    (predicate: Predicate) => {
      onAddPredicate?.(predicate);
    },
    [onAddPredicate]
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-5">
          {graphSummary && (
            <div className="flex items-center gap-5 text-[11px] text-gray-500 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                <span className="font-bold text-gray-700">
                  {graphSummary.n_nodes.toLocaleString()}
                </span>
                <span>nodes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-gray-400 rounded-full"></div>
                <span className="font-bold text-gray-700">
                  {graphSummary.n_edges.toLocaleString()}
                </span>
                <span>edges</span>
              </div>
              {hasSelection && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full font-semibold">
                    {selectedNodes.length} selected
                  </span>
                </div>
              )}
            </div>
          )}

          <PatternSection
            selectedNodes={selectedNodes}
            onSelectNodes={handleSelectNodes}
            onAddPredicate={handleAddPredicate}
            distributions={distributions}
          />

          <div className="border-t border-gray-100" />

          <div className="space-y-2">
            <button
              className="w-full flex items-center gap-1.5 group"
              onClick={() => setTopoExpanded(!topoExpanded)}
            >
              <svg
                className={`w-3 h-3 text-gray-400 transition-transform ${
                  topoExpanded ? "rotate-90" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <svg
                className="w-4 h-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="5" cy="12" r="2" />
                <circle cx="19" cy="6" r="2" />
                <circle cx="19" cy="18" r="2" />
                <path strokeLinecap="round" d="M7 11.5L17 6.5M7 12.5L17 17.5" />
              </svg>
              <span className="text-[11px] font-semibold text-gray-700">
                Topology
              </span>
            </button>

            {topoExpanded && (
              <>
                {topoLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-gray-600 rounded-full" />
                  </div>
                ) : Object.keys(topologicalDistributions).length === 0 ? (
                  <div className="text-xs text-gray-400 italic py-4 text-center">
                    No topology data available
                  </div>
                ) : (
                  <TopologyOverview
                    distributions={topologicalDistributions}
                    selectedNodes={selectedNodes}
                    onSelectNodes={handleSelectNodes}
                    onAddPredicate={handleAddPredicate}
                  />
                )}
              </>
            )}
          </div>

          <div className="border-t border-gray-100" />

          <div className="space-y-2">
            <button
              className="w-full flex items-center gap-1.5 group"
              onClick={() => setAttrsExpanded(!attrsExpanded)}
            >
              <svg
                className={`w-3 h-3 text-gray-400 transition-transform ${
                  attrsExpanded ? "rotate-90" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <svg
                className="w-4 h-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
              <span className="text-[11px] font-semibold text-gray-700">
                Attributes
              </span>
            </button>

            {attrsExpanded && (
              <>
                {distLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-gray-600 rounded-full" />
                  </div>
                ) : Object.keys(distributions).length === 0 ? (
                  <div className="text-xs text-gray-400 italic py-4 text-center">
                    No attributes available
                  </div>
                ) : (
                  <AttributesOverview
                    distributions={distributions}
                    selectedNodes={selectedNodes}
                    onSelectNodes={handleSelectNodes}
                    onAddPredicate={handleAddPredicate}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};
