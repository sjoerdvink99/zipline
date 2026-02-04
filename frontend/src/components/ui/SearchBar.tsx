import { useState, useEffect, useRef, useCallback } from "react";
import { searchNodes, type SearchResult } from "../../api/search";
import { useAnalysisStore } from "../../store/analysisStore";
import { SearchIcon, AlertCircleIcon, LoadingSpinner } from "./Icons";

interface SearchBarProps {
  onResultSelect: (nodeId: string, addToSelection?: boolean) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function SearchBar({
  onResultSelect,
  placeholder = "Search nodes...",
  className = "",
  autoFocus = false,
}: SearchBarProps) {
  const currentDataset = useAnalysisStore((s) => s.currentDataset);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const datasetRef = useRef(currentDataset);

  useEffect(() => {
    datasetRef.current = currentDataset;
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    setError(null);
  }, [currentDataset]);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await searchNodes({
        query: searchQuery.trim(),
        limit: 8,
      });
      if (datasetRef.current !== useAnalysisStore.getState().currentDataset)
        return;

      if (response.error) {
        setError(response.error);
        setResults([]);
      } else {
        setError(null);
        setResults(response.results);
      }
      setIsOpen(true);
      setSelectedIndex(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, performSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length)
          handleResultSelect(results[selectedIndex]);
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleResultSelect = (result: SearchResult, addToSelection = false) => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    onResultSelect(result.node_id, addToSelection);
  };

  const getMatchTypeColor = (matchType: string) => {
    switch (matchType) {
      case "exact_id":
      case "exact_label":
        return "bg-green-100 text-green-700";
      case "partial_id":
      case "partial_label":
        return "bg-blue-100 text-blue-700";
      case "attribute":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getMatchTypeLabel = (matchType: string) => {
    switch (matchType) {
      case "exact_id":
        return "ID";
      case "exact_label":
        return "Label";
      case "partial_id":
        return "ID";
      case "partial_label":
        return "Label";
      case "attribute":
        return "Attr";
      case "fuzzy":
        return "Fuzzy";
      default:
        return "Match";
    }
  };

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <SearchIcon className="h-4 w-4 text-gray-400" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          autoFocus={autoFocus}
          className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm placeholder-gray-400 bg-white hover:bg-gray-50 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-base"
          placeholder={placeholder}
        />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-panel z-50 max-h-64 overflow-y-auto">
          {error ? (
            <div className="px-3 py-2 text-sm text-red-600 flex items-center gap-2">
              <AlertCircleIcon className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : results.length === 0 && query.trim() ? (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              <SearchIcon className="h-6 w-6 text-gray-300 mx-auto mb-1" />
              <div>No nodes found for "{query}"</div>
              <div className="text-xs text-gray-400 mt-1">
                Try searching by ID, label, or attributes
              </div>
            </div>
          ) : (
            results.map((result, index) => (
              <div
                key={result.node_id}
                className={`px-3 py-2 cursor-pointer transition-base border-b border-gray-100 last:border-0 ${
                  index === selectedIndex ? "bg-gray-100" : "hover:bg-gray-50"
                }`}
                onClick={(e) => handleResultSelect(result, e.shiftKey)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {result.label}
                      </span>
                      {result.node_id !== result.label && (
                        <span className="text-xs text-gray-500 truncate">
                          {result.node_id}
                        </span>
                      )}
                    </div>
                    {result.highlights.length > 0 && (
                      <div className="text-xs text-gray-600 truncate mt-0.5">
                        {result.highlights[0]}
                      </div>
                    )}
                    {Object.keys(result.attributes).length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {Object.entries(result.attributes)
                          .slice(0, 2)
                          .map(([key, value]) => (
                            <span
                              key={key}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                            >
                              {key}: {String(value).slice(0, 10)}
                              {String(value).length > 10 ? "..." : ""}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${getMatchTypeColor(result.match_type)}`}
                    >
                      {getMatchTypeLabel(result.match_type)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {Math.round(result.score * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
