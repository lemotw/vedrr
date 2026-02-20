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

export interface AiProfile {
  id: string;
  name: string;
  provider: string;
  model: string;
  has_api_key: boolean;
  created_at: string;
}

import { NodeTypes } from "./constants";

export const NODE_TYPE_CONFIG: Record<NodeType, { letter: string; color: string }> = {
  [NodeTypes.TEXT]:     { letter: "T", color: "var(--color-node-text)" },
  [NodeTypes.MARKDOWN]: { letter: "M", color: "var(--color-node-markdown)" },
  [NodeTypes.IMAGE]:    { letter: "I", color: "var(--color-node-image)" },
  [NodeTypes.FILE]:     { letter: "F", color: "var(--color-node-file)" },
};
