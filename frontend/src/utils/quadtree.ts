import { quadtree, type Quadtree, type QuadtreeLeaf } from "d3-quadtree";
import { polygonContains } from "d3-polygon";

export interface QuadtreeNode<T> {
  node: T;
  x: number;
  y: number;
}

export function buildQuadtree<T extends { x?: number; y?: number }>(
  nodes: T[]
): Quadtree<QuadtreeNode<T>> {
  const points: QuadtreeNode<T>[] = nodes.map((n) => ({
    node: n,
    x: n.x ?? 0,
    y: n.y ?? 0,
  }));
  return quadtree<QuadtreeNode<T>>()
    .x((d) => d.x)
    .y((d) => d.y)
    .addAll(points);
}

export function findNodeAt<T>(
  qt: Quadtree<QuadtreeNode<T>>,
  x: number,
  y: number,
  radius: number
): T | null {
  let found: T | null = null;
  let minDist = radius;

  qt.visit((quad, x0, y0, x1, y1) => {
    if (!quad.length) {
      let q: QuadtreeLeaf<QuadtreeNode<T>> | undefined =
        quad as QuadtreeLeaf<QuadtreeNode<T>>;
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
  qt: Quadtree<QuadtreeNode<T>>,
  polygon: [number, number][]
): T[] {
  const result: T[] = [];

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

  qt.visit((quad, x0, y0, x1, y1) => {
    if (!quad.length) {
      let q: QuadtreeLeaf<QuadtreeNode<T>> | undefined =
        quad as QuadtreeLeaf<QuadtreeNode<T>>;
      do {
        const d = q.data;
        if (polygonContains(polygon, [d.x, d.y])) {
          result.push(d.node);
        }
      } while ((q = q.next));
    }
    return x0 > maxX || x1 < minX || y0 > maxY || y1 < minY;
  });

  return result;
}
