import { create } from "zustand";
import type { TreeData, NodeType } from "../lib/types";
import { ipc } from "../lib/ipc";
import { useUIStore } from "./uiStore";

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
}

function patchNode(tree: TreeData, nodeId: string, patch: Partial<TreeData["node"]>): TreeData {
  if (tree.node.id === nodeId) {
    return { ...tree, node: { ...tree.node, ...patch } };
  }
  return { ...tree, children: tree.children.map(c => patchNode(c, nodeId, patch)) };
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

  selectNode: (id) => set({ selectedNodeId: id }),

  addChild: async (parentId, contextId) => {
    const node = await ipc.createNode(contextId, parentId, "text", "");
    await get().loadTree(contextId);
    set({ selectedNodeId: node.id });
    useUIStore.getState().setEditingNode(node.id);
  },

  addSibling: async (nodeId, contextId) => {
    const { tree } = get();
    if (!tree) return;
    const parent = findParent(tree, nodeId);
    if (!parent) return;
    const node = await ipc.createNode(contextId, parent.node.id, "text", "");
    await get().loadTree(contextId);
    set({ selectedNodeId: node.id });
    useUIStore.getState().setEditingNode(node.id);
  },

  deleteNode: async (nodeId, contextId) => {
    const { tree } = get();
    if (!tree || tree.node.id === nodeId) return;
    await ipc.deleteNode(nodeId);
    await get().loadTree(contextId);
    set({ selectedNodeId: null });
  },

  updateNodeTitle: async (nodeId, title) => {
    await ipc.updateNode(nodeId, { title });
    const { tree } = get();
    if (tree) {
      set({ tree: patchNode(tree, nodeId, { title }) });
    }
  },

  updateNodeType: async (nodeId, nodeType) => {
    await ipc.updateNode(nodeId, { nodeType });
    const { tree } = get();
    if (tree) {
      set({ tree: patchNode(tree, nodeId, { node_type: nodeType }) });
    }
  },
}));
