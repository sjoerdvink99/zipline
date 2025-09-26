import { useAnalysisStore, type SavedPredicate, type SavedFilterChain } from "../store/analysisStore";
import type { GeneratedPredicate } from "../api/predicates";
import { useState, useEffect, useCallback } from "react";
import {
  getPredicateTemplates,
  evaluateTemplatePredicate
} from "../api/predicates";
import {
  getPatterns,
  getPatternTemplates,
  getDomains,
  type Pattern,
  type PatternSuggestion
} from "../api/patterns";

interface FilterItem {
  id: string;
  type: "pattern" | "topology" | "attribute" | "fol";
  predicate: any;
  description: string;
  nodeTypes?: string[];
  isEditing?: boolean;
  patternConfig?: any;
}

interface SavedPredicatesSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const formatPredicate = (p: GeneratedPredicate): string => {
  const attr = p.attribute.replace(/_/g, " ");
  if (p.operator === "between" && p.value2 !== undefined) {
    return `${attr} ∈ [${Number(p.value).toFixed(1)}, ${Number(p.value2).toFixed(1)}]`;
  } else if (p.operator === "=") {
    return `${attr} = ${p.value}`;
  } else if (p.operator === "!=") {
    return `${attr} ≠ ${p.value}`;
  } else if (p.operator === ">=") {
    return `${attr} ≥ ${typeof p.value === "number" ? p.value.toFixed(1) : p.value}`;
  } else if (p.operator === "<=") {
    return `${attr} ≤ ${typeof p.value === "number" ? p.value.toFixed(1) : p.value}`;
  } else if (p.operator === ">") {
    return `${attr} > ${typeof p.value === "number" ? p.value.toFixed(1) : p.value}`;
  } else if (p.operator === "<") {
    return `${attr} < ${typeof p.value === "number" ? p.value.toFixed(1) : p.value}`;
  }
  return `${attr} ${p.operator} ${p.value}`;
};

const PredicateCard = ({
  saved,
  onApply,
  onDelete,
}: {
  saved: SavedPredicate;
  onApply: () => void;
  onDelete: () => void;
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-all">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-[11px] font-semibold text-gray-900 truncate">
              {saved.name}
            </h3>
          </div>
          <span className="text-[9px] text-gray-400 shrink-0">
            {formatDate(saved.createdAt)}
          </span>
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="space-y-1">
          {saved.predicates.map((p, idx) => (
            <div key={p.id} className="text-[10px] text-gray-600 font-mono">
              {idx > 0 && (
                <span className="text-gray-400 mr-1">
                  {saved.combineOp?.toUpperCase() || "AND"}
                </span>
              )}
              {formatPredicate(p)}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
        <span className="text-[9px] text-gray-500">
          {saved.predicates.length} predicate{saved.predicates.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onDelete}
            className="px-2 py-1 text-[10px] text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onApply}
            className="px-2 py-1 text-[10px] bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors font-medium"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

const TemplateCard = ({
  template,
  onApply,
  isApplying,
}: {
  template: any;
  onApply: () => void;
  isApplying?: boolean;
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-all">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-[11px] font-semibold text-gray-900 truncate">
              {template.name}
            </h3>
            <p className="text-[9px] text-gray-500 mt-0.5">
              {template.domain}
            </p>
          </div>
          <span className="text-[8px] text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full font-medium">
            FOL
          </span>
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="text-[10px] text-gray-600 line-clamp-2">
          {template.description}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
        <span className="text-[9px] text-gray-500">
          Template
        </span>
        <button
          onClick={onApply}
          disabled={isApplying}
          className="px-2 py-1 text-[10px] bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors font-medium disabled:opacity-50"
        >
          {isApplying ? "Adding..." : "Add"}
        </button>
      </div>
    </div>
  );
};

const PatternCard = ({
  pattern,
  onApply,
  onDelete,
  isTemplate = false,
}: {
  pattern: Pattern;
  onApply: () => void;
  onDelete?: () => void;
  isTemplate?: boolean;
}) => {
  const getPatternTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      hub: 'bg-blue-100 text-blue-700',
      bridge: 'bg-purple-100 text-purple-700',
      star: 'bg-yellow-100 text-yellow-700',
      cluster: 'bg-green-100 text-green-700',
      community: 'bg-indigo-100 text-indigo-700',
      custom: 'bg-gray-100 text-gray-700'
    };
    return colors[type] || colors.custom;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-all">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-[11px] font-semibold text-gray-900 truncate">
              {pattern.name}
            </h3>
            <p className="text-[9px] text-gray-500 mt-0.5">
              {pattern.domain || 'General'}
            </p>
          </div>
          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${getPatternTypeColor(pattern.pattern_type)}`}>
            {pattern.pattern_type.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="text-[10px] text-gray-600 line-clamp-2">
          {pattern.description}
        </div>
        {!isTemplate && pattern.node_ids && pattern.node_ids.length > 0 && (
          <div className="text-[9px] text-gray-500 mt-1">
            {pattern.node_ids.length} nodes • {Math.round(pattern.confidence * 100)}% confidence
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
        <span className="text-[9px] text-gray-500">
          {isTemplate ? 'Template' : 'Pattern'}
        </span>
        <div className="flex items-center gap-2">
          {!isTemplate && onDelete && (
            <button
              onClick={onDelete}
              className="px-2 py-1 text-[10px] text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              Delete
            </button>
          )}
          <button
            onClick={onApply}
            className={`px-2 py-1 text-[10px] text-white rounded transition-colors font-medium ${
              isTemplate ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-800'
            }`}
          >
            {isTemplate ? 'Use' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};

const FilterChainCard = ({
  filterChain,
  savedPredicates,
  onLoad,
  onDelete,
}: {
  filterChain: SavedFilterChain;
  savedPredicates: SavedPredicate[];
  onLoad: () => void;
  onDelete: () => void;
}) => {
  const validPredicates = filterChain.predicateIds
    .map(predId => savedPredicates.find(sp => sp.id === predId))
    .filter((pred): pred is SavedPredicate => pred !== undefined);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-all">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-[11px] font-semibold text-gray-900 truncate">
              {filterChain.name}
            </h3>
          </div>
          <span className="text-[9px] text-gray-400 shrink-0">
            {formatDate(filterChain.createdAt)}
          </span>
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="space-y-1">
          {validPredicates.slice(0, 3).map((pred, idx) => (
            <div key={pred.id} className="text-[10px] text-gray-600 font-mono">
              {idx > 0 && <span className="text-gray-400 mr-1">→</span>}
              {pred.name}
            </div>
          ))}
          {validPredicates.length > 3 && (
            <div className="text-[10px] text-gray-500 italic">
              +{validPredicates.length - 3} more...
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
        <span className="text-[9px] text-gray-500">
          {validPredicates.length} of {filterChain.predicateIds.length} chains
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onDelete}
            className="px-2 py-1 text-[10px] text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onLoad}
            className="px-2 py-1 text-[10px] bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors font-medium"
          >
            Load
          </button>
        </div>
      </div>
    </div>
  );
};

export const SavedPredicatesSidebar = ({
  isOpen,
  onClose,
  sessionId = "default"
}: SavedPredicatesSidebarProps) => {
  const {
    savedPredicates,
    savedFilterChains,
    removeSavedPredicate,
    applySavedPredicate,
    loadFilterChain,
    removeSavedFilterChain
  } = useAnalysisStore();

  const [templates, setTemplates] = useState<any[]>([]);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState<string | null>(null);

  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [patternTemplates, setPatternTemplates] = useState<Pattern[]>([]);
  const [patternSuggestions, setPatternSuggestions] = useState<PatternSuggestion[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [isLoadingPatterns, setIsLoadingPatterns] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      loadPatterns();
    }
  }, [isOpen, selectedDomain]);

  const loadTemplates = async () => {
    try {
      const response = await getPredicateTemplates();
      setTemplates(Object.entries(response.templates).map(([key, template]) => ({
        key,
        ...template
      })));
    } catch (error) {
      console.error("Failed to load templates:", error);
    }
  };

  const loadPatterns = async () => {
    setIsLoadingPatterns(true);
    try {
      if (domains.length === 0) {
        const availableDomains = await getDomains();
        setDomains(availableDomains);
      }

      const domain = selectedDomain === 'all' ? undefined : selectedDomain;
      const savedPatterns = await getPatterns(domain);
      setPatterns(savedPatterns);

      const templates = await getPatternTemplates(domain);
      setPatternTemplates(templates);
    } catch (error) {
      console.error("Failed to load patterns:", error);
    } finally {
      setIsLoadingPatterns(false);
    }
  };

  const handleApplyTemplate = useCallback(async (templateKey: string) => {
    setIsApplyingTemplate(templateKey);
    try {
      const response = await evaluateTemplatePredicate({
        template_key: templateKey
      }, sessionId);

      const template = templates.find(t => t.key === templateKey);
      const newItem: FilterItem = {
        id: `template_${Date.now()}`,
        type: "fol",
        description: template?.name || templateKey,
        predicate: {
          expression: response.expression,
          matching_nodes: response.matching_nodes,
          validation_result: response.validation_result,
          fol_type: "template",
          config: { template_key: templateKey }
        }
      };

      window.dispatchEvent(new CustomEvent('gb:add-filter-item', { detail: newItem }));
    } catch (error) {
      console.error("Failed to evaluate template predicate:", error);
    } finally {
      setIsApplyingTemplate(null);
    }
  }, [templates, sessionId]);

  const handleApplyPattern = useCallback((pattern: Pattern) => {
    const newItem: FilterItem = {
      id: `pattern_${Date.now()}`,
      type: "pattern",
      description: pattern.name,
      predicate: {
        pattern_id: pattern.id,
        pattern_type: pattern.pattern_type,
        node_ids: pattern.node_ids,
        metadata: pattern.metadata
      },
      patternConfig: {
        pattern
      }
    };

    window.dispatchEvent(new CustomEvent('gb:add-filter-item', { detail: newItem }));
  }, []);

  const handleDeletePattern = useCallback(async (patternId: string) => {
    try {
      setPatterns(prev => prev.filter(p => p.id !== patternId));


      console.log(`Pattern ${patternId} deleted`);
    } catch (error) {
      console.error("Failed to delete pattern:", error);
      loadPatterns();
    }
  }, [loadPatterns]);

  const handleExport = () => {
    const exportData = {
      predicates: savedPredicates,
      filterChains: savedFilterChains
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `saved-predicates-chains-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed right-0 top-0 h-full bg-gray-50 shadow-2xl border-l border-gray-200 transition-transform duration-300 ease-in-out z-50 flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "360px" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
            <div>
              <h2 className="text-[11px] font-semibold text-gray-900">
                Predicate Patterns
              </h2>
              <p className="text-[9px] text-gray-500">
                {templates.length} FOL, {patternTemplates.length} patterns, {savedPredicates.length} saved, {savedFilterChains.length} chains
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(savedPredicates.length > 0 || savedFilterChains.length > 0) && (
              <button
                onClick={handleExport}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Export all"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Close"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>


        <div className="flex-1 overflow-y-auto p-4">
          {templates.length === 0 && savedPredicates.length === 0 && savedFilterChains.length === 0 && patternTemplates.length === 0 && patterns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="p-4 bg-gray-100 rounded-lg mb-4">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
              </div>
              <h3 className="text-[11px] font-semibold text-gray-900 mb-1">
                No saved items
              </h3>
              <p className="text-[10px] text-gray-500 max-w-[200px] leading-relaxed">
                Save predicates from the bridge or attribute space to build reasoning chains.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* User Defined Predicates Section */}
              {(patterns.filter(p => p.pattern_type === 'custom').length > 0 || savedFilterChains.length > 0 || savedPredicates.length > 0) && (
                <div className="space-y-4">
                  <h3 className="text-[12px] font-bold text-gray-800 uppercase tracking-wide px-1 border-b border-gray-200 pb-2">
                    User Defined Predicates
                  </h3>

                  {patterns.filter(p => p.pattern_type === 'custom').length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-medium text-gray-700 uppercase tracking-wide px-1">
                        Saved Patterns
                      </h4>
                      <div className="space-y-3">
                        {patterns.filter(p => p.pattern_type === 'custom').map((pattern) => (
                          <PatternCard
                            key={pattern.id}
                            pattern={pattern}
                            onApply={() => handleApplyPattern(pattern)}
                            onDelete={() => handleDeletePattern(pattern.id)}
                            isTemplate={false}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {savedFilterChains.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-medium text-gray-700 uppercase tracking-wide px-1">
                        Filter Chains
                      </h4>
                      <div className="space-y-3">
                        {savedFilterChains.map((filterChain) => (
                          <FilterChainCard
                            key={filterChain.id}
                            filterChain={filterChain}
                            savedPredicates={savedPredicates}
                            onLoad={() => loadFilterChain(filterChain.id)}
                            onDelete={() => removeSavedFilterChain(filterChain.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {savedPredicates.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-medium text-gray-700 uppercase tracking-wide px-1">
                        Saved Predicates
                      </h4>
                      <div className="space-y-3">
                        {savedPredicates.map((saved) => (
                          <PredicateCard
                            key={saved.id}
                            saved={saved}
                            onApply={() => applySavedPredicate(saved.id)}
                            onDelete={() => removeSavedPredicate(saved.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Predefined Predicates Section */}
              {(templates.length > 0 || patternTemplates.length > 0 || patterns.filter(p => p.pattern_type !== 'custom').length > 0) && (
                <div className="space-y-4">
                  <h3 className="text-[12px] font-bold text-gray-800 uppercase tracking-wide px-1 border-b border-gray-200 pb-2">
                    Predefined Predicates
                  </h3>

                  {patterns.filter(p => p.pattern_type !== 'custom').length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-medium text-gray-700 uppercase tracking-wide px-1">
                        System Detected Patterns
                      </h4>
                      <div className="space-y-3">
                        {patterns.filter(p => p.pattern_type !== 'custom').map((pattern) => (
                          <PatternCard
                            key={pattern.id}
                            pattern={pattern}
                            onApply={() => handleApplyPattern(pattern)}
                            isTemplate={false}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {templates.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-medium text-gray-700 uppercase tracking-wide px-1">
                        FOL Templates
                      </h4>
                      <div className="space-y-3">
                        {templates.map((template) => (
                          <TemplateCard
                            key={template.key}
                            template={template}
                            onApply={() => handleApplyTemplate(template.key)}
                            isApplying={isApplyingTemplate === template.key}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {patternTemplates.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-medium text-gray-700 uppercase tracking-wide px-1">
                        Pattern Templates
                      </h4>
                      <div className="space-y-3">
                        {patternTemplates.map((pattern) => (
                          <PatternCard
                            key={pattern.id}
                            pattern={pattern}
                            onApply={() => handleApplyPattern(pattern)}
                            isTemplate={true}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
