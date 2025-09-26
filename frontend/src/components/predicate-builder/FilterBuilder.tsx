import { useCallback, useEffect, useState } from 'react';
import { usePredicateStore } from '../../store/predicates';
import type { FilterItem, ProjectionResult } from '../../types/predicate';
import { FOLDisplay } from './FOLDisplay';
import { PredicatePill } from './pills/PredicatePill';
import { ValidationErrors } from '../results/ValidationErrors';
import { ResultsDisplay } from '../results/ResultsDisplay';
import { NeighborhoodBlock } from './constraints/NeighborhoodBlock';
import { PredicateContextMenu } from './menus/PredicateContextMenu';

interface FilterBuilderProps {
  onFilterApply: (matchingNodeIds: string[], projectionResults?: ProjectionResult[]) => void;
  onFilterClear: () => void;
  onFilterSave?: (filterName: string, filterItems: any[], operator: "and" | "or") => void;
  sessionId?: string;
}

export function FilterBuilder({ onFilterApply, onFilterClear, onFilterSave, sessionId = 'default' }: FilterBuilderProps) {
  const [showFOL, setShowFOL] = useState(false);
  const [editingConstraint, setEditingConstraint] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    item: FilterItem;
    position: { x: number; y: number };
  } | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [savePatternName, setSavePatternName] = useState('');

  const {
    predicates,
    constraints,
    setOperations,
    evaluation,
    errors,
    isEvaluating,
    addPredicate,
    updatePredicate,
    removePredicate,
    reorderPredicates,
    setOperation,
    addConstraint,
    updateConstraint,
    removeConstraint,
    evaluate,
    clear,
    clearErrors
  } = usePredicateStore();

  const handleDropZoneDragOver = useCallback((e: React.DragEvent) => {
    const dragOverElement = e.target as Element;

    if (dragOverElement.closest('[data-constraint-drop-zone]')) {
      return; // Don't handle this event
    }

    e.preventDefault();
    if (e.dataTransfer.types.includes('application/json')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDropZoneDrop = useCallback((e: React.DragEvent) => {
    const dragOverElement = e.target as Element;

    if (dragOverElement.closest('[data-constraint-drop-zone]')) {
      return; // Don't handle this event
    }

    e.preventDefault();
    try {
      const data = e.dataTransfer.getData('application/json');
      if (data) {
        const dragData = JSON.parse(data);

        let filterItem: FilterItem;

        if (dragData.type === 'filter-item' && dragData.filterItem) {
          filterItem = dragData.filterItem;
        } else if (dragData.legacyType && dragData.predicate) {
          filterItem = {
            id: `${dragData.legacyType}-${dragData.predicate.id || Date.now()}`,
            type: dragData.legacyType === 'pattern' ? 'fol' : dragData.legacyType,
            predicate: dragData.predicate,
            description: dragData.predicate.description ||
              `${dragData.predicate.attribute || dragData.predicate.pattern_type} filter`,
            nodeTypes: dragData.predicate.applicable_node_types
          };
        } else if (dragData.type && dragData.predicate) {
          filterItem = {
            id: `${dragData.type}-${dragData.predicate.id || Date.now()}`,
            type: dragData.type === 'pattern' ? 'fol' : dragData.type,
            predicate: dragData.predicate,
            description: dragData.predicate.description ||
              `${dragData.predicate.attribute || dragData.predicate.pattern_type} filter`,
            nodeTypes: dragData.predicate.applicable_node_types
          };
        } else {
          return;
        }

        addPredicate(filterItem);
      }
    } catch (error) {
      console.error('Failed to parse dropped data:', error);
    }
  }, [addPredicate]);

  const handleEvaluate = useCallback(async () => {
    await evaluate();
  }, [evaluate]);

  useEffect(() => {
    if (evaluation && evaluation.matching_nodes) {
      onFilterApply(evaluation.matching_nodes, evaluation.projections);
    }
  }, [evaluation?.matching_nodes, evaluation?.projections]);

  const handleClear = useCallback(() => {
    clear();
    onFilterClear();
  }, [clear, onFilterClear]);

  useEffect(() => {
    const handleAddFilterItem = (event: CustomEvent) => {
      addPredicate(event.detail);
    };

    window.addEventListener('gb:add-filter-item', handleAddFilterItem);
    return () => window.removeEventListener('gb:add-filter-item', handleAddFilterItem);
  }, [addPredicate]);

  useEffect(() => {
    if (predicates.length > 0) {
      clearErrors();
    }
  }, [predicates, clearErrors]);

  const hasPredicates = predicates.length > 0;
  const hasConstraints = constraints.length > 0;
  const hasResults = evaluation?.matching_nodes && evaluation.matching_nodes.length > 0;

  const handleSavePattern = useCallback(() => {
    if (!onFilterSave || !hasPredicates) return;

    if (savePatternName.trim()) {
      const filterItems = predicates.map(p => ({
        id: p.id,
        type: p.type,
        predicate: p.predicate,
        description: p.description
      }));

      onFilterSave(savePatternName.trim(), filterItems, 'and');
      setSavePatternName('');
      setShowSaveDialog(false);
    }
  }, [onFilterSave, hasPredicates, savePatternName, predicates]);

  const handleContextMenu = useCallback((item: FilterItem, position: { x: number; y: number }) => {
    console.log('Context menu triggered for:', item, 'at position:', position);
    setContextMenu({ item, position });
  }, []);

  const handleContextMenuSave = useCallback((updatedItem: FilterItem) => {
    updatePredicate(updatedItem.id, updatedItem);
    setContextMenu(null);
  }, [updatePredicate]);

  const handleContextMenuCancel = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleContextMenuDelete = useCallback(() => {
    if (contextMenu) {
      removePredicate(contextMenu.item.id);
      setContextMenu(null);
    }
  }, [contextMenu, removePredicate]);

  return (
    <div className="bg-white border-b border-gray-100">
      <div className="px-4 py-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                Predicate Builder
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {hasPredicates && (
              <>
                <button
                  onClick={() => setShowFOL(!showFOL)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                    showFOL
                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                      : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'
                  }`}
                  title="Toggle FOL Expression"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  FOL
                </button>
                <button
                  onClick={handleEvaluate}
                  disabled={isEvaluating}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {isEvaluating ? (
                    <div className="animate-spin h-3 w-3 border border-white border-t-transparent rounded-full" />
                  ) : (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                  Evaluate
                </button>
                {onFilterSave && (
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                    title="Save as pattern"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Save
                  </button>
                )}
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        <div
          className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto scrollbar-hide mb-3 min-h-[52px] relative transition-all duration-300 border border-dashed rounded-lg p-3 bg-gray-50/50 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
          onDragOver={handleDropZoneDragOver}
          onDrop={handleDropZoneDrop}
        >
          {!hasPredicates && !hasConstraints ? (
            <div className="text-center py-2 w-full">
              <div className="flex items-center justify-center gap-2 text-gray-400 mb-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                </svg>
                <span className="text-[11px] font-medium">Build Expression</span>
              </div>
              <p className="text-[9px] text-gray-400">
                Drag predicates from topology and attribute panels to create sophisticated queries
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {predicates.map((predicate, index) => (
                <div key={predicate.id} className="flex items-center gap-2">
                  <PredicatePill
                    item={predicate}
                    index={index}
                    showOperator={index > 0}
                    operation={setOperations[predicate.id] || 'and'}
                    onOperationChange={(op) => setOperation(predicate.id, op)}
                    onRemove={() => removePredicate(predicate.id)}
                    onReorder={reorderPredicates}
                    onSelect={() => {}}
                    isSelected={false}
                    isSelectable={false}
                    onContextMenu={handleContextMenu}
                  />

                  <button
                    onClick={() => {
                      const constraintAfterPredicate = {
                        id: `constraint_${Date.now()}`,
                        targetPredicateIds: [predicate.id],
                        targetType: 'predicates' as const, // Single predicate selection
                        quantifier: 'ALL' as const,
                        relation: 'neighbors' as const,
                        constraints: [{
                          id: `constraint_item_${Date.now()}`,
                          type: 'attribute' as const,
                          attribute: 'type',
                          operator: '=',
                          value: ''
                        }],
                        resultMode: 'primary_only' as const,
                        level: 1
                      };
                      addConstraint(constraintAfterPredicate);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-violet-100 text-violet-700 border border-violet-200 rounded hover:bg-violet-200 transition-colors"
                    title="Add neighborhood constraint"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                    </svg>
                    ∀
                  </button>

                  {/* Add "Apply to All" button for the last predicate */}
                  {index === predicates.length - 1 && predicates.length > 1 && (
                    <button
                      onClick={() => {
                        const allPredicatesConstraint = {
                          id: `constraint_${Date.now()}`,
                          targetPredicateIds: predicates.map(p => p.id),
                          targetType: 'all_predicates' as const, // Apply to ALL predicates
                          quantifier: 'ALL' as const,
                          relation: 'neighbors' as const,
                          constraints: [{
                            id: `constraint_item_${Date.now()}`,
                            type: 'attribute' as const,
                            attribute: 'type',
                            operator: '=',
                            value: ''
                          }],
                          resultMode: 'primary_only' as const,
                          level: 1
                        };
                        addConstraint(allPredicatesConstraint);
                      }}
                      className="flex items-center gap-1 px-3 py-1 text-xs bg-green-100 text-green-700 border border-green-200 rounded hover:bg-green-200 transition-colors font-medium"
                      title="Apply neighborhood constraint to all predicates"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      ∀ All
                    </button>
                  )}
                </div>
              ))}

              {constraints.map((constraint) => (
                <div key={constraint.id} className="flex items-center gap-2">
                  <div className="text-xs text-gray-400">→</div>

                  {editingConstraint === constraint.id ? (
                    <div className="flex-1">
                      <NeighborhoodBlock
                        constraint={constraint}
                        predicates={predicates}
                        onUpdate={(updated) => {
                          updateConstraint(constraint.id, updated);
                          setEditingConstraint(null);
                        }}
                        onRemove={() => {
                          removeConstraint(constraint.id);
                          setEditingConstraint(null);
                        }}
                        matchingCount={Math.floor(Math.random() * 50) + 10}
                        projectionCount={constraint.resultMode === 'primary_and_projected' ? Math.floor(Math.random() * 20) + 5 : 0}
                      />
                    </div>
                  ) : (
                    <>
                      <div
                        className="px-3 py-1 bg-violet-50 border border-violet-200 rounded-lg cursor-pointer hover:bg-violet-100 transition-colors"
                        onClick={() => setEditingConstraint(constraint.id)}
                        title="Click to edit constraint"
                      >
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-mono text-violet-700 font-medium">
                            {constraint.quantifier === 'ALL' ? '∀' : constraint.quantifier === 'SOME' ? '∃' : constraint.quantifier}
                            {constraint.count && `(${constraint.count})`} {constraint.relation === 'neighbors' ? 'neighbors' : constraint.relation}
                          </div>
                          <div className="text-xs text-violet-600">
                            {(() => {
                              if (constraint.constraints && constraint.constraints.length > 0) {
                                return constraint.constraints.map((c, i) =>
                                  `${c.attribute} ${c.operator} ${c.value || '""'}${i < constraint.constraints.length - 1 ? ` ${c.combineOp || 'and'} ` : ''}`
                                ).join('');
                              }
                              else if ((constraint as any).constraint) {
                                const c = (constraint as any).constraint;
                                return `${c.attribute} ${c.operator} ${c.value || '""'}`;
                              }
                              return 'no constraints';
                            })()}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeConstraint(constraint.id);
                            }}
                            className="p-0.5 text-violet-400 hover:text-red-500 transition-colors"
                            title="Remove constraint"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const nextConstraint = {
                            id: `constraint_${Date.now()}`,
                            targetPredicateIds: [constraint.id],
                            targetType: 'constraints' as const, // Target previous constraint
                            parentConstraintId: constraint.id, // Reference to parent
                            quantifier: 'SOME' as const, // Default to existential for nested
                            relation: 'neighbors' as const,
                            constraint: {
                              type: 'attribute' as const,
                              attribute: 'type',
                              operator: '=',
                              value: ''
                            },
                            resultMode: 'primary_only' as const,
                            level: (constraint.level || 1) + 1
                          };
                          addConstraint(nextConstraint);
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-100 text-orange-700 border border-orange-200 rounded hover:bg-orange-200 transition-colors"
                        title="Add nested constraint (applies to this constraint's results)"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        🔗∃
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {hasPredicates && showFOL && (
        <div className="px-4 pb-2">
          <FOLDisplay
            predicates={predicates}
            operations={setOperations}
            constraints={constraints}
            isValid={errors.length === 0}
          />
        </div>
      )}

      <ValidationErrors errors={errors} />

      {hasResults && (
        <div className="px-4 py-3 border-t border-gray-200">
          <ResultsDisplay
            matchingNodes={evaluation.matching_nodes}
            projections={evaluation.projections}
            resultMode="primary_only"
            onNodeHighlight={(nodeIds, type) => {
              console.log(`Highlighting ${type} nodes:`, nodeIds);
            }}
          />
        </div>
      )}

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Save as Pattern</h3>
              <p className="text-sm text-gray-600 mb-4">
                Save this predicate combination as a reusable pattern.
              </p>
              <div className="mb-4">
                <label htmlFor="pattern-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Pattern Name
                </label>
                <input
                  id="pattern-name"
                  type="text"
                  value={savePatternName}
                  onChange={(e) => setSavePatternName(e.target.value)}
                  placeholder="Enter pattern name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSavePatternName('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePattern}
                  disabled={!savePatternName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                >
                  Save Pattern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <PredicateContextMenu
          item={contextMenu.item}
          position={contextMenu.position}
          isVisible={!!contextMenu}
          onSave={handleContextMenuSave}
          onCancel={handleContextMenuCancel}
          onDelete={handleContextMenuDelete}
        />
      )}
    </div>
  );
}