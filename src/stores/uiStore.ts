import { create } from "zustand";
import { Themes, DEFAULT_CUSTOM_COLORS, CUSTOM_COLOR_CSS_MAP, CompactStates } from "../lib/constants";
import type { ThemeId, CustomThemeColors, CompactState } from "../lib/constants";
import type { CompactHighlightInfo, CompactSummary } from "../lib/types";

function loadCustomColors(): CustomThemeColors {
  try {
    const raw = localStorage.getItem("vedrr-custom-theme");
    if (raw) return { ...DEFAULT_CUSTOM_COLORS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_CUSTOM_COLORS };
}

function applyCustomColors(colors: CustomThemeColors) {
  const el = document.documentElement;
  for (const [key, cssVar] of Object.entries(CUSTOM_COLOR_CSS_MAP)) {
    el.style.setProperty(cssVar, colors[key as keyof CustomThemeColors]);
  }
  // Auto-compute overlay/hover from bgPage brightness
  const r = parseInt(colors.bgPage.slice(1, 3), 16);
  const g = parseInt(colors.bgPage.slice(3, 5), 16);
  const b = parseInt(colors.bgPage.slice(5, 7), 16);
  const isDark = (r * 299 + g * 587 + b * 114) / 1000 < 128;
  el.style.setProperty("--color-overlay", isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.3)");
  el.style.setProperty("--color-hover", isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)");
}

function clearCustomColors() {
  const el = document.documentElement;
  for (const cssVar of Object.values(CUSTOM_COLOR_CSS_MAP)) {
    el.style.removeProperty(cssVar);
  }
  el.style.removeProperty("--color-overlay");
  el.style.removeProperty("--color-hover");
}

interface UIStore {
  quickSwitcherOpen: boolean;
  editingNodeId: string | null;
  typePopoverNodeId: string | null;
  contentPanelFocused: boolean;
  markdownEditorNodeId: string | null;
  nodeSearchOpen: boolean;
  contextMenuNodeId: string | null;
  contextMenuPosition: { x: number; y: number } | null;
  collapsedNodes: Set<string>;
  currentTheme: ThemeId;
  settingsOpen: boolean;
  customThemeColors: CustomThemeColors;
  compactState: CompactState;
  compactHighlights: Map<string, CompactHighlightInfo> | null;
  compactSummary: CompactSummary | null;
  compactBannerExpanded: boolean;
  compactRootId: string | null;
  compactFading: boolean;
  compactError: string | null;
  compactBannerFlash: number;
  inboxTriageOpen: boolean;
  openInboxTriage: () => void;
  closeInboxTriage: () => void;
  toggleQuickSwitcher: () => void;
  openQuickSwitcher: () => void;
  closeQuickSwitcher: () => void;
  setEditingNode: (id: string | null) => void;
  openTypePopover: (nodeId: string) => void;
  closeTypePopover: () => void;
  setContentPanelFocused: (v: boolean) => void;
  openMarkdownEditor: (nodeId: string) => void;
  closeMarkdownEditor: () => void;
  openNodeSearch: () => void;
  closeNodeSearch: () => void;
  openContextMenu: (nodeId: string, x: number, y: number) => void;
  closeContextMenu: () => void;
  toggleCollapse: (nodeId: string) => void;
  setTheme: (theme: ThemeId) => void;
  setCustomColor: (key: keyof CustomThemeColors, value: string) => void;
  openSettings: () => void;
  closeSettings: () => void;
  setCompactState: (state: CompactState) => void;
  setCompactApplied: (rootId: string, summary: CompactSummary, highlights: Map<string, CompactHighlightInfo>) => void;
  dismissCompactBanner: () => void;
  clearCompactHighlights: () => void;
  startCompactFade: (delayMs?: number) => void;
  toggleCompactBannerExpanded: () => void;
  setCompactError: (error: string | null) => void;
  flashCompactBanner: () => void;
}

let fadeTimer1 = 0;
let fadeTimer2 = 0;

export const useUIStore = create<UIStore>((set) => ({
  quickSwitcherOpen: false,
  editingNodeId: null,
  typePopoverNodeId: null,
  contentPanelFocused: false,
  markdownEditorNodeId: null,
  nodeSearchOpen: false,
  contextMenuNodeId: null,
  contextMenuPosition: null,
  collapsedNodes: new Set<string>(),
  currentTheme: (localStorage.getItem("vedrr-theme") as ThemeId) || Themes.MOCHA,
  settingsOpen: false,
  customThemeColors: loadCustomColors(),
  compactState: CompactStates.IDLE,
  compactRootId: null,
  compactHighlights: null,
  compactSummary: null,
  compactBannerExpanded: false,
  compactFading: false,
  compactError: null,
  compactBannerFlash: 0,
  inboxTriageOpen: false,
  openInboxTriage: () => set({ inboxTriageOpen: true }),
  closeInboxTriage: () => set({ inboxTriageOpen: false }),
  toggleQuickSwitcher: () => set((s) => ({ quickSwitcherOpen: !s.quickSwitcherOpen, nodeSearchOpen: false })),
  openQuickSwitcher: () => set({ quickSwitcherOpen: true, nodeSearchOpen: false }),
  closeQuickSwitcher: () => set({ quickSwitcherOpen: false }),
  setEditingNode: (id) => set({ editingNodeId: id }),
  openTypePopover: (nodeId) => set({ typePopoverNodeId: nodeId }),
  closeTypePopover: () => set({ typePopoverNodeId: null }),
  setContentPanelFocused: (v) => set({ contentPanelFocused: v }),
  openMarkdownEditor: (nodeId) => set({ markdownEditorNodeId: nodeId }),
  closeMarkdownEditor: () => set({ markdownEditorNodeId: null, contentPanelFocused: false }),
  openNodeSearch: () => set({ nodeSearchOpen: true, quickSwitcherOpen: false }),
  closeNodeSearch: () => set({ nodeSearchOpen: false }),
  openContextMenu: (nodeId, x, y) => set({ contextMenuNodeId: nodeId, contextMenuPosition: { x, y } }),
  closeContextMenu: () => set({ contextMenuNodeId: null, contextMenuPosition: null }),
  toggleCollapse: (nodeId) => set((s) => {
    const next = new Set(s.collapsedNodes);
    if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
    return { collapsedNodes: next };
  }),
  setTheme: (theme) => {
    localStorage.setItem("vedrr-theme", theme);
    clearCustomColors();
    if (theme === Themes.CUSTOM) {
      document.documentElement.setAttribute("data-theme", "custom");
      const colors = useUIStore.getState().customThemeColors;
      applyCustomColors(colors);
    } else {
      document.documentElement.setAttribute("data-theme", theme === Themes.OBSIDIAN ? "" : theme);
    }
    set({ currentTheme: theme });
  },
  setCustomColor: (key, value) => {
    const colors = { ...useUIStore.getState().customThemeColors, [key]: value };
    localStorage.setItem("vedrr-custom-theme", JSON.stringify(colors));
    applyCustomColors(colors);
    set({ customThemeColors: colors });
  },
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  setCompactState: (state) => set({ compactState: state }),
  setCompactApplied: (rootId, summary, highlights) => set({
    compactState: CompactStates.APPLIED,
    compactRootId: rootId,
    compactSummary: summary,
    compactHighlights: highlights,
    compactBannerExpanded: false,
    compactFading: false,
    compactError: null,
  }),
  dismissCompactBanner: () => set({
    compactState: CompactStates.IDLE,
    compactRootId: null,
    compactSummary: null,
    compactBannerExpanded: false,
  }),
  clearCompactHighlights: () => {
    clearTimeout(fadeTimer1);
    clearTimeout(fadeTimer2);
    set({
      compactHighlights: null,
      compactFading: false,
      compactState: CompactStates.IDLE,
      compactRootId: null,
      compactSummary: null,
      compactBannerExpanded: false,
      compactError: null,
    });
  },
  startCompactFade: (delayMs = 0) => {
    // Cancel any previous fade timers
    clearTimeout(fadeTimer1);
    clearTimeout(fadeTimer2);
    fadeTimer1 = window.setTimeout(() => {
      set({ compactFading: true });
      fadeTimer2 = window.setTimeout(() => {
        set({ compactHighlights: null, compactFading: false });
      }, 800);
    }, delayMs);
  },
  toggleCompactBannerExpanded: () => set((s) => ({ compactBannerExpanded: !s.compactBannerExpanded })),
  setCompactError: (error) => {
    clearTimeout(fadeTimer1);
    clearTimeout(fadeTimer2);
    set({
      compactError: error,
      compactState: CompactStates.IDLE,
      compactRootId: null,
      compactSummary: null,
      compactHighlights: null,
      compactBannerExpanded: false,
      compactFading: false,
    });
  },
  flashCompactBanner: () => set((s) => ({ compactBannerFlash: s.compactBannerFlash + 1 })),
}));
