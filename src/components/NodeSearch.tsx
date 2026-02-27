import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../stores/uiStore";
import { useTreeStore } from "../stores/treeStore";
import { useContextStore } from "../stores/contextStore";
import { NODE_TYPE_CONFIG } from "../lib/types";
import type { SearchResult, ModelStatus } from "../lib/types";
import { ipc } from "../lib/ipc";
import { modSymbol } from "../lib/platform";
import { loadSearchSettings } from "../lib/constants";

export function NodeSearch() {
  const { t } = useTranslation();
  const { nodeSearchOpen, closeNodeSearch } = useUIStore();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ status: "not_ready", progress: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  // Read search settings once when modal opens
  // Re-read settings from localStorage each time modal opens
  const settings = useMemo(() => loadSearchSettings(), [nodeSearchOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const isTextMode = settings.mode === "text";

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

    const promise = isTextMode
      ? ipc.textSearch(debouncedQuery, 10)
      : ipc.semanticSearch(debouncedQuery, 10, settings.alpha, settings.minScore);

    promise
      .then((res) => {
        if (!cancelled) setResults(res);
      })
      .catch((err) => {
        console.error("[search]", err);
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, isTextMode, settings.alpha, settings.minScore]);

  // Poll model status while open and not ready (only for semantic mode)
  useEffect(() => {
    if (!nodeSearchOpen || isTextMode) return;
    let cancelled = false;
    const poll = () => {
      ipc.getModelStatus().then((s) => {
        if (!cancelled) setModelStatus(s);
      }).catch(() => {});
    };
    poll(); // immediate check
    const id = setInterval(() => {
      if (!cancelled) poll();
    }, 500);
    return () => { cancelled = true; clearInterval(id); };
  }, [nodeSearchOpen, isTextMode]);

  // In text mode, model is always "ready"
  const modelReady = isTextMode || modelStatus.status === "ready";

  // Reset state on open
  useEffect(() => {
    if (nodeSearchOpen) {
      setQuery("");
      setDebouncedQuery("");
      setResults([]);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [nodeSearchOpen]);

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
    if (e.key === "Escape") {
      e.preventDefault();
      closeNodeSearch();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={closeNodeSearch}
    >
      <div className="absolute inset-0 bg-[var(--color-overlay)]" />
      <div
        className="relative w-[520px] max-h-[460px] bg-bg-elevated rounded-2xl flex flex-col overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center h-12 px-4 bg-bg-card shrink-0">
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-text-primary font-mono text-[13px] outline-none placeholder:text-text-secondary"
            placeholder={t("nodeSearch.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="text-text-secondary font-mono text-[11px] bg-bg-elevated rounded px-2 py-1">
            {modSymbol}F
          </kbd>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {/* Model downloading (semantic mode only) */}
          {!modelReady && (
            <div className="px-4 py-8 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
                <span className="font-mono text-xs text-text-secondary">
                  {t("nodeSearch.modelLoading")}
                </span>
              </div>
              {modelStatus.status === "downloading" && modelStatus.progress > 0 && (
                <div className="w-48 h-1 bg-bg-card rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-primary rounded-full transition-all duration-300"
                    style={{ width: `${modelStatus.progress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Loading */}
          {modelReady && loading && results.length === 0 && debouncedQuery && (
            <div className="px-4 py-8 text-center text-text-secondary font-mono text-xs">
              {t("nodeSearch.loading")}
            </div>
          )}

          {/* Empty */}
          {modelReady && !loading && debouncedQuery && results.length === 0 && (
            <div className="px-4 py-8 text-center text-text-secondary font-mono text-xs">
              {t("nodeSearch.empty")}
            </div>
          )}

          {/* Results list */}
          {results.map((item) => {
            const cfg = NODE_TYPE_CONFIG[item.node_type as keyof typeof NODE_TYPE_CONFIG];
            const belowThreshold = !isTextMode && item.score < settings.displayThreshold;
            return (
              <div
                key={item.node_id}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-bg-card/50 ${belowThreshold ? "opacity-35" : ""}`}
                onClick={() => handleSelect(item)}
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
                  <span className="font-mono text-[13px] text-text-primary truncate">
                    {item.node_title || t("common.untitled")}
                  </span>
                  <span className="font-mono text-[10px] text-text-secondary truncate">
                    {item.context_name}
                    {item.ancestor_path && ` › ${item.ancestor_path}`}
                  </span>
                </div>

                {/* Score (only for semantic mode) */}
                {!isTextMode && (
                  <span className="font-mono text-[10px] text-text-secondary shrink-0">
                    {item.score.toFixed(2)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
