interface StructuredProjectionResult {
  primary_entities: string[];
  projected_relations: Array<{
    variable: string;
    nodes: string[];
    relation_type: string;
  }>;
  result_mode: "primary_only" | "primary_and_projected";
}

export function createStructuredProjectionResult(
  primaryEntities: string[],
  projectedRelations: Array<{
    variable: string;
    nodes: string[];
    relation_type: string;
  }>,
  resultMode: "primary_only" | "primary_and_projected",
): StructuredProjectionResult {
  return {
    primary_entities: primaryEntities,
    projected_relations: projectedRelations,
    result_mode: resultMode,
  };
}
