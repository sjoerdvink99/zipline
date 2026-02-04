import api from "./client";

export interface Dataset {
  name: string;
  description: string;
  source_type?: "sample" | "user";
  data_source_type?: "neo4j" | "file";
  node_types?: string[];
  node_count?: number;
  edge_count?: number;
  created_at?: string;
  connection_uri?: string;
  file_name?: string;
}

export type DatasetType = Dataset;

export interface DatasetsResponse {
  datasets: { [key: string]: Dataset };
}

export interface LoadDatasetResponse {
  success: boolean;
  dataset?: Dataset;
}

export interface CurrentDatasetResponse {
  dataset: Dataset | null;
}

export async function getDatasets(): Promise<DatasetsResponse> {
  const { data } = await api.get<DatasetsResponse>("/api/datasets/");
  return data;
}

export async function loadDataset(name: string): Promise<LoadDatasetResponse> {
  const { data } = await api.post<LoadDatasetResponse>(
    `/api/datasets/${name}/load`,
  );
  return data;
}

export async function getCurrentDataset(): Promise<CurrentDatasetResponse> {
  const { data } = await api.get<CurrentDatasetResponse>(
    "/api/datasets/current",
  );
  return data;
}

export async function switchDataset(
  name: string,
): Promise<LoadDatasetResponse> {
  const { data } = await api.post<LoadDatasetResponse>("/api/datasets/switch", {
    dataset_name: name,
  });
  return data;
}
