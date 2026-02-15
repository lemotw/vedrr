import { invoke } from "@tauri-apps/api/core";
import type { Context, ContextSummary, TreeData, TreeNode } from "./types";

export const ipc = {
  createContext: (name: string, tags: string[] = []) =>
    invoke<Context>("create_context", { name, tags }),

  listContexts: () =>
    invoke<ContextSummary[]>("list_contexts"),

  switchContext: (id: string) =>
    invoke<void>("switch_context", { id }),

  archiveContext: (id: string) =>
    invoke<void>("archive_context", { id }),

  activateContext: (id: string) =>
    invoke<void>("activate_context", { id }),

  deleteContext: (id: string) =>
    invoke<void>("delete_context", { id }),

  getTree: (contextId: string) =>
    invoke<TreeData | null>("get_tree", { contextId }),

  createNode: (contextId: string, parentId: string, nodeType: string, title: string) =>
    invoke<TreeNode>("create_node", { contextId, parentId, nodeType, title }),

  updateNode: (id: string, updates: { title?: string; content?: string; nodeType?: string }) =>
    invoke<void>("update_node", { id, ...updates }),

  deleteNode: (id: string) =>
    invoke<void>("delete_node", { id }),

  moveNode: (id: string, newParentId: string, position: number) =>
    invoke<void>("move_node", { id, newParentId, position }),
};
