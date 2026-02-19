import { useRef, useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import { NodeTypes } from "../lib/constants";
import type { TreeData } from "../lib/types";
import { cn } from "../lib/cn";

interface MenuItem {
  label: string;
  shortcut: string;
  icon: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  rootOnly?: boolean;
}

type MenuEntry = MenuItem | "separator";

const NBSP = "\u00A0";

function treeToMarkdownList(data: TreeData, depth = 0): string {
  const indent = (NBSP + NBSP).repeat(depth);
  const line = `${indent}-${NBSP}${data.node.title || "(untitled)"}`;
  const childLines = data.children.map((c) => treeToMarkdownList(c, depth + 1));
  return [line, ...childLines].join("\n");
}

function copyTreeToClipboard(tree: TreeData) {
  navigator.clipboard.writeText(treeToMarkdownList(tree));
}

export function ContextMenu() {
  const { contextMenuNodeId, contextMenuPosition, closeContextMenu, setEditingNode, openTypePopover, openMarkdownEditor, collapsedNodes, toggleCollapse } = useUIStore();
  const { tree, copiedNodeId, copyNode, cutNode, pasteNodeUnder, addChild, addSibling, deleteNode, reorderNode } = useTreeStore();
  const { currentContextId } = useContextStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenuNodeId || !panelRef.current) return;
    const panel = panelRef.current;
    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) panel.style.left = `${vw - rect.width - 8}px`;
    if (rect.bottom > vh) panel.style.top = `${vh - rect.height - 8}px`;
  }, [contextMenuNodeId, contextMenuPosition]);

  if (!contextMenuNodeId || !contextMenuPosition || !tree || !currentContextId) return null;

  const isRoot = tree.node.id === contextMenuNodeId;
  const node = findNode(tree, contextMenuNodeId);
  const nodeType = node?.node.node_type;
  const hasChildren = node ? node.children.length > 0 : false;
  const isNodeCollapsed = collapsedNodes.has(contextMenuNodeId);

  const exec = (fn: () => void) => {
    closeContextMenu();
    fn();
  };

  const items: MenuEntry[] = [
    {
      label: "Edit",
      shortcut: "Enter",
      icon: "✎",
      action: () => exec(() => {
        if (nodeType === NodeTypes.MARKDOWN) openMarkdownEditor(contextMenuNodeId);
        else setEditingNode(contextMenuNodeId);
      }),
    },
    {
      label: "Change Type",
      shortcut: "T",
      icon: "◆",
      action: () => exec(() => openTypePopover(contextMenuNodeId)),
    },
    {
      label: isNodeCollapsed ? "Expand" : "Collapse",
      shortcut: "Z",
      icon: isNodeCollapsed ? "▸" : "▾",
      action: () => exec(() => toggleCollapse(contextMenuNodeId)),
      disabled: !hasChildren,
    },
    {
      label: "Copy as Markdown",
      shortcut: "",
      icon: "📋",
      action: () => exec(() => {
        if (tree) copyTreeToClipboard(tree);
      }),
      rootOnly: true,
    },
    "separator",
    {
      label: "Add Child",
      shortcut: "Tab",
      icon: "↳",
      action: () => exec(() => addChild(contextMenuNodeId, currentContextId)),
    },
    {
      label: "Add Sibling",
      shortcut: "⇧Tab",
      icon: "↵",
      action: () => exec(() => addSibling(contextMenuNodeId, currentContextId)),
      disabled: isRoot,
    },
    "separator",
    {
      label: "Copy",
      shortcut: "⌘C",
      icon: "⧉",
      action: () => exec(() => {
        copyNode(contextMenuNodeId);
        navigator.clipboard.writeText("mindflow:node:" + contextMenuNodeId);
      }),
      disabled: isRoot,
    },
    {
      label: "Cut",
      shortcut: "⌘X",
      icon: "✂",
      action: () => exec(() => {
        cutNode(contextMenuNodeId);
        navigator.clipboard.writeText("mindflow:node:" + contextMenuNodeId);
      }),
      disabled: isRoot,
    },
    {
      label: "Paste",
      shortcut: "⌘V",
      icon: "⎘",
      action: () => exec(() => pasteNodeUnder(contextMenuNodeId, currentContextId)),
      disabled: !copiedNodeId,
    },
    "separator",
    {
      label: "Move Up",
      shortcut: "Alt+↑",
      icon: "↑",
      action: () => exec(() => reorderNode(contextMenuNodeId, "up", currentContextId)),
      disabled: isRoot,
    },
    {
      label: "Move Down",
      shortcut: "Alt+↓",
      icon: "↓",
      action: () => exec(() => reorderNode(contextMenuNodeId, "down", currentContextId)),
      disabled: isRoot,
    },
    "separator",
    {
      label: "Delete",
      shortcut: "Del",
      icon: "✕",
      action: () => exec(() => deleteNode(contextMenuNodeId, currentContextId)),
      danger: true,
      disabled: isRoot,
    },
  ];

  // Filter out items based on root context
  const filtered = items.filter((item) => {
    if (item === "separator") return true;
    if (!isRoot && item.rootOnly) return false;
    if (isRoot && (item.label === "Add Sibling" || item.label === "Copy" || item.label === "Cut" || item.label === "Move Up" || item.label === "Move Down" || item.label === "Delete")) return false;
    return true;
  });

  // Remove consecutive separators and leading/trailing separators
  const cleaned: MenuEntry[] = [];
  for (const entry of filtered) {
    if (entry === "separator") {
      if (cleaned.length === 0) continue;
      if (cleaned[cleaned.length - 1] === "separator") continue;
      cleaned.push(entry);
    } else {
      cleaned.push(entry);
    }
  }
  if (cleaned[cleaned.length - 1] === "separator") cleaned.pop();

  return (
    <div className="fixed inset-0 z-50" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}>
      <div
        ref={panelRef}
        className="absolute bg-bg-elevated rounded-lg py-1.5 min-w-[200px]"
        style={{
          left: contextMenuPosition.x,
          top: contextMenuPosition.y,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {cleaned.map((item, i) =>
          item === "separator" ? (
            <div key={`sep-${i}`} className="h-px bg-border my-1 mx-2" />
          ) : (
            <button
              key={item.label}
              className={cn(
                "flex items-center w-full px-3 py-1.5 text-left gap-3 transition-colors cursor-pointer",
                item.disabled ? "opacity-40 pointer-events-none" : "hover:bg-[var(--color-hover)]",
                item.danger ? "text-[#FF4444]" : "text-text-primary",
              )}
              onClick={item.action}
              disabled={item.disabled}
            >
              <span className="w-4 text-center text-[12px] shrink-0 font-mono">{item.icon}</span>
              <span className="flex-1 text-[12px] font-mono font-medium">{item.label}</span>
              <span className={cn("text-[11px] font-mono", item.danger ? "text-[#FF444488]" : "text-text-secondary")}>
                {item.shortcut}
              </span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function findNode(tree: TreeData, id: string): TreeData | null {
  if (tree.node.id === id) return tree;
  for (const child of tree.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}
