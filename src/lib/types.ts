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

export const NODE_TYPE_CONFIG: Record<NodeType, { letter: string; color: string }> = {
  text:     { letter: "T", color: "var(--color-node-text)" },
  markdown: { letter: "M", color: "var(--color-node-markdown)" },
  image:    { letter: "I", color: "var(--color-node-image)" },
  file:     { letter: "F", color: "var(--color-node-file)" },
};
