import { useEffect, useCallback, useState } from "react";
import { GraphCanvas } from "./components/panels/GraphCanvas";
import { PredicateBridge } from "./components/panels/PredicateBridge";
import { AttributePanel } from "./components/panels/AttributePanel";
import { Navbar } from "./components/ui/Navbar";
import { PanelHeader } from "./components/ui/PanelHeader";
import { ToggleButtonGroup } from "./components/ui/ToggleButtonGroup";
import { TopologyIcon } from "./components/ui/Icons";
import { useAnalysisStore } from "./store/analysisStore";
import { usePredicateStore } from "./store/predicates";
import type { SelectionKind } from "./types";

export default function App() {
  const {
    selectedNodes,
    predicateMatchNodes,
    setSelection,
    setCurrentDataset,
    reset,
    loadSessionState,
  } = useAnalysisStore();

  const { loadPredicateState } = usePredicateStore();

  const [showSchemaView, setShowSchemaView] = useState(false);

  useEffect(() => {
    const restoreTimer = setTimeout(() => {
      try {
        const restored = loadSessionState();
        const predicateRestored = loadPredicateState();
        if (restored || predicateRestored) {
          console.log('Session state restored from previous session');
        }
      } catch (error) {
        console.warn('Failed to restore session state:', error);
      }
    }, 500);

    return () => clearTimeout(restoreTimer);
  }, [loadSessionState, loadPredicateState]);

  const handleSelectionChange = useCallback(
    (
      _kind: SelectionKind,
      hasSelected: boolean,
      nodes: string[]
    ) => {
      if (hasSelected && nodes.length > 0) {
        setSelection(nodes, "topology");
      } else if (!hasSelected) {
        reset();
      }
    },
    [setSelection, reset]
  );

  const handleDatasetChange = useCallback((datasetName: string) => {
    setCurrentDataset(datasetName);
    reset();
    window.dispatchEvent(new CustomEvent("gb:graph-updated"));
  }, [setCurrentDataset, reset]);

  const externalSelectedNodes =
    selectedNodes.length > 0 ? selectedNodes : predicateMatchNodes;

  return (
    <div className="flex h-screen w-screen flex-col bg-gray-100">
      <Navbar onDatasetChange={handleDatasetChange} />

      <div className="flex flex-1 min-h-0 px-2 pb-2 pt-2">
        <div className="grid grid-cols-3 flex-1 min-h-0 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="min-h-0 flex flex-col overflow-hidden border-r border-gray-100">
            <PanelHeader
              icon={<TopologyIcon />}
              title="Topology Space"
              subtitle="Graph structure and connectivity"
            >
              <ToggleButtonGroup
                options={[
                  { value: "false", label: "Graph" },
                  { value: "true", label: "Schema" }
                ]}
                value={showSchemaView.toString()}
                onChange={(value) => setShowSchemaView(value === "true")}
              />
            </PanelHeader>
            <div className="flex-1 min-h-0">
              <GraphCanvas
                onSelectionChange={handleSelectionChange}
                externalSelectedNodes={externalSelectedNodes}
                hoveredNodes={[]}
                showSchemaView={showSchemaView}
                onSchemaViewChange={setShowSchemaView}
              />
            </div>
          </div>

          <div className="min-h-0 h-full flex flex-col overflow-hidden border-r border-gray-100">
            <PredicateBridge
              selectedNodeIds={selectedNodes}
              onPredicateSelect={() => {}}
              onPredicateFilter={() => {}}
            />
          </div>

          <div className="min-h-0 h-full flex flex-col overflow-hidden">
            <AttributePanel />
          </div>
        </div>
      </div>
    </div>
  );
}