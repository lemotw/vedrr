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
