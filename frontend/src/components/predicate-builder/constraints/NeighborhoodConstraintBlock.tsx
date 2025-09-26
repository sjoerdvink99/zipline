import { useState, useCallback, useRef, useEffect } from 'react';
import { formatNeighborhoodConstraint } from '../../../utils/folFormatting';

interface FilterItem {
  id: string;
  type: 'topology' | 'attribute' | 'fol';
  predicate: any;
  description: string;
  nodeTypes?: string[];
}

export interface NeighborhoodBlock {
  id: string;
  targetPredicateIds: string[];
  targetType: 'predicates' | 'constraints' | 'all_predicates'; // New: specify what this constraint applies to
  quantifier: 'ALL' | 'SOME' | 'EXACTLY' | 'AT_LEAST' | 'AT_MOST';
  count?: number;
  relation: 'neighbors' | 'k_hop' | 'connected_components';
  kParameter?: number;
  constraint: {
    type: 'attribute' | 'topology';
    attribute: string;
    operator: string;
    value: any;
  };
  resultMode: 'primary_only' | 'primary_and_projected';
  projectionVariable?: string;
  parentConstraintId?: string; // New: for nested constraints
  level?: number; // New: constraint nesting level
}

export enum ResultMode {
  PRIMARY_ONLY = 'primary_only',
  PRIMARY_AND_PROJECTED = 'primary_and_projected'
}

interface NeighborhoodConstraintBlockProps {
  block: NeighborhoodBlock;
  filterItems: FilterItem[];
  onUpdate: (block: NeighborhoodBlock) => void;
  onRemove: () => void;
  matchingCount?: number;
  projectionCount?: number;
}

export function NeighborhoodConstraintBlock({
  block,
  filterItems,
  onUpdate,
  onRemove,
  matchingCount = 0,
  projectionCount = 0
}: NeighborhoodConstraintBlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingBlock, setEditingBlock] = useState<NeighborhoodBlock>(block);
  const blockRef = useRef<HTMLDivElement>(null);

  const getTargetItems = useCallback(() => {
    if (block.targetType === 'all_predicates') {
      return filterItems; // Apply to ALL predicates
    } else if (block.targetType === 'constraints') {
      // This would apply to constraint results, handled differently
      return [];
    }
    return filterItems.filter(item => block.targetPredicateIds.includes(item.id));
  }, [block.targetPredicateIds, block.targetType, filterItems]);

  const targetFilters = getTargetItems();

  const handleSave = useCallback(() => {
    onUpdate(editingBlock);
    setIsEditing(false);
  }, [editingBlock, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditingBlock(block);
    setIsEditing(false);
  }, [block]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (blockRef.current && !blockRef.current.contains(e.target as Node) && isEditing) {
        handleCancel();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, handleCancel]);

  const folExpression = formatNeighborhoodConstraint(
    block.quantifier,
    block.count,
    block.relation,
    `${block.constraint.attribute} ${block.constraint.operator} ${block.constraint.value}`,
    block.projectionVariable || 'y'
  );

  const getQuantifierColor = (quantifier: string) => {
    switch (quantifier) {
      case 'ALL': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'SOME': return 'bg-green-100 text-green-800 border-green-200';
      case 'EXACTLY': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'AT_LEAST': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'AT_MOST': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (isEditing) {
    return (
      <div
        ref={blockRef}
        className="border-2 border-violet-300 rounded-lg p-4 bg-violet-50/50 backdrop-blur-sm"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-violet-800">
              Edit Neighborhood Constraint
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-3 py-1 text-xs font-medium bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Apply To</label>
            <div className="space-y-2">
              <label className="flex items-center text-xs cursor-pointer">
                <input
                  type="radio"
                  name={`targetType_${block.id}`}
                  checked={editingBlock.targetType === 'predicates' || !editingBlock.targetType}
                  onChange={() => setEditingBlock(prev => ({ ...prev, targetType: 'predicates' }))}
                  className="mr-2 text-violet-600 focus:ring-violet-500"
                />
                <span className="flex-1">Selected predicates only</span>
              </label>
              <label className="flex items-center text-xs cursor-pointer">
                <input
                  type="radio"
                  name={`targetType_${block.id}`}
                  checked={editingBlock.targetType === 'all_predicates'}
                  onChange={() => setEditingBlock(prev => ({
                    ...prev,
                    targetType: 'all_predicates',
                    targetPredicateIds: [] // Clear specific selections
                  }))}
                  className="mr-2 text-violet-600 focus:ring-violet-500"
                />
                <span className="flex-1 text-green-700 font-medium">All attribute predicates</span>
                <span className="text-green-600 ml-2">✓ Recommended</span>
              </label>
              {editingBlock.parentConstraintId && (
                <label className="flex items-center text-xs cursor-pointer">
                  <input
                    type="radio"
                    name={`targetType_${block.id}`}
                    checked={editingBlock.targetType === 'constraints'}
                    onChange={() => setEditingBlock(prev => ({ ...prev, targetType: 'constraints' }))}
                    className="mr-2 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="flex-1 text-orange-700 font-medium">Previous constraint results</span>
                  <span className="text-orange-600 ml-2">🔗 Nested</span>
                </label>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Quantifier</label>
              <select
                value={editingBlock.quantifier}
                onChange={(e) => setEditingBlock(prev => ({
                  ...prev,
                  quantifier: e.target.value as any
                }))}
                className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
              >
                <option value="ALL">ALL (∀)</option>
                <option value="SOME">SOME (∃)</option>
                <option value="EXACTLY">EXACTLY(n)</option>
                <option value="AT_LEAST">AT_LEAST(n)</option>
                <option value="AT_MOST">AT_MOST(n)</option>
              </select>
            </div>

            {['EXACTLY', 'AT_LEAST', 'AT_MOST'].includes(editingBlock.quantifier) && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Count</label>
                <input
                  type="number"
                  min="1"
                  value={editingBlock.count || 1}
                  onChange={(e) => setEditingBlock(prev => ({
                    ...prev,
                    count: parseInt(e.target.value) || 1
                  }))}
                  className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Relation</label>
              <select
                value={editingBlock.relation}
                onChange={(e) => setEditingBlock(prev => ({
                  ...prev,
                  relation: e.target.value as any
                }))}
                className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
              >
                <option value="neighbors">neighbors(x)</option>
                <option value="k_hop">k-hop(x)</option>
                <option value="connected_components">connected(x)</option>
              </select>
            </div>

            {editingBlock.relation === 'k_hop' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">k-hops</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={editingBlock.kParameter || 2}
                  onChange={(e) => setEditingBlock(prev => ({
                    ...prev,
                    kParameter: parseInt(e.target.value) || 2
                  }))}
                  className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Constraint</label>
            <div className="grid grid-cols-4 gap-2">
              <select
                value={editingBlock.constraint.type}
                onChange={(e) => setEditingBlock(prev => ({
                  ...prev,
                  constraint: {
                    ...prev.constraint,
                    type: e.target.value as 'attribute' | 'topology'
                  }
                }))}
                className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
              >
                <option value="attribute">Attribute</option>
                <option value="topology">Topology</option>
              </select>

              <input
                type="text"
                placeholder="attribute/metric"
                value={editingBlock.constraint.attribute}
                onChange={(e) => setEditingBlock(prev => ({
                  ...prev,
                  constraint: { ...prev.constraint, attribute: e.target.value }
                }))}
                className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
              />

              <select
                value={editingBlock.constraint.operator}
                onChange={(e) => setEditingBlock(prev => ({
                  ...prev,
                  constraint: { ...prev.constraint, operator: e.target.value }
                }))}
                className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
              >
                <option value="=">=</option>
                <option value="!=">≠</option>
                <option value=">">&gt;</option>
                <option value=">=">&gt;=</option>
                <option value="<">&lt;</option>
                <option value="<=">&lt;=</option>
              </select>

              <input
                type="text"
                placeholder="value"
                value={editingBlock.constraint.value}
                onChange={(e) => setEditingBlock(prev => ({
                  ...prev,
                  constraint: { ...prev.constraint, value: e.target.value }
                }))}
                className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-violet-500"
              />
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-violet-200">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Result Mode</label>
              <div className="space-y-2">
                <label className="flex items-center text-xs cursor-pointer">
                  <input
                    type="radio"
                    name={`resultMode_${block.id}`}
                    checked={editingBlock.resultMode === 'primary_only'}
                    onChange={() => setEditingBlock(prev => ({
                      ...prev,
                      resultMode: 'primary_only',
                      projectionVariable: undefined
                    }))}
                    className="mr-2 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="flex-1">Primary entities only</span>
                  <span className="text-gray-500 ml-2">Default</span>
                </label>

                <label className="flex items-center text-xs cursor-pointer">
                  <input
                    type="radio"
                    name={`resultMode_${block.id}`}
                    checked={editingBlock.resultMode === 'primary_and_projected'}
                    onChange={() => setEditingBlock(prev => ({
                      ...prev,
                      resultMode: 'primary_and_projected',
                      projectionVariable: prev.projectionVariable || 'neighbor'
                    }))}
                    className="mr-2 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="flex-1">Primary + projected neighbors</span>
                  <span className="text-amber-600 ml-2 font-medium">Show relations</span>
                </label>
              </div>
            </div>

            {editingBlock.resultMode === 'primary_and_projected' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Variable name for projection
                </label>
                <input
                  type="text"
                  value={editingBlock.projectionVariable || ''}
                  onChange={(e) => setEditingBlock(prev => ({
                    ...prev,
                    projectionVariable: e.target.value || 'neighbor'
                  }))}
                  className="w-full text-xs px-2 py-1 border border-gray-300 rounded font-mono focus:ring-violet-500"
                  placeholder="neighbor"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This variable will be projected to show matching neighbors
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative border-2 border-violet-200 rounded-lg p-3 bg-gradient-to-r from-violet-50 to-violet-100/30">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium ${getQuantifierColor(block.quantifier)}`}>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {block.quantifier}
            {block.count && ` (${block.count})`}
          </div>

          <div className="text-xs text-violet-700 font-mono">
            {folExpression}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 text-violet-500 hover:text-violet-700 hover:bg-violet-100 rounded transition-colors"
            title="Edit constraint"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          <button
            onClick={onRemove}
            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded transition-colors"
            title="Remove constraint"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-gray-600 font-medium">Applied to:</div>
        <div className="flex flex-wrap gap-1.5">
          {block.targetType === 'all_predicates' ? (
            <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded border text-xs bg-gradient-to-r from-green-100 to-emerald-100 border-green-200">
              <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold text-green-800">All {filterItems.length} predicates</span>
            </div>
          ) : block.targetType === 'constraints' ? (
            <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded border text-xs bg-gradient-to-r from-orange-100 to-amber-100 border-orange-200">
              <svg className="w-3 h-3 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold text-orange-800">Previous constraint results</span>
            </div>
          ) : (
            targetFilters.map(filter => {
              const typeStyles = {
                topology: 'bg-blue-100 text-blue-800 border-blue-200',
                attribute: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                fol: 'bg-violet-100 text-violet-800 border-violet-200'
              }[filter.type];

              return (
                <div
                  key={filter.id}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${typeStyles}`}
                >
                  <span className="truncate max-w-[100px]">{filter.description}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-violet-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-violet-400"></span>
              <span className="font-medium text-gray-700">Result Mode:</span>
              <span className={block.resultMode === 'primary_and_projected' ? 'text-amber-700 font-medium' : 'text-gray-600'}>
                {block.resultMode === 'primary_only' ? 'Primary only' : `Primary + ${block.projectionVariable || 'neighbors'}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <span className="font-medium">{matchingCount}</span>
              <span>primary</span>
            </div>
            {block.resultMode === 'primary_and_projected' && (
              <div className="flex items-center gap-1">
                <span>+</span>
                <span className="font-medium">{projectionCount}</span>
                <span>projected</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}