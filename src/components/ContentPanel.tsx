import { useCallback, useState, useEffect, useRef } from "react";
import { useTreeStore } from "../stores/treeStore";
import { useUIStore } from "../stores/uiStore";
import type { TreeData } from "../lib/types";
import { NodeTypes } from "../lib/constants";
import { MarkdownEditor } from "./MarkdownEditor";

function findNode(tree: TreeData, id: string): TreeData | null {
  if (tree.node.id === id) return tree;
  for (const child of tree.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function ContentPanel() {
  const { tree, updateNodeContent, updateNodeTitle } = useTreeStore();
  const { markdownEditorNodeId } = useUIStore();

  const targetId = markdownEditorNodeId;
  const selected = tree && targetId ? findNode(tree, targetId) : null;
  const node = selected?.node;
  const showPanel = node && node.node_type === NodeTypes.MARKDOWN;

  const handleSave = useCallback(
    (content: string) => {
      if (node) updateNodeContent(node.id, content);
    },
    [node?.id, updateNodeContent],
  );

  const handleTitleChange = useCallback(
    (title: string) => {
      if (node) updateNodeTitle(node.id, title);
    },
    [node?.id, updateNodeTitle],
  );

  if (!showPanel || !node) return null;

  return (
    <div className="w-[480px] shrink-0 border-l border-border bg-bg-page flex flex-col h-full">
      {/* Header with editable title */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <span className="text-[10px] font-mono font-bold text-node-markdown shrink-0">M</span>
        <PanelTitle
          key={node.id}
          title={node.title}
          onChange={handleTitleChange}
          autoFocus
        />
        <span className="text-[10px] text-text-secondary font-mono shrink-0">Esc</span>
      </div>

      <MarkdownEditor
        key={node.id}
        content={node.content || ""}
        onSave={handleSave}
      />
    </div>
  );
}

function PanelTitle({
  title,
  onChange,
  autoFocus,
}: {
  title: string;
  onChange: (title: string) => void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(title);
  const { setContentPanelFocused, closeMarkdownEditor } = useUIStore();
  const commitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setValue(title);
  }, [title]);

  const commit = (v: string) => {
    const trimmed = v.trim();
    if (trimmed && trimmed !== title) {
      onChange(trimmed);
    }
  };

  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        if (commitTimer.current) clearTimeout(commitTimer.current);
        commitTimer.current = setTimeout(() => commit(e.target.value), 500);
      }}
      onFocus={() => setContentPanelFocused(true)}
      onBlur={() => {
        if (commitTimer.current) clearTimeout(commitTimer.current);
        commit(value);
        setContentPanelFocused(false);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { e.preventDefault(); e.currentTarget.blur(); closeMarkdownEditor(); }
      }}
      placeholder="Untitled"
      className="flex-1 min-w-0 bg-transparent text-[13px] font-heading font-bold text-text-primary
        outline-none placeholder:text-text-secondary/50 truncate"
    />
  );
}
