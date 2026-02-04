import type {
  AttributeDistribution,
  NumericDistribution,
  CategoricalDistribution,
  BooleanDistribution,
  TemporalDistribution,
} from "../../../api/attributes";

export interface DistributionChartSpec {
  nodeType: string | null;
  attrName: string;
  distribution: AttributeDistribution;
}

export interface DistributionPanelOptions {
  scale: number;
  selectedNodes: Set<string>;
  showSelection: boolean;
}

const CELL_W = 188;
const CELL_H = 154;
const CELL_GAP = 14;
const PANEL_PAD = 14;
const MAX_COLS = 4;
const MAX_CATS = 8;

const T_FONT = 10;
const L_FONT = 9;
const T_H = 13;
const T_PAD = 5;
const SIDE = 10;
const BOT = 8;
const AX_H = 13;
const AX_GAP = 3;

const BAR_H = CELL_H - SIDE - T_H - T_PAD - AX_H - AX_GAP - BOT;
const CAT_LW = 64;
const CAT_BW = CELL_W - 2 * SIDE - CAT_LW;
const CAT_ROW = Math.floor((CELL_H - SIDE - T_H - T_PAD - BOT) / MAX_CATS);

const C_TOTAL    = "#e2e8f0";
const C_SEL      = "#3b82f6";
const C_TITLE    = "#111827";
const C_AXIS     = "#9ca3af";
const C_MEAN     = "#cbd5e1";
const C_BASELINE = "#f1f5f9";

function fmt(v: number): string {
  if (!isFinite(v)) return "";
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e4) return (v / 1e3).toFixed(0) + "k";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "k";
  if (v % 1 === 0) return String(v);
  if (a < 0.001 && v !== 0) return v.toExponential(1);
  return v.toFixed(2);
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

function drawNumeric(
  ctx: CanvasRenderingContext2D,
  d: NumericDistribution,
  ox: number, oy: number,
  s: number,
  title: string,
  sel: Set<string>,
  showSel: boolean,
): void {
  const tf = T_FONT * s;
  const lf = L_FONT * s;
  const sp = SIDE * s;
  const bh = BAR_H * s;
  const bw = (CELL_W - 2 * SIDE) * s;
  const tg = T_PAD * s;
  const th = T_H * s;
  const ag = AX_GAP * s;
  const bx = ox + sp;
  const by = oy + sp + th + tg;

  ctx.font = `600 ${tf}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = C_TITLE;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(clip(title, 30), bx, oy + sp);

  if (d.bins.length === 0) return;
  const maxC = Math.max(...d.bins.map((b) => b.count), 1);
  const nb = d.bins.length;
  const bwidth = bw / nb;
  const gap = Math.max(s, bwidth * 0.07);

  ctx.fillStyle = C_BASELINE;
  ctx.fillRect(bx, by + bh, bw, Math.max(1, s * 0.5));

  for (let i = 0; i < nb; i++) {
    const bin = d.bins[i];
    const x = bx + i * bwidth + gap / 2;
    const w = Math.max(1, bwidth - gap);
    const h = (bin.count / maxC) * bh;
    ctx.fillStyle = C_TOTAL;
    ctx.fillRect(x, by + bh - h, w, h);
    if (showSel) {
      const sc = bin.node_ids.filter((id) => sel.has(id)).length;
      if (sc > 0) {
        ctx.fillStyle = C_SEL;
        ctx.fillRect(x, by + bh - (sc / maxC) * bh, w, (sc / maxC) * bh);
      }
    }
  }

  if (nb > 1) {
    let sum = 0, total = 0;
    for (const b of d.bins) { sum += ((b.min + b.max) / 2) * b.count; total += b.count; }
    if (total > 0) {
      const frac = d.max > d.min ? (sum / total - d.min) / (d.max - d.min) : 0.5;
      const mx = bx + Math.max(0, Math.min(1, frac)) * bw;
      ctx.strokeStyle = C_MEAN;
      ctx.lineWidth = Math.max(1, s * 0.75);
      ctx.setLineDash([2 * s, 2 * s]);
      ctx.beginPath();
      ctx.moveTo(mx, by);
      ctx.lineTo(mx, by + bh);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const ay = by + bh + ag;
  ctx.font = `${lf}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = C_AXIS;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(fmt(d.min), bx, ay);
  ctx.textAlign = "right";
  ctx.fillText(fmt(d.max), bx + bw, ay);
}

function drawCategorical(
  ctx: CanvasRenderingContext2D,
  d: CategoricalDistribution | BooleanDistribution,
  ox: number, oy: number,
  s: number,
  title: string,
  sel: Set<string>,
  showSel: boolean,
): void {
  const tf = T_FONT * s;
  const lf = L_FONT * s;
  const sp = SIDE * s;
  const th = T_H * s;
  const tg = T_PAD * s;
  const rh = CAT_ROW * s;
  const lw = CAT_LW * s;
  const bw = CAT_BW * s;
  const barH = rh * 0.52;
  const lx = ox + sp;
  const bx = lx + lw;
  const sy = oy + sp + th + tg;

  ctx.font = `600 ${tf}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = C_TITLE;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(clip(title, 30), lx, oy + sp);

  const vals = [...d.values].sort((a, b) => b.count - a.count).slice(0, MAX_CATS);
  const maxC = Math.max(...vals.map((v) => v.count), 1);

  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    const cy = sy + i * rh + rh / 2;
    const barY = cy - barH / 2;

    ctx.font = `${lf}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = C_AXIS;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(clip(v.label, 9), lx + lw - 4 * s, cy);

    const w = (v.count / maxC) * bw;
    ctx.fillStyle = C_TOTAL;
    ctx.fillRect(bx, barY, w, barH);

    if (showSel) {
      const sc = v.node_ids.filter((id) => sel.has(id)).length;
      if (sc > 0) {
        ctx.fillStyle = C_SEL;
        ctx.fillRect(bx, barY, (sc / maxC) * bw, barH);
      }
    }

    ctx.font = `${lf * 0.9}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = C_AXIS;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(fmt(v.count), bx + w + 3 * s, cy);
  }
}

function drawTemporal(
  ctx: CanvasRenderingContext2D,
  d: TemporalDistribution,
  ox: number, oy: number,
  s: number,
  title: string,
  sel: Set<string>,
  showSel: boolean,
): void {
  const tf = T_FONT * s;
  const lf = L_FONT * s;
  const sp = SIDE * s;
  const bh = BAR_H * s;
  const bw = (CELL_W - 2 * SIDE) * s;
  const tg = T_PAD * s;
  const th = T_H * s;
  const ag = AX_GAP * s;
  const bx = ox + sp;
  const by = oy + sp + th + tg;

  ctx.font = `600 ${tf}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = C_TITLE;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(clip(title, 30), bx, oy + sp);

  if (d.bins.length === 0) return;
  const maxC = Math.max(...d.bins.map((b) => b.count), 1);
  const nb = d.bins.length;
  const bwidth = bw / nb;
  const gap = Math.max(s, bwidth * 0.07);

  ctx.fillStyle = C_BASELINE;
  ctx.fillRect(bx, by + bh, bw, Math.max(1, s * 0.5));

  for (let i = 0; i < nb; i++) {
    const bin = d.bins[i];
    const x = bx + i * bwidth + gap / 2;
    const w = Math.max(1, bwidth - gap);
    const h = (bin.count / maxC) * bh;
    ctx.fillStyle = C_TOTAL;
    ctx.fillRect(x, by + bh - h, w, h);
    if (showSel) {
      const sc = bin.node_ids.filter((id) => sel.has(id)).length;
      if (sc > 0) {
        ctx.fillStyle = C_SEL;
        ctx.fillRect(x, by + bh - (sc / maxC) * bh, w, (sc / maxC) * bh);
      }
    }
  }

  const ay = by + bh + ag;
  ctx.font = `${lf}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = C_AXIS;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(clip(d.bins[0].label, 8), bx, ay);
  ctx.textAlign = "right";
  ctx.fillText(clip(d.bins[d.bins.length - 1].label, 8), bx + bw, ay);
}

export function renderDistributionPanel(
  specs: DistributionChartSpec[],
  opts: DistributionPanelOptions,
): HTMLCanvasElement | null {
  if (specs.length === 0) return null;

  const s = opts.scale;
  const cols = Math.min(specs.length, MAX_COLS);
  const rows = Math.ceil(specs.length / cols);
  const pp = PANEL_PAD * s;
  const cg = CELL_GAP * s;
  const cw = CELL_W * s;
  const ch = CELL_H * s;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(2 * pp + cols * cw + (cols - 1) * cg);
  canvas.height = Math.round(2 * pp + rows * ch + (rows - 1) * cg);

  const ctx = canvas.getContext("2d")!;

  for (let i = 0; i < specs.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = pp + col * (cw + cg);
    const oy = pp + row * (ch + cg);
    const spec = specs[i];
    const title = spec.nodeType ? `${spec.attrName} (${spec.nodeType})` : spec.attrName;
    const d = spec.distribution;

    if (d.type === "numeric") {
      drawNumeric(ctx, d, ox, oy, s, title, opts.selectedNodes, opts.showSelection);
    } else if (d.type === "categorical" || d.type === "boolean") {
      drawCategorical(ctx, d, ox, oy, s, title, opts.selectedNodes, opts.showSelection);
    } else if (d.type === "temporal") {
      drawTemporal(ctx, d, ox, oy, s, title, opts.selectedNodes, opts.showSelection);
    }
  }

  return canvas;
}
