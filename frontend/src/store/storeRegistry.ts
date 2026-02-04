type CurrentDatasetGetter = () => string;
type PredicateStateGetter = () => {
  predicates: unknown[];
  constraints: unknown[];
  setOperations: Record<string, unknown>;
};
type PredicateStateLoader = () => void;

let _getCurrentDataset: CurrentDatasetGetter | null = null;
let _getPredicateState: PredicateStateGetter | null = null;
let _loadPredicateState: PredicateStateLoader | null = null;

export function registerCurrentDatasetGetter(fn: CurrentDatasetGetter): void {
  _getCurrentDataset = fn;
}

export function registerPredicateStateHandlers(
  getState: PredicateStateGetter,
  loadState: PredicateStateLoader,
): void {
  _getPredicateState = getState;
  _loadPredicateState = loadState;
}

export function getCurrentDataset(): string {
  return _getCurrentDataset?.() ?? "";
}

export function getPredicateState(): {
  predicates: unknown[];
  constraints: unknown[];
  setOperations: Record<string, unknown>;
} {
  return (
    _getPredicateState?.() ?? {
      predicates: [],
      constraints: [],
      setOperations: {},
    }
  );
}

export function loadPersistedPredicateState(): void {
  _loadPredicateState?.();
}
