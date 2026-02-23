# Node Type 專屬行為實作計畫

> 日期：2025-02-15
> 狀態：待審核

---

## 目標

讓 4 種 node type 各自擁有專屬行為，而不是只有 badge 顏色區別。

## 現狀

- DB 已有 `content TEXT` 和 `file_path TEXT` 欄位，但前端完全未使用
- `update_node` 後端已支援 `content` 更新
- 檔案存放位置尚未定義

## 檔案儲存位置

Image 和 File 節點的檔案統一放在使用者可直接存取的目錄：

```
~/MindFlow/files/{context_id}/{node_id}-{original_filename}
```

- 使用者可以用 Finder 瀏覽 `~/MindFlow/files/`
- 按 context 分資料夾，方便管理
- node_id prefix 避免檔名衝突，保留原始檔名方便辨識
- DB 的 `file_path` 存完整絕對路徑

---

## Phase 1：Text 節點 — 多行內容編輯（S）

最小改動，讓 [T] node 能輸入多行文字。

### 方案

選中 node 後，在 tree 下方（或右側）顯示一個簡易 textarea 面板。

### 需要改動

| 範圍 | 檔案 | 說明 |
|------|------|------|
| 前端 | 新建 `src/components/ContentPanel.tsx` | 簡易 textarea，auto-save（debounce 500ms） |
| 前端 | `src/stores/treeStore.ts` | 新增 `updateNodeContent(nodeId, content)` |
| 前端 | `src/App.tsx` | 載入 ContentPanel |
| 後端 | 無 | `update_node` 已支援 `content` 參數 |

### ContentPanel 行為

- 選中 [T] node → 顯示 textarea，載入 `node.content`
- 失焦或 debounce → 呼叫 `ipc.updateNode(id, { content })`
- 選中其他 type → 依 type 顯示對應面板（Phase 2-4）
- 無選中 → 隱藏面板

---

## Phase 2：Markdown 節點 — Tiptap 編輯器（L）

### 方案

使用 [Tiptap](https://tiptap.dev/) 編輯器，支援 Markdown 語法高亮與即時預覽。

### 需要新增依賴

```
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
```

### 需要改動

| 範圍 | 檔案 | 說明 |
|------|------|------|
| 前端 | 新建 `src/components/MarkdownEditor.tsx` | Tiptap 實例，markdown 內容雙向綁定 |
| 前端 | `src/components/ContentPanel.tsx` | [M] type 渲染 MarkdownEditor 而非 textarea |
| 樣式 | `src/index.css` | Tiptap 編輯器基礎樣式（繼承 dark theme） |

### MarkdownEditor 行為

- 載入時將 `node.content`（Markdown string）轉為 Tiptap 文件
- 編輯中 debounce 500ms auto-save 回 `content` 欄位
- 支援基本語法：標題、粗斜體、清單、code block、連結
- 快捷鍵：`Escape` 跳回 tree 焦點

---

## Phase 3：Image 節點 — 檔案選擇 + 縮圖（M）

### 需要新增 Tauri 插件

```toml
# Cargo.toml
tauri-plugin-dialog = "2"
```

```json
// capabilities/default.json — 新增
"dialog:default"
```

### 需要改動

| 範圍 | 檔案 | 說明 |
|------|------|------|
| 後端 | 新建 `src-tauri/src/commands/file_ops.rs` | `copy_file_to_storage` — 複製檔案到 `~/MindFlow/files/`，回傳新路徑 |
| 後端 | `src-tauri/src/main.rs` | 註冊新 command |
| 前端 | `src/lib/ipc.ts` | 新增 `copyFileToStorage`、`openFilePicker` |
| 前端 | `src/components/ContentPanel.tsx` | [I] type 渲染 ImagePanel |
| 前端 | 新建 `src/components/ImagePanel.tsx` | 圖片預覽 + 選擇/更換按鈕 |
| 前端 | `src/components/NodeCard.tsx` | [I] node card 顯示小縮圖（可選） |

### 流程

1. 使用者在 [I] node 的 ContentPanel 點擊「選擇圖片」
2. 前端呼叫 `@tauri-apps/plugin-dialog` 的 `open()` → 取得原始路徑
3. 前端呼叫 `ipc.copyFileToStorage(contextId, nodeId, sourcePath)` → 後端複製檔案到 `~/MindFlow/files/{context_id}/`，回傳新路徑
4. 前端呼叫 `ipc.updateNode(nodeId, { filePath: newPath })` 存入 DB
5. ContentPanel 用 `convertFileSrc()` 把本地路徑轉成 Tauri asset URL 來顯示圖片

### copy_file_to_storage 後端邏輯

```rust
#[tauri::command]
fn copy_file_to_storage(
    context_id: String,
    node_id: String,
    source_path: String,
) -> Result<String, MindFlowError> {
    let dest_dir = dirs::home_dir()
        .unwrap()
        .join("MindFlow/files")
        .join(&context_id);
    std::fs::create_dir_all(&dest_dir)?;

    let filename = Path::new(&source_path)
        .file_name()
        .unwrap_or("image".as_ref());
    let dest = dest_dir.join(format!("{}-{}", &node_id[..8], filename.to_string_lossy()));
    std::fs::copy(&source_path, &dest)?;

    Ok(dest.to_string_lossy().to_string())
}
```

---

## Phase 4：File 節點 — 檔案連結 + 系統開啟（S）

### 需要改動

| 範圍 | 檔案 | 說明 |
|------|------|------|
| 前端 | `src/components/ContentPanel.tsx` | [F] type 渲染 FilePanel |
| 前端 | 新建 `src/components/FilePanel.tsx` | 顯示檔案路徑 + 「選擇檔案」+「開啟檔案」按鈕 |
| 前端 | `src/lib/ipc.ts` | 新增 `openFileInSystem` |
| 後端 | `src-tauri/src/commands/file_ops.rs` | `open_file_in_system` — 用系統預設程式開啟 |

### 流程

1. 選擇檔案：同 Image 流程（dialog → copy → 存 file_path）
2. 開啟檔案：呼叫 `tauri-plugin-opener` 的 `open_path()` 用系統預設程式打開
3. Card 上顯示副檔名 icon（`.pdf` `.docx` 等）或只顯示檔名

### File 節點也支援「連結模式」

有些檔案使用者不想複製（例如很大的檔案），可以選擇只儲存原始路徑引用，不複製：

- ContentPanel 提供「連結（不複製）」選項
- 此時 `file_path` 直接存原始路徑
- 顯示時標注「外部連結」

---

## Phase 5：update_node 後端增加 file_path 參數（S）

### 需要改動

| 範圍 | 檔案 | 說明 |
|------|------|------|
| 後端 | `src-tauri/src/commands/node.rs` | `update_node` 新增 `file_path: Option<String>` 參數 |
| 前端 | `src/lib/ipc.ts` | `updateNode` 的 updates 類型加 `filePath` |

這個要在 Phase 3 之前完成，但邏輯簡單所以獨立列出。

---

## 建議實作順序

```
Phase 5 → Phase 1 → Phase 3 → Phase 4 → Phase 2
```

理由：
1. **Phase 5**（update_node 加 file_path）：5 分鐘，後面 Phase 3/4 都需要
2. **Phase 1**（Text 多行編輯）：建立 ContentPanel 框架，最快能用
3. **Phase 3**（Image）：需要 dialog 插件，但比 Markdown 簡單
4. **Phase 4**（File）：複用 Phase 3 的 file_ops，很快
5. **Phase 2**（Markdown）：最大工程，最後做

---

## 不在此計畫範圍

- 圖片裁剪/壓縮
- Markdown 匯出 PDF
- 檔案版本管理
- 檔案拖放上傳（未來可加）
