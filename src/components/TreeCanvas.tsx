import { useEffect, useState, useCallback, useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import type { TreeData } from "../lib/types";
import { NODE_TYPE_CONFIG } from "../lib/types";
import { useContextStore } from "../stores/contextStore";
import { useTreeStore, findNode } from "../stores/treeStore";
import { useUIStore } from "../stores/uiStore";
import { CompactStates } from "../lib/constants";
import { DragStateContext, useDragState, type DropIntent } from "../lib/dragContext";
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

const SortableChildRow = memo(function SortableChildRow({
  data,
  parentId,
  isFirst,
  isLast,
  ancestorCut,
  compactNodeIds,
}: {
  data: TreeData;
  parentId: string;
  isFirst: boolean;
  isLast: boolean;
  ancestorCut?: boolean;
  compactNodeIds?: Set<string> | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: data.node.id,
      data: { parentId },
    });
  const dragState = useDragState();
  // Show reorder hint on the hovered sibling during reorder intent
  const isOverThis = dragState.overId === data.node.id && dragState.activeId !== null;
  const showReorderHint = isOverThis && dragState.dropIntent === "reorder";

  // Suppress dnd-kit's sort preview shift when intent is reparent —
  // otherwise sortable strategy slides siblings down even though
  // we're not inserting between them.
  // Scoped to siblings sharing the same parent as the over node.
  const suppressTransform =
    dragState.activeId !== null &&
    dragState.dropIntent === "into" &&
    dragState.overParentId === parentId;

  const style: React.CSSProperties = {
    transform: suppressTransform
      ? undefined
      : CSS.Transform.toString(
          transform ? { ...transform, scaleX: 1, scaleY: 1 } : null,
        ),
    transition: suppressTransform ? undefined : transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex items-stretch relative">
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
          compactNodeIds={compactNodeIds}
          dragHandleListeners={listeners}
          showReorderHint={showReorderHint}
        />
      </div>
    </div>
  );
});

function RootDropZone({ nodeId, children }: { nodeId: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({
    id: nodeId,
    data: { parentId: null },
  });
  return <div ref={setNodeRef}>{children}</div>;
}

const TreeBranch = memo(function TreeBranch({
  data,
  isRoot,
  ancestorCut,
  compactNodeIds,
  dragHandleListeners,
  showReorderHint,
}: {
  data: TreeData;
  isRoot?: boolean;
  ancestorCut?: boolean;
  compactNodeIds?: Set<string> | null;
  dragHandleListeners?: ReturnType<typeof useSortable>["listeners"];
  showReorderHint?: boolean;
}) {
  const { t } = useTranslation();
  const selectedNodeId = useTreeStore(s => s.selectedNodeId);
  const selectNode = useTreeStore(s => s.selectNode);
  const addChild = useTreeStore(s => s.addChild);
  const addSibling = useTreeStore(s => s.addSibling);
  const copiedNodeId = useTreeStore(s => s.copiedNodeId);
  const isCut = useTreeStore(s => s.isCut);
  const currentContextId = useContextStore(s => s.currentContextId);
  const isCollapsed = useUIStore(s => s.collapsedNodes.has(data.node.id));
  const toggleCollapse = useUIStore(s => s.toggleCollapse);
  const compactHighlights = useUIStore(s => s.compactHighlights);
  const compactFading = useUIStore(s => s.compactFading);
  const dragState = useDragState();
  const hasChildren = data.children.length > 0;
  const isSelected = selectedNodeId === data.node.id;
  const isCutHere = isCut && copiedNodeId === data.node.id;
  const inCutSubtree = ancestorCut || isCutHere;
  const isOutsideCompact = compactNodeIds != null && !compactNodeIds.has(data.node.id);

  // Highlight: this node is a reparent drop target
  const isReparentTarget =
    dragState.activeId !== null &&
    dragState.overId === data.node.id &&
    dragState.activeId !== data.node.id &&
    dragState.dropIntent === "into";

  const highlight = compactHighlights?.get(data.node.id) ?? null;

  const nodeCard = (
    <NodeCard
      node={data.node}
      isRoot={isRoot}
      isSelected={isSelected}
      isCutNode={inCutSubtree}
      isDropTarget={isReparentTarget}
      showReorderHint={showReorderHint}
      compactHighlight={highlight}
      compactFading={compactFading}
      dimmed={isOutsideCompact}
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
        {/* Add child button — visible on hover or when selected; hidden during drag hint */}
        {currentContextId && !isOutsideCompact && !showReorderHint && (
          <AddButton
            className={isSelected
              ? "opacity-100 mx-1"
              : "opacity-0 group-hover/node:opacity-100 mx-1"
            }
            onClick={() => addChild(data.node.id, currentContextId)}
            title={t("treeCanvas.tooltip.addChild")}
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
          title={t("treeCanvas.tooltip.expand")}
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
                compactNodeIds={compactNodeIds}
              />
            ))}
          </SortableContext>
          {/* Add sibling button at end of children list; hidden outside compact subtree */}
          {currentContextId && !isOutsideCompact && (
            <div className="flex items-center opacity-0 hover:opacity-100 transition-opacity" style={{ paddingTop: 6, paddingLeft: 20 }}>
              <AddButton
                onClick={() => {
                  const lastChild = data.children[data.children.length - 1];
                  addSibling(lastChild.node.id, currentContextId);
                }}
                title={t("treeCanvas.tooltip.addSibling")}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export function TreeCanvas() {
  const { t } = useTranslation();
  const currentContextId = useContextStore(s => s.currentContextId);
  const tree = useTreeStore(s => s.tree);
  const loadTree = useTreeStore(s => s.loadTree);
  const dragMoveNode = useTreeStore(s => s.dragMoveNode);
  const compactState = useUIStore(s => s.compactState);
  const compactRootId = useUIStore(s => s.compactRootId);

  const compactNodeIds = useMemo(() => {
    if (compactState !== CompactStates.APPLIED || !compactRootId || !tree) return null;
    const root = findNode(tree, compactRootId);
    if (!root) return null;
    const ids = new Set<string>();
    (function walk(td: TreeData) { ids.add(td.node.id); td.children.forEach(walk); })(root);
    return ids;
  }, [compactState, compactRootId, tree]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overParentId, setOverParentId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<DropIntent>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(() => {
    if (currentContextId) {
      useTreeStore.getState().clearUndo();
      loadTree(currentContextId);
    }
  }, [currentContextId, loadTree]);

  const activeTreeData = activeId && tree ? findNode(tree, activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    // Block drag on nodes outside compact subtree
    if (compactNodeIds && !compactNodeIds.has(id)) return;
    setActiveId(id);
    setActiveParentId(event.active.data.current?.parentId as string ?? null);
  }, [compactNodeIds]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const id = event.over?.id as string ?? null;
    setOverId(id);
    const oParentId = event.over?.data.current?.parentId as string ?? null;
    setOverParentId(oParentId);

    if (event.over && event.active.id !== event.over.id) {
      const aParentId = event.active.data.current?.parentId as string ?? null;
      if (aParentId !== oParentId || !oParentId) {
        // Different parent or drop on root → always reparent
        setDropIntent("into");
      } else {
        // Same parent → use X axis: left = reorder, right = reparent
        // Cap width to card area (~240px: 20px connector + ~200px card + padding)
        // so threshold doesn't land in children subtree zone
        const rect = event.over.rect;
        const initEvent = event.activatorEvent as PointerEvent;
        const pointerX = initEvent.clientX + event.delta.x;
        const cardAreaWidth = Math.min(rect.width, 240);
        const REPARENT_X_RATIO = 0.65;

        if (pointerX > rect.left + cardAreaWidth * REPARENT_X_RATIO) {
          setDropIntent("into");
        } else {
          setDropIntent("reorder");
        }
      }
    } else {
      setDropIntent(null);
    }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    // Capture intent BEFORE resetting state so action matches visual feedback
    const finalIntent = dropIntent;
    setActiveId(null);
    setActiveParentId(null);
    setOverId(null);
    setOverParentId(null);
    setDropIntent(null);
    if (!over || !currentContextId || !tree || active.id === over.id) return;

    const activeNodeId = active.id as string;
    const overNodeId = over.id as string;
    const aParentId = active.data.current?.parentId as string;

    if (!aParentId) return; // can't drag root

    // Helper: reparent as last child of target node
    const reparentInto = async (targetId: string) => {
      const target = findNode(tree, targetId);
      const lastPos = target && target.children.length > 0
        ? target.children[target.children.length - 1].node.position + 1
        : 0;
      await dragMoveNode(activeNodeId, targetId, lastPos, currentContextId);
    };

    if (finalIntent === "into") {
      await reparentInto(overNodeId);
    } else if (finalIntent === "reorder") {
      // Reorder within same parent
      // Backend move_node shifts siblings first then sets position, so:
      //   drag down (activeIdx < overIdx) → position = over.position + 1
      //   drag up   (activeIdx > overIdx) → position = over.position
      const parentNode = findNode(tree, aParentId);
      const overNode = findNode(tree, overNodeId);
      if (!parentNode || !overNode) return;
      const activeIdx = parentNode.children.findIndex(c => c.node.id === activeNodeId);
      const overIdx = parentNode.children.findIndex(c => c.node.id === overNodeId);
      if (activeIdx === overIdx) return;

      const position = activeIdx < overIdx
        ? overNode.node.position + 1
        : overNode.node.position;

      await dragMoveNode(activeNodeId, aParentId, position, currentContextId);
    }
    // finalIntent === null → no-op (dropped on self or invalid)
  }, [tree, currentContextId, dragMoveNode, dropIntent]);

  const dragContextValue = useMemo(
    () => ({ activeId, activeParentId, overId, overParentId, dropIntent }),
    [activeId, activeParentId, overId, overParentId, dropIntent],
  );

  if (!currentContextId) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary text-sm">
        {t("treeCanvas.empty", { key: `${modSymbol}K` })}
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary text-sm">
        {t("common.loading")}
      </div>
    );
  }

  const childCount = activeTreeData ? activeTreeData.children.length : 0;

  return (
    <DragStateContext.Provider value={dragContextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={combinedCollision}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div id="tree-canvas" className="p-8 pl-15 overflow-auto h-full">
          <TreeBranch data={tree} isRoot compactNodeIds={compactNodeIds} />
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
