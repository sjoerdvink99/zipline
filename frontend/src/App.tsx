import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { DataSpacePanel } from "./components/panels/DataSpacePanel";
import { PredicateBridge } from "./components/panels/PredicateBridge";
import { AttributePanel } from "./components/panels/AttributePanel";
import { Navbar } from "./components/ui/Navbar";
import { TopologyIcon, AttributeIcon } from "./components/ui/Icons";
import { ToggleButtonGroup } from "./components/ui/ToggleButtonGroup";
import { useAnalysisStore } from "./store/analysisStore";
import { usePredicateStore } from "./store/predicates";
import { usePredicateComposerStore } from "./store/predicateComposerStore";
import { usePredicateStore as useFolStore } from "./store/folStore";
import { useVisualBuilderStore } from "./components/predicate-builder/visual";
import { useGraphDataStore } from "./store/graphDataStore";
import type { SelectionKind } from "./types";
import { getCurrentDataset } from "./api";

export default function App() {
  const selectedNodes = useAnalysisStore((s) => s.selectedNodes);
  const predicateMatchNodes = useAnalysisStore((s) => s.predicateMatchNodes);
  const setSelection = useAnalysisStore((s) => s.setSelection);
  const setCurrentDataset = useAnalysisStore((s) => s.setCurrentDataset);
  const reset = useAnalysisStore((s) => s.reset);
  const loadSessionState = useAnalysisStore((s) => s.loadSessionState);

  const { loadPredicateState, clear: clearPredicates } = usePredicateStore();
  const { reset: resetComposer } = usePredicateComposerStore();
  const { clear: clearFolStore } = useFolStore();
  const { clear: clearVisualBuilder } = useVisualBuilderStore();

  const [attributeCollapsed, setAttributeCollapsed] = useState(false);
  const [aggregation, setAggregation] = useState<"full" | "schema">("full");
  const [vizType, setVizType] = useState<"node-link" | "matrix">("node-link");

  const startupRan = useRef(false);
  useEffect(() => {
    if (startupRan.current) return;
    startupRan.current = true;

    const run = async () => {
      try {
        const response = await getCurrentDataset();
        if (response.dataset) {
          setCurrentDataset(response.dataset.name);
        }
      } catch {
        void 0;
      }
      setTimeout(() => {
        try {
          loadSessionState();
          loadPredicateState();
        } catch {
          void 0;
        }
      }, 0);
    };

    run();
  }, [loadSessionState, loadPredicateState, setCurrentDataset]);

  const handleSelectionChange = useCallback(
    (_kind: SelectionKind, hasSelected: boolean, nodes: string[]) => {
      if (hasSelected && nodes.length > 0) {
        setSelection(nodes, "topology");
      } else if (!hasSelected) {
        if (!useAnalysisStore.getState().contrastMode) {
          reset();
        }
      }
    },
    [setSelection, reset],
  );

  const handleDatasetChange = useCallback(
    (datasetName: string) => {
      setCurrentDataset(datasetName);
      reset();
      clearPredicates();
      clearFolStore();
      resetComposer();
      clearVisualBuilder();
      useGraphDataStore.getState().reset();
      useGraphDataStore.getState().fetchElements();
      window.dispatchEvent(new CustomEvent("gb:graph-switched"));
    },
    [
      setCurrentDataset,
      reset,
      clearPredicates,
      clearFolStore,
      resetComposer,
      clearVisualBuilder,
    ],
  );

  const externalSelectedNodes = useMemo(
    () => (selectedNodes.length > 0 ? selectedNodes : predicateMatchNodes),
    [selectedNodes, predicateMatchNodes],
  );

  return (
    <div className="flex h-screen w-screen flex-col bg-white">
      <Navbar onDatasetChange={handleDatasetChange} />

      <div
        className="grid flex-1 min-h-0 overflow-hidden"
        style={{ gridTemplateColumns: "1.4fr 1fr" }}
      >
        <div
          className="min-h-0 overflow-hidden border-r border-gray-200 grid grid-rows-[auto_1fr] transition-[grid-template-columns] duration-300 ease-in-out"
          style={{ gridTemplateColumns: `1fr ${attributeCollapsed ? "28px" : "40%"}` }}
        >
          <div className="px-4 py-2 border-b border-gray-100 bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 bg-gray-50 rounded-lg border border-gray-100 shrink-0">
                  <TopologyIcon className="w-4 h-4 text-gray-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900 truncate">Topology</h2>
                  <p className="text-2xs text-gray-500 truncate">Graph topology</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ToggleButtonGroup
                  options={[
                    { value: "full", label: "Full" },
                    { value: "schema", label: "Schema" },
                  ]}
                  value={aggregation}
                  onChange={(value) => {
                    setAggregation(value as "full" | "schema");
                    reset();
                  }}
                />
                <ToggleButtonGroup
                  options={[
                    { value: "node-link", label: "Node-link" },
                    { value: "matrix", label: "Matrix" },
                  ]}
                  value={vizType}
                  onChange={(value) => setVizType(value as "node-link" | "matrix")}
                />
              </div>
            </div>
          </div>

          {attributeCollapsed ? (
            <div className="border-l border-gray-100 border-b border-gray-100 bg-white flex items-center justify-center overflow-hidden">
              <button
                onClick={() => setAttributeCollapsed(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors duration-150"
                title="Expand attributes"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="border-l border-gray-100 px-4 py-2 border-b border-gray-100 bg-white overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 bg-gray-50 rounded-lg border border-gray-100 shrink-0">
                    <AttributeIcon className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900 truncate">Attributes</h2>
                    <p className="text-2xs text-gray-500 truncate">Node distributions and filters</p>
                  </div>
                </div>
                <button
                  onClick={() => setAttributeCollapsed(true)}
                  className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors duration-150 p-1"
                  title="Collapse attributes"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          <div className="min-h-0 overflow-hidden flex flex-col">
            <DataSpacePanel
              aggregation={aggregation}
              vizType={vizType}
              externalSelectedNodes={externalSelectedNodes}
              onSelectionChange={handleSelectionChange}
            />
          </div>

          <div
            className={`min-h-0 overflow-hidden border-l border-gray-100 flex flex-col transition-opacity duration-200 ${
              attributeCollapsed ? "opacity-0" : "opacity-100"
            }`}
          >
            <AttributePanel showHeader={false} />
          </div>
        </div>

        <div className="min-h-0 h-full flex flex-col overflow-hidden">
          <PredicateBridge
            selectedNodeIds={selectedNodes}
            onPredicateFilter={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
