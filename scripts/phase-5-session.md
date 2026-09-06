# Phase 5 Gate: Settings And Appearance

PRD §11's Phase 5 gate is **every line in PRD §10.2**, including the two dark-theme lines
Phase 4's gate deliberately excluded, measured in the running application rather than
claimed from a green suite. This file is that gate turned into a recorded artefact, in the
format `scripts/phase-4-session.md` established.

This is the last phase, so the gate is also the project's gate.

## How It Was Driven

This was an unattended run, so the walk below is **scripted** rather than held by hand — the
same substitution Phase 1 made for its pan, Phase 2 for its usability walk-through, Phase 3
for its failure states and Phase 4 for its whole §10.2 walk. Every line is marked PASS only
because a **named test is green** or a **measurement was taken in the real window**, so the
transcript is re-runnable rather than a claim:

- The settings file — the reader, the per-field sanitizer, the atomic writer and the
  round trip — runs against **real files in real temp directories**, in the same
  `std::fs` the shipped binary uses:
  `cargo test --manifest-path src-tauri/Cargo.toml settings`.
- The drawn half — the Settings page, the two new controls, the gear row, the screen
  conditional, the shortcut maps, the drag guards and the boot order — runs against the
  **real composition root** with the IPC seam mocked:
  `npx vitest run src/features src/stores src/lib`.
- The token layer — the four settled shadows, the eight role tokens, the two dark blocks
  agreeing, no measurement token redefined, no component naming a ramp step, and the two
  WCAG contrast ratios — is **computed from the shipped CSS files as text**, because jsdom
  does not resolve custom properties:
  `npx vitest run src/lib/__tests__/tokens.test.ts src/lib/__tests__/contrast.test.ts`.
- The frame rate and the settings file's real-window behaviour run in the **real Tauri
  window**: the debug bundle as
  `ideascape.exe --project <scratch folder> --perf-gate`, **with the dark theme applied
  from a real `%APPDATA%\IdeaScape\settings.json`**, and the release bundle launched with
  no arguments at all.

### What Was Not Driven By Eye

One thing in this phase cannot be reduced to an assertion, and it is named here rather than
papered over: **nobody looked at the dark theme on a screen.** What replaces that is
structural, and it is stronger than a glance in one respect and weaker in another:

- Stronger: the parity rules are machine-enforced on every run. No measurement, radius,
  duration, type step or spacing token may be redefined in a dark block; the two dark
  blocks must declare exactly the same set of names; no component under `src/features/`
  may name a ramp step at all. Those three assertions are what "nothing moves between the
  two themes" and "every colour flips" actually reduce to, and they hold for every screen
  at once rather than for the screens someone remembered to open.
- Weaker: a colour that is legible but _ugly_ on the dark ground, or a photograph that
  reads badly against it, is invisible to all of that. **That judgement is left for the
  repository owner's own pass**, and it is the one item this gate hands forward.

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

Twelve lines: the ten Phase 4 carried, re-checked after this phase's changes to the token
layer, the boot order and eleven shipped components, plus the two dark-theme lines this
phase is the gate for.

1. **Make a project. Make 3 canvases inside it.** — PASS, carried from Phase 4 and still
   green after this phase's boot-order change, which is the change most able to break it
   silently: `loadSettings` now runs before `loadRecents`, inside the same guard.
   (`create_project_fresh_folder_creates_the_folder_and_first_canvas`,
   `milestone1_project_lifecycle_recents_cascade_restore_and_ranking`,
   `milestone2_boot_create_close_thenASecondProject_movesEverySessionPiece`,
   `milestone3_create_rename_pan_switch_delete_undo_composes`)

2. **Put 250 mixed cards on one canvas. Panning holds 60 frames per second.** — PASS
   Measured in the real window on the debug bundle, **in the dark theme, with the auto-save
   ceiling set to its fastest setting (1 s)**. **Median 59.9 fps, zero dropped frames in
   1,786**, at both 100% and 40% zoom. Full numbers and the culling counts below.

3. **That project opens in under 2 seconds.** — PASS
   **Project open: 35 ms** against a 2,000 ms budget, on the same 250-card mixed canvas, by
   the same clock Phase 4 used — the whole route a Recent card's click takes. The canvas read
   alone inside that is 20 ms. Phase 4 recorded 34 ms and 19 ms; this phase is within the
   noise of that, and the settings read is not on this clock because it happens once at boot.

4. **Paste a web address. A preview card fills in within 3 seconds, or shows a clear failure
   card with a retry button.** — PASS, carried from Phase 3 and still green. The paste router
   now returns early while the Settings page is showing, which is asserted rather than assumed.
   (`paste_aWebAddress_createsTheCardBeforeTheFetchAndNeverBlocksOnIt`,
   `paste_theFetchResolvingNotFetched_setsFailedAndDrawsTheCardRatherThanAnError`,
   `fetch_link_preview_for_a_responder_slower_than_the_budget_gives_up_inside_seven_seconds`)

5. **Paste a YouTube address. The card shows the video title and thumbnail. Clicking it opens
   the video in the browser.** — PASS, carried from Phase 3 and still green after the video
   card's thumbnail ground moved from `--color-neutral-300` to `--color-inset`.
   (`videoCard_notFetched_fallsBackToTheAddressAndKeepsThePlayBadge`,
   `videoCard_aStationaryClick_firesOnOpenOnce`)

6. **Join cards with arrows. Put a label on an arrow.** — PASS, carried from Phase 2 and
   still green. (`npx vitest run src/features/connections`, `cargo test … connection::`)

7. **Close the application. Open it again. Everything is exactly as it was left, including the
   view position.** — PASS, carried from Phase 4 and now true of the four settings as well.
   (`persistence_create_move_close_reopen_keeps_every_change`,
   `update_canvas_view_for_survives_a_reopen`,
   `write_settings_at_then_read_round_trips`)

8. **Search a canvas name. That canvas is the first result.** — PASS, carried from Phase 4
   and still green after the search popover's highlighted row moved from `--color-accent-100`
   to `--color-accent-tint-fill`, which is the identical colour in the light theme.
   (`search_project_term_matching_both_returns_the_canvas_first`,
   `milestone4_ambiguousTerm_ranksTheCanvasFirst_andEnterOpensTheCard`)

9. **Force-close the application while editing. Nothing is lost except the action in
   progress.** — PASS, carried from Phase 1 and **strengthened here**. Every discrete change
   was already written when it happened and a drag was already grouped onto its release;
   this phase adds a ceiling on top, so queued geometry can now never sit unwritten for
   longer than the chosen cadence even if the pointer release is never seen.
   (`startAutoSave_geometryQueuedPastTheCadence_flushesItOnce`,
   `startAutoSave_nothingQueued_writesNothing`, `startAutoSave_teardown_stopsTheTimer`,
   `persistence_create_move_close_reopen_keeps_every_change`)

10. **Delete the last card of an item. The item and its picture file are gone from the folder.
    Undo brings both back.** — PASS, carried from Phase 3 and Phase 4 and still green.
    (`milestone1_assets_dedupe_reference_count_trash_and_restore_round_trip_real_bytes`,
    `delete_canvas_item_used_only_there_is_deleted_and_its_asset_trashed`,
    `restore_canvas_from_its_effect_puts_back_rows_lines_and_files`)

11. **Set the theme to Dark. Every screen renders correctly, and nothing moves between the two
    themes.** — PASS
    The control exists and works: **Light** writes `data-theme="light"`, **Dark** writes
    `data-theme="dark"`, and **System** removes the attribute so the browser's own live
    `prefers-color-scheme` query decides — with no `matchMedia` anywhere in the front end.
    The choice persists and is applied as the very first thing the application does at boot,
    before any data load. Every screen renders correctly in the sense this gate can assert:
    **no component resolves a colour through a ramp step any more**, so there is no colour
    left in the product that fails to flip. **Nothing moves**: the dark blocks redefine role
    colours and nothing else, which is asserted rather than promised.
    (`applyTheme_dark_setsTheAttribute`,
    `applyTheme_light_setsTheAttributeRatherThanRemovingIt`,
    `applyTheme_system_removesTheAttribute`,
    `boot_settingsSayDark_appliesTheAttributeBeforeTheFirstDataLoad`,
    `milestone3_everyControl_movesTheStoreTheFileAndForThemeTheRootElement`,
    `tokens_darkBlock_redefinesNoMeasurementToken`,
    `tokens_theTwoDarkBlocks_declareTheSameTokenNames`,
    `tokens_noComponent_referencesARampStepDirectly`,
    `tokens_everyNewRoleToken_isDeclaredOnceLightAndTwiceDark`)
    Carried forward for the owner's own pass: the aesthetic judgement described under
    "What Was Not Driven By Eye".

12. **Every screen matches `docs/design-system.html` at its locked token values, in light and
    in dark.** — PASS
    In light: the eighteen substitutions this phase made are each **the same colour**
    the ramp step held, so the light theme is unchanged by construction and the whole Phase
    1–4 test suite is green across them. In dark: every one of those eighteen now resolves
    through a token the dark palette redefines. The two new controls are drawn at §9.11's
    locked values with no literal colour in either, and the Settings page's own five rows,
    three groups, header and footer are asserted against §9.11's drawn strings.
    (`settingsPage_render_showsTheFiveRowsInThreeGroups`,
    `settingsPage_render_showsEachRowsDrawnHelperText`,
    `settingsPage_render_marksTheDrawnDefaultsActive`,
    `settingsPage_render_printsTheSettingsFileLocationInTheFooter`,
    `settingsPage_render_hasNoSaveOrCancelButton`,
    `segmented_render_usesNoLiteralColourValue`, `toggle_render_usesNoLiteralColourValue`,
    the full `npx vitest run` suite: 556 tests, 52 files, all green)

Gate: PASS

## The Themes Walked

All three theme states were exercised, each in the place it can actually be observed.

| Theme      | How it was driven                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Result |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Light**  | The whole 556-test front-end suite runs with no `data-theme` and the light tokens in force; the eighteen substitutions are each light-identical to the ramp step they replaced, so every Phase 1–4 assertion is the regression net.                                                                                                                                                                                                                                                                                             | PASS   |
| **Dark**   | A real `%APPDATA%\IdeaScape\settings.json` holding `"theme": "dark"` was read by the real window at boot, and the 250-card perf gate ran under it. The control path, the attribute and the token layer are asserted by name above.                                                                                                                                                                                                                                                                                              | PASS   |
| **System** | `applyTheme('system')` removes the attribute, which is the whole mechanism: `theme.css`'s second block is `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])`, so the browser re-evaluates it live when Windows changes, with no listener and no restart. Asserted by `applyTheme_system_removesTheAttribute` and `applyTheme_darkThenSystem_leavesNoAttributeBehind`, and by the two dark blocks declaring the same token names — the invariant that keeps System from disagreeing with the explicit choice. | PASS   |

**Windows was not toggled between light and dark while the window was open.** That is a
physical act on this machine's OS settings and is the second item handed to the owner's own
pass. The mechanism it exercises has no code of its own to get wrong — an absent attribute
and a live media query — which is exactly why the phase was designed without a listener.

## The Settings File, In The Real Window

`%APPDATA%\IdeaScape\settings.json` — the real file, at the path `settings-storage`, PRD §8.2
and design-system §9.11 all name, and the path the Settings page footer prints.

| Step                                                                                        | Result                                               |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A file holding all four non-default values was written and the debug window read it at boot | PASS                                                 |
| No `settings.json.tmp` sibling was left beside it                                           | PASS                                                 |
| The file was deleted, and the **release** bundle launched **with no arguments**             | PASS — the picker came up, no error, no dialog       |
| Reading a missing file did not create one                                                   | PASS — the folder held only `recent.json` afterwards |
| It is a **sibling** of `recent.json`, not part of it                                        | PASS                                                 |

The two halves of the write path are covered separately and meet in the middle: the file
logic (`write_settings_at` / `read_settings_at`, the atomic rename, the per-field fallback)
against real temp directories in `cargo test`, and `app_data_dir()`'s resolution to this
machine's real `%APPDATA%\IdeaScape` demonstrated by `recent.json` sitting there.

**Changing all four settings by hand on the Settings page, closing the application and
reopening it** is the third item handed to the owner's own pass. Every part of that round
trip is asserted — the control calls `setSetting`, `setSetting` sends a plain object with all
four values to `write_settings`, `write_settings` sanitizes and writes atomically, and
`read_settings` reads it back — but the five clicks themselves were not made by a hand.

## Design-System §15.4 Item 1, Closed

The last open question in the design system. It was a measurement task, and it was measured.

### The Four Dark Shadow Alphas

§15.4's interim rule — "same offsets and blur, black ink, roughly triple the alpha" — was
calibrated on the three shadows §4.5 **does** give on dark, whose light alphas are
.14 / .18 / .16. The four undrawn ones start at .30 and .12, where tripling overshoots and
in one case exceeds 1. §4.5's second rule caps the band — shadows do less separating work on
a dark ground — and the three drawn dark values occupy **.42 – .50**.

| Token                     | Light | Phase 1 interim | **Settled** | Why                                                                 |
| ------------------------- | ----- | --------------- | ----------- | ------------------------------------------------------------------- |
| `--shadow-context-menu`   | .30   | .62             | **.55**     | An overlay: keeps its light ordering by sitting just above the card |
| `--shadow-search-popover` | .30   | .62             | **.55**     | The same                                                            |
| `--shadow-toggle-knob`    | .30   | .62             | **.50**     | A 3 px blur on a small control: the top of the drawn band           |
| `--shadow-picker-card`    | .12   | .36             | **.42**     | §5.3 directs it to the card value, which on dark is .42             |

Offsets and blur are unchanged, as §15.4 requires. `--shadow-card-drag` (.58),
`--shadow-textbar` (.60) and `--shadow-dialog` (.70) are Phase 1 and Phase 4 project
additions rather than part of §15.4's four and keep their values — the dialog is the highest
surface in the product and its heavier ink is the correct ordering.

Asserted by `theme_theFourSettledShadows_useTheRecordedAlphas`, twice each — once per dark
block.

### The Two Unmeasured Contrast Pairs

Computed with the WCAG 2.1 relative-luminance and contrast-ratio formulas, from the hex
values read out of the token files rather than retyped, so a later palette edit that breaks
either pair fails the suite instead of shipping.

| Pair                                                              | Ratio     | Against 4.5:1 |
| ----------------------------------------------------------------- | --------- | ------------- |
| `--color-accent-2-400` #ff90b1 as ink on the dark surface #262322 | **7.3:1** | PASS          |
| `--color-on-accent` #151312 as ink on a #ff90b1 fill              | **8.7:1** | PASS          |

Both clear comfortably, so §12.9's open pair resolves **with no token change**.

§12.2's three dimming steps were measured at the same time and recorded rather than gated,
because the design has already committed to them: .42 / .40 / .38 of `--color-text` over
`--color-bg` come to **2.5 / 2.4 / 2.3** in light and **3.6 / 3.4 / 3.2** in dark.

(`contrast_accent2On400OnTheDarkSurface_clears4point5`,
`contrast_darkOnAccentInkOnTheDestructiveFill_clears4point5`,
`contrast_theThreeOpacitySteps_areMeasurableInBothPalettes`)

**Design-system §15.4 item 1 is closed**, and both halves want folding back into the
document by a later `dev-ui-update` run.

## The Dark-Theme Audit

The phase doc named **eleven** lines across nine components as "the whole surface of the
dark-theme audit". It was **eighteen**, and the doc's own Risks section predicted that
("budget for finding more than the eleven known lines"). The seven extra are the same defect
in the second accent ramp and in the accent tint row, and three of them are a **legibility
break rather than a cosmetic one**: `--color-accent-2-700` is used as the hover and pressed
fill under `--color-on-accent` ink, and on dark that is #151312 on #aa0b56 — about 2.4:1, so
hovering the Delete button, the destructive menu rows or the window close control made the
label disappear.

Fixed by the same mechanism, extended: **eight** role tokens rather than four, every light
value identical to the ramp step it replaces and every dark value an existing ramp step §4.5
has already blessed.

| Role token                   | Light (was)            | Dark    | Sites          |
| ---------------------------- | ---------------------- | ------- | -------------- |
| `--color-accent-text`        | #006786 (accent-700)   | #99e0ff | 4              |
| `--color-accent-hover`       | #1186ac (accent-600)   | #99e0ff | 6              |
| `--color-inset`              | #d7d3d3 (neutral-300)  | #302d2b | 3              |
| `--color-inset-hover`        | #bab6b6 (neutral-400)  | #3b3735 | 1 (the toggle) |
| `--color-accent-tint-hover`  | #cbeeff (accent-200)   | #004961 | 2              |
| `--color-accent-2-hover`     | #aa0b56 (accent-2-700) | #ffc0d0 | 4              |
| `--color-accent-2-tint-fill` | #fff1f4 (accent-2-100) | #4b1528 | 3              |
| `--color-accent-2-tint-text` | #aa0b56 (accent-2-700) | #ffc0d0 | 3              |

`--color-neutral-200` → `--color-raised` accounts for the remaining two sites and needed no
new token: §4.5 already maps raised fills to #302d2b on dark, and the light values are the
same colour.

The rule is now enforced rather than remembered:
`tokens_noComponent_referencesARampStepDirectly` walks every `.svelte`, `.css` and `.ts`
file under `src/features/`, plus `app.svelte` and `app.css`, and fails on any ramp step in a
style block. Only `tokens.css` and `theme.css` may name one.

All eight additions are **flagged for the owner** and want folding into design-system §4.4
and §4.5 by a later `dev-ui-update` run.

## Frame Rate With 250 Mixed Cards

`npm run tauri build -- --debug` produced `src-tauri/target/debug/ideascape.exe`, launched as
`ideascape.exe --project <scratch folder> --perf-gate`, **with a real settings file holding
`"theme": "dark"` and `"autoSaveMs": 1000`** — the dark palette and the fastest auto-save
cadence, which is the worst case for the one repeating timer this phase adds. The harness
opens its own project, seeds 250 mixed cards through `seed_mixed_cards` and sweeps the view
diagonally for 30 seconds at each zoom, moving every single frame.

### Result

| Pass      | Median   | 5th percentile | Median frame | Dropped frames | Cards | Drawn | Connections | Drawn |
| --------- | -------- | -------------- | ------------ | -------------- | ----- | ----- | ----------- | ----- |
| 100% zoom | 59.9 fps | 59.5 fps       | 16.7 ms      | 0 of 1,786     | 250   | 25    | 249         | 25    |
| 40% zoom  | 59.9 fps | 59.5 fps       | 16.7 ms      | 0 of 1,786     | 250   | 110   | 249         | 114   |

**Median: 59.9 fps, zero dropped frames.** Identical to Phase 4's 59.9 fps and to Phase 1's,
on the same machine and the same workload, and against the requirement "at or above Phase 4"
that is 59.9 ≥ 59.9.

### The Auto-Save Timer

This phase adds the first repeating timer in the product, and it is the one thing here that
could run during a pan. The measurement above was taken with it set to **1 000 ms** — three
times more often than the default — and the frame rate did not move by a tenth. It is why:
the timer's whole body is `if (pendingCount() === 0) return;`, and a diagonal sweep of the
view queues no placement geometry at all, so it returns immediately on every tick. During a
real drag it would flush, reusing the same idempotent multi-row transaction the drag-end
flush uses, which the drag then overwrites on release.

### Culling

The drawn count is the first number to read: if it were close to the total the cull would be
broken and the frame rate beside it would mean nothing.

- 100% zoom — **drawn 25 of 250** cards, 10%; 25 of 249 connections, 10%.
- 40% zoom — drawn 110 of 250 cards, 44%; 114 of 249 connections, 46%.

Identical to Phases 3 and 4. This phase added no card kind, touched no cull path, and adds no
per-frame work inside the transformed layer. `visiblePlacements` is still the one seam.

## Installer Size

`npm run tauri build` produced the NSIS installer:

|          |                                                                      |
| -------- | -------------------------------------------------------------------- |
| Artefact | `src-tauri/target/release/bundle/nsis/IdeaScape_0.1.0_x64-setup.exe` |
| Size     | 2,940,216 bytes — 2.80 MB                                            |
| Budget   | 20 MB                                                                |
| Headroom | 17.20 MB                                                             |
| Phase 4  | 2,931,992 bytes — this phase added 8,224 bytes, 0.008 MB             |

**No new npm package, no new Rust crate, no new migration and no new Tauri capability
permission** were added, which is why the figure barely moved: the 8 KB is one Rust command
module, three Svelte components, two small TypeScript modules and eight token declarations.
The four settings needed nothing `serde`, `serde_json` and `std::fs` did not already provide,
and both new controls are plain elements.

## What This Phase Hands Forward

Three things this gate could not do, all of them a human act rather than a missing assertion:

1. **Look at the dark theme.** Legibility and parity are enforced; taste is not.
2. **Toggle Windows between light and dark with the window open**, on the System setting.
3. **Change the four settings by hand, close the application and reopen it.**

Everything each of those would exercise is asserted by a named test. What they would add is
a pair of eyes.
