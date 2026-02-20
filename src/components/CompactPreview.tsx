import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import type { DiffOp } from "../lib/compactDiff";
import type { ProposedNode } from "../lib/types";
import { cn } from "../lib/cn";

const OP_STYLES: Record<DiffOp["type"], { label: string; bg: string; text: string }> = {
  delete: { label: "Delete", bg: "bg-red-500/15", text: "text-red-400" },
  add:    { label: "Add",    bg: "bg-green-500/15", text: "text-green-400" },
  edit:   { label: "Edit",   bg: "bg-yellow-500/15", text: "text-yellow-400" },
  move:   { label: "Move",   bg: "bg-yellow-500/15", text: "text-yellow-400" },
  keep:   { label: "Keep",   bg: "bg-bg-card", text: "text-text-secondary" },
};

function DiffOpRow({ op }: { op: DiffOp }) {
  const style = OP_STYLES[op.type];
  return (
    <div className={cn("flex items-center gap-3 rounded-lg px-3 py-2", style.bg)}>
      <span className={cn("w-14 shrink-0 font-mono text-xs font-bold uppercase", style.text)}>
        {style.label}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-text-primary">
        {op.type === "delete" && op.title}
        {op.type === "add" && (
          <><span className="text-green-400">+ {op.title}</span> <span className="text-text-secondary">({op.nodeType})</span></>
        )}
        {op.type === "edit" && (
          <><span className="line-through text-text-secondary">{op.oldTitle}</span>{" "}<span className="text-yellow-400">{op.newTitle}</span></>
        )}
        {op.type === "move" && (
          <>{op.title} <span className="text-text-secondary">→ {op.newParentTitle}</span></>
        )}
        {op.type === "keep" && op.title}
      </span>
    </div>
  );
}

function ProposedTreeNode({ node, depth }: { node: ProposedNode; depth: number }) {
  const isNew = !node.source_id;
  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 rounded px-2 py-1 font-mono text-sm",
          isNew ? "text-green-400" : "text-text-primary"
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <span className="text-text-secondary">
          {node.node_type === "text" ? "T" : node.node_type === "markdown" ? "M" : node.node_type === "image" ? "I" : "F"}
        </span>
        <span className="truncate">{node.title}</span>
        {isNew && <span className="ml-1 rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-400">NEW</span>}
      </div>
      {node.children.map((child, i) => (
        <ProposedTreeNode key={`${child.source_id || i}`} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export function CompactPreview() {
  const { compactResult, compactDiff, closeCompactPreview } = useUIStore();
  const applyCompact = useTreeStore((s) => s.applyCompact);

  if (!compactResult || !compactDiff) return null;

  const changes = compactDiff.filter((op) => op.type !== "keep");
  const hasChanges = changes.length > 0;

  const handleApply = async () => {
    try {
      await applyCompact(compactResult);
      closeCompactPreview();
    } catch (e) {
      console.error("Failed to apply compact:", e);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={closeCompactPreview}
    >
      <div
        className="flex max-h-[80vh] w-[600px] flex-col rounded-xl border border-border bg-bg-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-heading text-lg text-text-primary">AI Compact Preview</h2>
          <p className="mt-1 font-mono text-xs text-text-secondary">
            {changes.length} changes proposed
          </p>
        </div>

        {/* Content — two panels */}
        <div className="flex min-h-0 flex-1 divide-x divide-border">
          {/* Left: Diff operations */}
          <div className="flex w-1/2 flex-col">
            <div className="border-b border-border px-4 py-2">
              <span className="font-mono text-xs font-bold uppercase text-text-secondary">Changes</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-1">
                {changes.length === 0 ? (
                  <p className="py-4 text-center font-mono text-sm text-text-secondary">No changes</p>
                ) : (
                  changes.map((op, i) => <DiffOpRow key={i} op={op} />)
                )}
              </div>
            </div>
          </div>

          {/* Right: Proposed tree */}
          <div className="flex w-1/2 flex-col">
            <div className="border-b border-border px-4 py-2">
              <span className="font-mono text-xs font-bold uppercase text-text-secondary">New Structure</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-col">
                {/* Root node (kept) */}
                <div className="flex items-center gap-2 rounded px-2 py-1 font-mono text-sm text-text-primary">
                  <span className="text-accent-primary">
                    {compactResult.original.node.node_type === "text" ? "T" : "M"}
                  </span>
                  <span className="truncate font-bold">{compactResult.original.node.title}</span>
                </div>
                {compactResult.proposed.map((node, i) => (
                  <ProposedTreeNode key={`${node.source_id || i}`} node={node} depth={1} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            className="rounded-lg px-4 py-2 font-mono text-sm text-text-secondary hover:text-text-primary"
            onClick={closeCompactPreview}
          >
            Cancel
          </button>
          <button
            className={cn(
              "rounded-lg px-4 py-2 font-mono text-sm text-white",
              hasChanges
                ? "bg-accent-primary hover:brightness-110"
                : "cursor-not-allowed bg-bg-card text-text-secondary"
            )}
            onClick={handleApply}
            disabled={!hasChanges}
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
