export * from "./graph";
export * from "./fol";

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

declare global {
  interface Window {
    gc?: () => void;
  }
}
