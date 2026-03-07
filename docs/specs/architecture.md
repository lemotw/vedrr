# Vedrr Architecture

> 2026-03-07

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
Rust #[tauri::command] fn (commands/context.rs, node.rs, file_ops.rs, search.rs, ai.rs, inbox.rs, settings.rs)
      │
      ▼
AppState { db: Mutex<Connection>, http_client: reqwest::Client } ── SQL query
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
├── main.tsx                    # React root mount
├── index.css                   # Tailwind v4 @theme tokens + theme CSS variable overrides
│
├── components/
│   ├── StatusBar.tsx            # Top bar: context name + model status spinner + hint buttons
│   ├── TreeCanvas.tsx           # Horizontal tree + connectors + hover "+" buttons + drag-sort
│   ├── NodeCard.tsx             # Node card (root heading / card / image thumbnail / lightbox)
│   ├── ContentPanel.tsx         # Right-side Markdown edit panel
│   ├── MarkdownEditor.tsx       # Tiptap editor + toolbar
│   ├── QuickSwitcher.tsx        # ⌘K search/switch/create/archive/vault/import/export context
│   ├── QuickCapture.tsx         # Global shortcut capture panel (NSPanel on macOS)
│   ├── InboxTriage.tsx          # ⌘I inbox triage: match captured items to nodes/contexts
│   ├── NodeTypePopover.tsx      # Node type picker (T/M/I/F)
│   ├── NodeSearch.tsx           # ⌘F node search (semantic + text)
│   ├── ContextMenu.tsx          # Right-click context menu
│   ├── ThemeSwitcher.tsx        # Theme picker popover + custom color editor
│   ├── SettingsPanel.tsx        # Settings modal (tabs: General, AI, Search, Theme)
│   ├── AISettings.tsx           # AI tab: API key management + profile CRUD
│   ├── SearchSettings.tsx       # Search tab: mode toggle, alpha/threshold sliders
│   └── CompactBanner.tsx        # AI Compact result banner (undo/accept/details)
│
├── hooks/
│   └── useKeyboard.ts           # Global keydown + paste listener (vim-style navigation)
│
├── stores/
│   ├── contextStore.ts          # Context CRUD (list/switch/create/archive/vault/restore/import/export)
│   ├── treeStore.ts             # Tree + Node CRUD (select/add/delete/move/paste/undo)
│   └── uiStore.ts               # UI state (popover/editor/theme/collapse/inbox/settings)
│
├── lib/
│   ├── constants.ts             # Centralized enums: NodeTypes, Themes, IpcCmd, CompactStates...
│   ├── types.ts                 # TypeScript types + NODE_TYPE_CONFIG
│   ├── ipc.ts                   # Tauri invoke wrappers
│   ├── cn.ts                    # Classname merge utility (clsx + twMerge)
│   ├── platform.ts              # OS detection (isMac, ⌘ vs Ctrl symbol)
│   ├── clipboard.ts             # Unified clipboard format helpers
│   ├── exportPng.ts             # Tree canvas → PNG export via html-to-image
│   ├── url.ts                   # URL detection helper for text nodes
│   ├── timeAgo.ts               # Relative time formatter (now/5m/3h/2d)
│   └── dragContext.ts           # Drag-and-drop context for dnd-kit
│
└── i18n/
    ├── index.ts                 # i18next init (en, zh-TW)
    ├── en.json                  # English translations
    └── zh-TW.json               # Traditional Chinese translations
```

### Zustand Store Responsibilities

| Store | Responsibility | Persistence |
|-------|---------------|-------------|
| `contextStore` | Context list, current context ID, CRUD, vault/restore/import/export | SQLite (via IPC) |
| `treeStore` | Tree data, selected node, copy/cut/paste, undo stack | SQLite (via IPC) |
| `uiStore` | UI toggles (popover/editor/switcher/inbox/settings), theme, collapse state, compact state | localStorage (theme) |

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
├── main.rs           # Tauri entry: init DB, register plugins, register commands, global shortcuts, background model warmup
├── db.rs             # DB path + schema init (CREATE TABLE) + migrations
├── models.rs         # Data structs: Context, ContextSummary, TreeNode, TreeData, VaultExport, VaultEntry, InboxItem...
├── error.rs          # AppError enum (Serialize for IPC)
├── embedding.rs      # Embedding model (multilingual-e5-small), queue system, cosine similarity
└── commands/
    ├── mod.rs        # Module declarations
    ├── context.rs    # Context CRUD + vault (ZIP export) + restore + import + auto-vault + export ZIP
    ├── node.rs       # Node CRUD (get_tree recursive assembly, create/update/delete/move/clone/restore)
    ├── search.rs     # Semantic search + text search + embed commands
    ├── ai.rs         # AI compact: proxy LLM calls, profile/key CRUD, model listing
    ├── file_ops.rs   # File read/save/import/write commands
    ├── inbox.rs      # Inbox items: create, list, delete, find similar nodes, match to node/context
    ├── settings.rs   # Key-value settings CRUD + global shortcut update
    └── shortcuts.rs  # Quick Capture NSPanel init + global shortcut handler
```

### AppState

```rust
pub struct AppState {
    pub db: Mutex<Connection>,      // Single SQLite connection, Mutex-protected
    pub http_client: reqwest::Client, // Shared HTTP client for AI API calls
}
```

All `#[tauri::command]` functions access the DB via `State<AppState>`.

### Registered Commands (46 total)

| Module | Commands |
|--------|----------|
| `context` | `create_context`, `list_contexts`, `switch_context`, `archive_context`, `vault_context`, `activate_context`, `rename_context`, `delete_context`, `list_vault`, `restore_from_vault`, `auto_vault_archived`, `delete_vault_entry`, `import_vault_zip`, `export_context_zip` |
| `node` | `get_tree`, `create_node`, `update_node`, `delete_node`, `move_node`, `clone_subtree`, `restore_nodes` |
| `file_ops` | `write_file_bytes`, `read_file_bytes`, `save_clipboard_image`, `import_image`, `save_markdown_file` |
| `ai` | `list_ai_profiles`, `create_ai_profile`, `delete_ai_profile`, `compact_node`, `create_api_key`, `list_api_keys`, `delete_api_key`, `get_system_prompt`, `set_system_prompt`, `list_models` |
| `search` | `semantic_search`, `text_search`, `embed_context_nodes`, `embed_single_node`, `get_model_status`, `ensure_embedding_model` |
| `settings` | `get_setting`, `set_setting`, `update_shortcut` |
| `inbox` | `create_inbox_item`, `list_inbox_items`, `delete_inbox_item`, `find_similar_nodes_for_inbox`, `match_inbox_to_node`, `match_inbox_to_context` |

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

### vault_embeddings

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Embedding ID |
| `vault_id` | TEXT NOT NULL | FK → vault_list.id, ON DELETE CASCADE |
| `node_title` | TEXT NOT NULL | Node title at vault time |
| `node_type` | TEXT NOT NULL | Node type |
| `ancestor_path` | TEXT NOT NULL | Ancestor chain text |
| `embedding_content` | BLOB NOT NULL | Content embedding vector |
| `embedding_path` | BLOB NOT NULL | Path embedding vector |
| `created_at` | TEXT NOT NULL | ISO datetime |

### inbox_items

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID v4 |
| `content` | TEXT NOT NULL | Captured text content |
| `embedding` | BLOB | Embedding vector (nullable, populated async) |
| `status` | TEXT NOT NULL | `pending` / `embedded` / `matched` (CHECK) |
| `context_id` | TEXT | Matched context ID (nullable) |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

### settings

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT PK | Setting key (e.g. `quick_capture_shortcut`) |
| `value` | TEXT NOT NULL | Setting value |

### ai_settings

Key-value store for AI configuration (e.g. system prompt).

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT PK | Setting key |
| `value` | TEXT NOT NULL | Setting value |

### api_keys

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID v4 |
| `name` | TEXT NOT NULL | Display name |
| `provider` | TEXT NOT NULL | `anthropic` / `openai` / `gemini` (CHECK) |
| `created_at` | TEXT | ISO datetime |

Actual API key secrets are stored in the OS keychain via the `keyring` crate, not in SQLite.

### ai_profiles

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID v4 |
| `name` | TEXT NOT NULL | Profile display name |
| `provider` | TEXT NOT NULL | Provider name |
| `model` | TEXT NOT NULL | Model identifier |
| `api_key_id` | TEXT | FK → api_keys.id, ON DELETE SET NULL |
| `created_at` | TEXT | ISO datetime |

### model_cache

Caches available model lists per provider to avoid repeated API calls.

| Column | Type | Description |
|--------|------|-------------|
| `provider` | TEXT PK | Provider name |
| `models_json` | TEXT NOT NULL | Cached JSON model list |
| `cached_at` | TEXT | ISO datetime |

### Relationships

```
contexts 1 ──────< tree_nodes
    │                   │
    │ root_node_id ───→ │ id
    │                   │
                        │ parent_id ───→ id (self-referencing)

contexts 1 ──────< node_embeddings
                        │ node_id ───→ tree_nodes.id

vault_list 1 ────< vault_embeddings

api_keys 1 ─────< ai_profiles (api_key_id, ON DELETE SET NULL)

vault_list (standalone — vaulted contexts are deleted from contexts table)
inbox_items (standalone — linked to context_id after matching)
settings (standalone key-value store)
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
| `InboxItem` | `InboxItem` | Quick Capture inbox item |
| `ModelStatus` | `ModelStatus` | Embedding model status + queue progress |
| `SearchResult` | `SearchResult` | Search hit (node + score + context) |
| `CompactResult` | `CompactResult` | AI compact output (proposed nodes) |
| `AppError` | `string` (rejected promise) | Error message |
