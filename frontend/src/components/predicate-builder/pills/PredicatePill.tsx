import { useState } from 'react';
import type { FilterItem, SetOperation } from '../../../types/predicate';

interface PredicatePillProps {
  item: FilterItem;
  index: number;
  showOperator: boolean;
  operation?: SetOperation;
  onOperationChange?: (op: SetOperation) => void;
  onRemove: () => void;
  onReorder?: (from: number, to: number) => void;
  onSelect?: () => void;
  isSelected?: boolean;
  isSelectable?: boolean;
  onContextMenu?: (item: FilterItem, position: { x: number; y: number }) => void;
}

const getOperatorSymbol = (op: SetOperation): string => ({
  and: '∧', or: '∨', not: '¬'
})[op];

const formatText = (item: FilterItem): string => {
  if (item.type === 'attribute') {
    const pred = item.predicate;
    let text = `${pred.attribute} ${pred.operator}`;
    if (pred.operator === 'between' && pred.value2 !== undefined) {
      text += ` ${pred.value} and ${pred.value2}`;
    } else {
      text += ` ${pred.value}`;
    }
    return text;
  }

  if (item.type === 'topology') {
    const pred = item.predicate;
    let text = `${pred.attribute} ${pred.operator}`;
    if (pred.operator === 'between' && pred.value2 !== undefined) {
      text += ` ${pred.value} and ${pred.value2}`;
    } else {
      text += ` ${pred.value}`;
    }
    if (pred.node_type) text += ` (${pred.node_type})`;
    return text;
  }

  return item.predicate.expression || item.description;
};

const typeStyles = {
  topology: {
    dot: 'bg-blue-500',
    bg: 'bg-gradient-to-r from-blue-50 to-blue-100/50',
    border: 'border-blue-200 hover:border-blue-300',
    text: 'text-blue-800',
    accent: 'text-blue-600'
  },
  attribute: {
    dot: 'bg-emerald-500',
    bg: 'bg-gradient-to-r from-emerald-50 to-emerald-100/50',
    border: 'border-emerald-200 hover:border-emerald-300',
    text: 'text-emerald-800',
    accent: 'text-emerald-600'
  },
  fol: {
    dot: 'bg-violet-500',
    bg: 'bg-gradient-to-r from-violet-50 to-violet-100/50',
    border: 'border-violet-200 hover:border-violet-300',
    text: 'text-violet-800',
    accent: 'text-violet-600'
  }
};

export function PredicatePill({
  item,
  index,
  showOperator,
  operation = 'and',
  onOperationChange,
  onRemove,
  onReorder,
  onSelect,
  isSelected = false,
  isSelectable = false,
  onContextMenu
}: PredicatePillProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const style = typeStyles[item.type];

  const cycleOperation = () => {
    if (!onOperationChange) return;
    const ops: SetOperation[] = ['and', 'or', 'not'];
    const next = ops[(ops.indexOf(operation) + 1) % ops.length];
    onOperationChange(next);
  };

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('svg, button')) return;

    if (isSelectable && onSelect) {
      onSelect();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();

    if (!onContextMenu || (item.type !== 'topology' && item.type !== 'attribute')) return;

    onContextMenu(item, { x: e.clientX, y: e.clientY });
  };

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `predicate-${index}`);

    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'filter-item',
      filterItem: item,
      index: index
    }));
  };

  const handleDragEnd = () => setIsDragging(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const data = e.dataTransfer.getData('text/plain');
    const match = data.match(/^predicate-(\d+)$/);

    if (match && onReorder) {
      const fromIndex = parseInt(match[1], 10);
      if (fromIndex !== index) {
        onReorder(fromIndex, index);
      }
    }
  };

  return (
    <div className="flex items-center shrink-0">
      {showOperator && (
        <button
          onClick={cycleOperation}
          className="mx-1.5 px-2 py-1 text-sm font-mono font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors border border-slate-200"
        >
          {getOperatorSymbol(operation)}
        </button>
      )}

      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all select-none ${
          onContextMenu && (item.type === 'topology' || item.type === 'attribute')
            ? 'hover:shadow-md hover:scale-105'
            : isSelectable
              ? 'hover:shadow-sm hover:scale-105 active:scale-95'
              : ''
        } ${
          isSelected ? 'ring-2 ring-violet-400 ring-offset-2 bg-violet-50' : ''
        } ${
          isDragging ? 'opacity-50 transform scale-95' :
          isDragOver ? 'border-blue-400 bg-blue-50 shadow-md transform scale-105' :
          `${style.bg} ${style.border}`
        }`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={onContextMenu && (item.type === 'topology' || item.type === 'attribute') ? 'Right-click to edit predicate' : undefined}
        draggable={true}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot} ring-2 ring-white shadow-sm`} />
          <svg className="w-2.5 h-2.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 3h2v2H9zM9 7h2v2H9zM9 11h2v2H9zM9 15h2v2H9zM9 19h2v2H9zM13 3h2v2h-2zM13 7h2v2h-2zM13 11h2v2h-2zM13 15h2v2h-2zM13 19h2v2h-2z" />
          </svg>
        </div>

        <div className="flex flex-col max-w-[140px]">
          <span className={`truncate font-medium text-sm ${style.text}`}>
            {formatText(item)}
          </span>
          {item.nodeTypes && item.nodeTypes.length > 0 && (
            <span className={`text-[10px] ${style.accent} font-medium truncate`}>
              {item.nodeTypes.join(', ')} only
            </span>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors"
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}