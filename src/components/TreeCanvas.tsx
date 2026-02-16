import { useEffect } from "react";
import type { TreeData } from "../lib/types";
import { useContextStore } from "../stores/contextStore";
import { useTreeStore } from "../stores/treeStore";
import { NodeCard } from "./NodeCard";

function AddButton({
  onClick,
  title,
  className = "",
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      className={`w-5 h-5 rounded-full bg-bg-elevated text-text-secondary text-[11px] font-bold
        flex items-center justify-center cursor-pointer
        hover:bg-accent-primary hover:text-white transition-all ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title={title}
    >
      +
    </button>
  );
}

function TreeBranch({ data, isRoot, ancestorCut }: { data: TreeData; isRoot?: boolean; ancestorCut?: boolean }) {
  const { selectedNodeId, selectNode, addChild, addSibling, copiedNodeId, isCut } = useTreeStore();
  const { currentContextId } = useContextStore();
  const hasChildren = data.children.length > 0;
  const isSelected = selectedNodeId === data.node.id;
  const isCutHere = isCut && copiedNodeId === data.node.id;
  const inCutSubtree = ancestorCut || isCutHere;

  return (
    <div className="flex items-start">
      {/* Node + action buttons + outgoing connector */}
      <div className="flex items-center shrink-0 group/node">
        <NodeCard
          node={data.node}
          isRoot={isRoot}
          isSelected={isSelected}
          isCutNode={inCutSubtree}
          onClick={() => selectNode(data.node.id)}
        />
        {/* Add child button — visible on hover or when selected */}
        {currentContextId && (
          <AddButton
            className={isSelected
              ? "opacity-100 mx-1"
              : "opacity-0 group-hover/node:opacity-100 mx-1"
            }
            onClick={() => addChild(data.node.id, currentContextId)}
            title="Add child (Tab)"
          />
        )}
        {hasChildren && (
          <div
            className="bg-text-secondary shrink-0"
            style={{ width: isRoot ? 32 : 22, height: 1 }}
          />
        )}
      </div>

      {/* Children with curved connectors */}
      {hasChildren && (
        <div className="flex flex-col">
          {data.children.map((child, i) => {
            const isFirst = i === 0;
            const isLast = i === data.children.length - 1;
            return (
              <div key={child.node.id} className="flex items-stretch">
                <div className="shrink-0 flex flex-col" style={{ width: 20 }}>
                  <div
                    style={{
                      height: isFirst ? 18 : 26,
                      borderLeft: isFirst
                        ? "none"
                        : "1px solid var(--color-text-secondary)",
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      borderLeft: isLast
                        ? "none"
                        : "1px solid var(--color-text-secondary)",
                      borderTop: "1px solid var(--color-text-secondary)",
                      borderTopLeftRadius: isFirst ? 0 : 12,
                    }}
                  />
                </div>
                <div style={{ paddingTop: isFirst ? 0 : 8 }}>
                  <TreeBranch data={child} ancestorCut={inCutSubtree} />
                </div>
              </div>
            );
          })}
          {/* Add sibling button at end of children list */}
          {currentContextId && (
            <div className="flex items-center opacity-0 hover:opacity-100 transition-opacity" style={{ paddingTop: 6, paddingLeft: 20 }}>
              <AddButton
                onClick={() => {
                  const lastChild = data.children[data.children.length - 1];
                  addSibling(lastChild.node.id, currentContextId);
                }}
                title="Add sibling (Shift+Tab)"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TreeCanvas() {
  const { currentContextId } = useContextStore();
  const { tree, loadTree } = useTreeStore();

  useEffect(() => {
    if (currentContextId) {
      loadTree(currentContextId);
    }
  }, [currentContextId, loadTree]);

  if (!currentContextId) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary text-sm">
        Press ⌘K to create or switch context
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-8 pl-15 overflow-auto h-full">
      <TreeBranch data={tree} isRoot />
    </div>
  );
}
