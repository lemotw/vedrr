import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Context, ContextSummary, TreeData, TreeNode, CompactResult, AiProfile } from "./types";
import { IpcCmd } from "./constants";

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[ipc] ${cmd} failed:`, err);
    throw err;
  }
}

export const ipc = {
  createContext: (name: string, tags: string[] = []) =>
    safeInvoke<Context>(IpcCmd.CREATE_CONTEXT, { name, tags }),

  listContexts: () =>
    safeInvoke<ContextSummary[]>(IpcCmd.LIST_CONTEXTS),

  switchContext: (id: string) =>
    safeInvoke<void>(IpcCmd.SWITCH_CONTEXT, { id }),

  archiveContext: (id: string) =>
    safeInvoke<void>(IpcCmd.ARCHIVE_CONTEXT, { id }),

  activateContext: (id: string) =>
    safeInvoke<void>(IpcCmd.ACTIVATE_CONTEXT, { id }),

  renameContext: (id: string, name: string) =>
    safeInvoke<void>(IpcCmd.RENAME_CONTEXT, { id, name }),

  deleteContext: (id: string) =>
    safeInvoke<void>(IpcCmd.DELETE_CONTEXT, { id }),

  getTree: (contextId: string) =>
    safeInvoke<TreeData | null>(IpcCmd.GET_TREE, { contextId }),

  createNode: (contextId: string, parentId: string, nodeType: string, title: string) =>
    safeInvoke<TreeNode>(IpcCmd.CREATE_NODE, { contextId, parentId, nodeType, title }),

  updateNode: (id: string, updates: { title?: string; content?: string; nodeType?: string; filePath?: string }) =>
    safeInvoke<void>(IpcCmd.UPDATE_NODE, { id, ...updates }),

  readFileBytes: (filePath: string) =>
    safeInvoke<number[]>(IpcCmd.READ_FILE_BYTES, { filePath }),

  saveClipboardImage: (contextId: string, nodeId: string, data: number[], extension: string) =>
    safeInvoke<string>(IpcCmd.SAVE_CLIPBOARD_IMAGE, { contextId, nodeId, data, extension }),

  importImage: (contextId: string, nodeId: string, sourcePath: string) =>
    safeInvoke<string>(IpcCmd.IMPORT_IMAGE, { contextId, nodeId, sourcePath }),

  deleteNode: (id: string) =>
    safeInvoke<void>(IpcCmd.DELETE_NODE, { id }),

  moveNode: (id: string, newParentId: string, position: number) =>
    safeInvoke<void>(IpcCmd.MOVE_NODE, { id, newParentId, position }),

  revealFile: (filePath: string) =>
    revealItemInDir(filePath),

  pickFile: () =>
    openDialog({ multiple: false, directory: false }),

  cloneSubtree: (sourceId: string, targetParentId: string, contextId: string) =>
    safeInvoke<string>(IpcCmd.CLONE_SUBTREE, { sourceId, targetParentId, contextId }),

  restoreNodes: (nodes: TreeNode[]) =>
    safeInvoke<void>(IpcCmd.RESTORE_NODES, { nodes }),

  pickImage: () =>
    openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    }),

  listAiProfiles: () =>
    safeInvoke<AiProfile[]>(IpcCmd.LIST_AI_PROFILES),

  createAiProfile: (name: string, provider: string, model: string, apiKey: string) =>
    safeInvoke<AiProfile>(IpcCmd.CREATE_AI_PROFILE, { name, provider, model, apiKey }),

  deleteAiProfile: (id: string) =>
    safeInvoke<void>(IpcCmd.DELETE_AI_PROFILE, { id }),

  compactNode: (nodeId: string, profileId: string) =>
    safeInvoke<CompactResult>(IpcCmd.COMPACT_NODE, { nodeId, profileId }),
};
