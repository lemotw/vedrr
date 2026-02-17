import { createContext, useContext } from "react";

interface DragState {
  activeId: string | null;
  activeParentId: string | null;
  overId: string | null;
  overParentId: string | null;
  reparentIntent: boolean;
}

export const DragStateContext = createContext<DragState>({
  activeId: null,
  activeParentId: null,
  overId: null,
  overParentId: null,
  reparentIntent: false,
});

export function useDragState() {
  return useContext(DragStateContext);
}
