import { useMemo } from 'react';
import { formatFOL, createPredicate, createNeighborhood, combine, getVariableForLevel } from '../../utils/fol';
import type { FilterItem, SetOperation, NeighborhoodConstraint } from '../../types/predicate';

interface FOLDisplayProps {
  predicates: FilterItem[];
  operations: Record<string, SetOperation>;
  constraints?: NeighborhoodConstraint[];
  isValid?: boolean;
}

export function FOLDisplay({ predicates, operations, constraints = [], isValid = true }: FOLDisplayProps) {
  const expression = useMemo(() => {
    if (predicates.length === 0 && constraints.length === 0) return '';

    const predicateStrings = predicates.map((item, index) => {
      let str = '';

      if (item.type === 'attribute') {
        const pred = item.predicate;
        str = createPredicate('attribute', pred.attribute, pred.operator, pred.value, pred.value2, pred.node_type);
      } else if (item.type === 'topology') {
        const pred = item.predicate;
        str = createPredicate('topology', pred.attribute, pred.operator, pred.value, pred.value2, pred.node_type);
      } else {
        str = item.predicate.expression || item.description;
      }

      const op = operations[item.id] || 'and';
      if (index > 0 && op === 'not') {
        str = `¬(${str})`;
      }

      return str;
    });

    function generateNeighborhoodConstraint(constraint: NeighborhoodConstraint): string {
      const currentVariable = getVariableForLevel(constraint.level);
      const parentVariable = constraint.level > 0 ? getVariableForLevel(constraint.level - 1) : 'x';

      const constraintExpressions = constraint.constraints.map((c) => {
        return createPredicate('attribute', c.attribute, c.operator, c.value, undefined, undefined, currentVariable);
      });

      let constraintExpression = constraintExpressions.length > 1
        ? combine(constraintExpressions, constraint.constraints[0]?.combineOp || 'and')
        : constraintExpressions[0];

      if (constraint.nestedConstraints && constraint.nestedConstraints.length > 0) {
        const nestedExpressions = constraint.nestedConstraints.map(generateNeighborhoodConstraint);
        constraintExpression = constraintExpression
          ? combine([constraintExpression, ...nestedExpressions], 'and')
          : combine(nestedExpressions, 'and');
      }

      return createNeighborhood(
        constraint.quantifier,
        constraint.count,
        constraint.relation,
        constraintExpression,
        currentVariable,
        parentVariable
      );
    }

    // Process all constraints. Handle both independent constraints and true nesting.
    // If constraints have parentConstraintId but no nestedConstraints reference, treat them as separate
    const processedConstraints = new Set<string>();
    const constraintStrings: string[] = [];

    constraints.forEach(constraint => {
      if (processedConstraints.has(constraint.id)) return;

      // Check if this constraint is referenced as a nested constraint by another
      const isReferencedAsNested = constraints.some(c =>
        c.nestedConstraints && c.nestedConstraints.some(nc => nc.id === constraint.id)
      );

      // If not referenced as nested, process it as a standalone constraint
      if (!isReferencedAsNested) {
        const constraintStr = generateNeighborhoodConstraint(constraint);
        if (constraintStr && constraintStr.trim() !== '') {
          constraintStrings.push(constraintStr);
        }
        processedConstraints.add(constraint.id);
      }
    });

    const allExpressions = [...predicateStrings, ...constraintStrings];
    if (allExpressions.length === 0) return '';

    const hasOr = Object.values(operations).includes('or');
    return formatFOL(combine(allExpressions, hasOr ? 'or' : 'and'));
  }, [predicates, operations, constraints]);

  if (!expression) return null;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">FOL Expression</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm text-slate-800 leading-relaxed break-words">
            {expression}
          </div>

          <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
            <div className={`w-1.5 h-1.5 rounded-full ${isValid ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span>{isValid ? 'Valid' : 'Invalid'} FOL syntax</span>
            <span className="mx-1">•</span>
            <span>{predicates.length} predicate{predicates.length !== 1 ? 's' : ''}{constraints.length > 0 ? `, ${constraints.length} constraint${constraints.length !== 1 ? 's' : ''}` : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}