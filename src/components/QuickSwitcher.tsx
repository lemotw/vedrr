import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../stores/uiStore";
import { useContextStore } from "../stores/contextStore";
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { ContextSummary, VaultEntry } from "../lib/types";
import { ContextStates } from "../lib/constants";
import { cn } from "../lib/cn";
import { ipc } from "../lib/ipc";
import { isModKey, modSymbol } from "../lib/platform";
import { exportTreeAsPng } from "../lib/exportPng";


function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-accent-primary font-bold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── SVG Icons ─────────────────────────────────────────────

function IcoArchive() {
  return (
    <svg className="w-[13px] h-[13px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12v2H2z" />
      <path d="M3 6v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6" />
      <path d="M8 8v4m0 0l-2-2m2 2l2-2" />
    </svg>
  );
}

function IcoRestore() {
  return (
    <svg className="w-[13px] h-[13px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6" />
      <path d="M8 11V3m0 0L5.5 5.5M8 3l2.5 2.5" />
    </svg>
  );
}

function IcoUndo() {
  return (
    <svg className="w-[13px] h-[13px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5L1.5 3.5l2-2" />
      <path d="M1.5 3.5H9a4.5 4.5 0 0 1 0 9H5" />
    </svg>
  );
}

function IcoVault() {
  return (
    <svg className="w-[13px] h-[13px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 6.5h12" />
      <circle cx="8" cy="10" r="1.5" />
    </svg>
  );
}

function IcoImport() {
  return (
    <svg className="w-[11px] h-[11px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v9m0 0l-3-3m3 3l3-3" />
      <path d="M3 13h10" />
    </svg>
  );
}

function IcoDelete() {
  return (
    <svg className="w-[13px] h-[13px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

function IcoMore() {
  return (
    <svg className="w-[13px] h-[13px]" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="4" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="12" cy="8" r="1.5" />
    </svg>
  );
}

function IcoExport() {
  return (
    <svg className="w-[13px] h-[13px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 11V3m0 0L5.5 5.5M8 3l2.5 2.5" />
      <path d="M3 13h10" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────

export function QuickSwitcher() {
  const { t } = useTranslation();
  const { quickSwitcherOpen, closeQuickSwitcher } = useUIStore();
  const {
    contexts, vaultEntries, loadContexts, loadVaultEntries,
    switchContext, createContext,
    archiveContext, activateContext, vaultContext, deleteContext,
    restoreFromVault, importVaultZip,
    currentContextId,
  } = useContextStore();

  const [vaultSearch, setVaultSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusPane, setFocusPane] = useState<"left" | "vault">("left");
  const [showImportZone, setShowImportZone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const vaultInputRef = useRef<HTMLInputElement>(null);
  const activeScrollRef = useRef<HTMLDivElement>(null);
  const archivedScrollRef = useRef<HTMLDivElement>(null);
  const vaultScrollRef = useRef<HTMLDivElement>(null);

  const [importError, setImportError] = useState<string | null>(null);

  // Close dropdown menu on click outside
  useEffect(() => {
    if (!menuOpenId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpenId]);

  const doImport = useCallback(async (zipPath: string) => {
    setImportError(null);
    try {
      const newId = await importVaultZip(zipPath);
      await switchContext(newId);
      closeQuickSwitcher();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportError(msg);
      console.error("[import] Failed to import vault ZIP:", err);
    }
  }, [importVaultZip, switchContext, closeQuickSwitcher]);

  const handleImportDrop = useCallback(async (paths: string[]) => {
    const zipPath = paths.find(p => p.toLowerCase().endsWith(".zip"));
    if (!zipPath) return;
    doImport(zipPath);
  }, [doImport]);

  const handleImportClick = useCallback(async () => {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Vault ZIP", extensions: ["zip"] }],
    });
    if (selected) doImport(selected);
  }, [doImport]);

  // Tauri drag-drop listener (only active when import zone is open)
  useEffect(() => {
    if (!quickSwitcherOpen || !showImportZone) {
      setIsDragging(false);
      return;
    }
    let cancelled = false;
    const unlisten = getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (cancelled) return;
      if (event.payload.type === "over") {
        setIsDragging(true);
      } else if (event.payload.type === "leave") {
        setIsDragging(false);
      } else if (event.payload.type === "drop") {
        setIsDragging(false);
        handleImportDrop(event.payload.paths);
      }
    });
    return () => {
      cancelled = true;
      unlisten.then(fn => fn());
    };
  }, [quickSwitcherOpen, showImportZone, handleImportDrop]);

  useEffect(() => {
    if (quickSwitcherOpen) {
      ipc.autoVaultArchived()
        .then(() => Promise.all([loadContexts(), loadVaultEntries()]))
        .catch(() => Promise.all([loadContexts(), loadVaultEntries()]));
      setVaultSearch("");
      setSelectedIndex(0);
      setFocusPane("left");
      setShowImportZone(false);
      setImportError(null);
      setMenuOpenId(null);
      setTimeout(() => panelRef.current?.focus(), 50);
    }
  }, [quickSwitcherOpen, loadContexts, loadVaultEntries]);

  const active = useMemo(() => contexts.filter(c => c.state === ContextStates.ACTIVE), [contexts]);
  const archived = useMemo(() => contexts.filter(c => c.state === ContextStates.ARCHIVED), [contexts]);

  const filteredVault = useMemo(() => {
    if (!vaultSearch) return vaultEntries;
    const q = vaultSearch.toLowerCase();
    return vaultEntries.filter(v => v.name.toLowerCase().includes(q));
  }, [vaultEntries, vaultSearch]);

  const leftItems = useMemo(() => [...active, ...archived], [active, archived]);
  const currentListLength = focusPane === "left" ? leftItems.length : filteredVault.length;

  useEffect(() => {
    setSelectedIndex(0);
  }, [vaultSearch]);

  // Clamp selectedIndex when list shrinks (after vault/archive/delete)
  useEffect(() => {
    setSelectedIndex(i => Math.min(i, Math.max(currentListLength - 1, 0)));
  }, [currentListLength]);

  // Scroll selected item into view
  useEffect(() => {
    if (!quickSwitcherOpen) return;
    let container: HTMLDivElement | null;
    let adjustedIndex: number;
    if (focusPane === "left") {
      if (selectedIndex < active.length) {
        container = activeScrollRef.current;
        adjustedIndex = selectedIndex;
      } else {
        container = archivedScrollRef.current;
        adjustedIndex = selectedIndex - active.length;
      }
    } else {
      container = vaultScrollRef.current;
      adjustedIndex = selectedIndex;
    }
    if (!container) return;
    const items = container.querySelectorAll("[data-qs-row]");
    const el = items[adjustedIndex];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [selectedIndex, focusPane, quickSwitcherOpen, active.length]);

  if (!quickSwitcherOpen) return null;

  const inVaultMode = focusPane === "vault";

  // ── Handlers ──

  const handleSelect = async (ctx: ContextSummary) => {
    await switchContext(ctx.id);
    closeQuickSwitcher();
  };

  const handleCreate = async () => {
    await createContext(t("quickSwitcher.defaultName"));
    closeQuickSwitcher();
  };

  const handleArchive = async (e: React.MouseEvent, ctx: ContextSummary) => {
    e.stopPropagation();
    await archiveContext(ctx.id);
  };

  const handleVault = async (e: React.MouseEvent, ctx: ContextSummary) => {
    e.stopPropagation();
    await vaultContext(ctx.id);
  };

  const handleActivate = async (e: React.MouseEvent, ctx: ContextSummary) => {
    e.stopPropagation();
    await activateContext(ctx.id);
  };

  const handleRestoreFromVault = async (e: React.MouseEvent, entry: VaultEntry) => {
    e.stopPropagation();
    await restoreFromVault(entry.id);
  };

  const handleExportPng = async (e: React.MouseEvent, ctx: ContextSummary) => {
    e.stopPropagation();
    setMenuOpenId(null);
    if (ctx.id !== currentContextId) {
      await switchContext(ctx.id);
    }
    closeQuickSwitcher();
    // Wait for tree to render after switcher closes
    await new Promise((r) => setTimeout(r, 150));
    const el = document.getElementById("tree-canvas");
    if (!el) return;
    try {
      await exportTreeAsPng(el, ctx.name);
    } catch (err) {
      console.error("[export-png] Failed:", err);
    }
  };

  const handleExport = async (e: React.MouseEvent, ctx: ContextSummary) => {
    e.stopPropagation();
    setMenuOpenId(null);
    const destination = await saveDialog({
      title: t("quickSwitcher.button.export"),
      defaultPath: `${ctx.name}.zip`,
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (!destination) return;
    try {
      await ipc.exportContextZip(ctx.id, destination);
    } catch (err) {
      console.error("[export] Failed:", err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, ctx: ContextSummary) => {
    e.stopPropagation();
    const confirmed = await ask(
      t("quickSwitcher.confirm.deleteMessage", { name: ctx.name }),
      { title: t("quickSwitcher.confirm.deleteTitle"), kind: "warning" },
    );
    if (confirmed) {
      await deleteContext(ctx.id);
    }
  };

  const enterVaultSearch = () => {
    setFocusPane("vault");
    setSelectedIndex(0);
    setTimeout(() => vaultInputRef.current?.focus(), 0);
  };

  const exitVaultSearch = () => {
    setVaultSearch("");
    setFocusPane("left");
    setSelectedIndex(0);
    vaultInputRef.current?.blur();
    panelRef.current?.focus();
  };

  // ── Keyboard ──

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isInVaultSearch = document.activeElement === vaultInputRef.current;

    // Down: j / ↓ / Ctrl+j / Ctrl+n
    if (
      e.key === "ArrowDown" ||
      (e.ctrlKey && (e.key === "j" || e.key === "n")) ||
      (!isInVaultSearch && e.key === "j")
    ) {
      e.preventDefault();
      if (currentListLength === 0) return;
      if (isInVaultSearch) {
        vaultInputRef.current?.blur();
        panelRef.current?.focus();
      }
      setSelectedIndex(i => Math.min(i + 1, currentListLength - 1));
      return;
    }

    // Up: k / ↑ / Ctrl+k / Ctrl+p
    if (
      e.key === "ArrowUp" ||
      (e.ctrlKey && (e.key === "k" || e.key === "p")) ||
      (!isInVaultSearch && e.key === "k")
    ) {
      e.preventDefault();
      if (currentListLength === 0) return;
      if (isInVaultSearch) return;
      if (inVaultMode && selectedIndex === 0) {
        vaultInputRef.current?.focus();
        return;
      }
      setSelectedIndex(i => Math.max(i - 1, 0));
      return;
    }

    // Mod+N — create new context
    if (isModKey(e) && e.key === "n") {
      e.preventDefault();
      handleCreate();
      return;
    }

    // Enter — select (left pane only; vault items use button clicks)
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      if (focusPane === "left" && leftItems[selectedIndex]) {
        handleSelect(leftItems[selectedIndex]);
      }
      return;
    }

    // Close dropdown menu on Escape
    if (e.key === "Escape" && menuOpenId) {
      e.preventDefault();
      setMenuOpenId(null);
      return;
    }

    // Escape
    if (e.key === "Escape") {
      e.preventDefault();
      if (inVaultMode) {
        exitVaultSearch();
        return;
      }
      closeQuickSwitcher();
      return;
    }

    // "/" — focus vault search
    if (!isInVaultSearch && e.key === "/") {
      e.preventDefault();
      enterVaultSearch();
      return;
    }

    // Tab — toggle pane
    if (e.key === "Tab") {
      e.preventDefault();
      if (focusPane === "left") {
        enterVaultSearch();
      } else {
        exitVaultSearch();
      }
      return;
    }
  };

  // ── Row renderers ──

  const renderLeftRow = (ctx: ContextSummary, globalIdx: number) => {
    const isActive = ctx.state === ContextStates.ACTIVE;
    const isCurrent = ctx.id === currentContextId;
    const isSelected = !inVaultMode && globalIdx === selectedIndex;

    return (
      <div
        key={ctx.id}
        data-qs-row
        className={cn(
          "group/row flex items-center px-3 py-[7px] cursor-pointer transition-colors",
          isSelected && "bg-[var(--color-hover)]",
          isCurrent && "bg-accent-primary/8",
        )}
        onClick={() => handleSelect(ctx)}
        onMouseEnter={() => { if (!inVaultMode) setSelectedIndex(globalIdx); }}
      >
        <span className={cn(
          "text-[8px] w-[14px] shrink-0 text-center",
          isCurrent ? "text-accent-primary" : isActive ? "text-accent-primary" : "text-text-secondary",
        )}>
          {isCurrent ? "\u25B8" : isActive ? "\u25CF" : "\u25CB"}
        </span>
        <span className="text-[9px] text-text-secondary shrink-0 ml-1 mr-1.5 opacity-45 w-6">
          {timeAgo(ctx.updated_at)}
        </span>
        <span className={cn(
          "text-[12px] font-mono truncate flex-1 min-w-0",
          isActive ? "text-text-primary" : "text-text-secondary",
        )}>
          {ctx.name}
        </span>
        <div className="relative shrink-0 ml-1">
          <button
            className={cn(
              "w-[22px] h-[22px] rounded flex items-center justify-center text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary transition-all cursor-pointer",
              "opacity-0 group-hover/row:opacity-100",
              isSelected && "opacity-100",
              menuOpenId === ctx.id && "opacity-100 bg-[var(--color-hover)] text-text-primary",
            )}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpenId(menuOpenId === ctx.id ? null : ctx.id);
            }}
            title={t("quickSwitcher.button.more")}
            aria-label={t("quickSwitcher.button.more")}
          >
            <IcoMore />
          </button>

          {menuOpenId === ctx.id && (
            <div
              ref={menuRef}
              className="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-bg-elevated border border-border rounded-lg py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary transition-colors cursor-pointer"
                onClick={(e) => handleExportPng(e, ctx)}
              >
                <IcoExport />
                {t("quickSwitcher.button.exportPng")}
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary transition-colors cursor-pointer"
                onClick={(e) => handleExport(e, ctx)}
              >
                <IcoExport />
                {t("quickSwitcher.button.export")}
              </button>
              {isActive ? (
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary transition-colors cursor-pointer"
                  onClick={(e) => { setMenuOpenId(null); handleArchive(e, ctx); }}
                >
                  <IcoArchive />
                  {t("quickSwitcher.button.archive")}
                </button>
              ) : (
                <>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary transition-colors cursor-pointer"
                    onClick={(e) => { setMenuOpenId(null); handleActivate(e, ctx); }}
                  >
                    <IcoRestore />
                    {t("quickSwitcher.button.restore")}
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary transition-colors cursor-pointer"
                    onClick={(e) => { setMenuOpenId(null); handleVault(e, ctx); }}
                  >
                    <IcoVault />
                    {t("quickSwitcher.button.vault")}
                  </button>
                </>
              )}
              <div className="h-px bg-border my-1" />
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-[var(--color-hover)] hover:text-[#FF4444] transition-colors cursor-pointer"
                onClick={(e) => { setMenuOpenId(null); handleDelete(e, ctx); }}
              >
                <IcoDelete />
                {t("quickSwitcher.button.delete")}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderVaultRow = (entry: VaultEntry) => {
    return (
      <div
        key={entry.id}
        data-qs-row
        className="group/row flex items-center px-3 py-[7px] transition-colors"
      >
        <span className="text-[8px] w-[14px] shrink-0 text-center text-text-secondary opacity-50">
          {"\u25C6"}
        </span>
        <span className="text-[9px] text-text-secondary shrink-0 ml-1 mr-1.5 opacity-45 w-6">
          {timeAgo(entry.vaulted_at)}
        </span>
        <span className="text-[11px] font-mono truncate flex-1 min-w-0 text-text-secondary">
          {vaultSearch ? highlightMatch(entry.name, vaultSearch) : entry.name}
        </span>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity ml-1">
          <button
            className="w-[22px] h-[22px] rounded flex items-center justify-center text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary transition-all cursor-pointer"
            onClick={(e) => handleRestoreFromVault(e, entry)}
            title={t("quickSwitcher.button.restore")}
            aria-label={t("quickSwitcher.button.restore")}
          >
            <IcoUndo />
          </button>
        </div>
      </div>
    );
  };

  // ── Render ──

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[20vh] z-50"
      onClick={closeQuickSwitcher}
    >
      <div className="absolute inset-0 bg-[var(--color-overlay)]" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("quickSwitcher.ariaLabel")}
        className="relative w-[560px] bg-bg-elevated rounded-2xl overflow-hidden flex flex-col max-h-[520px] outline-none shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Body */}
        <div className="flex min-h-0 h-[420px]">
          {showImportZone ? (
            /* ── Full-area import drop zone ── */
            <div className="flex-1 flex items-center justify-center p-6">
              <button
                onClick={handleImportClick}
                className={cn(
                  "w-full h-full rounded-xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer",
                  isDragging
                    ? "border-2 border-solid border-accent-primary bg-accent-primary/15"
                    : "border-2 border-dashed border-text-secondary/25 hover:border-text-secondary/50 bg-transparent hover:bg-[var(--color-hover)]",
                )}
              >
                <span className={cn(
                  "text-[32px] transition-colors",
                  isDragging ? "text-accent-primary" : "text-text-secondary/30",
                )}>
                  {"\u2B07"}
                </span>
                <span className={cn(
                  "text-[12px] font-mono transition-colors",
                  isDragging ? "text-accent-primary font-bold" : "text-text-secondary/40",
                )}>
                  {isDragging ? t("quickSwitcher.dropRelease") : t("quickSwitcher.dropZip")}
                </span>
                {importError && (
                  <span className="text-[11px] font-mono text-red-400 max-w-[80%] text-center truncate">
                    {t("quickSwitcher.importError")}: {importError}
                  </span>
                )}
              </button>
            </div>
          ) : (
            <>
              {/* ── Left pane: Active + Archived ── */}
              <div className={cn(
                "w-[70%] flex flex-col min-h-0 border-r border-border transition-opacity",
                inVaultMode && "opacity-20 pointer-events-none",
              )}>
                {/* Active area (flex 7) */}
                <div className="flex-[7] flex flex-col min-h-0 overflow-hidden">
                  <div className="flex items-center justify-between px-3 pt-2.5 pb-1 shrink-0">
                    <span className="text-[10px] font-bold text-text-secondary tracking-[2px] font-mono">
                      {t("quickSwitcher.section.active")}
                    </span>
                    <span className="text-[10px] text-text-secondary opacity-50">{active.length}</span>
                  </div>
                  <div ref={activeScrollRef} className="flex-1 overflow-y-auto">
                    {active.map((ctx, i) => renderLeftRow(ctx, i))}
                    {active.length === 0 && archived.length === 0 && (
                      <div className="px-3 py-6 text-center text-text-secondary text-[11px]">
                        {t("quickSwitcher.empty")}
                      </div>
                    )}
                  </div>
                </div>

                {/* Archived area (flex 3) */}
                <div className="flex-[3] flex flex-col min-h-0 overflow-hidden border-t border-border">
                  <div className="flex items-center justify-between px-3 pt-2.5 pb-1 shrink-0">
                    <span className="text-[10px] font-bold text-text-secondary tracking-[2px] font-mono">
                      {t("quickSwitcher.section.archived")}
                    </span>
                    <span className="text-[10px] text-text-secondary opacity-50">{archived.length}</span>
                  </div>
                  <div ref={archivedScrollRef} className="flex-1 overflow-y-auto">
                    {archived.map((ctx, i) => renderLeftRow(ctx, active.length + i))}
                  </div>
                </div>
              </div>

              {/* ── Right pane: Vault ── */}
              <div className="w-[30%] flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 pt-2.5 pb-1 shrink-0">
                  <span className="text-[10px] font-bold text-text-secondary tracking-[2px] font-mono">
                    {t("quickSwitcher.section.vault")}
                  </span>
                  <span className="text-[10px] text-text-secondary opacity-50">
                    {vaultSearch ? `${filteredVault.length} / ${vaultEntries.length}` : vaultEntries.length}
                  </span>
                </div>

                {/* Vault search */}
                <div className={cn(
                  "flex items-center mx-2 mb-1.5 bg-bg-card rounded-md px-2 h-7 border border-transparent transition-colors shrink-0",
                  inVaultMode && "border-text-secondary/30",
                )}>
                  <span className="text-[10px] text-text-secondary opacity-40 mr-1.5 shrink-0">{"\u2315"}</span>
                  <input
                    ref={vaultInputRef}
                    value={vaultSearch}
                    onChange={(e) => setVaultSearch(e.target.value)}
                    onFocus={() => {
                      if (focusPane !== "vault") {
                        setFocusPane("vault");
                        setSelectedIndex(0);
                      }
                    }}
                    placeholder={t("quickSwitcher.vaultSearch")}
                    className="flex-1 bg-transparent text-[10px] text-text-primary placeholder:text-text-secondary/35 outline-none font-mono min-w-0"
                  />
                  <span className="text-[8px] text-text-secondary opacity-30 bg-bg-elevated px-1 py-0.5 rounded-sm shrink-0">
                    {inVaultMode ? "esc" : "/"}
                  </span>
                </div>

                {/* Vault list */}
                <div ref={vaultScrollRef} className="flex-1 overflow-y-auto">
                  {filteredVault.map((entry) => renderVaultRow(entry))}
                  {filteredVault.length === 0 && vaultEntries.length > 0 && (
                    <div className="px-3 py-4 text-center text-text-secondary text-[11px]">
                      {t("quickSwitcher.noMatch")}
                    </div>
                  )}
                  {vaultEntries.length === 0 && (
                    <div className="px-3 py-4 text-center text-text-secondary/50 text-[10px]">
                      {t("quickSwitcher.vaultEmpty")}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-3 h-12 bg-bg-card shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCreate}
              className="px-3 py-1.5 text-[11px] font-bold text-white bg-accent-primary rounded-md font-mono cursor-pointer flex items-center gap-1.5"
            >
              {t("quickSwitcher.button.new")}
              <span className="text-[9px] opacity-70">{modSymbol}N</span>
            </button>
            <button
              onClick={() => setShowImportZone(!showImportZone)}
              className={cn(
                "px-2.5 py-1.5 text-[11px] font-bold rounded-md font-mono cursor-pointer flex items-center gap-1 transition-all",
                showImportZone
                  ? "bg-text-secondary/20 text-text-primary"
                  : "bg-bg-elevated text-text-secondary hover:text-text-primary",
              )}
              title={t("quickSwitcher.button.import")}
            >
              <IcoImport />
              {t("quickSwitcher.button.import")}
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {inVaultMode ? (
              <span className="text-[9px] text-text-secondary opacity-40">
                <kbd className="bg-bg-elevated px-1 py-0.5 rounded-sm text-[8px] font-mono mr-1">esc</kbd>
                {t("quickSwitcher.hint.clear")}
              </span>
            ) : (
              <>
                <span className="text-[9px] text-text-secondary opacity-40">
                  <kbd className="bg-bg-elevated px-1 py-0.5 rounded-sm text-[8px] font-mono mr-0.5">j</kbd>
                  <kbd className="bg-bg-elevated px-1 py-0.5 rounded-sm text-[8px] font-mono mr-1">k</kbd>
                  {t("quickSwitcher.hint.nav")}
                </span>
                <span className="text-[9px] text-text-secondary opacity-40">
                  <kbd className="bg-bg-elevated px-1 py-0.5 rounded-sm text-[8px] font-mono mr-1">/</kbd>
                  {t("quickSwitcher.hint.vaultSearch")}
                </span>
                <span className="text-[9px] text-text-secondary opacity-40">
                  <kbd className="bg-bg-elevated px-1 py-0.5 rounded-sm text-[8px] font-mono mr-1">esc</kbd>
                  {t("quickSwitcher.hint.close")}
                </span>
              </>
            )}
          </div>

          {/* Help button */}
          <div className="group/help relative shrink-0">
            <button className="w-5 h-5 rounded-full border border-border text-text-secondary text-[10px] font-bold flex items-center justify-center opacity-40 hover:opacity-100 hover:border-text-secondary transition-all cursor-pointer">
              ?
            </button>
            <div className="hidden group-hover/help:block absolute bottom-[calc(100%+8px)] right-0 w-[260px] bg-bg-card border border-border rounded-xl p-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-10">
              <div className="mb-2.5">
                <div className="text-[9px] font-bold tracking-[1.5px] text-text-secondary mb-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-primary mr-1.5 align-middle relative -top-px" />
                  ACTIVE
                </div>
                <div className="text-[10px] leading-relaxed text-text-secondary/80">
                  {t("quickSwitcher.help.active")}
                </div>
              </div>
              <div className="mb-2.5">
                <div className="text-[9px] font-bold tracking-[1.5px] text-text-secondary mb-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-secondary mr-1.5 align-middle relative -top-px" />
                  ARCHIVED
                </div>
                <div className="text-[10px] leading-relaxed text-text-secondary/80">
                  {t("quickSwitcher.help.archived")}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-bold tracking-[1.5px] text-text-secondary mb-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-secondary/50 mr-1.5 align-middle relative -top-px" />
                  VAULT
                </div>
                <div className="text-[10px] leading-relaxed text-text-secondary/80">
                  {t("quickSwitcher.help.vault")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
