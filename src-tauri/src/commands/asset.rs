//! The asset seam the front end reaches: copying a picture into the project, asking which
//! named files are actually there, and creating an image card in one transaction.
//!
//! An asset value in a payload is always a bare file name. The absolute path never leaves
//! Rust, and `assets_folder` is the one command that returns one — for the panel's
//! "Show in folder", which needs a real path to hand the system shell.

use crate::assets::{self, AssetRef, AssetStatus};
use crate::commands::item::insert_item;
use crate::commands::placement::insert_placement;
use crate::commands::project::AppState;
use crate::db::models::PlacementWithItem;
use crate::error::AppResult;
use std::path::Path;

/// Copy a picture the user dropped or chose into `assets/`, named by its content hash.
#[tauri::command]
pub fn add_image_from_path(state: tauri::State<'_, AppState>, path: String) -> AppResult<AssetRef> {
    let folder = state.require_folder()?;
    assets::copy_in(&folder, Path::new(&path))
}

/// The clipboard route. Bytes only ever come this way — a `Uint8Array` reaches Tauri as a
/// JSON number array, which is workable for a screenshot and not for a 40 MB file, so the
/// drop and picker routes send a path instead.
#[tauri::command]
pub fn add_image_from_bytes(
    state: tauri::State<'_, AppState>,
    bytes: Vec<u8>,
    ext: String,
) -> AppResult<AssetRef> {
    let folder = state.require_folder()?;
    assets::write_in(&folder, &bytes, &ext)
}

/// One call for a whole canvas, never one per card: 250 round trips sit on the two-second
/// project-open budget.
#[tauri::command]
pub fn asset_statuses(
    state: tauri::State<'_, AppState>,
    names: Vec<String>,
) -> AppResult<Vec<AssetStatus>> {
    let folder = state.require_folder()?;
    Ok(names
        .iter()
        .map(|name| assets::status(&folder, name))
        .collect())
}

/// The absolute path of the open project's `assets/` folder, for "Show in folder" and for
/// the front end's asset-protocol URL helper.
#[tauri::command]
pub fn assets_folder(state: tauri::State<'_, AppState>) -> AppResult<String> {
    let folder = state.require_folder()?;
    Ok(assets::assets_dir(&folder).to_string_lossy().to_string())
}

/// Create the item and its placement together, so a new image card is one transaction —
/// the same shape as `create_note_card_for`.
#[allow(clippy::too_many_arguments)]
pub fn create_image_card_for(
    state: &AppState,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    asset: String,
    natural_width: i64,
    natural_height: i64,
    alt: String,
    source_name: String,
) -> AppResult<PlacementWithItem> {
    state.with_db(|conn| {
        let tx = conn.transaction()?;
        let project_id: i64 = tx.query_row(
            "SELECT project_id FROM canvas WHERE id = ?1",
            [canvas_id],
            |r| r.get(0),
        )?;
        let payload = serde_json::json!({
            "asset": asset,
            "natural_width": natural_width,
            "natural_height": natural_height,
            "alt": alt,
            "source_name": source_name,
        })
        .to_string();
        let item = insert_item(&tx, project_id, "image", &payload)?;
        let placement = insert_placement(&tx, canvas_id, item.id, x, y, width, height)?;
        tx.commit()?;
        Ok(PlacementWithItem { placement, item })
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_image_card(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    asset: String,
    natural_width: i64,
    natural_height: i64,
    alt: String,
    source_name: String,
) -> AppResult<PlacementWithItem> {
    create_image_card_for(
        &state,
        canvas_id,
        x,
        y,
        width,
        height,
        asset,
        natural_width,
        natural_height,
        alt,
        source_name,
    )
}

/// A narrow patch, run once per image when the page has decoded it. The page has to decode
/// the picture to draw it anyway, so measuring there is free and no image crate is needed.
pub fn update_image_dimensions_for(
    state: &AppState,
    item_id: i64,
    natural_width: i64,
    natural_height: i64,
) -> AppResult<crate::db::models::Item> {
    state.with_db(|conn| {
        let payload: String = conn.query_row(
            "SELECT payload FROM item WHERE id = ?1 AND kind = 'image'",
            [item_id],
            |r| r.get(0),
        )?;
        let mut value: serde_json::Value = serde_json::from_str(&payload)?;
        if let Some(object) = value.as_object_mut() {
            object.insert("natural_width".into(), natural_width.into());
            object.insert("natural_height".into(), natural_height.into());
        }
        let next = value.to_string();
        conn.execute(
            "UPDATE item SET payload = ?2, updated_at = ?3 WHERE id = ?1",
            rusqlite::params![item_id, next, crate::db::connection::now_iso8601()],
        )?;
        Ok(conn.query_row(
            "SELECT * FROM item WHERE id = ?1",
            [item_id],
            crate::db::models::row_to_item,
        )?)
    })
}

#[tauri::command]
pub fn update_image_dimensions(
    state: tauri::State<'_, AppState>,
    item_id: i64,
    natural_width: i64,
    natural_height: i64,
) -> AppResult<crate::db::models::Item> {
    update_image_dimensions_for(&state, item_id, natural_width, natural_height)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::canvas::list_canvases_for;
    use crate::commands::project::open_project_at;

    fn open() -> (tempfile::TempDir, AppState, i64) {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        let canvas_id = list_canvases_for(&state, project.id).unwrap()[0].id;
        (dir, state, canvas_id)
    }

    #[test]
    fn create_image_card_for_writes_a_payload_holding_a_bare_file_name() {
        let (_dir, state, canvas_id) = open();
        let card = create_image_card_for(
            &state,
            canvas_id,
            0.0,
            0.0,
            320.0,
            240.0,
            String::from("abc.png"),
            1920,
            1080,
            String::from("A truss"),
            String::from("truss reference.jpg"),
        )
        .unwrap();

        assert_eq!(card.item.kind, "image");
        let payload: serde_json::Value = serde_json::from_str(&card.item.payload).unwrap();
        assert_eq!(payload["asset"], "abc.png");
        assert_eq!(payload["natural_width"], 1920);
        assert_eq!(payload["source_name"], "truss reference.jpg");
        let asset = payload["asset"].as_str().unwrap();
        assert!(
            !asset.contains(':') && !asset.contains('/') && !asset.contains('\\'),
            "an asset value is a bare file name, never a path"
        );
    }

    #[test]
    fn create_image_card_for_an_asset_naming_a_path_is_refused() {
        let (_dir, state, canvas_id) = open();
        let result = create_image_card_for(
            &state,
            canvas_id,
            0.0,
            0.0,
            320.0,
            240.0,
            String::from("../ideascape.db"),
            0,
            0,
            String::new(),
            String::new(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn update_image_dimensions_patches_only_the_two_fields() {
        let (_dir, state, canvas_id) = open();
        let card = create_image_card_for(
            &state,
            canvas_id,
            0.0,
            0.0,
            320.0,
            240.0,
            String::from("abc.png"),
            0,
            0,
            String::from("keep me"),
            String::from("original.png"),
        )
        .unwrap();

        let updated = update_image_dimensions_for(&state, card.item.id, 640, 480).unwrap();
        let value: serde_json::Value = serde_json::from_str(&updated.payload).unwrap();
        assert_eq!(value["natural_width"], 640);
        assert_eq!(value["natural_height"], 480);
        assert_eq!(value["alt"], "keep me", "the other fields are untouched");
        assert_eq!(value["source_name"], "original.png");
        assert_eq!(value["asset"], "abc.png");
    }

    #[test]
    fn asset_statuses_reports_present_and_absent_in_one_call() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        open_project_at(&state, dir.path()).unwrap();
        let added = assets::write_in(dir.path(), b"some bytes", "png").unwrap();

        let folder = state.require_folder().unwrap();
        let reported: Vec<_> = [added.name.as_str(), "absent.png"]
            .iter()
            .map(|n| assets::status(&folder, n))
            .collect();
        assert!(reported[0].exists);
        assert!(!reported[1].exists);
    }
}
