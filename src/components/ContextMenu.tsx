import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore, findNode } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import { NodeTypes, CompactStates } from "../lib/constants";
import type { TreeData } from "../lib/types";
import { writeNodeToClipboard } from "../lib/clipboard";
import { cn } from "../lib/cn";
import { modSymbol } from "../lib/platform";

interface MenuItem {
  key: string;
  label: string;
  shortcut: string;
  icon: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface GroupHeader {
  group: string;
}

type MenuEntry = MenuItem | "separator" | GroupHeader;

function isGroup(e: MenuEntry): e is GroupHeader {
  return typeof e === "object" && "group" in e;
}

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
  const { t } = useTranslation();
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

  // Compact lock: disable mutations on nodes outside compact subtree
  const compactLocked = (() => {
    const { compactState, compactRootId } = useUIStore.getState();
    if (compactState !== CompactStates.APPLIED || !compactRootId) return false;
    const compactRoot = findNode(tree, compactRootId);
    if (!compactRoot) return false;
    return findNode(compactRoot, contextMenuNodeId) === null;
  })();

  const exec = (fn: () => void) => {
    closeContextMenu();
    fn();
  };

  const items: MenuEntry[] = [
    { group: "EDIT" },
    {
      key: "edit",
      label: t("contextMenu.edit"),
      shortcut: "Enter",
      icon: "✎",
      action: () => exec(() => {
        if (nodeType === NodeTypes.MARKDOWN) openMarkdownEditor(contextMenuNodeId);
        else setEditingNode(contextMenuNodeId);
      }),
      disabled: compactLocked,
    },
    {
      key: "changeType",
      label: t("contextMenu.changeType"),
      shortcut: "T",
      icon: "◆",
      action: () => exec(() => openTypePopover(contextMenuNodeId)),
      disabled: compactLocked,
    },
    {
      key: "expandCollapse",
      label: isNodeCollapsed ? t("contextMenu.expand") : t("contextMenu.collapse"),
      shortcut: "Z",
      icon: isNodeCollapsed ? "▸" : "▾",
      action: () => exec(() => toggleCollapse(contextMenuNodeId)),
      disabled: !hasChildren,
    },
    {
      key: "copyMarkdown",
      label: t("contextMenu.copyMarkdown"),
      shortcut: "",
      icon: "≡",
      action: () => exec(() => {
        const subtree = findNode(tree, contextMenuNodeId);
        if (subtree) copyTreeToClipboard(subtree);
      }),
    },
    { group: "STRUCTURE" },
    {
      key: "addChild",
      label: t("contextMenu.addChild"),
      shortcut: "Tab",
      icon: "↳",
      action: () => exec(() => addChild(contextMenuNodeId, currentContextId)),
      disabled: compactLocked,
    },
    {
      key: "addSibling",
      label: t("contextMenu.addSibling"),
      shortcut: "⇧Tab",
      icon: "↵",
      action: () => exec(() => addSibling(contextMenuNodeId, currentContextId)),
      disabled: isRoot || compactLocked,
    },
    { group: "CLIPBOARD" },
    {
      key: "copy",
      label: t("contextMenu.copy"),
      shortcut: `${modSymbol}C`,
      icon: "⧉",
      action: () => exec(() => {
        copyNode(contextMenuNodeId);
        const title = findNode(tree, contextMenuNodeId)?.node.title || "";
        writeNodeToClipboard(contextMenuNodeId, title);
      }),
      disabled: isRoot,
    },
    {
      key: "cut",
      label: t("contextMenu.cut"),
      shortcut: `${modSymbol}X`,
      icon: "✂",
      action: () => exec(() => {
        cutNode(contextMenuNodeId);
        const title = findNode(tree, contextMenuNodeId)?.node.title || "";
        writeNodeToClipboard(contextMenuNodeId, title);
      }),
      disabled: isRoot || compactLocked,
    },
    {
      key: "paste",
      label: t("contextMenu.paste"),
      shortcut: `${modSymbol}V`,
      icon: "⎘",
      action: () => exec(() => pasteNodeUnder(contextMenuNodeId, currentContextId)),
      disabled: !copiedNodeId || compactLocked,
    },
    { group: "MOVE" },
    {
      key: "moveUp",
      label: t("contextMenu.moveUp"),
      shortcut: "Alt+↑",
      icon: "↑",
      action: () => exec(() => reorderNode(contextMenuNodeId, "up", currentContextId)),
      disabled: isRoot || compactLocked,
    },
    {
      key: "moveDown",
      label: t("contextMenu.moveDown"),
      shortcut: "Alt+↓",
      icon: "↓",
      action: () => exec(() => reorderNode(contextMenuNodeId, "down", currentContextId)),
      disabled: isRoot || compactLocked,
    },
    { group: "AI" },
    {
      key: "aiCompact",
      label: t("contextMenu.aiCompact"),
      shortcut: "",
      icon: "✦",
      action: () => exec(() => useTreeStore.getState().triggerCompact(contextMenuNodeId)),
    },
    "separator",
    {
      key: "delete",
      label: t("contextMenu.delete"),
      shortcut: "Del",
      icon: "✕",
      action: () => exec(() => deleteNode(contextMenuNodeId, currentContextId)),
      danger: true,
      disabled: isRoot || compactLocked,
    },
  ];

  // Filter out items based on root context
  const filtered = items.filter((item) => {
    if (item === "separator" || isGroup(item)) return true;
    if (isRoot && ["addSibling", "copy", "cut", "moveUp", "moveDown", "delete"].includes(item.key)) return false;
    return true;
  });

  // Remove empty groups (group header followed by another group/separator/end)
  const cleaned: MenuEntry[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    if (entry === "separator") {
      if (cleaned.length === 0) continue;
      const last = cleaned[cleaned.length - 1];
      if (last === "separator" || isGroup(last)) continue;
      cleaned.push(entry);
    } else if (isGroup(entry)) {
      // Skip group if next entry is not a menu item
      const next = filtered[i + 1];
      if (!next || next === "separator" || isGroup(next)) continue;
      // Replace trailing separator with group header
      if (cleaned.length > 0 && cleaned[cleaned.length - 1] === "separator") cleaned.pop();
      cleaned.push(entry);
    } else {
      cleaned.push(entry);
    }
  }
  if (cleaned.length > 0 && (cleaned[cleaned.length - 1] === "separator" || isGroup(cleaned[cleaned.length - 1]))) cleaned.pop();

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
          ) : isGroup(item) ? (
            <div key={`grp-${item.group}`} className={cn("px-3 pt-2.5 pb-1 text-[9px] font-mono font-bold tracking-[0.12em] text-text-secondary/50 select-none", i > 0 && "border-t border-border mt-1")}>
              {item.group}
            </div>
          ) : (
            <button
              key={item.key}
              className={cn(
                "flex items-center w-full px-3 py-1.5 text-left gap-3 transition-colors cursor-pointer",
                item.disabled ? "opacity-50 pointer-events-none cursor-not-allowed" : "hover:bg-[var(--color-hover)]",
                item.danger ? "text-[#FF4444]" : "text-text-primary",
              )}
              onClick={item.action}
              disabled={item.disabled}
            >
              <span className="w-4 text-center text-[12px] shrink-0 font-mono">{item.icon}</span>
              <span className="flex-1 text-[12px] font-mono font-medium">{item.label}</span>
              {item.shortcut && (
                <span className={cn(
                  "text-[10px] font-mono px-1.5 py-0.5 rounded",
                  item.danger
                    ? "text-[#FF444488] bg-[#FF444410]"
                    : "text-text-secondary bg-bg-page/60",
                )}>
                  {item.shortcut}
                </span>
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
