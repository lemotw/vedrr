# Vedrr — Dev Setup

Everything you need to clone, build, and start working on vedrr.

---

## Prerequisites

| Tool | Minimum | Install |
|------|---------|---------|
| Rust | 1.80+ | [rustup.rs](https://rustup.rs) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm i -g pnpm` |
| Xcode CLT | latest | `xcode-select --install` (macOS only) |

Tauri 2 on macOS requires Xcode Command Line Tools for the WKWebView runtime.

---

## Quick Start

```bash
git clone <repo-url> && cd vedrr
pnpm install
pnpm tauri dev          # dev mode with hot reload
```

First run downloads the ONNX embedding model (~130 MB) automatically. The status bar shows a spinner until it's ready.

### Other Commands

```bash
pnpm tauri build        # production build (.dmg / .app)
pnpm build              # frontend only (for quick type-check)
pnpm lint               # eslint
cargo check             # Rust type-check only (run from src-tauri/)
cargo test              # Rust unit tests (run from src-tauri/)
```

---

## Data Locations

All user data lives under `~/vedrr/`:

```
~/vedrr/
├── data/vedrr.db       # SQLite database
├── files/{ctx_id}/     # Images and attached files
├── models/             # ONNX embedding model cache
└── vault/{ctx_id}.zip  # Vaulted context archives
```

To reset everything: `rm -rf ~/vedrr` and restart the app.

---

## Common Dev Tasks

### Add a new IPC command

A new command touches 5 files across 3 layers. Follow this checklist:

1. **Rust command** — Add `pub fn my_command(...)` in the appropriate `src-tauri/src/commands/*.rs`
2. **Register** — Add to `tauri::generate_handler![]` in `src-tauri/src/main.rs`
3. **IPC constant** — Add `MY_COMMAND: "my_command"` to `IpcCmd` in `src/lib/constants.ts`
4. **IPC wrapper** — Add `myCommand: (args) => safeInvoke(...)` in `src/lib/ipc.ts`
5. **Store action** — Call `ipc.myCommand()` from the relevant Zustand store

Remember: frontend camelCase params auto-convert to Rust snake_case (`{ contextId }` → `context_id`).

### Add a new DB table or column

1. **Schema** — Add `CREATE TABLE IF NOT EXISTS ...` in `db.rs` → `init_db()`
2. **Migration** — For existing column changes, add an idempotent `ALTER TABLE ... ADD COLUMN` after the CREATE TABLE block (wrapped in `let _ =` to ignore "already exists" errors)
3. **Model** — Add/update Rust struct in `models.rs` with `#[derive(Serialize, Deserialize)]`
4. **TypeScript** — Add/update interface in `src/lib/types.ts`

### Add an i18n key

1. Add to `src/i18n/en.json` (English, required)
2. Add to `src/i18n/zh-TW.json` (Traditional Chinese, required)
3. Use via `const { t } = useTranslation()` → `t("section.key")`

Both files must have the same key structure. Missing keys fall back to English.

### Add a new theme

1. **CSS** — Add `[data-theme="mytheme"]` block in `src/index.css` with all `--color-*` overrides
2. **Constant** — Add to `Themes` enum in `src/lib/constants.ts`
3. **Flash prevention** — Add background color to the inline `<script>` in `index.html` (look for `// SYNC:` comment)

---

## Gotchas

Things that will bite you if you don't know about them.

### Tauri 2 / WKWebView

- **No asset protocol for local files.** `convertFileSrc()` does not work on macOS WKWebView. Always use `read_file_bytes` (Rust) → `Blob` → `URL.createObjectURL()` on the frontend.
- **`DataTransferItemList` is not iterable** with `for...of` on WKWebView. Use index-based loops: `for (let i = 0; i < items.length; i++)`.
- **Clipboard data expires** after the paste handler returns. Extract blobs synchronously — never pass `DataTransferItemList` to an async function.

### React / CJK Input

- **IME guard**: Always check `e.nativeEvent.isComposing` before handling Enter in text inputs. Without this, pressing Enter to confirm a CJK character will also trigger the submit action.

### DB Lock Discipline

- The Rust backend uses a single `Mutex<Connection>`. For CPU-heavy operations (embedding), use the three-phase pattern:
  1. Lock → read data → unlock
  2. Compute (no lock)
  3. Lock → write results → unlock
- Never hold the DB lock during `embed_passages()` calls — this blocks all other IPC commands.

### Embedding Model

- First ONNX inference is ~45s (graph optimization). Subsequent calls are <200ms. The `ensure_model()` function runs a dummy warmup inference to pay this cost at startup.
- `embed_single_node` silently skips if model isn't ready. The node gets embedded later during `warmup_all` or next `switchContext`.
- `embed_context_core` queues the context if model isn't ready, instead of blocking.

### Navigation

- j/k moves between siblings (breadth), h/l moves parent/child (depth). This is NOT DFS order.
- Root node title and context name are bidirectionally synced via `rename_context`.
