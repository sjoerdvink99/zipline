import { memo } from "react";

interface ResultStructureProps {
  availableVariables: string[];
  projectedVariables: string[];
  onToggleVariable: (variable: string) => void;
}

const variableDescriptions: Record<string, string> = {
  x: "Primary nodes",
  y: "1st-level neighbors",
  z: "2nd-level neighbors",
  w: "3rd-level neighbors",
};

export const ResultStructure = memo(function ResultStructure({
  availableVariables,
  projectedVariables,
  onToggleVariable,
}: ResultStructureProps) {
  const buildResultPreview = () => {
    if (projectedVariables.length === 0) {
      return "{ }";
    }
    if (projectedVariables.length === 1) {
      return `{ ${projectedVariables[0]} | ... }`;
    }
    return `{ (${projectedVariables.join(", ")}) | ... }`;
  };

  if (availableVariables.length <= 1) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
            <svg
              className="w-4 h-4 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
              />
            </svg>
            Result Structure
          </h4>
          <p className="text-xs text-gray-500 mb-3">
            Choose which nodes to include in the results
          </p>

          <div className="flex flex-wrap gap-2">
            {availableVariables.map((variable) => {
              const isProjected = projectedVariables.includes(variable);
              const isRequired = variable === "x";

              return (
                <button
                  key={variable}
                  onClick={() => !isRequired && onToggleVariable(variable)}
                  disabled={isRequired}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all
                    ${
                      isProjected
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                    }
                    ${isRequired ? "cursor-not-allowed opacity-80" : "cursor-pointer"}
                  `}
                  title={
                    isRequired
                      ? "Primary variable is always included"
                      : variableDescriptions[variable]
                  }
                >
                  <div
                    className={`
                    w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                    ${
                      isProjected
                        ? "bg-emerald-500 border-emerald-500"
                        : "bg-white border-gray-300"
                    }
                  `}
                  >
                    {isProjected && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>

                  <span className="font-mono font-semibold">{variable}</span>

                  <span className="text-xs opacity-75">
                    {variableDescriptions[variable] || "Variable"}
                  </span>

                  {isRequired && (
                    <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                      required
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-shrink-0 text-right">
          <span className="text-xs text-gray-500 block mb-1">Preview</span>
          <div className="font-mono text-sm bg-gray-900 text-emerald-400 px-4 py-2 rounded-lg">
            {buildResultPreview()}
          </div>
        </div>
      </div>

      {projectedVariables.length > 1 && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-500">Results will include:</span>
            <div className="flex items-center gap-2">
              {projectedVariables.map((v, i) => (
                <div key={v} className="flex items-center gap-1">
                  {i > 0 && (
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  )}
                  <div
                    className={`
                    flex items-center gap-1 px-2 py-1 rounded-md
                    ${v === "x" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}
                  `}
                  >
                    <span className="font-mono font-semibold">{v}</span>
                    <span className="text-[10px] opacity-75">
                      ({variableDescriptions[v]?.split(" ")[0] || "node"})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default ResultStructure;
