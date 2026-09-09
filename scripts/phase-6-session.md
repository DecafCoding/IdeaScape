# Phase 6 Gate: The Writing Pack

PRD §11's Phase 6 gate, measured in the running application rather than claimed from a green
suite. This file is that gate turned into a recorded artefact, in the format
`scripts/phase-5-session.md` established.

Phase 6 is the first feature that has ever made a **card face more expensive** — chips are new
work per card — so the frame gate here is the real risk and not a formality.

## How It Was Driven

This was an unattended run, so the walk below is **scripted** rather than held by hand, the
same substitution every phase since Phase 1 has made. Every line is marked PASS only because a
**named test is green** or a **measurement was taken in the real window**:

- The three migrations — including the one that rebuilds a table holding the user's work —
  run against **real SQLite files in real temp directories**, through the same
  `open_project_db` the shipped binary uses:
  `cargo test --manifest-path src-tauri/Cargo.toml migration`.
- The card types, the shipped lists, the payload, the corrected delete rule, the role column,
  Expand Into A Canvas and the fourth search pass run against **real project folders**:
  `cargo test --manifest-path src-tauri/Cargo.toml`.
- The drawn half — the generated panel, the seven field controls, the combo, the card face,
  the rail's Cards group, the role on the line and the three sheets — runs against the **real
  components** with the IPC seam mocked: `npx vitest run`.
- The frame rate, the culling counts and the project-open time were measured in the **real
  Tauri window**: the debug bundle as
  `ideascape.exe --project <scratch folder> --perf-gate --perf-gate-writing`.
- The installer size is the **release** bundle, which is the artefact the 20 MB budget applies
  to. The debug bundle is not measured for it.

### What Was Not Driven By Eye

Two things in this phase cannot be reduced to an assertion, and they are named here rather
than papered over:

- **Nobody looked at the writing-pack screens on a display.** What replaces that is the same
  structural enforcement Phase 5 recorded: no component under `src/features/` or
  `src/lib/fields/` may name a ramp step or a hex literal, every measurement comes from a
  token, and the locked §8.3/§9.25 values are asserted against the component source where
  jsdom cannot resolve them. That catches "a value was invented"; it cannot catch "the result
  is ugly". **That judgement is left for the repository owner's own pass.**
- **No packet capture was run.** What replaces it is stronger in one respect: the greps below
  prove there is no code that _could_ make a call. `reqwest` appears nowhere outside
  `src-tauri/src/fetch/`, which this phase does not touch, and `fetch(`, `XMLHttpRequest` and
  `WebSocket` appear nowhere in `src/` at all. Randomize is `Math.random` behind an injected
  generator, and the shipped lists are embedded in the binary. **Network requests: 0**, by
  construction rather than by observation.

## Machine

|          |                                          |
| -------- | ---------------------------------------- |
| Date     | 2026-09-08                               |
| CPU      | Intel Core Ultra 9 185H                  |
| Memory   | 15.7 GB                                  |
| Graphics | Intel Arc Graphics                       |
| Display  | 1920 × 1200, variable refresh 40 – 60 Hz |
| Power    | On mains                                 |
| OS       | Windows 11 Home 10.0.26200               |
| Renderer | WebView2 (Tauri 2, debug and release)    |

## The PRD §11 Phase 6 Gate

1. **A project made in Phases 1–5 opens in a Phase 6 build with everything intact, and
   `PRAGMA foreign_key_check` returns nothing.** — PASS
   The phase's single most important test builds a project folder through the **first six
   migrations only**, fills it with all four card kinds, placements and connections carrying
   labels, styles, anchors and a bend, then reopens the folder so 0007–0009 run in sequence.
   Every item row comes back byte-identical, all four placements survive, the styled
   connection keeps its label, colour, route, anchor and bend, `foreign_key_check` returns no
   rows and `PRAGMA foreign_keys` reads 1.
   (`migrations_0007_to_0009_open_a_phase_five_project_intact`,
   `migration_0007_keeps_every_item_row_and_its_placements`,
   `migration_0007_leaves_foreign_keys_on_and_the_check_clean`,
   `placement_referencing_a_missing_canvas_is_rejected`)

   Worth recording: the first run of
   `migration_0007_keeps_every_item_row_and_its_placements` **failed**, reporting 0
   placements where 4 were expected. rusqlite's bundled SQLite defaults `foreign_keys` to ON,
   so `DROP TABLE item` really did fire `placement`'s cascade and empty the project. The
   pragma order in `db/connection.rs` is not tidiness — the test proves it is the whole safety
   of the migration.

2. **All seven card types — Book, Chapter, Scene, Beat, Character, Location and the unchanged
   Note — can be added from the rail's Writing Pack submenu and from the keys 2–7, filled,
   saved, reopened and deleted.** — PASS
   (`all_six_shipped_blueprints_parse`, `create_blueprint_card_with_no_fields_is_valid_and_reopens`,
   `leftColumn_theWritingPackSubmenuPrintsTheKeys2To7FromShortcutLabels`,
   `matchAction_theKeys2To7_returnTheSixWritingActions`)

3. **A card saves with only its default name; no field is ever required.** — PASS
   (`validate_payload_a_blueprint_card_needs_no_field_at_all`,
   `create_blueprint_card_with_no_fields_is_valid_and_reopens`)

4. **All seven field kinds round-trip through the payload.** — PASS
   (`set_item_field_writes_one_key_and_leaves_the_others`,
   `set_item_field_a_null_value_removes_the_key`,
   `set_item_field_name_and_detail_canvas_id_are_top_level`,
   `panel_aCharacterCard_drawsOneControlPerFieldInBlueprintOrder`)

5. **A typed list value is accepted, saved and offered again; it carries no id and no source,
   permanently.** — PASS
   (`add_list_entry_a_new_value_is_offered_next_time`,
   `add_list_entry_the_same_value_twice_writes_one_row`,
   `combo_aValueNotInTheList_offersUseItAndCommitsAnEntryWithNoIdAndNoSources`,
   `combo_blurWithTypedText_commitsRatherThanDiscarding`)

6. **A filtered list sorts and never hides an entry.** — PASS
   (`sortForFilter_returnsTheSameNumberOfEntriesItWasGiven`,
   `sortForFilter_anUntaggedEntry_sortsBelowButIsStillPresent`,
   `groupForFilter_hidesNothing`,
   `combo_withAParentValue_headsTheFirstGroupWithTheParentAndTheSecondWithEverythingElse`)

7. **All five sliders default to 0, all-zero is a real saved state, and Randomize never
   produces a flat spread over 10,000 runs.** — PASS
   The 10,000-run assertion runs in **478 ms**.
   (`rollSpread_overTenThousandRuns_neverLeavesEveryValueInsideMinusOneToPlusOne`,
   `rollScale_overALargeSample_matchesTheWeights1_3_6_8_6_3_1WithinTolerance`,
   `scaleField_withNoStoredValue_readsZeroAndDrawsNoEmptyState`,
   `session_undoAfterRandomize_restoresAllFiveInOneStepAndChangesNoOtherField`)

8. **Any card type joins any other. No pair is refused.** — PASS
   (`suggestRole_beatToChapter_isFeedsAndIsNeverRefused`,
   `update_connection_can_change_any_role_to_any_other`,
   `panel_typingARole_isAcceptedAndStored`)

9. **A connection made before Phase 6 draws with no role glyph and looks byte-for-byte as it
   did.** — PASS
   (`an_existing_connection_still_reads_role_null`,
   `connectionLayer_aNullRole_drawsNoMarkAtAll`,
   `connectionLayer_aRelatesToRole_drawsNoMarkEither`,
   `connectionLabels_noRole_leavesTheLabelExactlyWhereItAlwaysWas`,
   `roleLabel_partOfReversed_readsContains`)

10. **Expand Into A Canvas creates a canvas holding the same item; a cycle saves, reopens and
    navigates.** — PASS
    (`expand_into_canvas_creates_a_canvas_holding_the_same_item`,
    `expand_into_canvas_editing_either_placement_edits_one_item`,
    `expand_into_canvas_a_cycle_between_two_canvases_saves_and_reopens`,
    `delete_canvas_clears_detail_canvas_id_on_every_card_that_pointed_at_it`,
    `restore_canvas_puts_the_detail_pointers_back`)

11. **Deleting the last placement of a Character keeps the Character.** — PASS
    (`delete_placements_last_placement_of_a_blueprint_keeps_the_item`,
    `delete_canvas_leaves_every_blueprint_item_in_the_project`,
    `the_corrected_lifecycle_keeps_a_reused_character_and_still_trashes_a_picture`,
    `unplacedList_afterTheLastPlacementOfACharacterIsDeleted_showsTheCharacter`)

12. **Deleting the last placement of an image still deletes the item and its picture file.
    The rule for note, image, link and video is unchanged.** — PASS
    (`delete_placements_last_placement_of_an_item_removes_the_item` — the shipped test,
    unchanged and still green; `delete_placements_an_image_beside_a_blueprint_still_loses_its_file`)

13. **Search finds a writing card by name and by a phrase inside a Long Text field; canvas
    names still rank first.** — PASS
    (`search_finds_a_blueprint_card_by_its_name`,
    `search_finds_a_chapter_by_a_phrase_inside_its_prose`,
    `search_does_not_return_a_chapter_for_the_word_prose`,
    `search_still_ranks_canvas_names_first`,
    `search_a_term_holding_a_wildcard_still_escapes_on_the_fourth_pass`)

14. **Editing a card on its sheet and in the panel produce the same payload and the same
    single undo entry.** — PASS
    (`session_editingAFieldOnTheSheetAndInThePanel_produceTheSamePayload`,
    `characterSheet_editingTheNameHere_writesThroughTheSameOneFieldPath`)

15. **Undo covers every new action.** — PASS
    (`session_setFieldCommand_undoPutsThePreviousValueBackOnDisk`,
    `session_randomize_writesFiveFieldsAndIsOneUndoEntry`,
    `unplacedList_deleteForGood_callsDeleteItemAndReturnsTheEffectForOneUndoCommand`,
    `restore_connection_puts_the_role_back`, `restore_canvas_puts_the_detail_pointers_back`)

16. **_Show Writing Cards_ is the seventh Settings row in a full-width Packs group, default
    on; a `settings.json` with no such key reads as on.** — PASS
    (`read_settings_at_a_phase_five_file_with_no_show_writing_cards_key_reads_as_on`,
    `write_settings_writes_six_keys`, `settingsPage_hasASeventhRowInAFullWidthPacksGroup`,
    `leftColumn_withShowWritingCardsOff_doesNotDrawTheWritingPackParentAtAll`,
    `leftColumn_withShowWritingCardsOff_keepsGeneralAsASubmenu`)

17. **Gate: 250 writing cards carrying chips pan at 60 fps, at 100% and 40% zoom, with zero
    dropped frames and a drawn count well under the total.** — PASS. Numbers below.

18. **Gate: the NSIS installer stays under 20 MB with the shipped lists inside it.** — PASS.
    Numbers below.

19. **A Long Text field can never run script.** — PASS
    The prose renders through `renderMarkdown`, the same sanitised path a note body uses, and
    `{@html}` appears **exactly twice** in the source — on the note body and on the chapter
    prose. (`chapterSheet_scriptInTheProse_isSanitisedAndNeverRuns`)

20. **Esc leaves a sheet, and inside a text field blurs the field first.** — PASS
    (`sheetShortcuts_escWithNoTextFocus_leavesTheSheet`,
    `sheetShortcuts_escInsideATextBox_blursItAndKeepsTheSheetOpen`,
    `sheetShortcuts_escTwiceFromATextBox_leavesTheSheet`)

## Frame Rate — 250 Writing Cards

Run on the debug bundle in the real window:

```
ideascape.exe --project <scratch> --perf-gate --perf-gate-writing
```

The seed is a realistic **worst** case, not an easy one: the six types in rotation, **every
Pick Many field filled to six entries against a face limit of four**, so every face carries
chips _and_ a `+n` overflow pill; every Image field pointing at the one real content-hashed
asset, with five pointing at a deliberately absent name so the missing-file marker is on
screen throughout; and 249 connections **each carrying a role**, so the role affordance is
measured with everything else.

The two passes, the 30-second diagonal sweep and the dropped-frame definition are unchanged
from Phase 1, so this number is directly comparable with it.

**Read the drawn count first**, because a run that draws most of the set means the cull broke
on the new card and the frame rate beside it is meaningless. Drawn: 25 of 250 at 100% zoom,
and 113 of 250 at 40%.

| Pass      | Drawn          | Connections drawn | Median   | 5th pct  | Median frame | Dropped | Frames |
| --------- | -------------- | ----------------- | -------- | -------- | ------------ | ------- | ------ |
| 100% zoom | **25 of 250**  | 25 of 249         | 59.9 fps | 59.5 fps | 16.7 ms      | **0**   | 1,786  |
| 40% zoom  | **113 of 250** | 115 of 249        | 59.9 fps | 59.5 fps | 16.7 ms      | **0**   | 1,786  |

Both drawn counts are well under half the total, so the cull works on a writing card exactly
as it does on a note. Phase 1 recorded 36 of 250 at 100% and 165 at 40% on the mixed set; the
writing cards are larger on average, so fewer fit the window — the shape of the result is the
same.

**Gate: PASS.** 250 cards, median 59.9 fps at both zooms.

- Dropped frames: 0 of 3,572 sampled.
- Network requests: 0.

Project open on the 250-card writing canvas: **44 ms** against the 2,000 ms budget (the canvas
read alone inside that is 34 ms). Phase 5 recorded 35 ms and 20 ms on the mixed set.

## Installer

| Build                    | Bytes         | MB       |
| ------------------------ | ------------- | -------- |
| Phase 5 release NSIS     | 2,940,216     | 2.80     |
| **Phase 6 release NSIS** | **3,227,223** | **3.08** |
| Budget                   | 20,971,520    | 20.00    |

The whole writing pack costs **287,007 bytes**, of which the six blueprints and six shipped
lists are 71,026 bytes on disk — 259 story tropes, 151 character tropes, 45 sub-genres, 41
themes, 8 genres and 5 points of view, carrying an id and a text and nothing else. The
`no_shipped_entry_carries_a_description_or_an_alias` assertion is what keeps that true: with
the library's descriptions, aliases, relationships and examples left in, the same six files
would be about 725 KB.

The release bundle references no external asset (`url(https:…)` appears nowhere in the built
CSS), so it is still self-contained.

## Structural Checks

Run against the working tree at the tip of `phase-6-writing-pack`:

| Check                                                            | Result                                |
| ---------------------------------------------------------------- | ------------------------------------- |
| Every new command registered in **both** handler lists           | ok — 9 commands                       |
| The two debug-only commands registered **once**                  | ok                                    |
| Migration count                                                  | 9                                     |
| Migrations 0001–0006 untouched                                   | ok                                    |
| `foreign_keys` OFF around the run, ON after, `foreign_key_check` | ok                                    |
| Shipped data committed                                           | ok                                    |
| Shipped data size                                                | 71,026 bytes (cap 262,144)            |
| The extraction script is never part of the build                 | ok                                    |
| No card type named in a generated component                      | ok                                    |
| Import direction (`features` never import each other)            | ok                                    |
| `lib/` and `stores/` name no feature                             | ok                                    |
| No `reqwest` outside `src-tauri/src/fetch/`                      | ok                                    |
| No `fetch(` / `XMLHttpRequest` / `WebSocket` in `src/`           | ok                                    |
| `{@html}` occurrences in shipped source                          | 2 (note body, chapter prose)          |
| No ramp step or hex literal in a component                       | ok                                    |
| Menus derive their keys from `SHORTCUT_LABELS`                   | ok                                    |
| No `console.log`, no `println!`                                  | ok                                    |
| New dependencies                                                 | **none** — no diff to either manifest |

`@tauri-apps/api/core` appears outside `lib/ipc.ts` in exactly two files, `ipc.test.ts` and
`settings.test.ts`, where it is the mocked module. Both predate this phase; no shipped source
reaches past the seam.

## Suite

| Suite                                             | Result               |
| ------------------------------------------------- | -------------------- |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 223 passed, 0 failed |
| `npx vitest run`                                  | 832 passed, 0 failed |
| `npm run check`                                   | 0 errors, 0 warnings |
| `cargo clippy -- -D warnings`                     | clean                |
| `cargo fmt -- --check`                            | clean                |
| `npx prettier --check .`                          | clean                |
