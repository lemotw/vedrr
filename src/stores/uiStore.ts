import { create } from "zustand";

interface UIStore {
  quickSwitcherOpen: boolean;
  editingNodeId: string | null;
  typePopoverNodeId: string | null;
  contentPanelFocused: boolean;
  markdownEditorNodeId: string | null;
  nodeSearchOpen: boolean;
  contextMenuNodeId: string | null;
  contextMenuPosition: { x: number; y: number } | null;

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
}));
