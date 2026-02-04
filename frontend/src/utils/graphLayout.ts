import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { D3Node, D3Edge } from "../types";

export type LayoutAlgo = "force" | "forceatlas2" | "grid" | "circle" | "radial" | "kpartite";

export interface ForceLayoutOptions {
  nodes: D3Node[];
  edges: D3Edge[];
  width: number;
  height: number;
  onTick: () => void;
  onEnd: () => void;
  linkStrengthMultiplier?: number;
  chargeStrengthMultiplier?: number;
}

function getId(x: string | D3Node): string {
  return typeof x === "string" ? x : x.id;
}

export function computeGraphHash(nodes: D3Node[], edges: D3Edge[]): string {
  return `${nodes.length}:${edges.length}:${nodes[0]?.id ?? ""}:${nodes[nodes.length - 1]?.id ?? ""}`;
}

function labelPropagation(
  nodes: D3Node[],
  edges: D3Edge[],
  maxIter = 30,
): Map<string, string> {
  const labels = new Map<string, string>(nodes.map((n) => [n.id, n.id]));
  const nbrs = new Map<string, string[]>(nodes.map((n) => [n.id, []]));

  for (const edge of edges) {
    const s = getId(edge.source);
    const t = getId(edge.target);
    nbrs.get(s)?.push(t);
    nbrs.get(t)?.push(s);
  }

  const order = nodes.map((n) => n.id);

  for (let iter = 0; iter < maxIter; iter++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }

    let changed = false;
    for (const id of order) {
      const ns = nbrs.get(id)!;
      if (ns.length === 0) continue;

      const freq = new Map<string, number>();
      for (const nb of ns) {
        const l = labels.get(nb)!;
        freq.set(l, (freq.get(l) ?? 0) + 1);
      }

      let maxF = 0;
      const maxLs: string[] = [];
      for (const [l, f] of freq) {
        if (f > maxF) {
          maxF = f;
          maxLs.length = 0;
          maxLs.push(l);
        } else if (f === maxF) {
          maxLs.push(l);
        }
      }

      const pick = maxLs[(Math.random() * maxLs.length) | 0];
      if (pick !== labels.get(id)) {
        labels.set(id, pick);
        changed = true;
      }
    }

    if (!changed) break;
  }

  const unique = new Set(labels.values());
  const norm = new Map([...unique].map((l, i) => [l, `cluster_${i}`]));
  return new Map([...labels].map(([id, l]) => [id, norm.get(l)!]));
}

function detectStructuralCommunities(
  nodes: D3Node[],
  edges: D3Edge[],
): Map<string, string> {
  const communityMap = new Map<string, string>();
  if (nodes.length === 0) return communityMap;

  const sample = nodes[0];
  if (
    typeof sample.louvain_community === "string" &&
    sample.louvain_community.startsWith("cluster_")
  ) {
    for (const node of nodes) {
      communityMap.set(
        node.id,
        (node.louvain_community as string) || "cluster_0",
      );
    }
    return communityMap;
  }

  const nodeTypes = new Set(
    nodes.map((n) => (n.node_type as string) || "").filter(Boolean),
  );
  if (nodeTypes.size >= 2) {
    for (const node of nodes) {
      communityMap.set(
        node.id,
        `nodetype_${(node.node_type as string) || "unknown"}`,
      );
    }
    return communityMap;
  }

  const idToIdx = new Map(nodes.map((n, i) => [n.id, i]));
  const parent = nodes.map((_, i) => i);

  const findRoot = (x: number): number =>
    parent[x] === x ? x : (parent[x] = findRoot(parent[x]));

  const unite = (a: number, b: number) => {
    const ra = findRoot(a);
    const rb = findRoot(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (const edge of edges) {
    const si = idToIdx.get(getId(edge.source));
    const ti = idToIdx.get(getId(edge.target));
    if (si != null && ti != null) unite(si, ti);
  }

  const compRoots = new Set<number>();
  for (let i = 0; i < nodes.length; i++) compRoots.add(findRoot(i));
  const nComponents = compRoots.size;

  if (nComponents > 1) {
    nodes.forEach((node, i) =>
      communityMap.set(node.id, `cluster_${findRoot(i)}`),
    );
    return communityMap;
  }

  if (nodes.length >= 3 && nodes.length <= 8000 && edges.length > 0) {
    const lpMap = labelPropagation(nodes, edges, 30);
    const commSizes = new Map<string, number>();
    for (const c of lpMap.values())
      commSizes.set(c, (commSizes.get(c) ?? 0) + 1);

    const minCommSize = Math.max(3, Math.floor(nodes.length * 0.015));
    const validComms = new Set(
      [...commSizes.entries()]
        .filter(([, s]) => s >= minCommSize)
        .map(([c]) => c),
    );

    if (validComms.size >= 2) {
      for (const node of nodes) {
        const c = lpMap.get(node.id)!;
        communityMap.set(node.id, validComms.has(c) ? c : "cluster_misc");
      }
      return communityMap;
    }
  }

  nodes.forEach((node) => communityMap.set(node.id, "cluster_0"));
  return communityMap;
}

export function runStableForceLayout({
  nodes,
  edges,
  width,
  height,
  onTick,
  onEnd,
  linkStrengthMultiplier = 1,
  chargeStrengthMultiplier = 1,
}: ForceLayoutOptions): Simulation<D3Node, D3Edge> {
  const n = nodes.length;
  const e = edges.length;

  const isMedium = n >= 100 && n < 1000;
  const isLarge = n >= 1000 && n < 5000;
  const isHuge = n >= 5000 && n < 50000;
  const isMassive = n >= 50000;

  const communityMap = detectStructuralCommunities(nodes, edges);

  const communityGroups = new Map<string, D3Node[]>();
  for (const node of nodes) {
    const c = communityMap.get(node.id) ?? "cluster_0";
    if (!communityGroups.has(c)) communityGroups.set(c, []);
    communityGroups.get(c)!.push(node);
  }

  const communities = Array.from(communityGroups.entries()).sort(
    ([, a], [, b]) => b.length - a.length,
  );
  const K = communities.length;

  const cx = width / 2;
  const cy = height / 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  const anchorX = new Map<string, number>();
  const anchorY = new Map<string, number>();

  const sectorRadius =
    K > 1 ? Math.min(width, height) * (isLarge || isHuge ? 0.38 : 0.3) : 0;

  communities.forEach(([commId, group], ki) => {
    const angle = (2 * Math.PI * ki) / K - Math.PI / 2;
    const ax = K > 1 ? cx + sectorRadius * Math.cos(angle) : cx;
    const ay = K > 1 ? cy + sectorRadius * Math.sin(angle) : cy;
    anchorX.set(commId, ax);
    anchorY.set(commId, ay);

    const maxSpread =
      K > 1 ? sectorRadius * 0.5 : Math.min(width, height) * 0.38;
    const spreadR = Math.min(maxSpread, 14 * Math.sqrt(group.length));

    group.forEach((node, ji) => {
      if (node.fx != null) return;
      node.x =
        ax +
        spreadR *
          Math.sqrt((ji + 0.5) / group.length) *
          Math.cos(ji * goldenAngle);
      node.y =
        ay +
        spreadR *
          Math.sqrt((ji + 0.5) / group.length) *
          Math.sin(ji * goldenAngle);
      node.vx = 0;
      node.vy = 0;
    });
  });

  const baseCharge = isMassive
    ? -12
    : isHuge
      ? -160
      : isLarge
        ? -700
        : isMedium
          ? -600
          : -800;
  const chargeStrength = baseCharge * chargeStrengthMultiplier;

  const baseLinkDist = isMassive
    ? 20
    : isHuge
      ? 55
      : isLarge
        ? 80
        : isMedium
          ? 120
          : 160;

  const alphaDecay = isMassive
    ? 0.065
    : isHuge
      ? 0.022
      : isLarge
        ? 0.01
        : isMedium
          ? 0.009
          : 0.008;
  const velocityDecay = isMassive
    ? 0.65
    : isHuge
      ? 0.48
      : isLarge
        ? 0.38
        : isMedium
          ? 0.28
          : 0.22;

  const communityGravity =
    K <= 1
      ? 0
      : isMassive
        ? 0
        : isHuge
          ? 0.06
          : isLarge
            ? 0.28
            : isMedium
              ? 0.12
              : 0.1;

  const degreeMap = new Map<string, number>();
  for (const edge of edges) {
    const s = getId(edge.source);
    const t = getId(edge.target);
    degreeMap.set(s, (degreeMap.get(s) ?? 0) + 1);
    degreeMap.set(t, (degreeMap.get(t) ?? 0) + 1);
  }

  const linkStrengthFn = (d: D3Edge): number => {
    const s = getId(d.source);
    const t = getId(d.target);
    const minDeg = Math.min(degreeMap.get(s) ?? 1, degreeMap.get(t) ?? 1) + 1;
    return (1 / Math.sqrt(minDeg)) * linkStrengthMultiplier;
  };

  let sampledEdges = edges;
  if (isMassive && e > 50000) {
    sampledEdges = edges.filter(() => Math.random() < 50000 / e);
  } else if (isHuge && e > 100000) {
    sampledEdges = edges.filter(() => Math.random() < 100000 / e);
  }

  const collideRadius = isMassive
    ? 4
    : isHuge
      ? 8
      : isLarge
        ? 12
        : isMedium
          ? 18
          : 24;

  const charge = forceManyBody<D3Node>()
    .strength(chargeStrength)
    .theta(isMassive ? 1.2 : isHuge ? 0.95 : 0.8)
    .distanceMax(isMassive ? 200 : isHuge ? 2000 : isLarge ? 3000 : 4000);

  const sim = forceSimulation<D3Node>(nodes)
    .force(
      "link",
      forceLink<D3Node, D3Edge>(sampledEdges)
        .id((d) => d.id)
        .distance(baseLinkDist)
        .strength(linkStrengthFn),
    )
    .force("charge", charge)
    .force(
      "communityX",
      forceX<D3Node>(
        (d) => anchorX.get(communityMap.get(d.id) ?? "cluster_0") ?? cx,
      ).strength(communityGravity),
    )
    .force(
      "communityY",
      forceY<D3Node>(
        (d) => anchorY.get(communityMap.get(d.id) ?? "cluster_0") ?? cy,
      ).strength(communityGravity),
    )
    .force(
      "center",
      forceCenter<D3Node>(cx, cy).strength(K <= 1 ? 0.04 : 0.01),
    )
    .force(
      "collide",
      forceCollide<D3Node>(collideRadius).strength(0.7).iterations(2),
    )
    .alphaDecay(alphaDecay)
    .velocityDecay(velocityDecay);

  let ticks = 0;
  const maxTicks = isMassive
    ? 45
    : isHuge
      ? 220
      : isLarge
        ? 700
        : isMedium
          ? 700
          : 800;
  const minTicks = isMassive
    ? 15
    : isHuge
      ? 40
      : isLarge
        ? 80
        : isMedium
          ? 60
          : 50;
  const stopAlpha = isMassive ? 0.1 : isHuge ? 0.018 : 0.003;
  const tickInterval = isMassive ? 5 : isHuge ? 3 : isLarge ? 2 : 1;

  sim.on("tick", () => {
    ticks += 1;
    if (ticks % tickInterval === 0) {
      onTick();
    }
    if ((ticks > minTicks && sim.alpha() < stopAlpha) || ticks > maxTicks) {
      sim.stop();
      onTick();
      onEnd();
    }
  });

  return sim;
}

export interface FA2LayoutHandle {
  stop: () => void;
}

export function runForceAtlas2Layout({
  nodes,
  edges,
  width,
  height,
  onTick,
  onEnd,
}: ForceLayoutOptions): FA2LayoutHandle {
  const n = nodes.length;

  let scalingRatio: number;
  let gravity: number;
  let barnesHutOptimize: boolean;
  let totalIterations: number;
  let chunkSize: number;

  if (n < 100) {
    scalingRatio = 2; gravity = 0.5; barnesHutOptimize = false; totalIterations = 800; chunkSize = 50;
  } else if (n < 1000) {
    scalingRatio = 4; gravity = 0.8; barnesHutOptimize = false; totalIterations = 1000; chunkSize = 60;
  } else if (n < 5000) {
    scalingRatio = 8; gravity = 1.2; barnesHutOptimize = true; totalIterations = 600; chunkSize = 40;
  } else if (n < 50000) {
    scalingRatio = 15; gravity = 2.5; barnesHutOptimize = true; totalIterations = 400; chunkSize = 30;
  } else {
    scalingRatio = 30; gravity = 6.0; barnesHutOptimize = true; totalIterations = 200; chunkSize = 25;
  }

  const settings = {
    linLogMode: true,
    outboundAttractionDistribution: true,
    barnesHutOptimize,
    barnesHutTheta: 0.5,
    scalingRatio,
    gravity,
    slowDown: 3,
    adjustSizes: false,
  };

  const communityMap = detectStructuralCommunities(nodes, edges);
  const communityGroups = new Map<string, D3Node[]>();
  for (const node of nodes) {
    const c = communityMap.get(node.id) ?? "cluster_0";
    if (!communityGroups.has(c)) communityGroups.set(c, []);
    communityGroups.get(c)!.push(node);
  }

  const communities = Array.from(communityGroups.entries()).sort(
    ([, a], [, b]) => b.length - a.length,
  );
  const K = communities.length;
  const cx = width / 2;
  const cy = height / 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const isLarge = n >= 1000 && n < 5000;
  const isHuge = n >= 5000;
  const sectorRadius =
    K > 1 ? Math.min(width, height) * (isLarge || isHuge ? 0.38 : 0.3) : 0;

  communities.forEach(([commId, group], ki) => {
    const angle = (2 * Math.PI * ki) / K - Math.PI / 2;
    const ax = K > 1 ? cx + sectorRadius * Math.cos(angle) : cx;
    const ay = K > 1 ? cy + sectorRadius * Math.sin(angle) : cy;

    const maxSpread =
      K > 1 ? sectorRadius * 0.5 : Math.min(width, height) * 0.38;
    const spreadR = Math.min(maxSpread, 14 * Math.sqrt(group.length));

    group.forEach((node, ji) => {
      if (node.fx != null) return;
      node.x =
        ax +
        spreadR *
          Math.sqrt((ji + 0.5) / group.length) *
          Math.cos(ji * goldenAngle);
      node.y =
        ay +
        spreadR *
          Math.sqrt((ji + 0.5) / group.length) *
          Math.sin(ji * goldenAngle);
    });

    void commId;
  });

  const graph = new Graph({ multi: false, type: "undirected" });

  for (const node of nodes) {
    const x = node.x ?? cx;
    const y = node.y ?? cy;
    graph.addNode(node.id, { x, y });
  }

  for (const edge of edges) {
    const s = typeof edge.source === "string" ? edge.source : edge.source.id;
    const t = typeof edge.target === "string" ? edge.target : edge.target.id;
    if (s !== t && !graph.hasEdge(s, t)) {
      try {
        graph.addEdge(s, t);
      } catch {
      }
    }
  }

  for (const node of nodes) {
    if (node.fx != null && node.fy != null && graph.hasNode(node.id)) {
      graph.setNodeAttribute(node.id, "x", node.fx);
      graph.setNodeAttribute(node.id, "y", node.fy);
    }
  }

  let stopped = false;
  let rafId: number | null = null;
  let iterationsDone = 0;

  const runChunk = () => {
    if (stopped) return;

    const itersThisChunk = Math.min(chunkSize, totalIterations - iterationsDone);
    if (itersThisChunk <= 0) {
      onTick();
      onEnd();
      return;
    }

    forceAtlas2.assign(graph, { iterations: itersThisChunk, settings });
    iterationsDone += itersThisChunk;

    for (const node of nodes) {
      if (!graph.hasNode(node.id)) continue;
      if (node.fx != null && node.fy != null) {
        graph.setNodeAttribute(node.id, "x", node.fx);
        graph.setNodeAttribute(node.id, "y", node.fy);
        node.x = node.fx;
        node.y = node.fy;
      } else {
        node.x = graph.getNodeAttribute(node.id, "x") as number;
        node.y = graph.getNodeAttribute(node.id, "y") as number;
      }
    }

    onTick();

    if (iterationsDone >= totalIterations) {
      onEnd();
      return;
    }

    rafId = requestAnimationFrame(runChunk);
  };

  rafId = requestAnimationFrame(runChunk);

  return {
    stop: () => {
      stopped = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}

export function applyGridLayout(
  ns: D3Node[],
  width: number,
  height: number,
): void {
  const n = Math.max(ns.length, 1);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const pad = 40;
  const cellW = Math.max((width - pad * 2) / cols, 1);
  const cellH = Math.max((height - pad * 2) / rows, 1);
  ns.forEach((node, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    node.x = pad + c * cellW + cellW / 2;
    node.y = pad + r * cellH + cellH / 2;
  });
}

export function applyCircleLayout(
  ns: D3Node[],
  width: number,
  height: number,
): void {
  const R = Math.max(Math.min(width, height) / 2 - 50, 50);
  const cx = width / 2;
  const cy = height / 2;
  ns.forEach((node, i) => {
    const a = (2 * Math.PI * i) / Math.max(ns.length, 1);
    node.x = cx + R * Math.cos(a);
    node.y = cy + R * Math.sin(a);
  });
}

export function connectedComponents(ns: D3Node[], es: D3Edge[]): D3Node[][] {
  const id2idx = new Map(ns.map((n, i) => [n.id, i]));
  const parent = ns.map((_, i) => i);
  const find = (x: number): number =>
    parent[x] === x ? x : (parent[x] = find(parent[x]));
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  es.forEach((e) => {
    const iu = id2idx.get(getId(e.source));
    const iv = id2idx.get(getId(e.target));
    if (iu != null && iv != null) unite(iu, iv);
  });
  const groups = new Map<number, D3Node[]>();
  ns.forEach((n, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(n);
  });
  return [...groups.values()];
}

export function applyRadialByCluster(
  ns: D3Node[],
  es: D3Edge[],
  width: number,
  height: number,
): void {
  const comps = connectedComponents(ns, es);
  const bigR = Math.max(Math.min(width, height) / 2 - 80, 80);
  const cx = width / 2;
  const cy = height / 2;
  const K = Math.max(comps.length, 1);

  comps.forEach((group, gi) => {
    const theta = (2 * Math.PI * gi) / K;
    const gx = cx + bigR * Math.cos(theta);
    const gy = cy + bigR * Math.sin(theta);
    const rSmall = Math.max(40, Math.min(120, 14 * Math.sqrt(group.length)));
    group.forEach((node, j) => {
      const a = (2 * Math.PI * j) / Math.max(group.length, 1);
      node.x = gx + rSmall * Math.cos(a);
      node.y = gy + rSmall * Math.sin(a);
    });
  });
}

export function applyKPartiteLayout(
  ns: D3Node[],
  width: number,
  height: number,
  orientation: "horizontal" | "vertical" = "horizontal",
): void {
  const partitions = new Map<string, D3Node[]>();
  ns.forEach((node) => {
    const nodeType =
      (node.node_type as string) ||
      (node.type as string) ||
      (node.label as string) ||
      "default";
    if (!partitions.has(nodeType)) partitions.set(nodeType, []);
    partitions.get(nodeType)!.push(node);
  });

  const partitionArray = Array.from(partitions.entries()).sort(
    ([, a], [, b]) => b.length - a.length,
  );

  const numPartitions = partitionArray.length;
  if (numPartitions === 0) return;

  const padding = Math.max(40, Math.min(80, width * 0.08));

  if (orientation === "horizontal") {
    const availableHeight = height - 2 * padding;
    const partitionSpacing =
      numPartitions > 1 ? availableHeight / (numPartitions - 1) : 0;

    partitionArray.forEach(([, nodes], partitionIndex) => {
      const y =
        numPartitions === 1
          ? height / 2
          : padding + partitionIndex * partitionSpacing;
      if (nodes.length === 0) return;
      const availableWidth = width - 2 * padding;
      if (nodes.length === 1) {
        nodes[0].x = width / 2;
        nodes[0].y = y;
      } else {
        const nodeSpacing = availableWidth / (nodes.length - 1);
        nodes.forEach((node, nodeIndex) => {
          node.x = padding + nodeIndex * nodeSpacing;
          node.y = y;
        });
      }
    });
  } else {
    const availableWidth = width - 2 * padding;
    const partitionSpacing =
      numPartitions > 1 ? availableWidth / (numPartitions - 1) : 0;

    partitionArray.forEach(([, nodes], partitionIndex) => {
      const x =
        numPartitions === 1
          ? width / 2
          : padding + partitionIndex * partitionSpacing;
      if (nodes.length === 0) return;
      const availableHeight = height - 2 * padding;
      if (nodes.length === 1) {
        nodes[0].x = x;
        nodes[0].y = height / 2;
      } else {
        const nodeSpacing = availableHeight / (nodes.length - 1);
        nodes.forEach((node, nodeIndex) => {
          node.x = x;
          node.y = padding + nodeIndex * nodeSpacing;
        });
      }
    });
  }
}
