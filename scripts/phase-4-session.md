# Phase 4 Gate: Library

PRD §11's Phase 4 gate is **every functional line in PRD §10.2 except the two dark-theme
lines**, measured in the running application rather than claimed from a green suite. This file
is that gate turned into a recorded artefact, in the format `scripts/phase-3-session.md`
established.

## How It Was Driven

This was an unattended run, so the walk below is **scripted** rather than held by hand — the
same substitution Phase 1 made for its pan, Phase 2 for its usability walk-through and Phase 3
for its failure states. Every line is marked PASS only because a **named test is green** or a
**measurement was taken in the real window**, so the transcript is re-runnable rather than a
claim:

- The data half — projects, the recents file, canvases, the delete cascade, the restore and the
  ranking rule — runs against **real SQLite files and real folders in temp directories**, in
  the engine that ships:
  `cargo test --manifest-path src-tauri/Cargo.toml`.
- The drawn half — the picker, the New project dialog, the boot decision, the canvas rows, the
  rename, the delete confirm, the switch and the search popover — runs against the **real
  composition root** with the IPC seam mocked:
  `npx vitest run src/features src/stores src/lib`.
- The frame rate, the project-open time and the recents file run in the **real Tauri window**,
  on the debug bundle, launched as
  `ideascape.exe --project <scratch folder> --perf-gate`, and on the **release bundle launched
  with no arguments at all** — which is the whole point of the phase.

## Machine

|          |                                          |
| -------- | ---------------------------------------- |
| Date     | 2026-09-06                               |
| CPU      | Intel Core Ultra 9 185H                  |
| Memory   | 15.7 GB                                  |
| Graphics | Intel Arc Graphics                       |
| Display  | 1920 × 1200, variable refresh 40 – 60 Hz |
| Power    | On mains                                 |
| OS       | Windows 11 Home 10.0.26200               |
| Renderer | WebView2 (Tauri 2, debug and release)    |

## The §10.2 Walk

Ten functional lines. The two dark-theme lines — "Set the theme to Dark" and "Every screen
matches `docs/design-system.html` … in light and in dark" — are Phase 5's and are not attempted
here, which is exactly the scope PRD §11 gives this gate.

1. **Make a project. Make 3 canvases inside it.** — PASS
   Through the command seam against real SQLite: a project folder is created under a parent,
   with `ideascape.db`, an `assets/` folder and a first canvas, and two more canvases are added
   beside it. A name carrying a path separator, a `..`, a drive letter or nothing but spaces is
   refused, and an existing folder is refused by name. Through the drawn path: _New project…_
   opens the dialog, the dialog invokes `create_project` with the name and the parent, and the
   shell replaces the picker with the new project's first canvas active. Inside the shell the
   `+` beside _Canvases_ creates `Canvas 2`, switches to it, and pushes one undo command.
   (`create_project_fresh_folder_creates_the_folder_and_first_canvas`,
   `create_project_existing_folder_is_rejected`,
   `create_project_name_with_a_separator_is_rejected`,
   `milestone1_project_lifecycle_recents_cascade_restore_and_ranking`,
   `milestone2_boot_create_close_thenASecondProject_movesEverySessionPiece`,
   `canvasList_plusClicked_createsACanvas`,
   `milestone3_create_rename_pan_switch_delete_undo_composes`)

2. **Put 250 mixed cards on one canvas. Panning holds 60 frames per second.** — PASS
   Measured in the real window on the debug bundle. **Median 59.9 fps, zero dropped frames in
   1,786**, at both 100% and 40% zoom. Full numbers and the culling counts below.

3. **That project opens in under 2 seconds.** — PASS
   **Project open: 34 ms** against a 2,000 ms budget, measured end to end on the 250-card mixed
   canvas. The clock is the one §10.2 means: it starts where a Recent card's click starts, by
   calling the very function that click calls, and it covers `open_project`, `list_canvases`,
   reading all 250 cards and their 249 connections, the one asset-status pass over every name
   their payloads hold, `assets_folder` and the recents list. The canvas read alone inside that
   is 19 ms, which is the figure Phase 3 recorded as 0.017 s — so the picker, the folder record
   and the asset grant together add about 15 ms.

4. **Paste a web address. A preview card fills in within 3 seconds, or shows a clear failure
   card with a retry button.** — PASS, carried from Phase 3 and still green after this phase's
   changes to the root's boot and shortcut wiring. The paste-routing checkpoint was rewritten to
   reach its project through the picker's Recent card rather than the retired developer path,
   and it still asserts that `create_link_card` is called before `fetch_link_preview`, that the
   handler returns before the fetch resolves, and that no message strip and no dialog appears.
   (`paste_aWebAddress_createsTheCardBeforeTheFetchAndNeverBlocksOnIt`,
   `paste_theFetchResolvingNotFetched_setsFailedAndDrawsTheCardRatherThanAnError`,
   `fetch_link_preview_for_a_responder_slower_than_the_budget_gives_up_inside_seven_seconds`)

5. **Paste a YouTube address. The card shows the video title and thumbnail. Clicking it opens
   the video in the browser.** — PASS, carried from Phase 3 and still green.
   (`videoCard_notFetched_fallsBackToTheAddressAndKeepsThePlayBadge`,
   `videoCard_aStationaryClick_firesOnOpenOnce`, `oembed_url_percent_encodes_a_question_mark_in_the_video_address`)

6. **Join cards with arrows. Put a label on an arrow.** — PASS, carried from Phase 2 and still
   green after the `delete_placements_for` refactor this phase made, which is the change most
   able to break it silently. Every pre-existing placement, connection and undo test is green.
   (`cargo test … connection::`, `delete_placements_reports_every_connection_it_removed`,
   `npx vitest run src/features/connections`)

7. **Close the application. Open it again. Everything is exactly as it was left, including the
   view position.** — PASS, and strengthened here. Across a real close and reopen of a real
   SQLite file, the project row, the canvases, the cards and each canvas's saved pan and zoom
   all come back. Within a session, switching canvas A → B → A now also returns A to the
   position it was panned to: the store's canvas rows are kept in step with every view write,
   which they were not before this phase — `loadCanvas` restores from that list, and the list
   was otherwise only read when the project opened. That was a real defect this phase's
   Milestone 3 checkpoint found and fixed.
   (`persistence_create_move_close_reopen_keeps_every_change`,
   `update_canvas_view_for_survives_a_reopen`,
   `milestone3_create_rename_pan_switch_delete_undo_composes`)

8. **Search a canvas name. That canvas is the first result.** — PASS, against a deliberately
   ambiguous project: a canvas named _Chapter 3_ and a note titled _Chapter 3_ on a different
   canvas. The canvas hit comes back in its own, earlier group — the ranking is structural, not
   a sort key that could be reordered — and the popover renders the canvas row first and the
   card row second. A note matching on both its title and its body is one result, named by its
   title. A query containing `%` or `_` matches those characters literally, because every query
   is escaped and carries an explicit `ESCAPE '\'` clause.
   (`search_project_term_matching_both_returns_the_canvas_first`,
   `search_project_title_and_body_both_match_is_one_result`,
   `search_project_wildcard_characters_are_matched_literally`,
   `escape_like_percent_and_underscore_are_escaped`,
   `searchResults_canvasAndCardHits_rendersCanvasesFirst`,
   `milestone4_ambiguousTerm_ranksTheCanvasFirst_andEnterOpensTheCard`)

9. **Force-close the application while editing. Nothing is lost except the action in
   progress.** — PASS, carried from Phase 1 and extended to the two new ways a session can end.
   Every discrete change is already on disk when it happens; a drag is grouped and written when
   it ends. _Close Project_ and a canvas switch both flush the pending geometry and the pending
   view write **before** they tear anything down, so the one thing in flight is written rather
   than dropped.
   (`persistence_create_move_close_reopen_keeps_every_change`,
   `switchCanvas` flush ordering asserted in `milestone3_create_rename_pan_switch_delete_undo_composes`,
   `milestone2_boot_create_close_thenASecondProject_movesEverySessionPiece`)

10. **Delete the last card of an item. The item and its picture file are gone from the folder.
    Undo brings both back.** — PASS, carried from Phase 3 and now also true one level up: the
    same rule applies when a whole **canvas** is deleted, because the canvas delete calls the
    very routine the card delete uses rather than re-implementing it. Deleting a canvas removes
    its placements, its connections, every item that lost its last placement and those items'
    asset files, in one transaction, and `Ctrl+Z` brings the canvas, its cards, its lines and
    its files back together, with the restored lines joining the cards they were drawn between.
    (`milestone1_assets_dedupe_reference_count_trash_and_restore_round_trip_real_bytes`,
    `delete_canvas_item_used_only_there_is_deleted_and_its_asset_trashed`,
    `restore_canvas_from_its_effect_puts_back_rows_lines_and_files`,
    `restore_canvas_remaps_connection_endpoints_to_the_new_placement_ids`,
    `milestone1_project_lifecycle_recents_cascade_restore_and_ranking`)

Gate: PASS

## The Recents File, In The Real Window

The release bundle was launched **with no arguments at all** and stayed up on the project
picker — which is the phase's whole point: `dev_project_path` is gone from the Rust side and
from the front end, and a release build registers no `perf_gate_requested` and no
`perf_gate_project_path`, so the picker is the only route into a project that exists.

`%APPDATA%\IdeaScape\recent.json` — the real file, at the path `settings-storage` and PRD §8.2
name, read back after four separate real sessions:

| Project | Canvases | Cards | Opened               |
| ------- | -------- | ----- | -------------------- |
| p4gate4 | 1        | 250   | 2026-09-06T18:07:05Z |
| p4gate3 | 1        | 0     | 2026-09-06T18:02:24Z |
| p4gate2 | 1        | 0     | 2026-09-06T17:58:58Z |
| p4gate  | 1        | 0     | 2026-09-06T17:53:41Z |

Four entries, newest first, with correct counts — a fifth session dropped the oldest, which is
the `RECENT_LIMIT = 4` the 2 × 2 grid in design-system §9.1 draws. The file survived every
restart. It is a **sibling** of the Phase 5 `settings.json`, not part of it, so PRD §8.2's "it
holds the four values the Settings screen edits" and "nothing in this file is user data" both
stay literally true.

## Frame Rate With 250 Mixed Cards

`npm run tauri build -- --debug` produced `src-tauri/target/debug/ideascape.exe`, launched as
`ideascape.exe --project <scratch folder> --perf-gate`. The harness now **opens its own
project** from `perf_gate_project_path` before seeding, because the boot effect no longer opens
one. It then seeds 250 mixed cards through `seed_mixed_cards` and sweeps the view diagonally
for 30 seconds at each zoom, moving every single frame.

### Result

| Pass      | Median   | 5th percentile | Median frame | Dropped frames | Cards | Drawn | Connections | Drawn |
| --------- | -------- | -------------- | ------------ | -------------- | ----- | ----- | ----------- | ----- |
| 100% zoom | 59.9 fps | 59.5 fps       | 16.7 ms      | 0 of 1,786     | 250   | 25    | 249         | 25    |
| 40% zoom  | 59.9 fps | 59.5 fps       | 16.7 ms      | 0 of 1,786     | 250   | 110   | 249         | 114   |

**Median: 59.9 fps, zero dropped frames.** Two clean runs on separate scratch folders agree
exactly. A third run taken while another instance was still shutting down measured the same
59.9 fps median with 20 dropped frames of 1,765, and is recorded here only to say why it is not
the figure: it was not a clean measurement, and the two that were are identical.

### The Control Comparison

Phase 3 recorded **56.2 fps** on this identical workload and argued it was the display, not the
code — the panel is variable-refresh, `Win32_VideoController` reports `MinRefreshRate 40` and
`MaxRefreshRate 60`, and `requestAnimationFrame` follows the panel. Phase 3 proved the point
with a notes-only control run that measured the same 55.9 – 56.5 fps on a workload with no
bitmaps in it at all.

**This phase's measurement is the strongest control that argument could have.** The same
machine, the same harness, the same 250 mixed cards, the same 25 and 110 drawn counts — now
measuring **59.9 fps with a 16.7 ms median frame**, which is what a 60 Hz panel comes to. The
number moved from 56 to 60 with no rendering change whatsoever between the two runs, and the
present phase adds no per-frame work inside the transformed layer at all. That is only possible
if 56.2 was the cadence the panel was presenting at that day, exactly as Phase 3 concluded. The
figure is therefore **not** a regression recovered, and 56 fps was **not** a regression
incurred: both are the display, and the renderer has never missed a refresh in any of the three
phases that measured it.

Against the Phase 3 recorded figure the requirement is "at or above", and 59.9 ≥ 56.2. Against
Phase 1's 59.9 fps and 16.70 ms median frame it is identical. Nothing in this phase — the
picker, three dialogs, the popover, the canvas switch — costs a measurable frame.

None of the escalation ladder was needed. It was checked in order anyway, because a healthy
number is only meaningful if the checks behind it were made: the drawn-versus-total counts are
healthy (below), the low-zoom simplified branch is taken at 40%, and no listener is retained
across a canvas switch or a popover close — the popover unmounts with `{#if}` and the only
listener the root attaches is the single global keydown, which `registerShortcuts` returns the
teardown for and the effect re-runs cleanly when the project opens and closes.

### Culling

The drawn count is the first number to read: if it were close to the total the cull would be
broken and the frame rate beside it would mean nothing.

- 100% zoom — **drawn 25 of 250** cards, 10%; 25 of 249 connections, 10%.
- 40% zoom — drawn 110 of 250 cards, 44%; 114 of 249 connections, 46%.

Identical to Phase 3's counts, which is the point: this phase added no card kind and touched no
cull path. `visiblePlacements` is still the one seam.

## Installer Size

`npm run tauri build` produced the NSIS installer:

|          |                                                                      |
| -------- | -------------------------------------------------------------------- |
| Artefact | `src-tauri/target/release/bundle/nsis/IdeaScape_0.1.0_x64-setup.exe` |
| Size     | 2,931,992 bytes — 2.80 MB                                            |
| Budget   | 20 MB                                                                |
| Headroom | 17.20 MB                                                             |
| Phase 3  | 2,900,575 bytes — this phase added 31,417 bytes, 0.03 MB             |

**No new Rust crate, no new npm package, no new migration and no new Tauri capability
permission** were added in this phase, which is why the figure barely moved: the 31 KB is the
new Rust command module, three new Svelte components and the two new tokens. `dialog:allow-open`
already covered the directory selector, because it is the same `open` command the image picker
has used since Phase 3.
