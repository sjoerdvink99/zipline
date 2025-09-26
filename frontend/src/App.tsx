import { useState, useCallback, useEffect } from "react";
import { GraphCanvas } from "./components/GraphCanvas";
import { RightPanel } from "./components/RightPanel";
import {
  ReasoningBar,
  type Predicate,
  type SavedReasoningSet,
  type ReasoningBlock,
} from "./components/ReasoningBar";
import { TraceSidebar } from "./components/TraceSidebar";
import { Navbar } from "./components/ui/Navbar";
import type { SelectionKind } from "./types";

const SAVED_SETS_KEY_PREFIX = "graphbridge_saved_reasoning_sets_";

const loadSavedSets = (dataset: string): SavedReasoningSet[] => {
  try {
    const stored = localStorage.getItem(SAVED_SETS_KEY_PREFIX + dataset);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const persistSavedSets = (dataset: string, sets: SavedReasoningSet[]) => {
  try {
    localStorage.setItem(SAVED_SETS_KEY_PREFIX + dataset, JSON.stringify(sets));
  } catch (e) {
    console.error("Failed to persist saved reasoning sets:", e);
  }
};

export default function App() {
  const [currentDataset, setCurrentDataset] = useState<string>("default");
  const [hasSelection, setHasSelection] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);
  const [externalSelectedNodes, setExternalSelectedNodes] = useState<string[]>(
    []
  );

  const [reasoningPredicates, setReasoningPredicates] = useState<Predicate[]>(
    []
  );

  const [reasoningBlocks, setReasoningBlocks] = useState<ReasoningBlock[]>([]);

  const [savedReasoningSets, setSavedReasoningSets] = useState<
    SavedReasoningSet[]
  >(() => loadSavedSets(currentDataset));

  useEffect(() => {
    const handleGraphSwitch = (e: Event) => {
      const customEvent = e as CustomEvent<{ active: string }>;
      const newDataset = customEvent.detail?.active || "default";
      setCurrentDataset(newDataset);
      setReasoningPredicates([]);
      setReasoningBlocks([]);
      setSelectedNodes([]);
      setExternalSelectedNodes([]);
      setHasSelection(false);
      setSavedReasoningSets(loadSavedSets(newDataset));
    };

    window.addEventListener("gb:graph-switched", handleGraphSwitch);
    return () => window.removeEventListener("gb:graph-switched", handleGraphSwitch);
  }, []);

  const handleSelectionChange = useCallback(
    (
      _kind: SelectionKind,
      hasSelected: boolean,
      nodes: string[],
      _edge: string | null
    ) => {
      setHasSelection(hasSelected);
      setSelectedNodes(nodes);
    },
    []
  );

  const handleSelectNodesFromPanel = useCallback((nodeIds: string[]) => {
    setExternalSelectedNodes(nodeIds);
  }, []);

  const handleAddPredicate = useCallback((predicate: Predicate) => {
    setReasoningPredicates((prev) => {
      const exists = prev.some(
        (p) =>
          p.attribute === predicate.attribute &&
          p.operator === predicate.operator &&
          p.value === predicate.value
      );
      if (exists) return prev;
      return [...prev, { ...predicate, combineOp: "intersection" as const }];
    });
  }, []);

  const handleUpdatePredicate = useCallback(
    (id: string, updates: Partial<Predicate>) => {
      setReasoningPredicates((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const handleRemovePredicate = useCallback((id: string) => {
    setReasoningPredicates((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleReorderPredicates = useCallback((fromIndex: number, toIndex: number) => {
    setReasoningPredicates((prev) => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  }, []);

  const handleClearPredicates = useCallback(() => {
    setReasoningPredicates([]);
    setReasoningBlocks([]);
  }, []);

  const handleUpdateBlock = useCallback(
    (id: string, updates: Partial<ReasoningBlock>) => {
      setReasoningBlocks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
      );
    },
    []
  );

  const handleRemoveBlock = useCallback((id: string) => {
    setReasoningBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const handleApplyReasoning = useCallback((nodeIds: string[]) => {
    setExternalSelectedNodes([...nodeIds]);
  }, []);

  const handleSaveReasoningSet = useCallback(
    (name: string, description: string) => {
      const allPredicates: Predicate[] = [
        ...reasoningBlocks.flatMap((b) => b.predicates),
        ...reasoningPredicates,
      ];
      const newSet: SavedReasoningSet = {
        id: `set_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name,
        description,
        predicates: allPredicates,
        createdAt: new Date().toISOString(),
      };
      setSavedReasoningSets((prev) => {
        const updated = [newSet, ...prev];
        persistSavedSets(currentDataset, updated);
        return updated;
      });
    },
    [reasoningBlocks, reasoningPredicates, currentDataset]
  );

  const handleLoadReasoningSetAsBlock = useCallback(
    (set: SavedReasoningSet) => {
      const newBlock: ReasoningBlock = {
        id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: set.name,
        predicates: [...set.predicates],
        expanded: false,
        combineOp:
          reasoningBlocks.length > 0 || reasoningPredicates.length > 0
            ? "intersection"
            : undefined,
      };
      setReasoningBlocks((prev) => [...prev, newBlock]);
      setTraceOpen(false);
    },
    [reasoningBlocks.length, reasoningPredicates.length]
  );

  const handleDeleteReasoningSet = useCallback((id: string) => {
    setSavedReasoningSets((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      persistSavedSets(currentDataset, updated);
      return updated;
    });
  }, [currentDataset]);

  return (
    <div className="flex h-screen w-screen flex-col bg-gray-100">
      <Navbar />
      <ReasoningBar
        predicates={reasoningPredicates}
        blocks={reasoningBlocks}
        onUpdatePredicate={handleUpdatePredicate}
        onRemovePredicate={handleRemovePredicate}
        onReorderPredicates={handleReorderPredicates}
        onUpdateBlock={handleUpdateBlock}
        onRemoveBlock={handleRemoveBlock}
        onClearAll={handleClearPredicates}
        onApply={handleApplyReasoning}
        onSave={handleSaveReasoningSet}
        onOpenSaved={() => setTraceOpen(true)}
      />
      <div className="flex flex-1 min-h-0 px-2 pb-2 pt-2">
        <div className="flex flex-1 min-h-0 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="flex-1 min-h-0 overflow-hidden">
            <GraphCanvas
              onSelectionChange={handleSelectionChange}
              externalSelectedNodes={externalSelectedNodes}
            />
          </div>
          <div className="w-80 min-h-0 h-full flex flex-col overflow-hidden">
            <RightPanel
              hasSelection={hasSelection}
              selectedNodes={selectedNodes}
              onSelectNodes={handleSelectNodesFromPanel}
              onAddPredicate={handleAddPredicate}
            />
          </div>
        </div>
      </div>

      <TraceSidebar
        isOpen={traceOpen}
        onClose={() => setTraceOpen(false)}
        savedSets={savedReasoningSets}
        onLoad={handleLoadReasoningSetAsBlock}
        onDelete={handleDeleteReasoningSet}
      />
    </div>
  );
}
