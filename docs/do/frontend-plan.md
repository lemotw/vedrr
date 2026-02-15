# Mind Flow — Frontend Execution Plan

> Date: 2025-02-14
> Reference: PRD v1.0, design/design.pen (6 screens)

---

## 1. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Desktop Framework | **Tauri 2.x** | 輕量、原生效能、Rust backend、macOS 優先 |
| Frontend Framework | **React 19 + TypeScript** | 生態成熟、tree 渲染彈性大 |
| Build Tool | Vite | 快、HMR 好 |
| State Management | Zustand | 輕量、不需 boilerplate |
| Styling | Tailwind CSS + CSS Variables | Design tokens 映射方便 |
| Markdown Editor | Tiptap (ProseMirror) | 可擴展、支援 custom node |
| Tree Rendering | Custom Canvas/DOM hybrid | 無現成 lib 滿足 horizontal XMind layout |

---

## 2. Design Token System

從 design.pen 提取的 design variables，對應 CSS custom properties：

```css
:root {
  --bg-page: #1A1A1A;
  --bg-card: #212121;
  --bg-elevated: #2D2D2D;
  --accent-primary: #FF6B35;
  --accent-success: #00D4AA;
  --text-primary: #FFFFFF;
  --text-secondary: #777777;

  --font-heading: 'Oswald', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  --node-type-text: #4FC3F7;
  --node-type-markdown: #00D4AA;
  --node-type-image: #FFD54F;
  --node-type-file: #CE93D8;
}
```

---

## 3. Screen Breakdown & Components

### 3.1 Focus Mode (`comiU` — 1440x900)

主畫面，MVP 核心。

**Components:**
- `<StatusBar />` — context 名稱 + active 數量 + ⌘K 按鈕
- `<TreeCanvas />` — 水平 XMind tree 渲染區
- `<NodeCard />` — 單一 node 的 card 渲染（icon badge + label）
- `<NodeImageCard />` — Image 類型 node（icon + label + thumbnail）
- `<TreeConnectors />` — h-line + v-bar 連接線

**Tree Layout Algorithm:**
- 水平方向：parent → h-line(20px) → v-bar → children
- 垂直方向：children 等間距排列（gap 14px）
- Card style：cornerRadius 6, bg-card, padding [8, 12]
- Icon badge：20x20, bg-elevated, cornerRadius 4
- Root node：Oswald 28px, h-line 40px, v-bar padding [18, 0]

**Implementation Steps:**

1. **Tree Layout Engine**
   - 實作 recursive layout algorithm
   - Input: tree data (nodes + children)
   - Output: 每個 node 的 {x, y, width, height}
   - 支援 collapse/expand

2. **Node Rendering**
   - 4 種 node type 對應 4 種 render 方式
   - [T] 純文字：card + inline editable text
   - [M] Markdown：card + click 開 editor
   - [I] Image：card + 160x90 thumbnail
   - [F] 檔案：card + click 呼叫系統 open

3. **Connector Rendering**
   - SVG 或 Canvas 繪製水平線 + 垂直 bar
   - 根據 children 數量動態計算 v-bar 高度

4. **Tree Interaction**
   - 鍵盤導航（方向鍵 navigate nodes）
   - Enter = 編輯 selected node
   - Tab = 新增子節點
   - ⇧Tab = 新增同級節點
   - Drag & drop 重新排列/改層級

### 3.2 Quick Switcher (`7i1hb` — 480x520)

**Components:**
- `<QuickSwitcher />` — modal overlay
- `<SearchInput />` — 模糊搜尋 input
- `<ContextItem />` — 單一 context 列表項
- `<SectionDivider />` — Active / Archived 分隔線

**Implementation Steps:**

1. ⌘K 觸發 modal（focus trap）
2. 即時模糊搜尋 context 名稱（client-side filter）
3. 鍵盤上下選擇 + Enter 切換
4. 選中 Archived context → 自動 activate
5. Esc 關閉
6. Footer：[+ New] 新建 context、[Context Manager] 開 manager

### 3.3 Context Manager (`aHNEx` — 900x900)

**Components:**
- `<ContextManager />` — full panel overlay
- `<SearchBar />` — search + tag filter chips
- `<ContextSection />` — Active / Archived / Vault 區塊
- `<ContextRow />` — 名稱 + tag + 時間 + node 數
- `<GraphView />` — Common Knowledge graph
- `<InsightsBar />` — 統計數據

**Implementation Steps:**

1. ⌘⇧K 觸發全畫面 panel
2. Tag filter system（toggle chips）
3. Context 列表 + 右鍵 context menu
4. Common Knowledge graph view（用 d3-force 或 @xyflow/react）
5. Insights bar（讀取 backend 統計數據）

### 3.4 Node Popover (`JLrIJ` — 1440x900)

**Components:**
- `<NodePopover />` — floating panel
- `<TypeSelector />` — 2x2 grid 選 node type
- `<InlineRename />` — node 改名 input

**Implementation Steps:**

1. 右鍵 node → 顯示 popover
2. Type selector grid（4 types + color coding）
3. Inline rename with auto-focus
4. Click outside = 關閉

### 3.5 Markdown Editor (`p5XaP` — 1440x900)

**Components:**
- `<MarkdownEditor />` — split panel layout
- `<TreePanel />` — 左側 340px tree 列表
- `<EditorPanel />` — 右側 Tiptap editor
- `<EditorToolbar />` — formatting toolbar
- `<EditorStatusBar />` — 字數 + 儲存狀態

**Implementation Steps:**

1. Click [M] node → open split panel
2. 左側 tree panel（mini tree view，highlight 當前編輯 node）
3. 右側 Tiptap editor（Markdown 語法 + 快捷鍵）
4. Auto-save to local file system（debounced）
5. 狀態列：字數、行數、儲存狀態

### 3.6 Wide Tree (Performance)

Wide Tree (`Azwo5`) 展示 66+ nodes across 5 levels，是效能參考。

**Performance Strategy:**
- Virtual rendering：只渲染 viewport 內的 nodes
- Canvas-based connectors（避免大量 SVG DOM）
- requestAnimationFrame for smooth scroll/pan
- Memoized layout calculation

---

## 4. State Architecture

```
Store
├── contexts/
│   ├── activeContexts: Context[]
│   ├── archivedContexts: Context[]
│   ├── currentContextId: string | null
│   └── actions: { switch, create, archive, activate, delete }
├── tree/
│   ├── nodes: Map<nodeId, TreeNode>
│   ├── selectedNodeId: string | null
│   ├── expandedNodes: Set<string>
│   └── actions: { addChild, addSibling, move, delete, updateContent }
├── editor/
│   ├── isOpen: boolean
│   ├── editingNodeId: string | null
│   └── actions: { open, close, save }
├── ui/
│   ├── quickSwitcherOpen: boolean
│   ├── contextManagerOpen: boolean
│   ├── popoverTarget: { nodeId, position } | null
│   └── actions: { toggleSwitcher, toggleManager, showPopover }
└── knowledge/
    ├── trees: KnowledgeTree[]
    ├── edges: Edge[]
    └── actions: { create, link, unlink }
```

---

## 5. IPC Layer (Tauri Commands)

Frontend 透過 Tauri invoke 呼叫 Rust backend：

```typescript
// Context CRUD
invoke('create_context', { name, tags })
invoke('list_contexts', { filter })
invoke('switch_context', { contextId })
invoke('archive_context', { contextId })
invoke('activate_context', { contextId })
invoke('delete_context', { contextId })

// Node CRUD
invoke('create_node', { contextId, parentId, type, content })
invoke('update_node', { nodeId, updates })
invoke('move_node', { nodeId, newParentId, position })
invoke('delete_node', { nodeId })
invoke('get_tree', { contextId })

// File operations
invoke('read_file_node', { nodeId })
invoke('save_file_node', { nodeId, content })
invoke('open_external', { nodeId })

// Search
invoke('search_contexts', { query })
invoke('search_nodes', { query, contextId? })

// Insights
invoke('get_insights', { date })
```

---

## 6. Keyboard System

全域 keyboard handler，分層處理：

```
Layer 1 — Global (always active)
  ⌘K → Quick Switcher
  ⌘⇧K → Context Manager
  ⌘N → New Context

Layer 2 — Focus Mode (when tree is focused)
  ↑↓←→ → Navigate tree
  Enter → Edit node
  Tab → New child
  ⇧Tab → New sibling
  Delete/Backspace → Delete node
  Right-click / ⌘. → Node popover

Layer 3 — Quick Switcher (when switcher is open)
  ↑↓ → Navigate list
  Enter → Switch context
  P → Archive selected
  Esc → Close

Layer 4 — Editor (when markdown editor is open)
  ⌘S → Save
  Esc → Close editor
```

---

## 7. Milestones

### M1: Skeleton (Week 1-2)
- [ ] Tauri + React + Vite project scaffold
- [ ] Design token system (CSS variables)
- [ ] Basic routing: Focus Mode ↔ Context Manager
- [ ] StatusBar component
- [ ] IPC layer boilerplate

### M2: Tree Core (Week 3-4)
- [ ] Tree layout engine (horizontal XMind)
- [ ] NodeCard rendering (4 types)
- [ ] Tree connectors (h-line + v-bar)
- [ ] Keyboard navigation in tree
- [ ] Node CRUD (add child, sibling, delete)

### M3: Context Lifecycle (Week 5-6)
- [ ] Quick Switcher (⌘K)
- [ ] Context create/switch/archive
- [ ] Context list + state badges
- [ ] Fuzzy search

### M4: Editor & Interaction (Week 7-8)
- [ ] Markdown editor (Tiptap split panel)
- [ ] Inline text editing ([T] nodes)
- [ ] Image thumbnail rendering ([I] nodes)
- [ ] External file open ([F] nodes)
- [ ] Node popover (type change, rename)

### M5: Context Manager (Week 9-10)
- [ ] Full Context Manager panel
- [ ] Tag system (create, filter)
- [ ] Vault section
- [ ] Common Knowledge graph view (basic)
- [ ] Insights bar

### M6: Polish (Week 11-12)
- [ ] Drag & drop (node reorder + reparent)
- [ ] Performance optimization (virtual rendering)
- [ ] Transition animations
- [ ] Edge cases & error handling
- [ ] Accessibility (a11y labels, focus management)
