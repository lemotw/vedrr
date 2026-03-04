use tauri::Manager;
use tauri_plugin_global_shortcut::{ShortcutEvent, ShortcutState};

/// QC window width used for centering calculations.
const QC_WIDTH: f64 = 600.0;
/// Vertical offset from bottom of screen (clears macOS dock).
const QC_BOTTOM_MARGIN: f64 = 100.0;
/// Extra padding above dock clearance.
const QC_BOTTOM_PADDING: f64 = 80.0;

/// Shortcut callback: toggle QuickCapture window visibility and position it
/// at bottom-center of the monitor where the cursor currently is.
pub fn handle_qc_shortcut(handle: &tauri::AppHandle, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }
    let Some(qc) = handle.get_webview_window("quickcapture") else { return };

    if qc.is_visible().unwrap_or(false) {
        let _ = qc.hide();
        return;
    }

    // Position at bottom-center of the monitor where the cursor is
    if let Ok(cursor) = qc.cursor_position() {
        let target = qc.available_monitors().ok()
            .and_then(|monitors| {
                monitors.into_iter().find(|m| {
                    let pos = m.position();
                    let sz = m.size();
                    let (cx, cy) = (cursor.x as i32, cursor.y as i32);
                    cx >= pos.x && cx < pos.x + sz.width as i32
                        && cy >= pos.y && cy < pos.y + sz.height as i32
                })
            });
        if let Some(monitor) = target {
            let s = monitor.scale_factor();
            let pos = monitor.position();
            let sz = monitor.size();
            let mx = pos.x as f64 / s;
            let my = pos.y as f64 / s;
            let mw = sz.width as f64 / s;
            let mh = sz.height as f64 / s;
            let _ = qc.set_position(tauri::LogicalPosition::new(
                mx + (mw - QC_WIDTH) / 2.0,
                my + mh - QC_BOTTOM_MARGIN - QC_BOTTOM_PADDING,
            ));
        }
    }

    let _ = qc.show();
    let _ = qc.set_focus();
}
