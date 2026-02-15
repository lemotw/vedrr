use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Context {
    pub id: String,
    pub name: String,
    pub state: String,
    pub tags: Vec<String>,
    pub root_node_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_accessed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSummary {
    pub id: String,
    pub name: String,
    pub state: String,
    pub tags: Vec<String>,
    pub node_count: i64,
    pub last_accessed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeNode {
    pub id: String,
    pub context_id: String,
    pub parent_id: Option<String>,
    pub position: i32,
    pub node_type: String,
    pub title: String,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeData {
    pub node: TreeNode,
    pub children: Vec<TreeData>,
}
