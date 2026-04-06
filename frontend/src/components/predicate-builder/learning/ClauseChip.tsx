import type { HumanChip } from "../../../utils/predicateToHuman";

const CHIP_STYLES = {
  type: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-400",
  },
  attribute: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-400",
  },
  topology: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-700",
    dot: "bg-sky-400",
  },
  lifted: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-700",
    dot: "bg-violet-400",
  },
  neighborhood: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
} as const;

function FlatChip({ chip }: { chip: HumanChip }) {
  const s = CHIP_STYLES[chip.kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs ${s.bg} ${s.border} ${s.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {chip.labelText ? (
        <span className="flex items-baseline gap-1">
          <span className="opacity-50 font-normal">{chip.labelText}</span>
          <span className="font-semibold">{chip.valueText}</span>
        </span>
      ) : (
        <span className="font-medium">{chip.text}</span>
      )}
    </span>
  );
}

function NeighborhoodChip({ chip }: { chip: HumanChip }) {
  return (
    <div className="w-full rounded-md border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border-b border-slate-100">
        <svg
          className="w-3 h-3 text-indigo-400 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <span className="text-[11px] text-indigo-500 font-medium">
          {chip.neighborContext ?? "has a neighbor where"}
        </span>
      </div>
      <div className="px-2.5 py-2 flex flex-wrap items-center gap-1.5">
        {chip.innerChips && chip.innerChips.length > 0 ? (
          chip.innerChips.map((inner, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 && (
                <span className="text-[10px] text-gray-300 font-medium px-0.5">
                  and
                </span>
              )}
              <FlatChip chip={inner} />
            </span>
          ))
        ) : (
          <span className="text-[11px] text-gray-300 italic">
            conditions defined
          </span>
        )}
      </div>
    </div>
  );
}

export function ClauseChip({ chip }: { chip: HumanChip }) {
  if (chip.kind === "neighborhood") {
    return <NeighborhoodChip chip={chip} />;
  }
  return <FlatChip chip={chip} />;
}
