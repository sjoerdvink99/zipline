import api from "./client";

const BASE = "/api/attributes";

export interface DistributionBin {
  min: number;
  max: number;
  count: number;
  node_ids: string[];
}

export interface DistributionValue {
  label: string;
  count: number;
  node_ids: string[];
}

export interface NumericDistribution {
  type: "numeric";
  min: number;
  max: number;
  bins: DistributionBin[];
  labels?: string[];
}

export interface CategoricalDistribution {
  type: "categorical";
  values: DistributionValue[];
  total_unique: number;
  labels?: string[];
}

export interface BooleanDistribution {
  type: "boolean";
  values: DistributionValue[];
  labels?: string[];
}

export interface TemporalBin {
  min_date: string;
  max_date: string;
  label: string;
  count: number;
  node_ids: string[];
}

export interface TemporalDistribution {
  type: "temporal";
  min_date: string;
  max_date: string;
  bins: TemporalBin[];
  bin_type: string;
  labels?: string[];
}

export type AttributeDistribution =
  | NumericDistribution
  | CategoricalDistribution
  | BooleanDistribution
  | TemporalDistribution;

export interface LabelDistributions {
  label_count: number;
  node_ids: string[];
  attributes: Record<string, AttributeDistribution>;
}

export interface LabelDistributionValue {
  label: string;
  count: number;
  node_ids: string[];
}

export interface LabelDistribution {
  type: "categorical";
  values: LabelDistributionValue[];
  total_unique: number;
}

export interface DistributionsByLabelResponse {
  distributions_by_label: Record<string, LabelDistributions>;
  shared_attributes: Record<string, AttributeDistribution>;
  label_distribution: LabelDistribution;
}

export interface DistributionsResponse {
  distributions: Record<string, AttributeDistribution>;
}

export interface UmapParameters {
  n_neighbors: number;
  min_dist: number;
  n_components: number;
  metric: string;
}

export interface UmapResponse {
  embedding: number[][];
  node_ids: string[];
  node_labels: string[];
  feature_names: string[];
  n_components: number;
  parameters: UmapParameters;
}

type ApiResponse = DistributionsByLabelResponse | DistributionsResponse;

export async function getDistributions(): Promise<DistributionsByLabelResponse> {
  const { data } = await api.get<ApiResponse>(
    `${BASE}/distributions`
  );

  if ("distributions_by_label" in data) {
    return data as DistributionsByLabelResponse;
  }

  const legacyData = data as DistributionsResponse;
  const distributions = legacyData.distributions || {};

  return {
    distributions_by_label: {
      all: {
        label_count: 0,
        node_ids: [],
        attributes: distributions,
      },
    },
    shared_attributes: {},
    label_distribution: {
      type: "categorical",
      values: [],
      total_unique: 0,
    },
  };
}

export async function computeUmap(
  params: Partial<UmapParameters> = {}
): Promise<UmapResponse> {
  const { data } = await api.get<UmapResponse>(
    `${BASE}/umap`,
    {
      params: {
        ...params
      }
    }
  );
  return data;
}
