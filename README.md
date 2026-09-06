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

Start IdeaScape with no arguments and it opens the **project picker**: _New project…_,
_Open folder…_, and a grid of up to four recent projects showing each one's folder, its
canvas and card counts and when it was last opened.

A project is a folder. _New project…_ takes a name and a parent folder — the name is a
plain folder name, so a `\`, `/`, `:` or `..` in it is refused — and creates
`<parent>\<name>` with an `ideascape.db` opened in WAL mode, an `assets/` subfolder and a
first canvas. _Open folder…_ opens any existing project folder, and a recent card opens
that project directly. If a project's database is locked or damaged it does not open, and
a plain message naming the database file is drawn on the picker.

The recent list lives in `%APPDATA%\IdeaScape\recent.json` — at most four entries, newest
first, beside `settings.json` and never inside a project folder, so a copied project
carries nothing of this machine. It holds no user data; if it is missing or unreadable the
picker simply shows no recent projects.

**Close Project** at the bottom of the left column returns to the picker. Nothing in flight
is lost, the undo stack is cleared, and another project can be opened in the same session.

## Canvases

One project holds many canvases, listed in the left column.

- The **`+`** beside _Canvases_ adds one, named `Canvas 2`, `Canvas 3` and so on.
- **Double-click** a row, or use _Rename_ on its right-click menu, to rename it in place.
  `Enter` commits, `Esc` cancels. Names do not have to be unique.
- _Delete Canvas_ on the row menu asks first, naming the canvas and how many cards are on
  it. Deleting a canvas takes its cards, its lines and any picture files no other card
  still uses; `Ctrl+Z` brings all of it back together, with the lines rejoining the cards
  they were drawn between. The last canvas in a project cannot be deleted.
- Clicking a row switches to it. Each canvas keeps its own pan and zoom, and switching
  writes whatever the canvas you are leaving still owes before it goes.

The undo stack is per canvas and per session: it is cleared when you switch canvas and when
you close the project.

## Search

The box at the top of the left column searches the open project as you type. It runs three
`LIKE` queries — canvas names, note titles, note body text — and **canvas results are always
listed before card results**, because search should take you to a place first. A note
matching on both its title and its body is one result, named by its title. A `%` or `_` in
your query matches those characters literally.

`↑` and `↓` move through the results, `Enter` opens one, `Esc` closes the popover. A canvas
result switches to that canvas; a card result switches to its canvas, selects the card and
centres the view on it.

## Using The Canvas

Drag the background to pan, scroll to zoom, and drag on empty space to marquee-select.
Every change is written to SQLite as you make it — there is no Save button; the title bar
shows the save state.

| Key                 | Action                                                   |
| ------------------- | -------------------------------------------------------- |
| `N`                 | New note at the pointer                                  |
| `I`                 | Add a picture from the file picker                       |
| `C`                 | Start a connection from the selected card                |
| `Enter`             | Edit the selected card                                   |
| `Esc`               | Cancel a link, close the menu, finish the edit, or clear |
| `Del`               | Delete the selection, or the selected connection         |
| `Ctrl+D`            | Duplicate                                                |
| `Ctrl+C` / `Ctrl+V` | Copy, and paste whatever the clipboard holds             |
| `Ctrl+A`            | Select all                                               |
| `Ctrl+]` / `Ctrl+[` | Bring to front / send to back                            |
| `Ctrl+0`            | Zoom to fit                                              |
| `Ctrl+Z` / `Ctrl+Y` | Undo and redo, within the session                        |

Right-click a card or the background for the same actions as a menu.

## Pictures, Links And Videos

There are four kinds of card. A **note** holds Markdown. The other three arrive from outside:

- **A picture.** Drop one from Explorer onto the canvas, press `I` for the file picker, or paste
  image bits with `Ctrl+V`. The file is copied into the project's `assets/` folder and named by a
  hash of its bytes, so two identical pictures share one file and moving or renaming the original
  never breaks the card. The card is drawn at the picture's real proportions. Its original file
  name is kept beside the hash and shown on the card and in the panel's **File** group, together
  with an **Alt Text** box, **Replace**, and **Show in folder**.
- **A web address.** Paste one and the card appears **immediately**, showing the address and
  marked not fetched. The page is then read for its Open Graph title, description, preview
  picture and icon, and the card fills in behind it. Nothing waits on the network.
- **A YouTube address.** Paste one and it becomes a video card with the video's title and
  thumbnail. Clicking it opens the video in your system browser — video never plays inside
  IdeaScape. A Vimeo address, or any other video host, becomes an ordinary link card.

`Ctrl+V` decides between all of these in one place, in this order: cards you copied inside
IdeaScape, a picture on the clipboard, a YouTube address, a web address, then plain text.

Deleting the last card that uses a picture takes the file out of `assets/`; `Ctrl+Z` brings the
card **and** the file back together. A picture shared by two cards is not removed when only one
of them goes.

### When Something Goes Wrong

Nothing here is a dialog. Every failure is drawn on the card:

- **A page that cannot be reached, or is slower than five seconds.** The card keeps the address
  and offers **Refetch**, on the card itself and in the properties panel.
- **A page with no preview picture.** The card says so and keeps the title and address.
- **A picture file missing from `assets/`.** The card draws a dashed marker reading _File not
  found in assets/_ at its authored size. The card, its position and its alt text all survive,
  and **Replace** and **Show in folder** stay enabled, because they are the fix.

Every fetch is cut off after five seconds. All network access lives in `src-tauri/src/fetch/`
and nothing is ever fetched that you did not paste — the front end makes no network call of any
kind, and there is no telemetry.

## Connecting Cards

Pick **Connect** in the left column — or press `C` with one card selected, or use _Connect
From Here_ on a card's right-click menu — then drag from one card to another. The line
follows the pointer while you draw it and snaps to the target card's edge when the drop will
land; `Esc` or a release on empty space cancels it. The Connect tool is unavailable until
the canvas holds two cards, because there is nothing to connect.

A line's endpoints are never stored: they are derived from the two cards' rectangles every
frame, so moving or resizing a card re-derives the line rather than writing anything. Delete
a card and its lines go with it; `Ctrl+Z` brings the card _and_ its lines back as one step.

Click a line to select it. The properties panel then shows the connection's **Label** and
its **Direction** — None, Forward, Back or Both. A label is drawn as a small chip on the
line's midpoint, and is hidden below 50 screen pixels of line length; the label itself is
kept and reappears when the cards move apart or you zoom in. A connection is also reachable
with `Tab`, and `Enter` or `Space` selects the focused one.

## Settings

The **gear** at the bottom of the left column opens Settings, a full-screen page in place of
the canvas. Changes apply the moment you make them — there is no Save, no Cancel and no
confirm. _Back to canvas_ or `Esc` returns you to exactly where you were, with the selection
and the view position intact.

| Setting            | Options                     | Default | What it does                                            |
| ------------------ | --------------------------- | ------- | ------------------------------------------------------- |
| **Project folder** | —                           | —       | The open project's folder, read-only                    |
| **Auto-save**      | `1s` / `3s` / `10s`         | `3s`    | The longest queued card geometry may sit unwritten      |
| **Snap to grid**   | on / off                    | off     | Cards snap to the 22 px pitch; off keeps free placement |
| **Zoom with**      | `Scroll` / `Ctrl+scroll`    | Scroll  | `Ctrl+scroll` leaves the plain wheel free to pan        |
| **Theme**          | `Light` / `Dark` / `System` | Light   | `System` follows Windows live, with no restart          |

Auto-save is a **ceiling**, not a cadence: every change is still written the moment it
happens and a drag is still one transaction on release. The timer only catches a drag that
outlives the setting, or a pointer release the window never saw.

These four values live in `settings.json` under `%APPDATA%\IdeaScape` — one file per machine,
deliberately outside every project folder so a copied project does not carry another
machine's theme. The page's footer prints the folder it actually resolved. The file is
written atomically, it has working defaults, and it is **never required to exist**: delete
it and the application starts on the defaults with no error, and a hand-edit that puts one
value out of range falls back on that value alone. `recent.json` sits beside it and holds
the recent-projects list, deliberately a separate file. Nothing in either leaves the machine.

## Performance

The project's one hard gate is 250 note cards panning at 60 frames per second. It is
measured in the running application, not in a unit test — `scripts/perf-gate.md` records
the result, the machine and the installer size. A **debug** build re-runs that measurement
when launched as `ideascape.exe --project "<folder>" --perf-gate`, writing
`perf-gate-result.json`. That argument is all that is left of the old developer path and
exists for the measurement harness alone: a release build does not register it, and its one
route into a project is the picker.

`scripts/phase-5-session.md` is the latest recorded run and the project's own gate — 250
mixed cards at 59.9 fps with zero dropped frames **in the dark theme with auto-save at its
fastest setting**, a project opening in 35 ms measured from the picker, and a 2.80 MB
installer against the 20 MB cap. It also records the four settled dark shadow values and the
two measured WCAG contrast ratios that close the design system's last open question.

`scripts/phase-2-session.md` records the same measurement over a mixed canvas — 250 cards
_and_ 249 connections — alongside the scripted session that proves the canvas is usable with
notes and lines alone. Both cards and connections are culled, and both drawn counts are
instrumented; in a debug build the development overlay shows them.
