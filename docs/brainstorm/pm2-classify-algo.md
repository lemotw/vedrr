# PM-2: 自動分類演算法策略

> 產出日期：2026-02-23
> 分析者：PM-2（自動分類演算法）
> 背景：使用者隨手丟 idea，系統自動分入適合的 context tree

---

## 核心理念

自動分類的核心挑戰不在「分得夠準」，而在「使用者願意信任它」。

對 ADHD 使用者而言，任何讓人需要再確認、再修正的系統都會變成認知負擔，反而比手動更累。因此演算法設計應遵循兩個原則：

1. **高信心時完全靜默** — 分得準就直接放進去，不打擾使用者思維流
2. **低信心時輕量詢問** — 一個選擇、一秒完成，不開對話框、不強制停下來

分類的輸入不只是「這段文字」，還有「樹的現有結構」。每個 context 的 root + children 就是最好的語意指紋，比固定關鍵字更能表達當下的心智模型。

---

## 分類方法比較（3 種）

### 方法 A：純關鍵字比對（Keyword Matching）

**原理**：對每個 context 維護一組關鍵字集合（手動設定或從 title 自動提取），新 idea 做詞彙交集計分。

**優點**：
- 零延遲，完全離線
- 完全可預測（使用者可理解分類邏輯）
- 無 API 費用

**缺點**：
- 語意失真嚴重（「蘋果」可能是水果或 Apple Inc.）
- 需要使用者手動維護關鍵字集（ADHD 不友善）
- 無法理解近義詞、語境

**適合場景**：離線模式備選、或作為 LLM 前的快速預篩

---

### 方法 B：本地嵌入向量相似度（Local Embeddings）

**原理**：將每個 context 的 root title + 第一層節點 titles 組合成「context fingerprint」，與新 idea 文字一起送入嵌入模型（如 `nomic-embed-text` 透過 Ollama），計算 cosine similarity。

**優點**：
- 捕捉語意相似度（「運動」和「健身」可以匹配）
- 完全本地（如果使用 Ollama），無 API 費用、無隱私問題
- 分類速度快（嵌入模型比 LLM 輕量許多）

**缺點**：
- 需要額外安裝 Ollama 或引入本地嵌入 runtime（增加依賴複雜度）
- 嵌入向量需要快取管理（context 內容變更時需更新）
- 無法解釋「為什麼放這裡」
- 對短文字（3-5 字的 idea）效果不穩定

**適合場景**：有 Ollama 的進階使用者、或作為 LLM 方案的本地備選

---

### 方法 C：LLM 語意分類（Cloud LLM，推薦方案）

**原理**：使用使用者已設定的 AI Profile（Anthropic/OpenAI），將所有 active context 的結構摘要 + 新 idea 文字送給 LLM，由 LLM 決定最適合的 context 和放置位置。

**優點**：
- 語意理解最強（可理解隱喻、跨語言、縮寫）
- 不需要使用者維護任何設定
- 可同時輸出「放在哪個節點下」（tree 定位）
- 可輸出信心度分數和理由
- 復用已有的 AI Profile 基礎設施

**缺點**：
- 需要 API 費用（每次分類約 0.5–2K tokens，GPT-4o-mini 約 $0.0003）
- 需要網路連線
- 有延遲（0.5–2 秒）
- 需要謹慎設計 prompt 確保 JSON 回傳穩定

**適合場景**：主要方案，使用者已有 AI Profile 的情況

---

## 推薦方案詳述

**採用方法 C（LLM 分類）為主，方法 A（關鍵字）為離線 fallback。**

### 分類流程

```
使用者丟入 idea（文字 / 截圖 / URL）
        ↓
[前端] 觸發分類請求
        ↓
[後端] classify_idea(idea_text, profile_id)
        ↓
  1. 從 DB 讀取所有 ACTIVE context
  2. 對每個 context 建構摘要（root title + depth-1 children titles）
  3. 組裝 prompt（idea + 所有 context 摘要）
  4. 釋放 DB lock
  5. 呼叫 LLM API
  6. 解析回傳（target_context_id, parent_node_id, confidence, reason）
        ↓
  信心度 ≥ 0.8 → 靜默自動放入
  信心度 0.5-0.8 → 輕量確認卡（「放到 {context} → {node} 下？」）
  信心度 < 0.5 → 讓使用者從列表選擇
```

### Prompt 設計（草稿）

```
你是一個知識分類助理。使用者有以下幾個知識樹：

{for each context}
[{context.name}]
  - {child1.title}
  - {child2.title}
  - ...（最多顯示前 10 個第一層節點）

使用者輸入了一個新想法：
"{idea_text}"

請判斷：
1. 這個想法最適合放在哪個知識樹？
2. 應該放在哪個節點下面？（請提供節點 ID）
3. 你的信心度是多少？（0.0 - 1.0）
4. 用一句話解釋理由。

回傳 JSON：
{
  "target_context_id": "...",
  "parent_node_id": "...",  // null 表示直接放在 root 下
  "confidence": 0.85,
  "reason": "..."
}

如果完全不屬於任何現有知識樹，回傳：
{
  "target_context_id": null,
  "suggested_context_name": "...",
  "confidence": 0.0,
  "reason": "..."
}
```

### 新 Rust Command

```rust
// src-tauri/src/commands/ai.rs 新增

classify_idea(
    idea_text: String,
    profile_id: String,
) -> ClassifyResult

// ClassifyResult
struct ClassifyResult {
    target_context_id: Option<String>,
    parent_node_id: Option<String>,     // null = root 下直接子節點
    confidence: f32,
    reason: String,
    suggested_context_name: Option<String>, // 建議新建 context 時用
}
```

---

## Tree 定位邏輯（放在哪個節點下）

分類不只是「哪個 context」，還要決定「在 tree 的哪個位置」。

### 定位策略分層

**Level 1：直接放 root 下**
- 適用：idea 屬於 context 的頂層概念，無明確對應的現有子節點
- 預設行為（最保守，最不會錯）

**Level 2：放入語意最近的第一層節點下**
- LLM 在 prompt 中拿到所有 context 的第一層節點 + ID
- LLM 輸出 `parent_node_id` 指定掛在哪個節點下
- 例：idea「番茄工作法」→ context「生產力」→ 節點「時間管理方法」下

**Level 3：深度定位（可選，進階）**
- 對大型 tree 遞迴展開相關子樹給 LLM 看
- 成本較高（更多 tokens），暫不列入初版

### 節點摘要壓縮策略

為了控制 prompt 長度，對每個 context 只提供：
- root title（context 名稱）
- 第一層節點的 title + id（最多 15 個）
- 若第一層超過 15 個，按 `updated_at` 排序取最近的 15 個

每個 context 摘要約 100-200 tokens，10 個 context ≈ 1000-2000 tokens，加上 idea 本身和指令，整體 prompt 控制在 2500 tokens 以內。

---

## 信心度與人機協作

### 三段信心度策略

| 信心度 | 行為 | UI 表現 |
|--------|------|---------|
| ≥ 0.8（高） | 靜默自動分類 | 右下角浮現小 toast（3秒）：「已放入 {context} → {node}」，可點 Undo |
| 0.5 - 0.8（中） | 輕量確認卡 | 非阻斷式橫幅：「放到 {context} → {node}？[是] [換個地方]」 |
| < 0.5（低） | 讓使用者選 | 開啟 context 選擇器（類似 QuickSwitcher，但顯示 LLM 建議排序） |

### Undo 機制

- 自動分類的節點加入 undo stack（`classify` 類型）
- `Cmd+Z` 可立即撤回
- toast 上也有「撤回」按鈕（3秒消失前可點）

### 使用者可調整信心門檻

在 AI Settings 面板加入：
- 「自動分類門檻」滑桿（預設 0.8）
- 移到 0.5：更多自動操作，更少確認
- 移到 1.0：永遠詢問確認

---

## 邊界情況處理

### 1. 一個 idea 屬於多個 context

**情況**：「設計番茄工作法 App」同時屬於「生產力」和「App 設計」。

**處理策略**：
- LLM prompt 明確要求「選最適合的一個，不允許多選」
- 但允許 LLM 在 `reason` 說明「也可放在 X context」
- toast 顯示理由，使用者看完可手動移動

進階（未來）：支援節點跨 context 引用（即 tpm2-backend-context 提到的 `shared_nodes` 表），但不在初版範圍。

---

### 2. 不屬於任何現有 context

**情況**：使用者有「工作」「學習」「健康」三個 context，但丟入了「今晚要買什麼菜」。

**處理策略**：
- LLM 回傳 `target_context_id: null` + `suggested_context_name: "生活雜事"`
- UI 顯示：「這個想法不屬於任何現有知識樹。建議新建『{suggested_name}』？[新建] [手動選擇] [暫存]」
- 「暫存」選項：放入一個隱藏的 `__inbox__` context，之後集中整理

---

### 3. 只有一個 context

**情況**：新使用者，只有一個 context。

**處理策略**：直接放入，不需 LLM 分類（節省 API 費用），只問「放在哪個節點下」。

---

### 4. 沒有設定 AI Profile

**情況**：使用者未設定 API key。

**處理策略**：
- fallback 到關鍵字比對（方法 A）
- 關鍵字從每個 context 的 root title + 第一層節點 title 自動提取
- 結果只能輸出 context 層級（不能定位 tree 內位置）
- UI 提示「設定 AI Profile 可獲得更精準的分類和 tree 定位」

---

### 5. 分類錯誤後的修正學習

初版不做複雜的機器學習，採用「顯式回饋」方式：

- 使用者移動一個被自動分類的節點時，系統記錄「從 X 移到 Y」
- 這個移動記錄存入 `classification_feedback` 表（新表）
- 下次分類時，把近期 feedback 附加到 prompt 作為 few-shot 範例：
  「之前我把類似的想法放到 X，但使用者移到了 Y，請注意。」
- 不需要重新訓練模型，靠 prompt engineering 實現

```sql
CREATE TABLE IF NOT EXISTS classification_feedback (
    id TEXT PRIMARY KEY,
    idea_text TEXT NOT NULL,
    from_context_id TEXT,
    to_context_id TEXT NOT NULL,
    from_node_id TEXT,
    to_node_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 與現有 AI Compact 的關係

### 可復用的基礎設施

| 元件 | AI Compact | 自動分類 | 是否可共用 |
|------|-----------|---------|-----------|
| AI Profile 管理 | ✅ | ✅ | **完全共用**（相同的 profile_id） |
| Keychain API key | ✅ | ✅ | **完全共用**（`get_api_key` 邏輯） |
| LLM API 呼叫 | ✅ | ✅ | **可抽取為共用 `call_llm()` 函式** |
| DB lock 釋放模式 | ✅ | ✅ | **相同模式**（async 前釋放 Mutex） |
| JSON 解析（含 fence 剝離） | ✅ | ✅ | **可共用解析 utility** |
| undo 系統 | compact 類型 | classify 類型 | **共用 undo stack，新增 classify entry 類型** |

### 架構建議

將 LLM 呼叫抽取為共用函式：

```rust
// src-tauri/src/commands/ai.rs
async fn call_llm(
    provider: &str,
    model: &str,
    api_key: &str,
    prompt: &str,
    max_tokens: u32,
) -> Result<String, MindFlowError>
```

`compact_node` 和 `classify_idea` 都呼叫這個函式，只是 prompt 不同。

### 概念上的區別

- **AI Compact**：針對「既有樹」做重組，是 tree 維護工具
- **自動分類**：針對「新輸入」做分流，是 inbox 處理工具

兩者互補，不衝突。自動分類把 idea 放入適當的 context 和位置後，未來 AI Compact 可以進一步重組那個子樹。

---

## 優點

1. **完全復用現有 AI Profile** — 使用者不需要額外設定，有 Compact 就有分類
2. **信心度三段設計** — 符合 ADHD 特性：高信心不打擾，低信心一個問題搞定
3. **Undo 安全網** — 即使分錯了也能 Cmd+Z，降低使用者心理負擔
4. **Fallback 降級** — 沒有 AI 也能用關鍵字分（只是不精準）
5. **可學習** — 使用者修正會回饋到下次分類的 prompt，越用越準
6. **token 成本可控** — 壓縮 context 摘要到 2500 tokens 以內，成本約 $0.0003-0.001 每次
7. **tree 定位** — 不只知道放哪個 context，還知道掛在哪個節點下，降低後續整理負擔

---

## 風險與挑戰

### 技術風險

| 風險 | 嚴重度 | 應對 |
|------|--------|------|
| LLM 回傳格式不穩定 | 中 | 複用 Compact 的 markdown fence 剝離 + 嚴格 JSON parse，解析失敗降級為低信心 |
| prompt 太長（context 太多） | 中 | 限制每個 context 摘要深度，active context 超過 20 個時只取最近存取的 15 個 |
| 分類延遲（0.5-2秒）體驗不好 | 低 | 背景非阻斷呼叫，使用者可繼續操作，分類完成後 toast 通知 |
| `parent_node_id` 指向不存在的節點 | 低 | 回傳前後端雙重驗證，fallback 為 root 下 |

### 產品風險

| 風險 | 嚴重度 | 應對 |
|------|--------|------|
| 使用者不信任自動分類 | 高 | 永遠顯示 reason，提供 Undo，初期預設門檻調高（0.85）偏保守 |
| ADHD 使用者習慣「先丟」後不回來整理 | 中 | `__inbox__` context 解決，+ 定期提醒整理（未來功能） |
| 多語言 idea（英文 idea 放中文 context） | 低 | LLM 天然支援跨語言語意理解 |

### 實作風險

| 風險 | 嚴重度 | 應對 |
|------|--------|------|
| 新增 `classification_feedback` 表需要 migration | 低 | `CREATE TABLE IF NOT EXISTS` 即可（目前架構允許） |
| 前端新增 toast / 確認卡 UI 工作量 | 中 | 可先做 QuickSwitcher-style 選擇，toast 是第二步 |
| `call_llm` 抽取重構需同步更新 Compact | 低 | 謹慎重構，先抽後測 |
