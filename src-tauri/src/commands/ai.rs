use tauri::State;

use crate::AppState;
use crate::error::MindFlowError;
use crate::models::{AiProfile, CompactResult, ProposedNode, TreeData, TreeNode};

// ── Keychain ─────────────────────────────────────────────

const KEYRING_SERVICE: &str = "com.mindflow.ai";

fn keyring_account(profile_id: &str) -> String {
    format!("profile_{profile_id}")
}

fn set_api_key_internal(profile_id: &str, key: &str) -> Result<(), MindFlowError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &keyring_account(profile_id))
        .map_err(|e| MindFlowError::Other(format!("Keyring error: {e}")))?;
    entry
        .set_password(key)
        .map_err(|e| MindFlowError::Other(format!("Keyring set error: {e}")))?;
    Ok(())
}

fn has_api_key_internal(profile_id: &str) -> bool {
    let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, &keyring_account(profile_id)) else {
        return false;
    };
    matches!(entry.get_password(), Ok(_))
}

fn get_api_key_internal(profile_id: &str) -> Result<String, MindFlowError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &keyring_account(profile_id))
        .map_err(|e| MindFlowError::Other(format!("Keyring error: {e}")))?;
    entry
        .get_password()
        .map_err(|e| MindFlowError::Other(format!("No API key for profile {profile_id}: {e}")))
}

fn delete_api_key_internal(profile_id: &str) {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, &keyring_account(profile_id)) {
        let _ = entry.delete_credential();
    }
}

// ── AI Profile CRUD ──────────────────────────────────────

#[tauri::command]
pub fn list_ai_profiles(
    state: State<'_, AppState>,
) -> Result<Vec<AiProfile>, MindFlowError> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT id, name, provider, model, created_at FROM ai_profiles ORDER BY created_at",
    )?;
    let profiles = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(profiles
        .into_iter()
        .map(|(id, name, provider, model, created_at)| {
            let has_api_key = has_api_key_internal(&id);
            AiProfile { id, name, provider, model, has_api_key, created_at }
        })
        .collect())
}

#[tauri::command]
pub fn create_ai_profile(
    state: State<'_, AppState>,
    name: String,
    provider: String,
    model: String,
    api_key: String,
) -> Result<AiProfile, MindFlowError> {
    let id = uuid::Uuid::new_v4().to_string();
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO ai_profiles (id, name, provider, model) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, name, provider, model],
    )?;

    if !api_key.is_empty() {
        set_api_key_internal(&id, &api_key)?;
    }

    let created_at: String = db.query_row(
        "SELECT created_at FROM ai_profiles WHERE id = ?1",
        [&id],
        |row| row.get(0),
    )?;

    Ok(AiProfile {
        id,
        name,
        provider,
        model,
        has_api_key: !api_key.is_empty(),
        created_at,
    })
}

#[tauri::command]
pub fn delete_ai_profile(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM ai_profiles WHERE id = ?1", [&id])?;
    delete_api_key_internal(&id);
    Ok(())
}

// ── Tree serialization helpers ────────────────────────────

fn build_subtree(
    db: &rusqlite::Connection,
    node_id: &str,
) -> Result<TreeData, MindFlowError> {
    let node = db.query_row(
        "SELECT id, context_id, parent_id, position, node_type, title, content, file_path, created_at, updated_at
         FROM tree_nodes WHERE id = ?1",
        [node_id],
        |row| {
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
        },
    )?;

    let mut stmt = db.prepare(
        "SELECT id FROM tree_nodes WHERE parent_id = ?1 ORDER BY position",
    )?;
    let child_ids: Vec<String> = stmt
        .query_map([node_id], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut children = Vec::new();
    for cid in child_ids {
        children.push(build_subtree(db, &cid)?);
    }

    Ok(TreeData { node, children })
}

fn get_ancestor_path(
    db: &rusqlite::Connection,
    node_id: &str,
) -> Result<Vec<String>, MindFlowError> {
    let mut path = Vec::new();
    let mut current_id = node_id.to_string();
    loop {
        let result: Result<(Option<String>, String), _> = db.query_row(
            "SELECT parent_id, title FROM tree_nodes WHERE id = ?1",
            [&current_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        match result {
            Ok((Some(pid), title)) => {
                path.push(title);
                current_id = pid;
            }
            Ok((None, title)) => {
                path.push(title);
                break;
            }
            Err(_) => break,
        }
    }
    path.reverse();
    if path.len() > 1 {
        path.pop();
    }
    Ok(path)
}

fn tree_to_prompt_text(tree: &TreeData, indent: usize) -> String {
    let prefix = "  ".repeat(indent);
    let mut lines = vec![format!(
        "{}- {} [{}]",
        prefix, tree.node.title, tree.node.node_type
    )];
    for child in &tree.children {
        lines.push(tree_to_prompt_text(child, indent + 1));
    }
    lines.join("\n")
}

fn tree_node_ids(tree: &TreeData) -> String {
    let mut entries = Vec::new();
    fn collect(t: &TreeData, out: &mut Vec<String>) {
        out.push(format!("  \"{}\": \"{}\"", t.node.id, t.node.title));
        for c in &t.children {
            collect(c, out);
        }
    }
    collect(tree, &mut entries);
    format!("{{\n{}\n}}", entries.join(",\n"))
}

fn build_prompt(ancestor_path: &[String], subtree: &TreeData) -> String {
    let path_str = ancestor_path.join(" > ");
    let tree_text = tree_to_prompt_text(subtree, 0);
    let id_map = tree_node_ids(subtree);

    format!(
        r#"你是一個知識管理助手。以下是一棵樹狀筆記的子樹。

上下文路徑：{path_str}
目標節點及其子樹：
{tree_text}

節點 ID 對照：
{id_map}

請幫我重組這棵子樹，讓結構更清晰。你可以：
- 刪除重複或不需要的節點
- 新增缺少的分類節點
- 修改節點標題讓語意更明確
- 移動節點到更合適的位置
- image/file 類型節點建議保留（有綁定檔案路徑）

重要：只回傳根節點的 children（不要包含根節點本身）。
只回傳 JSON，不要任何其他文字：
{{
  "nodes": [
    {{
      "source_id": "原始節點ID或null",
      "title": "節點標題",
      "node_type": "text",
      "children": [...]
    }}
  ]
}}

source_id 規則：
- 保留或修改的原始節點 → 填原始 id
- 全新節點 → 填 null
- 不要包含根節點本身，nodes 陣列只放根節點的直接子節點"#
    )
}

// ── LLM API call ──────────────────────────────────────────

async fn call_llm(
    provider: &str,
    model: &str,
    api_key: &str,
    prompt: &str,
) -> Result<String, MindFlowError> {
    eprintln!("[llm] ════════════════ REQUEST ════════════════");
    eprintln!("[llm] provider={provider}, model={model}");
    eprintln!("[llm] prompt:\n{prompt}");
    eprintln!("[llm] ════════════════════════════════════════");

    let client = reqwest::Client::new();

    match provider {
        "anthropic" => {
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": prompt}]
            });
            eprintln!("[llm] POST https://api.anthropic.com/v1/messages");
            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            let text = resp.text().await?;
            eprintln!("[llm] ════════════════ RESPONSE ═══════════════");
            eprintln!("[llm] status={status}");
            eprintln!("[llm] raw body:\n{text}");
            eprintln!("[llm] ════════════════════════════════════════");
            if !status.is_success() {
                return Err(MindFlowError::Other(format!(
                    "Anthropic API error {status}: {text}"
                )));
            }
            let parsed: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| MindFlowError::Other(format!("JSON parse error: {e}")))?;
            let content_text = parsed["content"][0]["text"]
                .as_str()
                .ok_or_else(|| MindFlowError::Other("No text in Anthropic response".into()))?;
            eprintln!("[llm] extracted content:\n{content_text}");
            Ok(content_text.to_string())
        }
        "openai" => {
            let body = serde_json::json!({
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"}
            });
            eprintln!("[llm] POST https://api.openai.com/v1/chat/completions");
            let resp = client
                .post("https://api.openai.com/v1/chat/completions")
                .header("Authorization", format!("Bearer {api_key}"))
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            let text = resp.text().await?;
            eprintln!("[llm] ════════════════ RESPONSE ═══════════════");
            eprintln!("[llm] status={status}");
            eprintln!("[llm] raw body:\n{text}");
            eprintln!("[llm] ════════════════════════════════════════");
            if !status.is_success() {
                return Err(MindFlowError::Other(format!(
                    "OpenAI API error {status}: {text}"
                )));
            }
            let parsed: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| MindFlowError::Other(format!("JSON parse error: {e}")))?;
            let content_text = parsed["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| MindFlowError::Other("No content in OpenAI response".into()))?;
            eprintln!("[llm] extracted content:\n{content_text}");
            Ok(content_text.to_string())
        }
        _ => Err(MindFlowError::Other(format!(
            "Unknown provider: {provider}"
        ))),
    }
}

fn parse_proposed_nodes(raw: &str) -> Result<Vec<ProposedNode>, MindFlowError> {
    let trimmed = raw.trim();
    let json_str = if trimmed.starts_with("```") {
        trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        trimmed
    };

    let parsed: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| MindFlowError::Other(format!("LLM returned invalid JSON: {e}")))?;

    let nodes_value = parsed
        .get("nodes")
        .ok_or_else(|| MindFlowError::Other("LLM JSON missing 'nodes' key".into()))?;

    let nodes: Vec<ProposedNode> = serde_json::from_value(nodes_value.clone())
        .map_err(|e| MindFlowError::Other(format!("Invalid nodes structure: {e}")))?;

    Ok(nodes)
}

// ── Main command ──────────────────────────────────────────

#[tauri::command]
pub async fn compact_node(
    state: State<'_, AppState>,
    node_id: String,
    profile_id: String,
) -> Result<CompactResult, MindFlowError> {
    eprintln!("[compact] start — node_id={node_id}, profile_id={profile_id}");

    // 1. Read profile + tree from DB
    let (subtree, ancestor_path, provider, model) = {
        let db = state.db.lock().unwrap();

        let subtree = build_subtree(&db, &node_id)?;
        let ancestor_path = get_ancestor_path(&db, &node_id)?;
        eprintln!("[compact] ancestor_path={:?}", ancestor_path);

        let (provider, model): (String, String) = db
            .query_row(
                "SELECT provider, model FROM ai_profiles WHERE id = ?1",
                [&profile_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| {
                MindFlowError::Other("AI profile not found. Create one in AI Settings.".into())
            })?;

        eprintln!("[compact] provider={provider}, model={model}");
        (subtree, ancestor_path, provider, model)
    };

    // 2. Get API key from keychain
    let api_key = get_api_key_internal(&profile_id)?;
    eprintln!("[compact] api_key_len={}", api_key.len());

    // 3. Build prompt
    let prompt = build_prompt(&ancestor_path, &subtree);
    eprintln!("[compact] prompt length={}", prompt.len());

    // 4. Call LLM
    eprintln!("[compact] calling LLM...");
    let raw_response = call_llm(&provider, &model, &api_key, &prompt).await?;
    eprintln!(
        "[compact] LLM response length={}, preview={:.200}",
        raw_response.len(),
        raw_response
    );

    // 5. Parse response
    let proposed = parse_proposed_nodes(&raw_response)?;
    eprintln!("[compact] parsed {} proposed nodes", proposed.len());

    Ok(CompactResult {
        original: subtree,
        proposed,
    })
}
