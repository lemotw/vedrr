# Round 8 - Compact 深入：所有建議類型 + AI 角色

> Compact 是 Mind Flow 最核心的 AI 功能。這裡完整列出所有可能的建議場景，
> 以及 AI 在每個場景中怎麼運作。

---

## Compact 的三個作用域

```
  ┌─────────────────────┐
  │  1. 單一 Context 內  │  同一棵 tree 裡的節點整理
  └─────────┬───────────┘
            │
  ┌─────────▼───────────┐
  │  2. Context 之間     │  多棵 working context 的合併/去重
  └─────────┬───────────┘
            │
  ┌─────────▼───────────┐
  │  3. → Common Knowledge│  從 working context 萃取知識到 CK
  └─────────────────────┘
```

---

## 作用域 1：單一 Context 內的整理

### 建議類型 1.1：合併重複節點

**場景**：同一棵 tree 裡有兩個 node 內容高度重疊

```
  BEFORE                          AFTER
  Auth系統                        Auth系統
  ├── [T] OAuth 流程              ├── [T] OAuth 流程（已合併）
  ├── [T] OAuth 筆記  ──合併►    │
  └── [M] Token 管理              └── [M] Token 管理
```

**AI 怎麼做**：
1. 偵測：比對同一棵 tree 內所有節點的文字相似度（embedding 或關鍵字重疊）
2. 分析：判斷兩個節點是「重複」還是「互補」
3. 建議：如果重複 → 建議合併，AI 產生合併後的內容草稿
4. 預覽：卡片中顯示合併後的節點內容，用戶可以編輯再 Accept

---

### 建議類型 1.2：移除過時節點

**場景**：某個 node 的內容已經被同 tree 內更新的 node 取代

```
  CI/CD
  ├── [T] Jenkins 設定       🔴 過時（被下方取代）
  ├── [T] GitHub Actions 設定  ⚪ 保留
  └── [T] 部署筆記             ⚪ 保留
```

**AI 怎麼做**：
1. 偵測：發現兩個節點主題相同但時間戳差距大，且新節點內容涵蓋舊節點
2. 分析：比對舊 node 的每個資訊點是否都已出現在新 node 裡
3. 建議：如果 100% 涵蓋 → 建議刪除；如果部分涵蓋 → 建議合併
4. 預覽：標記哪些資訊已被涵蓋、哪些是獨有的

---

### 建議類型 1.3：重新組織子樹

**場景**：tree 太扁（所有 node 都掛在 root 下），AI 建議建立層級

```
  BEFORE                          AFTER
  大專案                          大專案
  ├── [T] 前端 API               ├── 前端
  ├── [T] 前端 UI                │   ├── [T] API
  ├── [T] 後端 API               │   └── [T] UI
  ├── [T] 後端 DB                └── 後端
  └── [T] 後端 Cache                 ├── [T] API
                                     ├── [T] DB
                                     └── [T] Cache
```

**AI 怎麼做**：
1. 偵測：root 直接子節點 > N 個（可設定閾值）
2. 分析：用 NLP 將節點按主題分群
3. 建議：建議建立中間層級節點，將相關節點歸入
4. 預覽：BEFORE/AFTER tree 對照

---

## 作用域 2：Context 之間的整理

### 建議類型 2.1：合併相似 Context

**場景**：兩棵獨立的 context tree 在談同一件事

```
  BEFORE                          AFTER
  [Context] CSS 優化              [Context] 前端樣式（合併）
  ├── [T] 效能                    ├── 效能
  └── [T] 命名規範                │   ├── [T] CSS 效能
                                  │   └── [T] 重構效能考量
  [Context] 前端重構              ├── [T] 命名規範
  ├── [T] 重構計畫                ├── [T] 重構計畫
  └── [T] 效能考量                └── [M] 架構文件
```

**AI 怎麼做**：
1. 偵測：每日 compact 時，比對所有 active context 的主題/內容相似度
2. 分析：判斷是「完全重疊」（應合併）還是「有關聯」（僅提示）
3. 建議：產生合併後的 tree 結構草稿，標記每個 node 來自哪個原 context
4. 預覽：合併後 tree + 來源標記

---

### 建議類型 2.2：拆分過大 Context

**場景**：一棵 context tree 節點太多、主題太雜

```
  BEFORE                          AFTER
  [Context] 大雜燴（30 nodes）     [Context] 前端相關（12 nodes）
  ├── 前端相關 (12 nodes)          └── ...
  ├── 後端相關 (10 nodes)
  └── DevOps 相關 (8 nodes)       [Context] 後端相關（10 nodes）
                                  └── ...

                                  [Context] DevOps（8 nodes）
                                  └── ...
```

**AI 怎麼做**：
1. 偵測：context 的 node 數超過閾值，或內容主題分散度高
2. 分析：用主題分群，識別可以拆分的子群
3. 建議：建議拆成 N 棵新 context，顯示每棵包含哪些 node
4. 預覽：每棵新 context 的 tree 結構

---

## 作用域 3：Working Context → Common Knowledge

### 建議類型 3.1：萃取通用知識

**場景**：archived/vault context 裡有不限於該專案的通用知識

```
  FROM                            TO (Common Knowledge)
  [Vault] Auth系統                [CK] OAuth 知識
  └── [M] OAuth 流程詳解 ──複製►  └── [M] OAuth 流程詳解
      (通用知識，不限專案)
```

**AI 怎麼做**：
1. 偵測：context 進入 archived/vault 時觸發掃描
2. 分析：判斷每個 node 是「專案特定」還是「通用知識」
   - 專案特定：提到具體 API endpoint、特定 codebase 路徑等
   - 通用知識：概念解釋、流程說明、best practice 等
3. 建議：將通用知識 node 複製到 Common Knowledge，建議歸入哪棵 CK tree
4. 預覽：顯示會新增/連結到 CK 的哪個位置

---

### 建議類型 3.2：更新既有 Common Knowledge

**場景**：新 context 的內容比 CK 裡的舊知識更新/更完整

```
  FROM                            TO (Common Knowledge)
  [Archived] 新 OAuth 研究        [CK] OAuth 知識
  └── [T] OAuth 2.1 新特性        └── [T] OAuth 流程
                                      ↑ 建議更新，加入 2.1 內容
```

**AI 怎麼做**：
1. 偵測：新 context 的 node 與既有 CK node 主題高度相關
2. 分析：比對內容，找出 CK 裡缺少的新資訊
3. 建議：更新 CK node 內容（顯示 diff），或在 CK tree 新增子節點
4. 預覽：CK node 的 before/after diff

---

### 建議類型 3.3：去重（Context 與 CK 重複）

**場景**：working context 裡的 node 跟 CK 已有的知識重複

```
  [Active] 前端專案
  └── [T] CSS Grid 教學     ← CK 已有相同內容

  建議：此 node 與 Common Knowledge [CSS/Grid 教學] 重複，
       是否要刪除此 node 並標記參考 CK？
```

**AI 怎麼做**：
1. 偵測：新建/編輯 node 時，背景比對 CK 內容
2. 分析：判斷是「完全重複」還是「有新增內容」
3. 建議：如果完全重複 → 建議刪除並加 CK 參考；如果有新增 → 建議更新 CK
4. 預覽：顯示重複的部分和差異

---

## AI 運作流程總覽

```
  每日開啟 App / 手動觸發 Compact
            │
            ▼
  ┌──────────────────────┐
  │  Phase 1: 掃描       │
  │  遍歷所有 active +    │
  │  新 archived/vault   │
  │  contexts            │
  └──────────┬───────────┘
             │
             ▼
  ┌──────────────────────┐
  │  Phase 2: 分析       │
  │  - 節點相似度比對     │
  │  - 主題分群          │
  │  - 時效性判斷        │
  │  - CK 交叉比對       │
  └──────────┬───────────┘
             │
             ▼
  ┌──────────────────────┐
  │  Phase 3: 產生建議    │
  │  每個建議包含：       │
  │  - 類型（合併/刪除/  │
  │    萃取/重組/拆分）   │
  │  - 影響範圍          │
  │  - 理由說明          │
  │  - BEFORE/AFTER 預覽 │
  └──────────┬───────────┘
             │
             ▼
  ┌──────────────────────┐
  │  Phase 4: Review UI  │
  │  方案 A 卡片式       │
  │  用戶逐項 Accept/Skip│
  └──────────┬───────────┘
             │
             ▼
  ┌──────────────────────┐
  │  Phase 5: 執行       │
  │  只執行用戶 Accept 的 │
  │  操作，其餘不動       │
  └──────────────────────┘
```

---

## AI 技術面摘要

| 能力 | 用途 | 方式 |
|------|------|------|
| 文字相似度 | 偵測重複/相關節點 | Embedding 向量比對 |
| 主題分群 | 拆分/重組建議 | LLM 或 clustering |
| 內容摘要 | 合併節點時產生新內容 | LLM 生成 |
| 時效判斷 | 偵測過時節點 | 時間戳 + 內容涵蓋分析 |
| 通用性判斷 | 區分專案特定 vs 通用知識 | LLM 分類 |

---

## 所有建議類型總覽

| # | 作用域 | 類型 | 操作 | 觸發時機 |
|---|--------|------|------|---------|
| 1.1 | 單一 Context | 合併重複節點 | 合併兩個 node 為一 | 每日 / 手動 |
| 1.2 | 單一 Context | 移除過時節點 | 刪除被取代的 node | 每日 / 手動 |
| 1.3 | 單一 Context | 重新組織子樹 | 建立中間層級 | 每日 / 手動 |
| 2.1 | Context 之間 | 合併相似 Context | 兩棵 tree 合一 | 每日 / 手動 |
| 2.2 | Context 之間 | 拆分過大 Context | 一棵 tree 拆多棵 | 每日 / 手動 |
| 3.1 | → CK | 萃取通用知識 | 複製 node 到 CK | archived/vault 時 |
| 3.2 | → CK | 更新既有 CK | 更新 CK node 內容 | archived/vault 時 |
| 3.3 | → CK | 去重 | 刪除重複 + 加 CK 參考 | 即時背景比對 |

---

# 確認

**以上 8 種建議類型 + AI 流程，你覺得：**
1. 有沒有缺少的場景？
2. 有沒有不需要的場景（MVP 可以先不做）？
3. AI 的參與方式 ok 嗎？

**你的回答：**

～～～～～～～