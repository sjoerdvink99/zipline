import * as d3 from "d3";

export interface QuadtreeNode<T> {
  node: T;
  x: number;
  y: number;
}

export function buildQuadtree<T extends { x?: number; y?: number }>(
  nodes: T[]
): d3.Quadtree<QuadtreeNode<T>> {
  const points: QuadtreeNode<T>[] = nodes.map((n) => ({
    node: n,
    x: n.x ?? 0,
    y: n.y ?? 0,
  }));
  return d3
    .quadtree<QuadtreeNode<T>>()
    .x((d) => d.x)
    .y((d) => d.y)
    .addAll(points);
}

export function findNodeAt<T>(
  quadtree: d3.Quadtree<QuadtreeNode<T>>,
  x: number,
  y: number,
  radius: number
): T | null {
  let found: T | null = null;
  let minDist = radius;

  quadtree.visit((quad, x0, y0, x1, y1) => {
    if (!quad.length) {
      let q: d3.QuadtreeLeaf<QuadtreeNode<T>> | undefined =
        quad as d3.QuadtreeLeaf<QuadtreeNode<T>>;
      do {
        const d = q.data;
        const dx = d.x - x;
        const dy = d.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          found = d.node;
        }
      } while ((q = q.next));
    }
    return (
      x0 > x + radius || x1 < x - radius || y0 > y + radius || y1 < y - radius
    );
  });

  return found;
}

export function findNodesInPolygon<T>(
  quadtree: d3.Quadtree<QuadtreeNode<T>>,
  polygon: [number, number][]
): T[] {
  const result: T[] = [];
  const inside = d3.polygonContains;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [px, py] of polygon) {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }

  quadtree.visit((quad, x0, y0, x1, y1) => {
    if (!quad.length) {
      let q: d3.QuadtreeLeaf<QuadtreeNode<T>> | undefined =
        quad as d3.QuadtreeLeaf<QuadtreeNode<T>>;
      do {
        const d = q.data;
        if (inside(polygon, [d.x, d.y])) {
          result.push(d.node);
        }
      } while ((q = q.next));
    }
    return x0 > maxX || x1 < minX || y0 > maxY || y1 < minY;
  });

  return result;
}