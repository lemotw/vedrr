# Mind Flow 後端架構 Context

> 2026-02-23 | TPM-2 產出

---

## 1. 系統架構概述

### Tauri 2.x 架構

Mind Flow 是一個基於 **Tauri 2.x** 的桌面應用程式。Tauri 使用 Rust 作為後端，macOS 上以 WKWebView 作為前端渲染引擎。

```
┌─────────────────────────────────────────────────────┐
│                   Tauri Window                       │
│  ┌───────────────────────────────────────────────┐  │
│  │              React Frontend (WKWebView)        │  │
│  │  Component → Zustand Store → ipc.ts            │  │
│  └────────────────────────────────┬───────────────┘  │
│                                   │ invoke()         │
│  ┌────────────────────────────────┼───────────────┐  │
│  │              Rust Backend      ▼               │  │
│  │  #[tauri::command] → AppState { db: Mutex }    │  │
│  │                          │                     │  │
│  │                          ▼                     │  │
│  │                 SQLite (rusqlite, WAL mode)     │  │
│  │               ~/MindFlow/data/mindflow.db      │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### IPC 通訊模式

- 前端透過 `@tauri-apps/api/core` 的 `invoke()` 呼叫後端命令
- 前端 camelCase 參數名自動轉換為 Rust snake_case（e.g., `contextId` → `context_id`）
- Rust command 回傳 `Result<T, MindFlowError>`，成功為 `T`（序列化為 JSON），失敗為 `MindFlowError`（序列化為字串 → 前端 rejected Promise）
- 全域狀態透過 `State<AppState>` 注入，包含 `Mutex<Connection>` 單一 SQLite 連線

### 入口點

`src-tauri/src/main.rs`:
1. 從 `~/MindFlow/data/` 取得或建立 DB 路徑
2. 開啟 SQLite 連線 + 初始化 schema
3. 註冊 Tauri plugins（`opener`, `dialog`）
4. 注入 `AppState` 到 managed state
5. 註冊所有 21 個 `#[tauri::command]`
6. 啟動 Tauri 應用

---

## 2. 資料模型

### 完整 DB Schema

位置：`~/MindFlow/data/mindflow.db`
定義：`src-tauri/src/db.rs` → `init_db()`
模式：**WAL mode + foreign_keys ON**

#### contexts 表

```sql
CREATE TABLE IF NOT EXISTS contexts (
    id TEXT PRIMARY KEY,                              -- UUID v4
    name TEXT NOT NULL,                               -- Context 顯示名稱
    state TEXT NOT NULL DEFAULT 'active'
        CHECK (state IN ('active', 'archived', 'vault')),
    tags TEXT NOT NULL DEFAULT '[]',                   -- JSON array 字串
    root_node_id TEXT,                                -- FK → tree_nodes.id
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | TEXT PK | UUID v4 |
| `name` | TEXT NOT NULL | Context 名稱，與 root node title 雙向同步 |
| `state` | TEXT NOT NULL | `active` / `archived` / `vault`（CHECK constraint） |
| `tags` | TEXT NOT NULL | JSON array 字串，預設 `[]` |
| `root_node_id` | TEXT | 指向 tree_nodes.id（無 FK constraint） |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |
| `last_accessed_at` | TEXT | switch_context 時更新 |

#### tree_nodes 表

```sql
CREATE TABLE IF NOT EXISTS tree_nodes (
    id TEXT PRIMARY KEY,                              -- UUID v4
    context_id TEXT NOT NULL
        REFERENCES contexts(id) ON DELETE CASCADE,
    parent_id TEXT
        REFERENCES tree_nodes(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    node_type TEXT NOT NULL DEFAULT 'text'
        CHECK (node_type IN ('text', 'markdown', 'image', 'file')),
    title TEXT NOT NULL DEFAULT '',
    content TEXT,                                     -- Markdown HTML（markdown 類型用）
    file_path TEXT,                                   -- 檔案絕對路徑（image/file 類型用）
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | TEXT PK | UUID v4 |
| `context_id` | TEXT NOT NULL | FK → contexts.id, **ON DELETE CASCADE** |
| `parent_id` | TEXT | FK → tree_nodes.id, **ON DELETE SET NULL** |
| `position` | INTEGER NOT NULL | 同層排序，0-based |
| `node_type` | TEXT NOT NULL | `text` / `markdown` / `image` / `file`（CHECK constraint） |
| `title` | TEXT NOT NULL | 節點標題 |
| `content` | TEXT (nullable) | Markdown HTML 內容 |
| `file_path` | TEXT (nullable) | 檔案絕對路徑 |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

#### ai_settings 表

```sql
CREATE TABLE IF NOT EXISTS ai_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

通用 key-value 儲存，目前主要用於 AI 設定（provider, model 等）。

#### ai_profiles 表

```sql
CREATE TABLE IF NOT EXISTS ai_profiles (
    id TEXT PRIMARY KEY,                              -- UUID v4
    name TEXT NOT NULL,
    provider TEXT NOT NULL,                           -- "anthropic" | "openai"
    model TEXT NOT NULL,                              -- e.g. "claude-sonnet-4-20250514"
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

每個 profile 對應一組 LLM 設定，API Key 存在 OS Keychain（不進 DB）。

#### 索引

```sql
CREATE INDEX IF NOT EXISTS idx_nodes_context ON tree_nodes(context_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON tree_nodes(parent_id);
```

#### 關係圖

```
contexts 1 ──────< tree_nodes    (context_id FK, ON DELETE CASCADE)
    │                   │
    │ root_node_id ───→ │ id      (邏輯參照，無 FK constraint)
    │                   │
                        │ parent_id ───→ id  (self-referencing, ON DELETE SET NULL)

ai_profiles 1 ───→ OS Keychain   (API Key 透過 keyring crate 存取)
```

### CASCADE 行為

- 刪除 `context` → 自動 CASCADE 刪除所有 `tree_nodes`（DB 層級處理）
- 刪除 `tree_node` → 子節點的 `parent_id` SET NULL（不會自動刪除子節點，但 `delete_node` command 有手動遞迴刪除邏輯）
- **注意**：刪除 context 時 `~/MindFlow/files/` 下的檔案不會自動清理

---

## 3. Rust Command 完整清單

### Rust 資料結構

```
src-tauri/src/models.rs
```

| Struct | 用途 |
|--------|------|
| `Context` | 完整 context 資料（7 欄位） |
| `ContextSummary` | 列表顯示用（含 `node_count`） |
| `TreeNode` | 單一節點（10 欄位） |
| `TreeData` | 遞迴樹（`node: TreeNode` + `children: Vec<TreeData>`） |
| `AiProfile` | AI 設定檔（含 `has_api_key: bool`） |
| `ProposedNode` | LLM 建議的節點結構（含 `source_id` 追溯原始節點） |
| `CompactResult` | AI Compact 回傳（`original: TreeData` + `proposed: Vec<ProposedNode>`） |

### Context Commands（7 個）

檔案：`src-tauri/src/commands/context.rs`

| Command | 參數 | 回傳 | 功能 |
|---------|------|------|------|
| `create_context` | `name: String, tags: Vec<String>` | `Context` | 建立 context + 自動建立 root node（同名 text 節點） |
| `list_contexts` | （無） | `Vec<ContextSummary>` | 列出所有 context，含 `node_count`（子查詢），排序：active first → last_accessed_at DESC |
| `switch_context` | `id: String` | `()` | 更新 `last_accessed_at`；如果是 archived 狀態自動切回 active |
| `archive_context` | `id: String` | `()` | 設定 `state = 'archived'` |
| `activate_context` | `id: String` | `()` | 設定 `state = 'active'` + 更新時間戳 |
| `rename_context` | `id: String, name: String` | `()` | 更新 context name + **同步 root node title**（雙向） |
| `delete_context` | `id: String` | `()` | 刪除 context（CASCADE 刪除所有 nodes） |

**重要行為**：
- `create_context` 內部建立 root node 是 atomic（同一 DB 連線）
- `rename_context` 有雙向同步：context name → root node title
- `delete_context` 依賴 DB CASCADE，不需手動刪 nodes

### Node Commands（7 個）

檔案：`src-tauri/src/commands/node.rs`

| Command | 參數 | 回傳 | 功能 |
|---------|------|------|------|
| `get_tree` | `context_id: String` | `Option<TreeData>` | 從 root_node_id 開始遞迴查詢整棵樹（MAX_DEPTH=50） |
| `create_node` | `context_id, parent_id, node_type, title: String` | `TreeNode` | 建立子節點，position = max(siblings) + 1，touch context timestamps |
| `update_node` | `id: String, title?, content?, node_type?, file_path?: Option<String>` | `()` | 更新指定欄位（每個非 None 的欄位獨立 UPDATE）。**更新 title 時同步 context name**（如果是 root node） |
| `delete_node` | `id: String` | `()` | **手動遞迴**刪除子樹（先查子節點 → 遞迴刪除 → 再刪自己） |
| `move_node` | `id, new_parent_id: String, position: i32` | `()` | 先 shift 目標位置的 siblings，再移動節點 |
| `clone_subtree` | `source_id, target_parent_id, context_id: String` | `String (new root id)` | 深拷貝子樹（新 UUID），含防環檢查（不可貼到自己的後代下） |
| `restore_nodes` | `nodes: Vec<TreeNode>` | `()` | 批量 INSERT OR REPLACE 節點（用於 undo 復原） |

**重要行為**：
- `get_tree` 使用遞迴查詢（非 CTE），有 MAX_DEPTH=50 防止無限遞迴
- `update_node` 有 root ↔ context 雙向 title 同步
- `delete_node` 不依賴 CASCADE（因 parent_id FK 是 SET NULL），手動遞迴刪除
- `clone_subtree` 有 `is_descendant` 檢查防止環狀結構
- `restore_nodes` 使用 `INSERT OR REPLACE`，可覆蓋已存在的節點（undo 場景）

### File Ops Commands（3 個）

檔案：`src-tauri/src/commands/file_ops.rs`

| Command | 參數 | 回傳 | 功能 |
|---------|------|------|------|
| `read_file_bytes` | `file_path: String` | `Vec<u8>` | 讀取任意檔案為 byte array |
| `save_clipboard_image` | `context_id, node_id, extension: String, data: Vec<u8>` | `String (dest path)` | 將剪貼簿圖片 bytes 存到 `~/MindFlow/files/{context_id}/{node_id_prefix}.{ext}` |
| `import_image` | `context_id, node_id, source_path: String` | `String (dest path)` | 複製外部圖片到 app 儲存區（`std::fs::copy`） |

**重要行為**：
- 檔名使用 `node_id[..8]` 前綴（取前 8 字元 + 副檔名）
- 自動建立 `~/MindFlow/files/{context_id}/` 目錄
- `read_file_bytes` 用於替代 Tauri 2 壞掉的 `convertFileSrc` + asset protocol（macOS WKWebView 限制）

### AI Commands（4 個）

檔案：`src-tauri/src/commands/ai.rs`

| Command | 參數 | 回傳 | 功能 |
|---------|------|------|------|
| `list_ai_profiles` | （無） | `Vec<AiProfile>` | 列出所有 AI profile，含 `has_api_key` 狀態（即時查 Keychain） |
| `create_ai_profile` | `name, provider, model, api_key: String` | `AiProfile` | 建立 profile + 存 API key 到 Keychain |
| `delete_ai_profile` | `id: String` | `()` | 刪除 profile + 從 Keychain 移除 API key |
| `compact_node` | `node_id, profile_id: String` | `CompactResult` | **async** — 讀取子樹 → 建構 prompt → 呼叫 LLM → 解析回傳 |

**`compact_node` 完整流程**：
1. 從 DB 讀取 profile（provider, model）
2. 從 DB 遞迴建構 `TreeData`（`build_subtree`）
3. 取得祖先路徑（`get_ancestor_path`）
4. 從 Keychain 取得 API key
5. **釋放 DB lock**（重要：避免 async 期間持有 Mutex）
6. 建構中文 prompt（含 tree text + node ID 對照表）
7. 呼叫 LLM API（reqwest async）
8. 解析 JSON 回傳（支援 markdown code fence 剝離）
9. 回傳 `CompactResult { original, proposed }`

**LLM API 支援**：
- **Anthropic**: POST `https://api.anthropic.com/v1/messages`，header `x-api-key` + `anthropic-version: 2023-06-01`，回應路徑 `content[0].text`
- **OpenAI**: POST `https://api.openai.com/v1/chat/completions`，header `Authorization: Bearer {key}`，啟用 `response_format: json_object`，回應路徑 `choices[0].message.content`

---

## 4. IPC 介面對照表

| 前端呼叫 (ipc.ts) | Rust command | 前端參數 | 參數轉換 |
|-------------------|-------------|----------|---------|
| `ipc.createContext(name, tags)` | `create_context` | `{ name, tags }` | 直接對應 |
| `ipc.listContexts()` | `list_contexts` | （無） | — |
| `ipc.switchContext(id)` | `switch_context` | `{ id }` | 直接對應 |
| `ipc.archiveContext(id)` | `archive_context` | `{ id }` | 直接對應 |
| `ipc.activateContext(id)` | `activate_context` | `{ id }` | 直接對應 |
| `ipc.renameContext(id, name)` | `rename_context` | `{ id, name }` | 直接對應 |
| `ipc.deleteContext(id)` | `delete_context` | `{ id }` | 直接對應 |
| `ipc.getTree(contextId)` | `get_tree` | `{ contextId }` | `contextId` → `context_id` |
| `ipc.createNode(contextId, parentId, nodeType, title)` | `create_node` | `{ contextId, parentId, nodeType, title }` | camelCase → snake_case |
| `ipc.updateNode(id, updates)` | `update_node` | `{ id, ...updates }` | spread: `title?`, `content?`, `nodeType?`→`node_type?`, `filePath?`→`file_path?` |
| `ipc.deleteNode(id)` | `delete_node` | `{ id }` | 直接對應 |
| `ipc.moveNode(id, newParentId, position)` | `move_node` | `{ id, newParentId, position }` | `newParentId` → `new_parent_id` |
| `ipc.cloneSubtree(sourceId, targetParentId, contextId)` | `clone_subtree` | `{ sourceId, targetParentId, contextId }` | camelCase → snake_case |
| `ipc.restoreNodes(nodes)` | `restore_nodes` | `{ nodes }` | TreeNode[] 直接序列化 |
| `ipc.readFileBytes(filePath)` | `read_file_bytes` | `{ filePath }` | `filePath` → `file_path` |
| `ipc.saveClipboardImage(...)` | `save_clipboard_image` | `{ contextId, nodeId, data, extension }` | camelCase → snake_case |
| `ipc.importImage(...)` | `import_image` | `{ contextId, nodeId, sourcePath }` | camelCase → snake_case |
| `ipc.listAiProfiles()` | `list_ai_profiles` | （無） | — |
| `ipc.createAiProfile(name, provider, model, apiKey)` | `create_ai_profile` | `{ name, provider, model, apiKey }` | `apiKey` → `api_key` |
| `ipc.deleteAiProfile(id)` | `delete_ai_profile` | `{ id }` | 直接對應 |
| `ipc.compactNode(nodeId, profileId)` | `compact_node` | `{ nodeId, profileId }` | camelCase → snake_case |

**非 IPC 前端操作**（使用 Tauri plugins）：

| 前端呼叫 | Plugin | 功能 |
|----------|--------|------|
| `ipc.revealFile(filePath)` | `tauri-plugin-opener` | 在 Finder 中顯示檔案 |
| `ipc.pickFile()` | `tauri-plugin-dialog` | 系統檔案選擇器 |
| `ipc.pickImage()` | `tauri-plugin-dialog` | 系統圖片選擇器（限 png/jpg/jpeg/gif/webp） |

---

## 5. 檔案系統操作

### 目錄結構

```
~/MindFlow/
├── data/
│   └── mindflow.db          # SQLite 資料庫（WAL mode）
│   └── mindflow.db-wal      # WAL 日誌
│   └── mindflow.db-shm      # 共享記憶體
└── files/
    └── {context_id}/         # 每個 context 一個子目錄
        └── {node_id[..8]}.{ext}  # 圖片/檔案，用 node ID 前 8 字元命名
```

### 圖片處理流程

**剪貼簿貼上**：
1. 前端 paste handler 偵測 `DataTransferItemList` 中的圖片
2. 同步取得 blob（WKWebView 限制：必須在 paste handler 內同步取）
3. 前端轉為 `number[]`（byte array）
4. 呼叫 `ipc.saveClipboardImage(contextId, nodeId, data, extension)`
5. Rust 建立目錄 + 寫入檔案 + 回傳絕對路徑
6. 前端 `ipc.updateNode(nodeId, { filePath })` 更新節點

**檔案匯入**：
1. 前端呼叫 `ipc.pickImage()` 開啟系統選擇器
2. 使用者選取檔案後取得 `source_path`
3. 呼叫 `ipc.importImage(contextId, nodeId, sourcePath)`
4. Rust `std::fs::copy` 複製到 app 儲存區 + 回傳新路徑

**圖片顯示**：
1. 前端呼叫 `ipc.readFileBytes(filePath)` 取得 `number[]`
2. 轉為 `Blob` + `URL.createObjectURL()` 生成臨時 URL
3. 使用 `<img src={objectUrl}>` 顯示
4. `useEffect` cleanup 時 `URL.revokeObjectURL()` 防止記憶體洩漏

### 已知問題

- 刪除 context 時 `~/MindFlow/files/{context_id}/` 目錄不會自動清理
- `file_ops.rs` 的路徑 `.join("MindFlow/files")` 在 Windows 上有問題，需改為 `.join("MindFlow").join("files")`

---

## 6. 錯誤處理

### MindFlowError 枚舉

```rust
// src-tauri/src/error.rs
#[derive(Debug, thiserror::Error)]
pub enum MindFlowError {
    #[error("Context not found: {0}")]
    ContextNotFound(String),

    #[error("Node not found: {0}")]
    NodeNotFound(String),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("{0}")]
    Other(String),
}
```

### 序列化為前端

`MindFlowError` 實作 `Serialize`，序列化為純字串（`serializer.serialize_str(&self.to_string())`）。前端收到的是 `Promise.reject(errorString)`。

### 前端錯誤處理現狀

- `ipc.ts` 的所有 21 個 invoke wrapper **沒有 try/catch**（已在 `docs/frontend-optimization-report.md` 記錄為待改進項）
- 前端大部分呼叫端也沒有 catch（靜默失敗）
- AI Compact 是目前唯一有完整錯誤處理的流程（catch → `setCompactError`）

---

## 7. 資料庫配置

### 初始化流程

```rust
// db.rs
fn init_db(conn: &Connection) -> Result<(), MindFlowError> {
    conn.execute_batch("
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS contexts (...);
        CREATE TABLE IF NOT EXISTS tree_nodes (...);
        CREATE INDEX IF NOT EXISTS ...;
        CREATE TABLE IF NOT EXISTS ai_settings (...);
        CREATE TABLE IF NOT EXISTS ai_profiles (...);
    ");
}
```

### 配置

| 項目 | 設定 | 說明 |
|------|------|------|
| Journal mode | WAL | 讀寫並行，效能佳 |
| Foreign keys | ON | 啟用 CASCADE 等 FK 行為 |
| Connection | 單一連線 + Mutex | 所有 command 共用，序列化存取 |
| Migration | `CREATE TABLE IF NOT EXISTS` | 無版本管理，不支援 schema 遷移 |

### 並行存取

- 所有 `#[tauri::command]` 透過 `State<AppState>` 取得 `Mutex<Connection>`
- `compact_node` 是 **async command**，特別注意在取得 DB 資料後立即釋放 lock，避免 async 期間持有 Mutex
- 其他 command 都是 sync，持有 lock 期間直接完成所有 DB 操作

### 無 Migration 系統

目前使用 `CREATE TABLE IF NOT EXISTS`，沒有 schema 版本追蹤。新增表沒問題，但 **ALTER TABLE**（加欄位、改欄位）需要手動處理。未來可能需要引入 migration 系統。

---

## 8. 依賴清單

### Cargo.toml 依賴

| 依賴 | 版本 | 用途 |
|------|------|------|
| `tauri` | 2 | Tauri 框架核心 |
| `tauri-plugin-opener` | 2 | 開啟檔案 / Reveal in Finder |
| `tauri-plugin-dialog` | 2 | 系統對話框（選擇檔案） |
| `serde` | 1 (derive) | 序列化/反序列化（所有 model + IPC） |
| `serde_json` | 1 | JSON 處理（tags 欄位、LLM 回傳解析） |
| `rusqlite` | 0.31 (bundled) | SQLite（內建 sqlite3，不依賴系統） |
| `uuid` | 1 (v4) | 生成 UUID v4（context ID、node ID） |
| `thiserror` | 1 | 錯誤枚舉衍生 macro |
| `chrono` | 0.4 (serde) | 時間處理（目前未直接使用，DB 用 SQL datetime） |
| `dirs` | 5 | 跨平台 home directory 取得 |
| `reqwest` | 0.12 (json, rustls-tls) | HTTP client（LLM API 呼叫） |
| `keyring` | 3 (apple-native, windows-native, sync-secret-service) | OS Keychain 存取（API Key） |
| `tokio` | 1 (rt-multi-thread) | Async runtime（reqwest 需要） |

### Build 依賴

| 依賴 | 版本 | 用途 |
|------|------|------|
| `tauri-build` | 2 | Tauri build script |

---

## 9. 現有文件摘要

### 核心參考

| 文件 | 重點 |
|------|------|
| `CLAUDE.md` | 完整專案架構、tech stack、DB schema、gotchas、keyboard shortcuts |
| `docs/do/architecture.md` | 系統架構圖、資料流、IPC 對照表、前後端對應 |
| `docs/do/code-index.md` | IPC 快速查表、Store actions、快捷鍵完整對照 |
| `docs/product-overview.md` | 產品功能模組說明、核心理念、技術架構摘要 |

### 功能規劃

| 文件 | 重點 |
|------|------|
| `docs/do/remaining-features.md` | 待實作功能清單（已完成 / 待做 / 已知 bug） |
| `docs/plans/2026-02-19-ai-compact-design.md` | AI Compact 初版設計（兩面板 preview 模式） |
| `docs/plans/2026-02-19-ai-compact-plan.md` | AI Compact 初版實作計畫（8 tasks） |
| `docs/do/compact-redesign.md` | AI Compact 重新設計（Auto-Apply + Banner + Inline Color Coding） |
| `docs/plans/2026-02-22-compact-redesign-plan.md` | Compact 重設計實作計畫（10 tasks） |

### 跨平台 & 優化

| 文件 | 重點 |
|------|------|
| `docs/do/windows-porting-evaluation.md` | Windows 移植評估（3 處必改、3 處需驗證） |
| `docs/do/mobile-design-questions.md` | 手機版待決設計問題（框架、同步、導航、操作） |
| `docs/frontend-optimization-report.md` | 前端優化報告（5 大改進建議：re-render、拆元件、store 重構、a11y、IPC 錯誤處理） |

### 命名討論

| 文件 | 重點 |
|------|------|
| `docs/naming-analysis.md` | 專案命名分析 |
| `docs/naming-analysis-round2.md` | 命名分析第二輪 |

---

## 10. 技術限制與可擴展方向

### 現有限制

| 限制 | 說明 | 影響 |
|------|------|------|
| **單一 DB 連線 + Mutex** | 所有 command 序列化存取，async command 需特別注意 lock 時間 | 大量並行 IPC 呼叫時可能產生瓶頸 |
| **無 Migration 系統** | 只有 `CREATE TABLE IF NOT EXISTS`，無法 ALTER TABLE | 加新欄位需手動處理既有資料 |
| **遞迴查詢無 CTE** | `get_tree`/`build_subtree` 使用 Rust 遞迴而非 SQL WITH RECURSIVE | 深度 50 以內效能可接受，但每層一次 query |
| **刪除不清理檔案** | `delete_context`/`delete_node` 不刪除 `~/MindFlow/files/` 下的檔案 | 長期使用會累積孤兒檔案 |
| **IPC 零錯誤處理** | 前端 `ipc.ts` 完全沒有 catch | 使用者看不到錯誤訊息 |
| **LLM 回應解析脆弱** | 依賴 LLM 回傳正確 JSON 格式 | 格式不對即失敗，無 retry 機制 |
| **API Key 無法遷移** | Keychain 綁定裝置，換機器需重新設定 | 可加匯入/匯出 |
| **node position 有空洞風險** | `delete_node` 不重新排序 position，`move_node` 只做 shift | 長期操作後 position 值可能有大空洞 |
| **`root_node_id` 無 FK** | contexts 的 `root_node_id` 沒有 FOREIGN KEY constraint | 理論上可能指向不存在的 node |
| **Windows 路徑問題** | `file_ops.rs` 用 `"MindFlow/files"` 而非鏈式 `.join()` | Windows 上路徑會出錯 |

### 可擴展方向

| 方向 | 建議做法 | 複雜度 |
|------|---------|--------|
| **Schema migration** | 引入 `rusqlite_migration` 或自建版本表 | M |
| **批量 IPC** | 新增 `batch_update_nodes` command 減少 IPC 往返次數（compact apply 時尤其明顯） | S |
| **檔案清理** | 新增 `cleanup_orphan_files` command 或在 delete 時同步清理 | S |
| **搜尋增強** | 新增 `search_nodes(query, context_id?)` command，支援跨 context 搜尋 | M |
| **匯出/匯入** | 新增 `export_context(id, format)` / `import_context(data)` 支援 JSON/Markdown 匯出 | M |
| **資料統計** | 新增 `get_stats()` command 回傳節點數、context 數、使用時間等 | S |
| **LLM Streaming** | `compact_node` 改用 SSE/streaming 回傳，前端即時顯示進度 | L |
| **多 LLM provider** | 擴展 `call_llm` 支援更多 provider（Google Gemini、本地 Ollama 等） | M |
| **Context 共用節點** | 新增 `shared_nodes` 表，支援跨 context 的知識圖譜 | XL |
| **Connection pool** | 用 `r2d2` 或 `deadpool-sqlite` 替代 Mutex\<Connection\> | M |
| **DB 壓縮/vacuum** | 定期 VACUUM 釋放空間 | S |
| **Undo 持久化** | 將 undo stack 存入 DB（目前只在前端記憶體） | M |

### Prompt 工程改進空間

- 目前 prompt 固定為中文，可依使用者語言切換
- 可加入使用者偏好設定（保守/積極重組程度）
- 可加入 `max_tokens` 的動態計算（根據子樹大小）
- 可要求 LLM 回傳 `summary` 欄位（解釋重組理由），減少使用者對 auto-apply 的不信任
