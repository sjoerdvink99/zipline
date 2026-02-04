import { create } from "zustand";
import {
  applyPredicates as apiApplyPredicates,
  inferSelectionPredicates,
  type GeneratedPredicate,
  type PredicateSet,
  type ApplyPredicateSpec,
  type TopologyPredicate,
  type AttributePredicate,
  type DescribeSelectionResponse,
} from "../api/predicates";
import { type SearchResult } from "../api/search";
import {
  saveSessionState,
  loadSessionState,
  clearSessionState,
  type PersistedSessionState,
} from "../utils/persistence";
import type { FilterItem } from "../types/fol";
import type { LearnedPredicate } from "../api/learning";

export type SelectionSource =
  | "topology"
  | "attribute"
  | "predicate"
  | "search"
  | null;

export interface SavedPredicate {
  id: string;
  name: string;
  predicates: GeneratedPredicate[];
  combineOp: "and" | "or";
  createdAt: string;
}

export interface SavedFilterChain {
  id: string;
  name: string;
  predicateIds: string[];
  setOperations: Record<string, "and" | "or" | "not">;
  createdAt: string;
}

export interface FavoritedClause {
  id: string;
  label: string;
  predicate: LearnedPredicate;
  savedAt: string;
  datasetName: string;
}

export interface PinnedSelection {
  id: string;
  label: string;
  nodes: string[];
  colorIndex: number;
}

interface AnalysisState {
  selectedNodes: string[];
  selectionSource: SelectionSource;
  generatedPredicates: GeneratedPredicate[];
  generatedPredicateSets: PredicateSet[];
  selectionMatches: any[];
  activePredicateSetId: string | null;
  activePredicateIds: Set<string>;
  predicateCombineOp: "and" | "or";
  savedPredicates: SavedPredicate[];
  savedFilterChains: SavedFilterChain[];
  predicateMatchNodes: string[];
  stagedPredicates: GeneratedPredicate[];
  stagedCombineOp: "and" | "or";
  nodePredicates: GeneratedPredicate[];
  nodePredicateSets: PredicateSet[];

  descriptiveResponse: DescribeSelectionResponse | null;
  topologyPredicates: TopologyPredicate[];
  attributePredicates: AttributePredicate[];
  isGeneratingPredicates: boolean;
  isApplyingPredicates: boolean;
  currentDataset: string;

  searchResults: SearchResult[];
  isSearching: boolean;
  searchQuery: string;

  activeFilterItems: FilterItem[];
  activeFilterOperations: Record<string, "and" | "or" | "not">;

  highlightedNodes: Set<string>;
  previewSelection: string[];
  isPreviewMode: boolean;
  selectionHistory: Array<{
    nodes: string[];
    source: SelectionSource;
    timestamp: number;
  }>;
  crossSpaceHighlights: Map<
    string,
    { nodes: string[]; color: string; label: string }
  >;

  pathAnchorNodes: string[];
  pathSelection: {
    isActive: boolean;
    paths: string[][];
    pathNodes: Set<string>;
    pathEdges: Array<{ source: string; target: string }>;
  };

  contrastMode: boolean;
  contrastNodes: string[];
  activeSlot: "positive" | "negative";

  pinnedSelections: PinnedSelection[];

  setSelection: (nodes: string[], source: SelectionSource) => void;
  clearSelection: () => void;
  selectPredicateSet: (setId: string | null) => void;
  togglePredicate: (predicateId: string) => void;
  setAllPredicatesActive: (active: boolean) => void;
  setCombineOp: (op: "and" | "or") => void;
  savePredicate: (name: string) => void;
  savePredicateDirect: (predicate: GeneratedPredicate) => void;
  removeSavedPredicate: (id: string) => void;
  updateSavedPredicate: (
    id: string,
    updates: Partial<
      Pick<SavedPredicate, "name" | "combineOp"> & {
        predicates: GeneratedPredicate[];
      }
    >,
  ) => void;
  reorderSavedPredicates: (fromIndex: number, toIndex: number) => void;
  applySavedPredicate: (id: string) => void;
  saveFilterChain: (
    name: string,
    predicateIds: string[],
    setOperations: Record<string, "and" | "or" | "not">,
  ) => void;
  loadFilterChain: (id: string) => void;
  removeSavedFilterChain: (id: string) => void;
  getSavedFilterChains: () => SavedFilterChain[];
  generatePredicatesForSelection: (
    nodes?: string[],
    source?: SelectionSource,
  ) => Promise<void>;
  applyActivePredicates: () => Promise<string[]>;
  setCurrentDataset: (dataset: string) => void;
  reset: () => void;
  addStagedPredicate: (predicate: GeneratedPredicate) => void;
  removeStagedPredicate: (predicateId: string) => void;
  clearStagedPredicates: () => void;
  setStagedCombineOp: (op: "and" | "or") => void;
  applyStagedPredicates: () => Promise<void>;

  setSearchResults: (results: SearchResult[]) => void;
  setSearching: (isSearching: boolean) => void;
  setSearchQuery: (query: string) => void;
  selectFromSearch: (nodeId: string, addToSelection?: boolean) => void;

  addFilterItem: (item: FilterItem) => void;
  removeFilterItem: (id: string) => void;
  updateFilterItem: (id: string, updates: Partial<FilterItem>) => void;
  setFilterOperation: (id: string, operation: "and" | "or" | "not") => void;
  clearFilterChain: () => void;

  setHighlightedNodes: (nodes: string[]) => void;
  clearHighlights: () => void;
  setPreviewSelection: (nodes: string[], enable: boolean) => void;
  commitPreviewSelection: (source: SelectionSource) => void;
  cancelPreviewSelection: () => void;
  addCrossSpaceHighlight: (
    id: string,
    nodes: string[],
    color: string,
    label: string,
  ) => void;
  removeCrossSpaceHighlight: (id: string) => void;
  clearCrossSpaceHighlights: () => void;
  getSelectionHistory: () => Array<{
    nodes: string[];
    source: SelectionSource;
    timestamp: number;
  }>;
  undoSelection: () => void;

  setPredicateMatchNodes: (nodes: string[]) => void;
  clearPredicateMatches: () => void;

  setPathAnchorNodes: (nodes: string[]) => void;
  clearPathSelection: () => void;
  setPathResults: (result: {
    isActive: boolean;
    paths: string[][];
    pathNodes: Set<string>;
    pathEdges: Array<{ source: string; target: string }>;
  }) => void;

  enterContrastMode: () => void;
  exitContrastMode: () => void;
  setContrastNodes: (nodes: string[]) => void;
  setActiveSlot: (slot: "positive" | "negative") => void;
  removeSharedFromContrast: () => void;

  pinSelection: (label?: string) => void;
  unpinSelection: (id: string) => void;
  clearPinnedSelections: () => void;
  renamePinnedSelection: (id: string, label: string) => void;
  loadPinnedSelection: (id: string) => void;
  applySetOperation: (op: "intersection" | "union" | "difference", pinAId: string, pinBId: string) => void;

  favoritedClauses: FavoritedClause[];
  addFavoriteClause: (predicate: LearnedPredicate) => void;
  removeFavoriteClause: (id: string) => void;
  isFavoriteClause: (fol_expression: string) => boolean;

  saveSessionState: () => void;
  loadSessionState: () => boolean;
  clearSessionState: () => void;
}

const SAVED_PREDICATES_KEY_PREFIX = "zipline_saved_predicates_";
const SAVED_FILTER_CHAINS_KEY_PREFIX = "zipline_saved_filter_chains_";
const FAVORITED_CLAUSES_KEY_PREFIX = "zipline_favorites_";

let currentGenerationRequestId = 0;

function loadSavedPredicates(dataset: string): SavedPredicate[] {
  try {
    const stored = localStorage.getItem(SAVED_PREDICATES_KEY_PREFIX + dataset);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    void err;
    return [];
  }
}

function persistSavedPredicates(
  dataset: string,
  predicates: SavedPredicate[],
): void {
  try {
    localStorage.setItem(
      SAVED_PREDICATES_KEY_PREFIX + dataset,
      JSON.stringify(predicates),
    );
  } catch (err) {
    void err;
  }
}

function loadSavedFilterChains(dataset: string): SavedFilterChain[] {
  try {
    const stored = localStorage.getItem(
      SAVED_FILTER_CHAINS_KEY_PREFIX + dataset,
    );
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    void err;
    return [];
  }
}

function persistSavedFilterChains(
  dataset: string,
  filterChains: SavedFilterChain[],
): void {
  try {
    localStorage.setItem(
      SAVED_FILTER_CHAINS_KEY_PREFIX + dataset,
      JSON.stringify(filterChains),
    );
  } catch (err) {
    void err;
  }
}

function loadFavoritedClauses(dataset: string): FavoritedClause[] {
  try {
    const stored = localStorage.getItem(FAVORITED_CLAUSES_KEY_PREFIX + dataset);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function persistFavoritedClauses(
  dataset: string,
  clauses: FavoritedClause[],
): void {
  try {
    localStorage.setItem(
      FAVORITED_CLAUSES_KEY_PREFIX + dataset,
      JSON.stringify(clauses),
    );
  } catch {
  }
}

function deriveClauseLabel(fol_expression: string): string {
  const ascii = fol_expression
    .replace(/∃/g, "exists")
    .replace(/∀/g, "forall")
    .replace(/∧/g, "and")
    .replace(/∨/g, "or")
    .replace(/¬/g, "not")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/≠/g, "!=")
    .replace(/∈/g, "in");
  return ascii.length > 40 ? ascii.slice(0, 40) + "…" : ascii;
}

function generateUniqueId(): string {
  return `saved_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function formatLabelScope(labelScope?: string | string[]): string {
  if (!labelScope) return "";
  if (Array.isArray(labelScope)) {
    return labelScope.length > 0 ? `${labelScope[0]}: ` : "";
  }
  return `${labelScope}: `;
}

function formatPredicateName(predicate: GeneratedPredicate): string {
  const labelPrefix = formatLabelScope(predicate.label_scope);
  const attr = predicate.attribute.replace(/_/g, " ");
  if (predicate.operator === "between" && predicate.value2 !== undefined) {
    return `${labelPrefix}${attr} [${Number(predicate.value).toFixed(1)}-${Number(
      predicate.value2,
    ).toFixed(1)}]`;
  }
  if (predicate.operator === "=") {
    return `${labelPrefix}${attr} = ${predicate.value}`;
  }
  return `${labelPrefix}${attr} ${predicate.operator} ${predicate.value}`;
}

function labelScopesMatch(
  scope1?: string | string[],
  scope2?: string | string[],
): boolean {
  if (!scope1 && !scope2) return true;
  if (!scope1 || !scope2) return false;

  const arr1 = Array.isArray(scope1) ? scope1 : [scope1];
  const arr2 = Array.isArray(scope2) ? scope2 : [scope2];

  if (arr1.length !== arr2.length) return false;
  const set1 = new Set(arr1);
  return arr2.every((s) => set1.has(s));
}

function toPredicateSpec(p: GeneratedPredicate): ApplyPredicateSpec {
  return {
    attribute: p.attribute,
    operator: p.operator,
    value: p.value,
    value2: p.value2,
    is_structural: p.is_structural,
    attribute_type: p.attribute_type,
    label_scope: p.label_scope,
  };
}

const initialState = {
  selectedNodes: [] as string[],
  selectionSource: null as SelectionSource,
  generatedPredicates: [] as GeneratedPredicate[],
  generatedPredicateSets: [] as PredicateSet[],
  selectionMatches: [] as any[],
  activePredicateSetId: null as string | null,
  activePredicateIds: new Set<string>(),
  predicateCombineOp: "and" as const,
  savedPredicates: [] as SavedPredicate[],
  savedFilterChains: [] as SavedFilterChain[],
  favoritedClauses: [] as FavoritedClause[],
  predicateMatchNodes: [] as string[],
  stagedPredicates: [] as GeneratedPredicate[],
  stagedCombineOp: "and" as const,
  nodePredicates: [] as GeneratedPredicate[],
  nodePredicateSets: [] as PredicateSet[],

  descriptiveResponse: null as DescribeSelectionResponse | null,
  topologyPredicates: [] as TopologyPredicate[],
  attributePredicates: [] as AttributePredicate[],

  isGeneratingPredicates: false,
  isApplyingPredicates: false,
  currentDataset: "bron_threat_intel",

  searchResults: [] as SearchResult[],
  isSearching: false,
  searchQuery: "",

  activeFilterItems: [] as FilterItem[],
  activeFilterOperations: {} as Record<string, "and" | "or" | "not">,

  highlightedNodes: new Set<string>(),
  previewSelection: [] as string[],
  isPreviewMode: false,
  selectionHistory: [] as Array<{
    nodes: string[];
    source: SelectionSource;
    timestamp: number;
  }>,
  crossSpaceHighlights: new Map<
    string,
    { nodes: string[]; color: string; label: string }
  >(),

  pathAnchorNodes: [] as string[],
  pathSelection: {
    isActive: false,
    paths: [] as string[][],
    pathNodes: new Set<string>(),
    pathEdges: [] as Array<{ source: string; target: string }>,
  },

  contrastMode: false,
  contrastNodes: [] as string[],
  activeSlot: "negative" as "positive" | "negative",

  pinnedSelections: [] as PinnedSelection[],
};

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  ...initialState,

  setSelection: (nodes, source) => {
    if (get().contrastMode && get().activeSlot === "negative" && nodes.length > 0) {
      set({ contrastNodes: nodes });
      return;
    }

    const { selectedNodes, selectionHistory } = get();

    const newHistoryEntry = {
      nodes: selectedNodes.slice(),
      source: get().selectionSource,
      timestamp: Date.now(),
    };

    const updatedHistory =
      selectedNodes.length > 0
        ? [newHistoryEntry, ...selectionHistory.slice(0, 9)]
        : selectionHistory;

    if (nodes.length === 0) {
      set({
        selectedNodes: [],
        selectionSource: null,
        selectionHistory: updatedHistory,
        generatedPredicates: [],
        generatedPredicateSets: [],
        selectionMatches: [],
        activePredicateSetId: null,
        activePredicateIds: new Set(),
        predicateMatchNodes: [],
        nodePredicates: [],
        nodePredicateSets: [],
        descriptiveResponse: null,
      });
    } else {
      set({
        selectedNodes: nodes,
        selectionSource: source,
        selectionHistory: updatedHistory,
        generatedPredicates: [],
        generatedPredicateSets: [],
        selectionMatches: [],
        activePredicateSetId: null,
        activePredicateIds: new Set(),
        predicateMatchNodes: [],
        nodePredicates: [],
        nodePredicateSets: [],
        isGeneratingPredicates: nodes.length > 0,
        descriptiveResponse: null,
        topologyPredicates: [],
        attributePredicates: [],
        isPreviewMode: false,
        previewSelection: [],
        crossSpaceHighlights: new Map(),
        highlightedNodes: new Set(),
      });
    }

    if (nodes.length > 0) {
      get().generatePredicatesForSelection(nodes, source);
    }
  },

  clearSelection: () => {
    set({
      selectedNodes: [],
      selectionSource: null,
      generatedPredicates: [],
      generatedPredicateSets: [],
      selectionMatches: [],
      activePredicateSetId: null,
      activePredicateIds: new Set(),
      predicateMatchNodes: [],
      descriptiveResponse: null,
      topologyPredicates: [],
      attributePredicates: [],
      highlightedNodes: new Set(),
      previewSelection: [],
      isPreviewMode: false,
      crossSpaceHighlights: new Map(),
      contrastMode: false,
      contrastNodes: [],
    });
  },

  selectPredicateSet: (setId: string | null) => {
    const { generatedPredicateSets, nodePredicateSets } = get();
    const allSets = [...generatedPredicateSets, ...nodePredicateSets];
    const selectedSet = setId ? allSets.find((s) => s.id === setId) : null;

    if (selectedSet) {
      set({
        activePredicateSetId: setId,
        activePredicateIds: new Set(selectedSet.predicates.map((p) => p.id)),
        predicateCombineOp: selectedSet.combine_op,
      });
      get().applyActivePredicates();
    } else {
      set({
        activePredicateSetId: null,
        activePredicateIds: new Set(),
        predicateMatchNodes: [],
      });
    }
  },

  togglePredicate: (predicateId) => {
    const { activePredicateIds } = get();
    const newActive = new Set(activePredicateIds);

    if (newActive.has(predicateId)) {
      newActive.delete(predicateId);
    } else {
      newActive.add(predicateId);
    }

    set({ activePredicateIds: newActive });
    get().applyActivePredicates();
  },

  setAllPredicatesActive: (active) => {
    const { generatedPredicates } = get();
    set({
      activePredicateIds: active
        ? new Set(generatedPredicates.map((p) => p.id))
        : new Set(),
    });
    get().applyActivePredicates();
  },

  setCombineOp: (op) => {
    set({ predicateCombineOp: op });
    get().applyActivePredicates();
  },

  savePredicate: (name) => {
    const {
      generatedPredicates,
      generatedPredicateSets,
      nodePredicates,
      nodePredicateSets,
      activePredicateSetId,
      activePredicateIds,
      predicateCombineOp,
      savedPredicates,
      currentDataset,
    } = get();

    let activePredicates: GeneratedPredicate[] = [];
    let combineOp = predicateCombineOp;

    if (activePredicateSetId) {
      const allSets = [...generatedPredicateSets, ...nodePredicateSets];
      const activeSet = allSets.find((s) => s.id === activePredicateSetId);
      if (activeSet) {
        activePredicates = activeSet.predicates.filter((p) =>
          activePredicateIds.has(p.id),
        );
        combineOp = activeSet.combine_op;
      }
    }

    if (activePredicates.length === 0) {
      const allPredicates = [...generatedPredicates, ...nodePredicates];
      activePredicates = allPredicates.filter((p) =>
        activePredicateIds.has(p.id),
      );
    }

    if (activePredicates.length === 0) return;

    const newSaved: SavedPredicate = {
      id: generateUniqueId(),
      name,
      predicates: activePredicates,
      combineOp,
      createdAt: new Date().toISOString(),
    };

    const updated = [newSaved, ...savedPredicates];
    set({ savedPredicates: updated });
    persistSavedPredicates(currentDataset, updated);
  },

  savePredicateDirect: (predicate) => {
    const { savedPredicates, currentDataset } = get();

    const filterItem = {
      id: `attr-${predicate.id}`,
      type: "attribute",
      predicate: predicate,
      description: formatPredicateName(predicate),
      nodeTypes:
        predicate.applicable_node_types ||
        (predicate.label_scope
          ? Array.isArray(predicate.label_scope)
            ? predicate.label_scope
            : [predicate.label_scope]
          : undefined),
    };

    window.dispatchEvent(
      new CustomEvent("gb:add-filter-item", { detail: filterItem }),
    );

    if (
      predicate.operator === "between" &&
      predicate.attribute_type === "numeric"
    ) {
      const existingIdx = savedPredicates.findIndex(
        (sp) =>
          sp.predicates.length === 1 &&
          sp.predicates[0].attribute === predicate.attribute &&
          sp.predicates[0].operator === "between" &&
          labelScopesMatch(sp.predicates[0].label_scope, predicate.label_scope),
      );

      if (existingIdx !== -1) {
        const existing = savedPredicates[existingIdx];
        const existingPred = existing.predicates[0];

        const newMin = Math.min(
          Number(existingPred.value),
          Number(predicate.value),
        );
        const newMax = Math.max(
          Number(existingPred.value2),
          Number(predicate.value2),
        );

        const mergedPredicate: GeneratedPredicate = {
          ...existingPred,
          value: newMin,
          value2: newMax,
          match_count:
            (existingPred.match_count || 0) + (predicate.match_count || 0),
        };

        const mergedSaved: SavedPredicate = {
          ...existing,
          name: formatPredicateName(mergedPredicate),
          predicates: [mergedPredicate],
        };

        const updated = [...savedPredicates];
        updated[existingIdx] = mergedSaved;
        set({ savedPredicates: updated });
        persistSavedPredicates(currentDataset, updated);
        return;
      }
    }

    const newSaved: SavedPredicate = {
      id: generateUniqueId(),
      name: formatPredicateName(predicate),
      predicates: [predicate],
      combineOp: "and",
      createdAt: new Date().toISOString(),
    };

    const updated = [newSaved, ...savedPredicates];
    set({ savedPredicates: updated });
    persistSavedPredicates(currentDataset, updated);
  },

  removeSavedPredicate: (id) => {
    const { savedPredicates, currentDataset } = get();
    const updated = savedPredicates.filter((p) => p.id !== id);
    set({ savedPredicates: updated });
    persistSavedPredicates(currentDataset, updated);
  },

  updateSavedPredicate: (id, updates) => {
    const { savedPredicates, currentDataset } = get();
    const updated = savedPredicates.map((p) =>
      p.id === id ? { ...p, ...updates } : p,
    );
    set({ savedPredicates: updated });
    persistSavedPredicates(currentDataset, updated);
  },

  reorderSavedPredicates: (fromIndex, toIndex) => {
    const { savedPredicates, currentDataset } = get();
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= savedPredicates.length) return;
    if (toIndex < 0 || toIndex >= savedPredicates.length) return;

    const updated = [...savedPredicates];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    set({ savedPredicates: updated });
    persistSavedPredicates(currentDataset, updated);
  },

  applySavedPredicate: async (id) => {
    const { savedPredicates } = get();
    const saved = savedPredicates.find((p) => p.id === id);
    if (!saved) return;

    set({ isApplyingPredicates: true });

    try {
      const result = await apiApplyPredicates({
        predicates: saved.predicates.map(toPredicateSpec),
        combine_op: saved.combineOp || "and",
      });

      if (result.matching_node_ids.length === 0) {
        set({
          selectedNodes: [],
          selectionSource: null,
          predicateMatchNodes: [],
          generatedPredicates: [],
          generatedPredicateSets: [],
          selectionMatches: [],
          activePredicateSetId: null,
          descriptiveResponse: null,
        });
      } else {
        set({
          selectedNodes: result.matching_node_ids,
          selectionSource: "predicate",
          predicateMatchNodes: result.matching_node_ids,
        });
      }
    } catch (err) {
      void err;
    } finally {
      set({ isApplyingPredicates: false });
    }
  },

  generatePredicatesForSelection: async (nodes) => {
    const selectedNodes = nodes ?? get().selectedNodes;
    if (selectedNodes.length === 0) return;

    const requestId = ++currentGenerationRequestId;

    set({ isGeneratingPredicates: true });

    try {
      const result = await inferSelectionPredicates({
        selected_nodes: selectedNodes,
        include_cross_space: true,
        max_predicates_per_type: 10,
        min_coverage: 0.6,
        min_selectivity: 0.1,
      });

      if (requestId !== currentGenerationRequestId) return;

      const convertedTopologyPredicates: TopologyPredicate[] =
        result.topology_predicates.map((tp, idx) => ({
          id: `topo_${idx}_${Date.now()}`,
          attribute: tp.metric,
          operator: tp.operator,
          value: tp.threshold,
          description: tp.fol_expression,
          applicable_nodes: tp.matching_nodes,
        }));

      const convertedAttributePredicates: AttributePredicate[] =
        result.attribute_predicates.map((ap, idx) => ({
          id: `attr_${idx}_${Date.now()}`,
          attribute: ap.attribute,
          operator: ap.operator,
          value: ap.value,
          attribute_type:
            typeof ap.value === "number"
              ? "numeric"
              : typeof ap.value === "boolean"
                ? "boolean"
                : "categorical",
          description: ap.fol_expression,
          applicable_nodes: ap.matching_nodes,
        }));

      set({
        generatedPredicates: [],
        generatedPredicateSets: [],
        selectionMatches: [],
        activePredicateSetId: null,
        activePredicateIds: new Set(),
        predicateMatchNodes: [],
        nodePredicates: [],
        nodePredicateSets: [],

        descriptiveResponse: {
          selection_count: selectedNodes.length,
          total_nodes: 0,
          node_type_distribution: {},
          topology_predicates: convertedTopologyPredicates,
          attribute_predicates: convertedAttributePredicates,
        },
        topologyPredicates: convertedTopologyPredicates,
        attributePredicates: convertedAttributePredicates,
      });
    } catch (err) {
      void err;
      if (requestId === currentGenerationRequestId) {
        set({
          descriptiveResponse: null,
          topologyPredicates: [],
          attributePredicates: [],
        });
      }
    } finally {
      if (requestId === currentGenerationRequestId) {
        set({ isGeneratingPredicates: false });
      }
    }
  },

  applyActivePredicates: async () => {
    const {
      generatedPredicates,
      generatedPredicateSets,
      nodePredicates,
      nodePredicateSets,
      activePredicateSetId,
      activePredicateIds,
      predicateCombineOp,
    } = get();

    let activePredicates: GeneratedPredicate[] = [];

    if (activePredicateSetId) {
      const allSets = [...generatedPredicateSets, ...nodePredicateSets];
      const activeSet = allSets.find((s) => s.id === activePredicateSetId);
      if (activeSet) {
        activePredicates = activeSet.predicates.filter((p) =>
          activePredicateIds.has(p.id),
        );
      }
    }

    if (activePredicates.length === 0) {
      const allPredicates = [...generatedPredicates, ...nodePredicates];
      activePredicates = allPredicates.filter((p) =>
        activePredicateIds.has(p.id),
      );
    }

    if (activePredicates.length === 0) {
      set({ predicateMatchNodes: [] });
      return [];
    }

    set({ isApplyingPredicates: true });

    try {
      const result = await apiApplyPredicates({
        predicates: activePredicates.map(toPredicateSpec),
        combine_op: predicateCombineOp,
      });

      set({ predicateMatchNodes: result.matching_node_ids });
      return result.matching_node_ids;
    } catch (err) {
      void err;
      set({ predicateMatchNodes: [] });
      return [];
    } finally {
      set({ isApplyingPredicates: false });
    }
  },

  saveFilterChain: (name, predicateIds, setOperations) => {
    const { currentDataset, savedFilterChains } = get();

    const newFilterChain: SavedFilterChain = {
      id: generateUniqueId(),
      name,
      predicateIds,
      setOperations,
      createdAt: new Date().toISOString(),
    };

    const updated = [newFilterChain, ...savedFilterChains];
    set({ savedFilterChains: updated });
    persistSavedFilterChains(currentDataset, updated);
  },

  loadFilterChain: (id) => {
    const { savedFilterChains, savedPredicates } = get();
    const filterChain = savedFilterChains.find((fc) => fc.id === id);
    if (!filterChain) return;

    const validPredicates = filterChain.predicateIds
      .map((predId) => savedPredicates.find((sp) => sp.id === predId))
      .filter((pred): pred is SavedPredicate => pred !== undefined);

    if (validPredicates.length === 0) return;

    set({
      savedPredicates: [
        ...savedPredicates.filter(
          (sp) => !validPredicates.some((vp) => vp.id === sp.id),
        ),
        ...validPredicates,
      ],
    });
  },

  removeSavedFilterChain: (id) => {
    const { savedFilterChains, currentDataset } = get();
    const updated = savedFilterChains.filter((fc) => fc.id !== id);
    set({ savedFilterChains: updated });
    persistSavedFilterChains(currentDataset, updated);
  },

  getSavedFilterChains: () => {
    return get().savedFilterChains;
  },

  setCurrentDataset: (dataset) => {
    set({
      currentDataset: dataset,
      savedPredicates: loadSavedPredicates(dataset),
      savedFilterChains: loadSavedFilterChains(dataset),
      favoritedClauses: loadFavoritedClauses(dataset),
      selectedNodes: [],
      selectionSource: null,
      generatedPredicates: [],
      activePredicateIds: new Set(),
      predicateMatchNodes: [],
      activeFilterItems: [],
      activeFilterOperations: {},
      stagedPredicates: [],
      generatedPredicateSets: [],
      selectionMatches: [],
      activePredicateSetId: null,
      nodePredicates: [],
      nodePredicateSets: [],
      descriptiveResponse: null,
      topologyPredicates: [],
      attributePredicates: [],
      highlightedNodes: new Set(),
      previewSelection: [],
      isPreviewMode: false,
      crossSpaceHighlights: new Map(),
    });
  },

  reset: () => {
    set({
      selectedNodes: [],
      selectionSource: null,
      generatedPredicates: [],
      activePredicateIds: new Set(),
      predicateMatchNodes: [],
      stagedPredicates: [],
      isGeneratingPredicates: false,
      isApplyingPredicates: false,
      contrastMode: false,
      contrastNodes: [],
    });
  },

  addStagedPredicate: (predicate) => {
    const { stagedPredicates } = get();

    const exists = stagedPredicates.some(
      (f) =>
        f.attribute === predicate.attribute &&
        f.operator === predicate.operator &&
        f.value === predicate.value &&
        f.value2 === predicate.value2,
    );

    if (exists) return;

    set({ stagedPredicates: [...stagedPredicates, predicate] });
    get().applyStagedPredicates();
  },

  removeStagedPredicate: (predicateId) => {
    const { stagedPredicates } = get();
    const newPredicates = stagedPredicates.filter((f) => f.id !== predicateId);
    set({ stagedPredicates: newPredicates });

    if (newPredicates.length > 0) {
      get().applyStagedPredicates();
    } else {
      set({
        selectedNodes: [],
        selectionSource: null,
        predicateMatchNodes: [],
      });
    }
  },

  clearStagedPredicates: () => {
    set({
      stagedPredicates: [],
      selectedNodes: [],
      selectionSource: null,
      predicateMatchNodes: [],
    });
  },

  setStagedCombineOp: (op) => {
    set({ stagedCombineOp: op });
    const { stagedPredicates } = get();
    if (stagedPredicates.length > 0) {
      get().applyStagedPredicates();
    }
  },

  applyStagedPredicates: async () => {
    const { stagedPredicates, stagedCombineOp } = get();

    if (stagedPredicates.length === 0) {
      set({
        selectedNodes: [],
        selectionSource: null,
        predicateMatchNodes: [],
      });
      return;
    }

    set({ isApplyingPredicates: true });

    try {
      const result = await apiApplyPredicates({
        predicates: stagedPredicates.map(toPredicateSpec),
        combine_op: stagedCombineOp,
      });

      if (result.matching_node_ids.length === 0) {
        set({
          selectedNodes: [],
          selectionSource: null,
          predicateMatchNodes: [],
          generatedPredicates: [],
          generatedPredicateSets: [],
          selectionMatches: [],
          activePredicateSetId: null,
          descriptiveResponse: null,
        });
      } else {
        set({
          selectedNodes: result.matching_node_ids,
          selectionSource: "attribute",
          predicateMatchNodes: result.matching_node_ids,
        });
      }
    } catch (err) {
      void err;
    } finally {
      set({ isApplyingPredicates: false });
    }
  },

  setSearchResults: (results) => {
    set({ searchResults: results });
  },

  setSearching: (isSearching) => {
    set({ isSearching });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  selectFromSearch: (nodeId, addToSelection = false) => {
    const { contrastMode, activeSlot, selectedNodes } = get();

    if (contrastMode && activeSlot === "negative") {
      const selectedSet = new Set(selectedNodes);
      const node = selectedSet.has(nodeId) ? [] : [nodeId];
      set({
        contrastNodes: node.length > 0 ? node : [nodeId],
        searchQuery: "",
        searchResults: [],
      });
      return;
    }

    if (addToSelection && selectedNodes.length > 0 && !new Set(selectedNodes).has(nodeId)) {
      const newNodes = [...selectedNodes, nodeId];
      set({ searchQuery: "", searchResults: [] });
      get().setSelection(newNodes, "search");
      return;
    }

    set({
      selectedNodes: [nodeId],
      selectionSource: "search",
      searchQuery: "",
      searchResults: [],
      generatedPredicates: [],
      generatedPredicateSets: [],
      selectionMatches: [],
      activePredicateSetId: null,
      activePredicateIds: new Set(),
      predicateMatchNodes: [],
      nodePredicates: [],
      nodePredicateSets: [],
      isGeneratingPredicates: true,
    });

    get().generatePredicatesForSelection([nodeId], "search");
  },

  addFilterItem: (item) => {
    const { activeFilterItems } = get();
    set({ activeFilterItems: [...activeFilterItems, item] });
  },

  removeFilterItem: (id) => {
    const { activeFilterItems, activeFilterOperations } = get();
    const updatedItems = activeFilterItems.filter((item) => item.id !== id);
    const updatedOperations = { ...activeFilterOperations };
    delete updatedOperations[id];
    set({
      activeFilterItems: updatedItems,
      activeFilterOperations: updatedOperations,
    });
  },

  updateFilterItem: (id, updates) => {
    const { activeFilterItems } = get();
    const updatedItems = activeFilterItems.map((item) =>
      item.id === id ? { ...item, ...updates } : item,
    ) as FilterItem[];
    set({ activeFilterItems: updatedItems });
  },

  setFilterOperation: (id, operation) => {
    const { activeFilterOperations } = get();
    set({
      activeFilterOperations: { ...activeFilterOperations, [id]: operation },
    });
  },

  clearFilterChain: () => {
    set({
      activeFilterItems: [],
      activeFilterOperations: {},
    });
  },

  setHighlightedNodes: (nodes) => {
    set({ highlightedNodes: new Set(nodes) });
  },

  clearHighlights: () => {
    set({ highlightedNodes: new Set() });
  },

  setPreviewSelection: (nodes, enable) => {
    set({
      previewSelection: nodes,
      isPreviewMode: enable,
    });
  },

  commitPreviewSelection: (source) => {
    const { previewSelection } = get();
    if (previewSelection.length > 0) {
      get().setSelection(previewSelection, source);
    }
  },

  cancelPreviewSelection: () => {
    set({
      previewSelection: [],
      isPreviewMode: false,
    });
  },

  addCrossSpaceHighlight: (id, nodes, color, label) => {
    const { crossSpaceHighlights } = get();
    const updated = new Map(crossSpaceHighlights);
    updated.set(id, { nodes, color, label });
    set({ crossSpaceHighlights: updated });
  },

  removeCrossSpaceHighlight: (id) => {
    const { crossSpaceHighlights } = get();
    const updated = new Map(crossSpaceHighlights);
    updated.delete(id);
    set({ crossSpaceHighlights: updated });
  },

  clearCrossSpaceHighlights: () => {
    set({ crossSpaceHighlights: new Map() });
  },

  getSelectionHistory: () => {
    return get().selectionHistory;
  },

  undoSelection: () => {
    const { selectionHistory } = get();
    if (selectionHistory.length > 0) {
      const [previous, ...remaining] = selectionHistory;
      set({
        selectedNodes: previous.nodes,
        selectionSource: previous.source,
        selectionHistory: remaining,
        generatedPredicates: [],
        generatedPredicateSets: [],
        selectionMatches: [],
        activePredicateSetId: null,
        activePredicateIds: new Set(),
        predicateMatchNodes: [],
        nodePredicates: [],
        nodePredicateSets: [],
        isGeneratingPredicates: previous.nodes.length > 0,
        descriptiveResponse: null,
        topologyPredicates: [],
        attributePredicates: [],
        isPreviewMode: false,
        previewSelection: [],
      });

      if (previous.nodes.length > 0) {
        get().generatePredicatesForSelection(previous.nodes, previous.source);
      }
    }
  },

  saveSessionState: () => {
    const state = get();

    let predicateState = { predicates: [], constraints: [], setOperations: {} };
    try {
      if (typeof window !== "undefined" && (window as any).__predicateStore) {
        const predicateStoreState = (window as any).__predicateStore.getState();
        predicateState = {
          predicates: predicateStoreState.predicates || [],
          constraints: predicateStoreState.constraints || [],
          setOperations: predicateStoreState.setOperations || {},
        };
      }
    } catch (error) {
      void error;
    }

    const sessionState: PersistedSessionState["state"] = {
      selectedNodes: state.selectedNodes,
      selectionSource: state.selectionSource,
      activeFilterItems: state.activeFilterItems,
      activeFilterOperations: state.activeFilterOperations,
      ...predicateState,
    };

    saveSessionState(state.currentDataset, sessionState);
  },

  loadSessionState: () => {
    const state = get();
    const persistedState = loadSessionState(state.currentDataset);

    if (persistedState) {
      set({
        selectedNodes: persistedState.selectedNodes || [],
        selectionSource:
          (persistedState.selectionSource as SelectionSource) || null,
        activeFilterItems: persistedState.activeFilterItems || [],
        activeFilterOperations: persistedState.activeFilterOperations || {},
      });

      try {
        if (
          typeof window !== "undefined" &&
          (window as any).__predicateStore &&
          persistedState.predicates
        ) {
          const predicateStore = (window as any).__predicateStore.getState();
          predicateStore.loadPredicateState();
        }
      } catch (error) {
        void error;
      }

      if (
        persistedState.selectedNodes &&
        persistedState.selectedNodes.length > 0
      ) {
        setTimeout(() => {
          get().generatePredicatesForSelection(
            persistedState.selectedNodes,
            persistedState.selectionSource as SelectionSource,
          );
        }, 100);
      }

      return true;
    }

    return false;
  },

  clearSessionState: () => {
    const { currentDataset } = get();
    clearSessionState(currentDataset);
  },

  addFavoriteClause: (predicate) => {
    const { favoritedClauses, currentDataset } = get();
    const alreadyExists = favoritedClauses.some(
      (c) => c.predicate.fol_expression === predicate.fol_expression,
    );
    if (alreadyExists) return;
    const clause: FavoritedClause = {
      id: crypto.randomUUID(),
      label: deriveClauseLabel(predicate.fol_expression),
      predicate,
      savedAt: new Date().toISOString(),
      datasetName: currentDataset,
    };
    const updated = [clause, ...favoritedClauses];
    set({ favoritedClauses: updated });
    persistFavoritedClauses(currentDataset, updated);
  },

  removeFavoriteClause: (id) => {
    const { favoritedClauses, currentDataset } = get();
    const updated = favoritedClauses.filter((c) => c.id !== id);
    set({ favoritedClauses: updated });
    persistFavoritedClauses(currentDataset, updated);
  },

  isFavoriteClause: (fol_expression) => {
    return get().favoritedClauses.some(
      (c) => c.predicate.fol_expression === fol_expression,
    );
  },

  pinSelection: (label) => {
    const { selectedNodes, pathAnchorNodes, pinnedSelections } = get();
    if (selectedNodes.length === 0) return;

    const colorIndex = pinnedSelections.length % 4;
    const autoLabel =
      label ??
      (pathAnchorNodes.length >= 2
        ? `${pathAnchorNodes[0]} → ${pathAnchorNodes[pathAnchorNodes.length - 1]}`
        : `Selection (${selectedNodes.length} nodes)`);

    const pin: PinnedSelection = {
      id: crypto.randomUUID(),
      label: autoLabel,
      nodes: [...selectedNodes],
      colorIndex,
    };

    set({
      pinnedSelections: [...pinnedSelections, pin],
      selectedNodes: [],
      selectionSource: null,
      pathAnchorNodes: [],
      pathSelection: {
        isActive: false,
        paths: [],
        pathNodes: new Set(),
        pathEdges: [],
      },
      generatedPredicates: [],
      generatedPredicateSets: [],
      selectionMatches: [],
      activePredicateSetId: null,
      activePredicateIds: new Set(),
      predicateMatchNodes: [],
      nodePredicates: [],
      nodePredicateSets: [],
      descriptiveResponse: null,
    });
  },

  unpinSelection: (id) => {
    const { pinnedSelections } = get();
    set({ pinnedSelections: pinnedSelections.filter((p) => p.id !== id) });
  },

  clearPinnedSelections: () => {
    set({ pinnedSelections: [] });
  },

  renamePinnedSelection: (id, label) => {
    const { pinnedSelections } = get();
    set({
      pinnedSelections: pinnedSelections.map((p) =>
        p.id === id ? { ...p, label } : p,
      ),
    });
  },

  loadPinnedSelection: (id) => {
    const { pinnedSelections } = get();
    const pin = pinnedSelections.find((p) => p.id === id);
    if (!pin) return;
    get().setSelection(pin.nodes, "topology");
  },

  applySetOperation: (op, pinAId, pinBId) => {
    const { pinnedSelections } = get();
    const pinA = pinnedSelections.find((p) => p.id === pinAId);
    const pinB = pinnedSelections.find((p) => p.id === pinBId);
    if (!pinA || !pinB) return;

    const setB = new Set(pinB.nodes);
    let result: string[];

    if (op === "intersection") {
      result = pinA.nodes.filter((n) => setB.has(n));
    } else if (op === "union") {
      result = Array.from(new Set([...pinA.nodes, ...pinB.nodes]));
    } else {
      result = pinA.nodes.filter((n) => !setB.has(n));
    }

    get().setSelection(result, "topology");
  },

  setPredicateMatchNodes: (nodes: string[]) => {
    set({ predicateMatchNodes: nodes });
  },

  clearPredicateMatches: () => {
    set({ predicateMatchNodes: [] });
  },

  setPathAnchorNodes: (nodes) => {
    set({ pathAnchorNodes: nodes });
  },

  clearPathSelection: () => {
    set({
      pathAnchorNodes: [],
      pathSelection: {
        isActive: false,
        paths: [],
        pathNodes: new Set(),
        pathEdges: [],
      },
    });
  },

  setPathResults: (result) => {
    set({ pathSelection: result });
  },

  enterContrastMode: () => {
    if (get().selectedNodes.length === 0) return;
    set({ contrastMode: true, activeSlot: "negative" });
  },

  exitContrastMode: () => {
    set({ contrastMode: false, contrastNodes: [], activeSlot: "negative" });
  },

  setContrastNodes: (nodes) => {
    set({ contrastNodes: nodes });
  },

  setActiveSlot: (slot) => {
    set({ activeSlot: slot });
  },

  removeSharedFromContrast: () => {
    const { selectedNodes, contrastNodes } = get();
    const contrastSet = new Set(contrastNodes);
    const sharedSet = new Set(selectedNodes.filter((n) => contrastSet.has(n)));
    if (sharedSet.size === 0) return;
    const newPositive = selectedNodes.filter((n) => !sharedSet.has(n));
    const newNegative = contrastNodes.filter((n) => !sharedSet.has(n));
    set({
      selectedNodes: newPositive,
      contrastNodes: newNegative,
      generatedPredicates: [],
      generatedPredicateSets: [],
      selectionMatches: [],
      activePredicateSetId: null,
      activePredicateIds: new Set(),
      predicateMatchNodes: [],
      nodePredicates: [],
      nodePredicateSets: [],
      isGeneratingPredicates: newPositive.length > 0,
      descriptiveResponse: null,
      topologyPredicates: [],
      attributePredicates: [],
    });
    if (newPositive.length > 0) {
      get().generatePredicatesForSelection(newPositive, "topology");
    }
  },
}));

useAnalysisStore.subscribe(() => {
  const saveState = () => {
    useAnalysisStore.getState().saveSessionState();
  };

  const globalWithTimeout = globalThis as typeof globalThis & {
    _saveStateTimeout?: ReturnType<typeof setTimeout>;
  };
  clearTimeout(globalWithTimeout._saveStateTimeout);
  globalWithTimeout._saveStateTimeout = setTimeout(saveState, 500);
});
