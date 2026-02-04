import { memo, useState, useCallback, lazy, Suspense } from "react";
import type {
  PredicateGroup,
  BuilderNode,
  NeighborhoodBlock,
  PredicatePill,
} from "./types";
import { isPill, isGroup, isNeighborhood } from "./types";
import { VisualPill } from "./VisualPill";
import { ConnectiveToggle } from "./ConnectiveToggle";

const NeighborhoodContainer = lazy(() => import("./NeighborhoodContainer"));

const NeighborhoodWrapper = ({
  neighborhood,
  onUpdate,
  onRemove,
  onRemoveChild,
  onUpdateChild,
  depth,
}: {
  neighborhood: NeighborhoodBlock;
  onUpdate: () => void;
  onRemove: () => void;
  onRemoveChild: (childId: string) => void;
  onUpdateChild?: (childId: string, updates: Partial<PredicatePill>) => void;
  depth: number;
}) => (
  <Suspense
    fallback={<div className="px-3 py-2 text-sm text-gray-400">Loading...</div>}
  >
    <NeighborhoodContainer
      neighborhood={neighborhood}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onRemoveChild={onRemoveChild}
      onUpdateChild={onUpdateChild}
      depth={depth}
    />
  </Suspense>
);

interface GroupProps {
  group: PredicateGroup;
  onUpdate: (updates: Partial<PredicateGroup>) => void;
  onRemove: () => void;
  onRemoveChild: (childId: string) => void;
  onUpdateChild?: (childId: string, updates: Partial<PredicatePill>) => void;
  onAddToGroup: (pillData: unknown) => void;
  onUngroup: () => void;
  depth?: number;
}

const depthColors = [
  { bg: "bg-slate-50", border: "border-slate-200", accent: "bg-slate-100" },
  {
    bg: "bg-indigo-50/30",
    border: "border-indigo-200",
    accent: "bg-indigo-100",
  },
  {
    bg: "bg-fuchsia-50/30",
    border: "border-fuchsia-200",
    accent: "bg-fuchsia-100",
  },
];

export const VisualGroup = memo(function VisualGroup({
  group,
  onRemove,
  onRemoveChild,
  onUpdateChild,
  onAddToGroup,
  depth = 0,
}: GroupProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [localConnectives, setLocalConnectives] = useState<
    Record<number, "∧" | "∨">
  >({});

  const colors = depthColors[depth % depthColors.length];

  const getConnective = (index: number): "∧" | "∨" => {
    return localConnectives[index] ?? group.connective;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      try {
        const data = JSON.parse(e.dataTransfer.getData("application/json"));
        if (
          data.type === "inferred-predicate" ||
          data.type === "move-pill" ||
          data.type === "reorder-node"
        ) {
          onAddToGroup(data);
        }
      } catch (err) {
        void err;
      }
    },
    [onAddToGroup],
  );

  const renderChild = (child: BuilderNode, index: number) => {
    const showConnective = index > 0;
    const currentConnective = getConnective(index);

    return (
      <div key={child.id} className="flex items-center gap-1">
        {showConnective && (
          <ConnectiveToggle
            value={currentConnective}
            onChange={(newConnective) => {
              setLocalConnectives((prev) => ({
                ...prev,
                [index]: newConnective,
              }));
            }}
            size="sm"
          />
        )}

        {isPill(child) && (
          <VisualPill
            pill={child}
            onRemove={() => onRemoveChild(child.id)}
            onUpdate={(updates) => onUpdateChild?.(child.id, updates)}
            isNested={true}
          />
        )}

        {isGroup(child) && (
          <VisualGroup
            group={child}
            onUpdate={() => {}}
            onRemove={() => onRemoveChild(child.id)}
            onRemoveChild={onRemoveChild}
            onUpdateChild={onUpdateChild}
            onAddToGroup={onAddToGroup}
            onUngroup={() => {}}
            depth={depth + 1}
          />
        )}

        {isNeighborhood(child) && (
          <NeighborhoodWrapper
            neighborhood={child}
            onUpdate={() => {}}
            onRemove={() => onRemoveChild(child.id)}
            onRemoveChild={onRemoveChild}
            onUpdateChild={onUpdateChild}
            depth={depth + 1}
          />
        )}
      </div>
    );
  };

  return (
    <div
      className={`
        group/container relative rounded-lg border p-2 transition-all
        ${colors.bg} ${colors.border}
        ${isDragOver ? "border-blue-400 bg-blue-50/50 ring-2 ring-blue-300" : ""}
        ${group.isNegated ? "ring-1 ring-red-300" : ""}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="
          absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border shadow-sm
          flex items-center justify-center opacity-0 group-hover/container:opacity-100
          transition-opacity text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 z-10
        "
        title="Remove group"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <div className="flex flex-wrap items-center gap-1">
        {group.children.length === 0 ? (
          <div className="w-full py-2 text-center text-gray-400 text-[10px]">
            Drop predicates here
          </div>
        ) : (
          group.children.map((child, index) => renderChild(child, index))
        )}
      </div>
    </div>
  );
});

export default VisualGroup;
