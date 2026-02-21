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
  LIST_AI_PROFILES: "list_ai_profiles",
  CREATE_AI_PROFILE: "create_ai_profile",
  DELETE_AI_PROFILE: "delete_ai_profile",
  COMPACT_NODE: "compact_node",
} as const;

// ── Themes ─────────────────────────────────────────────────
export const Themes = {
  OBSIDIAN: "obsidian",
  MIDNIGHT: "midnight",
  FOREST: "forest",
  AMETHYST: "amethyst",
  MOCHA: "mocha",
  SLATE: "slate",
  PAPER: "paper",
  DAYLIGHT: "daylight",
  CUSTOM: "custom",
} as const;

export type ThemeId = (typeof Themes)[keyof typeof Themes];

export const THEME_META: Record<ThemeId, { name: string; accent: string }> = {
  obsidian:  { name: "Obsidian",  accent: "#FF6B35" },
  midnight:  { name: "Midnight",  accent: "#4FC3F7" },
  forest:    { name: "Forest",    accent: "#4ADE80" },
  amethyst:  { name: "Amethyst",  accent: "#A78BFA" },
  mocha:     { name: "Mocha",     accent: "#F0A050" },
  slate:     { name: "Slate",     accent: "#00D4AA" },
  paper:     { name: "Paper",     accent: "#D4634B" },
  daylight:  { name: "Daylight",  accent: "#2563EB" },
  custom:    { name: "Custom",    accent: "#888888" },
};

export interface CustomThemeColors {
  bgPage: string;
  bgCard: string;
  bgElevated: string;
  accentPrimary: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
}

export const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
  bgPage: "#1A1A1A",
  bgCard: "#212121",
  bgElevated: "#2D2D2D",
  accentPrimary: "#FF6B35",
  textPrimary: "#FFFFFF",
  textSecondary: "#777777",
  border: "#3D3D3D",
};

// Map CustomThemeColors keys to CSS variable names
export const CUSTOM_COLOR_CSS_MAP: Record<keyof CustomThemeColors, string> = {
  bgPage: "--color-bg-page",
  bgCard: "--color-bg-card",
  bgElevated: "--color-bg-elevated",
  accentPrimary: "--color-accent-primary",
  textPrimary: "--color-text-primary",
  textSecondary: "--color-text-secondary",
  border: "--color-border",
};

export const CUSTOM_COLOR_LABELS: Record<keyof CustomThemeColors, string> = {
  bgPage: "Background",
  bgCard: "Card",
  bgElevated: "Elevated",
  accentPrimary: "Accent",
  textPrimary: "Text",
  textSecondary: "Text 2nd",
  border: "Border",
};

// ── Compact States ──────────────────────────────────────────
export const CompactStates = {
  IDLE: "idle",
  LOADING: "loading",
  APPLIED: "applied",
} as const;
export type CompactState = (typeof CompactStates)[keyof typeof CompactStates];

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
