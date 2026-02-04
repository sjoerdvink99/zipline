import { useEffect } from "react";
import { XMarkIcon } from "./Icons";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function InfoModal({ isOpen, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">How ZipLine works</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-[13px] text-gray-600 leading-relaxed">
            ZipLine finds rules that describe what a group of nodes in a graph have in common.
          </p>

          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
              Workflow
            </div>
            <ol className="space-y-2">
              {[
                "Select nodes in the graph view by clicking or lassoing, or brush over values in the attribute view.",
                <>Click <span className="font-medium text-gray-700">Explain</span> to generate a rule that describes the selection.</>,
                "Edit the rule in the rule builder, or refine your selection and explain again.",
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="text-[11px] font-medium text-gray-300 tabular-nums shrink-0 pt-px">
                    {i + 1}.
                  </span>
                  <span className="text-[13px] text-gray-600 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
              Views
            </div>
            <div className="space-y-2">
              {[
                ["Graph", "Nodes colored by type. Click, lasso, or Shift-click to build a selection."],
                ["Attributes", "Property distributions for all nodes. Brush a range to select matching nodes."],
                ["Rules", "The generated rule, its match count, and tools to edit or save it."],
              ].map(([label, desc]) => (
                <div key={label} className="flex gap-2.5">
                  <span className="text-[13px] font-medium text-gray-700 shrink-0 w-20">{label}</span>
                  <span className="text-[13px] text-gray-500 leading-relaxed">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
