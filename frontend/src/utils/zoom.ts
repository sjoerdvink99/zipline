import * as d3 from "d3";

export interface ZoomTransform {
  x: number;
  y: number;
  k: number;
}

export function createCanvasZoom(
  scaleExtent: [number, number],
  onZoom: (transform: ZoomTransform) => void
): d3.ZoomBehavior<HTMLCanvasElement, unknown> {
  return d3
    .zoom<HTMLCanvasElement, unknown>()
    .scaleExtent(scaleExtent)
    .filter((ev) => {
      if (ev.shiftKey) return false;
      return true;
    })
    .on("zoom", (ev) => {
      onZoom({
        x: ev.transform.x,
        y: ev.transform.y,
        k: ev.transform.k,
      });
    });
}

export function createDataToScreenTransform(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  transform: ZoomTransform
): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  return [(screenX - transform.x) / transform.k, (screenY - transform.y) / transform.k];
}