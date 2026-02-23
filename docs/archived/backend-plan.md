# Mind Flow — Backend Execution Plan

> Date: 2025-02-14
> Reference: PRD v1.0, design/design.pen (6 screens)

---

## 1. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Runtime | **Tauri 2.x (Rust)** | 原生效能、安全、跨平台 |
| Database | **SQLite (via rusqlite)** | 本地優先、零配置、查詢效能好 |
| File Storage | **Local filesystem** | 用戶可直接存取 md/image/file |
| Serialization | serde + serde_json | Rust 標準 |
| Async | tokio | 非阻塞 I/O |
| Migration | rusqlite migration | Schema 版本管理 |

---

## 2. Data Model

### 2.1 Core Entities

```
Context
├── id: UUID
├── name: String
├── state: Active | Archived | Vault
├── tags: Vec<String>
├── root_node_id: UUID
├── created_at: DateTime
├── updated_at: DateTime
└── last_accessed_at: DateTime

TreeNode
├── id: UUID
├── context_id: UUID (FK → Context)
├── parent_id: UUID | null
├── position: i32 (排序用)
├── node_type: Text | Markdown | Image | File
├── title: String
├── content: String | null (inline text)
├── file_path: String | null (md/image/file 的相對路徑)
├── created_at: DateTime
├── updated_at: DateTime
└── metadata: JSON | null

KnowledgeTree
├── id: UUID
├── name: String
├── root_node_id: UUID
├── created_at: DateTime
└── updated_at: DateTime

KnowledgeEdge
├── id: UUID
├── source_tree_id: UUID (FK → KnowledgeTree)
├── target_tree_id: UUID (FK → KnowledgeTree)
├── label: String | null
└── created_at: DateTime

ContextSwitch (Insights 用)
├── id: UUID
├── from_context_id: UUID | null
├── to_context_id: UUID
├── switched_at: DateTime
└── focus_duration_seconds: i64 | null
```

### 2.2 SQLite Schema

```sql
-- v1 migration
CREATE TABLE contexts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'active'
        CHECK (state IN ('active', 'archived', 'vault')),
    tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
    root_node_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tree_nodes (
    id TEXT PRIMARY KEY,
    context_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES tree_nodes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    node_type TEXT NOT NULL DEFAULT 'text'
        CHECK (node_type IN ('text', 'markdown', 'image', 'file')),
    title TEXT NOT NULL DEFAULT '',
    content TEXT,
    file_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata TEXT
);

CREATE INDEX idx_nodes_context ON tree_nodes(context_id);
CREATE INDEX idx_nodes_parent ON tree_nodes(parent_id);

CREATE TABLE knowledge_trees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_node_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE knowledge_edges (
    id TEXT PRIMARY KEY,
    source_tree_id TEXT NOT NULL REFERENCES knowledge_trees(id) ON DELETE CASCADE,
    target_tree_id TEXT NOT NULL REFERENCES knowledge_trees(id) ON DELETE CASCADE,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE context_switches (
    id TEXT PRIMARY KEY,
    from_context_id TEXT REFERENCES contexts(id),
    to_context_id TEXT NOT NULL REFERENCES contexts(id),
    switched_at TEXT NOT NULL DEFAULT (datetime('now')),
    focus_duration_seconds INTEGER
);

CREATE INDEX idx_switches_date ON context_switches(switched_at);
```

---

## 3. File System Structure

```
~/MindFlow/                       ← 用戶可見的根目錄
├── data/
│   └── mindflow.db               ← SQLite database
├── contexts/
│   └── {context-uuid}/
│       ├── {node-uuid}.md        ← Markdown node files
│       ├── {node-uuid}.png       ← Image node files
│       └── {node-uuid}.ext       ← Other file nodes
└── knowledge/
    └── {tree-uuid}/
        ├── {node-uuid}.md
        └── ...
```

**Key Decisions:**
- 每個 context 一個資料夾，用 UUID 命名
- 檔案型 node 存在對應 context 資料夾下
- 用戶可以直接在 Finder 中瀏覽/編輯
- SQLite db 放 data/ 下，與檔案分開

---

## 4. Tauri Commands (IPC)

### 4.1 Context Commands

```rust
#[tauri::command]
async fn create_context(name: String, tags: Vec<String>) -> Result<Context, Error>

#[tauri::command]
async fn list_contexts(filter: ContextFilter) -> Result<Vec<ContextSummary>, Error>
// ContextFilter { state: Option<State>, tags: Option<Vec<String>>, search: Option<String> }
// ContextSummary { id, name, state, tags, node_count, last_accessed_at }

#[tauri::command]
async fn get_context(id: String) -> Result<Context, Error>

#[tauri::command]
async fn switch_context(id: String) -> Result<(), Error>
// 更新 last_accessed_at + 記錄 context_switch

#[tauri::command]
async fn archive_context(id: String) -> Result<(), Error>
// state: active → archived

#[tauri::command]
async fn activate_context(id: String) -> Result<(), Error>
// state: archived/vault → active

#[tauri::command]
async fn delete_context(id: String) -> Result<(), Error>
// 刪除 context + 所有 nodes + 檔案資料夾

#[tauri::command]
async fn update_context(id: String, updates: ContextUpdate) -> Result<(), Error>
// ContextUpdate { name: Option<String>, tags: Option<Vec<String>> }
```

### 4.2 Node Commands

```rust
#[tauri::command]
async fn get_tree(context_id: String) -> Result<TreeData, Error>
// 回傳整棵 tree（遞迴結構）

#[tauri::command]
async fn create_node(
    context_id: String,
    parent_id: Option<String>,
    node_type: NodeType,
    title: String
) -> Result<TreeNode, Error>

#[tauri::command]
async fn update_node(id: String, updates: NodeUpdate) -> Result<(), Error>
// NodeUpdate { title, content, node_type, metadata }

#[tauri::command]
async fn move_node(
    id: String,
    new_parent_id: String,
    position: i32
) -> Result<(), Error>
// 更新 parent_id + 重新計算 position

#[tauri::command]
async fn delete_node(id: String) -> Result<(), Error>
// 遞迴刪除子節點 + 對應檔案
```

### 4.3 File Commands

```rust
#[tauri::command]
async fn read_file_node(node_id: String) -> Result<String, Error>
// 讀取 md/text 檔案內容

#[tauri::command]
async fn save_file_node(node_id: String, content: String) -> Result<(), Error>
// 寫入檔案 + 更新 updated_at

#[tauri::command]
async fn open_external(node_id: String) -> Result<(), Error>
// 用系統預設程式開啟檔案

#[tauri::command]
async fn import_file(context_id: String, parent_id: String, file_path: String) -> Result<TreeNode, Error>
// 複製檔案到 context 資料夾 + 建立 node
```

### 4.4 Search Commands

```rust
#[tauri::command]
async fn search_contexts(query: String) -> Result<Vec<ContextSummary>, Error>
// 模糊搜尋 context name + tags

#[tauri::command]
async fn search_nodes(query: String, context_id: Option<String>) -> Result<Vec<NodeSearchResult>, Error>
// 搜尋 node title + content（可限定 context）
```

### 4.5 Insights Commands

```rust
#[tauri::command]
async fn get_daily_insights(date: String) -> Result<DailyInsights, Error>
// DailyInsights { switch_count, longest_focus_seconds, focus_distribution }

#[tauri::command]
async fn record_focus_end(context_id: String, duration_seconds: i64) -> Result<(), Error>
```

### 4.6 Knowledge Commands

```rust
#[tauri::command]
async fn list_knowledge_trees() -> Result<Vec<KnowledgeTreeSummary>, Error>

#[tauri::command]
async fn create_knowledge_tree(name: String) -> Result<KnowledgeTree, Error>

#[tauri::command]
async fn get_knowledge_graph() -> Result<GraphData, Error>
// GraphData { trees: Vec<KnowledgeTreeSummary>, edges: Vec<KnowledgeEdge> }

#[tauri::command]
async fn create_knowledge_edge(source_id: String, target_id: String, label: Option<String>) -> Result<(), Error>

#[tauri::command]
async fn delete_knowledge_edge(edge_id: String) -> Result<(), Error>
```

---

## 5. Background Tasks

### 5.1 Auto Vault (Archived → Vault)

```rust
// 每小時檢查一次
// archived 超過 1 天 → 自動轉 vault
fn auto_vault_check(db: &Connection) {
    UPDATE contexts
    SET state = 'vault', updated_at = datetime('now')
    WHERE state = 'archived'
    AND updated_at < datetime('now', '-1 day')
}
```

### 5.2 Idle Detection (灰色提示)

```rust
// Frontend polling: 每分鐘檢查 active contexts 的 last_accessed_at
// > 1h → 回傳 idle flag，frontend 顯示灰色
#[tauri::command]
async fn get_idle_contexts(threshold_minutes: i64) -> Result<Vec<String>, Error>
```

### 5.3 Focus Tracking

```rust
// Frontend 在 switch_context 時自動計算上一個 context 的 focus duration
// 送到 backend 記錄 context_switches table
```

---

## 6. Error Handling

```rust
#[derive(Debug, thiserror::Error)]
enum MindFlowError {
    #[error("Context not found: {0}")]
    ContextNotFound(String),

    #[error("Node not found: {0}")]
    NodeNotFound(String),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("File system error: {0}")]
    FileSystem(#[from] std::io::Error),

    #[error("Invalid operation: {0}")]
    InvalidOperation(String),
}

// Serialize for Tauri IPC
impl serde::Serialize for MindFlowError { ... }
```

---

## 7. Milestones

### M1: Foundation (Week 1-2)
- [ ] Tauri 2.x project setup (Rust backend)
- [ ] SQLite schema + migration system
- [ ] File system directory structure init
- [ ] Basic CRUD: contexts table
- [ ] Unit tests for DB layer

### M2: Tree Operations (Week 3-4)
- [ ] Node CRUD commands
- [ ] Recursive tree query (get_tree)
- [ ] Move node (reparent + reorder)
- [ ] File node operations (read/write/open)
- [ ] Cascade delete (node + children + files)

### M3: Context Lifecycle (Week 5-6)
- [ ] Switch context + record context_switch
- [ ] Archive / Activate / Vault state transitions
- [ ] Auto vault background task
- [ ] Idle detection query
- [ ] Context search (fuzzy name + tags)

### M4: File & Editor Support (Week 7-8)
- [ ] Markdown file read/write
- [ ] Image file import + thumbnail generation
- [ ] External file open (system default app)
- [ ] Auto-save support (debounced write)
- [ ] File watcher for external edits

### M5: Knowledge & Insights (Week 9-10)
- [ ] Knowledge tree CRUD
- [ ] Knowledge edge CRUD
- [ ] Graph data query
- [ ] Focus tracking + context switch recording
- [ ] Daily insights aggregation query

### M6: Robustness (Week 11-12)
- [ ] Error handling + logging
- [ ] Database backup/restore
- [ ] Data integrity checks
- [ ] Performance optimization (index tuning, batch queries)
- [ ] Integration tests (IPC round-trip)
