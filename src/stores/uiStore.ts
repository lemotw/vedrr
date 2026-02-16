import { create } from "zustand";

interface UIStore {
  quickSwitcherOpen: boolean;
  editingNodeId: string | null;
  typePopoverNodeId: string | null;

  toggleQuickSwitcher: () => void;
  openQuickSwitcher: () => void;
  closeQuickSwitcher: () => void;
  setEditingNode: (id: string | null) => void;
  openTypePopover: (nodeId: string) => void;
  closeTypePopover: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  quickSwitcherOpen: false,
  editingNodeId: null,
  typePopoverNodeId: null,

  toggleQuickSwitcher: () => set((s) => ({ quickSwitcherOpen: !s.quickSwitcherOpen })),
  openQuickSwitcher: () => set({ quickSwitcherOpen: true }),
  closeQuickSwitcher: () => set({ quickSwitcherOpen: false }),
  setEditingNode: (id) => set({ editingNodeId: id }),
  openTypePopover: (nodeId) => set({ typePopoverNodeId: nodeId }),
  closeTypePopover: () => set({ typePopoverNodeId: null }),
}));
