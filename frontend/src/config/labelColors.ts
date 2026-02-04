
import { hashString } from "../utils";

export interface LabelColorScheme {
  bg: string;
  bgHover: string;
  text: string;
  border: string;
  accent: string;
}

const GENERIC_LABEL_COLOR: LabelColorScheme = {
  bg: "bg-slate-50",
  bgHover: "hover:bg-slate-100",
  text: "text-slate-700",
  border: "border-slate-200",
  accent: "text-slate-500",
};

const PREDEFINED_COLORS: Record<string, LabelColorScheme> = {
  generator: GENERIC_LABEL_COLOR,
  storage: GENERIC_LABEL_COLOR,
  substation: GENERIC_LABEL_COLOR,
  wind_turbine: GENERIC_LABEL_COLOR,
  solar_park: GENERIC_LABEL_COLOR,
  gas_junction: GENERIC_LABEL_COLOR,
  load: GENERIC_LABEL_COLOR,
  line: GENERIC_LABEL_COLOR,
  transmission_line: GENERIC_LABEL_COLOR,
  hv_overhead_line: GENERIC_LABEL_COLOR,
  hv_underground_cable: GENERIC_LABEL_COLOR,
  gas_pipeline: GENERIC_LABEL_COLOR,
  feeds_into: GENERIC_LABEL_COLOR,
  person: GENERIC_LABEL_COLOR,
  company: GENERIC_LABEL_COLOR,
  product: GENERIC_LABEL_COLOR,
  location: GENERIC_LABEL_COLOR,
  event: GENERIC_LABEL_COLOR,
  document: GENERIC_LABEL_COLOR,
};

const DYNAMIC_PALETTE: LabelColorScheme[] = [
  {
    bg: "bg-gray-50",
    bgHover: "hover:bg-gray-100",
    text: "text-gray-700",
    border: "border-gray-200",
    accent: "text-gray-500",
  },
  {
    bg: "bg-slate-50",
    bgHover: "hover:bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
    accent: "text-slate-500",
  },
  {
    bg: "bg-zinc-50",
    bgHover: "hover:bg-zinc-100",
    text: "text-zinc-700",
    border: "border-zinc-200",
    accent: "text-zinc-500",
  },
  {
    bg: "bg-neutral-50",
    bgHover: "hover:bg-neutral-100",
    text: "text-neutral-700",
    border: "border-neutral-200",
    accent: "text-neutral-500",
  },
  {
    bg: "bg-stone-50",
    bgHover: "hover:bg-stone-100",
    text: "text-stone-700",
    border: "border-stone-200",
    accent: "text-stone-500",
  },
  {
    bg: "bg-amber-50",
    bgHover: "hover:bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-200",
    accent: "text-amber-500",
  },
];

const DEFAULT_COLOR: LabelColorScheme = {
  bg: "bg-gray-50",
  bgHover: "hover:bg-gray-100",
  text: "text-gray-700",
  border: "border-gray-200",
  accent: "text-gray-500",
};

const labelColorCache = new Map<string, LabelColorScheme>();

export function getLabelColor(label: string): LabelColorScheme {
  const normalizedLabel = label.toLowerCase();

  if (labelColorCache.has(normalizedLabel)) {
    return labelColorCache.get(normalizedLabel)!;
  }

  if (normalizedLabel in PREDEFINED_COLORS) {
    const color = PREDEFINED_COLORS[normalizedLabel];
    labelColorCache.set(normalizedLabel, color);
    return color;
  }

  const index = hashString(normalizedLabel) % DYNAMIC_PALETTE.length;
  const color = DYNAMIC_PALETTE[index];
  labelColorCache.set(normalizedLabel, color);
  return color;
}

export function getDefaultLabelColor(): LabelColorScheme {
  return DEFAULT_COLOR;
}

export function resetLabelColorCache(): void {
  labelColorCache.clear();
}
