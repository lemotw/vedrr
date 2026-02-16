import { useRef, useEffect, useState } from "react";
import type { TreeNode, NodeType } from "../lib/types";
import { NODE_TYPE_CONFIG } from "../lib/types";
import { useTreeStore } from "../stores/treeStore";
import { useUIStore } from "../stores/uiStore";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = useState(node.title);

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

  return (
    <div
      className={`flex items-center gap-2 rounded-md bg-bg-card px-3 py-2 cursor-pointer whitespace-nowrap
        ${isSelected ? "ring-1 ring-accent-primary" : "hover:ring-1 hover:ring-white/10"}`}
      onClick={onClick}
      onDoubleClick={() => setEditingNode(node.id)}
    >
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
  );
}
