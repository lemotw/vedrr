import { create } from "zustand";
import { Themes, DEFAULT_CUSTOM_COLORS, CUSTOM_COLOR_CSS_MAP } from "../lib/constants";
import type { ThemeId, CustomThemeColors } from "../lib/constants";
import type { CompactResult } from "../lib/types";
import type { DiffOp } from "../lib/compactDiff";

function loadCustomColors(): CustomThemeColors {
  try {
    const raw = localStorage.getItem("mindflow-custom-theme");
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
  themeSwitcherOpen: boolean;
  customThemeColors: CustomThemeColors;
  aiSettingsOpen: boolean;
  compactLoading: boolean;
  compactResult: CompactResult | null;
  compactDiff: DiffOp[] | null;
  compactError: string | null;

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
  toggleThemeSwitcher: () => void;
  closeThemeSwitcher: () => void;
  openAiSettings: () => void;
  closeAiSettings: () => void;
  setCompactLoading: (v: boolean) => void;
  setCompactResult: (result: CompactResult | null, diff: DiffOp[] | null) => void;
  setCompactError: (error: string | null) => void;
  closeCompactPreview: () => void;
}

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
  currentTheme: (localStorage.getItem("mindflow-theme") as ThemeId) || Themes.MOCHA,
  themeSwitcherOpen: false,
  customThemeColors: loadCustomColors(),
  aiSettingsOpen: false,
  compactLoading: false,
  compactResult: null,
  compactDiff: null,
  compactError: null,

  toggleQuickSwitcher: () => set((s) => ({ quickSwitcherOpen: !s.quickSwitcherOpen })),
  openQuickSwitcher: () => set({ quickSwitcherOpen: true }),
  closeQuickSwitcher: () => set({ quickSwitcherOpen: false }),
  setEditingNode: (id) => set({ editingNodeId: id }),
  openTypePopover: (nodeId) => set({ typePopoverNodeId: nodeId }),
  closeTypePopover: () => set({ typePopoverNodeId: null }),
  setContentPanelFocused: (v) => set({ contentPanelFocused: v }),
  openMarkdownEditor: (nodeId) => set({ markdownEditorNodeId: nodeId }),
  closeMarkdownEditor: () => set({ markdownEditorNodeId: null, contentPanelFocused: false }),
  openNodeSearch: () => set({ nodeSearchOpen: true }),
  closeNodeSearch: () => set({ nodeSearchOpen: false }),
  openContextMenu: (nodeId, x, y) => set({ contextMenuNodeId: nodeId, contextMenuPosition: { x, y } }),
  closeContextMenu: () => set({ contextMenuNodeId: null, contextMenuPosition: null }),
  toggleCollapse: (nodeId) => set((s) => {
    const next = new Set(s.collapsedNodes);
    if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
    return { collapsedNodes: next };
  }),
  setTheme: (theme) => {
    localStorage.setItem("mindflow-theme", theme);
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
    localStorage.setItem("mindflow-custom-theme", JSON.stringify(colors));
    applyCustomColors(colors);
    set({ customThemeColors: colors });
  },
  toggleThemeSwitcher: () => set((s) => ({ themeSwitcherOpen: !s.themeSwitcherOpen })),
  closeThemeSwitcher: () => set({ themeSwitcherOpen: false }),
  openAiSettings: () => set({ aiSettingsOpen: true }),
  closeAiSettings: () => set({ aiSettingsOpen: false }),
  setCompactLoading: (v) => set({ compactLoading: v }),
  setCompactResult: (result, diff) => set({ compactResult: result, compactDiff: diff, compactError: null }),
  setCompactError: (error) => set({ compactError: error }),
  closeCompactPreview: () => set({ compactResult: null, compactDiff: null, compactError: null }),
}));
