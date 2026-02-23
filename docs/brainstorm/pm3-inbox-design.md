# PM-3: Inbox 暫存區設計

## 核心理念

Inbox 是 ADHD 使用者的「腦袋卸載站」——不要讓他們在輸入 idea 的瞬間被迫做決策（「這個 idea 要放到哪個 context？」）。捕捉速度 > 分類準確度。每一次的摩擦都是一個 idea 被永遠遺忘的機會。

**設計原則**：
1. **零阻力捕捉**：鍵盤一個快捷鍵就能打開，打字就能存，不需要選 context
2. **延遲決策**：先丟進來，AI 幫你建議分類，你決定要不要接受
3. **清零成就感**：inbox 清空是一個可見的小勝利，ADHD 大腦需要這種即時反饋
4. **不強制**：分類建議永遠是建議，使用者可以拒絕、修改、或繼續讓它待在 inbox

---

## 方案描述

### UI 形式：浮動側欄 Inbox Panel

**不選擇獨立 View，不選擇 Modal Overlay**，而是一個可以和現有 TreeCanvas 同時存在的**右側浮動側欄**。

原因：
- 獨立 view 需要切換，ADHD 使用者容易「進去之後忘記回來」
- Modal overlay 會打斷正在進行的思考流程
- 側欄可以在瀏覽 tree 的同時看到 inbox，形成「情境對照」

**視覺設計（文字 mockup）**：

```
┌────────────────────────────────────────────┬─────────────────────────────┐
│  [StatusBar: Context Name | ⌘K | AI | ☰]  │  📥 Inbox  (3)  [×]        │
├────────────────────────────────────────────┤                             │
│                                            │  ┌─────────────────────┐   │
│  [TreeCanvas]                              │  │ + 快速記一下...     │   │
│                                            │  └─────────────────────┘   │
│   Root                                     │                             │
│    ├── Node A                              │  ─── 待分類 (2) ────────   │
│    ├── Node B                              │                             │
│    │    └── Node C                         │  ┌─────────────────────┐   │
│    └── Node D                              │  │ T  研究 Zettelkasten │   │
│                                            │  │    → 建議：讀書筆記 │   │
│                                            │  │    [✓] [✎] [✗]      │   │
│                                            │  └─────────────────────┘   │
│                                            │                             │
│                                            │  ┌─────────────────────┐   │
│                                            │  │ T  明天要買牛奶      │   │
│                                            │  │    → 建議：生活雜事 │   │
│                                            │  │    [✓] [✎] [✗]      │   │
│                                            │  └─────────────────────┘   │
│                                            │                             │
│                                            │  ─── 已分類 (1) ────────   │
│                                            │  ┌─────────────────────┐   │
│                                            │  │ ✓  寫部落格計畫      │   │
│                                            │  │    → 已移至「寫作」 │   │
│                                            │  └─────────────────────┘   │
│                                            │                             │
│                                            │  [全部確認] [清除已分類]   │
└────────────────────────────────────────────┴─────────────────────────────┘
```

**側欄寬度**：280px（與現有 ContentPanel 的 480px 不同，更窄，不搶主視角）

**觸發方式**：
- 快捷鍵 `⌘I`（I = Inbox）—— 開/關 inbox 側欄
- StatusBar 上的 📥 圖示按鈕（有數字 badge 顯示待分類數量）
- 全局捕捉：任意時刻按 `⌘I` 即可快速輸入，不需要先開啟側欄

### 快速捕捉模式（Quick Capture）

按下 `⌘I` 後，如果側欄已開，焦點自動跳到輸入欄；如果側欄未開，先開側欄再跳焦點。

輸入欄行為：
- 單行文字輸入
- Enter 立即送出存入 inbox（不需選 context）
- Shift+Enter 換行（多行 idea）
- 送出後自動清空，焦點留在輸入欄（連續輸入友善）
- 送出後顯示短暫的「已存入」小動畫（綠色打勾閃一下）

---

## Inbox 生命週期流程

```
[使用者輸入 idea]
       │
       ▼
  inbox item 建立
  state: "pending"
  無 context 關聯
       │
       ├──→ [AI 自動分析]（背景，不阻塞輸入）
       │         │
       │         ▼
       │    生成分類建議
       │    state: "suggested"
       │    suggested_context_id: "xyz"
       │    suggested_parent_id: "abc"（可選）
       │         │
       │    ┌────┴────────┐
       │    │             │
       │   [✓ 接受]    [✎ 修改]   [✗ 拒絕]
       │    │             │          │
       │    ▼             ▼          ▼
       │  state:      開啟選擇器  state:
       │  "classified" 手動選     "rejected"
       │  移至對應 context tree  留在 inbox
       │                          （可再次觸發 AI）
       │
       └──→ [手動分類]（不等 AI，自己拖放或選 context）
                 │
                 ▼
            state: "classified"
            移至選擇的 context tree
```

**Inbox item 狀態**：

| 狀態 | 說明 | 視覺 |
|------|------|------|
| `pending` | 剛存入，AI 尚未分析 | 灰色，顯示「分析中...」spinner |
| `suggested` | AI 已建議分類 | 橘色 accent，顯示建議 context 名稱 |
| `classified` | 已分類（接受 AI 或手動） | 綠色打勾，顯示去向 |
| `rejected` | 拒絕 AI 建議，暫時不分類 | 藍色，顯示「稍後再說」 |

---

## 批次處理 UX

### 場景：使用者積累了 10 個 inbox items，坐下來整理

**批次確認模式**（按下「全部確認」按鈕）：

```
┌─────────────────────────────────────────────────┐
│  批次分類審核  (5 項待確認)              [×] 關閉 │
├─────────────────────────────────────────────────┤
│                                                  │
│  ① 研究 Zettelkasten                            │
│     → [讀書筆記 ▼]  [✓ 確認]  [✎ 改]  [✗ 略過] │
│                                                  │
│  ② 明天要買牛奶                                  │
│     → [生活雜事 ▼]  [✓ 確認]  [✎ 改]  [✗ 略過] │
│                                                  │
│  ③ 考慮換 Vim 配置                              │
│     → [工具設定 ▼]  [✓ 確認]  [✎ 改]  [✗ 略過] │
│                                                  │
│  ④ 讀完《原子習慣》的心得                        │
│     → [讀書筆記 ▼]  [✓ 確認]  [✎ 改]  [✗ 略過] │
│                                                  │
│  ⑤ 新 side project 想法：番茄鐘 app             │
│     → [Side Projects ▼]  [✓ 確認] [✎ 改] [✗ 略過] │
│                                                  │
│  進度：2/5 已確認         [確認全部剩餘]          │
└─────────────────────────────────────────────────┘
```

**鍵盤操作**：
- `j/k` 在 items 間移動
- `Enter` 接受當前建議並移至下一個
- `e` 編輯當前建議（開 context 選擇器）
- `x` 略過當前 item（不分類）
- `a` 全部接受剩餘

**視覺進度**：每確認一個 item，它消失（slide out 動畫），進度條填充。

### 快速模式（不開 modal）

在側欄中直接操作：
- 點 `✓` 接受分類建議
- 點 `✎` 開啟 context 選擇（inline dropdown，不跳出模態）
- 點 `✗` 拒絕建議，item 變為「待手動分類」
- 拖放 inbox item 到左側的 tree 節點上（最直覺）

---

## ADHD 友善設計考量

### 1. 清零成就感（Inbox Zero Gamification）

當 inbox 清空時（0 個待分類 items）：
- 側欄顯示一個短暫的慶祝動畫（confetti 撒花 or 簡單的打勾 + 「清空了！」文字）
- StatusBar 的 📥 圖示變成綠色，數字 badge 消失
- 持續清零的「連勝」計數：「連續 3 天清空 inbox ✨」（可在設定中關閉）

不要設計為「inbox 清空 → 跳出恭喜 modal」，這太打擾了。保持靜默而有滿足感的微互動。

### 2. 零阻力低摩擦輸入

- `⌘I` 全局快捷鍵：任何時刻都能捕捉，不需要先切到 app 前台（可搭配 macOS 全局熱鍵，日後考慮）
- 不強制分類：輸入後立即儲存，分類是「之後的事」
- 輸入欄字體夠大，placeholder 文字有親和力（「腦袋裡有什麼？記下來...」）

### 3. 防止 inbox 成為第二個黑洞

ADHD 的風險：inbox 積累到 50 個，然後因為「太多了不想清理」而永遠不看它。

對策：
- **Gentle Nudge**：inbox 超過 10 items 時，StatusBar badge 從橘色變紅色
- **定期提醒**：可設定通知（macOS notification）「你有 8 個 ideas 還沒整理，花 5 分鐘？」（可關閉）
- **老化提示**：7 天以上未處理的 item 會有淺淡的「老了」視覺標記
- **不強迫**：拒絕任何「你必須先清空 inbox 才能繼續使用」的設計

### 4. Undo 友善

分類後立即可以 `⌘Z` 復原（移回 inbox）。不讓使用者害怕「按錯了」。

### 5. 低認知負擔的 AI 建議

- AI 建議只顯示 context 名稱，不顯示複雜理由（除非 hover 展開）
- Hover 展開後顯示簡短的「因為你之前在這個 context 記過類似的東西」
- AI 建議的 confidence 用顏色區分：高 confidence = 深橘色，低 confidence = 灰色，讓使用者直覺判斷要不要接受

---

## 與現有功能的整合

### 與 Quick Switcher (⌘K) 的關係

- **不重疊功能**：⌘K 是「context 切換/管理器」，⌘I 是「idea 捕捉/分類器」
- **協作場景**：在批次分類 modal 中需要指定 context 時，可以直接輸入搜尋（複用 QuickSwitcher 的搜尋 UI component），但不關閉 Inbox panel
- **StatusBar 整合**：📥 Inbox 按鈕加在 ⌘K 按鈕旁邊，視覺權重次之

### 與 AI Compact 的關係

- **互補，不衝突**：Compact 是「整理已有的 tree」，Inbox 是「捕捉新 ideas」
- **AI 共用 Profile**：Inbox 的 AI 分類建議使用同一個 AI Profile 設定（在 AISettings 面板中管理）
- **潛在整合**：未來可以讓 AI 在做 Compact 時，順帶建議「你的 inbox 裡有 3 個 ideas 可能屬於這個 context，要一起整理嗎？」

### 與 treeStore / contextStore 的整合

Inbox items 本質上是**沒有 context 的 tree_nodes**，或者是一個特殊的「inbox」context。

**方案 A：Inbox 作為特殊 Context（推薦）**
- 在 DB 中建立一個 state = `'inbox'` 的特殊 context（新增 state enum 值）
- 所有 inbox items 都是這個 context 的 root node 的子節點
- 優點：複用現有 tree_node CRUD 邏輯，不需要新表
- 缺點：需要修改 `contexts.state` 的 CHECK constraint 和 list_contexts 的 filter 邏輯

**方案 B：獨立 inbox_items 表**
- 新增 `inbox_items` 表：`(id, content, ai_suggested_context_id, ai_suggested_parent_id, status, created_at)`
- 優點：資料模型清晰，不污染 contexts
- 缺點：需要新的 IPC commands，分類後需要搬到 tree_nodes

**推薦方案 A**，但要確保 inbox context 不出現在 QuickSwitcher 和一般的 context 列表中。

### 鍵盤快捷鍵整合

| 按鍵 | 新增動作 |
|------|---------|
| `⌘I` | 開/關 Inbox 側欄（或聚焦輸入欄） |
| `⌘Shift+I` | 開啟批次分類 modal |
| Inbox 內 `j/k` | 在 inbox items 間導航 |
| Inbox 內 `Enter` | 接受 AI 建議分類 |
| Inbox 內 `e` | 編輯分類選擇 |
| Inbox 內 `Delete` | 刪除 inbox item |

---

## 優點

1. **捕捉速度最大化**：`⌘I` → 打字 → `Enter`，三步驟，0 決策
2. **保留 agency**：AI 建議只是建議，使用者完全控制最終去向
3. **ADHD 友善的清零回饋**：inbox 清空有儀式感，驅動習慣養成
4. **不打斷思考流**：側欄模式可以邊看 tree 邊清 inbox，不需要切換視圖
5. **漸進式整合**：先有 inbox，再加 AI 建議，功能可以分階段實作
6. **複用既有架構**：方案 A 最大程度複用 treeStore / contextStore 和現有 IPC 邏輯

---

## 風險與挑戰

### 1. AI 分類品質決定使用體驗

如果 AI 老是建議錯，使用者會停止相信它，然後每次都要手動選。對策：
- 提供「AI 建議品質」的隱性學習：使用者接受/拒絕的歷史記錄，微調 prompt
- 初期讓 AI 只在「有 5+ 個現有 nodes 的 context」才做建議，減少亂猜

### 2. Inbox 黑洞效應（已有對策）

使用者把 inbox 當成「以後再說」的垃圾桶，ideas 永遠不被整理。對策已列在 ADHD 設計一節，核心是 gentle nudge，不是強制。

### 3. 側欄與 ContentPanel 的空間衝突

現有的 ContentPanel（Markdown 編輯面板）已經佔用右側空間（480px）。同時開啟 Inbox 側欄（280px）會讓畫面很擠。

對策：
- Inbox 側欄和 ContentPanel **互斥**：開 Inbox 時，如果 ContentPanel 也開著，先問使用者或自動收起 ContentPanel
- 或者：Inbox 以 floating overlay 的形式疊在 ContentPanel 上方（半透明背景），不佔額外空間

### 4. AI Compact 鎖定狀態與 Inbox 的互動

APPLIED 狀態下，許多操作被鎖定。Inbox 的「接受分類」動作是否應該被鎖定？

建議：Inbox 側欄操作**不受 Compact 鎖定影響**，因為它是跨 context 的操作，不在 compact 子樹的作用範圍內。

### 5. 新增 DB 表或修改 Schema 的遷移問題

現有 DB 無 migration 系統（TPM-2 已標記為已知限制）。加入 inbox 需要修改 schema，要謹慎處理既有 DB 的升級。

### 6. AI 分類的背景呼叫時機

每次新增 inbox item 就觸發 AI 呼叫？還是批次？

建議：**延遲批次**——item 加入後等 3 秒（debounce），如果沒有繼續輸入，才觸發 AI 分析，支援連續輸入而不產生大量 API 呼叫。

---

## 備註：分階段實作建議

| Phase | 功能 | 複雜度 |
|-------|------|--------|
| P1 | 基礎 Inbox 側欄 + 快速輸入 + 手動分類（拖放/選擇器） | M |
| P2 | AI 分類建議（複用 AI Profile + 新 compact_inbox IPC） | M |
| P3 | 批次處理 modal + 進度追蹤 | S |
| P4 | Inbox Zero 成就感動畫 + 定期提醒通知 | S |
| P5 | 老化標記 + 學習使用者分類習慣（prompt 優化） | L |
