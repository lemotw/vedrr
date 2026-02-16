import { useRef, useEffect, useState } from "react";
import type { TreeNode, NodeType } from "../lib/types";
import { NODE_TYPE_CONFIG } from "../lib/types";
import { useTreeStore } from "../stores/treeStore";
import { useUIStore } from "../stores/uiStore";
import { ipc } from "../lib/ipc";

interface Props {
  node: TreeNode;
  isRoot?: boolean;
  isSelected?: boolean;
  onClick: () => void;
}

export function NodeCard({ node, isRoot, isSelected, onClick }: Props) {
  const { letter, color } = NODE_TYPE_CONFIG[node.node_type as NodeType];
  const { updateNodeTitle } = useTreeStore();
  const { editingNodeId, setEditingNode, openTypePopover } = useUIStore();
  const isEditing = editingNodeId === node.id;
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = useState(node.title);

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

  if (isRoot) {
    return (
      <div
        ref={cardRef}
        className={`cursor-pointer px-1 py-0.5 rounded ${isSelected ? "ring-1 ring-accent-primary" : ""}`}
        onClick={onClick}
        onDoubleClick={() => setEditingNode(node.id)}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { e.stopPropagation(); if (e.nativeEvent.isComposing) return; if (e.key === "Enter") { e.preventDefault(); commitEdit(); } if (e.key === "Escape") { e.preventDefault(); setEditingNode(null); } }}
            className="bg-transparent font-heading text-[28px] font-bold text-text-primary outline-none border-b border-accent-primary"
          />
        ) : (
          <span className="font-heading text-[28px] font-bold text-text-primary">
            {node.title || "Untitled"}
          </span>
        )}
      </div>
    );
  }

  const isImage = node.node_type === "image" && node.file_path;
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
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
        : ext === "gif" ? "image/gif"
        : ext === "webp" ? "image/webp"
        : "image/png";
      const blob = new Blob([new Uint8Array(bytes)], { type: mime });
      setImageSrc(URL.createObjectURL(blob));
    }).catch(() => setImageSrc(null));
    return () => {
      revoked = true;
      setImageSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [isImage, node.file_path]);

  return (
    <>
      <div
        ref={cardRef}
        className={`flex items-center gap-2 rounded-md bg-bg-card cursor-pointer overflow-hidden
          ${isSelected ? "ring-1 ring-accent-primary" : "hover:ring-1 hover:ring-white/10"}`}
        onClick={onClick}
        onDoubleClick={() => setEditingNode(node.id)}
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
            className="flex items-center justify-center w-5 h-5 rounded bg-bg-elevated shrink-0 cursor-pointer hover:ring-1 hover:ring-white/20"
            onClick={(e) => { e.stopPropagation(); openTypePopover(node.id); }}
            title="Change type (T)"
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
              onKeyDown={(e) => { e.stopPropagation(); if (e.nativeEvent.isComposing) return; if (e.key === "Enter") { e.preventDefault(); commitEdit(); } if (e.key === "Escape") { e.preventDefault(); setEditingNode(null); } }}
              className="bg-transparent text-[13px] text-text-primary outline-none border-b border-accent-primary min-w-[60px]"
            />
          ) : (
            <span className="text-[13px] text-text-primary">
              {node.title || "Untitled"}
            </span>
          )}
        </div>
      </div>

      {showLightbox && imageSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
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
