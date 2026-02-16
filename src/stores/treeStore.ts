import { create } from "zustand";
import type { TreeData, TreeNode, NodeType } from "../lib/types";
import { ask } from "@tauri-apps/plugin-dialog";
import { ipc } from "../lib/ipc";
import { NodeTypes, PasteKind } from "../lib/constants";
import { useUIStore } from "./uiStore";
import { useContextStore } from "./contextStore";

// ── Undo types ─────────────────────────────────────────────
const MAX_UNDO = 50;

type UndoEntry =
  | { type: "add"; nodeId: string; contextId: string; prevSelectedId: string | null }
  | { type: "delete"; nodes: TreeNode[]; contextId: string; prevSelectedId: string | null }
  | { type: "title"; nodeId: string; old: string }
  | { type: "type"; nodeId: string; old: NodeType }
  | { type: "content"; nodeId: string; old: string | null }
  | { type: "reorder"; contextId: string; nodeId: string; parentId: string; oldPosition: number };

// ── Helpers ────────────────────────────────────────────────
function flattenNodes(td: TreeData): TreeNode[] {
  const result: TreeNode[] = [td.node];
  for (const child of td.children) {
    result.push(...flattenNodes(child));
  }
  return result;
}

interface TreeStore {
  tree: TreeData | null;
  selectedNodeId: string | null;
  copiedNodeId: string | null;
  isCut: boolean;
  undoStack: UndoEntry[];

  loadTree: (contextId: string) => Promise<void>;
  selectNode: (id: string | null) => void;
  copyNode: (nodeId: string | null) => void;
  cutNode: (nodeId: string) => void;
  pasteNodeUnder: (targetParentId: string, contextId: string) => Promise<void>;
  addChild: (parentId: string, contextId: string) => Promise<void>;
  addSibling: (nodeId: string, contextId: string) => Promise<void>;
  deleteNode: (nodeId: string, contextId: string) => Promise<void>;
  updateNodeTitle: (nodeId: string, title: string) => Promise<void>;
  updateNodeType: (nodeId: string, nodeType: NodeType) => Promise<void>;
  updateNodeContent: (nodeId: string, content: string) => Promise<void>;
  pasteAsNode: (parentId: string, contextId: string, data: { kind: typeof PasteKind.IMAGE; blob: File; ext: string } | { kind: typeof PasteKind.TEXT; text: string }) => Promise<void>;
  openOrAttachFile: (nodeId: string) => Promise<void>;
  pickAndImportImage: (nodeId: string) => Promise<void>;
  reorderNode: (nodeId: string, direction: "up" | "down", contextId: string) => Promise<void>;
  undo: () => Promise<void>;
  clearUndo: () => void;
}

function patchNode(tree: TreeData, nodeId: string, patch: Partial<TreeData["node"]>): TreeData {
  if (tree.node.id === nodeId) {
    return { ...tree, node: { ...tree.node, ...patch } };
  }
  return { ...tree, children: tree.children.map(c => patchNode(c, nodeId, patch)) };
}

function findNode(tree: TreeData, id: string): TreeData | null {
  if (tree.node.id === id) return tree;
  for (const child of tree.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function findParent(tree: TreeData, targetId: string): TreeData | null {
  for (const child of tree.children) {
    if (child.node.id === targetId) return tree;
    const found = findParent(child, targetId);
    if (found) return found;
  }
  return null;
}

function pushUndo(stack: UndoEntry[], entry: UndoEntry): UndoEntry[] {
  const next = [...stack, entry];
  return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
}

function clearCut(get: () => TreeStore, set: (s: Partial<TreeStore>) => void) {
  if (get().isCut) set({ copiedNodeId: null, isCut: false });
}

export const useTreeStore = create<TreeStore>((set, get) => ({
  tree: null,
  selectedNodeId: null,
  copiedNodeId: null,
  isCut: false,
  undoStack: [],

  loadTree: async (contextId: string) => {
    const tree = await ipc.getTree(contextId);
    const { selectedNodeId } = get();
    // Auto-select root if nothing selected
    const autoSelect = !selectedNodeId && tree ? tree.node.id : selectedNodeId;
    set({ tree, selectedNodeId: autoSelect });
  },

  selectNode: (id) => {
    set({ selectedNodeId: id });
    const { markdownEditorNodeId, closeMarkdownEditor } = useUIStore.getState();
    if (markdownEditorNodeId && markdownEditorNodeId !== id) closeMarkdownEditor();
  },

  copyNode: (nodeId: string | null) => {
    set({ copiedNodeId: nodeId, isCut: false });
  },

  cutNode: (nodeId: string) => {
    set({ copiedNodeId: nodeId, isCut: true });
  },

  pasteNodeUnder: async (targetParentId, contextId) => {
    const { copiedNodeId, isCut, tree, selectedNodeId, undoStack } = get();
    if (!copiedNodeId) return;
    const newId = await ipc.cloneSubtree(copiedNodeId, targetParentId, contextId);
    let newStack = pushUndo(undoStack, { type: "add", nodeId: newId, contextId, prevSelectedId: selectedNodeId });
    if (isCut && tree) {
      const target = findNode(tree, copiedNodeId);
      if (target) {
        const nodes = flattenNodes(target);
        newStack = pushUndo(newStack, { type: "delete", nodes, contextId, prevSelectedId: selectedNodeId });
      }
      await ipc.deleteNode(copiedNodeId);
      set({ copiedNodeId: null, isCut: false });
    }
    set({ undoStack: newStack });
    await get().loadTree(contextId);
    set({ selectedNodeId: newId });
  },

  addChild: async (parentId, contextId) => {
    clearCut(get, set);
    const { selectedNodeId, undoStack } = get();
    const node = await ipc.createNode(contextId, parentId, NodeTypes.TEXT, "");
    set({ undoStack: pushUndo(undoStack, { type: "add", nodeId: node.id, contextId, prevSelectedId: selectedNodeId }) });
    await get().loadTree(contextId);
    set({ selectedNodeId: node.id });
    useUIStore.getState().setEditingNode(node.id);
  },

  addSibling: async (nodeId, contextId) => {
    clearCut(get, set);
    const { tree, selectedNodeId, undoStack } = get();
    if (!tree) return;
    const parent = findParent(tree, nodeId);
    if (!parent) return;
    const node = await ipc.createNode(contextId, parent.node.id, NodeTypes.TEXT, "");
    set({ undoStack: pushUndo(undoStack, { type: "add", nodeId: node.id, contextId, prevSelectedId: selectedNodeId }) });
    await get().loadTree(contextId);
    set({ selectedNodeId: node.id });
    useUIStore.getState().setEditingNode(node.id);
  },

  deleteNode: async (nodeId, contextId) => {
    clearCut(get, set);
    const { tree, selectedNodeId, undoStack } = get();
    if (!tree || tree.node.id === nodeId) return;
    const target = findNode(tree, nodeId);
    if (!target) return;
    if (target.children.length > 0) {
      const confirmed = await ask(
        `「${target.node.title || "Untitled"}」有 ${target.children.length} 個子節點，確定要刪除？`,
        { title: "刪除確認", kind: "info" },
      );
      if (!confirmed) return;
    }
    // Snapshot subtree before delete
    const nodes = flattenNodes(target);
    set({ undoStack: pushUndo(undoStack, { type: "delete", nodes, contextId, prevSelectedId: selectedNodeId }) });
    await ipc.deleteNode(nodeId);
    await get().loadTree(contextId);
    set({ selectedNodeId: null });
  },

  updateNodeTitle: async (nodeId, title) => {
    clearCut(get, set);
    const { tree, undoStack } = get();
    if (!tree) return;
    const target = findNode(tree, nodeId);
    if (target) {
      set({ undoStack: pushUndo(undoStack, { type: "title", nodeId, old: target.node.title }) });
    }
    await ipc.updateNode(nodeId, { title });
    if (tree) {
      set({ tree: patchNode(get().tree!, nodeId, { title }) });
      if (tree.node.id === nodeId) {
        useContextStore.getState().loadContexts();
      }
    }
  },

  updateNodeContent: async (nodeId, content) => {
    clearCut(get, set);
    const { tree, undoStack } = get();
    if (!tree) return;
    const target = findNode(tree, nodeId);
    if (target) {
      set({ undoStack: pushUndo(undoStack, { type: "content", nodeId, old: target.node.content }) });
    }
    await ipc.updateNode(nodeId, { content });
    set({ tree: patchNode(get().tree!, nodeId, { content }) });
  },

  updateNodeType: async (nodeId, nodeType) => {
    clearCut(get, set);
    const { tree, undoStack } = get();
    if (!tree) return;
    const target = findNode(tree, nodeId);
    if (target) {
      set({ undoStack: pushUndo(undoStack, { type: "type", nodeId, old: target.node.node_type }) });
    }
    await ipc.updateNode(nodeId, { nodeType });
    set({ tree: patchNode(get().tree!, nodeId, { node_type: nodeType }) });
  },

  pasteAsNode: async (parentId, contextId, data) => {
    clearCut(get, set);
    const { selectedNodeId, undoStack } = get();
    if (data.kind === PasteKind.IMAGE) {
      const node = await ipc.createNode(contextId, parentId, NodeTypes.IMAGE, `Image ${new Date().toLocaleTimeString()}`);
      const buffer = await data.blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      const savedPath = await ipc.saveClipboardImage(contextId, node.id, bytes, data.ext);
      await ipc.updateNode(node.id, { filePath: savedPath });
      set({ undoStack: pushUndo(undoStack, { type: "add", nodeId: node.id, contextId, prevSelectedId: selectedNodeId }) });
      await get().loadTree(contextId);
      set({ selectedNodeId: node.id });
    } else {
      const title = data.text.trim().split("\n")[0].slice(0, 200);
      if (!title) return;
      const node = await ipc.createNode(contextId, parentId, NodeTypes.TEXT, title);
      if (data.text.trim().length > title.length) {
        await ipc.updateNode(node.id, { content: data.text.trim() });
      }
      set({ undoStack: pushUndo(undoStack, { type: "add", nodeId: node.id, contextId, prevSelectedId: selectedNodeId }) });
      await get().loadTree(contextId);
      set({ selectedNodeId: node.id });
      useUIStore.getState().setEditingNode(node.id);
    }
  },

  openOrAttachFile: async (nodeId) => {
    const { tree } = get();
    if (!tree) return;
    const target = findNode(tree, nodeId);
    if (!target) return;
    const { node } = target;
    const type = node.node_type;
    if (type !== NodeTypes.FILE && type !== NodeTypes.MARKDOWN) return;

    if (node.file_path) {
      await ipc.revealFile(node.file_path);
    } else {
      const filePath = await ipc.pickFile();
      if (!filePath) return;
      await ipc.updateNode(nodeId, { filePath });
      const fileName = filePath.split("/").pop() || filePath;
      if (!node.title || node.title === "Untitled") {
        await ipc.updateNode(nodeId, { title: fileName });
      }
      set({ tree: patchNode(tree, nodeId, { file_path: filePath, title: node.title || fileName }) });
    }
  },

  pickAndImportImage: async (nodeId) => {
    const { tree } = get();
    if (!tree) return;
    const target = findNode(tree, nodeId);
    if (!target || target.node.node_type !== NodeTypes.IMAGE) return;

    const filePath = await ipc.pickImage();
    if (!filePath) return;

    const contextId = target.node.context_id;
    const savedPath = await ipc.importImage(contextId, nodeId, filePath);
    await ipc.updateNode(nodeId, { filePath: savedPath });

    const fileName = filePath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Image";
    if (!target.node.title || target.node.title.startsWith("Image ")) {
      await ipc.updateNode(nodeId, { title: fileName });
      set({ tree: patchNode(get().tree!, nodeId, { file_path: savedPath, title: fileName }) });
    } else {
      set({ tree: patchNode(get().tree!, nodeId, { file_path: savedPath }) });
    }
  },

  reorderNode: async (nodeId, direction, contextId) => {
    clearCut(get, set);
    const { tree, undoStack } = get();
    if (!tree) return;
    const parent = findParent(tree, nodeId);
    if (!parent) return;
    const target = findNode(tree, nodeId);
    if (!target) return;
    const siblings = parent.children;
    const idx = siblings.findIndex(s => s.node.id === nodeId);
    if (idx < 0) return;
    if (direction === "up" && idx > 0) {
      set({ undoStack: pushUndo(undoStack, { type: "reorder", contextId, nodeId, parentId: parent.node.id, oldPosition: target.node.position }) });
      await ipc.moveNode(nodeId, parent.node.id, siblings[idx - 1].node.position);
    } else if (direction === "down" && idx < siblings.length - 1) {
      set({ undoStack: pushUndo(undoStack, { type: "reorder", contextId, nodeId, parentId: parent.node.id, oldPosition: target.node.position }) });
      await ipc.moveNode(nodeId, parent.node.id, siblings[idx + 1].node.position + 1);
    } else {
      return;
    }
    await get().loadTree(contextId);
  },

  undo: async () => {
    clearCut(get, set);
    const { undoStack } = get();
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    set({ undoStack: undoStack.slice(0, -1) });

    switch (entry.type) {
      case "add": {
        await ipc.deleteNode(entry.nodeId);
        await get().loadTree(entry.contextId);
        set({ selectedNodeId: entry.prevSelectedId });
        break;
      }
      case "delete": {
        await ipc.restoreNodes(entry.nodes);
        await get().loadTree(entry.contextId);
        set({ selectedNodeId: entry.prevSelectedId });
        break;
      }
      case "title": {
        await ipc.updateNode(entry.nodeId, { title: entry.old });
        const tree = get().tree;
        if (tree) {
          set({ tree: patchNode(tree, entry.nodeId, { title: entry.old }) });
          if (tree.node.id === entry.nodeId) {
            useContextStore.getState().loadContexts();
          }
        }
        break;
      }
      case "type": {
        await ipc.updateNode(entry.nodeId, { nodeType: entry.old });
        const tree2 = get().tree;
        if (tree2) set({ tree: patchNode(tree2, entry.nodeId, { node_type: entry.old }) });
        break;
      }
      case "content": {
        await ipc.updateNode(entry.nodeId, { content: entry.old ?? "" });
        const tree3 = get().tree;
        if (tree3) set({ tree: patchNode(tree3, entry.nodeId, { content: entry.old }) });
        break;
      }
      case "reorder": {
        await ipc.moveNode(entry.nodeId, entry.parentId, entry.oldPosition);
        await get().loadTree(entry.contextId);
        break;
      }
    }
  },

  clearUndo: () => {
    set({ undoStack: [] });
  },
}));
