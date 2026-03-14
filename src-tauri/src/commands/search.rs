use serde::Serialize;
use tauri::{Manager, State};

use crate::embedding;
use crate::error::AppError;
use crate::AppState;

const SETTING_SEMANTIC_SEARCH: &str = "semantic_search_enabled";

#[derive(Debug, Clone, Serialize)]
pub struct ModelStatus {
    /// "not_ready" | "downloading" | "warming_up" | "ready" | "error"
    pub status: String,
    /// 0–100
    pub progress: u8,
    /// Embedding queue: items completed in current batch
    pub queue_done: usize,
    /// Embedding queue: total items in current batch
    pub queue_total: usize,
}

#[tauri::command]
pub fn get_model_status() -> ModelStatus {
    let (code, progress, queue_done, queue_total) = embedding::get_status();
    let status = match code {
        embedding::STATUS_NOT_READY => "not_ready",
        embedding::STATUS_DOWNLOADING => "downloading",
        embedding::STATUS_WARMING_UP => "warming_up",
        embedding::STATUS_READY => "ready",
        embedding::STATUS_ERROR => "error",
        _ => "not_ready",
    };
    ModelStatus {
        status: status.to_string(),
        progress,
        queue_done,
        queue_total,
    }
}

#[tauri::command]
pub async fn ensure_embedding_model() -> Result<(), AppError> {
    tokio::task::spawn_blocking(|| embedding::ensure_model())
        .await
        .map_err(|e| AppError::Other(format!("spawn_blocking failed: {e}")))?
}

#[tauri::command]
pub async fn enable_semantic_search(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    {
        let db = state.db.lock().unwrap();
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, 'true')",
            [SETTING_SEMANTIC_SEARCH],
        )?;
    }
    // Start model download + warmup on a background thread
    tokio::task::spawn_blocking(move || {
        if let Err(e) = embedding::ensure_model() {
            eprintln!("[embedding] Model load failed: {e}");
            return;
        }
        let state = app.state::<AppState>();
        if let Err(e) = embedding::warmup_all(&state.db) {
            eprintln!("[embedding] Warmup failed: {e}");
        }
    });
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub node_id: String,
    pub node_title: String,
    pub node_type: String,
    pub context_id: String,
    pub context_name: String,
    pub ancestor_path: String,
    pub score: f32,
}

#[tauri::command]
pub fn semantic_search(
    query: String,
    top_k: usize,
    alpha: f32,
    min_score: f32,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, AppError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(vec![]);
    }

    // Clamp alpha to [0, 1]
    let alpha = alpha.clamp(0.0, 1.0);

    // 1. Embed query (no DB lock needed)
    let query_vec = embedding::embed_query(query)?;

    // 2. Load all dual embeddings for ACTIVE + ARCHIVED contexts (lock only for read)
    let rows_data: Vec<(String, Vec<u8>, Vec<u8>, String, String, String, String, String)> = {
        let db = state.db.lock().unwrap();
        let mut stmt = db.prepare(
            "SELECT ne.node_id, ne.embedding_content, ne.embedding_path, ne.input_path,
                    tn.title, tn.node_type,
                    c.id as context_id, c.name as context_name
             FROM node_embeddings ne
             JOIN tree_nodes tn ON ne.node_id = tn.id
             JOIN contexts c ON ne.context_id = c.id
             WHERE c.state IN ('active', 'archived')",
        )?;
        let rows = stmt.query_map([], |row| {
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
    }; // lock released

    // 3. Compute fused cosine similarity: alpha * content_score + (1-alpha) * path_score
    let mut scored: Vec<SearchResult> = Vec::new();

    // Score active/archived embeddings
    for (node_id, content_blob, path_blob, display_path, title, node_type, context_id, context_name) in rows_data {
        let content_vec = embedding::blob_to_vec(&content_blob);
        let path_vec = embedding::blob_to_vec(&path_blob);
        let content_score = embedding::cosine_similarity(&query_vec, &content_vec);
        let path_score = embedding::cosine_similarity(&query_vec, &path_vec);
        let score = alpha * content_score + (1.0 - alpha) * path_score;

        if score >= min_score {
            scored.push(SearchResult {
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

    // 4. Sort by score descending, take top_k
    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);

    Ok(scored)
}

/// Plain text search: LIKE match on node titles across active/archived contexts + vault embeddings.
#[tauri::command]
pub fn text_search(
    query: String,
    top_k: usize,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, AppError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(vec![]);
    }

    let db = state.db.lock().unwrap();
    // Escape LIKE metacharacters so user input is treated literally
    let escaped = query.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
    let pattern = format!("%{escaped}%");

    // Active/archived contexts
    let mut stmt = db.prepare(
        "SELECT tn.id, tn.title, tn.node_type, c.id, c.name
         FROM tree_nodes tn
         JOIN contexts c ON tn.context_id = c.id
         WHERE c.state IN ('active', 'archived')
           AND (tn.title LIKE ?1 ESCAPE '\\' OR tn.content LIKE ?1 ESCAPE '\\')
         ORDER BY tn.updated_at DESC
         LIMIT ?2",
    )?;

    let results: Vec<SearchResult> = stmt
        .query_map(rusqlite::params![pattern, top_k], |row| {
            Ok(SearchResult {
                node_id: row.get(0)?,
                node_title: row.get(1)?,
                node_type: row.get(2)?,
                context_id: row.get(3)?,
                context_name: row.get(4)?,
                ancestor_path: String::new(),
                score: 1.0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(results)
}

/// Batch-embed nodes in a context.
/// - `force = false`: only embed nodes missing from node_embeddings
/// - `force = true`: delete existing embeddings first, re-embed all nodes
#[tauri::command]
pub fn embed_context_nodes(
    context_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> Result<usize, AppError> {
    embedding::embed_context_core(&state.db, &context_id, force)
}

#[tauri::command]
pub fn embed_single_node(
    node_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    // Skip if model isn't ready — node will be embedded during warmup or next switchContext.
    let (status, _, _, _) = embedding::get_status();
    if status != embedding::STATUS_READY && status != embedding::STATUS_WARMING_UP {
        return Ok(());
    }

    // Phase 1: Read — get context_id + dual texts
    let (context_id, content_text, path_text, display_path) = {
        let db = state.db.lock().unwrap();
        let context_id: String = db
            .query_row(
                "SELECT context_id FROM tree_nodes WHERE id = ?1",
                [&node_id],
                |row| row.get(0),
            )
            .map_err(|_| AppError::NodeNotFound(node_id.clone()))?;
        let (content_text, path_text, display_path) = embedding::build_node_texts(&db, &node_id)?;
        (context_id, content_text, path_text, display_path)
    }; // lock released

    // Phase 2: Embed — CPU heavy, no lock
    let content_embeddings = embedding::embed_passages(&[content_text.clone()])?;
    let path_embeddings = embedding::embed_passages(&[path_text])?;
    let content_vec = content_embeddings
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Other("Empty content embedding result".into()))?;
    let path_vec = path_embeddings
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Other("Empty path embedding result".into()))?;
    let content_blob = embedding::vec_to_blob(&content_vec);
    let path_blob = embedding::vec_to_blob(&path_vec);

    // Phase 3: Write — re-acquire lock, upsert
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO node_embeddings
         (node_id, context_id, embedding_content, embedding_path, input_content, input_path, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        rusqlite::params![node_id, context_id, content_blob, path_blob, content_text, display_path],
    )?;

    Ok(())
}
