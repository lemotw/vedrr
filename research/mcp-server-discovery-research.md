# MCP Server Discovery & Registration Research

**Date:** 2026-03-14
**Purpose:** Understand how AI apps discover MCP servers, transport options, and how a Tauri desktop app (vedrr) could expose itself as an MCP server.

---

## 1. Current MCP Server Discovery by AI App

### Claude Desktop

- **Config file:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
- **Format:** Manual JSON config under `mcpServers` key
- **Transport:** Primarily stdio (spawns child process). Also supports Streamable HTTP for remote servers.
- **Discovery:** No auto-discovery. User must manually edit config or use Settings > Developer > Edit Config.
- **Example:**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

### Cursor

- **Config files:** `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global)
- **Format:** Same `mcpServers` structure as Claude Desktop
- **Transport:** stdio and Streamable HTTP
- **Discovery:** No auto-discovery. Manual config. Project-level overrides global.

### VS Code (GitHub Copilot)

- **Config file:** `.vscode/mcp.json` (workspace) or user-level settings
- **Format:** Uses `servers` key (slightly different from Claude/Cursor)
- **Transport:** stdio and Streamable HTTP
- **Discovery:** Has an **MCP Gallery** in the Extensions view (search `@mcp`). Also supports manual config with IntelliSense.
- **Notable:** VS Code is the only major client with a built-in gallery/marketplace for MCP servers.

### Windsurf

- **Config file:** `~/.codeium/windsurf/mcp_config.json`
- **Transport:** stdio, Streamable HTTP, and SSE. Supports OAuth for all transport types.
- **Discovery:** Has an **MCP Marketplace** accessible from the Cascade panel. Also supports manual config.
- **Limit:** 100 total tools across all connected MCP servers.

### ChatGPT

- **Availability:** Pro, Team, Enterprise, and Edu users via Developer Mode
- **Transport:** Remote HTTP only (Streamable HTTP). No stdio support (ChatGPT is cloud-based).
- **Discovery:** MCP servers are configured as "Apps" through prompts/configuration in the ChatGPT UI. No local config file.
- **Notable:** Cannot connect to local stdio servers. Must be publicly accessible HTTP endpoints.

### Claude Code (CLI)

- **Config:** Defined in project-level `.mcp.json` or via `claude mcp add` CLI command
- **Transport:** stdio and Streamable HTTP

---

## 2. MCP Transport Options

### stdio (Standard Input/Output)

- **How it works:** Client spawns MCP server as a child subprocess. Communication via stdin/stdout with newline-delimited JSON-RPC messages.
- **Lifecycle:** On-demand spawn. Server lives as long as the client needs it, terminated when client closes stdin.
- **Best for:** Local integrations, CLI tools, single-client scenarios
- **Pros:** Simplest, most performant, no network setup, no port conflicts
- **Cons:** Single client only, local only, client must know the executable path
- **Who uses it:** Claude Desktop, Cursor, VS Code, Windsurf, Claude Code

### Streamable HTTP (Current Standard)

- **How it works:** Server provides a single HTTP endpoint (e.g., `http://localhost:3000/mcp`). Client sends JSON-RPC via POST. Server can respond with JSON or open an SSE stream for streaming responses.
- **Lifecycle:** Always-running server. Independent process handling multiple clients.
- **Session management:** Server may assign `Mcp-Session-Id` header for stateful sessions.
- **Best for:** Remote servers, multi-client scenarios, always-running desktop apps
- **Pros:** Multiple clients, remote access possible, stateful or stateless, supports streaming
- **Cons:** More complex, needs port management, security considerations (Origin validation, localhost binding)
- **Who uses it:** All clients support it. Required for ChatGPT (cloud-only).

### SSE (Server-Sent Events) -- DEPRECATED

- **Status:** Deprecated as of MCP spec 2025-03-26 in favor of Streamable HTTP
- **Why deprecated:** Required two separate endpoints (POST for requests, SSE for responses), added unnecessary complexity
- **Backward compatibility:** Clients wanting to support old servers can fall back to SSE if POST to the endpoint fails with 4xx

### Summary Table

| Feature              | stdio           | Streamable HTTP      | SSE (deprecated)    |
|----------------------|-----------------|----------------------|---------------------|
| Local only           | Yes             | No (can be local)    | No (can be local)   |
| Multi-client         | No              | Yes                  | Yes                 |
| Always running       | No (on-demand)  | Yes                  | Yes                 |
| Streaming            | Yes (stdout)    | Yes (SSE in POST)    | Yes                 |
| Complexity           | Low             | Medium               | High                |
| Auth support         | N/A (local)     | Yes (OAuth, headers) | Yes                 |
| Spec status          | Current         | Current              | Deprecated          |

---

## 3. How a Desktop App Can Expose Itself as an MCP Server

### Option A: Streamable HTTP Server (Recommended for vedrr)

The app runs an HTTP server on a local port (e.g., `http://127.0.0.1:9876/mcp`) that speaks the MCP protocol.

**Architecture for vedrr (Tauri):**
```
Claude Desktop / Cursor / etc.
    | (HTTP POST/GET to localhost:9876/mcp)
    v
vedrr Tauri app
    | (Rust HTTP server thread - e.g., axum/actix-web)
    v
SQLite DB (~/vedrr/data/vedrr.db)
```

**How AI clients connect:**
```json
// Claude Desktop config:
{
  "mcpServers": {
    "vedrr": {
      "url": "http://127.0.0.1:9876/mcp"
    }
  }
}

// Cursor config (.cursor/mcp.json):
{
  "mcpServers": {
    "vedrr": {
      "url": "http://127.0.0.1:9876/mcp"
    }
  }
}
```

**Pros:**
- vedrr stays running as a desktop app; no subprocess spawning needed
- Multiple AI clients can connect simultaneously
- App controls its own lifecycle
- Can expose real-time data from the live SQLite database

**Cons:**
- Port conflicts (need a strategy: fixed port, configurable, or dynamic with discovery)
- Must handle security (bind to localhost only, validate Origin header)
- App must be running for MCP to work

### Option B: stdio Server (Separate Binary)

Ship a separate CLI binary (e.g., `vedrr-mcp`) that the AI client spawns. This binary connects to the running vedrr app or directly reads the SQLite DB.

**Architecture:**
```
Claude Desktop
    | (spawns subprocess)
    v
vedrr-mcp (CLI binary)
    | (reads SQLite directly or connects to vedrr via IPC)
    v
SQLite DB (~/vedrr/data/vedrr.db)
```

**Pros:**
- Standard pattern, works with all clients
- No port management
- Can work even if vedrr app is not running (read-only from SQLite)

**Cons:**
- Separate binary to build and distribute
- If writing to DB, need to coordinate with running vedrr app (WAL mode helps but not perfect)
- Single client at a time

### Option C: Tauri Plugin MCP (Existing Libraries)

Use existing `tauri-plugin-mcp` or `tauri-mcp-server` crates.

**Known implementations:**
- `P3GLEG/tauri-plugin-mcp` - Focuses on debugging (screenshots, DOM access, input simulation)
- `delorenj/tauri-mcp-server` - General-purpose, supports IPC and TCP socket communication
- `dirvine/tauri-mcp` - Testing and interaction with Tauri apps

**Architecture (delorenj pattern):**
```
AI Agent (Claude Code/Cursor)
    | (MCP Protocol - stdio)
    v
MCP Server (Node.js bridge)
    | (IPC/TCP Socket)
    v
Socket Server (Rust, inside Tauri plugin)
    | (Tauri APIs)
    v
Tauri Application (vedrr)
```

**Note:** These existing plugins are mostly for *debugging/testing* Tauri apps, not for exposing app data as MCP resources/tools. For vedrr's use case (exposing knowledge graph data), we would need custom tools.

### Recommended Approach for vedrr

**Streamable HTTP** is the best fit because:
1. vedrr is already a long-running desktop app
2. Multiple AI tools could query the same knowledge base simultaneously
3. No extra binary to distribute
4. The Rust backend (axum or similar) can serve MCP alongside the existing Tauri app
5. Real-time access to the live database state

**What vedrr could expose as MCP:**
- **Tools:** `search_nodes`, `get_context_tree`, `create_node`, `list_contexts`
- **Resources:** `context://{id}` for reading full context trees, `node://{id}` for individual nodes
- **Prompts:** Templates for knowledge extraction, summarization

---

## 4. MCP Discovery Standards (Emerging)

### .well-known/mcp.json (SEP-1649 & SEP-1960)

**Status:** Draft proposals, expected to be finalized Q1 2026 for inclusion in June 2026 spec release.

**What it is:** A standardized `/.well-known/mcp/server-card.json` endpoint that servers can host to advertise their capabilities without requiring a live MCP connection.

**Server Card fields:**
- `serverInfo`: name, title, version
- `protocolVersion`: supported MCP version
- `transport`: type and endpoint URL
- `capabilities`: tools, resources, prompts supported
- `authentication`: whether required and supported schemes
- `description`, `icon`, `documentation` URLs

**How it helps discovery:**
- IDE extensions can auto-configure when pointed at a domain
- Registries/crawlers can index servers automatically
- Clients learn about capabilities before connecting

**Relevance to local desktop apps:** Limited. `.well-known` is an HTTP convention for web domains. A local desktop app would need a different discovery mechanism. However, a local HTTP MCP server could still serve this endpoint at `http://127.0.0.1:PORT/.well-known/mcp/server-card.json`.

### MCP Registry (Official)

- **URL:** https://registry.modelcontextprotocol.io
- **Status:** Preview (launched September 2025)
- **Purpose:** Open catalog and API for publicly available MCP servers (like an "app store" for MCP servers)
- **Supports:** Sub-registries for organizations, augmented data from upstream registry
- **Relevance to vedrr:** Could register vedrr's MCP server for public discovery, but primarily useful for cloud-hosted servers

### Third-Party Marketplaces

- **mcp.so:** 18,000+ MCP servers cataloged
- **Docker MCP Catalog:** Containerized servers with isolation
- **VS Code MCP Gallery:** Built into VS Code extensions view
- **Windsurf MCP Marketplace:** Built into Windsurf UI

### No Auto-Discovery Standard Yet

There is **no mDNS/Bonjour-style auto-discovery** for MCP servers. No well-known port convention. No broadcast mechanism. Discovery is currently:
1. Manual config file editing (Claude Desktop, Cursor, Claude Code)
2. Marketplace/gallery browsing (VS Code, Windsurf)
3. CLI commands (Claude Code: `claude mcp add`)

**Implication for vedrr:** Users would need to manually add vedrr's MCP config to their AI tool. The app could help by:
- Providing a "Copy MCP Config" button in settings
- Auto-generating the correct JSON snippet for each client
- Offering a CLI installer: `npx vedrr-mcp install`

---

## 5. Real-World Examples

### Obsidian MCP Server

The closest analog to what vedrr would do.

**Implementations:**
- `cyanheads/obsidian-mcp-server`: Bridges to Obsidian's Local REST API plugin. Exposes tools for reading, writing, searching notes, managing tags and frontmatter.
- `aaronsb/obsidian-mcp-plugin`: Direct vault access via HTTP transport with semantic operations and graph traversal.

**Architecture:** Obsidian runs a Local REST API plugin (HTTP server) -> separate MCP server process translates MCP protocol to REST API calls -> AI client connects via stdio to the MCP server process.

**Key insight:** Obsidian does NOT run the MCP server itself. A separate Node.js process acts as the MCP server and bridges to Obsidian's REST API. This is the "bridge" pattern.

### Notion MCP

Similar bridge pattern. A separate MCP server connects to Notion's API (cloud-based) and exposes pages/databases as MCP tools and resources.

### Linear, GitHub, Jira MCP Servers

All follow the same pattern: separate Node.js/Python process that speaks MCP (usually stdio) and connects to the service's API.

---

## 6. Architecture Decision for vedrr

### Recommended: Embedded Streamable HTTP MCP Server

```
vedrr Tauri App
├── Frontend (React/WKWebView)
├── Rust Backend
│   ├── Tauri Commands (existing)
│   ├── SQLite DB access (existing)
│   └── MCP HTTP Server (NEW)
│       ├── POST /mcp  (JSON-RPC endpoint)
│       ├── GET  /mcp  (SSE stream for server-initiated messages)
│       └── GET  /.well-known/mcp/server-card.json (discovery)
└── Binds to 127.0.0.1:9876
```

**Implementation steps:**
1. Add `axum` (or `tiny_http`) as a dependency in `src-tauri/Cargo.toml`
2. Spawn HTTP server on a background thread during Tauri app startup
3. Implement MCP JSON-RPC handler for tool calls
4. Expose vedrr-specific tools:
   - `list_contexts` - List all contexts with metadata
   - `get_tree` - Get full tree structure for a context
   - `search_nodes` - Full-text search across all nodes
   - `create_node` - Add a node to a context
   - `update_node` - Modify node content
5. Add settings UI to show MCP connection info and copy config snippets
6. Optionally: also ship a thin stdio wrapper binary for maximum compatibility

### Port Strategy

- Default: `127.0.0.1:9876` (or pick an unregistered port)
- Configurable via settings
- On startup, check if port is available; if not, try next port
- Display active port in status bar or settings

### Security

- Bind to `127.0.0.1` only (no remote access)
- Validate `Origin` header on all requests
- Optional: require a local bearer token (stored in a file that AI clients can read)

---

## Sources

- MCP Specification (Transports): https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- Claude Desktop MCP Config: https://modelcontextprotocol.io/docs/develop/connect-local-servers
- Cursor MCP Docs: https://cursor.com/docs/context/mcp
- VS Code MCP Servers: https://code.visualstudio.com/docs/copilot/customization/mcp-servers
- Windsurf MCP Config: https://windsurf.com/university/tutorials/configuring-first-mcp-server
- ChatGPT MCP Support: https://developers.openai.com/api/docs/mcp/
- MCP Server Cards (SEP-1649): https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649
- MCP Discovery Endpoint (SEP-1960): https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1960
- 2026 MCP Roadmap: https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/
- MCP Registry Preview: https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/
- Obsidian MCP Server: https://github.com/cyanheads/obsidian-mcp-server
- Tauri MCP Server (delorenj): https://github.com/delorenj/tauri-mcp-server
- Tauri Plugin MCP (P3GLEG): https://github.com/P3GLEG/tauri-plugin-mcp
- MCP Transport Comparison: https://mcpcat.io/guides/comparing-stdio-sse-streamablehttp/
- Why MCP Deprecated SSE: https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/
