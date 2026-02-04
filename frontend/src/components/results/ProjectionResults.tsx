import { useState } from "react";
import type { ProjectionResult } from "../../api/predicates";

export interface StructuredProjectionResult {
  primary_entities: string[];
  projected_relations: Array<{
    variable: string;
    nodes: string[];
    relation_type: string;
  }>;
  result_mode: "primary_only" | "primary_and_projected";
}

interface ProjectionResultsProps {
  projections: ProjectionResult[];
  resultMode?: "primary_only" | "primary_and_projected";
  onNodeHighlight?: (nodeIds: string[], type: "primary" | "projected") => void;
  className?: string;
}

export function ProjectionResults({
  projections,
  resultMode = "primary_only",
  onNodeHighlight,
  className = "",
}: ProjectionResultsProps) {
  const [expandedResults, setExpandedResults] = useState<Set<string>>(
    new Set(),
  );

  if (!projections || projections.length === 0) {
    return (
      <div className={`text-xs text-gray-500 italic ${className}`}>
        No projection results available
      </div>
    );
  }

  const toggleExpanded = (primaryNode: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(primaryNode)) {
      newExpanded.delete(primaryNode);
    } else {
      newExpanded.add(primaryNode);
    }
    setExpandedResults(newExpanded);
  };

  const handleNodeClick = (
    nodeIds: string[],
    type: "primary" | "projected",
  ) => {
    if (onNodeHighlight) {
      onNodeHighlight(nodeIds, type);
    }
  };

  const totalProjectedNodes = projections.reduce((total, proj) => {
    return total + Object.values(proj.projected_variables).flat().length;
  }, 0);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-white shadow-sm"></div>
          <h4 className="text-sm font-semibold text-blue-800">
            {resultMode === "primary_only"
              ? "Primary Results Only"
              : "Primary + Projected Results"}
          </h4>
        </div>
        <div className="text-xs text-blue-700 font-medium">
          {resultMode === "primary_only"
            ? `${projections.length} primary entities`
            : `${projections.length} primary + ${totalProjectedNodes} projected`}
        </div>
      </div>

      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-start gap-2">
          <svg
            className="w-4 h-4 text-slate-500 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-xs text-slate-700">
            {resultMode === "primary_only" ? (
              <span>
                <span className="font-medium">Primary only:</span> Results show
                entities that satisfy the predicate directly. Neighborhood
                constraints act as{" "}
                <span className="font-mono bg-slate-200 px-1 rounded">
                  witnesses
                </span>{" "}
                (validation only).
              </span>
            ) : (
              <span>
                <span className="font-medium">Primary + projected:</span>{" "}
                Results include both entities that satisfy the predicate and
                their{" "}
                <span className="font-mono bg-slate-200 px-1 rounded">
                  projected neighbors
                </span>{" "}
                that satisfy the predicate.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <h5 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
            Primary Entities ({projections.length})
          </h5>
        </div>

        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="text-xs text-emerald-800 mb-2 font-medium">
            Entities that directly satisfy the predicate constraints:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {projections.map((projection, index) => (
              <button
                key={`primary-${projection.primary_node}-${index}`}
                className="px-2 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-xs font-mono hover:bg-emerald-200 transition-colors"
                onClick={() =>
                  handleNodeClick([projection.primary_node], "primary")
                }
                title={`Primary entity: ${projection.primary_node}`}
              >
                {projection.primary_node}
              </button>
            ))}
          </div>
        </div>
      </div>

      {resultMode === "primary_and_projected" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <h5 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
              Projected Relations ({totalProjectedNodes})
            </h5>
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto border border-amber-200 rounded-lg">
            {projections.map((projection, index) => {
              const isExpanded = expandedResults.has(projection.primary_node);
              const projectedCount = Object.values(
                projection.projected_variables,
              ).flat().length;

              return (
                <div
                  key={`${projection.primary_node}-${index}`}
                  className="border border-gray-200 rounded"
                >
                  <div
                    className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleExpanded(projection.primary_node)}
                  >
                    <div className="flex items-center space-x-2">
                      <button
                        className="text-blue-600 hover:text-blue-800 underline text-xs font-mono"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNodeClick([projection.primary_node], "primary");
                        }}
                      >
                        {projection.primary_node}
                      </button>
                      <span className="text-xs text-gray-600">
                        ({projectedCount} projected)
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {isExpanded ? "▲" : "▼"}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 p-2 bg-gray-50">
                      <div className="space-y-2">
                        {Object.entries(projection.projected_variables).map(
                          ([variable, nodes]) => (
                            <div key={variable} className="space-y-1">
                              <div className="text-xs font-medium text-gray-700">
                                Variable "{variable}":
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {nodes.map((node, nodeIndex) => (
                                  <button
                                    key={`${node}-${nodeIndex}`}
                                    className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-mono hover:bg-blue-200 transition-colors"
                                    onClick={() =>
                                      handleNodeClick([node], "projected")
                                    }
                                    title={`Projected node: ${node}`}
                                  >
                                    {node}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ),
                        )}
                      </div>

                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <button
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                          onClick={() => {
                            const allProjectedNodes = Object.values(
                              projection.projected_variables,
                            ).flat();
                            handleNodeClick(
                              [projection.primary_node, ...allProjectedNodes],
                              "primary",
                            );
                          }}
                        >
                          Highlight all related nodes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg">
        <div className="flex items-start gap-2">
          <svg
            className="w-4 h-4 text-slate-500 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <div className="text-xs text-slate-700">
            <span className="font-medium">Interaction:</span> Click on entity
            names to highlight them in the graph.
            {resultMode === "primary_and_projected" && (
              <span>
                {" "}
                Expand relations to see projected variables and their
                connections.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectionResults;
