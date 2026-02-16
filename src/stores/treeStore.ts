import { create } from "zustand";
import type { TreeData, NodeType } from "../lib/types";
import { ask } from "@tauri-apps/plugin-dialog";
import { ipc } from "../lib/ipc";
import { NodeTypes, PasteKind } from "../lib/constants";
import { useUIStore } from "./uiStore";
import { useContextStore } from "./contextStore";

interface TreeStore {
  tree: TreeData | null;
  selectedNodeId: string | null;

  loadTree: (contextId: string) => Promise<void>;
  selectNode: (id: string | null) => void;
  addChild: (parentId: string, contextId: string) => Promise<void>;
  addSibling: (nodeId: string, contextId: string) => Promise<void>;
  deleteNode: (nodeId: string, contextId: string) => Promise<void>;
  updateNodeTitle: (nodeId: string, title: string) => Promise<void>;
  updateNodeType: (nodeId: string, nodeType: NodeType) => Promise<void>;
  updateNodeContent: (nodeId: string, content: string) => Promise<void>;
  pasteAsNode: (parentId: string, contextId: string, data: { kind: typeof PasteKind.IMAGE; blob: File; ext: string } | { kind: typeof PasteKind.TEXT; text: string }) => Promise<void>;
  openOrAttachFile: (nodeId: string) => Promise<void>;
  pickAndImportImage: (nodeId: string) => Promise<void>;
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

export const useTreeStore = create<TreeStore>((set, get) => ({
  tree: null,
  selectedNodeId: null,

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

  addChild: async (parentId, contextId) => {
    const node = await ipc.createNode(contextId, parentId, NodeTypes.TEXT, "");
    await get().loadTree(contextId);
    set({ selectedNodeId: node.id });
    useUIStore.getState().setEditingNode(node.id);
  },

  addSibling: async (nodeId, contextId) => {
    const { tree } = get();
    if (!tree) return;
    const parent = findParent(tree, nodeId);
    if (!parent) return;
    const node = await ipc.createNode(contextId, parent.node.id, NodeTypes.TEXT, "");
    await get().loadTree(contextId);
    set({ selectedNodeId: node.id });
    useUIStore.getState().setEditingNode(node.id);
  },

  deleteNode: async (nodeId, contextId) => {
    const { tree } = get();
    if (!tree || tree.node.id === nodeId) return;
    const target = findNode(tree, nodeId);
    if (target && target.children.length > 0) {
      const confirmed = await ask(
        `「${target.node.title || "Untitled"}」有 ${target.children.length} 個子節點，確定要刪除？`,
        { title: "刪除確認", kind: "info" },
      );
      if (!confirmed) return;
    }
    await ipc.deleteNode(nodeId);
    await get().loadTree(contextId);
    set({ selectedNodeId: null });
  },

  updateNodeTitle: async (nodeId, title) => {
    await ipc.updateNode(nodeId, { title });
    const { tree } = get();
    if (tree) {
      set({ tree: patchNode(tree, nodeId, { title }) });
      // If editing root node, sync context name
      if (tree.node.id === nodeId) {
        useContextStore.getState().loadContexts();
      }
    }
  },

  updateNodeContent: async (nodeId, content) => {
    await ipc.updateNode(nodeId, { content });
    const { tree } = get();
    if (tree) {
      set({ tree: patchNode(tree, nodeId, { content }) });
    }
  },

  updateNodeType: async (nodeId, nodeType) => {
    await ipc.updateNode(nodeId, { nodeType });
    const { tree } = get();
    if (tree) {
      set({ tree: patchNode(tree, nodeId, { node_type: nodeType }) });
    }
  },

  pasteAsNode: async (parentId, contextId, data) => {
    if (data.kind === PasteKind.IMAGE) {
      const node = await ipc.createNode(contextId, parentId, NodeTypes.IMAGE, `Image ${new Date().toLocaleTimeString()}`);
      const buffer = await data.blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      const savedPath = await ipc.saveClipboardImage(contextId, node.id, bytes, data.ext);
      await ipc.updateNode(node.id, { filePath: savedPath });
      await get().loadTree(contextId);
      set({ selectedNodeId: node.id });
    } else {
      const title = data.text.trim().split("\n")[0].slice(0, 200);
      if (!title) return;
      const node = await ipc.createNode(contextId, parentId, NodeTypes.TEXT, title);
      if (data.text.trim().length > title.length) {
        await ipc.updateNode(node.id, { content: data.text.trim() });
      }
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
      // Reveal in Finder
      await ipc.revealFile(node.file_path);
    } else {
      // Open file picker
      const filePath = await ipc.pickFile();
      if (!filePath) return;
      await ipc.updateNode(nodeId, { filePath });
      // Update title to filename if title is empty or generic
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
}));
