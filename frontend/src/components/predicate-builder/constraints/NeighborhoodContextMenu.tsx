import { useState, useEffect, useRef, useCallback } from 'react';
import type { NeighborhoodConstraint } from '../../../types/predicate';

interface NeighborhoodContextMenuProps {
  constraint: NeighborhoodConstraint;
  position: { x: number; y: number };
  isVisible: boolean;
  onSave: (updatedConstraint: NeighborhoodConstraint) => void;
  onCancel: () => void;
  onDelete: () => void;
}

const QUANTIFIERS = [
  { value: 'ALL', label: 'ALL (∀)', symbol: '∀' },
  { value: 'SOME', label: 'SOME (∃)', symbol: '∃' },
  { value: 'EXACTLY', label: 'EXACTLY(n)', symbol: 'exactly' },
  { value: 'AT_LEAST', label: 'AT_LEAST(n)', symbol: '≥' },
  { value: 'AT_MOST', label: 'AT_MOST(n)', symbol: '≤' }
];

const RELATIONS = [
  { value: 'neighbors', label: 'neighbors(x)' },
  { value: 'k_hop', label: 'k-hop(x)' },
  { value: 'connected_components', label: 'connected(x)' }
];

export function NeighborhoodContextMenu({
  constraint,
  position,
  isVisible,
  onSave,
  onCancel,
  onDelete
}: NeighborhoodContextMenuProps) {
  const [mode, setMode] = useState<'menu' | 'edit'>('menu');
  const [quantifier, setQuantifier] = useState<'ALL' | 'SOME' | 'EXACTLY' | 'AT_LEAST' | 'AT_MOST'>('ALL');
  const [count, setCount] = useState<number>(1);
  const [relation, setRelation] = useState<'neighbors' | 'k_hop' | 'connected_components'>('neighbors');
  const [kParameter, setKParameter] = useState<number>(2);
  const [resultMode, setResultMode] = useState<'primary_only' | 'primary_and_projected'>('primary_only');
  const [projectionVariable, setProjectionVariable] = useState<string>('neighbor');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === 'edit' && constraint) {
      setQuantifier(constraint.quantifier);
      setCount(constraint.count || 1);
      setRelation(constraint.relation);
      setKParameter(constraint.kParameter || 2);
      setResultMode(constraint.resultMode);
      setProjectionVariable(constraint.projectionVariable || 'neighbor');
    }
  }, [mode, constraint]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mode === 'edit') return;
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onCancel();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (mode === 'edit') {
          setMode('menu');
        } else {
          onCancel();
        }
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isVisible, mode, onCancel]);

  useEffect(() => {
    if (!isVisible) {
      setMode('menu');
    }
  }, [isVisible]);

  const handleSave = useCallback(() => {
    const updatedConstraint: NeighborhoodConstraint = {
      ...constraint,
      quantifier,
      count: ['EXACTLY', 'AT_LEAST', 'AT_MOST'].includes(quantifier) ? count : undefined,
      relation,
      kParameter: relation === 'k_hop' ? kParameter : undefined,
      resultMode,
      projectionVariable: resultMode === 'primary_and_projected' ? projectionVariable : undefined
    };

    onSave(updatedConstraint);
  }, [constraint, quantifier, count, relation, kParameter, resultMode, projectionVariable, onSave]);

  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 280),
    y: Math.min(position.y, window.innerHeight - (mode === 'edit' ? 450 : 100))
  };

  if (!isVisible) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-64"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        maxHeight: '450px',
        overflow: 'auto'
      }}
    >
      {mode === 'menu' ? (
        <div className="py-1">
          <button
            onClick={() => setMode('edit')}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Constraint
          </button>
          <div className="border-t border-gray-100" />
          <button
            onClick={onDelete}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Remove
          </button>
        </div>
      ) : (
        <div className="p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900">Edit Neighborhood Constraint</h4>
            <button
              onClick={() => setMode('menu')}
              className="text-gray-400 hover:text-gray-600"
              type="button"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Quantifier</label>
              <select
                value={quantifier}
                onChange={(e) => setQuantifier(e.target.value as any)}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                {QUANTIFIERS.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </div>

            {['EXACTLY', 'AT_LEAST', 'AT_MOST'].includes(quantifier) && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Count</label>
                <input
                  type="number"
                  min="1"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Relation</label>
              <select
                value={relation}
                onChange={(e) => setRelation(e.target.value as any)}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                {RELATIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {relation === 'k_hop' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">k-hops</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={kParameter}
                  onChange={(e) => setKParameter(parseInt(e.target.value) || 2)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Result Mode</label>
            <div className="space-y-2">
              <label className="flex items-center text-xs cursor-pointer">
                <input
                  type="radio"
                  checked={resultMode === 'primary_only'}
                  onChange={() => setResultMode('primary_only')}
                  className="mr-2 text-violet-600 focus:ring-violet-500"
                />
                <span className="flex-1">Primary entities only</span>
                <span className="text-gray-500 ml-2">Default</span>
              </label>

              <label className="flex items-center text-xs cursor-pointer">
                <input
                  type="radio"
                  checked={resultMode === 'primary_and_projected'}
                  onChange={() => setResultMode('primary_and_projected')}
                  className="mr-2 text-violet-600 focus:ring-violet-500"
                />
                <span className="flex-1">Primary + projected neighbors</span>
                <span className="text-amber-600 ml-2 font-medium">Show relations</span>
              </label>
            </div>
          </div>

          {resultMode === 'primary_and_projected' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Variable name for projection</label>
              <input
                type="text"
                value={projectionVariable}
                onChange={(e) => setProjectionVariable(e.target.value || 'neighbor')}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
                placeholder="neighbor"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSave();
              }}
              type="button"
              className="flex-1 px-3 py-1 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMode('menu');
              }}
              type="button"
              className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}