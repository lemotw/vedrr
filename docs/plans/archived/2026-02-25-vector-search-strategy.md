# vedrr 語意搜尋策略

## 目標

跨 Context 語意搜尋 — 使用者輸入自然語言 query，從所有 ACTIVE / ARCHIVED context 的節點中找出語意相關的結果，支援中英混合內容。

---

## 1. Model 選擇

### 選定：`multilingual-e5-small`

| 項目 | 值 |
|------|-----|
| 來源 | Microsoft / HuggingFace |
| 參數量 | 118M |
| 輸出維度 | 384 |
| 輸入上限 | 512 tokens (~350 中文字) |
| 模型大小 | 118MB (ONNX) |
| 授權 | MIT |

### 為什麼選這個

| 候選 | 中文 | 英文 | 混合 | 大小 | 結論 |
|------|------|------|------|------|------|
| all-MiniLM-L6-v2 | 差 | 優 | 差 | 23MB | 中文不可用，排除 |
| bge-small-zh-v1.5 | 優 | 差 | 中 | 95MB | 英文弱，排除 |
| **multilingual-e5-small** | **好** | **好** | **最佳** | **118MB** | **選定** |
| multilingual-e5-base | 優 | 優 | 優 | 278MB | 效果更好但體積翻倍，桌面 app 偏重 |

### 推理引擎

- **fastembed-rs** — Rust 原生，內建 ONNX Runtime + tokenizer + pooling
- 無需 Python、無需額外安裝
- 模型首次使用時自動下載，之後離線運行

---

## 2. Node Embedding 策略

### 雙向量：Local + Global

每個 node 生成兩個向量，分別服務不同搜尋場景：

```
vec_local  — Context 內搜尋（帶完整路徑前綴）
vec_global — 跨 Context 搜尋（去掉 root title，避免 context 名稱汙染相似度）
```

### 輸入文字組成

| | vec_local | vec_global |
|--|-----------|------------|
| TEXT 節點 | `"Root > Parent > Title"` | `"Parent > Title"` |
| MARKDOWN 節點 | `"Root > Parent > Title\nContent..."` | `"Parent > Title\nContent..."` |
| IMAGE 節點 | `"Root > Parent > Title"` | `"Parent > Title"` |
| FILE 節點 | `"Root > Parent > Title"` | `"Parent > Title"` |

**路徑差異**：
- `vec_local` 包含 root title（context 名稱），讓同 context 內搜尋有完整樹結構語意
- `vec_global` 去掉 root title，保留 parent 層級作為語境，避免不同 context 的相同概念因 root 名稱不同導致相似度被稀釋

### MARKDOWN 截斷

輸入超過 512 tokens 時截斷前 512 tokens。理由：
- 多數節點是短標題 TEXT，不觸發截斷
- MARKDOWN 核心主題通常在標題 + 開頭段落
- 未來可升級為分段 embed（chunking），但現階段不需要

### Embed 觸發時機

| 事件 | 動作 |
|------|------|
| 節點建立 | embed 該節點（雙向量） |
| 節點標題/內容編輯 | re-embed 該節點 |
| 節點 parent 改名 | re-embed 該節點（路徑前綴變了） |
| 節點移動（reparent） | re-embed 該節點 + 子孫（路徑前綴變了） |
| Root 改名 | re-embed 該 context 所有節點的 vec_local |
| Context 首次向量化 | batch embed 全部節點 |
| 節點刪除 | 刪除對應向量 |

---

## 3. 儲存

### Schema

```sql
CREATE TABLE node_embeddings (
  node_id     TEXT PRIMARY KEY REFERENCES tree_nodes(id) ON DELETE CASCADE,
  context_id  TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
  vec_local   BLOB NOT NULL,  -- 384 × f32 = 1,536 bytes
  vec_global  BLOB NOT NULL,  -- 384 × f32 = 1,536 bytes
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_embeddings_context ON node_embeddings(context_id);
```

### 搜尋方式

Rust 端暴力 cosine similarity，不使用 sqlite-vss 擴展：

```
1. 從 SQLite 讀出目標向量（BLOB → Vec<f32>）
2. embed query → query_vec
3. 逐一計算 cosine similarity
4. 排序取 top-K
```

理由：vedrr 規模下暴力掃描夠快（萬級 nodes < 20ms），避免 sqlite-vss 擴展的 Tauri 打包複雜度。

### 搜尋範圍

| Context 狀態 | 跨 Context 搜尋 | Context 內搜尋 |
|-------------|-----------------|---------------|
| ACTIVE | 搜尋 | 搜尋 |
| ARCHIVED | 搜尋 | 搜尋 |
| VAULT | 排除 | N/A |

---

## 4. 成本分析

### 模型下載（一次性）

| 項目 | 大小 |
|------|------|
| multilingual-e5-small ONNX | 118MB |
| Tokenizer 檔案 | ~1MB |
| **總計** | **~119MB** |

存放位置：`~/vedrr/models/multilingual-e5-small/`

### 儲存成本（持續）

```
每個 node = 1,536 bytes (vec_local) + 1,536 bytes (vec_global) = 3,072 bytes
```

| 使用者規模 | Node 總數 | 向量儲存 | 占 DB 比例 |
|-----------|----------|---------|-----------|
| 輕度 (10 contexts × 30 nodes) | 300 | 0.9MB | 小 |
| 中度 (30 contexts × 80 nodes) | 2,400 | 7.2MB | 中 |
| 重度 (100 contexts × 150 nodes) | 15,000 | 46MB | 大 |

### 推理成本（CPU，Apple Silicon M1+）

**單筆 embed**：

| 操作 | 延遲 |
|------|------|
| embed 1 個短標題 node（雙向量） | ~16-24ms (8-12ms × 2) |
| embed 1 個 MARKDOWN node（雙向量） | ~20-30ms |
| 搜尋 query embed | ~8-12ms |
| cosine 掃描 2,400 vectors | ~2-5ms |
| **搜尋總延遲** | **~10-17ms** |

**批次操作**：

| 操作 | 節點數 | 延遲（batch 模式） |
|------|--------|------------------|
| Context 首次向量化 | 50 | ~0.4-0.6s |
| Context 首次向量化 | 100 | ~0.6-1.0s |
| Root 改名 re-embed | 80 | ~0.5-0.8s (只 re-embed vec_local) |
| 全量重建 | 2,400 | ~8-15s |

### 記憶體成本

| 項目 | 記憶體佔用 |
|------|-----------|
| ONNX Runtime + 模型載入 | ~200-300MB |
| 向量搜尋（讀入記憶體） | 與向量儲存大小相同 |

模型可 lazy load — 首次搜尋時載入，閒置後卸載。

---

## 5. 總結

| 決策 | 選擇 |
|------|------|
| 模型 | multilingual-e5-small (118MB, 384 維) |
| 引擎 | fastembed-rs (Rust + ONNX Runtime) |
| 向量策略 | 雙向量 (vec_local + vec_global) |
| 輸入格式 | 祖先路徑前綴 + 節點標題/內容 |
| 截斷 | 前 512 tokens |
| 儲存 | SQLite BLOB，暴力 cosine similarity |
| 搜尋範圍 | ACTIVE + ARCHIVED，排除 VAULT |
| 搜尋延遲 | ~10-17ms（使用者無感） |
| Embed 方式 | 增量（建立/編輯時），背景 batch（首次/移動） |
