import { useCallback, useEffect, useState } from "react";
import { useAnalysisStore } from "../store/analysisStore";
import { findPathsBetweenNodes } from "../api/graph";
import type { PathFindingRequest, PathFindingResponse } from "../api/graph";

export function usePathSelection() {
  const {
    selectedNodes,
    pathAnchorNodes,
    pathSelection,
    setPathAnchorNodes,
    setPathResults,
    setSelection,
    clearPathSelection,
  } = useAnalysisStore();

  const [isLoadingPaths, setIsLoadingPaths] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedNodes.length === 2) {
      setPathAnchorNodes(selectedNodes);
    } else {
      if (pathAnchorNodes.length > 0 && !pathSelection.isActive) {
        setPathAnchorNodes([]);
        clearPathSelection();
      }
    }
  }, [
    selectedNodes,
    pathAnchorNodes.length,
    pathSelection.isActive,
    setPathAnchorNodes,
    clearPathSelection,
  ]);

  const findPaths = useCallback(
    async (
      source: string,
      target: string,
      options?: Partial<
        Omit<PathFindingRequest, "source_node" | "target_node">
      >,
    ) => {
      setPathError(null);
      setIsLoadingPaths(true);

      try {
        const request: PathFindingRequest = {
          source_node: source,
          target_node: target,
          algorithm: options?.algorithm || "k_shortest",
          max_paths: options?.max_paths || 10,
          min_path_length: options?.min_path_length,
          max_path_length: options?.max_path_length || 6,
        };

        const response: PathFindingResponse =
          await findPathsBetweenNodes(request);

        if (!response.success) {
          setPathError(response.errors?.[0] || "Path finding failed");
          return;
        }

        if (response.paths.length === 0) {
          setPathError("No paths found between selected nodes");
          return;
        }

        setPathResults({
          isActive: true,
          paths: response.paths,
          pathNodes: new Set(response.path_nodes),
          pathEdges: response.path_edges,
        });
        setSelection(response.path_nodes, "topology");
      } catch (error) {
        void error;
        setPathError("Network error during path finding");
      } finally {
        setIsLoadingPaths(false);
      }
    },
    [setPathResults, setSelection],
  );

  const canFindPaths = pathAnchorNodes.length === 2;

  return {
    pathAnchorNodes,
    pathSelection,
    canFindPaths,
    isLoadingPaths,
    pathError,
    findPaths,
    clearPathSelection: () => {
      clearPathSelection();
      setPathError(null);
    },
  };
}
