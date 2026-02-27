import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import {
  SearchDefaults,
  loadSearchSettings,
  saveSearchSettings,
  type SearchMode,
  type SearchSettings,
} from "../lib/constants";

function SliderRow({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  desc,
  hintLeft,
  hintRight,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  desc?: string;
  hintLeft?: string;
  hintRight?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-text-primary">{label}</span>
        <span className="font-mono text-xs text-accent-primary tabular-nums">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent-primary h-1.5 cursor-pointer"
      />
      {(hintLeft || hintRight) && (
        <div className="flex justify-between">
          <span className="font-mono text-[10px] text-text-secondary">{hintLeft}</span>
          <span className="font-mono text-[10px] text-text-secondary">{hintRight}</span>
        </div>
      )}
      {desc && (
        <p className="font-mono text-[10px] text-text-secondary">{desc}</p>
      )}
    </div>
  );
}

export function SearchSettingsTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SearchSettings>(loadSearchSettings);

  const update = useCallback((patch: Partial<SearchSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSearchSettings(next);
      return next;
    });
  }, []);

  const handleReset = () => {
    const defaults: SearchSettings = {
      mode: SearchDefaults.MODE,
      alpha: SearchDefaults.ALPHA,
      minScore: SearchDefaults.MIN_SCORE,
      displayThreshold: SearchDefaults.DISPLAY_THRESHOLD,
    };
    setSettings(defaults);
    saveSearchSettings(defaults);
  };

  return (
    <div className="px-6 py-4 space-y-6">
      {/* Search Mode Toggle */}
      <div className="space-y-2">
        <span className="font-mono text-xs text-text-secondary uppercase tracking-wider">
          {t("settings.searchSettings.modeTitle")}
        </span>
        <div className="flex rounded-lg overflow-hidden border border-border">
          {(["text", "semantic"] as SearchMode[]).map((mode) => (
            <button
              key={mode}
              className={cn(
                "flex-1 py-2 font-mono text-xs transition-colors",
                settings.mode === mode
                  ? "bg-accent-primary/15 text-accent-primary"
                  : "bg-bg-card text-text-secondary hover:text-text-primary",
              )}
              onClick={() => update({ mode })}
            >
              {mode === "text"
                ? t("settings.searchSettings.modeText")
                : t("settings.searchSettings.modeSemantic")}
            </button>
          ))}
        </div>
        <p className="font-mono text-[10px] text-text-secondary">
          {settings.mode === "text"
            ? t("settings.searchSettings.modeDescText")
            : t("settings.searchSettings.modeDescSemantic")}
        </p>
      </div>

      {/* Semantic Settings (only shown when semantic mode) */}
      {settings.mode === "semantic" && (
        <>
          <div className="space-y-2">
            <span className="font-mono text-xs text-text-secondary uppercase tracking-wider">
              {t("settings.searchSettings.semanticTitle")}
            </span>

            {/* Formula */}
            <div className="rounded-lg border border-border bg-bg-card px-3 py-2.5 space-y-0.5">
              <p className="font-mono text-[11px] text-accent-primary">
                {t("settings.searchSettings.formulaLine1")}
              </p>
              <p className="font-mono text-[10px] text-text-secondary">
                {t("settings.searchSettings.formulaLine2")}
              </p>
              <p className="font-mono text-[10px] text-text-secondary">
                {t("settings.searchSettings.formulaLine3")}
              </p>
            </div>
          </div>

          {/* Alpha slider */}
          <SliderRow
            label={t("settings.searchSettings.alphaLabel")}
            value={settings.alpha}
            onChange={(v) => update({ alpha: v })}
            hintLeft={t("settings.searchSettings.alphaHintLeft")}
            hintRight={t("settings.searchSettings.alphaHintRight")}
          />

          {/* Min Score slider */}
          <SliderRow
            label={t("settings.searchSettings.minScoreLabel")}
            value={settings.minScore}
            onChange={(v) => update({ minScore: v })}
            desc={t("settings.searchSettings.minScoreDesc")}
          />

          {/* Display Threshold slider */}
          <SliderRow
            label={t("settings.searchSettings.displayLabel")}
            value={settings.displayThreshold}
            onChange={(v) => update({ displayThreshold: v })}
            desc={t("settings.searchSettings.displayDesc")}
          />
        </>
      )}

      {/* Reset */}
      <button
        className="rounded border border-border bg-bg-card px-3 py-1.5 font-mono text-xs text-text-secondary hover:text-text-primary transition-colors"
        onClick={handleReset}
      >
        {t("settings.searchSettings.reset")}
      </button>
    </div>
  );
}
