import React, { useEffect, useRef, useState } from "react";
import { getDatasets, switchDataset, type Dataset } from "../api";
import { useAnalysisStore } from "../store/analysisStore";
import {
  ChevronDownIcon,
  DatabaseIcon,
  DocumentIcon,
  LoadingSpinner,
  PlusIcon,
} from "./ui/Icons";

interface DatasetSelectorProps {
  onDatasetChange?: (datasetName: string) => void;
  onOpenDataSources?: () => void;
}

export const DatasetSelector: React.FC<DatasetSelectorProps> = ({
  onDatasetChange,
  onOpenDataSources,
}) => {
  const currentDataset = useAnalysisStore((s) => s.currentDataset);
  const [datasets, setDatasets] = useState<Record<string, Dataset>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchDatasets = () => {
    let cancelled = false;
    getDatasets()
      .then((res) => {
        if (!cancelled) setDatasets(res.datasets || {});
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load datasets");
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(fetchDatasets, []);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const handleDatasetChange = async (name: string) => {
    if (name === currentDataset) {
      setIsOpen(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setIsOpen(false);
      const res = await switchDataset(name);
      if (res.success) {
        onDatasetChange?.(name);
      } else {
        throw new Error("Failed to load dataset");
      }
    } catch {
      setError("Failed to switch dataset");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDataSources = () => {
    setIsOpen(false);
    fetchDatasets();
    onOpenDataSources?.();
  };

  const sampleEntries = Object.entries(datasets).filter(
    ([_, d]) => d.source_type !== "user",
  );
  const userEntries = Object.entries(datasets).filter(
    ([_, d]) => d.source_type === "user",
  );

  const selectedInfo = datasets[currentDataset];

  return (
    <div className="relative flex items-center gap-1" ref={dropdownRef}>
      <div className="relative">
        <button
          onClick={() => !loading && setIsOpen(!isOpen)}
          disabled={loading}
          className="h-9 flex items-center gap-2 px-3 py-2 text-xs font-medium bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors min-w-[140px] disabled:opacity-50"
        >
          <span className="text-gray-800 truncate flex-1 text-left">
            {selectedInfo?.name || currentDataset || "Select dataset"}
          </span>
          {loading ? (
            <LoadingSpinner className="w-3 h-3 shrink-0" />
          ) : (
            <ChevronDownIcon
              className={`w-3 h-3 text-gray-400 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
            />
          )}
        </button>

        {isOpen && !loading && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden min-w-[220px] max-w-[280px] w-max">
            {sampleEntries.length > 0 && (
              <>
                <div className="px-3 pt-2.5 pb-1">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    Sample Datasets
                  </span>
                </div>
                {sampleEntries.map(([name, dataset]) => (
                  <button
                    key={name}
                    onClick={() => handleDatasetChange(name)}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 transition-colors ${
                      name === currentDataset
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700"
                    }`}
                  >
                    <div className="font-medium truncate">{dataset.name}</div>
                    {dataset.description && (
                      <div className="text-gray-400 text-2xs mt-0.5 truncate">
                        {dataset.description}
                      </div>
                    )}
                  </button>
                ))}
              </>
            )}

            {userEntries.length > 0 && (
              <>
                <div className="px-3 pt-2.5 pb-1 border-t border-gray-100 mt-1">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    Your Data
                  </span>
                </div>
                {userEntries.map(([name, dataset]) => (
                  <button
                    key={name}
                    onClick={() => handleDatasetChange(name)}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 transition-colors flex items-center gap-2 ${
                      name === currentDataset
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700"
                    }`}
                  >
                    {dataset.data_source_type === "neo4j" ? (
                      <DatabaseIcon className="w-3 h-3 shrink-0 text-gray-400" />
                    ) : (
                      <DocumentIcon className="w-3 h-3 shrink-0 text-gray-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{dataset.name}</div>
                      {(dataset.node_count != null || dataset.edge_count != null) && (
                        <div className="text-gray-400 text-2xs mt-0.5">
                          {dataset.node_count?.toLocaleString()} nodes ·{" "}
                          {dataset.edge_count?.toLocaleString()} edges
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </>
            )}

            <div className="border-t border-gray-100 mt-1">
              <button
                onClick={handleOpenDataSources}
                className="w-full px-3 py-2 text-left text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors flex items-center gap-2"
              >
                <PlusIcon className="w-3 h-3 shrink-0" />
                Add data source…
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleOpenDataSources}
        title="Add data source"
        className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
      >
        <PlusIcon className="w-3.5 h-3.5" />
      </button>

      {error && (
        <div className="absolute top-full left-0 mt-1 text-2xs text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-200 z-50 whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
};
