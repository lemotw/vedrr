import { useEffect } from "react";
import { StatusBar } from "./components/StatusBar";
import { TreeCanvas } from "./components/TreeCanvas";
import { ContentPanel } from "./components/ContentPanel";
import { QuickSwitcher } from "./components/QuickSwitcher";
import { NodeTypePopover } from "./components/NodeTypePopover";
import { NodeSearch } from "./components/NodeSearch";
import { useContextStore } from "./stores/contextStore";
import { useKeyboard } from "./hooks/useKeyboard";
import { useUIStore } from "./stores/uiStore";
import { ContextStates } from "./lib/constants";

export default function App() {
  const { loadContexts, switchContext } = useContextStore();
  const { openQuickSwitcher } = useUIStore();
  useKeyboard();

  useEffect(() => {
    loadContexts().then(() => {
      const active = useContextStore.getState().contexts.find(c => c.state === ContextStates.ACTIVE);
      if (active) switchContext(active.id);
      else openQuickSwitcher();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-page">
      <StatusBar />
      <main className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden">
          <TreeCanvas />
        </div>
        <ContentPanel />
      </main>
      <QuickSwitcher />
      <NodeTypePopover />
      <NodeSearch />
    </div>
  );
}
