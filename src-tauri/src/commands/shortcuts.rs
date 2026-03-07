use tauri::Manager;
use tauri_plugin_global_shortcut::{ShortcutEvent, ShortcutState};

#[cfg(target_os = "macos")]
use tauri_nspanel::{tauri_panel, ManagerExt, WebviewWindowExt, StyleMask, CollectionBehavior};

#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(QCPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false
        }
    })
}

/// Convert the quickcapture window to a non-activating NSPanel.
/// Must be called once during app setup, after the window is created.
#[cfg(target_os = "macos")]
pub fn init_qc_panel(app: &tauri::AppHandle) {
    let Some(qc_window) = app.get_webview_window(QC_LABEL) else { return };

    match qc_window.to_panel::<QCPanel>() {
        Ok(panel) => {
            panel.set_style_mask(
                (StyleMask::empty().nonactivating_panel()).value()
            );
            panel.set_collection_behavior(
                (CollectionBehavior::new()
                    .can_join_all_spaces()
                    .full_screen_auxiliary()
                    .ignores_cycle())
                .value()
            );
            panel.set_hides_on_deactivate(false);
            panel.set_floating_panel(true);
            panel.set_transparent(true);
            panel.set_level(tauri_nspanel::builder::PanelLevel::Floating.value());
        }
        Err(e) => {
            eprintln!("[qc] Failed to convert QC window to NSPanel: {e}");
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn init_qc_panel(_app: &tauri::AppHandle) {}

const QC_LABEL: &str = "quickcapture";

/// QC window width used for centering calculations.
const QC_WIDTH: f64 = 600.0;
/// Vertical offset from bottom of screen (clears macOS dock).
const QC_BOTTOM_MARGIN: f64 = 100.0;
/// Extra padding above dock clearance.
const QC_BOTTOM_PADDING: f64 = 80.0;

/// Shortcut callback: toggle QuickCapture panel visibility and position it
/// at bottom-center of the monitor where the cursor currently is.
pub fn handle_qc_shortcut(handle: &tauri::AppHandle, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }

    #[cfg(target_os = "macos")]
    {
        let Ok(panel) = handle.get_webview_panel(QC_LABEL) else { return };

        if panel.is_visible() {
            panel.hide();
            return;
        }

        // Position at bottom-center of the monitor where the cursor is
        if let Some(qc) = handle.get_webview_window(QC_LABEL) {
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
        }

        panel.show_and_make_key();
    }

    #[cfg(not(target_os = "macos"))]
    {
        let Some(qc) = handle.get_webview_window(QC_LABEL) else { return };
        if qc.is_visible().unwrap_or(false) {
            let _ = qc.hide();
            return;
        }
        let _ = qc.show();
        let _ = qc.set_focus();
    }
}
