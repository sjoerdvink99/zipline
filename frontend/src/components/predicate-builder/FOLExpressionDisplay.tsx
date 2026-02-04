import { useMemo } from "react";
import {
  formatFOLExpression,
  formatPredicateToFOL,
  formatNeighborhoodConstraint,
  combinePredicates,
} from "../../utils/folFormatting";
import type { NeighborhoodConstraint } from "../../types/fol";
import type { NeighborhoodBlock } from "./constraints/NeighborhoodConstraintBlock";

interface FilterItem {
  id: string;
  type: "topology" | "attribute" | "fol";
  predicate: any;
  description: string;
  nodeTypes?: string[];
}

interface FOLExpressionDisplayProps {
  filterItems: FilterItem[];
  setOperations: Record<string, "and" | "or" | "not">;
  neighborhoodConstraints?: NeighborhoodConstraint[] | NeighborhoodBlock[];
  className?: string;
}

function convertNeighborhoodBlocks(
  blocks: (NeighborhoodConstraint | NeighborhoodBlock)[],
): NeighborhoodConstraint[] {
  return blocks.map((block) => {
    if ("constraints" in block && Array.isArray(block.constraints)) {
      return block as NeighborhoodConstraint;
    }

    const neighborhoodBlock = block as NeighborhoodBlock;
    return {
      id: neighborhoodBlock.id,
      targetPredicateIds: neighborhoodBlock.targetPredicateIds,
      targetType: neighborhoodBlock.targetType,
      quantifier: neighborhoodBlock.quantifier,
      count: neighborhoodBlock.count,
      relation: neighborhoodBlock.relation,
      kParameter: neighborhoodBlock.kParameter,
      constraints: [
        {
          id: `${neighborhoodBlock.id}_constraint`,
          type: neighborhoodBlock.constraint.type,
          attribute: neighborhoodBlock.constraint.attribute,
          operator: neighborhoodBlock.constraint.operator,
          value: neighborhoodBlock.constraint.value,
        },
      ],
      resultMode: neighborhoodBlock.resultMode,
      projectionVariable: neighborhoodBlock.projectionVariable,
      level: neighborhoodBlock.level || 0,
      parentConstraintId: neighborhoodBlock.parentConstraintId,
    };
  });
}

export function FOLExpressionDisplay({
  filterItems,
  setOperations,
  neighborhoodConstraints = [],
  className = "",
}: FOLExpressionDisplayProps) {
  const { folExpression, constraintCount } = useMemo(() => {
    if (filterItems.length === 0 && neighborhoodConstraints.length === 0)
      return { folExpression: "", constraintCount: 0 };

    const convertedConstraints = convertNeighborhoodBlocks(
      neighborhoodConstraints,
    );

    const allExpressions: string[] = [];

    if (filterItems.length > 0) {
      const predicateStrings = filterItems.map((item, index) => {
        let predicateStr = "";

        if (item.type === "attribute") {
          const pred = item.predicate;
          predicateStr = formatPredicateToFOL(
            "attribute",
            pred.attribute,
            pred.operator,
            pred.value,
            pred.value2,
            pred.node_type,
          );
        } else if (item.type === "topology") {
          const pred = item.predicate;
          predicateStr = formatPredicateToFOL(
            "topology",
            pred.attribute,
            pred.operator,
            pred.value,
            pred.value2,
            pred.node_type,
          );
        } else if (item.type === "fol") {
          predicateStr = item.predicate.expression || item.description;
        } else {
          predicateStr = item.description;
        }

        const operation = setOperations[item.id] || "and";
        if (index > 0 && operation === "not") {
          predicateStr = `¬(${predicateStr})`;
        }

        return predicateStr;
      });

      const mainOperator = Object.values(setOperations).includes("or")
        ? "or"
        : "and";
      allExpressions.push(combinePredicates(predicateStrings, mainOperator));
    }

    const constraintsByLevel = new Map<number, NeighborhoodConstraint[]>();
    convertedConstraints.forEach((constraint) => {
      const level = constraint.level || 0;
      if (!constraintsByLevel.has(level)) {
        constraintsByLevel.set(level, []);
      }
      constraintsByLevel.get(level)!.push(constraint);
    });

    const sortedLevels = Array.from(constraintsByLevel.keys()).sort(
      (a, b) => a - b,
    );

    for (const level of sortedLevels) {
      const constraintsAtLevel = constraintsByLevel.get(level)!;

      for (const constraint of constraintsAtLevel) {
        let constraintPredicates: string[] = [];

        if (constraint.constraints && constraint.constraints.length > 0) {
          constraintPredicates = constraint.constraints.map((c) =>
            formatPredicateToFOL(c.type, c.attribute, c.operator, c.value),
          );
        }

        if (constraintPredicates.length === 0) continue;

        const combinedConstraints = combinePredicates(
          constraintPredicates,
          "and",
        );

        const variable = String.fromCharCode(121 + level);
        const parentVariable =
          level > 0 ? String.fromCharCode(121 + level - 1) : "x";

        const neighborhoodExpr = formatNeighborhoodConstraint(
          constraint.quantifier,
          constraint.count,
          constraint.relation,
          combinedConstraints,
          variable,
          level,
          parentVariable,
        );

        allExpressions.push(neighborhoodExpr);
      }
    }

    const finalExpression = combinePredicates(allExpressions, "and");
    return {
      folExpression: formatFOLExpression(finalExpression),
      constraintCount: convertedConstraints.length,
    };
  }, [filterItems, setOperations, neighborhoodConstraints]);

  if (!folExpression) return null;

  return (
    <div
      className={`bg-slate-50 border border-slate-200 rounded-lg p-3 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <svg
            className="w-4 h-4 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            FOL Expression
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm text-slate-800 leading-relaxed break-words">
            {folExpression}
          </div>

          <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
            <span>Valid FOL syntax</span>
            <span className="mx-1">•</span>
            <span>
              {filterItems.length} predicate
              {filterItems.length !== 1 ? "s" : ""}, {constraintCount}{" "}
              constraint{constraintCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
