import { useCallback, useEffect, useRef, useState } from "react";
import type { D3Node, D3Edge } from "../../types";
import { getNodeType, NODE_TYPE_COLORS } from "../../config/pixiColors";
import { useGraphDataStore } from "../../store/graphDataStore";

const HEADER = 96;
const MIN_SCALE = 0.001;
const MAX_SCALE = 60;
const CLICK_SLOP = 4;

interface MatrixSettings {
  showLabels: "auto" | "always" | "never";
  cellOpacity: number;
  showDiagonal: boolean;
  showBands: boolean;
}

const DEFAULT_MATRIX_SETTINGS: MatrixSettings = {
  showLabels: "auto",
  cellOpacity: 0.82,
  showDiagonal: true,
  showBands: true,
};

function hexToCSS(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function blendOnWhite(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgb(${Math.round(r * alpha + 255 * (1 - alpha))},${Math.round(g * alpha + 255 * (1 - alpha))},${Math.round(b * alpha + 255 * (1 - alpha))})`;
}

function getEdgeEndpoints(e: D3Edge): [string, string] {
  const src = typeof e.source === "string" ? e.source : (e.source as D3Node).id;
  const tgt = typeof e.target === "string" ? e.target : (e.target as D3Node).id;
  return [src, tgt];
}

interface TypeGroup {
  type: string;
  start: number;
  end: number;
  cssColor: string;
}

class AdjacencyMatrixRenderer {
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private onSelectionChange: (ids: string[]) => void;

  private nodes: D3Node[] = [];
  private edges: D3Edge[] = [];

  private orderedNodes: D3Node[] = [];
  private nodeToIndex: Map<string, number> = new Map();
  private degreeMap: Map<string, number> = new Map();

  private adjSorted: Uint32Array[] = [];

  private nodeCSSFull: string[] = [];
  private nodeCSSPure: string[] = [];
  private typeGroups: TypeGroup[] = [];

  private viewX = 0;
  private viewY = 0;
  private scale = 10;

  private selectedSet: Set<string> = new Set();
  private hoveredRow = -1;
  private hoveredCol = -1;
  private lastSelectedIndex = -1;
  private order: "type" | "degree" | "input" | "rcm" | "spectral" = "type";
  private settings: MatrixSettings = { ...DEFAULT_MATRIX_SETTINGS };

  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartViewX = 0;
  private dragStartViewY = 0;
  private isBrush = false;
  private brushEndX = 0;
  private brushEndY = 0;
  private activePointer: number | null = null;

  private width = 0;
  private height = 0;
  private dpr = 1;

  private rafId: number | null = null;
  private dirty = false;

  constructor(
    canvas: HTMLCanvasElement,
    container: HTMLElement,
    onSelectionChange: (ids: string[]) => void,
  ) {
    this.canvas = canvas;
    this.container = container;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    this.ctx = ctx;
    this.onSelectionChange = onSelectionChange;
    this.bindEvents();
  }

  destroy(): void {
    this.unbindEvents();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  setData(nodes: D3Node[], edges: D3Edge[]): void {
    this.nodes = nodes;
    this.edges = edges;
    this.computeDegrees();
    this.rebuildOrder();
    this.buildAdjList();
    this.resetView();
    this.scheduleRender();
  }

  setOrder(order: "type" | "degree" | "input" | "rcm" | "spectral"): void {
    this.order = order;
    this.rebuildOrder();
    this.buildAdjList();
    this.resetView();
    this.scheduleRender();
  }

  setSettings(settings: MatrixSettings): void {
    const opacityChanged = settings.cellOpacity !== this.settings.cellOpacity;
    this.settings = settings;
    if (opacityChanged) this.buildRenderCaches();
    this.scheduleRender();
  }

  setExternalSelection(nodeIds: string[]): void {
    this.selectedSet = new Set(nodeIds);
    this.scheduleRender();
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.width = w;
    this.height = h;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.scheduleRender();
  }

  resetViewToFit(): void {
    this.resetView();
  }

  scheduleRender(): void {
    this.dirty = true;
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        if (this.dirty) { this.dirty = false; this.render(); }
      });
    }
  }

  private computeDegrees(): void {
    this.degreeMap.clear();
    for (const n of this.nodes) this.degreeMap.set(n.id, 0);
    for (const e of this.edges) {
      const [s, t] = getEdgeEndpoints(e);
      this.degreeMap.set(s, (this.degreeMap.get(s) ?? 0) + 1);
      this.degreeMap.set(t, (this.degreeMap.get(t) ?? 0) + 1);
    }
  }

  private rebuildOrder(): void {
    let source = this.nodes;
    if (this.order === "type") {
      source = [...this.nodes].sort((a, b) =>
        getNodeType(a.label ?? "", a as any).localeCompare(
          getNodeType(b.label ?? "", b as any),
        ),
      );
    } else if (this.order === "degree") {
      source = [...this.nodes].sort(
        (a, b) => (this.degreeMap.get(b.id) ?? 0) - (this.degreeMap.get(a.id) ?? 0),
      );
    } else if (this.order === "rcm") {
      source = this.orderByRCM();
    } else if (this.order === "spectral") {
      source = this.orderBySpectral();
    }
    this.orderedNodes = source;
    this.nodeToIndex.clear();
    for (let i = 0; i < this.orderedNodes.length; i++) {
      this.nodeToIndex.set(this.orderedNodes[i].id, i);
    }
    this.buildRenderCaches();
  }

  private orderByRCM(): D3Node[] {
    const n = this.nodes.length;
    if (n === 0) return [];

    const nodeIdx = new Map<string, number>();
    for (let i = 0; i < n; i++) nodeIdx.set(this.nodes[i].id, i);

    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const e of this.edges) {
      const [s, t] = getEdgeEndpoints(e);
      const si = nodeIdx.get(s), ti = nodeIdx.get(t);
      if (si !== undefined && ti !== undefined && si !== ti) {
        adj[si].push(ti);
        adj[ti].push(si);
      }
    }

    const degree = adj.map((a) => a.length);
    const visited = new Uint8Array(n);
    const order: number[] = [];

    const bfsFrom = (start: number) => {
      const queue: number[] = [start];
      visited[start] = 1;
      while (queue.length > 0) {
        const curr = queue.shift()!;
        order.push(curr);
        const neighbors = adj[curr].filter((nb) => !visited[nb]);
        neighbors.sort((a, b) => degree[a] - degree[b]);
        for (const nb of neighbors) {
          visited[nb] = 1;
          queue.push(nb);
        }
      }
    };

    let minDeg = Infinity, seed = 0;
    for (let i = 0; i < n; i++) {
      if (degree[i] < minDeg) { minDeg = degree[i]; seed = i; }
    }
    const tmpVisited = new Uint8Array(n);
    const tmpQueue = [seed];
    tmpVisited[seed] = 1;
    let peripheral = seed;
    while (tmpQueue.length > 0) {
      peripheral = tmpQueue.shift()!;
      for (const nb of adj[peripheral]) {
        if (!tmpVisited[nb]) { tmpVisited[nb] = 1; tmpQueue.push(nb); }
      }
    }

    bfsFrom(peripheral);
    for (let i = 0; i < n; i++) {
      if (!visited[i]) bfsFrom(i);
    }

    return order.map((i) => this.nodes[i]);
  }

  private orderBySpectral(): D3Node[] {
    const n = this.nodes.length;
    if (n === 0) return [];

    const nodeIdx = new Map<string, number>();
    for (let i = 0; i < n; i++) nodeIdx.set(this.nodes[i].id, i);

    const degree = new Float64Array(n);
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const e of this.edges) {
      const [s, t] = getEdgeEndpoints(e);
      const si = nodeIdx.get(s), ti = nodeIdx.get(t);
      if (si !== undefined && ti !== undefined && si !== ti) {
        adj[si].push(ti);
        adj[ti].push(si);
        degree[si]++;
        degree[ti]++;
      }
    }

    const comp = new Int32Array(n).fill(-1);
    const components: number[][] = [];
    for (let seed = 0; seed < n; seed++) {
      if (comp[seed] !== -1) continue;
      const cid = components.length;
      const members: number[] = [];
      const q = [seed];
      comp[seed] = cid;
      while (q.length > 0) {
        const cur = q.shift()!;
        members.push(cur);
        for (const nb of adj[cur]) {
          if (comp[nb] === -1) { comp[nb] = cid; q.push(nb); }
        }
      }
      components.push(members);
    }

    components.sort((a, b) => b.length - a.length);

    const globalOrder: number[] = [];

    for (const members of components) {
      const m = members.length;
      if (m <= 2) { globalOrder.push(...members); continue; }

      const local = new Map<number, number>();
      for (let k = 0; k < m; k++) local.set(members[k], k);

      const localDeg = new Float64Array(m);
      const localAdj: number[][] = Array.from({ length: m }, () => []);
      for (const gi of members) {
        const li = local.get(gi)!;
        for (const gj of adj[gi]) {
          const lj = local.get(gj);
          if (lj !== undefined) {
            localAdj[li].push(lj);
            localDeg[li]++;
          }
        }
      }
      for (let k = 0; k < m; k++) if (localDeg[k] === 0) localDeg[k] = 1;

      const vol = localDeg.reduce((s, d) => s + d, 0);

      const rwMul = (v: Float64Array): Float64Array => {
        const out = new Float64Array(m);
        for (let i = 0; i < m; i++) {
          let s = 0;
          for (const j of localAdj[i]) s += v[j];
          out[i] = s / localDeg[i];
        }
        return out;
      };

      const deflate = (v: Float64Array): void => {
        let dot = 0;
        for (let i = 0; i < m; i++) dot += (localDeg[i] / vol) * v[i];
        for (let i = 0; i < m; i++) v[i] -= dot;
      };

      const normalize = (v: Float64Array): void => {
        let norm = 0;
        for (let i = 0; i < m; i++) norm += v[i] * v[i];
        norm = Math.sqrt(norm);
        if (norm > 1e-12) for (let i = 0; i < m; i++) v[i] /= norm;
      };

      let v = new Float64Array(m);
      for (let i = 0; i < m; i++) v[i] = (i % 2 === 0) ? 1 : -1;
      deflate(v);
      normalize(v);

      for (let iter = 0; iter < 80; iter++) {
        v = rwMul(v);
        deflate(v);
        normalize(v);
      }

      const sorted = members
        .map((gi, k) => ({ gi, coord: v[k] }))
        .sort((a, b) => a.coord - b.coord)
        .map((x) => x.gi);

      globalOrder.push(...sorted);
    }

    return globalOrder.map((i) => this.nodes[i]);
  }

  private buildAdjList(): void {
    const n = this.orderedNodes.length;
    if (n === 0) { this.adjSorted = []; return; }
    const raw: number[][] = Array.from({ length: n }, () => []);
    for (const e of this.edges) {
      const [src, tgt] = getEdgeEndpoints(e);
      const si = this.nodeToIndex.get(src);
      const ti = this.nodeToIndex.get(tgt);
      if (si !== undefined && ti !== undefined) {
        raw[si].push(ti);
        raw[ti].push(si);
      }
    }
    this.adjSorted = raw.map((arr) => {
      arr.sort((a, b) => a - b);
      return new Uint32Array(arr);
    });
  }

  private hasEdge(i: number, j: number): boolean {
    const arr = this.adjSorted[i];
    if (!arr || arr.length === 0) return false;
    let lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const v = arr[mid];
      if (v === j) return true;
      if (v < j) lo = mid + 1; else hi = mid - 1;
    }
    return false;
  }

  private buildRenderCaches(): void {
    const n = this.orderedNodes.length;
    this.nodeCSSFull = new Array(n);
    this.nodeCSSPure = new Array(n);

    for (let i = 0; i < n; i++) {
      const node = this.orderedNodes[i];
      const type = getNodeType(node.label ?? "", node as any);
      const hex = (NODE_TYPE_COLORS as Record<string, number>)[type] ?? NODE_TYPE_COLORS.default;
      this.nodeCSSFull[i] = blendOnWhite(hex, this.settings.cellOpacity);
      this.nodeCSSPure[i] = hexToCSS(hex);
    }

    this.typeGroups = [];
    if (this.order === "type" && n > 0) {
      let curType: string = getNodeType(this.orderedNodes[0].label ?? "", this.orderedNodes[0] as any);
      let groupStart = 0;
      for (let i = 1; i <= n; i++) {
        const type =
          i < n
            ? getNodeType(this.orderedNodes[i].label ?? "", this.orderedNodes[i] as any)
            : "\0";
        if (type !== curType) {
          const hex = (NODE_TYPE_COLORS as Record<string, number>)[curType] ?? NODE_TYPE_COLORS.default;
          this.typeGroups.push({
            type: curType,
            start: groupStart,
            end: i - 1,
            cssColor: hexToCSS(hex),
          });
          curType = type;
          groupStart = i;
        }
      }
    }
  }

  private resetView(): void {
    const n = this.orderedNodes.length;
    if (n === 0 || this.width <= 0 || this.height <= 0) return;
    const avail = Math.min(this.width - HEADER, this.height - HEADER);
    this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, avail / n));
    this.viewX = 0;
    this.viewY = 0;
  }

  private render(): void {
    const { ctx, width, height, dpr } = this;
    if (width <= 0 || height <= 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = this.orderedNodes.length;
    const s = this.scale;
    const vx = this.viewX;
    const vy = this.viewY;

    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, 0, width, height);

    if (n === 0) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No graph data loaded", width / 2, height / 2);
      ctx.textBaseline = "alphabetic";
      return;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(HEADER, HEADER, width - HEADER, height - HEADER);

    const jMin = Math.max(0, Math.floor(-vx / s) - 1);
    const jMax = Math.min(n - 1, Math.ceil((width - HEADER - vx) / s) + 1);
    const iMin = Math.max(0, Math.floor(-vy / s) - 1);
    const iMax = Math.min(n - 1, Math.ceil((height - HEADER - vy) / s) + 1);

    const stride = Math.max(1, Math.ceil(1 / s));

    if (this.order === "type" && this.typeGroups.length > 1 && this.settings.showBands) {
      this.renderTypeBands(iMin, iMax, jMin, jMax, s, vx, vy);
    }

    this.renderCells(iMin, iMax, jMin, jMax, s, vx, vy, stride);

    if (this.selectedSet.size > 0) {
      this.renderSelectionStrips(s, vx, vy);
    }

    if (this.hoveredRow >= 0 || this.hoveredCol >= 0) {
      this.renderHoverCrosshair(s, vx, vy, n);
    }

    if (this.dragging && this.isBrush) {
      this.renderBrushRect();
    }

    this.renderRowHeaders(iMin, iMax, s, vy, n, stride);
    this.renderColHeaders(jMin, jMax, s, vx, n, stride);

    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, 0, HEADER, HEADER);

    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(HEADER + 0.5, 0);
    ctx.lineTo(HEADER + 0.5, height);
    ctx.moveTo(0, HEADER + 0.5);
    ctx.lineTo(width, HEADER + 0.5);
    ctx.stroke();
  }

  private renderTypeBands(
    iMin: number, iMax: number,
    jMin: number, jMax: number,
    s: number, vx: number, vy: number,
  ): void {
    const { ctx, width, height } = this;
    for (let gi = 0; gi < this.typeGroups.length; gi++) {
      if (gi % 2 === 0) continue;
      const g = this.typeGroups[gi];

      const rMin = Math.max(g.start, iMin), rMax = Math.min(g.end, iMax);
      if (rMin <= rMax) {
        const sy = HEADER + vy + rMin * s;
        ctx.fillStyle = "rgba(0,0,0,0.022)";
        ctx.fillRect(HEADER, sy, width - HEADER, (rMax - rMin + 1) * s);
      }
      const cMin = Math.max(g.start, jMin), cMax = Math.min(g.end, jMax);
      if (cMin <= cMax) {
        const sx = HEADER + vx + cMin * s;
        ctx.fillStyle = "rgba(0,0,0,0.022)";
        ctx.fillRect(sx, HEADER, (cMax - cMin + 1) * s, height - HEADER);
      }
    }

    if (s >= 2) {
      ctx.strokeStyle = "rgba(156,163,175,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const g of this.typeGroups) {
        if (g.start === 0) continue;
        const y = HEADER + vy + g.start * s;
        if (y >= HEADER && y <= height) { ctx.moveTo(HEADER, y + 0.5); ctx.lineTo(width, y + 0.5); }
        const x = HEADER + vx + g.start * s;
        if (x >= HEADER && x <= width) { ctx.moveTo(x + 0.5, HEADER); ctx.lineTo(x + 0.5, height); }
      }
      ctx.stroke();
    }
  }

  private renderCells(
    iMin: number, iMax: number,
    jMin: number, jMax: number,
    s: number, vx: number, vy: number,
    stride: number,
  ): void {
    const { ctx } = this;
    if (this.adjSorted.length === 0) return;

    const gap = s >= 4 ? Math.min(1.5, s * 0.07) : 0;
    const cs = stride * s - gap;

    for (let i = iMin; i <= iMax; i += stride) {
      const cy = HEADER + vy + i * s + gap * 0.5;
      for (let j = jMin; j <= jMax; j += stride) {
        const cx = HEADER + vx + j * s + gap * 0.5;
        if (i === j && this.settings.showDiagonal) {
          ctx.fillStyle = "#e2e8f0";
          ctx.fillRect(cx, cy, cs, cs);
        } else if (this.hasEdge(i, j)) {
          ctx.fillStyle = this.nodeCSSFull[i];
          ctx.fillRect(cx, cy, cs, cs);
        }
      }
    }
  }

  private renderSelectionStrips(s: number, vx: number, vy: number): void {
    const { ctx, width, height } = this;
    ctx.fillStyle = "rgba(59,130,246,0.13)";
    for (const id of this.selectedSet) {
      const idx = this.nodeToIndex.get(id);
      if (idx === undefined) continue;
      const sy = HEADER + vy + idx * s;
      if (sy + s > HEADER && sy < height)
        ctx.fillRect(HEADER, sy, width - HEADER, Math.max(1, s));
      const sx = HEADER + vx + idx * s;
      if (sx + s > HEADER && sx < width)
        ctx.fillRect(sx, HEADER, Math.max(1, s), height - HEADER);
    }
  }

  private renderHoverCrosshair(s: number, vx: number, vy: number, n: number): void {
    const { ctx, width, height } = this;
    ctx.fillStyle = "rgba(249,115,22,0.1)";
    if (this.hoveredRow >= 0 && this.hoveredRow < n) {
      const sy = HEADER + vy + this.hoveredRow * s;
      if (sy + s > HEADER && sy < height)
        ctx.fillRect(HEADER, sy, width - HEADER, Math.max(1, s));
    }
    if (this.hoveredCol >= 0 && this.hoveredCol < n) {
      const sx = HEADER + vx + this.hoveredCol * s;
      if (sx + s > HEADER && sx < width)
        ctx.fillRect(sx, HEADER, Math.max(1, s), height - HEADER);
    }
  }

  private renderBrushRect(): void {
    const { ctx } = this;
    const x1 = Math.min(this.dragStartX, this.brushEndX);
    const y1 = Math.min(this.dragStartY, this.brushEndY);
    const rw = Math.abs(this.brushEndX - this.dragStartX);
    const rh = Math.abs(this.brushEndY - this.dragStartY);
    ctx.fillStyle = "rgba(59,130,246,0.07)";
    ctx.fillRect(x1, y1, rw, rh);
    ctx.strokeStyle = "rgba(59,130,246,0.75)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x1 + 0.5, y1 + 0.5, rw, rh);
    ctx.setLineDash([]);
  }

  private renderRowHeaders(iMin: number, iMax: number, s: number, vy: number, n: number, stride: number): void {
    const { ctx, height, width } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER, HEADER, height - HEADER);
    ctx.clip();

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, HEADER, HEADER, height - HEADER);

    if (this.order === "type" && this.settings.showBands) {
      for (let gi = 0; gi < this.typeGroups.length; gi++) {
        if (gi % 2 === 0) continue;
        const g = this.typeGroups[gi];
        const rMin = Math.max(g.start, iMin), rMax = Math.min(g.end, iMax);
        if (rMin <= rMax) {
          ctx.fillStyle = "rgba(0,0,0,0.022)";
          ctx.fillRect(0, HEADER + vy + rMin * s, HEADER, (rMax - rMin + 1) * s);
        }
      }
      if (s >= 3) {
        for (const g of this.typeGroups) {
          const groupH = (g.end - g.start + 1) * s;
          if (groupH < 14) continue;
          const sy = HEADER + vy + g.start * s;
          const ey = HEADER + vy + (g.end + 1) * s;
          if (ey < HEADER || sy > height) continue;
          const visCy = (Math.max(sy, HEADER) + Math.min(ey, height)) / 2;
          ctx.save();
          ctx.translate(7, visCy);
          ctx.rotate(-Math.PI / 2);
          ctx.fillStyle = g.cssColor;
          ctx.globalAlpha = 0.65;
          ctx.font = "bold 8px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const label = g.type.replace(/_/g, " ");
          const count = g.end - g.start + 1;
          ctx.fillText(`${label} (${count})`.slice(0, 22), 0, 0);
          ctx.globalAlpha = 1;
          ctx.restore();
        }
        ctx.strokeStyle = "rgba(156,163,175,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const g of this.typeGroups) {
          if (g.start === 0) continue;
          const y = HEADER + vy + g.start * s;
          if (y >= HEADER && y <= height) { ctx.moveTo(0, y + 0.5); ctx.lineTo(HEADER, y + 0.5); }
        }
        ctx.stroke();
      }
    }

    for (let i = iMin; i <= iMax; i += stride) {
      const node = this.orderedNodes[i];
      const sy = HEADER + vy + i * s;
      const cellH = Math.max(1, stride * s);
      const isSel = this.selectedSet.has(node.id);

      if (isSel) {
        ctx.fillStyle = "rgba(59,130,246,0.1)";
        ctx.fillRect(0, sy, HEADER - 3, cellH);
      }

      ctx.fillStyle = this.nodeCSSPure[i];
      ctx.fillRect(HEADER - 3, sy + 0.5, 3, Math.max(1, cellH - 1));

      const showRowLabel =
        this.settings.showLabels === "always" ? s >= 2 :
        this.settings.showLabels === "never" ? false :
        s >= 7;
      if (showRowLabel) {
        ctx.fillStyle = isSel ? "#2563eb" : "#374151";
        const fs = Math.min(11, Math.max(7, Math.floor(s * 0.72)));
        ctx.font = `${isSel ? "500" : "400"} ${fs}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const label = String(node.id).slice(0, 18);
        ctx.fillText(label, HEADER - 7, sy + s / 2);
        ctx.textBaseline = "alphabetic";
      }
    }

    if (this.hoveredRow >= 0 && this.hoveredRow < n) {
      const sy = HEADER + vy + this.hoveredRow * s;
      if (sy + s > HEADER && sy < height) {
        ctx.fillStyle = "rgba(249,115,22,0.08)";
        ctx.fillRect(0, sy, HEADER, Math.max(1, s));
      }
    }

    void width;

    ctx.restore();
  }

  private renderColHeaders(jMin: number, jMax: number, s: number, vx: number, n: number, stride: number): void {
    const { ctx, width } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(HEADER, 0, width - HEADER, HEADER);
    ctx.clip();

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(HEADER, 0, width - HEADER, HEADER);

    if (this.order === "type" && this.settings.showBands) {
      for (let gi = 0; gi < this.typeGroups.length; gi++) {
        if (gi % 2 === 0) continue;
        const g = this.typeGroups[gi];
        const cMin = Math.max(g.start, jMin), cMax = Math.min(g.end, jMax);
        if (cMin <= cMax) {
          ctx.fillStyle = "rgba(0,0,0,0.022)";
          ctx.fillRect(HEADER + vx + cMin * s, 0, (cMax - cMin + 1) * s, HEADER);
        }
      }
      if (s >= 3) {
        ctx.strokeStyle = "rgba(156,163,175,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const g of this.typeGroups) {
          if (g.start === 0) continue;
          const x = HEADER + vx + g.start * s;
          if (x >= HEADER && x <= width) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, HEADER); }
        }
        ctx.stroke();
      }
    }

    for (let j = jMin; j <= jMax; j += stride) {
      const node = this.orderedNodes[j];
      const sx = HEADER + vx + j * s;
      const cellW = Math.max(1, stride * s);
      const isSel = this.selectedSet.has(node.id);

      if (isSel) {
        ctx.fillStyle = "rgba(59,130,246,0.1)";
        ctx.fillRect(sx, 0, cellW, HEADER - 3);
      }

      ctx.fillStyle = this.nodeCSSPure[j];
      ctx.fillRect(sx + 0.5, HEADER - 3, Math.max(1, cellW - 1), 3);

      const showColLabel =
        this.settings.showLabels === "always" ? s >= 2 :
        this.settings.showLabels === "never" ? false :
        s >= 7;
      if (showColLabel) {
        ctx.save();
        ctx.translate(sx + s / 2, HEADER - 7);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = isSel ? "#2563eb" : "#374151";
        const fs = Math.min(11, Math.max(7, Math.floor(s * 0.72)));
        ctx.font = `${isSel ? "500" : "400"} ${fs}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const label = String(node.id).slice(0, 18);
        ctx.fillText(label, 2, 0);
        ctx.restore();
      }
    }

    if (this.hoveredCol >= 0 && this.hoveredCol < n) {
      const sx = HEADER + vx + this.hoveredCol * s;
      if (sx + s > HEADER && sx < width) {
        ctx.fillStyle = "rgba(249,115,22,0.08)";
        ctx.fillRect(sx, 0, Math.max(1, s), HEADER);
      }
    }

    ctx.restore();
  }

  private getPos(e: PointerEvent | WheelEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private updateCursor(cx: number, cy: number, shift: boolean): void {
    if (this.dragging) {
      this.canvas.style.cursor = this.isBrush ? "crosshair" : "grabbing";
    } else if (cx <= HEADER || cy <= HEADER) {
      this.canvas.style.cursor = "pointer";
    } else if (shift) {
      this.canvas.style.cursor = "crosshair";
    } else {
      this.canvas.style.cursor = "grab";
    }
  }

  private updateHover(cx: number, cy: number): void {
    let nr = -1, nc = -1;
    const n = this.orderedNodes.length;
    if (cx > HEADER && cy > HEADER) {
      nr = Math.floor((cy - HEADER - this.viewY) / this.scale);
      nc = Math.floor((cx - HEADER - this.viewX) / this.scale);
      if (nr < 0 || nr >= n) nr = -1;
      if (nc < 0 || nc >= n) nc = -1;
    } else if (cx <= HEADER && cy > HEADER) {
      nr = Math.floor((cy - HEADER - this.viewY) / this.scale);
      if (nr < 0 || nr >= n) nr = -1;
      nc = nr;
    } else if (cy <= HEADER && cx > HEADER) {
      nc = Math.floor((cx - HEADER - this.viewX) / this.scale);
      if (nc < 0 || nc >= n) nc = -1;
      nr = nc;
    }
    if (nr !== this.hoveredRow || nc !== this.hoveredCol) {
      this.hoveredRow = nr;
      this.hoveredCol = nc;
      this.scheduleRender();
    }
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const [cx, cy] = this.getPos(e);
    this.dragging = true;
    this.dragStartX = cx;
    this.dragStartY = cy;
    this.dragStartViewX = this.viewX;
    this.dragStartViewY = this.viewY;
    this.isBrush = e.shiftKey && cx > HEADER && cy > HEADER;
    this.brushEndX = cx;
    this.brushEndY = cy;
    this.activePointer = e.pointerId;
    try { this.canvas.setPointerCapture(e.pointerId); } catch {}
    this.updateCursor(cx, cy, e.shiftKey);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer && this.activePointer !== null) return;
    const [cx, cy] = this.getPos(e);
    if (this.dragging) {
      const dx = cx - this.dragStartX;
      const dy = cy - this.dragStartY;
      if (this.isBrush) {
        this.brushEndX = cx;
        this.brushEndY = cy;
      } else {
        this.viewX = this.dragStartViewX + dx;
        this.viewY = this.dragStartViewY + dy;
      }
      this.updateCursor(cx, cy, e.shiftKey);
      this.scheduleRender();
      return;
    }
    this.updateHover(cx, cy);
    this.updateCursor(cx, cy, e.shiftKey);
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
    const [cx, cy] = this.getPos(e);
    const totalMove = Math.abs(cx - this.dragStartX) + Math.abs(cy - this.dragStartY);
    const wasClick = totalMove < CLICK_SLOP;

    if (this.dragging) {
      if (this.isBrush && !wasClick) {
        this.applyBrush(cx, cy);
      } else if (wasClick) {
        this.handleClickAt(this.dragStartX, this.dragStartY, e.ctrlKey || e.metaKey, e.shiftKey);
      }
    }

    this.dragging = false;
    this.isBrush = false;
    this.activePointer = null;
    this.updateCursor(cx, cy, e.shiftKey);
    this.scheduleRender();
  };

  private handlePointerLeave = (): void => {
    this.hoveredRow = -1;
    this.hoveredCol = -1;
    this.canvas.style.cursor = "default";
    this.scheduleRender();
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const [cx, cy] = this.getPos(e);

    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
      const mx = (cx - HEADER - this.viewX) / this.scale;
      const my = (cy - HEADER - this.viewY) / this.scale;
      this.scale = ns;
      this.viewX = cx - HEADER - mx * ns;
      this.viewY = cy - HEADER - my * ns;
    } else {
      this.viewX -= e.deltaX;
      this.viewY -= e.deltaY;
    }
    this.scheduleRender();
  };

  private applyBrush(endX: number, endY: number): void {
    const x1 = Math.min(this.dragStartX, endX);
    const x2 = Math.max(this.dragStartX, endX);
    const y1 = Math.min(this.dragStartY, endY);
    const y2 = Math.max(this.dragStartY, endY);
    const n = this.orderedNodes.length;
    const rMin = Math.max(0, Math.floor((y1 - HEADER - this.viewY) / this.scale));
    const rMax = Math.min(n - 1, Math.floor((y2 - HEADER - this.viewY) / this.scale));
    const cMin = Math.max(0, Math.floor((x1 - HEADER - this.viewX) / this.scale));
    const cMax = Math.min(n - 1, Math.floor((x2 - HEADER - this.viewX) / this.scale));
    const ids = new Set<string>();
    for (let i = rMin; i <= rMax; i++) ids.add(this.orderedNodes[i].id);
    for (let j = cMin; j <= cMax; j++) ids.add(this.orderedNodes[j].id);
    this.selectedSet = ids;
    this.onSelectionChange(Array.from(ids));
  }

  private handleClickAt(cx: number, cy: number, ctrl: boolean, shift: boolean): void {
    const n = this.orderedNodes.length;
    if (cx <= HEADER && cy > HEADER) {
      const idx = Math.floor((cy - HEADER - this.viewY) / this.scale);
      if (idx >= 0 && idx < n) this.toggleSelection(idx, ctrl, shift);
    } else if (cy <= HEADER && cx > HEADER) {
      const idx = Math.floor((cx - HEADER - this.viewX) / this.scale);
      if (idx >= 0 && idx < n) this.toggleSelection(idx, ctrl, shift);
    } else if (cx > HEADER && cy > HEADER && !ctrl && !shift) {
      this.selectedSet.clear();
      this.onSelectionChange([]);
    }
    this.scheduleRender();
  }

  private toggleSelection(idx: number, ctrl: boolean, shift: boolean): void {
    const nodeId = this.orderedNodes[idx].id;
    if (shift && this.lastSelectedIndex >= 0) {
      const lo = Math.min(this.lastSelectedIndex, idx);
      const hi = Math.max(this.lastSelectedIndex, idx);
      for (let i = lo; i <= hi; i++) this.selectedSet.add(this.orderedNodes[i].id);
    } else if (ctrl) {
      if (this.selectedSet.has(nodeId)) this.selectedSet.delete(nodeId);
      else this.selectedSet.add(nodeId);
    } else {
      this.selectedSet = new Set([nodeId]);
    }
    this.lastSelectedIndex = idx;
    this.onSelectionChange(Array.from(this.selectedSet));
  }

  private bindEvents(): void {
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  private unbindEvents(): void {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("wheel", this.handleWheel);
  }
}

interface AdjacencyMatrixProps {
  selectedNodes: string[];
  onSelectionChange: (nodeIds: string[]) => void;
}

export const AdjacencyMatrix = ({
  selectedNodes,
  onSelectionChange,
}: AdjacencyMatrixProps) => {
  const { nodes, edges } = useGraphDataStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<AdjacencyMatrixRenderer | null>(null);
  const onSelChangeRef = useRef(onSelectionChange);
  const [order, setOrder] = useState<"type" | "degree" | "input" | "rcm" | "spectral">("type");
  const [selCount, setSelCount] = useState(0);
  const [settings, setSettings] = useState<MatrixSettings>(DEFAULT_MATRIX_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const n = nodes.length;

  useEffect(() => { onSelChangeRef.current = onSelectionChange; }, [onSelectionChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    let renderer: AdjacencyMatrixRenderer;
    try {
      renderer = new AdjacencyMatrixRenderer(canvas, container, (ids) => {
        setSelCount(ids.length);
        onSelChangeRef.current(ids);
      });
    } catch { return; }
    rendererRef.current = renderer;
    renderer.resize();
    return () => { renderer.destroy(); rendererRef.current = null; };
  }, []);

  useEffect(() => { rendererRef.current?.setData(nodes, edges); }, [nodes, edges]);

  useEffect(() => { rendererRef.current?.setOrder(order); }, [order]);

  useEffect(() => {
    rendererRef.current?.setExternalSelection(selectedNodes);
    setSelCount(selectedNodes.length);
  }, [selectedNodes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(() => rendererRef.current?.resize());
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  useEffect(() => { rendererRef.current?.setSettings(settings); }, [settings]);

  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSettings]);

  const fitView = useCallback(() => {
    rendererRef.current?.resetViewToFit();
    rendererRef.current?.scheduleRender();
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-50 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-gray-100">
          <span className="text-[10px] text-gray-400">Order</span>
          <select
            className="text-[10px] border-0 bg-transparent text-gray-600 focus:ring-0 cursor-pointer pr-4"
            value={order}
            onChange={(e) => setOrder(e.target.value as "type" | "degree" | "input" | "rcm" | "spectral")}
            title="Node ordering"
          >
            <option value="type">By Type</option>
            <option value="spectral">Spectral (Fiedler)</option>
            <option value="degree">By Degree</option>
            <option value="rcm">By RCM</option>
            <option value="input">Input Order</option>
          </select>
        </div>
        <button
          onClick={fitView}
          className="flex items-center justify-center w-6 h-6 bg-white/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-100 text-gray-500 hover:text-gray-700 hover:bg-white transition-colors"
          title="Fit matrix to view"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </button>
        <div ref={settingsRef} className="relative">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="flex items-center justify-center w-6 h-6 bg-white/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-100 text-gray-500 hover:text-gray-700 hover:bg-white transition-colors"
            title="Matrix settings"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          {showSettings && (
            <div className="absolute right-0 top-8 z-20 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-52 text-xs">
              <div className="font-medium text-gray-700 mb-2.5">Matrix Settings</div>

              <div className="flex items-center justify-between mb-2">
                <label className="text-gray-600">Labels</label>
                <select
                  className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-700 focus:ring-0 focus:outline-none cursor-pointer"
                  value={settings.showLabels}
                  onChange={(e) => setSettings((s) => ({ ...s, showLabels: e.target.value as MatrixSettings["showLabels"] }))}
                >
                  <option value="auto">Auto</option>
                  <option value="always">Always</option>
                  <option value="never">Never</option>
                </select>
              </div>

              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-gray-600">Cell Opacity</label>
                  <span className="text-gray-500 tabular-nums">{Math.round(settings.cellOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={1.0}
                  step={0.05}
                  value={settings.cellOpacity}
                  onChange={(e) => setSettings((s) => ({ ...s, cellOpacity: parseFloat(e.target.value) }))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                <input
                  type="checkbox"
                  checked={settings.showDiagonal}
                  onChange={(e) => setSettings((s) => ({ ...s, showDiagonal: e.target.checked }))}
                  className="rounded accent-blue-500"
                />
                <span className="text-gray-600">Show Diagonal</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showBands}
                  onChange={(e) => setSettings((s) => ({ ...s, showBands: e.target.checked }))}
                  className="rounded accent-blue-500"
                />
                <span className="text-gray-600">Show Type Bands</span>
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-sm rounded-md px-2.5 py-1.5 shadow-sm border border-gray-100">
          <div className="text-[10px] text-gray-600 font-medium">
            {n.toLocaleString()} × {n.toLocaleString()} matrix
          </div>
          {selCount > 0 && (
            <div className="text-[10px] text-blue-600 mt-0.5">
              {selCount.toLocaleString()} selected
            </div>
          )}
          <div className="text-[9px] text-gray-400 mt-0.5">
            Drag to pan · Shift+drag to select · Ctrl+scroll to zoom
          </div>
        </div>
      </div>
    </div>
  );
};
