import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Context, ContextSummary, TreeData, TreeNode } from "./types";
import { IpcCmd } from "./constants";

export const ipc = {
  createContext: (name: string, tags: string[] = []) =>
    invoke<Context>(IpcCmd.CREATE_CONTEXT, { name, tags }),

  listContexts: () =>
    invoke<ContextSummary[]>(IpcCmd.LIST_CONTEXTS),

  switchContext: (id: string) =>
    invoke<void>(IpcCmd.SWITCH_CONTEXT, { id }),

  archiveContext: (id: string) =>
    invoke<void>(IpcCmd.ARCHIVE_CONTEXT, { id }),

  activateContext: (id: string) =>
    invoke<void>(IpcCmd.ACTIVATE_CONTEXT, { id }),

  renameContext: (id: string, name: string) =>
    invoke<void>(IpcCmd.RENAME_CONTEXT, { id, name }),

  deleteContext: (id: string) =>
    invoke<void>(IpcCmd.DELETE_CONTEXT, { id }),

  getTree: (contextId: string) =>
    invoke<TreeData | null>(IpcCmd.GET_TREE, { contextId }),

  createNode: (contextId: string, parentId: string, nodeType: string, title: string) =>
    invoke<TreeNode>(IpcCmd.CREATE_NODE, { contextId, parentId, nodeType, title }),

  updateNode: (id: string, updates: { title?: string; content?: string; nodeType?: string; filePath?: string }) =>
    invoke<void>(IpcCmd.UPDATE_NODE, { id, ...updates }),

  readFileBytes: (filePath: string) =>
    invoke<number[]>(IpcCmd.READ_FILE_BYTES, { filePath }),

  saveClipboardImage: (contextId: string, nodeId: string, data: number[], extension: string) =>
    invoke<string>(IpcCmd.SAVE_CLIPBOARD_IMAGE, { contextId, nodeId, data, extension }),

  importImage: (contextId: string, nodeId: string, sourcePath: string) =>
    invoke<string>(IpcCmd.IMPORT_IMAGE, { contextId, nodeId, sourcePath }),

  deleteNode: (id: string) =>
    invoke<void>(IpcCmd.DELETE_NODE, { id }),

  moveNode: (id: string, newParentId: string, position: number) =>
    invoke<void>(IpcCmd.MOVE_NODE, { id, newParentId, position }),

  revealFile: (filePath: string) =>
    revealItemInDir(filePath),

  pickFile: () =>
    openDialog({ multiple: false, directory: false }),

  cloneSubtree: (sourceId: string, targetParentId: string, contextId: string) =>
    invoke<string>(IpcCmd.CLONE_SUBTREE, { sourceId, targetParentId, contextId }),

  restoreNodes: (nodes: TreeNode[]) =>
    invoke<void>(IpcCmd.RESTORE_NODES, { nodes }),

  pickImage: () =>
    openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    }),
};
