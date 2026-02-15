# Mind Flow MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first runnable MVP — Focus Mode with horizontal tree, node CRUD, Quick Switcher, and SQLite persistence.

**Architecture:** Tauri 2.x desktop app. Rust backend handles SQLite persistence + file system. React 19 frontend renders horizontal XMind-style tree with card nodes. Zustand for state, Tailwind + CSS variables for styling.

**Tech Stack:** Tauri 2.x, Rust, rusqlite, React 19, TypeScript, Vite, Zustand, Tailwind CSS v4

**MVP Scope (what's IN):**
- Focus Mode with horizontal tree rendering (card-style nodes)
- 4 node types: [T] Text, [M] Markdown, [I] Image, [F] File
- Node CRUD: add child, add sibling, delete, inline edit title
- Keyboard navigation (arrows, Enter, Tab, Shift+Tab, Delete)
- Quick Switcher (⌘K) — create/switch/archive contexts
- SQLite persistence (contexts + tree_nodes)
- StatusBar with context info

**MVP Scope (what's OUT):**
- Markdown editor (Tiptap)
- Context Manager full panel
- Common Knowledge / Graph View
- Insights
- Drag & drop
- Image thumbnails
- File node open external

---

## Task 1: Scaffold Tauri + React Project

**Files:**
- Create: entire project structure via `pnpm create tauri-app`
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`

**Step 1: Create Tauri project**

```bash
cd /Users/lemo/code/lemo/repo/mind_flow
pnpm create tauri-app@latest . --template react-ts --manager pnpm --yes
```

If interactive prompts block, manually scaffold:
- `pnpm create vite . --template react-ts`
- `pnpm add -D @tauri-apps/cli@latest`
- `pnpm tauri init`

**Step 2: Install frontend dependencies**

```bash
pnpm add zustand @tauri-apps/api@latest
pnpm add -D tailwindcss@4 @tailwindcss/vite
```

**Step 3: Configure Tailwind v4**

Add to `vite.config.ts`:
```typescript
import tailwindcss from "@tailwindcss/vite";
// add tailwindcss() to plugins array
```

Replace `src/index.css` with:
```css
@import "tailwindcss";
```

**Step 4: Configure Tauri backend deps**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:
```toml
rusqlite = { version = "0.31", features = ["bundled"] }
uuid = { version = "1", features = ["v4"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
chrono = { version = "0.4", features = ["serde"] }
dirs = "5"
```

**Step 5: Update tauri.conf.json**

Set window config:
```json
{
  "app": {
    "windows": [
      {
        "title": "Mind Flow",
        "width": 1440,
        "height": 900,
        "minWidth": 800,
        "minHeight": 600,
        "decorations": true,
        "resizable": true
      }
    ]
  }
}
```

**Step 6: Verify build**

```bash
pnpm tauri dev
```

Expected: Window opens with Vite React default page.

**Step 7: Commit**
```bash
git init && git add -A && git commit -m "feat: scaffold Tauri + React + TypeScript project"
```

---

## Task 2: Design Tokens + Base Layout

**Files:**
- Create: `src/index.css` (replace default)
- Create: `src/App.tsx` (replace default)
- Delete: default Vite boilerplate (`src/App.css`, logo files)

**Step 1: Write design tokens CSS**

`src/index.css`:
```css
@import "tailwindcss";

@theme {
  --color-bg-page: #1A1A1A;
  --color-bg-card: #212121;
  --color-bg-elevated: #2D2D2D;
  --color-accent-primary: #FF6B35;
  --color-accent-success: #00D4AA;
  --color-text-primary: #FFFFFF;
  --color-text-secondary: #777777;

  --color-node-text: #4FC3F7;
  --color-node-markdown: #00D4AA;
  --color-node-image: #FFD54F;
  --color-node-file: #CE93D8;

  --font-heading: 'Oswald', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

@layer base {
  body {
    margin: 0;
    background: var(--color-bg-page);
    color: var(--color-text-primary);
    font-family: var(--font-mono);
    overflow: hidden;
    user-select: none;
  }
}
```

**Step 2: Add Google Fonts to index.html**

Add to `<head>` in `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Oswald:wght@700&display=swap" rel="stylesheet">
```

**Step 3: Write App shell**

`src/App.tsx`:
```tsx
import { StatusBar } from "./components/StatusBar";
import { TreeCanvas } from "./components/TreeCanvas";
import { QuickSwitcher } from "./components/QuickSwitcher";

export default function App() {
  return (
    <div className="flex flex-col h-screen w-screen bg-bg-page">
      <StatusBar />
      <main className="flex-1 overflow-auto">
        <TreeCanvas />
      </main>
      <QuickSwitcher />
    </div>
  );
}
```

**Step 4: Create placeholder components**

`src/components/StatusBar.tsx` — empty div
`src/components/TreeCanvas.tsx` — empty div
`src/components/QuickSwitcher.tsx` — empty div

**Step 5: Clean up Vite defaults**

Delete: `src/App.css`, `src/assets/react.svg`, `public/vite.svg`

**Step 6: Verify**

```bash
pnpm tauri dev
```

Expected: Dark window (#1A1A1A background), no content.

**Step 7: Commit**
```bash
git add -A && git commit -m "feat: design tokens, base layout, placeholder components"
```

---

## Task 3: Backend — SQLite Schema + DB Init

**Files:**
- Create: `src-tauri/src/db.rs`
- Create: `src-tauri/src/error.rs`
- Create: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Write error types**

`src-tauri/src/error.rs`:
```rust
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum MindFlowError {
    #[error("Context not found: {0}")]
    ContextNotFound(String),
    #[error("Node not found: {0}")]
    NodeNotFound(String),
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
}

impl Serialize for MindFlowError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_str(&self.to_string())
    }
}
```

**Step 2: Write data models**

`src-tauri/src/models.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Context {
    pub id: String,
    pub name: String,
    pub state: String,       // "active" | "archived" | "vault"
    pub tags: Vec<String>,
    pub root_node_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_accessed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSummary {
    pub id: String,
    pub name: String,
    pub state: String,
    pub tags: Vec<String>,
    pub node_count: i64,
    pub last_accessed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeNode {
    pub id: String,
    pub context_id: String,
    pub parent_id: Option<String>,
    pub position: i32,
    pub node_type: String,   // "text" | "markdown" | "image" | "file"
    pub title: String,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeData {
    pub node: TreeNode,
    pub children: Vec<TreeData>,
}
```

**Step 3: Write DB init + schema**

`src-tauri/src/db.rs`:
```rust
use rusqlite::Connection;
use std::path::PathBuf;
use crate::error::MindFlowError;

pub fn get_db_path() -> PathBuf {
    let base = dirs::home_dir().unwrap().join("MindFlow").join("data");
    std::fs::create_dir_all(&base).ok();
    base.join("mindflow.db")
}

pub fn init_db(conn: &Connection) -> Result<(), MindFlowError> {
    conn.execute_batch("
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS contexts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'active'
                CHECK (state IN ('active', 'archived', 'vault')),
            tags TEXT NOT NULL DEFAULT '[]',
            root_node_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tree_nodes (
            id TEXT PRIMARY KEY,
            context_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
            parent_id TEXT REFERENCES tree_nodes(id) ON DELETE SET NULL,
            position INTEGER NOT NULL DEFAULT 0,
            node_type TEXT NOT NULL DEFAULT 'text'
                CHECK (node_type IN ('text', 'markdown', 'image', 'file')),
            title TEXT NOT NULL DEFAULT '',
            content TEXT,
            file_path TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_nodes_context ON tree_nodes(context_id);
        CREATE INDEX IF NOT EXISTS idx_nodes_parent ON tree_nodes(parent_id);
    ")?;
    Ok(())
}
```

**Step 4: Wire up main.rs**

`src-tauri/src/main.rs`:
```rust
mod db;
mod error;
mod models;
mod commands;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
}

fn main() {
    let db_path = db::get_db_path();
    let conn = Connection::open(&db_path).expect("Failed to open database");
    db::init_db(&conn).expect("Failed to init database");

    tauri::Builder::default()
        .manage(AppState { db: Mutex::new(conn) })
        .invoke_handler(tauri::generate_handler![
            commands::context::create_context,
            commands::context::list_contexts,
            commands::context::switch_context,
            commands::context::archive_context,
            commands::context::activate_context,
            commands::context::delete_context,
            commands::node::get_tree,
            commands::node::create_node,
            commands::node::update_node,
            commands::node::delete_node,
            commands::node::move_node,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 5: Create empty commands module**

`src-tauri/src/commands/mod.rs`:
```rust
pub mod context;
pub mod node;
```

Create placeholder `src-tauri/src/commands/context.rs` and `src-tauri/src/commands/node.rs` with empty command stubs that return `Ok(())` or empty vecs so it compiles.

**Step 6: Verify**

```bash
pnpm tauri dev
```

Expected: Compiles, window opens, `~/MindFlow/data/mindflow.db` created with tables.

**Step 7: Commit**
```bash
git add -A && git commit -m "feat: SQLite schema, data models, DB init"
```

---

## Task 4: Backend — Context CRUD Commands

**Files:**
- Modify: `src-tauri/src/commands/context.rs`

**Step 1: Implement all context commands**

`src-tauri/src/commands/context.rs`:
```rust
use tauri::State;
use crate::AppState;
use crate::error::MindFlowError;
use crate::models::{Context, ContextSummary};

#[tauri::command]
pub fn create_context(
    state: State<'_, AppState>,
    name: String,
    tags: Vec<String>,
) -> Result<Context, MindFlowError> {
    let db = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let root_id = uuid::Uuid::new_v4().to_string();
    let tags_json = serde_json::to_string(&tags).unwrap();

    db.execute(
        "INSERT INTO contexts (id, name, tags, root_node_id) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, name, tags_json, root_id],
    )?;

    // Create root node
    db.execute(
        "INSERT INTO tree_nodes (id, context_id, node_type, title) VALUES (?1, ?2, 'text', ?3)",
        rusqlite::params![root_id, id, name],
    )?;

    let ctx = db.query_row(
        "SELECT id, name, state, tags, root_node_id, created_at, updated_at, last_accessed_at FROM contexts WHERE id = ?1",
        [&id],
        |row| Ok(Context {
            id: row.get(0)?,
            name: row.get(1)?,
            state: row.get(2)?,
            tags: serde_json::from_str::<Vec<String>>(&row.get::<_, String>(3)?).unwrap_or_default(),
            root_node_id: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
            last_accessed_at: row.get(7)?,
        }),
    )?;
    Ok(ctx)
}

#[tauri::command]
pub fn list_contexts(state: State<'_, AppState>) -> Result<Vec<ContextSummary>, MindFlowError> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT c.id, c.name, c.state, c.tags, c.last_accessed_at,
                (SELECT COUNT(*) FROM tree_nodes WHERE context_id = c.id) as node_count
         FROM contexts c
         ORDER BY
            CASE c.state WHEN 'active' THEN 0 WHEN 'archived' THEN 1 ELSE 2 END,
            c.last_accessed_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ContextSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            state: row.get(2)?,
            tags: serde_json::from_str::<Vec<String>>(&row.get::<_, String>(3)?).unwrap_or_default(),
            last_accessed_at: row.get(4)?,
            node_count: row.get(5)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn switch_context(state: State<'_, AppState>, id: String) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();
    let changed = db.execute(
        "UPDATE contexts SET last_accessed_at = datetime('now'), state = CASE WHEN state != 'active' THEN 'active' ELSE state END WHERE id = ?1",
        [&id],
    )?;
    if changed == 0 { return Err(MindFlowError::ContextNotFound(id)); }
    Ok(())
}

#[tauri::command]
pub fn archive_context(state: State<'_, AppState>, id: String) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();
    db.execute("UPDATE contexts SET state = 'archived', updated_at = datetime('now') WHERE id = ?1", [&id])?;
    Ok(())
}

#[tauri::command]
pub fn activate_context(state: State<'_, AppState>, id: String) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();
    db.execute(
        "UPDATE contexts SET state = 'active', last_accessed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        [&id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_context(state: State<'_, AppState>, id: String) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM contexts WHERE id = ?1", [&id])?;
    Ok(())
}
```

**Step 2: Verify compilation**

```bash
cd src-tauri && cargo check
```

**Step 3: Commit**
```bash
git add -A && git commit -m "feat: context CRUD commands"
```

---

## Task 5: Backend — Node CRUD + Tree Query

**Files:**
- Modify: `src-tauri/src/commands/node.rs`

**Step 1: Implement node commands**

`src-tauri/src/commands/node.rs`:
```rust
use tauri::State;
use crate::AppState;
use crate::error::MindFlowError;
use crate::models::{TreeNode, TreeData};

fn row_to_node(row: &rusqlite::Row) -> rusqlite::Result<TreeNode> {
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
}

fn build_tree(db: &rusqlite::Connection, context_id: &str, parent_id: Option<&str>) -> Result<Vec<TreeData>, MindFlowError> {
    let mut stmt = db.prepare(
        "SELECT id, context_id, parent_id, position, node_type, title, content, file_path, created_at, updated_at
         FROM tree_nodes WHERE context_id = ?1 AND parent_id IS ?2
         ORDER BY position"
    )?;
    let nodes = stmt.query_map(rusqlite::params![context_id, parent_id], row_to_node)?
        .collect::<Result<Vec<_>, _>>()?;

    let mut result = Vec::new();
    for node in nodes {
        let node_id = node.id.clone();
        let children = build_tree(db, context_id, Some(&node_id))?;
        result.push(TreeData { node, children });
    }
    Ok(result)
}

#[tauri::command]
pub fn get_tree(state: State<'_, AppState>, context_id: String) -> Result<Option<TreeData>, MindFlowError> {
    let db = state.db.lock().unwrap();

    // Find root node
    let root_node_id: Option<String> = db.query_row(
        "SELECT root_node_id FROM contexts WHERE id = ?1",
        [&context_id],
        |row| row.get(0),
    ).ok();

    let Some(root_id) = root_node_id else { return Ok(None); };

    let root = db.query_row(
        "SELECT id, context_id, parent_id, position, node_type, title, content, file_path, created_at, updated_at
         FROM tree_nodes WHERE id = ?1",
        [&root_id],
        row_to_node,
    )?;

    let children = build_tree(&db, &context_id, Some(&root_id))?;
    Ok(Some(TreeData { node: root, children }))
}

#[tauri::command]
pub fn create_node(
    state: State<'_, AppState>,
    context_id: String,
    parent_id: String,
    node_type: String,
    title: String,
) -> Result<TreeNode, MindFlowError> {
    let db = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();

    // Get max position among siblings
    let max_pos: i32 = db.query_row(
        "SELECT COALESCE(MAX(position), -1) FROM tree_nodes WHERE context_id = ?1 AND parent_id = ?2",
        rusqlite::params![context_id, parent_id],
        |row| row.get(0),
    ).unwrap_or(-1);

    db.execute(
        "INSERT INTO tree_nodes (id, context_id, parent_id, position, node_type, title)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, context_id, parent_id, max_pos + 1, node_type, title],
    )?;

    // Touch context
    db.execute("UPDATE contexts SET updated_at = datetime('now'), last_accessed_at = datetime('now') WHERE id = ?1", [&context_id])?;

    let node = db.query_row(
        "SELECT id, context_id, parent_id, position, node_type, title, content, file_path, created_at, updated_at
         FROM tree_nodes WHERE id = ?1",
        [&id],
        row_to_node,
    )?;
    Ok(node)
}

#[tauri::command]
pub fn update_node(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
    content: Option<String>,
    node_type: Option<String>,
) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();
    if let Some(t) = title {
        db.execute("UPDATE tree_nodes SET title = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![t, id])?;
    }
    if let Some(c) = content {
        db.execute("UPDATE tree_nodes SET content = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![c, id])?;
    }
    if let Some(nt) = node_type {
        db.execute("UPDATE tree_nodes SET node_type = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![nt, id])?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_node(state: State<'_, AppState>, id: String) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();
    // Cascade: SQLite ON DELETE SET NULL handles children's parent_id,
    // but we want to actually delete the whole subtree.
    fn delete_recursive(db: &rusqlite::Connection, node_id: &str) -> Result<(), MindFlowError> {
        let children: Vec<String> = {
            let mut stmt = db.prepare("SELECT id FROM tree_nodes WHERE parent_id = ?1")?;
            stmt.query_map([node_id], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?
        };
        for child_id in children {
            delete_recursive(db, &child_id)?;
        }
        db.execute("DELETE FROM tree_nodes WHERE id = ?1", [node_id])?;
        Ok(())
    }
    delete_recursive(&db, &id)?;
    Ok(())
}

#[tauri::command]
pub fn move_node(
    state: State<'_, AppState>,
    id: String,
    new_parent_id: String,
    position: i32,
) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();
    // Shift existing siblings at target
    db.execute(
        "UPDATE tree_nodes SET position = position + 1 WHERE parent_id = ?1 AND position >= ?2",
        rusqlite::params![new_parent_id, position],
    )?;
    db.execute(
        "UPDATE tree_nodes SET parent_id = ?1, position = ?2, updated_at = datetime('now') WHERE id = ?3",
        rusqlite::params![new_parent_id, position, id],
    )?;
    Ok(())
}
```

**Step 2: Verify**

```bash
cd src-tauri && cargo check
```

**Step 3: Commit**
```bash
git add -A && git commit -m "feat: node CRUD + recursive tree query"
```

---

## Task 6: Frontend — TypeScript Types + IPC Wrappers

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/ipc.ts`

**Step 1: Shared types**

`src/lib/types.ts`:
```typescript
export type NodeType = "text" | "markdown" | "image" | "file";
export type ContextState = "active" | "archived" | "vault";

export interface Context {
  id: string;
  name: string;
  state: ContextState;
  tags: string[];
  root_node_id: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
}

export interface ContextSummary {
  id: string;
  name: string;
  state: ContextState;
  tags: string[];
  node_count: number;
  last_accessed_at: string;
}

export interface TreeNode {
  id: string;
  context_id: string;
  parent_id: string | null;
  position: number;
  node_type: NodeType;
  title: string;
  content: string | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreeData {
  node: TreeNode;
  children: TreeData[];
}

export const NODE_TYPE_CONFIG: Record<NodeType, { letter: string; color: string }> = {
  text:     { letter: "T", color: "var(--color-node-text)" },
  markdown: { letter: "M", color: "var(--color-node-markdown)" },
  image:    { letter: "I", color: "var(--color-node-image)" },
  file:     { letter: "F", color: "var(--color-node-file)" },
};
```

**Step 2: IPC wrappers**

`src/lib/ipc.ts`:
```typescript
import { invoke } from "@tauri-apps/api/core";
import type { Context, ContextSummary, TreeData, TreeNode } from "./types";

export const ipc = {
  createContext: (name: string, tags: string[] = []) =>
    invoke<Context>("create_context", { name, tags }),

  listContexts: () =>
    invoke<ContextSummary[]>("list_contexts"),

  switchContext: (id: string) =>
    invoke<void>("switch_context", { id }),

  archiveContext: (id: string) =>
    invoke<void>("archive_context", { id }),

  activateContext: (id: string) =>
    invoke<void>("activate_context", { id }),

  deleteContext: (id: string) =>
    invoke<void>("delete_context", { id }),

  getTree: (contextId: string) =>
    invoke<TreeData | null>("get_tree", { contextId }),

  createNode: (contextId: string, parentId: string, nodeType: string, title: string) =>
    invoke<TreeNode>("create_node", { contextId, parentId, nodeType, title }),

  updateNode: (id: string, updates: { title?: string; content?: string; nodeType?: string }) =>
    invoke<void>("update_node", { id, ...updates }),

  deleteNode: (id: string) =>
    invoke<void>("delete_node", { id }),

  moveNode: (id: string, newParentId: string, position: number) =>
    invoke<void>("move_node", { id, newParentId, position }),
};
```

**Step 3: Commit**
```bash
git add -A && git commit -m "feat: TypeScript types + IPC wrappers"
```

---

## Task 7: Frontend — Zustand Stores

**Files:**
- Create: `src/stores/contextStore.ts`
- Create: `src/stores/treeStore.ts`
- Create: `src/stores/uiStore.ts`

**Step 1: Context store**

`src/stores/contextStore.ts`:
```typescript
import { create } from "zustand";
import type { ContextSummary } from "../lib/types";
import { ipc } from "../lib/ipc";

interface ContextStore {
  contexts: ContextSummary[];
  currentContextId: string | null;
  loading: boolean;

  loadContexts: () => Promise<void>;
  createContext: (name: string) => Promise<void>;
  switchContext: (id: string) => Promise<void>;
  archiveContext: (id: string) => Promise<void>;
  deleteContext: (id: string) => Promise<void>;
}

export const useContextStore = create<ContextStore>((set, get) => ({
  contexts: [],
  currentContextId: null,
  loading: false,

  loadContexts: async () => {
    const contexts = await ipc.listContexts();
    set({ contexts });
  },

  createContext: async (name: string) => {
    const ctx = await ipc.createContext(name);
    await get().loadContexts();
    await get().switchContext(ctx.id);
  },

  switchContext: async (id: string) => {
    await ipc.switchContext(id);
    set({ currentContextId: id });
    await get().loadContexts();
  },

  archiveContext: async (id: string) => {
    await ipc.archiveContext(id);
    const { currentContextId } = get();
    if (currentContextId === id) {
      // Switch to next active context
      const contexts = await ipc.listContexts();
      const next = contexts.find(c => c.state === "active" && c.id !== id);
      set({ currentContextId: next?.id ?? null, contexts });
    } else {
      await get().loadContexts();
    }
  },

  deleteContext: async (id: string) => {
    await ipc.deleteContext(id);
    const { currentContextId } = get();
    if (currentContextId === id) {
      set({ currentContextId: null });
    }
    await get().loadContexts();
  },
}));
```

**Step 2: Tree store**

`src/stores/treeStore.ts`:
```typescript
import { create } from "zustand";
import type { TreeData } from "../lib/types";
import { ipc } from "../lib/ipc";

interface TreeStore {
  tree: TreeData | null;
  selectedNodeId: string | null;

  loadTree: (contextId: string) => Promise<void>;
  selectNode: (id: string | null) => void;
  addChild: (parentId: string, contextId: string) => Promise<void>;
  addSibling: (nodeId: string, contextId: string) => Promise<void>;
  deleteNode: (nodeId: string, contextId: string) => Promise<void>;
  updateNodeTitle: (nodeId: string, title: string) => Promise<void>;
}

// Helper: find a node's parent in the tree
function findParent(tree: TreeData, targetId: string): TreeData | null {
  for (const child of tree.children) {
    if (child.node.id === targetId) return tree;
    const found = findParent(child, targetId);
    if (found) return found;
  }
  return null;
}

export const useTreeStore = create<TreeStore>((set, get) => ({
  tree: null,
  selectedNodeId: null,

  loadTree: async (contextId: string) => {
    const tree = await ipc.getTree(contextId);
    set({ tree });
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  addChild: async (parentId, contextId) => {
    const node = await ipc.createNode(contextId, parentId, "text", "");
    await get().loadTree(contextId);
    set({ selectedNodeId: node.id });
  },

  addSibling: async (nodeId, contextId) => {
    const { tree } = get();
    if (!tree) return;
    const parent = findParent(tree, nodeId);
    if (!parent) return;
    const node = await ipc.createNode(contextId, parent.node.id, "text", "");
    await get().loadTree(contextId);
    set({ selectedNodeId: node.id });
  },

  deleteNode: async (nodeId, contextId) => {
    const { tree } = get();
    if (!tree || tree.node.id === nodeId) return; // Don't delete root
    await ipc.deleteNode(nodeId);
    await get().loadTree(contextId);
    set({ selectedNodeId: null });
  },

  updateNodeTitle: async (nodeId, title) => {
    await ipc.updateNode(nodeId, { title });
  },
}));
```

**Step 3: UI store**

`src/stores/uiStore.ts`:
```typescript
import { create } from "zustand";

interface UIStore {
  quickSwitcherOpen: boolean;
  editingNodeId: string | null;

  toggleQuickSwitcher: () => void;
  openQuickSwitcher: () => void;
  closeQuickSwitcher: () => void;
  setEditingNode: (id: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  quickSwitcherOpen: false,
  editingNodeId: null,

  toggleQuickSwitcher: () => set((s) => ({ quickSwitcherOpen: !s.quickSwitcherOpen })),
  openQuickSwitcher: () => set({ quickSwitcherOpen: true }),
  closeQuickSwitcher: () => set({ quickSwitcherOpen: false }),
  setEditingNode: (id) => set({ editingNodeId: id }),
}));
```

**Step 4: Commit**
```bash
git add -A && git commit -m "feat: Zustand stores — context, tree, UI"
```

---

## Task 8: Frontend — StatusBar Component

**Files:**
- Modify: `src/components/StatusBar.tsx`

**Step 1: Implement StatusBar**

`src/components/StatusBar.tsx`:
```tsx
import { useContextStore } from "../stores/contextStore";
import { useUIStore } from "../stores/uiStore";

export function StatusBar() {
  const { contexts, currentContextId } = useContextStore();
  const { openQuickSwitcher } = useUIStore();

  const current = contexts.find((c) => c.id === currentContextId);
  const activeCount = contexts.filter((c) => c.state === "active").length;

  return (
    <div className="flex items-center justify-between h-11 px-5 bg-bg-card shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="font-heading text-sm font-bold text-text-primary">
          {current?.name ?? "No Context"}
        </span>
        <span className="text-xs text-text-secondary">
          {activeCount} active
        </span>
      </div>
      <button
        onClick={openQuickSwitcher}
        className="px-2 py-1 text-xs text-text-secondary bg-bg-elevated rounded cursor-pointer hover:bg-bg-card"
      >
        ⌘K
      </button>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add -A && git commit -m "feat: StatusBar component"
```

---

## Task 9: Frontend — TreeCanvas + NodeCard (Horizontal Tree)

This is the core visual component. Renders the XMind-style horizontal tree.

**Files:**
- Modify: `src/components/TreeCanvas.tsx`
- Create: `src/components/NodeCard.tsx`

**Step 1: NodeCard component**

`src/components/NodeCard.tsx`:
```tsx
import { useRef, useEffect, useState } from "react";
import type { TreeNode, NodeType } from "../lib/types";
import { NODE_TYPE_CONFIG } from "../lib/types";
import { useTreeStore } from "../stores/treeStore";
import { useUIStore } from "../stores/uiStore";

interface Props {
  node: TreeNode;
  isRoot?: boolean;
  isSelected?: boolean;
  onClick: () => void;
}

export function NodeCard({ node, isRoot, isSelected, onClick }: Props) {
  const { letter, color } = NODE_TYPE_CONFIG[node.node_type as NodeType];
  const { updateNodeTitle } = useTreeStore();
  const { editingNodeId, setEditingNode } = useUIStore();
  const isEditing = editingNodeId === node.id;
  const inputRef = useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = useState(node.title);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitEdit = () => {
    if (editValue.trim() !== node.title) {
      updateNodeTitle(node.id, editValue.trim() || node.title);
    }
    setEditingNode(null);
  };

  if (isRoot) {
    return (
      <div
        className={`cursor-pointer px-1 py-0.5 rounded ${isSelected ? "ring-1 ring-accent-primary" : ""}`}
        onClick={onClick}
        onDoubleClick={() => setEditingNode(node.id)}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingNode(null); }}
            className="bg-transparent font-heading text-[28px] font-bold text-text-primary outline-none border-b border-accent-primary"
          />
        ) : (
          <span className="font-heading text-[28px] font-bold text-text-primary">
            {node.title || "Untitled"}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-md bg-bg-card px-3 py-2 cursor-pointer whitespace-nowrap
        ${isSelected ? "ring-1 ring-accent-primary" : "hover:ring-1 hover:ring-white/10"}`}
      onClick={onClick}
      onDoubleClick={() => setEditingNode(node.id)}
    >
      <div
        className="flex items-center justify-center w-5 h-5 rounded bg-bg-elevated shrink-0"
      >
        <span className="text-[10px] font-bold font-mono" style={{ color }}>
          {letter}
        </span>
      </div>
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingNode(null); }}
          className="bg-transparent text-[13px] text-text-primary outline-none border-b border-accent-primary min-w-[60px]"
        />
      ) : (
        <span className="text-[13px] text-text-primary">
          {node.title || "Untitled"}
        </span>
      )}
    </div>
  );
}
```

**Step 2: TreeCanvas — recursive horizontal tree**

`src/components/TreeCanvas.tsx`:
```tsx
import { useEffect } from "react";
import type { TreeData } from "../lib/types";
import { useContextStore } from "../stores/contextStore";
import { useTreeStore } from "../stores/treeStore";
import { NodeCard } from "./NodeCard";

function TreeBranch({ data, isRoot }: { data: TreeData; isRoot?: boolean }) {
  const { selectedNodeId, selectNode } = useTreeStore();
  const hasChildren = data.children.length > 0;

  return (
    <div className="flex items-start">
      {/* Node + outgoing connector */}
      <div className="flex items-center shrink-0">
        <NodeCard
          node={data.node}
          isRoot={isRoot}
          isSelected={selectedNodeId === data.node.id}
          onClick={() => selectNode(data.node.id)}
        />
        {hasChildren && (
          <div
            className="bg-text-secondary shrink-0"
            style={{ width: isRoot ? 40 : 30, height: 1 }}
          />
        )}
      </div>

      {/* Children column with v-bar */}
      {hasChildren && (
        <div className="flex items-stretch">
          {/* Vertical bar wrapper */}
          <div className="flex items-stretch" style={{ padding: "18px 0" }}>
            <div className="w-px bg-text-secondary" />
          </div>
          {/* Children list */}
          <div className="flex flex-col" style={{ gap: 14 }}>
            {data.children.map((child) => (
              <div key={child.node.id} className="flex items-start">
                {/* Incoming h-line */}
                <div className="bg-text-secondary shrink-0 self-center" style={{ width: 20, height: 1 }} />
                <TreeBranch data={child} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TreeCanvas() {
  const { currentContextId } = useContextStore();
  const { tree, loadTree } = useTreeStore();

  useEffect(() => {
    if (currentContextId) {
      loadTree(currentContextId);
    }
  }, [currentContextId, loadTree]);

  if (!currentContextId) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary text-sm">
        Press ⌘K to create or switch context
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-8 pl-15 overflow-auto h-full">
      <TreeBranch data={tree} isRoot />
    </div>
  );
}
```

**Step 3: Commit**
```bash
git add -A && git commit -m "feat: horizontal tree rendering — TreeCanvas + NodeCard"
```

---

## Task 10: Frontend — Keyboard Navigation

**Files:**
- Create: `src/hooks/useKeyboard.ts`
- Modify: `src/App.tsx` (add hook)

**Step 1: Keyboard hook**

`src/hooks/useKeyboard.ts`:
```typescript
import { useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import type { TreeData } from "../lib/types";

// Flatten tree into ordered list for navigation
function flattenTree(data: TreeData): string[] {
  const ids = [data.node.id];
  for (const child of data.children) {
    ids.push(...flattenTree(child));
  }
  return ids;
}

function findNodeInTree(tree: TreeData, id: string): TreeData | null {
  if (tree.node.id === id) return tree;
  for (const child of tree.children) {
    const found = findNodeInTree(child, id);
    if (found) return found;
  }
  return null;
}

function findParentInTree(tree: TreeData, id: string): TreeData | null {
  for (const child of tree.children) {
    if (child.node.id === id) return tree;
    const found = findParentInTree(child, id);
    if (found) return found;
  }
  return null;
}

export function useKeyboard() {
  const { openQuickSwitcher, quickSwitcherOpen, editingNodeId, setEditingNode } = useUIStore();
  const { tree, selectedNodeId, selectNode, addChild, addSibling, deleteNode } = useTreeStore();
  const { currentContextId } = useContextStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K — Quick Switcher
      if (e.metaKey && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        openQuickSwitcher();
        return;
      }

      // Don't handle tree keys when switcher is open or editing
      if (quickSwitcherOpen || editingNodeId) return;
      if (!tree || !currentContextId) return;

      const flat = flattenTree(tree);
      const currentIndex = selectedNodeId ? flat.indexOf(selectedNodeId) : -1;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = currentIndex < flat.length - 1 ? flat[currentIndex + 1] : flat[0];
          selectNode(next);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prev = currentIndex > 0 ? flat[currentIndex - 1] : flat[flat.length - 1];
          selectNode(prev);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const node = findNodeInTree(tree, selectedNodeId);
          if (node && node.children.length > 0) {
            selectNode(node.children[0].node.id);
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (!selectedNodeId) break;
          const parent = findParentInTree(tree, selectedNodeId);
          if (parent) selectNode(parent.node.id);
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (selectedNodeId) setEditingNode(selectedNodeId);
          break;
        }
        case "Tab": {
          e.preventDefault();
          if (!selectedNodeId) break;
          if (e.shiftKey) {
            addSibling(selectedNodeId, currentContextId);
          } else {
            addChild(selectedNodeId, currentContextId);
          }
          break;
        }
        case "Backspace":
        case "Delete": {
          if (!selectedNodeId || selectedNodeId === tree.node.id) break;
          e.preventDefault();
          deleteNode(selectedNodeId, currentContextId);
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tree, selectedNodeId, currentContextId, quickSwitcherOpen, editingNodeId,
      openQuickSwitcher, selectNode, addChild, addSibling, deleteNode, setEditingNode]);
}
```

**Step 2: Wire into App.tsx**

Add to `App.tsx`:
```tsx
import { useKeyboard } from "./hooks/useKeyboard";
// inside App():
useKeyboard();
```

**Step 3: Commit**
```bash
git add -A && git commit -m "feat: keyboard navigation — arrows, Enter, Tab, Delete"
```

---

## Task 11: Frontend — Quick Switcher

**Files:**
- Modify: `src/components/QuickSwitcher.tsx`

**Step 1: Implement QuickSwitcher**

`src/components/QuickSwitcher.tsx`:
```tsx
import { useState, useEffect, useRef, useMemo } from "react";
import { useUIStore } from "../stores/uiStore";
import { useContextStore } from "../stores/contextStore";
import type { ContextSummary } from "../lib/types";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function QuickSwitcher() {
  const { quickSwitcherOpen, closeQuickSwitcher } = useUIStore();
  const { contexts, loadContexts, switchContext, createContext, archiveContext, currentContextId } = useContextStore();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (quickSwitcherOpen) {
      loadContexts();
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [quickSwitcherOpen, loadContexts]);

  const filtered = useMemo(() => {
    if (!search) return contexts;
    const q = search.toLowerCase();
    return contexts.filter((c) => c.name.toLowerCase().includes(q));
  }, [contexts, search]);

  const active = filtered.filter((c) => c.state === "active");
  const archived = filtered.filter((c) => c.state === "archived");
  const allItems: ContextSummary[] = [...active, ...archived];

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  if (!quickSwitcherOpen) return null;

  const handleSelect = async (ctx: ContextSummary) => {
    await switchContext(ctx.id);
    closeQuickSwitcher();
  };

  const handleCreate = async () => {
    const name = search.trim() || "New Context";
    await createContext(name);
    closeQuickSwitcher();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (allItems[selectedIndex]) {
          handleSelect(allItems[selectedIndex]);
        } else {
          handleCreate();
        }
        break;
      case "Escape":
        e.preventDefault();
        closeQuickSwitcher();
        break;
      case "p":
        if (!e.metaKey && !e.ctrlKey && allItems[selectedIndex]?.state === "active") {
          // Only in non-input context — skip if typing in search
          break;
        }
        break;
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[20vh] z-50"
      onClick={closeQuickSwitcher}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Panel */}
      <div
        className="relative w-[480px] bg-bg-elevated rounded-2xl overflow-hidden flex flex-col max-h-[520px]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search */}
        <div className="flex items-center px-4 h-12 bg-bg-card">
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-[13px] text-text-primary placeholder:text-text-secondary outline-none font-mono"
          />
          <span className="text-[10px] text-text-secondary bg-bg-elevated px-2 py-1 rounded">
            ⌘K
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {active.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1.5">
                <span className="text-[10px] font-bold text-text-secondary tracking-[2px] font-mono">
                  ACTIVE
                </span>
              </div>
              {active.map((ctx) => {
                const idx = allItems.indexOf(ctx);
                return (
                  <div
                    key={ctx.id}
                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer
                      ${idx === selectedIndex ? "bg-white/5" : ""}
                      ${ctx.id === currentContextId ? "bg-accent-primary/8" : ""}`}
                    onClick={() => handleSelect(ctx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] ${ctx.id === currentContextId ? "text-accent-primary" : "text-text-secondary"}`}>
                        {ctx.id === currentContextId ? "▸" : "●"}
                      </span>
                      <span className="text-[13px] text-text-primary font-mono">{ctx.name}</span>
                    </div>
                    <span className="text-[10px] text-text-secondary font-mono">
                      {timeAgo(ctx.last_accessed_at)}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {archived.length > 0 && (
            <>
              {active.length > 0 && <div className="h-px bg-[#444] mx-0" />}
              <div className="px-4 pt-3 pb-1.5">
                <span className="text-[10px] font-bold text-text-secondary tracking-[2px] font-mono">
                  ARCHIVED
                </span>
              </div>
              {archived.map((ctx) => {
                const idx = allItems.indexOf(ctx);
                return (
                  <div
                    key={ctx.id}
                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer
                      ${idx === selectedIndex ? "bg-white/5" : ""}`}
                    onClick={() => handleSelect(ctx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-text-secondary">○</span>
                      <span className="text-[13px] text-text-primary font-mono">{ctx.name}</span>
                    </div>
                    <span className="text-[10px] text-text-secondary font-mono">
                      {timeAgo(ctx.last_accessed_at)}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {allItems.length === 0 && (
            <div className="px-4 py-8 text-center text-text-secondary text-[13px]">
              {search ? "No matches" : "No contexts yet"}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 h-12 bg-bg-card">
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 text-[12px] font-bold text-white bg-accent-primary rounded-md font-mono cursor-pointer"
          >
            + New
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add -A && git commit -m "feat: Quick Switcher — search, create, switch contexts"
```

---

## Task 12: Frontend — App Init + Wire Everything

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

**Step 1: App init — load contexts on mount, auto-select first active**

`src/App.tsx` (final):
```tsx
import { useEffect } from "react";
import { StatusBar } from "./components/StatusBar";
import { TreeCanvas } from "./components/TreeCanvas";
import { QuickSwitcher } from "./components/QuickSwitcher";
import { useContextStore } from "./stores/contextStore";
import { useKeyboard } from "./hooks/useKeyboard";
import { useUIStore } from "./stores/uiStore";

export default function App() {
  const { contexts, currentContextId, loadContexts, switchContext } = useContextStore();
  const { openQuickSwitcher } = useUIStore();
  useKeyboard();

  useEffect(() => {
    loadContexts().then(() => {
      // Auto-select first active context
      const active = useContextStore.getState().contexts.find(c => c.state === "active");
      if (active) switchContext(active.id);
      else openQuickSwitcher(); // No contexts — open switcher
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-page">
      <StatusBar />
      <main className="flex-1 overflow-hidden">
        <TreeCanvas />
      </main>
      <QuickSwitcher />
    </div>
  );
}
```

**Step 2: Verify full flow**

```bash
pnpm tauri dev
```

Expected flow:
1. App opens → dark window
2. Quick Switcher appears (no contexts yet)
3. Type a name → click "+ New" → context created
4. Tree appears with single root node
5. Select root → Tab → adds child node
6. Arrow keys navigate, Enter edits, Backspace deletes
7. ⌘K → opens switcher → can create more contexts and switch

**Step 3: Commit**
```bash
git add -A && git commit -m "feat: wire up App init, auto-select context, full MVP flow"
```

---

## Task 13: Final Cleanup + Verify

**Step 1: Remove any remaining Vite boilerplate**

Delete leftover default files if any.

**Step 2: Run full build**

```bash
pnpm tauri build --debug
```

Expected: Builds successfully, creates .app bundle.

**Step 3: Manual smoke test checklist**

- [ ] App launches with dark UI
- [ ] ⌘K opens Quick Switcher
- [ ] Can create a new context
- [ ] Root node renders with Oswald heading
- [ ] Tab adds child node (card style)
- [ ] Shift+Tab adds sibling node
- [ ] Arrow keys navigate between nodes
- [ ] Enter starts inline edit, Enter again commits
- [ ] Backspace deletes selected node (not root)
- [ ] ⌘K → switch to another context
- [ ] Data persists after app restart (SQLite at ~/MindFlow/data/mindflow.db)

**Step 4: Final commit**
```bash
git add -A && git commit -m "feat: Mind Flow MVP v1 — focus mode, tree, quick switcher"
```
