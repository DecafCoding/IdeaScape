//! The shipped vocabulary — the six lists a Pick or Pick Many field offers.
//!
//! Extracted once from the Book Guides library by `scripts/extract-lists.mjs`, committed to
//! `src-tauri/data/lists/`, embedded here with `include_str!` and parsed once behind a
//! `OnceLock`. The script runs by hand and never as part of the build, so a machine without
//! the library still builds the installer.
//!
//! An entry carries an `id` and a `text` and nothing else. `tags` holds the ids of the
//! parent list entries it sorts under — the one-hop filter's whole input. Never a
//! description, an alias, a relationship or an example: that trim is what keeps 669 KB of
//! source down to about 64 KB embedded.
//!
//! A shipped entry's `id` is `Some`. A value the user typed carries `None` permanently, and
//! that absence is what marks it as theirs.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListEntry {
    /// The library's own permanent id, or `None` for a value the user typed.
    #[serde(default)]
    pub id: Option<String>,
    pub text: String,
    /// The ids of the parent list entries this entry sorts under. Empty is normal: an
    /// untagged entry sorts below a filtered group and is never hidden.
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ListFile {
    #[allow(dead_code)]
    list: String,
    entries: Vec<ListEntry>,
}

const LIST_JSON: [(&str, &str); 6] = [
    ("genres", include_str!("../../data/lists/genres.json")),
    ("subgenres", include_str!("../../data/lists/subgenres.json")),
    (
        "story-tropes",
        include_str!("../../data/lists/story-tropes.json"),
    ),
    (
        "character-tropes",
        include_str!("../../data/lists/character-tropes.json"),
    ),
    ("themes", include_str!("../../data/lists/themes.json")),
    (
        "points-of-view",
        include_str!("../../data/lists/points-of-view.json"),
    ),
];

fn parsed() -> &'static Vec<(&'static str, Vec<ListEntry>)> {
    static CELL: OnceLock<Vec<(&'static str, Vec<ListEntry>)>> = OnceLock::new();
    CELL.get_or_init(|| {
        LIST_JSON
            .iter()
            .map(|(id, json)| {
                let file: ListFile = serde_json::from_str(json)
                    .unwrap_or_else(|e| panic!("shipped list {id} is malformed: {e}"));
                (*id, file.entries)
            })
            .collect()
    })
}

/// The shipped entries for one list. An unknown list name is empty rather than an error —
/// a blueprint naming a list that does not ship is caught by a test, not at runtime.
pub fn shipped(list: &str) -> &'static [ListEntry] {
    parsed()
        .iter()
        .find(|(id, _)| *id == list)
        .map(|(_, entries)| entries.as_slice())
        .unwrap_or(&[])
}

/// Every shipped list's name, for tests and for the size assertion.
pub fn names() -> Vec<&'static str> {
    LIST_JSON.iter().map(|(id, _)| *id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_shipped_list_parses_and_is_not_empty() {
        for name in names() {
            assert!(!shipped(name).is_empty(), "{name} ships no entries");
            for entry in shipped(name) {
                assert!(!entry.text.is_empty(), "{name} has an entry with no text");
                assert!(
                    entry.id.as_deref().is_some_and(|id| !id.is_empty()),
                    "{name} has a shipped entry with no id"
                );
            }
        }
    }

    #[test]
    fn genres_has_eight_entries() {
        assert_eq!(shipped("genres").len(), 8);
    }

    #[test]
    fn subgenres_has_forty_five_entries() {
        // The library file holds 51, six of them `proposed`. Only the ratified 45 ship.
        assert_eq!(shipped("subgenres").len(), 45);
    }

    fn genre_ids() -> HashSet<String> {
        shipped("genres")
            .iter()
            .filter_map(|e| e.id.clone())
            .collect()
    }

    #[test]
    fn every_subgenre_tag_names_a_real_genre_entry() {
        let genres = genre_ids();
        for entry in shipped("subgenres") {
            assert_eq!(entry.tags.len(), 1, "{} has no single class", entry.text);
            for tag in &entry.tags {
                assert!(genres.contains(tag), "{} names unknown genre {tag}", entry.text);
            }
        }
    }

    #[test]
    fn every_story_trope_tag_names_a_real_genre_entry() {
        let genres = genre_ids();
        let mut tagged = 0;
        for entry in shipped("story-tropes") {
            if !entry.tags.is_empty() {
                tagged += 1;
            }
            for tag in &entry.tags {
                assert!(genres.contains(tag), "{} names unknown genre {tag}", entry.text);
            }
        }
        assert_eq!(shipped("story-tropes").len(), 259);
        assert!(tagged > 0, "the roll-up produced no tags at all");
    }

    #[test]
    fn no_shipped_entry_carries_a_description_or_an_alias() {
        // The trim is what keeps the embedded size down, so it is asserted against the raw
        // JSON rather than against the parsed struct, which would drop extras silently.
        for (name, json) in LIST_JSON {
            for banned in ["\"description\"", "\"aliases\"", "\"relationships\"", "\"examples\""] {
                assert!(
                    !json.contains(banned),
                    "{name} carries {banned}; re-run the extraction script with the field trim"
                );
            }
        }
    }

    #[test]
    fn the_shipped_lists_are_under_256_kilobytes() {
        // The installer cap is 20 MB and Phase 5 measured 2.80 MB, so the real headroom is
        // enormous. This assertion catches someone re-running the extraction script without
        // the field trim, which would embed about 725 KB of prose.
        let total: usize = LIST_JSON.iter().map(|(_, json)| json.len()).sum();
        assert!(total < 256 * 1024, "the shipped lists are {total} bytes");
    }

    #[test]
    fn character_tropes_and_themes_have_their_expected_counts() {
        assert_eq!(shipped("character-tropes").len(), 151);
        assert_eq!(shipped("themes").len(), 41);
        assert_eq!(shipped("points-of-view").len(), 5);
    }
}
