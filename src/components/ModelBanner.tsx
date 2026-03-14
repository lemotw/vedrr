import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ipc } from "../lib/ipc";
import { SettingKeys } from "../lib/constants";

export function ModelBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    ipc.getSetting(SettingKeys.SEMANTIC_SEARCH_ENABLED).then((val) => {
      if (val === null) setVisible(true);
    });
  }, []);

  if (!visible) return null;

  const handleEnable = async () => {
    await ipc.enableSemanticSearch();
    setVisible(false);
  };

  const handleSkip = async () => {
    await ipc.setSetting(SettingKeys.SEMANTIC_SEARCH_ENABLED, "false");
    setVisible(false);
  };

  return (
    <div className="border-b border-border bg-bg-elevated px-5 py-3 shrink-0">
      <div className="flex items-center gap-3">
        <svg className="w-[14px] h-[14px] shrink-0 text-text-secondary" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs text-text-primary font-bold">
            {t("modelBanner.title")}
          </p>
          <p className="font-mono text-[10px] text-text-secondary mt-0.5">
            {t("modelBanner.description")}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleEnable}
            className="px-3 py-1 rounded font-mono text-[11px] bg-accent-primary text-white hover:brightness-110 transition-all cursor-pointer"
          >
            {t("modelBanner.enable")}
          </button>
          <button
            onClick={handleSkip}
            className="px-3 py-1 rounded font-mono text-[11px] bg-bg-card text-text-secondary hover:text-text-primary border border-border transition-colors cursor-pointer"
          >
            {t("modelBanner.skip")}
          </button>
        </div>
      </div>
    </div>
  );
}
