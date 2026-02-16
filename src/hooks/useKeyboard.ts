import { useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import type { TreeData } from "../lib/types";
import { NodeTypes, PasteKind } from "../lib/constants";

function findNodeInTree(tree: TreeData, id: string): TreeData | null {
  if (tree.node.id === id) return tree;
  for (const child of tree.children) {
    const found = findNodeInTree(child, id);
    if (found) return found;
  }
  return null;
}

function findParentInTree(tree: TreeData, id: string): TreeData | null {
  for (const child of tree.children) {
    if (child.node.id === id) return tree;
    const found = findParentInTree(child, id);
    if (found) return found;
  }
  return null;
}

// Get the depth of a node in the tree (-1 if not found)
function getNodeDepth(tree: TreeData, id: string, depth: number = 0): number {
  if (tree.node.id === id) return depth;
  for (const child of tree.children) {
    const found = getNodeDepth(child, id, depth + 1);
    if (found >= 0) return found;
  }
  return -1;
}

// Collect all nodes at a given depth, in left-to-right (visual top-to-bottom) order
function getNodesAtDepth(tree: TreeData, targetDepth: number, currentDepth: number = 0): TreeData[] {
  if (currentDepth === targetDepth) return [tree];
  const result: TreeData[] = [];
  for (const child of tree.children) {
    result.push(...getNodesAtDepth(child, targetDepth, currentDepth + 1));
  }
  return result;
}

export function useKeyboard() {
  const { openQuickSwitcher, quickSwitcherOpen, editingNodeId, setEditingNode, typePopoverNodeId, openTypePopover, contentPanelFocused, markdownEditorNodeId, openMarkdownEditor, closeMarkdownEditor, nodeSearchOpen, openNodeSearch, contextMenuNodeId, closeContextMenu } = useUIStore();
  const { tree, selectedNodeId, copiedNodeId, selectNode, copyNode, pasteNodeUnder, addChild, addSibling, deleteNode, pasteAsNode, openOrAttachFile, reorderNode, undo } = useTreeStore();
  const { currentContextId } = useContextStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K — Quick Switcher (always active)
      if (e.metaKey && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        openQuickSwitcher();
        return;
      }

      // ⌘F — Node Search (always active)
      if (e.metaKey && e.key === "f" && !e.shiftKey) {
        e.preventDefault();
        openNodeSearch();
        return;
      }

      // ⌘Z — Undo (always active, unless editing text)
      if (e.metaKey && e.key === "z" && !e.shiftKey && !editingNodeId && !contentPanelFocused) {
        e.preventDefault();
        undo();
        return;
      }

      // ⌘C — Copy node (when not editing): write marker to clipboard
      if (e.metaKey && e.key === "c" && !editingNodeId && !contentPanelFocused && !quickSwitcherOpen
          && selectedNodeId && tree && selectedNodeId !== tree.node.id) {
        e.preventDefault();
        copyNode(selectedNodeId);
        navigator.clipboard.writeText("mindflow:node:" + selectedNodeId);
        return;
      }

      // Escape closes context menu
      if (e.key === "Escape" && contextMenuNodeId) {
        e.preventDefault();
        closeContextMenu();
        return;
      }

      // Escape closes markdown editor (before other guards so it works while editing)
      if (e.key === "Escape" && markdownEditorNodeId) {
        e.preventDefault();
        closeMarkdownEditor();
        return;
      }

      // Escape clears copied node
      if (e.key === "Escape" && copiedNodeId) {
        e.preventDefault();
        copyNode(null);
        return;
      }

      // Don't handle tree keys when switcher/search is open, editing, content panel focused, type popover or context menu open
      if (quickSwitcherOpen || nodeSearchOpen || editingNodeId || typePopoverNodeId || contentPanelFocused || contextMenuNodeId) return;
      if (!tree || !currentContextId) return;

      // Alt+j/↓ Alt+k/↑ — reorder node among siblings
      if (e.altKey && selectedNodeId && selectedNodeId !== tree.node.id) {
        if (e.code === "KeyJ" || e.key === "ArrowDown") {
          e.preventDefault();
          reorderNode(selectedNodeId, "down", currentContextId);
          return;
        }
        if (e.code === "KeyK" || e.key === "ArrowUp") {
          e.preventDefault();
          reorderNode(selectedNodeId, "up", currentContextId);
          return;
        }
      }

      switch (e.key) {
        // j/↓ k/↑ — move between nodes at the same depth level (across subtrees)
        case "j":
        case "ArrowDown": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const depthDown = getNodeDepth(tree, selectedNodeId);
          if (depthDown < 0) break;
          const layerDown = getNodesAtDepth(tree, depthDown);
          const idxDown = layerDown.findIndex(s => s.node.id === selectedNodeId);
          if (idxDown < layerDown.length - 1) {
            selectNode(layerDown[idxDown + 1].node.id);
          }
          break;
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const depthUp = getNodeDepth(tree, selectedNodeId);
          if (depthUp < 0) break;
          const layerUp = getNodesAtDepth(tree, depthUp);
          const idxUp = layerUp.findIndex(s => s.node.id === selectedNodeId);
          if (idxUp > 0) {
            selectNode(layerUp[idxUp - 1].node.id);
          }
          break;
        }
        case "l":
        case "ArrowRight": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const node = findNodeInTree(tree, selectedNodeId);
          if (node && node.children.length > 0) {
            selectNode(node.children[0].node.id);
          }
          break;
        }
        case "h":
        case "ArrowLeft": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const parent = findParentInTree(tree, selectedNodeId);
          if (parent) selectNode(parent.node.id);
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const selectedNode = findNodeInTree(tree, selectedNodeId);
          if (selectedNode && selectedNode.node.node_type === NodeTypes.MARKDOWN) {
            openMarkdownEditor(selectedNodeId);
          } else {
            setEditingNode(selectedNodeId);
          }
          break;
        }
        case "Tab": {
          e.preventDefault();
          if (!selectedNodeId) break;
          if (e.shiftKey) {
            addSibling(selectedNodeId, currentContextId);
          } else {
            addChild(selectedNodeId, currentContextId);
          }
          break;
        }
        case "o": {
          e.preventDefault();
          if (selectedNodeId) openOrAttachFile(selectedNodeId);
          break;
        }
        case "t": {
          e.preventDefault();
          if (selectedNodeId) openTypePopover(selectedNodeId);
          break;
        }
        case "Backspace":
        case "Delete": {
          if (!selectedNodeId || selectedNodeId === tree.node.id) break;
          e.preventDefault();
          deleteNode(selectedNodeId, currentContextId);
          break;
        }
      }
    }

    function handlePaste(e: ClipboardEvent) {
      if (quickSwitcherOpen || nodeSearchOpen || editingNodeId || typePopoverNodeId || contentPanelFocused || contextMenuNodeId) return;
      if (!tree || !currentContextId || !selectedNodeId) return;
      const items = e.clipboardData?.items;

      // 1. Clipboard has image → paste as image node
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith("image/")) {
            const blob = item.getAsFile();
            if (!blob) continue;
            e.preventDefault();
            const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
            pasteAsNode(selectedNodeId, currentContextId, { kind: PasteKind.IMAGE, blob, ext });
            return;
          }
        }
      }

      // 2. Clipboard has text → check if it's a node marker or regular text
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type === "text/plain") {
            e.preventDefault();
            item.getAsString((text) => {
              if (text.startsWith("mindflow:node:")) {
                // Internal node copy → clone subtree
                const sourceId = text.replace("mindflow:node:", "");
                if (sourceId) {
                  pasteNodeUnder(selectedNodeId!, currentContextId!);
                }
              } else if (text.trim()) {
                pasteAsNode(selectedNodeId!, currentContextId!, { kind: PasteKind.TEXT, text });
              }
            });
            return;
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
    };
  }, [tree, selectedNodeId, copiedNodeId, currentContextId, quickSwitcherOpen, nodeSearchOpen, editingNodeId, typePopoverNodeId, contentPanelFocused, markdownEditorNodeId, contextMenuNodeId,
      openQuickSwitcher, openNodeSearch, selectNode, copyNode, pasteNodeUnder, addChild, addSibling, deleteNode, setEditingNode, openTypePopover, pasteAsNode, openOrAttachFile, reorderNode, undo, openMarkdownEditor, closeMarkdownEditor, closeContextMenu]);
}
