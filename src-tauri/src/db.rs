use rusqlite::Connection;
use std::path::PathBuf;

use crate::error::AppError;

pub fn get_db_path() -> PathBuf {
    let base = dirs::home_dir().unwrap().join("vedrr").join("data");
    std::fs::create_dir_all(&base).ok();
    base.join("vedrr.db")
}

pub fn get_vault_dir() -> PathBuf {
    let dir = dirs::home_dir().unwrap().join("vedrr").join("vault");
    std::fs::create_dir_all(&dir).ok();
    dir
}

pub fn init_db(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS contexts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'active'
                CHECK (state IN ('active', 'archived')),
            tags TEXT NOT NULL DEFAULT '[]',
            root_node_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ai_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS model_cache (
            provider TEXT PRIMARY KEY,
            models_json TEXT NOT NULL,
            cached_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS node_embeddings (
            node_id           TEXT PRIMARY KEY REFERENCES tree_nodes(id) ON DELETE CASCADE,
            context_id        TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
            embedding_content BLOB NOT NULL,
            embedding_path    BLOB NOT NULL,
            input_content     TEXT NOT NULL,
            input_path        TEXT NOT NULL,
            updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_embeddings_context ON node_embeddings(context_id);

        CREATE TABLE IF NOT EXISTS vault_list (
            id                  TEXT PRIMARY KEY,
            name                TEXT NOT NULL,
            tags                TEXT NOT NULL DEFAULT '[]',
            node_count          INTEGER NOT NULL DEFAULT 0,
            original_created_at TEXT NOT NULL,
            vaulted_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS vault_embeddings (
            id                TEXT PRIMARY KEY,
            vault_id          TEXT NOT NULL REFERENCES vault_list(id) ON DELETE CASCADE,
            node_title        TEXT NOT NULL,
            node_type         TEXT NOT NULL,
            ancestor_path     TEXT NOT NULL,
            embedding_content BLOB NOT NULL,
            embedding_path    BLOB NOT NULL,
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_vault_emb_vault ON vault_embeddings(vault_id);

        CREATE TABLE IF NOT EXISTS inbox_items (
            id          TEXT PRIMARY KEY,
            content     TEXT NOT NULL,
            embedding   BLOB,
            status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'embedded', 'matched')),
            context_id  TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    ",
    )?;

    // ── Idempotent migrations ──

    // Migration: add api_key_id column to ai_profiles (fails silently if exists)
    let _ = conn.execute(
        "ALTER TABLE ai_profiles ADD COLUMN api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL",
        [],
    );

    // Migration: single-vector → dual-vector embeddings.
    // Detect old schema (single `embedding` column) and recreate with dual blobs.
    let has_old_schema = conn
        .prepare("SELECT embedding FROM node_embeddings LIMIT 0")
        .is_ok();
    if has_old_schema {
        conn.execute_batch("DROP TABLE IF EXISTS node_embeddings;")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS node_embeddings (
                node_id           TEXT PRIMARY KEY REFERENCES tree_nodes(id) ON DELETE CASCADE,
                context_id        TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
                embedding_content BLOB NOT NULL,
                embedding_path    BLOB NOT NULL,
                input_content     TEXT NOT NULL,
                input_path        TEXT NOT NULL,
                updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_embeddings_context ON node_embeddings(context_id);",
        )?;
    }

    // Migration: old vault contexts → archived (they still have tree_nodes).
    let _ = conn.execute("UPDATE contexts SET state = 'archived' WHERE state = 'vault'", []);

    Ok(())
}
