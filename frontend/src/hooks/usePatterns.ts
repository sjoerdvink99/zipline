import { useState, useEffect, useCallback } from 'react';
import {
  getPatterns,
  getPatternTemplates,
  getPatternSuggestions,
  findPatternMatches,
  createPattern,
  updatePattern,
  deletePattern,
  getDomains,
  validatePattern,
  type Pattern,
  type PatternCreate,
  type PatternSuggestion,
  type PatternMatch,
  type NodeSelection
} from '../api/patterns';
import { useAnalysisStore } from '../store/analysisStore';

export const usePatterns = () => {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [patternTemplates, setPatternTemplates] = useState<Pattern[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedNodes = useAnalysisStore(state => state.selectedNodes);
  const setSelection = useAnalysisStore(state => state.setSelection);
  const addFilterItem = useAnalysisStore(state => state.addFilterItem);

  const loadPatterns = useCallback(async (domain?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const [patternsData, templatesData, domainsData] = await Promise.all([
        getPatterns(domain),
        getPatternTemplates(domain),
        getDomains()
      ]);

      setPatterns(patternsData);
      setPatternTemplates(templatesData);
      setDomains(domainsData);
    } catch (err) {
      console.error('Failed to load patterns:', err);
      setError('Failed to load patterns');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getPatternSuggestionsForSelection = useCallback(async (): Promise<PatternSuggestion[]> => {
    if (selectedNodes.length < 2) {
      return [];
    }

    try {
      const selection: NodeSelection = { node_ids: selectedNodes };
      const suggestions = await getPatternSuggestions(selection);
      return suggestions;
    } catch (err) {
      console.error('Failed to get pattern suggestions:', err);
      return [];
    }
  }, [selectedNodes]);

  const getPatternMatchesForSelection = useCallback(async (threshold = 0.7): Promise<PatternMatch[]> => {
    if (selectedNodes.length < 2) {
      return [];
    }

    try {
      const selection: NodeSelection = { node_ids: selectedNodes };
      const matches = await findPatternMatches(selection, threshold);
      return matches;
    } catch (err) {
      console.error('Failed to find pattern matches:', err);
      return [];
    }
  }, [selectedNodes, findPatternMatches]);

  const createPatternFromSelection = useCallback(async (
    name: string,
    description: string,
    patternType: 'hub' | 'bridge' | 'star' | 'cluster' | 'community' | 'custom' = 'custom',
    domain?: string,
    confidence = 0.8
  ): Promise<Pattern | null> => {
    if (selectedNodes.length < 2) {
      throw new Error('At least 2 nodes are required to create a pattern');
    }

    try {
      const patternData: PatternCreate = {
        name,
        description,
        node_ids: selectedNodes,
        pattern_type: patternType,
        domain,
        confidence,
        metadata: {
          created_at: new Date().toISOString(),
          created_by: 'user',
          source: 'manual_creation'
        }
      };

      const newPattern = await createPattern(patternData);

      loadPatterns();

      return newPattern;
    } catch (err) {
      console.error('Failed to create pattern:', err);
      throw err;
    }
  }, [selectedNodes, loadPatterns]);

  const applyPatternSelection = useCallback((pattern: Pattern) => {
    if (pattern.node_ids.length > 0) {
      setSelection(pattern.node_ids, 'predicate');
    }
  }, [setSelection]);

  const applyPatternAsFilter = useCallback((pattern: Pattern) => {
    const filterItem = {
      id: `pattern_${Date.now()}`,
      type: "pattern" as const,
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

    addFilterItem(filterItem);
  }, [addFilterItem]);

  const deletePatternById = useCallback(async (patternId: string) => {
    try {
      await deletePattern(patternId);
      setPatterns(prev => prev.filter(p => p.id !== patternId));
    } catch (err) {
      console.error('Failed to delete pattern:', err);
      throw err;
    }
  }, []);

  const updatePatternById = useCallback(async (patternId: string, updates: Partial<Pattern>) => {
    try {
      const updatedPattern = await updatePattern(patternId, updates);
      setPatterns(prev => prev.map(p => p.id === patternId ? updatedPattern : p));
      return updatedPattern;
    } catch (err) {
      console.error('Failed to update pattern:', err);
      throw err;
    }
  }, []);

  const validatePatternById = useCallback(async (patternId: string, nodeIds?: string[]) => {
    try {
      const nodes = nodeIds || selectedNodes;
      if (nodes.length === 0) {
        return { valid: false, score: 0, reasons: ['No nodes provided for validation'] };
      }

      const validation = await validatePattern(patternId, nodes);
      return validation;
    } catch (err) {
      console.error('Failed to validate pattern:', err);
      return { valid: false, score: 0, reasons: ['Validation failed'] };
    }
  }, [selectedNodes]);

  useEffect(() => {
    loadPatterns();
  }, [loadPatterns]);

  return {
    patterns,
    patternTemplates,
    domains,
    isLoading,
    error,

    loadPatterns,
    getPatternSuggestionsForSelection,
    getPatternMatchesForSelection,
    createPatternFromSelection,
    applyPatternSelection,
    applyPatternAsFilter,
    deletePatternById,
    updatePatternById,
    validatePatternById,

    hasSelection: selectedNodes.length > 0,
    canCreatePattern: selectedNodes.length >= 2,
    selectedNodeCount: selectedNodes.length
  };
};