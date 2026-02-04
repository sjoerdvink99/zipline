import type { ReactNode } from "react";

const TOKEN_REGEX = new RegExp(
  [
    String.raw`(?<string>"[^"]*")`,
    String.raw`(?<neighborhood>N_\{[^}]+\}|N_\d+|\bneighbors\b)`,
    String.raw`(?<cardinality>\b(?:exactly|at_least|at_most)\b)`,
    String.raw`(?<quantifier>[∀∃∧∨¬]|\b(?:forall|exists|and|or|not|in)\b)`,
    String.raw`(?<comparison>[≥≤≠∈]|>=|<=|!=|>|<|=)`,
    String.raw`(?<topology>\b(?:k_core|clustering_coefficient|closeness_centrality|betweenness_centrality|louvain_community|component|degree|pagerank)(?=\())`,
    String.raw`(?<predicate>[A-Za-z_][A-Za-z0-9_\-]*(?=\())`,
    String.raw`(?<number>-?\d+(?:\.\d+)?)`,
    String.raw`(?<variable>\b[xyzw]\b)`,
    String.raw`(?<punctuation>[(){}\[\]:,|])`,
    String.raw`(?<whitespace>[ \t\n\r]+)`,
    String.raw`(?<word>[A-Za-z_][A-Za-z0-9_\-]*)`,
    String.raw`(?<other>[\s\S])`,
  ].join("|"),
  "g",
);

const TOKEN_CLASSES: Record<string, string> = {
  string: "text-amber-600",
  neighborhood: "text-purple-600",
  cardinality: "text-violet-600",
  quantifier: "text-violet-600",
  comparison: "text-slate-400",
  topology: "text-sky-600",
  predicate: "text-emerald-700",
  number: "text-orange-600",
  punctuation: "text-slate-400",
  word: "text-slate-500",
  other: "text-slate-500",
};

export function highlightFOL(expression: string): ReactNode {
  TOKEN_REGEX.lastIndex = 0;
  const spans: ReactNode[] = [];

  for (const match of expression.matchAll(TOKEN_REGEX)) {
    const groups = match.groups!;
    const group = Object.entries(groups).find(([, v]) => v !== undefined)?.[0];

    if (!group || group === "whitespace") {
      spans.push(<span key={match.index}>{match[0]}</span>);
      continue;
    }

    if (group === "variable") {
      spans.push(
        <span key={match.index} className="text-slate-500 italic">
          {match[0]}
        </span>,
      );
      continue;
    }

    const cls = TOKEN_CLASSES[group];
    spans.push(
      <span key={match.index} className={cls ?? ""}>
        {match[0]}
      </span>,
    );
  }

  return (
    <span className="font-mono text-sm leading-relaxed break-words">
      {spans}
    </span>
  );
}
