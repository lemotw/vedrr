# Round 5 - 剩餘問題深入

> Q6 已結案。以下針對 Q7、Q8 和一些新問題做更深入的討論。

---

## Q7 深入：統整（Compact）機制

你提到統整像 AI agent 的 /compact，在不動原本 context 下輸出 summary，
並跟通用 knowledge 確認是否有可納入的 context。

我需要釐清幾個細節：

### Q11: Summary 產出後放在哪裡？

- A) 放在該 context tree 的根節點下方，作為一個特殊 node（如 [S] Summary）
- B) 獨立的 Summary 列表/面板，不在 tree 裡
- C) 自動寫入一個 markdown 檔案，掛在 tree 的某個 node 底下
- D) 其他

**你的回答：**

首先要澄清 summay 跟 compact 是兩個不同功能， compact 是在特定情境下整理或是合併 context 而 summary 是針對 context 做個簡單彙總，summary 為手動觸發他觸發後會談出 summary 說明讓你觀看，而 compact 是每天開啟時他會自己 compact 看是否有可以合併的 context 並且提示你是否接受修正。

compact 處理 ->  後台可以關閉自動觸發的，而 compact 也要跟 summary 一樣有手動觸發點
然後放到 achived 或是被自動歸檔的(納入 vault ) 的 context 會被拿來跟 common knowledge 做 compact 看有沒有可以融合到 common knowledge 裡面的。


---

### Q12: 「跟通用 knowledge 確認是否有可納入的 context」是什麼意思？

我的理解是你有一個「通用知識庫」，統整時 AI 會比對看有沒有值得拉進來的舊知識。

- A) 通用 knowledge = 所有 archived/vault 的 context，AI 自動掃描相關內容建議連結
- B) 通用 knowledge = 用戶自己維護的一棵特殊 tree（像 wiki），統整時 AI 建議哪些該更新
- C) 沒有特別的通用知識庫，只是統整時 AI 看看有沒有跨 context 的重複/相關內容
- D) 其他

**你的回答：**

對而且這塊會有別於 active/archived/vault 的另外一塊 context tree 林

---

### Q13: 統整的觸發方式？

- A) 手動觸發 — 用戶在 context 上按按鈕/快捷鍵觸發
- B) 定時觸發 — 每天結束時自動跑（可設定時間）
- C) 兩者都要
- D) 其他

**你的回答：**
C

---

## Q8 深入：Context 之間的關係

你提到每個 context 是獨立的 tree，但我想確認：

### Q14: 不同 context 的 node 之間能互相連結嗎？

例如 Auth系統 tree 的某個 node 可以指向 前端重構 tree 的某個 node？

- A) 不需要 — 每棵 tree 完全獨立
- B) 需要 — node 之間可以建立 link（像 Obsidian 的 [[]] 連結）
- C) 不確定 — 你幫我想想利弊

**你的回答：**


---

## 新問題

### Q15: 資料儲存方式偏好？

- A) 本地檔案系統 — 像 Obsidian，所有資料都是本地資料夾裡的檔案，用戶完全掌控
- B) 本地資料庫 — SQLite 之類，效能好但用戶看不到原始檔案
- C) 混合 — 檔案型 node（md, image）存在檔案系統，metadata 存資料庫
- D) 其他

**你的回答：**

C 像是連結到的檔案要讓用戶可以掌控

---

### Q16: AI 整合的範圍？

目前確認的 AI 功能只有「統整/compact」。除此之外：

- A) 只做統整就好，其他不需要 AI
- B) 未來可能加更多 AI 功能（但 MVP 先只做統整）
- C) 其他想法

**你的回答：**


目前先這兩個功能就好