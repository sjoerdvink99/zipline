import api from "./client";

export interface Neo4jConnectionConfig {
  uri: string;
  username: string;
  password: string;
}

export interface LabelSchema {
  label: string;
  count: number;
  properties: string[];
}

export interface RelationshipTypeInfo {
  type: string;
  count: number;
}

export interface Neo4jSchemaInfo {
  node_labels: LabelSchema[];
  relationship_types: RelationshipTypeInfo[];
  neo4j_version: string | null;
}

export interface Neo4jQueryConfig {
  connection: Neo4jConnectionConfig;
  query: string;
  max_nodes: number;
  max_edges: number;
  name: string;
  description: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  neo4j_version: string | null;
}

export interface QueryPreviewResult {
  node_count: number;
  capped: boolean;
}

export interface UserDataSourceMeta {
  id: string;
  type: "neo4j" | "file";
  name: string;
  description: string;
  node_count: number;
  edge_count: number;
  node_types: string[];
  created_at: string;
  connection_uri?: string;
  file_name?: string;
}

export interface LoadResult {
  success: boolean;
  dataset_id: string;
  nodes: number;
  edges: number;
  node_types: string[];
  edge_limit_reached?: boolean;
}

export async function testNeo4jConnection(
  config: Neo4jConnectionConfig,
): Promise<ConnectionTestResult> {
  const { data } = await api.post<ConnectionTestResult>(
    "/api/data-sources/neo4j/test",
    config,
  );
  return data;
}

export async function getNeo4jSchema(
  config: Neo4jConnectionConfig,
): Promise<Neo4jSchemaInfo> {
  const { data } = await api.post<Neo4jSchemaInfo>(
    "/api/data-sources/neo4j/schema",
    config,
  );
  return data;
}

export async function previewNeo4jQuery(
  config: Neo4jQueryConfig,
): Promise<QueryPreviewResult> {
  const { data } = await api.post<QueryPreviewResult>(
    "/api/data-sources/neo4j/preview",
    config,
  );
  return data;
}

export async function loadNeo4jQuery(
  config: Neo4jQueryConfig,
): Promise<LoadResult> {
  const { data } = await api.post<LoadResult>(
    "/api/data-sources/neo4j/load",
    config,
    { timeout: 120000 },
  );
  return data;
}

export async function uploadGraphFile(
  file: File,
  name?: string,
  description?: string,
): Promise<LoadResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);
  if (description) formData.append("description", description);
  const { data } = await api.post<LoadResult>(
    "/api/data-sources/files/upload",
    formData,
    { timeout: 60000 },
  );
  return data;
}

export async function loadUploadedFile(sourceId: string): Promise<LoadResult> {
  const { data } = await api.post<LoadResult>(
    `/api/data-sources/files/${sourceId}/load`,
  );
  return data;
}

export async function listUserDataSources(): Promise<{
  sources: UserDataSourceMeta[];
}> {
  const { data } = await api.get<{ sources: UserDataSourceMeta[] }>(
    "/api/data-sources/",
  );
  return data;
}

export async function deleteUserDataSource(
  sourceId: string,
): Promise<{ success: boolean }> {
  const { data } = await api.delete<{ success: boolean }>(
    `/api/data-sources/${sourceId}`,
  );
  return data;
}
