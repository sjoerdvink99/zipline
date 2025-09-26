export const PIXI_COLORS = {
  BLUE: 0x3b82f6,
  BG: 0xf9fafb,
  NEUTRAL_GREY: 0x9ca3af,
  HOVER_ORANGE: 0xf97316,
  PATH_COLOR: 0x8b5cf6,
} as const;

export const NODE_TYPE_COLORS = {
  technique: 0xef4444,      // Red
  threat_actor: 0x8b5cf6,   // Purple
  malware: 0xf59e0b,        // Orange
  mitigation: 0x10b981,     // Green
  vulnerability: 0xdc2626,  // Dark red

  apt_group: 0x8b5cf6,      // Purple (APT groups)
  campaign: 0xec4899,       // Pink (Campaigns)
  tool: 0x06b6d4,           // Cyan (Tools)

  protein: 0x3b82f6,        // Blue
  gene: 0x06b6d4,           // Cyan
  'gene/protein': 0x3b82f6, // Blue (same as protein)
  disease: 0xef4444,        // Red
  drug: 0x10b981,           // Green
  compound: 0xf59e0b,       // Orange
  'effect/phenotype': 0xec4899, // Pink

  // Additional PrimeKG node types
  anatomy: 0xa855f7,        // Purple
  biological_process: 0x22c55e, // Light green
  cellular_component: 0x0ea5e9, // Light blue
  exposure: 0xf97316,       // Orange
  molecular_function: 0x84cc16, // Lime
  pathway: 0x6366f1,        // Indigo

  substation: 0x6b7280,     // Gray
  generator: 0x10b981,      // Green
  load: 0xef4444,           // Red
  transmission_line: 0x3b82f6, // Blue
  control_device: 0xf59e0b, // Orange

  default: 0x9ca3af,        // Neutral grey
} as const;

export function getNodeType(label: string = '', nodeData?: any): keyof typeof NODE_TYPE_COLORS {
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

  if (lowerLabel.includes('technique') || lowerLabel.includes('t1') || lowerLabel.includes('attack')) {
    return 'technique';
  }
  if (lowerLabel.includes('apt') || lowerLabel.includes('actor') || lowerLabel.includes('group')) {
    return 'threat_actor';
  }
  if (lowerLabel.includes('malware') || lowerLabel.includes('tool') || lowerLabel.includes('trojan')) {
    return 'malware';
  }
  if (lowerLabel.includes('mitigation') || lowerLabel.includes('m1')) {
    return 'mitigation';
  }
  if (lowerLabel.includes('cve-') || lowerLabel.includes('vulnerability')) {
    return 'vulnerability';
  }

  if (lowerLabel.includes('protein')) {
    return 'protein';
  }
  if (lowerLabel.includes('gene')) {
    return 'gene';
  }
  if (lowerLabel.includes('disease')) {
    return 'disease';
  }
  if (lowerLabel.includes('drug')) {
    return 'drug';
  }
  if (lowerLabel.includes('compound')) {
    return 'compound';
  }
  if (lowerLabel.includes('effect') || lowerLabel.includes('phenotype')) {
    return 'effect/phenotype';
  }

  // PrimeKG specific types
  if (lowerLabel.includes('anatomy')) {
    return 'anatomy';
  }
  if (lowerLabel.includes('biological_process') || lowerLabel.includes('biological process')) {
    return 'biological_process';
  }
  if (lowerLabel.includes('cellular_component') || lowerLabel.includes('cellular component')) {
    return 'cellular_component';
  }
  if (lowerLabel.includes('exposure')) {
    return 'exposure';
  }
  if (lowerLabel.includes('molecular_function') || lowerLabel.includes('molecular function')) {
    return 'molecular_function';
  }
  if (lowerLabel.includes('pathway')) {
    return 'pathway';
  }

  if (lowerLabel.includes('substation')) {
    return 'substation';
  }
  if (lowerLabel.includes('plant') || lowerLabel.includes('generator')) {
    return 'generator';
  }
  if (lowerLabel.includes('load')) {
    return 'load';
  }
  if (lowerLabel.includes('line') || lowerLabel.includes('kv')) {
    return 'transmission_line';
  }
  if (lowerLabel.includes('device') || lowerLabel.includes('switch') ||
      lowerLabel.includes('transformer') || lowerLabel.includes('breaker') ||
      lowerLabel.includes('relay') || lowerLabel.includes('pmu') ||
      lowerLabel.includes('scada') || lowerLabel.includes('rtu')) {
    return 'control_device';
  }

  return 'default';
}