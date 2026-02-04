import { useEffect, useRef, useState } from "react";
import { getDatasets, type Dataset } from "../api/datasets";
import { listUserDataSources, type UserDataSourceMeta } from "../api/data_sources";
import { XMarkIcon } from "./ui/Icons";
import { FileUploadTab } from "./datasources/FileUploadTab";
import { Neo4jTab } from "./datasources/Neo4jTab";
import { SampleDatasetsTab } from "./datasources/SampleDatasetsTab";

type TabId = "sample" | "neo4j" | "file";

const TABS: { id: TabId; label: string }[] = [
  { id: "sample", label: "Sample Datasets" },
  { id: "neo4j", label: "Neo4j Connection" },
  { id: "file", label: "Upload File" },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDatasetLoaded: (id: string) => void;
}

export function DataSourceModal({ isOpen, onClose, onDatasetLoaded }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("sample");
  const [datasets, setDatasets] = useState<Record<string, Dataset>>({});
  const [fileUploads, setFileUploads] = useState<UserDataSourceMeta[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    getDatasets()
      .then((res) => {
        if (!cancelled) setDatasets(res.datasets || {});
      })
      .catch(() => {});

    listUserDataSources()
      .then(({ sources }) => {
        if (!cancelled) setFileUploads(sources.filter((s) => s.type === "file"));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeTab]);

  if (!isOpen) return null;

  const handleDatasetLoaded = (id: string) => {
    onDatasetLoaded(id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-0 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Data Sources</h2>
            <p className="text-2xs text-gray-400 mt-0.5">
              Load a sample dataset, connect to Neo4j, or upload a graph file
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-gray-100 px-5 mt-4 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-1 pb-3 mr-5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-gray-900"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto p-5 min-h-0">
          {activeTab === "sample" && (
            <SampleDatasetsTab
              datasets={datasets}
              onDatasetLoaded={handleDatasetLoaded}
            />
          )}
          {activeTab === "neo4j" && (
            <Neo4jTab onDatasetLoaded={handleDatasetLoaded} />
          )}
          {activeTab === "file" && (
            <FileUploadTab
              onDatasetLoaded={handleDatasetLoaded}
              previousUploads={fileUploads}
              onUploadsChanged={setFileUploads}
            />
          )}
        </div>
      </div>
    </div>
  );
}
