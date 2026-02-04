import {
  useAnalysisStore,
  type FavoritedClause,
} from "../store/analysisStore";
import { useState, useCallback } from "react";
import { evaluateFOL } from "../api/fol";
import { useVisualBuilderStore } from "./predicate-builder/visual/store";
import { convertLearnedToBuilderNodes } from "../utils/learnedPredicateParser";

interface SavedPredicatesSidebarProps {
  isOpen: boolean;
  onClose: () => void;
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

const FavoriteClauseCard = ({
  clause,
  onApply,
  onDelete,
  onAddToBuilder,
  isApplying,
}: {
  clause: FavoritedClause;
  onApply: () => void;
  onDelete: () => void;
  onAddToBuilder: () => void;
  isApplying: boolean;
}) => (
  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-all">
    <div className="p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-gray-700 font-mono leading-relaxed flex-1 min-w-0 break-words">
          {clause.label}
        </p>
        <span className="text-[9px] text-gray-400 shrink-0 ml-1">
          {formatDate(clause.savedAt)}
        </span>
      </div>
    </div>
    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
      <span className="text-[9px] text-gray-500">{clause.datasetName}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onDelete}
          className="px-2 py-1 text-[10px] text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
        >
          Delete
        </button>
        <button
          onClick={onAddToBuilder}
          className="px-2 py-1 text-[10px] text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded transition-colors font-medium"
        >
          + Builder
        </button>
        <button
          onClick={onApply}
          disabled={isApplying}
          className="px-2 py-1 text-[10px] bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors font-medium disabled:opacity-50"
        >
          {isApplying ? "Applying…" : "Apply"}
        </button>
      </div>
    </div>
  </div>
);

export const SavedPredicatesSidebar = ({
  isOpen,
  onClose,
}: SavedPredicatesSidebarProps) => {
  const {
    favoritedClauses,
    removeFavoriteClause,
    setSelection,
  } = useAnalysisStore();

  const { addNodesWithDeduplication, setRootConnective } =
    useVisualBuilderStore();

  const handleAddFavoriteToBuilder = useCallback(
    (clause: FavoritedClause) => {
      try {
        const { nodes, rootConnective } = convertLearnedToBuilderNodes(
          clause.predicate,
        );
        if (nodes.length > 0) {
          setRootConnective(rootConnective);
          addNodesWithDeduplication(nodes);
        }
      } catch {}
    },
    [addNodesWithDeduplication, setRootConnective],
  );

  const [applyingFavoriteId, setApplyingFavoriteId] = useState<string | null>(
    null,
  );

  const handleApplyFavorite = useCallback(
    async (clause: FavoritedClause) => {
      setApplyingFavoriteId(clause.id);
      try {
        const result = await evaluateFOL({
          expression: clause.predicate.fol_expression,
        });
        if (result.matching_nodes.length > 0) {
          setSelection(result.matching_nodes, "predicate");
        }
      } catch (error) {
        void error;
      } finally {
        setApplyingFavoriteId(null);
      }
    },
    [setSelection],
  );

  const hasContent = favoritedClauses.length > 0;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed right-0 top-0 h-full bg-gray-50 shadow-2xl border-l border-gray-200 transition-transform duration-300 ease-in-out z-50 flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "360px" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 ${favoritedClauses.length > 0 ? "text-rose-400" : "text-gray-400"}`}
              fill={favoritedClauses.length > 0 ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <div>
              <h2 className="text-[11px] font-semibold text-gray-900">
                Liked Predicates
              </h2>
              <p className="text-[9px] text-gray-500">
                {favoritedClauses.length} liked
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Close"
          >
            <svg
              className="w-3.5 h-3.5"
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

        <div className="flex-1 overflow-y-auto p-4">
          {!hasContent ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="p-4 bg-gray-100 rounded-lg mb-4">
                <svg
                  className="w-8 h-8 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>
              <h3 className="text-[11px] font-semibold text-gray-900 mb-1">
                No liked predicates yet
              </h3>
              <p className="text-[10px] text-gray-500 max-w-[200px] leading-relaxed">
                Click the heart on any learned explanation to save it here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 border-b border-gray-200 pb-2">
                <h3 className="text-[12px] font-bold text-gray-800 uppercase tracking-wide">
                  Favorites
                </h3>
                <span className="text-[9px] font-semibold text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5">
                  {favoritedClauses.length}
                </span>
              </div>
              <div className="space-y-2">
                {favoritedClauses.map((clause) => (
                  <FavoriteClauseCard
                    key={clause.id}
                    clause={clause}
                    onApply={() => handleApplyFavorite(clause)}
                    onDelete={() => removeFavoriteClause(clause.id)}
                    onAddToBuilder={() => handleAddFavoriteToBuilder(clause)}
                    isApplying={applyingFavoriteId === clause.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
