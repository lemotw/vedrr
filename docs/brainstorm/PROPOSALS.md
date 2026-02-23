# Idea Auto-Sort：5 個方案

> 彙整自 6 PM + 2 Eng 的分析報告
> 2026-02-23

## 背景

**核心需求**：使用者隨手丟 idea，系統自動分入適合的 context tree 上。

**競品差距**（PM-6 發現）：目前市場上**沒有任何工具**能做到「捕捉 → AI 自動放到樹狀結構的具體節點下」。Mind Flow 若實現，將是唯一。

**技術結論**（Eng-1 + Eng-2）：整體可行，後端 3-4 天 + 前端 4-5 天，核心改動是新增 `inbox_items` 表 + 6 個 Rust commands + `QuickCapture.tsx` 元件。

---

## 方案一：Quick Inbox（MVP 最速版）

> 對標：Things 3 Quick Entry
> 工期：~3-4 天
> 一句話：全域快捷鍵 → 打字 → Enter → 進 Inbox，手動整理。

### 做什麼

| 項目 | 說明 |
|------|------|
| 全域快捷鍵 | `Cmd+Shift+Space` 呼叫 Quick Capture 浮動輸入框 |
| 輸入 | 單行/多行文字，Enter 送出，視窗不關可連續丟 |
| 儲存 | 所有 idea 進入「Inbox」特殊 context（系統保留，不可刪除） |
| 整理 | 手動：切到 Inbox context → 拖放/Alt+方向鍵移動到目標 context |
| AI | 無。可搭配現有 AI Compact 整理 Inbox 內部結構 |

### 不做什麼

- 不做 AI 自動分類
- 不做 Inbox 側欄（用現有 TreeCanvas 看 Inbox）
- 不做跨 context 移動節點（先刪後建）

### 技術改動

- 後端：`tauri-plugin-global-shortcut`、Inbox context 自動初始化
- 前端：`QuickCapture.tsx`、uiStore 擴展
- DB：無新表（Inbox = 普通 context，tag 標記 `__inbox__`）

### 適合誰

想要最快有「隨手丟 idea」能力的使用者。不在乎自動分類，習慣自己整理。

---

## 方案二：Smart Inbox（Inbox + AI 批次分類）

> 對標：Things 3 + Heptabase AI Copilot
> 工期：~7-9 天
> 一句話：先丟 Inbox，之後一鍵 AI 批次分類，逐一確認。

### 做什麼

| 項目 | 說明 |
|------|------|
| 全域快捷鍵 | 同方案一 |
| Inbox | 獨立 `inbox_items` DB 表，有狀態機（pending → classified → applied） |
| AI 批次分類 | 按「整理 Inbox」按鈕 → AI 分析所有待分類 ideas → 建議 context + 父節點 |
| 批次確認 UX | j/k 瀏覽建議 → Enter 接受 / e 修改 / x 略過 / a 全部接受 |
| 信心度 | 高信心直接套用、低信心需確認（三段式：≥0.8 / 0.5-0.8 / <0.5） |
| Undo | Cmd+Z 撤回分類，安全網 |

### 不做什麼

- 不做輸入時即時 AI 建議（分類是事後批次操作）
- 不做 Inbox 側欄（獨立頁面/modal 處理）
- 不做跨 context 引用

### 技術改動

- 後端：新增 `inbox_items` 表 + 6 個 commands（capture/list/classify/apply/dismiss/batch_classify）
- 前端：`QuickCapture.tsx` + `InboxPanel.tsx`（批次確認 modal）+ `inboxStore.ts`
- AI：復用現有 `call_llm()`，新增分類 prompt，context summaries 只取一層

### 適合誰

喜歡「先丟後整理」工作流的 ADHD 使用者。不介意每隔一段時間花 5 分鐘清 Inbox。

---

## 方案三：Instant Sort（即時 AI 直接歸位）

> 對標：Tana + Reflect + Mem.ai
> 工期：~7-9 天
> 一句話：打字時 AI 即時建議 context，Enter 直接放到樹的正確位置，不經過 Inbox。

### 做什麼

| 項目 | 說明 |
|------|------|
| 全域快捷鍵 | 同方案一 |
| 即時 AI 建議 | 輸入 500ms 後 debounce 觸發 LLM，底部顯示「建議：{context} → {節點}」 |
| 一鍵確認 | Tab 接受建議 → 直接插入目標 tree；Enter 忽略建議 → 進 Inbox fallback |
| Tree 定位 | LLM 同時輸出 context_id + parent_node_id，語意親和分數決定位置 |
| 視覺回饋 | 紫色高亮新節點 5 秒 + scrollIntoView + Toast 說明「放在 X 下」 |
| 信心度 | ≥0.8 自動放入（Toast 通知）、0.5-0.8 底部建議（Tab 確認）、<0.5 不建議 |

### 不做什麼

- 不做 Inbox（idea 要嘛直接歸位，要嘛使用者手動選 context）
- 不做批次處理
- 不做跨 context 引用

### 技術改動

- 後端：`classify_idea` async command + context summaries helper
- 前端：`QuickCapture.tsx` 含即時建議區 + 節點插入動畫
- 無需 `inbox_items` 表（所有 idea 直接進 tree_nodes）

### 適合誰

信任 AI、想要最「零阻力」體驗的使用者。不想管 Inbox，希望 idea 丟了就自動到位。

### 風險

- AI 分錯的修正成本較高（需要在 tree 中找到並手動移動）
- 離線/無 AI Profile 時退化為手動選 context（無 Inbox 緩衝）

---

## 方案四：Smart Capture（推薦方案，Inbox + 即時建議）

> 對標：Things 3 + Tana + Heptabase 的混合體
> 工期：~10-12 天（分 4 phase 可漸進交付）
> 一句話：全域快捷鍵捕捉，AI 即時建議但不強制，有 Inbox 緩衝，有批次整理。

### 做什麼

| 項目 | 說明 |
|------|------|
| 全域快捷鍵 | `Cmd+Shift+Space`，app 背景也能呼叫 |
| Quick Capture | 浮動輸入框（480x200），輸入時 AI 即時建議 context + 位置 |
| 雙路徑 | Tab 接受 AI 建議 → 直接歸位；Enter 不理建議 → 進 Inbox |
| Inbox 側欄 | `Cmd+I` 開/關右側 280px 側欄，可邊看 tree 邊清 Inbox |
| AI 批次分類 | Inbox 內一鍵觸發 AI 分析 + 批次確認（j/k/Enter/a） |
| 信心度三段 | ≥0.8 靜默自動 / 0.5-0.8 輕量確認 / <0.5 使用者手選 |
| Tree 定位 | LLM 輸出 parent_node_id，紫色高亮 + scrollIntoView |
| Undo | Cmd+Z 撤回任何分類操作 |
| Inbox Zero | 清空有慶祝微動畫，StatusBar badge 顯示待處理數 |
| Fallback | 無 AI Profile → 降級為關鍵字比對（只選 context，不定位節點） |

### 不做什麼

- 不做跨 context 引用（Phase 2 再考慮）
- 不做自動建立新 context（先進 Inbox）
- 不做 Tag 系統
- 不做隱私標記

### 漸進交付

| Phase | 內容 | 工期 |
|-------|------|------|
| P1 | Quick Capture + Inbox context（手動分類） | 3-4 天 |
| P2 | AI 單次分類 + 信心度 + Undo | 3-4 天 |
| P3 | Inbox 側欄 + 批次確認 UX | 2-3 天 |
| P4 | Inbox Zero 動畫 + Gentle Nudge | 1 天 |

### 技術改動

- 後端：`inbox_items` 表 + 6 commands + `tauri-plugin-global-shortcut` + `call_llm` pub 化
- 前端：`QuickCapture.tsx` + `InboxPanel.tsx` + `inboxStore.ts` + uiStore/treeStore 擴展
- AI：分類 prompt（context summaries + idea → JSON response）

### 為什麼推薦

1. **兩條路都通**：想快就 Tab 直接歸位，想安全就 Enter 進 Inbox — 不逼使用者二選一
2. **漸進交付**：P1 就能用（3 天），後續逐步加 AI 能力
3. **ADHD 最友善**：零阻力捕捉 + 不強迫分類 + Inbox 緩衝 + AI 幫你整理 + 清零成就感
4. **技術風險低**：完全復用現有 AI Profile/call_llm/Keychain 基礎設施
5. **市場唯一**：全域快捷鍵 + AI 定位到具體節點 + 本地優先 = 無競品

---

## 方案五：Knowledge Hub（完整願景版）

> 對標：Mem.ai（AI-first）+ Obsidian（本地）+ Tana（結構化）
> 工期：~20-25 天
> 一句話：方案四 + 跨 context 引用 + 自動建新 context + 隱私標記 + Tag + 聚合。

### 在方案四之上新增

| 項目 | 說明 |
|------|------|
| 跨 Context 引用 | 一個 idea 同時關聯多個 context（主歸屬 + 鏡像引用節點） |
| 自動建 Context | AI 判斷不屬於任何現有 context → 建議新 context 名稱 + 初始結構 |
| 隱私標記 | 節點/context 層級的 `is_private`，AI 分析時自動排除 |
| Tag 系統 | 跨 context 的標籤視角（#待辦、#靈感、#參考資料） |
| Idea 聚合 | Inbox 累積 20+ 時，AI 聚類分析 → 建議批量建立新 contexts |
| 分類學習 | `classification_feedback` 表記錄使用者修正，下次 few-shot 修正 prompt |
| 本地 LLM | Ollama 整合，完全離線 AI 分類（長期） |

### 額外技術改動

- DB：`node_references` 表（引用）+ `classification_feedback` 表 + node 層級 `is_private` 欄位
- 後端：跨 context 移動/引用 commands + 聚合分析 command
- 前端：引用節點 UI + Tag 篩選視圖 + 隱私鎖頭圖示 + 聚合預覽

### 適合誰

長期願景。需要完整知識圖譜、跨主題連結、嚴格隱私控制的重度使用者。

### 風險

- 認知負擔增加（功能多 = 學習曲線陡）
- 需要 migration 系統（ALTER TABLE）
- 開發時間長，需拆 sprint

---

## 方案比較表

| 維度 | 一：Quick Inbox | 二：Smart Inbox | 三：Instant Sort | **四：Smart Capture** | 五：Knowledge Hub |
|------|:-:|:-:|:-:|:-:|:-:|
| 全域快捷鍵 | V | V | V | **V** | V |
| Inbox 緩衝 | V | V | - | **V** | V |
| AI 分類 | - | 批次 | 即時 | **即時+批次** | 即時+批次+學習 |
| Tree 精準定位 | - | V | V | **V** | V |
| 批次確認 UX | - | V | - | **V** | V |
| 跨 Context | - | - | - | - | V |
| 隱私標記 | - | - | - | - | V |
| Tag | - | - | - | - | V |
| 工期 | 3-4 天 | 7-9 天 | 7-9 天 | **10-12 天** | 20-25 天 |
| 無 AI 可用 | V | V（手動） | 退化嚴重 | **V（Inbox 兜底）** | V |
| ADHD 友善度 | B | A | A- | **S** | A |

---

## 我的推薦

**方案四：Smart Capture**。

理由：
- P1（3 天）就有可用版本，後續漸進加 AI
- 「即時建議 + Inbox 兜底」的雙路徑設計是所有方案中對 ADHD 最友善的
- 技術風險最平衡（不激進也不保守）
- 從方案四往方案五演進是自然的（加引用/Tag/隱私都是增量）
