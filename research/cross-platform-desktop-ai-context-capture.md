# Cross-Platform Desktop AI Context Capture: Technical Research

Date: 2026-03-14

---

## 1. How Existing Desktop AI Apps Handle Context Capture

### ChatGPT Desktop App

**macOS**: Uses Apple's Accessibility API to read text content from open applications. The "Work with Apps" feature allows ChatGPT to access both content and visual elements from active windows. Supported apps include VS Code, Xcode, Terminal, JetBrains IDEs, Apple Notes, Notion, Quip, and various terminal emulators. Requires Accessibility permission grant.

**Windows**: The "Work with Apps" feature is also available on Windows. While OpenAI has not publicly documented which Windows API they use, the architecture almost certainly relies on **Windows UI Automation (UIA)** -- the direct equivalent of macOS Accessibility API. UIA is the only Windows API that provides structured access to text content in arbitrary applications. No special permission dialog is required on Windows -- any app can call UIA without user consent.

**Linux**: No official ChatGPT desktop app exists for Linux.

### Claude Desktop App

**macOS**: Supports "Quick Entry" (Option+Space by default) -- a global overlay for quick prompts. Screenshot capture and window context features are available. Requires Accessibility and Screen Recording permissions.

**Windows**: Claude Desktop is available but Quick Entry and native screenshot/window context features are **not yet available** on Windows. The app supports a global hotkey (e.g., Ctrl+Alt+Space) to summon the window. Anthropic has stated they plan to expand platform-specific features to Windows in the future.

**Linux**: No official native Linux build. Community-maintained packages exist (Snap, Debian packages via third-party repos, WINE). No context capture features available.

---

## 2. Platform-by-Platform Technical Comparison

### 2.1 Accessibility API (Reading Text from Other Apps)

| Aspect | macOS | Windows | Linux |
|--------|-------|---------|-------|
| **API** | Accessibility API (AXUIElement) | UI Automation (UIA / IUIAutomation) | AT-SPI2 (over D-Bus) |
| **Permission required** | Yes -- explicit user grant in System Settings > Privacy > Accessibility | **No** -- any app can use UIA freely | **No** -- AT-SPI2 is open by default |
| **Scope** | Full element tree of any app | Full element tree of any app | GTK/Qt apps that implement ATK; not universal |
| **Text reading** | AXValue, AXSelectedText attributes | IUIAutomationTextPattern | org.a]tspi.Text interface |
| **Focused element** | AXFocusedUIElement | IUIAutomation::GetFocusedElement | GetFocus via AT-SPI bus |
| **Rust crate** | `macos-accessibility-client`, `accessibility-sys` | `uiautomation` crate (leexgone/uiautomation-rs) | `atspi` crate (odilia-app/atspi) |
| **Crate maturity** | Moderate; raw bindings available | Good; higher-level wrapper with controls, events, input | Good; async, pure Rust, zbus-based |
| **App coverage** | Excellent -- most macOS apps support it | Excellent -- Win32, WPF, UWP all expose UIA | Moderate -- GTK apps good, Qt decent, Electron varies |
| **Cross-platform crate** | AccessKit (provider only, NOT consumer) | AccessKit (provider only) | AccessKit (provider only) |

**Critical note on AccessKit**: AccessKit helps your app *expose* an accessibility tree to the OS. It does NOT help you *read* other apps' accessibility trees. For reading from other apps, you need platform-specific consumer APIs (the crates listed above).

### 2.2 Screen Capture

| Aspect | macOS | Windows | Linux (X11) | Linux (Wayland) |
|--------|-------|---------|-------------|-----------------|
| **Primary API** | CGWindowListCreateImage, ScreenCaptureKit (macOS 12.3+) | Windows Graphics Capture API (Win10 1803+) | XShm, XComposite, XGetImage | xdg-desktop-portal + PipeWire |
| **Legacy/fallback** | CGDisplayCreateImage | BitBlt / PrintWindow (GDI) | Direct framebuffer access | None (by design) |
| **Permission required** | Yes -- Screen Recording permission | **No** -- any app can capture freely | **No** -- any app can capture any window | **Yes** -- user must approve via portal dialog each session |
| **Window-level capture** | Yes (by window ID) | Yes (by HWND) | Yes (by X window ID) | Limited -- portal may only offer monitor selection |
| **Programmatic (no dialog)** | Yes, after one-time permission | Yes, always | Yes, always | **No** -- portal dialog is mandatory |
| **Rust crates** | `xcap`, `screenshots`, `screencapturekit-sys` | `xcap`, `screenshots`, `windows-capture`, `win-screenshot` | `xcap`, `screenshots` | `xcap` (partial), `ashpd` (portal bindings) |
| **xcap support status** | Full | Full | Full | Partial -- "not fully supported in some special scenarios" |
| **Data format** | Pixel buffer / CGImage | BGRA buffer / ID3D11Texture2D / HBITMAP | Pixel buffer | PipeWire video stream (can be DMA-BUF for GPU efficiency) |
| **Performance** | Good (ScreenCaptureKit is GPU-accelerated) | Good (Graphics Capture is GPU-accelerated); BitBlt is fast but misses some windows | Good | Good once stream is established, but setup overhead |

**Key insight for Wayland**: The security model is fundamentally different. There is no API to silently capture the screen. Every capture session requires user interaction with the xdg-desktop-portal dialog. This is by design and cannot be bypassed. Apps like OBS handle this by requesting a persistent capture session that the user approves once.

### 2.3 Global Hotkeys

| Aspect | macOS | Windows | Linux (X11) | Linux (Wayland) |
|--------|-------|---------|-------------|-----------------|
| **API** | CGEventTap, NSEvent.addGlobalMonitorForEvents | RegisterHotKey (Win32) | XGrabKey | xdg-desktop-portal GlobalShortcuts (v1.16+) |
| **Permission required** | Yes -- Accessibility permission | **No** | **No** | **No** (but user must confirm shortcut binding) |
| **Reliability** | High (after permission granted) | High | High | **Low** -- GNOME does not implement GlobalShortcuts portal; KDE does; Hyprland does |
| **Tauri plugin** | `tauri-plugin-global-shortcut` -- works | `tauri-plugin-global-shortcut` -- works | `tauri-plugin-global-shortcut` -- works (X11) | `tauri-plugin-global-shortcut` -- uncertain on Wayland |
| **Underlying Tauri lib** | `global-hotkey` crate (tauri-apps) | `global-hotkey` crate | `global-hotkey` crate | `global-hotkey` crate (likely uses X11 path via XWayland) |
| **Key combos** | Full modifier support | Full modifier support | Full modifier support | Compositor-dependent |

### 2.4 Always-on-Top Windows

| Aspect | macOS | Windows | Linux |
|--------|-------|---------|-------|
| **API** | NSWindow.level = .floating | SetWindowPos with HWND_TOPMOST | X11: _NET_WM_STATE_ABOVE; Wayland: compositor-specific |
| **Permission required** | No (but Accessibility needed for *other* apps' windows) | **No** | **No** |
| **Tauri support** | Yes -- `always_on_top: true` in window config | Yes -- same config | Yes -- same config |
| **Reliability** | High | High | High on X11; varies on Wayland (compositor must support) |
| **Transparent windows** | Yes (vibrancy effects available) | Yes (acrylic effects via DWM) | Yes on X11; buggy on some Wayland compositors |
| **Frameless windows** | Yes | Yes | Yes |
| **Known Tauri issues** | None major | Transparency regression in Tauri v2 reported | WebKitGTK rendering inconsistencies |

### 2.5 Permission Model Summary

| Permission | macOS | Windows | Linux |
|------------|-------|---------|-------|
| **Accessibility (read other apps)** | Explicit user grant required | **Not required** | **Not required** |
| **Screen recording** | Explicit user grant required | **Not required** | Not required (X11); Portal dialog per-session (Wayland) |
| **Global hotkeys** | Accessibility permission | **Not required** | Not required (X11); Portal-based (Wayland) |
| **Always-on-top** | Not required | **Not required** | **Not required** |
| **Camera/microphone** | Per-app permission | Per-app permission (Settings) | PipeWire/PulseAudio (usually no prompt) |
| **File system** | Sandboxed apps need entitlements; non-sandboxed full access | Full access (non-UWP) | Full access |

**Bottom line**: Windows is the most permissive platform -- no permission dialogs for any of the features vedrr would need. Linux X11 is similarly permissive. Linux Wayland is the most restrictive for screen capture. macOS sits in the middle with its explicit permission grant model.

---

## 3. Cross-Platform Rust Crates

### 3.1 Screen Capture

| Crate | Platforms | Notes |
|-------|-----------|-------|
| `xcap` | macOS, Windows, Linux (X11 full, Wayland partial) | Best cross-platform option. Monitor + window capture. Video recording WIP. |
| `screenshots` | macOS, Windows, Linux | Older, less maintained. Similar API surface. |
| `windows-capture` | Windows only | Uses Windows.Graphics.Capture API. Fastest option for Windows. |
| `win-screenshot` | Windows only | Supports both BitBlt and PrintWindow methods. |
| `screencapturekit-sys` | macOS only | Raw bindings to ScreenCaptureKit. |

### 3.2 Accessibility (Reading from Other Apps)

| Crate | Platform | Role | Notes |
|-------|----------|------|-------|
| `uiautomation` | Windows | Consumer (reads other apps) | High-level wrapper. Can enumerate elements, read text, send input, handle events. |
| `macos-accessibility-client` | macOS | Consumer (reads other apps) | Rust bindings for AXUIElement API. |
| `accessibility-sys` | macOS | Consumer (raw bindings) | Lower-level FFI bindings. |
| `atspi` | Linux | Consumer (reads other apps) | Pure Rust, async, D-Bus based. Part of Odilia screen reader project. |
| `accesskit` | All | **Provider only** (exposes YOUR app's tree) | Does NOT read from other apps. Used by egui, Bevy, etc. |

**There is no single cross-platform crate for reading accessibility data from other apps.** You must use platform-specific crates and abstract behind a trait.

### 3.3 Global Hotkeys

| Crate | Platforms | Notes |
|-------|-----------|-------|
| `global-hotkey` (tauri-apps) | macOS, Windows, Linux | Powers tauri-plugin-global-shortcut. Works on X11; Wayland support unclear. |
| `tauri-plugin-global-shortcut` | macOS, Windows, Linux | Tauri 2 plugin wrapper around global-hotkey. |

### 3.4 Window Management

| Crate/Feature | Platforms | Notes |
|---------------|-----------|-------|
| Tauri window config | All | always_on_top, transparent, decorations (frameless), skip_taskbar all cross-platform |
| `tauri-plugin-positioner` | All | Position windows (tray, center, etc.) |

---

## 4. Tauri 2.x Cross-Platform Details

### 4.1 WebView Engine Differences

| Aspect | macOS (WKWebView) | Windows (WebView2) | Linux (WebKitGTK) |
|--------|-------------------|--------------------|--------------------|
| **Engine** | WebKit | Chromium | WebKit |
| **Update mechanism** | OS updates only | Self-updating (independent of OS) | Distro package manager |
| **Version consistency** | Tied to macOS version | Consistent (recent Chromium) | **Highly variable** across distros |
| **DevTools** | Safari DevTools | Edge DevTools | WebKit Inspector |
| **WebRTC** | Yes | Yes | **Missing/broken on many distros** |
| **Performance** | Good | Good | **Noticeably slower** than others |
| **CSS/JS compatibility** | Good (modern WebKit) | Excellent (modern Chromium) | **Lagging** -- older WebKit versions on stable distros |
| **Known issues** | DataTransferItemList not iterable with for...of | Transparency regression in Tauri v2 | Slow, missing features, version fragmentation |
| **Min OS version** | macOS 10.13+ | Windows 7+ (preinstalled on Win11) | Depends on distro WebKitGTK package |

### 4.2 Tauri Plugin Cross-Platform Support

| Plugin | macOS | Windows | Linux | Notes |
|--------|-------|---------|-------|-------|
| `global-shortcut` | Yes | Yes | Yes | Wayland support uncertain |
| `dialog` | Yes | Yes | Yes | |
| `fs` | Yes | Yes | Yes | |
| `shell` | Yes | Yes | Yes | |
| `clipboard-manager` | Yes | Yes | Yes | |
| `notification` | Yes | Yes | Yes | |
| `window-state` | Yes | Yes | Yes | |
| `autostart` | Yes | Yes | Yes | |
| `updater` | Yes | Yes | Yes | |
| `deep-link` | Yes | Yes | Yes | |
| `store` | Yes | Yes | Yes | |
| `sql` | Yes | Yes | Yes | Uses rusqlite |

All core Tauri 2 plugins are cross-platform (macOS, Windows, Linux). The main risk areas are:
- **WebKitGTK limitations** on Linux affecting frontend rendering
- **Wayland** breaking assumptions about global shortcuts and screen capture
- **WebView2 availability** on older Windows (7/8/10 pre-installed Edge)

---

## 5. Architecture Recommendation for vedrr

If vedrr wants to implement context capture (reading text from focused apps), this is the recommended abstraction:

```
trait ContextCapture {
    fn get_focused_element_text(&self) -> Result<String>;
    fn get_selected_text(&self) -> Result<String>;
    fn capture_screen_region(&self, rect: Rect) -> Result<Image>;
    fn capture_window(&self, window_id: WindowId) -> Result<Image>;
}

// Platform implementations:
// macOS:   macos-accessibility-client + ScreenCaptureKit
// Windows: uiautomation crate + windows-capture crate
// Linux:   atspi crate + xcap (X11) or ashpd portal (Wayland)
```

### Build Strategy

1. **Start with screen capture** -- xcap crate handles macOS + Windows + Linux(X11) well. Wayland is the gap.
2. **Add accessibility text reading per-platform** -- no cross-platform crate exists, so feature-gate behind `#[cfg(target_os)]`.
3. **Global hotkey** -- tauri-plugin-global-shortcut works everywhere that matters (macOS, Windows, Linux X11).
4. **Always-on-top overlay** -- Tauri handles this cross-platform out of the box.

### Risk Matrix

| Feature | macOS Risk | Windows Risk | Linux Risk |
|---------|-----------|-------------|------------|
| Text from other apps | Low (well-understood API, needs permission) | **Low** (UIA is robust, no permission needed) | **Medium** (AT-SPI2 coverage varies by app toolkit) |
| Screen capture | Low | Low | **High on Wayland** (portal dialog, no silent capture) |
| Global hotkey | Low | Low | **High on Wayland** (GNOME doesn't implement portal) |
| Always-on-top | Low | Low | Low (X11); Medium (Wayland) |
| WebView rendering | Low | Low | **Medium** (WebKitGTK version fragmentation) |

---

## 6. Key Takeaways

1. **Windows is the easiest platform for context capture** -- no permissions needed for UIA, screen capture, or hotkeys. The `uiautomation` Rust crate provides high-level access.

2. **Linux Wayland is the hardest platform** -- screen capture requires portal dialogs, global shortcuts are compositor-dependent (GNOME doesn't support the portal), and WebKitGTK is the weakest webview.

3. **No cross-platform accessibility consumer crate exists** -- you must use `macos-accessibility-client` / `uiautomation` / `atspi` separately and abstract behind a common trait.

4. **AccessKit is NOT what you need** -- it helps expose your own app's accessibility tree, not read from other apps.

5. **xcap is the best cross-platform screen capture crate** but Wayland support is incomplete. For Windows-specific needs, `windows-capture` is faster.

6. **ChatGPT's "Work with Apps" approach** (reading via accessibility API) is the proven model -- it works on both macOS and Windows without screenshots for text-based content.

7. **Claude Desktop's context features are still macOS-only** -- Windows and Linux lag behind, suggesting these are genuinely hard cross-platform problems.

---

## Sources

- OpenAI Help Center: Using the ChatGPT Windows app -- https://help.openai.com/en/articles/9982051-using-the-chatgpt-windows-app
- ChatGPT "Work with Apps" feature -- https://theaitrack.com/chatgpt-work-with-apps-desktop-update/
- Claude Quick Entry (macOS only) -- https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac
- uiautomation-rs (Windows UIA Rust crate) -- https://github.com/leexgone/uiautomation-rs
- atspi (Linux AT-SPI2 Rust crate) -- https://github.com/odilia-app/atspi
- AccessKit -- https://github.com/AccessKit/accesskit
- xcap (cross-platform capture) -- https://github.com/nashaofu/xcap
- windows-capture -- https://github.com/NiiightmareXD/windows-capture
- Tauri Global Shortcut plugin -- https://v2.tauri.app/plugin/global-shortcut/
- Tauri Webview Versions -- https://v2.tauri.app/reference/webview-versions/
- Tauri Window Customization -- https://v2.tauri.app/learn/window-customization/
- Wayland vs X11 2026 comparison -- https://www.glukhov.org/post/2026/01/wayland-vs-x11-comparison/
- XDG Desktop Portal GlobalShortcuts -- https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html
- AT-SPI2 (freedesktop) -- https://www.freedesktop.org/wiki/Accessibility/AT-SPI2/
- Claude Desktop Linux (unofficial) -- https://ludditus.com/2025/12/17/claude-desktop-for-linux-i-didnt-even-know-it-existed/
