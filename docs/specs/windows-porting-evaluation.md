# Windows 平台移植評估

> 2026-02-18

---

## 結論

現有 codebase **已高度跨平台**，移植量小。主要改動集中在檔案路徑處理和 UI 文字。

## 必須修改

### 1. Rust 檔案路徑分隔符（HIGH）

**`src-tauri/src/commands/file_ops.rs`** line 18, 44:
```rust
// 現在（有問題）
.join("MindFlow/files")

// 修正
.join("MindFlow").join("files")
```

`"MindFlow/files"` 在 Windows 會被當成單一目錄名。改用鏈式 `.join()` 即可跨平台。

`db.rs` 已正確使用 `.join("MindFlow").join("data")`，不需改。

### 2. 前端路徑分割（HIGH）

**`src/stores/treeStore.ts`** line 265, 286:
```ts
// 現在（只處理 /）
filePath.split("/").pop()

// 修正（同時處理 / 和 \）
filePath.split(/[\\/]/).pop()
```

Windows 路徑用 `\`，現有 `split("/")` 會拿到整個路徑。

### 3. UI 文字（MEDIUM）

**`src/components/NodeCard.tsx`** line 174:
```
"Reveal in Finder" → "Open folder" 或根據平台判斷
```

## 需要驗證

### 4. `@tauri-apps/plugin-opener`（MEDIUM）

`revealItemInDir` 在 Tauri 2 官方文件標示為跨平台支援（Windows 使用 Explorer），但需實際測試。

### 5. WebKit CSS → WebView2（LOW）

**`src/components/ThemeSwitcher.tsx`** 的 color picker 使用了 WebKit-specific pseudo-elements：
```css
::-webkit-color-swatch-wrapper
::-webkit-color-swatch
```

Windows Tauri 2 用 **Chromium WebView2**（Edge），這些 selector 在 Chromium 上同樣有效。不需改，但建議測試。

### 6. Windows `.ico` 圖示（MEDIUM）

`src-tauri/icons/` 已有 PNG 和 Square logo 系列，但可能缺少 `.ico` 格式。用 `tauri icon` CLI 從 `icon.png` 自動生成即可：
```bash
pnpm tauri icon src-tauri/icons/icon.png
```

## 不需改動（已跨平台）

| 項目 | 原因 |
|------|------|
| `dirs::home_dir()` | crate 自動處理 Windows `%USERPROFILE%` |
| `rusqlite` (bundled) | 內建 SQLite，跨平台編譯 |
| 所有 Cargo 依賴 | 皆為跨平台 crate |
| `tauri.conf.json` | 無 macOS-specific 設定 |
| 鍵盤/剪貼簿處理 | WKWebView workaround（index-based loop）在 Chromium 上也正常 |
| IME composing guard | `isComposing` 在 Windows IME 同樣觸發 |
| `vite.config.ts` | 平台無關 |

## 移植步驟

1. 修正 `file_ops.rs` 路徑（5 min）
2. 修正 `treeStore.ts` 路徑分割（5 min）
3. 更新 "Reveal in Finder" 文字（5 min）
4. 用 `tauri icon` 生成 Windows icons（5 min）
5. 在 Windows 上 `pnpm tauri dev` 測試（需要 Windows 環境）
6. 測試檔案操作、剪貼簿、主題切換
