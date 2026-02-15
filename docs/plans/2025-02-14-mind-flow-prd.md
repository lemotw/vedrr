# Mind Flow — Product Requirements Document

> Version: 1.0
> Date: 2025-02-14
> Status: Draft

---

## 1. Product Overview

### 1.1 一句話定義

Mind Flow 是一個 ADHD 友善的桌面知識管理工具，讓用戶用樹狀結構自由記錄多條思緒，在分心後能零成本接回 context。

### 1.2 解決的問題

- 現有筆記工具要求用戶適應工具的流程，而非工具適應用戶
- ADHD 用戶頻繁 context switch，回來後找不到之前的思緒脈絡
- 知識散落在不同工具/檔案中，無法有效統整和複用

### 1.3 核心價值主張

用戶可以隨心所欲地分心，讓分心回來之後還可以快速接回 context。這個 app 要減少用戶 context switch 的成本。

### 1.4 目標用戶

- 主要：開發者自己（有 ADHD 傾向，頻繁多工）
- 未來：具有類似思考模式的知識工作者

### 1.5 目標平台

- MVP：桌面應用（macOS 優先）
- 未來：跨平台（Windows、iOS、iPad）

---

## 2. 系統架構

```
┌──────────────────────────────────────────────────────────────┐
│                        Mind Flow                             │
│                                                              │
│  ┌─────────────────────┐     ┌────────────────────────────┐  │
│  │  Working Contexts   │     │   Common Knowledge         │  │
│  │                     │     │                            │  │
│  │  獨立的 context     │     │  多棵 knowledge tree       │  │
│  │  trees，互不連結     │     │  之間有拓撲關係            │  │
│  │                     │     │  (graph view)              │  │
│  │  Active/Archived    │     │                            │  │
│  │  /Vault 生命週期    │     │                            │  │
│  └─────────────────────┘     └────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Storage: 混合式                                         ││
│  │  檔案（md, image, etc）→ 本地檔案系統                     ││
│  │  Metadata（tree 結構, 狀態, tag）→ 本地資料庫（SQLite）    ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 2.1 兩個世界

| 區域 | 說明 | 結構 |
|------|------|------|
| Working Contexts | 日常工作的 context trees | 獨立 trees，互不連結 |
| Common Knowledge | 持久知識庫 | 多棵 knowledge trees，之間有拓撲關係（graph） |

### 2.2 儲存方式

| 資料類型 | 儲存位置 | 原因 |
|---------|---------|------|
| 檔案型 node（md, image, 其他） | 本地檔案系統 | 用戶可直接存取和編輯 |
| Metadata（tree 結構、context 狀態、tag、時間戳） | 本地 SQLite | 查詢效能好 |

---

## 3. 核心功能

### 3.1 Focus Mode（主畫面）

全屏顯示當前 focus 的 context tree，最大化專注、最少 UI 干擾。

```
┌─────────────────────────────────────────────────┐
│ Auth系統          3 active                [⌘K]  │  <- 狀態列
├─────────────────────────────────────────────────┤
│                                                 │
│              ┌── [T] feature spec               │
│              │                                  │
│  Auth系統 ───┼── [M] API設計                     │
│              │       (api-design.md)            │
│              │                                  │
│              ├── [I] 架構圖                      │
│              │   ┌──────────┐                   │
│              │   │ (渲染圖)  │                   │
│              │   └──────────┘                   │
│              │                                  │
│              └── [F] schema.sql                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

**狀態列**（頂部一行）：
- 當前 context 名稱
- Active context 數量
- ⌘K 快捷鍵提示（可點擊，開啟 Quick Switcher）

### 3.2 Node 類型

每個 node 用 icon 區分類型，不同類型有不同互動方式：

| Icon | 類型 | 互動 |
|------|------|------|
| [T] | 純文字 | 點擊 → inline 編輯 |
| [M] | Markdown | 點擊 → 開內建編輯器，node title 與檔案 title 獨立 |
| [I] | Image | 直接渲染縮圖在 tree 上 |
| [F] | 其他檔案 | 點擊 → 系統預設程式開啟 |

### 3.3 Context 生命週期

```
  ACTIVE ───手動 Archive──► ARCHIVED ───1天後自動──► VAULT
    ▲                          ▲                      │
    │                          │                      │
    └──────────────────────────┴──── 隨時手動喚回 ─────┘
```

| 狀態 | 說明 |
|------|------|
| ACTIVE | 正在使用。超過 1h（可調）未操作顯示灰色 |
| ARCHIVED | 手動歸檔。1 天後自動進入 VAULT |
| VAULT | 封存。隱藏但可搜尋/喚回 |

- 不自動改狀態、不彈 toast 打擾
- 唯一視覺提示：超過 1h 未碰的 active context 顯示灰色

### 3.4 Quick Switcher（⌘K）

快速切換 context 的輕量入口。

```
┌───────────────────────────────────────┐
│  Search...                      ⌘K   │
├───────────────────────────────────────┤
│  ACTIVE                              │
│  ► Auth系統                    now   │
│  ● 前端重構                   15m   │
│  ● CI/CD                     2h    │  <- 灰色
├───────────────────────────────────────┤
│  ARCHIVED                            │
│  ○ 讀書筆記                    3d   │
│  ○ 週報素材                    5d   │
├───────────────────────────────────────┤
│  [+ New]        [Context Manager]    │
└───────────────────────────────────────┘
```

- 顯示 Active + Archived contexts
- 選取任何 context → Enter = 切換（archived 自動喚回為 active）
- Vault 不在這裡，需到 Context Manager
- 搜尋支援 context 名稱模糊匹配

### 3.5 Context Manager（⌘⇧K）

管理所有 context 生命週期 + Common Knowledge 的獨立面板。

```
┌──────────────────────────────────────────────────────────┐
│  Context Manager                                [Close] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Search...    Filter: [All] [#work] [#study] [#side]     │
│                                                          │
│  ┌─ ACTIVE ──────────────────────────────────────────┐   │
│  │  ► Auth系統        #work    now     5 nodes       │   │
│  │  ● 前端重構        #work    15m    3 nodes       │   │
│  │  ● CI/CD          #work    2h     8 nodes       │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ ARCHIVED ────────────────────────────────────────┐   │
│  │  ○ 讀書筆記        #study   3d     12 nodes      │   │
│  │  ○ 週報素材        #work    5d     4 nodes       │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ VAULT ───────────────────────────────────────────┐   │
│  │  ◇ Q4 規劃         #work    2w     15 nodes      │   │
│  │  ◇ 舊專案筆記                1mo    8 nodes      │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ COMMON KNOWLEDGE ────────────────────────────────┐   │
│  │                                                   │   │
│  │     [前端]──────[Auth]                            │   │
│  │       │          │                                │   │
│  │     [CSS]    [OAuth知識]──[安全性]                  │   │
│  │                                                   │   │
│  │  (Graph View - 拓撲關係)                           │   │
│  │                                                   │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ [Insights] ──────────────────────────────────────┐   │
│  │  Today: 4 switches · Longest focus: 1h30m         │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Working Contexts 區域：**
- 分 Active/Archived/Vault 三個區塊
- 每個 context 顯示：名稱、自訂 tag、最後操作時間、node 數量
- 自訂 tag filter（#work, #study 等）
- 右鍵操作：Activate / Archive / Delete / Add tag

**Common Knowledge 區域：**
- Graph View 呈現，拓撲關係視覺化（類似 Obsidian graph view）
- 多棵 knowledge tree，之間有連結關係
- 可以 focus 進入某棵 CK tree 來閱讀/編輯

**Insights 區域：**
- 當日 context switch 次數
- 最長 focus 時段
- 時間分佈統計

### 3.6 Common Knowledge

獨立於 Working Contexts 的持久知識庫。

| 屬性 | 說明 |
|------|------|
| 結構 | 多棵 knowledge tree，tree 之間有拓撲關係 |
| 呈現 | Graph View（Context Manager 內） |
| 編輯 | 可 focus 進入單棵 CK tree，用同樣的 tree 編輯器操作 |
| 來源 | 用戶手動建立，或未來由 AI Compact 從 archived/vault 萃取 |

---

## 4. 操作方式

鍵盤優先，滑鼠輔助。

### 4.1 快捷鍵

| 快捷鍵 | 功能 |
|--------|------|
| ⌘K | Quick Switcher |
| ⌘⇧K | Context Manager |
| ⌘N | 新建 context |
| Enter | 編輯選中 node / 切換 context |
| Tab | 新增子節點 |
| ⇧Tab | 新增同級節點 |
| P | Park/Archive（在 switcher 裡） |

### 4.2 滑鼠操作

- 點擊狀態列 → 開啟 Quick Switcher
- 在 tree 上拖拉 node → 重新排列/調整層級
- 右鍵 node → 類型轉換、刪除、複製等操作
- 右鍵 context（在 Manager 裡）→ Activate / Archive / Delete / Add tag

---

## 5. 延後功能（已設計，不在 MVP 範圍）

以下功能已完成 brainstorm 設計和技術評估，記錄在 brainstorm 檔案中，待核心功能穩定後再開發。

### 5.1 AI Summary

- 手動觸發，彈出 context 摘要供閱讀
- 不修改原始 context 內容
- 設計文件：`brainstorm-r5.md` Q11

### 5.2 AI Compact

- 分析 context 是否可合併/精簡，提示用戶確認
- 每日自動 + 手動觸發（可關閉自動）
- PR review 風格確認 UI
- 作用域：Working Contexts 之間 / → Common Knowledge
- 設計文件：`brainstorm-r8-compact.md`、`brainstorm-r9-compact-references.md`、`brainstorm-r10-compact-api.md`

**MVP 建議範圍（經 reference 評估）：**

| 建議類型 | MVP | 準確度預估 |
|---------|-----|-----------|
| 合併重複節點 | YES | 80-90% |
| 萃取通用知識到 CK | YES | 75-85% |
| 去重（與 CK 比對） | YES | 70-80% |
| 更新既有 CK | MAYBE | 65-75% |
| 移除過時節點 | NO | 60-70% |
| 重新組織子樹 | NO | 50-65% |
| 合併相似 Context | NO | 50-60% |
| 拆分過大 Context | NO | 50-60% |

---

## 6. 設計原則

1. **工具適應人，不是人適應工具** — 不強迫用戶學習特定的筆記方法論
2. **Focus first** — 主畫面最大化專注，所有管理功能收在 Quick Switcher 和 Context Manager
3. **鍵盤優先** — 打字是最快的輸入方式，快捷鍵覆蓋所有常用操作
4. **不主動打擾** — 不彈 toast、不自動改狀態，灰色提示是唯一的被動視覺暗示
5. **用戶掌控資料** — 檔案型資料存在本地檔案系統，用戶隨時可以直接存取

---

## 7. Brainstorm 記錄索引

| 檔案 | 內容 |
|------|------|
| `brainstorm.md` | Round 1-2：基礎需求 Q1-Q10 |
| `brainstorm-r4.md` | Round 3-4：Context 管理方案、Node 類型 |
| `brainstorm-r5.md` | Round 5：Summary/Compact 機制、CK、儲存、AI 範圍 |
| `brainstorm-r6.md` | Round 6：CK 結構、UI 呈現、Compact 確認 UI |
| `brainstorm-r7-design.md` | Round 7：完整設計總覽（已確認） |
| `brainstorm-r8-compact.md` | Round 8：Compact 8 種建議類型 + AI 流程 |
| `brainstorm-r9-compact-references.md` | Round 9：AI 能力評估 + 學術 Reference |
| `brainstorm-r10-compact-api.md` | Round 10：Compact API 實作細節 |

---

## 8. Open Questions

- [ ] 技術選型：桌面框架（Electron vs Tauri vs 其他）
- [ ] 技術選型：前端框架（React vs Vue vs Svelte）
- [ ] Common Knowledge graph view 的具體互動設計
- [ ] Insights 面板的詳細統計指標
- [ ] 檔案系統的目錄結構規範
- [ ] SQLite schema 設計
