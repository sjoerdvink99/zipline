export function formatFOLExpression(expression: string): string {
  return expression
    .replace(/\band\b/g, "∧")
    .replace(/\bor\b/g, "∨")
    .replace(/\bnot\b/g, "¬")
    .replace(/\bforall\b/g, "∀")
    .replace(/\bexists\b/g, "∃")
    .replace(/\bexactly\b/g, "EXACTLY")
    .replace(/\bat_least\b/g, "AT_LEAST")
    .replace(/\bat_most\b/g, "AT_MOST")
    .replace(/>=/g, "≥")
    .replace(/<=/g, "≤")
    .replace(/!=/g, "≠")
    .replace(/\bin\b/g, "∈");
}

export function formatPredicateToFOL(
  _type: string,
  attribute: string,
  operator: string,
  value: string | number | boolean,
  value2?: string | number | boolean,
  nodeType?: string,
): string {
  const variable = nodeType ? `x:${nodeType}` : "x";
  const predicate = `${attribute}(${variable})`;

  if (operator === "between" && value2 !== undefined) {
    return `${value} ≤ ${predicate} ≤ ${value2}`;
  }

  const opSymbol =
    operator === "="
      ? "="
      : operator === "!="
        ? "≠"
        : operator === ">="
          ? "≥"
          : operator === "<="
            ? "≤"
            : operator;

  return `${predicate} ${opSymbol} ${value}`;
}

export function formatNeighborhoodConstraint(
  quantifier: string,
  count: number | undefined,
  relation: string,
  constraintPredicate: string,
  variable: string = "y",
  level: number = 0,
  parentVariable: string = "x",
): string {
  const quantifierStr =
    quantifier === "ALL"
      ? "∀"
      : quantifier === "SOME"
        ? "∃"
        : quantifier === "EXACTLY"
          ? `EXACTLY(${count})`
          : quantifier === "AT_LEAST"
            ? `AT_LEAST(${count})`
            : quantifier === "AT_MOST"
              ? `AT_MOST(${count})`
              : quantifier;

  const sourceVariable = level > 0 ? parentVariable : "x";

  const relationStr =
    relation === "neighbors"
      ? `neighbors(${sourceVariable})`
      : relation === "k_hop"
        ? `k_hop(${sourceVariable}, ${count || 2})`
        : `connected_components(${sourceVariable})`;

  return `${quantifierStr} ${variable} ∈ ${relationStr} : ${constraintPredicate.replace(/\bx\b/g, variable)}`;
}

export function combinePredicates(
  predicates: string[],
  operator: "and" | "or" = "and",
): string {
  if (predicates.length === 0) return "";
  if (predicates.length === 1) return predicates[0];

  const opSymbol = operator === "and" ? " ∧ " : " ∨ ";
  return predicates.join(opSymbol);
}

export function wrapInParentheses(expression: string): string {
  return `(${expression})`;
}
