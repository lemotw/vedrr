use tauri::{AppHandle, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::error::AppError;
use crate::AppState;

#[tauri::command]
pub fn get_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, AppError> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let result = stmt.query_row([&key], |row| row.get(0));
    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

#[tauri::command]
pub fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

#[tauri::command]
pub fn update_shortcut(app: AppHandle, shortcut: String) -> Result<(), AppError> {
    let gs = app.global_shortcut();

    // Unregister all existing shortcuts
    if let Err(e) = gs.unregister_all() {
        eprintln!("[shortcut] Failed to unregister shortcuts: {e}");
    }

    // Empty string = just unregister (used during recording)
    if shortcut.is_empty() {
        eprintln!("[shortcut] Unregistered all shortcuts (recording mode)");
        return Ok(());
    }

    // Register the new shortcut with the shared QC handler
    let handle = app.clone();
    gs.on_shortcut(shortcut.as_str(), move |_app, _shortcut, event| {
        super::shortcuts::handle_qc_shortcut(&handle, event);
    }).map_err(|e| AppError::Other(format!("Failed to register shortcut '{shortcut}': {e}")))?;

    eprintln!("[shortcut] Updated global shortcut: {shortcut}");
    Ok(())
}
