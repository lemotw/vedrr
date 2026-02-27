use tauri::State;

use crate::AppState;
use crate::error::AppError;
use crate::models::{TreeData, TreeNode};
use super::file_ops::md_file_path;

fn row_to_node(row: &rusqlite::Row) -> rusqlite::Result<TreeNode> {
    Ok(TreeNode {
        id: row.get(0)?,
        context_id: row.get(1)?,
        parent_id: row.get(2)?,
        position: row.get(3)?,
        node_type: row.get(4)?,
        title: row.get(5)?,
        content: row.get(6)?,
        file_path: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

/// Touch context timestamps on any content change; also promote archived → active.
fn touch_and_promote_context(db: &rusqlite::Connection, context_id: &str) -> Result<(), AppError> {
    db.execute(
        "UPDATE contexts SET updated_at = datetime('now'), last_accessed_at = datetime('now'),
         state = CASE WHEN state = 'archived' THEN 'active' ELSE state END
         WHERE id = ?1",
        [context_id],
    )?;
    Ok(())
}

const MAX_TREE_DEPTH: u32 = 50;

fn build_tree(
    db: &rusqlite::Connection,
    context_id: &str,
    parent_id: Option<&str>,
    depth: u32,
) -> Result<Vec<TreeData>, AppError> {
    if depth > MAX_TREE_DEPTH {
        return Ok(Vec::new());
    }
    let mut stmt = db.prepare(
        "SELECT id, context_id, parent_id, position, node_type, title, content, file_path, created_at, updated_at
         FROM tree_nodes WHERE context_id = ?1 AND parent_id IS ?2
         ORDER BY position",
    )?;
    let nodes = stmt
        .query_map(rusqlite::params![context_id, parent_id], row_to_node)?
        .collect::<Result<Vec<_>, _>>()?;

    let mut result = Vec::new();
    for node in nodes {
        let node_id = node.id.clone();
        let children = build_tree(db, context_id, Some(&node_id), depth + 1)?;
        result.push(TreeData { node, children });
    }
    Ok(result)
}

#[tauri::command]
pub fn get_tree(
    state: State<'_, AppState>,
    context_id: String,
) -> Result<Option<TreeData>, AppError> {
    let db = state.db.lock().unwrap();

    // Find root node
    let root_node_id: Option<String> = db
        .query_row(
            "SELECT root_node_id FROM contexts WHERE id = ?1",
            [&context_id],
            |row| row.get(0),
        )
        .ok();

    let Some(root_id) = root_node_id else {
        return Ok(None);
    };

    let root = db.query_row(
        "SELECT id, context_id, parent_id, position, node_type, title, content, file_path, created_at, updated_at
         FROM tree_nodes WHERE id = ?1",
        [&root_id],
        row_to_node,
    )?;

    let children = build_tree(&db, &context_id, Some(&root_id), 1)?;
    Ok(Some(TreeData {
        node: root,
        children,
    }))
}

#[tauri::command]
pub fn create_node(
    state: State<'_, AppState>,
    context_id: String,
    parent_id: String,
    node_type: String,
    title: String,
) -> Result<TreeNode, AppError> {
    let db = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();

    // Get max position among siblings
    let max_pos: i32 = db
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM tree_nodes WHERE context_id = ?1 AND parent_id = ?2",
            rusqlite::params![context_id, parent_id],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    // Compute file_path for markdown nodes (file created AFTER DB insert for atomicity)
    let file_path: Option<String> = if node_type == "markdown" {
        Some(md_file_path(&context_id, &id)?.to_string_lossy().to_string())
    } else {
        None
    };

    db.execute(
        "INSERT INTO tree_nodes (id, context_id, parent_id, position, node_type, title, file_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, context_id, parent_id, max_pos + 1, node_type, title, file_path],
    )?;

    // Create .md file after successful DB insert
    if node_type == "markdown" {
        let fp = md_file_path(&context_id, &id)?;
        if let Some(parent_dir) = fp.parent() {
            std::fs::create_dir_all(parent_dir)?;
        }
        if !fp.exists() {
            std::fs::write(&fp, b"")?;
        }
    }

    // Auto-promote archived → active on content modification
    touch_and_promote_context(&db, &context_id)?;

    let node = db.query_row(
        "SELECT id, context_id, parent_id, position, node_type, title, content, file_path, created_at, updated_at
         FROM tree_nodes WHERE id = ?1",
        [&id],
        row_to_node,
    )?;
    Ok(node)
}

#[tauri::command]
pub fn update_node(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
    content: Option<String>,
    node_type: Option<String>,
    file_path: Option<String>,
) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    if let Some(t) = title {
        db.execute(
            "UPDATE tree_nodes SET title = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![t, id],
        )?;
        // If this is a root node, sync context name
        db.execute(
            "UPDATE contexts SET name = ?1, updated_at = datetime('now') WHERE root_node_id = ?2",
            rusqlite::params![t, id],
        )?;
    }
    if let Some(c) = content {
        db.execute(
            "UPDATE tree_nodes SET content = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![c, id],
        )?;
    }
    if let Some(ref nt) = node_type {
        // Read current state once (I2: single query instead of multiple)
        let (old_type, old_fp, ctx_id, old_content): (String, Option<String>, String, Option<String>) = db.query_row(
            "SELECT node_type, file_path, context_id, content FROM tree_nodes WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;

        // Only handle file lifecycle on actual type changes
        if old_type != *nt {
            // Switching TO markdown: create .md file, migrate content
            if nt == "markdown" && old_fp.is_none() {
                let fp = md_file_path(&ctx_id, &id)?;
                // DB first (C1: atomicity)
                db.execute(
                    "UPDATE tree_nodes SET file_path = ?1 WHERE id = ?2",
                    rusqlite::params![fp.to_string_lossy().to_string(), id],
                )?;
                // Create .md file — seed with existing content, don't overwrite (C2: undo safety)
                if let Some(parent_dir) = fp.parent() {
                    std::fs::create_dir_all(parent_dir)?;
                }
                if !fp.exists() {
                    let seed = old_content.unwrap_or_default();
                    std::fs::write(&fp, seed.as_bytes())?;
                }
                // Clear DB content column (I3: no stale data)
                db.execute("UPDATE tree_nodes SET content = NULL WHERE id = ?1", [&id])?;
            }

            // Switching AWAY from markdown: NULL file_path, do NOT delete file (C2: undo safety)
            if old_type == "markdown" {
                db.execute(
                    "UPDATE tree_nodes SET file_path = NULL WHERE id = ?1",
                    [&id],
                )?;
            }
        }

        db.execute(
            "UPDATE tree_nodes SET node_type = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![nt, id],
        )?;
    }
    if let Some(fp) = file_path {
        db.execute(
            "UPDATE tree_nodes SET file_path = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![fp, id],
        )?;
    }

    // Auto-promote archived → active on content modification
    let ctx_id: String = db
        .query_row(
            "SELECT context_id FROM tree_nodes WHERE id = ?1",
            [&id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NodeNotFound(id.clone()))?;
    touch_and_promote_context(&db, &ctx_id)?;

    Ok(())
}

#[tauri::command]
pub fn delete_node(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();

    // Read context_id before deletion
    let ctx_id: String = db
        .query_row(
            "SELECT context_id FROM tree_nodes WHERE id = ?1",
            [&id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NodeNotFound(id.clone()))?;

    // Recursively delete the whole subtree
    fn delete_recursive(db: &rusqlite::Connection, node_id: &str) -> Result<(), AppError> {
        let children: Vec<String> = {
            let mut stmt = db.prepare("SELECT id FROM tree_nodes WHERE parent_id = ?1")?;
            let rows = stmt
                .query_map([node_id], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        for child_id in children {
            delete_recursive(db, &child_id)?;
        }
        // Note: .md files are intentionally NOT deleted to support undo.
        // Orphan files are cleaned up separately.
        db.execute("DELETE FROM tree_nodes WHERE id = ?1", [node_id])?;
        Ok(())
    }

    delete_recursive(&db, &id)?;

    // Auto-promote archived → active on content modification
    touch_and_promote_context(&db, &ctx_id)?;

    Ok(())
}

#[tauri::command]
pub fn move_node(
    state: State<'_, AppState>,
    id: String,
    new_parent_id: String,
    position: i32,
) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    // Shift existing siblings at target
    db.execute(
        "UPDATE tree_nodes SET position = position + 1 WHERE parent_id = ?1 AND position >= ?2",
        rusqlite::params![new_parent_id, position],
    )?;
    db.execute(
        "UPDATE tree_nodes SET parent_id = ?1, position = ?2, updated_at = datetime('now') WHERE id = ?3",
        rusqlite::params![new_parent_id, position, id],
    )?;

    // Auto-promote archived → active on content modification
    let ctx_id: String = db
        .query_row(
            "SELECT context_id FROM tree_nodes WHERE id = ?1",
            [&id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NodeNotFound(id.clone()))?;
    touch_and_promote_context(&db, &ctx_id)?;

    Ok(())
}

#[tauri::command]
pub fn clone_subtree(
    state: State<'_, AppState>,
    source_id: String,
    target_parent_id: String,
    context_id: String,
) -> Result<String, AppError> {
    let db = state.db.lock().unwrap();

    // Prevent cloning a node under itself or its descendants
    fn is_descendant(db: &rusqlite::Connection, node_id: &str, ancestor_id: &str) -> bool {
        if node_id == ancestor_id { return true; }
        let parent: Option<String> = db.query_row(
            "SELECT parent_id FROM tree_nodes WHERE id = ?1",
            [node_id],
            |row| row.get(0),
        ).unwrap_or(None);
        match parent {
            Some(pid) => is_descendant(db, &pid, ancestor_id),
            None => false,
        }
    }
    if is_descendant(&db, &target_parent_id, &source_id) {
        return Err(AppError::Other("Cannot paste a node under itself or its descendants".into()));
    }

    fn clone_recursive(
        db: &rusqlite::Connection,
        source_id: &str,
        new_parent_id: &str,
        context_id: &str,
    ) -> Result<String, AppError> {
        let src = db.query_row(
            "SELECT node_type, title, content, file_path FROM tree_nodes WHERE id = ?1",
            [source_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            },
        )?;

        let new_id = uuid::Uuid::new_v4().to_string();
        let max_pos: i32 = db
            .query_row(
                "SELECT COALESCE(MAX(position), -1) FROM tree_nodes WHERE context_id = ?1 AND parent_id = ?2",
                rusqlite::params![context_id, new_parent_id],
                |row| row.get(0),
            )
            .unwrap_or(-1);

        // Copy .md file for markdown nodes — DB first, file second
        let cloned_file_path = if src.0 == "markdown" {
            if let Some(ref orig_fp) = src.3 {
                if orig_fp.ends_with(".md") && std::path::Path::new(orig_fp).exists() {
                    Some(md_file_path(context_id, &new_id)?.to_string_lossy().to_string())
                } else {
                    src.3.clone()
                }
            } else {
                None
            }
        } else {
            src.3.clone()
        };

        db.execute(
            "INSERT INTO tree_nodes (id, context_id, parent_id, position, node_type, title, content, file_path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![new_id, context_id, new_parent_id, max_pos + 1, src.0, src.1, src.2, cloned_file_path],
        )?;

        // Copy .md file after successful DB insert
        if src.0 == "markdown" {
            if let Some(ref orig_fp) = src.3 {
                if orig_fp.ends_with(".md") && std::path::Path::new(orig_fp).exists() {
                    let new_path = md_file_path(context_id, &new_id)?;
                    if let Some(parent_dir) = new_path.parent() {
                        std::fs::create_dir_all(parent_dir)?;
                    }
                    std::fs::copy(orig_fp, &new_path)?;
                }
            }
        }

        // Clone children
        let children: Vec<String> = {
            let mut stmt = db.prepare(
                "SELECT id FROM tree_nodes WHERE parent_id = ?1 ORDER BY position",
            )?;
            let rows = stmt.query_map([source_id], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        for child_id in children {
            clone_recursive(db, &child_id, &new_id, context_id)?;
        }

        Ok(new_id)
    }

    let new_root_id = clone_recursive(&db, &source_id, &target_parent_id, &context_id)?;

    // Auto-promote archived → active on content modification
    touch_and_promote_context(&db, &context_id)?;

    Ok(new_root_id)
}

#[tauri::command]
pub fn restore_nodes(
    state: State<'_, AppState>,
    nodes: Vec<TreeNode>,
) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    for node in &nodes {
        db.execute(
            "INSERT OR REPLACE INTO tree_nodes (id, context_id, parent_id, position, node_type, title, content, file_path, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                node.id, node.context_id, node.parent_id, node.position,
                node.node_type, node.title, node.content, node.file_path,
                node.created_at, node.updated_at,
            ],
        )?;
    }
    if let Some(first) = nodes.first() {
        touch_and_promote_context(&db, &first.context_id)?;
    }
    Ok(())
}
