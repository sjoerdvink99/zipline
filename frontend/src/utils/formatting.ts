export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toFixed(2);
  }
  return String(value);
}

export function getOperatorLabel(op?: string): string {
  switch (op) {
    case "union":
      return "OR";
    case "intersection":
      return "AND";
    case "difference":
      return "NOT";
    default:
      return "AND";
  }
}

export function getOperatorSymbol(op?: string): string {
  switch (op) {
    case "union":
      return "∪";
    case "intersection":
      return "∩";
    case "difference":
      return "−";
    default:
      return "∩";
  }
}