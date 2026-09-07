# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IdeaScape is a single-user Windows 11 desktop application. The user places cards on a canvas and
joins them with lines to build a concept. No accounts, no sharing, no cloud, no server.

Core flow: **User input (card / paste / drop) → Svelte front end → Tauri command → Rust (db, assets, fetch) → SQLite project folder → canvas redraw.**

`docs/architecture.html` is the technical authority. `docs/mvp-plan.html` owns scope,
`docs/prd.html` owns requirements, `docs/design-system.html` owns everything visual —
every colour, size, spacing, screen layout and on-screen state. Never re-decide a visual detail here.

## Stack (Not The House Default)

**This project is Tauri 2 + Rust + Svelte 5. It is not C# / .NET.** The departure is deliberate and
settled in `docs/architecture.html` (`runtime-shell`, expensive to undo): a self-contained .NET
installer is 60–80 MB and the plan caps the installer at 20 MB. Tauri reuses the WebView2 engine
already on Windows 11 and ships at about 5 MB.

- Shell: Tauri 2, Rust backend, WebView2 renderer
- Front end: Svelte 5 with runes, TypeScript, Vite
- Storage: SQLite via `rusqlite` (`bundled` feature) + `rusqlite_migration`

## Repository Location & Layout

The repo lives at `C:\Repos\IdeaScape`. It currently holds `docs/` only — application code is
not written yet, so the tree below is the agreed plan from `docs/architecture.html` §5.

```
IdeaScape/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          app start, command registration
│   │   ├── db/              connection, migrations, schema
│   │   ├── commands/        one file per area: project, canvas, item,
│   │   │                    placement, connection, search
│   │   ├── assets/          file copy, content hash, missing-file check
│   │   ├── fetch/           link preview and video metadata
│   │   └── error.rs         one error type returned to the front end
│   └── migrations/          numbered .sql files
├── src/
│   ├── features/            canvas, cards, connections, selection, undo,
│   │                        projects, canvases, search
│   ├── stores/canvasStore.svelte.ts   the one shared canvas state
│   ├── lib/                 ipc wrapper, markdown render, shared types
│   └── app.svelte
└── docs/
```

## Build & Test

```bash
npm run tauri dev          # run the app
npm run tauri build        # NSIS installer, Windows 11 x64
npm run build              # front-end build only (Vite)
npm test                   # Vitest - front-end unit tests
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml
npx prettier --write .
```

Vite dev server: `http://localhost:1420` (Tauri's default). Do not open it directly — Tauri
commands do not exist outside the shell.

### Migrations

Migrations are numbered `.sql` files in `src-tauri/migrations/`, applied by `rusqlite_migration`.
Add a migration by adding the next numbered file; never edit a migration that has shipped.
The database version is checked when a project opens, and migrations run then — not at app start,
because there is one database per project folder, not one per install.

## Architecture

Vertical slice in the front end, modules by kind in Rust. **This is a partial departure from the
house default** (`architecture-pattern`, settled): the Rust side is small — database work and file
work only — so feature folders there would be near-empty.

- `src/features/{name}/` — components, feature state and types together
- `src/stores/canvasStore.svelte.ts` — the one shared canvas state, named up front. Cards,
  connections, selection, pan and zoom all read and write it. Do not hide it inside a feature.
- `src/lib/` — the IPC wrapper, markdown render, shared types
- `src-tauri/src/commands/` — one file per area; the only Rust the front end can reach

### Import Direction Rule

- A feature may import from `stores/` and `lib/`.
- A feature may **not** import from another feature. Shared code moves to `lib/`.
- `stores/` and `lib/` may not import from any feature.
- Rust: `commands/` may use `db/`, `assets/` and `fetch/`. Those three never call `commands/`.

### Key Patterns

- **Culling.** Cards are real page elements. The canvas moves and scales with one CSS transform.
  A card outside the view window is removed from the page. The 60 fps / 250 card gate in P1 is
  hard — measure it, do not assume it.
- **Tauri command seam.** The front end never builds SQL and never makes a network call. It calls
  named commands (`create_placement`, …) through one wrapper in `src/lib/`. That wrapper is the
  single place a Rust error becomes a front-end error.
- **One Rust error type**, in `src-tauri/src/error.rs`. A raw Rust error string never reaches the
  front end.
- **Network only in Rust**, in `src-tauri/src/fetch/`. `reqwest` + `scraper` for Open Graph link
  previews; the public YouTube oEmbed address for video metadata (Vimeo was removed from the MVP
  and takes the ordinary link-preview path). Every fetch is cut off after 5 seconds.
- **Assets by content hash.** Pictures are copied into `assets/` and named by a hash of their
  bytes. An asset value in an item payload is always a file name, never an absolute path.
- **Notes are Markdown.** The payload stores Markdown source. The card shows the rendered result;
  editing swaps in a plain text box over the source. No editor library — 250 editor instances
  would fail the fps gate.
- **Search is three LIKE queries** — canvas names, note titles, note bodies. Canvas names rank
  first. That ranking is the point, not the indexing. FTS5 is present but unused.
- **Saving.** Every change is written to SQLite. Rapid changes (a drag) are grouped and written
  when the drag ends. A multi-row change is one transaction. WAL mode is on.
- **Undo is an inverse-command stack** in `src/features/undo/`, session-only. One command may
  carry several effects — undoing a delete restores the item, its placement, its connections and
  its asset files together.
- **Failure states are drawn on the card, never in a dialog.** A failed fetch marks the card
  "not fetched" with a retry button. A missing asset shows a marker; the item is not deleted.

## Configuration

`settings.json` under `%APPDATA%\IdeaScape` — one file per machine, deliberately outside every
project folder so a copied project does not carry another machine's theme. It holds five values:
auto-save cadence, snap to grid, zoom modifier, theme, font. The app writes it, it has working
defaults, and it is never required to exist. The Settings screen shows the path.

**The MVP ships with no keys configured, and nothing must be filled in to start.** API keys are
not banned, though. A user-supplied key for a service the user chooses (a YouTube data key, an AI
key) is allowed, held in `settings.json`, and used only for a call the user started. The rule that
is absolute is the privacy rule: **no user information goes out over the network.** If a task
proposes sending the user's notes, canvases or identity to a service, stop and ask.

## Conventions

- Front-end IPC calls are `async`; `rusqlite` calls stay synchronous by design (one local file,
  one reader). Do not add an async database layer.
- Traits / interfaces only at the real boundary — the fetch layer. Call `rusqlite` directly; there
  is no repository layer.
- Rust logging through `log`/`tracing`, front end through the shared logger in `lib/`. Never
  `println!` or `console.log` in shipped code.
- TypeScript `strict` on. No `any` without a written reason.
- Settings are read once through a typed settings module. No scattered env lookups.
- A short doc comment at the top of each module, component and command explaining how it is used.
- **No secrets in source or committed config.**
- Rendered Markdown is sanitized before it enters the page. A note card can never run script.
- Fetched Open Graph values are plain text. A page title is never inserted as markup.

## Testing

- Front end: Vitest with plain `expect`. Test the stores and pure logic (culling maths, undo
  commands, search ranking), not the visual output.
- Rust: `cargo test` with an in-file `#[cfg(test)]` module per area. Data tests use a real SQLite
  file in a temp directory — the same engine that ships, so migrations and WAL behave the same.
- The 60 fps / 250 card gate is measured in the running app, not in a unit test. A green test suite
  does not clear it.
- Name tests for behavior: `methodName_condition_expectedResult` (TS),
  `fn name_condition_expected()` (Rust).

## UI Conventions

- **Title Case For All UI Text** — labels, button text, section headings, page titles, menu
  items, table column headers, tab names, dialog titles, and toast/notification titles.
  Example: "Classic Movies From The 1990's", **not** "Classic movies from the 1990s".
- Title Case applies to headings in generated documentation and reports as well.
- Body copy, help text, validation messages, and log messages stay in sentence case.
- `docs/design-system.html` is the authority for every colour, size, spacing and screen state.
  Read it before writing any component. Do not invent a visual value.

## Working With Me (Interaction Rules)

- **Never** present multiple-choice questions, lettered or numbered pick-lists, or
  one-click/tappable answer options.
- Ask questions **conversationally, one at a time**, and wait for the answer before asking
  the next one.
- **Every question carries a recommendation** — your suggested answer plus a one-line reason.
- Always leave room for a typed, free-text reply; never constrain the answer to a fixed set.

## Commit Authorship

- All commits are authored **solely by the user**. Do **not** add Claude, Claude Code, or any
  AI tool as an author, and do **not** append a `Co-Authored-By` trailer for one.
- **No AI attribution anywhere.** Not in commit messages, PR or issue descriptions, code
  comments, XML/doc comments, changelogs, release notes, or documentation. Do not add
  "Generated with…", "🤖", "AI-assisted", or any equivalent marker.
- Write commit messages in the repository owner's voice: what changed and why.
