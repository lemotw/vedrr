use std::io::{Read, Write};
use tauri::State;

use crate::db;
use crate::AppState;
use crate::error::AppError;
use crate::models::{Context, ContextSummary, VaultEntry, VaultExport, VaultExportNode};

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
        "SELECT id, name, state, tags, root_node_id, created_at, updated_at FROM contexts WHERE id = ?1",
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
            })
        },
    )?;
    Ok(ctx)
}

#[tauri::command]
pub fn list_contexts(state: State<'_, AppState>) -> Result<Vec<ContextSummary>, AppError> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT c.id, c.name, c.state, c.tags, c.updated_at,
                (SELECT COUNT(*) FROM tree_nodes WHERE context_id = c.id) as node_count
         FROM contexts c
         ORDER BY
            CASE c.state WHEN 'active' THEN 0 WHEN 'archived' THEN 1 ELSE 2 END,
            c.updated_at DESC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ContextSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                state: row.get(2)?,
                tags: serde_json::from_str::<Vec<String>>(&row.get::<_, String>(3)?)
                    .unwrap_or_default(),
                updated_at: row.get(4)?,
                node_count: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn switch_context(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    // Verify context exists. No state or timestamp change — viewing doesn't count as modification.
    let exists: bool = db.query_row(
        "SELECT EXISTS(SELECT 1 FROM contexts WHERE id = ?1)",
        [&id],
        |row| row.get(0),
    )?;
    if !exists {
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

/// Export a context to a self-contained ZIP in ~/vedrr/vault/, move embeddings
/// to vault_embeddings, then delete the context row (CASCADE deletes tree_nodes
/// + node_embeddings).
#[tauri::command]
pub fn vault_context(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    vault_context_inner(&state, id)
}

#[tauri::command]
pub fn list_vault(state: State<'_, AppState>) -> Result<Vec<VaultEntry>, AppError> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT id, name, tags, node_count, original_created_at, vaulted_at
         FROM vault_list ORDER BY vaulted_at DESC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(VaultEntry {
                id: row.get(0)?,
                name: row.get(1)?,
                tags: serde_json::from_str::<Vec<String>>(&row.get::<_, String>(2)?)
                    .unwrap_or_default(),
                node_count: row.get(3)?,
                original_created_at: row.get(4)?,
                vaulted_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Restore a vault entry back to an archived context.
/// Reads the ZIP, re-creates the context + tree_nodes, extracts files,
/// then deletes the vault_list entry (CASCADE deletes vault_embeddings) + ZIP.
#[tauri::command]
pub fn restore_from_vault(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let vault_dir = db::get_vault_dir();
    let zip_path = vault_dir.join(format!("{id}.zip"));

    if !zip_path.exists() {
        return Err(AppError::Other(format!("Vault ZIP not found: {}", zip_path.display())));
    }

    // 1. Read and parse manifest from ZIP
    let zip_file = std::fs::File::open(&zip_path)?;
    let mut archive = zip::ZipArchive::new(zip_file)
        .map_err(|e| AppError::Other(format!("Failed to open ZIP: {e}")))?;

    let manifest: VaultExport = {
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|e| AppError::Other(format!("manifest.json not found in ZIP: {e}")))?;
        let mut buf = String::new();
        manifest_file.read_to_string(&mut buf)?;
        serde_json::from_str(&buf)
            .map_err(|e| AppError::Other(format!("Failed to parse manifest: {e}")))?
    };

    // 2. Extract files to ~/vedrr/files/{context_id}/
    let files_dir = dirs::home_dir()
        .unwrap()
        .join("vedrr")
        .join("files")
        .join(&id);
    std::fs::create_dir_all(&files_dir)?;

    // Map file_ref → extracted absolute path for updating tree_nodes file_path
    let mut file_ref_to_path: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| AppError::Other(format!("ZIP entry error: {e}")))?;
        let name = entry.name().to_string();
        if name.starts_with("files/") && !entry.is_dir() {
            let filename = name.strip_prefix("files/").unwrap_or(&name);
            let dest = files_dir.join(filename);
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)?;
            std::fs::write(&dest, &buf)?;
            file_ref_to_path
                .insert(name.clone(), dest.to_string_lossy().to_string());
        }
    }

    // 3. DB transaction: re-create context + tree_nodes
    let db = state.db.lock().unwrap();

    // Read vault_list metadata for tags
    let (vault_name, tags_json, original_created_at): (String, String, String) = db
        .query_row(
            "SELECT name, tags, original_created_at FROM vault_list WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| AppError::Other(format!("Vault entry not found: {id}")))?;

    db.execute_batch("BEGIN TRANSACTION")?;

    let result = (|| -> Result<(), AppError> {
        db.execute(
            "INSERT INTO contexts (id, name, state, tags, root_node_id, created_at, updated_at)
             VALUES (?1, ?2, 'archived', ?3, ?4, ?5, datetime('now'))",
            rusqlite::params![
                id,
                vault_name,
                tags_json,
                manifest.root_node_id,
                original_created_at,
            ],
        )?;

        for node in &manifest.nodes {
            let file_path = node
                .file_ref
                .as_ref()
                .and_then(|fr| file_ref_to_path.get(fr));

            db.execute(
                "INSERT INTO tree_nodes (id, context_id, parent_id, position, node_type, title, content, file_path)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    node.id,
                    id,
                    node.parent_id,
                    node.position,
                    node.node_type,
                    node.title,
                    node.content,
                    file_path,
                ],
            )?;
        }

        // DELETE vault_list entry (CASCADE deletes vault_embeddings)
        db.execute("DELETE FROM vault_list WHERE id = ?1", [&id])?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            db.execute_batch("COMMIT")?;
        }
        Err(e) => {
            let _ = db.execute_batch("ROLLBACK");
            // Clean up extracted files on failure
            let _ = std::fs::remove_dir_all(&files_dir);
            return Err(e);
        }
    }

    // 4. Delete ZIP file
    let _ = std::fs::remove_file(&zip_path);

    Ok(())
}

/// Auto-vault archived contexts that have been idle for > 1 day.
/// Called once at app startup.
#[tauri::command]
pub fn auto_vault_archived(state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    let stale_ids: Vec<(String, String)> = {
        let db = state.db.lock().unwrap();
        let mut stmt = db.prepare(
            "SELECT id, name FROM contexts
             WHERE state = 'archived'
               AND updated_at < datetime('now', '-1 day')",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    }; // lock released

    let mut vaulted_names: Vec<String> = Vec::new();
    for (ctx_id, ctx_name) in &stale_ids {
        match vault_context_inner(&state, ctx_id.clone()) {
            Ok(()) => {
                eprintln!("[auto-vault] Vaulted: {ctx_name} ({ctx_id})");
                vaulted_names.push(ctx_name.clone());
            }
            Err(e) => {
                eprintln!("[auto-vault] Failed to vault {ctx_name}: {e}");
            }
        }
    }
    Ok(vaulted_names)
}

/// Inner vault logic reused by vault_context command and auto_vault_archived.
fn vault_context_inner(state: &State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();

    let (ctx_name, tags_json, root_node_id, created_at): (String, String, String, String) = db
        .query_row(
            "SELECT name, tags, root_node_id, created_at FROM contexts WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| AppError::ContextNotFound(id.clone()))?;

    let mut node_stmt = db.prepare(
        "SELECT id, parent_id, position, node_type, title, content, file_path
         FROM tree_nodes WHERE context_id = ?1",
    )?;
    let nodes: Vec<(String, Option<String>, i32, String, String, Option<String>, Option<String>)> =
        node_stmt
            .query_map([&id], |row| {
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

    let node_count = nodes.len() as i64;

    let mut emb_stmt = db.prepare(
        "SELECT ne.node_id, ne.embedding_content, ne.embedding_path, ne.input_path,
                tn.title, tn.node_type
         FROM node_embeddings ne
         JOIN tree_nodes tn ON ne.node_id = tn.id
         WHERE ne.context_id = ?1",
    )?;
    let embeddings: Vec<(String, Vec<u8>, Vec<u8>, String, String, String)> = emb_stmt
        .query_map([&id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let vault_dir = db::get_vault_dir();
    let zip_path = vault_dir.join(format!("{id}.zip"));
    let files_base = dirs::home_dir()
        .unwrap()
        .join("vedrr")
        .join("files")
        .join(&id);

    let mut export_nodes: Vec<VaultExportNode> = Vec::new();
    let mut zip_files: Vec<(String, std::path::PathBuf)> = Vec::new();

    for (nid, parent_id, position, node_type, title, content, file_path) in &nodes {
        let file_ref = match node_type.as_str() {
            "image" => {
                if let Some(fp) = file_path {
                    let src = std::path::Path::new(fp);
                    if src.exists() {
                        let ext = src
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("png");
                        let rel = format!("files/{nid}.{ext}");
                        zip_files.push((rel.clone(), src.to_path_buf()));
                        Some(rel)
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
            "file" => {
                if let Some(fp) = file_path {
                    let src = std::path::Path::new(fp);
                    if src.exists() {
                        let filename = src
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("file");
                        let rel = format!("files/{nid}_{filename}");
                        zip_files.push((rel.clone(), src.to_path_buf()));
                        Some(rel)
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
            "markdown" => {
                if let Some(fp) = file_path {
                    let src = std::path::Path::new(fp);
                    if src.exists() {
                        let rel = format!("files/{nid}.md");
                        zip_files.push((rel.clone(), src.to_path_buf()));
                        Some(rel)
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
            _ => None,
        };

        export_nodes.push(VaultExportNode {
            id: nid.clone(),
            parent_id: parent_id.clone(),
            position: *position,
            node_type: node_type.clone(),
            title: title.clone(),
            content: content.clone(),
            file_ref,
        });
    }

    let export = VaultExport {
        version: 1,
        context_id: id.clone(),
        context_name: ctx_name.clone(),
        root_node_id: root_node_id.clone(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        nodes: export_nodes,
    };

    let manifest_json = serde_json::to_string_pretty(&export)
        .map_err(|e| AppError::Other(format!("Failed to serialize manifest: {e}")))?;

    let zip_file = std::fs::File::create(&zip_path)?;
    let mut zip_writer = zip::ZipWriter::new(zip_file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip_writer
        .start_file("manifest.json", options)
        .map_err(|e| AppError::Other(format!("ZIP error: {e}")))?;
    zip_writer.write_all(manifest_json.as_bytes())?;

    for (rel_path, src_path) in &zip_files {
        zip_writer
            .start_file(rel_path, options)
            .map_err(|e| AppError::Other(format!("ZIP error: {e}")))?;
        let mut src_file = std::fs::File::open(src_path)?;
        let mut buf = Vec::new();
        src_file.read_to_end(&mut buf)?;
        zip_writer.write_all(&buf)?;
    }

    zip_writer
        .finish()
        .map_err(|e| AppError::Other(format!("ZIP finish error: {e}")))?;

    db.execute_batch("BEGIN TRANSACTION")?;

    let result = (|| -> Result<(), AppError> {
        db.execute(
            "INSERT INTO vault_list (id, name, tags, node_count, original_created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, ctx_name, tags_json, node_count, created_at],
        )?;

        for (node_id, emb_content, emb_path, ancestor_path, node_title, node_type) in &embeddings {
            db.execute(
                "INSERT INTO vault_embeddings (id, vault_id, node_title, node_type, ancestor_path, embedding_content, embedding_path)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    node_id, id, node_title, node_type, ancestor_path, emb_content, emb_path
                ],
            )?;
        }

        db.execute("DELETE FROM contexts WHERE id = ?1", [&id])?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            db.execute_batch("COMMIT")?;
        }
        Err(e) => {
            let _ = db.execute_batch("ROLLBACK");
            let _ = std::fs::remove_file(&zip_path);
            return Err(e);
        }
    }

    if files_base.exists() {
        let _ = std::fs::remove_dir_all(&files_base);
    }

    Ok(())
}

#[tauri::command]
pub fn activate_context(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    db.execute(
        "UPDATE contexts SET state = 'active', updated_at = datetime('now') WHERE id = ?1",
        [&id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn rename_context(state: State<'_, AppState>, id: String, name: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    db.execute(
        "UPDATE contexts SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![name, id],
    )?;
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

/// Delete a vault entry and its ZIP file.
#[tauri::command]
pub fn delete_vault_entry(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    // CASCADE deletes vault_embeddings
    db.execute("DELETE FROM vault_list WHERE id = ?1", [&id])?;

    let zip_path = db::get_vault_dir().join(format!("{id}.zip"));
    if zip_path.exists() {
        std::fs::remove_file(&zip_path)?;
    }
    Ok(())
}
