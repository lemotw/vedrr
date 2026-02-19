# AI Compact 設計文件

> 2026-02-19

---

## 目標

選中節點後觸發 AI Compact，LLM 分析子樹並建議重組。以色彩標註的預覽 diff 呈現變更，使用者確認後批量套用。

## 架構決策

| 項目 | 決策 | 理由 |
|------|------|------|
| LLM Provider | 可切換（Anthropic / OpenAI） | 使用者自選 |
| API 呼叫層 | Rust backend（reqwest） | Key 不暴露給 WebView |
| API Key 存儲 | OS Keychain（keyring crate） | macOS Keychain / Windows Credential Manager |
| Compact 範圍 | 選中節點子樹 + 祖先路徑當參考 | 平衡 token 用量與上下文 |
| LLM 回傳格式 | Hybrid — 完整新樹 + `_sourceId` | 格式簡單、對應明確 |
| Diff 計算 | 前端 TypeScript | 跟 UI 互動耦合，方便迭代 |
| 操作種類 | 刪除 + 新增 + 編輯標題 + 移動 | 完整版 |

---

## 資料流

```
前端：觸發 Compact(nodeId, contextId)
         │  IPC invoke
         ▼
Rust backend：
  1. SQLite 查詢子樹（複用 get_tree 邏輯）
  2. 查詢祖先路徑（parent_id 鏈上溯到 root）
  3. 序列化成 prompt text
  4. 從 ai_settings 讀 provider + model，從 Keychain 讀 API key
  5. reqwest 呼叫 LLM API
  6. 解析 JSON 回傳，驗證格式
  7. 回傳 CompactResult { original, proposed }
         │  IPC response
         ▼
前端：
  1. compactDiff() 比對 original vs proposed（用 _sourceId）
  2. 顯示 CompactPreview modal（色彩標註）
  3. 使用者確認 → applyCompact() 批量 IPC 寫入
  4. loadTree() 重新渲染
```

---

## Rust 新增

### 依賴

```toml
# src-tauri/Cargo.toml
reqwest = { version = "0.12", features = ["json"] }
keyring = "3"
```

### DB Schema 變更

```sql
CREATE TABLE IF NOT EXISTS ai_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- keys: "provider" (anthropic/openai), "model" (claude-sonnet-4-20250514/gpt-4o/...)
-- API key 不存 DB，存 OS Keychain
```

### 新增 Commands

```
commands/ai.rs:
  - compact_node(node_id, context_id) → CompactResult
  - get_ai_settings() → HashMap<String, String>
  - set_ai_setting(key, value) → ()
  - set_api_key(provider, key) → ()    // 寫入 Keychain
  - get_api_key(provider) → String     // 從 Keychain 讀取
  - has_api_key(provider) → bool       // 檢查 Keychain 是否有 key
```

### CompactResult 型別

```rust
#[derive(Serialize)]
struct CompactResult {
    original: TreeData,           // 原始子樹
    proposed: Vec<ProposedNode>,  // LLM 建議的新結構
}

#[derive(Serialize, Deserialize)]
struct ProposedNode {
    source_id: Option<String>,    // 對應原始 node id，None = 新增
    title: String,
    node_type: String,
    children: Vec<ProposedNode>,
}
```

---

## Prompt 設計

```
你是一個知識管理助手。以下是一棵樹狀筆記的子樹。

上下文路徑：{ancestor_path}
目標節點及其子樹：
{subtree_text}

請幫我重組這棵子樹，讓結構更清晰。你可以：
- 刪除重複或不需要的節點
- 新增缺少的分類節點
- 修改節點標題讓語意更明確
- 移動節點到更合適的位置

回傳 JSON 格式（只回傳 JSON，不要其他文字）：
{
  "nodes": [
    {
      "source_id": "原始節點ID或null",
      "title": "節點標題",
      "node_type": "text|markdown|image|file",
      "children": [...]
    }
  ]
}

source_id 規則：
- 保留/修改的原始節點 → 填原始 id
- 全新節點 → 填 null
- image/file 類型節點建議保留（有綁定檔案路徑）
```

---

## 前端新增

### 檔案

```
src/
├── lib/
│   └── compactDiff.ts      # diff 演算法
├── components/
│   ├── CompactPreview.tsx   # 預覽 modal
│   └── AISettings.tsx       # AI 設定 popover
```

### Diff 演算法（compactDiff.ts）

```typescript
type DiffType = "unchanged" | "added" | "deleted" | "edited" | "moved";

interface DiffNode {
  type: DiffType;
  title: string;
  nodeType: string;
  originalTitle?: string;   // 編輯時顯示原標題
  sourceId?: string;        // 對應原始 node id
  children: DiffNode[];
}

function computeDiff(original: TreeData, proposed: ProposedNode[]): DiffNode[]
```

**Diff 邏輯：**
1. 建立原始樹 Map：`nodeId → { title, nodeType, parentId }`
2. 遍歷 proposed tree：
   - `source_id == null` → `added`（綠）
   - `source_id` 存在 + title 或 nodeType 改了 → `edited`（黃）
   - `source_id` 存在 + parent 或 position 變了 → `moved`（黃）
   - `source_id` 存在 + 完全一樣 → `unchanged`
3. 原始樹中有但 proposed 沒引用的 id → `deleted`（紅）
4. 回傳合併的 DiffNode 樹（包含 deleted 節點附加在尾部）

### CompactPreview UI

```
┌─────────────────────────────────────────┐
│  ✨ AI Compact                   [X]    │
├─────────────────────────────────────────┤
│                                         │
│  📁 Features                            │
│    ├─ 🟡 UI Components (was: UI)        │
│    │   ├─ ── Theme System               │
│    │   └─ ── Quick Switcher             │
│    ├─ 🟢 Rendering  ← new              │
│    │   └─ ── Tree Canvas Drawing        │
│    └─ 🔴 ~~Old Category~~  ← deleted   │
│                                         │
├─────────────────────────────────────────┤
│  +2 新增  -1 刪除  ~3 修改             │
│                                         │
│         [ 取消 ]    [ 套用變更 ]        │
└─────────────────────────────────────────┘
```

**色彩對應：**

| DiffType | 顏色 | 樣式 |
|----------|------|------|
| deleted | 紅 `#FF4444` | opacity-40 + line-through |
| added | 綠 `#4ADE80` | — |
| edited | 黃 `#FFD54F` | 小字顯示 `(was: 原標題)` |
| moved | 黃 `#FFD54F` | 小字顯示 `↻ moved` |
| unchanged | 正常 text-primary | — |

**快捷鍵：**
- `Enter` = 套用變更
- `Esc` = 取消

### Apply 流程（applyCompact）

1. 按順序執行：
   - 刪除 `deleted` nodes（`ipc.deleteNode`）
   - 新增 `added` nodes（`ipc.createNode`）
   - 更新 `edited` nodes（`ipc.updateNode`）
   - 移動 `moved` nodes（`ipc.moveNode`）
2. 推入 undoStack（snapshot 整棵原始子樹，undo = restoreNodes）
3. `loadTree()` 重新渲染

### AI Settings UI

StatusBar 加齒輪按鈕 → 開啟 AISettings popover：

```
┌────────────────────────┐
│  AI Settings           │
├────────────────────────┤
│  Provider  [Anthropic▾]│
│  Model     [claude-...▾]│
│  API Key   [••••••••]  │
│            [Save Key]  │
│                        │
│  ✓ Key saved           │
└────────────────────────┘
```

- Provider / Model 存 SQLite `ai_settings` 表
- API Key 存 OS Keychain（顯示時遮罩，只能覆寫不能讀取明文）

### 觸發方式

- 右鍵 ContextMenu 新增「AI Compact」選項
- 快捷鍵 `c`（在 useKeyboard 新增）

---

## 新增 IPC 對應表

| ipc 方法 | Rust command | 說明 |
|----------|-------------|------|
| `ipc.compactNode(nodeId, contextId)` | `compact_node` | 呼叫 LLM 取得建議 |
| `ipc.getAiSettings()` | `get_ai_settings` | 讀取 provider/model |
| `ipc.setAiSetting(key, value)` | `set_ai_setting` | 更新 provider/model |
| `ipc.setApiKey(provider, key)` | `set_api_key` | 存 API key 到 Keychain |
| `ipc.hasApiKey(provider)` | `has_api_key` | 檢查有無 API key |
| `ipc.applyCompact(nodeId, contextId, ops)` | `apply_compact` | 批量套用 diff 操作 |
