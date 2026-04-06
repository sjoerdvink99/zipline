import type { LiteralInfo } from "../api/learning";

export type ChipKind = "type" | "attribute" | "topology" | "lifted" | "neighborhood";

export interface HumanChip {
  kind: ChipKind;
  text: string;
  labelText?: string;
  valueText?: string;
  innerChips?: HumanChip[];
  neighborContext?: string;
}

const TOPOLOGY_NAMES: Record<string, string> = {
  degree: "degree",
  pagerank: "PageRank",
  k_core: "k-core",
  louvain_community: "community",
  clustering_coefficient: "clustering",
  betweenness_centrality: "betweenness",
  closeness_centrality: "closeness",
  component: "component",
};

function formatTopologyMetric(attr: string): string {
  return TOPOLOGY_NAMES[attr] ?? attr.replace(/_/g, " ");
}

function prettifyAttributeName(attr: string): string {
  return attr.replace(/_/g, " ");
}

function formatNumericOperator(op: string): string {
  const map: Record<string, string> = {
    ">=": "≥",
    "<=": "≤",
    "!=": "≠",
    ">": ">",
    "<": "<",
    "=": "=",
  };
  return map[op] ?? op;
}

function formatNumericValue(value: string | number | boolean): string {
  const n = Number(value);
  if (isNaN(n)) return String(value);
  if (Math.abs(n) < 0.01 && n !== 0) return n.toExponential(1);
  if (Number.isInteger(n)) return String(n);
  return n.toPrecision(3).replace(/\.?0+$/, "");
}

function buildQuantifierContext(
  quantifier: string | undefined,
  count: number | undefined,
  kHops: number | undefined,
  pathStr: string | undefined,
): string {
  const hopLabel =
    pathStr
      ? pathStr.replace(".", "→") + " neighbor"
      : kHops && kHops > 1
        ? `${kHops}-hop neighbor`
        : "neighbor";

  const q = quantifier ?? "exists";

  if (q === "exists" || q === "∃") return `has a ${hopLabel} where`;
  if (q === "forall" || q === "∀") return `all ${hopLabel}s where`;
  if (q === "at_least") return `at least ${count ?? 1} ${hopLabel}s where`;
  if (q === "at_most") return `at most ${count ?? 1} ${hopLabel}s where`;
  if (q === "exactly")
    return `exactly ${count ?? 1} ${hopLabel}${count === 1 ? "" : "s"} where`;

  return `has a ${hopLabel} where`;
}

function buildInnerChip(
  attribute: string | undefined,
  rawValue: string | undefined,
): HumanChip | null {
  if (!attribute) return null;

  const isTopology = attribute in TOPOLOGY_NAMES;

  if (!isTopology) {
    const val = rawValue ?? "";
    const isTrue =
      val === "True" || val === "true" || val === "1" || val === "yes";
    const isFalse =
      val === "False" || val === "false" || val === "0" || val === "no";
    if (isTrue) return { kind: "lifted", text: prettifyAttributeName(attribute) };
    if (isFalse)
      return { kind: "lifted", text: `no ${prettifyAttributeName(attribute)}` };
    return {
      kind: "lifted",
      text: `${prettifyAttributeName(attribute)}: ${val}`,
      labelText: prettifyAttributeName(attribute),
      valueText: val,
    };
  }

  const metricName = formatTopologyMetric(attribute);
  const numStr = formatNumericValue(rawValue ?? "0");
  return {
    kind: "topology",
    text: `${metricName} ≥ ${numStr}`,
    labelText: metricName,
    valueText: `≥ ${numStr}`,
  };
}

export function literalToChip(literal: LiteralInfo): HumanChip {
  if (literal.type === "type") {
    return { kind: "type", text: String(literal.value) };
  }

  if (literal.type === "lifted") {
    const attr = prettifyAttributeName(literal.attribute);
    const val = String(literal.value);
    const isTrue =
      val === "True" || val === "true" || val === "1" || val === "yes";
    const isFalse =
      val === "False" || val === "false" || val === "0" || val === "no";
    if (isTrue) return { kind: "lifted", text: attr };
    if (isFalse) return { kind: "lifted", text: `no ${attr}` };
    return { kind: "lifted", text: `${attr}: ${val}`, labelText: attr, valueText: val };
  }

  if (literal.type === "topology") {
    const metric = formatTopologyMetric(literal.attribute);
    const op = formatNumericOperator(literal.operator);
    const val = formatNumericValue(literal.value);
    return {
      kind: "topology",
      text: `${metric} ${op} ${val}`,
      labelText: metric,
      valueText: `${op} ${val}`,
    };
  }

  if (
    literal.type === "attribute" ||
    literal.type === "attribute_eq" ||
    literal.type === "attribute_numeric"
  ) {
    const attr = prettifyAttributeName(literal.attribute);
    const op = literal.operator;
    if (
      literal.type === "attribute_eq" ||
      op === "=" ||
      op === "==" ||
      !op
    ) {
      const val = String(literal.value);
      return {
        kind: "attribute",
        text: `${attr}: "${val}"`,
        labelText: attr,
        valueText: `"${val}"`,
      };
    }
    const val = formatNumericValue(literal.value);
    const fop = formatNumericOperator(op);
    return {
      kind: "attribute",
      text: `${attr} ${fop} ${val}`,
      labelText: attr,
      valueText: `${fop} ${val}`,
    };
  }

  if (literal.type === "neighborhood") {
    const spec = literal.neighborhood_spec;
    const quantifier = spec?.quantifier ?? literal.operator;
    const context = buildQuantifierContext(
      quantifier,
      spec?.count,
      spec?.k_hops,
      spec?.path_str,
    );
    const innerChip = buildInnerChip(
      spec?.base_literal_attribute,
      spec?.base_literal_value != null ? String(spec.base_literal_value) : undefined,
    );
    return {
      kind: "neighborhood",
      text: "",
      neighborContext: context,
      innerChips: innerChip ? [innerChip] : [],
    };
  }

  return { kind: "attribute", text: String(literal.value) };
}
