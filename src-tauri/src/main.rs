// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod error;
mod models;

use rusqlite::Connection;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub http_client: reqwest::Client,
}

fn main() {
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
        .manage(AppState {
            db: Mutex::new(conn),
            http_client,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
