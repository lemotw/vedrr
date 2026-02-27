# vedrr 記憶生命週期 (Memory Lifecycle) — 深度分析報告

**日期**: 2026-02-25
**分析標的**: ARCHIVED 自動轉 VAULT、資料卸載至文字檔、向量語意搜尋

---

## 提案概述

```
ACTIVE（短期記憶）
  ↓ 使用者手動 archive
ARCHIVED（已處理）
  ↓ 超過 1 天自動轉換
VAULT（長期記憶）
  → tree_nodes 從 SQLite 刪除，匯出至文字檔
  → 節點向量化，存入獨立 vectors.db
  → QuickSwitcher 語意搜尋 → restore 回 ACTIVE
```

---

## Part 1: PM 分析 — 功能利弊

### 優點

| 面向 | 分析 |
|------|------|
| **ADHD 工作流** | 使用者只需做一次低成本決策（archive），系統替他完成第二步（vault）。「不用決策的遺忘」極大降低認知負擔。 |
| **DB 衛生** | tree_nodes 不會無限膨脹。一年 200 個 context × 50 nodes = 10,000 row → 卸載後主 DB 只保留 metadata（~200 bytes/context）。 |
| **心智模型** | 三層精確映射人類記憶：ACTIVE = 工作記憶、ARCHIVED = 短期記憶（已處理但尚可回想）、VAULT = 長期記憶（需要線索提取）。語意搜尋就是那個「線索」。 |
| **資料可攜性** | 卸載為 JSON/Markdown 後，知識變成可讀純文字檔。即使 vedrr 不再維護，資料依然可用。 |
| **搜尋品質躍升** | 目前 VAULT 搜尋是 context name 子字串比對。語意搜尋讓「我記得有個關於X的東西」這種模糊回憶也能定位。 |

### 缺點

| 風險              | 嚴重度     | 分析                                                                                           |
| --------------- | ------- | -------------------------------------------------------------------------------------------- |
| **資料遺失**        | **高**   | SQLite 刪除 nodes 後，唯一來源是匯出檔。檔案被意外刪除 = 永久遺失。                                                   |
| **還原延遲**        | **中**   | 從文字檔重新載入：解析 + INSERT + 重建父子關係。200+ nodes 可能需 2-5 秒。ADHD 使用者對等待敏感。                            |
| **複雜度暴增**       | **中**   | 目前 vault 只是 SQL UPDATE。新設計新增 7 個流程：排程檢查、序列化、刪除 nodes、向量生成、向量 DB 管理、語意搜尋、反向還原。                |
| **附加檔案**        | **中**   | IMAGE/FILE 的實體檔案在 `~/vedrr/files/{context_id}/`。不能隨 nodes 一起刪，否則 restore 後圖片消失。但保留又違反「卸載」語義。 |
| **Markdown 檔案** | **中**   | MARKDOWN 節點內容存在 `.md` 檔案中（非 DB）。匯出時必須讀取並嵌入，否則遺失 markdown 內容。                                 |
| **ONNX 打包**     | **低-中** | fastembed-rs 依賴 ONNX Runtime 跨平台 binary，Tauri build pipeline 複雜度增加。                          |

### 邊界情況

| 場景 | 問題 | 建議處理 |
|------|------|----------|
| Archive 後隔天搜尋 | 自動轉換 timer 剛好觸發，向量可能還沒生成 | 轉換 + embedding 必須是原子操作，完成前不改狀態 |
| IMAGE 檔案遺失 | 使用者手動刪了 `~/vedrr/files/` 下的圖片 | Restore 時標記缺失檔案，node 保留但圖片顯示 placeholder |
| 匯出檔格式升級 | 未來 DB schema 變更 | 匯出檔包含 `version` 欄位，restore 時做版本相容處理 |
| Compact 操作中轉換 | 使用者正在用 compact 功能 | 自動轉換只在 app 啟動時執行，不在使用中觸發 |
| 向量 DB 損壞 | 語意搜尋不可用 | 從匯出檔重新生成向量（向量是可重建的 cache） |

### 風險緩解

| 風險 | 緩解策略 |
|------|----------|
| 匯出檔遺失 | vault_context 時先匯出、驗證 checksum 成功後才刪 nodes。不是「先刪再存」而是「先存確認了才刪」。 |
| Restore 中途失敗 | SQLite transaction 包裹整個 import。要嘛全部成功，要嘛 rollback。 |
| 自動轉換時機 | 只在 app 啟動時批次檢查，不在使用中觸發。使用者不會看到 context 突然消失。 |

---

## Part 2: UX 分析

### 自動轉換的感知

**原則：使用者不應感到「系統偷偷動了我的東西」。**

| 設計決策                     | 理由                                                 |
| ------------------------ | -------------------------------------------------- |
| **不做即時通知**               | ADHD 使用者最不需要更多彈窗。「你的 3 個 context 已移入 vault」只會增加焦慮。 |
| **在 QuickSwitcher 靜默呈現** | 打開 ⌘K 時 archived 少了幾個，vault 多了幾個。自然發現，不被打斷。        |
| **轉換在 app 啟動時執行**        | 啟動時有心理準備面對狀態變化。不會在使用中途突然移走東西。                      |
| **StatusBar 微提示（可選）**    | 啟動後短暫顯示灰色文字「3 memories → vault」，3 秒淡出。不需操作。        |
| **Settings 可調**          | 預設 1 天，提供選項（1/3/7 天/永不）。「永不」是逃生艙。                  |

### 語意搜尋結果呈現

目前 VAULT 搜尋是 context name 子字串比對。改為：

```
VAULT 搜尋欄輸入: "量子"

── 名稱符合 ──
◆ 量子計算筆記              3d

── 相關記憶 ──
◇ 物理學期末報告            14d
  └ 匹配：「量子纏結的基本原理」
◇ 科普書摘要                21d
  └ 匹配：「量子力學入門章節」
```

| 設計細節  | 說明                                  |
| ----- | ----------------------------------- |
| 雙軌搜尋  | 名稱比對（instant）+ 語意搜尋（200ms debounce） |
| 不顯示分數 | 使用者不在乎 0.82 vs 0.71，用排序表達相關度        |
| 匹配線索  | 顯示命中的 node title，幫使用者確認「對，就是這個」     |
| 結果上限  | 語意結果最多 5 個，避免 ADHD 決策癱瘓             |


### Restore 體驗

```
使用者按 Enter restore
  → 立即關閉 QuickSwitcher
  → TreeCanvas 顯示 context name + 骨架屏（非 spinner）
  → 背景 import nodes（~1-5s）
  → Tree 逐步填入
```

| 階段 | 時間 | 顯示 |
|------|------|------|
| 關閉 QuickSwitcher | instant | - |
| 顯示 context name | instant | 根節點標題可見 |
| Import nodes | 1-5s | 骨架動畫 |
| 完成 | - | 完整 tree |

**失敗處理**：匯出檔不存在時，顯示清晰錯誤訊息「此記憶的存檔檔案已遺失」，提供「刪除」或「保留」選項。不靜默吞掉錯誤。

### ADHD 特定考量

| 設計         | 影響                                                    |
| ---------- | ----------------------------------------------------- |
| 自動 vault   | **正面** — 消除「我應該去整理 archived」的罪惡感和決策疲勞                 |
| 「遺失」焦慮     | **需注意** — 明確傳達：vault 裡的東西隨時可找回 + 搜尋很強 + timer 可調      |
| 搜尋結果過多     | **需注意** — 限制最多 5 個語意結果，避免決策癱瘓                         |
| Restore 等待 | **需注意** — context name 必須在 restore 完成前就可見，作為「我在幹嘛」的提醒 |
| **總評**     | **淨正面** — 「放進盒子、需要時語意找回」完美契合 ADHD 工作模式                |

---

## Part 3: ACTIVE/ARCHIVED 是否也需要語意搜尋？

### 支持（FOR）

| 論點 | 說明 |
|------|------|
| 跨 context 知識關聯 | 「機器學習筆記」的內容可能跟「創業想法」高度相關，語意搜尋能發現這種關聯 |
| 「我寫過這個嗎？」 | ADHD 使用者常重複記錄。語意搜尋可在新增 node 時確認是否已存在 |
| 一致性 | VAULT 有語意搜尋但 ACTIVE/ARCHIVED 沒有，使用者會困惑 |

### 反對（AGAINST）

| 論點 | 說明 |
|------|------|
| 即時 embedding 成本 | ACTIVE 節點頻繁編輯，每次 updateNodeTitle / updateNodeContent 都要 re-embed。Compact 操作會觸發大量批次 embedding。 |
| 同步複雜度 | 向量要跟 node CRUD、移動、undo 全部同步 — 這是經典的 cache invalidation 問題。VAULT 向量是 write-once-read-many，複雜度差距是數量級的。 |
| 現有機制夠用 | ACTIVE 通常 3-7 個、ARCHIVED 通常 5-15 個，人工掃描 QuickSwitcher 已經夠用。NodeSearch (⌘F) 在當前 context 內搜尋也有效。 |
| 資訊過載 | 搜尋結果同時包含 ACTIVE + ARCHIVED + VAULT，結果太多 → ADHD 決策癱瘓 |

### 建議

```
Phase 1（現在）: 只做 VAULT 語意搜尋
  → 一次性生成向量，write-once-read-many，零同步問題
  → VAULT 是最需要語意搜尋的場景（使用者已忘記具體名稱）

Phase 2（驗證需求後）: ACTIVE/ARCHIVED 的「深度搜尋」模式
  → QuickSwitcher 輸入 "?" 前綴進入深度搜尋
  → 首次使用時批量 embed ACTIVE/ARCHIVED nodes
  → 之後增量更新（lazy embedding，不是即時同步）
  → 避免即時 embedding 的效能問題
```

**理由**：VAULT 語意搜尋的 ROI 最高（需求明確、實作簡單），而 ACTIVE/ARCHIVED 的語意搜尋需求尚未驗證。先做 VAULT，用真實使用回饋決定是否擴展。

---

## Part 4: 實施建議

### 分階段推進

| Phase | 範圍 | 預估 | 說明 |
|-------|------|------|------|
| **Phase 0** | 匯出/匯入基礎 | 1-2 週 | vault 時匯出 JSON + restore 時匯入。不自動化、不做向量。 |
| **Phase 1** | 自動轉換 | 1 週 | ARCHIVED 超過 N 天自動轉 VAULT。新增 `archived_at` 欄位。 |
| **Phase 2** | 向量語意搜尋 | 2-3 週 | fastembed-rs 整合 + vectors.db + QuickSwitcher 語意搜尋 UI |

### Phase 0 詳細：匯出/匯入

**匯出檔格式（JSON）**：

```json
{
  "version": 1,
  "context_id": "abc-123",
  "exported_at": "2026-02-25T10:30:00Z",
  "nodes": [
    {
      "id": "node-1",
      "parent_id": null,
      "position": 0,
      "node_type": "text",
      "title": "Root Title",
      "content": null,
      "file_path": null,
      "markdown_content": null
    },
    {
      "id": "node-2",
      "parent_id": "node-1",
      "position": 0,
      "node_type": "markdown",
      "title": "My Notes",
      "file_path": "~/vedrr/files/abc-123/node-2.md",
      "markdown_content": "# My Notes\n\n完整的 markdown 內容..."
    }
  ],
  "checksum": "sha256:..."
}
```

**關鍵流程**：
```
vault_context:
  1. 讀取所有 tree_nodes（含 .md 檔案內容）
  2. 序列化為 JSON → ~/vedrr/vault/{context_id}.json
  3. 計算 checksum 並附加
  4. 驗證：讀回檔案 + 驗證 checksum
  5. 確認成功後，在 transaction 中刪除 tree_nodes
  6. IMAGE/FILE 的實體檔案保留原位不動

restore_from_vault:
  1. 讀取 ~/vedrr/vault/{context_id}.json
  2. 驗證 checksum
  3. 在 transaction 中批量 INSERT tree_nodes
  4. 重建 MARKDOWN 節點的 .md 檔案
  5. 驗證 IMAGE/FILE 的 file_path 是否存在（缺失則標記）
  6. 設定 context state = active
  7. 刪除匯出檔（或保留作為備份）
```

### 需要使用者決策

| # | 問題 | 建議 |
|---|------|------|
| 1 | 匯出格式 JSON vs Markdown | **JSON** — 保留完整結構和 metadata，restore 可靠 |
| 2 | IMAGE/FILE 實體檔案 vault 後怎麼處理 | **保留原位不動** — 最安全，匯出檔只記錄路徑 |
| 3 | 自動 vault 預設天數 | **1 天**，Settings 可調（1/3/7/永不） |
| 4 | ONNX 模型打包方式 | **首次使用時下載** — 避免 app 體積暴增 |
| 5 | 雙向量 vs 單向量 | Phase 2 先做 **global only**（單向量），降低複雜度 |

### 技術風險（應儘早驗證）

1. **fastembed-rs + Tauri macOS arm64**：Phase 2 開始前先做 spike 驗證能否正確 build 和推理
2. **SQLite transaction**：目前 `restore_nodes` 沒用 explicit transaction，Phase 0 必須修正
3. **匯出檔與主 DB 一致性**：`delete_context` 時需同步刪除匯出檔和向量
