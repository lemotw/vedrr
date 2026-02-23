# Eng-2: 後端可行性評估

> 2026-02-23 | Eng-2 (後端工程師) 產出
> 功能：「隨手丟 idea → 自動分入 context tree」

---

## 技術評估摘要

**可行性：高。** 核心基礎設施（SQLite、LLM API 呼叫、Keychain）已完備，主要工作是新增 `inbox` 表、設計分類 prompt、新增約 4 個 Rust command。現有 `compact_node` 的 async LLM 模式可直接復用，風險相對低。

**最大技術挑戰：**
1. 分類時需載入所有 active contexts 的 tree summaries（效能：O(n contexts)）
2. LLM JSON 解析穩定性（現有 compact 已有此問題）
3. 無 migration 系統下安全新增資料表

---

## DB Schema 變更方案

### 新增 `inbox_items` 表

```sql
CREATE TABLE IF NOT EXISTS inbox_items (
    id TEXT PRIMARY KEY,                          -- UUID v4
    content TEXT NOT NULL,                        -- idea 文字內容
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'paste', 'shortcut')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'classified', 'dismissed')),
    suggested_context_id TEXT,                    -- 分類建議的 context（可為 NULL）
    suggested_parent_id TEXT,                     -- 建議插入的父節點
    suggested_title TEXT,                         -- LLM 建議的節點標題（可與 content 不同）
    suggested_node_type TEXT NOT NULL DEFAULT 'text'
        CHECK (suggested_node_type IN ('text', 'markdown', 'image', 'file')),
    classify_reasoning TEXT,                      -- LLM 說明分類理由（可選）
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    classified_at TEXT,                           -- 分類完成時間
    applied_at TEXT                               -- 使用者確認套用時間
);

CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox_items(status);
```

**欄位說明：**
| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | TEXT PK | UUID v4 |
| `content` | TEXT | 原始 idea 文字 |
| `source` | TEXT | 來源（手動輸入 / 貼上 / 快捷鍵） |
| `status` | TEXT | `pending` → `classified` → (applied/dismissed) |
| `suggested_context_id` | TEXT nullable | FK → contexts.id（邏輯參照，無硬 FK） |
| `suggested_parent_id` | TEXT nullable | 建議的父節點 ID |
| `suggested_title` | TEXT nullable | LLM 重寫後的標題（可比 content 更簡潔） |
| `suggested_node_type` | TEXT | 建議的節點類型，預設 text |
| `classify_reasoning` | TEXT nullable | LLM 回傳的分類說明 |
| `classified_at` / `applied_at` | TEXT | 時間戳 |

**設計考量：**
- 不建立硬 FK（`suggested_context_id` → contexts.id），因為 context 可能被刪除，inbox 應能獨立存在
- `status` 使用 CHECK constraint，與現有 contexts.state 一致
- 不建立 `idea_links` 或多對多關聯表 — 每個 idea 對應一個建議位置已足夠，複雜度可控

### 不需要的額外表
- **不需要 `idea_tags` 表**：tags 可直接存 inbox_items 的 JSON 欄位（若未來需要）
- **不需要 `classification_history` 表**：過於複雜，初版不做

---

## 新增 Rust Commands 清單

| Command | 類型 | 參數 | 回傳 | 說明 |
|---------|------|------|------|------|
| `capture_idea` | sync | `content: String, source: String` | `InboxItem` | 將 idea 存入 inbox（status=pending） |
| `list_inbox` | sync | `status: Option<String>` | `Vec<InboxItem>` | 列出 inbox items，可依 status 過濾 |
| `classify_idea` | **async** | `item_id: String, profile_id: String` | `InboxItem` | 呼叫 LLM 分類單一 idea，更新 status=classified |
| `apply_idea` | sync | `item_id: String` | `TreeNode` | 將分類結果插入對應 context tree |
| `dismiss_idea` | sync | `item_id: String` | `()` | 捨棄 idea（status=dismissed） |
| `batch_classify_ideas` | **async** | `item_ids: Vec<String>, profile_id: String` | `Vec<InboxItem>` | 批次分類（逐一呼叫 LLM，transaction 保護） |

**對應 IPC 前端呼叫（`ipc.ts` 新增）：**
```typescript
captureIdea: (content: string, source: string) => invoke<InboxItem>(...)
listInbox: (status?: string) => invoke<InboxItem[]>(...)
classifyIdea: (itemId: string, profileId: string) => invoke<InboxItem>(...)
applyIdea: (itemId: string) => invoke<TreeNode>(...)
dismissIdea: (itemId: string) => invoke<void>(...)
batchClassifyIdeas: (itemIds: string[], profileId: string) => invoke<InboxItem[]>(...)
```

**新增 Rust model：**
```rust
// models.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboxItem {
    pub id: String,
    pub content: String,
    pub source: String,
    pub status: String,
    pub suggested_context_id: Option<String>,
    pub suggested_parent_id: Option<String>,
    pub suggested_title: Option<String>,
    pub suggested_node_type: String,
    pub classify_reasoning: Option<String>,
    pub created_at: String,
    pub classified_at: Option<String>,
    pub applied_at: Option<String>,
}
```

---

## AI 分類技術方案

### 分類 Prompt 設計

分類和 compact 的 prompt 性質不同：compact 是重組現有 tree；分類是將新 idea 放入已有架構。

**需要傳給 LLM 的資訊：**
1. idea 原文
2. 所有 active contexts 的摘要（名稱 + 一層子節點標題）
3. 若已知候選 context，則傳入 context 的完整子樹（供選擇插入位置）

**兩階段分類策略（建議）：**

**Phase 1：選 context（輕量 prompt）**
```
給定以下 contexts 列表（名稱 + 第一層節點）：
[context summaries]

新 idea：「{content}」

請選擇最適合的 context，或回傳 null 表示不確定。
只回傳 JSON：{"context_id": "...", "reasoning": "..."}
```

**Phase 2：選插入位置（深度 prompt，可選）**
```
以下是 context「{name}」的樹結構：
[tree text]

新 idea：「{content}」

請選擇最適合的父節點，並建議 title 和 node_type。
只回傳 JSON：{"parent_id": "...", "title": "...", "node_type": "text", "reasoning": "..."}
```

**初版簡化：單次 prompt 同時選 context + 位置**
- 減少 LLM 呼叫次數（從 2 次降至 1 次）
- 風險：prompt 過長，JSON 結構複雜
- 建議：先做單次 prompt，若穩定性不夠再拆成兩階段

### 復用現有 `call_llm` 函式

`ai.rs` 的 `call_llm` 已支援 Anthropic + OpenAI，可直接復用。新增 `classify_idea` command 結構與 `compact_node` 幾乎相同：

```rust
pub async fn classify_idea(
    state: State<'_, AppState>,
    item_id: String,
    profile_id: String,
) -> Result<InboxItem, MindFlowError> {
    // 1. 讀取 inbox item + 所有 active contexts + profile（持有 lock）
    // 2. 釋放 DB lock（重要！同 compact_node 做法）
    // 3. 取得 API key from Keychain
    // 4. 建構分類 prompt
    // 5. call_llm(...)
    // 6. 解析 JSON → 更新 inbox item status=classified
    // 7. 重新取得 lock，UPDATE inbox_items WHERE id = item_id
    // 8. 回傳更新後的 InboxItem
}
```

### Context Summaries 建構

分類 prompt 需要所有 active contexts 的摘要。建議新增 helper 函式：

```rust
fn build_context_summaries(db: &Connection) -> Result<Vec<ContextSummary>, MindFlowError> {
    // SELECT contexts WHERE state = 'active'
    // 對每個 context：SELECT title FROM tree_nodes WHERE parent_id = root_node_id LIMIT 10
    // 輸出格式：Vec<{context_id, name, top_level_nodes: Vec<String>}>
}
```

---

## 效能考量與優化策略

### 主要效能瓶頸

| 瓶頸 | 場景 | 規模預估 | 影響 |
|------|------|---------|------|
| **載入所有 context summaries** | 每次 classify_idea | 10-50 contexts × 10 nodes = 500 DB rows | 可接受（< 5ms） |
| **LLM API 延遲** | 每次 classify_idea | 2-8 秒（GPT-4o / Claude） | 主要瓶頸，UI 需 loading state |
| **批次分類** | batch_classify_ideas | N × LLM latency，串行 | N=10 → 20-80 秒，太慢 |
| **prompt 長度** | 含完整 tree 時 | 可能超過 8k tokens | API 費用 + latency 上升 |

### 優化策略

**短期（MVP）：**
1. **Context summary 只取第一層**：不載入完整 tree，只取 `parent_id = root_node_id` 的子節點標題，大幅縮短 prompt
2. **串行批次**：`batch_classify_ideas` 先實作為逐一呼叫，每次呼叫間更新 status
3. **Mutex lock 提前釋放**：同 `compact_node` 做法，所有 DB 讀取完後立即 drop lock 再呼叫 LLM

**中期：**
4. **並行 LLM 呼叫**：使用 `tokio::join_all` 同時發送多個分類請求（需注意 rate limit）
5. **Context summary 快取**：在 `AppState` 加入 `context_summary_cache: Mutex<Option<Vec<...>>>` 加速重複分類
6. **prompt token 限制**：超過 N 個 contexts 時只傳最近使用的 top-K

### DB 並行問題

`classify_idea` 是 async command，必須遵循現有 `compact_node` 的 pattern：
1. lock → 讀資料 → drop lock
2. async LLM 呼叫（lock 已釋放）
3. lock → 寫回結果 → drop lock

**不可以**在 async 期間持有 `Mutex<Connection>`，否則會死鎖其他 sync commands。

---

## Migration 策略

### 現狀分析

現有 `db.rs` 的 `init_db()` 使用 `CREATE TABLE IF NOT EXISTS`，**只能新增表，無法 ALTER TABLE**。

### 新增 `inbox_items` 表的安全策略

由於只需要新增一張新表，`CREATE TABLE IF NOT EXISTS` 完全足夠，不需要 migration 系統：

```rust
// db.rs 的 init_db() 末尾新增
CREATE TABLE IF NOT EXISTS inbox_items (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'paste', 'shortcut')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'classified', 'dismissed')),
    suggested_context_id TEXT,
    suggested_parent_id TEXT,
    suggested_title TEXT,
    suggested_node_type TEXT NOT NULL DEFAULT 'text'
        CHECK (suggested_node_type IN ('text', 'markdown', 'image', 'file')),
    classify_reasoning TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    classified_at TEXT,
    applied_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox_items(status);
```

### 若未來需要 ALTER TABLE

若未來需要修改既有表（如 contexts 加欄位），建議引入輕量 migration 系統：

```sql
-- 新增 schema_version 表
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
```

```rust
// 簡單版本管理
fn apply_migrations(conn: &Connection) -> Result<(), MindFlowError> {
    let version: i32 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |row| row.get(0))
        .unwrap_or(0);

    if version < 1 {
        conn.execute_batch("ALTER TABLE contexts ADD COLUMN xyz TEXT;")?;
        conn.execute("INSERT INTO schema_version VALUES (1)", [])?;
    }
    // ...
}
```

**本次功能不需要 migration，直接新增表即可。**

---

## 改動範圍估算

### 後端 Rust 檔案

| 檔案 | 變動類型 | 工作量 | 說明 |
|------|---------|--------|------|
| `src-tauri/src/db.rs` | 修改 | **S** | 在 `init_db()` 加 inbox_items 表建立語句 |
| `src-tauri/src/models.rs` | 修改 | **S** | 新增 `InboxItem` struct |
| `src-tauri/src/commands/inbox.rs` | **新增** | **L** | 6 個 commands：capture/list/classify/apply/dismiss/batch_classify |
| `src-tauri/src/commands/ai.rs` | 修改 | **M** | 抽取 `call_llm` 為 pub fn（供 inbox.rs 復用）、新增 context summaries helper |
| `src-tauri/src/main.rs` | 修改 | **S** | 引入 inbox 模組、註冊 6 個新 commands |
| `src-tauri/src/error.rs` | 修改（可選） | **S** | 新增 `InboxItemNotFound` error variant |

### 前端 TypeScript 檔案

| 檔案 | 變動類型 | 工作量 | 說明 |
|------|---------|--------|------|
| `src/lib/ipc.ts` | 修改 | **S** | 新增 6 個 ipc wrapper |
| `src/lib/constants.ts` | 修改 | **S** | 新增 IpcCmd 常數、InboxStatus enum |
| `src/lib/types.ts` | 修改 | **S** | 新增 InboxItem TypeScript 介面 |
| `src/stores/inboxStore.ts` | **新增** | **M** | Inbox Zustand store（list/capture/classify/apply/dismiss） |
| `src/components/InboxPanel.tsx` | **新增** | **L** | Inbox UI（列表、快速輸入、分類結果、套用/捨棄） |
| `src/components/QuickCapture.tsx` | **新增** | **M** | 快速捕獲輸入框（可能整合到 StatusBar 或 floating） |

### 工作量總計

| 層 | S | M | L | 合計人日估算 |
|----|---|---|---|------------|
| 後端 | 4 | 1 | 1 | ~3-4 天 |
| 前端 | 3 | 2 | 1 | ~4-5 天 |
| **總計** | | | | **約 7-9 天** |

---

## 技術風險與建議

### 風險 1：LLM 分類 JSON 格式不穩定（高風險）

**現況**：`compact_node` 已有此問題（見後端 context 文件「LLM 回應解析脆弱」）。

**分類比 compact 更難**：compact 只需回傳 tree 結構；分類需要回傳 `context_id`（必須是真實存在的 UUID），若 LLM 幻覺生成不存在的 ID 會直接失敗。

**建議**：
- Prompt 中明確列出所有 context IDs，要求只選其中之一
- 解析後立即驗證 `suggested_context_id` 是否在 active contexts 列表中
- 若驗證失敗，回退為 `suggested_context_id = NULL`（需使用者手動選擇）
- 加入 retry 機制（最多 2 次，不增加太多延遲）

### 風險 2：async command 的 Mutex lock 管理（中風險）

**現況**：`compact_node` 已有正確做法（讀取 → 釋放 lock → async LLM → 重新取 lock → 寫回）。

**建議**：`classify_idea` 和 `batch_classify_ideas` 必須嚴格遵循相同 pattern，不可在 async 期間持有 lock。

### 風險 3：批次分類效能（中風險）

**問題**：10 個 ideas 串行分類 = 20-80 秒，使用者體驗差。

**建議**：
- 初版先做串行，UI 顯示進度（「正在分類 3/10...」）
- 用 Tauri event system (`emit`) 即時推送每個 idea 的分類結果
- 中期改用 `tokio::join_all` 並行（需注意 API rate limit）

### 風險 4：Inbox apply 時 context 已被刪除（低風險）

**問題**：`suggested_context_id` 對應的 context 可能在分類後、套用前被使用者刪除。

**建議**：`apply_idea` command 需先驗證 `suggested_context_id` 存在，若不存在回傳錯誤讓前端提示使用者重新選擇。

### 風險 5：Prompt 長度超限（低風險，但需監控）

**問題**：contexts 數量多時，summaries 可能超過 LLM context window。

**建議**：Context summary 只取每個 context 的前 10 個一層節點，並在 prompt 建構時計算預估 token 數（粗估：1 token ≈ 4 字元），超過 threshold 時裁減 contexts 數量。

---

## 推薦的實作優先順序

### Phase 1：純後端（2-3 天）

1. `db.rs`：新增 `inbox_items` 表
2. `models.rs`：新增 `InboxItem` struct
3. `commands/inbox.rs`：實作 `capture_idea` + `list_inbox`（sync，先不做 LLM）
4. `main.rs`：註冊 commands
5. 驗證：用 IPC 呼叫確認 DB 讀寫正常

### Phase 2：AI 分類核心（2-3 天）

6. `commands/ai.rs`：將 `call_llm` 改為 `pub fn`
7. `commands/inbox.rs`：實作 `classify_idea`（async，single LLM call）
8. 設計並測試 classify prompt（在 Playground 測試 prompt 穩定性）
9. 實作 `apply_idea`（將分類結果插入 context tree，調用已有 `create_node` 邏輯）
10. 實作 `dismiss_idea`

### Phase 3：批次 + 穩定性（1-2 天）

11. 實作 `batch_classify_ideas`（串行版）
12. 加入分類結果驗證（context_id 存在性檢查）
13. 加入 retry 機制（解析失敗時最多 retry 2 次）

### Phase 4：前端 UI（4-5 天，Eng-1 負責）

14. `inboxStore.ts`、`ipc.ts`、`types.ts`、`constants.ts` 更新
15. `InboxPanel.tsx` 和 `QuickCapture.tsx` 元件

---

## 附錄：現有可復用程式碼

| 程式碼 | 位置 | 復用方式 |
|--------|------|---------|
| `call_llm()` | `ai.rs:262` | 改 pub，直接呼叫 |
| `build_subtree()` | `ai.rs:124` | 若需傳完整 tree 給 LLM 分類 |
| `tree_to_prompt_text()` | `ai.rs:194` | 建構 context 摘要 |
| `parse_proposed_nodes()` | `ai.rs:351` | 可參考，但 inbox 回傳格式不同需另寫 |
| `create_node` 邏輯 | `node.rs:86` | `apply_idea` 時直接呼叫已有 command |
| UUID 生成 | 全域 | `uuid::Uuid::new_v4().to_string()` |
| Keychain 存取 | `ai.rs:15-43` | 直接復用（API key 無變化） |
