import type { LiteralInfo } from "../../../api/learning";
import { literalToChip } from "../../../utils/predicateToHuman";
import { ClauseChip } from "./ClauseChip";
import { highlightFOL } from "../../../utils/folHighlight";

interface ClauseRendererProps {
  literals: LiteralInfo[];
  clauses: LiteralInfo[][];
  isDisjunction: boolean;
  folExpression: string;
}

function ClauseRow({ literals }: { literals: LiteralInfo[] }) {
  const chips = literals.map(literalToChip);
  const hasNeighborhood = chips.some((c) => c.kind === "neighborhood");

  if (hasNeighborhood) {
    return (
      <div className="flex flex-col gap-1.5">
        {chips.map((chip, i) => {
          if (chip.kind === "neighborhood") {
            return (
              <div key={i} className="flex flex-col gap-1">
                {i > 0 && (
                  <span className="text-[10px] text-gray-300 font-medium">
                    and
                  </span>
                )}
                <ClauseChip chip={chip} />
              </div>
            );
          }
          return (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && (
                <span className="text-[10px] text-gray-300 font-medium">
                  and
                </span>
              )}
              <ClauseChip chip={chip} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span className="text-[10px] text-gray-300 font-medium">and</span>
          )}
          <ClauseChip chip={chip} />
        </span>
      ))}
    </div>
  );
}

function OrDivider() {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="flex-1 border-t border-gray-100" />
      <span className="text-[10px] text-gray-300 font-medium uppercase tracking-widest">
        or
      </span>
      <div className="flex-1 border-t border-gray-100" />
    </div>
  );
}

export function ClauseRenderer({
  literals,
  clauses,
  isDisjunction,
  folExpression,
}: ClauseRendererProps) {
  if (!literals || literals.length === 0) {
    return (
      <div className="font-mono text-sm leading-relaxed break-words">
        {highlightFOL(folExpression)}
      </div>
    );
  }

  if (isDisjunction && clauses && clauses.length > 1) {
    return (
      <div className="flex flex-col gap-1">
        {clauses.map((clause, i) => (
          <div key={i} className="flex flex-col gap-1">
            {i > 0 && <OrDivider />}
            <ClauseRow literals={clause} />
          </div>
        ))}
      </div>
    );
  }

  return <ClauseRow literals={literals} />;
}
