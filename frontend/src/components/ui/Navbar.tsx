import { useState } from "react";
import { useAnalysisStore } from "../../store/analysisStore";
import { DataSourceModal } from "../DataSourceModal";
import { SavedPredicatesSidebar } from "../SavedPredicatesSidebar";
import { DatasetSelector } from "../DatasetSelector";
import { SearchBar } from "../ui/SearchBar";
import { HeartIcon, InfoIcon } from "./Icons";
import { InfoModal } from "./InfoModal";

interface NavbarProps {
  onDatasetChange?: (datasetName: string) => void;
}

export function Navbar({ onDatasetChange }: NavbarProps) {
  const { selectFromSearch, favoritedClauses } = useAnalysisStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dataSourceModalOpen, setDataSourceModalOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);

  const handleDatasetLoaded = (id: string) => {
    setDataSourceModalOpen(false);
    onDatasetChange?.(id);
  };

  return (
    <>
      <nav className="bg-white border-b border-gray-200/80 px-5 h-12 flex items-center shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="4" cy="12" r="3" className="fill-gray-800" />
              <circle cx="20" cy="12" r="3" className="fill-gray-800" />
              <path
                d="M7 12 C 10 4, 14 4, 17 12"
                className="stroke-gray-600"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M7 12 L 17 12"
                className="stroke-gray-800"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-sm font-semibold text-gray-900 tracking-tight">
              ZipLine
            </span>
          </div>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <DatasetSelector
            onDatasetChange={onDatasetChange}
            onOpenDataSources={() => setDataSourceModalOpen(true)}
          />
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <SearchBar
            onResultSelect={(nodeId, add) => selectFromSearch(nodeId, add)}
            placeholder="Search nodes..."
            className="w-64"
          />

          <button
            onClick={() => setInfoModalOpen(true)}
            className="h-9 px-3 rounded-lg transition-colors flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            title="How ZipLine works"
          >
            <InfoIcon className="w-4 h-4" />
          </button>

          <button
            onClick={() => setSidebarOpen(true)}
            className={`h-9 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 relative ${
              favoritedClauses.length > 0
                ? "text-rose-400 hover:text-rose-500 hover:bg-rose-50"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            }`}
            title="Open liked predicates"
          >
            <HeartIcon
              filled={favoritedClauses.length > 0}
              className="w-4 h-4"
            />
            {favoritedClauses.length > 0 && (
              <span className="text-[10px] font-semibold tabular-nums">
                {favoritedClauses.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      <SavedPredicatesSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <DataSourceModal
        isOpen={dataSourceModalOpen}
        onClose={() => setDataSourceModalOpen(false)}
        onDatasetLoaded={handleDatasetLoaded}
      />

      <InfoModal
        isOpen={infoModalOpen}
        onClose={() => setInfoModalOpen(false)}
      />
    </>
  );
}
