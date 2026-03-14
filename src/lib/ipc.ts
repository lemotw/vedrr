import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Context, ContextSummary, TreeData, TreeNode, CompactResult, AiProfile, ApiKey, ModelInfo, SearchResult, ModelStatus, VaultEntry, InboxItem, InboxSuggestion } from "./types";
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

  vaultContext: (id: string) =>
    safeInvoke<void>(IpcCmd.VAULT_CONTEXT, { id }),

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

  writeFileBytes: (filePath: string, data: number[]) =>
    safeInvoke<void>(IpcCmd.WRITE_FILE_BYTES, { filePath, data }),

  readFileBytes: (filePath: string) =>
    safeInvoke<number[]>(IpcCmd.READ_FILE_BYTES, { filePath }),

  saveClipboardImage: (contextId: string, nodeId: string, data: number[], extension: string) =>
    safeInvoke<string>(IpcCmd.SAVE_CLIPBOARD_IMAGE, { contextId, nodeId, data, extension }),

  importImage: (contextId: string, nodeId: string, sourcePath: string) =>
    safeInvoke<string>(IpcCmd.IMPORT_IMAGE, { contextId, nodeId, sourcePath }),

  saveMarkdownFile: (contextId: string, nodeId: string, content: string) =>
    safeInvoke<string>(IpcCmd.SAVE_MARKDOWN_FILE, { contextId, nodeId, content }),

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

  createAiProfile: (name: string, apiKeyId: string, model: string) =>
    safeInvoke<AiProfile>(IpcCmd.CREATE_AI_PROFILE, { name, apiKeyId, model }),

  deleteAiProfile: (id: string) =>
    safeInvoke<void>(IpcCmd.DELETE_AI_PROFILE, { id }),

  compactNode: (nodeId: string, profileId: string) =>
    safeInvoke<CompactResult>(IpcCmd.COMPACT_NODE, { nodeId, profileId }),

  createApiKey: (name: string, provider: string, apiKey: string) =>
    safeInvoke<ApiKey>(IpcCmd.CREATE_API_KEY, { name, provider, apiKey }),

  listApiKeys: () =>
    safeInvoke<ApiKey[]>(IpcCmd.LIST_API_KEYS),

  deleteApiKey: (id: string) =>
    safeInvoke<void>(IpcCmd.DELETE_API_KEY, { id }),

  getSystemPrompt: () =>
    safeInvoke<string>(IpcCmd.GET_SYSTEM_PROMPT),

  setSystemPrompt: (prompt: string) =>
    safeInvoke<void>(IpcCmd.SET_SYSTEM_PROMPT, { prompt }),

  listModels: (apiKeyId: string) =>
    safeInvoke<ModelInfo[]>(IpcCmd.LIST_MODELS, { apiKeyId }),

  semanticSearch: (query: string, topK: number = 10, alpha: number = 0.7, minScore: number = 0.1) =>
    safeInvoke<SearchResult[]>(IpcCmd.SEMANTIC_SEARCH, { query, topK, alpha, minScore }),

  textSearch: (query: string, topK: number = 10) =>
    safeInvoke<SearchResult[]>(IpcCmd.TEXT_SEARCH, { query, topK }),

  embedContextNodes: (contextId: string, force: boolean = false) =>
    safeInvoke<number>(IpcCmd.EMBED_CONTEXT_NODES, { contextId, force }),

  embedSingleNode: (nodeId: string) =>
    safeInvoke<void>(IpcCmd.EMBED_SINGLE_NODE, { nodeId }),

  getModelStatus: () =>
    safeInvoke<ModelStatus>(IpcCmd.GET_MODEL_STATUS),

  ensureEmbeddingModel: () =>
    safeInvoke<void>(IpcCmd.ENSURE_EMBEDDING_MODEL),

  enableSemanticSearch: () =>
    safeInvoke<void>(IpcCmd.ENABLE_SEMANTIC_SEARCH),

  listVault: () =>
    safeInvoke<VaultEntry[]>(IpcCmd.LIST_VAULT),

  restoreFromVault: (id: string) =>
    safeInvoke<void>(IpcCmd.RESTORE_FROM_VAULT, { id }),

  autoVaultArchived: () =>
    safeInvoke<string[]>(IpcCmd.AUTO_VAULT_ARCHIVED),

  deleteVaultEntry: (id: string) =>
    safeInvoke<void>(IpcCmd.DELETE_VAULT_ENTRY, { id }),

  importVaultZip: (zipPath: string) =>
    safeInvoke<string>(IpcCmd.IMPORT_VAULT_ZIP, { zipPath }),

  exportContextZip: (id: string, destination: string) =>
    safeInvoke<void>(IpcCmd.EXPORT_CONTEXT_ZIP, { id, destination }),

  createInboxItem: (content: string) =>
    safeInvoke<InboxItem>(IpcCmd.CREATE_INBOX_ITEM, { content }),

  listInboxItems: () =>
    safeInvoke<InboxItem[]>(IpcCmd.LIST_INBOX_ITEMS),

  deleteInboxItem: (id: string) =>
    safeInvoke<void>(IpcCmd.DELETE_INBOX_ITEM, { id }),

  findSimilarNodesForInbox: (inboxItemId: string, topK: number = 8, alpha: number = 0.7) =>
    safeInvoke<InboxSuggestion[]>(IpcCmd.FIND_SIMILAR_NODES_FOR_INBOX, { inboxItemId, topK, alpha }),

  matchInboxToNode: (inboxItemId: string, targetNodeId: string) =>
    safeInvoke<void>(IpcCmd.MATCH_INBOX_TO_NODE, { inboxItemId, targetNodeId }),

  matchInboxToContext: (inboxItemId: string, contextId: string) =>
    safeInvoke<void>(IpcCmd.MATCH_INBOX_TO_CONTEXT, { inboxItemId, contextId }),

  getSetting: (key: string) =>
    safeInvoke<string | null>(IpcCmd.GET_SETTING, { key }),

  setSetting: (key: string, value: string) =>
    safeInvoke<void>(IpcCmd.SET_SETTING, { key, value }),

  updateShortcut: (shortcut: string) =>
    safeInvoke<void>(IpcCmd.UPDATE_SHORTCUT, { shortcut }),
};
