import { useCallback, useEffect, useRef } from "react";
import { usePredicateComposerStore } from "../store/predicateComposerStore";
import { validatePredicate } from "../api/predicateComposer";
import {
  formatFOLExpression,
  formatPredicateToFOL,
  combinePredicates,
} from "../utils/folFormatting";

interface FilterItem {
  id: string;
  type: "attribute" | "topology" | "fol";
  description: string;
  predicate: {
    attribute?: string;
    operator?: string;
    value?: string | number | boolean;
    value2?: string | number;
    node_type?: string;
    expression?: string;
  };
}

export function useRealtimeValidation(
  filterItems: FilterItem[],
  setOperations: Record<string, "and" | "or" | "not">,
  debounceMs: number = 300,
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const { addValidationError, clearValidationErrors } =
    usePredicateComposerStore();

  const validateCurrentExpression = useCallback(async () => {
    if (filterItems.length === 0) {
      clearValidationErrors();
      return;
    }

    try {
      const predicateStrings = filterItems.map((item, index) => {
        let predicateStr = "";

        if (item.type === "attribute") {
          const pred = item.predicate;
          predicateStr = formatPredicateToFOL(
            "attribute",
            pred.attribute || "",
            pred.operator || "=",
            pred.value ?? "",
            pred.value2,
            pred.node_type,
          );
        } else if (item.type === "topology") {
          const pred = item.predicate;
          predicateStr = formatPredicateToFOL(
            "topology",
            pred.attribute || "",
            pred.operator || "=",
            pred.value ?? "",
            pred.value2,
            pred.node_type,
          );
        } else if (item.type === "fol") {
          predicateStr = item.predicate.expression || item.description;
        } else {
          predicateStr = item.description;
        }

        const operation = setOperations[item.id] || "and";
        if (index > 0 && operation === "not") {
          predicateStr = `¬(${predicateStr})`;
        }

        return predicateStr;
      });

      const mainOperator = Object.values(setOperations).includes("or")
        ? "or"
        : "and";
      const expression = formatFOLExpression(
        combinePredicates(predicateStrings, mainOperator),
      );

      const validationResult = await validatePredicate({
        expression,
        context: {
          available_attributes: [
            "type",
            "category",
            "weight",
            "degree",
            "centrality",
          ],
          available_node_types: ["Protein", "Gene", "Compound"],
        },
      });

      clearValidationErrors();

      if (!validationResult.is_valid) {
        validationResult.errors.forEach((error) => {
          addValidationError({
            type: error.type,
            message: error.message,
            position: error.position,
          });
        });
      }
    } catch (error) {
      void error;
      clearValidationErrors();
    }
  }, [filterItems, setOperations, addValidationError, clearValidationErrors]);

  const debouncedValidation = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(validateCurrentExpression, debounceMs);
  }, [validateCurrentExpression, debounceMs]);

  useEffect(() => {
    debouncedValidation();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [debouncedValidation]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    validateNow: validateCurrentExpression,
  };
}
