import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TreeNode, NodeType, CompactHighlightInfo } from "../lib/types";
import { NODE_TYPE_CONFIG } from "../lib/types";
import { NodeTypes, imageMime } from "../lib/constants";
import { useTreeStore } from "../stores/treeStore";
import { useUIStore } from "../stores/uiStore";
import { ipc } from "../lib/ipc";
import { cn } from "../lib/cn";

const HIGHLIGHT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  added:           { border: "#2DD4BF99", bg: "#1E3A36", text: "#2DD4BF" },
  edited:          { border: "#FBBF2499", bg: "#2D2A1F", text: "#FBBF24" },
  moved:           { border: "#4FC3F799", bg: "#1E2535", text: "#4FC3F7" },
  "edited+moved":  { border: "#FBBF2499", bg: "#2D2A1F", text: "#FBBF24" },
};

interface Props {
  node: TreeNode;
  isRoot?: boolean;
  isSelected?: boolean;
  isCutNode?: boolean;
  isDropTarget?: boolean;
  compactHighlight?: CompactHighlightInfo | null;
  compactFading?: boolean;
  dimmed?: boolean;
  onClick: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleListeners?: Record<string, any>;
}

function useNodeEdit(
  node: TreeNode,
  isEditing: boolean,
  isSelected: boolean | undefined,
  setEditingNode: (id: string | null) => void,
  updateNodeTitle: (id: string, title: string) => Promise<void>,
) {
  const [editValue, setEditValue] = useState(node.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastEnterRef = useRef<number>(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [isSelected]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(node.title);
  }, [node.title]);

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed !== node.title) {
      updateNodeTitle(node.id, trimmed || node.title);
    }
    setEditingNode(null);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const now = Date.now();
      if (now - lastEnterRef.current < 300) { commitEdit(); }
      lastEnterRef.current = now;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setEditingNode(null);
    }
  };

  return { editValue, setEditValue, inputRef, cardRef, commitEdit, handleInputKeyDown };
}

function RootNodeHeading({ node, isSelected, isCutNode, isDropTarget, dimmed, onClick }: Props) {
  const { t } = useTranslation();
  const updateNodeTitle = useTreeStore(s => s.updateNodeTitle);
  const editingNodeId = useUIStore(s => s.editingNodeId);
  const setEditingNode = useUIStore(s => s.setEditingNode);
  const openContextMenu = useUIStore(s => s.openContextMenu);
  const isEditing = editingNodeId === node.id;

  const { editValue, setEditValue, inputRef, cardRef, commitEdit, handleInputKeyDown } = useNodeEdit(
    node, isEditing, isSelected, setEditingNode, updateNodeTitle,
  );

  return (
    <div
      ref={cardRef}
      className={cn(
        "cursor-pointer px-1 py-0.5 rounded",
        isDropTarget && "ring-2 ring-accent-primary bg-accent-primary/10",
        !isDropTarget && isSelected && "ring-1 ring-accent-primary",
        isCutNode && "opacity-40",
        dimmed && "opacity-40 pointer-events-none",
      )}
      onClick={onClick}
      onDoubleClick={() => setEditingNode(node.id)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); openContextMenu(node.id, e.clientX, e.clientY); }}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleInputKeyDown}
          className="bg-transparent font-heading text-[28px] font-bold text-text-primary outline-none border-b border-accent-primary"
        />
      ) : (
        <span className="font-heading text-[28px] font-bold text-text-primary">
          {node.title || t("common.untitled")}
        </span>
      )}
    </div>
  );
}

function LeafNodeCard({ node, isSelected, isCutNode, isDropTarget, compactHighlight, compactFading, dimmed, onClick, dragHandleListeners }: Props) {
  const { t } = useTranslation();
  const { letter, color } = NODE_TYPE_CONFIG[node.node_type as NodeType];
  const updateNodeTitle = useTreeStore(s => s.updateNodeTitle);
  const openOrAttachFile = useTreeStore(s => s.openOrAttachFile);
  const pickAndImportImage = useTreeStore(s => s.pickAndImportImage);
  const editingNodeId = useUIStore(s => s.editingNodeId);
  const setEditingNode = useUIStore(s => s.setEditingNode);
  const openTypePopover = useUIStore(s => s.openTypePopover);
  const openContextMenu = useUIStore(s => s.openContextMenu);
  const isEditing = editingNodeId === node.id;

  const { editValue, setEditValue, inputRef, cardRef, commitEdit, handleInputKeyDown } = useNodeEdit(
    node, isEditing, isSelected, setEditingNode, updateNodeTitle,
  );

  const isFileish = node.node_type === NodeTypes.FILE;
  const isImage = node.node_type === NodeTypes.IMAGE && node.file_path;
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [showLightbox, setShowLightbox] = useState(false);

  useEffect(() => {
    if (!showLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setShowLightbox(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showLightbox]);

  useEffect(() => {
    if (!isImage || !node.file_path) {
      setImageSrc(null);
      return;
    }
    let revoked = false;
    ipc.readFileBytes(node.file_path).then((bytes) => {
      if (revoked) return;
      const ext = node.file_path!.split(".").pop() || "png";
      const mime = imageMime(ext);
      const blob = new Blob([new Uint8Array(bytes)], { type: mime });
      setImageSrc(URL.createObjectURL(blob));
    }).catch(() => setImageSrc(null));
    return () => {
      revoked = true;
      setImageSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [isImage, node.file_path]);

  const hl = compactHighlight && !compactFading ? HIGHLIGHT_COLORS[compactHighlight.type] : null;

  return (
    <>
      <div
        ref={cardRef}
        className={cn(
          "flex items-center gap-2 rounded-md bg-bg-card cursor-pointer overflow-hidden",
          "transition-[background-color,border-color] duration-700",
          isDropTarget && "ring-2 ring-accent-primary bg-accent-primary/10",
          !isDropTarget && isSelected && "ring-1 ring-accent-primary",
          !isDropTarget && !isSelected && "hover:ring-1 hover:ring-border",
          isCutNode && "opacity-40",
          dimmed && "opacity-40 pointer-events-none",
        )}
        style={hl ? {
          backgroundColor: hl.bg,
          borderLeft: `3px solid ${hl.border}`,
        } : undefined}
        onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); openContextMenu(node.id, e.clientX, e.clientY); }}
        onDoubleClick={() => {
          if (node.node_type === NodeTypes.MARKDOWN) {
            useUIStore.getState().openMarkdownEditor(node.id);
          } else {
            setEditingNode(node.id);
          }
        }}
        {...dragHandleListeners}
      >
        {imageSrc && (
          <div
            className="w-[48px] h-[48px] shrink-0 bg-bg-elevated flex items-center justify-center cursor-zoom-in"
            onClick={(e) => { e.stopPropagation(); setShowLightbox(true); }}
          >
            <img
              src={imageSrc}
              alt={node.title}
              className="max-w-[48px] max-h-[48px] object-contain"
            />
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2 whitespace-nowrap">
          <div
            className="flex items-center justify-center w-5 h-5 rounded bg-bg-elevated shrink-0 cursor-pointer hover:ring-1 hover:ring-border"
            onClick={(e) => { e.stopPropagation(); openTypePopover(node.id); }}
            title={t("nodeCard.tooltip.changeType")}
          >
            <span className="text-[10px] font-bold font-mono" style={{ color }}>
              {letter}
            </span>
          </div>
          {isEditing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleInputKeyDown}
              className="bg-transparent text-[13px] text-text-primary outline-none border-b border-accent-primary min-w-[60px]"
            />
          ) : (
            <div className="flex flex-col">
              <span className="text-[13px] text-text-primary">
                {node.title || t("common.untitled")}
              </span>
              {compactHighlight?.oldTitle && (
                <span className="text-[10px]" style={{ color: HIGHLIGHT_COLORS[compactHighlight.type]?.text }}>
                  ← {compactHighlight.oldTitle}
                </span>
              )}
              {compactHighlight?.fromParent && (
                <span className="text-[10px]" style={{ color: HIGHLIGHT_COLORS[compactHighlight.type]?.text }}>
                  ↗ from: {compactHighlight.fromParent}
                </span>
              )}
            </div>
          )}
          {isFileish && (
            <button
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 cursor-pointer
                bg-bg-elevated text-text-secondary hover:text-text-primary hover:ring-1 hover:ring-border transition-colors"
              onClick={(e) => { e.stopPropagation(); openOrAttachFile(node.id); }}
              title={node.file_path ? t("nodeCard.tooltip.revealFile") : t("nodeCard.tooltip.attachFile")}
            >
              {node.file_path ? t("nodeCard.button.open") : t("nodeCard.button.attach")}
            </button>
          )}
          {node.node_type === NodeTypes.IMAGE && !node.file_path && (
            <button
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 cursor-pointer
                bg-bg-elevated text-text-secondary hover:text-text-primary hover:ring-1 hover:ring-border transition-colors"
              onClick={(e) => { e.stopPropagation(); pickAndImportImage(node.id); }}
              title={t("nodeCard.tooltip.chooseImage")}
            >
              {t("nodeCard.button.pick")}
            </button>
          )}
        </div>
      </div>

      {showLightbox && imageSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)]"
          onClick={() => setShowLightbox(false)}
        >
          <img
            src={imageSrc}
            alt={node.title}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

export function NodeCard(props: Props) {
  if (props.isRoot) return <RootNodeHeading {...props} />;
  return <LeafNodeCard {...props} />;
}
