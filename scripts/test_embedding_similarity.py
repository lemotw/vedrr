#!/usr/bin/env python3
# pip install sentence-transformers torch
"""
Test multilingual-e5-small embedding similarity interactively.

Usage:
  python test_embedding_similarity.py                          # Preset mode
  python test_embedding_similarity.py --interactive            # Interactive mode
  python test_embedding_similarity.py --query "your text"      # Single query mode
  python test_embedding_similarity.py --add-node "extra node"  # Add custom nodes
  python test_embedding_similarity.py --db                     # Load nodes from SQLite
  python test_embedding_similarity.py --db --interactive       # SQLite + interactive
  python test_embedding_similarity.py --db --export out.csv    # Export all-pairs scores

Examples:
  python test_embedding_similarity.py --query "前端框架比較" --add-node "Svelte 的響應式設計"
  python test_embedding_similarity.py --interactive --add-node "新增的測試節點"
  python test_embedding_similarity.py --db --interactive
  python test_embedding_similarity.py --db --query "ADHD 使用體驗"
  python test_embedding_similarity.py --db --export results.csv --query "搜尋關鍵字"
"""

import argparse
import csv
import os
import sqlite3
import struct
import sys
from pathlib import Path

import torch
from sentence_transformers import SentenceTransformer
from torch.nn.functional import cosine_similarity

# ── Preset data ──────────────────────────────────────────────────────────────

PRESET_NODES = [
    "當用戶將 context 納入 archived 超過 1 day 那會自動納入 vault 狀態",
    "語意搜尋讓模糊回憶也能定位到目標",
    "React vs Vue 技術選型比較",
    "Docker 部署方案與 CI/CD 設定",
    "ADHD 使用者的認知負擔分析",
    "fastembed-rs 是 Rust 原生的向量嵌入函式庫",
    "量子計算的基本原理與應用",
]

PRESET_QUERIES = [
    "context 納入 vault 的條件",
    "前端框架比較",
    "容器化部署",
    "注意力不足的使用體驗",
    "Rust embedding 方案",
    "自動封存機制",
    "量子電腦",
]

# ── Helpers ──────────────────────────────────────────────────────────────────

MODEL_NAME = "intfloat/multilingual-e5-small"
SEPARATOR = "\u2500" * 50
DB_PATH = Path.home() / "vedrr" / "data" / "vedrr.db"


def load_model() -> SentenceTransformer:
    print(f"Loading model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    print("Model loaded.\n")
    return model


def encode_passages(model: SentenceTransformer, texts: list[str]) -> torch.Tensor:
    """Encode document passages with the required 'passage: ' prefix."""
    prefixed = [f"passage: {t}" for t in texts]
    return model.encode(prefixed, convert_to_tensor=True, normalize_embeddings=True)


def encode_query(model: SentenceTransformer, query: str) -> torch.Tensor:
    """Encode a single query with the required 'query: ' prefix."""
    prefixed = f"query: {query}"
    return model.encode([prefixed], convert_to_tensor=True, normalize_embeddings=True)


def rank_nodes(
    model: SentenceTransformer,
    query: str,
    nodes: list[dict],
    node_embeddings: torch.Tensor,
) -> list[tuple[float, dict]]:
    """Return (score, node) pairs sorted by descending cosine similarity."""
    q_emb = encode_query(model, query)
    scores = cosine_similarity(q_emb, node_embeddings).squeeze(0)
    paired = [(scores[i].item(), nodes[i]) for i in range(len(nodes))]
    paired.sort(key=lambda x: x[0], reverse=True)
    return paired


def node_label(node: dict) -> str:
    """Format node for display."""
    title = node["title"]
    if len(title) > 50:
        title = title[:47] + "..."
    ctx = node.get("context_name", "")
    path = node.get("ancestor_path", "")
    if ctx and path:
        suffix = f"  ({ctx} > {path})" if len(path) < 40 else f"  ({ctx})"
    elif ctx:
        suffix = f"  ({ctx})"
    else:
        suffix = ""
    if len(suffix) > 50:
        suffix = suffix[:47] + "..."
    return f"{title}{suffix}"


def print_results(query: str, ranked: list[tuple[float, dict]]) -> None:
    print(f'Query: "{query}"')
    print(SEPARATOR)
    for score, node in ranked:
        label = node_label(node)
        print(f"  [{score:.4f}] {label}")
    print()


# ── SQLite loading ───────────────────────────────────────────────────────────


def blob_to_vec(blob: bytes) -> list[float]:
    """Deserialize little-endian f32 bytes (matches Rust embedding::vec_to_blob)."""
    n = len(blob) // 4
    return list(struct.unpack(f"<{n}f", blob))


def load_nodes_from_db(db_path: Path) -> list[dict]:
    """Load all nodes that have embeddings from the vedrr SQLite database."""
    if not db_path.exists():
        print(f"Error: DB not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT ne.node_id, ne.input_text, ne.embedding,
                   tn.title, tn.node_type,
                   c.id as context_id, c.name as context_name
            FROM node_embeddings ne
            JOIN tree_nodes tn ON ne.node_id = tn.id
            JOIN contexts c ON ne.context_id = c.id
            ORDER BY c.name, ne.input_text
            """
        ).fetchall()
    finally:
        conn.close()

    nodes = []
    for row in rows:
        nodes.append(
            {
                "node_id": row["node_id"],
                "title": row["title"],
                "node_type": row["node_type"],
                "context_id": row["context_id"],
                "context_name": row["context_name"],
                "ancestor_path": row["input_text"],
                "embedding_blob": row["embedding"],
            }
        )

    print(f"Loaded {len(nodes)} nodes from {db_path}")
    return nodes


def load_db_embeddings(nodes: list[dict]) -> torch.Tensor:
    """Convert stored BLOB embeddings to a torch tensor."""
    vecs = [blob_to_vec(n["embedding_blob"]) for n in nodes]
    return torch.tensor(vecs, dtype=torch.float32)


def rank_nodes_db(
    model: SentenceTransformer,
    query: str,
    nodes: list[dict],
    node_embeddings: torch.Tensor,
) -> list[tuple[float, dict]]:
    """Rank using stored DB embeddings (no re-encoding of passages)."""
    q_emb = encode_query(model, query)
    # DB embeddings are on CPU; encode may use MPS on Apple Silicon
    node_embeddings = node_embeddings.to(q_emb.device)
    scores = cosine_similarity(q_emb, node_embeddings).squeeze(0)
    paired = [(scores[i].item(), nodes[i]) for i in range(len(nodes))]
    paired.sort(key=lambda x: x[0], reverse=True)
    return paired


# ── Export ───────────────────────────────────────────────────────────────────


def export_csv(
    path: str,
    query: str | None,
    ranked: list[tuple[float, dict]],
) -> None:
    """Export ranked results to CSV."""
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            ["query", "score", "node_id", "title", "node_type", "context_name", "ancestor_path"]
        )
        q = query or ""
        for score, node in ranked:
            writer.writerow(
                [
                    q,
                    f"{score:.6f}",
                    node.get("node_id", ""),
                    node["title"],
                    node.get("node_type", ""),
                    node.get("context_name", ""),
                    node.get("ancestor_path", ""),
                ]
            )
    print(f"Exported {len(ranked)} rows to {path}")


def export_interactive_csv(
    path: str,
    all_results: list[tuple[str, list[tuple[float, dict]]]],
) -> None:
    """Export multiple query results to a single CSV."""
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            ["query", "score", "node_id", "title", "node_type", "context_name", "ancestor_path"]
        )
        for query, ranked in all_results:
            for score, node in ranked:
                writer.writerow(
                    [
                        query,
                        f"{score:.6f}",
                        node.get("node_id", ""),
                        node["title"],
                        node.get("node_type", ""),
                        node.get("context_name", ""),
                        node.get("ancestor_path", ""),
                    ]
                )
    total = sum(len(r) for _, r in all_results)
    print(f"Exported {total} rows ({len(all_results)} queries) to {path}")


# ── Modes ────────────────────────────────────────────────────────────────────


def wrap_preset_nodes(texts: list[str]) -> list[dict]:
    """Wrap plain-text preset nodes into dict format."""
    return [{"title": t} for t in texts]


def run_preset(model: SentenceTransformer, nodes: list[dict]) -> None:
    print("=" * 50)
    print("  PRESET MODE")
    print("=" * 50)
    print()

    print("Nodes:")
    for i, n in enumerate(nodes, 1):
        print(f"  {i}. {node_label(n)}")
    print()

    node_embs = encode_passages(model, [n["title"] for n in nodes])

    for query in PRESET_QUERIES:
        ranked = rank_nodes(model, query, nodes, node_embs)
        print_results(query, ranked)


def run_single_query(
    model: SentenceTransformer,
    nodes: list[dict],
    query: str,
    *,
    use_db_embeddings: bool = False,
    node_embs: torch.Tensor | None = None,
    export_path: str | None = None,
) -> list[tuple[float, dict]]:
    print("=" * 50)
    print("  SINGLE QUERY MODE" + (" (DB)" if use_db_embeddings else ""))
    print("=" * 50)
    print()

    print(f"Nodes: {len(nodes)}")
    for i, n in enumerate(nodes[:20], 1):
        print(f"  {i}. {node_label(n)}")
    if len(nodes) > 20:
        print(f"  ... and {len(nodes) - 20} more")
    print()

    if use_db_embeddings and node_embs is not None:
        ranked = rank_nodes_db(model, query, nodes, node_embs)
    else:
        if node_embs is None:
            node_embs = encode_passages(model, [n["title"] for n in nodes])
        ranked = rank_nodes(model, query, nodes, node_embs)

    print_results(query, ranked)

    if export_path:
        export_csv(export_path, query, ranked)

    return ranked


def run_interactive(
    model: SentenceTransformer,
    nodes: list[dict],
    *,
    use_db_embeddings: bool = False,
    node_embs: torch.Tensor | None = None,
    export_path: str | None = None,
) -> None:
    print("=" * 50)
    print("  INTERACTIVE MODE" + (" (DB)" if use_db_embeddings else ""))
    print("=" * 50)
    print()

    print(f"Nodes: {len(nodes)}")
    for i, n in enumerate(nodes[:20], 1):
        print(f"  {i}. {node_label(n)}")
    if len(nodes) > 20:
        print(f"  ... and {len(nodes) - 20} more")
    print()

    if not use_db_embeddings and node_embs is None:
        node_embs = encode_passages(model, [n["title"] for n in nodes])

    all_results: list[tuple[str, list[tuple[float, dict]]]] = []

    print('Type a query and press Enter. Type "quit" or Ctrl+C to exit.')
    if export_path:
        print(f"Results will be exported to {export_path} on exit.")
    print()

    while True:
        try:
            query = input("query> ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nBye.")
            break

        if not query:
            continue
        if query.lower() in ("quit", "exit", "q"):
            print("Bye.")
            break

        if use_db_embeddings and node_embs is not None:
            ranked = rank_nodes_db(model, query, nodes, node_embs)
        else:
            ranked = rank_nodes(model, query, nodes, node_embs)

        print()
        print_results(query, ranked)
        all_results.append((query, ranked))

    if export_path and all_results:
        export_interactive_csv(export_path, all_results)


# ── Main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Test multilingual-e5-small embedding similarity."
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Interactive mode: type queries against nodes.",
    )
    parser.add_argument(
        "--query",
        type=str,
        default=None,
        help="Single query mode: test one query against all nodes.",
    )
    parser.add_argument(
        "--add-node",
        type=str,
        action="append",
        default=[],
        dest="extra_nodes",
        help="Add custom node(s) to the test set. Can be repeated.",
    )
    parser.add_argument(
        "--db",
        action="store_true",
        help="Load nodes from vedrr SQLite DB (~/vedrr/data/vedrr.db).",
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=None,
        help="Custom SQLite DB path (default: ~/vedrr/data/vedrr.db).",
    )
    parser.add_argument(
        "--export",
        type=str,
        default=None,
        metavar="FILE.csv",
        help="Export results to CSV file.",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=None,
        help="Show only top N results (default: all).",
    )
    args = parser.parse_args()

    if args.interactive and args.query:
        print("Error: --interactive and --query are mutually exclusive.", file=sys.stderr)
        sys.exit(1)

    db_path = Path(args.db_path) if args.db_path else DB_PATH

    model = load_model()

    if args.db:
        # DB mode: load real nodes from SQLite
        db_nodes = load_nodes_from_db(db_path)
        if not db_nodes:
            print("No embedded nodes found in DB.", file=sys.stderr)
            sys.exit(1)

        # Add extra nodes (won't have DB embeddings, need re-encoding)
        if args.extra_nodes:
            for text in args.extra_nodes:
                db_nodes.append({"title": text, "node_type": "text", "context_name": "(custom)"})
            # Must re-encode all since we mixed DB + custom nodes
            print(f"Re-encoding all {len(db_nodes)} nodes (mixed DB + custom)...")
            node_embs = encode_passages(model, [n["title"] for n in db_nodes])
            use_db = False
        else:
            # Use stored embeddings directly (faster, matches Rust behavior)
            node_embs = load_db_embeddings(db_nodes)
            use_db = True

        if args.query:
            ranked = run_single_query(
                model,
                db_nodes,
                args.query,
                use_db_embeddings=use_db,
                node_embs=node_embs,
                export_path=args.export,
            )
        elif args.interactive:
            run_interactive(
                model,
                db_nodes,
                use_db_embeddings=use_db,
                node_embs=node_embs,
                export_path=args.export,
            )
        else:
            # Default: run preset queries against DB nodes
            print("=" * 50)
            print("  DB MODE (preset queries)")
            print("=" * 50)
            print()
            print(f"Nodes: {len(db_nodes)}")
            for i, n in enumerate(db_nodes[:20], 1):
                print(f"  {i}. {node_label(n)}")
            if len(db_nodes) > 20:
                print(f"  ... and {len(db_nodes) - 20} more")
            print()

            for query in PRESET_QUERIES:
                ranked = rank_nodes_db(model, query, db_nodes, node_embs)
                if args.top:
                    ranked = ranked[: args.top]
                print_results(query, ranked)
    else:
        # Preset mode: use hardcoded nodes
        nodes = wrap_preset_nodes(PRESET_NODES + args.extra_nodes)

        if args.query:
            run_single_query(model, nodes, args.query, export_path=args.export)
        elif args.interactive:
            run_interactive(model, nodes, export_path=args.export)
        else:
            run_preset(model, nodes)


if __name__ == "__main__":
    main()
