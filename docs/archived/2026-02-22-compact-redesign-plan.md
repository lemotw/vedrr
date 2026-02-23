# AI Compact Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the old two-panel CompactPreview modal with Auto-Apply + Summary Banner + Undo + Inline Color Coding.

**Architecture:** AI Compact now applies immediately, shows a non-blocking banner with stats, highlights changed nodes with color-coded left bars + background tints, and supports `u` to undo. State machine: IDLE → LOADING → APPLIED → IDLE.

**Tech Stack:** React 19 + TypeScript + Zustand 5 + Tailwind CSS v4 (Tauri 2 desktop app)

**Design spec:** `docs/do/compact-redesign.md`

---

### Task 1: Types, Constants & uiStore Refactor

**Files:**
- Modify: `src/lib/types.ts:42-52`
- Modify: `src/lib/constants.ts` (add at end)
- Modify: `src/stores/uiStore.ts` (full rewrite of compact-related state)

**Step 1: Add types to `src/lib/types.ts`**

After the existing `CompactResult` interface (line 52), add:

```typescript
export type CompactChangeType = "added" | "edited" | "moved" | "edited+moved";

export interface CompactHighlightInfo {
  type: CompactChangeType;
  oldTitle?: string;      // for "edited" | "edited+moved"
  fromParent?: string;    // for "moved" | "edited+moved"
}

export interface CompactSummary {
  added: number;
  edited: number;
  moved: number;
  deleted: number;
  deletedNames: string[];
}
```

**Step 2: Add constants to `src/lib/constants.ts`**

Add at end of file:

```typescript
export const CompactStates = {
  IDLE: "idle",
  LOADING: "loading",
  APPLIED: "applied",
} as const;
export type CompactState = (typeof CompactStates)[keyof typeof CompactStates];
```

**Step 3: Refactor `src/stores/uiStore.ts`**

Remove imports:
- Remove `import type { CompactResult } from "../lib/types";`
- Remove `import type { DiffOp } from "../lib/compactDiff";`

Add imports:
- `import type { CompactHighlightInfo, CompactSummary } from "../lib/types";`
- `import { CompactStates, type CompactState } from "../lib/constants";`

Replace interface fields (lines 52-55):
```typescript
// OLD:
compactLoading: boolean;
compactResult: CompactResult | null;
compactDiff: DiffOp[] | null;
compactError: string | null;

// NEW:
compactState: CompactState;
compactHighlights: Map<string, CompactHighlightInfo> | null;
compactSummary: CompactSummary | null;
compactBannerExpanded: boolean;
compactFading: boolean;
compactError: string | null;
```

Replace interface methods (lines 78-80):
```typescript
// OLD:
setCompactLoading: (v: boolean) => void;
setCompactResult: (result: CompactResult | null, diff: DiffOp[] | null) => void;
setCompactError: (error: string | null) => void;
closeCompactPreview: () => void;

// NEW:
setCompactState: (state: CompactState) => void;
setCompactApplied: (summary: CompactSummary, highlights: Map<string, CompactHighlightInfo>) => void;
dismissCompactBanner: () => void;
clearCompactHighlights: () => void;
startCompactFade: (delayMs?: number) => void;
toggleCompactBannerExpanded: () => void;
setCompactError: (error: string | null) => void;
```

Replace initial state (lines 98-100):
```typescript
// OLD:
compactLoading: false,
compactResult: null,
compactDiff: null,
compactError: null,

// NEW:
compactState: CompactStates.IDLE,
compactHighlights: null,
compactSummary: null,
compactBannerExpanded: false,
compactFading: false,
compactError: null,
```

Replace methods (lines 142-145):
```typescript
// OLD:
setCompactLoading: (v) => set({ compactLoading: v }),
setCompactResult: (result, diff) => set({ compactResult: result, compactDiff: diff, compactError: null }),
setCompactError: (error) => set({ compactError: error }),
closeCompactPreview: () => set({ compactResult: null, compactDiff: null, compactError: null }),

// NEW:
setCompactState: (state) => set({ compactState: state }),
setCompactApplied: (summary, highlights) => set({
  compactState: CompactStates.APPLIED,
  compactSummary: summary,
  compactHighlights: highlights,
  compactBannerExpanded: false,
  compactFading: false,
  compactError: null,
}),
dismissCompactBanner: () => set({
  compactState: CompactStates.IDLE,
  compactSummary: null,
  compactBannerExpanded: false,
}),
clearCompactHighlights: () => set({
  compactHighlights: null,
  compactFading: false,
  compactState: CompactStates.IDLE,
  compactSummary: null,
  compactBannerExpanded: false,
}),
startCompactFade: (delayMs = 0) => {
  setTimeout(() => {
    set({ compactFading: true });
    setTimeout(() => {
      set({ compactHighlights: null, compactFading: false });
    }, 800);
  }, delayMs);
},
toggleCompactBannerExpanded: () => set((s) => ({ compactBannerExpanded: !s.compactBannerExpanded })),
setCompactError: (error) => set({ compactError: error, compactState: CompactStates.IDLE }),
```

**Step 4: Verify**

Run: `pnpm lint`
Expected: May have some errors from files still importing old types (CompactPreview, etc.) — that's OK, we'll fix them in later tasks.

Run: `pnpm build`
Expected: Likely fails due to downstream consumers — that's expected at this stage.

**Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/constants.ts src/stores/uiStore.ts
git commit -m "refactor: compact state machine types + uiStore (IDLE/LOADING/APPLIED)"
```

---

### Task 2: treeStore — Snapshot, Highlight Map & Compact Undo

**Files:**
- Modify: `src/stores/treeStore.ts:1-6` (imports), `339-369` (applyCompact), `9-19` (UndoEntry)

**Step 1: Add imports**

Add to existing imports in `src/stores/treeStore.ts` line 2:
```typescript
import type { TreeData, TreeNode, NodeType, CompactResult, ProposedNode, CompactHighlightInfo, CompactSummary } from "../lib/types";
```

**Step 2: Add "compact" UndoEntry type**

In the `UndoEntry` union type (lines 12-19), add a new variant:
```typescript
  | { type: "compact"; contextId: string; rootId: string; originalNodes: TreeNode[]; prevSelectedId: string | null };
```

**Step 3: Add `applyCompactAutoApply` to TreeStore interface**

Replace the interface declaration for `applyCompact` (line 53):
```typescript
// OLD:
applyCompact: (result: CompactResult) => Promise<void>;

// NEW:
applyCompact: (result: CompactResult) => Promise<{ highlights: Map<string, CompactHighlightInfo>; summary: CompactSummary }>;
```

**Step 4: Add `undoCompact` method to interface**

Add after `applyCompact`:
```typescript
undoCompact: () => Promise<void>;
```

**Step 5: Rewrite `applyCompact` implementation (lines 339-369)**

```typescript
applyCompact: async (result: CompactResult) => {
  const { tree, undoStack, selectedNodeId } = get();
  if (!tree) throw new Error("No tree loaded");
  const rootId = result.original.node.id;
  const contextId = result.original.node.context_id;

  const rootNode = findNode(tree, rootId);
  if (!rootNode) throw new Error("Root node not found");

  // 1. Build origMap: id → { title, parentId }
  const origMap = new Map<string, { title: string; parentId: string | null }>();
  function walkOrig(td: TreeData) {
    origMap.set(td.node.id, { title: td.node.title, parentId: td.node.parent_id });
    for (const c of td.children) walkOrig(c);
  }
  walkOrig(rootNode);

  // Also build parentTitleMap: id → parent title (for "from" display)
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

  // 3. Delete existing children
  for (const child of rootNode.children) {
    await ipc.deleteNode(child.node.id);
  }

  // 4. Rebuild from proposed tree + collect highlights
  const highlights = new Map<string, CompactHighlightInfo>();
  let addedCount = 0;
  let editedCount = 0;
  let movedCount = 0;

  async function createChildren(proposed: ProposedNode[], parentId: string) {
    for (const p of proposed) {
      const nodeType = (["text", "markdown", "image", "file"].includes(p.node_type) ? p.node_type : "text") as string;
      const node = await ipc.createNode(contextId, parentId, nodeType, p.title);

      if (!p.source_id) {
        highlights.set(node.id, { type: "added" });
        addedCount++;
      } else {
        const orig = origMap.get(p.source_id);
        if (orig) {
          const titleChanged = orig.title !== p.title;
          // Compare parent: proposed node's parent is `parentId`, original's parent was `orig.parentId`
          // But parentId is a NEW id. We need the source_id of the parent proposed node.
          // Simpler: for root's direct children, originalParentId = rootId
          // For deeper nodes, we track source_id of their proposed parent
          const origParent = origMap.get(p.source_id)?.parentId;
          // Find what the proposed parent's source_id maps to
          const parentChanged = origParent !== parentId && !isNewParentSameAsOriginal(parentId, origParent, origMap);

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
          // else: keep — no highlight
        } else {
          // source_id not found → treat as added
          highlights.set(node.id, { type: "added" });
          addedCount++;
        }
      }

      if (p.children.length > 0) {
        await createChildren(p.children, node.id);
      }
    }
  }

  // Track new node id → source_id mapping for parent change detection
  const newIdToSourceId = new Map<string, string>();

  await createChildren(result.proposed, rootId);
  await get().loadTree(contextId);
  set({ selectedNodeId: rootId });

  // 5. Compute deleted nodes
  const usedSourceIds = new Set<string>();
  function collectSourceIds(nodes: ProposedNode[]) {
    for (const n of nodes) {
      if (n.source_id) usedSourceIds.add(n.source_id);
      collectSourceIds(n.children);
    }
  }
  collectSourceIds(result.proposed);

  const deletedNames: string[] = [];
  for (const [id, info] of origMap) {
    if (id === rootId) continue;
    if (!usedSourceIds.has(id)) {
      deletedNames.push(info.title);
    }
  }

  const summary: CompactSummary = {
    added: addedCount,
    edited: editedCount,
    moved: movedCount,
    deleted: deletedNames.length,
    deletedNames,
  };

  return { highlights, summary };
},
```

Wait — the parent change detection above is tricky because after we delete and recreate, the `parentId` passed to `createChildren` is the NEW node ID, not the original. The simplest approach: track a mapping from "proposed parent's source_id" → "new parent id" and compare against original parent id.

Let me simplify. The parent change detection logic should be:
- For root-level proposed children: their new parent is `rootId` (same as original root). Check if their original parent was also `rootId`.
- For deeper children: we need to track what source_id the proposed parent maps to.

A simpler approach: pass `parentSourceId` through the recursion:

```typescript
async function createChildren(proposed: ProposedNode[], parentId: string, parentSourceId: string | null) {
  for (const p of proposed) {
    // ...
    if (p.source_id) {
      const orig = origMap.get(p.source_id);
      if (orig) {
        const titleChanged = orig.title !== p.title;
        const parentChanged = orig.parentId !== parentSourceId;
        // ...
      }
    }
    // recurse with p.source_id as parentSourceId
    await createChildren(p.children, node.id, p.source_id ?? null);
  }
}

// Initial call: parent is root, so parentSourceId = rootId
await createChildren(result.proposed, rootId, rootId);
```

This is much cleaner. Let me revise the plan with this approach.

**Step 6: Add `undoCompact` implementation**

```typescript
undoCompact: async () => {
  const { tree, undoStack } = get();
  if (!tree || undoStack.length === 0) return;
  const entry = undoStack[undoStack.length - 1];
  if (entry.type !== "compact") return;
  set({ undoStack: undoStack.slice(0, -1) });

  // Delete all current children of root
  const rootNode = findNode(tree, entry.rootId);
  if (rootNode) {
    for (const child of rootNode.children) {
      await ipc.deleteNode(child.node.id);
    }
  }

  // Restore original nodes
  await ipc.restoreNodes(entry.originalNodes);
  await get().loadTree(entry.contextId);
  set({ selectedNodeId: entry.prevSelectedId });
},
```

**Step 7: Verify**

Run: `pnpm lint`
Run: `pnpm build` (may still fail due to downstream — OK)

**Step 8: Commit**

```bash
git add src/stores/treeStore.ts
git commit -m "feat: applyCompact returns highlight map + compact undo support"
```

---

### Task 3: Create CompactBanner Component

**Files:**
- Create: `src/components/CompactBanner.tsx`

**Step 1: Create `src/components/CompactBanner.tsx`**

```tsx
import { useUIStore } from "../stores/uiStore";
import { CompactStates } from "../lib/constants";

export function CompactBanner() {
  const compactState = useUIStore((s) => s.compactState);
  const summary = useUIStore((s) => s.compactSummary);
  const expanded = useUIStore((s) => s.compactBannerExpanded);
  const { dismissCompactBanner, toggleCompactBannerExpanded } = useUIStore();

  if (compactState !== CompactStates.APPLIED || !summary) return null;

  const parts: string[] = [];
  if (summary.added > 0) parts.push(`${summary.added} 新增`);
  if (summary.edited > 0) parts.push(`${summary.edited} 編輯`);
  if (summary.moved > 0) parts.push(`${summary.moved} 移動`);
  if (summary.deleted > 0) parts.push(`${summary.deleted} 刪除`);
  const total = summary.added + summary.edited + summary.moved + summary.deleted;

  return (
    <div className="mx-4 mt-2 rounded-lg border border-border bg-bg-elevated overflow-hidden">
      {/* Main banner row */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-l-[3px] border-l-accent-primary">
        <span className="text-accent-primary text-sm">✦</span>
        <span className="font-mono text-xs text-text-primary flex-1">
          AI 重組了 {total} 個節點 — {parts.join(" · ")}
        </span>
        <div className="flex items-center gap-2 text-[11px] font-mono text-text-secondary">
          <span className="text-text-secondary">[u] 復原</span>
          <button
            className="cursor-pointer hover:text-text-primary transition-colors"
            onClick={toggleCompactBannerExpanded}
          >
            {expanded ? "收合 ▴" : "展開詳情 ▾"}
          </button>
          <span className="text-text-secondary">Enter/Esc 確認</span>
        </div>
      </div>

      {/* Deleted names row */}
      {summary.deletedNames.length > 0 && (
        <div className="px-4 py-1.5 border-t border-border/50">
          <span className="font-mono text-[11px] text-red-400">
            ✕ 已刪除：{summary.deletedNames.map(n => `「${n}」`).join("")}
          </span>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 py-3 border-t border-border bg-bg-card">
          <p className="font-mono text-xs text-text-secondary leading-relaxed">
            AI 根據節點內容與結構進行了自動整理。
            {summary.added > 0 && ` 新增了 ${summary.added} 個分類節點。`}
            {summary.moved > 0 && ` 移動了 ${summary.moved} 個節點到更合適的位置。`}
            {summary.edited > 0 && ` 重新命名了 ${summary.edited} 個節點。`}
            {summary.deleted > 0 && ` 移除了 ${summary.deleted} 個冗餘節點。`}
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/CompactBanner.tsx
git commit -m "feat: CompactBanner — non-blocking summary with expand/collapse"
```

---

### Task 4: NodeCard — Inline Color Coding

**Files:**
- Modify: `src/components/NodeCard.tsx:10-19` (Props interface), `121-200` (non-root card rendering)

**Step 1: Add `compactHighlight` prop to Props interface**

```typescript
// In Props interface, add:
import type { CompactHighlightInfo } from "../lib/types";

interface Props {
  node: TreeNode;
  isRoot?: boolean;
  isSelected?: boolean;
  isCutNode?: boolean;
  isDropTarget?: boolean;
  compactHighlight?: CompactHighlightInfo | null;
  compactFading?: boolean;
  onClick: () => void;
  dragHandleListeners?: Record<string, any>;
}
```

Update the destructuring at line 21:
```typescript
export function NodeCard({ node, isRoot, isSelected, isCutNode, isDropTarget, compactHighlight, compactFading, onClick, dragHandleListeners }: Props) {
```

**Step 2: Define highlight color map**

Add after the Props interface:
```typescript
const HIGHLIGHT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  added:         { border: "#2DD4BF99", bg: "#1E3A36", text: "#2DD4BF" },
  edited:        { border: "#FBBF2499", bg: "#2D2A1F", text: "#FBBF24" },
  moved:         { border: "#4FC3F799", bg: "#1E2535", text: "#4FC3F7" },
  "edited+moved": { border: "#FBBF2499", bg: "#2D2A1F", text: "#FBBF24" },  // prioritize edited color
};
```

**Step 3: Add highlight styles to non-root card**

In the non-root card's outer `<div>` (line 123-131), add conditional styles:

```typescript
const hl = compactHighlight ? HIGHLIGHT_COLORS[compactHighlight.type] : null;

return (
  <>
    <div
      ref={cardRef}
      className={cn(
        "flex items-center gap-2 rounded-md bg-bg-card cursor-pointer overflow-hidden",
        "transition-[background-color,border-color] duration-300",
        compactFading && "!bg-bg-card !border-l-transparent",
        isDropTarget && "ring-2 ring-accent-primary bg-accent-primary/10",
        !isDropTarget && isSelected && "ring-1 ring-accent-primary",
        !isDropTarget && !isSelected && "hover:ring-1 hover:ring-border",
        isCutNode && "opacity-40",
      )}
      style={hl && !compactFading ? {
        backgroundColor: hl.bg,
        borderLeft: `3px solid ${hl.border}`,
      } : undefined}
      onClick={onClick}
      onContextMenu={(e) => { /* existing */ }}
      onDoubleClick={() => { /* existing */ }}
      {...dragHandleListeners}
    >
```

**Step 4: Add subtitle info (old title / from parent)**

After the title `<span>` (line 175-177), add:

```typescript
{/* Title */}
{isEditing ? (
  <input /* existing */ />
) : (
  <div className="flex flex-col">
    <span className="text-[13px] text-text-primary">
      {node.title || "Untitled"}
    </span>
    {compactHighlight?.oldTitle && (
      <span className="text-[10px]" style={{ color: HIGHLIGHT_COLORS[compactHighlight.type]?.text }}>
        ← {compactHighlight.oldTitle}
      </span>
    )}
    {compactHighlight?.fromParent && (
      <span className="text-[10px]" style={{ color: HIGHLIGHT_COLORS[compactHighlight.type]?.text }}>
        ↗ from: {compactHighlight.fromParent}
      </span>
    )}
  </div>
)}
```

**Step 5: Commit**

```bash
git add src/components/NodeCard.tsx
git commit -m "feat: NodeCard inline color coding — left bar + bg tint + subtitle"
```

---

### Task 5: TreeCanvas — Pass Highlights to NodeCard

**Files:**
- Modify: `src/components/TreeCanvas.tsx:131-170` (TreeBranch), `63-121` (SortableChildRow)

**Step 1: Import highlight types**

Add to existing imports:
```typescript
import type { CompactHighlightInfo } from "../lib/types";
```

**Step 2: Read highlights from uiStore in TreeBranch**

In `TreeBranch` function (line 131), add:
```typescript
const compactHighlights = useUIStore((s) => s.compactHighlights);
const compactFading = useUIStore((s) => s.compactFading);
```

**Step 3: Pass highlight to NodeCard**

Where `nodeCard` is created (line 160-169), add:
```typescript
const highlight = compactHighlights?.get(data.node.id) ?? null;

const nodeCard = (
  <NodeCard
    node={data.node}
    isRoot={isRoot}
    isSelected={isSelected}
    isCutNode={inCutSubtree}
    isDropTarget={isReparentTarget}
    compactHighlight={highlight}
    compactFading={compactFading}
    onClick={() => selectNode(data.node.id)}
    dragHandleListeners={!isRoot ? dragHandleListeners : undefined}
  />
);
```

**Step 4: Commit**

```bash
git add src/components/TreeCanvas.tsx
git commit -m "feat: TreeCanvas reads compactHighlights and passes to NodeCard"
```

---

### Task 6: useKeyboard — Direct Apply + Undo + Fade

**Files:**
- Modify: `src/hooks/useKeyboard.ts:1-9` (imports), `52` (destructuring), `256-281` (c key handler), `100-119` (Escape handlers)

**Step 1: Update imports**

Remove:
```typescript
import { computeDiff } from "../lib/compactDiff";
```

Add:
```typescript
import { CompactStates } from "../lib/constants";
```

**Step 2: Add compact state to useEffect destructuring**

In the `useEffect` callback, get compact state at the top of `handleKeyDown`:
```typescript
const { compactState } = useUIStore.getState();
```

**Step 3: Add Escape handler for APPLIED state**

Before the existing Escape handlers (around line 100), add:
```typescript
// Escape dismisses compact banner in APPLIED state
if (e.key === "Escape" && useUIStore.getState().compactState === CompactStates.APPLIED) {
  e.preventDefault();
  useUIStore.getState().dismissCompactBanner();
  useUIStore.getState().startCompactFade(3000);
  return;
}

// Enter also dismisses compact banner in APPLIED state
if (e.key === "Enter" && !editingNodeId && useUIStore.getState().compactState === CompactStates.APPLIED) {
  e.preventDefault();
  useUIStore.getState().dismissCompactBanner();
  useUIStore.getState().startCompactFade(3000);
  return;
}
```

**Step 4: Add `u` key handler for undo in APPLIED state**

In the switch statement, add before the `case "c":` block:
```typescript
case "u": {
  if (useUIStore.getState().compactState === CompactStates.APPLIED) {
    e.preventDefault();
    const { undoCompact } = useTreeStore.getState();
    useUIStore.getState().clearCompactHighlights();
    undoCompact();
  }
  break;
}
```

**Step 5: Rewrite `c` key handler — direct apply flow**

Replace the existing `case "c":` handler (lines 256-281):
```typescript
case "c": {
  if (isModKey(e)) break;
  e.preventDefault();
  if (!selectedNodeId || !currentContextId) break;
  if (useUIStore.getState().compactState !== CompactStates.IDLE) break;
  const profileId = localStorage.getItem("mindflow-active-ai-profile");
  if (!profileId) {
    useUIStore.getState().setCompactError("No AI profile selected. Open AI Settings to create and select one.");
    break;
  }
  const ui = useUIStore.getState();
  ui.setCompactState(CompactStates.LOADING);
  ipc.compactNode(selectedNodeId, profileId)
    .then(async (result) => {
      const { applyCompact } = useTreeStore.getState();
      const { highlights, summary } = await applyCompact(result);
      if (summary.added + summary.edited + summary.moved + summary.deleted === 0) {
        // No changes — show toast
        useUIStore.getState().setCompactState(CompactStates.IDLE);
        // TODO: show "no changes" toast via a simple state flag
      } else {
        useUIStore.getState().setCompactApplied(summary, highlights);
      }
    })
    .catch((err) => {
      console.error("[compact] error:", err);
      useUIStore.getState().setCompactError(String(err));
    });
  break;
}
```

**Step 6: Add navigation fade trigger**

In the `j/k/h/l` navigation cases, add at the top of each:
```typescript
if (useUIStore.getState().compactHighlights) {
  useUIStore.getState().startCompactFade(0);
}
```

For example, in the `case "j"` block, right after `e.preventDefault();`:
```typescript
case "j":
case "ArrowDown": {
  e.preventDefault();
  if (useUIStore.getState().compactHighlights) {
    useUIStore.getState().startCompactFade(0);
  }
  // ... rest of handler
}
```

Do the same for `case "k"`, `case "l"`, `case "h"`.

**Step 7: Commit**

```bash
git add src/hooks/useKeyboard.ts
git commit -m "feat: keyboard — direct apply compact + u undo + navigation fade"
```

---

### Task 7: ContextMenu — Direct Apply Flow

**Files:**
- Modify: `src/components/ContextMenu.tsx:1-9` (imports), `156-181` (AI Compact menu item)

**Step 1: Update imports**

Remove:
```typescript
import { computeDiff } from "../lib/compactDiff";
```

Add:
```typescript
import { CompactStates } from "../lib/constants";
```

**Step 2: Rewrite AI Compact menu item action**

Replace lines 159-181:
```typescript
{
  label: "AI Compact",
  shortcut: "C",
  icon: "⚡",
  action: () => exec(async () => {
    if (useUIStore.getState().compactState !== CompactStates.IDLE) return;
    const profileId = localStorage.getItem("mindflow-active-ai-profile");
    if (!profileId) {
      useUIStore.getState().setCompactError("No AI profile selected. Open AI Settings to create and select one.");
      return;
    }
    useUIStore.getState().setCompactState(CompactStates.LOADING);
    try {
      const result = await ipc.compactNode(contextMenuNodeId, profileId);
      const { applyCompact } = useTreeStore.getState();
      const { highlights, summary } = await applyCompact(result);
      if (summary.added + summary.edited + summary.moved + summary.deleted === 0) {
        useUIStore.getState().setCompactState(CompactStates.IDLE);
      } else {
        useUIStore.getState().setCompactApplied(summary, highlights);
      }
    } catch (e) {
      console.error("[compact] error:", e);
      useUIStore.getState().setCompactError(String(e));
    }
  }),
},
```

**Step 3: Commit**

```bash
git add src/components/ContextMenu.tsx
git commit -m "feat: context menu AI Compact uses direct apply flow"
```

---

### Task 8: App.tsx Cleanup + Delete Old Files

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/components/CompactPreview.tsx`
- Delete: `src/lib/compactDiff.ts`

**Step 1: Update `src/App.tsx` imports**

Remove:
```typescript
import { CompactPreview } from "./components/CompactPreview";
```

Replace with:
```typescript
import { CompactBanner } from "./components/CompactBanner";
import { CompactStates } from "./lib/constants";
```

**Step 2: Update state reading**

Replace:
```typescript
const compactLoading = useUIStore((s) => s.compactLoading);
const compactError = useUIStore((s) => s.compactError);
```

With:
```typescript
const compactState = useUIStore((s) => s.compactState);
const compactError = useUIStore((s) => s.compactError);
```

**Step 3: Update JSX**

Replace `<CompactPreview />` with nothing (remove the line).

Add `<CompactBanner />` after `<StatusBar />`:
```tsx
<StatusBar />
<CompactBanner />
```

Replace `{compactLoading && (` with `{compactState === CompactStates.LOADING && (`.

Keep the error overlay as-is (it still uses `compactError`).

**Step 4: Delete old files**

```bash
rm src/components/CompactPreview.tsx
rm src/lib/compactDiff.ts
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire CompactBanner + remove CompactPreview + compactDiff"
```

---

### Task 9: Clear Highlights on Tree Mutations

**Files:**
- Modify: `src/stores/treeStore.ts` (addChild, addSibling, deleteNode, dragMoveNode)

**Step 1: Add highlight clearing to tree mutations**

At the beginning of `addChild`, `addSibling`, `deleteNode`, `dragMoveNode`, and `reorderNode` methods, add:

```typescript
if (useUIStore.getState().compactHighlights) {
  useUIStore.getState().clearCompactHighlights();
}
```

This ensures any tree mutation instantly clears highlights per the design spec.

**Step 2: Commit**

```bash
git add src/stores/treeStore.ts
git commit -m "feat: clear compact highlights on any tree mutation"
```

---

### Task 10: Build & Lint Verification

**Step 1: Run lint**

Run: `pnpm lint`
Expected: 0 errors, 0 warnings

**Step 2: Run build**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Manual smoke test**

Run: `pnpm tauri dev`

Test checklist:
- [ ] Press `c` on a node with AI profile selected → loading overlay appears
- [ ] After AI returns → tree updates, banner appears with stats
- [ ] Banner shows correct counts (added/edited/moved/deleted)
- [ ] Changed nodes have color-coded left bars + background tints
- [ ] Edited nodes show `← oldTitle` subtitle
- [ ] Moved nodes show `↗ from: parentName` subtitle
- [ ] Press `u` → tree reverts, highlights clear, banner disappears
- [ ] Press `Esc` or `Enter` → banner disappears, highlights fade after 3s
- [ ] Press `h/j/k/l` → highlights start fading immediately
- [ ] Right-click → AI Compact menu item works same as `c` key
- [ ] No AI profile → error message appears
- [ ] Tree mutation (Tab, Delete) clears highlights instantly

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: compact redesign polish"
```
