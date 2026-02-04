import React, { useRef, useState } from "react";
import {
  deleteUserDataSource,
  listUserDataSources,
  loadUploadedFile,
  uploadGraphFile,
  type UserDataSourceMeta,
} from "../../api/data_sources";
import { CloudUploadIcon, LoadingSpinner, XMarkIcon } from "../ui/Icons";

interface Props {
  onDatasetLoaded: (id: string) => void;
  previousUploads: UserDataSourceMeta[];
  onUploadsChanged: (uploads: UserDataSourceMeta[]) => void;
}

const ACCEPTED = ".json,.graphml,.xml";
const MAX_MB = 50;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function FileUploadTab({ onDatasetLoaded, previousUploads, onUploadsChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const processFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["json", "graphml", "xml"].includes(ext)) {
      setUploadError(`Unsupported format ".${ext}" — use .json or .graphml`);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`File too large — maximum is ${MAX_MB} MB`);
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const res = await uploadGraphFile(file);
      if (res.success) {
        const { sources } = await listUserDataSources();
        onUploadsChanged(sources.filter((s) => s.type === "file"));
        onDatasetLoaded(res.dataset_id);
      } else {
        throw new Error("Upload failed");
      }
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setUploadError(detail ?? (e instanceof Error ? e.message : "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleLoad = async (sourceId: string) => {
    setLoadingId(sourceId);
    try {
      const res = await loadUploadedFile(sourceId);
      if (res.success) onDatasetLoaded(res.dataset_id);
    } catch {
      setUploadError("Failed to load — try re-uploading the file");
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (sourceId: string) => {
    setDeletingId(sourceId);
    try {
      await deleteUserDataSource(sourceId);
      onUploadsChanged(previousUploads.filter((s) => s.id !== sourceId));
    } catch {
      setUploadError("Failed to delete data source");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
          dragOver
            ? "border-blue-400 bg-blue-50"
            : uploading
              ? "border-gray-200 bg-gray-50 cursor-default"
              : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          onChange={handleFileInput}
          className="hidden"
        />

        {uploading ? (
          <>
            <LoadingSpinner className="w-6 h-6" />
            <p className="text-xs text-gray-500">Importing…</p>
          </>
        ) : (
          <>
            <div className="p-3 bg-gray-100 rounded-xl">
              <CloudUploadIcon
                className={`w-6 h-6 transition-colors ${dragOver ? "text-blue-500" : "text-gray-400"}`}
              />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-gray-700">
                {dragOver ? "Drop to import" : "Drop a graph file here"}
              </p>
              <p className="text-xs text-gray-400">or click to browse</p>
              <p className="text-2xs text-gray-400">JSON · GraphML · max {MAX_MB} MB</p>
            </div>
          </>
        )}
      </div>

      {uploadError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {uploadError}
        </div>
      )}

      {previousUploads.length > 0 && (
        <div className="space-y-2">
          <p className="text-2xs font-semibold text-gray-500 uppercase tracking-wide">
            Previously uploaded
          </p>
          <div className="space-y-1.5">
            {previousUploads.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-white border border-gray-200 rounded-lg"
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-xs font-medium text-gray-800 truncate">{source.name}</p>
                  <p className="text-2xs text-gray-400">
                    {source.node_count.toLocaleString()} nodes ·{" "}
                    {source.edge_count.toLocaleString()} edges · {formatDate(source.created_at)}
                  </p>
                </div>

                <button
                  onClick={() => handleLoad(source.id)}
                  disabled={loadingId === source.id || deletingId === source.id}
                  className="h-7 px-3 text-2xs font-medium border border-gray-200 bg-white text-gray-700 rounded-md hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                >
                  {loadingId === source.id ? (
                    <LoadingSpinner className="w-2.5 h-2.5" />
                  ) : (
                    "Load"
                  )}
                </button>

                <button
                  onClick={() => handleDelete(source.id)}
                  disabled={loadingId === source.id || deletingId === source.id}
                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 shrink-0"
                  title="Delete"
                >
                  {deletingId === source.id ? (
                    <LoadingSpinner className="w-2.5 h-2.5" />
                  ) : (
                    <XMarkIcon className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
