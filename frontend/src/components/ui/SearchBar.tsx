import { useState, useEffect, useRef, useCallback } from "react";
import { searchNodes, type SearchResult } from "../../api/search";
import { useAnalysisStore } from "../../store/analysisStore";

interface SearchBarProps {
  onResultSelect: (nodeId: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  onResultSelect,
  placeholder = "Search nodes...",
  className = ""
}: SearchBarProps) {
  const { currentDataset } = useAnalysisStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  const debouncedSearch = useCallback(async (searchQuery: string) => {
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
        dataset: currentDataset
      });

      if (response.error) {
        if (response.active_dataset && response.requested_dataset &&
            response.active_dataset !== response.requested_dataset) {

          const { setCurrentDataset } = useAnalysisStore.getState();
          setCurrentDataset(response.active_dataset);

          const retryResponse = await searchNodes({
            query: searchQuery.trim(),
            limit: 8,
            dataset: response.active_dataset
          });

          if (retryResponse.error) {
            setError(retryResponse.error);
            setResults([]);
            setIsOpen(true);
          } else {
            setError(null);
            setResults(retryResponse.results);
            setIsOpen(retryResponse.results.length > 0);
          }
        } else {
          setError(response.error);
          setResults([]);
          setIsOpen(true); // Show dropdown with error message
        }
      } else {
        setError(null);
        setResults(response.results);
        setIsOpen(response.results.length > 0);

        if (response.active_dataset && response.active_dataset !== response.requested_dataset) {
          const { setCurrentDataset } = useAnalysisStore.getState();
          setCurrentDataset(response.active_dataset);
        }
      }
      setSelectedIndex(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
      setIsOpen(true); // Show dropdown with error message
    } finally {
      setIsLoading(false);
    }
  }, [currentDataset]);

  useEffect(() => {
    setResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    setError(null);

    if (query.trim().length > 0) {
      debouncedSearch(query);
    }
  }, [currentDataset, debouncedSearch]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      debouncedSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, debouncedSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
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
        setSelectedIndex(prev =>
          prev < results.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : results.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleResultSelect(results[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleResultSelect = (result: SearchResult) => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    onResultSelect(result.node_id);
  };

  const getMatchTypeColor = (matchType: string) => {
    switch (matchType) {
      case "exact_id":
      case "exact_label":
        return "bg-green-100 text-green-700 border-green-200";
      case "partial_id":
      case "partial_label":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "attribute":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "fuzzy":
        return "bg-gray-100 text-gray-600 border-gray-200";
      default:
        return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  const getMatchTypeLabel = (matchType: string) => {
    switch (matchType) {
      case "exact_id": return "ID";
      case "exact_label": return "Label";
      case "partial_id": return "ID";
      case "partial_label": return "Label";
      case "attribute": return "Attr";
      case "fuzzy": return "Fuzzy";
      default: return "Match";
    }
  };

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {isLoading ? (
            <div className="animate-spin h-4 w-4 border border-gray-300 border-t-gray-500 rounded-full" />
          ) : (
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
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
          className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-md text-sm placeholder-gray-400
                     focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400
                     bg-white hover:bg-gray-50 transition-colors"
          placeholder={placeholder}
        />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
          {error ? (
            <div className="px-3 py-2 text-sm text-red-600 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Search error: {error}
              </div>
            </div>
          ) : results.length === 0 && query.trim() ? (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              <div className="flex flex-col items-center gap-1">
                <svg className="h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <div>No nodes found for "{query}"</div>
                <div className="text-xs text-gray-400">Try searching by ID, label, or attributes</div>
                <div className="text-xs text-gray-400 mt-1">Example searches: "0", "Node", or try partial matches</div>
              </div>
            </div>
          ) : (
            results.map((result, index) => (
              <div
                key={result.node_id}
                className={`px-3 py-2 cursor-pointer transition-colors ${
                  index === selectedIndex
                    ? "bg-gray-100"
                    : "hover:bg-gray-50"
                } ${index !== results.length - 1 ? "border-b border-gray-100" : ""}`}
                onClick={() => handleResultSelect(result)}
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
                        {Object.entries(result.attributes).slice(0, 2).map(([key, value]) => (
                          <span
                            key={key}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                          >
                            {key}: {String(value).slice(0, 10)}{String(value).length > 10 ? "..." : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${getMatchTypeColor(result.match_type)}`}>
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