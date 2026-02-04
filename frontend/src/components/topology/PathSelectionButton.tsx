import { useState } from "react";
import { PathIcon } from "../ui/Icons";
import type { PathFindingRequest } from "../../api/graph";

type PathOptions = Partial<Omit<PathFindingRequest, "source_node" | "target_node">>;

interface PathSelectionButtonProps {
  anchorNodes: string[];
  onPathFind: (sourceNode: string, targetNode: string, options?: PathOptions) => void;
  onClear: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function PathSelectionButton({
  anchorNodes,
  onPathFind,
  onClear,
  isLoading = false,
  error,
}: PathSelectionButtonProps) {
  const [mode, setMode] = useState<"shortest" | "range">("shortest");
  const [minLen, setMinLen] = useState(2);
  const [maxLen, setMaxLen] = useState(6);

  if (anchorNodes.length !== 2) return null;

  const handleClick = () => {
    if (isLoading) return;
    if (mode === "shortest") {
      onPathFind(anchorNodes[0], anchorNodes[1], {
        algorithm: "all_shortest",
        max_paths: 50,
      });
    } else {
      onPathFind(anchorNodes[0], anchorNodes[1], {
        algorithm: "all_simple",
        min_path_length: minLen,
        max_path_length: maxLen,
        max_paths: 500,
      });
    }
  };

  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-2 w-56">
      <div className="flex items-center justify-between mb-2">
        <div className="flex rounded-md border border-gray-200 overflow-hidden flex-1 mr-2">
        <button
          onClick={() => setMode("shortest")}
          className={`flex-1 text-xs py-1 transition-colors ${
            mode === "shortest"
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Shortest paths
        </button>
        <button
          onClick={() => setMode("range")}
          className={`flex-1 text-xs py-1 transition-colors ${
            mode === "range"
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          By length
        </button>
        </div>
        <button
          onClick={onClear}
          className="text-gray-400 hover:text-gray-600 transition-colors text-sm leading-none p-0.5"
          title="Clear selection"
        >
          ✕
        </button>
      </div>

      {mode === "range" && (
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-gray-500 shrink-0">Min</label>
          <input
            type="number"
            min={1}
            max={maxLen}
            value={minLen}
            onChange={(e) => setMinLen(Math.min(Number(e.target.value), maxLen))}
            className="w-12 text-xs border border-gray-200 rounded px-1.5 py-1 text-center"
          />
          <label className="text-xs text-gray-500 shrink-0">Max</label>
          <input
            type="number"
            min={minLen}
            max={10}
            value={maxLen}
            onChange={(e) => setMaxLen(Math.max(Number(e.target.value), minLen))}
            className="w-12 text-xs border border-gray-200 rounded px-1.5 py-1 text-center"
          />
        </div>
      )}

      <button
        onClick={handleClick}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full"
      >
        <PathIcon className="w-4 h-4" />
        <span className="text-sm font-medium">
          {isLoading ? "Finding paths..." : "Find paths"}
        </span>
      </button>

      {error && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      <div className="mt-1 text-xs text-gray-500 truncate">
        {anchorNodes[0]} → {anchorNodes[1]}
      </div>
    </div>
  );
}
