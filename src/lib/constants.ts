import type { NodeType, ContextState } from "./types";

// ── Node Types ──────────────────────────────────────────────
export const NodeTypes = {
  TEXT: "text" as const,
  MARKDOWN: "markdown" as const,
  IMAGE: "image" as const,
  FILE: "file" as const,
} satisfies Record<string, NodeType>;

export const NODE_TYPE_LIST: NodeType[] = [NodeTypes.TEXT, NodeTypes.MARKDOWN, NodeTypes.IMAGE, NodeTypes.FILE];

// ── Context States ──────────────────────────────────────────
export const ContextStates = {
  ACTIVE: "active" as const,
  ARCHIVED: "archived" as const,
  VAULT: "vault" as const,
} satisfies Record<string, ContextState>;

// ── IPC Commands (Tauri invoke names) ───────────────────────
export const IpcCmd = {
  CREATE_CONTEXT: "create_context",
  LIST_CONTEXTS: "list_contexts",
  SWITCH_CONTEXT: "switch_context",
  ARCHIVE_CONTEXT: "archive_context",
  ACTIVATE_CONTEXT: "activate_context",
  RENAME_CONTEXT: "rename_context",
  DELETE_CONTEXT: "delete_context",
  GET_TREE: "get_tree",
  CREATE_NODE: "create_node",
  UPDATE_NODE: "update_node",
  DELETE_NODE: "delete_node",
  MOVE_NODE: "move_node",
  READ_FILE_BYTES: "read_file_bytes",
  SAVE_CLIPBOARD_IMAGE: "save_clipboard_image",
  IMPORT_IMAGE: "import_image",
  CLONE_SUBTREE: "clone_subtree",
  RESTORE_NODES: "restore_nodes",
} as const;

// ── Paste Data Kinds ────────────────────────────────────────
export const PasteKind = {
  IMAGE: "image" as const,
  TEXT: "text" as const,
};

// ── MIME Types (image) ──────────────────────────────────────
const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  png: "image/png",
};

export function imageMime(ext: string): string {
  return MIME_MAP[ext] ?? MIME_MAP.png;
}
