import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { detectPatterns, type DetectedPattern } from "../api/layers";
import { findConstrainedPaths, type HopConstraint } from "../api";
import type { Predicate } from "./ReasoningBar";
import type { AttributeDistribution, CategoricalDistribution } from "../api/layers";

const PATTERN_ICONS: Record<string, string> = {
  isolated: "○",
  leaf: "◦",
  hub: "◉",
  articulation: "⊕",
  bridge: "═",
  star: "✳",
  triangle: "△",
  clique: "◆",
  path: "→",
  chain: "⋯",
  cycle: "↻",
  cluster: "◎",
  community: "▣",
  bipartite: "⧉",
  tree: "⌥",
  core: "◈",
};

const LEVEL_COLORS: Record<string, string> = {
  atomic: "bg-gray-100 text-gray-600",
  structural: "bg-blue-50 text-blue-600",
  pattern: "bg-purple-50 text-purple-600",
};

interface PathResult {
  path: string[];
  length: number;
  isShortest?: boolean;
}

interface PathConstraint {
  id: string;
  attribute: string;
  operator: string;
  value: string;
}

interface PatternSectionProps {
  selectedNodes: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onAddPredicate?: (predicate: Predicate) => void;
  distributions: Record<string, AttributeDistribution>;
}

type SelectionIntent = "none" | "single" | "pair" | "group";

const PatternCard = ({
  pattern,
  onSelect,
  onAddPredicate,
}: {
  pattern: DetectedPattern;
  onSelect: () => void;
  onAddPredicate?: () => void;
}) => {
  const icon = PATTERN_ICONS[pattern.type] || "●";
  const levelClass = LEVEL_COLORS[pattern.level] || LEVEL_COLORS.structural;
  const confidencePercent = Math.round(pattern.confidence * 100);

  const featureList = Object.entries(pattern.features)
    .slice(0, 3)
    .map(([key, val]) => {
      const formatted = typeof val === "number" && val % 1 !== 0 ? val.toFixed(2) : val;
      return `${key}: ${formatted}`;
    });

  return (
    <div className="border border-gray-100 rounded-lg p-2.5 hover:border-gray-200 transition-all group">
      <div className="flex items-start gap-2">
        <span className={`text-base ${levelClass} w-6 h-6 flex items-center justify-center rounded`}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-gray-700 truncate">
              {pattern.name}
            </span>
            <span className="text-[9px] text-gray-400 shrink-0">
              {confidencePercent}%
            </span>
          </div>
          <div className="text-[9px] text-gray-400 mt-0.5">
            {pattern.size} node{pattern.size !== 1 ? "s" : ""}
            {pattern.center_node && ` · center: ${pattern.center_node}`}
          </div>
          {featureList.length > 0 && (
            <div className="text-[9px] text-gray-400 mt-1 truncate">
              {featureList.join(" · ")}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onSelect}
          className="flex-1 text-[9px] px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
        >
          Select nodes
        </button>
        {onAddPredicate && (
          <button
            onClick={onAddPredicate}
            className="text-[9px] px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors"
            title="Add as predicate"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
};

const PathFinder = ({
  sourceNode,
  targetNode,
  distributions,
  onSelectPath,
  onAddPredicate,
}: {
  sourceNode: string;
  targetNode: string;
  distributions: Record<string, AttributeDistribution>;
  onSelectPath: (path: string[]) => void;
  onAddPredicate?: (predicate: Predicate) => void;
}) => {
  const [minHops, setMinHops] = useState(1);
  const [maxHops, setMaxHops] = useState(4);
  const [paths, setPaths] = useState<PathResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [constraints, setConstraints] = useState<PathConstraint[]>([]);
  const [showConstraints, setShowConstraints] = useState(false);

  const numericAttributes = useMemo(() => {
    return Object.entries(distributions)
      .filter(([, dist]) => dist.type === "numeric")
      .map(([name]) => name);
  }, [distributions]);

  const categoricalAttributes = useMemo(() => {
    return Object.entries(distributions)
      .filter(([, dist]) => dist.type === "categorical")
      .map(([name, dist]) => ({
        name,
        values: (dist as CategoricalDistribution).values.map((v) => v.label),
      }));
  }, [distributions]);

  useEffect(() => {
    setPaths([]);
    setHasSearched(false);
  }, [sourceNode, targetNode]);

  const buildHopConstraints = useCallback((): HopConstraint[] => {
    return constraints
      .filter((c) => c.attribute && c.value)
      .map((c) => ({
        id: c.id,
        hopIndex: -1,
        target: "node" as const,
        attribute: c.attribute,
        operator: c.operator,
        value: parseFloat(c.value) || c.value,
      }));
  }, [constraints]);

  const handleFindPaths = useCallback(async (findShortest = false) => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const hopConstraints = buildHopConstraints();
      const result = await findConstrainedPaths({
        source: sourceNode,
        target: targetNode,
        minHops: findShortest ? 1 : minHops,
        maxHops: findShortest ? 10 : maxHops,
        constraints: hopConstraints,
        combineOp: "AND",
      });

      let foundPaths = result.paths.map((p: string[]) => ({
        path: p,
        length: p.length - 1,
        isShortest: false,
      }));

      if (findShortest && foundPaths.length > 0) {
        const minLength = Math.min(...foundPaths.map((p) => p.length));
        foundPaths = foundPaths
          .filter((p) => p.length === minLength)
          .map((p) => ({ ...p, isShortest: true }));
      }

      setPaths(foundPaths);
    } catch (error) {
      console.error("Failed to find paths:", error);
      setPaths([]);
    } finally {
      setIsLoading(false);
    }
  }, [sourceNode, targetNode, minHops, maxHops, buildHopConstraints]);

  const addConstraint = useCallback(() => {
    setConstraints((prev) => [
      ...prev,
      {
        id: `constraint-${Date.now()}`,
        attribute: numericAttributes[0] || categoricalAttributes[0]?.name || "",
        operator: "<",
        value: "",
      },
    ]);
  }, [numericAttributes, categoricalAttributes]);

  const removeConstraint = useCallback((id: string) => {
    setConstraints((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateConstraint = useCallback(
    (id: string, updates: Partial<PathConstraint>) => {
      setConstraints((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );
    },
    []
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded truncate max-w-[80px]" title={sourceNode}>
          {sourceNode}
        </span>
        <span>→</span>
        <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded truncate max-w-[80px]" title={targetNode}>
          {targetNode}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <label className="text-[9px] text-gray-400">Hops:</label>
          <input
            type="number"
            min={1}
            max={maxHops}
            value={minHops}
            onChange={(e) => setMinHops(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-10 text-[10px] px-1.5 py-0.5 border border-gray-200 rounded"
          />
          <span className="text-[9px] text-gray-400">–</span>
          <input
            type="number"
            min={minHops}
            max={10}
            value={maxHops}
            onChange={(e) => setMaxHops(Math.max(minHops, parseInt(e.target.value) || 4))}
            className="w-10 text-[10px] px-1.5 py-0.5 border border-gray-200 rounded"
          />
        </div>
        <button
          onClick={() => setShowConstraints(!showConstraints)}
          className={`text-[9px] px-2 py-0.5 rounded transition-colors ${
            showConstraints || constraints.length > 0
              ? "bg-blue-100 text-blue-600"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {constraints.length > 0 ? `${constraints.length} constraint${constraints.length > 1 ? "s" : ""}` : "Constraints"}
        </button>
      </div>

      {showConstraints && (
        <div className="space-y-2 p-2 bg-gray-50 rounded-lg">
          {constraints.map((c) => (
            <div key={c.id} className="flex items-center gap-1.5">
              <select
                value={c.attribute}
                onChange={(e) => updateConstraint(c.id, { attribute: e.target.value })}
                className="flex-1 text-[9px] px-1.5 py-1 border border-gray-200 rounded bg-white"
              >
                {numericAttributes.map((attr) => (
                  <option key={attr} value={attr}>{attr}</option>
                ))}
                {categoricalAttributes.map((attr) => (
                  <option key={attr.name} value={attr.name}>{attr.name}</option>
                ))}
              </select>
              <select
                value={c.operator}
                onChange={(e) => updateConstraint(c.id, { operator: e.target.value })}
                className="w-12 text-[9px] px-1 py-1 border border-gray-200 rounded bg-white"
              >
                <option value="<">&lt;</option>
                <option value=">">&gt;</option>
                <option value="=">=</option>
                <option value="!=">≠</option>
              </select>
              <input
                type="text"
                value={c.value}
                onChange={(e) => updateConstraint(c.id, { value: e.target.value })}
                placeholder="value"
                className="w-16 text-[9px] px-1.5 py-1 border border-gray-200 rounded"
              />
              <button
                onClick={() => removeConstraint(c.id)}
                className="text-gray-400 hover:text-red-500 text-xs"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={addConstraint}
            className="text-[9px] text-blue-500 hover:text-blue-600"
          >
            + Add constraint
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => handleFindPaths(true)}
          disabled={isLoading}
          className="flex-1 text-[10px] px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50"
        >
          {isLoading ? "Searching..." : "Shortest path"}
        </button>
        <button
          onClick={() => handleFindPaths(false)}
          disabled={isLoading}
          className="flex-1 text-[10px] px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors disabled:opacity-50"
        >
          All paths
        </button>
      </div>

      {hasSearched && (
        <div className="space-y-1.5">
          {paths.length === 0 ? (
            <div className="text-[10px] text-gray-400 italic text-center py-2">
              No paths found
            </div>
          ) : (
            <>
              <div className="text-[9px] text-gray-400">
                Found {paths.length} path{paths.length !== 1 ? "s" : ""}
              </div>
              {paths.slice(0, 5).map((result, i) => (
                <button
                  key={i}
                  onClick={() => onSelectPath(result.path)}
                  className="w-full text-left p-2 bg-gray-50 hover:bg-gray-100 rounded transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-600">
                      {result.length} hop{result.length !== 1 ? "s" : ""}
                      {result.isShortest && (
                        <span className="ml-1.5 text-[8px] px-1 py-0.5 bg-green-100 text-green-600 rounded">
                          shortest
                        </span>
                      )}
                    </span>
                    {onAddPredicate && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddPredicate({
                            id: `path-${Date.now()}`,
                            attribute: "pattern",
                            type: "categorical",
                            operator: "=",
                            value: "path",
                            nodeIds: result.path,
                            category: "pattern",
                          });
                        }}
                        className="text-[9px] text-blue-500 opacity-0 group-hover:opacity-100"
                      >
                        +predicate
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-gray-400 mt-1 truncate">
                    {result.path.join(" → ")}
                  </div>
                </button>
              ))}
              {paths.length > 5 && (
                <div className="text-[9px] text-gray-400 text-center">
                  +{paths.length - 5} more paths
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const PatternSection = ({
  selectedNodes,
  onSelectNodes,
  onAddPredicate,
  distributions,
}: PatternSectionProps) => {
  const [expanded, setExpanded] = useState(true);
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastSelectionRef = useRef<string>("");

  const intent: SelectionIntent = useMemo(() => {
    if (selectedNodes.length === 0) return "none";
    if (selectedNodes.length === 1) return "single";
    if (selectedNodes.length === 2) return "pair";
    return "group";
  }, [selectedNodes]);

  useEffect(() => {
    const selectionKey = selectedNodes.sort().join(",");
    if (selectionKey === lastSelectionRef.current) return;
    lastSelectionRef.current = selectionKey;

    if (selectedNodes.length === 0) {
      setPatterns([]);
      return;
    }

    const selectionType =
      selectedNodes.length === 1 ? "node" : selectedNodes.length === 2 ? "edge" : "subgraph";

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const detect = async () => {
      setIsLoading(true);
      try {
        const result = await detectPatterns({
          selection_type: selectionType,
          selected_ids: selectedNodes,
        });
        setPatterns(result.patterns);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Pattern detection failed:", error);
        }
        setPatterns([]);
      } finally {
        setIsLoading(false);
      }
    };

    detect();

    return () => {
      abortRef.current?.abort();
    };
  }, [selectedNodes]);

  const handleSelectPatternNodes = useCallback(
    (pattern: DetectedPattern) => {
      onSelectNodes(pattern.nodes);
    },
    [onSelectNodes]
  );

  const handleAddPatternPredicate = useCallback(
    (pattern: DetectedPattern) => {
      if (!onAddPredicate) return;
      onAddPredicate({
        id: `pattern-${pattern.id}-${Date.now()}`,
        attribute: "pattern",
        type: "categorical",
        operator: "=",
        value: pattern.type,
        nodeIds: pattern.nodes,
        category: "pattern",
      });
    },
    [onAddPredicate]
  );

  return (
    <div className="space-y-2">
      <button
        className="w-full flex items-center gap-1.5 group"
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
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
            d="M12 3l7 4v6l-7 4-7-4V7l7-4z"
          />
          <circle cx="12" cy="10" r="2" />
        </svg>
        <span className="text-[11px] font-semibold text-gray-700">Patterns</span>
        {patterns.length > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full ml-auto">
            {patterns.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-3">
          {intent === "none" && (
            <div className="text-[10px] text-gray-400 py-2 space-y-1">
              <div className="italic">Select nodes to detect patterns</div>
              <div className="text-[9px] text-gray-300">
                Click a node, or shift+drag to lasso select
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full" />
            </div>
          )}

          {!isLoading && patterns.length > 0 && (
            <div className="space-y-2">
              {patterns.map((pattern) => (
                <PatternCard
                  key={`${pattern.id}-${pattern.index}`}
                  pattern={pattern}
                  onSelect={() => handleSelectPatternNodes(pattern)}
                  onAddPredicate={onAddPredicate ? () => handleAddPatternPredicate(pattern) : undefined}
                />
              ))}
            </div>
          )}

          {!isLoading && intent !== "none" && patterns.length === 0 && (
            <div className="text-[10px] text-gray-400 italic py-2">
              No structural patterns detected
            </div>
          )}

          {intent === "pair" && (
            <div className="border-t border-gray-100 pt-3">
              <div className="text-[10px] font-medium text-gray-600 mb-2">
                Path Explorer
              </div>
              <PathFinder
                sourceNode={selectedNodes[0]}
                targetNode={selectedNodes[1]}
                distributions={distributions}
                onSelectPath={onSelectNodes}
                onAddPredicate={onAddPredicate}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
