# PM-6: 競品分析

> 產出日期：2026-02-23
> 分析者：PM-6（競品分析）
> 分析主題：快速捕捉 + 自動分類到 Context Tree

---

## 分析概述

**目標功能**：使用者隨手丟入一則 idea（文字、語音轉文字、剪貼簿截圖），系統自動判斷它屬於哪個 Context，並在正確的樹狀位置建立節點。

Mind Flow 的現況：
- 已有 AI Compact（對已有節點的子樹做重整）
- 已有 4 種節點類型（Text / Markdown / Image / File）
- Cmd+K 快速切換器，但使用者需手動選擇 Context
- 無「Inbox / Capture」概念

競品的解決方案落在三個維度的不同組合：
1. **捕捉速度**：系統入口是否夠低摩擦（全局快捷鍵、widget、分享擴充）
2. **分類方式**：手動標籤、規則式、AI 推理
3. **整合深度**：是否能直接放到指定位置（樹中某節點下）還是只到 Inbox 再手動整理

---

## 逐一工具分析

---

### 1. Notion — Quick Note / Inbox Database

**做法**：
- 官方 Web Clipper（瀏覽器擴充套件）將網頁存到指定 Database
- 全局快捷鍵（macOS：Cmd+Shift+N）開 Quick Note，存到「Quick Note」database 或指定 page
- 手動設定 property（Database filter/property）分類
- 最新版有 AI Autofill：可用 AI 幫 database 欄位自動填值（如 Category、Tags）

**優點**：
- 資料庫概念強大，可用 View 過濾整理 Inbox
- Web Clipper 成熟，截圖+全文+高亮一次完成
- AI Autofill 可把「分類」自動化到 property 層級

**缺點**：
- 分類是 flat database property，不是樹狀位置
- Quick Note 仍需手動整理到正確位置
- 介面重、載入慢，ADHD 使用者容易在整理途中分心

**可借鑑之處**：
- AI Autofill 的「先捕捉、後自動補欄位」兩段式設計值得參考
- Inbox-as-database 的思路：捕捉時不需分類，分類是獨立的一步

---

### 2. Obsidian — Daily Notes + Dataview + AI Plugins

**做法**：
- **Daily Notes**：每天自動建立一個 Markdown 筆記，快速記錄任何東西
- **Dataview Plugin**：用 YAML frontmatter + 查詢語法，把散落的筆記聚合成表格視圖
- **QuickAdd Plugin**：設定 capture 模板，按快捷鍵彈出小視窗輸入，自動插入到指定位置
- **Copilot / Smart Connections Plugin**：AI 語義搜尋 + 自動 backlink 建議

**優點**：
- QuickAdd 可以精確控制「捕捉後放到哪」（特定檔案的特定 heading 下）
- Daily Notes 的「全部先扔進今天」是低摩擦策略
- 完全本地，隱私友善

**缺點**：
- 需要大量插件組合，設定複雜
- AI 分類只是「建議 backlink」，不是自動放到正確位置
- 資料夾/檔案結構 vs Mind Flow 的樹狀 Context 在概念上有落差

**可借鑑之處**：
- QuickAdd 的「capture template」概念：定義好「這種 idea 預設放哪個 Context 的哪個位置」
- Daily Notes 的「零分類捕捉，事後整理」哲學

---

### 3. Logseq — Journals + Auto-Linking

**做法**：
- **Journal 頁面**：預設開啟今天的 journal，任何輸入都先進 journal
- **雙向連結**：`[[Context名稱]]` 輸入時自動建立到對應頁面的 backlink
- **Queries**：類 Dataview 的查詢可以把散落 journal 中的內容聚合
- **Block references**：可把任何 block 嵌入到任何頁面（而不是複製）

**優點**：
- 極低捕捉摩擦：打開就是今天 journal，直接輸入
- `[[]]` 語法讓使用者在輸入時就建立了語義關係
- Block-level 粒度很細，可以把一段話嵌入到多個地方

**缺點**：
- 最終資料是 flat journal + backlink，不是樹狀結構
- AI 分類能力弱，主要靠使用者自己打 `[[]]`
- 對 ADHD 使用者：journal 越積越長，整理成本高

**可借鑑之處**：
- `[[]]` 的「輸入時標記歸屬」是很輕的分類動作——輸入時打 `[[Context名稱]]` 就完成了分類
- Mind Flow 可借鑑：捕捉時讓使用者輸入 Context 關鍵字，系統 fuzzy match 到正確 Context

---

### 4. Tana — Supertags + Auto-Classification

**做法**：
- **Supertags**：`#project`、`#task` 等 tag 帶有 schema（定義欄位），輸入 `#` 就觸發
- **AI Search / Classify**：輸入後 AI 可根據內容自動建議 Supertag
- **Inbox**：未標記內容自動進 Inbox，隨時可以 tag 後移到正確位置
- **Daily note**：類似 Logseq，但 AI 可主動建議關聯

**優點**：
- Supertag 讓「分類」變成一個打字動作（`#`）
- AI 建議 tag 降低認知負擔
- Schema 讓每種類別的 idea 都有固定欄位結構

**缺點**：
- 學習曲線陡峭：需要預先設計 Supertag schema
- 對 ADHD 使用者：前期設計負擔可能導致放棄
- 不是樹狀，是圖狀，概念上與 Mind Flow 有差

**可借鑑之處**：
- **AI 建議 Context 是可行的**：使用者輸入 idea 後，AI 分析內容 → 顯示「建議放到 #ProjectX」
- 確認是一個動作（Enter/Tab），不確認就進 Inbox
- 這正是 Mind Flow「AI 自動分類」的核心流程可以參考的模型

---

### 5. Apple Notes — Quick Note from Any App

**做法**：
- **Quick Note**：任何 App 中游標移到右下角，彈出小視窗輸入（macOS/iOS 通用）
- **iCloud 同步**：跨裝置即時可用
- **Spotlight / Siri 整合**：語音輸入、截圖自動 OCR
- **Folders**：手動分類，無自動分類

**優點**：
- 系統層級的低摩擦：不需切換 App
- 拍照 + 掃描 + 手寫直接進 Notes
- Quick Note 可以「附加」到特定網頁（Safari 內的相關筆記自動顯示）

**缺點**：
- 完全沒有 AI 分類，全手動
- 層級只有 Folder，無樹狀結構
- 封閉生態

**可借鑑之處**：
- **系統層級的捕捉入口**：Tauri app 可做 macOS Menu Bar icon + 全局快捷鍵，「任何時候」能捕捉
- Apple Notes Quick Note 的右下角熱角設計——對 ADHD 使用者「不需要找 app 入口」是關鍵

---

### 6. Things 3 — Quick Entry + Inbox

**做法**：
- **Quick Entry**：全局快捷鍵（Ctrl+Space）彈出小視窗，輸入後按 Return
- **Inbox**：沒有指定 project 的任務統一進 Inbox
- **Quick Entry with Autofill**：如果聚焦在某 project，Quick Entry 預設歸屬到那個 project
- 手動整理：定期從 Inbox 拖到正確 Area/Project

**優點**：
- 極低延遲：快捷鍵 → 彈窗 → 輸入 → Return，3 秒完成捕捉
- Inbox → 整理 的兩段式工作流設計非常成熟
- Natural Language Date 解析（"tomorrow"、"next Friday"）

**缺點**：
- 沒有 AI 分類，Inbox 整理靠人工
- 只適合任務管理，不適合 idea / 知識管理
- 無法做樹狀結構

**可借鑑之處**：
- **Quick Entry 的 UX 模板**是業界最成熟的：全局快捷鍵 → 彈窗 → 輸入 → 確認，整個流程 < 3 秒
- **「Capture first, classify later」** 的工作流哲學，Mind Flow 可以先做 Inbox，再讓 AI 批量分類

---

### 7. Capacities — Object-Based Auto-Linking

**做法**：
- **Object Types**：每種內容（Person、Book、Project、Note）都有 Schema
- **捕捉**：Daily Note 或 Capture 視窗輸入，選擇 Type 後自動套用 schema
- **Smart Connections**：AI 分析內容，自動建議相關的已存在 Object（不是自動放置，是建議）
- **Web Clipper**：瀏覽器擴充套件，擷取頁面後選 Type

**優點**：
- Object 導向讓「分類」等同於「選類型」，認知負擔低
- 自動建議關聯的 Smart Connections 很實用
- 視覺設計精美，符合 ADHD 使用者的審美需求

**缺點**：
- 需要預先定義 Object Type schema
- 自動分類只是「建議關聯」，還需手動確認放置位置
- 目前為 Web App，不是本地優先

**可借鑑之處**：
- **Object Type = Context 的映射**：輸入時選一個「類型」，系統知道要放到哪個 Context
- 比 AI 純文字分析更可靠：使用者明確選類型，AI 只確認細節

---

### 8. Mem.ai — AI-Powered Auto-Organization

**做法**：
- **捕捉**：任意輸入，不需手動分類
- **Mem X（AI 層）**：自動建立相關 Mem 之間的連結，類似 AI backlink
- **Collections**：AI 自動歸類到 Collection（主題群）
- **Surface**：AI 根據時間和相關性主動「浮出」相關 Mem

**優點**：
- 真正的「零分類」體驗：輸入後 AI 完全自動處理
- 「Surface」功能讓相關內容在正確時機出現，而不是讓使用者去找
- 適合 ADHD：不需要維護分類系統

**缺點**：
- AI 分類是黑盒，使用者不清楚為什麼這個 Mem 在那個 Collection
- 完全雲端，隱私問題
- 無法控制「放到樹狀結構的哪個位置」
- 訂閱費用高

**可借鑑之處**：
- **「先捕捉，後 AI 整理」的完整 AI-first 設計**是 Mind Flow 新功能可以參考的最直接競品
- Mem 的 Surface（主動浮出相關內容）→ Mind Flow 可考慮「捕捉時顯示相關 Context 的現有節點」

---

### 9. Reflect — AI-Powered Backlinks

**做法**：
- **Daily Note**：預設入口，輸入任何東西
- **Backlinks**：AI 自動建議反向連結（不需手打 `[[]]`）
- **AI Assistant**：可以問「這個 idea 和我的哪些筆記有關」
- **Graph view**：視覺化所有筆記的關聯網路

**優點**：
- AI backlink 建議很準，幾乎不需要手動打 `[[]]`
- 捕捉摩擦極低：Daily Note 打開即用
- 設計極簡，不會讓使用者分心

**缺點**：
- 沒有「自動放到指定位置」，只有 backlink 建議
- 無樹狀結構，是扁平筆記 + 圖
- 雲端為主，無離線

**可借鑑之處**：
- **AI backlink 建議 → Mind Flow 的「建議放到哪個 Context 下的哪個節點」**
- Reflect 的 AI 在使用者輸入中自動偵測相關 entity，類似 NER（Named Entity Recognition）— Mind Flow 可做類似的：輸入 idea 時，AI 即時分析文字，高亮可能的 Context 關鍵字

---

### 10. Heptabase — Whiteboard + Card-Based Capture

**做法**：
- **Journal**：每天的 journal 做快速捕捉
- **Card**：每個想法是一張卡片，可以放到不同的 Whiteboard（Map）
- **AI Copilot**：可以問 AI「幫我把這些卡片整理到對應的 Map」
- **分類**：手動拖卡片到 Whiteboard，或 AI 建議位置

**優點**：
- 視覺化白板 + 卡片非常直觀
- AI Copilot 可以做「整批分類」操作
- 強調「學習理解」而非「收集分類」，對知識管理有深度

**缺點**：
- 白板 = 二維空間，使用者需要自己排版，有額外認知負擔
- AI 分類是輔助而非自動
- 無法一鍵「捕捉 + 立即分類」

**可借鑑之處**：
- **AI 批量整理**的模式：先捕捉一批 ideas，然後 AI 一次分類到多個位置
- 與 Mind Flow 現有的 AI Compact 邏輯有相似性，可以做「Inbox → 批量分配到各 Context」

---

### 11. XMind — Inbox / Brainstorm 模式

**做法**：
- **Brainstorm 模式**：快速輸入模式，只要打字就建立節點
- **Capture 工具列**：右側快速新增 topic
- 手動分類：之後拖到正確的 branch

**優點**：
- Brainstorm 模式接近 Mind Flow 的 Context 概念
- 視覺上最接近 Mind Flow 的水平樹

**缺點**：
- 完全沒有 AI 分類
- 捕捉入口不夠低摩擦（需在 XMind 應用內）

**可借鑑之處**：
- XMind 的「快速鍵入 = 建立節點」UX 簡潔有效
- Mind Flow 可做類似的「Brainstorm Mode」作為快速捕捉入口

---

## 最佳實踐總結

### 捕捉端（Capture UX）

| 最佳實踐 | 代表工具 |
|---------|---------|
| 全局快捷鍵 < 3 秒完成捕捉 | Things 3, Apple Notes |
| 系統層級入口（Menu Bar / 右鍵）| Apple Notes, Drafts |
| 捕捉時不強迫分類 | Logseq, Things 3, Mem.ai |
| 輸入時 AI 即時分析 + 建議 | Tana, Reflect |
| 支援多種媒介（文字/圖片/連結）| Notion, Apple Notes |

### 分類端（Classification Logic）

| 最佳實踐 | 代表工具 |
|---------|---------|
| Inbox-first：先捕捉，後分類 | Things 3, Notion |
| AI 自動建議分類（非強制） | Tana, Capacities, Reflect |
| AI 完全自動分類（黑盒）| Mem.ai |
| 批量 AI 整理 | Heptabase AI Copilot |
| 使用者確認才真正分類 | Tana, Capacities |

### 深度整合（Position Accuracy）

| 最佳實踐 | 代表工具 |
|---------|---------|
| 只到 Inbox（不到具體位置）| Things 3, Notion |
| 到具體 Page/Collection（非位置）| Mem.ai, Obsidian |
| 到具體 heading 下（QuickAdd）| Obsidian QuickAdd |
| 到具體節點下（AI 推理）| 目前無工具完整做到 |

**差距分析**：沒有任何工具能「捕捉後 AI 自動放到樹狀結構的具體節點下」——這是 Mind Flow 的差異化機會。

---

## Mind Flow 的差異化機會

### 現有優勢

1. **樹狀 Context 結構**：每個 Context 已有明確語義（一棵知識樹），比 flat database 更容易做 AI 分類判斷
2. **本地 + AI 已整合**：AI Compact 已證明 LLM 可以操作樹結構
3. **keyboard-first**：ADHD 使用者偏好的工作方式，捕捉流程可做得極快
4. **Context 隔離**：Contexts 之間語義清晰，比扁平標籤更容易訓練 AI 分類

### 差異化機會

1. **「零分類捕捉 + AI 自動定位」端到端**：其他工具最多做到 Inbox，Mind Flow 可以做到具體節點
2. **本地 + 隱私**：Mem.ai 的 AI 分類能力強但是雲端，Mind Flow 可以是本地 LLM 優先的替代品
3. **ADHD 專屬設計**：低摩擦捕捉 + 不需要手動整理 + 視覺確認是針對 ADHD 的完整解法

---

## 推薦借鑑的 3 個核心概念

### 核心概念 1：Inbox-First + AI 批量分配

**來源**：Things 3（Inbox 工作流）+ Heptabase（AI 批量整理）

**做法**：
1. 全局快捷鍵（建議 Cmd+Shift+Space）彈出「Quick Capture」小視窗
2. 使用者輸入 idea，不需選 Context，直接 Return 送出
3. Idea 進入一個橫跨所有 Context 的「Inbox」（或存到 DB 的 inbox_nodes 表）
4. 每次使用者回到 Mind Flow，banner 提示「Inbox 有 N 則待分類」
5. 一鍵觸發 AI 批量分類：AI 分析每則 Idea + 對比所有 Context 的根節點標題和子節點，建議「放到哪個 Context 的哪個節點下」
6. 使用者 j/k 瀏覽建議，Enter 確認，Esc 略過到 Inbox

**為什麼適合 Mind Flow**：
- 不打斷使用者當前工作（捕捉是系統層級的浮動視窗）
- 批量 AI 分類複用現有的 LLM 整合架構（類似 compact_node 的呼叫方式）
- Inbox 有明確處理流程，不會讓 ADHD 使用者焦慮積壓

---

### 核心概念 2：輸入時即時 AI 建議（Inline Suggestion）

**來源**：Tana（AI 建議 Supertag）+ Reflect（AI backlink）

**做法**：
1. Quick Capture 視窗中，使用者打字時，AI 即時（debounce 500ms）分析內容
2. 視窗底部顯示「建議 Context：#ProjectX → 放在節點『UI 設計』下」
3. Tab 鍵接受建議；繼續打字會刷新建議；Esc 或 Return 忽略建議直接進 Inbox
4. AI 分析基於：輸入文字的語義 + 現有 Context 的名稱和根節點 + 最近存取的 Context（加權）

**為什麼適合 Mind Flow**：
- 即時反饋降低 ADHD 使用者的「我不知道放哪」的焦慮
- 不強制：建議可以忽略，保持低摩擦
- 技術上可行：輸入 500ms 後呼叫 LLM，只傳 Context 名稱列表 + 輸入文字（prompt 很短，延遲低）

---

### 核心概念 3：Quick Capture 全局入口（Menu Bar / 熱鍵）

**來源**：Apple Notes Quick Note + Things 3 Quick Entry

**做法**：
1. macOS Menu Bar 顯示 Mind Flow 圖示，點擊展開小 popover（或全局快捷鍵 Cmd+Shift+Space）
2. Popover 是一個單行輸入框 + 下方顯示「建議 Context」
3. 即使 Mind Flow 主視窗關閉，捕捉入口依然可用（Tauri 的 System Tray 功能）
4. 多媒介：文字輸入 + 剪貼簿圖片自動偵測（沿用現有 paste 邏輯）
5. Return = 送出（進 Inbox 或確認 AI 建議的 Context）
6. 整個操作在主 App 視窗以外完成

**為什麼適合 Mind Flow**：
- ADHD 使用者的 idea 在任何時候出現，不是只在 Mind Flow 開啟時
- Tauri 2 支援 System Tray（`tauri-plugin-shell`/`tauri-plugin-notification`），技術可行
- 這是目前競品中「捕捉摩擦最低」的設計模式，也是 Mind Flow 目前最缺乏的部分

---

## 附錄：各工具「快速捕捉 + 自動分類」能力矩陣

| 工具 | 全局快捷鍵 | 系統層級入口 | AI 分類 | 到具體位置 | 本地/隱私 |
|------|-----------|------------|--------|----------|---------|
| Notion | 部分 | 無 | AI Autofill（屬性）| 到 DB，不到行 | 雲端 |
| Obsidian | QuickAdd | 無 | 插件（建議）| heading 下（QuickAdd）| 本地 |
| Logseq | 有 | 無 | 無 | Journal 中 | 本地 |
| Tana | 有 | 無 | AI 建議 Tag | 到 Node | 雲端 |
| Apple Notes | 系統層級 | 熱角 | 無 | 到 Folder | 本地(iCloud) |
| Things 3 | 有 | 無 | 無 | 到 Inbox | 本地 |
| Capacities | 有 | 無 | Smart Connections | 到 Object | 雲端 |
| Mem.ai | 有 | 無 | 完全自動 | AI 自動整理 | 雲端 |
| Reflect | 有 | 無 | Backlink 建議 | 到 Daily Note | 雲端 |
| Heptabase | 有 | 無 | AI 批量建議 | AI 建議 Map | 雲端 |
| XMind | 無（App 內）| 無 | 無 | Branch 下 | 本地 |
| **Mind Flow 目標** | **Cmd+Shift+Space** | **Menu Bar** | **AI 自動定位** | **到具體節點** | **本地** |

Mind Flow 若能實現「全局快捷鍵 + AI 自動放到具體節點 + 本地優先」，將是目前市場上唯一完整覆蓋這三個維度的工具。
