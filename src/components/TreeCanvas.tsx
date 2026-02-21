import { useEffect, useState, useCallback } from "react";
import type { TreeData } from "../lib/types";
import { NODE_TYPE_CONFIG } from "../lib/types";
import { useContextStore } from "../stores/contextStore";
import { useTreeStore, findNode, findParent } from "../stores/treeStore";
import { useUIStore } from "../stores/uiStore";
import { DragStateContext, useDragState } from "../lib/dragContext";
import { NodeCard } from "./NodeCard";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  rectIntersection,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { modSymbol } from "../lib/platform";

// Use pointerWithin first (precise), fall back to rectIntersection (wider reach)
const combinedCollision: CollisionDetection = (args) => {
  const pw = pointerWithin(args);
  if (pw.length > 0) return pw;
  return rectIntersection(args);
};

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

function SortableChildRow({
  data,
  parentId,
  isFirst,
  isLast,
  ancestorCut,
}: {
  data: TreeData;
  parentId: string;
  isFirst: boolean;
  isLast: boolean;
  ancestorCut?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: data.node.id,
      data: { parentId },
    });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: 1 } : null,
    ),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex items-stretch">
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
        <TreeBranch
          data={data}
          ancestorCut={ancestorCut}
          dragHandleListeners={listeners}
        />
      </div>
    </div>
  );
}

function RootDropZone({ nodeId, children }: { nodeId: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({
    id: nodeId,
    data: { parentId: null },
  });
  return <div ref={setNodeRef}>{children}</div>;
}

function TreeBranch({
  data,
  isRoot,
  ancestorCut,
  dragHandleListeners,
}: {
  data: TreeData;
  isRoot?: boolean;
  ancestorCut?: boolean;
  dragHandleListeners?: ReturnType<typeof useSortable>["listeners"];
}) {
  const { selectedNodeId, selectNode, addChild, addSibling, copiedNodeId, isCut } =
    useTreeStore();
  const { currentContextId } = useContextStore();
  const { collapsedNodes, toggleCollapse } = useUIStore();
  const compactHighlights = useUIStore((s) => s.compactHighlights);
  const compactFading = useUIStore((s) => s.compactFading);
  const dragState = useDragState();
  const hasChildren = data.children.length > 0;
  const isCollapsed = collapsedNodes.has(data.node.id);
  const isSelected = selectedNodeId === data.node.id;
  const isCutHere = isCut && copiedNodeId === data.node.id;
  const inCutSubtree = ancestorCut || isCutHere;

  // Highlight: this node is a reparent drop target
  const isReparentTarget =
    dragState.activeId !== null &&
    dragState.overId === data.node.id &&
    dragState.activeId !== data.node.id &&
    dragState.reparentIntent;

  const highlight = compactHighlights?.get(data.node.id) ?? null;

  const nodeCard = (
    <NodeCard
      node={data.node}
      isRoot={isRoot}
      isSelected={isSelected}
      isCutNode={inCutSubtree}
      isDropTarget={isReparentTarget}
      compactHighlight={highlight}
      compactFading={compactFading}
      onClick={() => selectNode(data.node.id)}
      dragHandleListeners={!isRoot ? dragHandleListeners : undefined}
    />
  );

  return (
    <div className="flex items-start">
      {/* Node + action buttons + outgoing connector */}
      <div className="flex items-center shrink-0 group/node">
        {isRoot ? (
          <RootDropZone nodeId={data.node.id}>{nodeCard}</RootDropZone>
        ) : (
          nodeCard
        )}
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

      {/* Collapsed: show dots */}
      {hasChildren && isCollapsed && (
        <button
          className="flex items-center gap-1 px-1 self-center cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => toggleCollapse(data.node.id)}
          title="Expand (z)"
        >
          {data.children.map((child) => (
            <span
              key={child.node.id}
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: NODE_TYPE_CONFIG[child.node.node_type]?.color ?? "#777" }}
            />
          ))}
        </button>
      )}

      {/* Expanded: children with curved connectors */}
      {hasChildren && !isCollapsed && (
        <div className="flex flex-col">
          <SortableContext
            items={data.children.map((c) => c.node.id)}
            strategy={verticalListSortingStrategy}
          >
            {data.children.map((child, i) => (
              <SortableChildRow
                key={child.node.id}
                data={child}
                parentId={data.node.id}
                isFirst={i === 0}
                isLast={i === data.children.length - 1}
                ancestorCut={inCutSubtree}
              />
            ))}
          </SortableContext>
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
  const { tree, loadTree, dragMoveNode } = useTreeStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overParentId, setOverParentId] = useState<string | null>(null);
  const [reparentIntent, setReparentIntent] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(() => {
    if (currentContextId) {
      loadTree(currentContextId);
    }
  }, [currentContextId, loadTree]);

  const activeTreeData = activeId && tree ? findNode(tree, activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    setActiveParentId(event.active.data.current?.parentId as string ?? null);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const id = event.over?.id as string ?? null;
    setOverId(id);
    const oParentId = event.over?.data.current?.parentId as string ?? null;
    setOverParentId(oParentId);

    // Compute reparent intent: reparent is default, reorder only in edge gap zone
    if (event.over && event.active.id !== event.over.id) {
      const aParentId = event.active.data.current?.parentId as string ?? null;
      if (aParentId !== oParentId) {
        // Different parent → always reparent
        setReparentIntent(true);
      } else {
        // Same parent → reparent unless pointer is in the gap zone (edges)
        const rect = event.over.rect;
        const initEvent = event.activatorEvent as PointerEvent;
        const pointerY = initEvent.clientY + event.delta.y;
        const GAP_ZONE = 8;
        setReparentIntent(pointerY > rect.top + GAP_ZONE && pointerY < rect.bottom - GAP_ZONE);
      }
    } else {
      setReparentIntent(false);
    }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveParentId(null);
    setOverId(null);
    setOverParentId(null);
    setReparentIntent(false);
    if (!over || !currentContextId || !tree || active.id === over.id) return;

    const activeNodeId = active.id as string;
    const overNodeId = over.id as string;
    const aParentId = active.data.current?.parentId as string;
    const oParentId = over.data.current?.parentId as string | undefined;

    if (!aParentId) return; // can't drag root

    // Helper: reparent as last child of target node
    const reparentInto = async (targetId: string) => {
      const target = findNode(tree, targetId);
      const lastPos = target && target.children.length > 0
        ? target.children[target.children.length - 1].node.position + 1
        : 0;
      await dragMoveNode(activeNodeId, targetId, lastPos, currentContextId);
    };

    if (!oParentId) {
      // Dropped on root → reparent as last child of root
      await reparentInto(overNodeId);
      return;
    }

    if (aParentId === oParentId) {
      // Same parent: check pointer position to decide reparent vs reorder
      const rect = over.rect;
      const initEvent = event.activatorEvent as PointerEvent;
      const pointerY = initEvent.clientY + event.delta.y;
      const GAP_ZONE = 8;

      if (pointerY > rect.top + GAP_ZONE && pointerY < rect.bottom - GAP_ZONE) {
        // Pointer within node bounds → reparent (append as last child of over node)
        await reparentInto(overNodeId);
      } else {
        // Pointer in gap zone → reorder within same parent
        const parent = findParent(tree, activeNodeId);
        if (!parent) return;
        const siblings = parent.children;
        const activeIdx = siblings.findIndex((c) => c.node.id === activeNodeId);
        const overIdx = siblings.findIndex((c) => c.node.id === overNodeId);
        const overNode = siblings[overIdx];
        if (!overNode || activeIdx === overIdx) return;

        const position =
          activeIdx < overIdx
            ? overNode.node.position + 1
            : overNode.node.position;

        await dragMoveNode(activeNodeId, aParentId, position, currentContextId);
      }
    } else {
      // Different parent → reparent as last child of over node
      await reparentInto(overNodeId);
    }
  }, [tree, currentContextId, dragMoveNode]);

  if (!currentContextId) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary text-sm">
        Press {modSymbol}K to create or switch context
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

  const childCount = activeTreeData ? activeTreeData.children.length : 0;

  return (
    <DragStateContext.Provider value={{ activeId, activeParentId, overId, overParentId, reparentIntent }}>
      <DndContext
        sensors={sensors}
        collisionDetection={combinedCollision}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="p-8 pl-15 overflow-auto h-full">
          <TreeBranch data={tree} isRoot />
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTreeData && (
            <div className="flex items-center gap-2">
              <NodeCard
                node={activeTreeData.node}
                onClick={() => {}}
              />
              {childCount > 0 && (
                <span className="text-[10px] font-mono text-text-secondary bg-bg-elevated px-1.5 py-0.5 rounded">
                  +{childCount}
                </span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </DragStateContext.Provider>
  );
}
