# Mind Flow — Remaining Features

> Date: 2025-02-15
> Reference: PRD v1.0, current codebase state

---

## Already Done

- Tauri 2.x + React 19 + TypeScript + Zustand + Tailwind v4
- SQLite persistence (`~/MindFlow/data/mindflow.db`)
- Context CRUD (create, switch, archive, activate, delete)
- Node CRUD (create child/sibling, delete, inline title edit)
- Horizontal XMind-style tree with curved connectors
- 4 node types display: [T] Text, [M] Markdown, [I] Image, [F] File
- Node type change popover (badge click + `t` key + `1-4` quick switch)
- Keyboard: h/j/k/l, arrows, Enter, Tab, Shift+Tab, Delete
- Quick Switcher (Cmd+K) with vim-style nav, list-first focus
- Mouse "+" buttons (add child / add sibling on hover)
- StatusBar with context name + active count

---

## Tier 1 — Core UX Gaps (High Impact, Low Effort)

These are things a daily user would hit immediately.

| # | Feature | Description | Effort |
|---|---------|-------------|--------|
| 1 | Node content editing | Title-only edit is done, but nodes have no body/content editing yet. At minimum, clicking a [T] node should allow multi-line content input. | M |
| 2 | Markdown editor | [M] nodes need a proper editor. Tiptap split-panel: left tree, right editor. Auto-save to `content` field. | L |
| 3 | Selected node scroll into view | When navigating with keyboard, the selected node should auto-scroll into the viewport. | S |
| 4 | Node collapse/expand | Large trees need toggle. Click connector or press `space` to collapse/expand children. | M |
| 5 | Context rename | Currently no way to rename a context after creation. Need inline rename or a popover in Quick Switcher. | S |
| 6 | Delete confirmation | Deleting a node with children should warn the user (or at least support undo). | S |

---

## Tier 2 — Important Features (Medium Effort)

| # | Feature | Description | Effort |
|---|---------|-------------|--------|
| 7 | Right-click context menu | Unified context menu on nodes: Open, Rename, Change Type, Duplicate, Move Up/Down, Delete. Already designed in design.pen. | M |
| 8 | Node reorder (keyboard) | Alt+Up / Alt+Down to move node position among siblings. Backend `move_node` already exists. | S |
| 9 | Image node thumbnail | [I] nodes should show image preview. Need file picker to select image, store `file_path`, render thumbnail in card. | M |
| 10 | File node open external | [F] nodes: click to open with system default app. Need Tauri shell open API. | S |
| 11 | Search | Cmd+F or `/` to search across current tree's titles. Future: cross-context search. | M |
| 12 | Undo / Redo | At minimum, undo the last destructive action (delete node). Zustand middleware or command pattern. | M |

---

## Tier 3 — Full Vision (Large Effort)

From the PRD but not needed for daily use yet.

| # | Feature | Description | Effort |
|---|---------|-------------|--------|
| 13 | Context Manager panel | Full ⌘⇧K panel with Active/Archived/Vault sections, tag filters, stats. | L |
| 14 | Tag system | Create/edit tags on contexts. Filter by tags in Context Manager. | M |
| 15 | Common Knowledge graph | Shared knowledge trees across contexts. Graph view with d3-force or @xyflow/react. | XL |
| 16 | Insights bar | Daily/weekly stats: nodes created, contexts active, time spent. | M |
| 17 | Drag & drop | Node reorder + reparent via mouse drag. Complex interaction model. | L |
| 18 | Performance (virtual rendering) | For trees with 50+ visible nodes. Virtual rendering + canvas connectors. | L |
| 19 | Transition animations | Smooth expand/collapse, node add/remove animations. | M |
| 20 | Cross-platform | Windows support, future iOS/iPad. | XL |

---

## Effort Key

- **S** = Small (< 1hr)
- **M** = Medium (1-3hr)
- **L** = Large (3-8hr)
- **XL** = Extra Large (8hr+)

---

## Suggested Next Sprint

If picking 3-5 items for the next focused session:

1. **#3** Selected node scroll into view (S) — quick win, daily pain
2. **#4** Node collapse/expand (M) — essential for real usage
3. **#1** Node content editing (M) — title-only is very limiting
4. **#2** Markdown editor (L) — the core value of [M] nodes
5. **#8** Node reorder (S) — keyboard users need this
