# Unified Settings Panel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace separate AISettings modal + ThemeSwitcher dropdown with a single Settings panel (left-tab layout), adding a General tab with language selector placeholder.

**Architecture:** A new `SettingsPanel.tsx` renders a modal with 3 vertical tabs (General / AI / Theme). Existing `AISettings.tsx` and `ThemeSwitcher.tsx` are refactored to export their inner content as embeddable sections. `uiStore` replaces `aiSettingsOpen` + `themeSwitcherOpen` with a single `settingsOpen` flag. StatusBar replaces `AI` + `◐` buttons with one `Settings` button.

**Tech Stack:** React 19, TypeScript, Zustand 5, Tailwind CSS v4

**Design doc:** `docs/plans/2026-02-23-unified-settings-panel-design.md`

---

### Task 1: uiStore — Replace settings state

**Files:**
- Modify: `src/stores/uiStore.ts`

**Step 1: Remove old state and add new**

In the `UIStore` interface, remove these properties and methods:
```ts
// REMOVE these:
aiSettingsOpen: boolean;
themeSwitcherOpen: boolean;
openAiSettings: () => void;
closeAiSettings: () => void;
toggleThemeSwitcher: () => void;
closeThemeSwitcher: () => void;
```

Add these:
```ts
// ADD these:
settingsOpen: boolean;
openSettings: () => void;
closeSettings: () => void;
```

In the `create<UIStore>` body, remove the old initializers/actions:
```ts
// REMOVE:
aiSettingsOpen: false,
themeSwitcherOpen: false,
openAiSettings: () => set({ aiSettingsOpen: true }),
closeAiSettings: () => set({ aiSettingsOpen: false }),
toggleThemeSwitcher: () => set((s) => ({ themeSwitcherOpen: !s.themeSwitcherOpen })),
closeThemeSwitcher: () => set({ themeSwitcherOpen: false }),
```

Add:
```ts
// ADD:
settingsOpen: false,
openSettings: () => set({ settingsOpen: true }),
closeSettings: () => set({ settingsOpen: false }),
```

**Step 2: Verify build**

Run: `pnpm build` from project root.
Expected: TypeScript errors in `StatusBar.tsx`, `AISettings.tsx`, `ThemeSwitcher.tsx`, `App.tsx` referencing removed properties. This is expected — we fix them in subsequent tasks.

**Step 3: Commit**

```
feat(store): replace aiSettingsOpen + themeSwitcherOpen with settingsOpen
```

---

### Task 2: Refactor AISettings — Export sections, remove modal wrapper

**Files:**
- Modify: `src/components/AISettings.tsx`

**Step 1: Export section components**

The file currently has these internal components:
- `ApiKeysSection` (line ~19)
- `ProfilesSection` (line ~168)
- `SystemPromptSection` (line ~398)
- `Section` (generic collapsible wrapper, line ~476)

Add `export` to each:
```ts
export function ApiKeysSection({ onKeysChange }: { onKeysChange?: () => void }) { ... }
export function ProfilesSection({ apiKeys }: { apiKeys: ApiKey[] }) { ... }
export function SystemPromptSection() { ... }
export function Section({ title, defaultOpen = true, children }: { ... }) { ... }
```

Also export the `PROVIDERS` array and `providerDisplayName` function (used by ProfilesSection):
```ts
export const PROVIDERS = [ ... ];
export function providerDisplayName(providerId: string): string { ... }
```

**Step 2: Remove the `AISettings` main component**

Delete the entire `export function AISettings()` component (lines ~511-582). It will be replaced by `SettingsPanel`.

Remove the import of `useUIStore` (if no longer needed after removing AISettings). Keep all other imports (`useState`, `useEffect`, `useRef`, `useCallback`, `ipc`, `cn`, types).

**Step 3: Verify build**

Run: `pnpm build`
Expected: Error in `App.tsx` importing `AISettings`. Expected — fixed in Task 5.

**Step 4: Commit**

```
refactor(ai-settings): export sections, remove modal wrapper
```

---

### Task 3: Refactor ThemeSwitcher — Export theme section, remove dropdown wrapper

**Files:**
- Modify: `src/components/ThemeSwitcher.tsx`

**Step 1: Extract ThemeSection as exported component**

Create a new exported component `ThemeSection` that contains the theme content (preset dots + custom editor) without the overlay/dropdown wrapper:

```tsx
export function ThemeSection() {
  const { currentTheme, setTheme, customThemeColors, setCustomColor } = useUIStore();
  const [showEditor, setShowEditor] = useState(false);

  const isCustom = currentTheme === Themes.CUSTOM;

  return (
    <div>
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
  );
}
```

**Step 2: Remove the old `ThemeSwitcher` component**

Delete the `export function ThemeSwitcher()` component entirely — the dropdown wrapper with overlay is no longer needed.

Keep all imports and constants (`PRESET_ORDER`, `COLOR_KEYS`) at file top.

**Step 3: Verify build**

Run: `pnpm build`
Expected: Error in `App.tsx` importing `ThemeSwitcher`. Expected — fixed in Task 5.

**Step 4: Commit**

```
refactor(theme): export ThemeSection, remove dropdown wrapper
```

---

### Task 4: Create SettingsPanel

**Files:**
- Create: `src/components/SettingsPanel.tsx`

**Step 1: Create the component**

```tsx
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
  const sys = navigator.language; // e.g. "zh-TW", "en-US"
  if (sys.startsWith("zh")) return "zh-TW";
  return "en";
}

// ── Tab: General ──────────────────────────────────────────

function GeneralTab() {
  const [locale, setLocale] = useState(detectLocale);

  const handleChange = (value: string) => {
    setLocale(value);
    localStorage.setItem("mindflow-locale", value);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1.5 block font-mono text-[11px] font-medium text-text-secondary">
          Language
        </label>
        <select
          value={locale}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full max-w-[240px] appearance-none rounded border border-border bg-bg-card px-2.5 py-1.5 font-mono text-xs text-text-primary"
        >
          {LOCALES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <p className="mt-1 font-mono text-[10px] text-text-secondary">
          i18n coming soon — saves preference for future use.
        </p>
      </div>
    </div>
  );
}

// ── Tab: AI ───────────────────────────────────────────────

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
    <div className="flex flex-col">
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

// ── Main Settings Panel ───────────────────────────────────

export function SettingsPanel() {
  const { settingsOpen, closeSettings } = useUIStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<SettingsTab>("general");

  useEffect(() => {
    if (settingsOpen) {
      requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [settingsOpen]);

  if (!settingsOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeSettings();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={closeSettings}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="flex max-h-[80vh] w-[600px] flex-col rounded-xl border border-border bg-bg-elevated shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading text-lg text-text-primary">Settings</h2>
        </div>

        {/* Body: tabs + content */}
        <div className="flex min-h-0 flex-1">
          {/* Left tab bar */}
          <nav className="flex w-[120px] shrink-0 flex-col border-r border-border bg-bg-card py-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={cn(
                  "px-4 py-2 text-left font-mono text-xs transition-colors",
                  tab === t.id
                    ? "border-l-2 border-accent-primary bg-bg-elevated text-accent-primary"
                    : "border-l-2 border-transparent text-text-secondary hover:text-text-primary",
                )}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {/* Right content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {tab === "general" && <GeneralTab />}
            {tab === "ai" && <AITab />}
            {tab === "theme" && <ThemeSection />}
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
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: Errors in `App.tsx` and `StatusBar.tsx` still referencing old imports. Fixed in Task 5.

**Step 3: Commit**

```
feat: create unified SettingsPanel with General/AI/Theme tabs
```

---

### Task 5: Update StatusBar + App.tsx — Wire everything together

**Files:**
- Modify: `src/components/StatusBar.tsx`
- Modify: `src/App.tsx`

**Step 1: Update StatusBar**

Replace `openAiSettings` and `toggleThemeSwitcher` usage with `openSettings`:

```tsx
// Before:
const { openQuickSwitcher, toggleThemeSwitcher, openAiSettings } = useUIStore();

// After:
const { openQuickSwitcher, openSettings } = useUIStore();
```

Replace the two buttons (`AI` + `◐`) with a single Settings button:

```tsx
// Remove both AI and ◐ buttons. Replace with:
<button
  onClick={() => {
    if (locked) { useUIStore.getState().flashCompactBanner(); return; }
    openSettings();
  }}
  disabled={locked}
  className={`px-2 py-1 text-xs rounded transition-colors ${locked ? "text-text-secondary/40 bg-bg-elevated/50 cursor-not-allowed" : "text-text-secondary bg-bg-elevated cursor-pointer hover:text-text-primary"}`}
  title="Settings"
>
  Settings
</button>
```

Keep the `⌘K` button unchanged.

**Step 2: Update App.tsx**

Replace imports:
```tsx
// Remove:
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { AISettings } from "./components/AISettings";

// Add:
import { SettingsPanel } from "./components/SettingsPanel";
```

In JSX, replace:
```tsx
// Remove:
<ThemeSwitcher />
<AISettings />

// Add:
<SettingsPanel />
```

**Step 3: Verify build**

Run: `pnpm build`
Expected: Clean build, no errors.

**Step 4: Verify dev**

Run: `pnpm tauri dev`
Manual checks:
1. StatusBar shows `Settings` button (no more `AI` + `◐`)
2. Click Settings → modal opens with General / AI / Theme tabs
3. General tab → language dropdown works, saves to localStorage
4. AI tab → API Keys / Profiles / System Prompt sections work as before
5. Theme tab → preset dots + custom editor work as before
6. Escape closes the modal
7. Click overlay closes the modal

**Step 5: Commit**

```
feat: wire SettingsPanel into StatusBar + App, remove old AI/Theme modals
```

---

### Task 6: Cleanup — Remove dead code

**Files:**
- Modify: `src/hooks/useKeyboard.ts` (if it references `openAiSettings` or `toggleThemeSwitcher`)
- Verify: no other files reference removed uiStore properties

**Step 1: Search for stale references**

Search entire `src/` for:
- `aiSettingsOpen`
- `openAiSettings`
- `closeAiSettings`
- `themeSwitcherOpen`
- `toggleThemeSwitcher`
- `closeThemeSwitcher`

Fix any remaining references.

**Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

Run: `pnpm lint`
Expected: No new lint errors.

**Step 3: Commit**

```
chore: remove stale aiSettingsOpen/themeSwitcherOpen references
```
