# PM-1: 快速捕捉 UX 方案

> 產出日期：2026-02-23
> 角色：PM-1（快速捕捉 UX 專攻）

---

## 核心理念

**「零阻力入口，零決策壓力。」**

ADHD 使用者最大的痛點是：當靈感來的瞬間，任何摩擦（要想「該放哪個 context？」、要切換 app、要找到正確位置）都會讓 idea 消失在空氣中。

快速捕捉功能的設計目標：
1. **從靈感到記錄 < 3 秒**（包含呼叫捕捉視窗）
2. **不需要做任何分類決策**（讓 AI 或使用者事後整理）
3. **不打斷當前心流**（app 可在背景，捕捉完立刻回去）
4. **支援連續丟多個想法**（不要每丟一個就關掉重開）

---

## 方案描述

### 方案名稱：「Quick Capture Palette」

一個**輕量懸浮視窗（floating panel）**，透過系統全域快捷鍵呼叫，設計如下：

#### 視覺設計
- 視窗大小：480px × 200px（可折疊為 480px × 56px 的輸入條）
- 位置：螢幕中上方（距離頂部約 80px），不擋住主要工作區
- 風格：與 Mind Flow 主題一致（dark bg-card + border-border + accent-primary）
- 無需完整視窗框架，使用 Tauri 的 `decorations: false` + 圓角半透明背景
- 點擊視窗外自動隱藏

#### 核心互動
1. 呼叫快捷鍵（建議：`⌥Space` 或 `⌘⌥N`）→ 視窗出現，游標自動在輸入框
2. 使用者輸入文字 → `Enter` 送出，idea 儲存到「Inbox」
3. 送出後輸入框清空，視窗保持開啟，可繼續丟下一個
4. `Escape` 或失去焦點 → 視窗隱藏

#### Inbox 機制
- 所有快速捕捉的 idea 進入一個特殊的 **Inbox context**（系統保留，不可刪除）
- Inbox context 以一般 context 的形式存在，顯示在 QuickSwitcher 最上方，固定置頂
- Inbox 節點一律為 TEXT 類型，父節點為 Inbox root
- 使用者之後可以用 AI Compact 整理 Inbox，或手動 cut/paste 到其他 context

---

## 使用者流程（step by step）

### 流程 A：基本想法捕捉

```
1. 使用者在瀏覽器/其他 app 讀到有趣的東西，腦中浮現想法
   ↓
2. 按 ⌥Space → Quick Capture Palette 從螢幕上方滑入（動畫 ~150ms）
   ↓
3. 輸入框已聚焦，直接打字：「研究一下 Zettelkasten 跟我目前系統的差異」
   ↓
4. 按 Enter → 想法儲存到 Inbox，輸入框清空，出現淡入的確認 toast：
   「已加入 Inbox (共 7 條)」
   ↓
5. 繼續打下一個想法 or 按 Escape / 點擊外部 → 視窗隱藏
   ↓
6. 使用者回到原本工作，心流不中斷
```

### 流程 B：從其他 app 貼上文字

```
1. 使用者在瀏覽器複製一段文字
   ↓
2. 按 ⌥Space 呼叫 Capture Palette
   ↓
3. 按 ⌘V 貼上（輸入框支援多行，貼上長文字會自動縮為 2 行顯示，其他捲動）
   ↓
4. 可選擇性地在前面補充脈絡：「[讀到這篇] 研究 Zettelkasten...」
   ↓
5. Enter 送出
```

### 流程 C：連續丟多個想法

```
1. 腦中同時浮現 3 個想法
   ↓
2. 一次 ⌥Space 呼叫視窗
   ↓
3. 打第一個 → Enter → 打第二個 → Enter → 打第三個 → Enter
   ↓
4. 三個全進 Inbox，視窗在整個過程中保持開啟
   ↓
5. 確認計數顯示「已加入 Inbox (共 10 條)」→ Escape 關閉
```

### 流程 D：進階 — 指定目標 context（可選）

```
1. 按 ⌥Space 呼叫 Capture Palette
   ↓
2. 輸入想法後，按 Tab 可選擇目標 context（類似 ⌘K 的 context 列表）
   ↓
   ┌─────────────────────────────────────────────────┐
   │ > 研究 Zettelkasten 跟我目前系統的差異             │
   │ ─────────────────────────────────────────────── │
   │ 送入：[▶ Inbox (預設)] [研究筆記] [產品想法]      │
   └─────────────────────────────────────────────────┘
   ↓
3. 按 1/2/3 or ↑↓Enter 選擇目標 → 送出
   ↓
   注意：此步驟完全可選，按 Enter 預設進 Inbox
```

### 流程 E：Inbox 整理（事後）

```
1. 打開 Mind Flow，切換到 Inbox context
   ↓
2. 看到一堆 TEXT 節點（等待分類的想法）
   ↓
3. 選擇 Inbox root → 按 C 觸發 AI Compact
   ↓
4. AI 建議分群：將 Inbox 內容重組成有結構的子節點
   ↓
5. 使用者確認 → 手動 cut/paste 各群到對應 context
   ↓
   (未來可以加「直接移到 context」的 AI 功能)
```

---

## 與現有功能的整合

### ⌘K Quick Switcher 的區隔

| 功能 | Quick Switcher (⌘K) | Quick Capture (⌥Space) |
|------|--------------------|-----------------------|
| 主要目的 | 切換 context | 丟 idea |
| 操作對象 | Context（樹） | 文字輸入 |
| 觸發心態 | 「我要去哪裡工作」 | 「我腦中有個想法」 |
| 需要在 app 內 | 是 | 否（系統全域） |
| 關閉後留在原地 | 是 | 是（不切換 context） |

**整合點**：Quick Capture Palette 內部的「選擇目標 context」UI 可共用 QuickSwitcher 的 context 列表元件，讓兩者視覺一致。

### Ctrl+V 現有貼上流程

現有的 `Ctrl+V` 是在樹狀結構內把剪貼簿內容貼為節點（image auto-detect / text / node clone）。

Quick Capture 的貼上邏輯更簡單：純文字輸入框，`⌘V` 貼文字，不需要 image auto-detect（Inbox 節點一律 TEXT）。

**不衝突**：Capture Palette 是獨立懸浮視窗，與 TreeCanvas 的 paste handler 互不干擾。

### AI Compact 整合

Inbox context 是 AI Compact 最自然的使用場景之一：
- 使用者定期打開 Inbox，選擇 root → `C` 觸發 Compact
- AI 將散亂的 ideas 分群、命名，提升可讀性
- 使用者再手動 reparent 到目標 context

（未來可考慮「AI 自動分類到 context」的進階功能，但不在此版本範圍）

### 現有 Keyboard 系統

目前 `useKeyboard.ts` 是 app 內的全域監聽器。Quick Capture 的系統全域快捷鍵需要 Tauri 的 `tauri-plugin-global-shortcut` 插件，在 Rust 層面註冊，與現有 `useKeyboard.ts` 完全獨立，無衝突。

---

## 優點

1. **真正的零阻力**：不用切換 app，不用想分類，按鍵→打字→Enter，完成
2. **不影響當前工作狀態**：呼叫 Capture Palette 不會切換 context，Mind Flow 主視窗保持原來的 context
3. **連續捕捉流暢**：Enter 後不關閉，適合腦子一下子冒出很多想法的 ADHD 使用者
4. **Inbox 作緩衝**：「先丟進去，之後再整理」的心理契約，降低立刻分類的焦慮
5. **與 AI Compact 天然搭配**：Inbox 亂一點沒關係，AI 可以幫整理
6. **架構簡單**：Inbox 只是特殊 context，後端不需要新表，只需要前端識別 inbox context
7. **漸進揭露**：預設行為超簡單（Enter 進 Inbox），進階的「選 context」功能按 Tab 才出現

---

## 風險與挑戰

### 技術挑戰

1. **系統全域快捷鍵衝突**
   - `⌥Space` 可能被其他 app 搶佔（Raycast、Alfred、Spotlight 等）
   - 解法：提供設定讓使用者自訂快捷鍵，預設給一個較不常見的組合

2. **Tauri 多視窗管理**
   - Capture Palette 是獨立的 Tauri 視窗，需要跨視窗 IPC 通訊（Palette → 主視窗）
   - Tauri 2 有 `window.emit` / `app.emit` 事件系統，可行但需要設計

3. **App 在背景時的行為**
   - 按快捷鍵時 Mind Flow 可能沒有焦點，Palette 需要 `focus: true` 才能接受輸入
   - 需要確保 Palette 視窗關閉後，焦點正確回到原來的 app（不是 Mind Flow 主視窗）

4. **Inbox context 的初始化**
   - 需要在 app 首次啟動時自動建立 Inbox context（如果不存在），且無法被刪除、歸檔
   - 可以在 `init_db` 或 app 啟動時 upsert 一個固定 ID 的 Inbox context

### UX 挑戰

5. **Inbox 爆滿問題**
   - 使用者丟東西很爽，整理起來就懶了 → Inbox 累積 100 條沒整理
   - 解法：StatusBar 顯示 Inbox 計數角標，達到 20 條時顯示提醒

6. **「先丟 Inbox」vs「直接放對 context」的選擇疲勞**
   - 預設 Inbox 是對的，但有些人會想直接放到正確的地方
   - 解法：Tab 展開 context 選擇（進階功能），但按 Enter 永遠是最快的路徑

7. **Capture Palette 消失後確認感不足**
   - 使用者可能不確定有沒有成功送出
   - 解法：送出後短暫顯示計數（「Inbox (7)」），或主視窗 StatusBar 有 Inbox 角標更新

---

## 參考（其他產品怎麼做）

### Notion 的 Web Clipper / Quick Capture
- Chrome 擴充功能，右上角點擊即可捕捉
- 需要選擇 Notion 目標頁面，摩擦稍高
- Mind Flow 的 Inbox 消除了這個選擇步驟

### Raycast 的 Capture / Quicklinks
- `⌥Space` 呼叫，超快，直接進入流程
- 極低摩擦，打字 → Enter 完成
- Mind Flow Capture Palette 的「快速感」應向 Raycast 對齊

### Apple Reminders 的 Siri 捕捉
- 語音 → 自動加入 Inbox
- 語音輸入可作為 Mind Flow Capture 的未來擴展方向

### Logseq / Obsidian 的 Daily Notes
- 每天自動建立一頁，什麼都往裡面丟
- Mind Flow 的 Inbox 有類似概念，但更結構化（是個 tree，不是線性筆記）

### Things 3 的 Quick Entry（`⌥Space`）
- 桌面 app 的最佳範例，極致輕量，打字 → Enter → 視窗消失
- 有選擇 area/project 的進階模式，但預設進 Inbox
- **Mind Flow Capture 應直接對標 Things 3 Quick Entry 的體驗**

### Linear 的 Quick Create（`⌘K` 模式）
- ⌘K 既能搜尋又能快速建立 issue
- 與現有 ⌘K 整合的思路，適合「切換 context + 快速新增節點」的複合需求

---

## 未來擴展方向（不在 V1 範圍）

1. **語音捕捉**：按住 ⌥Space，說話，放開後自動轉文字進 Inbox（需 macOS Speech Recognition）
2. **AI 自動分類**：捕捉時 AI 建議目標 context，使用者一鍵確認
3. **從 Safari/Chrome 捕捉頁面標題 + URL**：自動帶入 Capture Palette
4. **Share Extension（iOS/iPad 版）**：從其他 app 分享到 Mind Flow Inbox
5. **Inbox 計數 Badge**：macOS Dock 或 menu bar icon 顯示未整理數量
6. **定期 Inbox Review 提醒**：7 天未整理，傳送通知
