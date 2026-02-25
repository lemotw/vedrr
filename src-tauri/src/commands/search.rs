use serde::Serialize;
use tauri::State;

use crate::embedding;
use crate::error::AppError;
use crate::AppState;

const MIN_SCORE: f32 = 0.5;

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
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, AppError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(vec![]);
    }

    // 1. Embed query (no DB lock needed)
    let query_vec = embedding::embed_query(query)?;

    // 2. Load all embeddings for ACTIVE + ARCHIVED contexts (lock only for read)
    let rows_data: Vec<(String, Vec<u8>, String, String, String, String, String)> = {
        let db = state.db.lock().unwrap();
        let mut stmt = db.prepare(
            "SELECT ne.node_id, ne.embedding, ne.input_text,
                    tn.title, tn.node_type,
                    c.id as context_id, c.name as context_name
             FROM node_embeddings ne
             JOIN tree_nodes tn ON ne.node_id = tn.id
             JOIN contexts c ON ne.context_id = c.id
             WHERE c.state IN ('active', 'archived')",
        )?;
        let collected = stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        collected
    }; // lock released

    // 3. Compute cosine similarity (no lock)
    let mut scored: Vec<SearchResult> = Vec::new();
    for (node_id, blob, input_text, title, node_type, context_id, context_name) in rows_data {
        let node_vec = embedding::blob_to_vec(&blob);
        let score = embedding::cosine_similarity(&query_vec, &node_vec);

        if score >= MIN_SCORE {
            scored.push(SearchResult {
                node_id,
                node_title: title,
                node_type,
                context_id,
                context_name,
                ancestor_path: input_text,
                score,
            });
        }
    }

    // 4. Sort by score descending, take top_k
    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);

    Ok(scored)
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
    // Phase 1: Read — collect node IDs + ancestor paths (lock held briefly)
    let texts: Vec<(String, String, String)> = {
        let db = state.db.lock().unwrap();

        if force {
            db.execute(
                "DELETE FROM node_embeddings WHERE context_id = ?1",
                [&context_id],
            )?;
        }

        let mut stmt = db.prepare(
            "SELECT tn.id FROM tree_nodes tn
             LEFT JOIN node_embeddings ne ON tn.id = ne.node_id
             WHERE tn.context_id = ?1 AND ne.node_id IS NULL",
        )?;
        let missing_ids: Vec<String> = stmt
            .query_map([&context_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        if missing_ids.is_empty() {
            return Ok(0);
        }

        let mut result: Vec<(String, String, String)> = Vec::new();
        for node_id in &missing_ids {
            match embedding::build_ancestor_path(&db, node_id) {
                Ok((embed_text, display_path)) => {
                    result.push((node_id.clone(), embed_text, display_path));
                }
                Err(e) => {
                    eprintln!("[embed] skip node {node_id}: {e}");
                }
            }
        }
        result
    }; // lock released

    if texts.is_empty() {
        return Ok(0);
    }

    // Phase 2: Embed — CPU heavy, no lock
    let embed_inputs: Vec<String> = texts.iter().map(|(_, t, _)| t.clone()).collect();
    let embeddings = embedding::embed_passages(&embed_inputs)?;

    // Phase 3: Write — re-acquire lock, insert results
    let db = state.db.lock().unwrap();
    let mut insert_stmt = db.prepare(
        "INSERT OR REPLACE INTO node_embeddings (node_id, context_id, embedding, input_text, updated_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))",
    )?;

    let mut count = 0;
    for (i, (node_id, _embed_text, display_path)) in texts.iter().enumerate() {
        if let Some(vec) = embeddings.get(i) {
            let blob = embedding::vec_to_blob(vec);
            insert_stmt.execute(rusqlite::params![node_id, context_id, blob, display_path])?;
            count += 1;
        }
    }

    Ok(count)
}

#[tauri::command]
pub fn embed_single_node(
    node_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    // Phase 1: Read — get context_id + ancestor path
    let (context_id, embed_text, display_path) = {
        let db = state.db.lock().unwrap();
        let context_id: String = db
            .query_row(
                "SELECT context_id FROM tree_nodes WHERE id = ?1",
                [&node_id],
                |row| row.get(0),
            )
            .map_err(|_| AppError::NodeNotFound(node_id.clone()))?;
        let (embed_text, display_path) = embedding::build_ancestor_path(&db, &node_id)?;
        (context_id, embed_text, display_path)
    }; // lock released

    // Phase 2: Embed — CPU heavy, no lock
    let embeddings = embedding::embed_passages(&[embed_text])?;
    let vec = embeddings
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Other("Empty embedding result".into()))?;
    let blob = embedding::vec_to_blob(&vec);

    // Phase 3: Write — re-acquire lock, upsert
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO node_embeddings (node_id, context_id, embedding, input_text, updated_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))",
        rusqlite::params![node_id, context_id, blob, display_path],
    )?;

    Ok(())
}
