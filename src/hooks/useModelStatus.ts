import { useEffect, useState } from "react";
import type { ModelStatus } from "../lib/types";
import { ipc } from "../lib/ipc";
import { SettingKeys } from "../lib/constants";

const DEFAULT_STATUS: ModelStatus = { status: "not_ready", progress: 0, queue_done: 0, queue_total: 0 };

/**
 * Shared hook for model status polling.
 * Only polls when semantic search is enabled and model is not yet settled (ready/error).
 */
export function useModelStatus() {
  const [status, setStatus] = useState<ModelStatus>(DEFAULT_STATUS);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  // Check if semantic search is enabled
  useEffect(() => {
    ipc.getSetting(SettingKeys.SEMANTIC_SEARCH_ENABLED).then((val) => {
      setEnabled(val === "true");
    });
  }, []);

  const settled = status.status === "ready" || status.status === "error"
    || (status.status === "not_ready" && enabled === false);

  useEffect(() => {
    if (settled || enabled === null) return;
    let cancelled = false;
    const poll = () => {
      ipc.getModelStatus().then((s) => { if (!cancelled) setStatus(s); }).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [settled, enabled]);

  /** Call after enabling semantic search to start polling */
  const markEnabled = () => setEnabled(true);

  return { status, enabled, settled, markEnabled };
}
