import type { MemoryInfo } from '../types';

export class MemoryMonitor {
  private intervalId: number | null = null;
  private callbacks: Set<(usage: MemoryInfo) => void> = new Set();

  startMonitoring(callback: (usage: MemoryInfo) => void, interval: number = 5000): void {
    this.callbacks.add(callback);

    if (this.intervalId === null) {
      this.intervalId = window.setInterval(() => {
        if ('memory' in performance) {
          const memory = (performance as any).memory;
          const usage: MemoryInfo = {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit
          };

          this.callbacks.forEach(cb => {
            try {
              cb(usage);
            } catch (error) {
              console.warn('Memory monitor callback error:', error);
            }
          });
        }
      }, interval);
    }
  }

  stopMonitoring(callback?: (usage: MemoryInfo) => void): void {
    if (callback) {
      this.callbacks.delete(callback);
    } else {
      this.callbacks.clear();
    }

    if (this.callbacks.size === 0 && this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getCurrentMemoryUsage(): MemoryInfo | null {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      };
    }
    return null;
  }

  getMemoryUsagePercentage(): number {
    const usage = this.getCurrentMemoryUsage();
    if (!usage) return 0;

    return (usage.usedJSHeapSize / usage.jsHeapSizeLimit) * 100;
  }

  checkMemoryThreshold(thresholdPercentage: number = 80): boolean {
    return this.getMemoryUsagePercentage() > thresholdPercentage;
  }

  forceGarbageCollection(): void {
    if (typeof window !== 'undefined' && window.gc) {
      window.gc();
    } else {
      console.warn('Garbage collection not available. Enable --expose-gc flag in development.');
    }
  }
}

export const memoryMonitor = new MemoryMonitor();