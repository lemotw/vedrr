import { useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import type { TreeData } from "../lib/types";

// Flatten tree into ordered list for navigation
function flattenTree(data: TreeData): string[] {
  const ids = [data.node.id];
  for (const child of data.children) {
    ids.push(...flattenTree(child));
  }
  return ids;
}

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

export function useKeyboard() {
  const { openQuickSwitcher, quickSwitcherOpen, editingNodeId, setEditingNode } = useUIStore();
  const { tree, selectedNodeId, selectNode, addChild, addSibling, deleteNode } = useTreeStore();
  const { currentContextId } = useContextStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K — Quick Switcher (always active)
      if (e.metaKey && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        openQuickSwitcher();
        return;
      }

      // Don't handle tree keys when switcher is open or editing
      if (quickSwitcherOpen || editingNodeId) return;
      if (!tree || !currentContextId) return;

      const flat = flattenTree(tree);
      const currentIndex = selectedNodeId ? flat.indexOf(selectedNodeId) : -1;

      switch (e.key) {
        case "j":
        case "ArrowDown": {
          e.preventDefault();
          const next = currentIndex < flat.length - 1 ? flat[currentIndex + 1] : flat[0];
          selectNode(next);
          break;
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault();
          const prev = currentIndex > 0 ? flat[currentIndex - 1] : flat[flat.length - 1];
          selectNode(prev);
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
        case "Backspace":
        case "Delete": {
          if (!selectedNodeId || selectedNodeId === tree.node.id) break;
          e.preventDefault();
          deleteNode(selectedNodeId, currentContextId);
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tree, selectedNodeId, currentContextId, quickSwitcherOpen, editingNodeId,
      openQuickSwitcher, selectNode, addChild, addSibling, deleteNode, setEditingNode]);
}
