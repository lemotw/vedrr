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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKey {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProfile {
    pub id: String,
    pub name: String,
    pub api_key_id: Option<String>,
    pub api_key_name: Option<String>,
    pub provider: String,
    pub model: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposedNode {
    pub source_id: Option<String>,
    pub title: String,
    pub node_type: String,
    #[serde(default)]
    pub children: Vec<ProposedNode>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompactResult {
    pub original: TreeData,
    pub proposed: Vec<ProposedNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultExportNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub position: i32,
    pub node_type: String,
    pub title: String,
    pub content: Option<String>,
    pub file_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultExport {
    pub version: u32,
    pub context_id: String,
    pub context_name: String,
    pub root_node_id: String,
    pub exported_at: String,
    pub nodes: Vec<VaultExportNode>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VaultEntry {
    pub id: String,
    pub name: String,
    pub tags: Vec<String>,
    pub node_count: i64,
    pub original_created_at: String,
    pub vaulted_at: String,
}

