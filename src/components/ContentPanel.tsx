import { useCallback, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useTreeStore } from "../stores/treeStore";
import { useUIStore } from "../stores/uiStore";
import type { TreeData } from "../lib/types";
import { NodeTypes } from "../lib/constants";
import { ipc } from "../lib/ipc";
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
  const { tree, updateNodeTitle } = useTreeStore();
  const { markdownEditorNodeId, closeMarkdownEditor } = useUIStore();
  const [mdContent, setMdContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const targetId = markdownEditorNodeId;
  const selected = tree && targetId ? findNode(tree, targetId) : null;
  const node = selected?.node;
  const showPanel = node && node.node_type === NodeTypes.MARKDOWN;

  const nodeId = node?.id;
  const nodeFilePath = node?.file_path;
  const nodeContextId = node?.context_id;

  // Load .md file content when node changes
  useEffect(() => {
    setSaveError(null);
    if (!nodeFilePath) return;

    let cancelled = false;
    setLoading(true);
    ipc.readFileBytes(nodeFilePath)
      .then((bytes) => {
        if (cancelled) return;
        const decoded = new TextDecoder("utf-8").decode(new Uint8Array(bytes));
        setMdContent(decoded);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[ContentPanel] Failed to read .md file:", err);
        setMdContent("");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [nodeId, nodeFilePath]);

  const handleSave = useCallback(
    (markdown: string) => {
      if (!nodeContextId || !nodeId) return;
      setSaveError(null);
      ipc.saveMarkdownFile(nodeContextId, nodeId, markdown).catch((err) => {
        console.error("[ContentPanel] Failed to save .md file:", err);
        setSaveError(String(err));
      });
    },
    [nodeId, nodeContextId],
  );

  const handleTitleChange = useCallback(
    (title: string) => {
      if (nodeId) updateNodeTitle(nodeId, title);
    },
    [nodeId, updateNodeTitle],
  );

  if (!showPanel || !node) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeMarkdownEditor();
      }}
    >
      <div className="w-[640px] max-w-[90vw] max-h-[80vh] rounded-xl border border-border bg-bg-elevated shadow-2xl flex flex-col">
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

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-text-secondary text-sm py-12">Loading...</div>
        ) : (
          <MarkdownEditor
            key={node.id}
            content={mdContent}
            onSave={handleSave}
          />
        )}

        {saveError && (
          <div className="px-3 py-1.5 text-[10px] text-red-400 bg-red-400/10 border-t border-red-400/20 shrink-0 font-mono truncate rounded-b-xl">
            Save failed — {saveError}
          </div>
        )}
      </div>
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
  const { t } = useTranslation();
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
      placeholder={t("common.untitled")}
      className="flex-1 min-w-0 bg-transparent text-[13px] font-heading font-bold text-text-primary
        outline-none placeholder:text-text-secondary/50 truncate"
    />
  );
}
