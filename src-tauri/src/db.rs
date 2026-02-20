use rusqlite::Connection;
use std::path::PathBuf;

use crate::error::MindFlowError;

pub fn get_db_path() -> PathBuf {
    let base = dirs::home_dir().unwrap().join("MindFlow").join("data");
    std::fs::create_dir_all(&base).ok();
    base.join("mindflow.db")
}

pub fn init_db(conn: &Connection) -> Result<(), MindFlowError> {
    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS contexts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'active'
                CHECK (state IN ('active', 'archived', 'vault')),
            tags TEXT NOT NULL DEFAULT '[]',
            root_node_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tree_nodes (
            id TEXT PRIMARY KEY,
            context_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
            parent_id TEXT REFERENCES tree_nodes(id) ON DELETE SET NULL,
            position INTEGER NOT NULL DEFAULT 0,
            node_type TEXT NOT NULL DEFAULT 'text'
                CHECK (node_type IN ('text', 'markdown', 'image', 'file')),
            title TEXT NOT NULL DEFAULT '',
            content TEXT,
            file_path TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_nodes_context ON tree_nodes(context_id);
        CREATE INDEX IF NOT EXISTS idx_nodes_parent ON tree_nodes(parent_id);

        CREATE TABLE IF NOT EXISTS ai_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    ",
    )?;
    Ok(())
}
