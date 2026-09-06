# Phase 1 Performance Gate

The hard gate this phase exists to reach: panning a canvas of 250 note cards holds 60
frames per second. CLAUDE.md requires it be measured in the running application, not in a
unit test — a green test suite does not clear it. This file is that recorded measurement.

## How It Was Measured

`npm run tauri build -- --debug` produced `src-tauri/target/debug/ideascape.exe`. The
binary was launched as:

```
ideascape.exe --project <scratch folder> --perf-gate
```

`--perf-gate` runs the harness in `src/lib/perfGate.ts` inside the real Tauri window. It
seeds 250 note cards through `seed_note_cards`, then pans the view continuously on a
diagonal sweep for 30 seconds at 100% zoom and again at 40%, so cards enter and leave the
view window throughout rather than the view settling on one static set. Every frame is
sampled through `requestAnimationFrame`; the drawn-card count comes from the culling
instrumentation the development overlay also reads. The result is written by
`record_perf_result` to `perf-gate-result.json` and transcribed here.

The scripted pan replaces a hand-held one because this was an unattended run. It is a
harder case than a hand pan, not an easier one: it moves the view every single frame for
the whole window, with no pauses.

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

## Result

| Pass      | Median   | 5th percentile | Median frame | Dropped frames | Cards | Drawn |
| --------- | -------- | -------------- | ------------ | -------------- | ----- | ----- |
| 100% zoom | 59.9 fps | 59.5 fps       | 16.70 ms     | 0 of 1,786     | 250   | 36    |
| 40% zoom  | 59.9 fps | 59.5 fps       | 16.70 ms     | 0 of 1,786     | 250   | 165   |

**Median: 60 fps** — the display's own refresh ceiling. The raw figure is 59.9 fps, which
is what a 16.70 ms median frame comes to on a 60 Hz panel; `requestAnimationFrame` cannot
report faster than the display refreshes, however fast the renderer is. The number that
actually settles the gate is therefore the one beside it: **zero dropped frames** in 1,786
at each zoom, where a dropped frame is any frame exceeding 1.5 refresh intervals. The
renderer never missed a frame.

**Verdict: the gate is cleared.** The per-card axis-aligned box check was enough; grid
buckets were not needed.

## Culling

The drawn count is the first number to read: if it were close to the total, the cull would
be broken and the frame rate beside it would be meaningless.

- 100% zoom — 36 of 250 cards in the page, 14%.
- 40% zoom — 165 of 250, 66%. More of the world is on screen at that zoom, which is what
  the low-zoom simplified card treatment exists for.

Culling method used: **the simple per-card axis-aligned box check**, against the viewport
rectangle expanded by a 200 px screen-space margin converted into world units
(`src/lib/culling.ts`). `docs/architecture.html` §11 directs building this first and moving
to fixed grid buckets only if the frame rate misses. It did not miss, so the fallback stays
unbuilt. `visiblePlacements` is the seam that swap would happen behind if a later phase
needs it.

## Installer Size

`npm run tauri build` produced the NSIS installer:

|          |                                                                      |
| -------- | -------------------------------------------------------------------- |
| Artefact | `src-tauri/target/release/bundle/nsis/IdeaScape_0.1.0_x64-setup.exe` |
| Size     | 1,966,711 bytes — 1.88 MB                                            |
| Budget   | 20 MB                                                                |
| Headroom | 18.12 MB                                                             |

WebView2 is in `downloadBootstrapper` mode, which is what keeps the figure this small: the
runtime already ships with Windows 11. The release profile is tuned for size —
`opt-level = "s"`, LTO, one codegen unit, `panic = "abort"`, symbols stripped.

The vendored assets inside that installer are the three Source Serif 4 latin faces and the
Phosphor regular icon font, woff2 only. The Phosphor package also ships `.ttf`, `.woff` and
a 3 MB `.svg` fallback; a plugin in `vite.config.ts` drops all three from the bundle,
because WebView2 reads woff2 and the svg alone was one sixth of the whole budget.

## Markdown Renderer Bundle Cost

`marked` plus `dompurify`, the pair `docs/architecture.html` §11 delegated to this phase.

|                             |                       |
| --------------------------- | --------------------- |
| Front-end bundle, gzipped   | 54.5 kB               |
| Of which marked + dompurify | roughly 40 kB gzipped |

Both sit behind `src/lib/markdown.ts`, so replacing either is a one-file change.
