import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { RefObject } from "react";
import type { GraphRenderer } from "./GraphRenderer";
import { renderExportImage, type ExportConfig } from "./exportRenderer";
import { renderDistributionPanel, type DistributionChartSpec } from "./distributionCanvas";
import { getDistributions, type DistributionsByLabelResponse } from "../../../api/attributes";
import { useGraphDataStore } from "../../../store/graphDataStore";
import { useAnalysisStore } from "../../../store/analysisStore";
import { useLearningStore } from "../../../store/learningStore";
import { XMarkIcon } from "../../ui/Icons";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  rendererRef: RefObject<GraphRenderer | null>;
}

type Resolution = 2 | 3 | 4;
type Background = "white" | "lightgray" | "transparent";
type Scope = "full" | "dimBackground" | "selectedOnly";

interface AttrKey {
  nodeType: string | null;
  attrName: string;
  label: string;
}

export function ExportModal({ isOpen, onClose, rendererRef }: ExportModalProps) {
  const { legendData } = useGraphDataStore();
  const { selectedNodes, contrastNodes, pinnedSelections } = useAnalysisStore();
  const { bestPredicate } = useLearningStore();

  const [showTitle, setShowTitle] = useState(false);
  const [title, setTitle] = useState("ZipLine Export");
  const [showLegend, setShowLegend] = useState(true);
  const [showPredicate, setShowPredicate] = useState(!!bestPredicate);
  const [showSelectionInfo, setShowSelectionInfo] = useState(false);
  const [scope, setScope] = useState<Scope>("full");
  const selectedOnly = scope === "selectedOnly";
  const dimBackground = scope === "dimBackground";
  const [resolution, setResolution] = useState<Resolution>(2);
  const [background, setBackground] = useState<Background>("white");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [showGraph, setShowGraph] = useState(true);
  const [showDistributions, setShowDistributions] = useState(false);
  const [showSelectionInDist, setShowSelectionInDist] = useState(true);
  const [selectedAttrKeys, setSelectedAttrKeys] = useState<string[]>([]);
  const [distributionData, setDistributionData] = useState<DistributionsByLabelResponse | null>(null);

  const hasSelection = selectedNodes.length > 0;
  const hasPredicate = !!bestPredicate;

  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPreviewUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    getDistributions().then(setDistributionData).catch(() => {});
  }, [isOpen]);

  const availableAttrs = useMemo<AttrKey[]>(() => {
    if (!distributionData) return [];
    const out: AttrKey[] = [];
    for (const [nodeType, labelDist] of Object.entries(distributionData.distributions_by_label)) {
      for (const attrName of Object.keys(labelDist.attributes)) {
        out.push({ nodeType, attrName, label: `${attrName} (${nodeType})` });
      }
    }
    for (const attrName of Object.keys(distributionData.shared_attributes)) {
      out.push({ nodeType: null, attrName, label: attrName });
    }
    return out;
  }, [distributionData]);

  const buildDistributionPanel = useCallback(
    (scale: number): HTMLCanvasElement | null => {
      if (!showDistributions || selectedAttrKeys.length === 0 || !distributionData) return null;
      const specs: DistributionChartSpec[] = [];
      for (const key of selectedAttrKeys) {
        const found = availableAttrs.find((a) => `${a.nodeType}::${a.attrName}` === key);
        if (!found) continue;
        let distribution = null;
        if (found.nodeType && distributionData.distributions_by_label[found.nodeType]) {
          distribution = distributionData.distributions_by_label[found.nodeType].attributes[found.attrName];
        } else if (!found.nodeType) {
          distribution = distributionData.shared_attributes[found.attrName];
        }
        if (distribution) {
          specs.push({ nodeType: found.nodeType, attrName: found.attrName, distribution });
        }
      }
      if (specs.length === 0) return null;
      return renderDistributionPanel(specs, {
        scale,
        selectedNodes: new Set(selectedNodes),
        showSelection: showSelectionInDist && hasSelection,
      });
    },
    [showDistributions, selectedAttrKeys, distributionData, availableAttrs, selectedNodes, showSelectionInDist, hasSelection],
  );

  const buildConfig = useCallback(
    (scale: number): ExportConfig => ({
      title,
      showTitle,
      showLegend,
      showPredicate: showPredicate && hasPredicate,
      showSelectionInfo,
      background,
      scale,
      legendData,
      predicate: bestPredicate?.fol_expression ?? null,
      selectedCount: selectedNodes.length,
      contrastCount: contrastNodes.length,
      pinnedCount: pinnedSelections.length,
    }),
    [
      title,
      showTitle,
      showLegend,
      showPredicate,
      hasPredicate,
      showSelectionInfo,
      background,
      legendData,
      bestPredicate,
      selectedNodes,
      contrastNodes,
      pinnedSelections,
    ],
  );

  const generatePreview = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !renderer.isReady()) return;

    const graphCanvas = showGraph
      ? renderer.exportHighRes(1, selectedOnly, dimBackground)
      : null;

    if (!showGraph && !showDistributions) return;

    const distPanel = buildDistributionPanel(1);
    const config = buildConfig(1);
    const final = renderExportImage(graphCanvas, distPanel, config);

    final.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      if (prevPreviewUrl.current) URL.revokeObjectURL(prevPreviewUrl.current);
      prevPreviewUrl.current = url;
      setPreviewUrl(url);
    }, "image/png");
  }, [rendererRef, buildConfig, buildDistributionPanel, selectedOnly, dimBackground, showGraph, showDistributions]);

  useEffect(() => {
    if (!isOpen) return;
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    previewTimeoutRef.current = setTimeout(() => { generatePreview(); }, 300);
    return () => {
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    };
  }, [
    isOpen,
    showTitle,
    title,
    showLegend,
    showPredicate,
    showSelectionInfo,
    scope,
    background,
    showGraph,
    showDistributions,
    showSelectionInDist,
    selectedAttrKeys,
    generatePreview,
  ]);

  useEffect(() => {
    if (!isOpen && prevPreviewUrl.current) {
      URL.revokeObjectURL(prevPreviewUrl.current);
      prevPreviewUrl.current = null;
      setPreviewUrl(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleExport = async () => {
    const renderer = rendererRef.current;
    if (isGenerating) return;
    if (showGraph && (!renderer || !renderer.isReady())) return;
    setIsGenerating(true);

    try {
      const graphCanvas = showGraph
        ? renderer!.exportHighRes(resolution, selectedOnly, dimBackground)
        : null;

      const distPanel = buildDistributionPanel(resolution);
      const config = buildConfig(resolution);
      const final = renderExportImage(graphCanvas, distPanel, config);

      await new Promise<void>((resolve) => {
        final.toBlob((blob) => {
          if (!blob) { resolve(); return; }
          const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
          const slug = showTitle && title
            ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
            : "graph";
          const filename = `zipline-${slug}-${ts}.png`;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
          resolve();
        }, "image/png");
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleAttrKey = (key: string) => {
    setSelectedAttrKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const attrsByType = useMemo(() => {
    const grouped: Record<string, AttrKey[]> = {};
    for (const a of availableAttrs) {
      const key = a.nodeType ?? "__shared__";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    }
    return grouped;
  }, [availableAttrs]);

  const exportDisabled = isGenerating || (!showGraph && (!showDistributions || selectedAttrKeys.length === 0));

  if (!isOpen) return null;

  const rendererCanvas = rendererRef.current?.getCanvas();
  const canvasW = rendererCanvas?.width ?? 800;
  const canvasH = rendererCanvas?.height ?? 600;
  const exportW = Math.round(canvasW * resolution);
  const exportH = Math.round(canvasH * resolution);

  return (
    <div
      className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Export Image</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-5 pt-4 pb-3">
            <div
              className="rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden"
              style={{ maxHeight: 280, minHeight: 120 }}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Export preview"
                  className="max-w-full max-h-[280px] object-contain"
                />
              ) : (
                <div className="text-xs text-gray-400 py-8">Generating preview...</div>
              )}
            </div>
          </div>

          <div className="px-5 pb-5 space-y-4">
            <div>
              <div className="text-[11px] font-medium text-gray-700 mb-2">Content</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGraph}
                    onChange={(e) => setShowGraph(e.target.checked)}
                    className="w-3 h-3 rounded border-gray-300 text-blue-500"
                  />
                  <span className="text-[11px] text-gray-600">Graph</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDistributions}
                    onChange={(e) => setShowDistributions(e.target.checked)}
                    className="w-3 h-3 rounded border-gray-300 text-blue-500"
                  />
                  <span className="text-[11px] text-gray-600">Attribute distributions</span>
                </label>
              </div>
            </div>

            {showDistributions && (
              <div>
                <div className="text-[11px] font-medium text-gray-700 mb-2">Attributes</div>
                {availableAttrs.length === 0 ? (
                  <div className="text-[11px] text-gray-400">Loading...</div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {Object.entries(attrsByType).map(([groupKey, attrs]) => (
                      <div key={groupKey}>
                        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                          {groupKey === "__shared__" ? "Shared" : groupKey}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {attrs.map((a) => {
                            const key = `${a.nodeType}::${a.attrName}`;
                            return (
                              <label key={key} className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedAttrKeys.includes(key)}
                                  onChange={() => toggleAttrKey(key)}
                                  className="w-3 h-3 rounded border-gray-300 text-blue-500"
                                />
                                <span className="text-[11px] text-gray-600">{a.attrName}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {hasSelection && (
                  <label className="flex items-center gap-1.5 cursor-pointer mt-2">
                    <input
                      type="checkbox"
                      checked={showSelectionInDist}
                      onChange={(e) => setShowSelectionInDist(e.target.checked)}
                      className="w-3 h-3 rounded border-gray-300 text-blue-500"
                    />
                    <span className="text-[11px] text-gray-600">
                      Show selection
                      <span className="text-gray-400 ml-1">({selectedNodes.length})</span>
                    </span>
                  </label>
                )}
              </div>
            )}

            {showGraph && (
              <div>
                <div className="text-[11px] font-medium text-gray-700 mb-2">Scope</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === "full"}
                      onChange={() => setScope("full")}
                      className="w-3 h-3 text-blue-500 border-gray-300"
                    />
                    <span className="text-[11px] text-gray-600">Full graph</span>
                  </label>
                  <label className={`flex items-center gap-1.5 ${hasSelection ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}>
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === "dimBackground"}
                      onChange={() => setScope("dimBackground")}
                      disabled={!hasSelection}
                      className="w-3 h-3 text-blue-500 border-gray-300"
                    />
                    <span className="text-[11px] text-gray-600">
                      Dim background
                      {hasSelection && <span className="text-gray-400 ml-1">({selectedNodes.length})</span>}
                    </span>
                  </label>
                  <label className={`flex items-center gap-1.5 ${hasSelection ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}>
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === "selectedOnly"}
                      onChange={() => setScope("selectedOnly")}
                      disabled={!hasSelection}
                      className="w-3 h-3 text-blue-500 border-gray-300"
                    />
                    <span className="text-[11px] text-gray-600">
                      Selected only
                      {hasSelection && <span className="text-gray-400 ml-1">({selectedNodes.length})</span>}
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div>
              <div className="text-[11px] font-medium text-gray-700 mb-2">Include</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showLegend}
                    onChange={(e) => setShowLegend(e.target.checked)}
                    className="w-3 h-3 rounded border-gray-300 text-blue-500"
                  />
                  <span className="text-[11px] text-gray-600">Legend</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTitle}
                    onChange={(e) => setShowTitle(e.target.checked)}
                    className="w-3 h-3 rounded border-gray-300 text-blue-500"
                  />
                  <span className="text-[11px] text-gray-600">Title</span>
                </label>
                <label className={`flex items-center gap-1.5 ${hasPredicate ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}>
                  <input
                    type="checkbox"
                    checked={showPredicate && hasPredicate}
                    onChange={(e) => setShowPredicate(e.target.checked)}
                    disabled={!hasPredicate}
                    className="w-3 h-3 rounded border-gray-300 text-blue-500"
                  />
                  <span className="text-[11px] text-gray-600">Predicate</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSelectionInfo}
                    onChange={(e) => setShowSelectionInfo(e.target.checked)}
                    className="w-3 h-3 rounded border-gray-300 text-blue-500"
                  />
                  <span className="text-[11px] text-gray-600">Selection info</span>
                </label>
              </div>
            </div>

            {showTitle && (
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title..."
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            )}

            <div>
              <div className="text-[11px] font-medium text-gray-700 mb-1.5">Resolution</div>
              <div className="flex items-center gap-3">
                {([2, 3, 4] as Resolution[]).map((r) => (
                  <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="resolution"
                      value={r}
                      checked={resolution === r}
                      onChange={() => setResolution(r)}
                      className="w-3 h-3 text-blue-500 border-gray-300"
                    />
                    <span className="text-[11px] text-gray-600">{r}×</span>
                  </label>
                ))}
                {showGraph && (
                  <span className="text-[10px] text-gray-400 ml-auto">
                    {exportW} × {exportH} px
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-gray-700 mb-1.5">Background</div>
              <div className="flex items-center gap-3">
                {(
                  [
                    { value: "white", label: "White" },
                    { value: "lightgray", label: "Light gray" },
                    { value: "transparent", label: "Transparent" },
                  ] as { value: Background; label: string }[]
                ).map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="background"
                      value={value}
                      checked={background === value}
                      onChange={() => setBackground(value)}
                      className="w-3 h-3 text-blue-500 border-gray-300"
                    />
                    <span className="text-[11px] text-gray-600">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exportDisabled}
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <span className="inline-block animate-spin h-3 w-3 border border-white border-t-transparent rounded-full" />
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Export PNG
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
