# Mind Flow — Code Architecture Index

> 詳細架構與 gotchas 見 `/CLAUDE.md`。本文件為快速查表。
> 最後更新：2025-02-16

## IPC 對照

| Frontend call | → Rust command | 功能 |
|---------------|---------------|------|
| `ipc.createContext(name, tags)` | `create_context` | 建立 context + root node |
| `ipc.listContexts()` | `list_contexts` | 列出所有 contexts（含 node_count） |
| `ipc.switchContext(id)` | `switch_context` | 切換 + 更新 last_accessed_at |
| `ipc.archiveContext(id)` | `archive_context` | state → archived |
| `ipc.activateContext(id)` | `activate_context` | state → active |
| `ipc.renameContext(id, name)` | `rename_context` | 改名 context + sync root node title |
| `ipc.deleteContext(id)` | `delete_context` | 刪除 context（CASCADE 刪 nodes） |
| `ipc.getTree(contextId)` | `get_tree` | 遞迴查詢整棵 tree |
| `ipc.createNode(contextId, parentId, nodeType, title)` | `create_node` | 建立 node（position = max+1） |
| `ipc.updateNode(id, {title?, content?, nodeType?, filePath?})` | `update_node` | 更新 node 指定欄位 |
| `ipc.deleteNode(id)` | `delete_node` | 遞迴刪除子樹 |
| `ipc.moveNode(id, newParentId, position)` | `move_node` | 移動 node 到新 parent |
| `ipc.readFileBytes(filePath)` | `read_file_bytes` | 讀取檔案原始 bytes（用於圖片渲染） |
| `ipc.saveClipboardImage(contextId, nodeId, data, ext)` | `save_clipboard_image` | 剪貼簿圖片存檔 → 回傳路徑 |
| `ipc.importImage(contextId, nodeId, sourcePath)` | `import_image` | 複製圖片到 app 儲存區 → 回傳路徑 |
| `ipc.revealFile(filePath)` | (plugin-opener) | 在 Finder 中顯示檔案 |
| `ipc.pickFile()` | (plugin-dialog) | 系統檔案選擇器 |
| `ipc.pickImage()` | (plugin-dialog) | 系統圖片選擇器（限 png/jpg/gif/webp） |

## Store Actions 快速查表

### contextStore
`loadContexts` `createContext` `switchContext` `archiveContext` `deleteContext` `renameContext`

### treeStore
`loadTree` `selectNode` `addChild` `addSibling` `deleteNode` `updateNodeTitle` `updateNodeType` `updateNodeContent` `pasteAsNode` `openOrAttachFile` `pickAndImportImage`

### uiStore
`openQuickSwitcher` `closeQuickSwitcher` `toggleQuickSwitcher` `setEditingNode` `openTypePopover` `closeTypePopover` `openMarkdownEditor` `closeMarkdownEditor`

## 常數定義（src/lib/constants.ts）

| 常數 | 值 | 用途 |
|------|-----|------|
| `NodeTypes` | TEXT, MARKDOWN, IMAGE, FILE | 節點類型判斷、建立 |
| `ContextStates` | ACTIVE, ARCHIVED, VAULT | Context 狀態篩選 |
| `IpcCmd` | 16 個 Tauri invoke 命令名 | ipc.ts invoke 呼叫 |
| `PasteKind` | IMAGE, TEXT | 貼上處理分派 |
| `imageMime(ext)` | ext → MIME string | 圖片 Blob 建立 |

## 快捷鍵完整對照

| 快捷鍵 | 條件 | 動作 |
|--------|------|------|
| j / ↓ | tree focused | 下一個同級 node（breadth） |
| k / ↑ | tree focused | 上一個同級 node（breadth） |
| l / → | tree focused + has children | 第一個子節點（depth） |
| h / ← | tree focused + has parent | 父節點（depth） |
| Enter | tree focused + selected | 進入 inline edit |
| Tab | tree focused + selected | 新增子節點 |
| Shift+Tab | tree focused + selected | 新增同級節點 |
| t | tree focused + selected | 開啟 type popover |
| 1-4 | type popover open | 快速切換 type |
| o | tree focused + FILE/IMAGE node | FILE: attach/reveal、IMAGE: pick image |
| Backspace/Delete | tree focused + selected + not root | 刪除節點 |
| Ctrl+V | tree focused + selected | 貼上為新 node（自動偵測圖片） |
| ⌘K | always | Quick Switcher |
| Escape | lightbox / edit / popover / markdown editor | 關閉 |
