import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import { ipc } from "../lib/ipc";
import type { InboxItem, InboxSuggestion, ContextSummary } from "../lib/types";

type ListEntry =
  | { kind: "suggestion"; data: InboxSuggestion }
  | { kind: "context"; data: ContextSummary }
  | { kind: "divider" };

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function InboxTriage() {
  const open = useUIStore((s) => s.inboxTriageOpen);
  const rawClose = useUIStore((s) => s.closeInboxTriage);
  const markDirty = useUIStore((s) => s.markInboxDirty);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<InboxSuggestion[]>([]);
  const [contexts, setContexts] = useState<ContextSummary[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  const currentItem = items[currentIndex] ?? null;

  const close = useCallback(() => {
    if (useUIStore.getState().inboxTriageDirty) {
      const ctxId = useContextStore.getState().currentContextId;
      if (ctxId) useTreeStore.getState().loadTree(ctxId);
    }
    rawClose();
  }, [rawClose]);

  // Build merged list: suggestions → divider → contexts
  const mergedList = useMemo<ListEntry[]>(() => {
    const list: ListEntry[] = [];
    for (const s of suggestions) {
      list.push({ kind: "suggestion", data: s });
    }
    if (suggestions.length > 0 && contexts.length > 0) {
      list.push({ kind: "divider" });
    }
    for (const c of contexts) {
      list.push({ kind: "context", data: c });
    }
    return list;
  }, [suggestions, contexts]);

  // Selectable indices (skip dividers)
  const selectableIndices = useMemo(
    () => mergedList.map((e, i) => e.kind !== "divider" ? i : -1).filter((i) => i >= 0),
    [mergedList],
  );

  // Load inbox items on open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    ipc.listInboxItems().then((result) => {
      setItems(result);
      setCurrentIndex(0);
      setSelectedIdx(0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open]);

  // Load suggestions when current item changes
  useEffect(() => {
    if (!currentItem || currentItem.status === "pending") {
      setSuggestions([]);
      return;
    }
    ipc.findSimilarNodesForInbox(currentItem.id).then(setSuggestions).catch(() => setSuggestions([]));
  }, [currentItem?.id, currentItem?.status]);

  // Load contexts on open
  useEffect(() => {
    if (!open) return;
    ipc.listContexts().then((all) => {
      setContexts(all.filter((c) => c.state === "active"));
    });
  }, [open]);

  const handleAssign = useCallback(async () => {
    if (!currentItem) return;
    const entry = mergedList[selectedIdx];
    if (!entry || entry.kind === "divider") return;
    try {
      if (entry.kind === "suggestion") {
        await ipc.matchInboxToNode(currentItem.id, entry.data.node_id);
      } else {
        await ipc.matchInboxToContext(currentItem.id, entry.data.id);
      }
      markDirty();
      const remaining = items.filter((_, i) => i !== currentIndex);
      setItems(remaining);
      setCurrentIndex(Math.min(currentIndex, Math.max(remaining.length - 1, 0)));
      setSelectedIdx(0);
    } catch (e) {
      console.error("[inbox-triage] assign failed:", e);
    }
  }, [currentItem, mergedList, selectedIdx, items, currentIndex]);

  const handleSkip = useCallback(() => {
    if (items.length <= 1) return;
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(0);
    }
    setSelectedIdx(0);
  }, [currentIndex, items.length]);

  const handlePrev = useCallback(() => {
    if (items.length <= 1) return;
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      setCurrentIndex(items.length - 1);
    }
    setSelectedIdx(0);
  }, [currentIndex, items.length]);

  const handleDelete = useCallback(async () => {
    if (!currentItem) return;
    try {
      await ipc.deleteInboxItem(currentItem.id);
      const remaining = items.filter((_, i) => i !== currentIndex);
      setItems(remaining);
      setCurrentIndex(Math.min(currentIndex, Math.max(remaining.length - 1, 0)));
      setSelectedIdx(0);
    } catch (e) {
      console.error("[inbox-triage] delete failed:", e);
    }
  }, [currentItem, items, currentIndex]);

  // Keyboard handler
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "h" || e.key === "ArrowLeft") {
        e.preventDefault(); handlePrev(); return;
      }
      if (e.key === "l" || e.key === "ArrowRight") {
        e.preventDefault(); handleSkip(); return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((cur) => {
          const pos = selectableIndices.indexOf(cur);
          const next = selectableIndices[pos + 1];
          return next !== undefined ? next : cur;
        });
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((cur) => {
          const pos = selectableIndices.indexOf(cur);
          const prev = selectableIndices[pos - 1];
          return prev !== undefined ? prev : cur;
        });
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); handleAssign(); return; }
      if (e.key === "s") { e.preventDefault(); handleSkip(); return; }
      if (e.key === "d") { e.preventDefault(); handleDelete(); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, selectableIndices, handleAssign, handleSkip, handlePrev, handleDelete]);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIdx]);

  if (!open) return null;

  const isEmpty = items.length === 0 && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay" onClick={close}>
      <div
        className="w-[500px] max-h-[80vh] rounded-2xl bg-bg-elevated border border-border flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text-primary">
            {isEmpty ? "Inbox" : `Inbox (${currentIndex + 1}/${items.length})`}
          </h2>
          <div className="relative group/help">
            <span className="font-mono text-[11px] text-text-secondary cursor-help">?</span>
            <div className="absolute right-0 top-7 z-10 w-48 px-3 py-2.5 rounded-lg bg-bg-elevated border border-border shadow-xl
              opacity-0 pointer-events-none group-hover/help:opacity-100 group-hover/help:pointer-events-auto transition-opacity">
              <ul className="font-mono text-[11px] text-text-secondary leading-relaxed space-y-1">
                <li><span className="text-text-primary">j/k</span> navigate list</li>
                <li><span className="text-text-primary">h/l</span> prev / next item</li>
                <li><span className="text-text-primary">⏎</span> assign to selected</li>
                <li><span className="text-text-primary">s</span> skip item</li>
                <li><span className="text-text-primary">d</span> delete item</li>
                <li><span className="text-text-primary">esc</span> close</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <svg className="w-10 h-10 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162M3.75 13.5V6.75A2.25 2.25 0 0 1 6 4.5h12a2.25 2.25 0 0 1 2.25 2.25v6.75" />
            </svg>
            <span className="font-heading text-xl font-bold text-text-primary">All caught up!</span>
            <span className="font-mono text-sm text-text-secondary">No items in your inbox.</span>
          </div>
        ) : currentItem ? (
          <>
            {/* Inbox item content */}
            <div className="px-6 py-5 flex flex-col gap-2">
              <p className="font-mono text-[15px] font-medium text-text-primary leading-relaxed">
                {currentItem.content}
              </p>
              <span className="font-mono text-xs text-text-secondary">{timeAgo(currentItem.created_at)}</span>
            </div>

            <div className="h-px bg-border" />

            {/* Merged list */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1 min-h-[200px] max-h-[300px]">
              {mergedList.length === 0 ? (
                <div className="flex items-center justify-center h-full font-mono text-sm text-text-secondary">
                  {currentItem.status === "pending" ? "Embedding in progress..." : "No suggestions found"}
                </div>
              ) : (
                mergedList.map((entry, i) => {
                  if (entry.kind === "divider") {
                    return (
                      <div key="divider" className="flex items-center gap-3 px-4 py-2">
                        <div className="flex-1 h-px bg-border" />
                        <span className="font-mono text-[10px] text-text-secondary uppercase tracking-wider">contexts</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    );
                  }
                  if (entry.kind === "suggestion") {
                    const s = entry.data;
                    return (
                      <button
                        key={s.node_id}
                        data-idx={i}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors
                          ${i === selectedIdx ? "bg-bg-elevated" : "bg-bg-card hover:bg-bg-elevated"}`}
                        onClick={() => { setSelectedIdx(i); handleAssign(); }}
                        onMouseEnter={() => setSelectedIdx(i)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[11px] text-text-secondary truncate">{s.context_name} &rsaquo; {s.ancestor_path}</div>
                          <div className="font-mono text-sm font-medium text-text-primary truncate">{s.node_title}</div>
                        </div>
                        <span className="font-mono text-sm font-bold text-accent-primary shrink-0">
                          {Math.round(s.score * 100)}%
                        </span>
                      </button>
                    );
                  }
                  const c = entry.data;
                  return (
                    <button
                      key={c.id}
                      data-idx={i}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left transition-colors
                        ${i === selectedIdx ? "bg-bg-elevated" : "bg-bg-card hover:bg-bg-elevated"}`}
                      onClick={() => { setSelectedIdx(i); handleAssign(); }}
                      onMouseEnter={() => setSelectedIdx(i)}
                    >
                      <span className="font-mono text-sm font-medium text-text-primary truncate">{c.name}</span>
                      <span className="font-mono text-xs text-text-secondary shrink-0">{c.node_count} nodes</span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="h-px bg-border" />

            {/* Footer — keyboard hint bar */}
            <div className="flex items-center justify-center gap-5 px-6 py-3">
              <button onClick={handleSkip} className="font-mono text-[11px] text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
                <span className="text-text-primary">s</span> skip
              </button>
              <button onClick={handleDelete} className="font-mono text-[11px] text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
                <span className="text-text-primary">d</span> delete
              </button>
              <button onClick={handleAssign} className="font-mono text-[11px] text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
                <span className="text-text-primary">⏎</span> assign
              </button>
              <button onClick={close} className="font-mono text-[11px] text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
                <span className="text-text-primary">esc</span> close
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
