// Re-export the main API client and utilities
export { default as api, isAbortedRequest } from './client';

// Re-export all dataset-related functions and types
export type {
  Dataset,
  DatasetType,
  DatasetsResponse,
  LoadDatasetResponse,
  CurrentDatasetResponse
} from './datasets';
export {
  getDatasets,
  loadDataset,
  getCurrentDataset,
  switchDataset
} from './datasets';

// Re-export all graph-related functions and types
export type {
  HopConstraint,
  PathQueryParams,
  PathQueryResponse,
  AttributeInfo,
  GraphSchema,
  NeighborValuesResponse,
  NeighborConstraintValidation
} from './graph';
export {
  findConstrainedPaths,
  getGraphSchema,
  getNeighborValues,
  validateNeighborConstraint
} from './graph';

// Re-export all existing API modules
export * from './attributes';
export * from './predicates';
export * from './patterns';
export * from './search';
export * from './predicateComposer';