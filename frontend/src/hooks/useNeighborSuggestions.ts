import { useState, useEffect, useMemo } from 'react';
import { getNeighborValues, type NeighborValuesResponse } from '../api';
import { useAnalysisStore } from '../store/analysisStore';

interface UseNeighborSuggestionsProps {
  targetPredicateIds: string[];
  attribute: string;
  enabled?: boolean;
}

interface UseNeighborSuggestionsResult {
  values: string[];
  loading: boolean;
  error: string | null;
  neighborCount: number;
}

export function useNeighborSuggestions({
  targetPredicateIds,
  attribute,
  enabled = true
}: UseNeighborSuggestionsProps): UseNeighborSuggestionsResult {
  const [data, setData] = useState<NeighborValuesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const predicateMatchNodes = useAnalysisStore(state => state.predicateMatchNodes);

  const targetNodes = useMemo(() => {
    return predicateMatchNodes;
  }, [predicateMatchNodes, targetPredicateIds]);

  const shouldFetch = enabled &&
    targetNodes.length > 0 &&
    attribute.trim().length > 0 &&
    targetPredicateIds.length > 0;

  useEffect(() => {
    if (!shouldFetch) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const fetchNeighborValues = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await getNeighborValues(targetNodes, attribute);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch neighbor values');
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchNeighborValues, 300);
    return () => clearTimeout(timeoutId);
  }, [shouldFetch, targetNodes, attribute]);

  return {
    values: data?.values || [],
    loading,
    error,
    neighborCount: data?.neighbor_count || 0
  };
}