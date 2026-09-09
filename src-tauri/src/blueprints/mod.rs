//! The blueprint registry — the card types as read-only data embedded in the binary.
//!
//! A blueprint is a list of fields. The six shipped types live as JSON in
//! `src-tauri/data/blueprints/`, are pulled in with `include_str!`, parsed once behind a
//! `OnceLock`, and handed to the front end by `commands::blueprint::list_blueprints`. One
//! source of truth: the front end never carries a second copy, and
//! `src/lib/blueprints.svelte.ts` is the mirrored reader, not a mirrored dataset.
//!
//! Rust asks a blueprint only two questions — which of its field keys are Long Text (for
//! search) and which are Image (for `asset_names`). Everything else about a field is drawn,
//! and drawing is the front end's job.
//!
//! A malformed data file PANICS with the file name. It is shipped data, not user data: a
//! broken file is a build defect and must never become a runtime error the user sees.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

pub mod lists;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FieldKind {
    ShortText,
    LongText,
    Pick,
    PickMany,
    Image,
    Number,
    Scale,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

/// One field on a card type. Every optional member carries `#[serde(default)]`, so a data
/// file that omits `filter_by` — most of them do — still parses.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Field {
    pub key: String,
    pub label: String,
    pub kind: FieldKind,
    pub meaning: String,
    #[serde(default)]
    pub show_on_face: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub list: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub low: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub high: Option<String>,
    #[serde(default)]
    pub randomizable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Blueprint {
    pub id: String,
    pub label: String,
    pub glyph: String,
    #[serde(default)]
    pub sheet: bool,
    pub default_size: Size,
    pub fields: Vec<Field>,
}

const BLUEPRINT_JSON: [(&str, &str); 6] = [
    ("book.json", include_str!("../../data/blueprints/book.json")),
    (
        "chapter.json",
        include_str!("../../data/blueprints/chapter.json"),
    ),
    ("scene.json", include_str!("../../data/blueprints/scene.json")),
    ("beat.json", include_str!("../../data/blueprints/beat.json")),
    (
        "character.json",
        include_str!("../../data/blueprints/character.json"),
    ),
    (
        "location.json",
        include_str!("../../data/blueprints/location.json"),
    ),
];

/// Every shipped card type, in menu order. Parsed once.
pub fn all() -> &'static [Blueprint] {
    static CELL: OnceLock<Vec<Blueprint>> = OnceLock::new();
    CELL.get_or_init(|| {
        BLUEPRINT_JSON
            .iter()
            .map(|(name, json)| {
                serde_json::from_str::<Blueprint>(json)
                    .unwrap_or_else(|e| panic!("shipped blueprint {name} is malformed: {e}"))
            })
            .collect()
    })
}

pub fn get(id: &str) -> Option<&'static Blueprint> {
    all().iter().find(|blueprint| blueprint.id == id)
}

fn keys_of(id: &str, kind: FieldKind) -> Vec<&'static str> {
    match get(id) {
        None => Vec::new(),
        Some(blueprint) => blueprint
            .fields
            .iter()
            .filter(|field| field.kind == kind)
            .map(|field| field.key.as_str())
            .collect(),
    }
}

/// The keys of every Long Text field on a blueprint — the fields search reads.
pub fn long_text_keys(id: &str) -> Vec<&'static str> {
    keys_of(id, FieldKind::LongText)
}

/// The keys of every Image field on a blueprint — the fields `asset_names` reads, which is
/// what makes content-hash dedupe, reference counting and trashing work with no change to
/// the assets module.
pub fn image_keys(id: &str) -> Vec<&'static str> {
    keys_of(id, FieldKind::Image)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_kind_parses_from_kebab_case() {
        let kind: FieldKind = serde_json::from_str("\"pick-many\"").unwrap();
        assert_eq!(kind, FieldKind::PickMany);
        let kind: FieldKind = serde_json::from_str("\"short-text\"").unwrap();
        assert_eq!(kind, FieldKind::ShortText);
    }

    #[test]
    fn blueprint_with_no_optional_members_parses() {
        let json = r#"{
          "id": "x", "label": "X", "glyph": "note",
          "default_size": { "width": 100, "height": 50 },
          "fields": [
            { "key": "name", "label": "Name", "kind": "short-text", "meaning": "the name." }
          ]
        }"#;
        let blueprint: Blueprint = serde_json::from_str(json).expect("parses");
        assert!(!blueprint.sheet);
        assert_eq!(blueprint.fields[0].list, None);
        assert_eq!(blueprint.fields[0].filter_by, None);
        assert!(!blueprint.fields[0].show_on_face);
        assert!(!blueprint.fields[0].randomizable);
    }

    #[test]
    fn all_six_shipped_blueprints_parse() {
        let list = all();
        assert_eq!(list.len(), 6);
        let ids: Vec<&str> = list.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["book", "chapter", "scene", "beat", "character", "location"]
        );
        for blueprint in list {
            assert!(!blueprint.fields.is_empty(), "{} has no field", blueprint.id);
            assert!(blueprint.default_size.width > 0.0);
            assert!(blueprint.default_size.height > 0.0);
            for field in &blueprint.fields {
                assert!(!field.key.is_empty());
                assert!(!field.label.is_empty());
                assert!(
                    !field.meaning.is_empty(),
                    "{}.{} has no meaning line",
                    blueprint.id,
                    field.key
                );
            }
        }
    }

    #[test]
    fn no_long_text_field_is_shown_on_a_card_face() {
        // A wall of prose on a 264px tile is what breaks the frame gate. Keep this when an
        // eighth card type is added.
        for blueprint in all() {
            for field in &blueprint.fields {
                if field.kind == FieldKind::LongText {
                    assert!(
                        !field.show_on_face,
                        "{}.{} is long-text and marked show_on_face",
                        blueprint.id, field.key
                    );
                }
            }
        }
    }

    #[test]
    fn every_pick_field_names_a_shipped_list() {
        for blueprint in all() {
            for field in &blueprint.fields {
                if matches!(field.kind, FieldKind::Pick | FieldKind::PickMany) {
                    let list = field
                        .list
                        .as_deref()
                        .unwrap_or_else(|| panic!("{}.{} names no list", blueprint.id, field.key));
                    assert!(!list.is_empty());
                    assert!(
                        !lists::shipped(list).is_empty(),
                        "{}.{} names list {list}, which ships no entries",
                        blueprint.id,
                        field.key
                    );
                }
            }
        }
    }

    #[test]
    fn every_filter_by_names_an_earlier_pick_field_on_the_same_blueprint() {
        // One hop only. A chain is not allowed, and the parent must itself be a Pick.
        for blueprint in all() {
            for (index, field) in blueprint.fields.iter().enumerate() {
                let Some(parent_key) = field.filter_by.as_deref() else {
                    continue;
                };
                let parent = blueprint.fields[..index]
                    .iter()
                    .find(|f| f.key == parent_key)
                    .unwrap_or_else(|| {
                        panic!(
                            "{}.{} filters by {parent_key}, which is not an earlier field",
                            blueprint.id, field.key
                        )
                    });
                assert_eq!(
                    parent.kind,
                    FieldKind::Pick,
                    "{}.{} filters by {parent_key}, which is not a Pick",
                    blueprint.id,
                    field.key
                );
            }
        }
    }

    #[test]
    fn every_scale_field_carries_two_end_words() {
        for blueprint in all() {
            for field in &blueprint.fields {
                if field.kind == FieldKind::Scale {
                    assert!(
                        field.low.as_deref().is_some_and(|w| !w.is_empty()),
                        "{}.{} has no low word",
                        blueprint.id,
                        field.key
                    );
                    assert!(
                        field.high.as_deref().is_some_and(|w| !w.is_empty()),
                        "{}.{} has no high word",
                        blueprint.id,
                        field.key
                    );
                }
            }
        }
    }

    #[test]
    fn long_text_keys_for_character_are_description_and_notes() {
        assert_eq!(long_text_keys("character"), vec!["description", "notes"]);
    }

    #[test]
    fn image_keys_for_character_is_the_picture() {
        assert_eq!(image_keys("character"), vec!["picture"]);
        assert!(image_keys("beat").is_empty());
    }
}
