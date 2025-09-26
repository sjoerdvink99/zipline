import type { SavedReasoningSet } from "./ReasoningBar";
import { formatValue, getOperatorLabel } from "../utils";

interface TraceSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  savedSets: SavedReasoningSet[];
  onLoad: (set: SavedReasoningSet) => void;
  onDelete: (id: string) => void;
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export const TraceSidebar = ({
  isOpen,
  onClose,
  savedSets,
  onLoad,
  onDelete,
}: TraceSidebarProps) => {
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(savedSets, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reasoning-sets-${
      new Date().toISOString().split("T")[0]
    }.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed right-0 top-0 h-full bg-white shadow-2xl border-l border-gray-200 transition-transform duration-300 ease-in-out z-50 flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "400px" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-200 rounded-lg">
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Saved Reasoning
              </h2>
              <p className="text-[11px] text-gray-500">
                {savedSets.length} set{savedSets.length !== 1 ? "s" : ""} saved
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {savedSets.length > 0 && (
              <button
                onClick={handleExport}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Export all"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {savedSets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="p-5 bg-gray-100 rounded-xl mb-5">
                <svg
                  className="w-10 h-10 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">
                No saved reasoning sets
              </h3>
              <p className="text-xs text-gray-500 max-w-[220px] leading-relaxed">
                Build a query using predicates and click "Save" to store it here
                for later use.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {savedSets.map((set) => (
                <div
                  key={set.id}
                  className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate">
                          {set.name}
                        </h3>
                        {set.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                            {set.description}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0 font-medium">
                        {formatDate(set.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="px-4 pb-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {set.predicates.slice(0, 4).map((pred, i) => (
                        <div key={pred.id} className="flex items-center">
                          {i > 0 && (
                            <span className="text-[9px] text-gray-500 font-bold px-1">
                              {getOperatorLabel(pred.combineOp)}
                            </span>
                          )}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                            <span className="font-semibold">
                              {pred.attribute}
                            </span>
                            <span className="text-gray-400 mx-0.5">
                              {pred.operator === "between"
                                ? "∈"
                                : pred.operator}
                            </span>
                            <span>
                              {pred.operator === "between" &&
                              pred.value2 !== undefined
                                ? `[${formatValue(pred.value)}, ${formatValue(
                                    pred.value2
                                  )}]`
                                : formatValue(pred.value)}
                            </span>
                          </span>
                        </div>
                      ))}
                      {set.predicates.length > 4 && (
                        <span className="text-[10px] text-gray-400 font-medium">
                          +{set.predicates.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
                    <span className="text-[10px] text-gray-500 font-medium">
                      {set.predicates.length} predicate
                      {set.predicates.length !== 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onDelete(set.id)}
                        className="px-3 py-1.5 text-[10px] font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => onLoad(set)}
                        className="px-3 py-1.5 text-[10px] bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-all font-semibold"
                      >
                        Load as Block
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
