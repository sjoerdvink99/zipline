import api from "./client";
import type { NeighborhoodBlock } from "../components/predicate-builder/constraints/NeighborhoodConstraintBlock";

export interface CompositePredicateRequest {
  predicates: Array<{
    type: "topology" | "attribute" | "fol";
    predicate: Record<string, unknown>;
  }>;
  logical_structure: {
    type: "compound";
    operator: "and" | "or" | "not";
    predicates: string[];
  };
  neighborhood_constraints: NeighborhoodBlock[];
  projection_settings?: {
    enabled: boolean;
    variables: Array<{
      name: string;
      type: "neighbor" | "witness";
    }>;
  };
}

export interface CompositePredicateResponse {
  expression: string;
  matching_nodes: string[];
  projections?: Array<{
    primary_node: string;
    projected_variables: Record<string, string[]>;
  }>;
  evaluation_time: number;
  is_valid: boolean;
  validation_errors?: Array<{
    type: string;
    message: string;
    position?: number;
  }>;
}

export interface PredicateValidationRequest {
  expression: string;
  context?: {
    available_attributes: string[];
    available_node_types: string[];
  };
}

export interface PredicateValidationResponse {
  is_valid: boolean;
  errors: Array<{
    type: "syntax" | "semantic" | "missing_variable";
    message: string;
    position?: number;
  }>;
  suggestions?: Array<{
    text: string;
    type: "completion" | "correction";
  }>;
}

export interface PredicateSuggestionsRequest {
  partial_expression?: string;
  context: {
    current_predicates: string[];
    available_attributes: string[];
    node_types: string[];
  };
}

export interface PredicateSuggestionsResponse {
  suggestions: Array<{
    text: string;
    description: string;
    type: "predicate" | "operator" | "quantifier" | "relation";
    category: string;
    priority: number;
  }>;
}

export async function evaluateCompositePredicate(
  request: CompositePredicateRequest,
): Promise<CompositePredicateResponse> {
  const { data } = await api.post<CompositePredicateResponse>(
    "/api/predicates/compose",
    request,
  );
  return data;
}

export async function validatePredicate(
  request: PredicateValidationRequest,
): Promise<PredicateValidationResponse> {
  const { data } = await api.post<PredicateValidationResponse>(
    "/api/predicates/validate",
    request,
  );
  return data;
}

export async function getPredicateSuggestions(): Promise<PredicateSuggestionsResponse> {
  const { data } = await api.get<PredicateSuggestionsResponse>(
    "/api/predicates/suggestions",
  );
  return data;
}

export function serializeNeighborhoodBlock(
  block: NeighborhoodBlock,
): Record<string, unknown> {
  return {
    id: block.id,
    target_predicate_ids: block.targetPredicateIds,
    target_type: block.targetType,
    quantifier: block.quantifier,
    count: block.count,
    relation: block.relation,
    k_parameter: block.kParameter,
    constraint_type: block.constraint.type,
    constraint_predicate: {
      attribute: block.constraint.attribute,
      operator: block.constraint.operator,
      value: block.constraint.value,
    },
    result_mode: block.resultMode,
    projection_variable: block.projectionVariable,
  };
}

export function deserializeNeighborhoodBlock(
  data: Record<string, unknown>,
): NeighborhoodBlock {
  const constraintPredicate = data.constraint_predicate as
    | Record<string, unknown>
    | undefined;
  return {
    id: data.id as string,
    targetPredicateIds: (data.target_predicate_ids as string[]) || [],
    targetType:
      (data.target_type as NeighborhoodBlock["targetType"]) || "predicates",
    quantifier: (data.quantifier as NeighborhoodBlock["quantifier"]) || "ALL",
    count: data.count as number | undefined,
    relation: (data.relation as NeighborhoodBlock["relation"]) || "neighbors",
    kParameter: data.k_parameter as number | undefined,
    constraint: {
      type: (data.constraint_type as "attribute" | "topology") || "attribute",
      attribute: (constraintPredicate?.attribute as string) || "",
      operator: (constraintPredicate?.operator as string) || "=",
      value: constraintPredicate?.value || "",
    },
    resultMode:
      (data.result_mode as NeighborhoodBlock["resultMode"]) || "primary_only",
    projectionVariable: data.projection_variable as string | undefined,
  };
}
