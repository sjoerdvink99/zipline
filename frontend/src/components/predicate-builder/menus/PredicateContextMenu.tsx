import { useState, useEffect, useRef, useCallback } from 'react';
import type { FilterItem } from '../../../types/predicate';
import type { GeneratedPredicate } from '../../../api/predicates';
import { AutocompleteInput } from '../../ui/AutocompleteInput';
import { useGraphSchema, getAttributeSuggestions, getValueSuggestions, getAttributeType } from '../../../hooks/useGraphSchema';

interface PredicateContextMenuProps {
  item: FilterItem;
  position: { x: number; y: number };
  isVisible: boolean;
  onSave: (updatedItem: FilterItem) => void;
  onCancel: () => void;
  onDelete: () => void;
}

const OPERATORS = {
  numeric: ['<', '<=', '>', '>=', '=', '!=', 'between'],
  categorical: ['=', '!=', 'in', 'not_in'],
  boolean: ['=', '!='],
  array: ['length_eq', 'length_gt', 'length_gte', 'length_lt', 'length_lte', 'contains', 'not_contains'],
  topology: ['<', '<=', '>', '>=', '=', '!=', 'between']
};

const OPERATOR_LABELS = {
  '<': 'less than',
  '<=': 'less than or equal',
  '>': 'greater than',
  '>=': 'greater than or equal',
  '=': 'equals',
  '!=': 'not equal',
  'between': 'between',
  'in': 'in',
  'not_in': 'not in',
  'length_eq': 'length equals',
  'length_gt': 'length greater than',
  'length_gte': 'length greater than or equal',
  'length_lt': 'length less than',
  'length_lte': 'length less than or equal',
  'contains': 'contains',
  'not_contains': 'does not contain'
};

// Available topology metrics with human-readable labels
const TOPOLOGY_METRICS = {
  'degree': 'Degree',
  'clustering_coefficient': 'Clustering Coefficient',
  'betweenness_centrality': 'Betweenness Centrality',
  'closeness_centrality': 'Closeness Centrality',
  'eigenvector_centrality': 'Eigenvector Centrality',
  'pagerank': 'PageRank',
  'k_core': 'K-Core',
  'avg_neighbor_degree': 'Average Neighbor Degree',
  'max_neighbor_degree': 'Max Neighbor Degree',
  'min_neighbor_degree': 'Min Neighbor Degree',
  'neighbor_degree_std': 'Neighbor Degree Std Dev',
  'neighbor_count_high_degree': 'High Degree Neighbor Count',
  'neighbor_homogeneity': 'Neighbor Homogeneity',
  'triangle_count': 'Triangle Count',
  'in_degree': 'In-Degree',
  'out_degree': 'Out-Degree'
};

export function PredicateContextMenu({
  item,
  position,
  isVisible,
  onSave,
  onCancel,
  onDelete
}: PredicateContextMenuProps) {
  const [mode, setMode] = useState<'menu' | 'edit'>('menu');
  const [attribute, setAttribute] = useState('');
  const [operator, setOperator] = useState('=');
  const [value, setValue] = useState<string | number>('');
  const [value2, setValue2] = useState<number | undefined>();
  const [attributeType, setAttributeType] = useState<'numeric' | 'categorical' | 'boolean' | 'array'>('categorical');
  const menuRef = useRef<HTMLDivElement>(null);
  const { schema } = useGraphSchema();

  useEffect(() => {
    if (mode === 'edit' && item) {
      const pred = item.predicate as GeneratedPredicate;
      console.log('Initializing form with predicate:', pred);
      setAttribute(pred.attribute || '');
      setOperator(pred.operator || '=');
      setValue(pred.value ?? '');
      setValue2(pred.value2);
      setAttributeType(pred.attribute_type || 'categorical');
    }
  }, [mode, item]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mode === 'edit') return; // Don't close when editing
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onCancel();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (mode === 'edit') {
          setMode('menu'); // Go back to menu mode
        } else {
          onCancel(); // Close completely
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
    console.log('handleSave called with:', { attribute, operator, value, value2, attributeType });

    if (!attribute || value === '' || value === null || value === undefined) {
      console.log('Save validation failed:', { attribute, value });
      return;
    }

    const updatedPredicate: GeneratedPredicate = {
      ...(item.predicate as GeneratedPredicate),
      attribute,
      operator,
      value,
      value2: operator === 'between' ? value2 : undefined,
      attribute_type: attributeType
    };

    const updatedItem: FilterItem = {
      ...item,
      predicate: updatedPredicate,
      description: `${attribute} ${operator} ${value}${operator === 'between' && value2 ? ` and ${value2}` : ''}`
    };

    console.log('Calling onSave with:', updatedItem);
    onSave(updatedItem);
  }, [attribute, operator, value, value2, attributeType, item, onSave]);

  const availableOperators = item.type === 'topology' ? OPERATORS.topology : (OPERATORS[attributeType as keyof typeof OPERATORS] || OPERATORS.categorical);

  const attributeSuggestions = getAttributeSuggestions(schema, item.type === 'topology' ? 'topology' : 'attribute');
  const valueSuggestions = getValueSuggestions(schema, attribute, item.type === 'topology' ? 'topology' : 'attribute');

  useEffect(() => {
    if (attribute && schema && item.type === 'attribute') {
      const detectedType = getAttributeType(schema, attribute, 'attribute');
      if (detectedType && detectedType !== attributeType) {
        setAttributeType(detectedType);
      }
    }
  }, [attribute, schema, item.type]);

  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 250), // 250px is estimated menu width
    y: Math.min(position.y, window.innerHeight - (mode === 'edit' ? 400 : 100)) // Adjust for edit form height
  };

  if (!isVisible) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-48"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        maxHeight: '400px',
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
            Edit Predicate
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
            <h4 className="text-sm font-semibold text-gray-900">
              Edit {item.type === 'topology' ? 'Topology' : 'Attribute'}
            </h4>
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

          
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {item.type === 'topology' ? 'Metric' : 'Attribute'}
            </label>
            {item.type === 'topology' ? (
              <select
                value={attribute}
                onChange={(e) => setAttribute(e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select metric...</option>
                {Object.entries(TOPOLOGY_METRICS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={attribute}
                onChange={(e) => setAttribute(e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select attribute...</option>
                {attributeSuggestions.map((attr) => (
                  <option key={attr} value={attr}>
                    {attr}
                  </option>
                ))}
              </select>
            )}
          </div>


          
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Operator</label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {availableOperators.map((op) => (
                <option key={op} value={op}>
                  {op} ({OPERATOR_LABELS[op as keyof typeof OPERATOR_LABELS] || op})
                </option>
              ))}
            </select>
          </div>

          
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Value</label>
            <AutocompleteInput
              type={attributeType === 'numeric' || item.type === 'topology' ? 'number' : 'text'}
              value={String(value)}
              onChange={(newValue) => {
                if (attributeType === 'numeric' || item.type === 'topology') {
                  setValue(newValue === '' ? '' : parseFloat(newValue) || 0);
                } else {
                  setValue(newValue);
                }
              }}
              suggestions={valueSuggestions}
              placeholder="Enter value..."
              className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          
          {operator === 'between' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Upper Value</label>
              <input
                type="number"
                value={value2 || ''}
                onChange={(e) => setValue2(parseFloat(e.target.value) || undefined)}
                placeholder="Upper bound..."
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          
          <div className="flex gap-2 pt-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Save button clicked', { attribute, operator, value, value2, attributeType });
                handleSave();
              }}
              disabled={!attribute || value === '' || value === null || value === undefined}
              type="button"
              className="flex-1 px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
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