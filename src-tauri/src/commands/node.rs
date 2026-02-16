use tauri::State;

use crate::AppState;
use crate::error::MindFlowError;
use crate::models::{TreeData, TreeNode};

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

fn build_tree(
    db: &rusqlite::Connection,
    context_id: &str,
    parent_id: Option<&str>,
) -> Result<Vec<TreeData>, MindFlowError> {
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
        let children = build_tree(db, context_id, Some(&node_id))?;
        result.push(TreeData { node, children });
    }
    Ok(result)
}

#[tauri::command]
pub fn get_tree(
    state: State<'_, AppState>,
    context_id: String,
) -> Result<Option<TreeData>, MindFlowError> {
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

    let children = build_tree(&db, &context_id, Some(&root_id))?;
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
) -> Result<TreeNode, MindFlowError> {
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

    db.execute(
        "INSERT INTO tree_nodes (id, context_id, parent_id, position, node_type, title)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, context_id, parent_id, max_pos + 1, node_type, title],
    )?;

    // Touch context
    db.execute(
        "UPDATE contexts SET updated_at = datetime('now'), last_accessed_at = datetime('now') WHERE id = ?1",
        [&context_id],
    )?;

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
) -> Result<(), MindFlowError> {
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
    if let Some(nt) = node_type {
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
    Ok(())
}

#[tauri::command]
pub fn delete_node(state: State<'_, AppState>, id: String) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();

    // Recursively delete the whole subtree
    fn delete_recursive(db: &rusqlite::Connection, node_id: &str) -> Result<(), MindFlowError> {
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
        db.execute("DELETE FROM tree_nodes WHERE id = ?1", [node_id])?;
        Ok(())
    }

    delete_recursive(&db, &id)?;
    Ok(())
}

#[tauri::command]
pub fn move_node(
    state: State<'_, AppState>,
    id: String,
    new_parent_id: String,
    position: i32,
) -> Result<(), MindFlowError> {
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
    Ok(())
}
