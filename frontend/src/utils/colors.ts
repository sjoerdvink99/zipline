const COLOR_PALETTE = [
  0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xef4444,
  0xf97316, 0x06b6d4, 0x84cc16, 0xec4899, 0x6366f1,
  0x14b8a6, 0xa855f7, 0xeab308, 0x22c55e, 0xf43f5e,
  0x0ea5e9, 0xd946ef, 0x64748b, 0x78716c, 0x0891b2,
];

const DEFAULT_COLOR = 0x6b7280;

const colorCache = new Map<string, number>();

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function getKindColor(kind: string | undefined): number {
  if (!kind) return DEFAULT_COLOR;

  const cached = colorCache.get(kind);
  if (cached !== undefined) return cached;

  const index = hashString(kind) % COLOR_PALETTE.length;
  const color = COLOR_PALETTE[index];
  colorCache.set(kind, color);
  return color;
}

export function getKindColorHex(kind: string | undefined): string {
  const color = getKindColor(kind);
  return `#${color.toString(16).padStart(6, "0")}`;
}