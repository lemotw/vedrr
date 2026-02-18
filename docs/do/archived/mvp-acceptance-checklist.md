# Mind Flow MVP — Acceptance Checklist

## 基礎架構

| #   | 功能                            | 驗證方式                             | Pass |
| --- | ----------------------------- | -------------------------------- | ---- |
| 1   | Tauri + React + TypeScript 專案 | `pnpm tauri dev` 啟動成功            | ☐    |
| 2   | 深色 UI (#1A1A1A 背景)            | 視覺確認                             | ☐    |
| 3   | Oswald + JetBrains Mono 字體    | 視覺確認                             | ☐    |
| 4   | SQLite 持久化                    | `~/MindFlow/data/mindflow.db` 存在 | ☐    |

## Quick Switcher (⌘K)

| # | 功能 | 驗證方式 | Pass |
|---|------|----------|------|
| 5 | ⌘K 開啟 | 按 Cmd+K | ☐ |
| 6 | 搜尋過濾 | 輸入文字過濾 context 列表 | ☐ |
| 7 | Active / Archived 分組顯示 | 視覺確認兩個 section | ☐ |
| 8 | ↑↓ 鍵盤選擇 | 箭頭鍵導航 | ☐ |
| 9 | Enter 切換 context | 選中後 Enter | ☐ |
| 10 | "+ New" 建立新 context | 點按鈕或輸入名稱後 Enter | ☐ |
| 11 | Escape 關閉 | 按 Esc | ☐ |

## Tree 渲染

| # | 功能 | 驗證方式 | Pass |
|---|------|----------|------|
| 12 | Root node 用 Oswald 28px 粗體 | 視覺確認 | ☐ |
| 13 | 子節點用 card 樣式 (bg-card + icon badge) | 視覺確認 | ☐ |
| 14 | 水平 XMind-style 連線 (h-line + v-bar) | 視覺確認 | ☐ |
| 15 | 選中 node 有 orange ring | 點選後看 ring | ☐ |

## Node CRUD

| # | 功能 | 驗證方式 | Pass |
|---|------|----------|------|
| 16 | Tab 新增子節點 | 選中 node 按 Tab | ☐ |
| 17 | Shift+Tab 新增同級節點 | 選中 node 按 Shift+Tab | ☐ |
| 18 | 新增後自動進入 edit mode | 建立後游標應出現在 input | ☐ |
| 19 | Enter 進入編輯 / 提交 | 選中按 Enter 編輯，再 Enter 確認 | ☐ |
| 20 | Escape 取消編輯 | 編輯中按 Esc | ☐ |
| 21 | Double-click 進入編輯 | 雙擊 node | ☐ |
| 22 | Backspace/Delete 刪除 node | 選中非 root 按 Delete | ☐ |
| 23 | Root node 不可刪除 | 選中 root 按 Delete 應無反應 | ☐ |

## 鍵盤導航

| # | 功能 | 驗證方式 | Pass |
|---|------|----------|------|
| 24 | ↓ 下一個 node (flatten order) | 按向下鍵 | ☐ |
| 25 | ↑ 上一個 node | 按向上鍵 | ☐ |
| 26 | → 進入第一個子節點 | 按向右鍵 | ☐ |
| 27 | ← 回到父節點 | 按向左鍵 | ☐ |

## Context 管理

| # | 功能 | 驗證方式 | Pass |
|---|------|----------|------|
| 28 | 切換 context 時 tree 更新 | ⌘K 切換後 tree 變化 | ☐ |
| 29 | 首次啟動自動選第一個 active context | 重啟 app 驗證 | ☐ |
| 30 | 無 context 時自動開啟 Quick Switcher | 清 DB 後重啟驗證 | ☐ |
| 31 | 資料重啟後仍在 (SQLite 持久化) | 關掉 app 再開 | ☐ |
