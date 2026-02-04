import { useEffect } from "react";
import { GraphView } from "./graph/GraphView";
import { SchemaView } from "../SchemaView";
import { AdjacencyMatrix } from "./AdjacencyMatrix";
import { SchemaMatrixView } from "./SchemaMatrixView";
import { useGraphDataStore } from "../../store/graphDataStore";
import type { SelectionKind } from "../../types";

interface DataSpacePanelProps {
  aggregation: "full" | "schema";
  vizType: "node-link" | "matrix";
  externalSelectedNodes: string[];
  onSelectionChange: (kind: SelectionKind, hasSelected: boolean, nodes: string[]) => void;
}

export const DataSpacePanel = ({
  aggregation,
  vizType,
  externalSelectedNodes,
  onSelectionChange,
}: DataSpacePanelProps) => {
  useEffect(() => {
    useGraphDataStore.getState().fetchElements();
  }, []);

  return (
    <div className="flex-1 min-h-0 relative">
      {aggregation === "full" && vizType === "node-link" && (
        <GraphView
          onSelectionChange={(kind, hasSelected, nodes) =>
            onSelectionChange(kind, hasSelected, nodes)
          }
          externalSelectedNodes={externalSelectedNodes}
          hoveredNodes={[]}
        />
      )}
      {aggregation === "full" && vizType === "matrix" && (
        <AdjacencyMatrix
          selectedNodes={externalSelectedNodes}
          onSelectionChange={(nodeIds) =>
            onSelectionChange("subgraph", nodeIds.length > 0, nodeIds)
          }
        />
      )}
      {aggregation === "schema" && vizType === "node-link" && (
        <SchemaView
          onSelectionChange={(nodeIds) =>
            onSelectionChange("subgraph", nodeIds.length > 0, nodeIds)
          }
        />
      )}
      {aggregation === "schema" && vizType === "matrix" && (
        <SchemaMatrixView
          onSelectionChange={(nodeIds) =>
            onSelectionChange("subgraph", nodeIds.length > 0, nodeIds)
          }
        />
      )}
    </div>
  );
};
