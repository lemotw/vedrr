# Vedrr Architecture

> 2026-02-28

---

## Overview

```
┌─────────────────────────────────────────────────────┐
│                   Tauri Window                       │
│  ┌───────────────────────────────────────────────┐  │
│  │              React Frontend                    │  │
│  │                                                │  │
│  │  Component ──→ Zustand Store ──→ ipc.ts        │  │
│  │                                    │           │  │
│  └────────────────────────────────────┼───────────┘  │
│                                       │ invoke()     │
│  ┌────────────────────────────────────┼───────────┐  │
│  │              Rust Backend          ▼           │  │
│  │                                                │  │
│  │  #[tauri::command] ──→ AppState { db: Mutex }  │  │
│  │                              │                 │  │
│  │                              ▼                 │  │
│  │                     SQLite (rusqlite)           │  │
│  │                       ~/vedrr/data/vedrr.db    │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Data Flow

```
User Action (keyboard / click)
      │
      ▼
React Component (NodeCard, TreeCanvas, QuickSwitcher...)
      │
      ▼
Zustand Store (contextStore / treeStore / uiStore)
      │  calls ipc wrapper
      ▼
src/lib/ipc.ts ── invoke(commandName, { params })
      │
      │  Tauri IPC bridge (auto camelCase → snake_case)
      ▼
Rust #[tauri::command] fn (commands/context.rs, node.rs, file_ops.rs, search.rs)
      │
      ▼
AppState { db: Mutex<Connection> } ── SQL query
      │
      ▼
SQLite ~/vedrr/data/vedrr.db
```

---

## Frontend Architecture (React + TypeScript)

### File Map

```
src/
├── App.tsx                     # Entry: theme init, load contexts, loading screen, compose components
├── index.css                   # Tailwind v4 @theme tokens + theme CSS variable overrides
│
├── components/
│   ├── StatusBar.tsx            # Top bar: context name + model status spinner + ⌘K
│   ├── TreeCanvas.tsx           # Horizontal tree + connectors + hover "+" buttons + drag-sort
│   ├── NodeCard.tsx             # Node card (root heading / card / image thumbnail / lightbox)
│   ├── ContentPanel.tsx         # Right-side Markdown edit panel
│   ├── MarkdownEditor.tsx       # Tiptap editor + toolbar
│   ├── QuickSwitcher.tsx        # ⌘K search/switch/create/archive/vault/import context
│   ├── NodeTypePopover.tsx      # Node type picker (T/M/I/F)
│   ├── NodeSearch.tsx           # ⌘F node search (semantic + text)
│   ├── ContextMenu.tsx          # Right-click context menu
│   └── ThemeSwitcher.tsx        # Theme picker popover + custom color editor
│
├── hooks/
│   └── useKeyboard.ts           # Global keydown + paste listener (vim-style navigation)
│
├── stores/
│   ├── contextStore.ts          # Context CRUD (list/switch/create/archive/vault/restore/import)
│   ├── treeStore.ts             # Tree + Node CRUD (select/add/delete/move/paste/undo)
│   └── uiStore.ts               # UI state (popover/editor/theme/collapse)
│
└── lib/
    ├── constants.ts             # Centralized enums: NodeTypes, Themes, IpcCmd...
    ├── types.ts                 # TypeScript types + NODE_TYPE_CONFIG
    └── ipc.ts                   # Tauri invoke wrappers
```

### Zustand Store Responsibilities

| Store | Responsibility | Persistence |
|-------|---------------|-------------|
| `contextStore` | Context list, current context ID, CRUD, vault/restore/import | SQLite (via IPC) |
| `treeStore` | Tree data, selected node, copy/cut/paste, undo stack | SQLite (via IPC) |
| `uiStore` | UI toggles (popover/editor/switcher), theme, collapse state | localStorage (theme) |

### IPC Notes

- Frontend uses **camelCase** params; Tauri auto-converts to Rust **snake_case**
  - e.g. `{ contextId }` → Rust receives `context_id: String`
- Rust commands return `Result<T, AppError>`; `AppError` implements `Serialize` and becomes a string on the frontend
- Frontend calls `invoke<ReturnType>(commandName, params)` which returns `Promise<ReturnType>`

---

## Backend Architecture (Rust)

### File Map

```
src-tauri/src/
├── main.rs           # Tauri entry: init DB, register plugins, register commands, background model warmup
├── db.rs             # DB path + schema init (CREATE TABLE) + migrations
├── models.rs         # Data structs: Context, ContextSummary, TreeNode, TreeData, VaultExport, VaultEntry
├── error.rs          # AppError enum (Serialize for IPC)
├── embedding.rs      # Embedding model (multilingual-e5-small), queue system, cosine similarity
└── commands/
    ├── context.rs    # Context CRUD + vault (ZIP export) + restore + import + auto-vault
    ├── node.rs       # Node CRUD (get_tree recursive assembly, create/update/delete/move/clone/restore)
    ├── search.rs     # Semantic search + text search + embed commands
    └── file_ops.rs   # File read/save/import commands
```

### AppState

```rust
pub struct AppState {
    pub db: Mutex<Connection>,  // Single SQLite connection, Mutex-protected
}
```

All `#[tauri::command]` functions access the DB via `State<AppState>`.

### Embedding System

```
App startup
    │  (2s delay)
    ▼
ensure_model() ── download/load ONNX model + warmup inference
    │
    ▼
warmup_all() ── queue all active contexts → process_embed_queue()
    │             STATUS_WARMING_UP → process each → STATUS_READY
    │
    ▼
Ready ── embed_single_node() on each node create/update
         embed_context_core() on switchContext / restoreFromVault
```

- Model: `intfloat/multilingual-e5-small` via fastembed (ONNX Runtime)
- Dual vectors per node: content embedding (title) + path embedding (ancestor chain)
- Search formula: `score = α × content_score + (1-α) × path_score`
- Queue deduplicates context IDs; items queued during model loading are processed on warmup

---

## SQLite Schema

Location: `~/vedrr/data/vedrr.db`
Definition: `src-tauri/src/db.rs` → `init_db()`
Mode: WAL + foreign_keys ON

### contexts

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID v4 |
| `name` | TEXT NOT NULL | Context name |
| `state` | TEXT NOT NULL | `active` / `archived` (CHECK constraint) |
| `tags` | TEXT NOT NULL | JSON array string, default `[]` |
| `root_node_id` | TEXT | FK → tree_nodes.id (root node) |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

### tree_nodes

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID v4 |
| `context_id` | TEXT NOT NULL | FK → contexts.id, **ON DELETE CASCADE** |
| `parent_id` | TEXT | FK → tree_nodes.id, ON DELETE SET NULL |
| `position` | INTEGER NOT NULL | Sibling sort order, 0-based |
| `node_type` | TEXT NOT NULL | `text` / `markdown` / `image` / `file` |
| `title` | TEXT NOT NULL | Node title |
| `content` | TEXT | Markdown HTML content (for markdown type) |
| `file_path` | TEXT | Absolute file path (for image/file types) |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

### node_embeddings

| Column | Type | Description |
|--------|------|-------------|
| `node_id` | TEXT PK | FK → tree_nodes.id |
| `context_id` | TEXT NOT NULL | FK → contexts.id |
| `embedding_content` | BLOB NOT NULL | f32 vector for title content |
| `embedding_path` | BLOB NOT NULL | f32 vector for ancestor path |
| `input_content` | TEXT | Original content text used for embedding |
| `input_path` | TEXT | Original path text used for embedding |
| `updated_at` | TEXT | ISO datetime |

### vault_list

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Original context ID |
| `name` | TEXT NOT NULL | Context name at vault time |
| `tags` | TEXT NOT NULL | JSON array, default `[]` |
| `node_count` | INTEGER NOT NULL | Number of nodes at vault time |
| `original_created_at` | TEXT NOT NULL | Original creation date |
| `vaulted_at` | TEXT NOT NULL | When vaulted |

### Relationships

```
contexts 1 ──────< tree_nodes
    │                   │
    │ root_node_id ───→ │ id
    │                   │
                        │ parent_id ───→ id (self-referencing)

contexts 1 ──────< node_embeddings
                        │ node_id ───→ tree_nodes.id

vault_list (standalone, no FK to contexts — vaulted contexts are deleted)
```

---

## File Storage

```
~/vedrr/
├── data/
│   └── vedrr.db              # SQLite database
├── files/
│   └── {context_id}/
│       └── {node_id_prefix}.{ext}   # Images / files
├── models/
│   └── models--intfloat--multilingual-e5-small/   # ONNX embedding model
└── vault/
    └── {context_id}.zip       # Vaulted context ZIPs
```

- Images saved via `save_clipboard_image` or `import_image` into `~/vedrr/files/`
- Frontend renders via `read_file_bytes` → `Blob` → `ObjectURL` (no asset protocol)
- Deleting a context CASCADE-deletes nodes; `files/` directory cleaned up by vault flow
- Vault ZIPs contain `manifest.json` + `files/` directory (self-contained)

---

## Type Mapping (Rust ↔ TypeScript)

| Rust struct | TS interface | Usage |
|------------|-------------|-------|
| `Context` | `Context` | Full context data |
| `ContextSummary` | `ContextSummary` | List display (with node_count) |
| `TreeNode` | `TreeNode` | Single node |
| `TreeData` | `TreeData` | Recursive tree (node + children) |
| `VaultEntry` | `VaultEntry` | Vault list item |
| `ModelStatus` | `ModelStatus` | Embedding model status + queue progress |
| `SearchResult` | `SearchResult` | Search hit (node + score + context) |
| `AppError` | `string` (rejected promise) | Error message |
