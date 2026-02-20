import type { TreeData, ProposedNode } from "./types";

export type DiffOp =
  | { type: "delete"; nodeId: string; title: string }
  | { type: "add"; title: string; nodeType: string; parentTitle: string }
  | { type: "edit"; nodeId: string; oldTitle: string; newTitle: string }
  | { type: "move"; nodeId: string; title: string; newParentTitle: string }
  | { type: "keep"; nodeId: string; title: string };

/** Flatten a TreeData into a map of id → { node, parentId } */
function flattenOriginal(tree: TreeData): Map<string, { title: string; nodeType: string; parentId: string | null }> {
  const map = new Map<string, { title: string; nodeType: string; parentId: string | null }>();
  function walk(t: TreeData) {
    map.set(t.node.id, {
      title: t.node.title,
      nodeType: t.node.node_type,
      parentId: t.node.parent_id,
    });
    for (const c of t.children) walk(c);
  }
  walk(tree);
  return map;
}

/** Collect all source_ids referenced in the proposed tree */
function collectSourceIds(nodes: ProposedNode[]): Set<string> {
  const ids = new Set<string>();
  function walk(n: ProposedNode) {
    if (n.source_id) ids.add(n.source_id);
    for (const c of n.children) walk(c);
  }
  for (const n of nodes) walk(n);
  return ids;
}

/** Compute diff operations between original tree and proposed restructure */
export function computeDiff(original: TreeData, proposed: ProposedNode[]): DiffOp[] {
  const ops: DiffOp[] = [];
  const origMap = flattenOriginal(original);
  const usedIds = collectSourceIds(proposed);

  // 1. Nodes in original but not referenced → deleted
  for (const [id, info] of origMap) {
    if (id === original.node.id) continue; // root node itself is always kept
    if (!usedIds.has(id)) {
      ops.push({ type: "delete", nodeId: id, title: info.title });
    }
  }

  // 2. Walk proposed tree to find adds, edits, moves, keeps
  function walkProposed(nodes: ProposedNode[], parentTitle: string, originalParentId: string | null) {
    for (const p of nodes) {
      if (!p.source_id) {
        // New node
        ops.push({ type: "add", title: p.title, nodeType: p.node_type, parentTitle });
      } else {
        const orig = origMap.get(p.source_id);
        if (!orig) {
          // source_id doesn't match any original node → treat as add
          ops.push({ type: "add", title: p.title, nodeType: p.node_type, parentTitle });
        } else {
          const titleChanged = orig.title !== p.title;
          const parentChanged = orig.parentId !== originalParentId;

          if (titleChanged && parentChanged) {
            ops.push({ type: "edit", nodeId: p.source_id, oldTitle: orig.title, newTitle: p.title });
            ops.push({ type: "move", nodeId: p.source_id, title: p.title, newParentTitle: parentTitle });
          } else if (titleChanged) {
            ops.push({ type: "edit", nodeId: p.source_id, oldTitle: orig.title, newTitle: p.title });
          } else if (parentChanged) {
            ops.push({ type: "move", nodeId: p.source_id, title: p.title, newParentTitle: parentTitle });
          } else {
            ops.push({ type: "keep", nodeId: p.source_id, title: p.title });
          }
        }
      }

      // Recurse children — use source_id as the parent ID for move detection
      const thisParentId = p.source_id ?? null;
      walkProposed(p.children, p.title, thisParentId);
    }
  }

  // The proposed nodes are children of the root (original.node.id)
  walkProposed(proposed, original.node.title, original.node.id);

  return ops;
}
