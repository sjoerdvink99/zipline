import { useRef, useState } from "react";
import {
  loadNeo4jQuery,
  previewNeo4jQuery,
  type Neo4jConnectionConfig,
  type Neo4jSchemaInfo,
} from "../../api/data_sources";
import { LoadingSpinner } from "../ui/Icons";

interface Props {
  connection: Neo4jConnectionConfig;
  schema: Neo4jSchemaInfo;
  onDatasetLoaded: (id: string) => void;
}

const MAX_NODES_DEFAULT = 5000;
const MAX_NODES_MAX = 50_000;
const MAX_NODES_MIN = 100;
const MAX_EDGES_DEFAULT = 200_000;
const MAX_EDGES_MAX = 1_000_000;
const MAX_EDGES_MIN = 1_000;

const TEMPLATES = [
  {
    label: "All nodes of a type",
    query: "MATCH (n:Label)\nRETURN n\nLIMIT 5000",
  },
  {
    label: "Connected pairs",
    query: "MATCH (a:Label)-[:REL]->(b:Label)\nRETURN a, b\nLIMIT 5000",
  },
  {
    label: "K-hop neighborhood",
    query:
      "MATCH (seed {name: 'SeedName'})-[*1..2]-(n)\nRETURN DISTINCT n\nLIMIT 5000",
  },
  {
    label: "Property filter",
    query: "MATCH (n)\nWHERE n.property > value\nRETURN n\nLIMIT 5000",
  },
] as const;

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function SchemaReference({ schema }: { schema: Neo4jSchemaInfo }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <span>Schema Reference</span>
        <span className="text-gray-400">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <div className="flex gap-0 divide-x divide-gray-100">
          {/* Node labels */}
          <div className="flex-1 min-w-0 max-h-40 overflow-y-auto px-3 py-2 space-y-1.5">
            <div className="text-2xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Labels
            </div>
            {schema.node_labels.map((l) => (
              <div key={l.label} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700 truncate">
                    {l.label}
                  </span>
                  <span className="text-2xs text-gray-400 tabular-nums shrink-0 ml-2">
                    {formatNum(l.count)}
                  </span>
                </div>
                {l.properties.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {l.properties.map((p) => (
                      <span
                        key={p}
                        className="text-2xs px-1 py-0.5 bg-gray-100 text-gray-500 rounded"
                      >
                        .{p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Relationship types */}
          <div className="flex-1 min-w-0 max-h-40 overflow-y-auto px-3 py-2 space-y-1">
            <div className="text-2xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Relationships
            </div>
            {schema.relationship_types.map((r) => (
              <div key={r.type} className="flex items-center justify-between">
                <span className="text-xs text-gray-700 truncate">{r.type}</span>
                <span className="text-2xs text-gray-400 tabular-nums shrink-0 ml-2">
                  {formatNum(r.count)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Neo4jQueryEditor({ connection, schema, onDatasetLoaded }: Props) {
  const [query, setQuery] = useState(
    "MATCH (n)\nRETURN n\nLIMIT 5000",
  );
  const [maxNodes, setMaxNodes] = useState(MAX_NODES_DEFAULT);
  const [maxEdges, setMaxEdges] = useState(MAX_EDGES_DEFAULT);
  const [importName, setImportName] = useState("My Graph");
  const [showTemplates, setShowTemplates] = useState(false);

  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    node_count: number;
    capped: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [edgeLimitReached, setEdgeLimitReached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTemplateSelect = (q: string) => {
    setQuery(q);
    setShowTemplates(false);
    setPreviewResult(null);
    textareaRef.current?.focus();
  };

  const handlePreview = async () => {
    if (!query.trim()) return;
    setPreviewing(true);
    setError(null);
    setPreviewResult(null);
    try {
      const res = await previewNeo4jQuery({
        connection,
        query,
        max_nodes: maxNodes,
        max_edges: maxEdges,
        name: importName,
        description: "",
      });
      setPreviewResult(res);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail ?? "Preview failed — check your query and connection");
    } finally {
      setPreviewing(false);
    }
  };

  const handleLoad = async () => {
    if (!query.trim() || !importName.trim()) return;
    setLoading(true);
    setError(null);
    setEdgeLimitReached(false);
    try {
      const res = await loadNeo4jQuery({
        connection,
        query,
        max_nodes: maxNodes,
        max_edges: maxEdges,
        name: importName.trim(),
        description: "",
      });
      if (res.success) {
        if (res.edge_limit_reached) setEdgeLimitReached(true);
        onDatasetLoaded(res.dataset_id);
      } else {
        throw new Error("Load failed");
      }
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail ?? (e instanceof Error ? e.message : "Import failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <SchemaReference schema={schema} />

      {/* Query editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide">
            Cypher Query
          </label>
          <div className="relative">
            <button
              onClick={() => setShowTemplates((v) => !v)}
              className="text-2xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
            >
              Templates ▾
            </button>
            {showTemplates && (
              <div className="absolute right-0 top-5 z-10 w-56 bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => handleTemplateSelect(t.query)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPreviewResult(null);
          }}
          rows={5}
          spellCheck={false}
          className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white resize-y"
          placeholder="MATCH (n) RETURN n LIMIT 5000"
        />
      </div>

      {/* Node limit */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide">
            Node limit
          </label>
          <span className="text-xs font-semibold text-gray-900 tabular-nums">
            {maxNodes.toLocaleString()}
          </span>
        </div>
        <input
          type="range"
          min={MAX_NODES_MIN}
          max={MAX_NODES_MAX}
          step={500}
          value={maxNodes}
          onChange={(e) => {
            setMaxNodes(Number(e.target.value));
            setPreviewResult(null);
          }}
          className="w-full accent-gray-900"
        />
        <div className="flex justify-between">
          <span className="text-2xs text-gray-400">{MAX_NODES_MIN.toLocaleString()}</span>
          <span className="text-2xs text-gray-400">{MAX_NODES_MAX.toLocaleString()}</span>
        </div>
      </div>

      {/* Edge limit */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide">
            Edge limit
          </label>
          <span className="text-xs font-semibold text-gray-900 tabular-nums">
            {formatNum(maxEdges)}
          </span>
        </div>
        <input
          type="range"
          min={MAX_EDGES_MIN}
          max={MAX_EDGES_MAX}
          step={10_000}
          value={maxEdges}
          onChange={(e) => setMaxEdges(Number(e.target.value))}
          className="w-full accent-gray-900"
        />
        <div className="flex justify-between">
          <span className="text-2xs text-gray-400">{formatNum(MAX_EDGES_MIN)}</span>
          <span className="text-2xs text-gray-400">{formatNum(MAX_EDGES_MAX)}</span>
        </div>
      </div>

      {/* Dataset name */}
      <div className="space-y-1">
        <label className="text-2xs font-semibold text-gray-500 uppercase tracking-wide">
          Dataset name
        </label>
        <input
          type="text"
          value={importName}
          onChange={(e) => setImportName(e.target.value)}
          placeholder="My Graph"
          className="w-full h-9 px-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white"
        />
      </div>

      {/* Preview result */}
      {previewResult && (
        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span className="font-medium">{previewResult.node_count.toLocaleString()}</span>{" "}
          nodes matched
          {previewResult.capped && (
            <span className="text-amber-600">
              {" "}(capped at {maxNodes.toLocaleString()})
            </span>
          )}
        </div>
      )}

      {/* Edge limit warning */}
      {edgeLimitReached && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span className="shrink-0 mt-px">⚠</span>
          <span>
            Edge limit reached — {formatNum(maxEdges)} edges imported. Some
            connections may be missing. Increase the edge limit or narrow your
            query.
          </span>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={handlePreview}
          disabled={previewing || !query.trim()}
          className="h-9 px-4 text-xs font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {previewing ? (
            <>
              <LoadingSpinner className="w-3 h-3" />
              Counting…
            </>
          ) : (
            "Preview"
          )}
        </button>

        <button
          onClick={handleLoad}
          disabled={loading || !query.trim() || !importName.trim()}
          className="h-9 px-4 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <LoadingSpinner className="w-3 h-3 border-gray-600 border-t-white" />
              Importing…
            </>
          ) : (
            "Load Subgraph"
          )}
        </button>
      </div>
    </div>
  );
}
