# Mind Flow i18n Plan

## 難度評估

### 整體難度：中等偏低

| 面向 | 評估 | 說明 |
|------|------|------|
| 前端架構 | **低** | React 元件化良好，文案集中在 TSX，替換為 `t()` 呼叫即可 |
| 後端 Rust | **低** | 只有 AI prompt + 少量 error message 有中文，可暫時不動（prompt 本身就該是中文） |
| 文案數量 | **~120 條** | 不多，一個人半天可完成 key 建檔 |
| 混合語言 | **需注意** | 現在中英混用（UI 英文、CompactBanner/NodeSearch 中文），需統一 |
| 動態字串 | **需注意** | CompactBanner 有 `${count} 新增` 這類插值，需要 ICU MessageFormat |
| 技術選型 | **簡單** | 推薦 `react-i18next` + `i18next`，Zustand 整合無阻礙 |

### 不需要 i18n 的部分

- Rust SYSTEM_PROMPT / user_prompt（LLM 提示語，語言固定）
- Rust internal error messages（給開發者看的，不是使用者）
- Provider 名稱（Anthropic / OpenAI / Gemini — 品牌名不翻譯）
- Keyboard shortcuts（Enter / Esc / Tab）

---

## Key 命名規範

### 格式

```
{scope}.{element}.{variant}
```

| 層級 | 說明 | 範例 |
|------|------|------|
| `scope` | 功能區域，對應元件或功能模組 | `quickSwitcher`, `contextMenu`, `aiSettings` |
| `element` | 具體 UI 元素 | `title`, `placeholder`, `button`, `label`, `empty`, `error`, `confirm` |
| `variant` | 可選，區分同類元素 | `archive`, `delete`, `save`, `cancel` |

### 規則

1. **一律小駝峰** — `quickSwitcher.button.archive`，不用 snake_case
2. **scope 對應檔案** — 跟元件檔名一致，方便搜尋
3. **共用文案放 `common`** — 如 Cancel / Save / Delete / Untitled
4. **動態值用 `{{var}}`** — 如 `"已重組 {{count}} 個節點"`
5. **不翻譯品牌名** — Anthropic / OpenAI / Gemini 保持原文
6. **保留原始語境** — key 名反映用途，不反映文案內容

---

## 全文案清單

### common（共用）

| Key | zh-TW | en |
|-----|-------|----|
| `common.untitled` | 未命名 | Untitled |
| `common.button.save` | 儲存 | Save |
| `common.button.cancel` | 取消 | Cancel |
| `common.button.create` | 建立 | Create |
| `common.button.delete` | 刪除 | Delete |
| `common.button.close` | 關閉 | Close |
| `common.button.reset` | 重設 | Reset |
| `common.loading` | 載入中... | Loading... |

### statusBar

| Key | zh-TW | en |
|-----|-------|----|
| `statusBar.noContext` | 無 Context | No Context |
| `statusBar.tooltip.aiSettings` | AI 設定 | AI Settings |
| `statusBar.tooltip.theme` | 主題 | Theme |

### quickSwitcher

| Key | zh-TW | en |
|-----|-------|----|
| `quickSwitcher.ariaLabel` | 快速切換 | Quick Switcher |
| `quickSwitcher.placeholder` | 搜尋... | Search... |
| `quickSwitcher.section.active` | ACTIVE | ACTIVE |
| `quickSwitcher.section.archived` | ARCHIVED | ARCHIVED |
| `quickSwitcher.button.new` | + New | + New |
| `quickSwitcher.button.archive` | Archive | Archive |
| `quickSwitcher.button.delete` | Delete | Delete |
| `quickSwitcher.button.restore` | Restore | Restore |
| `quickSwitcher.empty` | 還沒有 Context | No contexts yet |
| `quickSwitcher.noMatch` | 找不到 | No matches |
| `quickSwitcher.defaultName` | 新 Context | New Context |
| `quickSwitcher.confirm.deleteTitle` | 刪除確認 | Delete Confirmation |
| `quickSwitcher.confirm.deleteMessage` | 確定要永久刪除「{{name}}」？此操作無法復原。 | Permanently delete "{{name}}"? This cannot be undone. |
| `quickSwitcher.stats` | {{count}}n · {{time}} | {{count}}n · {{time}} |

### nodeSearch

| Key | zh-TW | en |
|-----|-------|----|
| `nodeSearch.placeholder` | 搜尋節點... | Search nodes... |
| `nodeSearch.empty` | 找不到符合的節點 | No matching nodes |

### contextMenu

| Key | zh-TW | en |
|-----|-------|----|
| `contextMenu.edit` | 編輯 | Edit |
| `contextMenu.changeType` | 變更類型 | Change Type |
| `contextMenu.expand` | 展開 | Expand |
| `contextMenu.collapse` | 收合 | Collapse |
| `contextMenu.copyMarkdown` | 複製為 Markdown | Copy as Markdown |
| `contextMenu.addChild` | 新增子節點 | Add Child |
| `contextMenu.addSibling` | 新增同層節點 | Add Sibling |
| `contextMenu.copy` | 複製 | Copy |
| `contextMenu.cut` | 剪下 | Cut |
| `contextMenu.paste` | 貼上 | Paste |
| `contextMenu.moveUp` | 上移 | Move Up |
| `contextMenu.moveDown` | 下移 | Move Down |
| `contextMenu.aiCompact` | AI 重組 | AI Compact |
| `contextMenu.delete` | 刪除 | Delete |

### nodeCard

| Key | zh-TW | en |
|-----|-------|----|
| `nodeCard.tooltip.changeType` | 變更類型 (T) | Change type (T) |
| `nodeCard.tooltip.revealFile` | 在 Finder 中顯示 (O) | Reveal in Finder (O) |
| `nodeCard.tooltip.attachFile` | 附加檔案 (O) | Attach file (O) |
| `nodeCard.tooltip.chooseImage` | 選擇圖片 | Choose image |

### treeCanvas

| Key | zh-TW | en |
|-----|-------|----|
| `treeCanvas.tooltip.addChild` | 新增子節點 (Tab) | Add child (Tab) |
| `treeCanvas.tooltip.addSibling` | 新增同層節點 (Shift+Tab) | Add sibling (Shift+Tab) |
| `treeCanvas.tooltip.expand` | 展開 (z) | Expand (z) |

### markdownEditor

| Key | zh-TW | en |
|-----|-------|----|
| `markdownEditor.placeholder` | 開始寫作... | Start writing... |

### contentPanel

| Key | zh-TW | en |
|-----|-------|----|
| `contentPanel.placeholder` | 未命名 | Untitled |

### compactBanner

| Key | zh-TW | en |
|-----|-------|----|
| `compactBanner.summary` | AI 重組了 {{total}} 個節點 — {{details}} | AI reorganized {{total}} nodes — {{details}} |
| `compactBanner.change.added` | 新增 | Added |
| `compactBanner.change.edited` | 編輯 | Edited |
| `compactBanner.change.moved` | 移動 | Moved |
| `compactBanner.change.editedMoved` | 編輯+移動 | Edited+Moved |
| `compactBanner.change.deleted` | 刪除 | Deleted |
| `compactBanner.count` | {{count}} {{type}} | {{count}} {{type}} |
| `compactBanner.button.undo` | 復原 | Undo |
| `compactBanner.button.expand` | 展開詳情 | Show details |
| `compactBanner.button.collapse` | 收合 | Hide details |
| `compactBanner.button.accept` | 確認 | Accept |
| `compactBanner.detail.renamed` | 「{{old}}」→「{{new}}」 | "{{old}}" → "{{new}}" |
| `compactBanner.detail.movedFrom` | (從「{{parent}}」移出) | (moved from "{{parent}}") |

### compactError

| Key | zh-TW | en |
|-----|-------|----|
| `compactError.title` | AI Compact 錯誤 | AI Compact Error |

### aiSettings

| Key | zh-TW | en |
|-----|-------|----|
| `aiSettings.title` | AI 設定 | AI Settings |
| `aiSettings.section.apiKeys` | API Keys | API Keys |
| `aiSettings.section.profiles` | Profiles | Profiles |
| `aiSettings.section.systemPrompt` | System Prompt (Dev) | System Prompt (Dev) |
| `aiSettings.footer` | 先新增 API Key，再建立 Profile 搭配 AI Compact 使用。 | Add API keys, then create profiles to use with AI Compact. |
| `aiSettings.keys.empty` | 尚無 API Key。 | No API keys yet. |
| `aiSettings.keys.placeholder.name` | Key 名稱 (例: Work Anthropic) | Key name (e.g. Work Anthropic) |
| `aiSettings.keys.placeholder.secret` | 貼上 API key | Paste API key |
| `aiSettings.keys.button.add` | + Add Key | + Add Key |
| `aiSettings.keys.tooltip.delete` | 刪除 Key | Delete key |
| `aiSettings.profiles.empty` | 尚無 Profile。 | No profiles yet. |
| `aiSettings.profiles.placeholder.name` | Profile 名稱 | Profile name |
| `aiSettings.profiles.select.key` | 選擇 API Key... | Select API Key... |
| `aiSettings.profiles.select.model.placeholder` | 先選擇 Key | Select a key first |
| `aiSettings.profiles.select.model.loading` | 載入模型中... | Loading models... |
| `aiSettings.profiles.select.model.empty` | 找不到模型 | No models found |
| `aiSettings.profiles.noKey` | 無 Key | No key |
| `aiSettings.profiles.active` | ACTIVE | ACTIVE |
| `aiSettings.profiles.button.add` | + Add Profile | + Add Profile |
| `aiSettings.profiles.tooltip.delete` | 刪除 Profile | Delete profile |
| `aiSettings.profiles.error.loadModels` | 載入模型失敗，請確認 API key 是否正確。 | Failed to load models. Check your API key. |
| `aiSettings.profiles.error.create` | 建立 Profile 失敗，請重試。 | Failed to create profile. Please try again. |
| `aiSettings.systemPrompt.placeholder` | 載入中... | Loading... |

### Rust 後端（使用者可見的錯誤訊息）

| Key | zh-TW | en |
|-----|-------|----|
| `error.apiKeyNotFound` | 找不到 API Key | API key not found |
| `error.profileNotFound` | 找不到 AI Profile，請在 AI 設定中建立。 | AI profile not found. Create one in AI Settings. |
| `error.noApiKeyBound` | 此 Profile 未綁定 API Key，請在 AI 設定中編輯。 | No API key bound to this profile. Edit the profile in AI Settings. |
| `error.subtreeDepthLimit` | 子樹深度超過上限 ({{limit}})，請選擇較小的子樹。 | Subtree depth exceeds limit ({{limit}}). Choose a smaller subtree. |
| `error.subtreeNodeLimit` | 子樹包含 {{count}} 個節點，超過上限 {{limit}}。請選擇較小的子樹重組。 | Subtree has {{count}} nodes, exceeding limit {{limit}}. Choose a smaller subtree. |
| `error.cannotPasteUnderSelf` | 無法貼到自身或其子節點下 | Cannot paste a node under itself or its descendants |

---

## 建議的技術方案

```
pnpm add i18next react-i18next
```

```
src/
├── i18n/
│   ├── index.ts          # i18next 初始化
│   ├── zh-TW.json        # 繁體中文（預設）
│   └── en.json           # 英文
```

### 初始化範例

```ts
// src/i18n/index.ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhTW from "./zh-TW.json";
import en from "./en.json";

i18n.use(initReactI18next).init({
  resources: { "zh-TW": { translation: zhTW }, en: { translation: en } },
  lng: "zh-TW",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
```

### 使用範例

```tsx
// Before
<button>Archive</button>

// After
const { t } = useTranslation();
<button>{t("quickSwitcher.button.archive")}</button>
```

### Rust 後端

後端 error message 暫時不需要 i18n — 它們主要是開發者偵錯用。使用者可見的錯誤（如子樹上限）在前端可以用 error code mapping 覆寫顯示文字。
