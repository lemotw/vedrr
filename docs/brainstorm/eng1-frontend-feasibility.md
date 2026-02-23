# Eng-1: 前端可行性評估

> 產出日期：2026-02-23
> 分析者：Eng-1（前端工程師）
> 功能主題：「隨手丟 idea → 自動分入 context tree」（Quick Capture）

---

## 技術評估摘要

Quick Capture 功能在前端技術上**整體可行**，不需要引入大量新依賴或顛覆現有架構。核心挑戰在於：

1. **Tauri globalShortcut** 有 macOS 系統層限制需評估
2. **Quick Capture UI** 可獨立於 QuickSwitcher 實作，共用設計語言即可
3. **Inbox 暫存區** 最簡實作路徑是用現有 context 機制（新增一個「Inbox」context）而非全新資料結構
4. **AI 分類** 的多 context 比對有效能風險，需控制載入策略

---

## 各項技術分析

### 1. 全域快捷鍵（Tauri 2 globalShortcut）

**可行性：可行，但有平台限制**

**方案分析：**

Tauri 2 提供 `tauri-plugin-global-shortcut`，可在應用程式不在前景時也攔截鍵盤事件。

```
Rust 後端（main.rs）
  → app.global_shortcut().register("Ctrl+Space", ...)
  → emit event "quick-capture-trigger"
  → 前端 listen("quick-capture-trigger", ...) 開啟 UI
```

**技術限制：**
- macOS 上某些快捷鍵組合被系統保留（例如 `Cmd+Space` 是 Spotlight），需避開
- `Ctrl+Space` 是 macOS 輸入法切換，也有衝突風險
- 建議快捷鍵候選：`Cmd+Shift+Space`、`Cmd+Option+N`
- 必須在 `Cargo.toml` 加入 `tauri-plugin-global-shortcut = "2"` 並在 `main.rs` 初始化

**應用不在前景的行為：**
- Tauri 2 `app_handle.show()` 可在背景將視窗帶到前景
- 需要在 Rust 端 emit 事件，前端監聽後打開 Quick Capture overlay

**風險：低（已知解法，需測試快捷鍵衝突）**

---

### 2. Quick Capture UI（元件設計）

**可行性：高，建議獨立元件而非與 QuickSwitcher 合並**

**方案分析：**

QuickSwitcher 的職責是「context 管理」，Quick Capture 的職責是「快速輸入 + 即時分類」，兩者語義不同，應獨立實作。

**推薦元件：`QuickCapture.tsx`**

```
設計規格：
- fixed 覆蓋層（同 QuickSwitcher 的 z-50 模式）
- 頂部：大字 textarea（1-2 行，支援多行）
- 中間：預覽分類建議區（AI 回傳後顯示）
- 底部：選擇目標 context + 確認按鈕
- 快速鍵：Enter 確認 / Escape 取消 / Tab 切換目標 context
- 支援貼上圖片（複用現有 paste handler 邏輯）
```

**與現有架構整合：**
- 在 `uiStore` 加入 `quickCaptureOpen: boolean` + `openQuickCapture/closeQuickCapture` actions
- 在 `useKeyboard.ts` 加入 `Cmd+Shift+Space` 監聽（或由 Tauri globalShortcut 觸發）
- 在 `App.tsx` 掛載 `<QuickCapture />` 元件（同其他 modal）

**風險：低**

---

### 3. 狀態管理（新增 Store State/Actions）

**可行性：高，直接擴展 uiStore + treeStore**

**uiStore 新增：**

```typescript
// UI 開關
quickCaptureOpen: boolean;
quickCaptureInput: string;

// Inbox 相關
inboxContextId: string | null;   // 指向 Inbox context 的 ID

// AI 分類建議（Quick Capture 時即時回傳）
captureClassifyResult: {
  suggestedContextId: string;
  suggestedParentNodeId: string | null;
  confidence: number;
  reasoning: string;
} | null;
captureClassifying: boolean;

// Actions
openQuickCapture: () => void;
closeQuickCapture: () => void;
setCaptureInput: (text: string) => void;
setCaptureClassifyResult: (result: ...) => void;
```

**treeStore 新增：**

```typescript
// Quick Capture 送出
captureToContext: (
  contextId: string,
  parentNodeId: string | null,
  title: string,
  content?: string
) => Promise<void>;
```

**注意：** `captureToContext` 本質上就是 `addChild` 的變體，直接呼叫 `ipc.createNode` 即可，不需要完全新寫。

**風險：極低**

---

### 4. 動畫與視覺回饋

**可行性：高，使用現有 CSS transition 即可**

**方案分析：**

現有專案已有 `transition-[background-color,border-color] duration-700` 和 `animate-spin` 等動畫模式。Quick Capture 的動畫需求主要是：

1. **Overlay 出現/消失**：CSS `opacity` + `scale` transition（不需要 framer-motion）
2. **節點新增動畫**：節點插入時的 slide-in 效果

```css
/* 推薦：純 CSS @starting-style（現代瀏覽器支援，WKWebView macOS 15+ 有支援） */
@keyframes node-enter {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}
.node-card-new {
  animation: node-enter 200ms ease-out;
}
```

3. **分類建議出現**：簡單的 `opacity` + `translateY` slide-in

**是否需要 framer-motion？**

不需要。現有動畫複雜度在 CSS 範圍內可以處理。framer-motion 的 layout animation 對水平樹佈局有額外好處（自動計算位置過渡），但引入成本（bundle size、學習曲線）超過收益，評估不引入。

**風險：極低**

---

### 5. Inbox View（暫存區 UI）

**可行性：高，有兩種可行路徑**

#### 路徑 A（推薦）：Inbox 即特殊 Context

利用現有 context 機制，新增一個保留的「Inbox」context：

- 建立時自動標記（例如 `tags: ["__inbox__"]`）
- 在 QuickSwitcher 中特殊顯示（固定在頂部，加 Inbox 圖示）
- 使用現有 TreeCanvas 完整顯示 Inbox 樹

**優點：** 零後端改動，完全複用現有 UI；Inbox 節點可直接拖放或 Alt+h/l 移動到其他 context（若未來支援跨 context 節點移動）
**缺點：** 跨 context 移動節點目前不支援（需要新增 `move_node_to_context` IPC），暫時只能刪除並在目標 context 重建

#### 路徑 B：Side Panel Overlay

在 TreeCanvas 左側或底部加入抽屜式 Inbox panel：

```
┌─────────────────────────────────────┐
│ StatusBar                           │
├──────────┬──────────────────────────┤
│ Inbox    │ TreeCanvas               │
│ Panel    │                          │
│ (200px)  │                          │
└──────────┴──────────────────────────┘
```

**優點：** 可以常駐顯示，隨時看到 Inbox 項目
**缺點：** 擠壓 TreeCanvas 空間，佈局改動較大，需要新增 `inboxPanelOpen` 狀態

**建議：先做路徑 A，後期視需求升級到路徑 B**

**風險：低（路徑 A）/ 中（路徑 B）**

---

### 6. 效能考量（多 context 同時載入）

**可行性：可行，但需謹慎控制**

**問題描述：**

AI 自動分類需要比對所有 active context 的節點內容，如果每次 Quick Capture 都 `getTree` 載入所有 context，效能影響明顯：

- 目前 `loadTree` = 完整遞迴查詢（每層一次 SQL query）
- 10 個 context × 平均 30 節點 = 300 次 SQL + 10 次 IPC round-trip
- 全部 serialize + deserialize 的記憶體開銷

**推薦策略：**

1. **後端端輕量搜尋 IPC（最推薦）**：請 Eng-2（後端）新增 `search_nodes_across_contexts(query: String) → Vec<SearchResult>` 命令，讓 Rust 直接做 SQL 全文搜尋，回傳精簡結果。不需要前端載入完整樹。

2. **前端快取**：在記憶體中 cache 各 context 的樹（Map\<contextId, TreeData\>），只在 context 被修改時失效。但這樣記憶體使用量隨 context 數量線性成長，對大型知識庫不友好。

3. **懶載入 + 摘要模式**：AI 分類時只需要各 context 的「樹結構摘要」（節點 title list），不需要完整 content。可以新增 `get_tree_summary(contextId) → Vec<NodeSummary>` 輕量 IPC。

**結論：** 效能考量本身不是前端問題，需要後端配合提供輕量搜尋 API。前端目前的 `loadTree` 不適合拿來做多 context 比對。

**風險：中（需後端配合）**

---

### 7. 改動範圍估算

**需要修改的檔案：**

| 檔案 | 改動內容 | 工作量 |
|------|---------|--------|
| `src/stores/uiStore.ts` | 新增 quickCapture / inbox / classify 狀態 + actions | S |
| `src/stores/treeStore.ts` | 新增 `captureToContext` action | S |
| `src/hooks/useKeyboard.ts` | 新增 Quick Capture 快捷鍵監聽 | S |
| `src/App.tsx` | 掛載 `<QuickCapture />` 和 `<InboxPanel />`（若做路徑 B） | S |
| `src/components/StatusBar.tsx` | 新增 Quick Capture 觸發按鈕 | S |
| `src-tauri/src/main.rs` | 新增 `tauri-plugin-global-shortcut` 初始化 | S |
| `src-tauri/Cargo.toml` | 加入 `tauri-plugin-global-shortcut` 依賴 | XS |

**需要新增的檔案：**

| 檔案 | 說明 | 工作量 |
|------|------|--------|
| `src/components/QuickCapture.tsx` | Quick Capture 輸入 overlay | M |
| `src/components/InboxPanel.tsx` | Inbox 暫存區（若做路徑 B） | M |
| `src/lib/treeUtils.ts` | 統一 findNode/findParent（重構，非新功能） | S |

**後端需要配合（Eng-2）：**

| IPC | 說明 | 工作量 |
|-----|------|--------|
| `search_nodes_across_contexts` | 跨 context 輕量搜尋（AI 分類用） | M |
| `move_node_to_context`（選擇性） | 將 Inbox 節點移動到目標 context | M |

**總前端工作量估計：L（含 QuickCapture UI + globalShortcut + store 擴展 + Inbox view）**
**若只做 Quick Capture 核心（無 AI 分類、無 Inbox view）：M**

---

## 需要的新依賴

### 前端（package.json）

無需新增。現有 Zustand + React + Tailwind 足以實作所有 UI。

### 後端（Cargo.toml）

```toml
[dependencies]
tauri-plugin-global-shortcut = "2"
```

需在 `main.rs` 初始化：
```rust
.plugin(tauri_plugin_global_shortcut::Builder::new().build())
```

---

## 技術風險與建議

### 高風險
1. **globalShortcut 快捷鍵衝突**：`Cmd+Shift+Space`、`Ctrl+Space` 等在 macOS 上可能被系統或其他 app 佔用。建議在設定中允許使用者自訂快捷鍵，或提供多個預設選項。

2. **應用最小化/背景時的 UI 恢復**：Tauri 的 `app_handle.show()` + `window.set_focus()` 在 macOS 沙盒環境下需要特定 entitlements，需實測。

### 中風險
3. **AI 分類的多 context 效能**：如前述，需要後端提供輕量 API，不能直接用現有 `getTree`。

4. **Quick Capture 的 Paste 邏輯重複**：`useKeyboard.ts` 的 paste handler 邏輯需要被 Quick Capture 也使用（圖片偵測等），目前沒有被抽取成獨立 hook，需要重構或複製邏輯。

### 低風險
5. **uiStore 欄位持續膨脹**：uiStore 已有 25+ 個欄位，繼續堆疊快會變成上帝物件。建議在加 Quick Capture 狀態時，考慮是否拆出獨立的 `captureStore.ts`。

6. **Inbox context 的「保留」機制**：若用 context tag 標記 Inbox，需確保使用者無法意外刪除或歸檔它（或需要防護邏輯）。

---

## 推薦的實作優先順序

### Phase 1：Quick Capture 核心（必做，M）
1. `src-tauri` 加入 `tauri-plugin-global-shortcut`，Rust 端監聽快捷鍵並 emit 事件
2. `uiStore` 加入 `quickCaptureOpen` + open/close actions
3. 實作 `QuickCapture.tsx`：輸入框 + 選擇目標 context + 確認送出
4. `treeStore` 加入 `captureToContext`
5. `useKeyboard.ts` 加入本地快捷鍵監聽

### Phase 2：Inbox 暫存區（路徑 A，S）
1. 在 contextStore 建立 Inbox context 的初始化邏輯（首次啟動自動建立）
2. QuickSwitcher 中特殊顯示 Inbox context

### Phase 3：AI 分類建議（需後端配合，M）
1. 後端新增 `classify_capture(text, contexts) → ClassifyResult` 輕量 IPC
2. QuickCapture 輸入後觸發 AI 分類，顯示建議目標 context + 節點位置
3. 使用者可接受建議或手動選擇

### Phase 4：跨 Context 移動（可選，M）
1. 後端新增 `move_node_to_context`
2. Inbox 節點可直接移動到目標 context（而非刪除重建）
