# Round 10 - Compact API 實作細節

> 每種建議類型的具體 prompt、API call 結構、request/response schema。
> 以 Anthropic Messages API + tool_use 為例（OpenAI function calling 同理）。

---

## 整體架構：一次 Compact = 兩次 API Call

```
  Compact 觸發
       │
       ▼
  ┌─────────────────────────┐
  │  Call 1: 分析 Working    │  輸入：所有 active context trees
  │  Contexts               │  輸出：1.1 合併 / 1.2 刪除 / 1.3 重組 / 2.1 合併ctx / 2.2 拆分
  └────────────┬────────────┘
               │
               ▼
  ┌─────────────────────────┐
  │  Call 2: 分析 → CK      │  輸入：archived/vault contexts + 現有 CK
  │                         │  輸出：3.1 萃取 / 3.2 更新 / 3.3 去重
  └─────────────────────────┘
```

分兩次 call 的原因：
- 作用域不同，prompt focus 不同，準確度更高
- 避免單次 input 太大超出 context window
- 可以只跑其中一個（例如沒有新 archived context 就不跑 Call 2）

---

## Call 1: Working Contexts 分析

### System Prompt

```
You are a knowledge management assistant for Mind Flow app.
Your job is to analyze the user's context trees and suggest improvements.

Rules:
- Only suggest changes when you are highly confident (>80% sure)
- Never suggest deleting a node unless its content is fully covered by another node
- When merging, always produce a complete merged_content draft
- Use the user's language (if nodes are in Chinese, respond in Chinese)
- Every suggestion must include a clear reason
- Reference specific node IDs in all suggestions
```

### User Prompt 模板

```
Analyze the following active context trees for potential improvements.

Context Trees:
{context_trees_json}

Look for:
1. Duplicate or highly overlapping nodes within the same tree (type: merge_nodes)
2. Outdated nodes that are fully superseded by newer nodes (type: delete_stale)
3. Flat trees that would benefit from grouping into subtrees (type: restructure)
4. Two separate contexts that are essentially about the same topic (type: merge_contexts)
5. A single context that has grown too large with mixed topics (type: split_context)

Only suggest changes you are highly confident about.
If no improvements are needed, return an empty suggestions array.
```

### Input JSON 格式

```json
{
  "context_trees": [
    {
      "context_id": "ctx_001",
      "name": "Auth系統",
      "status": "active",
      "tags": ["#work"],
      "nodes": [
        {
          "id": "n1",
          "parent_id": null,
          "type": "text",
          "title": "OAuth 流程",
          "content": "先取得 authorization code，再換 access token...",
          "created_at": "2024-01-15T10:00:00Z",
          "updated_at": "2024-01-15T10:00:00Z"
        },
        {
          "id": "n2",
          "parent_id": "n1",
          "type": "text",
          "title": "OAuth 筆記",
          "content": "整個 OAuth 流程：先取 auth code，換 token...",
          "created_at": "2024-03-20T14:00:00Z",
          "updated_at": "2024-03-20T14:00:00Z"
        },
        {
          "id": "n3",
          "parent_id": "n1",
          "type": "markdown",
          "title": "Token 管理",
          "file_path": "token-management.md",
          "content_preview": "JWT token 的 refresh 機制...",
          "created_at": "2024-02-10T09:00:00Z",
          "updated_at": "2024-03-01T11:00:00Z"
        }
      ]
    },
    {
      "context_id": "ctx_002",
      "name": "前端重構",
      "status": "active",
      "tags": ["#work"],
      "nodes": [...]
    }
  ]
}
```

### Tool Definition（Anthropic tool_use）

```json
{
  "name": "compact_working_contexts",
  "description": "Analyze working context trees and suggest improvements",
  "input_schema": {
    "type": "object",
    "properties": {
      "suggestions": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "enum": ["merge_nodes", "delete_stale", "restructure", "merge_contexts", "split_context"]
            },
            "confidence": {
              "type": "number",
              "description": "0.0 to 1.0, how confident the AI is about this suggestion"
            },
            "reason": {
              "type": "string",
              "description": "Human-readable explanation in user's language"
            },
            "affected_context_ids": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Which context(s) are affected"
            },
            "details": {
              "type": "object",
              "description": "Type-specific details, structure depends on suggestion type"
            }
          },
          "required": ["type", "confidence", "reason", "affected_context_ids", "details"]
        }
      }
    },
    "required": ["suggestions"]
  }
}
```

### 每種 type 的 details 結構

**merge_nodes:**
```json
{
  "details": {
    "keep_node_id": "n1",
    "remove_node_ids": ["n2"],
    "merged_title": "OAuth 流程（完整）",
    "merged_content": "完整的 OAuth 流程說明：先取得 authorization code...",
    "children_action": "move_to_keep"
  }
}
```

**delete_stale:**
```json
{
  "details": {
    "delete_node_ids": ["n3"],
    "superseded_by_node_id": "n5",
    "unique_content_lost": "無，所有內容已在 n5 中涵蓋",
    "children_action": "reparent_to_grandparent"
  }
}
```

**restructure:**
```json
{
  "details": {
    "context_id": "ctx_001",
    "new_groups": [
      {
        "group_title": "認證機制",
        "node_ids": ["n1", "n2", "n3"]
      },
      {
        "group_title": "前端整合",
        "node_ids": ["n4", "n5"]
      }
    ]
  }
}
```

**merge_contexts:**
```json
{
  "details": {
    "source_context_ids": ["ctx_001", "ctx_002"],
    "merged_name": "前端樣式優化",
    "merged_tree": [
      {
        "title": "效能",
        "source_node_ids": ["ctx_001/n1", "ctx_002/n3"],
        "merged_content": "合併後的效能相關內容..."
      },
      {
        "title": "命名規範",
        "source_node_ids": ["ctx_001/n2"],
        "merged_content": null
      }
    ]
  }
}
```

**split_context:**
```json
{
  "details": {
    "source_context_id": "ctx_003",
    "new_contexts": [
      {
        "name": "前端相關",
        "node_ids": ["n1", "n2", "n5"]
      },
      {
        "name": "後端相關",
        "node_ids": ["n3", "n4", "n6"]
      }
    ]
  }
}
```

---

## Call 2: Archived/Vault → Common Knowledge 分析

### System Prompt

```
You are a knowledge curator for Mind Flow app.
Your job is to analyze archived/vault context trees and determine what
should be extracted into the Common Knowledge base.

Rules:
- Project-specific content (mentions specific APIs, file paths, team names)
  should NOT be extracted to Common Knowledge
- General knowledge (concepts, best practices, how-to guides, reference info)
  SHOULD be extracted
- If Common Knowledge already has similar content, suggest updating it
  instead of creating duplicates
- Always preserve the original node, extraction is a COPY operation
- Use the user's language
```

### User Prompt 模板

```
Analyze the following archived/vault contexts against the existing
Common Knowledge base. Suggest what should be extracted or updated.

Archived/Vault Contexts:
{archived_contexts_json}

Existing Common Knowledge:
{common_knowledge_json}

Look for:
1. Nodes containing general/reusable knowledge to extract (type: extract_to_ck)
2. Nodes that update or expand existing Common Knowledge (type: update_ck)
3. Nodes that duplicate existing Common Knowledge (type: dedup_with_ck)
```

### Input JSON 格式

```json
{
  "archived_contexts": [
    {
      "context_id": "ctx_010",
      "name": "Auth系統",
      "status": "archived",
      "archived_at": "2024-04-01T00:00:00Z",
      "nodes": [
        {
          "id": "n10",
          "type": "text",
          "title": "OAuth 2.0 流程詳解",
          "content": "OAuth 2.0 的標準流程分為四種 grant type..."
        },
        {
          "id": "n11",
          "type": "text",
          "title": "我們的 /api/auth endpoint",
          "content": "POST /api/auth 接受 {email, password}..."
        }
      ]
    }
  ],
  "common_knowledge": {
    "trees": [
      {
        "ck_tree_id": "ck_001",
        "name": "OAuth 知識",
        "nodes": [
          {
            "id": "ck_n1",
            "title": "OAuth 基礎",
            "content": "OAuth 是一個授權框架..."
          }
        ]
      }
    ]
  }
}
```

### Tool Definition

```json
{
  "name": "compact_to_common_knowledge",
  "description": "Analyze archived contexts against Common Knowledge",
  "input_schema": {
    "type": "object",
    "properties": {
      "suggestions": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "enum": ["extract_to_ck", "update_ck", "dedup_with_ck"]
            },
            "confidence": {
              "type": "number"
            },
            "reason": {
              "type": "string"
            },
            "details": {
              "type": "object"
            }
          },
          "required": ["type", "confidence", "reason", "details"]
        }
      }
    },
    "required": ["suggestions"]
  }
}
```

### 每種 type 的 details 結構

**extract_to_ck:**
```json
{
  "details": {
    "source_context_id": "ctx_010",
    "source_node_ids": ["n10"],
    "target_ck_tree": "OAuth 知識",
    "target_ck_tree_id": "ck_001",
    "new_ck_node_title": "OAuth 2.0 四種 Grant Type",
    "new_ck_node_content": "OAuth 2.0 標準流程分為四種 grant type...",
    "is_new_tree": false,
    "classification": "general_knowledge"
  }
}
```

**update_ck:**
```json
{
  "details": {
    "source_context_id": "ctx_010",
    "source_node_ids": ["n10"],
    "target_ck_node_id": "ck_n1",
    "update_type": "append",
    "new_content_additions": "新增 OAuth 2.0 四種 grant type 的詳細說明...",
    "updated_full_content": "OAuth 是一個授權框架... (原有) + OAuth 2.0 四種 grant type... (新增)"
  }
}
```

**dedup_with_ck:**
```json
{
  "details": {
    "source_context_id": "ctx_010",
    "source_node_ids": ["n10"],
    "duplicate_ck_node_id": "ck_n1",
    "overlap_description": "n10 的內容與 ck_n1 有 90% 重疊",
    "unique_in_source": "無額外獨有內容",
    "recommended_action": "safe_to_ignore"
  }
}
```

---

## Client 端處理邏輯

```
API Response
    │
    ▼
Filter: confidence >= 0.8   ← 只顯示高信心的建議
    │
    ▼
Sort: by type priority       ← merge_nodes > extract > dedup > others
    │
    ▼
Render: Review UI cards      ← 方案 A 卡片式
    │
    ▼
User: Accept / Skip each
    │
    ▼
Execute: 只執行 accepted 的   ← 按 details 裡的 node_id 操作
    │
    ▼
Update DB + Filesystem
```

### Client 端 type → operation mapping

```
merge_nodes:
  1. update node[keep_node_id].content = merged_content
  2. update node[keep_node_id].title = merged_title
  3. reparent children of remove_nodes to keep_node
  4. delete nodes in remove_node_ids

delete_stale:
  1. reparent children (if any) to grandparent
  2. delete nodes in delete_node_ids

restructure:
  1. for each group: create new intermediate node with group_title
  2. move node_ids under the new intermediate node

merge_contexts:
  1. create new context with merged_name
  2. for each merged_tree item: create node with merged_content
  3. archive or delete source contexts (user chooses)

split_context:
  1. for each new_context: create new context
  2. move node_ids from source to new context
  3. archive or delete source context (user chooses)

extract_to_ck:
  1. if is_new_tree: create new CK tree
  2. create new CK node with content (COPY, don't move)
  3. original node stays untouched

update_ck:
  1. update CK node content = updated_full_content

dedup_with_ck:
  1. if recommended_action == "safe_to_ignore": no-op, just inform user
  2. if recommended_action == "delete_source": delete source node (rare)
```

---

## API Call 範例（Anthropic Python SDK）

```python
import anthropic

client = anthropic.Anthropic()

# Call 1: Working Contexts
response = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=4096,
    system="You are a knowledge management assistant...",
    tools=[{
        "name": "compact_working_contexts",
        "description": "Analyze working context trees and suggest improvements",
        "input_schema": { ... }  # schema from above
    }],
    tool_choice={"type": "tool", "name": "compact_working_contexts"},
    messages=[{
        "role": "user",
        "content": f"Analyze the following active context trees...\n\n{context_trees_json}"
    }]
)

# Parse tool_use response
for block in response.content:
    if block.type == "tool_use":
        suggestions = block.input["suggestions"]
        # Filter by confidence
        high_confidence = [s for s in suggestions if s["confidence"] >= 0.8]
        # Send to Review UI
        render_review_cards(high_confidence)
```

### 關鍵設定

| 參數          | 值                 | 原因                    |
| ----------- | ----------------- | --------------------- |
| model       | claude-sonnet-4-5 | 平衡速度/品質/成本，不需要 opus   |
| tool_choice | forced            | 強制回 structured output |
| max_tokens  | 4096              | 建議清單不會太長              |
| temperature | 0                 | Compact 需要穩定性，不要隨機性   |

### 成本估算

假設平均 context tree 有 20 nodes，每 node 100 字：
- Input: ~5 contexts × 20 nodes × 100 字 ≈ 10,000 字 ≈ 4,000 tokens
- Output: ~5 suggestions × 200 字 ≈ 1,000 字 ≈ 400 tokens
- 每次 compact ≈ 2 calls × (4,000 input + 400 output) ≈ 8,800 tokens
- Sonnet 4.5 定價：$3/M input + $15/M output
- **每次 compact 成本 ≈ $0.03（約 NT$1）**

---

**你覺得這些 prompt 和 API 結構 ok 嗎？有什麼想調整的？**

**你的回答：**

