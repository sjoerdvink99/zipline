import { useState } from "react";
import { switchDataset, type Dataset } from "../../api";
import { useAnalysisStore } from "../../store/analysisStore";
import { CheckIcon, LoadingSpinner } from "../ui/Icons";

const TYPE_COLORS = [
  "bg-blue-50 text-blue-700 border-blue-100",
  "bg-purple-50 text-purple-700 border-purple-100",
  "bg-green-50 text-green-700 border-green-100",
  "bg-amber-50 text-amber-700 border-amber-100",
  "bg-red-50 text-red-700 border-red-100",
  "bg-indigo-50 text-indigo-700 border-indigo-100",
  "bg-pink-50 text-pink-700 border-pink-100",
  "bg-cyan-50 text-cyan-700 border-cyan-100",
];

interface Props {
  datasets: Record<string, Dataset>;
  onDatasetLoaded: (id: string) => void;
}

export function SampleDatasetsTab({ datasets, onDatasetLoaded }: Props) {
  const currentDataset = useAnalysisStore((s) => s.currentDataset);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sampleEntries = Object.entries(datasets).filter(
    ([_, d]) => d.source_type !== "user",
  );

  const handleLoad = async (id: string) => {
    if (id === currentDataset) return;
    try {
      setLoadingId(id);
      setError(null);
      const res = await switchDataset(id);
      if (res.success) {
        onDatasetLoaded(id);
      } else {
        throw new Error("Failed to load dataset");
      }
    } catch {
      setError(`Failed to load dataset`);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {sampleEntries.map(([id, dataset]) => {
          const isActive = id === currentDataset;
          const isLoading = loadingId === id;
          const types = dataset.node_types ?? [];

          return (
            <div
              key={id}
              className={`flex flex-col rounded-lg border transition-all ${
                isActive
                  ? "border-blue-200 bg-blue-50/40"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex-1 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                    {dataset.name}
                  </h3>
                  {isActive && (
                    <div className="shrink-0 w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                      <CheckIcon className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </div>

                {dataset.description && (
                  <p className="text-2xs text-gray-500 leading-relaxed line-clamp-2">
                    {dataset.description}
                  </p>
                )}

                {types.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {types.slice(0, 5).map((t, i) => (
                      <span
                        key={t}
                        className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border ${TYPE_COLORS[i % TYPE_COLORS.length]}`}
                      >
                        {t}
                      </span>
                    ))}
                    {types.length > 5 && (
                      <span className="inline-block px-1.5 py-0.5 text-[10px] text-gray-400">
                        +{types.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 rounded-b-lg flex items-center justify-between">
                <span className="text-2xs text-gray-400">
                  {dataset.node_count != null
                    ? `${dataset.node_count.toLocaleString()} nodes`
                    : "Sample dataset"}
                </span>
                {isActive ? (
                  <span className="text-2xs font-medium text-blue-600">
                    Active
                  </span>
                ) : (
                  <button
                    onClick={() => handleLoad(id)}
                    disabled={isLoading || loadingId !== null}
                    className="h-6 px-2.5 text-2xs font-medium bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isLoading ? (
                      <>
                        <LoadingSpinner className="w-2.5 h-2.5" />
                        Loading
                      </>
                    ) : (
                      "Load"
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
