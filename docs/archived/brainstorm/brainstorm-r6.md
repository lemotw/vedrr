# Round 6 - Common Knowledge + 遺漏問題

> 重要新發現：系統有兩個世界
>
> 1. **Working Contexts** — 日常工作的 context trees（active/archived/vault）
> 2. **Common Knowledge** — 獨立的持久知識庫，從 compact 後的 context 中萃取
>
> 以及兩個獨立的 AI 功能：
> - **Summary**：手動觸發 → 彈出 context 摘要供閱讀（不改原始內容）
> - **Compact**：AI 分析 context 是否可合併/精簡 → 提示用戶確認
>   - Active contexts 之間：建議合併相關 context
>   - Archived/Vault → Common Knowledge：建議萃取持久知識

---

## Q14（上輪漏答）：不同 context 的 node 之間能互相連結嗎？

例如 Auth系統 tree 的某個 node 可以指向 前端重構 tree 的某個 node？

- A) 不需要 — 每棵 tree 完全獨立
- B) 需要 — node 之間可以建立 link（像 Obsidian 的 [[]] 連結）
- C) 不確定 — 你幫我想想利弊

**你的回答：**

不需要每個 context 完全獨立

---

## Q17: Common Knowledge 的結構是什麼？

它也是 tree 嗎？還是不同的組織方式？

- A) 也是 tree — 跟 working context 一樣的樹狀結構，但按主題分成多棵 knowledge tree
- B) 扁平文件庫 — 一堆 markdown/檔案，靠 tag 和搜尋組織
- C) 一棵大樹 — 所有通用知識放在一棵大的分類樹下
- D) 其他

**你的回答：**

一樣是多個 context 但是 context 間是拓僕關係，像是 obsidian 的 graph view 一樣

---

## Q18: Common Knowledge 在 UI 上怎麼呈現？

它跟 Working Contexts 是平行的入口，還是藏在某個地方？

- A) 狀態列上有獨立入口 — 像切換模式：[Working] [Knowledge]
- B) Context Manager 裡的一個獨立區塊
- C) Quick Switcher 裡也看得到（可以 focus 一棵 knowledge tree 來編輯）
- D) 其他

**你的回答：**

B 然後呈現像是 obsidian 的 graph view

---

## Q19: Compact 的確認 UI 長什麼樣？

Compact 分析完後提示用戶「是否接受修正」，這個 UI 你想怎麼呈現？

- A) 像 git diff — 顯示修改前/修改後，用戶逐項接受或拒絕
- B) 像 PR review — AI 列出建議清單，用戶勾選要接受哪些
- C) 簡單對話 — AI 用文字說明要做什麼，用戶 Yes/No
- D) 其他

**你的回答：**

這塊像是 B 讓用戶選擇