export const PIN_COLORS = [
  { pixi: 0x14b8a6, tw: "teal" },
  { pixi: 0xf43f5e, tw: "rose" },
  { pixi: 0xf97316, tw: "orange" },
  { pixi: 0x6366f1, tw: "indigo" },
] as const;

export const PIXI_COLORS = {
  BLUE: 0x3b82f6,
  BG: 0xf9fafb,
  NEUTRAL_GREY: 0x9ca3af,
  HOVER_ORANGE: 0xf97316,
  PATH_COLOR: 0x8b5cf6,
  CONTRAST_AMBER: 0xf59e0b,
} as const;

export const NODE_TYPE_COLORS = {
  technique: 0xef4444,
  threat_actor: 0x8b5cf6,
  malware: 0xf59e0b,
  mitigation: 0x10b981,
  vulnerability: 0xdc2626,

  apt_group: 0x8b5cf6,
  campaign: 0xec4899,
  tool: 0x06b6d4,

  protein: 0x3b82f6,
  gene: 0x06b6d4,
  "gene/protein": 0x3b82f6,
  bridge_gene: 0xf59e0b,
  drug_target: 0x06b6d4,
  disease_gene: 0xa855f7,
  disease: 0xef4444,
  drug: 0x10b981,
  compound: 0xf59e0b,
  "effect/phenotype": 0xec4899,

  anatomy: 0xa855f7,
  biological_process: 0x22c55e,
  cellular_component: 0x0ea5e9,
  exposure: 0xf97316,
  molecular_function: 0x84cc16,
  pathway: 0x6366f1,

  substation: 0x6b7280,
  generator: 0x10b981,
  storage: 0xf59e0b,
  load: 0xef4444,
  transmission_line: 0x3b82f6,
  control_device: 0xa78bfa,

  wind_turbine: 0x22c55e,
  solar_park: 0xeab308,
  gas_junction: 0xf97316,

// CORA citation network — one colour per research category
  neural_networks: 0x3b82f6,
  genetic_algorithms: 0x10b981,
  probabilistic_methods: 0xa855f7,
  theory: 0xf59e0b,
  case_based: 0xef4444,
  reinforcement_learning: 0xec4899,
  rule_learning: 0x06b6d4,

  default: 0x9ca3af,
} as const;

interface NodeData {
  node_type?: string;
  type?: string;
  label?: string;
}

export function getNodeType(
  label: string = "",
  nodeData?: NodeData,
): keyof typeof NODE_TYPE_COLORS {
  const lowerLabel = label.toLowerCase();

  if (nodeData?.node_type) {
    const type = nodeData.node_type.toLowerCase();
    if (type in NODE_TYPE_COLORS) {
      return type as keyof typeof NODE_TYPE_COLORS;
    }
  }

  if (nodeData?.type) {
    const type = nodeData.type.toLowerCase();
    if (type in NODE_TYPE_COLORS) {
      return type as keyof typeof NODE_TYPE_COLORS;
    }
  }

  if (
    lowerLabel.includes("technique") ||
    lowerLabel.includes("t1") ||
    lowerLabel.includes("attack")
  ) {
    return "technique";
  }
  if (
    lowerLabel.includes("apt") ||
    lowerLabel.includes("actor") ||
    lowerLabel.includes("group")
  ) {
    return "threat_actor";
  }
  if (
    lowerLabel.includes("malware") ||
    lowerLabel.includes("tool") ||
    lowerLabel.includes("trojan")
  ) {
    return "malware";
  }
  if (lowerLabel.includes("mitigation") || lowerLabel.includes("m1")) {
    return "mitigation";
  }
  if (lowerLabel.includes("cve-") || lowerLabel.includes("vulnerability")) {
    return "vulnerability";
  }

  if (lowerLabel.includes("protein")) {
    return "protein";
  }
  if (lowerLabel.includes("gene")) {
    return "gene";
  }
  if (lowerLabel.includes("disease")) {
    return "disease";
  }
  if (lowerLabel.includes("drug")) {
    return "drug";
  }
  if (lowerLabel.includes("compound")) {
    return "compound";
  }
  if (lowerLabel.includes("effect") || lowerLabel.includes("phenotype")) {
    return "effect/phenotype";
  }

  if (lowerLabel.includes("anatomy")) {
    return "anatomy";
  }
  if (
    lowerLabel.includes("biological_process") ||
    lowerLabel.includes("biological process")
  ) {
    return "biological_process";
  }
  if (
    lowerLabel.includes("cellular_component") ||
    lowerLabel.includes("cellular component")
  ) {
    return "cellular_component";
  }
  if (lowerLabel.includes("exposure")) {
    return "exposure";
  }
  if (
    lowerLabel.includes("molecular_function") ||
    lowerLabel.includes("molecular function")
  ) {
    return "molecular_function";
  }
  if (lowerLabel.includes("pathway")) {
    return "pathway";
  }

  if (lowerLabel.includes("substation")) {
    return "substation";
  }
  if (lowerLabel.includes("wind turbine") || lowerLabel.includes("wind_turbine")) {
    return "wind_turbine";
  }
  if (lowerLabel.includes("solar park") || lowerLabel.includes("solar_park")) {
    return "solar_park";
  }
  if (lowerLabel.includes("gas junction") || lowerLabel.includes("gas_junction")) {
    return "gas_junction";
  }
  if (lowerLabel.includes("plant") || lowerLabel.includes("generator")) {
    return "generator";
  }
  if (lowerLabel.includes("storage") || lowerLabel.includes("battery")) {
    return "storage";
  }
  if (lowerLabel.includes("load")) {
    return "load";
  }
  if (lowerLabel.includes("line") || lowerLabel.includes("kv")) {
    return "transmission_line";
  }
  if (
    lowerLabel.includes("device") ||
    lowerLabel.includes("switch") ||
    lowerLabel.includes("breaker") ||
    lowerLabel.includes("relay") ||
    lowerLabel.includes("pmu") ||
    lowerLabel.includes("scada") ||
    lowerLabel.includes("rtu")
  ) {
    return "control_device";
  }

  return "default";
}
