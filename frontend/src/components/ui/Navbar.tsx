import { useState, useRef } from "react";
import { GraphSelector } from "./GraphSelector";

export function Navbar() {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      const graphData = JSON.parse(text);

      const response = await fetch("/api/graph/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(graphData),
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      await response.json();
      window.location.reload();
    } catch (error) {
      console.error("Upload error:", error);
      alert(
        `Failed to upload graph: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200/80 px-4 py-2.5 flex items-center justify-between shrink-0 shadow-sm">
      <div className="flex items-center gap-2">
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

      <div className="flex items-center gap-3">
        <GraphSelector />

        <div className="w-px h-5 bg-gray-200" />

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />

        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <div className="animate-spin h-3.5 w-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full" />
              <span>Uploading</span>
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              <span>Upload</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
