import api from './client';

export interface Pattern {
  id: string;
  name: string;
  description: string;
  node_ids: string[];
  pattern_type: 'hub' | 'bridge' | 'star' | 'cluster' | 'community' | 'custom';
  created_at: string;
  domain?: string;
  metadata: Record<string, any>;
  confidence: number;
}

export interface PatternCreate {
  name: string;
  description: string;
  node_ids: string[];
  pattern_type: 'hub' | 'bridge' | 'star' | 'cluster' | 'community' | 'custom';
  domain?: string;
  metadata?: Record<string, any>;
  confidence?: number;
}

export interface PatternMatch {
  pattern: Pattern;
  overlap_score: number;
  matching_nodes: string[];
  confidence: number;
}

export interface PatternSuggestion {
  pattern: Pattern;
  reason: string;
  confidence: number;
}

export interface NodeSelection {
  node_ids: string[];
  metadata?: Record<string, any>;
}

export async function getPatterns(domain?: string): Promise<Pattern[]> {
  const params = domain ? { domain } : {};
  const { data } = await api.get<Pattern[]>('/api/patterns/', { params });
  return data;
}

export async function createPattern(pattern: PatternCreate): Promise<Pattern> {
  const { data } = await api.post<Pattern>('/api/patterns/', pattern);
  return data;
}

export async function getPattern(patternId: string): Promise<Pattern> {
  const { data } = await api.get<Pattern>(`/api/patterns/${patternId}`);
  return data;
}

export async function updatePattern(patternId: string, updates: Partial<Pattern>): Promise<Pattern> {
  const { data } = await api.put<Pattern>(`/api/patterns/${patternId}`, updates);
  return data;
}

export async function deletePattern(patternId: string): Promise<void> {
  await api.delete(`/api/patterns/${patternId}`);
}

export async function findPatternMatches(
  selection: NodeSelection,
  threshold?: number
): Promise<PatternMatch[]> {
  const { data } = await api.post<PatternMatch[]>('/api/patterns/match', {
    selection,
    threshold: threshold || 0.7
  });
  return data;
}

export async function getPatternSuggestions(
  selection: NodeSelection
): Promise<PatternSuggestion[]> {
  const { data } = await api.post<PatternSuggestion[]>('/api/patterns/suggestions', {
    selection
  });
  return data;
}

export async function getDomains(): Promise<string[]> {
  const { data } = await api.get<string[]>('/api/patterns/domains');
  return data;
}

export async function getPatternsByType(patternType: string): Promise<Pattern[]> {
  const { data } = await api.get<Pattern[]>(`/api/patterns/type/${patternType}`);
  return data;
}

export async function searchPatterns(query: string): Promise<Pattern[]> {
  const { data } = await api.get<Pattern[]>('/api/patterns/search', {
    params: { query }
  });
  return data;
}

export async function getPatternTemplates(domain?: string): Promise<Pattern[]> {
  const params = domain ? { domain } : {};
  const { data } = await api.get<Pattern[]>('/api/patterns/templates', { params });
  return data;
}

export async function validatePattern(
  patternId: string,
  nodeIds: string[]
): Promise<{ valid: boolean; score: number; reasons: string[] }> {
  const { data } = await api.post<{ valid: boolean; score: number; reasons: string[] }>(
    `/api/patterns/${patternId}/validate`,
    { node_ids: nodeIds }
  );
  return data;
}