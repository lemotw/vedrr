# ⌘F 語意搜尋實施計畫

**日期**: 2026-02-25
**範圍**: 將 ⌘F (NodeSearch) 從「當前 context 標題子字串比對」改為「跨 ACTIVE + ARCHIVED context 語意搜尋」

---

## 1. 現狀

```
目前 ⌘F:
  scope  = 當前 context 的 tree
  方式   = 前端 flattenTree() → title.toLowerCase().includes(q)
  結果   = 同 context 內的 node list
  後端   = 無（純前端 in-memory filter）
```

## 2. 目標

```
新 ⌘F:
  scope  = 所有 ACTIVE + ARCHIVED context 的所有 node
  方式   = fastembed-rs (multilingual-e5-small) 語意 embedding + cosine similarity
  結果   = Top 10 最接近的 node（跨 context）
  後端   = Rust command，embedding + brute-force cosine search
```

---

## 3. Embedding 文字組成

每個 node 的 embedding 輸入文字為**從 root 到該 node 的祖先路徑**（title 串接）：

```
Root Title > Parent Title > Grandparent Title > Node Title
```

### 截斷規則

- e5-small 輸入上限 512 tokens（約 350 中文字）
- 超過時**從最遠端（root 側）開始截斷**，保留 node 本身和最近的祖先
- 例：`Root > A > B > C > D > Node` → 截斷為 `C > D > Node`
- 理由：node 的直接上下文（parent/grandparent）比 root 名稱更能代表語意

### E5 前綴

multilingual-e5 系列要求加前綴才能正確運作：

| 用途 | 前綴 | 範例 |
|------|------|------|
| 建立 node embedding（passage） | `"passage: "` | `"passage: 量子計算 > 基本概念 > 量子纏結"` |
| 搜尋 query | `"query: "` | `"query: 量子纏結是什麼"` |

---

## 4. 架構

```
使用者按 ⌘F
  ↓
NodeSearch 開啟（前端）
  ↓
使用者輸入 query（200ms debounce）
  ↓
ipc.semanticSearch(query, 10)
  ↓
Rust: semantic_search command
  ├─ 1. 用 fastembed-rs embed query（加 "query: " 前綴）
  ├─ 2. 從 node_embeddings 表讀出所有 ACTIVE + ARCHIVED context 的向量
  ├─ 3. Brute-force cosine similarity
  ├─ 4. 排序取 top 10
  └─ 5. 回傳 Vec<SearchResult>
  ↓
前端顯示結果（node title + context name + 路徑 + type badge）
  ↓
使用者選擇 → 切換 context + 選取該 node
```

---

## 5. DB Schema 變更

在主 DB (vedrr.db) 新增 `node_embeddings` 表：

```sql
CREATE TABLE IF NOT EXISTS node_embeddings (
    node_id    TEXT PRIMARY KEY REFERENCES tree_nodes(id) ON DELETE CASCADE,
    context_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
    embedding  BLOB NOT NULL,   -- 384 × f32 = 1,536 bytes
    input_text TEXT NOT NULL,    -- 用於 debug / 重建時檢查
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_embeddings_context ON node_embeddings(context_id);
```

**選擇主 DB 而非獨立檔案的理由**：
- `ON DELETE CASCADE` 自動隨 node / context 刪除清理向量
- 無跨 DB 一致性問題
- 向量是可重建的 cache — 若 DB 過大，未來可遷移到獨立檔案

**單向量設計**（非先前策略文件的雙向量）：
- 此功能只做跨 context 搜尋，不需區分 local / global
- 簡化實作，日後有需求再擴展

---

## 6. Rust 端變更

### 6.1 Cargo.toml 新增依賴

```toml
fastembed = "4"    # fastembed-rs，內建 ONNX Runtime + tokenizer
```

### 6.2 新增模組 `src-tauri/src/embedding.rs`

負責：
- 模型 lazy loading（首次搜尋或 embed 時載入，常駐記憶體）
- `embed_texts(texts: &[String]) -> Vec<Vec<f32>>` — batch embed
- `cosine_similarity(a: &[f32], b: &[f32]) -> f32`
- `build_node_path(db, node_id) -> String` — 從 DB 建構祖先路徑文字 + 截斷

```rust
use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};
use std::sync::OnceLock;

static MODEL: OnceLock<TextEmbedding> = OnceLock::new();

fn get_model() -> &'static TextEmbedding {
    MODEL.get_or_init(|| {
        TextEmbedding::try_new(InitOptions {
            model_name: EmbeddingModel::MultilingualE5Small,
            show_download_progress: true,
            ..Default::default()
        }).expect("Failed to load embedding model")
    })
}
```

### 6.3 新增模組 `src-tauri/src/commands/search.rs`

三個 Tauri command：

#### `semantic_search`

```rust
#[tauri::command]
fn semantic_search(
    query: String,
    top_k: usize,
    state: tauri::State<AppState>,
) -> Result<Vec<SearchResult>, AppError>
```

流程：
1. embed query（加 `"query: "` 前綴）
2. `SELECT ne.node_id, ne.context_id, ne.embedding, tn.title, tn.node_type, c.name as context_name FROM node_embeddings ne JOIN tree_nodes tn ON ne.node_id = tn.id JOIN contexts c ON ne.context_id = c.id WHERE c.state IN ('active', 'archived')`
3. 逐一計算 cosine similarity
4. 排序取 top_k
5. 回傳 `Vec<SearchResult>`

```rust
#[derive(Serialize)]
struct SearchResult {
    node_id: String,
    node_title: String,
    node_type: String,
    context_id: String,
    context_name: String,
    ancestor_path: String,  // "Parent > Grandparent > ..." 用於顯示
    score: f32,             // cosine similarity
}
```

#### `embed_context_nodes`

```rust
#[tauri::command]
fn embed_context_nodes(
    context_id: String,
    state: tauri::State<AppState>,
) -> Result<usize, AppError>
```

批量 embed 一個 context 的所有 node。回傳成功 embed 的 node 數量。

#### `embed_single_node`

```rust
#[tauri::command]
fn embed_single_node(
    node_id: String,
    state: tauri::State<AppState>,
) -> Result<(), AppError>
```

embed（或 re-embed）單個 node。用於增量更新。

### 6.4 祖先路徑建構

```rust
fn build_ancestor_path(db: &Connection, node_id: &str) -> Result<String, AppError> {
    // 從 node 往上 walk parent_id 直到 root（parent_id IS NULL）
    // 收集所有 title 到 Vec<String>
    // reverse → "Root > ... > Parent > Node"
    // 加上 "passage: " 前綴
    // 如果超過截斷長度，從 root 側開始 drop
}
```

截斷實作：
- 先組完整路徑字串
- 用 fastembed 內建 tokenizer 計算 token 數
- 若 > 480 tokens（留 32 token 給前綴 + 安全餘量），從最左側的 segment 開始 drop
- 不使用字元數估算，用實際 tokenizer 確保精確

### 6.5 main.rs 註冊

```rust
commands::search::semantic_search,
commands::search::embed_context_nodes,
commands::search::embed_single_node,
```

---

## 7. 前端變更

### 7.1 `src/lib/constants.ts` — 新增 IPC commands

```typescript
SEMANTIC_SEARCH: "semantic_search",
EMBED_CONTEXT_NODES: "embed_context_nodes",
EMBED_SINGLE_NODE: "embed_single_node",
```

### 7.2 `src/lib/ipc.ts` — 新增呼叫

```typescript
semanticSearch: (query: string, topK: number = 10) =>
  safeInvoke<SearchResult[]>(IpcCmd.SEMANTIC_SEARCH, { query, topK }),

embedContextNodes: (contextId: string) =>
  safeInvoke<number>(IpcCmd.EMBED_CONTEXT_NODES, { contextId }),

embedSingleNode: (nodeId: string) =>
  safeInvoke<void>(IpcCmd.EMBED_SINGLE_NODE, { nodeId }),
```

### 7.3 `src/lib/types.ts` — 新增型別

```typescript
export interface SearchResult {
  node_id: string;
  node_title: string;
  node_type: NodeType;
  context_id: string;
  context_name: string;
  ancestor_path: string;
  score: number;
}
```

### 7.4 `src/components/NodeSearch.tsx` — 重寫

主要改動：

| 項目 | 舊 | 新 |
|------|----|----|
| 資料來源 | 前端 flattenTree | 後端 `semantic_search` IPC |
| 搜尋方式 | `title.includes(q)` | cosine similarity on embeddings |
| 搜尋範圍 | 當前 context | 所有 ACTIVE + ARCHIVED context |
| 結果上限 | 無限（全部符合） | Top 10 |
| 顯示 | node title + path | node title + context name + path + type badge |
| 延遲處理 | instant（同步 filter） | 200ms debounce + loading state |
| 選取結果 | selectNode(id) | switchContext(contextId) + selectNode(nodeId) |

**新 UI 結構**：

```
┌─────────────────────────────────────┐
│ 🔍 [搜尋輸入]                   ⌘F │
├─────────────────────────────────────┤
│                                     │
│  T  量子纏結的基本原理               │
│     量子計算 › 基本概念      0.91   │
│                                     │
│  M  量子力學入門筆記                 │
│     物理學 › 讀書筆記        0.85   │
│                                     │
│  T  EPR 悖論                        │
│     量子計算 › 歷史          0.78   │
│                                     │
│  (空白時顯示 loading spinner)       │
│                                     │
├─────────────────────────────────────┤
│  ↑↓ navigate  ⏎ open  esc close    │
└─────────────────────────────────────┘
```

每個結果 row 顯示：
- **左側**: type badge（T/M/I/F + color）
- **主體**: node title（第一行）+ context name › ancestor path（第二行，text-secondary）
- **右側**: similarity score（小數兩位，text-secondary，可選）

**選取邏輯**：
```typescript
function handleSelect(result: SearchResult) {
  const currentContextId = useContextStore.getState().currentContextId;
  if (result.context_id !== currentContextId) {
    // 跨 context → 先切換
    await useContextStore.getState().switchContext(result.context_id);
  }
  useTreeStore.getState().selectNode(result.node_id);
  closeNodeSearch();
}
```

**Debounce**：
```typescript
const [debouncedQuery, setDebouncedQuery] = useState("");
const [loading, setLoading] = useState(false);

useEffect(() => {
  const timer = setTimeout(() => setDebouncedQuery(query), 200);
  return () => clearTimeout(timer);
}, [query]);

useEffect(() => {
  if (!debouncedQuery.trim()) { setResults([]); return; }
  setLoading(true);
  ipc.semanticSearch(debouncedQuery, 10)
    .then(setResults)
    .finally(() => setLoading(false));
}, [debouncedQuery]);
```

---

## 8. Embedding 更新觸發時機

| 事件 | 動作 | 觸發位置 |
|------|------|----------|
| **Node 建立** | embed 新 node | `treeStore.addChild` / `addSibling` 完成後 |
| **Node 標題編輯** | re-embed 該 node | `treeStore.updateNodeTitle` 完成後 |
| **Node 移動 (reparent)** | re-embed 該 node + 所有子孫 | `treeStore.dragMoveNode` 完成後 |
| **Root 改名** | re-embed 該 context 所有 node | `contextStore.renameContext` 完成後 |
| **Node 刪除** | CASCADE 自動刪除 embedding | 無需前端處理 |
| **Context 刪除** | CASCADE 自動刪除所有 embedding | 無需前端處理 |
| **Context 首次開啟** | 檢查是否已 embed，若無則 batch embed | `contextStore.switchContext` 時 |

### 增量 embed 策略

所有 embed 操作在前端以 **fire-and-forget** 方式執行，不阻塞使用者操作：

```typescript
// 不 await，不阻塞 UI
ipc.embedSingleNode(nodeId).catch(console.error);
```

批量 embed（context 首次、root 改名）使用 `embed_context_nodes`，同樣 fire-and-forget。

---

## 9. 模型管理

| 項目 | 說明 |
|------|------|
| 模型 | `multilingual-e5-small` (118MB ONNX) |
| 下載時機 | 首次觸發 embed 或 search 時自動下載 |
| 存放位置 | fastembed-rs 預設 cache 目錄（`~/.cache/fastembed/`） |
| 載入方式 | `OnceLock` lazy init，首次使用時載入，之後常駐記憶體 |
| 記憶體佔用 | ~200-300MB（模型 + ONNX Runtime） |

### 首次使用 UX

首次 ⌘F 搜尋時模型尚未下載：

```
┌─────────────────────────────────────┐
│ 🔍 [搜尋輸入]                   ⌘F │
├─────────────────────────────────────┤
│                                     │
│   正在下載搜尋模型 (118MB)...       │
│   ████████████░░░░░  67%            │
│                                     │
├─────────────────────────────────────┤
│  首次使用需下載語言模型              │
└─────────────────────────────────────┘
```

**問題**：fastembed-rs 的 `show_download_progress` 是 stdout 輸出，不易傳回前端。

**可行方案**：
- **方案 A（簡單）**：首次搜尋時前端顯示不確定進度條「正在準備搜尋引擎...」，阻塞直到模型載入完成
- **方案 B（進階）**：Rust 端分步驟 — 先檢查模型是否存在 (`check_model_ready` command)，若不存在則前端引導下載

建議先用方案 A，保持簡單。

---

## 10. 效能預估

### 單次搜尋延遲（Apple Silicon M1+）

| 步驟 | 延遲 |
|------|------|
| embed query | ~8-12ms |
| 讀出向量 BLOB | ~2-5ms |
| cosine 掃描 2,400 vectors | ~2-5ms |
| **總計** | **~12-22ms** |

使用者無感（<200ms debounce）。

### 批量 embed

| 場景 | 節點數 | 延遲 |
|------|--------|------|
| Context 首次向量化 | 50 | ~0.4-0.6s |
| Context 首次向量化 | 100 | ~0.6-1.0s |
| Root 改名 re-embed | 80 | ~0.5-0.8s |
| 全量重建 | 2,400 | ~8-15s |

### 儲存

```
每個 node = 1,536 bytes (384 × f32) + ~200 bytes (input_text + metadata)
1,000 nodes ≈ 1.7MB
10,000 nodes ≈ 17MB
```

---

## 11. 實施步驟

### Step 1: Rust 基礎建設

1. `Cargo.toml` 加入 `fastembed = "4"`
2. 建立 `src-tauri/src/embedding.rs`
   - `get_model()` — OnceLock lazy init
   - `embed_texts(texts)` — batch embed with "passage: " prefix
   - `embed_query(query)` — single embed with "query: " prefix
   - `cosine_similarity(a, b)`
   - `build_ancestor_path(db, node_id)` — 走 parent_id 鏈 + 截斷
3. `db.rs` 新增 `node_embeddings` 表的 CREATE TABLE
4. 在 `main.rs` 加 `mod embedding;`

### Step 2: Rust 搜尋 Command

5. 建立 `src-tauri/src/commands/search.rs`
   - `semantic_search(query, top_k)` — embed query + cosine scan + return top-K
   - `embed_context_nodes(context_id)` — batch embed 全部 node
   - `embed_single_node(node_id)` — 單 node embed / re-embed
6. `main.rs` 註冊 3 個新 command
7. `commands/mod.rs` 加 `pub mod search;`

### Step 3: 前端 IPC 層

8. `constants.ts` 加入 3 個新 IpcCmd
9. `ipc.ts` 加入 3 個新 invoke wrapper
10. `types.ts` 加入 `SearchResult` type

### Step 4: NodeSearch 重寫

11. 改寫 `NodeSearch.tsx`
    - 移除 `flattenTree` + 前端 filter 邏輯
    - 加入 debounce + `ipc.semanticSearch` call
    - 新 result row layout（跨 context 資訊）
    - 跨 context 選取邏輯（先 switchContext 再 selectNode）
    - Loading state + empty state
12. 新增 i18n keys（loading、downloading model 等）

### Step 5: 增量 Embedding 整合

13. `treeStore.ts` — 在 addChild/addSibling/updateNodeTitle/dragMoveNode 後 fire-and-forget embed
14. `contextStore.ts` — 在 switchContext 時檢查並 batch embed
15. `contextStore.ts` — 在 renameContext 後 re-embed 整個 context

### Step 6: 驗證

16. `pnpm tauri dev` 測試
    - 建立多個 context + nodes
    - ⌘F 搜尋驗證語意結果品質
    - 跨 context 選取驗證
    - node 編輯/移動後 re-embed 驗證
    - 首次使用模型下載體驗

---

## 12. 待確認

| # | 問題 | 建議 |
|---|------|------|
| 1 | 搜尋結果是否顯示 similarity score | **顯示**（灰色小字），幫助使用者判斷相關度 |
| 2 | 首次模型下載的 UX | **方案 A**（不確定進度條），保持簡單 |
| 3 | VAULT context 的 node 是否也要搜尋 | **不搜尋** — VAULT node 已從 DB 刪除，未來由 VAULT 專屬搜尋處理 |
| 4 | 搜尋結果中不同 context 的同名 node 如何區分 | 已在設計中解決 — 每行顯示 context name |
| 5 | 模型記憶體佔用 (~200-300MB) 是否需要 idle 卸載 | **不需要** — 桌面 app 常駐合理，避免重新載入延遲 |

---

## 13. 檔案修改清單

| 檔案 | 動作 |
|------|------|
| `src-tauri/Cargo.toml` | 新增 `fastembed` 依賴 |
| `src-tauri/src/embedding.rs` | **新建** — 模型管理 + embed + cosine + 路徑建構 |
| `src-tauri/src/commands/search.rs` | **新建** — 3 個 Tauri command |
| `src-tauri/src/commands/mod.rs` | 加 `pub mod search` |
| `src-tauri/src/db.rs` | 新增 `node_embeddings` CREATE TABLE |
| `src-tauri/src/main.rs` | 註冊 3 個新 command + `mod embedding` |
| `src/lib/constants.ts` | 新增 3 個 IpcCmd |
| `src/lib/ipc.ts` | 新增 3 個 invoke wrapper |
| `src/lib/types.ts` | 新增 `SearchResult` type |
| `src/components/NodeSearch.tsx` | **重寫** — 語意搜尋 UI |
| `src/stores/treeStore.ts` | 增量 embed trigger（fire-and-forget） |
| `src/stores/contextStore.ts` | switchContext batch embed + renameContext re-embed |
