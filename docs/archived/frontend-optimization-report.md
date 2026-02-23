# Frontend Optimization Report

> 2026-02-22 | 3 位前端工程師審查 + CTO 彙整

---

## 審查團隊

| 角色 | 側重點 |
|------|--------|
| 效能工程師 | React 渲染、re-render、記憶體洩漏、大型元件瓶頸 |
| 架構工程師 | Zustand store 設計、元件職責、程式碼組織、可維護性 |
| UX/樣式工程師 | CSS/Tailwind、動畫、無障礙性(a11y)、互動體驗 |

---

## CTO Top 5 改進建議

### 改進 1：Re-render 風暴修復（全域效能提升）

**涵蓋問題**：
- useKeyboard useEffect 有 30 個 deps，任何 state 變化都 detach/re-attach window listener
- TreeBranch 無 `React.memo` + `useTreeStore()` 不帶 selector 訂閱整個 store
- NodeCard 同樣用寬泛 `useTreeStore()` 訂閱
- `collapsedNodes` 用 `Set` 做 Zustand state，toggle 一個節點所有 TreeBranch 都 re-render
- `DragStateContext.Provider` value 每次 render 建新 object

**現狀問題**：50 個節點的樹，選一個節點觸發 50+ 次 re-render。useKeyboard 的 useEffect 每次 state 變化都 detach/re-attach window listener。這些問題互相放大：keyboard hook 觸發 store 更新 → 所有元件 re-render → drag context 又造成第二波 re-render。

**具體做法**：
1. **useKeyboard**（`src/hooks/useKeyboard.ts:386-387`）：把所有 store 值從 useEffect deps 移除，改用 `useXxxStore.getState()` 在 handler 內即時讀取最新狀態，deps 縮減到 `[]`
2. **TreeBranch**（`src/components/TreeCanvas.tsx:135-266`）：加 `React.memo`，`useTreeStore()` 改為精確 selector：
   ```ts
   const selectedNodeId = useTreeStore(s => s.selectedNodeId);
   const copiedNodeId = useTreeStore(s => s.copiedNodeId);
   const selectNode = useTreeStore(s => s.selectNode); // action, stable ref
   ```
3. **NodeCard**（`src/components/NodeCard.tsx:33-34`）：同理改為精確 selector，action 用 `getState()` 取
4. **collapsedNodes**（`src/components/TreeCanvas.tsx:151`）：改用精確訂閱：
   ```ts
   const isCollapsed = useUIStore(s => s.collapsedNodes.has(data.node.id));
   ```
5. **DragStateContext**（`src/components/TreeCanvas.tsx:417`）：用 `useMemo` 包裹 value object

| 優點 | 缺點 |
|------|------|
| 效能提升 10-50x（50 次 re-render → 1-2 次） | handler 內不再是 React 響應式，需確保讀取時機正確 |
| 非破壞性，不改 API 和行為 | 精確 selector 要逐一確認每個元件真正需要的欄位 |
| 三位工程師都點名，信號最強 | 需仔細測試所有鍵盤操作路徑 |

**工作量**：**M**（約 1 天）

---

### 改進 2：NodeCard Rules of Hooks 違反（拆元件）

**涵蓋問題**：
- `NodeCard.tsx` 第 66 行 `if (isRoot) return` 之後才宣告 `useState`、`useEffect`
- **三位工程師唯一的共同 P0 問題**

**現狀問題**：`useState`（imageSrc, showLightbox）和 `useEffect`（lightbox keydown, image loading）在 `if (isRoot) { return ... }` 的 early return 之後才宣告，違反 React Rules of Hooks——hooks 的呼叫順序必須在每次 render 都相同。目前沒 crash 只因為 `isRoot` 在 node 生命週期內不會動態改變，但這是定時炸彈，React Strict Mode 或未來版本可能直接報錯。

**具體做法**：
1. 拆成 `RootNodeHeading` + `LeafNodeCard` 兩個獨立元件
2. 保留薄 wrapper `NodeCard` 做條件判斷：
   ```tsx
   function NodeCard(props) {
     if (props.isRoot) return <RootNodeHeading {...props} />;
     return <LeafNodeCard {...props} />;
   }
   ```
3. 共用邏輯（editValue、commitEdit、onKeyDown handler）提取到 `useNodeEdit` hook
4. 更新 `TreeBranch` 和 `DragOverlay` 的引用（props 接口不需要變）

| 優點 | 缺點 |
|------|------|
| 消除 React 規範違反，防止未來難追蹤的 bug | 需搬動共用 style/logic |
| 拆分後各元件更小、更好理解、更好測試 | 影響 TreeBranch、DragOverlay 兩處引用 |
| RootNodeHeading 不再載入 image 邏輯，render 更快 | |

**工作量**：**S**（約 2-3 小時）

---

### 改進 3：Store 循環依賴 + Compact 邏輯重構

**涵蓋問題**：
- `treeStore` ↔ `contextStore` 循環 import（`treeStore.ts:6-7`、`contextStore.ts:5`）
- `applyCompact` 是 500 行的 async orchestrator（`treeStore.ts:365-487`）
- compact 觸發邏輯在 `useKeyboard.ts:293-318` 和 `ContextMenu.tsx:170-192` 重複
- `uiStore` 過肥（compact 相關佔 9 state + 7 action）
- `activeProfileId` 散落在 3 處 localStorage 讀取

**現狀問題**：三個 store 互相 import 形成循環依賴，模組邊界模糊。`applyCompact` 把 tree diff 計算、IPC 序列呼叫、highlight map 建構全塞在一個 store action。compact 觸發流程 copy-paste 了兩份。`localStorage.getItem("mindflow-active-ai-profile")` 散落在三處（useKeyboard、AISettings、ContextMenu），修改時容易遺漏。

**具體做法**：
1. 建立 `src/lib/compactService.ts`，提取 `triggerCompact(nodeId: string)` 統一觸發流程（讀 profileId → 設 loading → 呼叫 IPC → applyCompact → 設 applied/error），useKeyboard 和 ContextMenu 都改為呼叫此函式
2. 把 applyCompact 的 tree diff/highlight 計算邏輯提取為純函式到 `src/lib/treeUtils.ts`，可獨立單元測試
3. `activeProfileId` 納入 uiStore 管理（初始化從 localStorage 讀取，修改時同步寫回），三處改為 `useUIStore.getState().activeProfileId`
4. 打破循環依賴：`treeStore.updateNodeTitle` 中呼叫 `contextStore` 改為由呼叫端（或 subscribe pattern）觸發；`contextStore.switchContext` 中呼叫 `treeStore.clearUndo()` 同理

| 優點 | 缺點 |
|------|------|
| 消除循環依賴，模組邊界清晰 | 重構範圍大，涉及 4-5 個檔案 |
| compact 邏輯可獨立測試 | 可能需引入 event emitter 增加少量抽象 |
| DRY：compact 觸發邏輯只寫一次 | applyCompact IPC 序列提取需仔細確保 error recovery |
| 消除 activeProfileId 散落問題 | |

**工作量**：**L**（約 2-3 天）

---

### 改進 4：A11y 焦點指示 + ARIA 標記

**涵蓋問題**：
- 全域 `*:focus { outline: none }` 消除所有焦點指示（`index.css:125-127`）
- QuickSwitcher 缺 ARIA role（`QuickSwitcher.tsx:195-298`）
- MarkdownEditor toolbar 缺 aria-label（`MarkdownEditor.tsx:86-145`）

**現狀問題**：鍵盤使用者完全無法知道焦點在哪。`QuickSwitcher` 是核心操作元件，但沒有任何 ARIA role：modal overlay 缺 `role="dialog"`、列表缺 `role="listbox"`、項目缺 `role="option"`、缺 `aria-activedescendant`。作為 keyboard-first 的 ADHD 友善工具，焦點指示器不只是合規問題，更是核心使用體驗。

**具體做法**：
1. `index.css` 改為：
   ```css
   *:focus:not(:focus-visible) { outline: none; }
   *:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
   ```
2. QuickSwitcher 加上 ARIA：
   - 外層 `role="dialog" aria-modal="true" aria-label="Quick Switcher"`
   - 列表容器 `role="listbox"`
   - 每個項目 `role="option" aria-selected={isSelected}`
   - input 加 `aria-autocomplete="list"` 和 `aria-activedescendant`
3. MarkdownEditor toolbar 按鈕加 `aria-label`（"Bold", "Italic" 等）和 `aria-pressed={active}`

| 優點 | 缺點 |
|------|------|
| 一行 CSS 修復最嚴重的 a11y 問題 | 需逐一檢查現有 focus style 是否衝突 |
| ADHD 使用者也受惠（知道「我在哪裡」） | ARIA 標記需持續維護，新增元件時容易遺忘 |
| `:focus-visible` WKWebView 原生支援 | |

**工作量**：**S**（約半天）

---

### 改進 5：IPC 零錯誤處理 + loadTree 功能性 Bug

**涵蓋問題**：
- `ipc.ts` 所有 21 個 invoke wrapper 裸露無 try/catch（`ipc.ts:7-83`）
- `loadTree` 切換 context 不清 `selectedNodeId`（`treeStore.ts:111-117`）— 功能性 bug
- `startCompactFade` 巢狀 setTimeout 無 cleanup（`uiStore.ts:174-181`）

**現狀問題**：Rust 後端報錯時前端完全靜默，使用者不知道發生了什麼。切換 context 後可能殘留前一個 context 的 node ID，造成幽靈選中狀態（新 context 的樹沒有任何節點被正確選中）。巢狀 setTimeout 沒有存 timer reference，快速連續觸發 compact 時可能 race condition（前一個 timer 的 callback 清掉後一個的 highlights）。

**具體做法**：
1. `ipc.ts` 建立統一 error wrapper：
   ```typescript
   async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
     try {
       return await invoke<T>(cmd, args);
     } catch (err) {
       console.error(`[ipc] ${cmd} failed:`, err);
       throw err;
     }
   }
   ```
   所有 invoke 呼叫改用 `safeInvoke`
2. 修復 `loadTree`：切換 context 時強制重設 selectedNodeId：
   ```typescript
   loadTree: async (contextId) => {
     const tree = await ipc.getTree(contextId);
     set({ tree, selectedNodeId: tree ? tree.node.id : null });
   }
   ```
3. 修復 `startCompactFade`：用 store 外的 `let fadeTimerId` 追蹤 timer，進入前先 `clearTimeout(fadeTimerId)`

| 優點 | 缺點 |
|------|------|
| 修復一個真實的功能性 bug（幽靈選中） | safeInvoke 的 console.error 不是最終方案（需 toast） |
| 為未來 toast 通知打好基礎 | loadTree 改法需確認無邊緣情境 |
| 低風險、高確定性 | |

**工作量**：**S**（約半天）

---

## 建議執行順序

| 順序 | 改進 | 工作量 | 理由 |
|------|------|--------|------|
| 1st | #2 NodeCard 拆元件 | S | 最小工作量、三方共識、修正規範違反 |
| 2nd | #5 IPC 錯誤處理 + Bug | S | 修真實 bug + 防禦性基建 |
| 3rd | #4 A11y 焦點 + ARIA | S | 半天搞定、合規必須 |
| 4th | #1 Re-render 風暴 | M | 收益最大但需仔細測試 |
| 5th | #3 Store 重構 | L | 影響最深但工作量最大，安排在重構週期 |

> 前三項合計約 2 天，可以在一個 sprint 內先交付。第四項再花 1 天。第五項留給專門的重構週期。

---

## 附錄：各工程師完整問題清單

### 效能工程師發現的問題

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | 高 | `TreeCanvas.tsx:135-266` | TreeBranch 無 `React.memo` + 寬泛 store 訂閱 |
| 2 | 中 | `TreeCanvas.tsx:64-125` | SortableChildRow 無 `React.memo` |
| 3 | 中 | `TreeCanvas.tsx:417` | DragStateContext.Provider value 每次 render 新 object |
| 4 | 低 | `TreeCanvas.tsx:274-281` | compactNodeIds 的 findNode 每次 re-render 遍歷整棵樹 |
| 5 | 低 | `TreeCanvas.tsx:334-396` | handleDragEnd 的 tree dependency 頻繁重建 callback |
| 6 | 高 | `NodeCard.tsx:99-111` | Hooks 在 isRoot early return 之後呼叫（Rules of Hooks 違反） |
| 7 | 高 | `NodeCard.tsx:33-34` | 每個 NodeCard 訂閱整個 treeStore 和 uiStore |
| 8 | 低 | `NodeCard.tsx:41-45` | useEffect 監聽 isSelected 每次選擇都觸發 |
| 9 | 低 | `NodeCard.tsx:104-111` | lightbox keydown listener 每個 NodeCard 各自掛 |
| 10 | 高 | `treeStore.ts` | `useTreeStore()` 寬訂閱在多處元件使用 |
| 11 | 中 | `treeStore.ts:60-65` | patchNode 每次建立整棵樹的新 reference |
| 12 | 低 | `treeStore.ts` | flattenNodes 在多處重複呼叫 |
| 13 | 中 | `uiStore.ts:97,123-127` | collapsedNodes Set 觸發所有 TreeBranch re-render |
| 14 | 低 | `uiStore.ts:52,151-159` | compactHighlights Map 同樣的 reference 問題 |
| 15 | 中 | `uiStore.ts:174-181` | startCompactFade setTimeout 沒有 cleanup |
| 16 | 高 | `useKeyboard.ts:386-387` | useEffect 30 個 deps 頻繁 attach/detach listener |
| 17 | 中 | `useKeyboard.ts:192-220` | j/k 導航每次按鍵重算 getNodeDepth + getNodesAtDepth |
| 18 | 低 | `App.tsx:20-21` | compactState/compactError 可提取為獨立元件 |
| 19 | 低 | `QuickSwitcher.tsx:10-18,203` | timeAgo 每次 re-render 重算 |
| 20 | 低 | `QuickSwitcher.tsx:204` | allItems.indexOf 是 O(n) 查詢 |
| 21 | 低 | `ContentPanel.tsx:22` | findNode 在 render 時同步呼叫 |
| 22 | 中 | `ContentPanel.tsx:18` | 寬訂閱 useTreeStore() 取 tree |
| 23 | 低 | `ContextMenu.tsx:74-203` | items 陣列每次 render 重建 |

### 架構工程師發現的問題

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | 高 | `treeStore.ts:6-7` / `contextStore.ts:5` | Store 間循環依賴 |
| 2 | 中 | `treeStore.ts:94-102` | isCompactLocked 跨 store 讀取散落在 helper function |
| 3 | 高 | `treeStore.ts:365-487` | applyCompact 是 500 行 async orchestrator |
| 4 | 中 | `treeStore.ts:489-508,564-575` | undoCompact 與 undo compact case 邏輯重複 |
| 5 | 低 | `treeStore.ts:260-264` | pasteAsNode 內含文字截斷業務規則 |
| 6 | 高 | `treeStore.ts:111-117` | loadTree 不清空 selectedNodeId（功能性 bug） |
| 7 | 中 | `contextStore.ts:49-58` | archiveContext 手動 IPC 繞過 loadContexts |
| 8 | 中 | `contextStore.ts:37-42` | switchContext 跨 store 呼叫 treeStore.clearUndo |
| 9 | 低 | `uiStore.ts:46` | collapsedNodes 切換 context 時不清空 |
| 10 | 中 | `uiStore.ts:51-85` | Compact 相關佔 uiStore 一半介面 |
| 11 | 中 | `uiStore.ts:174-181` | startCompactFade raw setTimeout 無 cleanup |
| 12 | 低 | `uiStore.ts:14-35` | applyCustomColors DOM side effect 住在 store |
| 13 | 中 | 多處 | activeProfileId 散落 3 處 localStorage 讀取 |
| 14 | 中 | `TreeCanvas.tsx:283-396` | Drag state 邏輯應提取為 useDragHandlers hook |
| 15 | 低 | `TreeCanvas.tsx:274-281` | compactNodeIds IIFE 寫法降低可讀性 |
| 16 | 中 | `TreeCanvas.tsx:148-154` | TreeBranch 從 uiStore 訂閱多個不相關 state slice |
| 17 | 高 | `NodeCard.tsx:99-130` | 條件式 Hooks（同效能工程師） |
| 18 | 低 | `NodeCard.tsx:87,190` | onKeyDown inline handler 過長且重複兩處 |
| 19 | 中 | `NodeCard.tsx:31-247` | NodeCard 職責過多（editing + lightbox + file + badge + drag） |
| 20 | 中 | `useKeyboard.ts:386-387` | useEffect 28 個依賴項 |
| 21 | 高 | `useKeyboard.ts:296-318` / `ContextMenu.tsx:170-193` | Compact 觸發邏輯重複 |
| 22 | 中 | 多處 | findNode 重複定義 4 處 |
| 23 | 高 | `ipc.ts:7-83` | 完全沒有錯誤處理 |
| 24 | 低 | `ipc.ts:35-37` | updateNode 的 nodeType 型別是 string 非 NodeType |
| 25 | 中 | `types.ts:79` / `constants.ts:1` | types ↔ constants 循環 import |
| 26 | 低 | `types.ts:54` / `NodeCard.tsx:10-15` | CompactChangeType 與 HIGHLIGHT_COLORS key 不同步 |
| 27 | 低 | `App.tsx:28-32` | 初始化用 getState() snapshot 讀取 |
| 28 | 低 | `App.tsx:51-82` | Loading overlay / error dialog 應提取為元件 |

### UX/樣式工程師發現的問題

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1.1 | 低 | `index.css:17-29` | CSS 變數 border/overlay/hover 重複定義 |
| 1.2 | 中 | `index.css:12-15` / 各主題 | 節點顏色無法主題化 |
| 1.3 | 高 | `index.css:125-127` | 全域 `*:focus { outline: none }` 移除焦點指示 |
| 1.4 | 低 | `index.css:122` | 全域 `user-select: none` 阻止文字選取 |
| 1.5 | 低 | `index.css:224-229` | prose-editor hr 在淺色主題下近乎不可見 |
| 2.1 | 高 | `TreeCanvas.tsx:232-263` | 展開/收起無任何動畫（ADHD 方向感喪失） |
| 2.2 | 中 | `TreeCanvas.tsx:215-229` | 收起狀態圓點群 8x8px 點擊目標過小 |
| 2.3 | 中 | `TreeCanvas.tsx:428-442` | 拖放 Overlay 無尺寸限制 + reorder 無插入線指示 |
| 2.4 | 低 | `TreeCanvas.tsx:100-113` | 連接線顏色用 text-secondary 語意不正確 |
| 2.5 | 低 | `TreeCanvas.tsx:399-412` | 空狀態缺乏引導性（無 spinner、無圖示） |
| 3.1 | 高 | `NodeCard.tsx:66-101` | Hooks 在 early return 後呼叫（三方共識） |
| 3.2 | 中 | `NodeCard.tsx:138-146` | 選中狀態 700ms transition 過慢（ADHD 需即時反饋） |
| 3.3 | 中 | `NodeCard.tsx:233-244,104-111` | Lightbox 無動畫 + ESC 事件競爭 |
| 3.4 | 低 | `NodeCard.tsx:147-150` | compact highlight borderLeft 3px 造成 layout shift |
| 3.5 | 中 | `NodeCard.tsx:176-183` | type badge 是 div 非 button，20x20px 目標過小 |
| 3.6 | 低 | `NodeCard.tsx:87,190` | editing input onKeyDown 單行過長且重複 |
| 4.1 | 高 | `QuickSwitcher.tsx` | Modal 無進場/退場動畫 |
| 4.2 | 中 | `QuickSwitcher.tsx:99,115` | 鍵盤選中項目沒有 scroll-into-view |
| 4.3 | 低 | `QuickSwitcher.tsx:231,277,282` | 用 emoji 做 icon 跨平台不一致 |
| 4.4 | 中 | `QuickSwitcher.tsx:33` | focus 管理用 setTimeout(50ms) 反模式 |
| 4.5 | 高 | `QuickSwitcher.tsx:195-298` | 搜尋結果缺 `role="listbox"` 和 ARIA 關聯 |
| 5.1 | 低 | `StatusBar.tsx:25-44` | 三個按鈕 hover 樣式不一致 |
| 5.2 | 中 | `StatusBar.tsx:13-46` | 缺少 ARIA landmark 和 aria-live |
| 6.1 | 中 | `NodeTypePopover.tsx:90` | Popover 位置固定不跟隨節點 |
| 6.2 | 低 | `NodeTypePopover.tsx:82-142` | Popover 無進場動畫 |
| 6.3 | 中 | `NodeTypePopover.tsx:83-142` | 缺 `role="menu"` / `role="menuitem"` |
| 7.1 | 高 | `ContextMenu.tsx:61-67` | render phase 用 `getState()` 繞過響應式更新 |
| 7.2 | 中 | `MarkdownEditor.tsx:86-145` | 工具列按鈕缺 aria-label / aria-pressed |
| 7.3 | 低 | `ContentPanel.tsx:43` | 固定寬度 480px 無法響應不同螢幕 |
| 7.4 | 中 | `CompactBanner.tsx:27` | `[u] 復原` 是純文字不可點擊 |
| 7.5 | 低 | `ThemeSwitcher.tsx:45-55` | 主題圓點缺 aria-label / aria-pressed |
| 7.6 | 低 | `NodeSearch.tsx:103` | 搜尋 icon 用 emoji 風格不一致 |
| 7.7 | 中 | `AISettings.tsx:168-176` | select 無自訂箭頭 + option 在深色主題下突兀 |
