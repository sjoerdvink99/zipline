import type { Comparator, Connective, Quantifier } from "../types/fol";

export const formatFOL = (expression: string): string =>
  expression
    .replace(/\band\b/gi, "∧")
    .replace(/\bor\b/gi, "∨")
    .replace(/\bnot\b/gi, "¬")
    .replace(/\bforall\b/gi, "∀")
    .replace(/\bexists\b/gi, "∃")
    .replace(/>=/g, "≥")
    .replace(/<=/g, "≤")
    .replace(/!=/g, "≠")
    .replace(/\bin\b/gi, "∈");

export const toAscii = (expression: string): string =>
  expression
    .replace(/∧/g, "and")
    .replace(/∨/g, "or")
    .replace(/¬/g, "not")
    .replace(/∀/g, "forall")
    .replace(/∃/g, "exists")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/≠/g, "!=")
    .replace(/∈/g, "in");

export const createTypePredicate = (typeName: string, variable = "x"): string =>
  `${typeName}(${variable})`;

export const createUnaryPredicate = (name: string, variable = "x"): string =>
  `${name}(${variable})`;

export const createComparisonPredicate = (
  attribute: string,
  comparator: Comparator,
  value: string | number | boolean,
  variable = "x",
): string => {
  const formattedValue =
    typeof value === "string" ? `"${value}"` : String(value);
  return `${attribute}(${variable}) ${comparator} ${formattedValue}`;
};

export const createTopologyPredicate = (
  metric: string,
  comparator: Comparator,
  value: number | string,
  variable = "x",
): string =>
  `${metric}(${variable}) ${comparator} ${typeof value === "string" ? `"${value}"` : value}`;

export const createNeighborhoodQuantification = (
  quantifier: Quantifier,
  boundVariable: string,
  targetVariable: string,
  k: number,
  body: string,
  count?: number,
  path?: Array<{ edgeType: string }>,
): string => {
  if (!body || body.trim() === "") return "";

  let q: string;
  if (quantifier === "∀" || quantifier === "∃") {
    q = quantifier;
  } else {
    q = `${quantifier}(${count})`;
  }

  let rel: string;
  if (path && path.length > 0) {
    const pathStr = path.map((s) => s.edgeType).join(".");
    rel = `N_{${pathStr}}(${targetVariable})`;
  } else {
    rel =
      k === 1 ? `neighbors(${targetVariable})` : `N_${k}(${targetVariable})`;
  }

  return `${q}${boundVariable} ∈ ${rel} : ${body}`;
};

export const createConjunction = (operands: string[], wrap = false): string => {
  const valid = operands.filter((o) => o && o.trim() !== "");
  if (valid.length === 0) return "";
  if (valid.length === 1) return valid[0];

  const result = valid.join(" ∧ ");
  return wrap ? `(${result})` : result;
};

export const createDisjunction = (operands: string[], wrap = false): string => {
  const valid = operands.filter((o) => o && o.trim() !== "");
  if (valid.length === 0) return "";
  if (valid.length === 1) return valid[0];

  const result = valid.join(" ∨ ");
  return wrap ? `(${result})` : result;
};

export const createNegation = (operand: string): string => {
  if (!operand || operand.trim() === "") return "";
  const needsParens = operand.includes("∧") || operand.includes("∨");
  return needsParens ? `¬(${operand})` : `¬${operand}`;
};

export const createResultStructure = (
  variables: string[],
  predicate: string,
): string => {
  if (variables.length === 1) {
    return `{ ${variables[0]} | ${predicate} }`;
  }
  return `{ (${variables.join(", ")}) | ${predicate} }`;
};

export const getVariableForLevel = (level: number): string => {
  const variables = ["x", "y", "z", "w", "v", "u", "t", "s"];
  return variables[level] || `var${level}`;
};

export const combine = (
  predicates: string[],
  connective: Connective | "and" | "or" = "∧",
): string => {
  const valid = predicates.filter((p) => p && p.trim() !== "");
  if (valid.length === 0) return "";
  if (valid.length === 1) return valid[0];

  if (connective === "¬") {
    return createNegation(valid[0]);
  }

  const symbol = connective === "∧" || connective === "and" ? " ∧ " : " ∨ ";
  return valid.join(symbol);
};

export const wrapInBrackets = (expression: string): string =>
  expression ? `(${expression})` : "";

export const createPredicate = (
  type: string,
  attribute: string,
  operator: string,
  value: string | number | boolean,
  value2OrVariable?: string | number | boolean,
  nodeType?: string,
  variable: string = "x",
): string => {
  if (!attribute || value === undefined || value === null || value === "") {
    return "";
  }

  const actualVariable =
    typeof value2OrVariable === "string" &&
    !nodeType &&
    value2OrVariable.length === 1
      ? value2OrVariable
      : variable;
  const isTopology =
    type === "topology" ||
    ["degree", "clustering", "centrality"].includes(attribute);

  if (isTopology) {
    return createTopologyPredicate(
      attribute,
      operator as Comparator,
      Number(value),
      actualVariable,
    );
  }

  if (operator === "=") {
    if (typeof value === "boolean") {
      return value
        ? createUnaryPredicate(attribute, actualVariable)
        : createNegation(createUnaryPredicate(attribute, actualVariable));
    }
    return createComparisonPredicate(attribute, "=", value, actualVariable);
  }

  return createComparisonPredicate(
    attribute,
    operator as Comparator,
    value,
    actualVariable,
  );
};

export const createNeighborhood = (
  quantifier: string,
  count: number | undefined,
  relation: string,
  constraint: string,
  variable = "y",
  parentVariable = "x",
): string => {
  if (!constraint || constraint.trim() === "") return "";

  const q =
    quantifier === "ALL"
      ? "∀"
      : quantifier === "SOME"
        ? "∃"
        : (quantifier as Quantifier);

  const k = relation === "k_hop" ? count || 2 : 1;

  return createNeighborhoodQuantification(
    q,
    variable,
    parentVariable,
    k,
    constraint,
    count,
  );
};
