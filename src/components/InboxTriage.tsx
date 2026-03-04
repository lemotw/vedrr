import { useEffect, useState, useCallback } from "react";
import { useUIStore } from "../stores/uiStore";
import { ipc } from "../lib/ipc";
import type { InboxItem, InboxSuggestion, ContextSummary } from "../lib/types";

type TabId = "suggested" | "contexts";

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
  const close = useUIStore((s) => s.closeInboxTriage);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tab, setTab] = useState<TabId>("suggested");
  const [suggestions, setSuggestions] = useState<InboxSuggestion[]>([]);
  const [contexts, setContexts] = useState<ContextSummary[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  const currentItem = items[currentIndex] ?? null;

  // Load inbox items on open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    ipc.listInboxItems().then((result) => {
      setItems(result);
      setCurrentIndex(0);
      setSelectedIdx(0);
      setTab("suggested");
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

  // Reset selection when tab changes
  useEffect(() => { setSelectedIdx(0); }, [tab]);

  const listLength = tab === "suggested" ? suggestions.length : contexts.length;

  const handleAssign = useCallback(async () => {
    if (!currentItem) return;
    try {
      if (tab === "suggested" && suggestions[selectedIdx]) {
        await ipc.matchInboxToNode(currentItem.id, suggestions[selectedIdx].node_id);
      } else if (tab === "contexts" && contexts[selectedIdx]) {
        await ipc.matchInboxToContext(currentItem.id, contexts[selectedIdx].id);
      } else return;

      const remaining = items.filter((_, i) => i !== currentIndex);
      setItems(remaining);
      setCurrentIndex(Math.min(currentIndex, Math.max(remaining.length - 1, 0)));
      setSelectedIdx(0);
    } catch (e) {
      console.error("[inbox-triage] assign failed:", e);
    }
  }, [currentItem, tab, suggestions, contexts, selectedIdx, items, currentIndex]);

  const handleSkip = useCallback(() => {
    if (items.length <= 1) return;
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(0);
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
      if (e.key === "Tab" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setTab((t) => (t === "suggested" ? "contexts" : "suggested"));
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, listLength - 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); handleAssign(); return; }
      if (e.key === "s") { e.preventDefault(); handleSkip(); return; }
      if (e.key === "d") { e.preventDefault(); handleDelete(); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, listLength, handleAssign, handleSkip, handleDelete]);

  if (!open) return null;

  const isEmpty = items.length === 0 && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay" onClick={close}>
      <div
        className="w-[500px] max-h-[80vh] rounded-2xl bg-bg-page border border-border flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text-primary">
            {isEmpty ? "Inbox" : `Inbox (${currentIndex + 1}/${items.length})`}
          </h2>
          <span className="font-mono text-xs text-text-secondary">Cmd+I close</span>
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

            {/* Tabs */}
            <div className="flex px-6">
              <button
                className={`flex-1 flex items-center justify-center gap-2 py-3 font-mono text-sm transition-colors
                  ${tab === "suggested" ? "text-accent-primary font-semibold border-b-2 border-accent-primary" : "text-text-secondary font-medium"}`}
                onClick={() => setTab("suggested")}
              >
                Suggested
              </button>
              <button
                className={`flex-1 flex items-center justify-center gap-2 py-3 font-mono text-sm transition-colors
                  ${tab === "contexts" ? "text-accent-primary font-semibold border-b-2 border-accent-primary" : "text-text-secondary font-medium"}`}
                onClick={() => setTab("contexts")}
              >
                Contexts
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1 min-h-[200px] max-h-[300px]">
              {tab === "suggested" ? (
                suggestions.length === 0 ? (
                  <div className="flex items-center justify-center h-full font-mono text-sm text-text-secondary">
                    {currentItem.status === "pending" ? "Embedding in progress..." : "No suggestions found"}
                  </div>
                ) : (
                  suggestions.map((s, i) => (
                    <button
                      key={s.node_id}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors
                        ${i === selectedIdx ? "bg-bg-elevated ring-1 ring-accent-primary" : "bg-bg-card hover:bg-bg-elevated"}`}
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
                  ))
                )
              ) : (
                contexts.map((c, i) => (
                  <button
                    key={c.id}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left transition-colors
                      ${i === selectedIdx ? "bg-bg-elevated ring-1 ring-accent-primary" : "bg-bg-card hover:bg-bg-elevated"}`}
                    onClick={() => { setSelectedIdx(i); handleAssign(); }}
                    onMouseEnter={() => setSelectedIdx(i)}
                  >
                    <span className="font-mono text-sm font-medium text-text-primary truncate">{c.name}</span>
                    <span className="font-mono text-xs text-text-secondary shrink-0">{c.node_count} nodes</span>
                  </button>
                ))
              )}
            </div>

            <div className="h-px bg-border" />

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3">
              <button
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-bg-elevated font-mono text-sm font-medium text-text-primary hover:brightness-110 transition-colors"
                onClick={handleSkip}
              >
                Skip
              </button>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-text-secondary">Enter to assign</span>
                <button
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3D1515] font-mono text-sm font-medium text-[#FF4444] hover:brightness-110 transition-colors"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
