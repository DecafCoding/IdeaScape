//! Blueprint cards — the writing pack's item lifecycle.
//!
//! `list_blueprints` hands the shipped card types to the front end once at boot; everything
//! else here reads or writes one `blueprint` item. The card *type* lives inside the payload,
//! so none of this needs a migration when a seventh type is added.
//!
//! A card with only a default name is a complete card. Nothing here is ever required and
//! nothing here blocks a save.

use crate::blueprints::{self, Blueprint};
use crate::commands::item::{insert_item, validate_payload};
use crate::commands::placement::insert_placement;
use crate::commands::project::AppState;
use crate::db::connection::now_iso8601;
use crate::db::models::{row_to_item, Item, PlacementWithItem};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

/// Every shipped card type, in menu order. It takes no state: the blueprints are the same in
/// every project, so this is answered before a project is open.
pub fn list_blueprints_for() -> AppResult<Vec<Blueprint>> {
    Ok(blueprints::all().to_vec())
}

#[tauri::command]
pub fn list_blueprints() -> AppResult<Vec<Blueprint>> {
    list_blueprints_for()
}

/// A new writing card, item and placement in one transaction — exactly as
/// `create_note_card` does it.
///
/// The payload is the smallest complete card there is: a card type, the default name, no
/// detail canvas and no fields at all. Nothing is required, so nothing is invented here —
/// in particular no Scale key is written, because an absent Scale key reads as 0 for display
/// and the difference must not be visible anywhere.
#[allow(clippy::too_many_arguments)]
pub fn create_blueprint_card_for(
    state: &AppState,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    blueprint: String,
) -> AppResult<PlacementWithItem> {
    if blueprints::get(&blueprint).is_none() {
        return Err(AppError::Invalid(format!("card type {blueprint}")));
    }
    state.with_db(|conn| {
        let tx = conn.transaction()?;
        let project_id: i64 = tx.query_row(
            "SELECT project_id FROM canvas WHERE id = ?1",
            [canvas_id],
            |r| r.get(0),
        )?;
        let payload = serde_json::json!({
            "blueprint": blueprint,
            "name": "Untitled",
            "detail_canvas_id": serde_json::Value::Null,
            "fields": serde_json::Map::new(),
        })
        .to_string();
        let item = insert_item(&tx, project_id, "blueprint", &payload)?;
        let placement = insert_placement(&tx, canvas_id, item.id, x, y, width, height)?;
        tx.commit()?;
        Ok(PlacementWithItem { placement, item })
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_blueprint_card(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    blueprint: String,
) -> AppResult<PlacementWithItem> {
    create_blueprint_card_for(&state, canvas_id, x, y, width, height, blueprint)
}

/// Write one key of one card and leave every other alone.
///
/// `name` and `detail_canvas_id` are top-level and are addressed by those exact key names;
/// everything else is a field inside `fields`. A `null` value REMOVES the key rather than
/// storing a null, so an emptied field is indistinguishable from one never filled in.
///
/// This is the ONLY write path for a card's fields. The panel's name box and the sheet
/// header both call it, which is what makes editing a card on its sheet and editing it in
/// the panel produce the same payload and the same single undo entry.
pub fn set_item_field_for(
    state: &AppState,
    item_id: i64,
    key: String,
    value: serde_json::Value,
) -> AppResult<Item> {
    state.with_db(|conn| {
        let (kind, payload): (String, String) = conn
            .query_row(
                "SELECT kind, payload FROM item WHERE id = ?1",
                [item_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| AppError::NotFound(format!("item {item_id}")))?;
        if kind != "blueprint" {
            return Err(AppError::Invalid(format!(
                "set_item_field on a {kind} card"
            )));
        }

        let mut root: serde_json::Value = serde_json::from_str(&payload)?;
        let object = root
            .as_object_mut()
            .ok_or_else(|| AppError::Invalid(String::from("a card payload must be an object")))?;

        if key == "name" || key == "detail_canvas_id" {
            match value {
                serde_json::Value::Null if key == "name" => {
                    object.insert(key, serde_json::Value::String(String::new()));
                }
                other => {
                    object.insert(key, other);
                }
            }
        } else {
            let fields = object
                .entry("fields")
                .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()))
                .as_object_mut()
                .ok_or_else(|| {
                    AppError::Invalid(String::from("a card payload's fields must be an object"))
                })?;
            if value.is_null() {
                fields.remove(&key);
            } else {
                fields.insert(key, value);
            }
        }

        let next = root.to_string();
        // Revalidate before writing. That is what keeps the asset-name rule — no separator,
        // no `..` — applying to an Image field, and it is why the Image field can reuse the
        // assets module untouched.
        validate_payload("blueprint", &next)?;
        conn.execute(
            "UPDATE item SET payload = ?2, updated_at = ?3 WHERE id = ?1",
            rusqlite::params![item_id, next, now_iso8601()],
        )?;
        Ok(conn.query_row("SELECT * FROM item WHERE id = ?1", [item_id], row_to_item)?)
    })
}

#[tauri::command]
pub fn set_item_field(
    state: tauri::State<'_, AppState>,
    item_id: i64,
    key: String,
    value: serde_json::Value,
) -> AppResult<Item> {
    set_item_field_for(&state, item_id, key, value)
}

/// Every `blueprint` item in the project with no row in `placement`.
///
/// The corrected delete rule leaves a blueprint item alive when its last placement goes, so
/// a Character survives being taken off the one canvas they appeared on. This is what keeps
/// the old rule's promise that nothing becomes invisible junk: the left column's *Unplaced*
/// section draws exactly this list.
pub fn list_unplaced_items_for(state: &AppState) -> AppResult<Vec<Item>> {
    state.with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT i.* FROM item i
             WHERE i.kind = 'blueprint'
               AND NOT EXISTS (SELECT 1 FROM placement p WHERE p.item_id = i.id)
             ORDER BY i.updated_at DESC, i.id",
        )?;
        let rows = stmt
            .query_map([], row_to_item)?
            .collect::<rusqlite::Result<Vec<Item>>>()?;
        Ok(rows)
    })
}

#[tauri::command]
pub fn list_unplaced_items(state: tauri::State<'_, AppState>) -> AppResult<Vec<Item>> {
    list_unplaced_items_for(&state)
}

/// Where else this record is, and what it is wired to — the two §9.28 panel groups.
///
/// Both are the visible proof that one item can have many placements: *Placed on* names
/// every canvas it sits on, *Joined to* every line touching any of those placements.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ItemPlacement {
    pub placement_id: i64,
    pub canvas_id: i64,
    pub canvas_name: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ItemJoin {
    pub connection_id: i64,
    pub canvas_id: i64,
    pub other_item_id: i64,
    pub other_name: String,
    /// The far card's blueprint id, or null when it is a note, image, link or video.
    pub other_blueprint: Option<String>,
    pub role: Option<String>,
    /// True when THIS card is the `to` end. It is what lets *Part Of* read *Contains* from
    /// the other end — a display decision, never a stored value and never an eighth role.
    pub reversed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ItemContext {
    pub placements: Vec<ItemPlacement>,
    pub joined: Vec<ItemJoin>,
}

/// The display name of any item, mirroring `cardTitle` in `src/lib/types.ts` closely enough
/// for a panel row. A blueprint card is named by its payload `name`.
fn item_display_name(kind: &str, payload: &str, id: i64) -> String {
    let fallback = format!("{kind}-{id:03}");
    let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) else {
        return fallback;
    };
    let field = match kind {
        "blueprint" | "note" => "title",
        _ => "title",
    };
    let name = match kind {
        "blueprint" => value.get("name").and_then(|v| v.as_str()),
        "image" => value
            .get("source_name")
            .and_then(|v| v.as_str())
            .or_else(|| value.get("alt").and_then(|v| v.as_str())),
        _ => value.get(field).and_then(|v| v.as_str()),
    };
    match name {
        Some(text) if !text.is_empty() => text.to_string(),
        _ => fallback,
    }
}

pub fn item_context_for(state: &AppState, item_id: i64) -> AppResult<ItemContext> {
    state.with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT p.id, p.canvas_id, c.name AS canvas_name, p.x, p.y
             FROM placement p JOIN canvas c ON c.id = p.canvas_id
             WHERE p.item_id = ?1
             ORDER BY c.sort_order, c.id, p.id",
        )?;
        let placements = stmt
            .query_map([item_id], |r| {
                Ok(ItemPlacement {
                    placement_id: r.get(0)?,
                    canvas_id: r.get(1)?,
                    canvas_name: r.get(2)?,
                    x: r.get(3)?,
                    y: r.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        // Every line touching any placement of this item, from either end. `reversed` says
        // which end this card is on.
        let mut stmt = conn.prepare(
            "SELECT conn.id, conn.canvas_id, far_i.id, far_i.kind, far_i.payload,
                    conn.role, (mine.id = conn.to_placement_id) AS reversed
             FROM connection conn
             JOIN placement mine
               ON mine.id IN (conn.from_placement_id, conn.to_placement_id)
             JOIN placement far
               ON far.id = CASE WHEN mine.id = conn.from_placement_id
                                THEN conn.to_placement_id ELSE conn.from_placement_id END
             JOIN item far_i ON far_i.id = far.item_id
             WHERE mine.item_id = ?1
             ORDER BY conn.id",
        )?;
        let joined = stmt
            .query_map([item_id], |r| {
                let kind: String = r.get(3)?;
                let payload: String = r.get(4)?;
                let other_item_id: i64 = r.get(2)?;
                let other_blueprint = if kind == "blueprint" {
                    serde_json::from_str::<serde_json::Value>(&payload)
                        .ok()
                        .and_then(|v| {
                            v.get("blueprint")
                                .and_then(|b| b.as_str())
                                .map(String::from)
                        })
                } else {
                    None
                };
                Ok(ItemJoin {
                    connection_id: r.get(0)?,
                    canvas_id: r.get(1)?,
                    other_item_id,
                    other_name: item_display_name(&kind, &payload, other_item_id),
                    other_blueprint,
                    role: r.get(5)?,
                    reversed: r.get::<_, i64>(6)? != 0,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(ItemContext { placements, joined })
    })
}

#[tauri::command]
pub fn item_context(state: tauri::State<'_, AppState>, item_id: i64) -> AppResult<ItemContext> {
    item_context_for(&state, item_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_blueprints_returns_the_six_shipped_types() {
        let list = list_blueprints_for().expect("blueprints");
        assert_eq!(list.len(), 6);
        assert_eq!(list[0].id, "book");
    }

    use crate::commands::canvas::create_canvas_for;
    use crate::commands::item::{asset_names, delete_item_for, validate_payload};
    use crate::commands::placement::delete_placements_for;
    use crate::commands::project::open_project_at;
    use crate::db::models::Project;

    fn open() -> (tempfile::TempDir, AppState, Project) {
        let dir = tempfile::tempdir().expect("a temp directory");
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).expect("open");
        (dir, state, project)
    }

    fn first_canvas(state: &AppState) -> i64 {
        state
            .with_db(|conn| {
                Ok(
                    conn.query_row("SELECT id FROM canvas ORDER BY id LIMIT 1", [], |r| {
                        r.get(0)
                    })?,
                )
            })
            .expect("a canvas")
    }

    fn make(state: &AppState, canvas: i64, blueprint: &str) -> PlacementWithItem {
        create_blueprint_card_for(
            state,
            canvas,
            0.0,
            0.0,
            220.0,
            210.0,
            String::from(blueprint),
        )
        .expect("create")
    }

    #[test]
    fn create_blueprint_card_with_no_fields_is_valid_and_reopens() {
        let (dir, state, _project) = open();
        let canvas = first_canvas(&state);
        let card = make(&state, canvas, "character");
        assert_eq!(card.item.kind, "blueprint");

        // Reopen the folder and read the row back: a card with only its default name is a
        // complete card and survives a round trip byte-identical.
        let state2 = AppState::default();
        open_project_at(&state2, dir.path()).expect("reopen");
        let payload: String = state2
            .with_db(|conn| {
                Ok(conn.query_row(
                    "SELECT payload FROM item WHERE id = ?1",
                    [card.item.id],
                    |r| r.get(0),
                )?)
            })
            .unwrap();
        assert_eq!(payload, card.item.payload);
        let value: serde_json::Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(value["blueprint"], "character");
        assert_eq!(value["name"], "Untitled");
        assert!(value["detail_canvas_id"].is_null());
        assert_eq!(value["fields"].as_object().unwrap().len(), 0);
    }

    #[test]
    fn validate_payload_an_unknown_blueprint_id_is_refused() {
        assert!(validate_payload("blueprint", r#"{"blueprint":"wizard","name":"W"}"#).is_err());
        assert!(validate_payload("blueprint", r#"{"name":"W"}"#).is_err());
    }

    #[test]
    fn validate_payload_a_blueprint_card_needs_no_field_at_all() {
        assert!(validate_payload("blueprint", r#"{"blueprint":"beat","name":""}"#).is_ok());
        assert!(validate_payload(
            "blueprint",
            r#"{"blueprint":"beat","name":"B","fields":{},"detail_canvas_id":null}"#
        )
        .is_ok());
    }

    #[test]
    fn set_item_field_writes_one_key_and_leaves_the_others() {
        let (_dir, state, _project) = open();
        let canvas = first_canvas(&state);
        let card = make(&state, canvas, "character");

        set_item_field_for(&state, card.item.id, String::from("role"), "Rival".into()).unwrap();
        let item =
            set_item_field_for(&state, card.item.id, String::from("openness"), 2.into()).unwrap();

        let value: serde_json::Value = serde_json::from_str(&item.payload).unwrap();
        assert_eq!(value["fields"]["role"], "Rival");
        assert_eq!(value["fields"]["openness"], 2);
        assert_eq!(value["name"], "Untitled");
        assert_eq!(value["blueprint"], "character");
    }

    #[test]
    fn set_item_field_a_null_value_removes_the_key() {
        let (_dir, state, _project) = open();
        let canvas = first_canvas(&state);
        let card = make(&state, canvas, "character");

        set_item_field_for(&state, card.item.id, String::from("role"), "Rival".into()).unwrap();
        let item = set_item_field_for(
            &state,
            card.item.id,
            String::from("role"),
            serde_json::Value::Null,
        )
        .unwrap();
        let value: serde_json::Value = serde_json::from_str(&item.payload).unwrap();
        assert!(
            value["fields"].get("role").is_none(),
            "a null removes the key rather than storing a null"
        );
    }

    #[test]
    fn set_item_field_an_image_value_with_a_separator_is_refused() {
        let (_dir, state, _project) = open();
        let canvas = first_canvas(&state);
        let card = make(&state, canvas, "character");
        assert!(set_item_field_for(
            &state,
            card.item.id,
            String::from("picture"),
            "../evil.png".into()
        )
        .is_err());
        assert!(set_item_field_for(
            &state,
            card.item.id,
            String::from("picture"),
            "sub/evil.png".into()
        )
        .is_err());
        assert!(set_item_field_for(
            &state,
            card.item.id,
            String::from("picture"),
            "abc123.png".into()
        )
        .is_ok());
    }

    #[test]
    fn asset_names_reads_every_image_field_of_a_blueprint() {
        let payload =
            r#"{"blueprint":"character","name":"C","fields":{"picture":"h.png","role":"Rival"}}"#;
        assert_eq!(asset_names("blueprint", payload), vec!["h.png".to_string()]);
        // A card type with no image field contributes nothing.
        assert!(asset_names(
            "blueprint",
            r#"{"blueprint":"beat","name":"B","fields":{}}"#
        )
        .is_empty());
    }

    #[test]
    fn set_item_field_name_and_detail_canvas_id_are_top_level() {
        let (_dir, state, _project) = open();
        let canvas = first_canvas(&state);
        let card = make(&state, canvas, "chapter");

        let item = set_item_field_for(
            &state,
            card.item.id,
            String::from("name"),
            "Chapter One".into(),
        )
        .unwrap();
        let value: serde_json::Value = serde_json::from_str(&item.payload).unwrap();
        assert_eq!(value["name"], "Chapter One");
        assert!(value["fields"].get("name").is_none());

        let item = set_item_field_for(
            &state,
            card.item.id,
            String::from("detail_canvas_id"),
            7.into(),
        )
        .unwrap();
        let value: serde_json::Value = serde_json::from_str(&item.payload).unwrap();
        assert_eq!(value["detail_canvas_id"], 7);
        assert!(value["fields"].get("detail_canvas_id").is_none());
    }

    #[test]
    fn set_item_field_on_a_note_is_refused() {
        let (_dir, state, project) = open();
        let note = state
            .with_db(|conn| {
                crate::commands::item::insert_item(conn, project.id, "note", r#"{"title":"T"}"#)
            })
            .unwrap();
        assert!(set_item_field_for(&state, note.id, String::from("name"), "X".into()).is_err());
    }

    // ---- Task 9: the corrected last-placement delete rule ----

    #[test]
    fn delete_placements_last_placement_of_a_blueprint_keeps_the_item() {
        let (_dir, state, _project) = open();
        let canvas = first_canvas(&state);
        let card = make(&state, canvas, "character");
        set_item_field_for(&state, card.item.id, String::from("role"), "Rival".into()).unwrap();

        let effect = delete_placements_for(&state, vec![card.placement.id]).unwrap();
        assert_eq!(effect.placements.len(), 1);
        assert!(
            effect.items.is_empty(),
            "a blueprint item is never reported as removed by a placement delete"
        );

        let survives: i64 = state
            .with_db(|conn| {
                Ok(conn.query_row(
                    "SELECT count(*) FROM item WHERE id = ?1",
                    [card.item.id],
                    |r| r.get(0),
                )?)
            })
            .unwrap();
        assert_eq!(
            survives, 1,
            "the Character survives losing its last placement"
        );

        let unplaced = list_unplaced_items_for(&state).unwrap();
        assert_eq!(unplaced.len(), 1);
        assert_eq!(unplaced[0].id, card.item.id);
    }

    #[test]
    fn delete_placements_a_blueprint_item_keeps_its_picture_file() {
        let (dir, state, _project) = open();
        let canvas = first_canvas(&state);
        let card = make(&state, canvas, "character");
        std::fs::write(dir.path().join("assets").join("h.png"), b"bytes").unwrap();
        set_item_field_for(
            &state,
            card.item.id,
            String::from("picture"),
            "h.png".into(),
        )
        .unwrap();

        let effect = delete_placements_for(&state, vec![card.placement.id]).unwrap();
        assert!(
            effect.assets.is_empty(),
            "the item is still there, so is its file"
        );
        assert!(dir.path().join("assets").join("h.png").is_file());
    }

    #[test]
    fn delete_placements_an_image_beside_a_blueprint_still_loses_its_file() {
        let (dir, state, project) = open();
        let canvas = first_canvas(&state);
        let character = make(&state, canvas, "character");
        std::fs::write(dir.path().join("assets").join("p.png"), b"bytes").unwrap();

        let image = state
            .with_db(|conn| {
                let tx = conn.transaction()?;
                let item = crate::commands::item::insert_item(
                    &tx,
                    project.id,
                    "image",
                    r#"{"asset":"p.png","alt":""}"#,
                )?;
                let placement = crate::commands::placement::insert_placement(
                    &tx, canvas, item.id, 10.0, 10.0, 100.0, 100.0,
                )?;
                tx.commit()?;
                Ok(PlacementWithItem { placement, item })
            })
            .unwrap();

        let effect =
            delete_placements_for(&state, vec![character.placement.id, image.placement.id])
                .unwrap();
        assert_eq!(effect.items.len(), 1, "only the image item is removed");
        assert_eq!(effect.items[0].kind, "image");
        assert_eq!(effect.assets, vec!["p.png".to_string()]);
        assert!(!dir.path().join("assets").join("p.png").is_file());
        assert!(list_unplaced_items_for(&state)
            .unwrap()
            .iter()
            .any(|i| i.id == character.item.id));
    }

    #[test]
    fn delete_canvas_leaves_every_blueprint_item_in_the_project() {
        // `delete_canvas` calls `delete_placements_tx`, so the rule is written once. This
        // asserts the shared call, which is what a future refactor would break.
        let (_dir, state, project) = open();
        let canvas = create_canvas_for(&state, project.id, String::from("Chapter One")).unwrap();
        let a = make(&state, canvas.id, "character");
        let b = make(&state, canvas.id, "character");

        crate::commands::canvas::delete_canvas_for(&state, canvas.id).unwrap();

        let unplaced = list_unplaced_items_for(&state).unwrap();
        let ids: Vec<i64> = unplaced.iter().map(|i| i.id).collect();
        assert!(ids.contains(&a.item.id));
        assert!(ids.contains(&b.item.id));
    }

    #[test]
    fn list_unplaced_items_returns_only_blueprint_items_with_no_placement() {
        let (_dir, state, project) = open();
        let canvas = first_canvas(&state);
        let placed = make(&state, canvas, "beat");
        let orphan = make(&state, canvas, "character");
        state
            .with_db(|conn| {
                crate::commands::item::insert_item(conn, project.id, "note", r#"{"title":"T"}"#)?;
                Ok(())
            })
            .unwrap();

        delete_placements_for(&state, vec![orphan.placement.id]).unwrap();

        let unplaced = list_unplaced_items_for(&state).unwrap();
        assert_eq!(unplaced.len(), 1);
        assert_eq!(unplaced[0].id, orphan.item.id);
        assert_ne!(unplaced[0].id, placed.item.id);
    }

    #[test]
    fn delete_item_removes_the_row_and_names_its_assets() {
        let (dir, state, _project) = open();
        let canvas = first_canvas(&state);
        let card = make(&state, canvas, "character");
        std::fs::write(dir.path().join("assets").join("h.png"), b"bytes").unwrap();
        set_item_field_for(
            &state,
            card.item.id,
            String::from("picture"),
            "h.png".into(),
        )
        .unwrap();
        delete_placements_for(&state, vec![card.placement.id]).unwrap();

        let effect = delete_item_for(&state, card.item.id).unwrap();
        assert_eq!(effect.items.len(), 1);
        assert_eq!(effect.items[0].id, card.item.id);
        assert_eq!(effect.assets, vec!["h.png".to_string()]);
        assert!(!dir.path().join("assets").join("h.png").is_file());
        assert!(list_unplaced_items_for(&state).unwrap().is_empty());
    }

    /// The Milestone 3 checkpoint: the whole corrected lifecycle in one pass, against a real
    /// project file. No single task's VALIDATE crosses the kind-conditional rule, the asset
    /// reference count and the Unplaced list at once.
    #[test]
    fn the_corrected_lifecycle_keeps_a_reused_character_and_still_trashes_a_picture() {
        let (dir, state, project) = open();
        let one = first_canvas(&state);
        let two = create_canvas_for(&state, project.id, String::from("Two"))
            .unwrap()
            .id;

        // A Character on two canvases — one item, two placements.
        let character = make(&state, one, "character");
        std::fs::write(dir.path().join("assets").join("face.png"), b"face").unwrap();
        set_item_field_for(
            &state,
            character.item.id,
            String::from("picture"),
            "face.png".into(),
        )
        .unwrap();
        let second = state
            .with_db(|conn| {
                crate::commands::placement::insert_placement(
                    conn,
                    two,
                    character.item.id,
                    5.0,
                    5.0,
                    220.0,
                    210.0,
                )
            })
            .unwrap();

        // An Image card with one placement.
        std::fs::write(dir.path().join("assets").join("pic.png"), b"pic").unwrap();
        let image = state
            .with_db(|conn| {
                let tx = conn.transaction()?;
                let item = crate::commands::item::insert_item(
                    &tx,
                    project.id,
                    "image",
                    r#"{"asset":"pic.png","alt":""}"#,
                )?;
                let placement = crate::commands::placement::insert_placement(
                    &tx, one, item.id, 30.0, 30.0, 100.0, 100.0,
                )?;
                tx.commit()?;
                Ok(PlacementWithItem { placement, item })
            })
            .unwrap();

        // Delete the Character's FIRST placement: the item survives with its remaining one.
        let effect = delete_placements_for(&state, vec![character.placement.id]).unwrap();
        assert!(effect.items.is_empty());
        let remaining: i64 = state
            .with_db(|conn| {
                Ok(conn.query_row(
                    "SELECT count(*) FROM placement WHERE item_id = ?1",
                    [character.item.id],
                    |r| r.get(0),
                )?)
            })
            .unwrap();
        assert_eq!(remaining, 1);
        assert!(list_unplaced_items_for(&state).unwrap().is_empty());

        // Delete the second, and the image's only placement, in the same call.
        let effect = delete_placements_for(&state, vec![second.id, image.placement.id]).unwrap();
        assert_eq!(effect.items.len(), 1, "only the image lost its item");
        assert_eq!(effect.items[0].id, image.item.id);
        assert_eq!(effect.assets, vec!["pic.png".to_string()]);
        assert!(!dir.path().join("assets").join("pic.png").is_file());
        assert!(dir.path().join("assets").join("face.png").is_file());

        // The Character is now unplaced, still whole.
        let unplaced = list_unplaced_items_for(&state).unwrap();
        assert_eq!(unplaced.len(), 1);
        assert_eq!(unplaced[0].id, character.item.id);
        assert!(unplaced[0].payload.contains("face.png"));

        // Delete it for good: the row goes, its picture is trashed, and the effect names both
        // so one undo step restores them together.
        let effect = delete_item_for(&state, character.item.id).unwrap();
        assert_eq!(effect.items.len(), 1);
        assert_eq!(effect.assets, vec!["face.png".to_string()]);
        assert!(!dir.path().join("assets").join("face.png").is_file());
        assert!(list_unplaced_items_for(&state).unwrap().is_empty());
    }

    // ---- Task 15: item_context ----

    #[test]
    fn item_context_returns_every_placement_with_its_canvas_name() {
        let (_dir, state, project) = open();
        let one = first_canvas(&state);
        let two = create_canvas_for(&state, project.id, String::from("Chapter Two"))
            .unwrap()
            .id;
        let card = make(&state, one, "character");
        state
            .with_db(|conn| {
                crate::commands::placement::insert_placement(
                    conn,
                    two,
                    card.item.id,
                    40.0,
                    50.0,
                    220.0,
                    210.0,
                )
            })
            .unwrap();

        let context = item_context_for(&state, card.item.id).unwrap();
        assert_eq!(context.placements.len(), 2);
        let names: Vec<&str> = context
            .placements
            .iter()
            .map(|p| p.canvas_name.as_str())
            .collect();
        assert!(names.contains(&"Chapter Two"));
        let second = context
            .placements
            .iter()
            .find(|p| p.canvas_name == "Chapter Two")
            .unwrap();
        assert_eq!((second.x, second.y), (40.0, 50.0));
    }

    #[test]
    fn item_context_marks_the_far_end_of_each_connection() {
        let (_dir, state, _project) = open();
        let canvas = first_canvas(&state);
        let chapter = make(&state, canvas, "chapter");
        let book = make(&state, canvas, "book");
        set_item_field_for(
            &state,
            book.item.id,
            String::from("name"),
            "The Long Dark".into(),
        )
        .unwrap();

        crate::commands::connection::create_connection_for(
            &state,
            canvas,
            chapter.placement.id,
            book.placement.id,
            None,
            1,
            Some(String::from("part-of")),
        )
        .unwrap();

        // From the chapter's end: it is the `from` card, so not reversed — Part Of.
        let from_chapter = item_context_for(&state, chapter.item.id).unwrap();
        assert_eq!(from_chapter.joined.len(), 1);
        assert!(!from_chapter.joined[0].reversed);
        assert_eq!(from_chapter.joined[0].other_name, "The Long Dark");
        assert_eq!(
            from_chapter.joined[0].other_blueprint.as_deref(),
            Some("book")
        );
        assert_eq!(from_chapter.joined[0].role.as_deref(), Some("part-of"));

        // From the book's end: it is the `to` card, so reversed — which is what the front
        // end reads as Contains.
        let from_book = item_context_for(&state, book.item.id).unwrap();
        assert_eq!(from_book.joined.len(), 1);
        assert!(from_book.joined[0].reversed);
        assert_eq!(from_book.joined[0].other_item_id, chapter.item.id);
    }

    #[test]
    fn item_context_a_card_with_nothing_attached_is_empty_both_ways() {
        let (_dir, state, _project) = open();
        let canvas = first_canvas(&state);
        let card = make(&state, canvas, "beat");
        let context = item_context_for(&state, card.item.id).unwrap();
        assert_eq!(context.placements.len(), 1);
        assert!(context.joined.is_empty());
    }

    #[test]
    fn item_context_an_unplaced_record_reports_no_placement() {
        let (_dir, state, _project) = open();
        let canvas = first_canvas(&state);
        let card = make(&state, canvas, "character");
        delete_placements_for(&state, vec![card.placement.id]).unwrap();
        let context = item_context_for(&state, card.item.id).unwrap();
        assert!(context.placements.is_empty());
    }
}
