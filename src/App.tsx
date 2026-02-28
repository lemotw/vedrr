import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusBar } from "./components/StatusBar";
import { TreeCanvas } from "./components/TreeCanvas";
import { ContentPanel } from "./components/ContentPanel";
import { QuickSwitcher } from "./components/QuickSwitcher";
import { NodeTypePopover } from "./components/NodeTypePopover";
import { NodeSearch } from "./components/NodeSearch";
import { ContextMenu } from "./components/ContextMenu";
import { SettingsPanel } from "./components/SettingsPanel";
import { CompactBanner } from "./components/CompactBanner";
import { useContextStore } from "./stores/contextStore";
import { useTreeStore } from "./stores/treeStore";
import { useKeyboard } from "./hooks/useKeyboard";
import { useUIStore } from "./stores/uiStore";
import { ipc } from "./lib/ipc";
import { ContextStates, CompactStates } from "./lib/constants";
import type { ModelStatus } from "./lib/types";

export default function App() {
  const { t } = useTranslation();
  const { loadContexts, switchContext } = useContextStore();
  const { openQuickSwitcher } = useUIStore();
  const compactState = useUIStore((s) => s.compactState);
  const compactError = useUIStore((s) => s.compactError);
  const [appReady, setAppReady] = useState(false);
  const [setupStatus, setSetupStatus] = useState<ModelStatus>({ status: "not_ready", progress: 0, queue_done: 0, queue_total: 0 });
  useKeyboard();

  // Poll model status while app is loading
  useEffect(() => {
    if (appReady) return;
    let cancelled = false;
    const poll = () => {
      ipc.getModelStatus().then((s) => {
        if (!cancelled) setSetupStatus(s);
      }).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 500);
    return () => { cancelled = true; clearInterval(id); };
  }, [appReady]);

  useEffect(() => {
    // Apply saved theme on startup
    const { currentTheme, setTheme } = useUIStore.getState();
    setTheme(currentTheme);

    loadContexts().then(() => {
      const active = useContextStore.getState().contexts.find(c => c.state === ContextStates.ACTIVE);
      if (active) {
        switchContext(active.id).then(() => setAppReady(true));
      } else {
        setAppReady(true);
        openQuickSwitcher();
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync root node title changes → context list (replaces circular treeStore→contextStore import)
  useEffect(() => {
    let prevRootTitle: string | undefined;
    const unsub = useTreeStore.subscribe((state) => {
      const title = state.tree?.node.title;
      if (prevRootTitle !== undefined && title !== prevRootTitle) {
        useContextStore.getState().loadContexts();
      }
      prevRootTitle = title;
    });
    return unsub;
  }, []);

  // Loading screen
  if (!appReady) {
    const statusText = setupStatus.status === "warming_up"
      ? setupStatus.queue_total > 0
        ? t("statusBar.setup.warmingProgress", { done: setupStatus.queue_done, total: setupStatus.queue_total })
        : t("statusBar.setup.warming")
      : setupStatus.status === "downloading" || setupStatus.status === "not_ready"
        ? t("statusBar.setup.loading")
        : null;

    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-bg-page gap-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
        <span className="font-mono text-[11px] text-text-secondary">
          {statusText ?? t("common.loading")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-page">
      <StatusBar />
      <CompactBanner />
      <main className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden">
          <TreeCanvas />
        </div>
        <ContentPanel />
      </main>
      <QuickSwitcher />
      <NodeTypePopover />
      <NodeSearch />
      <ContextMenu />
      <SettingsPanel />
      {compactState === CompactStates.LOADING && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay">
          <div className="rounded-xl border border-border bg-bg-elevated px-8 py-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
              <span className="font-mono text-sm text-text-primary">{t("compactError.loading")}</span>
            </div>
          </div>
        </div>
      )}
      {compactError && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
          onClick={() => useUIStore.getState().setCompactError(null)}
        >
          <div
            className="max-w-[500px] rounded-xl border border-red-500/30 bg-bg-elevated px-6 py-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 font-heading text-sm text-red-400">{t("compactError.title")}</h3>
            <p className="mb-4 max-h-[200px] overflow-auto whitespace-pre-wrap font-mono text-xs text-text-secondary">
              {compactError}
            </p>
            <button
              className="rounded-lg bg-bg-card px-4 py-2 font-mono text-xs text-text-primary hover:bg-border"
              onClick={() => useUIStore.getState().setCompactError(null)}
            >
              {t("common.button.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
