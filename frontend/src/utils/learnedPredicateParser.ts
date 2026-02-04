import { createPill, createGroup, createNeighborhood } from "../components/predicate-builder/visual/types";
import type {
  PredicatePill,
  BuilderNode,
  NeighborhoodBlock,
  Comparator
} from "../components/predicate-builder/visual/types";

interface ParsedExpression {
  nodes: BuilderNode[];
  connective: "∧" | "∨";
}

const TOPOLOGY_ATTRIBUTES = new Set([
  'degree', 'k_core', 'pagerank', 'betweenness_centrality',
  'closeness_centrality', 'clustering_coefficient', 'louvain_community', 'component'
]);

const LIFTED_PREFIXES = new Set([
  'tactics', 'platforms', 'domains', 'aliases', 'techniques',
  'procedures', 'mitigations', 'data_sources', 'kill_chain_phases'
]);

const PATTERNS = {
  ATTRIBUTE: /^(\w+)\(([x-z])\)\s*(>=|<=|!=|=|>|<)\s*(.+)$/,
  TYPE: /^(\w+)\(([x-z])\)$/,
  LIFTED: /^(\w+)_(\w+)\(([x-z])\)$/,
  NEIGHBORHOOD_EXISTS: /^∃([x-z])\s*∈\s*(neighbors|N_\{([^}]+)\}|N_(\d+))\(([x-z])\)\s*:\s*(.+)$/,
  NEIGHBORHOOD_FORALL: /^∀([x-z])\s*∈\s*(neighbors|N_\{([^}]+)\}|N_(\d+))\(([x-z])\)\s*:\s*(.+)$/,
  CARDINALITY: /^\|\{([x-z])\s*∈\s*(neighbors|N_\{([^}]+)\}|N_(\d+))\(([x-z])\)\s*\|\s*(.+)\}\|\s*(≥|≤|>=|<=|=|>|<)\s*(\d+)$/,
  AND: /\s+and\s+/,
  OR: /\s+or\s+/,
  UNICODE_AND: /\s*∧\s*/,
  UNICODE_OR: /\s*∨\s*/
};

function parseValue(valueStr: string): string | number | boolean {
  const trimmed = valueStr.trim();

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === 'true' || trimmed === 'false') {
    return trimmed === 'true';
  }

  const num = Number(trimmed);
  if (!isNaN(num) && isFinite(num)) {
    return num;
  }

  return trimmed;
}

function parsePredicate(expr: string): PredicatePill | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  let match = trimmed.match(PATTERNS.ATTRIBUTE);
  if (match) {
    const [, attribute, variable, operator, valueStr] = match;
    const value = parseValue(valueStr);
    const isTopology = TOPOLOGY_ATTRIBUTES.has(attribute);

    return createPill(isTopology ? "topology" : "attribute", {
      variable,
      attribute,
      comparator: operator as Comparator,
      value
    });
  }

  match = trimmed.match(PATTERNS.LIFTED);
  if (match) {
    const [, liftedAttribute, liftedValue, variable] = match;
    return createPill("lifted", {
      variable,
      liftedAttribute,
      liftedValue
    });
  }

  match = trimmed.match(PATTERNS.TYPE);
  if (match) {
    const [, typeName, variable] = match;

    if (typeName.includes('_')) {
      const prefix = typeName.split('_')[0];
      if (LIFTED_PREFIXES.has(prefix)) {
        const lastUnderscoreIndex = typeName.lastIndexOf('_');
        const liftedAttribute = typeName.substring(0, lastUnderscoreIndex);
        const liftedValue = typeName.substring(lastUnderscoreIndex + 1);

        return createPill("lifted", {
          variable,
          liftedAttribute,
          liftedValue
        });
      }
    }

    return createPill("type", { variable, typeName });
  }

  return null;
}

function parseNeighborhood(expr: string): NeighborhoodBlock | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  let match = trimmed.match(PATTERNS.NEIGHBORHOOD_EXISTS);
  if (match) {
    const [, boundVar, , typedPath, kHopsStr, targetVar, bodyExpr] = match;
    const kHops = kHopsStr ? Math.max(1, parseInt(kHopsStr)) : 1;

    const innerPill = parsePredicate(bodyExpr);
    if (!innerPill) return null;

    innerPill.variable = boundVar;

    const neighborhood = createNeighborhood(targetVar, {
      quantifier: "∃",
      kHops: typedPath ? 2 : kHops,
      typedPath: typedPath || undefined,
      boundVariable: boundVar,
      children: [innerPill]
    });

    return neighborhood;
  }

  match = trimmed.match(PATTERNS.NEIGHBORHOOD_FORALL);
  if (match) {
    const [, boundVar, , typedPath, kHopsStr, targetVar, bodyExpr] = match;
    const kHops = kHopsStr ? Math.max(1, parseInt(kHopsStr)) : 1;

    const innerPill = parsePredicate(bodyExpr);
    if (!innerPill) return null;

    innerPill.variable = boundVar;

    const neighborhood = createNeighborhood(targetVar, {
      quantifier: "∀",
      kHops: typedPath ? 2 : kHops,
      typedPath: typedPath || undefined,
      boundVariable: boundVar,
      children: [innerPill]
    });

    return neighborhood;
  }

  match = trimmed.match(PATTERNS.CARDINALITY);
  if (match) {
    const [, boundVar, , typedPath, kHopsStr, targetVar, bodyExpr, operator, countStr] = match;
    const kHops = kHopsStr ? Math.max(1, parseInt(kHopsStr)) : 1;
    const count = Math.max(0, parseInt(countStr));

    if (isNaN(count)) return null;

    const innerPill = parsePredicate(bodyExpr);
    if (!innerPill) return null;

    innerPill.variable = boundVar;

    let quantifier: "at_least" | "at_most" | "exactly";
    if (operator === ">=" || operator === ">" || operator === "≥") {
      quantifier = "at_least";
    } else if (operator === "<=" || operator === "<" || operator === "≤") {
      quantifier = "at_most";
    } else if (operator === "=") {
      quantifier = "exactly";
    } else {
      return null;
    }

    const neighborhood = createNeighborhood(targetVar, {
      quantifier,
      kHops: typedPath ? 2 : kHops,
      typedPath: typedPath || undefined,
      boundVariable: boundVar,
      count,
      children: [innerPill]
    });

    return neighborhood;
  }

  return null;
}

function splitByConnectives(expr: string): { parts: string[], connective: "∧" | "∨" } {
  if (PATTERNS.UNICODE_AND.test(expr)) {
    return {
      parts: expr.split(PATTERNS.UNICODE_AND).map(s => s.trim()).filter(Boolean),
      connective: "∧"
    };
  }
  if (PATTERNS.UNICODE_OR.test(expr)) {
    return {
      parts: expr.split(PATTERNS.UNICODE_OR).map(s => s.trim()).filter(Boolean),
      connective: "∨"
    };
  }
  if (PATTERNS.AND.test(expr)) {
    return {
      parts: expr.split(PATTERNS.AND).map(s => s.trim()).filter(Boolean),
      connective: "∧"
    };
  }
  if (PATTERNS.OR.test(expr)) {
    return {
      parts: expr.split(PATTERNS.OR).map(s => s.trim()).filter(Boolean),
      connective: "∨"
    };
  }

  return { parts: [expr], connective: "∧" };
}

export function parseLearnedExpression(folExpression: string): ParsedExpression {
  const expr = folExpression.trim();
  if (!expr) return { nodes: [], connective: "∧" };

  const { parts, connective } = splitByConnectives(expr);
  const nodes: BuilderNode[] = [];

  for (const part of parts) {
    if (!part) continue;

    const neighborhood = parseNeighborhood(part);
    if (neighborhood) {
      nodes.push(neighborhood);
      continue;
    }

    const predicate = parsePredicate(part);
    if (predicate) {
      nodes.push(predicate);
      continue;
    }
  }

  return { nodes, connective };
}

export function convertLearnedToBuilderNodes(
  learnedPredicate: unknown
): { nodes: BuilderNode[], rootConnective: "∧" | "∨" } {
  if (!learnedPredicate || typeof learnedPredicate !== 'object') {
    return { nodes: [], rootConnective: "∧" };
  }

  const predicate = learnedPredicate as Record<string, unknown>;

  if (predicate.is_disjunction && Array.isArray(predicate.clauses) && predicate.clauses.length > 1) {
    const clauseNodes: BuilderNode[] = [];

    for (const clause of predicate.clauses) {
      if (!clause || typeof clause !== 'object') continue;

      const clauseObj = clause as Record<string, unknown>;
      let clauseExpr = '';

      if (typeof clauseObj.fol_expression === 'string') {
        clauseExpr = clauseObj.fol_expression;
      } else if (Array.isArray(clause)) {
        clauseExpr = clause
          .map((lit: unknown) => {
            if (lit && typeof lit === 'object' && 'attribute' in lit) {
              return String((lit as { attribute: unknown }).attribute);
            }
            return '';
          })
          .filter(Boolean)
          .join(' and ');
      }

      if (!clauseExpr) continue;

      const parsed = parseLearnedExpression(clauseExpr);
      if (parsed.nodes.length === 1) {
        clauseNodes.push(parsed.nodes[0]);
      } else if (parsed.nodes.length > 1) {
        clauseNodes.push(createGroup(parsed.nodes, parsed.connective));
      }
    }

    return { nodes: clauseNodes, rootConnective: "∨" };
  }

  const folExpr = typeof predicate.fol_expression === 'string'
    ? predicate.fol_expression
    : '';

  const parsed = parseLearnedExpression(folExpr);
  return { nodes: parsed.nodes, rootConnective: parsed.connective };
}