# Mind Flow — 待實作功能清單

> 最後更新：2026-02-17
> 參考：PRD v1.0、目前 codebase 狀態

---

## 已完成

- Tauri 2.x + React 19 + TypeScript + Zustand + Tailwind v4
- SQLite 持久化（`~/MindFlow/data/mindflow.db`）
- Context CRUD（建立、切換、封存、啟用、刪除、重新命名）
- Node CRUD（新增子節點/同級節點、刪除、inline 標題編輯）
- 水平 XMind 風格樹 + 弧形連接線
- 4 種 node type 顯示：[T] Text、[M] Markdown、[I] Image、[F] File
- Node type 切換 popover（badge 點擊 + `t` 鍵 + `1-4` 數字鍵快速切換）
- 鍵盤導航：h/j/k/l（breadth j/k + depth h/l）、方向鍵、Enter、Tab、Shift+Tab、Delete
- Quick Switcher（⌘K）含 vim 風格導航、列表優先焦點
- 滑鼠 "+" 按鈕（hover 顯示，新增子節點/同級節點）
- StatusBar（context 名稱 + active 數量）
- 選中節點自動捲動（scrollIntoView nearest）
- Context 重新命名（root node ↔ context name 雙向同步）
- Ctrl+V 貼上為 node（自動偵測圖片/文字）
- Image node 縮圖 + lightbox（48x48 thumbnail + 點擊放大 + Esc 關閉）
- **集中管理列舉常數**（`src/lib/constants.ts`：NodeTypes、ContextStates、IpcCmd、PasteKind、imageMime）
- **Markdown 編輯器**（Tiptap split-panel：左側 tree、右側 editor、auto-save 到 `content` 欄位，雙擊開啟、Esc 關閉、切換節點自動關閉）
- **Image 節點選圖匯入**（`pick` 按鈕 + 系統檔案選擇器限圖片格式 + 複製到 app 儲存區 `~/MindFlow/files/`）
- **File 節點 attach/open**（無 file_path 時 attach 選擇檔案、有 file_path 時 Reveal in Finder）
- **刪除確認**（有子節點時彈出確認 dialog）
- **節點排序**（Alt+↑/↓ 同級節點移動）
- **複製/貼上子樹**（⌘C/⌘V + clipboard marker 防外部文字覆蓋）
- **搜尋**（⌘F 搜尋當前 tree 標題，高亮匹配 + 上下跳轉）
- **復原**（⌘Z undo，支援 add/delete/title/type/content/reorder）
- **同深度 j/k 導航**（跨子樹同層級移動）
- **右鍵 Context Menu**（Edit、Change Type、Add Child/Sibling、Copy/Cut/Paste、Move Up/Down、Delete）
- **剪下**（⌘X cut node，灰顯子樹，貼上後刪除原節點，非貼上操作自動取消）
- **QuickSwitcher 狀態管理**（Active/Archived 分區、node count、archive 📦、activate ↩、delete ✕）
- **拖放排序**（@dnd-kit：同級 reorder、跨父級 reparent、root drop zone、DragOverlay 預覽、Alt+h/l 鍵盤 reparent）

---

## 第一層 — 核心體驗缺口（高影響、低成本）

日常使用馬上會遇到的問題。

| # | 功能 | 說明 | 工時 | 狀態 |
|---|------|------|------|------|
| ~~1~~ | ~~Node 內容編輯~~ | ~~不需要，[T] node 只用標題即可~~ | ~~M~~ | 取消 |
| ~~2~~ | ~~Markdown 編輯器~~ | ~~已完成（Tiptap split-panel + auto-save）~~ | ~~L~~ | ✅ |
| ~~3~~ | ~~選中節點自動捲動~~ | ~~已完成~~ | ~~S~~ | ✅ |
| ~~4~~ | ~~節點收合/展開~~ | ~~不需要~~ | ~~M~~ | 取消 |
| ~~5~~ | ~~Context 重新命名~~ | ~~已完成~~ | ~~S~~ | ✅ |
| ~~6~~ | ~~刪除確認~~ | ~~已完成（子節點時 dialog 確認）~~ | ~~S~~ | ✅ |

---

## 第二層 — 重要功能（中等成本）

| # | 功能 | 說明 | 工時 | 狀態 |
|---|------|------|------|------|
| ~~7~~ | ~~右鍵 Context Menu~~ | ~~已完成（完整選單含 Edit/Type/Add/Copy/Cut/Paste/Move/Delete）~~ | ~~M~~ | ✅ |
| ~~8~~ | ~~節點排序（鍵盤）~~ | ~~已完成（Alt+↑/↓）~~ | ~~S~~ | ✅ |
| ~~9~~ | ~~Image 節點縮圖~~ | ~~已完成（thumbnail + lightbox + paste + pick import）~~ | ~~M~~ | ✅ |
| ~~10~~ | ~~File 節點開啟~~ | ~~已完成（attach file + Reveal in Finder）~~ | ~~S~~ | ✅ |
| ~~11~~ | ~~搜尋~~ | ~~已完成（⌘F 搜尋標題 + 上下跳轉 + 高亮）~~ | ~~M~~ | ✅ |
| ~~12~~ | ~~復原/重做~~ | ~~已完成（⌘Z undo，支援 add/delete/title/type/content/reorder）~~ | ~~M~~ | ✅ |

---

## 第三層 — 完整願景（大型功能）

來自 PRD，但目前日常使用尚不急需。

| # | 功能 | 說明 | 工時 | 狀態 |
|---|------|------|------|------|
| 13 | Context Manager 面板 | 完整 ⌘⇧K 面板，含 Active/Archived/Vault 分區、tag 篩選、Common Knowledge、統計。**設計稿：`design/design.pen` 中 "Context Manager v2" (node `4f2aI`)** | L | 待實作 |
| 14 | Tag 系統 | Context 上建立/編輯 tag，在 Context Manager 中用 tag 篩選。 | M | 待實作 |
| 15 | 共用知識圖譜 | 跨 context 的共享 knowledge tree，用 d3-force 或 @xyflow/react 做 graph view。 | XL | 待實作 |
| 16 | Insights 統計欄 | 每日/每週統計：建立的 node 數、活躍 context 數、使用時間。 | M | 待實作 |
| ~~17~~ | ~~拖放排序~~ | ~~已完成（@dnd-kit：同級 reorder + 跨父級 reparent + root drop zone + Alt+h/l 鍵盤 reparent + DragOverlay 預覽 + 橘色高亮）~~ | ~~L~~ | ✅ |
| 18 | 效能優化（虛擬渲染） | 50+ 可見 node 的場景。虛擬渲染 + canvas 連接線。 | L | 待實作 |
| 19 | 過場動畫 | 展開/收合、新增/刪除 node 的平滑動畫。 | M | 待實作 |
| 20 | 跨平台 | Windows 支援，未來 iOS/iPad。 | XL | 待實作 |

---

## 工時對照

- **S** = 小（< 1 小時）
- **M** = 中（1-3 小時）
- **L** = 大（3-8 小時）
- **XL** = 超大（8 小時+）

---

## 已知 Bug

- **archiveContext 切換不完整**：歸檔當前 context 時只設了 `currentContextId`，未呼叫 `switchContext`，導致 tree 不更新。需改為 `switchContext(next.id)`。

## 建議下一輪 Sprint

1. **archiveContext bug** — 快速修復（S）
2. **#13** Context Manager 面板（L）— 設計稿已完成，可直接實作
3. **#14** Tag 系統（M）— Context Manager 的依賴
4. **#19** 過場動畫（M）— 新增/刪除/拖放動畫提升體感
