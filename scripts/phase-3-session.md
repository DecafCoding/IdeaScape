# Phase 3 Gate: Rich Cards

Two things this phase is judged on: every fetch- and asset-related failure renders as normal
UI rather than as a dialog, and the speed target still holds with 250 **mixed** cards. This
file is that gate turned into a recorded artefact, in the format `scripts/phase-2-session.md`
established.

## How It Was Driven

This was an unattended run, so the session below was **scripted** rather than held by hand,
exactly as Phase 1 replaced a hand-held pan with a scripted one and Phase 2 scripted its
usability walk-through. Each numbered step is a named test that fails on its own if that step
breaks, so the transcript is re-runnable rather than a claim:

- The network half — a host that does not answer, a page with no Open Graph tags, a responder
  slower than the budget, a non-HTML body — runs against a **real loopback `TcpListener`** on
  an ephemeral port, using `std::net` only. No test reaches the public internet:
  `cargo test --manifest-path src-tauri/Cargo.toml fetch::`.
- The asset half — content hashing, dedupe, the reference-counted delete, the trash, the
  restore, and a file deleted behind the application's back across a close and reopen — runs
  against **real SQLite and a real folder in a temp directory**, in the engine that ships:
  `cargo test --manifest-path src-tauri/Cargo.toml -- milestone1 step4`.
- The drawn half — the missing-file marker, the three link states, the video fallback, the
  paste ordering and the panel groups — runs against the real components and the real store:
  `npx vitest run src/features/cards src/features/shell`.
- The frame rate runs in the **real Tauri window**, on the debug bundle, launched as
  `ideascape.exe --project <scratch folder> --perf-gate`.

CLAUDE.md requires the frame gate be measured in the running application, and that is where it
was measured. The failure states are asserted rather than eyeballed, which is a harder standard
than a hand session: a hand session cannot prove that a fetch was cut off at a particular
number of seconds, or that no error path was taken, and these do.

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
| Renderer | WebView2 (Tauri 2, debug profile)        |

## The Session

Six steps. Each is marked pass only because a named test is green.

1. **No internet.** An address whose host never answers — a bound-then-closed loopback port —
   returns `Ok` with a not-fetched preview, in milliseconds, with no panic. Driving the same
   thing through the real paste path, the card appears at once showing the address, marked not
   fetched, with a Refetch button, and **no dialog and no shell message strip** appears: the
   test asserts `document.querySelector('.error')` is null. — PASS
   (`fetch_link_preview_for_a_closed_port_is_ok_and_not_fetched`,
   `paste_aFetchThatRejects_setsFailedAndStillShowsNoErrorStrip`)

2. **No preview data.** A local responder serving what `python -m http.server` serves for a
   directory — real HTML, a `<title>`, and no Open Graph tags at all — comes back
   `fetched: true` with `thumbnail_asset: null`. The card keeps the address, shows the title,
   and prints _No preview picture on this page_. — PASS
   (`step2_no_preview_data_a_page_with_no_open_graph_tags_is_fetched_with_no_thumbnail`,
   `linkCard_fetchedWithNoThumbnail_saysThereIsNoPreviewPictureAndDropsTheBand`)

3. **Slower than 5s.** A loopback responder that accepts the connection and then never writes
   a response. The five-second cut-off is a contract with a number in it, so the observed
   number is recorded rather than rounded: **the fetch gave up after 5.00 seconds** — written
   out by the test itself to `src-tauri/target/phase3-cutoff.txt` — and returned `Ok` with a
   not-fetched preview. The card flips to the failed state with the Refetch button enabled.
   One `tokio::time::timeout` covers the page request, the parse and the thumbnail and favicon
   downloads together, which is what makes "cut off after 5 seconds" literally true of the
   operation the user triggered rather than of one socket. — PASS
   (`fetch_link_preview_for_a_responder_slower_than_the_budget_gives_up_inside_seven_seconds`)

4. **Missing asset.** A picture is added, the project is closed, the file is deleted from
   `assets/` behind the application's back, and the project is reopened. The project opens, the
   item and its placement survive, the alt text survives, and the card keeps its authored
   320 × 200. The card then draws the §9.4 marker — dashed inset border, neutral ground,
   `ph-image-broken`, _File not found in assets/_ — at the same size as a present picture
   beside it, and the marker never reaches for the destructive second accent. The panel prints
   _Missing · the card is kept_ rather than a stale size, says nothing about where the original
   used to live, and keeps _Replace_ and _Show in folder_ enabled, because they are the fix.
   — PASS
   (`step4_missing_asset_deleting_the_file_and_reopening_keeps_the_item_and_its_alt_text`,
   `cardLayer_onePresentAndOneAbsentAsset_drawsThePictureAndTheMissingMarkerSideBySide`,
   `cardLayer_aMissingAsset_keepsTheCardAtItsAuthoredWidthAndHeight`,
   `panel_aMissingAsset_printsMissingTheCardIsKeptAndNoDimensions`,
   `panel_aMissingAsset_keepsReplaceAndShowInFolderEnabled`)

5. **YouTube fallback.** With no metadata to be had, the video card falls back to the address
   in place of the title, keeps the play badge over the empty band, and clicking it still opens
   the system browser — which is what the boundary table's YouTube row requires. No socket is
   opened to assert it: the oEmbed endpoint is a fixed public address, so the two halves that
   decide the fallback are asserted separately — the address is built and percent-encoded
   correctly, and a body that never arrived decodes to nothing, which is what leaves the payload
   not fetched. — PASS
   (`step5_youtube_fallback_no_body_leaves_the_preview_not_fetched`,
   `oembed_url_percent_encodes_a_question_mark_in_the_video_address`,
   `videoCard_notFetched_fallsBackToTheAddressAndKeepsThePlayBadge`,
   `videoCard_aStationaryClick_firesOnOpenOnce`)

6. **Project open.** Re-measured on the mixed 250-card canvas seeded by Task 17, inside the
   running window: reading 250 cards, their 249 connections and every asset name their payloads
   hold, in one status call rather than 250. **Project open: 0.017 s** against a two-second
   budget. Measured three times across three fresh scratch folders: 0.017 s, 0.018 s, 0.021 s.
   — PASS

Gate: PASS

## Frame Rate With 250 Mixed Cards

`npm run tauri build -- --debug` produced `src-tauri/target/debug/ideascape.exe`, launched as
`ideascape.exe --project <scratch folder> --perf-gate`. The harness seeds 250 mixed cards
through `seed_mixed_cards`, then sweeps the view diagonally for 30 seconds at each zoom, moving
every single frame.

### The Mix

`seed_mixed_cards` produces a realistic spread, asserted by
`seed_mixed_cards_for_two_hundred_and_fifty_gives_the_intended_mix_and_no_network`:

| Kind  | Cards | Share | Notes                                                          |
| ----- | ----- | ----- | -------------------------------------------------------------- |
| Note  | 100   | 40%   | Markdown bodies, as in Phase 1                                 |
| Image | 75    | 30%   | 70 drawing a real decoded bitmap, 5 drawing the missing marker |
| Link  | 50    | 20%   | 47 fetched with a preview band and favicon, 3 not fetched      |
| Video | 25    | 10%   | 22 fetched with a thumbnail band and play badge, 3 not fetched |

Every seeded picture is one real PNG copied in through `assets::copy_in`, which content-hash
dedupe reduces to a **single file** in `assets/` — asserted by the same test. The harness makes
no network call: the fetched link and video cards are seeded already-fetched against that local
asset, because the privacy rule forbids a call the user did not start.

### Result

| Pass      | Median   | 5th percentile | Median frame | Dropped frames | Cards | Drawn | Connections | Drawn |
| --------- | -------- | -------------- | ------------ | -------------- | ----- | ----- | ----------- | ----- |
| 100% zoom | 56.2 fps | 54.3 fps       | 17.8 ms      | 1 of 1,664     | 250   | 25    | 249         | 25    |
| 40% zoom  | 56.2 fps | 54.1 fps       | 17.8 ms      | 0 of 1,676     | 250   | 110   | 249         | 114   |

**Median: 56.2 fps.** That figure needs the control run beside it to mean anything, so one was
taken.

### The Control Run

The same harness, on the same machine, in the same session, seeding **notes only** — the exact
Phase 1 workload, which measured 59.9 fps and a 16.70 ms median frame:

| Pass      | Median          | Median frame   | Dropped frames | Drawn |
| --------- | --------------- | -------------- | -------------- | ----- |
| 100% zoom | 55.9 – 56.5 fps | 17.7 – 17.9 ms | 0 of ~1,675    | 25    |
| 40% zoom  | 55.9 – 56.5 fps | 17.7 – 17.9 ms | 0 of ~1,675    | 110   |

Notes alone measure the same 56 fps as the mixed canvas, to within run-to-run noise, and the
figure does not move between 25 drawn cards and 110. A number that is identical at two very
different workloads, and identical to a workload with no bitmaps in it at all, is not a
rendering cost — it is the cadence the display is presenting at.

`Win32_VideoController` on this machine reports `MinRefreshRate 40`, `MaxRefreshRate 60`: the
panel is **variable-refresh**, and `requestAnimationFrame` follows the panel. Phase 1 already
made the narrow version of this argument — "the raw 59.9 fps is what a 16.70 ms median frame
comes to on a 60 Hz panel; `requestAnimationFrame` cannot report faster than the display
refreshes" — and it extends one step: today the panel is presenting at about 56 Hz, so 56 fps
is the ceiling the measurement can express, whatever the renderer does.

The figure that settles the phase is the one beside it: **at most one dropped frame in 1,664**,
where a dropped frame is any frame exceeding 1.5 refresh intervals. Nothing missed a refresh.
Seventy decoded bitmaps, forty-seven preview bands, twenty-two thumbnails and five missing-file
markers inside the transformed layer cost nothing measurable against notes alone.

**Verdict: the speed target survives mixed content.** None of the four fallbacks the phase doc
lists was needed, and all four rungs were already in place before the measurement: the cull
counts are healthy (below), the low-zoom simplified branch is taken for all four kinds, and
`decoding="async"` and `loading="lazy"` are on every card image in `ImageCard`, `LinkCard` and
`VideoCard`. `rendering-approach` does not come back into question.

The one thing this artefact cannot claim is the literal number 60 on this hardware today. It is
recorded plainly rather than rounded up, and it is flagged in the pull request.

### Culling

The drawn count is the first number to read: if it were close to the total the cull would be
broken and the frame rate beside it would mean nothing.

- 100% zoom — **drawn 25 of 250** cards, 10%; 25 of 249 connections, 10%.
- 40% zoom — drawn 110 of 250 cards, 44%; 114 of 249 connections, 46%. More of the world is on
  screen at that zoom, which is exactly what the low-zoom card treatment exists for.

Image, link and video cards are culled through the same `visiblePlacements` seam as notes — they
are placements like any other — so no new cull path was added and none can drift.

## Installer Size

`npm run tauri build` produced the NSIS installer with the whole phase in it, including the two
largest crate trees the project will ever add:

|          |                                                                      |
| -------- | -------------------------------------------------------------------- |
| Artefact | `src-tauri/target/release/bundle/nsis/IdeaScape_0.1.0_x64-setup.exe` |
| Size     | 2,900,575 bytes — 2.77 MB                                            |
| Budget   | 20 MB                                                                |
| Headroom | 17.23 MB                                                             |
| Phase 2  | 1,974,731 bytes — this phase added 925,844 bytes, 0.88 MB            |

Four Rust crates were added — `reqwest` (with `rustls`), `scraper`, `url` and `blake3` — plus
the `tauri-plugin-dialog` and `tauri-plugin-opener` pairs and the `protocol-asset` Tauri
feature. `reqwest` is taken with `default-features = false, features = ["rustls-tls", "gzip"]`,
which is what keeps the native TLS stack out of the bundle. The phase doc named the installer
budget as the likeliest thing to break in this phase; at 14% of the cap it is comfortably clear,
and none of the escalation ladder — dropping `gzip`, hand-writing the `meta` scan in place of
`scraper`, reconsidering `deployment-target` — was needed.
