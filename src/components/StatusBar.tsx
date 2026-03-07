import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useContextStore } from "../stores/contextStore";
import { useUIStore } from "../stores/uiStore";
import { CompactStates } from "../lib/constants";
import { modSymbol } from "../lib/platform";
import type { ModelStatus } from "../lib/types";
import { ipc } from "../lib/ipc";

function HintButton({
  label,
  shortcut,
  onClick,
  disabled,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-mono text-[11px] transition-colors ${
        disabled
          ? "text-text-secondary/40 cursor-not-allowed"
          : "text-text-secondary cursor-pointer hover:text-text-primary"
      }`}
    >
      {shortcut && <><span className={disabled ? "text-text-secondary/40" : "text-text-primary"}>{shortcut}</span>{" "}</>}{label}
    </button>
  );
}

export function StatusBar() {
  const { t } = useTranslation();
  const { contexts, currentContextId } = useContextStore();
  const { openQuickSwitcher, openSettings, openInboxTriage } = useUIStore();
  const compactState = useUIStore((s) => s.compactState);

  const current = contexts.find((c) => c.id === currentContextId);

  const locked = compactState !== CompactStates.IDLE;

  const guardedAction = (action: () => void) => () => {
    if (locked) { useUIStore.getState().flashCompactBanner(); return; }
    action();
  };

  // Poll model setup status — stop once ready or error
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ status: "not_ready", progress: 0, queue_done: 0, queue_total: 0 });
  const settled = modelStatus.status === "ready" || modelStatus.status === "error";
  useEffect(() => {
    if (settled) return;
    let cancelled = false;
    const poll = () => {
      ipc.getModelStatus().then((s) => {
        if (!cancelled) setModelStatus(s);
      }).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [settled]);

  const setupBusy = modelStatus.status !== "ready" && modelStatus.status !== "error";
  const setupLabel = modelStatus.status === "warming_up"
    ? modelStatus.queue_total > 0
      ? t("statusBar.setup.warmingProgress", { done: modelStatus.queue_done, total: modelStatus.queue_total })
      : t("statusBar.setup.warming")
    : setupBusy ? t("statusBar.setup.loading") : null;

  return (
    <div className="flex items-center justify-between h-11 px-5 bg-bg-card shrink-0">
      <span className="font-heading text-sm font-bold text-text-primary">
        {current?.name ?? t("statusBar.noContext")}
      </span>
      <div className="flex items-center gap-4">
        {setupLabel && (
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-accent-primary border-t-transparent" />
            <span className="font-mono text-[10px] text-text-secondary">{setupLabel}</span>
          </div>
        )}
        <HintButton shortcut={`${modSymbol}I`} label="inbox" onClick={guardedAction(openInboxTriage)} disabled={locked} />
        <HintButton shortcut={`${modSymbol}K`} label="switch" onClick={guardedAction(openQuickSwitcher)} disabled={locked} />
        <span className="text-border">│</span>
        <HintButton label="settings" onClick={guardedAction(openSettings)} disabled={locked} />
      </div>
    </div>
  );
}
