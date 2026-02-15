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
}

fn main() {
    let db_path = db::get_db_path();
    let conn = Connection::open(&db_path).expect("Failed to open database");
    db::init_db(&conn).expect("Failed to init database");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            db: Mutex::new(conn),
        })
        .invoke_handler(tauri::generate_handler![
            commands::context::create_context,
            commands::context::list_contexts,
            commands::context::switch_context,
            commands::context::archive_context,
            commands::context::activate_context,
            commands::context::delete_context,
            commands::node::get_tree,
            commands::node::create_node,
            commands::node::update_node,
            commands::node::delete_node,
            commands::node::move_node,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
