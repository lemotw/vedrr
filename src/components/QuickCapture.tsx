import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ipc } from "../lib/ipc";
import { Themes } from "../lib/constants";

const DRAFT_KEY = "vedrr-qc-draft";
const DRAFT_SAVE_DELAY = 300;

export function QuickCapture() {
  const { t } = useTranslation();
  const [value, setValue] = useState(() => localStorage.getItem(DRAFT_KEY) || "");
  const [submitting, setSubmitting] = useState(false);
  const [enterPrimed, setEnterPrimed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const primeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appWindow = useRef(getCurrentWindow());

  // Debounced localStorage write for draft persistence
  const saveDraft = useCallback((text: string) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      if (text) localStorage.setItem(DRAFT_KEY, text);
      else localStorage.removeItem(DRAFT_KEY);
    }, DRAFT_SAVE_DELAY);
  }, []);

  // Apply theme (transparent backgrounds are handled by CSS via html.quickcapture)
  useEffect(() => {
    const theme = localStorage.getItem("vedrr-theme") || Themes.MOCHA;
    document.documentElement.setAttribute("data-theme", theme === Themes.OBSIDIAN ? "" : theme);
  }, []);

  // Focus on show, hide on blur (click-outside)
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    appWindow.current.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        setEnterPrimed(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        appWindow.current.hide();
      }
    }).then((fn) => { unlisten = fn; });
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => { unlisten?.(); };
  }, []);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (primeTimer.current) clearTimeout(primeTimer.current);
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  const handleClose = () => {
    // Flush any pending debounced draft save
    if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null; }
    if (value) localStorage.setItem(DRAFT_KEY, value);
    appWindow.current.hide();
  };

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await ipc.createInboxItem(trimmed);
      setValue("");
      if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null; }
      localStorage.removeItem(DRAFT_KEY);
      handleClose();
    } catch (e) {
      console.error("[quick-capture] save failed:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (enterPrimed) {
        handleSubmit();
      } else {
        setEnterPrimed(true);
        if (primeTimer.current) clearTimeout(primeTimer.current);
        primeTimer.current = setTimeout(() => setEnterPrimed(false), 800);
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  };

  const canSubmit = value.trim().length > 0 && !submitting;

  return (
    <div className="flex h-full items-center px-2" data-tauri-drag-region>
      <div className="flex w-full flex-col rounded-2xl bg-bg-elevated shadow-lg">
        <div className="flex items-center px-4">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); saveDraft(e.target.value); if (enterPrimed) setEnterPrimed(false); }}
            onKeyDown={handleKeyDown}
            placeholder={t("quickCapture.placeholder")}
            className="flex-1 bg-transparent py-3 font-mono text-sm text-text-primary placeholder:text-text-secondary outline-none"
            disabled={submitting}
          />
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-primary text-white transition-opacity disabled:opacity-30"
            title={enterPrimed ? t("quickCapture.enterAgain") : t("quickCapture.submit")}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        {enterPrimed && (
          <div className="px-4 pb-2 font-mono text-[11px] text-text-secondary/70">
            {t("quickCapture.enterAgain")}
          </div>
        )}
      </div>
    </div>
  );
}
