export interface ExportConfig {
  title: string;
  showTitle: boolean;
  showLegend: boolean;
  showPredicate: boolean;
  showSelectionInfo: boolean;
  background: "white" | "lightgray" | "transparent";
  scale: number;
  legendData: Array<{ type: string; color: number; count: number }>;
  predicate: string | null;
  selectedCount: number;
  contrastCount: number;
  pinnedCount: number;
}

const TOKEN_COLORS: Record<string, string> = {
  string: "#d97706",
  neighborhood: "#9333ea",
  cardinality: "#7c3aed",
  quantifier: "#7c3aed",
  comparison: "#94a3b8",
  topology: "#0284c7",
  predicate: "#047857",
  number: "#ea580c",
  punctuation: "#94a3b8",
  variable: "#64748b",
  word: "#64748b",
  other: "#64748b",
};

const TOKEN_REGEX = new RegExp(
  [
    String.raw`(?<string>"[^"]*")`,
    String.raw`(?<neighborhood>N_\{[^}]+\}|N_\d+|\bneighbors\b)`,
    String.raw`(?<cardinality>\b(?:exactly|at_least|at_most)\b)`,
    String.raw`(?<quantifier>[∀∃∧∨¬]|\b(?:forall|exists|and|or|not|in)\b)`,
    String.raw`(?<comparison>[≥≤≠∈]|>=|<=|!=|>|<|=)`,
    String.raw`(?<topology>\b(?:k_core|clustering_coefficient|closeness_centrality|betweenness_centrality|louvain_community|component|degree|pagerank)(?=\())`,
    String.raw`(?<predicate>[A-Za-z_][A-Za-z0-9_\-]*(?=\())`,
    String.raw`(?<number>-?\d+(?:\.\d+)?)`,
    String.raw`(?<variable>\b[xyzw]\b)`,
    String.raw`(?<punctuation>[(){}\[\]:,|])`,
    String.raw`(?<whitespace>[ \t]+)`,
    String.raw`(?<word>[A-Za-z_][A-Za-z0-9_\-]*)`,
    String.raw`(?<other>[\s\S])`,
  ].join("|"),
  "g",
);

interface Token {
  text: string;
  color: string;
  isItalic: boolean;
}

function tokenizeFOL(expression: string): Token[] {
  TOKEN_REGEX.lastIndex = 0;
  const tokens: Token[] = [];
  for (const match of expression.matchAll(TOKEN_REGEX)) {
    const groups = match.groups!;
    const group = Object.entries(groups).find(([, v]) => v !== undefined)?.[0];
    if (!group || group === "whitespace") {
      tokens.push({ text: match[0], color: "#374151", isItalic: false });
      continue;
    }
    if (group === "variable") {
      tokens.push({ text: match[0], color: "#64748b", isItalic: true });
      continue;
    }
    tokens.push({ text: match[0], color: TOKEN_COLORS[group] ?? "#64748b", isItalic: false });
  }
  return tokens;
}

function formatTypeName(type: string): string {
  if (type === "effect/phenotype") return "Effect/Phenotype";
  if (type === "gene/protein") return "Gene/Protein";
  return type.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function hexFromNumber(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}

function drawFOLExpression(
  ctx: CanvasRenderingContext2D,
  expression: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
): number {
  const tokens = tokenizeFOL(expression);
  const lineHeight = fontSize * 1.5;
  let curX = x;
  let curY = y;

  for (const token of tokens) {
    if (token.text === "\n") { curX = x; curY += lineHeight; continue; }
    const fontStyle = token.isItalic ? `italic ${fontSize}px monospace` : `${fontSize}px monospace`;
    ctx.font = fontStyle;
    const w = ctx.measureText(token.text).width;
    if (curX + w > x + maxWidth && curX > x) { curX = x; curY += lineHeight; }
    ctx.fillStyle = token.color;
    ctx.fillText(token.text, curX, curY);
    curX += w;
  }

  return curY + lineHeight;
}

export function renderExportImage(
  graphCanvas: HTMLCanvasElement | null,
  distributionPanel: HTMLCanvasElement | null,
  config: ExportConfig,
): HTMLCanvasElement {
  const s = config.scale;
  const gw = graphCanvas?.width ?? 0;
  const gh = graphCanvas?.height ?? 0;
  const dw = distributionPanel?.width ?? 0;
  const dh = distributionPanel?.height ?? 0;

  const PADDING = Math.round(16 * s);
  const TITLE_FONT = Math.round(16 * s);
  const TITLE_HEIGHT = config.showTitle && config.title ? Math.round(40 * s) : 0;
  const SEP = graphCanvas && distributionPanel ? Math.max(1, Math.round(s)) : 0;

  const hasBottomBar = config.showLegend || config.showPredicate || config.showSelectionInfo;
  const LEGEND_FONT = Math.round(10 * s);
  const LEGEND_ROW_H = Math.round(18 * s);
  const LEGEND_DOT = Math.round(8 * s);
  const PRED_FONT = Math.round(10 * s);

  let bottomBarHeight = 0;
  if (hasBottomBar) {
    const legendRows = config.showLegend ? Math.ceil(config.legendData.length / 2) : 0;
    const legendH = legendRows * LEGEND_ROW_H;
    const predH = config.showPredicate && config.predicate ? Math.round(PRED_FONT * 1.5 * 4) : 0;
    const infoH = config.showSelectionInfo ? Math.round(LEGEND_ROW_H * 1.5) : 0;
    bottomBarHeight = Math.max(legendH, predH) + infoH + PADDING * 2;
    if (bottomBarHeight < Math.round(40 * s)) bottomBarHeight = Math.round(40 * s);
  }

  const totalWidth = Math.max(gw, dw, Math.round(400 * s));
  const totalHeight = TITLE_HEIGHT + gh + SEP + dh + bottomBarHeight;

  const out = document.createElement("canvas");
  out.width = totalWidth;
  out.height = totalHeight;
  const ctx = out.getContext("2d")!;

  if (config.background === "white") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, totalWidth, totalHeight);
  } else if (config.background === "lightgray") {
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(0, 0, totalWidth, totalHeight);
  }

  if (TITLE_HEIGHT > 0) {
    ctx.fillStyle = "#111827";
    ctx.font = `600 ${TITLE_FONT}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(config.title, totalWidth / 2, TITLE_HEIGHT / 2, totalWidth - PADDING * 2);
  }

  if (graphCanvas) {
    ctx.drawImage(graphCanvas, 0, TITLE_HEIGHT);
  }

  if (distributionPanel) {
    const distY = TITLE_HEIGHT + gh + SEP;
    if (SEP > 0) {
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = SEP;
      ctx.beginPath();
      ctx.moveTo(0, TITLE_HEIGHT + gh);
      ctx.lineTo(totalWidth, TITLE_HEIGHT + gh);
      ctx.stroke();
    }
    ctx.drawImage(distributionPanel, 0, distY);
  }

  if (hasBottomBar) {
    const barY = TITLE_HEIGHT + gh + SEP + dh;

    ctx.fillStyle = config.background === "transparent" ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.96)";
    ctx.fillRect(0, barY, totalWidth, bottomBarHeight);

    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = Math.max(1, Math.round(s));
    ctx.beginPath();
    ctx.moveTo(0, barY);
    ctx.lineTo(totalWidth, barY);
    ctx.stroke();

    const innerY = barY + PADDING;

    if (config.showLegend && config.legendData.length > 0) {
      const COL_W = Math.round(160 * s);
      const colCount = Math.min(2, Math.ceil(config.legendData.length / 5));
      ctx.fillStyle = "#6b7280";
      ctx.font = `500 ${Math.round(9 * s)}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("Node Types", PADDING, innerY + Math.round(6 * s));
      const legendStartY = innerY + Math.round(18 * s);

      for (let i = 0; i < config.legendData.length; i++) {
        const { type, color, count } = config.legendData[i];
        const col = colCount > 1 ? Math.floor(i / Math.ceil(config.legendData.length / colCount)) : 0;
        const row = colCount > 1 ? i % Math.ceil(config.legendData.length / colCount) : i;
        const lx = PADDING + col * COL_W;
        const ly = legendStartY + row * LEGEND_ROW_H;

        ctx.beginPath();
        ctx.arc(lx + LEGEND_DOT / 2, ly, LEGEND_DOT / 2, 0, Math.PI * 2);
        ctx.fillStyle = hexFromNumber(color);
        ctx.fill();

        ctx.fillStyle = "#374151";
        ctx.font = `${LEGEND_FONT}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(formatTypeName(type), lx + LEGEND_DOT + Math.round(5 * s), ly);

        const nameW = ctx.measureText(formatTypeName(type)).width;
        ctx.fillStyle = "#9ca3af";
        ctx.font = `${Math.round(9 * s)}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        ctx.fillText(`(${count})`, lx + LEGEND_DOT + Math.round(5 * s) + nameW + Math.round(4 * s), ly);
      }
    }

    if (config.showPredicate && config.predicate) {
      const legendCols = config.showLegend ? Math.min(2, Math.ceil(config.legendData.length / 5)) : 0;
      const COL_W = Math.round(160 * s);
      const predX = config.showLegend ? PADDING + legendCols * COL_W + Math.round(24 * s) : PADDING;
      const predMaxW = totalWidth - predX - PADDING;

      ctx.fillStyle = "#6b7280";
      ctx.font = `500 ${Math.round(9 * s)}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("Predicate", predX, innerY + Math.round(6 * s));

      drawFOLExpression(ctx, config.predicate, predX, innerY + Math.round(20 * s), predMaxW, PRED_FONT);
    }

    if (config.showSelectionInfo) {
      const parts: string[] = [];
      if (config.selectedCount > 0) parts.push(`${config.selectedCount} selected`);
      if (config.contrastCount > 0) parts.push(`${config.contrastCount} contrast`);
      if (config.pinnedCount > 0) parts.push(`${config.pinnedCount} pinned`);

      if (parts.length > 0) {
        ctx.fillStyle = "#9ca3af";
        ctx.font = `${Math.round(9 * s)}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(parts.join(" · "), totalWidth - PADDING, barY + bottomBarHeight - Math.round(8 * s));
      }
    }
  }

  return out;
}
