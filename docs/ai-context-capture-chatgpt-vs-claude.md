# Desktop App Context Capture: ChatGPT vs Claude Technical Report

**Date:** 2026-03-14
**Purpose:** Inform vedrr's potential "use current context as AI input" feature design
**Relevance:** Tauri 2.x desktop app — cross-platform (macOS / Windows / Linux)
**Scope:** Text-based context only (no screenshot/screen capture)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [ChatGPT Desktop App: "Work with Apps"](#2-chatgpt-desktop-app)
3. [Claude Desktop App: MCP](#3-claude-desktop-app)
4. [Side-by-Side Comparison](#4-side-by-side-comparison)
5. [Cross-Platform APIs Deep Dive](#5-cross-platform-apis-deep-dive)
   - 5.1 Accessibility / Text Reading
   - 5.2 Global Hotkeys
   - 5.3 Always-on-Top Windows
   - 5.4 Permission Model Summary
6. [Cross-Platform Rust Crates](#6-cross-platform-rust-crates)
7. [Tauri 2.x Cross-Platform Details](#7-tauri-2x-cross-platform-details)
8. [Implementation Plan for vedrr](#8-implementation-plan-for-vedrr)
9. [Sources](#9-sources)

---

## 1. Executive Summary

Both ChatGPT and Claude desktop apps solve the same core problem -- getting context from the user's current work environment into an AI conversation -- but they use fundamentally different technical approaches:

- **ChatGPT** uses OS-level Accessibility APIs (macOS AXUIElement, Windows UIA) to programmatically read text content from other running applications. For VS Code specifically, it uses a custom extension. This is a **native app** approach (Swift/AppKit on macOS).

- **Claude** uses the Model Context Protocol (MCP) for structured tool-based access to files, databases, and APIs. Claude's desktop app is **Electron-based**. It does NOT use the Accessibility API to read other apps' text.

The key distinction: ChatGPT reads text FROM other apps automatically; Claude lets users configure structured data access (MCP servers).

**Cross-platform summary:**
- **Windows** is the easiest platform — no permission dialogs needed for UIA or hotkeys
- **macOS** requires explicit Accessibility permission grant
- **Linux X11** is permissive like Windows
- **Linux Wayland** — global shortcuts are compositor-dependent (GNOME doesn't implement the portal)

---

## 2. ChatGPT Desktop App

### 2.1 Chat Bar / Floating Window

**UX Pattern:**
- Press `Option+Space` (macOS) or `Alt+Space` (Windows) from anywhere
- A slim "Chat Bar" appears as a floating overlay above the current app
- The user types a question; ChatGPT automatically detects the frontmost app and reads its text content
- Chat Bar can be kept floating as a companion window while working

**Technical Implementation:**
- Registers a global hotkey via OS APIs
- The Chat Bar is rendered as an always-on-top, borderless window (NSPanel on macOS)
- Queries the frontmost application using OS-specific APIs
- Built natively (Swift/AppKit on macOS), NOT Electron

### 2.2 "Work with Apps" Feature

**How It Reads Content:**

The primary mechanism is **OS-level Accessibility APIs**:

| Platform | API | Details |
|----------|-----|---------|
| macOS | AXUIElement | `AXUIElementCreateApplication(pid)` → traverse tree → read `kAXValueAttribute` |
| Windows | UI Automation (UIA) | `IUIAutomation::GetFocusedElement()` → `IUIAutomationTextPattern` for text |
| Linux | N/A | No official ChatGPT desktop app |

**Content extraction specifics:**
- **Editors/IDEs (Xcode, TextEdit, etc.):** Reads the full content of open editor panes, up to a truncation limit
- **Terminal apps (Terminal.app, iTerm, Warp):** Reads the last 200 lines of open panes
- **VS Code (and forks):** Uses a dedicated VS Code extension instead of the Accessibility API. Electron-based apps expose editor content poorly through accessibility trees

**Supported Applications (as of early 2025):**
- Xcode, VS Code (via extension), Cursor, Windsurf, JetBrains IDEs, Android Studio
- Apple Notes, TextEdit
- Terminal, iTerm, Warp, Prompt (Panic)
- Notion, Quip

**Write-back capability:**
- For IDEs, ChatGPT can generate diffs and apply edits directly to open files
- Users can review diffs before applying, or enable auto-apply

### 2.3 Platform-Specific Permissions

| Permission | macOS | Windows |
|------------|-------|---------|
| Accessibility (read text) | Explicit user grant required | **Not required** |
| Distribution constraint | Cannot use Mac App Store (non-sandboxed) | No constraint |

---

## 3. Claude Desktop App

### 3.1 Quick Entry

- Double-tap the `Option` key (macOS only) to open a floating text input
- Currently **macOS-only**; Windows has a global hotkey to summon the window but no context capture

### 3.2 Model Context Protocol (MCP)

MCP is Claude's primary structured context mechanism — cross-platform by design.

**Architecture:**
```
Claude Desktop (MCP Client)
    |
    | stdio / SSE
    |
MCP Server Process (runs locally)
    |
    | Any language/runtime
    |
Data Source (filesystem, database, API, etc.)
```

**Configuration:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**How It Works:**
1. Claude Desktop launches MCP server processes on startup
2. Servers advertise their available tools (e.g., `read_file`, `search_files`, `list_directory`)
3. When the user asks a question, Claude can decide to call these tools
4. Every tool invocation requires explicit user approval (click "Allow")
5. Results are returned to Claude as text context for the response

**Key MCP Servers:**
- `@modelcontextprotocol/server-filesystem` -- read/write/search files
- `@modelcontextprotocol/server-github` -- GitHub API access
- `@modelcontextprotocol/server-postgres` -- database queries
- Community servers for Slack, Notion, Google Drive, etc.

**Desktop Extensions (2025):** One-click installable MCP server packages, similar to browser extensions.

### 3.3 Permissions Required

| Permission | macOS | Windows | Linux |
|------------|-------|---------|-------|
| Accessibility | Yes (overlay) | N/A | N/A |

**Note:** Claude does NOT use the Accessibility API to read content from other apps. MCP servers run as local processes with standard filesystem access.

---

## 4. Side-by-Side Comparison

| Aspect | ChatGPT | Claude |
|--------|---------|--------|
| **App framework** | Native (Swift/AppKit macOS) | Electron |
| **Platforms** | macOS, Windows | macOS, Windows (limited), Linux (unofficial) |
| **Global shortcut** | Option+Space / Alt+Space | Double-tap Option (macOS only) |
| **Floating UI** | Slim chat bar, stays floating | Overlay input → full app |
| **Text from other apps** | Yes (Accessibility API) | No (uses MCP for file/data access) |
| **Structured data access** | No | MCP (filesystem, databases, APIs) |
| **Write back to apps** | Yes (diff apply in IDEs) | No |
| **Extensibility** | Limited (VS Code extension only) | High (any MCP server) |
| **Privacy model** | Accessibility = full text access to allowed apps | MCP = user configures what to expose |
| **Cross-platform context** | macOS + Windows | Cross-platform (MCP is platform-agnostic) |

---

## 5. Cross-Platform APIs Deep Dive

### 5.1 Accessibility / Text Reading from Other Apps

| Aspect | macOS | Windows | Linux |
|--------|-------|---------|-------|
| **API** | Accessibility API (AXUIElement) | UI Automation (IUIAutomation) | AT-SPI2 (over D-Bus) |
| **Permission required** | Yes — explicit user grant | **No** — any app can use UIA freely | **No** — AT-SPI2 is open by default |
| **Scope** | Full element tree of any app | Full element tree of any app | GTK/Qt apps that implement ATK; not universal |
| **Text reading** | `kAXValueAttribute`, `kAXSelectedTextAttribute` | `IUIAutomationTextPattern` | `org.atspi.Text` interface |
| **Focused element** | `kAXFocusedUIElementAttribute` | `GetFocusedElement()` | `GetFocus` via AT-SPI bus |
| **App coverage** | Excellent — most native macOS apps | Excellent — Win32, WPF, UWP | Moderate — GTK good, Qt decent, Electron varies |
| **Rust crate** | `macos-accessibility-client` | `uiautomation` | `atspi` |
| **Crate maturity** | Moderate (raw bindings) | Good (high-level wrapper) | Good (async, pure Rust, zbus) |

**Key code examples:**

macOS (AXUIElement):
```c
AXUIElementRef appRef = AXUIElementCreateApplication(pid);
AXUIElementRef focusedElement;
AXUIElementCopyAttributeValue(appRef, kAXFocusedUIElementAttribute, &focusedElement);
CFTypeRef value;
AXUIElementCopyAttributeValue(focusedElement, kAXValueAttribute, &value);
```

Windows (UIA):
```rust
use uiautomation::UIAutomation;
let automation = UIAutomation::new()?;
let focused = automation.get_focused_element()?;
let name = focused.get_name()?;
// Or use TextPattern for rich text content
```

Linux (AT-SPI2):
```rust
use atspi::AccessibilityBus;
let bus = AccessibilityBus::open().await?;
let focused = bus.get_focus().await?;
let text = focused.get_text(0, -1).await?;
```

**Critical note on AccessKit**: AccessKit helps your app *expose* its own accessibility tree to the OS. It does NOT help you *read* other apps' trees.

### 5.2 Global Hotkeys

| Aspect | macOS | Windows | Linux (X11) | Linux (Wayland) |
|--------|-------|---------|-------------|-----------------|
| **API** | CGEventTap / NSEvent global monitor | RegisterHotKey (Win32) | XGrabKey | xdg-desktop-portal GlobalShortcuts |
| **Permission required** | Yes — Accessibility | **No** | **No** | No, but user confirms binding |
| **Reliability** | High (after permission) | High | High | **Low** — GNOME doesn't implement portal; KDE does |
| **Tauri plugin** | `tauri-plugin-global-shortcut` ✓ | `tauri-plugin-global-shortcut` ✓ | ✓ (X11) | Uncertain (likely XWayland fallback) |

### 5.3 Always-on-Top / Floating Windows

| Aspect | macOS | Windows | Linux |
|--------|-------|---------|-------|
| **API** | NSWindow.level = .floating | HWND_TOPMOST | X11: `_NET_WM_STATE_ABOVE`; Wayland: compositor-specific |
| **Permission** | No | No | No |
| **Tauri `always_on_top`** | ✓ | ✓ | ✓ (X11); varies (Wayland) |
| **Transparent windows** | ✓ (vibrancy) | ✓ (acrylic via DWM) | ✓ X11; buggy some Wayland compositors |
| **Frameless windows** | ✓ | ✓ | ✓ |

### 5.4 Permission Model Summary

| Permission | macOS | Windows | Linux X11 | Linux Wayland |
|------------|-------|---------|-----------|---------------|
| Accessibility (read other apps) | Explicit grant | **Not required** | **Not required** | **Not required** |
| Global hotkeys | Accessibility perm | **Not required** | **Not required** | Compositor-dependent |
| Always-on-top | Not required | Not required | Not required | Not required |
| File system | Full (non-sandboxed) | Full (non-UWP) | Full | Full |

**Bottom line:** Windows is the most permissive. Linux X11 is similarly permissive. macOS requires Accessibility permission for both text reading and global hotkeys. Wayland has gaps in global shortcut support.

---

## 6. Cross-Platform Rust Crates

### 6.1 Accessibility (Reading from Other Apps)

| Crate | Platform | Notes |
|-------|----------|-------|
| `macos-accessibility-client` | macOS | AXUIElement bindings |
| `accessibility-sys` | macOS | Lower-level FFI |
| `uiautomation` | Windows | High-level UIA wrapper — enumerate, read, send input, events |
| `atspi` | Linux | Pure Rust, async, D-Bus based (Odilia project) |
| `accesskit` | All | **Provider only** — exposes YOUR app's tree, does NOT read others |

**No single cross-platform crate exists for reading accessibility data from other apps.** Must use per-platform crates behind a common trait.

### 6.2 Global Hotkeys & Window Management

| Crate | Platforms | Notes |
|-------|-----------|-------|
| `tauri-plugin-global-shortcut` | macOS, Windows, Linux | Wraps `global-hotkey` crate. Wayland uncertain. |
| `tauri-plugin-positioner` | All | Position windows (tray, center, etc.) |
| Tauri window config | All | `always_on_top`, `transparent`, `decorations`, `skip_taskbar` |

### 6.3 Permissions

| Crate | Platform | Notes |
|-------|----------|-------|
| `tauri-plugin-macos-permissions` | macOS only | Check/request Accessibility permission |
| (not needed) | Windows | All APIs are permission-free |
| `ashpd` | Linux | xdg-desktop-portal bindings (for Wayland global shortcuts fallback) |

---

## 7. Tauri 2.x Cross-Platform Details

### 7.1 WebView Engine Differences

| Aspect | macOS (WKWebView) | Windows (WebView2) | Linux (WebKitGTK) |
|--------|-------------------|--------------------|--------------------|
| **Engine** | WebKit | Chromium | WebKit |
| **Update mechanism** | OS updates only | Self-updating | Distro package manager |
| **Version consistency** | Tied to macOS version | Consistent (recent Chromium) | **Highly variable** |
| **Performance** | Good | Good | **Noticeably slower** |
| **CSS/JS compatibility** | Good | Excellent | **Lagging** on stable distros |
| **Known issues** | DataTransferItemList not iterable | Transparency regression | Slow, version fragmentation |

### 7.2 Tauri Plugin Cross-Platform Support

All core Tauri 2 plugins (`global-shortcut`, `dialog`, `fs`, `shell`, `clipboard-manager`, `notification`, `window-state`, `autostart`, `updater`, `store`, `sql`) work on macOS, Windows, and Linux.

Main risks:
- **WebKitGTK** limitations on Linux affecting frontend rendering
- **Wayland** breaking global shortcut assumptions
- **WebView2** availability on older Windows (7/8)

---

## 8. Implementation Plan for vedrr

### 8.1 Recommended Architecture

```rust
// Platform-agnostic trait
trait ContextCapture {
    fn get_focused_app_name(&self) -> Result<String>;
    fn get_focused_element_text(&self) -> Result<String>;
    fn get_selected_text(&self) -> Result<String>;
    fn list_windows(&self) -> Result<Vec<WindowInfo>>;
}

// Platform implementations (feature-gated via #[cfg(target_os)])
// macOS:   macos-accessibility-client
// Windows: uiautomation
// Linux:   atspi
```

### 8.2 Phased Rollout

**Phase 1 — Global Hotkey + Floating Chat Bar (all platforms):**
- `tauri-plugin-global-shortcut` for `Cmd+Shift+V` / `Ctrl+Shift+V`
- Secondary WebviewWindow: `always_on_top`, `decorations: false`, `transparent: true`
- Text input → send to AI API with vedrr's current context tree as text
- Works on all platforms with no special permissions

**Phase 2 — Text Extraction from Other Apps (per-platform, progressive):**

| Platform | Crate | Permission | Priority |
|----------|-------|------------|----------|
| macOS | `macos-accessibility-client` | Accessibility grant | High |
| Windows | `uiautomation` | None | High |
| Linux | `atspi` | None | Medium (coverage varies by toolkit) |

- Auto-detect frontmost app when chat bar is invoked
- Extract visible text content and include as context
- Prioritize common apps: Terminal, text editors, browsers
- For VS Code / Electron apps: consider a companion extension (like ChatGPT does)

**Phase 3 — Structured Context (cross-platform):**
- Allow users to configure file paths / directories vedrr can read
- Simple tool system: read files, search content, list directory
- Aligns with vedrr's existing file storage model
- Could implement MCP-compatible server for interop with Claude/other tools

### 8.3 Platform Risk Matrix

| Feature | macOS | Windows | Linux X11 | Linux Wayland |
|---------|-------|---------|-----------|---------------|
| Global hotkey | Low | Low | Low | **High** (GNOME gap) |
| Floating window | Low | Low | Low | Medium |
| Text extraction | Low | Low | Medium (app coverage) | Medium |
| WebView rendering | Low | Low | **Medium** (WebKitGTK) | **Medium** |

### 8.4 Permission Flow (cross-platform)

```
App Launch
  |
  +--> [macOS only]
  |      +--> Check Accessibility permission
  |      +--> If denied: show banner "Grant Accessibility for text reading"
  |      +--> If granted: enable text extraction + global hotkey
  |
  +--> [Windows] → All features available immediately
  |
  +--> [Linux]
         +--> Detect X11 vs Wayland
         +--> X11: All features available immediately
         +--> Wayland: Global hotkey may not work on GNOME; text extraction still works
```

### 8.5 Distribution Implications

| Platform | Method | Constraint |
|----------|--------|------------|
| macOS | DMG (current) | Non-sandboxed ✓, notarized ✓, Accessibility API viable |
| Windows | MSI / NSIS installer | No constraints for UIA |
| Linux | AppImage / .deb / Flatpak | AppImage/deb: full access. Flatpak: portal-gated for global hotkeys. |

---

## 9. Sources

### ChatGPT Desktop App
- OpenAI Help Center: Work with Apps on macOS -- https://help.openai.com/en/articles/10119604-work-with-apps-on-macos
- OpenAI Help Center: Using the ChatGPT Windows app -- https://help.openai.com/en/articles/9982051-using-the-chatgpt-windows-app
- OpenAI Help Center: VS Code Extension -- https://help.openai.com/en/articles/10128592-how-to-install-the-work-with-apps-visual-studio-code-extension
- TechCrunch: ChatGPT can now read Mac desktop apps -- https://techcrunch.com/2024/11/14/chatgpt-can-now-read-some-of-your-macs-desktop-apps/
- Allen Pike: Why is ChatGPT for Mac So Good? -- https://allenpike.com/2025/why-is-chatgpt-so-good-claude/
- The AI Track: ChatGPT Work with Apps -- https://theaitrack.com/chatgpt-work-with-apps-desktop-update/

### Claude Desktop App
- Claude Help Center: Quick Entry on Mac -- https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac
- Claude Help Center: MCP Servers -- https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop
- Anthropic: Introducing the Model Context Protocol -- https://www.anthropic.com/news/model-context-protocol
- Anthropic: Desktop Extensions -- https://www.anthropic.com/engineering/desktop-extensions
- MCP Documentation: Connect to Local Servers -- https://modelcontextprotocol.io/docs/develop/connect-local-servers
- Claude Desktop Linux (unofficial) -- https://ludditus.com/2025/12/17/claude-desktop-for-linux-i-didnt-even-know-it-existed/

### Platform APIs
- Apple: AXUIElement Documentation -- https://developer.apple.com/documentation/applicationservices/axuielement
- tauri-plugin-macos-permissions -- https://github.com/ayangweb/tauri-plugin-macos-permissions
- uiautomation-rs (Windows UIA) -- https://github.com/leexgone/uiautomation-rs
- atspi (Linux AT-SPI2) -- https://github.com/odilia-app/atspi
- AccessKit -- https://github.com/AccessKit/accesskit
- XDG Desktop Portal GlobalShortcuts -- https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html
- AT-SPI2 (freedesktop) -- https://www.freedesktop.org/wiki/Accessibility/AT-SPI2/

### Tauri 2.x
- Tauri Global Shortcut plugin -- https://v2.tauri.app/plugin/global-shortcut/
- Tauri Webview Versions -- https://v2.tauri.app/reference/webview-versions/
- Tauri Window Customization -- https://v2.tauri.app/learn/window-customization/

### Other
- Wayland vs X11 2026 comparison -- https://www.glukhov.org/post/2026/01/wayland-vs-x11-comparison/
- AXorcist (Swift AX wrapper) -- https://github.com/steipete/AXorcist
