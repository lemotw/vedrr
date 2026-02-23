import { create } from "zustand";
import type { ContextSummary } from "../lib/types";
import { ipc } from "../lib/ipc";
import { ContextStates } from "../lib/constants";

interface ContextStore {
  contexts: ContextSummary[];
  currentContextId: string | null;
  loading: boolean;

  loadContexts: () => Promise<void>;
  createContext: (name: string) => Promise<void>;
  switchContext: (id: string) => Promise<void>;
  renameContext: (id: string, name: string) => Promise<void>;
  archiveContext: (id: string) => Promise<void>;
  activateContext: (id: string) => Promise<void>;
  deleteContext: (id: string) => Promise<void>;
}

export const useContextStore = create<ContextStore>((set, get) => ({
  contexts: [],
  currentContextId: null,
  loading: false,

  loadContexts: async () => {
    const contexts = await ipc.listContexts();
    set({ contexts });
  },

  createContext: async (name: string) => {
    const ctx = await ipc.createContext(name);
    await get().loadContexts();
    await get().switchContext(ctx.id);
  },

  switchContext: async (id: string) => {
    await ipc.switchContext(id);
    set({ currentContextId: id });
    await get().loadContexts();
  },

  renameContext: async (id: string, name: string) => {
    await ipc.renameContext(id, name);
    await get().loadContexts();
  },

  archiveContext: async (id: string) => {
    await ipc.archiveContext(id);
    const { currentContextId } = get();
    if (currentContextId === id) {
      const contexts = await ipc.listContexts();
      const next = contexts.find(c => c.state === ContextStates.ACTIVE && c.id !== id);
      set({ currentContextId: next?.id ?? null, contexts });
    } else {
      await get().loadContexts();
    }
  },

  activateContext: async (id: string) => {
    await ipc.activateContext(id);
    await get().loadContexts();
  },

  deleteContext: async (id: string) => {
    await ipc.deleteContext(id);
    const { currentContextId } = get();
    if (currentContextId === id) set({ currentContextId: null });
    await get().loadContexts();
  },
}));
