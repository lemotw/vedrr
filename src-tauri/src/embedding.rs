use crate::error::AppError;
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use rusqlite::Connection;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, AtomicUsize, Ordering};
use std::sync::OnceLock;

static MODEL: OnceLock<Result<TextEmbedding, String>> = OnceLock::new();

/// Model status: 0=not_ready, 1=downloading, 2=ready, 3=error, 4=warming_up
static MODEL_STATUS: AtomicU8 = AtomicU8::new(0);

/// Embed queue: context IDs waiting to be embedded (deduped on push).
static EMBED_QUEUE: std::sync::Mutex<VecDeque<String>> = std::sync::Mutex::new(VecDeque::new());
/// Total items added to current queue batch.
static QUEUE_TOTAL: AtomicUsize = AtomicUsize::new(0);
/// Items completed in current queue batch.
static QUEUE_DONE: AtomicUsize = AtomicUsize::new(0);

const MAX_PATH_CHARS: usize = 450;
const EXPECTED_MODEL_BYTES: u64 = 130_000_000; // ~130 MB for multilingual-e5-small
const MODEL_CACHE_DIR_NAME: &str = "models--intfloat--multilingual-e5-small";

pub const STATUS_NOT_READY: u8 = 0;
pub const STATUS_DOWNLOADING: u8 = 1;
pub const STATUS_READY: u8 = 2;
pub const STATUS_ERROR: u8 = 3;
pub const STATUS_WARMING_UP: u8 = 4;

/// Returns ~/vedrr/models/ and creates the directory if needed.
pub fn get_models_dir() -> PathBuf {
    let dir = dirs::home_dir().unwrap().join("vedrr").join("models");
    std::fs::create_dir_all(&dir).ok();
    dir
}

/// Check if the model files are already cached on disk.
pub fn is_model_cached() -> bool {
    let cache_dir = get_models_dir();
    let model_dir = cache_dir.join(MODEL_CACHE_DIR_NAME);
    let refs_file = model_dir.join("refs").join("main");
    if !refs_file.exists() {
        return false;
    }
    // Read the commit hash from refs/main, check if snapshot dir has model.onnx
    if let Ok(hash) = std::fs::read_to_string(&refs_file) {
        let hash = hash.trim();
        let model_file = model_dir.join("snapshots").join(hash).join("onnx").join("model.onnx");
        return model_file.exists();
    }
    false
}

/// Estimate download progress (0–100) by summing file sizes in the model cache dir.
pub fn model_download_progress() -> u8 {
    let cache_dir = get_models_dir();
    let model_dir = cache_dir.join(MODEL_CACHE_DIR_NAME);
    if !model_dir.exists() {
        return 0;
    }
    let total = dir_size(&model_dir);
    let pct = (total as f64 / EXPECTED_MODEL_BYTES as f64 * 100.0).min(99.0);
    pct as u8
}

fn dir_size(path: &std::path::Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_file() {
                total += entry.metadata().map(|m| m.len()).unwrap_or(0);
            } else if ft.is_dir() {
                total += dir_size(&entry.path());
            }
        }
    }
    total
}

/// Get current model status, download progress, and queue counts.
pub fn get_status() -> (u8, u8, usize, usize) {
    let status = MODEL_STATUS.load(Ordering::Relaxed);
    let progress = if status == STATUS_DOWNLOADING {
        model_download_progress()
    } else if status == STATUS_READY {
        100
    } else {
        0
    };
    let queue_done = QUEUE_DONE.load(Ordering::Relaxed);
    let queue_total = QUEUE_TOTAL.load(Ordering::Relaxed);
    (status, progress, queue_done, queue_total)
}

/// Initialize the model (downloads if needed). Call from a background thread.
pub fn ensure_model() -> Result<(), AppError> {
    use std::time::Instant;
    let t0 = Instant::now();
    eprintln!("[model] ensure_model START");

    // Already initialized?
    if MODEL.get().is_some() {
        let status = match MODEL.get().unwrap() {
            Ok(_) => STATUS_READY,
            Err(_) => STATUS_ERROR,
        };
        MODEL_STATUS.store(status, Ordering::Relaxed);
        eprintln!("[model] {:>6}ms  already initialized (status={})", t0.elapsed().as_millis(), status);
        return MODEL.get().unwrap().as_ref().map(|_| ()).map_err(|e| {
            AppError::Other(format!("Embedding model init failed: {e}"))
        });
    }

    MODEL_STATUS.store(STATUS_DOWNLOADING, Ordering::Relaxed);
    let result = get_model();
    match &result {
        Ok(_) => {
            eprintln!("[model] {:>6}ms  model loaded, running ONNX warmup...", t0.elapsed().as_millis());
            // Trigger ONNX graph optimization with a dummy inference.
            // First inference is ~45s regardless of input size; subsequent calls are <200ms.
            let _ = embed_passages(&["warmup".to_string()]);
            MODEL_STATUS.store(STATUS_READY, Ordering::Relaxed);
            eprintln!("[model] {:>6}ms  ONNX warmup done", t0.elapsed().as_millis());
        }
        Err(e) => {
            MODEL_STATUS.store(STATUS_ERROR, Ordering::Relaxed);
            eprintln!("[model] {:>6}ms  model load FAILED: {e}", t0.elapsed().as_millis());
        }
    }
    result.map(|_| ())
}

/// Lazily initialize and return the shared TextEmbedding model (multilingual-e5-small).
pub fn get_model() -> Result<&'static TextEmbedding, AppError> {
    let result = MODEL.get_or_init(|| {
        let cache_dir = get_models_dir();
        TextEmbedding::try_new(
            InitOptions::new(EmbeddingModel::MultilingualE5Small)
                .with_cache_dir(cache_dir)
                .with_show_download_progress(true),
        )
        .map_err(|e| format!("Failed to load embedding model: {e}"))
    });
    result
        .as_ref()
        .map_err(|e| AppError::Other(format!("Embedding model init failed: {e}")))
}

/// Embed passages (node texts). Adds "passage: " prefix per e5 convention.
pub fn embed_passages(texts: &[String]) -> Result<Vec<Vec<f32>>, AppError> {
    if texts.is_empty() {
        return Ok(vec![]);
    }
    let model = get_model()?;
    let prefixed: Vec<String> = texts
        .iter()
        .map(|t| format!("passage: {t}"))
        .collect();
    model
        .embed(prefixed, None)
        .map_err(|e| AppError::Other(format!("Embedding passages failed: {e}")))
}

/// Embed a single search query. Adds "query: " prefix per e5 convention.
pub fn embed_query(query: &str) -> Result<Vec<f32>, AppError> {
    let model = get_model()?;
    let prefixed = vec![format!("query: {query}")];
    let mut results = model
        .embed(prefixed, None)
        .map_err(|e| AppError::Other(format!("Embedding query failed: {e}")))?;
    results
        .pop()
        .ok_or_else(|| AppError::Other("Empty embedding result".into()))
}

/// Standard cosine similarity: dot(a,b) / (norm(a) * norm(b)).
/// Returns 0.0 if either vector has zero norm.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}

/// Build dual texts for a node's embeddings.
/// Returns (content_text, path_text, display_path):
/// - content_text: the node's own title (primary semantic signal)
/// - path_text: ancestor chain WITHOUT the node itself (structural context),
///   compressed (empty segments removed, consecutive duplicates collapsed),
///   truncated from root side if exceeding MAX_PATH_CHARS
/// - display_path: full "Root > ... > Node" path for UI display
pub fn build_node_texts(db: &Connection, node_id: &str) -> Result<(String, String, String), AppError> {
    let mut segments: Vec<String> = Vec::new();
    let mut current_id = node_id.to_string();

    loop {
        let result: Result<(String, Option<String>), _> = db.query_row(
            "SELECT title, parent_id FROM tree_nodes WHERE id = ?1",
            [&current_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );

        match result {
            Ok((title, parent_id)) => {
                segments.push(title);
                match parent_id {
                    Some(pid) => current_id = pid,
                    None => break,
                }
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => break,
            Err(e) => return Err(AppError::Database(e)),
        }
    }

    // Reverse to get Root > ... > Node order
    segments.reverse();

    // display_path = full path including the node itself
    let display_path = segments.join(" > ");

    // content_text = node's own title (last segment)
    let content_text = segments.last().cloned().unwrap_or_default();

    // path_text = ancestors only (exclude the node itself), compressed
    let ancestors = if segments.len() > 1 {
        &segments[..segments.len() - 1]
    } else {
        &[]
    };
    // Compress: remove empty segments, collapse consecutive duplicates
    let mut compressed: Vec<&str> = Vec::new();
    for seg in ancestors {
        let s = seg.trim();
        if s.is_empty() {
            continue;
        }
        if compressed.last().map_or(false, |prev| *prev == s) {
            continue;
        }
        compressed.push(s);
    }
    // Truncate from root side if too long
    while compressed.join(" > ").len() > MAX_PATH_CHARS && compressed.len() > 1 {
        compressed.remove(0);
    }
    let path_text = compressed.join(" > ");

    Ok((content_text, path_text, display_path))
}

/// Serialize f32 slice to little-endian bytes for SQLite BLOB storage.
pub fn vec_to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Deserialize little-endian bytes back to f32 vector.
pub fn blob_to_vec(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

/// Queue a context for background embedding. Deduplicates.
pub fn queue_embed(context_id: String) {
    let mut q = EMBED_QUEUE.lock().unwrap();
    if !q.contains(&context_id) {
        q.push_back(context_id);
        QUEUE_TOTAL.fetch_add(1, Ordering::Relaxed);
    }
}

/// Process all queued embedding requests. Returns when queue is empty.
pub fn process_embed_queue(db: &std::sync::Mutex<Connection>) {
    use std::time::Instant;
    let t0 = Instant::now();
    loop {
        let id = {
            let mut q = EMBED_QUEUE.lock().unwrap();
            q.pop_front()
        };
        match id {
            Some(id) => {
                match embed_context_core(db, &id, false) {
                    Ok(count) => {
                        eprintln!("[queue] {:>6}ms  ctx {} — {} nodes embedded",
                            t0.elapsed().as_millis(), &id[..8.min(id.len())], count);
                    }
                    Err(e) => {
                        eprintln!("[queue] {:>6}ms  ctx {} — ERROR: {e}",
                            t0.elapsed().as_millis(), &id[..8.min(id.len())]);
                    }
                }
                QUEUE_DONE.fetch_add(1, Ordering::Relaxed);
            }
            None => break,
        }
    }
}

/// Core embedding logic for a single context. Used by both Tauri command and warmup.
pub fn embed_context_core(
    db: &std::sync::Mutex<Connection>,
    context_id: &str,
    force: bool,
) -> Result<usize, AppError> {
    use std::time::Instant;
    let t0 = Instant::now();

    // If model isn't loaded yet, queue for later instead of blocking.
    let status = MODEL_STATUS.load(Ordering::Relaxed);
    if status != STATUS_READY && status != STATUS_WARMING_UP {
        eprintln!("[embed_core] queued ctx={} — model not ready (status={status})",
            &context_id[..8.min(context_id.len())]);
        queue_embed(context_id.to_string());
        return Ok(0);
    }

    // Phase 1: Read — collect node IDs + dual texts (lock held briefly)
    let texts: Vec<(String, String, String, String)> = {
        let conn = db.lock().unwrap();
        if force {
            conn.execute(
                "DELETE FROM node_embeddings WHERE context_id = ?1",
                [context_id],
            )?;
        }
        let mut stmt = conn.prepare(
            "SELECT tn.id FROM tree_nodes tn
             LEFT JOIN node_embeddings ne ON tn.id = ne.node_id
             WHERE tn.context_id = ?1 AND ne.node_id IS NULL",
        )?;
        let missing_ids: Vec<String> = stmt
            .query_map([context_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        if missing_ids.is_empty() {
            return Ok(0);
        }
        eprintln!("[embed_core] {:>6}ms  ctx={} — {} missing nodes to embed",
            t0.elapsed().as_millis(), &context_id[..8.min(context_id.len())], missing_ids.len());
        let mut result: Vec<(String, String, String, String)> = Vec::new();
        for node_id in &missing_ids {
            match build_node_texts(&conn, node_id) {
                Ok((content_text, path_text, display_path)) => {
                    result.push((node_id.clone(), content_text, path_text, display_path));
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

    eprintln!("[embed_core] {:>6}ms  texts built, starting embed ({} passages x2)...",
        t0.elapsed().as_millis(), texts.len());

    // Phase 2: Embed — CPU heavy, no lock
    let content_inputs: Vec<String> = texts.iter().map(|(_, c, _, _)| c.clone()).collect();
    let path_inputs: Vec<String> = texts.iter().map(|(_, _, p, _)| p.clone()).collect();
    let content_embeddings = embed_passages(&content_inputs)?;
    eprintln!("[embed_core] {:>6}ms  content embeddings done", t0.elapsed().as_millis());
    let path_embeddings = embed_passages(&path_inputs)?;
    eprintln!("[embed_core] {:>6}ms  path embeddings done", t0.elapsed().as_millis());

    // Phase 3: Write — re-acquire lock, insert results
    let conn = db.lock().unwrap();
    let mut insert_stmt = conn.prepare(
        "INSERT OR REPLACE INTO node_embeddings
         (node_id, context_id, embedding_content, embedding_path, input_content, input_path, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
    )?;
    let mut count = 0;
    for (i, (node_id, content_text, _path_text, display_path)) in texts.iter().enumerate() {
        if let (Some(cvec), Some(pvec)) = (content_embeddings.get(i), path_embeddings.get(i)) {
            let content_blob = vec_to_blob(cvec);
            let path_blob = vec_to_blob(pvec);
            insert_stmt.execute(rusqlite::params![
                node_id, context_id, content_blob, path_blob, content_text, display_path
            ])?;
            count += 1;
        }
    }
    eprintln!("[embed_core] {:>6}ms  DB write done ({} rows)", t0.elapsed().as_millis(), count);
    Ok(count)
}

/// Warm up: queue all active context nodes + any previously queued items, then process.
/// Called from setup background thread after ensure_model().
pub fn warmup_all(db: &std::sync::Mutex<Connection>) -> Result<(), AppError> {
    use std::time::Instant;
    let t0 = Instant::now();
    MODEL_STATUS.store(STATUS_WARMING_UP, Ordering::Relaxed);

    // Push all active contexts to queue (items queued during model loading are already there)
    let context_ids: Vec<String> = {
        let conn = db.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id FROM contexts WHERE state = 'active'")?;
        let ids = stmt.query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        ids
    };
    for id in context_ids {
        queue_embed(id);
    }

    // Reset counters AFTER merging — reflects the real queue size (including pre-queued items)
    let total = EMBED_QUEUE.lock().unwrap().len();
    QUEUE_TOTAL.store(total, Ordering::Relaxed);
    QUEUE_DONE.store(0, Ordering::Relaxed);
    eprintln!("[warmup] START — {} contexts queued", total);

    // Process all queued items
    process_embed_queue(db);

    MODEL_STATUS.store(STATUS_READY, Ordering::Relaxed);
    eprintln!("[warmup] {:>6}ms  DONE", t0.elapsed().as_millis());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_identical_vectors() {
        let v = vec![1.0, 2.0, 3.0];
        let score = cosine_similarity(&v, &v);
        assert!((score - 1.0).abs() < 1e-6, "Expected ~1.0, got {score}");
    }

    #[test]
    fn test_cosine_orthogonal_vectors() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        let score = cosine_similarity(&a, &b);
        assert!(score.abs() < 1e-6, "Expected ~0.0, got {score}");
    }

    #[test]
    fn test_cosine_zero_vector() {
        let a = vec![1.0, 2.0, 3.0];
        let zero = vec![0.0, 0.0, 0.0];
        assert_eq!(cosine_similarity(&a, &zero), 0.0);
        assert_eq!(cosine_similarity(&zero, &a), 0.0);
        assert_eq!(cosine_similarity(&zero, &zero), 0.0);
    }

    #[test]
    fn test_blob_roundtrip() {
        let original = vec![1.0_f32, -2.5, 3.14159, 0.0, f32::MAX, f32::MIN];
        let blob = vec_to_blob(&original);
        let recovered = blob_to_vec(&blob);
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_build_node_texts_path_truncation_logic() {
        // Simulate path_text truncation: 20 long ancestor segments + 1 node title
        // build_node_texts uses ancestors only (excluding the node itself) for path_text
        let ancestors: Vec<String> = (0..20)
            .map(|i| format!("Segment-{:02}-{}", i, "x".repeat(30)))
            .collect();

        // Compress: remove empty, collapse consecutive duplicates (none here)
        let compressed: Vec<&str> = ancestors.iter().map(|s| s.as_str()).collect();

        // Truncate from root side if too long
        let mut truncated = compressed.clone();
        while truncated.join(" > ").len() > MAX_PATH_CHARS && truncated.len() > 1 {
            truncated.remove(0);
        }
        let path_text = truncated.join(" > ");

        // path_text should be <= MAX_PATH_CHARS
        assert!(
            path_text.len() <= MAX_PATH_CHARS,
            "Path text length {} exceeds MAX_PATH_CHARS {}",
            path_text.len(),
            MAX_PATH_CHARS
        );

        // truncated should have fewer segments than the original
        assert!(
            truncated.len() < compressed.len(),
            "Truncated should have fewer segments ({}) than original ({})",
            truncated.len(),
            compressed.len()
        );
    }

    #[test]
    fn test_build_node_texts_short_path_no_truncation() {
        // Short paths: content_text = last segment, path_text = ancestors only
        let segments = vec![
            "Root".to_string(),
            "Child".to_string(),
            "Leaf".to_string(),
        ];

        let content_text = segments.last().unwrap().clone();
        let ancestors = &segments[..segments.len() - 1];
        let path_text = ancestors.join(" > ");
        let display_path = segments.join(" > ");

        assert_eq!(content_text, "Leaf");
        assert_eq!(path_text, "Root > Child");
        assert_eq!(display_path, "Root > Child > Leaf");
    }

    #[test]
    fn test_build_node_texts_compression() {
        // Test that empty segments and consecutive duplicates are removed
        let ancestors = vec![
            "Root".to_string(),
            "".to_string(),
            "  ".to_string(),
            "Section".to_string(),
            "Section".to_string(), // consecutive duplicate
            "Detail".to_string(),
        ];

        let mut compressed: Vec<&str> = Vec::new();
        for seg in &ancestors {
            let s = seg.trim();
            if s.is_empty() {
                continue;
            }
            if compressed.last().map_or(false, |prev| *prev == s) {
                continue;
            }
            compressed.push(s);
        }
        let path_text = compressed.join(" > ");

        assert_eq!(path_text, "Root > Section > Detail");
    }

}
