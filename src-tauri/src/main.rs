// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod embedding;
mod error;
mod models;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub http_client: reqwest::Client,
}

fn main() {
    // Write panics to a log file (Windows GUI subsystem has no stderr)
    std::panic::set_hook(Box::new(|info| {
        let log_path = std::env::var("USERPROFILE")
            .map(|p| std::path::PathBuf::from(p).join("vedrr_crash.log"))
            .unwrap_or_else(|_| std::path::PathBuf::from("vedrr_crash.log"));
        let bt = std::backtrace::Backtrace::force_capture();
        let _ = std::fs::write(&log_path, format!("{info}\n\n{bt}"));
    }));

    let db_path = db::get_db_path();
    let conn = Connection::open(&db_path).expect("Failed to open database");
    db::init_db(&conn).expect("Failed to init database");

    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .user_agent("vedrr/0.1.0")
        .build()
        .expect("Failed to build HTTP client");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_nspanel::init())
        .manage(AppState {
            db: Mutex::new(conn),
            http_client,
        })
        .setup(|app| {
            // Copy bundled embedding model to ~/vedrr/models/ if not already cached
            if let Ok(resource_dir) = app.path().resource_dir() {
                embedding::bootstrap_bundled_model(&resource_dir);
            }

            // Eagerly load embedding model + warm up embeddings in background.
            // Delay start so the webview can initialize without CPU contention from ONNX loading.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(2));
                if let Err(e) = embedding::ensure_model() {
                    eprintln!("[embedding] Background model load failed: {e}");
                    return;
                }
                let state = handle.state::<AppState>();
                if let Err(e) = embedding::warmup_all(&state.db) {
                    eprintln!("[embedding] Warmup failed: {e}");
                }
            });

            // Convert QC window to non-activating NSPanel (must happen before shortcut registration)
            commands::shortcuts::init_qc_panel(app.handle());

            // Register Quick Capture global shortcut
            {
                let shortcut_str = {
                    let state = app.state::<AppState>();
                    let db = state.db.lock().unwrap();
                    let mut stmt = db.prepare("SELECT value FROM settings WHERE key = 'quick_capture_shortcut'").unwrap();
                    stmt.query_row([], |row| row.get::<_, String>(0))
                        .unwrap_or_else(|_| "CmdOrCtrl+Shift+Space".to_string())
                };

                let handle = app.handle().clone();
                match app.global_shortcut().on_shortcut(shortcut_str.as_str(), move |_app, _shortcut, event| {
                    commands::shortcuts::handle_qc_shortcut(&handle, event);
                }) {
                    Ok(()) => eprintln!("[shortcut] Registered global shortcut: {shortcut_str}"),
                    Err(e) => eprintln!("[shortcut] Failed to register shortcut '{shortcut_str}': {e}"),
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::context::create_context,
            commands::context::list_contexts,
            commands::context::switch_context,
            commands::context::archive_context,
            commands::context::vault_context,
            commands::context::activate_context,
            commands::context::rename_context,
            commands::context::delete_context,
            commands::context::list_vault,
            commands::context::restore_from_vault,
            commands::context::auto_vault_archived,
            commands::context::delete_vault_entry,
            commands::context::import_vault_zip,
            commands::context::export_context_zip,
            commands::node::get_tree,
            commands::node::create_node,
            commands::node::update_node,
            commands::node::delete_node,
            commands::node::move_node,
            commands::node::clone_subtree,
            commands::node::restore_nodes,
            commands::file_ops::read_file_bytes,
            commands::file_ops::save_clipboard_image,
            commands::file_ops::import_image,
            commands::file_ops::save_markdown_file,
            commands::ai::list_ai_profiles,
            commands::ai::create_ai_profile,
            commands::ai::delete_ai_profile,
            commands::ai::compact_node,
            commands::ai::create_api_key,
            commands::ai::list_api_keys,
            commands::ai::delete_api_key,
            commands::ai::get_system_prompt,
            commands::ai::set_system_prompt,
            commands::ai::list_models,
            commands::search::semantic_search,
            commands::search::text_search,
            commands::search::embed_context_nodes,
            commands::search::embed_single_node,
            commands::search::get_model_status,
            commands::search::ensure_embedding_model,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::update_shortcut,
            commands::inbox::create_inbox_item,
            commands::inbox::list_inbox_items,
            commands::inbox::delete_inbox_item,
            commands::inbox::find_similar_nodes_for_inbox,
            commands::inbox::match_inbox_to_node,
            commands::inbox::match_inbox_to_context,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // macOS: clicking dock icon when main window is hidden → show it
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { has_visible_windows, .. } = event {
                if !has_visible_windows {
                    if let Some(main) = app_handle.get_webview_window("main") {
                        let _ = main.show();
                        let _ = main.set_focus();
                    }
                }
            }
        });
}
