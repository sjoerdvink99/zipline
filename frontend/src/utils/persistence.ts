import type { FilterItem, NeighborhoodConstraint } from "../types";

const STORAGE_VERSION = "1.0";
const STORAGE_PREFIX = "zipline_session_";
const MAX_STORAGE_SIZE = 1024 * 1024 * 5;

export interface PersistedSessionState {
  version: string;
  dataset: string;
  timestamp: number;
  state: {
    selectedNodes: string[];
    selectionSource: string | null;
    activeFilterItems: FilterItem[];
    activeFilterOperations: Record<string, "and" | "or" | "not">;
    predicates: FilterItem[];
    constraints: NeighborhoodConstraint[];
    setOperations: Record<string, "and" | "or" | "not">;
  };
}

export function getStorageKey(dataset: string): string {
  return `${STORAGE_PREFIX}${dataset}`;
}

export function isLocalStorageAvailable(): boolean {
  try {
    const test = "__localStorage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

export function getStorageSize(): number {
  if (!isLocalStorageAvailable()) return 0;

  let total = 0;
  for (const key in localStorage) {
    if (key.startsWith(STORAGE_PREFIX)) {
      total += (localStorage[key]?.length || 0) + key.length;
    }
  }
  return total;
}

export function cleanupOldSessions(
  keepDatasets: string[] = [],
  maxAge: number = 7 * 24 * 60 * 60 * 1000,
): void {
  if (!isLocalStorageAvailable()) return;

  const now = Date.now();
  const keysToRemove: string[] = [];

  for (const key in localStorage) {
    if (key.startsWith(STORAGE_PREFIX)) {
      try {
        const data = JSON.parse(localStorage[key]) as { timestamp?: number };
        const dataset = key.replace(STORAGE_PREFIX, "");

        if (
          !keepDatasets.includes(dataset) &&
          data.timestamp &&
          now - data.timestamp > maxAge
        ) {
          keysToRemove.push(key);
        }
      } catch {
        keysToRemove.push(key);
      }
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

export function validatePersistedState(
  data: unknown,
): data is PersistedSessionState {
  if (!data || typeof data !== "object" || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== "string") return false;
  if (typeof obj.dataset !== "string") return false;
  if (typeof obj.timestamp !== "number") return false;
  if (!obj.state || typeof obj.state !== "object" || obj.state === null)
    return false;

  return true;
}

export function saveSessionState(
  dataset: string,
  state: PersistedSessionState["state"],
): boolean {
  if (!isLocalStorageAvailable()) {
    return false;
  }

  try {
    const sessionData: PersistedSessionState = {
      version: STORAGE_VERSION,
      dataset,
      timestamp: Date.now(),
      state,
    };

    const serialized = JSON.stringify(sessionData);

    if (serialized.length > MAX_STORAGE_SIZE / 10) {
      return false;
    }

    if (getStorageSize() + serialized.length > MAX_STORAGE_SIZE * 0.8) {
      cleanupOldSessions([dataset]);
    }

    localStorage.setItem(getStorageKey(dataset), serialized);
    return true;
  } catch (error) {
    void error;
    return false;
  }
}

export function loadSessionState(
  dataset: string,
): PersistedSessionState["state"] | null {
  if (!isLocalStorageAvailable()) return null;

  try {
    const stored = localStorage.getItem(getStorageKey(dataset));
    if (!stored) return null;

    const data = JSON.parse(stored);

    if (!validatePersistedState(data)) {
      localStorage.removeItem(getStorageKey(dataset));
      return null;
    }

    if (data.version !== STORAGE_VERSION) {
      localStorage.removeItem(getStorageKey(dataset));
      return null;
    }

    if (data.dataset !== dataset) {
      localStorage.removeItem(getStorageKey(dataset));
      return null;
    }

    return data.state;
  } catch (error) {
    void error;
    localStorage.removeItem(getStorageKey(dataset));
    return null;
  }
}

export function clearSessionState(dataset: string): void {
  if (!isLocalStorageAvailable()) return;
  localStorage.removeItem(getStorageKey(dataset));
}

export function clearAllSessionStates(): void {
  if (!isLocalStorageAvailable()) return;

  const keysToRemove: string[] = [];
  for (const key in localStorage) {
    if (key.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
