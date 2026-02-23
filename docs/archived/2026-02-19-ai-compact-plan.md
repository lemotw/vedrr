# AI Compact Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-powered tree compaction that sends a subtree to an LLM, shows a color-coded diff preview, and applies changes on user confirmation.

**Architecture:** Rust backend handles DB queries, LLM API calls (reqwest), and API key storage (OS Keychain via keyring crate). Frontend computes diff from original vs proposed trees, renders a preview modal with color-coded changes, and applies operations via existing IPC commands.

**Tech Stack:** Rust (reqwest, keyring, serde_json), React + TypeScript + Zustand, Tauri IPC

---

### Task 1: Rust — AI Settings DB Schema + CRUD Commands

**Files:**
- Modify: `src-tauri/Cargo.toml` (add reqwest, keyring)
- Modify: `src-tauri/src/db.rs` (add ai_settings table)
- Modify: `src-tauri/src/error.rs` (add Reqwest error variant)
- Create: `src-tauri/src/commands/ai.rs`
- Modify: `src-tauri/src/commands/mod.rs` (register ai module)
- Modify: `src-tauri/src/main.rs` (register new commands)

**Step 1: Add dependencies to Cargo.toml**

Add after the `dirs = "5"` line:

```toml
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
tokio = { version = "1", features = ["rt-multi-thread"] }
```

Note: `tokio` is needed because `reqwest` requires an async runtime and Tauri commands can be `async`.

**Step 2: Add ai_settings table to db.rs**

Add this SQL to `init_db()` after the `CREATE INDEX` statements:

```sql
CREATE TABLE IF NOT EXISTS ai_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

**Step 3: Add Reqwest error variant to error.rs**

Add after the `Io` variant:

```rust
#[error("HTTP error: {0}")]
Http(#[from] reqwest::Error),
```

**Step 4: Create commands/ai.rs**

```rust
use tauri::State;

use crate::AppState;
use crate::error::MindFlowError;

// ── AI Settings (SQLite) ──────────────────────────────────

#[tauri::command]
pub fn get_ai_settings(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, String>, MindFlowError> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare("SELECT key, value FROM ai_settings")?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows.into_iter().collect())
}

#[tauri::command]
pub fn set_ai_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

// ── API Key (OS Keychain) ─────────────────────────────────

const KEYRING_SERVICE: &str = "com.mindflow.ai";

#[tauri::command]
pub fn set_api_key(provider: String, key: String) -> Result<(), MindFlowError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &provider)
        .map_err(|e| MindFlowError::Other(format!("Keyring error: {e}")))?;
    entry
        .set_password(&key)
        .map_err(|e| MindFlowError::Other(format!("Keyring set error: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn has_api_key(provider: String) -> Result<bool, MindFlowError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &provider)
        .map_err(|e| MindFlowError::Other(format!("Keyring error: {e}")))?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(MindFlowError::Other(format!("Keyring read error: {e}"))),
    }
}

fn get_api_key_internal(provider: &str) -> Result<String, MindFlowError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, provider)
        .map_err(|e| MindFlowError::Other(format!("Keyring error: {e}")))?;
    entry
        .get_password()
        .map_err(|e| MindFlowError::Other(format!("No API key for {provider}: {e}")))
}
```

**Step 5: Register in mod.rs and main.rs**

`src-tauri/src/commands/mod.rs` — add:
```rust
pub mod ai;
```

`src-tauri/src/main.rs` — add to `generate_handler![]`:
```rust
commands::ai::get_ai_settings,
commands::ai::set_ai_setting,
commands::ai::set_api_key,
commands::ai::has_api_key,
```

**Step 6: Verify**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat(ai): AI settings CRUD + Keychain API key storage"
```

---

### Task 2: Rust — compact_node Command

**Files:**
- Modify: `src-tauri/src/commands/ai.rs` (add compact_node + LLM client)
- Modify: `src-tauri/src/models.rs` (add ProposedNode + CompactResult)
- Modify: `src-tauri/src/main.rs` (register compact_node)

**Step 1: Add models to models.rs**

Add at the end:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposedNode {
    pub source_id: Option<String>,
    pub title: String,
    pub node_type: String,
    pub children: Vec<ProposedNode>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompactResult {
    pub original: TreeData,
    pub proposed: Vec<ProposedNode>,
}
```

**Step 2: Add helper functions and compact_node to ai.rs**

Add these imports at the top of `ai.rs`:

```rust
use crate::models::{TreeData, TreeNode, ProposedNode, CompactResult};
```

Add these functions after `get_api_key_internal`:

```rust
// ── Tree serialization helpers ────────────────────────────

fn build_subtree(
    db: &rusqlite::Connection,
    node_id: &str,
) -> Result<TreeData, MindFlowError> {
    let node = db.query_row(
        "SELECT id, context_id, parent_id, position, node_type, title, content, file_path, created_at, updated_at
         FROM tree_nodes WHERE id = ?1",
        [node_id],
        |row| {
            Ok(TreeNode {
                id: row.get(0)?,
                context_id: row.get(1)?,
                parent_id: row.get(2)?,
                position: row.get(3)?,
                node_type: row.get(4)?,
                title: row.get(5)?,
                content: row.get(6)?,
                file_path: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    )?;

    let mut stmt = db.prepare(
        "SELECT id FROM tree_nodes WHERE parent_id = ?1 ORDER BY position",
    )?;
    let child_ids: Vec<String> = stmt
        .query_map([node_id], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut children = Vec::new();
    for cid in child_ids {
        children.push(build_subtree(db, &cid)?);
    }

    Ok(TreeData { node, children })
}

fn get_ancestor_path(db: &rusqlite::Connection, node_id: &str) -> Result<Vec<String>, MindFlowError> {
    let mut path = Vec::new();
    let mut current_id = node_id.to_string();
    loop {
        let result: Result<(Option<String>, String), _> = db.query_row(
            "SELECT parent_id, title FROM tree_nodes WHERE id = ?1",
            [&current_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        match result {
            Ok((Some(pid), title)) => {
                path.push(title);
                current_id = pid;
            }
            Ok((None, title)) => {
                path.push(title);
                break;
            }
            Err(_) => break,
        }
    }
    path.reverse();
    // Remove the last element (the node itself) — we only want ancestors
    if path.len() > 1 {
        path.pop();
    }
    Ok(path)
}

fn tree_to_prompt_text(tree: &TreeData, indent: usize) -> String {
    let prefix = "  ".repeat(indent);
    let mut lines = vec![format!(
        "{}- {} [{}]",
        prefix, tree.node.title, tree.node.node_type
    )];
    for child in &tree.children {
        lines.push(tree_to_prompt_text(child, indent + 1));
    }
    lines.join("\n")
}

fn tree_node_ids(tree: &TreeData) -> String {
    // Produce a JSON-like list of id → title for the LLM to reference
    let mut entries = Vec::new();
    fn collect(t: &TreeData, out: &mut Vec<String>) {
        out.push(format!("  \"{}\": \"{}\"", t.node.id, t.node.title));
        for c in &t.children {
            collect(c, out);
        }
    }
    collect(tree, &mut entries);
    format!("{{\n{}\n}}", entries.join(",\n"))
}

fn build_prompt(ancestor_path: &[String], subtree: &TreeData) -> String {
    let path_str = ancestor_path.join(" > ");
    let tree_text = tree_to_prompt_text(subtree, 0);
    let id_map = tree_node_ids(subtree);

    format!(
r#"你是一個知識管理助手。以下是一棵樹狀筆記的子樹。

上下文路徑：{path_str}
目標節點及其子樹：
{tree_text}

節點 ID 對照：
{id_map}

請幫我重組這棵子樹，讓結構更清晰。你可以：
- 刪除重複或不需要的節點
- 新增缺少的分類節點
- 修改節點標題讓語意更明確
- 移動節點到更合適的位置
- image/file 類型節點建議保留（有綁定檔案路徑）

只回傳 JSON，不要任何其他文字：
{{
  "nodes": [
    {{
      "source_id": "原始節點ID或null",
      "title": "節點標題",
      "node_type": "text",
      "children": [...]
    }}
  ]
}}

source_id 規則：
- 保留或修改的原始節點 → 填原始 id
- 全新節點 → 填 null"#
    )
}

// ── LLM API call ──────────────────────────────────────────

async fn call_llm(
    provider: &str,
    model: &str,
    api_key: &str,
    prompt: &str,
) -> Result<String, MindFlowError> {
    let client = reqwest::Client::new();

    match provider {
        "anthropic" => {
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": prompt}]
            });
            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            let text = resp.text().await?;
            if !status.is_success() {
                return Err(MindFlowError::Other(format!("Anthropic API error {status}: {text}")));
            }
            let parsed: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| MindFlowError::Other(format!("JSON parse error: {e}")))?;
            // Extract text from content[0].text
            let content_text = parsed["content"][0]["text"]
                .as_str()
                .ok_or_else(|| MindFlowError::Other("No text in Anthropic response".into()))?;
            Ok(content_text.to_string())
        }
        "openai" => {
            let body = serde_json::json!({
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"}
            });
            let resp = client
                .post("https://api.openai.com/v1/chat/completions")
                .header("Authorization", format!("Bearer {api_key}"))
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            let text = resp.text().await?;
            if !status.is_success() {
                return Err(MindFlowError::Other(format!("OpenAI API error {status}: {text}")));
            }
            let parsed: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| MindFlowError::Other(format!("JSON parse error: {e}")))?;
            let content_text = parsed["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| MindFlowError::Other("No content in OpenAI response".into()))?;
            Ok(content_text.to_string())
        }
        _ => Err(MindFlowError::Other(format!("Unknown provider: {provider}"))),
    }
}

fn parse_proposed_nodes(raw: &str) -> Result<Vec<ProposedNode>, MindFlowError> {
    // Strip markdown code fences if present
    let trimmed = raw.trim();
    let json_str = if trimmed.starts_with("```") {
        let inner = trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();
        inner
    } else {
        trimmed
    };

    let parsed: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| MindFlowError::Other(format!("LLM returned invalid JSON: {e}\n\nRaw:\n{raw}")))?;

    let nodes_value = parsed.get("nodes")
        .ok_or_else(|| MindFlowError::Other("LLM JSON missing 'nodes' key".into()))?;

    let nodes: Vec<ProposedNode> = serde_json::from_value(nodes_value.clone())
        .map_err(|e| MindFlowError::Other(format!("Invalid nodes structure: {e}")))?;

    Ok(nodes)
}

// ── Main command ──────────────────────────────────────────

#[tauri::command]
pub async fn compact_node(
    state: State<'_, AppState>,
    node_id: String,
    context_id: String,
) -> Result<CompactResult, MindFlowError> {
    // 1. Read settings and tree from DB (sync, under lock)
    let (subtree, ancestor_path, provider, model, api_key) = {
        let db = state.db.lock().unwrap();

        let subtree = build_subtree(&db, &node_id)?;
        let ancestor_path = get_ancestor_path(&db, &node_id)?;

        let provider: String = db
            .query_row(
                "SELECT value FROM ai_settings WHERE key = 'provider'",
                [],
                |row| row.get(0),
            )
            .map_err(|_| MindFlowError::Other("AI provider not configured. Open AI Settings first.".into()))?;

        let model: String = db
            .query_row(
                "SELECT value FROM ai_settings WHERE key = 'model'",
                [],
                |row| row.get(0),
            )
            .map_err(|_| MindFlowError::Other("AI model not configured. Open AI Settings first.".into()))?;

        let api_key = get_api_key_internal(&provider)?;

        (subtree, ancestor_path, provider, model, api_key)
    };
    // DB lock released here

    // 2. Build prompt
    let prompt = build_prompt(&ancestor_path, &subtree);

    // 3. Call LLM (async, no DB lock held)
    let raw_response = call_llm(&provider, &model, &api_key, &prompt).await?;

    // 4. Parse response
    let proposed = parse_proposed_nodes(&raw_response)?;

    Ok(CompactResult {
        original: subtree,
        proposed,
    })
}
```

**Step 3: Register compact_node in main.rs**

Add to `generate_handler![]`:
```rust
commands::ai::compact_node,
```

**Step 4: Verify**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(ai): compact_node command with LLM integration"
```

---

### Task 3: Frontend — Types + Constants + IPC Wrappers

**Files:**
- Modify: `src/lib/types.ts` (add ProposedNode, CompactResult)
- Modify: `src/lib/constants.ts` (add IPC commands, AI provider constants)
- Modify: `src/lib/ipc.ts` (add AI-related invoke wrappers)

**Step 1: Add types to types.ts**

Add at the end of `src/lib/types.ts`:

```typescript
// ── AI Compact ───────────────────────────────────────────
export interface ProposedNode {
  source_id: string | null;
  title: string;
  node_type: string;
  children: ProposedNode[];
}

export interface CompactResult {
  original: TreeData;
  proposed: ProposedNode[];
}
```

**Step 2: Add constants to constants.ts**

Add new IPC commands to the `IpcCmd` object:

```typescript
  COMPACT_NODE: "compact_node",
  GET_AI_SETTINGS: "get_ai_settings",
  SET_AI_SETTING: "set_ai_setting",
  SET_API_KEY: "set_api_key",
  HAS_API_KEY: "has_api_key",
```

Add after the `Themes` section:

```typescript
// ── AI Providers ────────────────────────────────────────
export const AIProviders = {
  ANTHROPIC: "anthropic",
  OPENAI: "openai",
} as const;

export type AIProviderId = (typeof AIProviders)[keyof typeof AIProviders];

export const AI_PROVIDER_META: Record<AIProviderId, { name: string; models: string[] }> = {
  anthropic: {
    name: "Anthropic",
    models: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
  },
  openai: {
    name: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini"],
  },
};
```

**Step 3: Add IPC wrappers to ipc.ts**

Add to imports:
```typescript
import type { Context, ContextSummary, TreeData, TreeNode, CompactResult } from "./types";
```

Add to the `ipc` object:

```typescript
  compactNode: (nodeId: string, contextId: string) =>
    invoke<CompactResult>(IpcCmd.COMPACT_NODE, { nodeId, contextId }),

  getAiSettings: () =>
    invoke<Record<string, string>>(IpcCmd.GET_AI_SETTINGS),

  setAiSetting: (key: string, value: string) =>
    invoke<void>(IpcCmd.SET_AI_SETTING, { key, value }),

  setApiKey: (provider: string, key: string) =>
    invoke<void>(IpcCmd.SET_API_KEY, { provider, key }),

  hasApiKey: (provider: string) =>
    invoke<boolean>(IpcCmd.HAS_API_KEY, { provider }),
```

**Step 4: Verify**

Run: `pnpm build`
Expected: compiles without errors.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(ai): frontend types, constants, and IPC wrappers"
```

---

### Task 4: Frontend — compactDiff Algorithm

**Files:**
- Create: `src/lib/compactDiff.ts`

**Step 1: Create compactDiff.ts**

```typescript
import type { TreeData, ProposedNode } from "./types";

export type DiffType = "unchanged" | "added" | "deleted" | "edited" | "moved";

export interface DiffNode {
  type: DiffType;
  title: string;
  nodeType: string;
  sourceId: string | null;
  originalTitle?: string;
  originalParentId?: string;
  children: DiffNode[];
}

interface OriginalInfo {
  title: string;
  nodeType: string;
  parentId: string | null;
}

function collectOriginals(tree: TreeData, map: Map<string, OriginalInfo>) {
  map.set(tree.node.id, {
    title: tree.node.title,
    nodeType: tree.node.node_type,
    parentId: tree.node.parent_id,
  });
  for (const child of tree.children) {
    collectOriginals(child, map);
  }
}

function buildDiffTree(
  proposed: ProposedNode,
  originals: Map<string, OriginalInfo>,
  usedIds: Set<string>,
  newParentSourceId: string | null,
): DiffNode {
  let type: DiffType = "added";
  let originalTitle: string | undefined;

  if (proposed.source_id) {
    usedIds.add(proposed.source_id);
    const orig = originals.get(proposed.source_id);
    if (orig) {
      const titleChanged = orig.title !== proposed.title;
      const typeChanged = orig.nodeType !== proposed.node_type;
      const parentChanged = orig.parentId !== newParentSourceId;

      if (titleChanged || typeChanged) {
        type = "edited";
        originalTitle = orig.title;
      } else if (parentChanged) {
        type = "moved";
        originalTitle = orig.title;
      } else {
        type = "unchanged";
      }
    }
  }

  const children = proposed.children.map((child) =>
    buildDiffTree(child, originals, usedIds, proposed.source_id),
  );

  return {
    type,
    title: proposed.title,
    nodeType: proposed.node_type,
    sourceId: proposed.source_id,
    originalTitle,
    children,
  };
}

function collectDeleted(
  tree: TreeData,
  usedIds: Set<string>,
): DiffNode[] {
  const deleted: DiffNode[] = [];
  if (!usedIds.has(tree.node.id)) {
    deleted.push({
      type: "deleted",
      title: tree.node.title,
      nodeType: tree.node.node_type,
      sourceId: tree.node.id,
      children: [],
    });
  }
  for (const child of tree.children) {
    deleted.push(...collectDeleted(child, usedIds));
  }
  return deleted;
}

export interface DiffResult {
  nodes: DiffNode[];
  deleted: DiffNode[];
  stats: { added: number; deleted: number; edited: number; moved: number };
}

export function computeDiff(original: TreeData, proposed: ProposedNode[]): DiffResult {
  const originals = new Map<string, OriginalInfo>();
  collectOriginals(original, originals);

  const usedIds = new Set<string>();
  const nodes = proposed.map((p) =>
    buildDiffTree(p, originals, usedIds, original.node.parent_id),
  );

  const deleted = collectDeleted(original, usedIds);

  // Count stats
  let added = 0, editedCount = 0, movedCount = 0;
  function countStats(node: DiffNode) {
    if (node.type === "added") added++;
    if (node.type === "edited") editedCount++;
    if (node.type === "moved") movedCount++;
    node.children.forEach(countStats);
  }
  nodes.forEach(countStats);

  return {
    nodes,
    deleted,
    stats: { added, deleted: deleted.length, edited: editedCount, moved: movedCount },
  };
}
```

**Step 2: Verify**

Run: `pnpm build`
Expected: compiles (unused export is fine).

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(ai): compact diff algorithm"
```

---

### Task 5: Frontend — UIStore + AI Settings Component

**Files:**
- Modify: `src/stores/uiStore.ts` (add compact/AI settings state)
- Create: `src/components/AISettings.tsx`
- Modify: `src/components/StatusBar.tsx` (add AI settings button)
- Modify: `src/App.tsx` (render AISettings)

**Step 1: Add state to uiStore.ts**

Add to the `UIStore` interface:

```typescript
  aiSettingsOpen: boolean;
  compactPreviewOpen: boolean;
  compactResult: import("../lib/types").CompactResult | null;
  compactLoading: boolean;

  openAISettings: () => void;
  closeAISettings: () => void;
  setCompactResult: (result: import("../lib/types").CompactResult | null) => void;
  setCompactLoading: (v: boolean) => void;
  closeCompactPreview: () => void;
```

Add to the store implementation:

```typescript
  aiSettingsOpen: false,
  compactPreviewOpen: false,
  compactResult: null,
  compactLoading: false,

  openAISettings: () => set({ aiSettingsOpen: true }),
  closeAISettings: () => set({ aiSettingsOpen: false }),
  setCompactResult: (result) => set({ compactResult: result, compactPreviewOpen: result !== null }),
  setCompactLoading: (v) => set({ compactLoading: v }),
  closeCompactPreview: () => set({ compactPreviewOpen: false, compactResult: null }),
```

**Step 2: Create AISettings.tsx**

```typescript
import { useState, useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { ipc } from "../lib/ipc";
import { AIProviders, AI_PROVIDER_META } from "../lib/constants";
import type { AIProviderId } from "../lib/constants";
import { cn } from "../lib/cn";

const PROVIDER_LIST = Object.values(AIProviders) as AIProviderId[];

export function AISettings() {
  const { aiSettingsOpen, closeAISettings } = useUIStore();
  const [provider, setProvider] = useState<AIProviderId>(AIProviders.ANTHROPIC);
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!aiSettingsOpen) return;
    setSaved(false);
    setApiKey("");
    ipc.getAiSettings().then((settings) => {
      const p = (settings.provider || AIProviders.ANTHROPIC) as AIProviderId;
      setProvider(p);
      setModel(settings.model || AI_PROVIDER_META[p].models[0]);
      ipc.hasApiKey(p).then(setHasKey);
    });
  }, [aiSettingsOpen]);

  if (!aiSettingsOpen) return null;

  const models = AI_PROVIDER_META[provider]?.models || [];

  const handleProviderChange = async (p: AIProviderId) => {
    setProvider(p);
    const defaultModel = AI_PROVIDER_META[p].models[0];
    setModel(defaultModel);
    await ipc.setAiSetting("provider", p);
    await ipc.setAiSetting("model", defaultModel);
    const has = await ipc.hasApiKey(p);
    setHasKey(has);
    setApiKey("");
    setSaved(false);
  };

  const handleModelChange = async (m: string) => {
    setModel(m);
    await ipc.setAiSetting("model", m);
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    await ipc.setApiKey(provider, apiKey.trim());
    setHasKey(true);
    setApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50" onClick={closeAISettings}>
      <div
        className="absolute right-4 top-12 bg-bg-elevated rounded-xl p-4 min-w-[300px]"
        style={{
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] font-bold text-text-secondary tracking-[2px] font-mono mb-3">
          AI SETTINGS
        </div>

        {/* Provider */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-text-secondary font-mono w-16 shrink-0">Provider</span>
          <div className="flex gap-1">
            {PROVIDER_LIST.map((p) => (
              <button
                key={p}
                className={cn(
                  "px-2 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors",
                  p === provider
                    ? "bg-accent-primary/20 text-accent-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)]",
                )}
                onClick={() => handleProviderChange(p)}
              >
                {AI_PROVIDER_META[p].name}
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] text-text-secondary font-mono w-16 shrink-0">Model</span>
          <select
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            className="flex-1 bg-bg-card text-text-primary text-[11px] font-mono rounded px-2 py-1 border border-border"
          >
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-text-secondary font-mono w-16 shrink-0">API Key</span>
            {hasKey && !saved && (
              <span className="text-[10px] text-accent-success font-mono">configured</span>
            )}
            {saved && (
              <span className="text-[10px] text-accent-success font-mono">saved</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? "Enter new key to replace..." : "Paste API key..."}
              className="flex-1 bg-bg-card text-text-primary text-[11px] font-mono rounded px-2 py-1.5 border border-border outline-none placeholder:text-text-secondary"
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleSaveKey(); }}
            />
            <button
              className={cn(
                "px-3 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors",
                apiKey.trim()
                  ? "bg-accent-primary text-white"
                  : "bg-bg-card text-text-secondary pointer-events-none opacity-40",
              )}
              onClick={handleSaveKey}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Add button to StatusBar.tsx**

Read current StatusBar and add AI settings button (gear icon) next to the theme button. Add before the theme `◐` button:

```tsx
<button
  className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer text-sm px-1"
  onClick={() => useUIStore.getState().openAISettings()}
  title="AI Settings"
>
  ⚙
</button>
```

**Step 4: Render AISettings in App.tsx**

Import and render `<AISettings />` alongside other modals.

**Step 5: Verify**

Run: `pnpm build`
Expected: compiles. Run `pnpm tauri dev` and verify the gear button opens the AI Settings popover.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(ai): AI settings UI with provider/model/key management"
```

---

### Task 6: Frontend — CompactPreview Component

**Files:**
- Create: `src/components/CompactPreview.tsx`
- Modify: `src/App.tsx` (render CompactPreview)

**Step 1: Create CompactPreview.tsx**

```typescript
import { useMemo } from "react";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import { computeDiff } from "../lib/compactDiff";
import type { DiffNode, DiffResult } from "../lib/compactDiff";
import type { ProposedNode } from "../lib/types";
import { ipc } from "../lib/ipc";
import { cn } from "../lib/cn";

const DIFF_COLORS: Record<string, string> = {
  added: "text-[#4ADE80]",
  deleted: "text-[#FF4444] opacity-40 line-through",
  edited: "text-[#FFD54F]",
  moved: "text-[#FFD54F]",
  unchanged: "text-text-primary",
};

function DiffNodeRow({ node, depth }: { node: DiffNode; depth: number }) {
  const indent = depth * 20;
  return (
    <>
      <div
        className={cn("flex items-center gap-2 py-1 px-3 font-mono text-[12px]", DIFF_COLORS[node.type])}
        style={{ paddingLeft: 12 + indent }}
      >
        <span className="shrink-0 w-4 text-center">
          {node.type === "added" && "+"}
          {node.type === "deleted" && "-"}
          {node.type === "edited" && "~"}
          {node.type === "moved" && "↻"}
          {node.type === "unchanged" && " "}
        </span>
        <span>{node.title}</span>
        {node.originalTitle && node.type === "edited" && (
          <span className="text-[10px] text-text-secondary ml-1">(was: {node.originalTitle})</span>
        )}
        {node.type === "moved" && (
          <span className="text-[10px] text-text-secondary ml-1">moved</span>
        )}
      </div>
      {node.children.map((child, i) => (
        <DiffNodeRow key={`${child.sourceId || child.title}-${i}`} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

async function applyCompact(
  nodeId: string,
  contextId: string,
  proposed: ProposedNode[],
  originalNodeIds: Set<string>,
) {
  // Strategy: delete the entire subtree's children, then rebuild from proposed
  // This is simpler and more reliable than individual move/edit/delete ops

  // 1. Collect all original child node ids (not the root itself)
  const childIdsToDelete: string[] = [];
  function collectChildIds(tree: import("../lib/types").TreeData) {
    for (const child of tree.children) {
      childIdsToDelete.push(child.node.id);
      collectChildIds(child);
    }
  }

  // Get fresh tree
  const freshTree = await ipc.getTree(contextId);
  if (!freshTree) return;

  const targetNode = findInTree(freshTree, nodeId);
  if (!targetNode) return;
  collectChildIds(targetNode);

  // 2. Delete all children (leaf-first to avoid FK issues)
  for (const id of childIdsToDelete.reverse()) {
    await ipc.deleteNode(id);
  }

  // 3. Update root node title if proposed changes it
  if (proposed.length > 0 && proposed[0].source_id === nodeId && proposed[0].title !== targetNode.node.title) {
    await ipc.updateNode(nodeId, { title: proposed[0].title });
  }

  // 4. Recursively create proposed children
  async function createChildren(parentId: string, children: ProposedNode[]) {
    for (const child of children) {
      // If source_id matches root, skip (already handled)
      if (child.source_id === nodeId) continue;

      const node = await ipc.createNode(contextId, parentId, child.node_type, child.title);
      if (child.children.length > 0) {
        await createChildren(node.id, child.children);
      }
    }
  }

  // The proposed array represents the root's children (or the root + children)
  // If proposed[0].source_id === nodeId, its children are the new subtree
  if (proposed.length === 1 && proposed[0].source_id === nodeId) {
    await createChildren(nodeId, proposed[0].children);
  } else {
    await createChildren(nodeId, proposed);
  }
}

function findInTree(tree: import("../lib/types").TreeData, id: string): import("../lib/types").TreeData | null {
  if (tree.node.id === id) return tree;
  for (const child of tree.children) {
    const found = findInTree(child, id);
    if (found) return found;
  }
  return null;
}

export function CompactPreview() {
  const { compactPreviewOpen, compactResult, closeCompactPreview, compactLoading } = useUIStore();
  const { loadTree } = useTreeStore();
  const { currentContextId } = useContextStore();

  const diff: DiffResult | null = useMemo(() => {
    if (!compactResult) return null;
    return computeDiff(compactResult.original, compactResult.proposed);
  }, [compactResult]);

  if (!compactPreviewOpen || !compactResult || !diff) return null;

  const handleApply = async () => {
    if (!currentContextId) return;
    const originalIds = new Set<string>();
    function collect(tree: import("../lib/types").TreeData) {
      originalIds.add(tree.node.id);
      tree.children.forEach(collect);
    }
    collect(compactResult.original);

    await applyCompact(
      compactResult.original.node.id,
      currentContextId,
      compactResult.proposed,
      originalIds,
    );
    await loadTree(currentContextId);
    closeCompactPreview();
  };

  const { stats } = diff;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={closeCompactPreview}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") closeCompactPreview();
        if (e.key === "Enter") handleApply();
      }}
    >
      <div className="absolute inset-0 bg-[var(--color-overlay)]" />
      <div
        className="relative w-[560px] max-h-[70vh] bg-bg-elevated rounded-2xl flex flex-col overflow-hidden"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)", border: "1px solid var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 bg-bg-card shrink-0">
          <span className="text-[13px] font-mono font-bold text-text-primary">AI Compact</span>
          <button
            className="text-text-secondary hover:text-text-primary cursor-pointer text-sm"
            onClick={closeCompactPreview}
          >
            ✕
          </button>
        </div>

        {/* Diff tree */}
        <div className="flex-1 overflow-auto py-2">
          {diff.nodes.map((node, i) => (
            <DiffNodeRow key={`${node.sourceId || node.title}-${i}`} node={node} depth={0} />
          ))}
          {diff.deleted.length > 0 && (
            <>
              <div className="h-px bg-border mx-3 my-2" />
              <div className="px-3 py-1">
                <span className="text-[10px] font-mono text-text-secondary tracking-[2px]">DELETED</span>
              </div>
              {diff.deleted.map((node, i) => (
                <DiffNodeRow key={`del-${node.sourceId}-${i}`} node={node} depth={0} />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 h-14 bg-bg-card shrink-0">
          <div className="flex items-center gap-3 text-[11px] font-mono">
            {stats.added > 0 && <span className="text-[#4ADE80]">+{stats.added}</span>}
            {stats.deleted > 0 && <span className="text-[#FF4444]">-{stats.deleted}</span>}
            {stats.edited > 0 && <span className="text-[#FFD54F]">~{stats.edited}</span>}
            {stats.moved > 0 && <span className="text-[#FFD54F]">↻{stats.moved}</span>}
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-1.5 rounded-md text-[12px] font-mono text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)] cursor-pointer transition-colors"
              onClick={closeCompactPreview}
            >
              Cancel
            </button>
            <button
              className="px-4 py-1.5 rounded-md text-[12px] font-mono font-bold text-white bg-accent-primary cursor-pointer"
              onClick={handleApply}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Render in App.tsx**

Import and add `<CompactPreview />` alongside other modals.

**Step 3: Verify**

Run: `pnpm build`
Expected: compiles.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(ai): CompactPreview component with diff visualization"
```

---

### Task 7: Frontend — Integration (ContextMenu + useKeyboard + Loading)

**Files:**
- Modify: `src/components/ContextMenu.tsx` (add "AI Compact" menu item)
- Modify: `src/hooks/useKeyboard.ts` (add `c` shortcut)
- Modify: `src/components/StatusBar.tsx` (show loading indicator)

**Step 1: Add triggerCompact helper**

Add a shared function in `src/lib/compact.ts`:

```typescript
import { ipc } from "./ipc";
import { useUIStore } from "../stores/uiStore";

export async function triggerCompact(nodeId: string, contextId: string) {
  const { setCompactLoading, setCompactResult } = useUIStore.getState();
  setCompactLoading(true);
  try {
    const result = await ipc.compactNode(nodeId, contextId);
    setCompactResult(result);
  } catch (err) {
    console.error("Compact failed:", err);
    // Could show error toast in future
    setCompactResult(null);
  } finally {
    setCompactLoading(false);
  }
}
```

**Step 2: Add to ContextMenu.tsx**

Add a new menu item after "Collapse/Expand" in the `items` array:

```typescript
    {
      label: "AI Compact",
      shortcut: "C",
      icon: "✨",
      action: () => exec(() => {
        if (currentContextId) {
          triggerCompact(contextMenuNodeId, currentContextId);
        }
      }),
    },
```

Import `triggerCompact` from `"../lib/compact"`.

**Step 3: Add `c` shortcut to useKeyboard.ts**

Add a new case in the `switch (e.key)` block, after the `z` case:

```typescript
        case "c": {
          e.preventDefault();
          if (selectedNodeId && currentContextId) {
            triggerCompact(selectedNodeId, currentContextId);
          }
          break;
        }
```

Import `triggerCompact` from `"../lib/compact"`.

**Step 4: Add loading indicator to StatusBar.tsx**

Show a small spinner/text when `compactLoading` is true:

```tsx
const { compactLoading } = useUIStore();
// ... in JSX, before the context name:
{compactLoading && (
  <span className="text-[10px] text-accent-primary font-mono animate-pulse">AI...</span>
)}
```

**Step 5: Verify**

Run: `pnpm tauri dev`
Test: Configure AI settings (provider + key), select a node with children, press `c` or right-click > AI Compact. Verify the LLM call works and the preview modal appears.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(ai): wire compact into ContextMenu, keyboard shortcut, and loading UI"
```

---

### Task 8: Final Polish + Undo Support

**Files:**
- Modify: `src/components/CompactPreview.tsx` (add undo support to apply)
- Modify: `src/stores/treeStore.ts` (if needed for undo)

**Step 1: Add undo support to applyCompact**

Before calling `applyCompact`, snapshot the original subtree nodes using `flattenNodes` pattern from `treeStore.ts`. After apply, push an undo entry of type `"delete"` (restore original nodes = undo).

In `CompactPreview.tsx`, update `handleApply`:

```typescript
  const handleApply = async () => {
    if (!currentContextId) return;

    // Snapshot for undo
    const { undoStack, selectedNodeId } = useTreeStore.getState();
    const nodes = flattenNodes(compactResult.original);
    useTreeStore.setState({
      undoStack: [...undoStack, { type: "delete" as const, nodes, contextId: currentContextId, prevSelectedId: selectedNodeId }],
    });

    // Apply changes
    await applyCompact(/* ... */);
    await loadTree(currentContextId);
    closeCompactPreview();
  };
```

Import `flattenNodes` from the treeStore (export it if not already exported).

**Step 2: Verify end-to-end**

Run: `pnpm tauri dev`
Test full flow:
1. Open AI Settings, configure Anthropic + API key
2. Create a context with 5-10 nodes
3. Select root node, press `c`
4. Wait for LLM response
5. Review diff preview (color coding)
6. Click Apply
7. Verify tree is updated
8. Press `⌘Z` to undo
9. Verify tree is restored

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(ai): compact undo support and end-to-end polish"
```
