import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../stores/uiStore";
import { ipc } from "../lib/ipc";

export function QuickCapture() {
  const { t } = useTranslation();
  const { quickCaptureOpen, closeQuickCapture } = useUIStore();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (quickCaptureOpen) {
      setValue("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [quickCaptureOpen]);

  if (!quickCaptureOpen) return null;

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await ipc.createInboxItem(trimmed);
      closeQuickCapture();
    } catch (e) {
      console.error("[quick-capture] save failed:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeQuickCapture();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay pt-[20vh]"
      onClick={closeQuickCapture}
    >
      <div
        className="w-[560px] rounded-xl border border-border bg-bg-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("quickCapture.placeholder")}
          className="w-full rounded-xl bg-transparent px-5 py-4 font-mono text-sm text-text-primary placeholder:text-text-secondary outline-none"
          disabled={submitting}
        />
      </div>
    </div>
  );
}
