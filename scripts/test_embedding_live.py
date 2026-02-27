#!/usr/bin/env python3
# pip install sentence-transformers torch
"""
Dual-vector live embedding test.

Reads all nodes from vedrr SQLite, builds two embedding texts per node:
  - content: node's own title (main semantics)
  - path:    compressed ancestor chain without the node itself (structural semantics)

Score fusion:  final = alpha * sim(query, content) + (1-alpha) * sim(query, path)

Usage:
  python scripts/test_embedding_live.py                                # interactive (alpha=0.7)
  python scripts/test_embedding_live.py --alpha 0.5                    # adjust weight
  python scripts/test_embedding_live.py --query "ADHD 使用體驗"         # single query
  python scripts/test_embedding_live.py --export results.csv           # interactive + export
  python scripts/test_embedding_live.py --top 5                        # show top 5 only
  python scripts/test_embedding_live.py --list                         # list nodes and exit
"""

import argparse
import csv
import sqlite3
import sys
from pathlib import Path

import torch
from sentence_transformers import SentenceTransformer
from torch.nn.functional import cosine_similarity

# ── Constants ────────────────────────────────────────────────────────────────

MODEL_NAME = "intfloat/multilingual-e5-small"
MAX_PATH_CHARS = 450
DEFAULT_ALPHA = 0.7
DB_PATH = Path.home() / "vedrr" / "data" / "vedrr.db"
SEPARATOR = "\u2500" * 70


# ── Model ────────────────────────────────────────────────────────────────────


def load_model() -> SentenceTransformer:
    print(f"Loading model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    print("Model loaded.\n")
    return model


def encode_passages(model: SentenceTransformer, texts: list[str]) -> torch.Tensor:
    prefixed = [f"passage: {t}" for t in texts]
    return model.encode(prefixed, convert_to_tensor=True, normalize_embeddings=True)


def encode_query(model: SentenceTransformer, query: str) -> torch.Tensor:
    return model.encode(
        [f"query: {query}"], convert_to_tensor=True, normalize_embeddings=True
    )


# ── Build dual texts per node ───────────────────────────────────────────────


def build_node_texts(
    conn: sqlite3.Connection, node_id: str
) -> tuple[str, str, str]:
    """
    Returns (content_text, path_text, display_path).
      - content_text: node's own title (for content embedding)
      - path_text:    ancestor chain without the node itself (for path embedding)
      - display_path: full path for UI display
    """
    segments: list[str] = []
    current_id = node_id

    while True:
        row = conn.execute(
            "SELECT title, parent_id FROM tree_nodes WHERE id = ?", (current_id,)
        ).fetchone()
        if row is None:
            break
        title, parent_id = row
        segments.append((title or "").strip())
        if parent_id is None:
            break
        current_id = parent_id

    # Reverse: root first
    segments.reverse()

    display_path = " > ".join(segments)

    # content = node's own title (last segment)
    content_text = segments[-1] if segments else ""

    # path = ancestors only (everything except last segment)
    ancestors = segments[:-1] if len(segments) > 1 else []

    # Compress: drop empty, deduplicate consecutive
    cleaned: list[str] = []
    for s in ancestors:
        if s and (not cleaned or cleaned[-1] != s):
            cleaned.append(s)

    path_joined = " > ".join(cleaned)

    # Truncate from root side if too long
    while len(path_joined) > MAX_PATH_CHARS and len(cleaned) > 1:
        cleaned.pop(0)
        path_joined = " > ".join(cleaned)

    path_text = path_joined

    return content_text, path_text, display_path


# ── Load nodes from DB ──────────────────────────────────────────────────────


def load_all_nodes(db_path: Path) -> list[dict]:
    if not db_path.exists():
        print(f"Error: DB not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute(
            """
            SELECT tn.id, tn.title, tn.node_type, tn.context_id, c.name as context_name
            FROM tree_nodes tn
            JOIN contexts c ON tn.context_id = c.id
            ORDER BY c.name, tn.position
            """
        ).fetchall()

        nodes = []
        for node_id, title, node_type, context_id, context_name in rows:
            content_text, path_text, display_path = build_node_texts(conn, node_id)
            nodes.append(
                {
                    "node_id": node_id,
                    "title": title or "",
                    "node_type": node_type,
                    "context_id": context_id,
                    "context_name": context_name,
                    "embed_content": content_text,
                    "embed_path": path_text,
                    "display_path": display_path,
                }
            )
    finally:
        conn.close()

    return nodes


# ── Display helpers ──────────────────────────────────────────────────────────


def node_label(node: dict) -> str:
    ctx = node.get("context_name", "")
    path = node.get("display_path", node["title"])
    if len(path) > 70:
        path = path[:67] + "..."
    return f"{path}  [{ctx}]" if ctx else path


def print_nodes(nodes: list[dict]) -> None:
    by_ctx: dict[str, list[dict]] = {}
    for n in nodes:
        ctx = n.get("context_name", "(unknown)")
        by_ctx.setdefault(ctx, []).append(n)

    total = len(nodes)
    print(f"Total: {total} nodes across {len(by_ctx)} contexts\n")

    for ctx_name, ctx_nodes in sorted(by_ctx.items()):
        print(f"  [{ctx_name}] ({len(ctx_nodes)} nodes)")
        for n in ctx_nodes[:10]:
            c = n["embed_content"]
            p = n["embed_path"]
            if len(c) > 40:
                c = c[:37] + "..."
            if len(p) > 40:
                p = p[:37] + "..."
            print(f"    content={c!r}  path={p!r}")
        if len(ctx_nodes) > 10:
            print(f"    ... and {len(ctx_nodes) - 10} more")
    print()


def print_results(
    query: str,
    ranked: list[tuple[float, float, float, dict]],
    alpha: float,
    top: int | None = None,
) -> None:
    """ranked items: (final_score, content_score, path_score, node)"""
    show = ranked[:top] if top else ranked
    print(f'Query: "{query}"  (alpha={alpha:.2f})')
    print(SEPARATOR)
    print(f"  {'final':>7s}  {'content':>7s}  {'path':>7s}  node")
    print(f"  {'─'*7}  {'─'*7}  {'─'*7}  {'─'*40}")
    for final, cs, ps, node in show:
        label = node_label(node)
        print(f"  [{final:.4f}]  [{cs:.4f}]  [{ps:.4f}]  {label}")
    if top and len(ranked) > top:
        print(f"  ... {len(ranked) - top} more results hidden (use --top to adjust)")
    print()


# ── Ranking (dual-vector fusion) ────────────────────────────────────────────


def rank(
    model: SentenceTransformer,
    query: str,
    nodes: list[dict],
    content_embs: torch.Tensor,
    path_embs: torch.Tensor,
    alpha: float,
) -> list[tuple[float, float, float, dict]]:
    """
    Returns list of (final_score, content_score, path_score, node)
    sorted by final_score descending.
    """
    q_emb = encode_query(model, query)
    device = q_emb.device

    cs = cosine_similarity(q_emb, content_embs.to(device)).squeeze(0)
    ps = cosine_similarity(q_emb, path_embs.to(device)).squeeze(0)
    finals = alpha * cs + (1 - alpha) * ps

    paired = [
        (finals[i].item(), cs[i].item(), ps[i].item(), nodes[i])
        for i in range(len(nodes))
    ]
    paired.sort(key=lambda x: x[0], reverse=True)
    return paired


# ── Export ───────────────────────────────────────────────────────────────────

CSV_HEADER = [
    "query",
    "rank",
    "score_final",
    "score_content",
    "score_path",
    "alpha",
    "node_id",
    "title",
    "node_type",
    "context_name",
    "embed_content",
    "embed_path",
    "display_path",
]


def write_csv_rows(
    writer: csv.writer,
    query: str,
    ranked: list[tuple[float, float, float, dict]],
    alpha: float,
) -> int:
    for i, (final, cs, ps, node) in enumerate(ranked, 1):
        writer.writerow(
            [
                query,
                i,
                f"{final:.6f}",
                f"{cs:.6f}",
                f"{ps:.6f}",
                f"{alpha:.2f}",
                node.get("node_id", ""),
                node["title"],
                node.get("node_type", ""),
                node.get("context_name", ""),
                node.get("embed_content", ""),
                node.get("embed_path", ""),
                node.get("display_path", ""),
            ]
        )
    return len(ranked)


# ── Modes ────────────────────────────────────────────────────────────────────


def run_single(
    model: SentenceTransformer,
    nodes: list[dict],
    content_embs: torch.Tensor,
    path_embs: torch.Tensor,
    query: str,
    alpha: float,
    top: int | None,
    export_path: str | None,
) -> None:
    ranked = rank(model, query, nodes, content_embs, path_embs, alpha)
    print_results(query, ranked, alpha, top)

    if export_path:
        with open(export_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(CSV_HEADER)
            n = write_csv_rows(
                writer, query, ranked[:top] if top else ranked, alpha
            )
        print(f"Exported {n} rows to {export_path}")


def run_interactive(
    model: SentenceTransformer,
    nodes: list[dict],
    content_embs: torch.Tensor,
    path_embs: torch.Tensor,
    alpha: float,
    top: int | None,
    export_path: str | None,
) -> None:
    csv_file = None
    csv_writer = None
    total_rows = 0
    query_count = 0

    if export_path:
        csv_file = open(export_path, "w", newline="", encoding="utf-8")
        csv_writer = csv.writer(csv_file)
        csv_writer.writerow(CSV_HEADER)
        print(f"Results will be appended to {export_path} on each query.\n")

    print('Type a query and press Enter. "quit" or Ctrl+C to exit.')
    print(f'Change alpha mid-session: type "alpha 0.5" to adjust.\n')

    current_alpha = alpha

    try:
        while True:
            try:
                raw = input("query> ").strip()
            except (KeyboardInterrupt, EOFError):
                print("\nBye.")
                break

            if not raw:
                continue
            if raw.lower() in ("quit", "exit", "q"):
                print("Bye.")
                break

            # Allow changing alpha mid-session
            if raw.lower().startswith("alpha "):
                try:
                    new_alpha = float(raw.split(None, 1)[1])
                    if 0.0 <= new_alpha <= 1.0:
                        current_alpha = new_alpha
                        print(f"Alpha set to {current_alpha:.2f}\n")
                    else:
                        print("Alpha must be between 0.0 and 1.0\n")
                except ValueError:
                    print("Usage: alpha 0.5\n")
                continue

            ranked = rank(model, raw, nodes, content_embs, path_embs, current_alpha)
            print()
            print_results(raw, ranked, current_alpha, top)

            if csv_writer:
                n = write_csv_rows(
                    csv_writer,
                    raw,
                    ranked[:top] if top else ranked,
                    current_alpha,
                )
                csv_file.flush()
                total_rows += n
                query_count += 1
    finally:
        if csv_file:
            csv_file.close()
            if total_rows:
                print(
                    f"Exported {total_rows} rows ({query_count} queries) to {export_path}"
                )


# ── Main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Dual-vector live embedding test for vedrr nodes.",
    )
    parser.add_argument(
        "--query", type=str, default=None, help="Single query mode."
    )
    parser.add_argument(
        "--alpha",
        type=float,
        default=DEFAULT_ALPHA,
        help=f"Content weight in fusion (default: {DEFAULT_ALPHA}). "
        "0.0 = path only, 1.0 = content only.",
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=None,
        help=f"SQLite DB path (default: {DB_PATH}).",
    )
    parser.add_argument(
        "--export",
        type=str,
        default=None,
        metavar="FILE.csv",
        help="Export results to CSV.",
    )
    parser.add_argument(
        "--top", type=int, default=None, help="Show only top N results."
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all nodes with dual texts and exit (no model loading).",
    )
    args = parser.parse_args()

    if not 0.0 <= args.alpha <= 1.0:
        print("Error: --alpha must be between 0.0 and 1.0", file=sys.stderr)
        sys.exit(1)

    db_path = Path(args.db_path) if args.db_path else DB_PATH

    # ── Load nodes from DB ──
    print(f"Reading nodes from {db_path} ...")
    nodes = load_all_nodes(db_path)
    if not nodes:
        print("No nodes found in DB.", file=sys.stderr)
        sys.exit(1)

    print_nodes(nodes)

    if args.list:
        for n in nodes:
            print(f"  [{n['node_type']:8s}] content={n['embed_content']!r}")
            print(f"  {'':8s}    path={n['embed_path']!r}")
        return

    # ── Load model & encode dual embeddings ──
    model = load_model()

    content_texts = [n["embed_content"] for n in nodes]
    path_texts = [n["embed_path"] for n in nodes]

    print(f"Encoding {len(nodes)} content passages ...")
    content_embs = encode_passages(model, content_texts)

    print(f"Encoding {len(nodes)} path passages ...")
    path_embs = encode_passages(model, path_texts)

    print(f"Done. Shape: content={content_embs.shape}, path={path_embs.shape}\n")

    # ── Run ──
    if args.query:
        run_single(
            model, nodes, content_embs, path_embs,
            args.query, args.alpha, args.top, args.export,
        )
    else:
        run_interactive(
            model, nodes, content_embs, path_embs,
            args.alpha, args.top, args.export,
        )


if __name__ == "__main__":
    main()
