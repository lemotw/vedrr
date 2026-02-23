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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
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
