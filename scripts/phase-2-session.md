# Phase 2 Gate: Notes And Lines

The gate this phase exists to reach is a judgement rather than a number: "the application is
usable for real thinking work, with notes and lines only". This file is that gate turned
into a recorded artefact, the same way `scripts/perf-gate.md` records the frame rate — plus
a re-run of the frame measurement over a mixed canvas, because connections are new
per-frame work inside the transformed layer.

## How It Was Driven

This was an unattended run, so the session below was **scripted** rather than held by hand,
exactly as Phase 1 replaced a hand-held pan with a scripted one. Each numbered step is a
named test that fails on its own if that step breaks, so the transcript is re-runnable
rather than a claim:

- The data half — writes, deletes, the cascade capture, the id remapping, and the close and
  reopen — runs against **real SQLite in a temp folder, in the engine that ships**:
  `cargo test --manifest-path src-tauri/Cargo.toml gate_session`.
- The interaction half — the drawn line, the arrowhead, the endpoint geometry, the chip and
  its 50 px rule, the drag that writes no connection row, and undo and redo — runs against
  the real store and the real components:
  `npx vitest run src/features/connections/__tests__/connectionSession.test.ts`.
- The frame rate runs in the **real Tauri window**, on the debug build, launched as
  `ideascape.exe --project <scratch folder> --perf-gate`.

CLAUDE.md requires the frame gate be measured in the running application, and that is where
it was measured. The usability walk-through is asserted rather than eyeballed, which is a
harder standard than a hand session, not an easier one: a hand session cannot prove that a
card drag wrote nothing to the connection table, and this one does.

## Machine

|          |                                   |
| -------- | --------------------------------- |
| Date     | 2026-09-06                        |
| CPU      | Intel Core Ultra 9 185H           |
| Memory   | 15.7 GB                           |
| Graphics | Intel Arc Graphics                |
| Display  | 1920 × 1200 at 60 Hz              |
| OS       | Windows 11 Home 10.0.26200        |
| Renderer | WebView2 (Tauri 2, debug profile) |

## Frame Rate With Connections Drawn

250 seeded note cards **and 249 connections** — `seed_note_cards` now inserts one
connection per adjacent pair, so the harness measures a realistic mixed canvas rather than
cards alone. The view sweeps diagonally for 30 seconds at each zoom, moving every frame.

| Pass      | Median   | 5th percentile | Median frame | Dropped frames | Cards | Drawn | Connections | Drawn |
| --------- | -------- | -------------- | ------------ | -------------- | ----- | ----- | ----------- | ----- |
| 100% zoom | 59.9 fps | 59.5 fps       | 16.70 ms     | 0 of 1,786     | 250   | 36    | 249         | 31    |
| 40% zoom  | 59.9 fps | 59.5 fps       | 16.70 ms     | 0 of 1,786     | 250   | 165   | 249         | 164   |

**Median: 60 fps** — the display's own refresh ceiling, as in Phase 1. The raw 59.9 fps is
what a 16.70 ms median frame comes to on a 60 Hz panel; `requestAnimationFrame` cannot
report faster than the display refreshes. The figure that settles it is the one beside it:
**zero dropped frames** in 1,786 at each zoom, where a dropped frame is any frame exceeding
1.5 refresh intervals. Adding 249 lines and their arrowhead markers cost nothing measurable.

**Verdict: the frame target survives connections.** None of the three fallbacks the phase
doc lists — dropping chips below `LOW_ZOOM`, batching unselected lines into one `<path>`, or
reopening `rendering-approach` — was needed.

### Culling

The drawn count is the first number to read: if it were close to the total, the cull would
be broken and the frame rate beside it would mean nothing.

- 100% zoom — 31 of 249 connections drawn, 12%; 36 of 250 cards, 14%.
- 40% zoom — 164 of 249 connections, 66%; 165 of 250 cards, 66%. More of the world is on
  screen at that zoom, which is exactly what the low-zoom card treatment exists for.

Connections are culled on **the line's own bounding rectangle**, not on the visible card
set — a line between two off-screen cards can cross the middle of the viewport, and culling
on card visibility would wrongly drop it. `connectionInView` in
`src/lib/connectionGeometry.ts` is that check, and
`connectionInView_bothCardsOffScreenButTheLineCrossing_isTrue` pins the case.

## The Session

Twelve steps. Each is one named test; each is marked pass only because that test is green.

1. **Create several notes.** Four notes placed on an empty canvas; all four land and
   persist. — PASS (`step1_createSeveralNotes_theyAllLandOnTheCanvas`)
2. **Connect them.** Three lines drawn between adjacent pairs. Every line is written to the
   `connection` table immediately and every one is drawn. — PASS
   (`step2_connectThem_everyLineIsWrittenAndDrawn`, `gate_session`)
3. **Label three lines.** Each label reaches the row and each chip appears on its line's
   midpoint. — PASS (`step3_labelThreeLines_theChipsAppear`)
4. **Flip a direction.** Forward → Back on one line: the row's `directed` changes and the
   arrowhead moves from `marker-end` to `marker-start`, from the one shared marker. — PASS
   (`step4_flipADirection_theRowAndTheMarkerFollow`)
5. **Move a connected card.** The line's endpoints re-derive onto the card's new rectangle,
   and **no connection row is written** — the endpoints were never stored. — PASS
   (`step5_moveAConnectedCard_theLineFollowsAndNoConnectionRowIsWritten`)
6. **Zoom out past the 50 px threshold and back.** The chip is not drawn below 50 screen
   pixels of line length — not truncated, not shrunk, not offset — the label is kept on the
   row and in the panel, and it returns unchanged on zoom-in. — PASS
   (`step6_zoomOutPastFiftyPixelsAndBack_theChipGoesAndReturnsUnchanged`)
7. **Delete a connected card.** Both attached lines leave with it, and
   `delete_placements` reports each exactly once. — PASS
   (`step7_deleteAConnectedCard_bothItsLinesLeaveWithIt`,
   `delete_placements_reports_every_connection_it_removed`)
8. **Undo it.** The card comes back **and** both lines come back, re-pointed at the new
   placement id `restore_card` minted, with their labels and directions intact. — PASS
   (`step8_undoTheDelete_theCardAndBothLinesComeBackRemapped`, `gate_session`)
9. **Redo it.** The card and both lines go again, and the undo depth returns to where it
   started. — PASS (`step9_redoTheDelete_everythingGoesAgain`)
10. **Close and reopen the project.** Every line, label and direction is still there — the
    rows genuinely reached disk, through WAL, across a dropped connection. — PASS
    (`step10_closeAndReopenTheProject_everyLineComesBack`,
    `connection_survives_closing_and_reopening_the_project`)
11. **The rejected cases.** A card cannot connect to itself; a second connection between the
    same ordered pair selects the existing line rather than showing an error; the reverse
    pair is a different connection and is allowed. — PASS
    (`step11_theRejectedCases_bothCancelQuietly`)
12. **Delete a line on its own.** The line goes; both its cards stay. — PASS
    (`step12_deleteALineOnItsOwn_itLeavesAndTheCardsStay`)

Gate: usable for real thinking work with notes and lines — PASS

## Installer Size

`npm run tauri build` produced the NSIS installer with the connections feature in it:

|          |                                                                      |
| -------- | -------------------------------------------------------------------- |
| Artefact | `src-tauri/target/release/bundle/nsis/IdeaScape_0.1.0_x64-setup.exe` |
| Size     | 1,974,731 bytes — 1.88 MB                                            |
| Budget   | 20 MB                                                                |
| Headroom | 18.12 MB                                                             |
| Phase 1  | 1,966,711 bytes — connections added 8,020 bytes                      |

No npm package and no Rust crate was added this phase — SVG and CSS cover everything the
overlay draws, and the `connection` table already shipped in the first migration. The
figure is re-asserted by the Level 4 block in `docs/phases/phase-2-connections.html`.
