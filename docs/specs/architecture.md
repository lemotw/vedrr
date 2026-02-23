# Mind Flow 架構文件

> 2026-02-19

---

## 總覽

```
┌─────────────────────────────────────────────────────┐
│                   Tauri Window                       │
│  ┌───────────────────────────────────────────────┐  │
│  │              React Frontend                    │  │
│  │                                                │  │
│  │  Component ──→ Zustand Store ──→ ipc.ts        │  │
│  │                                    │           │  │
│  └────────────────────────────────────┼───────────┘  │
│                                       │ invoke()     │
│  ┌────────────────────────────────────┼───────────┐  │
│  │              Rust Backend          ▼           │  │
│  │                                                │  │
│  │  #[tauri::command] ──→ AppState { db: Mutex }  │  │
│  │                              │                 │  │
│  │                              ▼                 │  │
│  │                     SQLite (rusqlite)           │  │
│  │                   ~/MindFlow/data/mindflow.db  │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 資料流

```
使用者操作（鍵盤/點擊）
      │
      ▼
React Component（NodeCard, TreeCanvas, QuickSwitcher...）
      │
      ▼
Zustand Store（contextStore / treeStore / uiStore）
      │  呼叫 ipc wrapper
      ▼
src/lib/ipc.ts ── invoke(commandName, { params })
      │
      │  Tauri IPC bridge（自動 camelCase → snake_case）
      ▼
Rust #[tauri::command] fn（commands/context.rs, node.rs, file_ops.rs）
      │
      ▼
AppState { db: Mutex<Connection> } ── SQL query
      │
      ▼
SQLite ~/MindFlow/data/mindflow.db
```

---

## 前端架構（React + TypeScript）

### 檔案對應

```
src/
├── App.tsx                     # 啟動入口：初始化主題、載入 contexts、組合所有元件
├── index.css                   # Tailwind v4 @theme tokens + 主題 CSS 變數覆蓋
│
├── components/
│   ├── StatusBar.tsx            # 頂部列：context 名稱 + 主題切換 + ⌘K
│   ├── TreeCanvas.tsx           # 水平樹 + 連接線 + hover "+" 按鈕 + 拖曳排序
│   ├── NodeCard.tsx             # 節點卡片（root heading / card / 圖片縮圖 / lightbox）
│   ├── ContentPanel.tsx         # 右側 Markdown 編輯面板
│   ├── MarkdownEditor.tsx       # Tiptap 編輯器 + toolbar
│   ├── QuickSwitcher.tsx        # ⌘K 搜尋/切換/建立/歸檔 context
│   ├── NodeTypePopover.tsx      # 節點類型選擇器（T/M/I/F）
│   ├── NodeSearch.tsx           # ⌘F 節點搜尋
│   ├── ContextMenu.tsx          # 右鍵選單
│   └── ThemeSwitcher.tsx        # 主題切換 popover + 自定義色彩編輯器
│
├── hooks/
│   └── useKeyboard.ts           # 全域 keydown + paste listener（vim 風格導航）
│
├── stores/
│   ├── contextStore.ts          # Context CRUD（list/switch/create/archive/delete）
│   ├── treeStore.ts             # Tree + Node CRUD（select/add/delete/move/paste/undo）
│   └── uiStore.ts               # UI 狀態（popover/editor/theme/collapse）
│
└── lib/
    ├── constants.ts             # 集中管理所有 enum：NodeTypes, Themes, IpcCmd...
    ├── types.ts                 # TypeScript 型別 + NODE_TYPE_CONFIG
    └── ipc.ts                   # Tauri invoke wrappers（18 calls）
```

### Zustand Stores 職責

| Store | 職責 | 持久化 |
|-------|------|--------|
| `contextStore` | Context 列表、當前 context ID、CRUD 操作 | SQLite（via IPC） |
| `treeStore` | 樹狀資料、選取節點、複製/剪下/貼上、undo stack | SQLite（via IPC） |
| `uiStore` | UI 開關（popover/editor/switcher）、主題、收折狀態 | localStorage（主題） |

### ipc.ts → Rust 對應表

| ipc 方法 | Rust command | 說明 |
|----------|-------------|------|
| `ipc.createContext(name, tags)` | `create_context` | 建立 context + root node |
| `ipc.listContexts()` | `list_contexts` | 列出所有 context（含 node_count） |
| `ipc.switchContext(id)` | `switch_context` | 更新 last_accessed_at |
| `ipc.archiveContext(id)` | `archive_context` | state → archived |
| `ipc.activateContext(id)` | `activate_context` | state → active |
| `ipc.renameContext(id, name)` | `rename_context` | 更新 context name + root node title |
| `ipc.deleteContext(id)` | `delete_context` | CASCADE 刪除 context + 所有 nodes |
| `ipc.getTree(contextId)` | `get_tree` | 回傳遞迴 TreeData（node + children） |
| `ipc.createNode(contextId, parentId, nodeType, title)` | `create_node` | 建立子節點 |
| `ipc.updateNode(id, updates)` | `update_node` | 更新 title/content/nodeType/filePath |
| `ipc.deleteNode(id)` | `delete_node` | 刪除節點（子節點 CASCADE） |
| `ipc.moveNode(id, newParentId, position)` | `move_node` | 移動節點到新 parent + position |
| `ipc.cloneSubtree(sourceId, targetParentId, contextId)` | `clone_subtree` | 深拷貝子樹（用於 ⌘V 貼上） |
| `ipc.restoreNodes(nodes)` | `restore_nodes` | 批量還原節點（用於 undo） |
| `ipc.readFileBytes(filePath)` | `read_file_bytes` | 讀取檔案為 byte array |
| `ipc.saveClipboardImage(contextId, nodeId, data, ext)` | `save_clipboard_image` | 儲存剪貼簿圖片到 ~/MindFlow/files/ |
| `ipc.importImage(contextId, nodeId, sourcePath)` | `import_image` | 複製外部圖片到 ~/MindFlow/files/ |
| `ipc.revealFile(filePath)` | *(plugin-opener)* | 在 Finder/Explorer 中顯示檔案 |
| `ipc.pickFile()` / `ipc.pickImage()` | *(plugin-dialog)* | 系統檔案選擇對話框 |

### IPC 注意事項

- 前端用 **camelCase** 傳參數，Tauri 自動轉成 Rust 的 **snake_case**
  - 例：`{ contextId }` → Rust 接收 `context_id: String`
- Rust command 回傳 `Result<T, MindFlowError>`，`MindFlowError` 實作 `Serialize` 變成字串回前端
- 前端用 `invoke<ReturnType>(commandName, params)` 呼叫，回傳 `Promise<ReturnType>`

---

## 後端架構（Rust）

### 檔案對應

```
src-tauri/src/
├── main.rs           # Tauri 入口：初始化 DB、註冊 plugins、註冊 commands
├── db.rs             # DB 路徑 + Schema 初始化（CREATE TABLE）
├── models.rs         # 資料結構：Context, ContextSummary, TreeNode, TreeData
├── error.rs          # MindFlowError enum（Serialize for IPC）
└── commands/
    ├── context.rs    # 7 個 context 相關 commands
    ├── node.rs       # 7 個 node 相關 commands（含 get_tree 遞迴組裝）
    └── file_ops.rs   # 3 個檔案操作 commands
```

### AppState

```rust
pub struct AppState {
    pub db: Mutex<Connection>,  // 單一 SQLite 連線，Mutex 保護
}
```

所有 `#[tauri::command]` 透過 `State<AppState>` 取得 DB 連線。

---

## SQLite Schema

位置：`~/MindFlow/data/mindflow.db`
定義：`src-tauri/src/db.rs` → `init_db()`
模式：WAL mode + foreign_keys ON

### contexts 表

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | TEXT PK | UUID v4 |
| `name` | TEXT NOT NULL | Context 名稱 |
| `state` | TEXT NOT NULL | `active` / `archived` / `vault` |
| `tags` | TEXT NOT NULL | JSON array 字串，預設 `[]` |
| `root_node_id` | TEXT | 指向 tree_nodes.id（根節點） |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |
| `last_accessed_at` | TEXT | ISO datetime，switch 時更新 |

### tree_nodes 表

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | TEXT PK | UUID v4 |
| `context_id` | TEXT NOT NULL | FK → contexts.id, **ON DELETE CASCADE** |
| `parent_id` | TEXT | FK → tree_nodes.id, ON DELETE SET NULL |
| `position` | INTEGER NOT NULL | 同層排序，0-based |
| `node_type` | TEXT NOT NULL | `text` / `markdown` / `image` / `file` |
| `title` | TEXT NOT NULL | 節點標題 |
| `content` | TEXT | Markdown HTML 內容（markdown 類型用） |
| `file_path` | TEXT | 檔案絕對路徑（image/file 類型用） |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

### 索引

```sql
idx_nodes_context ON tree_nodes(context_id)
idx_nodes_parent  ON tree_nodes(parent_id)
```

### 關係圖

```
contexts 1 ──────< tree_nodes
    │                   │
    │ root_node_id ───→ │ id
    │                   │
                        │ parent_id ───→ id (self-referencing)
```

---

## 檔案儲存

```
~/MindFlow/
├── data/
│   └── mindflow.db          # SQLite 資料庫
└── files/
    └── {context_id}/
        └── {node_id_prefix}.{ext}   # 圖片/檔案
```

- 圖片透過 `save_clipboard_image` 或 `import_image` 複製進來
- 前端透過 `read_file_bytes` → `Blob` → `ObjectURL` 顯示（不用 asset protocol）
- 刪除 context 時 CASCADE 刪 nodes，但 **files/ 目錄不會自動清理**

---

## 型別對照（Rust ↔ TypeScript）

| Rust struct | TS interface | 用途 |
|------------|-------------|------|
| `Context` | `Context` | 完整 context 資料 |
| `ContextSummary` | `ContextSummary` | 列表顯示（含 node_count） |
| `TreeNode` | `TreeNode` | 單一節點 |
| `TreeData` | `TreeData` | 遞迴樹（node + children） |
| `MindFlowError` | `string`（rejected promise） | 錯誤訊息 |
