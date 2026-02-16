import { useEffect } from "react";
import { StatusBar } from "./components/StatusBar";
import { TreeCanvas } from "./components/TreeCanvas";
import { QuickSwitcher } from "./components/QuickSwitcher";
import { NodeTypePopover } from "./components/NodeTypePopover";
import { useContextStore } from "./stores/contextStore";
import { useKeyboard } from "./hooks/useKeyboard";
import { useUIStore } from "./stores/uiStore";

export default function App() {
  const { loadContexts, switchContext } = useContextStore();
  const { openQuickSwitcher } = useUIStore();
  useKeyboard();

  useEffect(() => {
    loadContexts().then(() => {
      const active = useContextStore.getState().contexts.find(c => c.state === "active");
      if (active) switchContext(active.id);
      else openQuickSwitcher();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-page">
      <StatusBar />
      <main className="flex-1 overflow-hidden">
        <TreeCanvas />
      </main>
      <QuickSwitcher />
      <NodeTypePopover />
    </div>
  );
}
