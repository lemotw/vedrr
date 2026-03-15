## What's New

### Semantic Search Opt-in

The embedding model (~130MB) is no longer downloaded automatically on first launch. A banner asks whether to enable semantic search — choose "Enable" to download in the background, or "Skip" to use text-only search. You can change this anytime in Settings > Search, which now shows model download progress, indexing status, and a retry button if something goes wrong.

### Quick Capture

A new global shortcut (`Cmd+Shift+Space` / `Ctrl+Shift+Space`) opens a floating input panel for capturing thoughts without leaving your current app. Notes go to an inbox for later triage into your knowledge tree. The shortcut is configurable in Settings > General.

### Inbox Triage

Captured thoughts land in an inbox (`Cmd+I`). For each item, vedrr suggests similar existing nodes using semantic similarity. You can match an item to an existing node or create a new one in any context.

### Copy as Markdown

Right-click any node and choose "Copy as Markdown" to copy the subtree structure to your clipboard. Markdown-type nodes include their full content as reference sections at the bottom.

### Export PNG

Export your tree canvas as a PNG image from the QuickSwitcher context menu (`.` > Export PNG).

### Auto-Vault

Archived contexts older than 30 days are automatically moved to the vault. A notification banner shows which contexts were auto-vaulted when this happens.

### URL Nodes

Text nodes containing URLs are automatically detected. A clickable "open" button appears to launch the URL in your default browser.

## Improvements

- macOS: main window hides on close instead of quitting (click dock icon to reopen)
- macOS: Quick Capture uses NSPanel (non-activating overlay, doesn't steal focus from other apps)
- StatusBar redesigned as vim-style hint bar with keyboard shortcut labels
- Context menu redesigned with group headers, unicode icons, and keyboard badge styling
- Unified clipboard format for copy/cut/paste operations
- Markdown editor scrollable with proper overflow handling
- QuickSwitcher context actions moved to a dropdown menu (`.` key or click `...`)
- Recency border animation on recently edited nodes (fades over 10 minutes)
- App icon corners rounded
- Added Simplified Chinese and Japanese translations
- README revamped with badges, icon, GIFs, and download links
- Added CONTRIBUTING.md and GitHub issue templates
- Settings panel shows app version from git tag

## Bug Fixes

- Fixed `Ctrl+N` not working in QuickSwitcher
- Fixed inbox items not reflecting in tree after triage
- Fixed lint warnings from setState-in-effect patterns
- Fixed partial ZIP files left on disk when export fails
- Fixed Cmd+C/X firing during Quick Capture input

## Downloads

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `vedrr_0.2.0_aarch64.dmg` |
| macOS (Intel) | `vedrr_0.2.0_x64.dmg` |
| Linux | `vedrr_0.2.0_amd64.deb` |
| Windows | `vedrr_0.2.0_x64-setup.exe` |
