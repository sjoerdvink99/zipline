import { useState, useEffect, useMemo } from 'react';
import { validateNeighborConstraint, type NeighborConstraintValidation } from '../api';
import { useAnalysisStore } from '../store/analysisStore';
import { debounce } from '../utils/debounce';

interface UseConstraintValidationProps {
  targetPredicateIds: string[];
  attribute: string;
  operator: string;
  value: string;
  enabled?: boolean;
}

interface UseConstraintValidationResult {
  validation: NeighborConstraintValidation | null;
  loading: boolean;
  error: string | null;
  isValid: boolean;
  willHaveResults: boolean;
  matchingNeighbors: number;
  totalNeighbors: number;
}

export function useConstraintValidation({
  targetPredicateIds,
  attribute,
  operator,
  value,
  enabled = true
}: UseConstraintValidationProps): UseConstraintValidationResult {
  const [validation, setValidation] = useState<NeighborConstraintValidation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const predicateMatchNodes = useAnalysisStore(state => state.predicateMatchNodes);

  const targetNodes = useMemo(() => {
    return predicateMatchNodes;
  }, [predicateMatchNodes]);

  const shouldValidate = enabled &&
    targetNodes.length > 0 &&
    attribute.trim().length > 0 &&
    value.trim().length > 0 &&
    operator.length > 0 &&
    targetPredicateIds.length > 0;

  const debouncedValidate = useMemo(
    () => debounce(async (nodeIds: string[], attr: string, op: string, val: string) => {
      try {
        setLoading(true);
        setError(null);
        const result = await validateNeighborConstraint(nodeIds, attr, op, val);
        setValidation(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Validation failed');
        setValidation(null);
      } finally {
        setLoading(false);
      }
    }, 500),
    []
  );

  useEffect(() => {
    if (!shouldValidate) {
      setValidation(null);
      setLoading(false);
      setError(null);
      return;
    }

    debouncedValidate(targetNodes, attribute, operator, value);
  }, [shouldValidate, targetNodes, attribute, operator, value, debouncedValidate]);

  return {
    validation,
    loading,
    error,
    isValid: validation?.valid ?? false,
    willHaveResults: validation?.will_have_results ?? false,
    matchingNeighbors: validation?.matching_neighbors ?? 0,
    totalNeighbors: validation?.total_neighbors ?? 0
  };
}