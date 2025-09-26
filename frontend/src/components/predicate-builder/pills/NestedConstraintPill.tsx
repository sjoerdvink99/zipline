import { useState } from 'react';
import type { ConstraintItem, SetOperation } from '../../../types/predicate';

interface NestedConstraintPillProps {
  constraint: ConstraintItem;
  index: number;
  showOperator: boolean;
  operation?: SetOperation;
  onOperationChange?: (op: SetOperation) => void;
  onRemove: () => void;
  onReorder?: (from: number, to: number) => void;
  onEdit?: (constraint: ConstraintItem) => void;
  isDraggable?: boolean;
  isDropZone?: boolean;
  onPillDrop?: (draggedItem: any, targetIndex: number) => void;
}

const getOperatorSymbol = (op: SetOperation): string => ({
  and: '∧', or: '∨', not: '¬'
})[op];

const formatConstraintText = (constraint: ConstraintItem): string => {
  if (constraint.displayText) {
    return constraint.displayText;
  }

  let text = `${constraint.attribute} ${constraint.operator}`;
  if (constraint.operator === 'between' && (constraint.value as any)?.value2 !== undefined) {
    text += ` ${constraint.value} and ${(constraint.value as any).value2}`;
  } else {
    text += ` ${constraint.value}`;
  }
  return text;
};

const typeStyles = {
  attribute: {
    dot: 'bg-emerald-400',
    bg: 'bg-gradient-to-r from-emerald-50 to-emerald-100/50',
    border: 'border-emerald-200 hover:border-emerald-300',
    text: 'text-emerald-700',
    accent: 'text-emerald-500'
  },
  topology: {
    dot: 'bg-blue-400',
    bg: 'bg-gradient-to-r from-blue-50 to-blue-100/50',
    border: 'border-blue-200 hover:border-blue-300',
    text: 'text-blue-700',
    accent: 'text-blue-500'
  },
  nested_pill: {
    dot: 'bg-violet-400',
    bg: 'bg-gradient-to-r from-violet-50 to-violet-100/50',
    border: 'border-violet-200 hover:border-violet-300',
    text: 'text-violet-700',
    accent: 'text-violet-500'
  }
};

export function NestedConstraintPill({
  constraint,
  index,
  showOperator,
  operation = 'and',
  onOperationChange,
  onRemove,
  onReorder,
  onEdit,
  isDraggable = true,
  isDropZone = true,
  onPillDrop
}: NestedConstraintPillProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const style = typeStyles[constraint.type as keyof typeof typeStyles] || typeStyles.attribute;

  const cycleOperation = () => {
    if (!onOperationChange) return;
    const ops: SetOperation[] = ['and', 'or', 'not'];
    const next = ops[(ops.indexOf(operation) + 1) % ops.length];
    onOperationChange(next);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!isDraggable) return;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `nested-constraint-${index}`);
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'nested-constraint',
      constraint: constraint,
      index: index
    }));
  };

  const handleDragEnd = () => setIsDragging(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (!isDropZone) return;

    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');

    if (data.startsWith('predicate-') || data.startsWith('nested-constraint-')) {
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
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

    const textData = e.dataTransfer.getData('text/plain');
    const jsonData = e.dataTransfer.getData('application/json');

    try {
      if (jsonData && onPillDrop) {
        const draggedItem = JSON.parse(jsonData);
        onPillDrop(draggedItem, index);
        return;
      }
    } catch (error) {
      console.warn('Failed to parse drag data:', error);
    }

    const match = textData.match(/^nested-constraint-(\d+)$/);
    if (match && onReorder) {
      const fromIndex = parseInt(match[1], 10);
      if (fromIndex !== index) {
        onReorder(fromIndex, index);
      }
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(constraint);
    }
  };

  return (
    <div className="flex items-center shrink-0">
      {showOperator && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            cycleOperation();
          }}
          className="mx-1 px-1.5 py-0.5 text-xs font-mono font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors border border-slate-200"
        >
          {getOperatorSymbol(operation)}
        </button>
      )}

      <div
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-all select-none cursor-pointer ${
          isDragging ? 'opacity-50 transform scale-95' :
          isDragOver ? 'border-blue-400 bg-blue-50 shadow-md transform scale-105' :
          `${style.bg} ${style.border}`
        }`}
        onClick={handleEdit}
        title="Click to edit constraint"
        draggable={isDraggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot} ring-1 ring-white shadow-sm`} />
          {isDraggable && (
            <svg className="w-2 h-2 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 3h2v2H9zM9 7h2v2H9zM9 11h2v2H9zM9 15h2v2H9zM9 19h2v2H9zM13 3h2v2h-2zM13 7h2v2h-2zM13 11h2v2h-2zM13 15h2v2h-2zM13 19h2v2h-2z" />
            </svg>
          )}
        </div>

        <span className={`truncate font-medium max-w-[120px] ${style.text}`}>
          {formatConstraintText(constraint)}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors"
        >
          <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}