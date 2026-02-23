import { useContextStore } from "../stores/contextStore";
import { useUIStore } from "../stores/uiStore";
import { ContextStates, CompactStates } from "../lib/constants";
import { modSymbol } from "../lib/platform";

export function StatusBar() {
  const { contexts, currentContextId } = useContextStore();
  const { openQuickSwitcher, openSettings } = useUIStore();
  const compactState = useUIStore((s) => s.compactState);

  const current = contexts.find((c) => c.id === currentContextId);
  const activeCount = contexts.filter((c) => c.state === ContextStates.ACTIVE).length;

  const locked = compactState !== CompactStates.IDLE;

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
          onClick={() => {
            if (locked) { useUIStore.getState().flashCompactBanner(); return; }
            openSettings();
          }}
          disabled={locked}
          className={`px-2 py-1 text-xs rounded transition-colors ${locked ? "text-text-secondary/40 bg-bg-elevated/50 cursor-not-allowed" : "text-text-secondary bg-bg-elevated cursor-pointer hover:text-text-primary"}`}
          title="Settings"
        >
          Settings
        </button>
        <button
          onClick={() => {
            if (locked) { useUIStore.getState().flashCompactBanner(); return; }
            openQuickSwitcher();
          }}
          disabled={locked}
          className={`px-2 py-1 text-xs rounded transition-colors ${locked ? "text-text-secondary/40 bg-bg-elevated/50 cursor-not-allowed" : "text-text-secondary bg-bg-elevated cursor-pointer hover:bg-bg-card"}`}
        >
          {modSymbol}K
        </button>
      </div>
    </div>
  );
}
