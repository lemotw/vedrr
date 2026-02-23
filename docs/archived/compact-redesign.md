# AI Compact 重新設計

## 問題分析

### 現有方案的問題

1. **左面板（Changes）是 flat list，缺少層級上下文** — 變更清單以線性方式呈現，使用者無法直觀地感受到各節點在樹狀結構中的相對位置，難以判斷變更的影響範圍。

2. **右面板只顯示新結構，無法和原始結構比較** — 使用者只能看到 AI 提案的結果，卻看不到原始的樹，需要靠記憶力去比對差異，認知負擔極高。

3. **缺少 before/after 並排對比** — 雙面板並非真正的並排比較，左右兩側的資訊維度不同（一邊是 diff list，一邊是新樹），難以快速評估 AI 決策的好壞。

4. **只有 Accept All / Cancel，全有全無** — 缺乏顆粒度，使用者若對部分變更有疑慮，只能全盤拒絕，迫使 AI 重新生成或手動調整，操作成本高。

5. **一次展示太多信息，ADHD 使用者容易焦慮** — CompactPreview 同時呈現完整的 diff list 和新樹結構，資訊量超載，對注意力分散的 ADHD 使用者尤其不友好。

6. **缺乏鍵盤操作，與 vim-style 鍵盤優先的主 app 不一致** — 主要操作依賴滑鼠點擊 Accept/Cancel 按鈕，破壞了整個 app 的鍵盤優先設計哲學。

---

## 方案探索

### 方案 1：Inline Annotated Tree（單樹標注視圖）

以單棵帶 inline diff 標注的樹取代雙面板。每個節點直接在其樹中位置顯示變更狀態（KEEP / DELETE / ADD / EDIT / MOVE），使用 j/k 在有變更的節點間跳轉，按 Enter 全部接受。

**優點：**
- 一個焦點，認知負擔低
- 結構上下文清晰，使用者看得出 AI 動了哪個層級
- 鍵盤操作與主 app 一致

**缺點：**
- 仍是全有全無，無法選擇性接受
- DELETE ghost 邏輯複雜（已刪除的節點要不要渲染？）
- 變更數量達 20+ 時視覺像聖誕樹，過於雜亂

**改動量：** 中，約 200L

---

### 方案 2：Before/After Toggle（原地切換對比）

按 Tab 在 Before 和 After 兩棵完整樹之間「原地切換」，讓使用者感受結構差異。

**優點：**
- A/B 對比最直覺，使用者只需觀察切換前後的差異

**缺點：**
- ADHD 使用者工作記憶弱，一旦切走就忘記剛才看到什麼
- Tab 鍵語義與 app 中「新增子節點」衝突
- 兩棵樹結構差異較大時，原地切換反而更難追蹤

**PM 評分：** 最低 4/10

**改動量：** 中，約 250L

---

### 方案 3：Step-through Wizard（逐步確認精靈）

靈感來自 `git add -p`。一次只展示一個變更，使用 h/l skip/accept，頂部顯示進度條。

**優點：**
- 每次只需做一個決定，不會資訊超載
- 支持選擇性接受，顆粒度最細

**缺點：**
- 變更數量多時操作非常繁瑣
- 失去全局鳥瞰，使用者不知道 AI 的整體意圖
- 進度條（「3/23」）會觸發 ADHD 焦慮

**改動量：** 大，約 400L

---

### 方案 4：Hybrid — Annotated Tree + Quick Accept/Reject

單樹標注視圖加上每個有變更的節點旁顯示 [✓]/[○] toggle，使用者可逐一接受或略過。

**優點：**
- 一個視圖同時提供全局和顆粒度控制
- 鍵盤操作自然

**缺點：**
- 需要實作 partial tree builder 和節點間依賴分析
- 開發成本最高，邊界情況複雜

**改動量：** 大偏中，約 350L

---

### 方案比較

| 維度 | 方案 1 | 方案 2 | 方案 3 | 方案 4 |
|------|--------|--------|--------|--------|
| ADHD 友好度 | 6 | 4 | 兩極化 | 7 |
| 操作效率 | 7 | 5 | 3 | 6 |
| MVP 適合度 | 9（簡化後） | 5 | 2 | 4 |
| 邊界穩健度 | 6 | 3 | 3 | 6 |
| 與主 app 一致性 | 7 | 4 | 5 | 6 |
| 開發 ROI | 9 | 5 | 2 | 4 |

---

## 推薦方案：Auto-Apply with Summary & Undo

### 設計理念

- **Zero-decision by default** — AI 做完直接生效，使用者不需要做任何確認決策
- **3-second confidence** — Summary banner 讓使用者在 3 秒內知道發生了什麼
- **One-tap safety net** — 不滿意一鍵 Undo，不需要 preview 就有安全感
- **Non-blocking** — Banner 不阻擋操作，使用者可在看到摘要的同時正常用鍵盤導航

### 完整流程

1. 使用者觸發 AI Compact（右鍵選單或快捷鍵 `C`）
2. **Loading**：樹整體 dimmed，頂部顯示進度 bar，操作鎖定（保留 Esc 取消請求）
3. AI 返回結果 → 直接 apply → 樹切換為新結構
4. **Summary Banner** 出現：「AI 重組了 N 個節點 — X 新增 · Y 移動 · Z 刪除」
5. **Inline Color Coding** 同步出現：樹上各節點依變更類型顯示色彩標注
6. Banner non-blocking：j/k/h/l 仍可正常導航瀏覽新樹
7. 可展開詳情，查看 AI 的決策說明
8. 按 `u` = Undo 恢復原始樹；按 Esc 或 Enter = dismiss banner
9. 若 AI 判斷無需變更：顯示 toast「結構已經很好，無需調整」

### 狀態機

```
IDLE ──→ LOADING ──→ APPLIED ──→ IDLE
                          │
                        UNDONE ──→ IDLE
```

- `IDLE`：正常操作狀態
- `LOADING`：AI 請求進行中，操作鎖定，保留 Esc 取消
- `APPLIED`：AI 已套用，banner + 色彩標注顯示中，可 Undo 或 dismiss
- `UNDONE`：復原完成，短暫顯示 toast 後回到 IDLE

---

### Inline Color Coding（樹節點色彩標注）

#### 設計原則

Auto-Apply 後使用者看到樹結構突然改變，如果沒有視覺線索，必須自己做心智比對——這對 ADHD 使用者是巨大的認知負擔。色彩標注的目的不是「展示 AI 做了什麼」，而是 **讓使用者 5 秒內確認安全**。

#### 標注方式：左側色帶 + 背景 tint

每個有變更的節點同時使用兩種視覺提示：

1. **左側 3px 色帶**（類似 git diff 側邊標記）— 快速定位哪些節點有變化
2. **10% 背景 tint** — 提供歸屬感（「這整個卡片被標記了」）

```
┌─ 3px 色帶 ──┬──────────────────────────┐
│              │  T  新的子分類             │  ← 背景有 10% tint
│              │                          │
└──────────────┴──────────────────────────┘
```

#### 四種變更類型的色彩規格

| 操作 | 色帶顏色 | 背景 tint | 卡片內附加資訊 | 範例 |
|------|---------|----------|-------------|------|
| **新增** (added) | Teal `#2DD4BF99` | `#1E3A36` | 無 | `API Endpoints` |
| **編輯/改名** (edited) | Amber `#FBBF2499` | `#2D2A1F` | `← 舊名稱`（小字，琥珀色） | `API Design` ← Research Notes |
| **移動** (moved) | Blue `#4FC3F799` | `#1E2535` | `↗ from: 舊父節點`（小字，藍色） | `Meeting Notes` ↗ from: Root |
| **刪除** (deleted) | Red `#FF6B6B66` | `#351E1E` | 刪除線 + 半透明 (opacity 0.45) ghost 節點 | ~~空白筆記~~ |
| **保留** (kept) | 無 | 無 | 無 | 不標色 |

#### 色彩設計考量

- **深色主題適配**：所有顏色在 `#1A1A1A` / `#212121` 背景上測試過，確保可辨識但不刺眼
- **色盲安全**：Teal / Amber / Blue / Red 四色在三種主要色盲類型下都有足夠亮度差異，且搭配色帶形狀線索
- **不與節點類型色衝突**：節點類型色（T 藍 `#4FC3F7`、M 綠 `#00D4AA`、I 黃 `#FFD54F`、F 紫 `#CE93D8`）用於 badge，色彩標注用於卡片背景，兩者不衝突
- **10% tint 為甜蜜點**：5% 看不到，15% 開始搶注意力，20%+ 太重

#### 刪除節點的處理

刪除的節點已從新樹中消失，但使用者需要知道「刪了什麼」。處理方式：

1. **Banner 統計行**直接列出被刪節點名稱：`✕ 已刪除：「空白筆記」「重複的 API 備忘」`
2. **樹中顯示 ghost 節點**：在 children 列表尾部顯示半透明 (opacity 0.45) 的刪除節點，紅色背景 + 刪除線文字，保留 L 型連接線

#### 編輯節點的 from → to

改名的節點直接在卡片上顯示舊名稱，不需要展開 banner 也能看到：

```
┌─ amber bar ─┬──────────────────────────┐
│              │  T  API Design           │  ← 新名稱（主色）
│              │     ← Research Notes     │  ← 舊名稱（琥珀小字）
└──────────────┴──────────────────────────┘
```

#### 移動節點的處理

移動的節點顯示來源位置，讓使用者知道它是從哪裡移過來的：

```
┌─ blue bar ──┬──────────────────────────┐
│              │  F  Meeting Notes        │  ← 節點名稱
│              │     ↗ from: Root         │  ← 來源位置（藍色小字）
└──────────────┴──────────────────────────┘
```

#### 色彩標注生命週期

| 觸發事件 | 行為 |
|---------|------|
| Apply 完成 | 色彩標注立即出現 |
| 使用者按 `u` Undo | 色彩立刻消失（與 undo 同步） |
| 使用者 dismiss banner（Esc / Enter） | 色彩保留 3 秒 → 800ms fade out |
| 使用者按導航鍵（h/j/k/l） | 色彩立即開始 500ms fade out |
| 使用者操作樹（新增/刪除/移動節點） | 色彩立刻消失 |

設計理由：一旦使用者開始用 hjkl 瀏覽或操作樹，代表已進入「正常工作模式」，標注應該讓路。

#### 邊界情況：同時移動又改名

優先顯示 **edited**（黃色）。理由：使用者最關心「內容有沒有被改」，位置變化是結構性的，改名是內容性的。黃色比藍色更醒目，適合標示「被修改過的」。

---

### 畫面規格

> 設計稿見 `design/mindflow.pen` — R1~R5 + R2b 畫面

#### 狀態 1: Loading（R1）

樹整體降低透明度（dimmed, opacity 0.3），頂部出現 loading bar + 「AI 正在重組你的筆記...」文字，右側顯示「Esc 取消」。

#### 狀態 2: Applied + Summary Banner（R2）

新樹直接呈現。頂部 banner 顯示摘要（左側橘色 accent border 強調），包含：
- 統計行：「✦ AI 重組了 8 個節點 — 1 新增 · 4 移動 · 1 合併 · 2 刪除」
- 刪除明細：「✕ 已刪除：「空白筆記」「重複的 API 備忘」」
- 操作行：`[u] 復原`、`展開詳情 ▾`、`Enter/Esc 確認`

#### 狀態 2b: Applied + Inline Color Coding（R2b）

在狀態 2 的基礎上，樹節點加上色彩標注：
- 琥珀色（edited）：API Design ← Research Notes、Sprint Planning ← Meeting Notes
- 青綠色（added）：API Endpoints
- 藍色（moved）：Wireframe v2、Meeting Notes ↗ from: Root
- 紅色 ghost（deleted）：~~空白筆記~~、~~重複的 API 備忘~~

#### 狀態 3: Summary Banner 展開詳情（R3）

Banner 展開，顯示 AI 的決策說明（深色背景區塊）。例如：
- 建立「API Design」分類，收納分散的 API 相關筆記
- 「Random thoughts」→「Ideas」：名稱更精確
- 合併重複內容、刪除空白節點

#### 狀態 4: Undo 復原（R4）

樹瞬間切回原始快照，banner 消失，底部顯示綠色 toast「✓ 已復原到重組前的狀態」（3 秒自動消失）。

#### 狀態 5: 無變更（R5）

僅顯示 toast「✓ 結構已經很好，無需調整」。

---

### 鍵盤操作

| 狀態 | 按鍵 | 動作 |
|------|------|------|
| LOADING | Esc | 取消 AI 請求，回到 IDLE |
| APPLIED | `u` | Undo，恢復原始樹，顯示「已復原」toast |
| APPLIED | Esc / Enter | Dismiss banner + 色彩淡出，留在新結構 |
| APPLIED | j / k / h / l | 正常樹導航，banner 持續顯示，色彩開始淡出 |

---

### 設計決策紀錄

| 決策 | 選擇 | 理由 |
|------|------|------|
| Preview vs Auto-apply | Auto-apply | 零決策負擔，ADHD 友好；preview 步驟本身就是認知負擔 |
| Selective accept | 不做 | Decision fatigue 是 ADHD 核心問題；partial accept 可能破壞 AI 邏輯一致性 |
| Undo window | Banner 期間 + dismiss 後 30 秒 | 30 秒後使用者可能已在新結構上做手動編輯，Undo 會破壞後續工作 |
| Loading 鎖定 | 鎖定操作，保留 Esc | 防止 AI 處理期間的修改與返回結果衝突 |
| 連續觸發 | APPLIED 狀態禁止再次觸發 | 避免 Undo 鏈複雜度與 snapshot 管理問題 |
| 無變更處理 | Toast 提示，不顯示 banner | 無變更時 banner 毫無意義 |
| 首次使用引導 | Banner 多一行「按 u 可復原」 | localStorage 記錄，僅顯示一次 |
| AI 刪除策略 | Prompt 設定保守：優先移動/合併，謹慎刪除 | 從源頭降低「嚇到用戶」風險 |
| Inline 色彩標注 | 做，放 MVP 最後一項 | 不標反而更焦慮；Banner 覆蓋「量化摘要」，標注覆蓋「空間定位」，解決不同認知需求 |
| 移動節點標色 | 標（藍色） | 使用者需要知道節點從哪裡移來 |
| 刪除節點顯示 | Ghost 節點 + Banner 列出名稱 | 樹中 ghost 提供空間定位，banner 提供明確列表 |
| 編輯 from→to | 卡片上直接顯示 ← 舊名稱 | 不需要展開 banner 也能看到改名對照 |
| 色彩消失時機 | 導航鍵觸發淡出 | ADHD 友好：開始工作後標注讓路，不持續干擾 |

---

### 技術實作建議

#### 數據流

```
使用者觸發 AI Compact
       ↓
1. snapshot = deepClone(currentTree)          // 在 treeStore 中保存快照
2. uiStore.setCompactState("LOADING")
3. result = await ipc.compactNode(nodeId, profileId)
4. highlights = applyCompact(result)          // 套用新樹 + 回傳 highlight map
5. uiStore.setCompactHighlights(highlights)   // 存儲色彩標注
6. uiStore.showCompactBanner(result.summary)  // 顯示 banner
7. uiStore.setCompactState("APPLIED")
       ↓
使用者按 u：
1. treeStore.restoreSnapshot()               // 還原快照
2. uiStore.clearCompactHighlights()          // 清除色彩
3. uiStore.hideCompactBanner()
4. toast("已復原")
5. uiStore.setCompactState("IDLE")
       ↓
使用者按 Esc/Enter（dismiss）：
1. uiStore.hideCompactBanner()
2. startHighlightFadeOut()                   // 3 秒後開始 800ms 淡出
3. treeStore.clearSnapshot()                 // 釋放快照記憶體
4. uiStore.setCompactState("IDLE")
       ↓
使用者按 hjkl（導航）：
1. startHighlightFadeOut(immediate: true)    // 立即開始 500ms 淡出
```

#### Highlight Map 建立邏輯

在 `applyCompact` 的 `createChildren` 遞迴中，利用 `ProposedNode.source_id` 與原始樹做比對：

```typescript
type CompactChangeType = "added" | "edited" | "moved" | "edited+moved";

// 在 createChildren 內：
if (!p.source_id) {
  highlights.set(node.id, "added");
} else {
  const orig = origMap.get(p.source_id);
  if (orig) {
    const titleChanged = orig.title !== p.title;
    const parentChanged = orig.parentId !== originalParentId;
    if (titleChanged && parentChanged) highlights.set(node.id, "edited+moved");
    else if (titleChanged) highlights.set(node.id, "edited");
    else if (parentChanged) highlights.set(node.id, "moved");
    // 都相同 → 不加入 map（keep）
  }
}
```

#### 前端改動

- **修改 `ContextMenu.tsx`**：compact 觸發後直接 apply 而非先 preview
- **新增 `CompactBanner.tsx`**：non-blocking summary banner 組件，支持展開/收合、顯示刪除節點列表
- **修改 `treeStore.ts`**：
  - 增加 snapshot / restoreSnapshot / clearSnapshot
  - `applyCompact` 回傳 `Map<string, CompactChangeType>` highlight map
  - 建立 `origMap`（原始樹 flat map）用於比對
- **修改 `uiStore.ts`**：
  - 以 `compactState`（IDLE/LOADING/APPLIED/UNDONE）和 `compactSummary` 取代 `compactResult`/`compactDiff`
  - 新增 `compactHighlights: Map<string, CompactChangeType> | null`
  - 新增 `setCompactHighlights()` / `clearCompactHighlights()`
- **修改 `NodeCard.tsx`**：
  - 新增 `compactHighlight` prop
  - 條件式 `style.backgroundColor` 和 `borderLeft`
  - 編輯節點顯示 `← 舊名稱` 小字
  - 移動節點顯示 `↗ from: 舊位置` 小字
  - 刪除 ghost 節點特殊渲染（opacity + strikethrough）
- **修改 `TreeCanvas.tsx`**：從 `uiStore.compactHighlights` 讀取並傳給 `NodeCard`
- **修改 `useKeyboard.ts`**：增加 `u` 鍵在 APPLIED 狀態下觸發 Undo；導航鍵觸發色彩淡出
- **可刪除**：`CompactPreview.tsx` 和 `compactDiff.ts`

#### 後端改動

- **修改 `ai.rs` prompt**：增加保守策略指引
- **可選**：要求 AI 返回 summary 說明文字

  ```json
  {
    "nodes": [...],
    "summary": {
      "added": 3,
      "moved": 4,
      "deleted": 1,
      "merged": 1,
      "explanation": "合併了重複的行銷子樹，將 Q4 計畫移至頂層..."
    }
  }
  ```

---

### 演進路線

```
MVP (v1):  Auto-apply + Summary Banner + Undo + Inline Color Coding
           估計改動量 ~160L（base 120L + color coding 40L）
           重點：零決策、安全感、鍵盤一致、一眼看懂
                ↓
           收集數據：Accept（dismiss）vs Undo 比例

v2 方向 A：如果 Undo 比例 > 20%
           → 改善 AI prompt 品質，提高使用者對結果的信任度

v2 方向 B：如果使用者明確要求預覽
           → 加入 optional preview toggle（在 Settings 中開啟）
           → 沿用方案 1（Inline Annotated Tree）作為 preview 模式

v3：       根據使用數據決定是否真的需要 selective accept
           如需要，則評估方案 4（Hybrid）的實作成本
```
