use tauri::State;

use crate::AppState;
use crate::error::MindFlowError;
use crate::models::{AiProfile, ApiKey, CompactResult, ModelInfo, ProposedNode, TreeData, TreeNode};

macro_rules! debug_log {
    ($($arg:tt)*) => {
        #[cfg(debug_assertions)]
        eprintln!($($arg)*)
    };
}

// ── Keychain ─────────────────────────────────────────────

const KEYRING_SERVICE: &str = "com.mindflow.ai";

fn apikey_keyring_account(id: &str) -> String {
    format!("apikey_{id}")
}

fn set_apikey_secret(id: &str, key: &str) -> Result<(), MindFlowError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &apikey_keyring_account(id))
        .map_err(|e| MindFlowError::Other(format!("Keyring error: {e}")))?;
    entry
        .set_password(key)
        .map_err(|e| MindFlowError::Other(format!("Keyring set error: {e}")))?;
    Ok(())
}

fn get_apikey_secret(id: &str) -> Result<String, MindFlowError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &apikey_keyring_account(id))
        .map_err(|e| MindFlowError::Other(format!("Keyring error: {e}")))?;
    entry
        .get_password()
        .map_err(|e| MindFlowError::Other(format!("No API key secret for {id}: {e}")))
}

fn delete_apikey_secret(id: &str) {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, &apikey_keyring_account(id)) {
        let _ = entry.delete_credential();
    }
}

// Migration: old profile-level keychain lookup
fn get_legacy_profile_secret(profile_id: &str) -> Result<String, MindFlowError> {
    let account = format!("profile_{profile_id}");
    let entry = keyring::Entry::new(KEYRING_SERVICE, &account)
        .map_err(|e| MindFlowError::Other(format!("Keyring error: {e}")))?;
    entry
        .get_password()
        .map_err(|e| MindFlowError::Other(format!("No legacy key for profile {profile_id}: {e}")))
}

// Migration: old provider-level keychain lookup
fn get_legacy_provider_secret(provider: &str) -> Result<String, MindFlowError> {
    let account = format!("provider_{provider}");
    let entry = keyring::Entry::new(KEYRING_SERVICE, &account)
        .map_err(|e| MindFlowError::Other(format!("Keyring error: {e}")))?;
    entry
        .get_password()
        .map_err(|e| MindFlowError::Other(format!("No legacy key for provider {provider}: {e}")))
}

// ── API Key CRUD ────────────────────────────────────────

#[tauri::command]
pub fn create_api_key(
    state: State<'_, AppState>,
    name: String,
    provider: String,
    api_key: String,
) -> Result<ApiKey, MindFlowError> {
    let id = uuid::Uuid::new_v4().to_string();
    set_apikey_secret(&id, &api_key)?;

    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO api_keys (id, name, provider) VALUES (?1, ?2, ?3)",
        rusqlite::params![id, name, provider],
    )?;

    let created_at: String = db.query_row(
        "SELECT created_at FROM api_keys WHERE id = ?1",
        [&id],
        |row| row.get(0),
    )?;

    Ok(ApiKey { id, name, provider, created_at })
}

#[tauri::command]
pub fn list_api_keys(
    state: State<'_, AppState>,
) -> Result<Vec<ApiKey>, MindFlowError> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT id, name, provider, created_at FROM api_keys ORDER BY created_at",
    )?;
    let keys = stmt
        .query_map([], |row| {
            Ok(ApiKey {
                id: row.get(0)?,
                name: row.get(1)?,
                provider: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(keys)
}

#[tauri::command]
pub fn delete_api_key(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();
    // Nullify profiles referencing this key
    db.execute(
        "UPDATE ai_profiles SET api_key_id = NULL WHERE api_key_id = ?1",
        [&id],
    )?;
    db.execute("DELETE FROM api_keys WHERE id = ?1", [&id])?;
    delete_apikey_secret(&id);
    Ok(())
}

// ── AI Profile CRUD ──────────────────────────────────────

#[tauri::command]
pub fn list_ai_profiles(
    state: State<'_, AppState>,
) -> Result<Vec<AiProfile>, MindFlowError> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare(
        "SELECT p.id, p.name, p.api_key_id, k.name, COALESCE(k.provider, p.provider), p.model, p.created_at
         FROM ai_profiles p
         LEFT JOIN api_keys k ON p.api_key_id = k.id
         ORDER BY p.created_at",
    )?;
    let profiles = stmt
        .query_map([], |row| {
            Ok(AiProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                api_key_id: row.get(2)?,
                api_key_name: row.get(3)?,
                provider: row.get(4)?,
                model: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(profiles)
}

#[tauri::command]
pub fn create_ai_profile(
    state: State<'_, AppState>,
    name: String,
    api_key_id: String,
    model: String,
) -> Result<AiProfile, MindFlowError> {
    let db = state.db.lock().unwrap();

    // Look up api_key to get provider
    let (provider, api_key_name): (String, String) = db
        .query_row(
            "SELECT provider, name FROM api_keys WHERE id = ?1",
            [&api_key_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| MindFlowError::Other("API key not found".into()))?;

    let id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO ai_profiles (id, name, provider, model, api_key_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, name, provider, model, api_key_id],
    )?;

    let created_at: String = db.query_row(
        "SELECT created_at FROM ai_profiles WHERE id = ?1",
        [&id],
        |row| row.get(0),
    )?;

    Ok(AiProfile {
        id,
        name,
        api_key_id: Some(api_key_id),
        api_key_name: Some(api_key_name),
        provider,
        model,
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
    Ok(())
}

// ── System Prompt CRUD ───────────────────────────────────

#[tauri::command]
pub fn get_system_prompt(state: State<'_, AppState>) -> Result<String, MindFlowError> {
    let db = state.db.lock().unwrap();
    let result: Result<String, _> = db.query_row(
        "SELECT value FROM ai_settings WHERE key = 'system_prompt'",
        [],
        |r| r.get(0),
    );
    Ok(result.unwrap_or_else(|_| SYSTEM_PROMPT.to_string()))
}

#[tauri::command]
pub fn set_system_prompt(
    state: State<'_, AppState>,
    prompt: String,
) -> Result<(), MindFlowError> {
    let db = state.db.lock().unwrap();
    if prompt.is_empty() {
        // Reset to default: delete custom prompt so get_system_prompt falls back to SYSTEM_PROMPT
        db.execute(
            "DELETE FROM ai_settings WHERE key = 'system_prompt'",
            [],
        )?;
    } else {
        db.execute(
            "INSERT OR REPLACE INTO ai_settings (key, value) VALUES ('system_prompt', ?1)",
            [&prompt],
        )?;
    }
    Ok(())
}

// ── List Models (dynamic fetch + 1-day cache) ────────────

fn is_cache_fresh(cached_at: &str) -> bool {
    use chrono::{NaiveDateTime, Utc};
    let fmt = "%Y-%m-%d %H:%M:%S";
    match NaiveDateTime::parse_from_str(cached_at, fmt) {
        Ok(ts) => {
            let age = Utc::now().naive_utc() - ts;
            age.num_hours() < 24
        }
        Err(_) => false,
    }
}

async fn fetch_models_from_provider(
    client: &reqwest::Client,
    provider: &str,
    secret: &str,
) -> Result<Vec<ModelInfo>, MindFlowError> {
    match provider {
        "anthropic" => {
            let resp = client
                .get("https://api.anthropic.com/v1/models")
                .header("x-api-key", secret)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await?;
            let status = resp.status();
            let text = resp.text().await?;
            if !status.is_success() {
                return Err(MindFlowError::Other(format!(
                    "Anthropic list models: HTTP {status}"
                )));
            }
            let parsed: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| MindFlowError::Other(format!("JSON parse error: {e}")))?;
            let data = parsed["data"]
                .as_array()
                .ok_or_else(|| MindFlowError::Other("No data array in Anthropic response".into()))?;
            let mut models: Vec<ModelInfo> = data
                .iter()
                .filter_map(|m| {
                    let id = m["id"].as_str()?;
                    if !id.contains("claude") {
                        return None;
                    }
                    let name = m["display_name"]
                        .as_str()
                        .unwrap_or(id)
                        .to_string();
                    Some(ModelInfo { id: id.to_string(), name })
                })
                .collect();
            models.sort_by(|a, b| a.name.cmp(&b.name));
            Ok(models)
        }
        "openai" => {
            let resp = client
                .get("https://api.openai.com/v1/models")
                .header("Authorization", format!("Bearer {secret}"))
                .send()
                .await?;
            let status = resp.status();
            let text = resp.text().await?;
            if !status.is_success() {
                return Err(MindFlowError::Other(format!(
                    "OpenAI list models: HTTP {status}"
                )));
            }
            let parsed: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| MindFlowError::Other(format!("JSON parse error: {e}")))?;
            let data = parsed["data"]
                .as_array()
                .ok_or_else(|| MindFlowError::Other("No data array in OpenAI response".into()))?;
            let prefixes = ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1", "o3", "o4-mini"];
            let mut models: Vec<ModelInfo> = data
                .iter()
                .filter_map(|m| {
                    let id = m["id"].as_str()?;
                    // Match prefix exactly or prefix followed by '-' (e.g. "o1-mini" but not "o10-xxx")
                    let matches_prefix = prefixes.iter().any(|p| {
                        id == *p || id.starts_with(&format!("{p}-"))
                    });
                    if !matches_prefix {
                        return None;
                    }
                    // Skip fine-tuned models
                    if id.contains(":ft-") || id.contains("ft:") {
                        return None;
                    }
                    Some(ModelInfo { id: id.to_string(), name: id.to_string() })
                })
                .collect();
            models.sort_by(|a, b| a.name.cmp(&b.name));
            Ok(models)
        }
        "gemini" => {
            let resp = client
                .get("https://generativelanguage.googleapis.com/v1beta/models")
                .header("x-goog-api-key", secret)
                .send()
                .await?;
            let status = resp.status();
            let text = resp.text().await?;
            if !status.is_success() {
                return Err(MindFlowError::Other(format!(
                    "Gemini list models: HTTP {status}"
                )));
            }
            let parsed: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| MindFlowError::Other(format!("JSON parse error: {e}")))?;
            let arr = parsed["models"]
                .as_array()
                .ok_or_else(|| MindFlowError::Other("No models array in Gemini response".into()))?;
            let mut models: Vec<ModelInfo> = arr
                .iter()
                .filter_map(|m| {
                    // Only include models that support generateContent
                    let methods = m["supportedGenerationMethods"].as_array()?;
                    let supports_generate = methods
                        .iter()
                        .any(|v| v.as_str() == Some("generateContent"));
                    if !supports_generate {
                        return None;
                    }
                    let raw_name = m["name"].as_str()?;
                    let id = raw_name.strip_prefix("models/").unwrap_or(raw_name);
                    let display = m["displayName"].as_str().unwrap_or(id).to_string();
                    Some(ModelInfo { id: id.to_string(), name: display })
                })
                .collect();
            models.sort_by(|a, b| a.name.cmp(&b.name));
            Ok(models)
        }
        _ => Err(MindFlowError::Other(format!(
            "Unknown provider: {provider}"
        ))),
    }
}

#[tauri::command]
pub async fn list_models(
    state: State<'_, AppState>,
    api_key_id: String,
) -> Result<Vec<ModelInfo>, MindFlowError> {
    // 1. Look up provider + check cache (single lock)
    let (provider, cached) = {
        let db = state.db.lock().unwrap();
        let provider: String = db
            .query_row(
                "SELECT provider FROM api_keys WHERE id = ?1",
                [&api_key_id],
                |row| row.get(0),
            )
            .map_err(|_| MindFlowError::Other("API key not found".into()))?;

        let cached = {
            let result: Result<(String, String), _> = db.query_row(
                "SELECT models_json, cached_at FROM model_cache WHERE provider = ?1",
                [&provider],
                |row| Ok((row.get(0)?, row.get(1)?)),
            );
            match result {
                Ok((json, cached_at)) if is_cache_fresh(&cached_at) => {
                    match serde_json::from_str::<Vec<ModelInfo>>(&json) {
                        Ok(models) => Some(models),
                        Err(e) => {
                            debug_log!("[list_models] cache JSON corrupt for {provider}: {e}");
                            None
                        }
                    }
                }
                _ => None,
            }
        };
        (provider, cached)
    };

    if let Some(models) = cached {
        debug_log!("[list_models] cache hit for provider={provider}, {} models", models.len());
        return Ok(models);
    }

    // 3. Get secret from keychain
    let secret = get_apikey_secret(&api_key_id)?;

    // 4. Fetch from provider API
    debug_log!("[list_models] cache miss for provider={provider}, fetching...");
    let models = fetch_models_from_provider(&state.http_client, &provider, &secret).await?;
    debug_log!("[list_models] fetched {} models for {provider}", models.len());

    // 5. Cache result (fail-open: log error but still return models)
    if let Ok(json) = serde_json::to_string(&models) {
        let db = state.db.lock().unwrap();
        if let Err(e) = db.execute(
            "INSERT OR REPLACE INTO model_cache (provider, models_json, cached_at) VALUES (?1, ?2, datetime('now'))",
            rusqlite::params![provider, json],
        ) {
            debug_log!("[list_models] cache write failed for {provider}: {e}");
        }
    }

    Ok(models)
}

// ── Tree serialization helpers ────────────────────────────

const MAX_SUBTREE_DEPTH: u32 = 30;

fn build_subtree(
    db: &rusqlite::Connection,
    node_id: &str,
) -> Result<TreeData, MindFlowError> {
    build_subtree_inner(db, node_id, 0)
}

fn build_subtree_inner(
    db: &rusqlite::Connection,
    node_id: &str,
    depth: u32,
) -> Result<TreeData, MindFlowError> {
    if depth > MAX_SUBTREE_DEPTH {
        return Err(MindFlowError::Other(
            format!("子樹深度超過上限 ({MAX_SUBTREE_DEPTH})，請選擇較小的子樹。")
        ));
    }
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
        children.push(build_subtree_inner(db, &cid, depth + 1)?);
    }

    Ok(TreeData { node, children })
}

fn get_ancestor_path(
    db: &rusqlite::Connection,
    node_id: &str,
) -> Result<Vec<String>, MindFlowError> {
    let mut path = Vec::new();
    let mut current_id = node_id.to_string();
    let mut visited = std::collections::HashSet::new();
    loop {
        if !visited.insert(current_id.clone()) {
            return Err(MindFlowError::Other("Circular reference detected in tree".into()));
        }
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
            Err(e) => return Err(MindFlowError::Database(e)),
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

const MAX_SUBTREE_NODES: usize = 200;

fn count_nodes(tree: &TreeData) -> usize {
    1 + tree.children.iter().map(count_nodes).sum::<usize>()
}

const SYSTEM_PROMPT: &str = r#"你是一個知識管理助手，專門協助重組樹狀筆記結構。
你必須嚴格回傳符合指定格式的 JSON，不要包含任何其他文字。
source_id 必須使用節點 ID 對照表中的真實 ID，禁止虛構不存在的 ID。
node_type 只能是 text/markdown/image/file 其中之一。
image/file 類型節點必須保留（有綁定檔案路徑）。"#;

fn build_user_prompt(ancestor_path: &[String], subtree: &TreeData) -> String {
    let path_str = ancestor_path.join(" > ");
    let tree_text = tree_to_prompt_text(subtree, 0);
    let id_map = tree_node_ids(subtree);

    format!(
        r#"以下是一棵樹狀筆記的子樹。

上下文路徑：{path_str}
目標節點及其子樹：
{tree_text}

節點 ID 對照（source_id 必須從此表選取，不可自行編造）：
{id_map}

請幫我重組這棵子樹，讓結構更清晰。你可以：
- 刪除重複或不需要的節點
- 新增缺少的分類節點
- 修改節點標題讓語意更明確
- 移動節點到更合適的位置

重要：只回傳根節點的 children（不要包含根節點本身）。
只回傳 JSON：
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
- 全新節點 → 填 null"#
    )
}

// ── LLM API call ──────────────────────────────────────────

async fn call_llm(
    client: &reqwest::Client,
    provider: &str,
    model: &str,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, MindFlowError> {
    debug_log!("[llm] ════════════════ REQUEST ════════════════");
    debug_log!("[llm] provider={provider}, model={model}");
    debug_log!("[llm] system_prompt length={}", system_prompt.len());
    debug_log!("[llm] user_prompt length={}", user_prompt.len());
    debug_log!("[llm] ════════════════════════════════════════");

    match provider {
        "anthropic" => {
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 4096,
                "temperature": 0,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}]
            });
            debug_log!("[llm] POST https://api.anthropic.com/v1/messages");
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
            debug_log!("[llm] ════════════════ RESPONSE ═══════════════");
            debug_log!("[llm] status={status}");
            debug_log!("[llm] raw body:\n{text}");
            debug_log!("[llm] ════════════════════════════════════════");
            if !status.is_success() {
                debug_log!("[llm] Anthropic error body: {text}");
                return Err(MindFlowError::Other(format!(
                    "Anthropic API error: HTTP {status}"
                )));
            }
            let parsed: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| MindFlowError::Other(format!("JSON parse error: {e}")))?;
            let content_text = parsed["content"][0]["text"]
                .as_str()
                .ok_or_else(|| MindFlowError::Other("No text in Anthropic response".into()))?;
            debug_log!("[llm] extracted content:\n{content_text}");
            Ok(content_text.to_string())
        }
        "openai" => {
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 4096,
                "temperature": 0,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "response_format": {"type": "json_object"}
            });
            debug_log!("[llm] POST https://api.openai.com/v1/chat/completions");
            let resp = client
                .post("https://api.openai.com/v1/chat/completions")
                .header("Authorization", format!("Bearer {api_key}"))
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            let text = resp.text().await?;
            debug_log!("[llm] ════════════════ RESPONSE ═══════════════");
            debug_log!("[llm] status={status}");
            debug_log!("[llm] raw body:\n{text}");
            debug_log!("[llm] ════════════════════════════════════════");
            if !status.is_success() {
                debug_log!("[llm] OpenAI error body: {text}");
                return Err(MindFlowError::Other(format!(
                    "OpenAI API error: HTTP {status}"
                )));
            }
            let parsed: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| MindFlowError::Other(format!("JSON parse error: {e}")))?;
            let content_text = parsed["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| MindFlowError::Other("No content in OpenAI response".into()))?;
            debug_log!("[llm] extracted content:\n{content_text}");
            Ok(content_text.to_string())
        }
        "gemini" => {
            let body = serde_json::json!({
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                "generationConfig": {
                    "temperature": 0,
                    "maxOutputTokens": 4096,
                    "responseMimeType": "application/json"
                }
            });
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
                model
            );
            debug_log!("[llm] POST {url}");
            let resp = client
                .post(&url)
                .header("x-goog-api-key", api_key)
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            let text = resp.text().await?;
            debug_log!("[llm] ════════════════ RESPONSE ═══════════════");
            debug_log!("[llm] status={status}");
            debug_log!("[llm] raw body:\n{text}");
            debug_log!("[llm] ════════════════════════════════════════");
            if !status.is_success() {
                debug_log!("[llm] Gemini error body: {text}");
                return Err(MindFlowError::Other(format!(
                    "Gemini API error: HTTP {status}"
                )));
            }
            let parsed: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| MindFlowError::Other(format!("JSON parse error: {e}")))?;
            let content_text = parsed["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .ok_or_else(|| MindFlowError::Other("No text in Gemini response".into()))?;
            debug_log!("[llm] extracted content:\n{content_text}");
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
    debug_log!("[compact] start — node_id={node_id}, profile_id={profile_id}");

    // 1. Read profile + tree from DB
    let (subtree, ancestor_path, provider, model, api_key_id) = {
        let db = state.db.lock().unwrap();

        let subtree = build_subtree(&db, &node_id)?;
        let node_count = count_nodes(&subtree);
        if node_count > MAX_SUBTREE_NODES {
            return Err(MindFlowError::Other(format!(
                "子樹包含 {node_count} 個節點，超過上限 {MAX_SUBTREE_NODES}。請選擇較小的子樹重組。"
            )));
        }
        let ancestor_path = get_ancestor_path(&db, &node_id)?;
        debug_log!("[compact] ancestor_path={:?}", ancestor_path);

        let (provider, model, api_key_id): (String, String, Option<String>) = db
            .query_row(
                "SELECT COALESCE(k.provider, p.provider), p.model, p.api_key_id
                 FROM ai_profiles p
                 LEFT JOIN api_keys k ON p.api_key_id = k.id
                 WHERE p.id = ?1",
                [&profile_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|_| {
                MindFlowError::Other("AI profile not found. Create one in AI Settings.".into())
            })?;

        debug_log!("[compact] provider={provider}, model={model}, api_key_id={api_key_id:?}");
        (subtree, ancestor_path, provider, model, api_key_id)
    };

    // 2. Get API key secret from keychain
    let api_key = if let Some(ref kid) = api_key_id {
        get_apikey_secret(kid)?
    } else {
        // Migration fallback: try old provider-level or profile-level keychain
        get_legacy_provider_secret(&provider)
            .or_else(|_| get_legacy_profile_secret(&profile_id))
            .map_err(|_| MindFlowError::Other(
                "No API key bound to this profile. Edit the profile in AI Settings.".into()
            ))?
    };

    // 3. Build prompt (use custom system prompt if set)
    let system_prompt = {
        let db = state.db.lock().unwrap();
        db.query_row(
            "SELECT value FROM ai_settings WHERE key = 'system_prompt'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| SYSTEM_PROMPT.to_string())
    };
    let user_prompt = build_user_prompt(&ancestor_path, &subtree);
    debug_log!("[compact] prompt length={}", user_prompt.len());

    // 4. Call LLM
    debug_log!("[compact] calling LLM...");
    let raw_response = call_llm(&state.http_client, &provider, &model, &api_key, &system_prompt, &user_prompt).await?;
    debug_log!("[compact] LLM response length={}", raw_response.len());

    // 5. Parse response
    let proposed = parse_proposed_nodes(&raw_response)?;
    debug_log!("[compact] parsed {} proposed nodes", proposed.len());

    Ok(CompactResult {
        original: subtree,
        proposed,
    })
}
