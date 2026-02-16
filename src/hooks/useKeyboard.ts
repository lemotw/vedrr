import { useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import type { TreeData } from "../lib/types";

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

// Get siblings of the given node (returns parent's children, or [root] if root)
function getSiblings(tree: TreeData, id: string): TreeData[] {
  const parent = findParentInTree(tree, id);
  return parent ? parent.children : [tree];
}

export function useKeyboard() {
  const { openQuickSwitcher, quickSwitcherOpen, editingNodeId, setEditingNode, typePopoverNodeId, openTypePopover } = useUIStore();
  const { tree, selectedNodeId, selectNode, addChild, addSibling, deleteNode, pasteAsNode } = useTreeStore();
  const { currentContextId } = useContextStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K — Quick Switcher (always active)
      if (e.metaKey && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        openQuickSwitcher();
        return;
      }

      // Don't handle tree keys when switcher is open, editing, or type popover open
      if (quickSwitcherOpen || editingNodeId || typePopoverNodeId) return;
      if (!tree || !currentContextId) return;

      switch (e.key) {
        // j/↓ k/↑ — breadth: move between siblings
        case "j":
        case "ArrowDown": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const siblingsDown = getSiblings(tree, selectedNodeId);
          const idxDown = siblingsDown.findIndex(s => s.node.id === selectedNodeId);
          if (idxDown < siblingsDown.length - 1) {
            selectNode(siblingsDown[idxDown + 1].node.id);
          }
          break;
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const siblingsUp = getSiblings(tree, selectedNodeId);
          const idxUp = siblingsUp.findIndex(s => s.node.id === selectedNodeId);
          if (idxUp > 0) {
            selectNode(siblingsUp[idxUp - 1].node.id);
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
          if (selectedNodeId) setEditingNode(selectedNodeId);
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
      if (quickSwitcherOpen || editingNodeId || typePopoverNodeId) return;
      if (!tree || !currentContextId || !selectedNodeId) return;
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      // Extract blob/text synchronously before clipboard data expires
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (!blob) continue;
          e.preventDefault();
          const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
          pasteAsNode(selectedNodeId, currentContextId, { kind: "image", blob, ext });
          return;
        }
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type === "text/plain") {
          e.preventDefault();
          item.getAsString((text) => {
            if (text.trim()) {
              pasteAsNode(selectedNodeId!, currentContextId!, { kind: "text", text });
            }
          });
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
    };
  }, [tree, selectedNodeId, currentContextId, quickSwitcherOpen, editingNodeId, typePopoverNodeId,
      openQuickSwitcher, selectNode, addChild, addSibling, deleteNode, setEditingNode, openTypePopover, pasteAsNode]);
}
