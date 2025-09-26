import { useState } from "react";
import { useAnalysisStore } from "../../store/analysisStore";
import { SavedPredicatesSidebar } from "../SavedPredicatesSidebar";
import { SearchBar } from "../ui/SearchBar";
import { DatasetSelector } from "../DatasetSelector";

interface NavbarProps {
  onDatasetChange?: (datasetName: string) => void;
}

export function Navbar({ onDatasetChange }: NavbarProps) {
  const { selectFromSearch } = useAnalysisStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleDatasetChange = (datasetName: string) => {
    onDatasetChange?.(datasetName);
    window.dispatchEvent(
      new CustomEvent("gb:graph-switched", {
        detail: { active: datasetName },
      })
    );
  };

  return (
    <>
      <nav className="bg-white border-b border-gray-200/80 px-6 py-3 flex items-center shrink-0 shadow-sm">
        {/* Logo - Left */}
        <div className="flex items-center gap-2 w-56">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
            <circle cx="4" cy="12" r="3" fill="#3b82f6" />
            <circle cx="20" cy="12" r="3" fill="#3b82f6" />
            <path
              d="M7 12 C 10 4, 14 4, 17 12"
              stroke="#1e40af"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M7 12 L 17 12"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-sm font-semibold text-gray-900 tracking-tight">
            GraphBridge
          </span>
        </div>

        {/* Search Bar - Center */}
        <div className="flex-1 flex justify-center">
          <SearchBar
            onResultSelect={selectFromSearch}
            placeholder="Search nodes..."
            className="w-full max-w-md"
          />
        </div>

        {/* Controls - Right */}
        <div className="flex items-center gap-3 w-56 justify-end">
          <DatasetSelector onDatasetChange={handleDatasetChange} />
          <button
            onClick={() => setSidebarOpen(true)}
            className="h-9 px-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center"
            title="Open saved predicates"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0013.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </button>
        </div>
      </nav>
      <SavedPredicatesSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
    </>
  );
}