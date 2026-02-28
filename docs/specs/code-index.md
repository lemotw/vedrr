# Vedrr — Code Index

> Quick-reference table. For detailed architecture and gotchas see `/CLAUDE.md`.

## IPC Reference

| Frontend call | → Rust command | Description |
|---------------|---------------|-------------|
| `ipc.createContext(name, tags)` | `create_context` | Create context + root node |
| `ipc.listContexts()` | `list_contexts` | List all contexts (with node_count) |
| `ipc.switchContext(id)` | `switch_context` | Switch context, update timestamps |
| `ipc.archiveContext(id)` | `archive_context` | state → archived |
| `ipc.activateContext(id)` | `activate_context` | state → active |
| `ipc.renameContext(id, name)` | `rename_context` | Rename context + sync root node title |
| `ipc.deleteContext(id)` | `delete_context` | Delete context (CASCADE deletes nodes) |
| `ipc.vaultContext(id)` | `vault_context` | Export to ZIP, remove from DB |
| `ipc.restoreFromVault(id)` | `restore_from_vault` | Restore ZIP → archived context + re-embed |
| `ipc.importVaultZip(zipPath)` | `import_vault_zip` | Import external ZIP as new context |
| `ipc.listVault()` | `list_vault` | List vault entries |
| `ipc.deleteVaultEntry(id)` | `delete_vault_entry` | Delete vault ZIP + metadata |
| `ipc.autoVaultArchived()` | `auto_vault_archived` | Auto-vault stale archived contexts |
| `ipc.getTree(contextId)` | `get_tree` | Recursive tree query |
| `ipc.createNode(contextId, parentId, nodeType, title)` | `create_node` | Create node (position = max+1) |
| `ipc.updateNode(id, {title?, content?, nodeType?, filePath?})` | `update_node` | Update specified node fields |
| `ipc.deleteNode(id)` | `delete_node` | Recursively delete subtree |
| `ipc.moveNode(id, newParentId, position)` | `move_node` | Move node to new parent |
| `ipc.cloneSubtree(sourceId, targetParentId, contextId)` | `clone_subtree` | Deep-copy subtree (for paste) |
| `ipc.restoreNodes(nodes)` | `restore_nodes` | Batch restore nodes (for undo) |
| `ipc.readFileBytes(filePath)` | `read_file_bytes` | Read file as byte array |
| `ipc.saveClipboardImage(contextId, nodeId, data, ext)` | `save_clipboard_image` | Save clipboard image → return path |
| `ipc.importImage(contextId, nodeId, sourcePath)` | `import_image` | Copy image to app storage → return path |
| `ipc.semanticSearch(query, topK, alpha, minScore)` | `semantic_search` | Dual-vector cosine similarity search |
| `ipc.textSearch(query, topK)` | `text_search` | LIKE match on title/content |
| `ipc.embedContextNodes(contextId, force)` | `embed_context_nodes` | Batch-embed missing/all nodes |
| `ipc.embedSingleNode(nodeId)` | `embed_single_node` | Embed one node (skips if model not ready) |
| `ipc.getModelStatus()` | `get_model_status` | Model status + download progress + queue |
| `ipc.ensureEmbeddingModel()` | `ensure_embedding_model` | Download + init model (legacy, now auto) |
| `ipc.revealFile(filePath)` | *(plugin-opener)* | Reveal in Finder/Explorer |
| `ipc.pickFile()` / `ipc.pickImage()` | *(plugin-dialog)* | System file picker |

## Store Actions

### contextStore
`loadContexts` `loadVaultEntries` `createContext` `switchContext` `archiveContext` `activateContext` `vaultContext` `deleteContext` `renameContext` `restoreFromVault` `deleteVaultEntry` `importVaultZip`

### treeStore
`loadTree` `selectNode` `addChild` `addSibling` `deleteNode` `updateNodeTitle` `updateNodeType` `updateNodeContent` `pasteAsNode` `openOrAttachFile` `pickAndImportImage`

### uiStore
`openQuickSwitcher` `closeQuickSwitcher` `toggleQuickSwitcher` `setEditingNode` `openTypePopover` `closeTypePopover` `openMarkdownEditor` `closeMarkdownEditor` `openNodeSearch` `closeNodeSearch` `setTheme`

## Constants (src/lib/constants.ts)

| Constant | Values | Usage |
|----------|--------|-------|
| `NodeTypes` | TEXT, MARKDOWN, IMAGE, FILE | Node type checks, create calls |
| `ContextStates` | ACTIVE, ARCHIVED, VAULT | Context state filtering |
| `CompactStates` | IDLE, LOADING, PREVIEW | AI compact flow state |
| `IpcCmd` | All Tauri invoke command names | ipc.ts invoke calls |
| `PasteKind` | IMAGE, TEXT | Paste handler dispatch |
| `imageMime(ext)` | ext → MIME string | Image Blob creation |

## Keyboard Shortcuts

| Key | Condition | Action |
|-----|-----------|--------|
| j / ↓ | tree focused | Next sibling (breadth) |
| k / ↑ | tree focused | Previous sibling (breadth) |
| l / → | tree focused + has children | First child (depth) |
| h / ← | tree focused + has parent | Parent node (depth) |
| Enter | tree focused + selected | Inline edit title |
| Tab | tree focused + selected | Add child node |
| Shift+Tab | tree focused + selected | Add sibling node |
| t | tree focused + selected | Open type popover |
| 1-4 | type popover open | Quick switch type |
| o | tree focused + FILE/IMAGE node | FILE: attach/reveal, IMAGE: pick image |
| Backspace/Delete | tree focused + selected + not root | Delete node |
| Ctrl+V | tree focused + selected | Paste as new node (auto-detect image) |
| ⌘K | always | Quick Switcher |
| ⌘F | always | Node Search |
| Escape | lightbox / edit / popover / markdown editor | Close |
