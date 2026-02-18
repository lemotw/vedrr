import { useState, useEffect, useRef, useMemo } from "react";
import { useUIStore } from "../stores/uiStore";
import { useContextStore } from "../stores/contextStore";
import { ask } from "@tauri-apps/plugin-dialog";
import type { ContextSummary } from "../lib/types";
import { ContextStates } from "../lib/constants";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function QuickSwitcher() {
  const { quickSwitcherOpen, closeQuickSwitcher } = useUIStore();
  const { contexts, loadContexts, switchContext, createContext, archiveContext, activateContext, deleteContext, currentContextId } = useContextStore();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (quickSwitcherOpen) {
      loadContexts();
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => panelRef.current?.focus(), 50);
    }
  }, [quickSwitcherOpen, loadContexts]);

  const filtered = useMemo(() => {
    if (!search) return contexts;
    const q = search.toLowerCase();
    return contexts.filter((c) => c.name.toLowerCase().includes(q));
  }, [contexts, search]);

  const active = filtered.filter((c) => c.state === ContextStates.ACTIVE);
  const archived = filtered.filter((c) => c.state === ContextStates.ARCHIVED);
  const allItems: ContextSummary[] = [...active, ...archived];

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  if (!quickSwitcherOpen) return null;

  const handleSelect = async (ctx: ContextSummary) => {
    await switchContext(ctx.id);
    closeQuickSwitcher();
  };

  const handleCreate = async () => {
    const name = search.trim() || "New Context";
    await createContext(name);
    closeQuickSwitcher();
  };

  const handleArchive = async (e: React.MouseEvent, ctx: ContextSummary) => {
    e.stopPropagation();
    await archiveContext(ctx.id);
  };

  const handleActivate = async (e: React.MouseEvent, ctx: ContextSummary) => {
    e.stopPropagation();
    await activateContext(ctx.id);
  };

  const handleDelete = async (e: React.MouseEvent, ctx: ContextSummary) => {
    e.stopPropagation();
    const confirmed = await ask(
      `確定要永久刪除「${ctx.name}」？此操作無法復原。`,
      { title: "刪除確認", kind: "warning" },
    );
    if (confirmed) {
      await deleteContext(ctx.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isInSearch = document.activeElement === inputRef.current;

    // Move down: j / ↓ / Ctrl+j / Ctrl+n
    if (
      e.key === "ArrowDown" ||
      (e.ctrlKey && (e.key === "j" || e.key === "n")) ||
      (!isInSearch && e.key === "j")
    ) {
      e.preventDefault();
      if (isInSearch) {
        inputRef.current?.blur();
        panelRef.current?.focus();
      }
      setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
      return;
    }

    // Move up: k / ↑ / Ctrl+k / Ctrl+p
    if (
      e.key === "ArrowUp" ||
      (e.ctrlKey && (e.key === "k" || e.key === "p")) ||
      (!isInSearch && e.key === "k")
    ) {
      e.preventDefault();
      if (!isInSearch && selectedIndex === 0) {
        inputRef.current?.focus();
        return;
      }
      if (isInSearch) return;
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }

    // ⌘N — create new context
    if (e.metaKey && e.key === "n") {
      e.preventDefault();
      handleCreate();
      return;
    }

    // Enter — select or create
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      if (allItems[selectedIndex]) {
        handleSelect(allItems[selectedIndex]);
      } else {
        handleCreate();
      }
      return;
    }

    // Escape — clear search or close
    if (e.key === "Escape") {
      e.preventDefault();
      if (isInSearch && search) {
        setSearch("");
        inputRef.current?.blur();
        panelRef.current?.focus();
        return;
      }
      closeQuickSwitcher();
      return;
    }

    // "/" — vim search key
    if (!isInSearch && e.key === "/") {
      e.preventDefault();
      inputRef.current?.focus();
      return;
    }

    // Any printable char when not in search → jump to search and type
    if (!isInSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setSearch(e.key);
      inputRef.current?.focus();
      return;
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[20vh] z-50"
      onClick={closeQuickSwitcher}
    >
      <div className="absolute inset-0 bg-[var(--color-overlay)]" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-[480px] bg-bg-elevated rounded-2xl overflow-hidden flex flex-col max-h-[520px] outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search */}
        <div className="flex items-center px-4 h-12 bg-bg-card">
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-[13px] text-text-primary placeholder:text-text-secondary outline-none font-mono"
          />
          <span className="text-[10px] text-text-secondary bg-bg-elevated px-2 py-1 rounded">
            ⌘K
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {active.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1.5">
                <span className="text-[10px] font-bold text-text-secondary tracking-[2px] font-mono">
                  ACTIVE
                </span>
              </div>
              {active.map((ctx) => {
                const idx = allItems.indexOf(ctx);
                const isCurrent = ctx.id === currentContextId;
                return (
                  <div
                    key={ctx.id}
                    className={`group/row flex items-center px-4 py-2.5 cursor-pointer
                      ${idx === selectedIndex ? "bg-[var(--color-hover)]" : ""}
                      ${isCurrent ? "bg-accent-primary/8" : ""}`}
                    onClick={() => handleSelect(ctx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-[10px] shrink-0 ${isCurrent ? "text-accent-primary" : "text-text-secondary"}`}>
                        {isCurrent ? "▸" : "●"}
                      </span>
                      <span className="text-[13px] text-text-primary font-mono truncate">{ctx.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] text-text-secondary font-mono">
                        {ctx.node_count}n · {timeAgo(ctx.last_accessed_at)}
                      </span>
                      <button
                        className="opacity-0 group-hover/row:opacity-100 px-1.5 py-0.5 rounded text-[10px] font-mono
                          text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)] transition-all cursor-pointer"
                        onClick={(e) => handleArchive(e, ctx)}
                        title="Archive"
                      >
                        📦
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {archived.length > 0 && (
            <>
              {active.length > 0 && <div className="h-px bg-border mx-0" />}
              <div className="px-4 pt-3 pb-1.5">
                <span className="text-[10px] font-bold text-text-secondary tracking-[2px] font-mono">
                  ARCHIVED
                </span>
              </div>
              {archived.map((ctx) => {
                const idx = allItems.indexOf(ctx);
                return (
                  <div
                    key={ctx.id}
                    className={`group/row flex items-center px-4 py-2.5 cursor-pointer
                      ${idx === selectedIndex ? "bg-[var(--color-hover)]" : ""}`}
                    onClick={() => handleSelect(ctx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[10px] text-text-secondary shrink-0">○</span>
                      <span className="text-[13px] text-text-secondary font-mono truncate">{ctx.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] text-text-secondary font-mono">
                        {ctx.node_count}n · {timeAgo(ctx.last_accessed_at)}
                      </span>
                      <button
                        className="opacity-0 group-hover/row:opacity-100 px-1.5 py-0.5 rounded text-[10px] font-mono
                          text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)] transition-all cursor-pointer"
                        onClick={(e) => handleActivate(e, ctx)}
                        title="Activate"
                      >
                        ↩
                      </button>
                      <button
                        className="opacity-0 group-hover/row:opacity-100 px-1.5 py-0.5 rounded text-[10px] font-mono
                          text-text-secondary hover:text-[#FF4444] hover:bg-[var(--color-hover)] transition-all cursor-pointer"
                        onClick={(e) => handleDelete(e, ctx)}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {allItems.length === 0 && (
            <div className="px-4 py-8 text-center text-text-secondary text-[13px]">
              {search ? "No matches" : "No contexts yet"}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 h-12 bg-bg-card">
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 text-[12px] font-bold text-white bg-accent-primary rounded-md font-mono cursor-pointer flex items-center gap-2"
          >
            + New
            <span className="text-[10px] opacity-70">⌘N</span>
          </button>
        </div>
      </div>
    </div>
  );
}
