import { useState, useRef, useEffect } from "react";
import type { LayoutAlgo } from "../../../utils/graphLayout";
import type { VisualizationSettings } from "./GraphRenderer";

interface GraphToolbarProps {
  layout: LayoutAlgo;
  kPartiteOrientation: "horizontal" | "vertical";
  selNodes: string[];
  isLayoutRunning: boolean;
  settings: VisualizationSettings;
  numericAttributes: string[];
  showSettings: boolean;
  settingsRef: React.RefObject<HTMLDivElement | null>;
  neighborTypes: Array<{ type: string; count: number; color: number }>;
  onLayoutChange: (layout: LayoutAlgo) => void;
  onOrientationChange: (orientation: "horizontal" | "vertical") => void;
  onExpandSelection: (typeFilter?: string | null) => void;
  onCenterView: () => void;
  onExport: () => void;
  onToggleSettings: () => void;
  onSettingsChange: (settings: VisualizationSettings) => void;
}

export const GraphToolbar = ({
  layout,
  kPartiteOrientation,
  selNodes,
  isLayoutRunning,
  settings,
  numericAttributes,
  showSettings,
  settingsRef,
  neighborTypes,
  onLayoutChange,
  onOrientationChange,
  onExpandSelection,
  onCenterView,
  onExport,
  onToggleSettings,
  onSettingsChange,
}: GraphToolbarProps) => {
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTypeDropdown) return;
    const handler = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setShowTypeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTypeDropdown]);

  return (
    <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-gray-100">
          <span className="text-[10px] text-gray-400">Layout</span>
          <select
            className="text-[10px] border-0 bg-transparent text-gray-600 focus:ring-0 cursor-pointer pr-4"
            value={layout}
            onChange={(e) => onLayoutChange(e.target.value as LayoutAlgo)}
            disabled={isLayoutRunning}
            title="Choose layout algorithm for node positioning"
          >
            <option value="force">Force-Directed</option>
            <option value="forceatlas2">ForceAtlas2</option>
            <option value="grid">Grid</option>
            <option value="circle">Circle</option>
            <option value="radial">Radial by Component</option>
            <option value="kpartite">K-Partite by Type</option>
          </select>
        </div>
        {layout === "kpartite" && (
          <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-gray-100">
            <span className="text-[10px] text-gray-400">Orient</span>
            <select
              className="text-[10px] border-0 bg-transparent text-gray-600 focus:ring-0 cursor-pointer pr-4"
              value={kPartiteOrientation}
              onChange={(e) => onOrientationChange(e.target.value as "horizontal" | "vertical")}
              disabled={isLayoutRunning}
              title="Orientation of k-partite layout partitions"
            >
              <option value="horizontal">Horizontal Lines</option>
              <option value="vertical">Vertical Lines</option>
            </select>
          </div>
        )}
        {selNodes.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onExpandSelection(null)}
              disabled={isLayoutRunning}
              className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-gray-100 text-[10px] text-gray-600 hover:text-gray-800 hover:bg-white transition-colors disabled:opacity-50"
              title="Expand selection to include all neighbor nodes"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              Expand
              <span className="text-gray-400">({selNodes.length})</span>
            </button>
            {neighborTypes.length > 1 && (
              <div className="relative" ref={typeDropdownRef}>
                <button
                  onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                  disabled={isLayoutRunning}
                  className="flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-sm border border-gray-100 text-[10px] text-gray-500 hover:text-gray-800 hover:bg-white transition-colors disabled:opacity-50"
                  title="Expand to a specific neighbor type"
                >
                  by type
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showTypeDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-20 min-w-[130px]">
                    {neighborTypes.map(({ type, count, color }) => (
                      <button
                        key={type}
                        onClick={() => { onExpandSelection(type); setShowTypeDropdown(false); }}
                        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[10px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: `#${color.toString(16).padStart(6, "0")}` }}
                        />
                        <span className="flex-1 text-left truncate">{type}</span>
                        <span className="text-gray-400">{count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <button
          onClick={onCenterView}
          className="flex items-center justify-center w-6 h-6 bg-white/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          title="Fit graph to view"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </button>
        <button
          onClick={onExport}
          className="flex items-center justify-center w-6 h-6 bg-white/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          title="Export graph as PNG"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </button>
        <div className="relative" ref={settingsRef}>
          <button
            onClick={onToggleSettings}
            className="flex items-center justify-center w-6 h-6 bg-white/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            title="Visualization settings"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          {showSettings && (
            <div className="absolute top-8 right-0 bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[180px] z-20">
              <div className="text-[11px] font-medium text-gray-700 mb-2">Display Settings</div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Labels</label>
                  <select
                    value={settings.showLabels}
                    onChange={(e) => onSettingsChange({ ...settings, showLabels: e.target.value as "auto" | "always" | "never" })}
                    className="w-full text-[10px] border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="auto">Auto</option>
                    <option value="always">Always</option>
                    <option value="never">Never</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Node Size</label>
                  <select
                    value={settings.nodeSize}
                    onChange={(e) => onSettingsChange({ ...settings, nodeSize: e.target.value as "auto" | "small" | "medium" | "large" })}
                    className="w-full text-[10px] border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="auto">Auto</option>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Size By</label>
                  <select
                    value={settings.nodeSizeBy}
                    onChange={(e) => onSettingsChange({
                      ...settings,
                      nodeSizeBy: e.target.value as "fixed" | "degree" | "attribute",
                      nodeSizeAttribute: e.target.value === "attribute" ? numericAttributes[0] || null : null,
                    })}
                    className="w-full text-[10px] border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="degree">Degree</option>
                    {numericAttributes.length > 0 && <option value="attribute">Attribute</option>}
                  </select>
                </div>
                {settings.nodeSizeBy === "attribute" && numericAttributes.length > 0 && (
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Attribute</label>
                    <select
                      value={settings.nodeSizeAttribute || ""}
                      onChange={(e) => onSettingsChange({ ...settings, nodeSizeAttribute: e.target.value || null })}
                      className="w-full text-[10px] border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {numericAttributes.map((attr) => (
                        <option key={attr} value={attr}>{attr}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Edges</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.showEdges}
                      onChange={(e) => onSettingsChange({ ...settings, showEdges: e.target.checked })}
                      className="w-3 h-3 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                    />
                    <span className="text-[10px] text-gray-600">Show Edges</span>
                  </div>
                </div>
                {settings.showEdges && (
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Edge Opacity</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.edgeOpacity}
                      onChange={(e) => onSettingsChange({ ...settings, edgeOpacity: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
    </div>
  );
};
