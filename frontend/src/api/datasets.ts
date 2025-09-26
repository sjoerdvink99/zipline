import api from './client';

export interface Dataset {
  name: string;
  description: string;
}

export type DatasetType = Dataset;

export interface DatasetsResponse {
  datasets: { [key: string]: Dataset };
}

export interface LoadDatasetResponse {
  success: boolean;
  dataset?: any;
}

export interface CurrentDatasetResponse {
  dataset: any;
}

export async function getDatasets(): Promise<DatasetsResponse> {
  const { data } = await api.get<DatasetsResponse>("/api/datasets/");
  return data;
}

export async function loadDataset(name: string): Promise<LoadDatasetResponse> {
  const { data } = await api.post<LoadDatasetResponse>(`/api/datasets/${name}/load`);
  return data;
}

export async function getCurrentDataset(): Promise<CurrentDatasetResponse> {
  const { data } = await api.get<CurrentDatasetResponse>("/api/datasets/current");
  return data;
}

export async function switchDataset(name: string): Promise<LoadDatasetResponse> {
  const { data } = await api.post<LoadDatasetResponse>("/api/datasets/switch", {
    dataset_name: name,
  });
  return data;
}