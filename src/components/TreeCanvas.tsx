import { useEffect } from "react";
import type { TreeData } from "../lib/types";
import { useContextStore } from "../stores/contextStore";
import { useTreeStore } from "../stores/treeStore";
import { NodeCard } from "./NodeCard";

function TreeBranch({ data, isRoot }: { data: TreeData; isRoot?: boolean }) {
  const { selectedNodeId, selectNode } = useTreeStore();
  const hasChildren = data.children.length > 0;

  return (
    <div className="flex items-start">
      {/* Node + outgoing connector */}
      <div className="flex items-center shrink-0">
        <NodeCard
          node={data.node}
          isRoot={isRoot}
          isSelected={selectedNodeId === data.node.id}
          onClick={() => selectNode(data.node.id)}
        />
        {hasChildren && (
          <div
            className="bg-text-secondary shrink-0"
            style={{ width: isRoot ? 40 : 30, height: 1 }}
          />
        )}
      </div>

      {/* Children column with v-bar */}
      {hasChildren && (
        <div className="flex items-stretch">
          {/* Vertical bar wrapper */}
          <div className="flex items-stretch" style={{ padding: "18px 0" }}>
            <div className="w-px bg-text-secondary" />
          </div>
          {/* Children list */}
          <div className="flex flex-col" style={{ gap: 14 }}>
            {data.children.map((child) => (
              <div key={child.node.id} className="flex items-start">
                {/* Incoming h-line */}
                <div className="bg-text-secondary shrink-0 self-center" style={{ width: 20, height: 1 }} />
                <TreeBranch data={child} />
              </div>
            ))}
          </div>
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
