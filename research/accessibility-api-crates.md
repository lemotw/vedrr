# Rust Accessibility API Crates -- Research Notes

Date: 2026-03-14

---

## 1. macOS: `accessibility` crate (by eiz) -- RECOMMENDED over `macos-accessibility-client`

**IMPORTANT**: The `macos-accessibility-client` crate (by next-slide-please) is essentially useless for reading text from other apps. It only exposes ONE function: `application_is_trusted_with_prompt()`, which checks/prompts for accessibility permissions. Version 0.0.2, migrated to Codeberg, archived on GitHub. Do not use for anything beyond the trust check.

The real crate for reading from other apps on macOS is `accessibility` (by eiz).

### `accessibility` crate

- **Version**: 0.2.0
- **Repo**: https://github.com/eiz/accessibility
- **Last updated**: Feb 2021 (old but wraps stable macOS C APIs)
- **Documentation**: 0% documented on docs.rs (must read source)
- **License**: MIT OR Apache-2.0
- **Dependencies**: `accessibility-sys`, `cocoa`, `core-foundation`, `objc`, `thiserror`

### API Surface

Two layers exist:

**Low-level (`accessibility-sys`)**: Raw FFI bindings to Apple's Accessibility C API:
```rust
// Key functions available:
AXUIElementCreateSystemWide() -> AXUIElementRef
AXUIElementCreateApplication(pid: pid_t) -> AXUIElementRef
AXUIElementCopyAttributeValue(element, attribute, &mut value) -> AXError
AXIsProcessTrusted() -> bool

// Key constants:
kAXFocusedAttribute          // "AXFocused"
kAXValueAttribute            // "AXValue"
kAXTitleAttribute             // "AXTitle"
kAXRoleAttribute              // "AXRole"
kAXSelectedTextAttribute      // "AXSelectedText"  (not confirmed in crate)
```

**High-level (`accessibility`)**: Safe wrappers via `AXUIElement` struct:

```rust
use accessibility::{AXUIElement, AXUIElementAttributes};

// Get the system-wide accessibility element
let system = AXUIElement::system_wide();

// Get an app by PID
let app = AXUIElement::application(pid);

// Get an app by bundle ID (e.g. "com.apple.Safari")
let app = AXUIElement::application_with_bundle("com.apple.Safari");
```

### AXUIElementAttributes trait (35 methods)

Key methods available on any `AXUIElement`:

```rust
// Navigation
fn children() -> Result<CFArray<AXUIElement>>
fn parent() -> Result<AXUIElement>
fn focused_window() -> Result<AXUIElement>
fn main_window() -> Result<AXUIElement>
fn windows() -> Result<CFArray<AXUIElement>>
fn visible_children() -> Result<CFArray<AXUIElement>>

// Identity
fn title() -> Result<CFString>
fn role() -> Result<CFString>
fn role_description() -> Result<CFString>
fn subrole() -> Result<CFString>
fn description() -> Result<CFString>
fn identifier() -> Result<CFString>

// State
fn focused() -> Result<CFBoolean>
fn enabled() -> Result<CFBoolean>
fn frontmost() -> Result<CFBoolean>
fn minimized() -> Result<CFBoolean>

// Value (for text fields, etc.)
fn value() -> Result<CFType>       // The text content for editable fields
fn set_value(value: &CFType) -> Result<()>

// Generic attribute access
fn attribute<T>(attribute: &AXAttribute<T>) -> Result<T>
```

### Reconstructed usage for reading text from the frontmost app

```rust
use accessibility::{AXUIElement, AXUIElementAttributes};
use accessibility_sys::kAXFocusedUIElementAttribute;
use core_foundation::string::CFString;

fn get_focused_element_text() -> Option<String> {
    let system = AXUIElement::system_wide();

    // Get the focused UI element across all apps
    let focused_attr = AXAttribute::new(&CFString::from_static_string("AXFocusedUIElement"));
    let focused: AXUIElement = system.attribute(&focused_attr).ok()?;

    // Try to get its value (works for text fields, text areas)
    let value = focused.value().ok()?;
    // value is CFType -- downcast to CFString
    let text = value.downcast::<CFString>()?;
    Some(text.to_string())
}

fn get_frontmost_app_title() -> Option<String> {
    // Alternative: iterate running apps
    let system = AXUIElement::system_wide();
    // AXFocusedApplication attribute gives the frontmost app
    let focused_app_attr = AXAttribute::new(
        &CFString::from_static_string("AXFocusedApplication")
    );
    let app: AXUIElement = system.attribute(&focused_app_attr).ok()?;
    let title = app.title().ok()?;
    Some(title.to_string())
}
```

### Tree traversal

```rust
use accessibility::{TreeWalker, TreeVisitor, TreeWalkerFlow};

struct TextCollector {
    texts: Vec<String>,
}

impl TreeVisitor for TextCollector {
    fn enter_element(&mut self, element: &AXUIElement) -> TreeWalkerFlow {
        if let Ok(role) = element.role() {
            if role.to_string() == "AXStaticText" || role.to_string() == "AXTextField" {
                if let Ok(value) = element.value() {
                    // collect text
                }
            }
        }
        TreeWalkerFlow::Continue
    }
    fn exit_element(&mut self, _: &AXUIElement) {}
}

// Walk the tree
let app = AXUIElement::application(pid);
let walker = TreeWalker::new();
walker.walk(&app, &mut TextCollector { texts: vec![] });
```

### Gotchas

- `AXUIElement` does NOT implement `Send` or `Sync` -- must use on main thread
- Requires Accessibility permission (System Settings > Privacy > Accessibility)
- Use `macos-accessibility-client::accessibility::application_is_trusted_with_prompt()` to check/prompt
- Last updated 2021 but wraps stable Apple C APIs that haven't changed
- 0% docs.rs documentation -- must read source code

---

## 2. Windows: `uiautomation` crate (by leexgone)

- **Version**: 0.24.4
- **Repo**: https://github.com/leexgone/uiautomation-rs
- **Downloads**: 221,998 total
- **License**: Apache-2.0
- **Stars**: 186
- **Dependencies**: `windows` + `windows-core` v0.62.2+
- **Maturity**: HIGH -- 120 versions published, active development, Rust edition 2024

### Core Types

```rust
use uiautomation::UIAutomation;
use uiautomation::UIElement;
use uiautomation::UITreeWalker;
use uiautomation::UIMatcher;
```

### Feature Flags

| Feature     | Purpose                      | Default   |
|-------------|------------------------------|-----------|
| `process`   | Process operations           | Disabled  |
| `input`     | Keyboard input simulation    | Enabled   |
| `control`   | Simplified element ops       | Enabled   |
| `pattern`   | UI Automation patterns       | (dep of control) |
| `event`     | Event handling               | Disabled  |
| `clipboard` | Clipboard ops                | Disabled  |
| `all`       | Everything                   | Disabled  |

### Getting the focused element and reading text

```rust
use uiautomation::UIAutomation;
use uiautomation::UIElement;
use uiautomation::patterns::UITextPattern;
use uiautomation::types::TextUnit;

fn main() -> uiautomation::Result<()> {
    let automation = UIAutomation::new()?;

    // Get the currently focused element
    let focused: UIElement = automation.get_focused_element()?;
    println!("Focused element name: {}", focused.get_name()?);
    println!("Focused element class: {}", focused.get_classname()?);

    // Try to read text via TextPattern
    if let Ok(text_pattern) = focused.get_pattern::<UITextPattern>() {
        let document_range = text_pattern.get_document_range()?;
        let all_text = document_range.get_text(-1)?;  // -1 = no limit
        println!("Full text: {}", all_text);

        // Get selected text
        let selections = text_pattern.get_selection()?;
        for range in selections {
            let selected = range.get_text(-1)?;
            println!("Selected: {}", selected);
        }
    }

    Ok(())
}
```

### UITextPattern methods

```rust
// On UITextPattern:
get_document_range() -> Result<UITextRange>       // entire document
get_selection() -> Result<Vec<UITextRange>>        // selected ranges
get_visible_ranges() -> Result<Vec<UITextRange>>   // visible text
get_range_from_point(point) -> Result<UITextRange> // text at coordinates
get_range_from_child(element) -> Result<UITextRange>
get_caret_range() -> Result<(bool, UITextRange)>   // cursor position

// On UITextRange:
get_text(max_length: i32) -> Result<String>        // THE key method
get_children() -> Result<Vec<UIElement>>
expand_to_enclosing_unit(TextUnit) -> Result<()>
find_text(text, backward, ignore_case) -> Result<UITextRange>
select() -> Result<()>
scroll_into_view(align_to_top) -> Result<()>
```

### Finding elements

```rust
let automation = UIAutomation::new()?;
let root = automation.get_root_element()?;  // desktop

// Find by class name
let matcher = automation.create_matcher()
    .from(root)
    .timeout(10000)
    .classname("Notepad");
let notepad = matcher.find_first()?;

// Send keyboard input
root.send_keys("Hello{enter}", 10)?;

// Focus change events
use uiautomation::events::*;
struct FocusHandler;
impl CustomFocusChangedEventHandler for FocusHandler {
    fn handle(&self, sender: &UIElement) -> Result<()> {
        println!("Focus: {}", sender.get_name().unwrap_or_default());
        Ok(())
    }
}
automation.add_focus_changed_event_handler(
    None,
    &UIFocusChangedEventHandler::from(FocusHandler)
)?;
```

### UIElement key methods

```rust
// Identity
get_name() -> Result<String>
get_classname() -> Result<String>
get_automation_id() -> Result<String>
get_control_type() -> Result<ControlType>
get_help_text() -> Result<String>

// Pattern access (generic)
get_pattern<T: UIPattern>() -> Result<T>

// Layout
get_bounding_rectangle() -> Result<Rect>
get_clickable_point() -> Result<Point>

// For simple value controls (not rich text):
// Use UIValuePattern
get_pattern::<UIValuePattern>()?.get_value()  // -> Result<String>
```

---

## 3. Linux: `atspi` crate (by odilia-app)

- **Version**: 0.29.0
- **Repo**: https://github.com/odilia-app/atspi
- **Stars**: 48
- **License**: Apache-2.0 OR MIT
- **Dependencies**: `zbus` v5.5+, `tokio` or `smol`
- **Maturity**: Active development (1,671 commits), part of Odilia screen reader
- **Async**: REQUIRED -- uses async zbus API

### Crate structure

```
atspi (facade crate)
  atspi-common     -- shared types (Event, State, Role, etc.)
  atspi-connection -- AccessibilityConnection abstraction
  atspi-proxies    -- D-Bus proxy interfaces
```

### Feature flags

```toml
[dependencies]
atspi = { version = "0.29", features = ["tokio"] }
# or features = ["connection", "proxies"] (defaults)
```

### Connecting to the accessibility bus

```rust
use atspi::AccessibilityConnection;

let atspi = AccessibilityConnection::new().await?;
// or from known address:
let atspi = AccessibilityConnection::from_address(bus_addr).await?;
```

### Listening for focus events (tokio)

From `examples/focused-tokio.rs` (actual repo code):

```rust
use atspi::events::object::StateChangedEvent;
use atspi::events::ObjectEvents;
use std::error::Error;
use tokio_stream::StreamExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let atspi = atspi::AccessibilityConnection::new().await?;
    atspi.register_event::<ObjectEvents>().await?;

    let events = atspi.event_stream();
    tokio::pin!(events);

    while let Some(Ok(ev)) = events.next().await {
        let Ok(change) = <StateChangedEvent>::try_from(ev) else { continue };

        if change.state == "focused".into() && change.enabled {
            let bus_name = change.item.name().expect("signal items have a bus name");
            println!("Accessible belonging to {bus_name}  focused!");
        }
    }
    Ok(())
}
```

### Getting the currently focused frame

From `examples/currently-focused-frame.rs` (actual repo code):

```rust
use std::error::Error;
use atspi::State;
use atspi_connection::set_session_accessibility;
use atspi_proxies::accessible::ObjectRefExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let atspi = atspi::AccessibilityConnection::new().await?;
    let conn = atspi.connection();
    set_session_accessibility(true).await?;

    let apps = atspi
        .root_accessible_on_registry()
        .await?
        .get_children()
        .await?;

    for app in apps.iter() {
        let proxy = app.clone().into_accessible_proxy(conn).await?;
        for frame in proxy.get_children().await? {
            if frame.is_null() { continue; }
            let frame = frame.clone().into_accessible_proxy(conn).await?;
            let state = frame.get_state().await?;
            if state.contains(State::Active) {
                println!("Active frame: '{}'", frame.name().await?);
            }
        }
    }
    Ok(())
}
```

### Reading selected text

From `examples/selected-text.rs` (actual repo code):

```rust
use atspi::{events::object::TextSelectionChangedEvent, ObjectEvents};
use atspi_proxies::{accessible::ObjectRefExt, proxy_ext::ProxyExt};
use futures_lite::stream::StreamExt;
use std::error::Error;

const ASSUME_ONLY_ONE_SELECTED_RANGE: i32 = 0;

smol_macros::main! {
    async fn main() -> Result<(), Box<dyn Error>> {
        let atspi = atspi::AccessibilityConnection::new().await?;
        let conn = atspi.connection();
        atspi.register_event::<ObjectEvents>().await?;

        let mut events = atspi.event_stream();

        while let Some(ev) = events.next().await {
            match ev {
                Ok(ev) => {
                    if let Ok(ev) = <TextSelectionChangedEvent>::try_from(ev) {
                        let text_proxy = ev
                            .item
                            .into_accessible_proxy(conn)
                            .await?
                            .proxies()
                            .await?
                            .text()
                            .await?;
                        let (start, end) =
                            text_proxy.get_selection(ASSUME_ONLY_ONE_SELECTED_RANGE).await?;
                        println!("{}", text_proxy.get_text(start, end).await?);
                    }
                }
                Err(err) => eprintln!("Error: {err}"),
            }
        }
        Ok(())
    }
}
```

### AccessibilityConnection key methods

```rust
// Core
new() -> Result<AccessibilityConnection>
connection() -> &zbus::Connection
root_accessible_on_registry() -> Result<RegistryProxy>

// Events
event_stream() -> Stream<Item = Result<Event>>
register_event::<T>() -> Result<()>
deregister_event::<T>() -> Result<()>
send_event::<T>(event) -> Result<()>

// Match rules
add_match_rule::<T>() -> Result<()>
remove_match_rule::<T>() -> Result<()>
```

### Key event types

```
atspi::events::ObjectEvents       -- parent for all object events
atspi::events::object::StateChangedEvent
atspi::events::object::TextChangedEvent
atspi::events::object::TextSelectionChangedEvent
atspi::events::FocusEvents
```

### Gotchas

- REQUIRES async runtime (tokio or smol)
- Uses D-Bus -- Linux only
- `set_session_accessibility(true)` may be needed to enable a11y on the bus
- Text access requires getting a `TextProxy` via the proxy chain:
  `event.item -> AccessibleProxy -> proxies() -> text() -> TextProxy`
- `TextProxy` methods: `get_text(start, end)`, `get_selection(n)`, etc.

---

## 4. Cross-platform active window crates

### `active-win-pos-rs`

- **Version**: 0.10
- **Repo**: https://github.com/dimusic/active-win-pos-rs
- **Platforms**: Windows, macOS, Linux (X11 + Wayland/KDE)
- **Purpose**: Get active window metadata (NOT text content)

```rust
use active_win_pos_rs::get_active_window;

fn main() {
    match get_active_window() {
        Ok(window) => {
            println!("Title: {}", window.title);
            println!("App: {}", window.app_name);
            println!("PID: {}", window.process_id);
            println!("Path: {}", window.process_path);
            println!("Window ID: {}", window.window_id);
            println!("Position: {:?}", window.position); // x, y, width, height
        }
        Err(()) => eprintln!("Failed to get active window"),
    }
}
```

**macOS caveat**: `title` is always empty unless Screen Recording permission is granted.

### `x-win`

- **Repo**: https://github.com/miniben-90/x-win
- **Platforms**: Windows, macOS, Linux
- **Purpose**: Active window info + open windows list + browser URL
- **Note**: Primarily a Node.js package (napi-rs), but has a Rust core

WindowInfo includes: id, title, process info (name, path, pid), position, memory usage, and browser URL (Windows/macOS only).

### No cross-platform accessibility text-reading crate exists

There is NO single Rust crate that wraps all three platforms for reading text from other apps via accessibility APIs. You must use platform-specific crates:

| Platform | Crate for text reading       | Crate for window info          |
|----------|------------------------------|--------------------------------|
| macOS    | `accessibility` (eiz)        | `active-win-pos-rs`            |
| Windows  | `uiautomation` (leexgone)    | `active-win-pos-rs`            |
| Linux    | `atspi` (odilia-app)         | `active-win-pos-rs`            |

`AccessKit` exists but is for PROVIDING accessibility (making your own app accessible), not for CONSUMING it (reading from other apps).

---

## 5. Summary comparison

| Aspect              | macOS (`accessibility`)    | Windows (`uiautomation`)     | Linux (`atspi`)              |
|----------------------|---------------------------|-------------------------------|------------------------------|
| Version              | 0.2.0                     | 0.24.4                       | 0.29.0                      |
| Maturity             | Low (40 commits, 2021)    | High (120 versions, active)  | Medium (1671 commits, active)|
| Async required       | No                        | No                           | Yes (tokio/smol)             |
| Get focused element  | system_wide() + attribute | get_focused_element()        | StateChangedEvent stream     |
| Read text value      | .value() on element       | TextPattern.get_text()       | TextProxy.get_text()         |
| Read selected text   | attribute("AXSelectedText")| TextPattern.get_selection()  | TextProxy.get_selection()    |
| Tree traversal       | TreeWalker + TreeVisitor  | UITreeWalker                 | get_children() recursive     |
| Send to main thread  | Required (no Send/Sync)   | Not required                 | Not required (async)         |
| Permission needed    | Accessibility permission  | None (UI Automation is open) | D-Bus (usually available)    |
| Docs quality         | 0% on docs.rs             | Good README + examples       | Good examples in repo        |

---

## 6. Risk assessment for a Tauri app

- **macOS**: The `accessibility` crate is old (2021) but wraps stable C APIs. Risk: may need maintenance fork. Alternative: use `accessibility-sys` directly with unsafe FFI.
- **Windows**: `uiautomation` is mature, actively maintained, low risk.
- **Linux**: `atspi` is actively developed, async requirement adds complexity in Tauri (needs tokio runtime coordination). Medium risk.
- **Cross-platform abstraction**: Must be built manually. Define a trait like `AccessibilityReader` with platform-specific implementations behind `#[cfg(target_os)]`.
