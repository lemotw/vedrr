export type NodeType = "text" | "markdown" | "image" | "file";
export type ContextState = "active" | "archived" | "vault";

export interface Context {
  id: string;
  name: string;
  state: ContextState;
  tags: string[];
  root_node_id: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
}

export interface ContextSummary {
  id: string;
  name: string;
  state: ContextState;
  tags: string[];
  node_count: number;
  last_accessed_at: string;
}

export interface TreeNode {
  id: string;
  context_id: string;
  parent_id: string | null;
  position: number;
  node_type: NodeType;
  title: string;
  content: string | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreeData {
  node: TreeNode;
  children: TreeData[];
}

export interface ProposedNode {
  source_id: string | null;
  title: string;
  node_type: string;
  children: ProposedNode[];
}

export interface CompactResult {
  original: TreeData;
  proposed: ProposedNode[];
}

export type CompactChangeType = "added" | "edited" | "moved" | "edited+moved";

export interface CompactHighlightInfo {
  type: CompactChangeType;
  oldTitle?: string;
  fromParent?: string;
}

export interface CompactSummary {
  added: number;
  edited: number;
  moved: number;
  deleted: number;
  deletedNames: string[];
}

export interface ModelInfo {
  id: string;
  name: string;
}

export interface ApiKey {
  id: string;
  name: string;
  provider: string;
  created_at: string;
}

export interface AiProfile {
  id: string;
  name: string;
  api_key_id: string | null;
  api_key_name: string | null;
  provider: string;
  model: string;
  created_at: string;
}

export interface SearchResult {
  node_id: string;
  node_title: string;
  node_type: string;
  context_id: string;
  context_name: string;
  ancestor_path: string;
  score: number;
}

export interface ModelStatus {
  status: "not_ready" | "downloading" | "ready" | "error";
  progress: number;
}

import { NodeTypes } from "./constants";

export const NODE_TYPE_CONFIG: Record<NodeType, { letter: string; color: string }> = {
  [NodeTypes.TEXT]:     { letter: "T", color: "var(--color-node-text)" },
  [NodeTypes.MARKDOWN]: { letter: "M", color: "var(--color-node-markdown)" },
  [NodeTypes.IMAGE]:    { letter: "I", color: "var(--color-node-image)" },
  [NodeTypes.FILE]:     { letter: "F", color: "var(--color-node-file)" },
};
