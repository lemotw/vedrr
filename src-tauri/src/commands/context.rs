use tauri::State;

use crate::AppState;
use crate::error::AppError;
use crate::models::{Context, ContextSummary};

#[tauri::command]
pub fn create_context(
    state: State<'_, AppState>,
    name: String,
    tags: Vec<String>,
) -> Result<Context, AppError> {
    let db = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let root_id = uuid::Uuid::new_v4().to_string();
    let tags_json = serde_json::to_string(&tags).unwrap();

    db.execute(
        "INSERT INTO contexts (id, name, tags, root_node_id) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, name, tags_json, root_id],
    )?;

    // Create root node
    db.execute(
        "INSERT INTO tree_nodes (id, context_id, node_type, title) VALUES (?1, ?2, 'text', ?3)",
        rusqlite::params![root_id, id, name],
    )?;

    let ctx = db.query_row(
        "SELECT id, name, state, tags, root_node_id, created_at, updated_at, last_accessed_at FROM contexts WHERE id = ?1",
        [&id],
        |row| {
            Ok(Context {
                id: row.get(0)?,
                name: row.get(1)?,
                state: row.get(2)?,
                tags: serde_json::from_str::<Vec<String>>(&row.get::<_, String>(3)?)
                    .unwrap_or_default(),
                root_node_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                last_accessed_at: row.get(7)?,
            })
        },
    )?;
    Ok(ctx)
}

#[tauri::command]
pub fn list_contexts(state: State<'_, AppState>) -> Result<Vec<ContextSummary>, AppError> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT c.id, c.name, c.state, c.tags, c.last_accessed_at,
                (SELECT COUNT(*) FROM tree_nodes WHERE context_id = c.id) as node_count
         FROM contexts c
         ORDER BY
            CASE c.state WHEN 'active' THEN 0 WHEN 'archived' THEN 1 ELSE 2 END,
            c.last_accessed_at DESC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ContextSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                state: row.get(2)?,
                tags: serde_json::from_str::<Vec<String>>(&row.get::<_, String>(3)?)
                    .unwrap_or_default(),
                last_accessed_at: row.get(4)?,
                node_count: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn switch_context(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    let changed = db.execute(
        "UPDATE contexts SET last_accessed_at = datetime('now'), state = CASE WHEN state IN ('archived', 'vault') THEN 'active' ELSE state END WHERE id = ?1",
        [&id],
    )?;
    if changed == 0 {
        return Err(AppError::ContextNotFound(id));
    }
    Ok(())
}

#[tauri::command]
pub fn archive_context(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    db.execute(
        "UPDATE contexts SET state = 'archived', updated_at = datetime('now') WHERE id = ?1",
        [&id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn vault_context(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    let changed = db.execute(
        "UPDATE contexts SET state = 'vault', updated_at = datetime('now') WHERE id = ?1",
        [&id],
    )?;
    if changed == 0 {
        return Err(AppError::ContextNotFound(id));
    }
    Ok(())
}

#[tauri::command]
pub fn activate_context(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    db.execute(
        "UPDATE contexts SET state = 'active', last_accessed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        [&id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn rename_context(state: State<'_, AppState>, id: String, name: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    // Update context name
    db.execute(
        "UPDATE contexts SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![name, id],
    )?;
    // Sync root node title
    db.execute(
        "UPDATE tree_nodes SET title = ?1, updated_at = datetime('now') WHERE id = (SELECT root_node_id FROM contexts WHERE id = ?2)",
        rusqlite::params![name, id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_context(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM contexts WHERE id = ?1", [&id])?;
    Ok(())
}
