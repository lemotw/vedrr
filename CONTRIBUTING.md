# Contributing to vedrr

Thanks for your interest in contributing! Whether it's a bug fix, new feature, translation, or documentation improvement — all contributions are welcome.

## Before You Start

- **Check existing issues** to avoid duplicate work.
- **Open an issue first** for anything non-trivial (new features, refactors, architecture changes). This ensures your time is well spent and the change aligns with the project direction.
- Small fixes (typos, minor bugs) can go straight to a PR.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/)
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

### Getting Started

```bash
git clone https://github.com/lemotw/vedrr.git
cd vedrr
pnpm install
pnpm tauri dev    # dev mode with hot reload
```

### Useful Commands

```bash
pnpm tauri dev     # run app in dev mode
pnpm tauri build   # production build
pnpm build         # frontend only
pnpm lint          # eslint
```

## Project Architecture

```
React (TypeScript) → Zustand Store → IPC (invoke) → Rust Commands → SQLite
```

- **Frontend:** `src/` — React 19, Zustand 5, Tailwind CSS v4
- **Backend:** `src-tauri/src/` — Rust, rusqlite
- **IPC:** Frontend calls `invoke("command_name", { params })`. Params auto-convert from camelCase (JS) to snake_case (Rust).
- **Database:** Local SQLite at `~/vedrr/data/vedrr.db`, WAL mode.
- **i18n:** JSON files in `src/i18n/` (currently `en.json` and `zh-TW.json`).

## Submitting Changes

### Branch Naming

```
feat/short-description
fix/short-description
docs/short-description
```

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add node drag handle
fix: prevent crash on empty context
docs: update keyboard shortcuts table
style: adjust card border radius
refactor: extract tree layout logic
i18n: add Japanese translation
```

### Pull Request Process

1. Fork the repo and create your branch from `master`.
2. Make your changes with clear, focused commits.
3. Run `pnpm lint` and make sure there are no errors.
4. Open a PR with a clear title and description of what changed and why.
5. PRs are typically reviewed within **1-2 weeks**.

## Translation

vedrr uses flat JSON files for i18n (`src/i18n/`). To add a new language:

1. Copy `src/i18n/en.json` to `src/i18n/{locale}.json` (e.g. `ja.json`).
2. Translate all values (keep the keys unchanged).
3. Register the new locale in `src/i18n/index.ts`.
4. Open a PR with the title `i18n: add {language} translation`.

## Other Ways to Contribute

- **Report bugs** — Use the Bug Report issue template.
- **Suggest features** — Use the Feature Request issue template.
- **Improve docs** — README, inline comments, this file.
- **Share vedrr** — Star the repo, write about it, tell a friend.

## License

By contributing, you agree that your contributions will be licensed under [GPL-3.0](LICENSE).
