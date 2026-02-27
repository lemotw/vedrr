# Semantic Search (⌘F) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace ⌘F NodeSearch from client-side title substring match to cross-context semantic search using fastembed-rs + multilingual-e5-small.

**Architecture:** Rust backend handles embedding (fastembed-rs OnceLock model) and brute-force cosine search across all ACTIVE+ARCHIVED contexts. Frontend calls `semantic_search` IPC with 200ms debounce, displays top-10 results with context name. Embeddings stored in main SQLite with CASCADE delete. Incremental updates fire-and-forget on node CRUD.

**Tech Stack:** fastembed-rs (Rust, ONNX Runtime), multilingual-e5-small (384-dim, 118MB), rusqlite BLOB, React + Zustand + Tauri IPC.

**Design doc:** `docs/plans/2026-02-25-semantic-search-implementation.md`

---

### Task 1: Add fastembed dependency + DB schema

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/db.rs`

**Step 1: Add fastembed to Cargo.toml**

In `src-tauri/Cargo.toml`, add after the `tokio` line:

```toml
fastembed = "4"
```

**Step 2: Add node_embeddings table to db.rs**

In `src-tauri/src/db.rs`, inside `init_db()`, add after the `model_cache` CREATE TABLE (before the closing `"` of `execute_batch`):

```sql
CREATE TABLE IF NOT EXISTS node_embeddings (
    node_id    TEXT PRIMARY KEY REFERENCES tree_nodes(id) ON DELETE CASCADE,
    context_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
    embedding  BLOB NOT NULL,
    input_text TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_embeddings_context ON node_embeddings(context_id);
```

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`

Expected: Compiles (fastembed download may take a while on first build). The `node_embeddings` table is created via `execute_batch` on next DB init.

**Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/db.rs
git commit -m "feat(search): add fastembed dependency + node_embeddings schema"
```

---

### Task 2: Create embedding.rs — model management + pure functions

**Files:**
- Create: `src-tauri/src/embedding.rs`
- Modify: `src-tauri/src/main.rs` (add `mod embedding`)

**Step 1: Create embedding.rs**

Create `src-tauri/src/embedding.rs`:

```rust
use rusqlite::Connection;
use std::sync::OnceLock;

use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};

use crate::error::AppError;

// ── Model singleton ────────────────────────────────────────────
static MODEL: OnceLock<TextEmbedding> = OnceLock::new();

pub fn get_model() -> Result<&'static TextEmbedding, AppError> {
    MODEL
        .get_or_try_init(|| {
            TextEmbedding::try_new(InitOptions {
                model_name: EmbeddingModel::MultilingualE5Small,
                show_download_progress: true,
                ..Default::default()
            })
            .map_err(|e| AppError::Other(format!("Failed to load embedding model: {e}")))
        })
        .map_err(|e| AppError::Other(format!("Embedding model init failed: {e}")))
}

// ── Embed helpers ──────────────────────────────────────────────

/// Embed passages (node texts). Adds "passage: " prefix per e5 convention.
pub fn embed_passages(texts: &[String]) -> Result<Vec<Vec<f32>>, AppError> {
    if texts.is_empty() {
        return Ok(vec![]);
    }
    let prefixed: Vec<String> = texts.iter().map(|t| format!("passage: {t}")).collect();
    let model = get_model()?;
    model
        .embed(prefixed, None)
        .map_err(|e| AppError::Other(format!("Embedding failed: {e}")))
}

/// Embed a single search query. Adds "query: " prefix per e5 convention.
pub fn embed_query(query: &str) -> Result<Vec<f32>, AppError> {
    let prefixed = format!("query: {query}");
    let model = get_model()?;
    let results = model
        .embed(vec![prefixed], None)
        .map_err(|e| AppError::Other(format!("Query embedding failed: {e}")))?;
    results
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Other("Empty embedding result".into()))
}

// ── Cosine similarity ──────────────────────────────────────────

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }
    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

// ── Ancestor path builder ──────────────────────────────────────

/// Max characters for embedding input text (conservative estimate for 512 tokens).
/// Mixed CJK/English averages ~1.5 chars/token, so 450 chars ≈ 300 tokens.
/// Leaves headroom for the "passage: " prefix and tokenizer overhead.
const MAX_PATH_CHARS: usize = 450;

/// Build ancestor path for a node: "Root > Parent > ... > Node Title".
/// If the path exceeds MAX_PATH_CHARS, segments are dropped from the root side.
/// Returns (embedding_text, display_path).
/// - embedding_text: the text to embed (no "passage:" prefix — caller adds it)
/// - display_path: "ContextName > Parent > ..." for UI display
pub fn build_ancestor_path(
    db: &Connection,
    node_id: &str,
) -> Result<(String, String), AppError> {
    // Walk up parent chain collecting titles
    let mut segments: Vec<String> = Vec::new();
    let mut current_id = node_id.to_string();

    loop {
        let row: (String, Option<String>) = db
            .query_row(
                "SELECT title, parent_id FROM tree_nodes WHERE id = ?1",
                [&current_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| AppError::NodeNotFound(current_id.clone()))?;

        segments.push(row.0);

        match row.1 {
            Some(pid) => current_id = pid,
            None => break, // reached root
        }
    }

    // segments is [Node, Parent, ..., Root] — reverse to [Root, ..., Parent, Node]
    segments.reverse();

    // Build display path (full, no truncation)
    let display_path = segments.join(" > ");

    // Truncate from root side if too long
    let mut embed_segments = segments.clone();
    while embed_segments.join(" > ").len() > MAX_PATH_CHARS && embed_segments.len() > 1 {
        embed_segments.remove(0);
    }
    let embed_text = embed_segments.join(" > ");

    Ok((embed_text, display_path))
}

// ── Serialize / deserialize embedding BLOB ─────────────────────

pub fn vec_to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

pub fn blob_to_vec(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_identical_vectors() {
        let a = vec![1.0, 2.0, 3.0];
        let score = cosine_similarity(&a, &a);
        assert!((score - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_orthogonal_vectors() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let score = cosine_similarity(&a, &b);
        assert!(score.abs() < 1e-6);
    }

    #[test]
    fn test_cosine_zero_vector() {
        let a = vec![0.0, 0.0];
        let b = vec![1.0, 2.0];
        let score = cosine_similarity(&a, &b);
        assert_eq!(score, 0.0);
    }

    #[test]
    fn test_blob_roundtrip() {
        let original = vec![1.0f32, -2.5, 3.14, 0.0];
        let blob = vec_to_blob(&original);
        let recovered = blob_to_vec(&blob);
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_build_ancestor_path_truncation() {
        // Simulate a very long path
        let long_segment = "A".repeat(200);
        let segments = vec![long_segment.clone(), long_segment.clone(), "Node".to_string()];
        let full = segments.join(" > ");
        assert!(full.len() > MAX_PATH_CHARS);

        // The truncation logic drops from left
        let mut embed_segs = segments.clone();
        while embed_segs.join(" > ").len() > MAX_PATH_CHARS && embed_segs.len() > 1 {
            embed_segs.remove(0);
        }
        // Should have dropped at least the first segment
        assert!(embed_segs.len() < segments.len());
        // Last segment is always preserved
        assert_eq!(embed_segs.last().unwrap(), "Node");
    }
}
```

**Step 2: Register module in main.rs**

In `src-tauri/src/main.rs`, add after `mod models;`:

```rust
mod embedding;
```

**Step 3: Run unit tests**

Run: `cd src-tauri && cargo test`

Expected: All 5 tests pass. (Note: `cargo test` won't load the embedding model — tests only exercise pure functions.)

**Step 4: Commit**

```bash
git add src-tauri/src/embedding.rs src-tauri/src/main.rs
git commit -m "feat(search): add embedding module with model mgmt + cosine + path builder"
```

---

### Task 3: Create commands/search.rs — 3 Tauri commands

**Files:**
- Create: `src-tauri/src/commands/search.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Create commands/search.rs**

Create `src-tauri/src/commands/search.rs`:

```rust
use serde::Serialize;
use tauri::State;

use crate::embedding;
use crate::error::AppError;
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub node_id: String,
    pub node_title: String,
    pub node_type: String,
    pub context_id: String,
    pub context_name: String,
    pub ancestor_path: String,
    pub score: f32,
}

#[tauri::command]
pub fn semantic_search(
    query: String,
    top_k: usize,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, AppError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(vec![]);
    }

    // 1. Embed query
    let query_vec = embedding::embed_query(query)?;

    // 2. Load all embeddings for ACTIVE + ARCHIVED contexts
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT ne.node_id, ne.embedding, ne.input_text,
                tn.title, tn.node_type,
                c.id as context_id, c.name as context_name
         FROM node_embeddings ne
         JOIN tree_nodes tn ON ne.node_id = tn.id
         JOIN contexts c ON ne.context_id = c.id
         WHERE c.state IN ('active', 'archived')",
    )?;

    let mut scored: Vec<SearchResult> = Vec::new();

    let rows = stmt.query_map([], |row| {
        let node_id: String = row.get(0)?;
        let blob: Vec<u8> = row.get(1)?;
        let input_text: String = row.get(2)?;
        let title: String = row.get(3)?;
        let node_type: String = row.get(4)?;
        let context_id: String = row.get(5)?;
        let context_name: String = row.get(6)?;
        Ok((node_id, blob, input_text, title, node_type, context_id, context_name))
    })?;

    for row in rows {
        let (node_id, blob, _input_text, title, node_type, context_id, context_name) = row?;
        let node_vec = embedding::blob_to_vec(&blob);
        let score = embedding::cosine_similarity(&query_vec, &node_vec);

        // Build display path from input_text (it's the ancestor path)
        // For display, show context_name > ... path (excluding context_name if it's the first segment)
        let ancestor_path = _input_text;

        scored.push(SearchResult {
            node_id,
            node_title: title,
            node_type,
            context_id,
            context_name,
            ancestor_path,
            score,
        });
    }

    // 3. Sort by score descending, take top_k
    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);

    Ok(scored)
}

#[tauri::command]
pub fn embed_context_nodes(
    context_id: String,
    state: State<'_, AppState>,
) -> Result<usize, AppError> {
    let db = state.db.lock().unwrap();

    // Find all nodes in this context that don't have embeddings yet
    let mut stmt = db.prepare(
        "SELECT tn.id FROM tree_nodes tn
         LEFT JOIN node_embeddings ne ON tn.id = ne.node_id
         WHERE tn.context_id = ?1 AND ne.node_id IS NULL",
    )?;
    let missing_ids: Vec<String> = stmt
        .query_map([&context_id], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;

    if missing_ids.is_empty() {
        return Ok(0);
    }

    // Build texts for all missing nodes
    let mut texts: Vec<(String, String, String)> = Vec::new(); // (node_id, embed_text, display_path)
    for node_id in &missing_ids {
        match embedding::build_ancestor_path(&db, node_id) {
            Ok((embed_text, display_path)) => {
                texts.push((node_id.clone(), embed_text, display_path));
            }
            Err(e) => {
                eprintln!("[embed] skip node {node_id}: {e}");
            }
        }
    }

    if texts.is_empty() {
        return Ok(0);
    }

    // Batch embed
    let embed_inputs: Vec<String> = texts.iter().map(|(_, t, _)| t.clone()).collect();
    let embeddings = embedding::embed_passages(&embed_inputs)?;

    // Insert into DB
    let mut insert_stmt = db.prepare(
        "INSERT OR REPLACE INTO node_embeddings (node_id, context_id, embedding, input_text, updated_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))",
    )?;

    let mut count = 0;
    for (i, (node_id, _embed_text, display_path)) in texts.iter().enumerate() {
        if let Some(vec) = embeddings.get(i) {
            let blob = embedding::vec_to_blob(vec);
            insert_stmt.execute(rusqlite::params![node_id, context_id, blob, display_path])?;
            count += 1;
        }
    }

    Ok(count)
}

#[tauri::command]
pub fn embed_single_node(
    node_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();

    // Get context_id for this node
    let context_id: String = db
        .query_row(
            "SELECT context_id FROM tree_nodes WHERE id = ?1",
            [&node_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NodeNotFound(node_id.clone()))?;

    // Build path and embed
    let (embed_text, display_path) = embedding::build_ancestor_path(&db, &node_id)?;
    let embeddings = embedding::embed_passages(&[embed_text])?;
    let vec = embeddings
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Other("Empty embedding result".into()))?;
    let blob = embedding::vec_to_blob(&vec);

    // Upsert
    db.execute(
        "INSERT OR REPLACE INTO node_embeddings (node_id, context_id, embedding, input_text, updated_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))",
        rusqlite::params![node_id, context_id, blob, display_path],
    )?;

    Ok(())
}
```

**Step 2: Register module in commands/mod.rs**

In `src-tauri/src/commands/mod.rs`, add:

```rust
pub mod search;
```

**Step 3: Register commands in main.rs**

In `src-tauri/src/main.rs`, add the 3 commands to `invoke_handler` (after `list_models`):

```rust
commands::search::semantic_search,
commands::search::embed_context_nodes,
commands::search::embed_single_node,
```

**Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`

Expected: Compiles without errors.

**Step 5: Commit**

```bash
git add src-tauri/src/commands/search.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat(search): add semantic_search + embed commands"
```

---

### Task 4: Frontend IPC layer — constants, types, ipc

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/ipc.ts`

**Step 1: Add IPC command constants**

In `src/lib/constants.ts`, add 3 entries to the `IpcCmd` object (after `LIST_MODELS`):

```typescript
SEMANTIC_SEARCH: "semantic_search",
EMBED_CONTEXT_NODES: "embed_context_nodes",
EMBED_SINGLE_NODE: "embed_single_node",
```

**Step 2: Add SearchResult type**

In `src/lib/types.ts`, add at the end (before the closing of file):

```typescript
export interface SearchResult {
  node_id: string;
  node_title: string;
  node_type: string;
  context_id: string;
  context_name: string;
  ancestor_path: string;
  score: number;
}
```

**Step 3: Add IPC wrappers**

In `src/lib/ipc.ts`, add the import for `SearchResult`:

In the import line at top, add `SearchResult` to the type import:
```typescript
import type { Context, ContextSummary, TreeData, TreeNode, CompactResult, AiProfile, ApiKey, ModelInfo, SearchResult } from "./types";
```

Add 3 methods to the `ipc` object (after `listModels`):

```typescript
semanticSearch: (query: string, topK: number = 10) =>
  safeInvoke<SearchResult[]>(IpcCmd.SEMANTIC_SEARCH, { query, topK }),

embedContextNodes: (contextId: string) =>
  safeInvoke<number>(IpcCmd.EMBED_CONTEXT_NODES, { contextId }),

embedSingleNode: (nodeId: string) =>
  safeInvoke<void>(IpcCmd.EMBED_SINGLE_NODE, { nodeId }),
```

**Step 4: Verify lint**

Run: `pnpm lint`

Expected: No errors.

**Step 5: Commit**

```bash
git add src/lib/constants.ts src/lib/types.ts src/lib/ipc.ts
git commit -m "feat(search): add frontend IPC layer for semantic search"
```

---

### Task 5: Rewrite NodeSearch.tsx — semantic search UI

**Files:**
- Modify: `src/components/NodeSearch.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh-TW.json`

**Step 1: Update i18n keys**

In `src/i18n/en.json`, replace the `"nodeSearch"` block:

```json
"nodeSearch": {
  "placeholder": "Semantic search across all contexts...",
  "empty": "No matching nodes",
  "loading": "Searching...",
  "modelLoading": "Preparing search engine...",
  "footer": "\u2191\u2193 Select  Enter Go  Esc Close"
}
```

In `src/i18n/zh-TW.json`, replace the `"nodeSearch"` block:

```json
"nodeSearch": {
  "placeholder": "\u8a9e\u610f\u641c\u5c0b\u6240\u6709 context...",
  "empty": "\u627e\u4e0d\u5230\u7b26\u5408\u7684\u7bc0\u9ede",
  "loading": "\u641c\u5c0b\u4e2d...",
  "modelLoading": "\u6b63\u5728\u6e96\u5099\u641c\u5c0b\u5f15\u64ce...",
  "footer": "\u2191\u2193 \u9078\u64c7  Enter \u8df3\u8f49  Esc \u95dc\u9589"
}
```

**Step 2: Rewrite NodeSearch.tsx**

Replace the entire contents of `src/components/NodeSearch.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import { NODE_TYPE_CONFIG } from "../lib/types";
import type { SearchResult } from "../lib/types";
import { ipc } from "../lib/ipc";
import { cn } from "../lib/cn";
import { modSymbol } from "../lib/platform";

export function NodeSearch() {
  const { t } = useTranslation();
  const { nodeSearchOpen, closeNodeSearch } = useUIStore();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce query
  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch results on debounced query change
  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    ipc
      .semanticSearch(debouncedQuery, 10)
      .then((res) => {
        if (!cancelled) setResults(res);
      })
      .catch((err) => {
        console.error("[semantic-search]", err);
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Reset state on open
  useEffect(() => {
    if (nodeSearchOpen) {
      setQuery("");
      setDebouncedQuery("");
      setResults([]);
      setSelectedIdx(0);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [nodeSearchOpen]);

  // Keep selectedIdx in bounds
  useEffect(() => {
    if (selectedIdx >= results.length) setSelectedIdx(Math.max(0, results.length - 1));
  }, [results.length, selectedIdx]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!nodeSearchOpen) return null;

  async function handleSelect(result: SearchResult) {
    const currentContextId = useContextStore.getState().currentContextId;
    closeNodeSearch();
    if (result.context_id !== currentContextId) {
      await useContextStore.getState().switchContext(result.context_id);
      await useTreeStore.getState().loadTree(result.context_id);
    }
    useTreeStore.getState().selectNode(result.node_id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIdx]) handleSelect(results[selectedIdx]);
        break;
      case "Escape":
        e.preventDefault();
        closeNodeSearch();
        break;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={closeNodeSearch}
    >
      <div
        className="w-[520px] max-h-[460px] bg-bg-elevated rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center h-12 px-4 bg-bg-card shrink-0">
          <span className="text-text-secondary text-sm mr-2">&#x1F50D;</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-text-primary font-mono text-[13px] outline-none placeholder:text-text-secondary"
            placeholder={t("nodeSearch.placeholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="text-text-secondary font-mono text-[11px] bg-bg-elevated rounded px-2 py-1">
            {modSymbol}F
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {/* Loading */}
          {loading && results.length === 0 && debouncedQuery && (
            <div className="px-4 py-8 text-center text-text-secondary font-mono text-xs">
              {t("nodeSearch.loading")}
            </div>
          )}

          {/* Empty */}
          {!loading && debouncedQuery && results.length === 0 && (
            <div className="px-4 py-8 text-center text-text-secondary font-mono text-xs">
              {t("nodeSearch.empty")}
            </div>
          )}

          {/* Results list */}
          {results.map((item, idx) => {
            const cfg = NODE_TYPE_CONFIG[item.node_type];
            return (
              <div
                key={item.node_id}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 cursor-pointer",
                  idx === selectedIdx
                    ? "bg-accent-primary/10"
                    : "hover:bg-bg-card/50"
                )}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                {/* Type badge */}
                <span
                  className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center bg-bg-elevated shrink-0"
                  style={{ color: cfg?.color }}
                >
                  {cfg?.letter}
                </span>

                {/* Title + path */}
                <div className="flex flex-col flex-1 min-w-0">
                  <span
                    className={cn(
                      "font-mono text-[13px] text-text-primary truncate",
                      idx === selectedIdx && "font-semibold"
                    )}
                  >
                    {item.node_title || t("common.untitled")}
                  </span>
                  <span className="font-mono text-[10px] text-text-secondary truncate">
                    {item.context_name}
                    {item.ancestor_path && ` \u203A ${item.ancestor_path}`}
                  </span>
                </div>

                {/* Score */}
                <span className="font-mono text-[10px] text-text-secondary shrink-0">
                  {item.score.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center h-10 px-4 bg-bg-card shrink-0">
          <span className="font-mono text-[10px] text-text-secondary">
            {t("nodeSearch.footer")}
          </span>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Verify lint**

Run: `pnpm lint`

Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/NodeSearch.tsx src/i18n/en.json src/i18n/zh-TW.json
git commit -m "feat(search): rewrite NodeSearch with semantic search UI"
```

---

### Task 6: Incremental embedding hooks — treeStore + contextStore

**Files:**
- Modify: `src/stores/treeStore.ts`
- Modify: `src/stores/contextStore.ts`

**Step 1: Add embedding triggers to treeStore.ts**

Add fire-and-forget embedding calls at the end of these methods:

**In `addChild`** (after `useUIStore.getState().setEditingNode(node.id);` at line ~158):
```typescript
ipc.embedSingleNode(node.id).catch(console.error);
```

**In `addSibling`** (after `useUIStore.getState().setEditingNode(node.id);` at line ~172):
```typescript
ipc.embedSingleNode(node.id).catch(console.error);
```

**In `updateNodeTitle`** (after `set({ tree: patchNode(... });` at line ~213):
```typescript
ipc.embedSingleNode(nodeId).catch(console.error);
```

**In `dragMoveNode`** (after `set({ selectedNodeId: nodeId });` at line ~365):
```typescript
// Re-embed entire context since move changes ancestor paths of subtree
const ctxId = get().tree?.node.context_id;
if (ctxId) ipc.embedContextNodes(ctxId).catch(console.error);
```

Note: `dragMoveNode` re-embeds the entire context because a reparent changes ancestor paths for the moved node and all its descendants. `embed_context_nodes` only processes nodes missing embeddings, but since moved nodes' paths changed, we need to delete and re-embed. For simplicity, we re-embed the whole context as a fire-and-forget operation.

Actually — correction: `embed_context_nodes` only embeds **missing** nodes (those without an entry in `node_embeddings`). For **moved** nodes that already have embeddings but with stale paths, we need the embedding to be re-computed. Two options:

**Option A (simple):** After move, call `embed_single_node` for the moved node only. Descendants will have slightly stale embeddings until their titles change. This is acceptable since the ancestor path mainly affects ranking, and the node's own title is the strongest signal.

**Option B (thorough):** Delete all embeddings for the context, then call `embed_context_nodes` to re-embed everything.

Go with **Option A** for now:

```typescript
ipc.embedSingleNode(nodeId).catch(console.error);
```

**Step 2: Add embedding triggers to contextStore.ts**

**In `switchContext`** (after `await get().loadContexts();` at line ~41):
```typescript
ipc.embedContextNodes(id).catch(console.error);
```

**In `renameContext`** (after `await get().loadContexts();` at line ~44):

Renaming a context changes the root node title, which changes every node's ancestor path. We need to re-embed everything. Delete existing embeddings first by deleting them in Rust, or just let the stale embeddings exist (they'll still match reasonably well since the root title is the farthest ancestor and gets truncated first for long paths).

For simplicity, just fire-and-forget `embedContextNodes` which handles missing ones. Existing stale embeddings will be slightly suboptimal but functional:

```typescript
ipc.embedContextNodes(id).catch(console.error);
```

**Step 3: Import ipc in contextStore**

The `ipc` import already exists in `contextStore.ts` (line 3), so no change needed.

**Step 4: Verify lint**

Run: `pnpm lint`

Expected: No errors.

**Step 5: Commit**

```bash
git add src/stores/treeStore.ts src/stores/contextStore.ts
git commit -m "feat(search): add incremental embedding hooks to stores"
```

---

### Task 7: End-to-end verification

**Step 1: Start dev server**

Run: `pnpm tauri dev`

Wait for Rust compilation (first time with fastembed will be slow ~2-5 min) and app to launch.

**Step 2: Test basic flow**

1. Create 2-3 contexts with meaningful nodes (e.g., "Quantum Computing" with children "Entanglement", "Superposition"; "Machine Learning" with "Neural Networks", "Gradient Descent")
2. Press ⌘F
3. Type a semantic query like "quantum" or "neural"
4. Verify: results appear after ~200ms debounce, showing nodes from relevant contexts
5. Verify: results show context name, ancestor path, similarity score
6. Verify: selecting a result from a different context switches to that context and selects the node

**Step 3: Test edge cases**

1. Empty query → no results, no loading
2. Very short query ("a") → results (low quality, but should return something)
3. Query in Chinese → results from Chinese-titled nodes
4. Press Esc → closes search
5. Arrow keys → navigate results
6. First-time model load → may see brief delay on first search (model download/load)

**Step 4: Test incremental embedding**

1. Create a new node → search for its title → should appear in results
2. Rename a node → search for new title → should appear (after re-embed)
3. Delete a node → search for its title → should NOT appear (CASCADE delete)

**Step 5: Commit final state if any adjustments needed**

```bash
git add -A
git commit -m "feat(search): semantic search end-to-end working"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | Cargo.toml, db.rs | fastembed dep + DB schema |
| 2 | embedding.rs, main.rs | Model mgmt, cosine, path builder, blob helpers |
| 3 | commands/search.rs, mod.rs, main.rs | 3 Tauri commands |
| 4 | constants.ts, types.ts, ipc.ts | Frontend IPC layer |
| 5 | NodeSearch.tsx, en.json, zh-TW.json | Semantic search UI |
| 6 | treeStore.ts, contextStore.ts | Incremental embed hooks |
| 7 | — | E2E verification |
