# Theme System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 preset color themes (Obsidian, Midnight, Paper, Daylight, Slate) switchable from StatusBar popover, persisted in localStorage.

**Architecture:** CSS `data-theme` attribute on `<html>` overrides Tailwind v4 `@theme` CSS custom properties. Theme state lives in `uiStore` with localStorage persistence. ThemeSwitcher is a popover triggered from StatusBar palette icon.

**Tech Stack:** Tailwind CSS v4 custom properties, Zustand, React, localStorage

---

### Task 1: Add theme CSS variable overrides to index.css

**Files:**
- Modify: `src/index.css`

**Step 1: Add theme override blocks after `@theme`**

Each theme overrides the 7 core color variables. Node type colors (T/M/I/F) stay the same across all themes. Add hardcoded border/overlay tokens as new CSS vars for theme-aware components.

```css
@layer base {
  :root {
    --color-border: #3D3D3D;
    --color-overlay: rgba(0,0,0,0.5);
    --color-hover: rgba(255,255,255,0.05);
  }

  [data-theme="midnight"] {
    --color-bg-page: #0F1923;
    --color-bg-card: #162637;
    --color-bg-elevated: #1E3448;
    --color-accent-primary: #4FC3F7;
    --color-text-primary: #E0E8F0;
    --color-text-secondary: #5A7A94;
    --color-border: #1E3448;
    --color-overlay: rgba(0,0,0,0.6);
    --color-hover: rgba(255,255,255,0.05);
  }

  [data-theme="paper"] {
    --color-bg-page: #F5F3EF;
    --color-bg-card: #EAE6DF;
    --color-bg-elevated: #DDD8D0;
    --color-accent-primary: #D4634B;
    --color-text-primary: #2C2520;
    --color-text-secondary: #8A8078;
    --color-border: #D9D4CC;
    --color-overlay: rgba(0,0,0,0.3);
    --color-hover: rgba(0,0,0,0.05);
  }

  [data-theme="daylight"] {
    --color-bg-page: #FFFFFF;
    --color-bg-card: #F5F5F5;
    --color-bg-elevated: #EBEBEB;
    --color-accent-primary: #2563EB;
    --color-text-primary: #1A1A1A;
    --color-text-secondary: #999999;
    --color-border: #E0E0E0;
    --color-overlay: rgba(0,0,0,0.3);
    --color-hover: rgba(0,0,0,0.05);
  }

  [data-theme="slate"] {
    --color-bg-page: #2B3440;
    --color-bg-card: #334155;
    --color-bg-elevated: #3E4C5A;
    --color-accent-primary: #00D4AA;
    --color-text-primary: #D4DCE4;
    --color-text-secondary: #7A8EA0;
    --color-border: #3E4C5A;
    --color-overlay: rgba(0,0,0,0.5);
    --color-hover: rgba(255,255,255,0.05);
  }
}
```

Obsidian is default (no `data-theme` attribute needed), so also add its border/overlay/hover as `:root` defaults.

**Step 2: Verify build**

Run: `pnpm build`

**Step 3: Commit**

```
feat: add 5 theme CSS variable overrides
```

---

### Task 2: Add theme state to uiStore

**Files:**
- Modify: `src/stores/uiStore.ts`
- Modify: `src/lib/constants.ts`

**Step 1: Add theme constants**

In `constants.ts`, add:
```ts
export const Themes = {
  OBSIDIAN: "obsidian",
  MIDNIGHT: "midnight",
  PAPER: "paper",
  DAYLIGHT: "daylight",
  SLATE: "slate",
} as const;

export type ThemeId = (typeof Themes)[keyof typeof Themes];

export const THEME_META: Record<ThemeId, { name: string; accent: string }> = {
  obsidian:  { name: "Obsidian",  accent: "#FF6B35" },
  midnight:  { name: "Midnight",  accent: "#4FC3F7" },
  paper:     { name: "Paper",     accent: "#D4634B" },
  daylight:  { name: "Daylight",  accent: "#2563EB" },
  slate:     { name: "Slate",     accent: "#00D4AA" },
};
```

**Step 2: Add theme state to uiStore**

```ts
// In interface
currentTheme: ThemeId;
setTheme: (theme: ThemeId) => void;

// In create
currentTheme: (localStorage.getItem("mindflow-theme") as ThemeId) || Themes.OBSIDIAN,
setTheme: (theme) => {
  localStorage.setItem("mindflow-theme", theme);
  document.documentElement.setAttribute("data-theme", theme === Themes.OBSIDIAN ? "" : theme);
  set({ currentTheme: theme });
},
```

**Step 3: Commit**

```
feat: add theme state to uiStore with localStorage persistence
```

---

### Task 3: Apply theme on app startup

**Files:**
- Modify: `src/App.tsx`

**Step 1: Apply `data-theme` on mount**

In `App`, add a one-time effect that reads `uiStore.currentTheme` and sets the `data-theme` attribute:

```ts
const { currentTheme } = useUIStore.getState();
if (currentTheme && currentTheme !== "obsidian") {
  document.documentElement.setAttribute("data-theme", currentTheme);
}
```

Put this at the top of the existing `useEffect` (before `loadContexts`).

**Step 2: Commit**

```
feat: apply saved theme on app startup
```

---

### Task 4: Create ThemeSwitcher popover component

**Files:**
- Create: `src/components/ThemeSwitcher.tsx`

**Step 1: Build component**

Small popover with 5 colored dots + names. Uses `uiStore.themeSwitcherOpen` for open/close toggle (add to uiStore: `themeSwitcherOpen: boolean`, `toggleThemeSwitcher: () => void`, `closeThemeSwitcher: () => void`).

Key structure:
- Fixed overlay to close on click outside
- Positioned top-right below StatusBar
- Row of 5 circles (28x28, accent color fill, selected has white ring)
- Row of 5 names below

**Step 2: Commit**

```
feat: ThemeSwitcher popover component
```

---

### Task 5: Add palette icon to StatusBar

**Files:**
- Modify: `src/components/StatusBar.tsx`
- Modify: `src/App.tsx`

**Step 1: Add palette button to StatusBar**

In the right side div, before the ⌘K button, add a palette icon button that calls `toggleThemeSwitcher`.

Use an inline SVG or text character (🎨 or ◐) since we don't have lucide-react. Simplest: use the text `◐` or a small inline SVG for palette.

**Step 2: Render ThemeSwitcher in App.tsx**

Add `<ThemeSwitcher />` alongside other modals.

**Step 3: Commit**

```
feat: add palette icon to StatusBar and wire ThemeSwitcher
```

---

### Task 6: Replace hardcoded colors with CSS variables

**Files:**
- Modify: `src/components/ContextMenu.tsx` — `#3D3D3D` → `var(--color-border)`
- Modify: `src/components/NodeTypePopover.tsx` — `#3D3D3D` → `var(--color-border)`
- Modify: `src/components/QuickSwitcher.tsx` — `#444444` → `var(--color-border)`, `black/50` → review
- Modify: `src/components/NodeCard.tsx` — any hardcoded colors
- Modify: `src/components/ContentPanel.tsx` — any hardcoded colors
- Modify: `src/components/MarkdownEditor.tsx` — any hardcoded colors

Replace all hardcoded `#3D3D3D`, `#444444`, `white/5`, `white/10`, `black/50` with the new CSS var tokens so themes affect all UI.

**Step 1: Batch replace**
**Step 2: Verify build**
**Step 3: Visual test each theme**
**Step 4: Commit**

```
feat: replace hardcoded colors with theme-aware CSS variables
```
