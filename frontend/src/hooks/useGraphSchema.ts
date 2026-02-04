import { useState, useEffect } from 'react';
import { getGraphSchema, type GraphSchema } from '../api';

interface UseGraphSchemaResult {
  schema: GraphSchema | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useGraphSchema(): UseGraphSchemaResult {
  const [schema, setSchema] = useState<GraphSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchema = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getGraphSchema();
      setSchema(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schema');
      setSchema(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchema();
    window.addEventListener("gb:graph-switched", fetchSchema);
    return () => window.removeEventListener("gb:graph-switched", fetchSchema);
  }, []);

  return {
    schema,
    loading,
    error,
    refetch: fetchSchema
  };
}

export function getAttributeSuggestions(
  schema: GraphSchema | null,
  type: 'attribute' | 'topology'
): string[] {
  if (!schema) return [];

  if (type === 'topology') {
    return Object.keys(schema.topology_attributes);
  }

  return Object.keys(schema.node_attributes);
}

export function getValueSuggestions(
  schema: GraphSchema | null,
  attribute: string,
  type: 'attribute' | 'topology'
): string[] {
  if (!schema || !attribute) return [];

  let attributeInfo;
  if (type === 'topology') {
    attributeInfo = schema.topology_attributes[attribute];
  } else {
    attributeInfo = schema.node_attributes[attribute];
  }

  if (!attributeInfo) return [];

  if (attributeInfo.type !== 'numeric') {
    return attributeInfo.values;
  }

  return attributeInfo.examples;
}

export function getAttributeType(
  schema: GraphSchema | null,
  attribute: string,
  type: 'attribute' | 'topology'
): 'numeric' | 'categorical' | 'boolean' | 'array' | null {
  if (!schema || !attribute) return null;

  let attributeInfo;
  if (type === 'topology') {
    attributeInfo = schema.topology_attributes[attribute];
  } else {
    attributeInfo = schema.node_attributes[attribute];
  }

  return attributeInfo?.type || null;
}