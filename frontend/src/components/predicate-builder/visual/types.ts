export type Quantifier = "∀" | "∃" | "exactly" | "at_least" | "at_most";
export type Connective = "∧" | "∨";
export type Comparator = "=" | "!=" | ">" | ">=" | "<" | "<=";

export interface PredicatePill {
  id: string;
  type: "attribute" | "topology" | "type" | "lifted";

  attribute?: string;
  comparator?: Comparator;
  value?: string | number | boolean;

  typeName?: string;

  liftedAttribute?: string;
  liftedValue?: string;

  displayText: string;
  variable: string;
}

export interface PredicateGroup {
  id: string;
  type: "group";
  connective: Connective;
  children: BuilderNode[];
  isNegated: boolean;
}

export interface NeighborhoodBlock {
  id: string;
  type: "neighborhood";

  quantifier: Quantifier;
  count?: number;

  kHops: number;
  typedPath?: string;

  boundVariable: string;
  targetVariable: string;

  targetNodeIds?: string[];

  children: BuilderNode[];
  childConnective: Connective;

  includeInResult: boolean;
}

export type BuilderNode = PredicatePill | PredicateGroup | NeighborhoodBlock;

export interface BuilderState {
  children: BuilderNode[];
  rootConnective: Connective;

  localConnectives: Record<string, Connective>;

  projectedVariables: string[];

  isEvaluating: boolean;
  evaluationResult: EvaluationResult | null;
  errors: string[];
}

export interface EvaluationResult {
  matchingNodes: string[];
  projections?: ProjectionResult[];
  folExpression: string;
  evaluationTimeMs: number;
}

export interface ProjectionResult {
  primaryNode: string;
  projectedVariables: Record<string, string[]>;
}

export function isPill(node: BuilderNode): node is PredicatePill {
  return (
    node.type === "attribute" ||
    node.type === "topology" ||
    node.type === "type" ||
    node.type === "lifted"
  );
}

export function isGroup(node: BuilderNode): node is PredicateGroup {
  return node.type === "group";
}

export function isNeighborhood(node: BuilderNode): node is NeighborhoodBlock {
  return node.type === "neighborhood";
}

let idCounter = 0;
const generateId = () => `node_${Date.now()}_${++idCounter}`;

export function createPill(
  pillType: PredicatePill["type"],
  options: Partial<PredicatePill>,
): PredicatePill {
  const id = generateId();
  const variable = options.variable || "x";

  let displayText = "";

  switch (pillType) {
    case "attribute":
      displayText = `${options.attribute} ${options.comparator} ${options.value}`;
      break;
    case "topology":
      displayText = `${options.attribute} ${options.comparator} ${options.value}`;
      break;
    case "type":
      displayText = options.typeName || "";
      break;
    case "lifted":
      displayText = `${options.liftedAttribute}: ${options.liftedValue}`;
      break;
  }

  return {
    id,
    type: pillType,
    variable,
    displayText,
    ...options,
  };
}

export function createGroup(
  children: BuilderNode[] = [],
  connective: Connective = "∧",
): PredicateGroup {
  return {
    id: generateId(),
    type: "group",
    connective,
    children,
    isNegated: false,
  };
}

export function createNeighborhood(
  targetVariable: string = "x",
  options: Partial<NeighborhoodBlock> = {},
): NeighborhoodBlock {
  const varMap: Record<string, string> = { x: "y", y: "z", z: "w" };
  const boundVariable = varMap[targetVariable] || "y";

  return {
    id: generateId(),
    type: "neighborhood",
    quantifier: "∃",
    kHops: 1,
    boundVariable,
    targetVariable,
    children: [],
    childConnective: "∧",
    includeInResult: false,
    ...options,
  };
}

export function nodeToFOL(node: BuilderNode): string {
  if (isPill(node)) {
    return pillToFOL(node);
  } else if (isGroup(node)) {
    return groupToFOL(node);
  } else if (isNeighborhood(node)) {
    return neighborhoodToFOL(node);
  }
  return "";
}

function pillToFOL(pill: PredicatePill): string {
  const v = pill.variable;

  switch (pill.type) {
    case "type":
      return `${pill.typeName}(${v})`;
    case "lifted":
      return `${pill.liftedAttribute}_${(pill.liftedValue ?? "").replace(/ /g, "_")}(${v})`;
    case "attribute":
    case "topology": {
      const val =
        typeof pill.value === "string" ? `"${pill.value}"` : pill.value;
      return `${pill.attribute}(${v}) ${pill.comparator} ${val}`;
    }
  }
  return "";
}

function groupToFOL(group: PredicateGroup): string {
  if (group.children.length === 0) return "";

  const childExprs = group.children.map(nodeToFOL).filter((e) => e.length > 0);

  if (childExprs.length === 0) return "";
  if (childExprs.length === 1) {
    const expr = childExprs[0];
    return group.isNegated ? `not (${expr})` : expr;
  }

  const connector = group.connective === "∧" ? " and " : " or ";
  const combined = `(${childExprs.join(connector)})`;

  return group.isNegated ? `not ${combined}` : combined;
}

function neighborhoodToFOL(nb: NeighborhoodBlock): string {
  if (nb.children.length === 0) return "";

  let quantifier: string;
  if (nb.quantifier === "∀") {
    quantifier = "forall";
  } else if (nb.quantifier === "∃") {
    quantifier = "exists";
  } else {
    quantifier = `${nb.quantifier}(${nb.count || 1})`;
  }

  const relation = nb.typedPath
    ? `N_{${nb.typedPath}}(${nb.targetVariable})`
    : nb.kHops === 1
      ? `neighbors(${nb.targetVariable})`
      : `N_${nb.kHops}(${nb.targetVariable})`;

  const bodyExprs = nb.children.map(nodeToFOL).filter((e) => e.length > 0);

  if (bodyExprs.length === 0) return "";

  const connector = nb.childConnective === "∧" ? " and " : " or ";
  const body =
    bodyExprs.length === 1 ? bodyExprs[0] : `(${bodyExprs.join(connector)})`;

  return `${quantifier} ${nb.boundVariable} in ${relation} : ${body}`;
}

export function buildFullExpression(state: BuilderState): string {
  if (state.children.length === 0) return "";

  // Root-level neighborhoods that target a sibling's bound variable (e.g. targetVariable="y"
  // when another sibling binds "y") must be embedded inside that sibling's body, otherwise "y"
  // would be a free variable at the root evaluation level.
  const nestedByTarget = new Map<string, NeighborhoodBlock[]>();
  const nestedIds = new Set<string>();
  for (const child of state.children) {
    if (isNeighborhood(child) && child.targetVariable !== "x") {
      const arr = nestedByTarget.get(child.targetVariable) ?? [];
      arr.push(child);
      nestedByTarget.set(child.targetVariable, arr);
      nestedIds.add(child.id);
    }
  }

  // Build FOL for a neighborhood, injecting sibling neighborhoods that reference its bound var.
  // Recursively handles chains (A binds y, B targets y and binds z, C targets z).
  function buildWithInjected(nb: NeighborhoodBlock): string {
    const ownBodyExprs = nb.children.map(nodeToFOL).filter((e) => e.length > 0);
    const injectedExprs = (nestedByTarget.get(nb.boundVariable) ?? [])
      .map(buildWithInjected)
      .filter((e) => e.length > 0);

    const allParts: string[] = [];
    if (ownBodyExprs.length === 1) {
      allParts.push(ownBodyExprs[0]);
    } else if (ownBodyExprs.length > 1) {
      const ownConnector = nb.childConnective === "∧" ? " and " : " or ";
      allParts.push(`(${ownBodyExprs.join(ownConnector)})`);
    }
    allParts.push(...injectedExprs);

    if (allParts.length === 0) return "";

    let quantifier: string;
    if (nb.quantifier === "∀") quantifier = "forall";
    else if (nb.quantifier === "∃") quantifier = "exists";
    else quantifier = `${nb.quantifier}(${nb.count || 1})`;

    const relation = nb.typedPath
      ? `N_{${nb.typedPath}}(${nb.targetVariable})`
      : nb.kHops === 1
        ? `neighbors(${nb.targetVariable})`
        : `N_${nb.kHops}(${nb.targetVariable})`;

    const body =
      allParts.length === 1 ? allParts[0] : `(${allParts.join(" and ")})`;
    return `${quantifier} ${nb.boundVariable} in ${relation} : ${body}`;
  }

  // Build root-level expression; skip nested neighborhoods (they're embedded above)
  const rootItems = state.children.filter((c) => !nestedIds.has(c.id));
  const pairs = rootItems
    .map((c) => ({
      expr: isNeighborhood(c) ? buildWithInjected(c) : nodeToFOL(c),
      nodeId: c.id,
    }))
    .filter((p) => p.expr.length > 0);

  if (pairs.length === 0) return "";
  if (pairs.length === 1) return pairs[0].expr;

  let result = pairs[0].expr;
  for (let i = 1; i < pairs.length; i++) {
    const connective =
      state.localConnectives[pairs[i].nodeId] ?? state.rootConnective;
    const connector = connective === "∧" ? " and " : " or ";
    result = `${result}${connector}${pairs[i].expr}`;
  }

  return result;
}

export function buildSetComprehension(state: BuilderState): string {
  const predicate = buildFullExpression(state);
  if (!predicate) return "";

  const vars = state.projectedVariables;
  if (vars.length === 0 || vars.length === 1) {
    return predicate;
  }

  const varStr = `(${vars.join(", ")})`;
  return `{ ${varStr} | ${predicate} }`;
}

export function collectVariables(nodes: BuilderNode[]): string[] {
  const vars = new Set<string>(["x"]);

  function traverse(node: BuilderNode) {
    if (isPill(node)) {
      vars.add(node.variable);
    } else if (isGroup(node)) {
      node.children.forEach(traverse);
    } else if (isNeighborhood(node)) {
      vars.add(node.boundVariable);
      node.children.forEach(traverse);
    }
  }

  nodes.forEach(traverse);
  return Array.from(vars).sort();
}

function arePillsEquivalent(a: PredicatePill, b: PredicatePill): boolean {
  if (a.type !== b.type) return false;
  if (a.variable !== b.variable) return false;

  switch (a.type) {
    case "type":
      return a.typeName === b.typeName;
    case "lifted":
      return (
        a.liftedAttribute === b.liftedAttribute &&
        a.liftedValue === b.liftedValue
      );
    case "attribute":
    case "topology":
      return (
        a.attribute === b.attribute &&
        a.comparator === b.comparator &&
        a.value === b.value
      );
  }
}

function areGroupsEquivalent(a: PredicateGroup, b: PredicateGroup): boolean {
  if (a.connective !== b.connective) return false;
  if (a.isNegated !== b.isNegated) return false;
  if (a.children.length !== b.children.length) return false;

  const bMatched = new Set<number>();
  for (const aChild of a.children) {
    let foundMatch = false;
    for (let i = 0; i < b.children.length; i++) {
      if (bMatched.has(i)) continue;
      if (areNodesEquivalent(aChild, b.children[i])) {
        bMatched.add(i);
        foundMatch = true;
        break;
      }
    }
    if (!foundMatch) return false;
  }
  return true;
}

function areNeighborhoodsEquivalent(
  a: NeighborhoodBlock,
  b: NeighborhoodBlock,
): boolean {
  if (a.quantifier !== b.quantifier) return false;
  if (a.count !== b.count) return false;
  if (a.kHops !== b.kHops) return false;
  if (a.typedPath !== b.typedPath) return false;
  if (a.boundVariable !== b.boundVariable) return false;
  if (a.targetVariable !== b.targetVariable) return false;
  if (a.childConnective !== b.childConnective) return false;
  if (a.children.length !== b.children.length) return false;

  const bMatched = new Set<number>();
  for (const aChild of a.children) {
    let foundMatch = false;
    for (let i = 0; i < b.children.length; i++) {
      if (bMatched.has(i)) continue;
      if (areNodesEquivalent(aChild, b.children[i])) {
        bMatched.add(i);
        foundMatch = true;
        break;
      }
    }
    if (!foundMatch) return false;
  }
  return true;
}

export function areNodesEquivalent(a: BuilderNode, b: BuilderNode): boolean {
  if (isPill(a) && isPill(b)) {
    return arePillsEquivalent(a, b);
  }
  if (isGroup(a) && isGroup(b)) {
    return areGroupsEquivalent(a, b);
  }
  if (isNeighborhood(a) && isNeighborhood(b)) {
    return areNeighborhoodsEquivalent(a, b);
  }
  return false;
}

export function containsEquivalentNode(
  nodes: BuilderNode[],
  target: BuilderNode,
): boolean {
  for (const node of nodes) {
    if (areNodesEquivalent(node, target)) {
      return true;
    }
    if (isGroup(node) && containsEquivalentNode(node.children, target)) {
      return true;
    }
    if (isNeighborhood(node) && containsEquivalentNode(node.children, target)) {
      return true;
    }
  }
  return false;
}
