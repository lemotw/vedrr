# Implementation Plan: Accessibility Context Exposure + Export as Markdown

**Date:** 2026-03-14
**Goal:**
1. 讓 ChatGPT "Work with Apps" 等 AI tool 能透過 OS Accessibility API 讀取 vedrr 當前 context 的完整內容
2. 讓使用者可以從右鍵選單和 QuickSwitcher 匯出 context 為 markdown
**Scope:** macOS (WKWebView), Windows (WebView2), Linux (WebKitGTK) — 全平台
**Approach:** 純前端，不需 Rust 改動

---

## 1. 核心概念

```
vedrr 的做法（模擬 Apple Notes）

Apple Notes                         vedrr
┌──────────────────┐                ┌──────────────────┐
│ NSTextView        │                │ WKWebView         │
│  └─ AXValue = 全文│                │  └─ <textarea>    │
│                   │                │     └─ value = 全文│
└──────────────────┘                └──────────────────┘
        ↓                                   ↓
  AXTextArea                          AXTextArea
  AXValue = "筆記內容..."             AXValue = "- Context 名\n  - 子節點..."

ChatGPT 用同樣的方式讀取：AXValue（macOS）/ TextPattern（Windows）/ getText（Linux）
```

### 原理

WebView 引擎會自動將 HTML 元素翻譯成 OS 原生 Accessibility 元素（Accessibility Bridge）：

| 你寫的 HTML | macOS (WebKit) | Windows (Chromium) | Linux (WebKitGTK) |
|-------------|----------------|--------------------|--------------------|
| `<textarea value="...">` | AXTextArea + AXValue | UIA Edit + TextPattern | AT-SPI2 Text + getText |
| `aria-label="xxx"` | AXTitle = "xxx" | UIA Name = "xxx" | Name = "xxx" |
| `aria-hidden="true"` | 從 AX tree 移除 | 從 UIA tree 移除 | 從 AT-SPI2 tree 移除 |

**ARIA 是給 WebView 引擎的指令，不是給 ChatGPT 的。ChatGPT 讀的是 WebView 翻譯後的 OS 原生 API。**

---

## 2. 共用序列化函式

### 現況

ContextMenu.tsx 裡已有 `treeToMarkdownList`，但只輸出 title，不含 node_type 和 content：

```typescript
// 現有（ContextMenu.tsx:34-38）— 只有 title
function treeToMarkdownList(data: TreeData, depth = 0): string {
  const indent = (NBSP + NBSP).repeat(depth);
  const line = `${indent}-${NBSP}${data.node.title || "(untitled)"}`;
  const childLines = data.children.map((c) => treeToMarkdownList(c, depth + 1));
  return [line, ...childLines].join("\n");
}
```

### 新的共用函式

將序列化邏輯抽到 `src/lib/treeMarkdown.ts`，所有使用場景共用：

```typescript
// src/lib/treeMarkdown.ts

import type { TreeData } from "./types";

const MAX_CHARS = 50_000; // ~12k tokens

/**
 * 將 TreeData 序列化為 markdown list。
 *
 * @param data       - 要序列化的 tree 節點
 * @param options    - 可選設定
 *   - includeContent: 是否包含 node.content（markdown raw），預設 true
 *   - includeType:    是否加 [TYPE] prefix，預設 true
 *   - maxChars:       最大字元數，預設 50,000（僅在 root 層截斷）
 */
export interface TreeMarkdownOptions {
  includeContent?: boolean;
  includeType?: boolean;
  maxChars?: number;
}

export function treeToMarkdown(
  data: TreeData,
  options: TreeMarkdownOptions = {},
  depth = 0,
): string {
  const {
    includeContent = true,
    includeType = true,
    maxChars = MAX_CHARS,
  } = options;

  const indent = "  ".repeat(depth);

  // Title line
  const typePrefix = includeType
    ? `[${data.node.node_type.toUpperCase()}] `
    : "";
  let md = `${indent}- ${typePrefix}${data.node.title || "(untitled)"}`;

  // File path for IMAGE/FILE nodes
  if (data.node.file_path && (data.node.node_type === "image" || data.node.node_type === "file")) {
    md += ` → ${data.node.file_path}`;
  }

  // Content (markdown raw)
  if (includeContent && data.node.content) {
    for (const line of data.node.content.split("\n")) {
      md += `\n${indent}  > ${line}`;
    }
  }

  // Children
  for (const child of data.children) {
    md += "\n" + treeToMarkdown(child, options, depth + 1);
  }

  // Root-level truncation
  if (depth === 0 && md.length > maxChars) {
    md = md.slice(0, maxChars) + "\n...(truncated)";
  }

  return md;
}
```

### 使用場景一覽

| 使用場景 | options | 說明 |
|---------|---------|------|
| **A11yContextProvider** | `{ includeContent: true, includeType: true }` | 給 ChatGPT 讀的完整內容 |
| **右鍵選單 → 匯出 Markdown** | `{ includeContent: true, includeType: false }` | 使用者匯出，不需 type prefix |
| **QuickSwitcher → 匯出 Markdown** | `{ includeContent: true, includeType: false }` | 同上 |
| **右鍵選單 → 複製 Markdown（現有）** | `{ includeContent: false, includeType: false }` | 取代現有 treeToMarkdownList，只複製標題結構 |

---

## 3. Accessibility Hidden Textarea

### A11yContextProvider Component

```tsx
// src/components/A11yContextProvider.tsx

import { useMemo } from "react";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import { treeToMarkdown } from "../lib/treeMarkdown";

export function A11yContextProvider() {
  const tree = useTreeStore((s) => s.tree);
  const currentContext = useContextStore((s) => s.currentContext);

  const a11yText = useMemo(() => {
    if (!tree || !currentContext) return "";
    return `Context: ${currentContext.name}\n\n${treeToMarkdown(tree)}`;
  }, [tree, currentContext]);

  if (!a11yText) return null;

  return (
    <textarea
      readOnly
      value={a11yText}
      aria-label="Context content"
      tabIndex={-1}
      style={{
        position: "absolute",
        left: "-9999px",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        opacity: 0,
        pointerEvents: "none",
      }}
    />
  );
}
```

### App.tsx 改造

```tsx
// src/App.tsx（概念 diff）

import { A11yContextProvider } from "./components/A11yContextProvider";

function App() {
  return (
    <>
      {/* Accessibility: 唯一暴露給 AX tree 的元素 */}
      <A11yContextProvider />

      {/* 所有可視 UI：從 AX tree 隱藏 */}
      <div aria-hidden="true">
        <StatusBar />
        <div className="flex flex-1 overflow-hidden">
          <TreeCanvas />
          <ContentPanel />
        </div>
        {showSwitcher && <QuickSwitcher />}
        {/* ... other components */}
      </div>
    </>
  );
}
```

---

## 4. 右鍵選單 — 匯出 Markdown

### 在 ContextMenu.tsx 的 EDIT group 加入新項目

現有的 `copyMarkdown` 只複製標題結構到剪貼簿。新增 `exportMarkdown` 匯出完整內容（含 content）到 `.md` 檔案。

```typescript
// ContextMenu.tsx — EDIT group 新增項目

// 匯出完整 Markdown（含 content）到檔案
{
  key: "exportMarkdown",
  label: t("contextMenu.exportMarkdown"),
  shortcut: "",
  icon: "⤓",
  action: () => exec(async () => {
    if (!subtree) return;
    const md = treeToMarkdown(subtree, { includeContent: true, includeType: false });
    const destination = await saveDialog({
      title: t("contextMenu.exportMarkdown"),
      defaultPath: `${subtree.node.title || "export"}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!destination) return;
    const bytes = Array.from(new TextEncoder().encode(md));
    await ipc.writeFileBytes(destination, bytes);
  }),
}
```

### 改造現有 `copyMarkdown` 使用共用函式

```typescript
// ContextMenu.tsx — 將現有 copyMarkdown 改為使用 treeToMarkdown

{
  key: "copyMarkdown",
  label: t("contextMenu.copyMarkdown"),
  shortcut: "",
  icon: "⧉",
  action: () => exec(() => {
    if (!subtree) return;
    const md = treeToMarkdown(subtree, { includeContent: false, includeType: false });
    navigator.clipboard.writeText(md);
  }),
}
```

這樣就能移除 ContextMenu.tsx 內的 `treeToMarkdownList` 和 `copyTreeToClipboard` 函式。

---

## 5. QuickSwitcher — 匯出 Markdown

### 新增 handler

```typescript
// QuickSwitcher.tsx — 新增 handleExportMarkdown

const handleExportMarkdown = async (e: React.MouseEvent, ctx: ContextSummary) => {
  e.stopPropagation();
  setMenuOpenId(null);

  // 載入目標 context 的 tree
  const treeData = await ipc.getTree(ctx.id);
  if (!treeData) return;

  const md = `# ${ctx.name}\n\n${treeToMarkdown(treeData, { includeContent: true, includeType: false })}`;

  const destination = await saveDialog({
    title: t("quickSwitcher.button.exportMarkdown"),
    defaultPath: `${ctx.name}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!destination) return;

  try {
    const bytes = Array.from(new TextEncoder().encode(md));
    await ipc.writeFileBytes(destination, bytes);
  } catch (err) {
    console.error("[export-md] Failed:", err);
  }
};
```

### 加入 getMenuActions

```typescript
// QuickSwitcher.tsx — getMenuActions() 新增項目
// 插在 exportPng 之後

{ label: t("quickSwitcher.button.exportMarkdown"), icon: <IcoMarkdown />, action: (e) => handleExportMarkdown(e, ctx) },
```

### Icon Component

```tsx
function IcoMarkdown() {
  return (
    <svg className="w-[13px] h-[13px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="14" height="10" rx="1.5" />
      <path d="M4 10V6l2 2.5L8 6v4" />
      <path d="M11 10V6l1.5 2L14 6" />
    </svg>
  );
}
```

---

## 6. File Changes 總覽

### 新增檔案

| 檔案 | 用途 |
|------|------|
| `src/lib/treeMarkdown.ts` | `treeToMarkdown()` 共用序列化函式 |
| `src/components/A11yContextProvider.tsx` | 隱藏的 textarea component |

### 修改檔案

| 檔案 | 改動 |
|------|------|
| `src/App.tsx` | 加入 `<A11yContextProvider />`，UI 容器加 `aria-hidden="true"` |
| `src/components/ContextMenu.tsx` | 移除 `treeToMarkdownList` / `copyTreeToClipboard`，改用 `treeToMarkdown`；新增 `exportMarkdown` 項目 |
| `src/components/QuickSwitcher.tsx` | 新增 `handleExportMarkdown` + `IcoMarkdown` icon + `getMenuActions` 新增項目 |

### 不需改動

| | 原因 |
|--|------|
| Rust backend | 純前端實作 |
| Cargo.toml | 不需新依賴 |
| tauri.conf.json | 不需改設定 |
| constants.ts / ipc.ts | 不需新 IPC（`getTree`、`writeFileBytes` 已存在） |

### i18n keys 新增

```json
{
  "contextMenu": {
    "exportMarkdown": "Export as Markdown"
  },
  "quickSwitcher": {
    "button": {
      "exportMarkdown": "Export Markdown"
    }
  }
}
```

---

## 7. `treeToMarkdown` 序列化規則

| 欄位 | 序列化方式 | 範例 |
|------|-----------|------|
| `node_type` | `[TYPE]` prefix（可選） | `[TEXT]`、`[MARKDOWN]`、`[IMAGE]`、`[FILE]` |
| `title` | 直接輸出 | `需求分析` |
| `content` | 每行加 `> ` prefix（可選） | `> ## 標題\n> 內文` |
| `file_path` | IMAGE/FILE 節點附加 `→ path` | `截圖 → ~/vedrr/files/...` |
| children | 縮排 2 spaces | 遞迴 |
| 截斷 | root 層檢查 maxChars（預設 50,000） | `...(truncated)` |
| 空 title | 顯示 `(untitled)` | |

### Options 組合

| options | 輸出範例 |
|---------|---------|
| `{ includeType: true, includeContent: true }` | `- [MARKDOWN] 需求分析\n  > ## 訪談摘要\n  > - 用戶 A...` |
| `{ includeType: false, includeContent: true }` | `- 需求分析\n  > ## 訪談摘要\n  > - 用戶 A...` |
| `{ includeType: false, includeContent: false }` | `- 需求分析` |

---

## 8. 跨平台行為

| 平台 | WebView | `<textarea>` 翻譯成 | AI tool 讀取方式 | 結果 |
|------|---------|---------------------|-----------------|------|
| macOS | WKWebView (WebKit) | AXTextArea | `AXValue` 屬性 | ✓ |
| Windows | WebView2 (Chromium) | UIA Edit control | `TextPattern.GetText()` | ✓ |
| Linux | WebKitGTK (WebKit) | AT-SPI2 Text element | `getText(0, -1)` | ✓ |

寫一次 HTML/ARIA，三個平台的 Accessibility Bridge 各自翻譯。

---

## 9. 效能考量

| 問題 | 解法 |
|------|------|
| 大 tree 序列化慢？ | `useMemo` 依賴 `tree` reference — 只在 tree 實際變動時重新計算 |
| 50,000 chars 的 textarea 影響渲染？ | 元素在螢幕外（`left: -9999px`），不參與 layout/paint |
| tree store 頻繁更新？ | Zustand 的 tree reference 只在 loadTree/create/update/delete/move 後改變 |

---

## 10. 驗證方式

### Accessibility 驗證

**macOS：**
```
Xcode → Open Developer Tool → Accessibility Inspector
選取 vedrr 視窗 → 檢查 AX tree
預期：只有一個 AXTextArea，AXValue = 完整 markdown
```

**Windows：**
```
Accessibility Insights for Windows 或 Inspect.exe
檢查 vedrr 視窗的 UIA tree
```

**與 ChatGPT 測試：**
1. 開啟 vedrr，載入有內容的 context
2. `Option+Space` 叫出 ChatGPT
3. 問 "What am I looking at?" — 應能描述 tree 結構

### Export 驗證

1. 右鍵節點 → Export as Markdown → 存檔 → 用文字編輯器打開確認格式
2. QuickSwitcher → context `.` 選單 → Export Markdown → 同上
3. 確認匯出的 `.md` 含完整 content（markdown raw）

---

## 11. 注意事項

| 項目 | 說明 |
|------|------|
| VoiceOver | `aria-hidden="true"` 會讓 VoiceOver 無法操作 UI。vedrr 是視覺導向 app，目前不影響。 |
| 隱私 | Context 內容被動暴露在 AX tree 中。任何有 Accessibility 權限的 app 都能讀取。與 Apple Notes 行為一致。 |
| Quick Capture 視窗 | 獨立的 Tauri window，不受主視窗 `aria-hidden` 影響。 |
| content 為 null | 只輸出 title，不輸出 blockquote。 |
| 空 context | textarea value 為空字串。 |
| 現有 copyMarkdown | 改為使用共用函式 `treeToMarkdown({ includeContent: false, includeType: false })`，行為不變。 |
