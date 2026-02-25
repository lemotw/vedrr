use crate::error::AppError;
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use rusqlite::Connection;
use std::sync::OnceLock;

static MODEL: OnceLock<Result<TextEmbedding, String>> = OnceLock::new();

const MAX_PATH_CHARS: usize = 450;

/// Lazily initialize and return the shared TextEmbedding model (multilingual-e5-small).
pub fn get_model() -> Result<&'static TextEmbedding, AppError> {
    let result = MODEL.get_or_init(|| {
        TextEmbedding::try_new(
            InitOptions::new(EmbeddingModel::MultilingualE5Small)
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

/// Build ancestor path for a node: "Root > Parent > ... > Node Title".
/// If the path exceeds MAX_PATH_CHARS (450), segments are dropped from root side.
/// Returns (embedding_text, display_path):
/// - embedding_text: truncated text for embedding
/// - display_path: full path for UI display
pub fn build_ancestor_path(db: &Connection, node_id: &str) -> Result<(String, String), AppError> {
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

    let display_path = segments.join(" > ");

    // Truncate from root side if too long
    let mut truncated = segments.clone();
    while truncated.join(" > ").len() > MAX_PATH_CHARS && truncated.len() > 1 {
        truncated.remove(0);
    }
    let embedding_text = truncated.join(" > ");

    Ok((embedding_text, display_path))
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
    fn test_build_ancestor_path_truncation_logic() {
        // Test the truncation logic without a real DB:
        // Simulate what build_ancestor_path does after collecting segments.
        let segments: Vec<String> = (0..20)
            .map(|i| format!("Segment-{:02}-{}", i, "x".repeat(30)))
            .collect();

        let display_path = segments.join(" > ");

        // Truncate from root side if too long
        let mut truncated = segments.clone();
        while truncated.join(" > ").len() > MAX_PATH_CHARS && truncated.len() > 1 {
            truncated.remove(0);
        }
        let embedding_text = truncated.join(" > ");

        // display_path should contain all 20 segments
        assert_eq!(
            display_path.matches(" > ").count(),
            19,
            "Display path should have all 20 segments"
        );

        // embedding_text should be <= MAX_PATH_CHARS
        assert!(
            embedding_text.len() <= MAX_PATH_CHARS,
            "Embedding text length {} exceeds MAX_PATH_CHARS {}",
            embedding_text.len(),
            MAX_PATH_CHARS
        );

        // embedding_text should be a suffix of display_path
        assert!(
            display_path.ends_with(&embedding_text),
            "Embedding text should be a suffix of display path"
        );

        // truncated should have fewer segments than the original
        assert!(
            truncated.len() < segments.len(),
            "Truncated should have fewer segments ({}) than original ({})",
            truncated.len(),
            segments.len()
        );
    }

    #[test]
    fn test_build_ancestor_path_short_path_no_truncation() {
        // Short paths should not be truncated
        let segments = vec![
            "Root".to_string(),
            "Child".to_string(),
            "Leaf".to_string(),
        ];

        let display_path = segments.join(" > ");
        let mut truncated = segments.clone();
        while truncated.join(" > ").len() > MAX_PATH_CHARS && truncated.len() > 1 {
            truncated.remove(0);
        }
        let embedding_text = truncated.join(" > ");

        assert_eq!(display_path, "Root > Child > Leaf");
        assert_eq!(embedding_text, "Root > Child > Leaf");
    }
}
