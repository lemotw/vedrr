import { create } from "zustand";
import type { TreeData, TreeNode, NodeType, CompactResult, ProposedNode, CompactHighlightInfo, CompactSummary } from "../lib/types";
import { ask } from "@tauri-apps/plugin-dialog";
import { ipc } from "../lib/ipc";
import { NodeTypes, PasteKind, CompactStates } from "../lib/constants";
import { useUIStore } from "./uiStore";

// ── Undo types ─────────────────────────────────────────────
const MAX_UNDO = 50;

type UndoEntry =
  | { type: "add"; nodeId: string; contextId: string; prevSelectedId: string | null }
  | { type: "delete"; nodes: TreeNode[]; contextId: string; prevSelectedId: string | null }
  | { type: "title"; nodeId: string; old: string }
  | { type: "type"; nodeId: string; old: NodeType; oldContent?: string | null }
  | { type: "content"; nodeId: string; old: string | null }
  | { type: "reorder"; contextId: string; nodeId: string; parentId: string; oldPosition: number }
  | { type: "move"; nodeId: string; contextId: string; oldParentId: string; oldPosition: number; prevSelectedId: string | null }
  | { type: "compact"; contextId: string; rootId: string; originalNodes: TreeNode[]; prevSelectedId: string | null };

// ── Helpers ────────────────────────────────────────────────
function flattenNodes(td: TreeData): TreeNode[] {
  const result: TreeNode[] = [td.node];
  for (const child of td.children) {
    result.push(...flattenNodes(child));
  }
  return result;
}

interface TreeStore {
  tree: TreeData | null;
  selectedNodeId: string | null;
  copiedNodeId: string | null;
  isCut: boolean;
  undoStack: UndoEntry[];

  loadTree: (contextId: string) => Promise<void>;
  selectNode: (id: string | null) => void;
  copyNode: (nodeId: string | null) => void;
  cutNode: (nodeId: string) => void;
  pasteNodeUnder: (targetParentId: string, contextId: string) => Promise<void>;
  addChild: (parentId: string, contextId: string) => Promise<void>;
  addSibling: (nodeId: string, contextId: string) => Promise<void>;
  deleteNode: (nodeId: string, contextId: string) => Promise<void>;
  updateNodeTitle: (nodeId: string, title: string) => Promise<void>;
  updateNodeType: (nodeId: string, nodeType: NodeType) => Promise<void>;
  updateNodeContent: (nodeId: string, content: string) => Promise<void>;
  pasteAsNode: (parentId: string, contextId: string, data: { kind: typeof PasteKind.IMAGE; blob: File; ext: string } | { kind: typeof PasteKind.TEXT; text: string }) => Promise<void>;
  openOrAttachFile: (nodeId: string) => Promise<void>;
  pickAndImportImage: (nodeId: string) => Promise<void>;
  reorderNode: (nodeId: string, direction: "up" | "down", contextId: string) => Promise<void>;
  dragMoveNode: (nodeId: string, newParentId: string, position: number, contextId: string) => Promise<void>;
  triggerCompact: (nodeId: string) => void;
  applyCompact: (result: CompactResult) => Promise<{ highlights: Map<string, CompactHighlightInfo>; summary: CompactSummary; rootId: string }>;
  undoCompact: () => Promise<void>;
  undo: () => Promise<void>;
  clearUndo: () => void;
}

function patchNode(tree: TreeData, nodeId: string, patch: Partial<TreeData["node"]>): TreeData {
  if (tree.node.id === nodeId) {
    return { ...tree, node: { ...tree.node, ...patch } };
  }
  return { ...tree, children: tree.children.map(c => patchNode(c, nodeId, patch)) };
}

export function findNode(tree: TreeData, id: string): TreeData | null {
  if (tree.node.id === id) return tree;
  for (const child of tree.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function findParent(tree: TreeData, targetId: string): TreeData | null {
  for (const child of tree.children) {
    if (child.node.id === targetId) return tree;
    const found = findParent(child, targetId);
    if (found) return found;
  }
  return null;
}

function pushUndo(stack: UndoEntry[], entry: UndoEntry): UndoEntry[] {
  const next = [...stack, entry];
  return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
}

function clearCut(get: () => TreeStore, set: (s: Partial<TreeStore>) => void) {
  if (get().isCut) set({ copiedNodeId: null, isCut: false });
}

function isCompactLocked(nodeId: string): boolean {
  const { compactState, compactRootId } = useUIStore.getState();
  if (compactState !== CompactStates.APPLIED || !compactRootId) return false;
  const tree = useTreeStore.getState().tree;
  if (!tree) return false;
  const compactRoot = findNode(tree, compactRootId);
  if (!compactRoot) return false;
  return findNode(compactRoot, nodeId) === null;
}

export const useTreeStore = create<TreeStore>((set, get) => ({
  tree: null,
  selectedNodeId: null,
  copiedNodeId: null,
  isCut: false,
  undoStack: [],

  loadTree: async (contextId: string) => {
    const tree = await ipc.getTree(contextId);
    set({ tree, selectedNodeId: tree ? tree.node.id : null });
  },

  selectNode: (id) => {
    set({ selectedNodeId: id });
    const { markdownEditorNodeId, closeMarkdownEditor } = useUIStore.getState();
    if (markdownEditorNodeId && markdownEditorNodeId !== id) closeMarkdownEditor();
  },

  copyNode: (nodeId: string | null) => {
    set({ copiedNodeId: nodeId, isCut: false });
  },

  cutNode: (nodeId: string) => {
    set({ copiedNodeId: nodeId, isCut: true });
  },

  pasteNodeUnder: async (targetParentId, contextId) => {
    if (isCompactLocked(targetParentId)) return;
    const { copiedNodeId, isCut, tree, selectedNodeId, undoStack } = get();
    if (!copiedNodeId) return;
    const newId = await ipc.cloneSubtree(copiedNodeId, targetParentId, contextId);
    let newStack = pushUndo(undoStack, { type: "add", nodeId: newId, contextId, prevSelectedId: selectedNodeId });
    if (isCut && tree) {
      const target = findNode(tree, copiedNodeId);
      if (target) {
        const nodes = flattenNodes(target);
        newStack = pushUndo(newStack, { type: "delete", nodes, contextId, prevSelectedId: selectedNodeId });
      }
      await ipc.deleteNode(copiedNodeId);
      set({ copiedNodeId: null, isCut: false });
    }
    set({ undoStack: newStack });
    await get().loadTree(contextId);
    set({ selectedNodeId: newId });
  },

  addChild: async (parentId, contextId) => {
    if (isCompactLocked(parentId)) return;
    clearCut(get, set);
    const { selectedNodeId, undoStack } = get();
    const node = await ipc.createNode(contextId, parentId, NodeTypes.TEXT, "");
    set({ undoStack: pushUndo(undoStack, { type: "add", nodeId: node.id, contextId, prevSelectedId: selectedNodeId }) });
    await get().loadTree(contextId);
    set({ selectedNodeId: node.id });
    useUIStore.getState().setEditingNode(node.id);
    ipc.embedSingleNode(node.id).catch(console.error);
  },

  addSibling: async (nodeId, contextId) => {
    if (isCompactLocked(nodeId)) return;
    clearCut(get, set);
    const { tree, selectedNodeId, undoStack } = get();
    if (!tree) return;
    const parent = findParent(tree, nodeId);
    if (!parent || isCompactLocked(parent.node.id)) return;
    const node = await ipc.createNode(contextId, parent.node.id, NodeTypes.TEXT, "");
    set({ undoStack: pushUndo(undoStack, { type: "add", nodeId: node.id, contextId, prevSelectedId: selectedNodeId }) });
    await get().loadTree(contextId);
    set({ selectedNodeId: node.id });
    useUIStore.getState().setEditingNode(node.id);
    ipc.embedSingleNode(node.id).catch(console.error);
  },

  deleteNode: async (nodeId, contextId) => {
    if (isCompactLocked(nodeId)) return;
    const { compactRootId } = useUIStore.getState();
    if (compactRootId && nodeId === compactRootId) return;
    clearCut(get, set);
    const { tree, selectedNodeId, undoStack } = get();
    if (!tree || tree.node.id === nodeId) return;
    const target = findNode(tree, nodeId);
    if (!target) return;
    if (target.children.length > 0) {
      const confirmed = await ask(
        `「${target.node.title || "Untitled"}」有 ${target.children.length} 個子節點，確定要刪除？`,
        { title: "刪除確認", kind: "info" },
      );
      if (!confirmed) return;
    }
    // Snapshot subtree before delete
    const nodes = flattenNodes(target);
    set({ undoStack: pushUndo(undoStack, { type: "delete", nodes, contextId, prevSelectedId: selectedNodeId }) });
    // Find parent before deletion so we can select it after
    const parent = findParent(tree, nodeId);
    await ipc.deleteNode(nodeId);
    await get().loadTree(contextId);
    const newTree = get().tree;
    set({ selectedNodeId: parent?.node.id ?? newTree?.node.id ?? null });
  },

  updateNodeTitle: async (nodeId, title) => {
    if (isCompactLocked(nodeId)) return;
    clearCut(get, set);
    const { tree, undoStack } = get();
    if (!tree) return;
    const target = findNode(tree, nodeId);
    if (target) {
      set({ undoStack: pushUndo(undoStack, { type: "title", nodeId, old: target.node.title }) });
    }
    await ipc.updateNode(nodeId, { title });
    if (tree) {
      set({ tree: patchNode(get().tree!, nodeId, { title }) });
    }
    ipc.embedSingleNode(nodeId).catch(console.error);
  },

  updateNodeContent: async (nodeId, content) => {
    if (isCompactLocked(nodeId)) return;
    clearCut(get, set);
    const { tree, undoStack } = get();
    if (!tree) return;
    const target = findNode(tree, nodeId);
    if (target) {
      set({ undoStack: pushUndo(undoStack, { type: "content", nodeId, old: target.node.content }) });
    }
    await ipc.updateNode(nodeId, { content });
    set({ tree: patchNode(get().tree!, nodeId, { content }) });
  },

  updateNodeType: async (nodeId, nodeType) => {
    if (isCompactLocked(nodeId)) return;
    clearCut(get, set);
    const { tree, undoStack } = get();
    if (!tree) return;
    const target = findNode(tree, nodeId);
    if (target) {
      set({ undoStack: pushUndo(undoStack, { type: "type", nodeId, old: target.node.node_type, oldContent: target.node.content }) });
    }
    await ipc.updateNode(nodeId, { nodeType });
    // Reload tree to pick up file_path changes (e.g. markdown .md file creation)
    const contextId = get().tree!.node.context_id;
    const prevSelected = get().selectedNodeId;
    const freshTree = await ipc.getTree(contextId);
    set({ tree: freshTree, selectedNodeId: prevSelected });
  },

  pasteAsNode: async (parentId, contextId, data) => {
    if (isCompactLocked(parentId)) return;
    clearCut(get, set);
    const { selectedNodeId, undoStack } = get();
    if (data.kind === PasteKind.IMAGE) {
      const node = await ipc.createNode(contextId, parentId, NodeTypes.IMAGE, `Image ${new Date().toLocaleTimeString()}`);
      const buffer = await data.blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      const savedPath = await ipc.saveClipboardImage(contextId, node.id, bytes, data.ext);
      await ipc.updateNode(node.id, { filePath: savedPath });
      set({ undoStack: pushUndo(undoStack, { type: "add", nodeId: node.id, contextId, prevSelectedId: selectedNodeId }) });
      await get().loadTree(contextId);
      set({ selectedNodeId: node.id });
      ipc.embedSingleNode(node.id).catch(console.error);
    } else {
      const title = data.text.trim().split("\n")[0].slice(0, 200);
      if (!title) return;
      const node = await ipc.createNode(contextId, parentId, NodeTypes.TEXT, title);
      if (data.text.trim().length > title.length) {
        await ipc.updateNode(node.id, { content: data.text.trim() });
      }
      set({ undoStack: pushUndo(undoStack, { type: "add", nodeId: node.id, contextId, prevSelectedId: selectedNodeId }) });
      await get().loadTree(contextId);
      set({ selectedNodeId: node.id });
      useUIStore.getState().setEditingNode(node.id);
      ipc.embedSingleNode(node.id).catch(console.error);
    }
  },

  openOrAttachFile: async (nodeId) => {
    if (isCompactLocked(nodeId)) return;
    const { tree } = get();
    if (!tree) return;
    const target = findNode(tree, nodeId);
    if (!target) return;
    const { node } = target;
    const type = node.node_type;
    if (type !== NodeTypes.FILE && type !== NodeTypes.MARKDOWN) return;

    if (node.file_path) {
      await ipc.revealFile(node.file_path);
    } else {
      const filePath = await ipc.pickFile();
      if (!filePath) return;
      await ipc.updateNode(nodeId, { filePath });
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      if (!node.title || node.title === "Untitled") {
        await ipc.updateNode(nodeId, { title: fileName });
      }
      set({ tree: patchNode(tree, nodeId, { file_path: filePath, title: node.title || fileName }) });
    }
  },

  pickAndImportImage: async (nodeId) => {
    if (isCompactLocked(nodeId)) return;
    const { tree } = get();
    if (!tree) return;
    const target = findNode(tree, nodeId);
    if (!target || target.node.node_type !== NodeTypes.IMAGE) return;

    const filePath = await ipc.pickImage();
    if (!filePath) return;

    const contextId = target.node.context_id;
    const savedPath = await ipc.importImage(contextId, nodeId, filePath);
    await ipc.updateNode(nodeId, { filePath: savedPath });

    const fileName = filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") || "Image";
    if (!target.node.title || target.node.title.startsWith("Image ")) {
      await ipc.updateNode(nodeId, { title: fileName });
      set({ tree: patchNode(get().tree!, nodeId, { file_path: savedPath, title: fileName }) });
    } else {
      set({ tree: patchNode(get().tree!, nodeId, { file_path: savedPath }) });
    }
  },

  reorderNode: async (nodeId, direction, contextId) => {
    if (isCompactLocked(nodeId)) return;
    clearCut(get, set);
    const { tree, undoStack } = get();
    if (!tree) return;
    const parent = findParent(tree, nodeId);
    if (!parent) return;
    const target = findNode(tree, nodeId);
    if (!target) return;
    const siblings = parent.children;
    const idx = siblings.findIndex(s => s.node.id === nodeId);
    if (idx < 0) return;
    if (direction === "up" && idx > 0) {
      set({ undoStack: pushUndo(undoStack, { type: "reorder", contextId, nodeId, parentId: parent.node.id, oldPosition: target.node.position }) });
      await ipc.moveNode(nodeId, parent.node.id, siblings[idx - 1].node.position);
    } else if (direction === "down" && idx < siblings.length - 1) {
      set({ undoStack: pushUndo(undoStack, { type: "reorder", contextId, nodeId, parentId: parent.node.id, oldPosition: target.node.position }) });
      await ipc.moveNode(nodeId, parent.node.id, siblings[idx + 1].node.position + 1);
    } else {
      return;
    }
    await get().loadTree(contextId);
    set({ selectedNodeId: nodeId });
  },

  dragMoveNode: async (nodeId, newParentId, position, contextId) => {
    if (isCompactLocked(nodeId) || isCompactLocked(newParentId)) return;
    clearCut(get, set);
    const { tree, undoStack, selectedNodeId } = get();
    if (!tree) return;
    const node = findNode(tree, nodeId);
    if (!node || !node.node.parent_id) return; // Don't move root
    // Prevent cycle: don't move node under its own descendant
    if (findNode(node, newParentId)) return;
    set({
      undoStack: pushUndo(undoStack, {
        type: "move", nodeId, contextId,
        oldParentId: node.node.parent_id,
        oldPosition: node.node.position,
        prevSelectedId: selectedNodeId,
      }),
    });
    await ipc.moveNode(nodeId, newParentId, position);
    await get().loadTree(contextId);
    set({ selectedNodeId: nodeId });
    ipc.embedSingleNode(nodeId).catch(console.error);
  },

  triggerCompact: (nodeId: string) => {
    if (useUIStore.getState().compactState !== CompactStates.IDLE) {
      useUIStore.getState().flashCompactBanner();
      return;
    }
    const profileId = localStorage.getItem("vedrr-active-ai-profile");
    if (!profileId) {
      useUIStore.getState().setCompactError("尚未選擇 AI 設定檔，請先在 AI 設定中建立並選擇。");
      return;
    }
    useUIStore.getState().setCompactState(CompactStates.LOADING);
    ipc.compactNode(nodeId, profileId)
      .then(async (result) => {
        const { highlights, summary, rootId } = await get().applyCompact(result);
        const totalChanges = summary.added + summary.edited + summary.moved + summary.deleted;
        if (totalChanges === 0) {
          useUIStore.getState().setCompactState(CompactStates.IDLE);
        } else {
          useUIStore.getState().setCompactApplied(rootId, summary, highlights);
        }
      })
      .catch((err) => {
        console.error("[compact] error:", err);
        const msg = String(err);
        // Humanize common backend errors
        if (msg.includes("HTTP 401") || msg.includes("HTTP 403")) {
          useUIStore.getState().setCompactError("API 金鑰無效或已過期，請至 AI 設定更新。");
        } else if (msg.includes("HTTP 429")) {
          useUIStore.getState().setCompactError("API 請求過於頻繁，請稍後再試。");
        } else if (msg.includes("子樹包含") || msg.includes("子樹深度")) {
          useUIStore.getState().setCompactError(msg.replace(/^.*?子樹/, "子樹"));
        } else if (msg.includes("No API key") || msg.includes("Keyring")) {
          useUIStore.getState().setCompactError("找不到 API 金鑰，請至 AI 設定重新輸入。");
        } else if (msg.includes("AI profile not found")) {
          useUIStore.getState().setCompactError("AI 設定檔已刪除，請重新選擇。");
        } else if (msg.includes("timeout") || msg.includes("Timeout")) {
          useUIStore.getState().setCompactError("AI 回應逾時，請稍後再試或選擇較小的子樹。");
        } else {
          useUIStore.getState().setCompactError("AI 重組失敗，請稍後再試。");
        }
      });
  },

  applyCompact: async (result: CompactResult) => {
    const { tree, undoStack, selectedNodeId } = get();
    if (!tree) throw new Error("No tree loaded");
    const rootId = result.original.node.id;
    const contextId = result.original.node.context_id;

    const rootNode = findNode(tree, rootId);
    if (!rootNode) throw new Error("Root node not found");

    // 1. Build origMap: id → { title, parentId, content, file_path }
    const origMap = new Map<string, { title: string; parentId: string | null; content: string | null; file_path: string | null }>();
    function walkOrig(td: TreeData) {
      origMap.set(td.node.id, { title: td.node.title, parentId: td.node.parent_id, content: td.node.content, file_path: td.node.file_path });
      for (const c of td.children) walkOrig(c);
    }
    walkOrig(rootNode);

    // Build parentTitleMap: id → parent title (for "from" display)
    const parentTitleMap = new Map<string, string>();
    function buildParentTitles(td: TreeData) {
      for (const c of td.children) {
        parentTitleMap.set(c.node.id, td.node.title);
        buildParentTitles(c);
      }
    }
    buildParentTitles(rootNode);

    // 2. Snapshot for undo
    const allNodes = flattenNodes(rootNode).filter(n => n.id !== rootId);
    set({ undoStack: pushUndo(undoStack, { type: "compact", contextId, rootId, originalNodes: allNodes, prevSelectedId: selectedNodeId }) });

    // 3. Delete existing children + rebuild (with rollback on failure)
    try {
      for (const child of rootNode.children) {
        await ipc.deleteNode(child.node.id);
      }

      // 4. Unwrap root if AI included it in proposed (LLM sometimes wraps root)
      let proposedChildren = result.proposed;
      if (
        proposedChildren.length === 1 &&
        proposedChildren[0].source_id === rootId
      ) {
        const wrappedRoot = proposedChildren[0];
        if (wrappedRoot.title && wrappedRoot.title !== rootNode.node.title) {
          await ipc.updateNode(rootId, { title: wrappedRoot.title });
        }
        proposedChildren = wrappedRoot.children;
      }

      // 5. Rebuild from proposed tree + collect highlights
      const highlights = new Map<string, CompactHighlightInfo>();
      let addedCount = 0;
      let editedCount = 0;
      let movedCount = 0;

      async function createChildren(proposed: ProposedNode[], parentId: string, parentSourceId: string | null) {
        for (const p of proposed) {
          const nodeType = (["text", "markdown", "image", "file"].includes(p.node_type) ? p.node_type : "text") as string;
          const node = await ipc.createNode(contextId, parentId, nodeType, p.title);

          if (!p.source_id) {
            highlights.set(node.id, { type: "added" });
            addedCount++;
          } else {
            const orig = origMap.get(p.source_id);
            if (orig) {
              // Preserve content and file_path from source node
              const updates: Record<string, string> = {};
              if (orig.content) updates.content = orig.content;
              if (orig.file_path) updates.filePath = orig.file_path;
              if (Object.keys(updates).length > 0) {
                await ipc.updateNode(node.id, updates);
              }

              const titleChanged = orig.title !== p.title;
              const parentChanged = orig.parentId !== parentSourceId;

              if (titleChanged && parentChanged) {
                highlights.set(node.id, { type: "edited+moved", oldTitle: orig.title, fromParent: parentTitleMap.get(p.source_id) });
                editedCount++;
                movedCount++;
              } else if (titleChanged) {
                highlights.set(node.id, { type: "edited", oldTitle: orig.title });
                editedCount++;
              } else if (parentChanged) {
                highlights.set(node.id, { type: "moved", fromParent: parentTitleMap.get(p.source_id) });
                movedCount++;
              }
            } else {
              highlights.set(node.id, { type: "added" });
              addedCount++;
            }
          }

          if (p.children.length > 0) {
            await createChildren(p.children, node.id, p.source_id ?? null);
          }
        }
      }
      await createChildren(proposedChildren, rootId, rootId);
      await get().loadTree(contextId);
      set({ selectedNodeId: rootId });

      // 6. Compute deleted nodes
      const usedSourceIds = new Set<string>();
      function collectSourceIds(nodes: ProposedNode[]) {
        for (const n of nodes) {
          if (n.source_id) usedSourceIds.add(n.source_id);
          collectSourceIds(n.children);
        }
      }
      collectSourceIds(proposedChildren);

      const deletedNames: string[] = [];
      for (const [id, info] of origMap) {
        if (id === rootId) continue;
        if (!usedSourceIds.has(id)) deletedNames.push(info.title);
      }

      const summary: CompactSummary = {
        added: addedCount,
        edited: editedCount,
        moved: movedCount,
        deleted: deletedNames.length,
        deletedNames,
      };

      return { highlights, summary, rootId };
    } catch (err) {
      // Rollback: restore original nodes from undo snapshot
      await ipc.restoreNodes(allNodes);
      await get().loadTree(contextId);
      throw err;
    }
  },

  undoCompact: async () => {
    const { tree, undoStack } = get();
    if (!tree || undoStack.length === 0) return;

    // Scan backwards for the compact entry (edits during APPLIED sit on top)
    let compactIdx = -1;
    for (let i = undoStack.length - 1; i >= 0; i--) {
      if (undoStack[i].type === "compact") { compactIdx = i; break; }
    }
    if (compactIdx < 0) return;
    const entry = undoStack[compactIdx] as Extract<UndoEntry, { type: "compact" }>;

    // Remove compact entry + all subsequent edits made during APPLIED
    set({ undoStack: undoStack.slice(0, compactIdx) });

    // Delete all current children of root, then restore originals
    const rootNode = findNode(tree, entry.rootId);
    if (rootNode) {
      for (const child of rootNode.children) {
        await ipc.deleteNode(child.node.id);
      }
    }
    await ipc.restoreNodes(entry.originalNodes);
    await get().loadTree(entry.contextId);
    set({ selectedNodeId: entry.prevSelectedId });
  },

  undo: async () => {
    clearCut(get, set);
    const { undoStack } = get();
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    set({ undoStack: undoStack.slice(0, -1) });

    switch (entry.type) {
      case "add": {
        await ipc.deleteNode(entry.nodeId);
        await get().loadTree(entry.contextId);
        set({ selectedNodeId: entry.prevSelectedId });
        break;
      }
      case "delete": {
        await ipc.restoreNodes(entry.nodes);
        await get().loadTree(entry.contextId);
        set({ selectedNodeId: entry.prevSelectedId });
        break;
      }
      case "title": {
        await ipc.updateNode(entry.nodeId, { title: entry.old });
        const tree = get().tree;
        if (tree) {
          set({ tree: patchNode(tree, entry.nodeId, { title: entry.old }) });
        }
        break;
      }
      case "type": {
        await ipc.updateNode(entry.nodeId, { nodeType: entry.old });
        // Restore DB content if saved (e.g., undoing text→markdown clears content in DB)
        if (entry.oldContent !== undefined && entry.oldContent !== null) {
          await ipc.updateNode(entry.nodeId, { content: entry.oldContent });
        }
        // Reload tree to pick up file_path changes from Rust
        const ctxId = get().tree?.node.context_id;
        if (ctxId) {
          const prev = get().selectedNodeId;
          const fresh = await ipc.getTree(ctxId);
          set({ tree: fresh, selectedNodeId: prev });
        }
        break;
      }
      case "content": {
        await ipc.updateNode(entry.nodeId, { content: entry.old ?? "" });
        const tree3 = get().tree;
        if (tree3) set({ tree: patchNode(tree3, entry.nodeId, { content: entry.old }) });
        break;
      }
      case "reorder": {
        await ipc.moveNode(entry.nodeId, entry.parentId, entry.oldPosition);
        await get().loadTree(entry.contextId);
        break;
      }
      case "move": {
        await ipc.moveNode(entry.nodeId, entry.oldParentId, entry.oldPosition);
        await get().loadTree(entry.contextId);
        set({ selectedNodeId: entry.prevSelectedId });
        break;
      }
      case "compact": {
        // Compact undo: delete new children, restore originals
        const rootNode = findNode(get().tree!, entry.rootId);
        if (rootNode) {
          for (const child of rootNode.children) {
            await ipc.deleteNode(child.node.id);
          }
        }
        await ipc.restoreNodes(entry.originalNodes);
        await get().loadTree(entry.contextId);
        set({ selectedNodeId: entry.prevSelectedId });
        break;
      }
    }
  },

  clearUndo: () => {
    set({ undoStack: [] });
  },
}));
