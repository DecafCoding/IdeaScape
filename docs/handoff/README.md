# Handoff: IdeaScape desktop UI

## Overview

IdeaScape is a single-user Windows desktop application. The user places cards — notes, images, web links, videos — on an infinite canvas and draws labelled arrows between them to build a larger concept. A project is one folder on disk holding a SQLite database and an `assets/` directory. No accounts, no sync, no server.

This bundle documents the interface: the application shell, the canvas and its card kinds, connections, the properties panel, both context menus, search, the project picker, Settings, and the dark theme.

The authority on scope, data model and architecture is `plan/mvp-plan.html` and `plan/architecture.html`, both included here. Where this document and the plan disagree, the plan wins — see **Alignment with the plan** at the end for the deviations that were agreed deliberately.

**Since the first handoff, `plan/design-system.html` is the single source of truth for everything visual.** It was authored from the first version of this bundle and then took decisions of its own. Where the two disagree, **that document wins and this one is the stale copy** — it carries a dated handoff log, a closed list of seven deliberate Broadsheet deviations, and the project-token additions. Three of its decisions change what is drawn in the design file; they are listed under **Open against the design system** at the end. Read that section before building anything.

## About the design files

`IdeaScape UI.dc.html` is a **design reference created in HTML** — a static prototype showing intended look, layout and state, not production code to lift. Nothing in it is wired: inputs hold literal values, no handlers exist, and every "state" is a separately authored screen.

The task is to **recreate these designs in the target codebase's environment** using its established patterns. Per `plan/architecture.html` that environment is settled: **Svelte 5 with runes**, inside a Tauri window, rendered by WebView2 on Windows 11. Build the components as Svelte components under `src/features/`, take the measurements and colours from this document, and do not port the prototype's markup.

Open the file in any browser. It loads `support.js` and the Broadsheet stylesheet from the relative paths included in this bundle, so it works offline.

## Fidelity

**High fidelity.** Colours, type sizes, spacing, radii, shadows and copy are final and should be matched closely. Two caveats:

- **Card heights are content-driven.** Where a card has no authored height, it is as tall as its text. The prototype's absolute `top`/`left` values are illustrative placements, not a layout to reproduce — real placements come from the `placement` table.
- **The 1180 × 720 frame is a mock viewport,** not a fixed window size. The real window is resizable: the left column, the properties panel and the title bar are fixed-width, the canvas takes the remainder.

## The shell

Every screen except the project picker uses the same three-part shell.

### Title bar

| Property | Value |
| --- | --- |
| Height | 34px, `flex: none` |
| Background | `--color-surface` #eae9e9 |
| Bottom border | 1px `--color-divider` (#201e1d at 16%) |
| Padding | `0 4px 0 14px` |
| Item gap | 14px, `white-space: nowrap` |

Contents, left to right:

1. **`IdeaScape`** — 12.5px, weight 600, letter-spacing .02em.
2. **`{project} / {canvas}`** — 12px, opacity .5.
3. **Save state** — `ph-check-circle` at 14px + `Saved 4s ago`, 11.5px, opacity .45, gap 6px.
4. **Counts** — `12 cards · 1 selected` / `· none selected`, 11.5px, opacity .45.
5. **Window controls** — `margin-left: auto`, three 32 × 24 cells at 12px, opacity .55: `ph-minus`, `ph-square`, `ph-x`.

The empty-project screen replaces items 3–4 with a folder path (`ph-folder-open` + `Documents/IdeaScape/Untitled project`) and `0 cards`, because there is nothing saved yet. The project picker shows only items 1 and 5.

### Left column — canvases, search, tools

| Property | Value |
| --- | --- |
| Width | 168px, `flex: none` |
| Background | `--color-surface` |
| Right border | 1px `--color-divider` |
| Padding | `10px 0 12px` |
| Base font | 12.5px |

**Search box** — wrapper padding `0 12px 9px`; the box itself is a flex row, gap 6px, padding `3px 8px`, 1px `--color-divider` border, radius 3px, 11.5px, opacity .5, with `ph-magnifying-glass` at 13px. When it holds a query: full opacity, border and a 1px outline in `--color-accent`, a 1 × 13px accent caret after the text, and `ph-x` at 12px opacity .45 pushed right.

**Section labels** (`Canvases`, `Tools`, `Add`, `History`) — 10px, letter-spacing .1em, uppercase, opacity .45. `Canvases` sits at padding `0 12px 5px` with a right-aligned `ph-plus` at 13px opacity .5; the others at `14px 14px 8px` / `16px 14px 8px`.

**Canvas rows** — padding `5px 12px`, 12px, gap 8px, `ph-square-half` at 13px, name ellipsized. Inactive: opacity .72. **Active: background `--color-accent-100` #e9f8ff, colour `--color-accent-800` #004961, weight 600.**

**Tool and action rows** — padding `7px 14px`, 12.5px, gap 10px.

- Active tool: background `--color-accent` #0088b0, colour `--color-bg` #f3f2f2, weight 600.
- Available: opacity .85.
- Unavailable: opacity .35.
- Undo carries its depth right-aligned at 10.5px opacity .6.

Groups and their icons: **Tools** — Select `ph-cursor`, Pan `ph-hand`, Connect `ph-flow-arrow`. **Add** — Note `ph-note`, Image `ph-image`. **History** — Undo `ph-arrow-counter-clockwise`, Redo `ph-arrow-clockwise`. **Settings** `ph-gear`, pinned to the bottom with `margin-top: auto`.

### Canvas

```css
flex: 1; position: relative; overflow: hidden;
background-color: var(--color-bg);
background-image: radial-gradient(circle, rgba(32,30,29,.16) 1px, transparent 1.2px);
background-size: 22px 22px;
```

The dot grid is decorative and does not imply snapping — snap-to-grid is off by default (see Settings).

**Zoom bar** — absolute, `left: 18px; bottom: 14px`. Padding 3px, background `--color-surface`, radius 3px, shadow `0 3px 10px rgba(45,43,43,.16)`, 12px. Buttons are 26 × 24 grid-centred cells at opacity .7: `ph-minus`, the percentage (min-width 42px, 11.5px, opacity .75, centred), `ph-plus`, a 1 × 16px divider with 3px side margins, then `ph-corners-out` (opacity .35 when there is nothing to fit).

### Properties panel

| Property | Value |
| --- | --- |
| Width | 177px expanded, 32px collapsed |
| Background | `--color-surface` |
| Left border | 1px `--color-divider` |
| Padding | `14px 12px 12px` |
| Group gap | 13px, base font 12px |

**Header** — kind name 13px weight 600, id below at 10.5px opacity .45 (`note-004`, `image-003`, `link-006`).

**Group label** — 10px, .1em, uppercase, opacity .45, 6px above its content.

**Number pairs** (Position X/Y, Size W/H) — a 2-column grid, gap 5px. Each is a `<label>` at 11px opacity .75 holding the letter and an `.input` at 11px, padding `2px 4px`, radius 2px, `flex: 1; min-width: 0`.

**Order** — two buttons, `flex: 1`, 11px, padding `3px 4px`, radius 3px, transparent, 1px `--color-divider` border: `ph-arrow-line-up` Front, `ph-arrow-line-down` Back.

**Footer** — `margin-top: auto`, gap 8px. A duplicate button (30 × 26, radius 3px, 1px `--color-accent` border, `--color-accent-700` #006786 icon, `ph-copy`) and a delete button (same box, 1px `--color-divider` border, `--color-accent-2` #d6006c icon, `ph-trash`) sit at either end of a `space-between` row. Under them: `Edits here are undoable · autosave in 2s`, 11px, opacity .42.

**Collapsed state** (nothing selected) — 32px wide, centred column, padding `10px 0`, gap 12px: `ph-caret-left` in a 24 × 24 cell at 14px opacity .5, then `Nothing selected` in `writing-mode: vertical-rl` at 9.5px, letter-spacing .12em, uppercase, opacity .38. Clicking the caret reopens it.

## Cards

All cards share: background `--color-surface`, radius 3px, shadow `0 2px 8px rgba(45,43,43,.14)`.

**Selected** — shadow deepens to `0 4px 14px rgba(45,43,43,.18)`, plus `outline: 2px solid var(--color-accent)` and four resize handles: 7 × 7px, background `--color-surface`, 2px `--color-accent` border, radius 1px, inset `-4px` at each corner.

### Note card

Padding `11px 13px`. Title 13px weight 600, 5px below it. Body 12px, line-height 1.5, opacity .8. `<b>` and `<i>` render inline; bullet lines are written as text with `<br>`. The selected example widens its title to 13.5px and its body to opacity .85.

### Image card

Background `--color-neutral-200` #eae7e7, `display: grid; place-items: center`, colour `rgba(32,30,29,.5)`. Inside: `ph-image` at 20px (small cards) or 26px (large), then the file name at 11px, stacked with gap 5px. Width and height are both authored — an image card has real dimensions from `natural_width`/`natural_height`.

### Link card

`overflow: hidden`, no padding on the shell.

- **Preview band** — 126px tall, `--color-neutral-200`, centred `ph-image` at 22px in `rgba(32,30,29,.4)`. Replace with the fetched picture.
- **Body** — padding `10px 13px 12px`.
  - Domain row: 10px, letter-spacing .06em, uppercase, opacity .5, gap 6px, 5px below. The favicon is a 12 × 12px square, radius 2px, `--color-accent-200` #cbeeff as a stand-in.
  - Title: 13px, weight 600, line-height 1.35, 4px below.
  - Description: 11.5px, line-height 1.45, opacity .72.
- **No preview data** — the plan's normal state, not an error: drop the preview band, keep padding `11px 13px`, use a `--color-neutral-300` #d7d3d3 favicon square, and add `No preview picture on this page` at 11px opacity .45, 7px under the title.
- **Not fetched yet** — the card exists the instant the address lands. Domain row uses `ph-link-simple` at 13px; the body is the raw address at 12px, line-height 1.45, `word-break: break-all`, opacity .85; below it, 9px down, `ph-circle-dashed` at 13px + `Fetching preview…` at 11px opacity .55.

### Video card

`overflow: hidden`.

- **Thumbnail** — 153px tall (16:9 at 272px), `--color-neutral-300`, `position: relative`. Centred play badge: 38 × 38px, `border-radius: 50%`, background `rgba(243,242,242,.92)`, `ph-play` at 16px in #201e1d. Duration chip: absolute `right: 7px; bottom: 7px`, background `rgba(32,30,29,.82)`, colour #f3f2f2, 10px, padding `1px 5px`, radius 2px.
- **Body** — padding `10px 13px 12px`. Provider row as the link card's domain row but with `ph-youtube-logo` at 13px. Title 13px weight 600, line-height 1.35. Then `Click to open in your browser` at 11px opacity .45, 6px down.

Video never plays in place — clicking opens the address in the system browser. This is a deliberate, documented gap against competitors (`plan/mvp-plan.html` §11).

## Connections

A connection is drawn as an SVG overlay that is a **sibling of the cards, placed before them in DOM order**, so cards always paint over the lines:

```html
<svg style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none">
  <defs>
    <marker id="ar" viewBox="0 0 9 9" refX="8" refY="4.5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0.5,0.5 L8.5,4.5 L0.5,8.5 z" fill="rgba(32,30,29,.5)"></path>
    </marker>
  </defs>
  <g stroke="rgba(32,30,29,.4)" stroke-width="1.5" fill="none">
    <path d="M140,142 L199,188" marker-end="url(#ar)"></path>
  </g>
</svg>
```

Rules that matter when you implement this properly:

- **Endpoints sit on the card's real edge**, not on an assumed one. In the prototype these are hand-computed and had to be corrected twice; in the application, derive them from the placement rectangle so a card that grows never leaves a line sprouting from its middle.
- **Direction** comes from the arrowhead; `orient="auto-start-reverse"` lets one marker serve either end.
- **Labels** are HTML chips, not SVG text, so they can sit on an opaque ground: background `--color-surface`, radius 2px, padding `1px 5px`, 10px, opacity .62, `white-space: nowrap`, positioned on the line's midpoint. A chip must clear both cards and anything drawn above it — an open menu will occlude one, which is correct behaviour but worth allowing for.
- Lines are **neutral ink, never the accent** — the accent means "selected".
- A connection joins two *placements* on one canvas. Placing the same item on another canvas brings no lines with it.

Entry points: the **Connect** tool in the rail, or **Connect from here** (`ph-flow-arrow`, shortcut `C`) in a card's context menu.

## Screens

### Drawing a line — `21a`

Connect is the active tool and the canvas takes `cursor: crosshair`. The **source card** keeps its accent outline and grows a 10 × 10px filled `--color-accent` anchor dot, `border-radius: 50%`, with a 2px `--color-surface` ring, centred on the edge the line leaves from. The **pending line** is `stroke: var(--color-accent)`, `stroke-width: 1.5`, `stroke-dasharray: 5 4`, with the accent arrowhead marker, running to the pointer. The **card under the pointer** takes `outline: 2px dashed var(--color-accent); outline-offset: 2px`. A `ph-crosshair` at 15px in the accent marks the pointer.

Hint bar, top-left of the canvas (`left: 18px; top: 14px`): `--color-surface`, radius 3px, shadow `0 3px 10px rgba(45,43,43,.16)`, padding `4px 11px`, gap 8px, 11.5px — `ph-flow-arrow` in `--color-accent-700`, then **Release on a card to connect**, then `Esc to cancel` at opacity .45. The properties panel is collapsed and reads `Drawing a line`. The title bar count reads `12 cards · connecting`.

### A connection selected — `21b`

The line goes to `stroke: var(--color-accent)` at `stroke-width: 2.5` with the accent arrowhead. Both **endpoints** get a 10 × 10px handle: `--color-surface` fill, 2px `--color-accent` border, `border-radius: 50%`. The **label chip inverts** — background `--color-accent`, colour `--color-bg`, weight 600, full opacity — so it reads as selected rather than as ink on paper.

Panel groups: **Between**, **Label**, **Direction**. No Position, Size or Order — a connection has none of them.

- **Between** — two rows at 11px opacity .8, each an icon at 13px opacity .6 plus the card's name, ellipsized; between them `ph-arrow-down` + `to` at 10.5px opacity .5.
- **Label** — a full-width `.input`, then `Leave it empty for a bare arrow.` at 11px opacity .45.
- **Direction** — a four-up segmented control, each option `flex: 1`, padding `3px 0`, centred: `ph-arrow-right` (active), `ph-arrow-left`, `ph-arrows-horizontal`, `ph-minus`. Helper: `Swap the ends, point both ways, or drop the arrowhead.`
- **Footer** — the duplicate/delete pair, then `Deleting a line leaves both cards where they are`.

### Marquee multi-select — `21c`

The band is drawn as **two stacked divs on the same rect** — one `background: var(--color-accent)` at `opacity: .1`, one `border: 1px solid var(--color-accent)` at full opacity — because a single tinted div would fade its own border. Every card the band encloses takes the full selected treatment, outline and handles. A `ph-cursor` at 13px sits at the dragged corner.

Panel header: `5 cards` with `3 notes · 2 images` as the id line. **Position and Size read `mixed`** in italic at opacity .6 where the values differ. An **Align** group replaces Text: a 3-column grid, gap 4px, of six 24px cells with 1px `--color-divider` borders, radius 2px, 13px icons at opacity .75 — `ph-align-left-simple`, `-center-horizontal-`, `-right-`, `-top-`, `-center-vertical-`, `-bottom-simple`. Helper: `One move you asked for — nothing snaps on its own.` Footer note: `Moves, deletes and aligns apply to all five`.

The selection must always be **exactly** what the band encloses. In the design file the band is sized to its selection deliberately; in the application it is the other way round.

### Note mid-edit — `21d`

The card is selected and its body goes to opacity .85 with a **caret**: an inline-block 1 × 13px `--color-accent` bar, `vertical-align: -2px`, `margin-left: 1px`. Applied `<b>` shows in the copy.

The **text bar floats above the card** at `left: -2px; top: -38px`: `--color-surface`, radius 3px, shadow `0 6px 18px rgba(45,43,43,.24)`, padding 3px, gap 2px. Four 28 × 26px cells at 14px, radius 2px — `ph-text-b` active (`--color-accent-100` on `--color-accent-800`), `ph-text-italic`, then a 1 × 16px divider with 3px margins, then `ph-list-bullets` and `ph-list-numbers`, all at opacity .7. The same four appear in the panel's Text group, which is the keyboard-free equivalent.

The **title bar shows `Saving…`** with `ph-circle-dashed` in place of the saved time. Canvas caption, bottom: `Esc or click away to finish · every keystroke is undoable` at 11px opacity .45. Panel Size reads `H auto`, with `Height follows the text while you type.`; footer note `Editing · the write lands when you pause`.

### Image mid-drop — `21e`

Three things at once. The **canvas** takes `outline: 2px dashed var(--color-accent); outline-offset: -6px` and a full-bleed `--color-accent` wash at `opacity: .06`. The **ghost** sits at the pointer — 220 × 147px, 2px `--color-accent` border, radius 3px, `--color-surface` at `opacity: .92`, holding `ph-image` at 24px, the file name at 11.5px weight 600 and `2400 × 1600 · 1.1 MB` at 10.5px opacity .7, all in `--color-accent-700`. A 9px accent dot marks the exact drop point with `Drops here` beside it at 11px weight 600.

Hint bar: `ph-download-simple`, then `Copied into assets/ on release`, then `3 more files queued` at opacity .45. Panel collapsed, reading `Dropping a file`.

### New project dialog — `21f`

A `rgba(32,30,29,.32)` backdrop over the canvas, then the dialog: `left: 50%`, width 452px, `margin-left: -226px`, `top: 96px`, `--color-surface`, radius 3px, shadow `0 18px 44px rgba(45,43,43,.38)`, padding `22px 24px 20px`, group gap 16px.

Title 19px letter-spacing -.01em; sub-line 11.5px line-height 1.5 opacity .55 naming what gets created. Then **Name** (a 12.5px `.input`, padding `5px 8px`, focused — 1px accent outline) and **Location** (a 12px `.input` plus a `Browse` button, gap 6px), with the resolved path echoed below at 11px opacity .45, `word-break: break-all`. Action row: `Nothing is written until you create it` at 11px opacity .42, then `Cancel` as `.btn-ghost`, then `Create project` as the primary.

### Canvas rename and delete confirm — `21g`

**Rename** is inline in the left column: the row becomes a full-width `.input` at 12px, padding `2px 5px`, radius 2px, `outline: 1px solid var(--color-accent)`, with `margin: 1px 8px` so it sits inside the column's rhythm. Caption beside it: `Enter to keep the name · Esc to leave it`.

**Delete confirm** — same dialog shell at width 412px, `top: 150px`. Title `Delete "Crew & shifts"?` at 19px. Body at 12px line-height 1.6 opacity .72 states what goes and what stays. Then the warning block: `--color-accent-2-100` background, radius 2px, padding `8px 11px`, 11.5px line-height 1.5 in `--color-accent-2-800`, `ph-warning` at 15px — **6 cards are placed here and nowhere else. They will be deleted with the canvas.** Actions: `Undoable this session` at 11px opacity .42, `Cancel` ghost, then `Delete canvas` as a primary button on `--color-accent-2`.

The count in that warning is the placement model surfacing in the UI, and it has to be computed, not guessed: it is the number of items whose only placement is on this canvas.

### 254 cards at 24% — `21h`

The P1 performance gate. The dot grid scales with the zoom — `background-size: 6px 6px` at `rgba(32,30,29,.1)`. Cards render as 20–48px boxes at `border-radius: 1px` with `0 1px 3px` shadows; notes keep three 1–2px text bars so the kind still reads, images are flat `--color-neutral-300`. Connections drop to `stroke-width: .75` at `rgba(32,30,29,.3)` with no arrowheads — direction is unreadable at this size, so drawing it is wasted work.

A badge sits top-right: `ph-gauge` + `60fps · 254 cards, 118 drawn`. **That is the target, not a measurement** — the second number is the cull working, and it is the thing to instrument first. **Zoom to fit** is dimmed to opacity .35 because the view already holds everything.

### Missing asset file — `22a`

The image card keeps its position, size, selection and connections; only the picture is gone. Its fill goes to `--color-neutral-100` and it holds a centred stack, gap 7px, `text-align: center`: `ph-image-broken` at 26px in `--color-accent-2`, **This file is not in the folder** at 12px weight 600, the path in `<code>` at 11px opacity .6, then `The card, its position and its connections are all still here.` at 11px opacity .55, `max-width: 34ch`. Two buttons sit just below the card: `Locate file…` (accent border) and `Replace` (divider border), 11.5px, padding `4px 11px`.

Canvas bar, top-left: `--color-accent-2-100` on `--color-accent-2-800`, `ph-warning` — **2 files** are missing from this project, then `Nothing was deleted` at opacity .55. A project that has lost one file has usually lost several.

Panel **File** group: a warning row (`ph-warning-circle` at 13px + `Missing since this project was opened` in `--color-accent-2-800`), the path at 11px opacity .55 `word-break: break-all`, then **`Recorded 1920 × 1280 · 412 KB`** at opacity .45 — the recorded dimensions stay so the layout never collapses — then `Locate…` and `Replace`. Footer note: `The card keeps working · only the picture is gone`.

### Damaged database — `22b`

The plan puts this failure before the canvas exists, so it belongs on the **project picker**. Title bar shows the brand and window controls only.

Between the sub-line and the Recent grid: a message block, `max-width: 720px`, `--color-accent-2-100`, radius 3px, padding `15px 17px`, gap 12px, with `ph-warning-circle` at 19px in `--color-accent-2`. Inside — **Skiff did not open** at 13px weight 600 in `--color-accent-2-800`; `The database file could not be read:`; the **full path** in a `--color-surface` inset at 11.5px, radius 2px, padding `6px 9px`, `word-break: break-all`; then what was *not* touched, naming `assets/`; then `Show the folder` (accent-2 border) and `Copy the message` (divider border) at 12px.

In the Recent grid the damaged card takes `outline: 2px solid var(--color-accent-2)`, swaps `ph-folder` for `ph-warning-circle` in `--color-accent-2`, and its meta line reads `Cannot be read` at weight 600 in `--color-accent-2-800`. **Every other project still opens** — that is the point of the screen.

No repair button. The application does not promise a fix it cannot deliver; it names the file and gets out of the way.

### States and motion sheet — `22c`

A reference sheet, not an application screen — it has **no 720px frame and no `overflow: hidden`**, and grows to its content. Four state rows (primary button, secondary and icon buttons, list rows, canvas cards), each a 5-column grid of swatches showing rest, hover, pressed, focus and disabled at real size with the value under it; then the motion table as a 4-column grid. Everything on it is transcribed in **Interaction states** and **Motion** above.

### Project picker — `19a`

**Purpose.** What opens when no project is open: choose a recent project folder, or make a new one.

No rail and no canvas. Title bar shows the brand and window controls only. Content column: padding `54px 64px 0`.

- **`Open a project`** — `<h2>`, 32px, letter-spacing -.02em, 7px below.
- **Sub-line** — 12.5px, line-height 1.6, opacity .6, `max-width: 62ch`, 26px below: "A project is one folder on this machine. It holds `ideascape.db` and every image you have added, copied in, so the folder can be moved, zipped or backed up whole."
- **Actions** — a flex row, gap 10px, 36px below. Primary: `New project…` with `ph-folder-plus`, 13px, padding `7px 16px`, radius 4px, background and border `--color-accent`, colour `--color-bg`. Secondary: `Open folder…` with `ph-folder-open`, transparent, 1px `--color-divider` border, `--color-text`.
- **`Recent`** label, then a **2 × 2 card grid**, gap 14px, `max-width: 720px`. Each card: `--color-surface`, radius 3px, shadow `0 2px 8px rgba(45,43,43,.12)`, padding `14px 16px 13px`, gap 7px, `min-width: 0`. Inside — a row with `ph-folder` at 16px opacity .5 and the project name at 14px weight 600 letter-spacing -.01em (ellipsized); the folder path at 11px opacity .5 (ellipsized); then a baseline row 3px down with `5 canvases · 214 cards` at 11.5px opacity .6 and the last-opened time right-aligned at 11.5px opacity .42. The selected card adds `outline: 2px solid var(--color-accent)`.
- **Footer** — `margin-top: auto`, padding-bottom 22px, gap 20px, 11.5px opacity .42: `IdeaScape 0.1 · Windows` and `No account, no sync — nothing leaves this machine`.

### Empty project — `15a`

**Purpose.** The state right after **New project**: the folder exists, one canvas has been made, and it holds nothing.

The rail lists one canvas (`Canvas 1`, active). Undo, Redo and **Connect** are all at opacity .35 — there is nothing to connect. The properties panel is collapsed. The canvas centre holds a stack, `align-items: center`, gap 14px, `padding: 0 40px`:

- `Nothing on the canvas yet` — 22px, letter-spacing -.02em.
- Instruction — 13px, line-height 1.6, opacity .6, `max-width: 40ch`: "Press **N** for a note or **I** for an image — or drag a JPEG or PNG in from anywhere and drop it where you want it."
- Two buttons, gap 10px, 4px down, both 13px, padding `6px 15px`, radius 4px, transparent: `New note` with a `--color-accent` border and `--color-accent-700` text; `Add image` with a `--color-divider` border and `--color-text`.
- Hint — 16px down, 11.5px, opacity .4, line-height 1.6: "Drag the background to pan · scroll to zoom / right-click anywhere to add".

### Canvas, note selected — `14b`

The canonical working screen. Twelve cards, one note selected, the panel filled in. Panel groups: Position, Size, **Text**, Order.

**Text group** — four 28 × 26px cells, gap 2px, 14px icons, radius 2px: `ph-text-b`, `ph-text-italic`, `ph-list-bullets`, `ph-list-numbers`. The active one takes `background: var(--color-accent-100)` with `color: var(--color-accent-800)`; the rest sit at opacity .7.

### Image card selected — `20a`

Panel groups: Position, Size, **File**, **Alt text**, Order.

**File** — the path at 11px, line-height 1.5, opacity .75, ellipsized (`assets/truss-reference.jpg`); then `1920 × 1280 · 412 KB · copied in` at 11px opacity .45; then a row, gap 5px: `Replace` (flex 1, 11px, padding `3px 4px`, radius 3px, 1px `--color-divider` border) and a 28px-wide icon button holding `ph-folder-open` at 13px, titled "Show in folder".

Nothing here points at where the original file used to live — images are copied into `assets/` and named by content hash, so the card cannot break when the user moves the original.

**Alt text** — a `.input` textarea, 100% wide, 44px tall, 11px, line-height 1.45, padding `4px 5px`, radius 2px, `resize: none`, `font-family: inherit`.

### Link card selected — `19b`

Panel groups: Position, Size, **Source**, Order.

**Source** — a full-width `.input` holding the address at 11px, padding `2px 4px`, radius 2px; then `Preview fetched 2 min ago` at 11px opacity .45, line-height 1.45; then `Refetch` with `ph-arrow-clockwise`, 11px, padding `3px 8px`, radius 3px, 1px `--color-accent` border, `--color-accent-700` text.

### Paste, not yet fetched — `20b`

The same panel with the fetch pending: the source line reads `Not fetched yet · 5s limit` and **Refetch is disabled** — 1px `--color-divider` border, `--color-text`, `opacity: .45`, `disabled` — until the first attempt finishes or the five-second limit cuts it off. A 11px opacity .4 caption `Pasted here · Ctrl+V` sits under the new card.

The point of this screen: the card is on the canvas before the network is consulted, so the wait never blocks the work.

### Search — `20c`

Typing in the rail's box opens a popover **over the canvas**, wider than the rail: absolute `left: 156px; top: 34px`, width 318px, `--color-surface`, radius 3px, shadow `0 12px 30px rgba(45,43,43,.3)`, padding `6px 0 4px`. The properties panel is collapsed, because searching selects nothing.

Two groups, each headed by a baseline row (10px .1em uppercase opacity .45 label + a count at 10px opacity .4), separated by a 1px `--color-divider` rule with 6px margins:

- **Canvases** first — this ranking is a requirement, not a preference. Row: `ph-square-half`, name 12px weight 600 line-height 1.35, sub-line 10.5px opacity .5 (`32 cards · last opened 2 days ago`).
- **Cards** second. Row: `ph-note` or `ph-image`, the card title, a sub-line naming kind and canvas (`Note · Hull studies`), then a snippet at 10.5px line-height 1.4 opacity .6 with matched words in `<b>`.

Rows are padding `7px 12px`, gap 9px, icon 14px opacity .55 with 1px top margin, text column `flex: 1; min-width: 0`, titles and sub-lines ellipsized. The highlighted row takes `background: var(--color-accent-100)`. Footer: a rule, then keyboard hints at 10.5px opacity .42 — `↑↓ to move`, `Enter to open`, `Esc to close` (right-aligned).

### Context menus — `17a`, `17b`

Shared grammar: `--color-surface`, radius 3px, shadow `0 10px 28px rgba(45,43,43,.3)`, padding `5px 0`, 12.5px. Rows are padding `6px 14px`, gap 10px, `white-space: nowrap`, with a 15px icon at opacity .7 and the shortcut right-aligned at 11px opacity .45. The highlighted row takes `background: var(--color-accent)` with `color: var(--color-bg)` (its shortcut goes to opacity .8). Destructive rows are `--color-accent-2` #d6006c with no icon dimming. Separators are 1px `--color-divider` with `margin: 5px 0`. A 13px `ph-cursor` marks the click point, 12px up and left of the menu corner.

**Element menu** (`17a`), width 256px — Edit text `Enter` · Connect from here `C` · Duplicate `Ctrl+D` · Copy `Ctrl+C` — Bring to front `Ctrl+]` · Send to back `Ctrl+[` — Delete `Del`. Right-clicking a card selects it first, so the panel fills in behind the menu.

**Background menu** (`17b`), width 236px — New note here `N` · Add image… `I` · Paste `Ctrl+V` — Select all `Ctrl+A` · Zoom to fit `Ctrl+0` · Reset zoom `100%` — Background. It creates **at the pointer**, not at the canvas centre. Paste is greyed (opacity .35) when the clipboard holds nothing placeable.

Neither menu is the only route to any action — the rail and the panel cover the same ground.

### Settings — `16a`

A full-screen page replacing the canvas; the rail stays and its gear is the active row. Changes apply as they are made — there is no Save or Cancel.

- **Header** — padding `30px 44px 20px`, `align-items: flex-end`, gap 16px: `Settings` at 32px letter-spacing -.02em; `Applied as you change them` at 12px opacity .5 with 8px bottom padding; then `Back to canvas` pushed right (`ph-arrow-left`, 13px, padding `5px 14px`, radius 4px, 1px `--color-accent` border, `--color-accent-700` text).
- **Body** — a 2-column grid, `gap: 34px 64px`, `align-content: start`, `max-width: 1000px`, padding `0 44px 20px`, scrolls.
- **Rows** — `align-items: center`, gap 12px. Label 12.5px; helper text under it at 11.5px opacity .5; control right-aligned at `flex: none`.
- **Footer** — padding `0 44px 22px`, 11.5px opacity .42: `settings.json · %APPDATA%\IdeaScape · nothing leaves this machine`.

Groups and rows:

| Group | Row | Control | Helper |
| --- | --- | --- | --- |
| Files | Project folder | the path, ellipsized, with `read-only` at 11.5px opacity .42 | — |
| Files | Auto-save | segmented `1s` / **`3s`** / `10s` | Written atomically; the canvas never blocks on a save. |
| Canvas | Snap to grid | toggle, **off** | Off keeps free placement to the pixel. |
| Canvas | Zoom with | segmented **`Scroll`** / `Ctrl+scroll` | Ctrl+scroll leaves the plain wheel free to pan. |
| Appearance | Theme | segmented **`Light`** / `Dark` / `System` | — |

**Segmented control** — `display: flex`, 11.5px, radius 3px, `overflow: hidden`, 1px `--color-divider` border. Options padding `4px 10px` (four-up) or `4px 12px` (two- and three-up); inactive opacity .6; active background `--color-accent`, colour `--color-bg`, weight 600.

**Toggle** — 34 × 19px, radius 10px, background `--color-neutral-300`; knob 15 × 15px, radius 50%, background `--color-surface`, shadow `0 1px 3px rgba(45,43,43,.3)`, inset 2px. Off shows the knob left.

## Dark theme — `18a`, `18b`

Selected by **Settings · Appearance · Dark**. Nothing moves: every measurement, group and control is identical to its light twin. Only the ground inverts.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas ground | `--color-bg` #f3f2f2 | #1a1817 |
| Chrome and cards | `--color-surface` #eae9e9 | #262322 |
| Raised fills (image placeholders, inputs) | `--color-neutral-200` #eae7e7 | #302d2b |
| Divider | `--color-divider` | #3b3735 |
| Ink | `--color-text` #201e1d | #ece9e6 |
| Accent | `--color-accent` #0088b0 | `--color-accent-400` #62c5ee |
| Text on the accent | `--color-bg` | #151312 |
| Accent tint (active pill, toolbar toggle) | `--color-accent-100` / `-800` text | `--color-accent-900` / `-200` text |
| Destructive | `--color-accent-2` #d6006c | `--color-accent-2-400` #ff90b1 |
| Canvas dots | `rgba(32,30,29,.16)` | `rgba(255,255,255,.16)` |
| Connection lines / arrowheads | `rgba(32,30,29,.4)` / `.5` | `rgba(236,233,230,.38)` / `.5` |
| Card shadow | `0 2px 8px rgba(45,43,43,.14)` | `0 2px 8px rgba(0,0,0,.42)` |
| Selected card shadow | `0 4px 14px rgba(45,43,43,.18)` | `0 4px 14px rgba(0,0,0,.5)` |
| Zoom-bar shadow | `0 3px 10px rgba(45,43,43,.16)` | `0 3px 10px rgba(0,0,0,.45)` |
| Placeholder ink | `rgba(32,30,29,.5)` | `rgba(236,233,230,.42)` |

Two rules to carry into the implementation: **the accent moves up its ramp on dark** so it still reads as the active colour, and **shadows do less separating work on a dark ground** — card separation leans on the surface step (#262322 against #1a1817) rather than on the drop shadow.

## Interaction states

Shown in full on `22c`. Broadsheet's own rule applies — hover tints and pressed states come from the accent ramp, keyboard focus is a 2px accent `:focus-visible` ring at 2px offset, and disabled controls drop to 45% opacity. Never leave a browser default.

### Primary button

| State | Value |
| --- | --- |
| Rest | background and border `--color-accent` #0088b0, colour `--color-bg` |
| Hover | `--color-accent-600` #1186ac, 90ms |
| Pressed | `--color-accent-700` #006786, applied instantly, released over 90ms |
| Focus | `outline: 2px solid var(--color-accent); outline-offset: 2px` |
| Disabled | `opacity: .45`, no hover |

### Secondary and icon buttons

| State | Value |
| --- | --- |
| Rest | transparent, 1px `--color-accent` border, `--color-accent-700` text |
| Hover | background `--color-accent-100` #e9f8ff, 90ms |
| Pressed | background `--color-accent-200` #cbeeff, instant |
| Focus | 2px accent ring, offset 2px |
| Disabled | border `--color-divider`, `--color-text`, `opacity: .45` |

The delete button follows the same pattern on the second accent: hover `--color-accent-2-100`, pressed `--color-accent-2-200`.

### Rail rows, menu rows, canvas rows, search results

One tint everywhere a list is hovered.

| State | Value |
| --- | --- |
| Rest | `opacity: .85` (canvas rows .72) |
| Hover | background `--color-accent-100`, colour `--color-accent-800`, full opacity, 90ms |
| Pressed / open | background `--color-accent`, colour `--color-bg`, weight 600, instant |
| Focus | `outline: 2px solid var(--color-accent); outline-offset: -2px` — inset, because these rows are flush to the panel edge |
| Unavailable | `opacity: .35`, no hover, no pointer cursor |

The active tool and the active canvas row are the pressed appearance made permanent — so a hovered row must never look more selected than the selected one.

### Cards on the canvas

The drop shadow is the only thing that changes; a card never scales, lifts or tilts.

| State | Value |
| --- | --- |
| Rest | `0 2px 8px rgba(45,43,43,.14)` |
| Hover | `0 3px 11px rgba(45,43,43,.16)`, 90ms |
| Dragging | `0 8px 22px rgba(45,43,43,.22)`, instant, plus `cursor: grabbing` |
| Selected | `outline: 2px solid var(--color-accent)` + `0 4px 14px rgba(45,43,43,.18)`, instant |
| Connect target | `outline: 2px dashed var(--color-accent); outline-offset: 2px`, 90ms |

**Cursors** — `default` over the canvas with Select, `grab`/`grabbing` with Pan, `crosshair` with Connect, `text` over a note in edit, and the matching directional resize cursor over each handle.

**Inputs** — rest is the Broadsheet `.input`; focus takes a 1px `--color-accent` border plus the 2px ring, and the value selects on focus in the panel's number fields so a typed number replaces rather than appends.

## Motion

Two easings, four durations. On dark, every value is identical.

```css
--ease-out:    cubic-bezier(.2, .8, .3, 1);
--ease-in-out: cubic-bezier(.5, 0, .5, 1);
```

| Duration | Easing | What it covers |
| --- | --- | --- |
| **0ms** | — | Everything tracking the pointer: dragging a card, the marquee band, the in-flight connection line, resize handles, pressed fills, selection outlines. A transition here reads as lag. |
| **90ms** | ease-out | Hover tints and colour changes on buttons, rows, cards and chips. The out-transition matches the in. |
| **140ms** | ease-out | Things that appear: context menus, the search popover, dialogs and their backdrop, the note text bar. Opacity 0→1 plus a 4px rise. **No scale.** |
| **160ms** | ease-in-out | The properties panel between 177px and 32px, and the canvas transform on Zoom to fit and Reset zoom. |

**The one loop** — the fetch spinner: `ph-circle-dashed` rotating 360° over 900ms, linear, infinite. There is no other looping animation in the product, and no skeleton shimmer.

**Never animated** — panning and zooming by hand (the transform follows the input exactly), the theme switch, card text reflowing as it is typed, and the save state in the title bar. A canvas application is judged on the frames it does not drop, so the default is no transition and each one above is an exception with a reason.

**Reduced motion** — under `prefers-reduced-motion: reduce` the 4px rise, the panel slide and the zoom transform go to 0ms. The hover tints and the fetch spinner stay: they carry state, not decoration.

## Interactions and behaviour

Everything below is specified in `plan/mvp-plan.html`; the prototype shows the visual states, not the wiring.

**Canvas**
- Drag the background to pan; scroll to zoom (or Ctrl+scroll, per Settings). Zoom to fit and reset to 100% from the zoom bar or the background menu.
- Cards render as real elements inside one CSS-transformed layer. **Cull cards outside the viewport** — this is the P1 gate and the product's whole performance promise: 60fps panning 250 cards.
- Placement is free. The application never moves a card for the user and never creates one in a position it chose. New cards land at the pointer.
- Only the view position and zoom persist per canvas (`view_x`, `view_y`, `view_zoom`).

**Selection and editing**
- Click selects; the panel fills in. Escape clears. Drag on empty space marquee-selects several. Delete removes the selection.
- Handles resize; the panel's X/Y/W/H fields are the typed equivalent.
- Right-click a card to select it and open the element menu; right-click the background for the background menu.
- Every edit is undoable. Undo and redo hold **the current session only** and clear when the project closes.

**Getting content in**
- Image: file drop from Explorer, file picker, or clipboard paste. Files are copied into `assets/`, named by content hash.
- Paste a URL: the card is created immediately showing the address and marked not fetched; the address decides whether it becomes a link card or a video card.
- Fetches are cut off at 5 seconds and treated as failures.

**Saving**
- Every change is written to SQLite. Rapid changes (a drag) are grouped and written when the drag ends. Multi-row changes go in one transaction.
- The title bar's save state is the only affordance; there is no Save button and no manual mode.

**Failure states — designed as normal UI, not error dialogs**

Four are drawn (see the rows below); the three fetch failures are the only states left without a screen. Implement them in the visual language above:

| Failure | Behaviour |
| --- | --- |
| No internet when a link is pasted | Card is created showing the address, marked not fetched, with a retry button |
| Page has no preview data | Keep the address and any title; no preview picture; see the "no preview data" link card |
| Fetch slower than 5s | Cut off, treated as a failed fetch |
| Asset file missing from the folder | **Mocked — `22a`.** The card keeps its position, size and connections and names the missing file; the panel keeps the recorded dimensions so nothing collapses, and offers **Locate file…** and **Replace**. A count of missing files sits in the canvas bar. Nothing is deleted and nothing is silently repaired. |
| Database locked or damaged | **Mocked — `22b`.** The failure belongs on the project picker, because the canvas never opens. The message names the full path, states what was not touched (the images in `assets/`), and offers **Show the folder** and **Copy the message** rather than a repair it cannot promise. The damaged card is outlined in `--color-accent-2` and reads `Cannot be read`; every other project still opens. |
| Force-closed while editing | Everything is kept except the action in progress |

## State

Front-end state, per `plan/architecture.html`: one shared canvas store (`canvasStore.svelte.ts`) with Svelte 5 runes, so a change to one card re-renders that card and not the tree. Undo is an **inverse-command stack** in `src/features/undo/` — each action records how to undo itself, and one command may carry several effects (deleting the last placement of an item removes the item and its asset files; undo restores all three together).

What the UI needs to hold: the open project and canvas; the pan/zoom transform; the selection set; the active tool; the in-flight connection while one is being drawn; per-item fetch status for links and videos; the search query and its ranked results; the settings object; the undo and redo stacks; and the save state shown in the title bar.

Data shape (see the plan for fields):

```
Project
 ├── Canvas          (many per project)
 │    ├── Placement  (many per canvas) ──► Item
 │    └── Connection (many per canvas) ──► two Placements
 └── Item            (the project library; many per project)
```

A card on a canvas is a **placement** pointing at an **item**; the item holds the content and lives in the project library. Most items have exactly one placement. This is the decision the whole model rests on — do not collapse it.

## Design tokens

All colours come from **Broadsheet**, bound at `_ds/broadsheet-ceab0636-4e8c-4494-8c93-3524fad568e6/`. Use the CSS variables, not the hexes, wherever you can.

**Roles** — `--color-bg` #f3f2f2 · `--color-surface` #eae9e9 · `--color-text` #201e1d · `--color-accent` #0088b0 · `--color-accent-2` #d6006c · `--color-divider` `color-mix(in srgb, #201e1d 16%, transparent)`.

**Accent ramp** — 100 #e9f8ff · 200 #cbeeff · 300 #99e0ff · 400 #62c5ee · 500 #38a6cf · 600 #1186ac · 700 #006786 · 800 #004961 · 900 #0a303e.

**Second accent ramp** — 100 #fff1f4 · 200 #ffdee6 · 300 #ffc0d0 · 400 #ff90b1 · 500 #ff458e · 600 #d82071 · 700 #aa0b56 · 800 #790e3d · 900 #4b1528.

**Neutral ramp** — 100 #f8f4f4 · 200 #eae7e7 · 300 #d7d3d3 · 400 #bab6b6 · 500 #9b9797 · 600 #7d7979 · 700 #605d5d · 800 #444141 · 900 #2d2b2b.

**Dark-theme values** (not in the token sheet — extracted for this design, listed in the dark-theme table above): #1a1817 · #262322 · #302d2b · #3b3735 · #ece9e6 · #151312.

**Radii used** — 2px (inputs, chips, small toggles), 3px (cards, menus, panels, most buttons), 4px (page-level buttons), 1px (resize handles), 50% (play badge, toggle knob).

**Shadows used** — `0 2px 8px rgba(45,43,43,.14)` cards · `0 4px 14px rgba(45,43,43,.18)` selected card · `0 2px 8px rgba(45,43,43,.12)` picker cards · `0 3px 10px rgba(45,43,43,.16)` zoom bar · `0 10px 28px rgba(45,43,43,.3)` context menus · `0 12px 30px rgba(45,43,43,.3)` search popover.

**Four elevations added after the first handoff**, by turns 21 and 22 — `0 3px 11px rgba(45,43,43,.16)` card hover · `0 8px 22px rgba(45,43,43,.22)` card dragging · `0 6px 18px rgba(45,43,43,.24)` the note text bar · `0 18px 44px rgba(45,43,43,.38)` dialogs. `plan/design-system.html` §5.3 lists seven elevations and declares the list closed, so these four are drift and need a decision — see **Open against the design system** below.

**Type scale** (all in the chrome font) — 9.5px vertical label · 10px section labels and chips · 10.5px ids, hints, snippets · 11px helper and captions · 11.5px secondary chrome and segmented options · 12px body, panel base, canvas names · 12.5px tool rows and settings labels · 13px card titles and page buttons · 13.5px selected note title · 14px picker project names · 22px empty-state heading · 32px page headings.

**Letter-spacing** — -.02em on 22px+ headings · -.01em on 14px project names · .02em on the brand · .06em on card kickers · .1em on section labels · .12em on the vertical collapsed label.

**Spacing** — the recurring steps are 2, 5, 6, 7, 9, 10, 12, 13, 14, 16, 22, 26, 34, 36, 44, 64px. Panel groups gap 13px; number pairs gap 5px; title-bar items gap 14px.

## Assets

- **Icons: Phosphor, regular weight** — `https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css`, used as `<i class="ph ph-note">`. Every glyph named in this document is a Phosphor name. Note that Broadsheet's own guide specifies the **duotone** weight; regular was chosen for interface chrome at these sizes and is a deliberate deviation.
- **No images.** Every picture in the prototype is a placeholder: image cards are neutral fills with an icon and a file name; link previews and video thumbnails are neutral bands. Real content arrives from `assets/` and from fetched metadata.
- **The favicon square** in link cards is a 12px tinted rectangle standing in for the fetched icon.

## Alignment with the plan

These screens were reconciled against `plan/mvp-plan.html` and the following were settled explicitly. They are not oversights.

**Corrected to the plan** — the product is IdeaScape, not the earlier working name; the UI says *cards* and *canvases*, never "elements" or "boards"; storage is `ideascape.db` + `assets/`, not a JSON file and a `media/` folder; a project holds many canvases, reached from the left column, with search over canvas names and card text.

**Cut from Settings, because the plan does not have them** — snapshot cadence, snapshots kept, and a restore picker (version history is deferred); an undo-history ceiling (undo lives in memory for the session, so there is nothing to configure); a canvas-background choice; and the folder "Change" button (a project is reached through the picker).

**Kept, knowingly ahead of the plan's letter** — the auto-save cadence row (with "Manual" removed, since automatic save is non-negotiable); snap to grid, off by default, so free placement still holds; the light/dark/system theme, which the dark screens depend on.

**Not yet mocked** — three fetch failures: no internet when a link is pasted (with retry), a page with no preview data, and a fetch cut off at five seconds. The link card's "no preview data" and "not fetched yet" appearances are both specified above, so these three are compositions of parts that already exist. Everything else the plan specifies is drawn.

## Open against the design system

`plan/design-system.html` was written from the first version of this bundle and is now the visual authority. Three things in the design file no longer match it. **None has been applied to the screens** — each changes how every screen looks or needs an owner's call.

**1. The chrome font — decided against the mockups.** Every frame in the design file sets `font-family: Verdana, Geneva, sans-serif`. The design system reverted that on 2026-09-05: the chrome font is Broadsheet's `--font-body`, **Source Serif 4**, on the grounds that a sans-serif for UI chrome would have been an eighth deliberate deviation. The design file has not been redrawn. Build in Source Serif 4, not Verdana — and note the document's own caution: nine roles sit at or under 12px and the smallest is 9.5px, so check each on real Windows 11 hardware at 100% and 150% scaling, and **raise a failing size rather than reintroduce a second family**.

**2. Four new elevations against a closed list.** Listed under Design tokens above. Either add them as project tokens or fold them into the existing seven.

**3. Eleven screens the document has not seen.** Its handoff log records twelve screens as of 2026-09-05: `14b` `15a` `16a` `17a` `17b` `18a` `18b` `19a` `19b` `20a` `20b` `20c`. Turns 21 and 22 added `21a`–`21h`, `22a`, `22b` and `22c`, all specified above. They need folding in, along with the **Interaction states** and **Motion** sections, which the document has no equivalent of.

Already reconciled, and needing nothing from this bundle: the note card's `title` field (the document amends the plan's `note { text }` payload to `note { title, text }`, matching what the screens draw); Settings and the dark theme accepted into scope as a new **P5**; and the properties panel confirmed at 177px / 32px.

## Files

| File | What it is |
| --- | --- |
| `IdeaScape UI.dc.html` | The design file. All screens, grouped into numbered turns, newest first. Open in a browser. |
| `support.js` | Runtime the design file needs to render. Not application code. |
| `_ds/broadsheet-…/styles.css` | The Broadsheet token sheet and component layer — the source of every colour, radius and shadow named here. |
| `_ds/broadsheet-…/_ds_bundle.js` | The design system's compiled component bundle. |
| `_ds/broadsheet-…/readme.md` | Broadsheet's own guide. |
| `IdeaScape UI.dc.html` → `22c` | The states-and-motion reference sheet, rendered at real sizes. Read it beside the two sections above. |
| `plan/mvp-plan.html` | **Scope authority.** Problem, core loop, scope, data model, interfaces, failure behaviour, non-functional targets, milestones, done criteria. |
| `plan/architecture.html` | **Technical authority.** Tauri + Rust + SQLite, Svelte 5, culling, undo model, module layout, deployment. |
| `plan/design-system.html` | **Visual authority**, and newer than this document. The handoff log, the seven closed Broadsheet deviations, the full token and role tables. Read **Open against the design system** above first. |
| `plan/competitive-scan.html` | Prior-art scan and the ranked backlog. |

Screen ids in the design file, for cross-reference: `22a` missing asset · `22b` damaged database · `22c` states and motion · `21a` drawing a line · `21b` connection selected · `21c` marquee multi-select · `21d` note mid-edit · `21e` image mid-drop · `21f` New project dialog · `21g` rename and delete confirm · `21h` 254 cards at 24% · `20a` image selected · `20b` paste pending · `20c` search · `19a` project picker · `19b` link and video cards · `15a` empty project · `14b` canvas with a note selected · `17a` element menu · `17b` background menu · `16a` Settings · `18a` canvas, dark · `18b` Settings, dark.
