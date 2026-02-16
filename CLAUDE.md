# Mind Flow — CLAUDE.md

## Project Overview

ADHD-friendly desktop knowledge management tool. Horizontal XMind-style tree per "context", vim-style keyboard-first UX.

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Tauri 2.x (Rust backend, WKWebView frontend on macOS) |
| Frontend | React 19 + TypeScript + Vite 7 + Zustand 5 + Tailwind CSS v4 |
| Backend | Rust + rusqlite (bundled SQLite) |
| Package manager | pnpm |

## Commands

```bash
pnpm tauri dev     # dev mode (hot reload)
pnpm tauri build   # production build
pnpm build         # frontend only
pnpm lint          # eslint
```

## Architecture

```
User Action → useKeyboard / Component
       ↓
 Zustand Store (contextStore / treeStore / uiStore)
       ↓
 IPC Wrapper (src/lib/ipc.ts)
       ↓
 Tauri invoke → Rust Command
       ↓
 SQLite (~/MindFlow/data/mindflow.db)
```

## File Structure

```
src/
├── App.tsx                    # Shell: init, useKeyboard, render layout
├── index.css                  # Tailwind v4 @theme tokens
├── components/
│   ├── NodeCard.tsx            # Node card (root heading / non-root card + image thumbnail + lightbox)
│   ├── NodeTypePopover.tsx     # Type switcher popover (badge click / T key / 1-4 number keys)
│   ├── QuickSwitcher.tsx       # ⌘K modal (search, create, switch, archive contexts)
│   ├── StatusBar.tsx           # Top bar (context name + count + ⌘K button)
│   └── TreeCanvas.tsx          # Horizontal tree with curved connectors + hover "+" buttons
├── hooks/
│   └── useKeyboard.ts          # Global keydown + paste listener
├── stores/
│   ├── contextStore.ts         # Context CRUD state
│   ├── treeStore.ts            # Tree + node CRUD state + paste logic
│   └── uiStore.ts              # UI flags (switcher, editing, popover)
└── lib/
    ├── constants.ts            # Centralized enums: NodeTypes, ContextStates, IpcCmd, PasteKind, imageMime()
    ├── types.ts                # TS types + NODE_TYPE_CONFIG
    └── ipc.ts                  # Tauri invoke wrappers (16 calls)

src-tauri/src/
├── main.rs                     # Tauri entry, AppState { db: Mutex<Connection> }
├── db.rs                       # DB path (~MindFlow/data/mindflow.db), schema init, WAL mode
├── models.rs                   # Rust structs: Context, ContextSummary, TreeNode, TreeData
├── error.rs                    # MindFlowError enum + Serialize for IPC
└── commands/
    ├── context.rs              # create/list/switch/archive/activate/rename/delete
    ├── node.rs                 # get_tree/create_node/update_node/delete_node/move_node
    └── file_ops.rs             # read_file_bytes / save_clipboard_image / import_image
```

## DB Schema

```sql
contexts (id, name, state, tags, root_node_id → tree_nodes, timestamps)
tree_nodes (id, context_id → contexts, parent_id → self, position, node_type, title, content, file_path, timestamps)
-- CASCADE delete, WAL mode, foreign_keys ON
```

## Design Tokens

| Token | Value | Tailwind |
|-------|-------|----------|
| bg-page | #1A1A1A | `bg-bg-page` |
| bg-card | #212121 | `bg-bg-card` |
| bg-elevated | #2D2D2D | `bg-bg-elevated` |
| accent-primary | #FF6B35 | `text-accent-primary` / `ring-accent-primary` |
| text-primary | #FFFFFF | `text-text-primary` |
| text-secondary | #777777 | `text-text-secondary` |
| Node colors | T=#4FC3F7, M=#00D4AA, I=#FFD54F, F=#CE93D8 | via CSS vars |
| Fonts | Oswald (heading, 700), JetBrains Mono (body/mono) | `font-heading` / `font-mono` |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| j/↓ | Next sibling (breadth) |
| k/↑ | Previous sibling (breadth) |
| l/→ | First child (depth) |
| h/← | Parent (depth) |
| Enter | Edit selected node title |
| Tab | Add child node |
| Shift+Tab | Add sibling node |
| Delete/Backspace | Delete node |
| t | Open type popover |
| 1-4 | Quick switch type (in popover) |
| ⌘K | Quick Switcher |
| Ctrl+V | Paste as node (image auto-detect) |
| Esc | Close lightbox / cancel edit / close markdown editor |
| o | Open/attach file (FILE node) / pick image (IMAGE node) |

## File Storage

- DB: `~/MindFlow/data/mindflow.db`
- Images: `~/MindFlow/files/{context_id}/{node_id_prefix}.{ext}`

## Constants & Enums

All string enums are centralized in `src/lib/constants.ts`:

| Constant | Values | Usage |
|----------|--------|-------|
| `NodeTypes` | TEXT, MARKDOWN, IMAGE, FILE | Node type checks, create calls |
| `ContextStates` | ACTIVE, ARCHIVED, VAULT | Context filtering |
| `IpcCmd` | 16 Tauri invoke command names | `ipc.ts` invoke calls |
| `PasteKind` | IMAGE, TEXT | Paste handler dispatch |
| `imageMime(ext)` | Maps ext → MIME string | Image blob creation |

**Rule**: Never use raw strings for these values. Always import from `constants.ts`.

---

## Gotchas & Lessons Learned

### Tauri 2 Specific

- **`convertFileSrc` + asset protocol does NOT work** for loading local files in Tauri 2 on macOS WKWebView. Use `read_file_bytes` (Rust reads file → returns `Vec<u8>`) + frontend `new Blob()` + `URL.createObjectURL()` instead.
- **Tauri IPC**: frontend camelCase params auto-convert to snake_case in Rust. e.g. `{ filePath }` → `file_path: String`.

### WKWebView (macOS)

- **`DataTransferItemList` is NOT iterable with `for...of`** on WKWebView. Must use index-based `for (let i = 0; i < items.length; i++)`.
- **Clipboard data expires** after the paste event handler returns. Extract `blob = item.getAsFile()` and `item.getAsString()` synchronously inside the handler. Do NOT pass `DataTransferItemList` to async functions.

### React / UI

- **`onKeyDown` on a `<div>` does not fire** unless the div has `tabIndex` and focus. For global key listeners (e.g. lightbox Esc), use `window.addEventListener("keydown", ...)` inside `useEffect`.
- **IME composing guard**: Always check `e.nativeEvent.isComposing` before handling Enter in text inputs (for CJK input).
- **`scrollIntoView`**: Use `{ behavior: "smooth", block: "nearest", inline: "nearest" }` to only scroll when the element is out of view.
- **`URL.revokeObjectURL`**: Always clean up in `useEffect` return to prevent memory leaks.

### Navigation

- j/k = sibling navigation (breadth-first), h/l = parent/child (depth). NOT DFS flatten order.
- Root node title changes sync to context name (bidirectional via `rename_context` backend).

### State Management

- **Markdown editor**: Explicit open/close via `uiStore.openMarkdownEditor(nodeId)` / `closeMarkdownEditor()`. Auto-closes when `treeStore.selectNode` switches to a different node.
- **Image import**: `import_image` Rust command copies file into `~/MindFlow/files/` so originals can be deleted safely. Frontend `pickImage()` restricts to image extensions via `tauri-plugin-dialog` filters.
