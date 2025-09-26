import { useState } from 'react';
import type { ProjectionResult } from '../../types/predicate';

interface ResultsDisplayProps {
  matchingNodes: string[];
  projections?: ProjectionResult[];
  resultMode?: 'primary_only' | 'primary_and_projected';
  onNodeHighlight?: (nodeIds: string[], type: 'primary' | 'projected') => void;
}

export function ResultsDisplay({
  matchingNodes,
  projections = [],
  resultMode = 'primary_only',
  onNodeHighlight
}: ResultsDisplayProps) {
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [displayMode, setDisplayMode] = useState<'primary_only' | 'primary_and_projected'>(resultMode);

  const totalProjected = projections.reduce((total, proj) =>
    total + Object.values(proj.projected_variables).flat().length, 0);

  const toggleExpanded = (nodeId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedResults(newExpanded);
  };

  const handleNodeClick = (nodeIds: string[], type: 'primary' | 'projected') => {
    if (onNodeHighlight) {
      onNodeHighlight(nodeIds, type);
    }
  };

  return (
    <div className="space-y-3">

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <h5 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
              Primary Entities ({matchingNodes.length})
            </h5>
          </div>

          {projections.length > 0 && (
            <div className="flex bg-white border border-gray-300 rounded-lg p-1">
              <button
                onClick={() => setDisplayMode('primary_only')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  displayMode === 'primary_only'
                    ? 'bg-blue-100 text-blue-800'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Primary Only
              </button>
              <button
                onClick={() => setDisplayMode('primary_and_projected')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  displayMode === 'primary_and_projected'
                    ? 'bg-amber-100 text-amber-800'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Primary + Projected
              </button>
            </div>
          )}
        </div>

        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="text-xs text-emerald-800 mb-2 font-medium">
            Entities that directly satisfy the predicate constraints:
          </div>
          <div className="max-h-48 overflow-y-auto">
            <div className="flex flex-wrap gap-1.5">
              {matchingNodes.map((nodeId) => (
                <button
                  key={nodeId}
                  className="px-2 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-xs font-mono hover:bg-emerald-200 transition-colors"
                  onClick={() => handleNodeClick([nodeId], 'primary')}
                >
                  {nodeId}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {displayMode === 'primary_and_projected' && projections.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <h5 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
              Projected Relations ({totalProjected})
            </h5>
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto border border-amber-200 rounded-lg">
            {projections.map((projection, index) => {
              const isExpanded = expandedResults.has(projection.primary_node);
              const projectedCount = Object.values(projection.projected_variables).flat().length;

              return (
                <div key={`${projection.primary_node}-${index}`} className="border-b border-amber-100 last:border-b-0">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-amber-50 transition-colors"
                    onClick={() => toggleExpanded(projection.primary_node)}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                        <button
                          className="text-emerald-700 hover:text-emerald-900 font-mono text-xs font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNodeClick([projection.primary_node], 'primary');
                          }}
                        >
                          {projection.primary_node}
                        </button>
                      </div>
                      <div className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        → {projectedCount} projected
                      </div>
                    </div>
                    <div className="text-xs text-amber-600">
                      {isExpanded ? '▲' : '▼'}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 bg-amber-50/50">
                      <div className="space-y-3">
                        {Object.entries(projection.projected_variables).map(([variable, nodes]) => (
                          <div key={variable}>
                            <div className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-2">
                              <span className="font-mono bg-amber-200 px-2 py-0.5 rounded">{variable}</span>
                              <span className="text-amber-600 font-normal">({nodes.length} nodes)</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {nodes.map((node, nodeIndex) => (
                                <button
                                  key={`${node}-${nodeIndex}`}
                                  className="px-2 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-mono hover:bg-amber-200 transition-colors"
                                  onClick={() => handleNodeClick([node], 'projected')}
                                >
                                  {node}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 pt-2 border-t border-amber-200">
                        <button
                          className="text-xs text-amber-700 hover:text-amber-900 underline font-medium"
                          onClick={() => {
                            const allProjected = Object.values(projection.projected_variables).flat();
                            handleNodeClick([projection.primary_node, ...allProjected], 'primary');
                          }}
                        >
                          ⚡ Highlight complete relation structure
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

    </div>
  );
}