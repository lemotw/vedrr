import { useState } from "react";
import { useUIStore } from "../stores/uiStore";
import { Themes, THEME_META, CUSTOM_COLOR_LABELS } from "../lib/constants";
import type { ThemeId, CustomThemeColors } from "../lib/constants";
import { cn } from "../lib/cn";

const PRESET_ORDER: ThemeId[] = [
  Themes.OBSIDIAN,
  Themes.MIDNIGHT,
  Themes.FOREST,
  Themes.AMETHYST,
  Themes.MOCHA,
  Themes.SLATE,
  Themes.PAPER,
  Themes.DAYLIGHT,
];

const COLOR_KEYS = Object.keys(CUSTOM_COLOR_LABELS) as (keyof CustomThemeColors)[];

export function ThemeSwitcher() {
  const { themeSwitcherOpen, closeThemeSwitcher, currentTheme, setTheme, customThemeColors, setCustomColor } = useUIStore();
  const [showEditor, setShowEditor] = useState(false);

  if (!themeSwitcherOpen) return null;

  const isCustom = currentTheme === Themes.CUSTOM;

  return (
    <div className="fixed inset-0 z-50" onClick={closeThemeSwitcher}>
      <div
        className="absolute right-4 top-12 bg-bg-elevated rounded-xl p-4"
        style={{
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          border: "1px solid var(--color-border)",
          minWidth: 280,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preset dots */}
        <div className="flex items-center justify-center gap-2.5 mb-2">
          {PRESET_ORDER.map((id) => {
            const meta = THEME_META[id];
            const isActive = id === currentTheme;
            return (
              <button
                key={id}
                className="w-6 h-6 rounded-full cursor-pointer transition-all shrink-0"
                style={{
                  backgroundColor: meta.accent,
                  boxShadow: isActive ? `0 0 0 2px var(--color-bg-elevated), 0 0 0 3px ${meta.accent}` : "none",
                }}
                onClick={() => { setTheme(id); setShowEditor(false); }}
                title={meta.name}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-2.5 mb-3">
          {PRESET_ORDER.map((id) => {
            const meta = THEME_META[id];
            const isActive = id === currentTheme;
            return (
              <span
                key={id}
                className={`text-[9px] font-mono w-6 text-center cursor-pointer ${isActive ? "text-text-primary" : "text-text-secondary"}`}
                onClick={() => { setTheme(id); setShowEditor(false); }}
              >
                {meta.name.slice(0, 3)}
              </span>
            );
          })}
        </div>

        {/* Custom theme button */}
        <div className="border-t border-border pt-3">
          <button
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-[12px] font-mono",
              isCustom
                ? "bg-accent-primary/15 text-accent-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-[var(--color-hover)]",
            )}
            onClick={() => {
              if (!isCustom) setTheme(Themes.CUSTOM);
              setShowEditor(!showEditor);
            }}
          >
            <span
              className="w-4 h-4 rounded-full shrink-0"
              style={{
                background: isCustom
                  ? customThemeColors.accentPrimary
                  : "conic-gradient(#FF6B35, #4FC3F7, #4ADE80, #A78BFA, #F0A050, #FF6B35)",
              }}
            />
            Custom
            <span className="ml-auto text-[10px]">{showEditor ? "▾" : "▸"}</span>
          </button>

          {/* Color editor */}
          {showEditor && (
            <div className="mt-2 flex flex-col gap-1.5">
              {COLOR_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 px-2">
                  <input
                    type="color"
                    value={customThemeColors[key]}
                    onChange={(e) => setCustomColor(key, e.target.value)}
                    className="w-5 h-5 rounded border-none cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none"
                  />
                  <span className="text-[11px] font-mono text-text-secondary flex-1">
                    {CUSTOM_COLOR_LABELS[key]}
                  </span>
                  <span className="text-[10px] font-mono text-text-secondary opacity-60">
                    {customThemeColors[key]}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
