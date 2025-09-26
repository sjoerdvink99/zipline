import React, { useState, useEffect, useRef } from "react";
import { getDatasets, switchDataset } from "../api";

interface Dataset {
  name: string;
  description: string;
}

interface DatasetSelectorProps {
  onDatasetChange?: (datasetName: string) => void;
}

export const DatasetSelector: React.FC<DatasetSelectorProps> = ({
  onDatasetChange,
}) => {
  const [datasets, setDatasets] = useState<{ [key: string]: Dataset }>({});
  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadAvailableDatasets = async () => {
    try {
      setError(null);
      const response = await getDatasets();
      setDatasets(response.datasets || {});

      const datasetNames = Object.keys(response.datasets || {});
      if (datasetNames.length > 0 && !selectedDataset) {
        setSelectedDataset(datasetNames[0]);
      }
    } catch (error) {
      console.error("Failed to load datasets:", error);
      setError("Failed to load available datasets");
    }
  };

  useEffect(() => {
    loadAvailableDatasets();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDatasetChange = async (datasetName: string) => {
    if (datasetName === selectedDataset) return;

    try {
      setLoading(true);
      setError(null);
      setIsOpen(false);

      const response = await switchDataset(datasetName);

      if (response.success) {
        setSelectedDataset(datasetName);
        onDatasetChange?.(datasetName);
      } else {
        throw new Error("Failed to load dataset");
      }
    } catch (error) {
      console.error("Failed to load dataset:", error);
      setError(`Failed to load dataset: ${datasetName}`);
    } finally {
      setLoading(false);
    }
  };

  const datasetNames = Object.keys(datasets);

  if (datasetNames.length === 0) {
    return (
      <div className="flex items-center">
        <span className="text-xs text-gray-400">No datasets available</span>
      </div>
    );
  }

  const selectedDatasetInfo = datasets[selectedDataset];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => !loading && setIsOpen(!isOpen)}
        disabled={loading}
        className="h-9 flex items-center gap-2 px-3 py-2 text-xs font-medium bg-white hover:bg-gray-50 border border-gray-200 rounded-md transition-all duration-150 min-w-[140px] disabled:opacity-50"
      >
        <span className="text-gray-800 truncate flex-1 text-left">
          {selectedDatasetInfo?.name || selectedDataset}
        </span>
        {loading ? (
          <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isOpen && !loading && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {datasetNames.map((name) => (
              <button
                key={name}
                onClick={() => handleDatasetChange(name)}
                className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 transition-colors ${
                  name === selectedDataset
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700'
                }`}
              >
                <div className="font-medium">{datasets[name].name}</div>
                {datasets[name].description && (
                  <div className="text-gray-500 text-[10px] mt-0.5 truncate">
                    {datasets[name].description}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-full left-0 mt-1 text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
          {error}
        </div>
      )}
    </div>
  );
};