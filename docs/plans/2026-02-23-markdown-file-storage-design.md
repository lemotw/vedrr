# Markdown File Storage + tiptap-markdown

**Date**: 2026-02-23

## Summary

Migrate markdown node content from SQLite `tree_nodes.content` to filesystem `.md` files. Add `tiptap-markdown` extension so the editor stores pure Markdown syntax and supports paste-to-render.

## Decisions

- Storage: `~/vedrr/files/{context_id}/{full_node_id}.md`
- Format: Pure Markdown syntax (not HTML)
- No migration needed (no existing data)
- File path recorded in `tree_nodes.file_path` (same pattern as IMAGE/FILE nodes)

## Data Flow

```
Read:  Rust read_file_bytes → UTF-8 decode → tiptap-markdown setContent
Save:  editor.storage.markdown.getMarkdown() → IPC save_markdown_file → Rust writes .md
Create: create_node(markdown) → Rust creates empty .md → sets file_path
Delete: delete_node → Rust deletes .md file if exists
Clone:  clone_subtree → copy .md file for new node
```

## Implementation Steps

### Step 1: Backend — `save_markdown_file` command
- New Rust command in `file_ops.rs`: `save_markdown_file(context_id, node_id, content) -> String`
- Writes UTF-8 content to `~/vedrr/files/{context_id}/{node_id}.md`
- Returns the file path

### Step 2: Backend — `create_node` auto-create .md file
- In `node.rs::create_node`, when `node_type == "markdown"`, auto-create empty `.md` file and set `file_path`

### Step 3: Backend — `delete_node` cleanup .md files
- In `node.rs::delete_node`, before deleting from DB, check `file_path` and delete the file if it ends with `.md`

### Step 4: Backend — `clone_subtree` copy .md files
- In `node.rs::clone_recursive`, if source node has `.md` file_path, copy file for the new node

### Step 5: Frontend — Install tiptap-markdown + wire up IPC
- `pnpm add tiptap-markdown`
- Add `IpcCmd.SAVE_MARKDOWN_FILE` to constants
- Add `ipc.saveMarkdownFile()` to ipc.ts

### Step 6: Frontend — Update MarkdownEditor.tsx
- Add `Markdown` extension from tiptap-markdown
- Change `content` prop to accept Markdown string
- Change `onUpdate` to use `editor.storage.markdown.getMarkdown()`

### Step 7: Frontend — Update ContentPanel.tsx
- Read: use `ipc.readFileBytes` + UTF-8 decode to load `.md` content
- Save: use `ipc.saveMarkdownFile` instead of `updateNodeContent`

### Step 8: Frontend — Update treeStore.ts
- Remove `updateNodeContent` usage for markdown nodes (ContentPanel handles it directly)
- Ensure compact/undo logic still works for markdown nodes
