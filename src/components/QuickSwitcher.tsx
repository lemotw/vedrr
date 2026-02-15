import { useState, useEffect, useRef, useMemo } from "react";
import { useUIStore } from "../stores/uiStore";
import { useContextStore } from "../stores/contextStore";
import type { ContextSummary } from "../lib/types";

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
  const { contexts, loadContexts, switchContext, createContext, currentContextId } = useContextStore();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (quickSwitcherOpen) {
      loadContexts();
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [quickSwitcherOpen, loadContexts]);

  const filtered = useMemo(() => {
    if (!search) return contexts;
    const q = search.toLowerCase();
    return contexts.filter((c) => c.name.toLowerCase().includes(q));
  }, [contexts, search]);

  const active = filtered.filter((c) => c.state === "active");
  const archived = filtered.filter((c) => c.state === "archived");
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (allItems[selectedIndex]) {
          handleSelect(allItems[selectedIndex]);
        } else {
          handleCreate();
        }
        break;
      case "Escape":
        e.preventDefault();
        closeQuickSwitcher();
        break;
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[20vh] z-50"
      onClick={closeQuickSwitcher}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-[480px] bg-bg-elevated rounded-2xl overflow-hidden flex flex-col max-h-[520px]"
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
                return (
                  <div
                    key={ctx.id}
                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer
                      ${idx === selectedIndex ? "bg-white/5" : ""}
                      ${ctx.id === currentContextId ? "bg-accent-primary/8" : ""}`}
                    onClick={() => handleSelect(ctx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] ${ctx.id === currentContextId ? "text-accent-primary" : "text-text-secondary"}`}>
                        {ctx.id === currentContextId ? "▸" : "●"}
                      </span>
                      <span className="text-[13px] text-text-primary font-mono">{ctx.name}</span>
                    </div>
                    <span className="text-[10px] text-text-secondary font-mono">
                      {timeAgo(ctx.last_accessed_at)}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {archived.length > 0 && (
            <>
              {active.length > 0 && <div className="h-px bg-[#444] mx-0" />}
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
                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer
                      ${idx === selectedIndex ? "bg-white/5" : ""}`}
                    onClick={() => handleSelect(ctx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-text-secondary">○</span>
                      <span className="text-[13px] text-text-primary font-mono">{ctx.name}</span>
                    </div>
                    <span className="text-[10px] text-text-secondary font-mono">
                      {timeAgo(ctx.last_accessed_at)}
                    </span>
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
            className="px-3 py-1.5 text-[12px] font-bold text-white bg-accent-primary rounded-md font-mono cursor-pointer"
          >
            + New
          </button>
        </div>
      </div>
    </div>
  );
}
