import { useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import type { TreeData } from "../lib/types";
import { NodeTypes, PasteKind, CompactStates } from "../lib/constants";
import { isModKey } from "../lib/platform";

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
// Skips children of collapsed nodes (they are not visible)
function getNodesAtDepth(tree: TreeData, targetDepth: number, collapsedNodes: Set<string>, currentDepth: number = 0): TreeData[] {
  if (currentDepth === targetDepth) return [tree];
  if (collapsedNodes.has(tree.node.id)) return [];
  const result: TreeData[] = [];
  for (const child of tree.children) {
    result.push(...getNodesAtDepth(child, targetDepth, collapsedNodes, currentDepth + 1));
  }
  return result;
}

export function useKeyboard() {
  const tree = useTreeStore(s => s.tree);
  const selectedNodeId = useTreeStore(s => s.selectedNodeId);
  const copiedNodeId = useTreeStore(s => s.copiedNodeId);
  const isCut = useTreeStore(s => s.isCut);
  const currentContextId = useContextStore(s => s.currentContextId);
  const collapsedNodes = useUIStore(s => s.collapsedNodes);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ui = useUIStore.getState();

      // Block ALL keys when modal overlays are open
      if (ui.settingsOpen) return;

      // Helper: check if compact is busy (LOADING or APPLIED — locks context-switching actions)
      const isCompactBusy = () => useUIStore.getState().compactState !== CompactStates.IDLE;

      // Mod+K — Quick Switcher (blocked during APPLIED)
      if (isModKey(e) && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        if (isCompactBusy()) { useUIStore.getState().flashCompactBanner(); return; }
        ui.openQuickSwitcher();
        return;
      }

      // Mod+F — Node Search
      if (isModKey(e) && e.key === "f" && !e.shiftKey) {
        e.preventDefault();
        ui.openNodeSearch();
        return;
      }

      // Mod+Z — Undo (blocked during APPLIED — use 'u' for full compact rollback)
      if (isModKey(e) && e.key === "z" && !e.shiftKey && !ui.editingNodeId && !ui.contentPanelFocused) {
        e.preventDefault();
        if (isCompactBusy()) { useUIStore.getState().flashCompactBanner(); return; }
        useTreeStore.getState().undo();
        return;
      }

      // Mod+C — Copy node (when not editing): write marker to clipboard
      if (isModKey(e) && e.key === "c" && !ui.editingNodeId && !ui.contentPanelFocused && !ui.quickSwitcherOpen
          && selectedNodeId && tree && selectedNodeId !== tree.node.id) {
        e.preventDefault();
        useTreeStore.getState().copyNode(selectedNodeId);
        navigator.clipboard.writeText("vedrr:node:" + selectedNodeId);
        return;
      }

      // Mod+X — Cut node
      if (isModKey(e) && e.key === "x" && !ui.editingNodeId && !ui.contentPanelFocused && !ui.quickSwitcherOpen
          && selectedNodeId && tree && selectedNodeId !== tree.node.id) {
        e.preventDefault();
        useTreeStore.getState().cutNode(selectedNodeId);
        navigator.clipboard.writeText("vedrr:node:" + selectedNodeId);
        return;
      }

      // Escape closes context menu
      if (e.key === "Escape" && ui.contextMenuNodeId) {
        e.preventDefault();
        ui.closeContextMenu();
        return;
      }

      // Escape closes markdown editor (before other guards so it works while editing)
      if (e.key === "Escape" && ui.markdownEditorNodeId) {
        e.preventDefault();
        ui.closeMarkdownEditor();
        return;
      }

      // Escape clears copied/cut node
      if (e.key === "Escape" && copiedNodeId) {
        e.preventDefault();
        useTreeStore.getState().copyNode(null);
        return;
      }

      // Don't handle tree keys when switcher/search is open, editing, content panel focused, type popover or context menu open
      if (ui.quickSwitcherOpen || ui.nodeSearchOpen || ui.editingNodeId || ui.typePopoverNodeId || ui.contentPanelFocused || ui.contextMenuNodeId) return;
      if (!tree || !currentContextId) return;

      // Compact lock: block mutations on nodes outside compact subtree
      const compactLocked = (() => {
        const { compactState, compactRootId } = useUIStore.getState();
        if (compactState !== CompactStates.APPLIED || !compactRootId || !selectedNodeId) return false;
        const root = findNodeInTree(tree, compactRootId);
        if (!root) return false;
        return findNodeInTree(root, selectedNodeId) === null;
      })();

      // Alt+j/↓ Alt+k/↑ — reorder node among siblings
      // Alt+l/→ — reparent into previous sibling (become its last child)
      // Alt+h/← — reparent to grandparent (become sibling of parent)
      if (e.altKey && selectedNodeId && selectedNodeId !== tree.node.id) {
        if (compactLocked) { useUIStore.getState().flashCompactBanner(); return; }
        if (e.code === "KeyJ" || e.key === "ArrowDown") {
          e.preventDefault();
          useTreeStore.getState().reorderNode(selectedNodeId, "down", currentContextId);
          return;
        }
        if (e.code === "KeyK" || e.key === "ArrowUp") {
          e.preventDefault();
          useTreeStore.getState().reorderNode(selectedNodeId, "up", currentContextId);
          return;
        }
        if (e.code === "KeyL" || e.key === "ArrowRight") {
          e.preventDefault();
          // Move into previous sibling as last child
          const parent = findParentInTree(tree, selectedNodeId);
          if (!parent) return;
          const siblings = parent.children;
          const idx = siblings.findIndex(s => s.node.id === selectedNodeId);
          if (idx <= 0) return; // no previous sibling
          const prevSibling = siblings[idx - 1];
          const lastPos = prevSibling.children.length > 0
            ? prevSibling.children[prevSibling.children.length - 1].node.position + 1
            : 0;
          useTreeStore.getState().dragMoveNode(selectedNodeId, prevSibling.node.id, lastPos, currentContextId);
          return;
        }
        if (e.code === "KeyH" || e.key === "ArrowLeft") {
          e.preventDefault();
          // Move up to grandparent (become sibling of parent)
          const parent = findParentInTree(tree, selectedNodeId);
          if (!parent || parent.node.id === tree.node.id) return; // parent is root, can't go higher
          const grandparent = findParentInTree(tree, parent.node.id);
          if (!grandparent) return;
          useTreeStore.getState().dragMoveNode(selectedNodeId, grandparent.node.id, parent.node.position + 1, currentContextId);
          return;
        }
      }


      // No node selected — any navigation key selects root
      if (!selectedNodeId) {
        const navKeys = new Set(["j","k","h","l","ArrowDown","ArrowUp","ArrowLeft","ArrowRight"]);
        if (navKeys.has(e.key)) {
          e.preventDefault();
          useTreeStore.getState().selectNode(tree.node.id);
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
          const layerDown = getNodesAtDepth(tree, depthDown, collapsedNodes);
          const idxDown = layerDown.findIndex(s => s.node.id === selectedNodeId);
          if (idxDown < layerDown.length - 1) {
            useTreeStore.getState().selectNode(layerDown[idxDown + 1].node.id);
          }
          break;
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const depthUp = getNodeDepth(tree, selectedNodeId);
          if (depthUp < 0) break;
          const layerUp = getNodesAtDepth(tree, depthUp, collapsedNodes);
          const idxUp = layerUp.findIndex(s => s.node.id === selectedNodeId);
          if (idxUp > 0) {
            useTreeStore.getState().selectNode(layerUp[idxUp - 1].node.id);
          }
          break;
        }
        case "l":
        case "ArrowRight": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const nodeR = findNodeInTree(tree, selectedNodeId);
          if (nodeR && nodeR.children.length > 0) {
            if (collapsedNodes.has(selectedNodeId)) {
              useUIStore.getState().toggleCollapse(selectedNodeId);
            } else {
              useTreeStore.getState().selectNode(nodeR.children[0].node.id);
            }
          }
          break;
        }
        case "z": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const nodeZ = findNodeInTree(tree, selectedNodeId);
          if (nodeZ && nodeZ.children.length > 0) {
            useUIStore.getState().toggleCollapse(selectedNodeId);
          }
          break;
        }
        case "h":
        case "ArrowLeft": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const parent = findParentInTree(tree, selectedNodeId);
          if (parent) useTreeStore.getState().selectNode(parent.node.id);
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (!selectedNodeId) break;
          if (compactLocked) { useUIStore.getState().flashCompactBanner(); break; }
          const selectedNode = findNodeInTree(tree, selectedNodeId);
          if (selectedNode && selectedNode.node.node_type === NodeTypes.MARKDOWN) {
            useUIStore.getState().openMarkdownEditor(selectedNodeId);
          } else {
            useUIStore.getState().setEditingNode(selectedNodeId);
          }
          break;
        }
        case "Tab": {
          e.preventDefault();
          if (!selectedNodeId) break;
          if (compactLocked) { useUIStore.getState().flashCompactBanner(); break; }
          if (e.shiftKey) {
            useTreeStore.getState().addSibling(selectedNodeId, currentContextId);
          } else {
            useTreeStore.getState().addChild(selectedNodeId, currentContextId);
          }
          break;
        }
        case "o": {
          e.preventDefault();
          if (!selectedNodeId) break;
          if (compactLocked) { useUIStore.getState().flashCompactBanner(); break; }
          useTreeStore.getState().openOrAttachFile(selectedNodeId);
          break;
        }
        case "t": {
          e.preventDefault();
          if (!selectedNodeId) break;
          if (compactLocked) { useUIStore.getState().flashCompactBanner(); break; }
          useUIStore.getState().openTypePopover(selectedNodeId);
          break;
        }
        case "Backspace":
        case "Delete": {
          if (!selectedNodeId || selectedNodeId === tree.node.id) break;
          if (compactLocked) { useUIStore.getState().flashCompactBanner(); break; }
          e.preventDefault();
          useTreeStore.getState().deleteNode(selectedNodeId, currentContextId);
          break;
        }
      }
    }

    function handlePaste(e: ClipboardEvent) {
      const ui = useUIStore.getState();
      if (ui.settingsOpen) return;
      if (ui.quickSwitcherOpen || ui.nodeSearchOpen || ui.editingNodeId || ui.typePopoverNodeId || ui.contentPanelFocused || ui.contextMenuNodeId) return;
      if (!tree || !currentContextId || !selectedNodeId) return;
      // Block paste on nodes outside compact subtree
      const { compactState: pCS, compactRootId: pCR } = useUIStore.getState();
      if (pCS === CompactStates.APPLIED && pCR) {
        const pRoot = findNodeInTree(tree, pCR);
        if (pRoot && !findNodeInTree(pRoot, selectedNodeId)) {
          useUIStore.getState().flashCompactBanner();
          return;
        }
      }
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
            useTreeStore.getState().pasteAsNode(selectedNodeId, currentContextId, { kind: PasteKind.IMAGE, blob, ext });
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
              if (text.startsWith("vedrr:node:")) {
                // Internal node copy → clone subtree
                const sourceId = text.replace("vedrr:node:", "");
                if (sourceId) {
                  useTreeStore.getState().pasteNodeUnder(selectedNodeId!, currentContextId!);
                }
              } else if (text.trim()) {
                useTreeStore.getState().pasteAsNode(selectedNodeId!, currentContextId!, { kind: PasteKind.TEXT, text });
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
  }, [tree, selectedNodeId, copiedNodeId, isCut, currentContextId, collapsedNodes]);
}
