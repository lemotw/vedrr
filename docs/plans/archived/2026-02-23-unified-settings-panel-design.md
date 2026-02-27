# Unified Settings Panel — Design

> Date: 2026-02-23

## Summary

Replace the separate AISettings modal and ThemeSwitcher dropdown with a single unified Settings panel. Add a General tab with language selector (placeholder for future i18n).

## UI Structure

- **Trigger**: `Settings` button in StatusBar right side, replacing current `AI` + `◐` buttons
- **Layout**: Centered modal, 600px wide, max 80vh tall
- **Left sidebar**: ~120px vertical tab list (General / AI / Theme)
- **Right content**: Scrollable content area for selected tab
- **Close**: Escape key or click overlay

```
┌──────────────────────────────────────────┐
│  Settings                            [x] │
├──────────┬───────────────────────────────┤
│ General  │  Language                     │
│ AI       │  ┌─────────────────────────┐  │
│ Theme    │  │ 繁體中文            ▾   │  │
│          │  └─────────────────────────┘  │
│          │                               │
│          │                               │
├──────────┴───────────────────────────────┤
│  MindFlow v0.1.0                         │
└──────────────────────────────────────────┘
```

## Tab: General

- **Language dropdown**: `繁體中文` / `English`
- System detection via `navigator.language` on first launch
- Stored in `localStorage("mindflow-locale")`
- No i18n wiring yet — just saves preference for future use

## Tab: AI

- Existing AISettings sections moved here verbatim:
  - API Keys (collapsible)
  - Profiles (collapsible)
  - System Prompt (collapsible, default closed)

## Tab: Theme

- Existing ThemeSwitcher content moved here:
  - Preset color dots + labels
  - Custom theme button + color editor

## File Changes

| File | Action |
|------|--------|
| `src/components/SettingsPanel.tsx` | **New** — main panel with tab routing |
| `src/components/AISettings.tsx` | **Modify** — export Section components, remove modal wrapper |
| `src/components/ThemeSwitcher.tsx` | **Modify** — export ThemeSection, remove dropdown wrapper |
| `src/components/StatusBar.tsx` | **Modify** — replace AI + ◐ buttons with single Settings button |
| `src/stores/uiStore.ts` | **Modify** — add `settingsOpen` / `openSettings` / `closeSettings`, remove `aiSettingsOpen` + `themeSwitcherOpen` |
| `src/App.tsx` | **Modify** — replace `<AISettings />` + `<ThemeSwitcher />` with `<SettingsPanel />` |

## State Changes (uiStore)

Remove:
- `aiSettingsOpen`, `openAiSettings`, `closeAiSettings`
- `themeSwitcherOpen`, `toggleThemeSwitcher`, `closeThemeSwitcher`

Add:
- `settingsOpen: boolean`
- `openSettings: () => void`
- `closeSettings: () => void`

## Design Tokens

- Modal bg: `bg-bg-elevated`
- Tab bar bg: `bg-bg-card`
- Active tab: `text-accent-primary` + left border accent
- Inactive tab: `text-text-secondary`
- Content area: scrollable, padding consistent with existing sections
- Fonts: `font-mono` for body, `font-heading` for title
