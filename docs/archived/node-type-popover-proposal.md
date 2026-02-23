# Node Type Popover — Design Proposal

## 現狀

每個非 root 節點左側有 icon badge（20x20, bg-elevated），顯示 type letter：
- **T** Text (#4FC3F7)
- **M** Markdown (#00D4AA)
- **I** Image (#FFD54F)
- **F** File (#CE93D8)

目前無法從 UI 修改 node type。

---

## 方案 A：點擊 Badge 彈出 Popover

**觸發方式：** 點擊節點左側的 type badge (T/M/I/F)

**Popover 內容：** 垂直列表，4 個選項，每個顯示 `[Letter] Type Name`，當前類型高亮

```
┌──────────────┐
│ T  Text      │  ← 當前 (accent-primary 高亮)
│ M  Markdown  │
│ I  Image     │
│ F  File      │
└──────────────┘
```

**交互流程：**
1. 點擊 badge → popover 出現在 badge 右下方
2. 點擊選項 → 更新 node type → popover 關閉
3. 點擊外部 / Escape → popover 關閉
4. j/k 或 ↑/↓ 鍵盤導航 + Enter 確認

**優點：** 觸發位置直覺（點 badge 改 badge），最小 UI 變動
**缺點：** Badge 很小 (20x20)，觸控不友善

---

## 方案 B：右鍵 Context Menu

**觸發方式：** 右鍵點擊節點任意位置

**Menu 內容：**
```
┌───────────────────┐
│ Change Type     ▸ │ → ┌──────────────┐
│ ─────────────── │   │ T  Text      │
│ Delete          │   │ M  Markdown  │
│                 │   │ I  Image     │
└───────────────────┘   │ F  File      │
                        └──────────────┘
```

**交互流程：**
1. 右鍵節點 → context menu 出現
2. hover "Change Type" → 展開子選單
3. 點擊類型 → 更新 + 關閉

**優點：** 可擴展（未來加 Delete、Duplicate 等），桌面端慣例
**缺點：** 多一層操作，改 type 要兩次點擊

---

## 方案 C：點擊 Badge + 鍵盤快捷鍵 (`t`)

**結合方案 A + 鍵盤 shortcut：**

- **滑鼠：** 點擊 badge → popover（同方案 A）
- **鍵盤：** 選中節點後按 `t` → 同一個 popover 出現
- Popover 內支援 `1/2/3/4` 數字鍵快速切換

**Popover 內容：**
```
┌──────────────────┐
│ 1  T  Text       │  ← accent 高亮
│ 2  M  Markdown   │
│ 3  I  Image      │
│ 4  F  File       │
└──────────────────┘
```

**交互流程：**
1. 點擊 badge 或按 `t` → popover 出現
2. 按數字鍵 1-4 立即切換 / 或用 j/k + Enter
3. Escape / 點外部 → 關閉

**優點：** 滑鼠鍵盤都有快速路徑，Vim 友善，一次按鍵就能切換
**缺點：** `t` 佔用一個快捷鍵位

---

## 建議

**推薦方案 C**。理由：
1. 符合鍵盤優先 + 滑鼠可用的設計哲學
2. Badge 點擊直覺
3. `t` + 數字鍵 = 兩次按鍵完成切換，最快
4. 未來右鍵 context menu (方案 B) 可以獨立追加，不衝突
