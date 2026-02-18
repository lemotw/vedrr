# 拖放排序功能 — 技術評估報告

> 2026-02-17

---




## 1. 現況分析

### 已有的基礎

| 面向             | 現狀                                                |
| -------------- | ------------------------------------------------- |
| 後端 `move_node` | 已實作，支援 reorder + reparent（改 parent_id + position） |
| IPC            | `ipc.moveNode(id, newParentId, position)` 已通      |
| 鍵盤排序           | Alt+↑/↓ 同級移動，已有 undo 支援                           |
| 樹渲染            | 遞迴 `TreeBranch` + flex 佈局 + 20px 弧形連接線            |
| 拖放庫            | **尚未安裝任何 DnD 函式庫**                                |

### 拖放需支援的操作

1. **Reorder** — 同級節點間拖動重新排序
2. **Reparent** — 拖到其他節點下方，變更父節點（較複雜）

---

## 2. 函式庫比較

| 標準                  |          **@dnd-kit** (v6)          | **pragmatic-drag-and-drop** (Atlassian) |  react-dnd  | @hello-pangea/dnd | 原生 HTML5 DnD |
| ------------------- | :---------------------------------: | :-------------------------------------: | :---------: | :---------------: | :----------: |
| 巢狀樹支援               |      好（nested SortableContext）      |         好（內建 tree instruction）          |   好（低階原語）   |     差（只支援列表）      |      手動      |
| 水平佈局                | 優（內建 horizontalListSortingStrategy） |                    好                    |      好      |         差         |      好       |
| Reparent            |           需手寫 onDragOver            |  **一等公民**（attachInstruction: reparent）  |     需手寫     |        困難         |      手寫      |
| 效能 (50-200 nodes)   |                  優                  |        優（headless, 零 re-render）         |     中等      |      差（整棵重繪）      |      最快      |
| Bundle size (gzip)  |               ~15 kB                |                ~10-12 kB                |   ~30 kB    |      ~33 kB       |     0 kB     |
| **Tauri WKWebView** |      **免設定**（用 Pointer Events）      |          需關閉 `dragDropEnabled`          |     需關閉     |        需關閉        |     需關閉      |
| 觸控（未來 iPad）         | **優**（PointerSensor + TouchSensor）  |                差（長按不穩定）                 | 需換 backend  |        中等         |      無       |
| 拖曳預覽                |     DragOverlay 可渲染任意 React 元件      |             Headless，需自行繪製              |    需手動定位    |       內建動畫        |   只有瀏覽器預設    |
| 維護                  |       單人維護，v6 穩定但新版 v0.x 重寫中        |       Atlassian 團隊，Trello/Jira 在用       | **已停維 4 年** |     社群維護 fork     |    瀏覽器標準     |

### 結論：**推薦 @dnd-kit (v6)**

理由：

1. **Tauri 零衝突** — 使用 Pointer Events，不需要動 `tauri.conf.json` 的 `dragDropEnabled`。pragmatic-drag-and-drop 用 HTML5 DnD API，會被 Tauri 攔截，必須關閉 `dragDropEnabled: false`。
2. **觸控支援** — 未來 iPad 可直接用，無需 polyfill。
3. **DragOverlay** — 可直接渲染 NodeCard 元件作為拖曳預覽，對 ADHD 友善的即時視覺回饋很重要。
4. **生態成熟** — [dnd-kit-sortable-tree](https://github.com/Shaddix/dnd-kit-sortable-tree) 社群元件可參考。

次選：pragmatic-drag-and-drop（如果不考慮 iPad，tree reparent API 最完整）。

---

## 3. 實作方案

### 3a. 架構設計

```
TreeCanvas
  └─ DndContext (sensors, collisionDetection, onDragStart/Over/End)
       └─ SortableContext (root children)
            └─ SortableTreeBranch
                 ├─ useSortable() → NodeCard (draggable + droppable)
                 └─ SortableContext (this node's children)
                      └─ SortableTreeBranch (遞迴)
```

### 3b. 需要新增/修改的檔案

| 檔案 | 變更 |
|------|------|
| `package.json` | 新增 `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` |
| `src/components/TreeCanvas.tsx` | 包裹 `DndContext` + `SortableContext`，改 TreeBranch 為 Sortable |
| `src/components/NodeCard.tsx` | 加入 drag handle（可用整張卡片或小 icon） |
| `src/components/DragOverlay.tsx` | **新增** — 拖曳時的浮動 NodeCard 預覽 |
| `src/stores/treeStore.ts` | 新增 `moveNodeTo(nodeId, newParentId, position)` action（支援 reparent undo） |
| `src/lib/dnd-utils.ts` | **新增** — collision detection 邏輯、tree flatten/unflatten helpers |

### 3c. 核心流程

```
onDragStart(event)
  → 記錄 draggedNodeId
  → 設定 DragOverlay 顯示 NodeCard 快照
  → 原始 NodeCard 降低透明度 (opacity-40，沿用 cut 的樣式)

onDragOver(event)
  → 偵測 hover 的 drop target
  → 如果是同級 → 計算新 index，顯示插入線指示器
  → 如果是其他節點 → 高亮為「放入子節點」(accent-primary ring)

onDragEnd(event)
  → 計算最終 parent + position
  → 呼叫 ipc.moveNode(nodeId, newParentId, position)
  → pushUndo (存 oldParentId + oldPosition)
  → loadTree() 重新渲染
  → clearCut() (如同其他 mutating action)
```

### 3d. Drop Zone 判定邏輯

對每個 TreeBranch 節點，drop zone 分為三區：

```
┌─────────────────────────┐
│  上 1/4 → 插入為前一個同級  │
│─────────────────────────│
│  中 1/2 → 放入為子節點      │
│─────────────────────────│
│  下 1/4 → 插入為後一個同級  │
└─────────────────────────┘
```

- 同級：呼叫 `moveNode(id, sameParentId, newPosition)`
- 子節點：呼叫 `moveNode(id, targetNodeId, 0)` 放在最前面

### 3e. 限制條件

- **Root 不可拖** — 樹根節點禁止拖放
- **不可拖到自己的子孫** — 防止循環（dnd-kit collision detection 需排除 descendant）
- **拖放中禁止鍵盤操作** — isDragging 時 guard useKeyboard

---

## 4. 效能影響評估

### 4a. 渲染開銷

| 場景 | 影響 | 嚴重度 |
|------|------|:------:|
| **靜態渲染（非拖曳時）** | 每個 node 多一個 `useSortable()` hook + DOM attributes (`aria-*`, `data-*`)。無額外 re-render。 | 低 |
| **拖曳開始** | 建立 DragOverlay（1 個 NodeCard 複製），原 node opacity-40。 | 低 |
| **拖曳移動** | DragOverlay 跟隨指標（transform only，無 layout reflow）。`onDragOver` 觸發頻率高但只計算 drop zone，不重繪。 | 中 |
| **跨容器移動** | React state 更新：移除舊 SortableContext item + 加入新 SortableContext item → 兩個容器 re-render。 | 中 |
| **放下（drop）** | 一次 IPC 呼叫 + `loadTree()` 完整重繪。和現有 Alt+↑/↓ 一樣。 | 低 |

### 4b. 節點規模與效能

| 節點數 | 預估體驗 | 瓶頸 |
|--------|---------|------|
| < 30 | 流暢 | 無 |
| 30-100 | 流暢 | 無 |
| 100-200 | 可能微卡 | collision detection 每 frame 遍歷 DOM rects |
| 200+ | 需優化 | 需虛擬渲染（已列為 #18） |

**緩解方案**（200+ 節點時）：
- `closestCenter` 而非 `rectIntersection` collision detection（更快）
- `useSensor(PointerSensor, { activationConstraint: { distance: 8 } })` — 8px 拖曳啟動閾值，避免誤觸
- 折疊遠處子樹（配合未來 collapse 功能）

### 4c. Bundle Size 影響

| 套件 | Size (gzip) |
|------|-------------|
| `@dnd-kit/core` | ~10 kB |
| `@dnd-kit/sortable` | ~4 kB |
| `@dnd-kit/utilities` | ~1 kB |
| **合計** | **~15 kB** |

目前 `node_modules` 已有 React (~40 kB) + Zustand (~2 kB) + Tiptap (~80 kB)。增加 15 kB 影響極小。

### 4d. 記憶體影響

- 每個 node 增加一個 `useSortable` context subscription → 約 0.5 KB/node
- DragOverlay 只在拖曳時存在（1 個元件）
- 200 節點額外記憶體 ≈ 100 KB，可忽略

---

## 5. 風險與注意事項

| 風險 | 等級 | 緩解 |
|------|:----:|------|
| dnd-kit 單人維護，v6→v1(新版) 遷移不確定 | 中 | v6 穩定可用，API 不會刪除。新版出穩定版再遷移 |
| 弧形連接線在拖曳中可能錯位 | 低 | DragOverlay 不繪製連接線，drop 後 loadTree 重繪 |
| 拖到自己子孫導致循環 | 高 | collision detection 中排除 descendants |
| Undo reparent 比 reorder 複雜 | 中 | UndoEntry 加 `oldParentId` 欄位即可 |
| 拖放與文字選取衝突 | 低 | 用 activationConstraint distance: 8 區分 |

---

## 6. 工時估計

| 階段 | 工時 |
|------|------|
| 安裝 + DndContext 基礎骨架 | 1h |
| 同級 reorder（SortableContext per parent） | 2h |
| Drop zone 判定 + 視覺指示器 | 2h |
| Reparent（跨容器拖放） | 2-3h |
| DragOverlay + 拖曳預覽 | 1h |
| Undo 支援（擴充 UndoEntry） | 1h |
| 防循環 + edge case 處理 | 1-2h |
| 測試 + 微調 | 1-2h |
| **合計** | **11-14h (L)** |

---

## 7. 替代方案

如果拖放成本太高，可先只做：

- **Alt+h/l reparent**（鍵盤重新歸屬）— 約 2h，不需安裝任何函式庫
  - Alt+l = 把當前 node 移入上一個同級的最後子節點
  - Alt+h = 把當前 node 提升到父節點的同級

這能以極低成本提供 reparent 功能，之後再加拖放也不衝突。
