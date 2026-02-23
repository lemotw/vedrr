# Mind Flow 前端架構 Context

> 產出日期：2026-02-23
> 分析者：TPM-1 (Frontend)
> 分析範圍：`src/` 下所有前端程式碼 + 相關文件

---

## 1. 專案概述

Mind Flow 是一個 **ADHD 友善、本地優先、鍵盤驅動** 的桌面知識管理工具。前端採用 React 19 + TypeScript + Zustand 5 + Tailwind CSS v4，運行在 Tauri 2.x 的 WKWebView（macOS）之上。核心互動是一棵水平展開的 XMind 風格知識樹，以 Vim 風格快捷鍵為主要操作方式。

**技術堆疊**：
- React 19 + TypeScript + Vite 7（打包）
- Zustand 5（狀態管理，3 個 store）
- Tailwind CSS v4（`@theme` + CSS Variables 主題系統）
- @dnd-kit/core + @dnd-kit/sortable（拖放）
- @tiptap/react + StarterKit（Markdown 富文本編輯）
- Tauri 2.x IPC（前後端通信，22 個 IPC 指令）

---

## 2. 元件架構

### 2.1 元件樹概覽

```
App.tsx
 ├── StatusBar              頂部導航列
 ├── CompactBanner          AI Compact 結果摘要橫幅
 ├── main (flex container)
 │    ├── TreeCanvas        水平樹畫布（核心元件）
 │    │    ├── TreeBranch   遞迴樹分支渲染
 │    │    │    ├── RootDropZone   根節點拖放區
 │    │    │    ├── NodeCard       節點卡片
 │    │    │    ├── AddButton      + 按鈕（新增子/同級節點）
 │    │    │    └── SortableChildRow  可排序子節點行
 │    │    └── DragOverlay  拖放預覽
 │    └── ContentPanel      右側 Markdown 編輯面板
 │         └── MarkdownEditor  Tiptap 編輯器
 ├── QuickSwitcher          Cmd+K 快速切換器（模態）
 ├── NodeTypePopover        節點類型切換彈窗（模態）
 ├── NodeSearch             Cmd+F 節點搜尋（模態）
 ├── ContextMenu            右鍵選單（模態）
 ├── ThemeSwitcher          主題切換器（模態）
 ├── AISettings             AI 設定面板（模態）
 └── Loading/Error overlays  AI Compact 載入/錯誤遮罩
```

### 2.2 各元件詳細說明

#### App.tsx（殼層）
- **職責**：應用初始化、全局佈局、模態層管理
- **初始化流程**：載入主題 → loadContexts → 自動切換到第一個 ACTIVE context 或開啟 QuickSwitcher
- **佈局**：垂直 flex（StatusBar → CompactBanner → main[TreeCanvas + ContentPanel]），模態元件以 fixed z-50 覆蓋
- **AI Compact 狀態**：LOADING 時顯示全螢幕 spinner 遮罩，有 error 時顯示錯誤對話框

#### StatusBar.tsx（頂部導航列）
- **職責**：顯示當前 context 名稱 + active count，提供 AI/Theme/QuickSwitcher 按鈕
- **Props**：無（直接讀 store）
- **Compact 鎖定**：APPLIED 狀態下 AI 和 Cmd+K 按鈕變灰，點擊觸發 banner flash
- **高度**：固定 h-11

#### TreeCanvas.tsx（核心元件 — 水平樹畫布）
- **職責**：渲染水平樹結構 + 管理拖放邏輯
- **關鍵子元件**：
  - `TreeBranch`：遞迴渲染，處理節點 + 子節點列表 + 連接線 + 摺疊態
  - `SortableChildRow`：包裝 `useSortable` 的拖放行，含 L 型連接線繪製
  - `RootDropZone`：根節點特殊拖放區（作為 reparent 目標）
  - `AddButton`：hover 顯示的 + 按鈕
- **拖放系統**：
  - 使用 `DndContext` + `SortableContext` + `DragOverlay`
  - PointerSensor（distance: 8 啟動距離）
  - 碰撞檢測：`pointerWithin` 優先，fallback `rectIntersection`
  - 拖放語義：同父級 + 邊緣 gap zone = reorder；不同父級/中心區域 = reparent
  - `DragStateContext` 共享拖放狀態給 NodeCard（高亮 drop target）
- **Compact 整合**：
  - `compactNodeIds` Set：APPLIED 時只允許操作 compact 子樹內的節點
  - 子樹外節點 dimmed（opacity-40 + pointer-events-none）
- **佈局**：`overflow-auto h-full p-8 pl-15`

#### NodeCard.tsx（節點卡片）
- **職責**：渲染單個節點（根節點 = 大標題，非根 = 卡片）
- **Props**：`node, isRoot, isSelected, isCutNode, isDropTarget, compactHighlight, compactFading, dimmed, onClick, dragHandleListeners`
- **根節點渲染**：28px Oswald 粗體，inline 編輯
- **非根節點渲染**：
  - 類型 badge（20x20，字母 T/M/I/F + 對應色）→ 點擊開 type popover
  - 標題文字（13px，inline 編輯）
  - Image 節點：48x48 縮圖 + 點擊燈箱（lightbox）
  - File 節點：open/attach 按鈕
  - Image 無檔案：pick 按鈕
- **Compact 標注**：左側 3px 色帶 + 背景 tint（added=teal, edited=amber, moved=blue, edited+moved=amber）
  - 編輯節點顯示 `← 舊名稱`（小字）
  - 移動節點顯示 `↗ from: 舊父節點`（小字）
- **圖片載入**：`ipc.readFileBytes` → Blob → `URL.createObjectURL`（因 Tauri 2 asset protocol 不可用）
- **編輯互動**：
  - 雙擊進入編輯（Markdown 節點開側面板）
  - Enter 需雙擊確認（300ms debounce，防 IME）
  - Escape 取消
  - `isComposing` 守衛（CJK 輸入法）
- **右鍵**：`onContextMenu` → 選中節點 + 開啟 ContextMenu

#### ContentPanel.tsx（右側面板）
- **職責**：Markdown 節點的富文本編輯區
- **顯示條件**：`markdownEditorNodeId` 有值 + 節點類型為 MARKDOWN
- **佈局**：固定 w-480px，含標題輸入 + MarkdownEditor
- **標題編輯**：`PanelTitle` 子元件，500ms debounce auto-save

#### MarkdownEditor.tsx（Tiptap 編輯器）
- **職責**：富文本編輯（HTML 格式存入 `content` 欄位）
- **Tiptap 配置**：StarterKit（H1-H3、粗斜體、刪除線、code、清單、blockquote、code block）+ Placeholder
- **工具列**：H1-H3、B、I、S、<>、bullet、ordered、blockquote、code block
- **自動存檔**：500ms debounce + unmount flush
- **焦點管理**：focus/blur 同步 `uiStore.contentPanelFocused`

#### QuickSwitcher.tsx（Cmd+K 快速切換器）
- **職責**：搜尋、建立、切換、歸檔/啟用/刪除 context
- **佈局**：固定 w-480px 模態，overlay 背景
- **分區**：ACTIVE（上方）+ ARCHIVED（下方），每項顯示 name + node_count + last_accessed 時間
- **操作**：
  - 搜尋篩選（即時 filter）
  - Enter 選擇或建立
  - Cmd+N 新增
  - 歸檔 📦 / 啟用 ↩ / 刪除 ✕（hover 顯示）
- **鍵盤**：
  - j/↓/Ctrl+j/Ctrl+n = 下移
  - k/↑/Ctrl+k/Ctrl+p = 上移
  - / = 聚焦搜尋
  - 任意可列印字元 = 跳入搜尋
  - Escape = 清搜尋或關閉

#### NodeTypePopover.tsx（類型切換彈窗）
- **職責**：切換節點類型（TEXT/MARKDOWN/IMAGE/FILE）
- **佈局**：200px 寬，居中顯示
- **操作**：1-4 數字鍵快速切換 / j/k 選擇 + Enter 確認 / Escape 關閉 / t 關閉

#### NodeSearch.tsx（Cmd+F 節點搜尋）
- **職責**：在當前樹中搜尋節點標題
- **實作**：flatten tree → filter by query → 顯示匹配節點 + 麵包屑路徑
- **佈局**：480px 寬模態，含搜尋欄 + 結果列表 + 提示列
- **操作**：↑↓ 選擇 / Enter 跳轉 / Escape 關閉

#### ContextMenu.tsx（右鍵選單）
- **職責**：節點操作選單
- **選項**：Edit / Change Type / Collapse-Expand / Copy as Markdown（根節點） / Add Child / Add Sibling / Copy / Cut / Paste / Move Up / Move Down / AI Compact / Delete
- **位置**：顯示在右鍵點擊處，自動修正超出視窗
- **Compact 鎖定**：子樹外節點的操作項 disabled
- **AI Compact 觸發**：直接 apply（非 preview），結果透過 `applyCompact` + `setCompactApplied` 展示
- **智能過濾**：根節點隱藏不適用項（Add Sibling, Copy, Cut, Move, Delete）

#### CompactBanner.tsx（AI Compact 結果橫幅）
- **職責**：顯示 AI Compact 結果摘要 + 操作按鈕
- **顯示條件**：`compactState === APPLIED`
- **內容**：
  - 統計行：「AI 重組了 N 個節點 — X 新增 / Y 編輯 / Z 移動 / W 刪除」
  - 操作：復原 / 展開詳情 / 確認
  - 展開後：逐項變更清單（tag + 標題 + 舊名/來源）
- **flash 動畫**：嘗試被鎖定操作時觸發 `compact-flash-anim`

#### ThemeSwitcher.tsx（主題切換器）
- **職責**：切換 8 個預設主題 + 自訂主題（7 色）
- **佈局**：右上角浮動面板
- **預設主題**：彩色圓點 + 3 字縮寫
- **自訂主題**：7 個 color picker（bgPage, bgCard, bgElevated, accentPrimary, textPrimary, textSecondary, border）

#### AISettings.tsx（AI 設定面板）
- **職責**：管理 AI Profile（名稱、Provider、Model、API Key）
- **Provider**：Anthropic（Claude Sonnet 4/Opus 4/Haiku 4）/ OpenAI（GPT-4o/4o-mini/o3-mini）
- **操作**：新增 profile / 選擇 active profile / 刪除 profile
- **Active profile**：存 localStorage（`mindflow-active-ai-profile`）

---

## 3. 狀態管理

### 3.1 三個 Zustand Store 概覽

```
contextStore ──→ 管理 Context 列表和當前 context
     │
     ├─ switchContext ──→ treeStore.clearUndo()
     │
treeStore ──→ 管理樹結構、節點 CRUD、選取、複製/剪下、拖放、Undo
     │
     ├─ selectNode ──→ uiStore.closeMarkdownEditor()
     ├─ addChild/addSibling ──→ uiStore.setEditingNode()
     ├─ updateNodeTitle (root) ──→ contextStore.loadContexts()
     ├─ applyCompact ──→ (回傳 highlights 給呼叫者)
     │
uiStore ──→ 管理所有 UI 狀態旗標（模態開關、編輯中節點、摺疊、主題、Compact 狀態）
```

### 3.2 contextStore（Context 管理）

**State**：
| 欄位 | 型別 | 說明 |
|------|------|------|
| contexts | ContextSummary[] | 所有 context 列表 |
| currentContextId | string \| null | 當前選中的 context ID |
| loading | boolean | 載入中旗標 |

**Actions（全部 async，呼叫 IPC）**：
| Action | 說明 |
|--------|------|
| loadContexts | 從後端載入 context 列表 |
| createContext | 建立 + 自動切換 |
| switchContext | 切換 + 清空 undo stack |
| renameContext | 重新命名 |
| archiveContext | 歸檔（若為當前 context，自動切到下一個 ACTIVE） |
| activateContext | 啟用 |
| deleteContext | 刪除 |

### 3.3 treeStore（樹 + 節點管理）

**State**：
| 欄位 | 型別 | 說明 |
|------|------|------|
| tree | TreeData \| null | 當前 context 的樹結構 |
| selectedNodeId | string \| null | 選中的節點 ID |
| copiedNodeId | string \| null | 複製/剪下的節點 ID |
| isCut | boolean | 是否為剪下操作 |
| undoStack | UndoEntry[] | Undo 堆疊（最多 50 步） |

**Actions**：
| Action | 說明 |
|--------|------|
| loadTree | 從後端載入完整樹（遞迴 TreeData） |
| selectNode | 選取節點 + 自動關閉不匹配的 Markdown 面板 |
| copyNode / cutNode | 設定複製/剪下目標 |
| pasteNodeUnder | 在目標下貼上（clone subtree + 若剪下則刪原節點） |
| addChild / addSibling | 新增節點 + 自動選取 + 進入編輯模式 |
| deleteNode | 刪除（有子節點時 confirm dialog） |
| updateNodeTitle | 更新標題（樂觀更新 + root 同步 context name） |
| updateNodeType | 更新類型（樂觀更新） |
| updateNodeContent | 更新內容（樂觀更新） |
| pasteAsNode | 貼上為新節點（Image blob / Text） |
| openOrAttachFile | FILE: reveal in finder / attach file |
| pickAndImportImage | IMAGE: 選圖並匯入 |
| reorderNode | 同級排序（up/down） |
| dragMoveNode | 拖放移動（reparent / reorder，防環檢查） |
| applyCompact | 套用 AI Compact 結果（刪除舊子樹 → 重建新子樹 → 產生 highlight map） |
| undoCompact | 復原 Compact（刪新子樹 → 還原快照） |
| undo | 通用 undo（支援 add/delete/title/type/content/reorder/move/compact） |
| clearUndo | 清空 undo stack |

**Undo 系統**：
- 最多 50 步（`MAX_UNDO`）
- 8 種 undo entry 類型：add, delete, title, type, content, reorder, move, compact
- Compact undo 特殊：一次復原整個子樹（刪新建 → restoreNodes 原始節點）

**Compact 鎖定邏輯**（`isCompactLocked`）：
- APPLIED 狀態下，只有 compact 子樹內的節點可操作
- 所有 mutation actions 開頭都檢查 `isCompactLocked`

**輔助函式（export）**：
- `findNode(tree, id)` — 遞迴查找節點
- `findParent(tree, targetId)` — 查找父節點

### 3.4 uiStore（UI 狀態管理）

**State**：
| 欄位 | 型別 | 說明 |
|------|------|------|
| quickSwitcherOpen | boolean | QuickSwitcher 開關 |
| editingNodeId | string \| null | 正在 inline 編輯的節點 |
| typePopoverNodeId | string \| null | 類型彈窗對應的節點 |
| contentPanelFocused | boolean | Markdown 面板是否聚焦 |
| markdownEditorNodeId | string \| null | Markdown 編輯器對應的節點 |
| nodeSearchOpen | boolean | 節點搜尋開關 |
| contextMenuNodeId | string \| null | 右鍵選單對應的節點 |
| contextMenuPosition | {x,y} \| null | 右鍵選單位置 |
| collapsedNodes | Set\<string\> | 已摺疊的節點 ID 集合 |
| currentTheme | ThemeId | 當前主題 ID |
| themeSwitcherOpen | boolean | 主題切換器開關 |
| customThemeColors | CustomThemeColors | 自訂主題 7 色 |
| aiSettingsOpen | boolean | AI 設定面板開關 |
| compactState | CompactState | Compact 狀態機（idle/loading/applied） |
| compactRootId | string \| null | Compact 作用的根節點 |
| compactHighlights | Map\<string, CompactHighlightInfo\> \| null | 節點色彩標注 |
| compactSummary | CompactSummary \| null | Compact 統計摘要 |
| compactBannerExpanded | boolean | Banner 展開狀態 |
| compactFading | boolean | 色彩淡出中 |
| compactError | string \| null | Compact 錯誤訊息 |
| compactBannerFlash | number | Flash 動畫觸發計數器 |

**主題系統**：
- `setTheme(theme)` — 設定 `data-theme` attribute + localStorage 持久化
- `setCustomColor(key, value)` — 更新自訂色 + 立即套用 CSS Variables
- 自訂主題特殊處理：overlay/hover 根據 bgPage 亮度自動計算

### 3.5 Store 間協作模式

1. **Context 切換**：`contextStore.switchContext` → `treeStore.clearUndo` → `treeStore.loadTree`
2. **節點選取**：`treeStore.selectNode` → `uiStore.closeMarkdownEditor`（若不匹配）
3. **新增節點**：`treeStore.addChild` → `uiStore.setEditingNode`（自動進入編輯）
4. **Root 改名**：`treeStore.updateNodeTitle` → `contextStore.loadContexts`（同步 context name）
5. **AI Compact**：`ipc.compactNode` → `treeStore.applyCompact` → `uiStore.setCompactApplied`
6. **Compact Undo**：`uiStore.clearCompactHighlights` → `treeStore.undoCompact`

---

## 4. 使用者互動流程

### 4.1 鍵盤快捷鍵完整地圖

**全局快捷鍵**（`useKeyboard.ts` — `window.addEventListener`）：

| 按鍵 | 條件 | 動作 |
|------|------|------|
| Cmd+K | 非 compact busy | 開啟 QuickSwitcher |
| Cmd+F | 無條件 | 開啟 NodeSearch |
| Cmd+Z | 非編輯/面板焦點/compact busy | Undo |
| Cmd+C | 非編輯/面板焦點，有選中非根節點 | 複製節點 |
| Cmd+X | 同上 | 剪下節點 |
| Escape | 各種優先順序 | 關閉 context menu → 關閉 Markdown 面板 → 清除 copy/cut |
| Ctrl+V (paste) | 非編輯/面板焦點，有選中節點 | 貼上（image auto-detect / text / node clone） |

**樹操作快捷鍵**（需 tree focused，無模態開啟）：

| 按鍵 | 動作 |
|------|------|
| j / ↓ | 同深度下一節點（breadth-first，跨子樹） |
| k / ↑ | 同深度上一節點 |
| l / → | 展開已摺疊節點 或 進入第一個子節點 |
| h / ← | 回到父節點 |
| z | 摺疊/展開當前節點 |
| Enter | 進入編輯（Markdown 開面板，其他 inline edit） |
| Tab | 新增子節點 |
| Shift+Tab | 新增同級節點 |
| t | 開啟類型切換 popover |
| o | File: reveal/attach, Image: pick image |
| c | 觸發 AI Compact（非 Cmd+C） |
| Delete/Backspace | 刪除節點 |
| Alt+j / Alt+↓ | 同級下移（reorder） |
| Alt+k / Alt+↑ | 同級上移 |
| Alt+l / Alt+→ | 移入前一個兄弟節點（become its last child） |
| Alt+h / Alt+← | 移出到祖父節點（become sibling of parent） |

**模態內快捷鍵**：

| 元件 | 按鍵 | 動作 |
|------|------|------|
| QuickSwitcher | j/↓/Ctrl+j/Ctrl+n | 下移 |
| QuickSwitcher | k/↑/Ctrl+k/Ctrl+p | 上移 |
| QuickSwitcher | / | 聚焦搜尋 |
| QuickSwitcher | Enter | 選擇或建立 |
| QuickSwitcher | Cmd+N | 新增 context |
| QuickSwitcher | Escape | 清搜尋或關閉 |
| NodeTypePopover | 1-4 | 快速切換類型 |
| NodeTypePopover | j/k / ↑↓ | 上下選擇 |
| NodeTypePopover | Enter | 確認 |
| NodeTypePopover | Escape / t | 關閉 |
| NodeSearch | ↑↓ | 選擇結果 |
| NodeSearch | Enter | 跳轉 |
| NodeSearch | Escape | 關閉 |
| Inline Edit | Enter (雙擊 300ms) | 確認 |
| Inline Edit | Escape | 取消 |
| Markdown Editor | Escape | 關閉面板 |

### 4.2 滑鼠操作

| 操作 | 目標 | 動作 |
|------|------|------|
| 單擊 | 節點卡片 | 選取節點 |
| 雙擊 | 節點卡片 | 進入編輯（Markdown → 開面板） |
| 右鍵 | 節點卡片 | 選取 + 開右鍵選單 |
| 點擊 | 類型 badge (T/M/I/F) | 開 type popover |
| 點擊 | Image 縮圖 | 開 lightbox |
| 點擊 | open/attach 按鈕 | File: reveal/attach |
| 點擊 | pick 按鈕 | Image: 選圖匯入 |
| Hover | + 按鈕 | 顯示新增按鈕 |
| 點擊 | + 按鈕 | 新增子/同級節點 |
| 點擊 | 摺疊圓點 | 展開節點 |
| 拖放 | 節點卡片 | 8px 距離啟動 → reorder 或 reparent |
| 點擊 | lightbox 背景 | 關閉 lightbox |

### 4.3 拖放系統詳細流程

1. PointerSensor 啟動（距離 > 8px）
2. DragOverlay 顯示被拖節點預覽（含子節點計數 badge）
3. 拖到目標上方：
   - 同父級 + 邊緣 8px gap zone → reorder（位置互換）
   - 同父級 + 中心區域 → reparent（成為目標的末子節點）
   - 不同父級 → reparent
   - 拖到根節點 → reparent 為根的末子節點
4. DragOverlay 消失 + 樹重載
5. 防環檢查：不可將節點拖入自己的子孫

### 4.4 AI Compact 完整流程

```
1. 觸發（C 鍵 or 右鍵選單）
   ↓ 檢查 AI profile 是否已選
2. LOADING → 全螢幕 spinner 遮罩
   ↓ ipc.compactNode(nodeId, profileId)
3. 收到結果 → treeStore.applyCompact(result)
   ↓ 刪舊子樹 → 重建新子樹 → 建立 highlights map
4. APPLIED → CompactBanner 出現 + 節點色彩標注
   ↓ 使用者可 j/k/h/l 正常導航
5a. 按「確認」→ clearCompactHighlights → IDLE
5b. 按「復原」→ undoCompact → 還原 → IDLE
5c. 操作被鎖定的節點 → flash banner 提示
```

### 4.5 貼上（Paste）流程

```
Ctrl+V → clipboardData.items 遍歷（index-based，非 for...of）
  ├── 有 image/* → blob = getAsFile() → pasteAsNode(IMAGE)
  └── 有 text/plain →
       ├── startsWith("mindflow:node:") → pasteNodeUnder（clone subtree）
       └── 其他文字 → pasteAsNode(TEXT)
```

---

## 5. 視覺設計系統

### 5.1 Design Tokens（Tailwind CSS v4 @theme）

| Token | Default (Obsidian) | Tailwind Class |
|-------|-------------------|----------------|
| bg-page | #1A1A1A | bg-bg-page |
| bg-card | #212121 | bg-bg-card |
| bg-elevated | #2D2D2D | bg-bg-elevated |
| accent-primary | #FF6B35 | text-accent-primary / bg-accent-primary |
| accent-success | #00D4AA | text-accent-success |
| text-primary | #FFFFFF | text-text-primary |
| text-secondary | #777777 | text-text-secondary |
| border | #3D3D3D | border-border |
| overlay | rgba(0,0,0,0.5) | bg-overlay |
| hover | rgba(255,255,255,0.05) | bg-hover |

### 5.2 節點類型色

| Type | Letter | Color | CSS Variable |
|------|--------|-------|-------------|
| Text | T | #4FC3F7 | --color-node-text |
| Markdown | M | #00D4AA | --color-node-markdown |
| Image | I | #FFD54F | --color-node-image |
| File | F | #CE93D8 | --color-node-file |

### 5.3 字體

| 用途 | 字體 | Tailwind |
|------|------|----------|
| 標題 | Oswald, 700 | font-heading |
| 內文/程式碼 | JetBrains Mono | font-mono |

### 5.4 主題系統

8 個預設主題 + 1 自訂主題：

| ID | 名稱 | Accent 色 | 風格 |
|----|------|----------|------|
| obsidian | Obsidian | #FF6B35 | 深色暖橘（預設） |
| midnight | Midnight | #4FC3F7 | 深藍冷色 |
| forest | Forest | #4ADE80 | 深綠自然 |
| amethyst | Amethyst | #A78BFA | 深紫典雅 |
| mocha | Mocha | #F0A050 | 咖啡暖色 |
| slate | Slate | #00D4AA | 灰藍冷色 |
| paper | Paper | #D4634B | 淺色暖色 |
| daylight | Daylight | #2563EB | 純白亮色 |
| custom | Custom | 自訂 | 7 色自由配 |

**實作方式**：
- CSS `data-theme` attribute 切換 `:root` 變數
- 自訂主題透過 JS 直接 `setProperty` CSS Variables
- localStorage 持久化主題選擇 + 自訂色值

### 5.5 Compact 色彩標注

| 變更類型 | 色帶 | 背景 | 文字 |
|---------|------|------|------|
| added | #2DD4BF99 (Teal) | #1E3A36 | #2DD4BF |
| edited | #FBBF2499 (Amber) | #2D2A1F | #FBBF24 |
| moved | #4FC3F799 (Blue) | #1E2535 | #4FC3F7 |
| edited+moved | #FBBF2499 (Amber) | #2D2A1F | #FBBF24 |

### 5.6 動畫

| 動畫 | 說明 |
|------|------|
| compact-flash-anim | Banner flash（0.6s ease-out 橘色閃爍） |
| transition-[background-color,border-color] duration-700 | Compact 色彩過渡 |
| transition-all / transition-colors | 按鈕/hover 微互動 |
| animate-spin | Loading spinner |

---

## 6. 現有功能完整清單

### 情境管理
- [x] Context 建立、切換、歸檔、啟用、刪除
- [x] Context 重新命名（root node ↔ context name 雙向同步）
- [x] Quick Switcher（Cmd+K）含搜尋、建立、Active/Archived 分區
- [x] 節點計數 + 最後存取時間（timeAgo 格式）

### 樹狀編輯
- [x] 水平 XMind 風格樹佈局 + L 型連接線
- [x] 4 種節點類型（Text, Markdown, Image, File）+ 色彩 badge
- [x] 節點類型切換（popover + t 鍵 + 1-4 快捷鍵）
- [x] Inline 標題編輯（Enter / 雙擊 + IME 守衛）
- [x] 新增子節點（Tab / + 按鈕）
- [x] 新增同級節點（Shift+Tab / + 按鈕）
- [x] 刪除節點（Delete + 子節點確認 dialog）
- [x] 節點選取 + 自動捲動（scrollIntoView nearest）
- [x] 節點摺疊/展開（z 鍵 / 右鍵 / 點擊圓點）

### 導航
- [x] Vim 風格鍵盤導航（h/j/k/l + 方向鍵）
- [x] 同深度跨子樹 j/k 導航（breadth-first）
- [x] 節點搜尋（Cmd+F）+ 麵包屑路徑

### 排序與移動
- [x] 同級排序（Alt+↑/↓）
- [x] 鍵盤 reparent（Alt+h/l）
- [x] 拖放排序（@dnd-kit：reorder + reparent + DragOverlay 預覽）
- [x] 防環檢查

### 複製與貼上
- [x] 複製/剪下節點（Cmd+C/X + clipboard marker）
- [x] 貼上子樹（Ctrl+V + mindflow:node: 偵測）
- [x] 貼上為新節點（Image blob / Text）
- [x] 剪下視覺（opacity-40 灰顯）

### 圖片處理
- [x] 剪貼簿圖片自動偵測貼上
- [x] 手動匯入圖片（pick → import → copy to app dir）
- [x] 48x48 縮圖 + lightbox 放大
- [x] Blob URL 載入（因 Tauri 2 asset protocol 限制）

### Markdown 編輯
- [x] 右側 480px Tiptap 面板
- [x] 工具列（H1-H3、B、I、S、code、list、quote、code block）
- [x] 500ms debounce auto-save
- [x] Escape 關閉 + 切換節點自動關閉

### File 節點
- [x] Attach file（無 file_path 時選擇檔案）
- [x] Open/Reveal in Finder（有 file_path 時）
- [x] 檔名自動設為標題

### AI Compact
- [x] Profile 管理（建立/選擇/刪除，Anthropic + OpenAI）
- [x] 觸發 compact（c 鍵 / 右鍵選單）
- [x] Auto-apply + Summary Banner
- [x] Inline 色彩標注（added/edited/moved/edited+moved）
- [x] 復原（CompactBanner 按鈕 / 通用 undo stack）
- [x] Compact 鎖定（APPLIED 時限制操作範圍）
- [x] Banner flash 動畫（嘗試被鎖定操作時）
- [x] 展開詳情（逐項變更清單）

### 主題系統
- [x] 8 個預設主題 + 自訂主題
- [x] 即時切換 + localStorage 持久化
- [x] 自訂主題 7 色 color picker

### 復原系統
- [x] 通用 Cmd+Z undo（最多 50 步）
- [x] 支援 8 種操作類型
- [x] Compact 整體復原
- [x] 切換 context 時清空 undo stack

### 右鍵選單
- [x] 完整操作選單（15 項）
- [x] 智能過濾（根節點/非根節點）
- [x] Compact 鎖定（子樹外操作 disabled）
- [x] 位置自動修正（防超出視窗）

### 跨平台支援
- [x] macOS modifier 自動偵測（Cmd vs Ctrl）
- [x] `modSymbol` 顯示適配

---

## 7. 目前的限制與痛點

### 7.1 效能問題

1. **無虛擬渲染**：整棵樹一次性渲染，50+ 節點時可能出現效能問題。`TreeBranch` 是遞迴元件，每次 tree 變更都會重新渲染整棵樹。
2. **頻繁 full tree reload**：`loadTree` 每次都從後端重新載入完整樹結構（`ipc.getTree`），即使只是單個節點的標題更新。部分操作（`updateNodeTitle`, `updateNodeType`, `updateNodeContent`）做了樂觀更新（`patchNode`），但 `addChild`、`addSibling`、`deleteNode`、`reorderNode`、`dragMoveNode` 等都會觸發 full reload。
3. **圖片載入**：每個 Image 節點都透過 IPC 讀取完整檔案位元組（`readFileBytes`），無快取機制，展開含大量圖片的子樹時可能產生延遲。

### 7.2 UX 問題

1. **Enter 雙擊確認**：NodeCard 的 inline edit 需要 300ms 內雙擊 Enter 才確認，這是為了防 IME 誤觸，但對非 CJK 使用者而言不直覺。
2. **Compact 鎖定範圍廣**：APPLIED 狀態下，compact 子樹外的所有操作都被鎖定，包括 Cmd+K 切換 context。使用者必須先確認或復原才能做其他事。
3. **`findNode` 重複定義**：`findNode` 函式在 `treeStore.ts`、`ContextMenu.tsx`、`CompactBanner.tsx`、`useKeyboard.ts`、`ContentPanel.tsx` 各自有本地實作，應統一。
4. **無過場動畫**：節點新增/刪除/移動都是突然出現/消失，缺乏視覺連續性。
5. **摺疊狀態不持久**：`collapsedNodes` Set 在切換 context 時不會清空也不會保存，可能出現對不上的 ID。
6. **主題切換時無平滑過渡**：CSS Variables 切換是瞬間的，體驗稍顯生硬。

### 7.3 架構 / 技術債

1. **Store 間耦合**：treeStore 直接呼叫 `useUIStore.getState()` 和 `useContextStore.getState()`，uiStore 被多處元件直接 `getState()` 呼叫（非 hook 模式）。這種跨 store 直接存取雖然在 Zustand 中可行，但增加了耦合度。
2. **useKeyboard 依賴列表過長**：effect 的依賴陣列有 25 個值，任何一個變更都會重新註冊 keydown/paste listener。
3. **重複的樹遍歷函式**：至少 5 處各自定義 `findNode`、3 處定義 `findParent`。
4. **Compact 邏輯分散**：Compact 相關邏輯分布在 `treeStore.ts`（applyCompact/undoCompact）、`uiStore.ts`（狀態管理）、`useKeyboard.ts`（觸發）、`ContextMenu.tsx`（觸發）、`CompactBanner.tsx`（UI）、`NodeCard.tsx`（色彩）、`TreeCanvas.tsx`（dimming），難以追蹤完整流程。
5. **Tiptap 存 HTML**：MarkdownEditor 將富文本以 HTML 格式存入 `content` 欄位，而非 Markdown 格式。若未來需要匯出 Markdown 或遷移編輯器，轉換會是問題。
6. **AI Profile active 存 localStorage**：`mindflow-active-ai-profile` 存在 localStorage 而非 SQLite，與其他持久化資料（profiles 本身存 SQLite）不一致。
7. **無 Error Boundary**：整個 App 沒有 React Error Boundary，IPC 錯誤在 store 中 catch 但缺少統一的使用者提示機制。
8. **`cn()` 是簡易版**：自製的 `cn` 只是 `filter(Boolean).join(" ")`，不支援 clsx 的物件語法或 tailwind-merge 的衝突解決。

### 7.4 待實作功能（from remaining-features.md）

- Context Manager 面板（Cmd+Shift+K，含 tag 系統）
- Tag 系統
- 共用知識圖譜
- Insights 統計欄
- 效能優化（虛擬渲染）
- 過場動畫
- 跨平台（Windows, iOS/iPad）

### 7.5 已知 Bug

- `archiveContext` 歸檔當前 context 時只設了 `currentContextId`，未呼叫 `switchContext`，導致 tree 不更新（from remaining-features.md）。

---

## 8. 可改進方向建議

### 8.1 高優先順序

1. **統一 `findNode`/`findParent` 到 `src/lib/treeUtils.ts`**：消除 5+ 處重複定義，減少維護成本。
2. **archiveContext bug 修復**：歸檔當前 context 後應觸發完整的 context 切換流程。
3. **圖片快取層**：在 `readFileBytes` 之上加 LRU cache（in-memory Map），避免重複讀取同一圖片。

### 8.2 中優先順序

4. **拆分 useKeyboard**：將 paste handler 獨立為 `usePaste`，compact 觸發邏輯移到專門的 `useCompact` 或 utility function，降低依賴列表複雜度。
5. **虛擬渲染**：50+ 節點時使用 `react-window` 或自製 virtualization，只渲染可見區域。
6. **節點新增/刪除動畫**：使用 `framer-motion` 或 CSS `@starting-style` 為節點增減加入過渡動畫。
7. **統一錯誤處理**：加入全局 Error Boundary + toast 通知系統。

### 8.3 長期改進

8. **Markdown 存儲格式**：考慮將 Tiptap HTML 轉為 Markdown 存儲，或同時存 HTML + Markdown 兩份。
9. **Store 解耦**：引入事件系統或 middleware 來處理跨 store 協作，降低直接引用。
10. **Compact 邏輯集中化**：考慮建立 `CompactManager` class 或 `useCompact` hook 統一管理整個 Compact 流程。
11. **響應式佈局**：目前硬編碼的寬高值（w-480px、h-11、48px 縮圖等）不適應不同螢幕尺寸。
