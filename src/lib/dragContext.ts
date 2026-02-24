import { createContext, useContext } from "react";

export type DropIntent = "reorder" | "into" | null;

interface DragState {
  activeId: string | null;
  activeParentId: string | null;
  overId: string | null;
  overParentId: string | null;
  dropIntent: DropIntent;
}

export const DragStateContext = createContext<DragState>({
  activeId: null,
  activeParentId: null,
  overId: null,
  overParentId: null,
  dropIntent: null,
});

export function useDragState() {
  return useContext(DragStateContext);
}
