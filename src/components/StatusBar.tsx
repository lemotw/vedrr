import { useContextStore } from "../stores/contextStore";
import { useUIStore } from "../stores/uiStore";
import { ContextStates } from "../lib/constants";
import { modSymbol } from "../lib/platform";

export function StatusBar() {
  const { contexts, currentContextId } = useContextStore();
  const { openQuickSwitcher, toggleThemeSwitcher, openAiSettings } = useUIStore();

  const current = contexts.find((c) => c.id === currentContextId);
  const activeCount = contexts.filter((c) => c.state === ContextStates.ACTIVE).length;

  return (
    <div className="flex items-center justify-between h-11 px-5 bg-bg-card shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="font-heading text-sm font-bold text-text-primary">
          {current?.name ?? "No Context"}
        </span>
        <span className="text-xs text-text-secondary">
          {activeCount} active
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={openAiSettings}
          className="px-2 py-1 text-xs text-text-secondary bg-bg-elevated rounded cursor-pointer hover:text-text-primary transition-colors"
          title="AI Settings"
        >
          AI
        </button>
        <button
          onClick={toggleThemeSwitcher}
          className="px-2 py-1 text-xs text-text-secondary bg-bg-elevated rounded cursor-pointer hover:text-text-primary transition-colors"
          title="Theme"
        >
          ◐
        </button>
        <button
          onClick={openQuickSwitcher}
          className="px-2 py-1 text-xs text-text-secondary bg-bg-elevated rounded cursor-pointer hover:bg-bg-card"
        >
          {modSymbol}K
        </button>
      </div>
    </div>
  );
}
