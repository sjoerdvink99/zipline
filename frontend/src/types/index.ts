export * from './graph';
export * from './predicate';

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

declare global {
  interface Window {
    gc?: () => void;
  }

  namespace NodeJS {
    interface Timeout {
      [Symbol.toPrimitive](): number;
    }
  }
}