# Desktop App Context Capture: ChatGPT vs Claude Technical Report

**Date:** 2026-03-14
**Purpose:** Inform vedrr's potential "use current context as AI input" feature design
**Relevance:** Tauri 2.x desktop app on macOS (WKWebView + Rust backend)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [ChatGPT Desktop App: "Work with Apps"](#chatgpt-desktop-app)
3. [Claude Desktop App: Quick Entry + MCP](#claude-desktop-app)
4. [Side-by-Side Comparison](#side-by-side-comparison)
5. [macOS APIs and Permissions](#macos-apis-and-permissions)
6. [Implementation Considerations for Tauri 2.x](#tauri-2x-implementation)
7. [Sources](#sources)

---

## 1. Executive Summary

Both ChatGPT and Claude desktop apps solve the same core problem -- getting context from the user's current work environment into an AI conversation -- but they use fundamentally different technical approaches:

- **ChatGPT** uses the macOS Accessibility API (AXUIElement) to programmatically read text content from other running applications, plus a screenshot tool using Screen Recording permission. For VS Code specifically, it uses a custom extension that communicates via a local protocol. This is a **native app** approach (Swift/AppKit).

- **Claude** uses a combination of screenshot/window capture (via Screen Recording permission) and the Model Context Protocol (MCP) for structured tool-based access to files, databases, and APIs. Claude's desktop app is **Electron-based**. It does NOT use the Accessibility API to read other apps' text.

The key distinction: ChatGPT reads text FROM other apps automatically; Claude lets users visually capture context (screenshots) or configure structured data access (MCP servers).

---

## 2. ChatGPT Desktop App

### 2.1 Chat Bar / Floating Window (Option+Space)

**UX Pattern:**
- Press `Option+Space` from anywhere on macOS
- A slim "Chat Bar" appears as a floating overlay above the current app
- The bar includes a text input, paperclip (attachment) button, and screenshot tool
- The user types a question; ChatGPT automatically detects the frontmost app
- Chat Bar can be kept floating as a companion window while working

**Technical Implementation:**
- ChatGPT registers a global hotkey (`Option+Space`) via macOS APIs
- The Chat Bar is rendered as an always-on-top, borderless window (NSPanel or similar)
- When invoked, the app queries the frontmost application using NSWorkspace / CGWindowListCopyWindowInfo
- The app is built natively (Swift/AppKit), NOT Electron

### 2.2 "Work with Apps" Feature

**How It Reads Content:**

The primary mechanism is the **macOS Accessibility API** (AXUIElement framework):

1. ChatGPT calls `AXUIElementCreateApplication(pid)` for the frontmost app
2. It traverses the accessibility tree to find text content elements
3. It reads attributes like `kAXValueAttribute`, `kAXTitleAttribute`, etc.
4. Text is extracted and sent as context alongside the user's prompt

**Content extraction specifics:**
- **Editors/IDEs (Xcode, TextEdit, etc.):** Reads the full content of open editor panes in the foremost window, up to a truncation limit
- **Terminal apps (Terminal.app, iTerm, Warp):** Reads the last 200 lines of open panes
- **VS Code (and forks):** Uses a dedicated VS Code extension instead of the Accessibility API. The extension reads the active editor tab's content and communicates it to the ChatGPT desktop app via a local channel. This is necessary because VS Code's Electron-based rendering doesn't expose its editor content well through AXUIElement

**Supported Applications (as of early 2025):**
- Xcode
- VS Code (via extension), Cursor, Windsurf, JetBrains IDEs, Android Studio
- Apple Notes, TextEdit
- Terminal, iTerm, Warp, Prompt (Panic)
- Notion, Quip

**Write-back capability:**
- For IDEs, ChatGPT can generate diffs and apply edits directly to open files
- Users can review diffs before applying, or enable auto-apply
- This also uses the Accessibility API (or the VS Code extension) to modify text fields

### 2.3 Screenshot Tool

**How It Works:**
- Click the paperclip icon in the Chat Bar, then "Take Screenshot"
- Hover over "Take Screenshot" to see thumbnails of all open windows
- Click a window to capture it, or choose "Entire Screen"
- Multiple screenshots can be attached to a single conversation
- Uses the `CGWindowListCreateImage` API for window capture

**Permission:** Requires Screen & System Audio Recording permission in System Settings.

### 2.4 Permissions Required

| Permission | Purpose | macOS Setting |
|------------|---------|---------------|
| Accessibility | Read text from other apps via AXUIElement | System Settings > Privacy & Security > Accessibility |
| Screen Recording | Capture screenshots of windows/screen | System Settings > Privacy & Security > Screen Recording |

**Important:** The Accessibility permission requires the app to be explicitly added to the allow list. It does NOT work in sandboxed apps (Mac App Store distribution is incompatible).

---

## 3. Claude Desktop App

### 3.1 Quick Entry (Double-tap Option)

**UX Pattern:**
- Double-tap the `Option` key (or press `Option+Space`, configurable)
- A floating text input appears as an overlay at the bottom of the screen
- Simultaneously, crosshairs appear for optional screenshot selection
- User can:
  - Just type a question (no context capture)
  - Click and drag to select a screen region (screenshot)
  - Click on any open window to capture that entire window
- After capture, the input field repositions next to the captured area
- Pressing Enter sends the query + screenshot to Claude, switching to the full app

**Technical Implementation:**
- Claude registers a global hotkey listener for Option double-tap
- The overlay is rendered as an always-on-top transparent window
- Screenshot capture uses `CGWindowListCreateImage` (same as macOS's built-in screenshot)
- Window detection likely uses `CGWindowListCopyWindowInfo` to enumerate open windows
- The app is built on **Electron** (Chromium-based), wrapping the web interface

### 3.2 Voice Dictation (Caps Lock shortcut)

- Press Caps Lock (configurable) to start/stop voice dictation
- Speech is transcribed to text in real-time
- Transcribed text is sent as part of the message
- Requires Speech Recognition permission (macOS 14+)

### 3.3 Model Context Protocol (MCP)

MCP is Claude's primary structured context mechanism. Instead of reading from other apps, it allows Claude to call tools provided by local server processes.

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
- File: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Example:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/username/projects"
      ]
    }
  }
}
```

**How It Works:**
1. Claude Desktop launches MCP server processes on startup
2. Servers advertise their available tools (e.g., `read_file`, `search_files`, `list_directory`)
3. When the user asks a question, Claude can decide to call these tools
4. Every tool invocation requires explicit user approval (click "Allow")
5. Results are returned to Claude as context for the response

**Key MCP Servers:**
- `@modelcontextprotocol/server-filesystem` -- read/write/search files
- `@modelcontextprotocol/server-github` -- GitHub API access
- `@modelcontextprotocol/server-postgres` -- database queries
- Community servers for Slack, Notion, Google Drive, etc.

**Desktop Extensions (2025):**
- Anthropic introduced one-click installable MCP server packages
- Similar to browser extensions in ease of installation
- Eliminates need for manual JSON configuration

### 3.4 File Attachments

- Drag-and-drop files into the chat window
- Click attachment button to browse files
- Supports images, PDFs, text files, code files
- Files are uploaded to Anthropic's servers for processing

### 3.5 Permissions Required

| Permission | Purpose | macOS Setting |
|------------|---------|---------------|
| Screen Recording | Quick Entry screenshot/window capture | System Settings > Privacy & Security > Screen Recording |
| Accessibility | Quick Entry overlay functionality | System Settings > Privacy & Security > Accessibility |
| Speech Recognition | Voice dictation (macOS 14+) | System Settings > Privacy & Security > Speech Recognition |

**Note:** Claude does NOT use the Accessibility API to read content from other apps. It only uses it for the overlay window behavior. The Screen Recording permission is what enables screenshot capture.

---

## 4. Side-by-Side Comparison

| Aspect | ChatGPT | Claude |
|--------|---------|--------|
| **App framework** | Native (Swift/AppKit) | Electron |
| **Global shortcut** | Option+Space | Double-tap Option (configurable) |
| **Floating UI** | Slim chat bar, stays floating | Overlay input + crosshairs, transitions to full app |
| **Text from other apps** | Yes (Accessibility API) | No |
| **Screenshot capture** | Yes (window picker or full screen) | Yes (region select or window click) |
| **File access** | Via screenshot/paste | MCP servers, drag-drop, attachments |
| **Structured data access** | No | MCP (filesystem, databases, APIs) |
| **Write back to apps** | Yes (diff apply in IDEs) | No (not directly) |
| **Voice input** | Not on desktop currently | Yes (Caps Lock shortcut) |
| **Extensibility** | Limited (VS Code extension only) | High (any MCP server) |
| **Privacy model** | Accessibility = full text access to all allowed apps | Screenshot = user explicitly selects what to share |
| **Offline capability** | Screenshot capture only | MCP servers run locally but Claude needs internet |

---

## 5. macOS APIs and Permissions

### 5.1 Accessibility API (AXUIElement)

**What it does:** Allows reading (and writing) UI element properties from any running application. Originally designed for screen readers (VoiceOver).

**Key functions:**
```c
// Get the frontmost app's accessibility element
AXUIElementRef appRef = AXUIElementCreateApplication(pid);

// Get the focused element
AXUIElementRef focusedElement;
AXUIElementCopyAttributeValue(appRef, kAXFocusedUIElementAttribute, &focusedElement);

// Read text content
CFTypeRef value;
AXUIElementCopyAttributeValue(focusedElement, kAXValueAttribute, &value);
```

**Requirements:**
- App must be in the Accessibility allow list (System Settings > Privacy & Security > Accessibility)
- App CANNOT be sandboxed (rules out Mac App Store distribution)
- User must explicitly grant permission
- Works with most native macOS apps; Electron apps have varying support

**From Rust (Tauri):**
- Use the `accessibility` or `core-foundation` crate to call AXUIElement functions
- Or use `objc2` / raw FFI to call the ApplicationServices framework
- The `tauri-plugin-macos-permissions` plugin can check if permission is granted

### 5.2 Screen Recording / Window Capture

**What it does:** Allows capturing pixel content of other windows/the screen.

**Key functions:**
```c
// Capture a specific window
CGImageRef image = CGWindowListCreateImage(
    CGRectNull,  // use window bounds
    kCGWindowListOptionIncludingWindow,
    windowID,
    kCGWindowImageDefault
);

// List all windows
CFArrayRef windowList = CGWindowListCopyWindowInfo(
    kCGWindowListOptionOnScreenOnly,
    kCGNullWindowID
);
```

**Requirements:**
- Screen Recording permission in System Settings
- User must grant permission; app may need restart after granting
- Works for any visible window regardless of framework

**From Rust (Tauri):**
- Use `core-graphics` crate for `CGWindowListCreateImage`
- `tauri-plugin-macos-permissions` can check/request Screen Recording permission

### 5.3 Global Hotkeys

**What it does:** Register system-wide keyboard shortcuts that work even when the app is not focused.

**Implementation options for Tauri:**
- `tauri-plugin-global-shortcut` (official Tauri plugin for v2)
- Register shortcuts like `Option+Space` or detect double-tap patterns
- Double-tap detection requires a custom event tap (CGEventTap) or polling approach

### 5.4 Always-on-Top Windows

**What it does:** Create floating panels that stay above other windows.

**From Tauri 2:**
- Use `window.set_always_on_top(true)` on a Tauri WebviewWindow
- Create a separate small window for the "chat bar" overlay
- Style with transparent background and no title bar for a floating panel look

---

## 6. Implementation Considerations for Tauri 2.x

### 6.1 What Is Feasible

| Feature | Feasibility | Approach |
|---------|-------------|----------|
| Global hotkey (Option+Space) | High | `tauri-plugin-global-shortcut` |
| Floating chat bar window | High | Secondary WebviewWindow with `always_on_top`, `decorations: false`, `transparent: true` |
| Screenshot capture | High | Rust calls to `CGWindowListCreateImage`, needs Screen Recording permission |
| Window enumeration | High | `CGWindowListCopyWindowInfo` to list open windows with titles/IDs |
| Read text via Accessibility API | Medium | Rust FFI to AXUIElement; requires non-sandboxed app; varies by target app |
| Write text to other apps | Medium-Low | AXUIElement write operations; fragile across app types |
| MCP server hosting | Medium | Run MCP servers as child processes from Rust; parse stdio JSON-RPC |
| Voice dictation | Low | Would need Speech framework integration; complex |

### 6.2 Recommended MVP Approach for vedrr

Given vedrr's Tauri 2.x stack, a pragmatic MVP would combine the best of both approaches:

**Phase 1 -- Screenshot Context (like Claude):**
1. Register a global hotkey (e.g., `Cmd+Shift+V` or `Option+Space`)
2. Open a small floating WebviewWindow as a chat bar
3. Offer a "Capture Window" button that:
   - Calls Rust to enumerate windows via `CGWindowListCopyWindowInfo`
   - Presents a list of window titles
   - Captures the selected window via `CGWindowListCreateImage`
   - Returns the image as base64 to the frontend
4. Attach the screenshot as context for the user's query

**Phase 2 -- Text Extraction (like ChatGPT):**
1. Use `tauri-plugin-macos-permissions` to check/request Accessibility permission
2. Implement Rust functions to read text from the frontmost app via AXUIElement
3. Auto-detect the frontmost app when the chat bar is invoked
4. Extract visible text content and include it as context
5. This is more complex and app-dependent; prioritize common apps (Terminal, text editors)

**Phase 3 -- Structured Context (like MCP):**
1. Allow users to configure file paths that vedrr can read from
2. Implement a simple tool system where vedrr can read files, search content
3. This aligns with vedrr's existing file storage model

### 6.3 Key Rust Crates

| Crate | Purpose |
|-------|---------|
| `tauri-plugin-global-shortcut` | Global hotkey registration |
| `tauri-plugin-macos-permissions` | Check/request Accessibility + Screen Recording permissions |
| `core-graphics` | CGWindowListCreateImage, CGWindowListCopyWindowInfo |
| `core-foundation` | CFString, CFArray manipulation for macOS APIs |
| `accessibility` | Higher-level AXUIElement wrapper (if available) |
| `objc2` | Low-level Objective-C FFI for macOS frameworks |

### 6.4 Permission Flow

```
App Launch
  |
  +--> Check Screen Recording permission
  |      |
  |      +--> If denied: Show banner "Grant Screen Recording for context capture"
  |      +--> If granted: Enable screenshot features
  |
  +--> Check Accessibility permission
         |
         +--> If denied: Show banner "Grant Accessibility for text reading"
         +--> If granted: Enable text extraction features
```

Use `tauri-plugin-macos-permissions` API:
```javascript
import {
  checkAccessibilityPermission,
  checkScreenRecordingPermission,
  requestAccessibilityPermission,
  requestScreenRecordingPermission
} from "tauri-plugin-macos-permissions-api";
```

### 6.5 Privacy Considerations

- **Screenshot capture:** User explicitly chooses what to capture. Lower privacy concern.
- **Accessibility API text reading:** Reads ALL text from the target app. Higher privacy concern. ChatGPT mitigates this by only reading the frontmost window and showing a small indicator when reading.
- **Always disclose** what data is being captured and where it's sent.
- **Local-first processing** (if applicable) is a strong privacy differentiator.

### 6.6 Distribution Implications

- **Accessibility API usage requires non-sandboxed app** -- cannot distribute via Mac App Store
- **Screen Recording permission** works with both sandboxed and non-sandboxed apps
- Tauri apps distributed via DMG (like vedrr already does) are non-sandboxed by default, so Accessibility API is viable
- Must be notarized for Gatekeeper (vedrr already handles this in CI)

---

## 7. Sources

### ChatGPT Desktop App
- OpenAI Help Center: Work with Apps on macOS -- https://help.openai.com/en/articles/10119604-work-with-apps-on-macos
- OpenAI Help Center: Screenshot Tool -- https://help.openai.com/en/articles/9295245-chatgpt-macos-app-screenshot-tool
- OpenAI Help Center: VS Code Extension -- https://help.openai.com/en/articles/10128592-how-to-install-the-work-with-apps-visual-studio-code-extension
- TechCrunch: ChatGPT can now read Mac desktop apps -- https://techcrunch.com/2024/11/14/chatgpt-can-now-read-some-of-your-macs-desktop-apps/
- Allen Pike: Why is ChatGPT for Mac So Good? -- https://allenpike.com/2025/why-is-chatgpt-so-good-claude/
- AppleInsider: Getting started with Work With Apps -- https://appleinsider.com/articles/25/04/22/getting-started-with-chatgpts-work-with-apps-on-macos-feature
- Tom's Guide: ChatGPT can see Mac apps -- https://www.tomsguide.com/ai/chatgpt/chatgpt-will-soon-be-able-to-see-your-mac-apps-and-provide-real-time-advice-this-is-huge

### Claude Desktop App
- Claude Help Center: Quick Entry on Mac -- https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac
- Claude Help Center: MCP Servers -- https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop
- Anthropic: Introducing the Model Context Protocol -- https://www.anthropic.com/news/model-context-protocol
- Anthropic: Desktop Extensions -- https://www.anthropic.com/engineering/desktop-extensions
- MCP Documentation: Connect to Local Servers -- https://modelcontextprotocol.io/docs/develop/connect-local-servers
- MacStories: Claude Adds Screenshot and Voice Shortcuts -- https://www.macstories.net/news/claude-adds-screenshot-and-voice-shortcuts-to-its-mac-app/

### macOS APIs
- Apple: AXUIElement Documentation -- https://developer.apple.com/documentation/applicationservices/axuielement
- Apple: Accessibility Programming Guide -- https://developer.apple.com/library/archive/documentation/Accessibility/Conceptual/AccessibilityMacOSX/
- tauri-plugin-macos-permissions -- https://github.com/ayangweb/tauri-plugin-macos-permissions
- AXorcist (Swift AX wrapper) -- https://github.com/steipete/AXorcist

### Architecture Comparisons
- Beebom: ChatGPT Can Now See Your Screen -- https://beebom.com/chatgpt-app-can-see-screen-macos/
- SkyWork: Claude Desktop Beginner's Guide -- https://skywork.ai/blog/ai-agent/claude-desktop-beginners-guide/
- SkyWork: Claude Desktop 2025 Review -- https://skywork.ai/blog/ai-agent/claude-desktop-2025-review-anthropic-first-look/
