import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import { NODE_TYPE_CONFIG } from "../lib/types";
import type { SearchResult } from "../lib/types";
import { ipc } from "../lib/ipc";
import { cn } from "../lib/cn";
import { modSymbol } from "../lib/platform";

export function NodeSearch() {
  const { t } = useTranslation();
  const { nodeSearchOpen, closeNodeSearch } = useUIStore();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce query (200ms)
  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch results on debounced query change
  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    ipc
      .semanticSearch(debouncedQuery, 10)
      .then((res) => {
        if (!cancelled) setResults(res);
      })
      .catch((err) => {
        console.error("[semantic-search]", err);
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Reset state on open
  useEffect(() => {
    if (nodeSearchOpen) {
      setQuery("");
      setDebouncedQuery("");
      setResults([]);
      setSelectedIdx(0);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [nodeSearchOpen]);

  // Keep selectedIdx in bounds
  useEffect(() => {
    if (selectedIdx >= results.length) setSelectedIdx(Math.max(0, results.length - 1));
  }, [results.length, selectedIdx]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!nodeSearchOpen) return null;

  async function handleSelect(result: SearchResult) {
    const currentContextId = useContextStore.getState().currentContextId;
    closeNodeSearch();
    if (result.context_id !== currentContextId) {
      await useContextStore.getState().switchContext(result.context_id);
      await useTreeStore.getState().loadTree(result.context_id);
    }
    useTreeStore.getState().selectNode(result.node_id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIdx]) handleSelect(results[selectedIdx]);
        break;
      case "Escape":
        e.preventDefault();
        closeNodeSearch();
        break;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={closeNodeSearch}
    >
      <div
        className="w-[520px] max-h-[460px] bg-bg-elevated rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center h-12 px-4 bg-bg-card shrink-0">
          <span className="text-text-secondary text-sm mr-2">🔍</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-text-primary font-mono text-[13px] outline-none placeholder:text-text-secondary"
            placeholder={t("nodeSearch.placeholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="text-text-secondary font-mono text-[11px] bg-bg-elevated rounded px-2 py-1">
            {modSymbol}F
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {/* Loading */}
          {loading && results.length === 0 && debouncedQuery && (
            <div className="px-4 py-8 text-center text-text-secondary font-mono text-xs">
              {t("nodeSearch.loading")}
            </div>
          )}

          {/* Empty */}
          {!loading && debouncedQuery && results.length === 0 && (
            <div className="px-4 py-8 text-center text-text-secondary font-mono text-xs">
              {t("nodeSearch.empty")}
            </div>
          )}

          {/* Results list */}
          {results.map((item, idx) => {
            const cfg = NODE_TYPE_CONFIG[item.node_type as keyof typeof NODE_TYPE_CONFIG];
            return (
              <div
                key={item.node_id}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 cursor-pointer",
                  idx === selectedIdx
                    ? "bg-accent-primary/10"
                    : "hover:bg-bg-card/50",
                )}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                {/* Type badge */}
                <span
                  className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center bg-bg-elevated shrink-0"
                  style={{ color: cfg?.color }}
                >
                  {cfg?.letter}
                </span>

                {/* Title + path */}
                <div className="flex flex-col flex-1 min-w-0">
                  <span
                    className={cn(
                      "font-mono text-[13px] text-text-primary truncate",
                      idx === selectedIdx && "font-semibold",
                    )}
                  >
                    {item.node_title || t("common.untitled")}
                  </span>
                  <span className="font-mono text-[10px] text-text-secondary truncate">
                    {item.context_name}
                    {item.ancestor_path && ` › ${item.ancestor_path}`}
                  </span>
                </div>

                {/* Score */}
                <span className="font-mono text-[10px] text-text-secondary shrink-0">
                  {item.score.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center h-10 px-4 bg-bg-card shrink-0">
          <span className="font-mono text-[10px] text-text-secondary">
            {t("nodeSearch.footer")}
          </span>
        </div>
      </div>
    </div>
  );
}
