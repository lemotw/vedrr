import { create } from "zustand";

interface UIStore {
  quickSwitcherOpen: boolean;
  editingNodeId: string | null;
  typePopoverNodeId: string | null;
  contentPanelFocused: boolean;
  markdownEditorNodeId: string | null;

  toggleQuickSwitcher: () => void;
  openQuickSwitcher: () => void;
  closeQuickSwitcher: () => void;
  setEditingNode: (id: string | null) => void;
  openTypePopover: (nodeId: string) => void;
  closeTypePopover: () => void;
  setContentPanelFocused: (v: boolean) => void;
  openMarkdownEditor: (nodeId: string) => void;
  closeMarkdownEditor: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  quickSwitcherOpen: false,
  editingNodeId: null,
  typePopoverNodeId: null,
  contentPanelFocused: false,
  markdownEditorNodeId: null,

  toggleQuickSwitcher: () => set((s) => ({ quickSwitcherOpen: !s.quickSwitcherOpen })),
  openQuickSwitcher: () => set({ quickSwitcherOpen: true }),
  closeQuickSwitcher: () => set({ quickSwitcherOpen: false }),
  setEditingNode: (id) => set({ editingNodeId: id }),
  openTypePopover: (nodeId) => set({ typePopoverNodeId: nodeId }),
  closeTypePopover: () => set({ typePopoverNodeId: null }),
  setContentPanelFocused: (v) => set({ contentPanelFocused: v }),
  openMarkdownEditor: (nodeId) => set({ markdownEditorNodeId: nodeId }),
  closeMarkdownEditor: () => set({ markdownEditorNodeId: null, contentPanelFocused: false }),
}));
