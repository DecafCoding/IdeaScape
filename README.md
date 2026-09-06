# IdeaScape

A visual note and canvas application for taking notes and building ideas.

IdeaScape is a single-user Windows 11 desktop application. You place cards on an infinite
canvas and join them with lines to build a concept. No accounts, no sharing, no cloud, no
server — a project is a folder on your disk holding a SQLite database and its assets.

## Stack

Tauri 2 with a Rust backend and the WebView2 renderer, a Svelte 5 + TypeScript front end
built by Vite, and SQLite through `rusqlite`. The full reasoning is in
`docs/architecture.html`; `docs/design-system.html` owns everything visual.

## Requirements

- Windows 11 x64
- Node 24+ and npm 11+
- Rust 1.98+ with the MSVC toolchain and the Windows build tools

WebView2 ships with Windows 11, so nothing extra is needed to run the shell. There are no
secrets and no API keys in this project — nothing has to be filled in to start.

## Build And Test

```bash
npm install
npm run tauri dev     # run the app
npm run tauri build   # NSIS installer, Windows 11 x64
npm run build         # front-end build only (Vite)
npm run check         # svelte-check, TypeScript strict
npm test              # Vitest, front-end unit tests
npx prettier --write .

cargo test    --manifest-path src-tauri/Cargo.toml
cargo fmt     --manifest-path src-tauri/Cargo.toml
cargo clippy  --manifest-path src-tauri/Cargo.toml -- -D warnings
```

The Vite dev server runs on `http://localhost:1420`. Do not open it directly — the Tauri
commands do not exist outside the shell.

## Opening A Project

The project picker lands in a later phase. Until then the application takes the project
folder on the command line:

```
ideascape.exe --project "C:\path\to\my project"
```

With no argument it falls back to `%USERPROFILE%\Documents\IdeaScape\Dev project`. The
folder is created if it does not exist, along with its `assets/` subfolder and an
`ideascape.db` opened in WAL mode.

## Using The Canvas

Drag the background to pan, scroll to zoom, and drag on empty space to marquee-select.
Every change is written to SQLite as you make it — there is no Save button; the title bar
shows the save state.

| Key                 | Action                                                  |
| ------------------- | ------------------------------------------------------- |
| `N`                 | New note at the pointer                                 |
| `Enter`             | Edit the selected card                                  |
| `Esc`               | Close the menu, finish the edit, or clear the selection |
| `Del`               | Delete the selection                                    |
| `Ctrl+D`            | Duplicate                                               |
| `Ctrl+C` / `Ctrl+V` | Copy and paste                                          |
| `Ctrl+A`            | Select all                                              |
| `Ctrl+]` / `Ctrl+[` | Bring to front / send to back                           |
| `Ctrl+0`            | Zoom to fit                                             |
| `Ctrl+Z` / `Ctrl+Y` | Undo and redo, within the session                       |

Right-click a card or the background for the same actions as a menu.

## Settings

`settings.json` under `%APPDATA%\IdeaScape` — one file per machine, deliberately outside
every project folder so a copied project does not carry another machine's theme. It holds
the auto-save cadence, snap to grid, the zoom modifier and the theme. The application
writes it, it has working defaults, and it is never required to exist. The Settings screen
lands in a later phase; this build reads the defaults from `src/lib/settings.ts`.

## Performance

The project's one hard gate is 250 note cards panning at 60 frames per second. It is
measured in the running application, not in a unit test — `scripts/perf-gate.md` records
the result, the machine and the installer size. A debug build launched with `--perf-gate`
re-runs that measurement and writes `perf-gate-result.json`.
