import { useState, useEffect, useRef, useCallback } from "react";
import { useUIStore } from "../stores/uiStore";
import { ipc } from "../lib/ipc";
import { cn } from "../lib/cn";
import type { ApiKey } from "../lib/types";
import { ApiKeysSection, ProfilesSection, SystemPromptSection, Section } from "./AISettings";
import { ThemeSection } from "./ThemeSwitcher";

type SettingsTab = "general" | "ai" | "theme";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "ai", label: "AI" },
  { id: "theme", label: "Theme" },
];

const LOCALES = [
  { id: "zh-TW", label: "繁體中文" },
  { id: "en", label: "English" },
];

function detectLocale(): string {
  const saved = localStorage.getItem("mindflow-locale");
  if (saved) return saved;
  return navigator.language.startsWith("zh") ? "zh-TW" : "en";
}

// ── General Tab ──────────────────────────────────────────

function GeneralTab() {
  const [locale, setLocale] = useState(detectLocale);

  const handleChange = (value: string) => {
    setLocale(value);
    localStorage.setItem("mindflow-locale", value);
  };

  return (
    <div className="px-6 py-4">
      <label className="flex items-center gap-3">
        <span className="font-mono text-xs text-text-primary">Language</span>
        <select
          value={locale}
          onChange={(e) => handleChange(e.target.value)}
          className="appearance-none rounded border border-border bg-bg-card px-2.5 py-1.5 font-mono text-xs text-text-primary"
        >
          {LOCALES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 font-mono text-[10px] text-text-secondary">
        i18n coming soon
      </p>
    </div>
  );
}

// ── AI Tab ───────────────────────────────────────────────

function AITab() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);

  const loadApiKeys = useCallback(async () => {
    try {
      const list = await ipc.listApiKeys();
      setApiKeys(list);
    } catch (e) {
      console.error("[settings] load api keys failed:", e);
    }
  }, []);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  return (
    <div>
      <Section title="API Keys">
        <ApiKeysSection onKeysChange={loadApiKeys} />
      </Section>

      <Section title="Profiles">
        <ProfilesSection apiKeys={apiKeys} />
      </Section>

      <Section title="System Prompt (Dev)" defaultOpen={false}>
        <SystemPromptSection />
      </Section>
    </div>
  );
}

// ── Settings Panel ───────────────────────────────────────

export function SettingsPanel() {
  const { settingsOpen, closeSettings } = useUIStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (settingsOpen) {
      requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [settingsOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeSettings();
    }
  };

  if (!settingsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={closeSettings}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[80vh] w-[600px] flex-col rounded-xl border border-border bg-bg-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-heading text-lg text-text-primary">Settings</h2>
        </div>

        {/* Body: tab nav + content */}
        <div className="flex min-h-0 flex-1">
          {/* Left tab nav */}
          <div className="flex w-[120px] shrink-0 flex-col border-r border-border bg-bg-card py-2">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  className={cn(
                    "px-4 py-2 text-left font-mono text-xs transition-colors",
                    isActive
                      ? "border-l-2 border-accent-primary bg-bg-elevated text-accent-primary"
                      : "border-l-2 border-transparent text-text-secondary hover:text-text-primary",
                  )}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Right content */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeTab === "general" && <GeneralTab />}
            {activeTab === "ai" && <AITab />}
            {activeTab === "theme" && (
              <div className="px-6 py-4">
                <ThemeSection />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3">
          <p className="font-mono text-[10px] text-text-secondary">
            MindFlow v0.1.0
          </p>
        </div>
      </div>
    </div>
  );
}
