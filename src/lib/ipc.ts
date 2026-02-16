import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
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

  renameContext: (id: string, name: string) =>
    invoke<void>("rename_context", { id, name }),

  deleteContext: (id: string) =>
    invoke<void>("delete_context", { id }),

  getTree: (contextId: string) =>
    invoke<TreeData | null>("get_tree", { contextId }),

  createNode: (contextId: string, parentId: string, nodeType: string, title: string) =>
    invoke<TreeNode>("create_node", { contextId, parentId, nodeType, title }),

  updateNode: (id: string, updates: { title?: string; content?: string; nodeType?: string; filePath?: string }) =>
    invoke<void>("update_node", { id, ...updates }),

  readFileBytes: (filePath: string) =>
    invoke<number[]>("read_file_bytes", { filePath }),

  saveClipboardImage: (contextId: string, nodeId: string, data: number[], extension: string) =>
    invoke<string>("save_clipboard_image", { contextId, nodeId, data, extension }),

  deleteNode: (id: string) =>
    invoke<void>("delete_node", { id }),

  moveNode: (id: string, newParentId: string, position: number) =>
    invoke<void>("move_node", { id, newParentId, position }),

  revealFile: (filePath: string) =>
    revealItemInDir(filePath),

  pickFile: () =>
    openDialog({ multiple: false, directory: false }),
};
