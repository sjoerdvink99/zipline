export const formatFOL = (expression: string): string =>
  expression
    .replace(/\band\b/g, '∧')
    .replace(/\bor\b/g, '∨')
    .replace(/\bnot\b/g, '¬')
    .replace(/\bforall\b/g, '∀')
    .replace(/\bexists\b/g, '∃')
    .replace(/>=/g, '≥')
    .replace(/<=/g, '≤')
    .replace(/!=/g, '≠')
    .replace(/\bin\b/g, '∈');

export const createPredicate = (
  type: string,
  attribute: string,
  operator: string,
  value: string | number | boolean,
  value2?: string | number | boolean,
  nodeType?: string,
  variable: string = 'x'
): string => {

  if (!attribute || !operator || (value === undefined || value === null || value === '')) {
    return '';
  }

  if (type === 'topology' || ['degree', 'clustering', 'centrality', 'neighbors'].includes(attribute)) {
    const predicate = `${attribute}(${variable})`;

    if (operator === 'between' && value2 !== undefined) {
      const formattedValue = typeof value === 'number' ? Number(value).toString() : value;
      const formattedValue2 = typeof value2 === 'number' ? Number(value2).toString() : value2;
      return `${formattedValue} ≤ ${predicate} ≤ ${formattedValue2}`;
    }

    const symbol = {
      '=': '=', '!=': '!=', '>=': '>=', '<=': '<=', '>': '>', '<': '<',
      'length_gt': '>', 'length_lt': '<', 'length_eq': '='
    }[operator] || operator;

    const formattedValue = typeof value === 'number' ? Number(value).toString() : value;
    return `${predicate} ${symbol} ${formattedValue}`;
  }

  const predicate = `${variable}.${attribute}`;

  let nodeTypeConstraint = '';
  if (nodeType) {
    nodeTypeConstraint = `${variable}.node_type = "${nodeType}"`;
  }

  if (operator === 'between' && value2 !== undefined) {
    const formattedValue = typeof value === 'number' ? Number(value).toString() : value;
    const formattedValue2 = typeof value2 === 'number' ? Number(value2).toString() : value2;
    const betweenPredicate = `${formattedValue} ≤ ${predicate} ≤ ${formattedValue2}`;
    return nodeTypeConstraint ? `${nodeTypeConstraint} ∧ ${betweenPredicate}` : betweenPredicate;
  }

  const symbol = {
    '=': '=', '!=': '!=', '>=': '>=', '<=': '<=', '>': '>', '<': '<',
    'length_gt': '>', 'length_lt': '<', 'length_eq': '='
  }[operator] || operator;

  let formattedValue;
  if (typeof value === 'string') {
    formattedValue = `"${value}"`;
  } else if (typeof value === 'number') {
    formattedValue = Number(value).toString();
  } else {
    formattedValue = value;
  }

  const attributePredicate = `${predicate} ${symbol} ${formattedValue}`;
  return nodeTypeConstraint ? `${nodeTypeConstraint} ∧ ${attributePredicate}` : attributePredicate;
};

export const createNeighborhood = (
  quantifier: string,
  count: number | undefined,
  relation: string,
  constraint: string,
  variable: string = 'y',
  parentVariable: string = 'x'
): string => {
  if (!constraint || constraint.trim() === '' || constraint === 'undefined') {
    return '';
  }

  const q = quantifier === 'ALL' ? '∀' :
           quantifier === 'SOME' ? '∃' :
           quantifier === 'EXACTLY' ? `EXACTLY(${count})` :
           quantifier === 'AT_LEAST' ? `AT_LEAST(${count})` :
           quantifier === 'AT_MOST' ? `AT_MOST(${count})` :
           quantifier;

  const rel = relation === 'neighbors' ? `neighbors(${parentVariable})` :
             relation === 'k_hop' ? `k_hop(${parentVariable}, ${count || 2})` :
             `connected_components(${parentVariable})`;

  return `${q} ${variable} ∈ ${rel} : ${constraint}`;
};

export const getVariableForLevel = (level: number): string => {
  const variables = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's'];
  return variables[level] || `var${level}`;
};

export const combine = (predicates: string[], operator: 'and' | 'or' = 'and'): string => {
  const validPredicates = predicates.filter(p => p && p.trim() !== '' && p !== 'undefined');

  if (validPredicates.length === 0) return '';
  if (validPredicates.length === 1) return validPredicates[0];

  const symbol = operator === 'and' ? ' ∧ ' : ' ∨ ';
  return validPredicates.join(symbol);
};