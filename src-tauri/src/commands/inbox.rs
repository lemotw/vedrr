use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::embedding;
use crate::error::AppError;
use crate::models::InboxItem;
use crate::AppState;

#[tauri::command]
pub fn create_inbox_item(
    app: AppHandle,
    state: State<'_, AppState>,
    content: String,
) -> Result<InboxItem, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    {
        let db = state.db.lock().unwrap();
        db.execute(
            "INSERT INTO inbox_items (id, content, status, created_at, updated_at)
             VALUES (?1, ?2, 'pending', ?3, ?3)",
            rusqlite::params![id, content, now],
        )?;
    }

    // Async embedding — fire and forget
    let embed_id = id.clone();
    let embed_content = content.clone();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        match embed_inbox_item(&state.db, &embed_id, &embed_content) {
            Ok(()) => eprintln!("[inbox] embedded item {}", &embed_id[..8.min(embed_id.len())]),
            Err(e) => eprintln!("[inbox] embed failed for {}: {e}", &embed_id[..8.min(embed_id.len())]),
        }
    });

    Ok(InboxItem {
        id,
        content,
        status: "pending".to_string(),
        context_id: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

fn embed_inbox_item(
    db: &std::sync::Mutex<rusqlite::Connection>,
    item_id: &str,
    content: &str,
) -> Result<(), AppError> {
    embedding::ensure_model()?;
    let embeddings = embedding::embed_passages(&[content.to_string()])?;
    let embedding = embeddings.into_iter().next()
        .ok_or_else(|| AppError::Other("Empty embedding result".into()))?;
    let blob = embedding::vec_to_blob(&embedding);
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE inbox_items SET embedding = ?1, status = 'embedded', updated_at = datetime('now')
         WHERE id = ?2",
        rusqlite::params![blob, item_id],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Task 1: list_inbox_items
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_inbox_items(
    state: State<'_, AppState>,
) -> Result<Vec<InboxItem>, AppError> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT id, content, status, context_id, created_at, updated_at
         FROM inbox_items
         WHERE status != 'matched'
         ORDER BY created_at ASC",
    )?;
    let items = stmt
        .query_map([], |row| {
            Ok(InboxItem {
                id: row.get(0)?,
                content: row.get(1)?,
                status: row.get(2)?,
                context_id: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

// ---------------------------------------------------------------------------
// Task 2: delete_inbox_item
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn delete_inbox_item(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM inbox_items WHERE id = ?1", [&id])?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Task 3: find_similar_nodes_for_inbox
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct InboxSuggestion {
    pub node_id: String,
    pub node_title: String,
    pub node_type: String,
    pub context_id: String,
    pub context_name: String,
    pub ancestor_path: String,
    pub score: f32,
}

#[tauri::command]
pub fn find_similar_nodes_for_inbox(
    state: State<'_, AppState>,
    inbox_item_id: String,
    top_k: usize,
    alpha: f32,
) -> Result<Vec<InboxSuggestion>, AppError> {
    let alpha = alpha.clamp(0.0, 1.0);

    // 1. Load inbox item's embedding (single vector from embed_passages)
    let inbox_embedding: Vec<u8> = {
        let db = state.db.lock().unwrap();
        db.query_row(
            "SELECT embedding FROM inbox_items WHERE id = ?1 AND embedding IS NOT NULL",
            [&inbox_item_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::Other("Inbox item has no embedding yet".into()))?
    };
    let query_vec = embedding::blob_to_vec(&inbox_embedding);

    // 2. Load all node embeddings across active contexts
    let rows_data: Vec<(String, Vec<u8>, Vec<u8>, String, String, String, String, String)> = {
        let db = state.db.lock().unwrap();
        let mut stmt = db.prepare(
            "SELECT ne.node_id, ne.embedding_content, ne.embedding_path, ne.input_path,
                    tn.title, tn.node_type,
                    c.id as context_id, c.name as context_name
             FROM node_embeddings ne
             JOIN tree_nodes tn ON ne.node_id = tn.id
             JOIN contexts c ON ne.context_id = c.id
             WHERE c.state = 'active'",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    // 3. Compute dual-vector fusion: alpha * content_score + (1-alpha) * path_score
    let mut scored: Vec<InboxSuggestion> = Vec::new();
    for (node_id, content_blob, path_blob, display_path, title, node_type, context_id, context_name) in
        rows_data
    {
        let content_vec = embedding::blob_to_vec(&content_blob);
        let path_vec = embedding::blob_to_vec(&path_blob);
        let content_score = embedding::cosine_similarity(&query_vec, &content_vec);
        let path_score = embedding::cosine_similarity(&query_vec, &path_vec);
        let score = alpha * content_score + (1.0 - alpha) * path_score;
        if score >= 0.1 {
            scored.push(InboxSuggestion {
                node_id,
                node_title: title,
                node_type,
                context_id,
                context_name,
                ancestor_path: display_path,
                score,
            });
        }
    }

    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    scored.truncate(top_k);
    Ok(scored)
}

// ---------------------------------------------------------------------------
// Task 4: match_inbox_to_node (sibling placement after target node)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn match_inbox_to_node(
    state: State<'_, AppState>,
    inbox_item_id: String,
    target_node_id: String,
) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    let tx = db.unchecked_transaction()?;

    let content: String = tx.query_row(
        "SELECT content FROM inbox_items WHERE id = ?1",
        [&inbox_item_id],
        |row| row.get(0),
    )?;

    let (context_id, parent_id, position): (String, Option<String>, i32) = tx.query_row(
        "SELECT context_id, parent_id, position FROM tree_nodes WHERE id = ?1",
        [&target_node_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;

    let parent = parent_id
        .as_deref()
        .ok_or_else(|| AppError::Other("Cannot insert sibling of root node".into()))?;

    // Shift siblings after target to make room
    tx.execute(
        "UPDATE tree_nodes SET position = position + 1
         WHERE context_id = ?1 AND parent_id = ?2 AND position > ?3",
        rusqlite::params![context_id, parent, position],
    )?;

    let new_id = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO tree_nodes (id, context_id, parent_id, position, node_type, title)
         VALUES (?1, ?2, ?3, ?4, 'text', ?5)",
        rusqlite::params![new_id, context_id, parent, position + 1, content],
    )?;

    tx.execute(
        "UPDATE inbox_items SET status = 'matched', context_id = ?1, updated_at = datetime('now')
         WHERE id = ?2",
        rusqlite::params![context_id, inbox_item_id],
    )?;

    tx.execute(
        "UPDATE contexts SET updated_at = datetime('now'),
         state = CASE WHEN state = 'archived' THEN 'active' ELSE state END
         WHERE id = ?1",
        [&context_id],
    )?;

    tx.commit()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Task 5: match_inbox_to_context (root child placement)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn match_inbox_to_context(
    state: State<'_, AppState>,
    inbox_item_id: String,
    context_id: String,
) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    let tx = db.unchecked_transaction()?;

    let content: String = tx.query_row(
        "SELECT content FROM inbox_items WHERE id = ?1",
        [&inbox_item_id],
        |row| row.get(0),
    )?;

    let root_id: String = tx
        .query_row(
            "SELECT root_node_id FROM contexts WHERE id = ?1",
            [&context_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::Other("Context has no root node".into()))?;

    let max_pos: i32 = tx
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM tree_nodes WHERE context_id = ?1 AND parent_id = ?2",
            rusqlite::params![context_id, root_id],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    let new_id = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO tree_nodes (id, context_id, parent_id, position, node_type, title)
         VALUES (?1, ?2, ?3, ?4, 'text', ?5)",
        rusqlite::params![new_id, context_id, root_id, max_pos + 1, content],
    )?;

    tx.execute(
        "UPDATE inbox_items SET status = 'matched', context_id = ?1, updated_at = datetime('now')
         WHERE id = ?2",
        rusqlite::params![context_id, inbox_item_id],
    )?;

    tx.execute(
        "UPDATE contexts SET updated_at = datetime('now'),
         state = CASE WHEN state = 'archived' THEN 'active' ELSE state END
         WHERE id = ?1",
        [&context_id],
    )?;

    tx.commit()?;
    Ok(())
}
