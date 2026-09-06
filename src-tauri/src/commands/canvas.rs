//! Listing and creating the canvases in the open project, and saving a canvas's pan and
//! zoom so it is restored the next time the canvas opens.

use crate::assets;
use crate::commands::item::{asset_names, find_item, insert_item_with_id};
use crate::commands::placement::{delete_placements_tx, insert_placement_with_id};
use crate::commands::project::AppState;
use crate::db::connection::now_iso8601;
use crate::db::models::{row_to_canvas, row_to_placement, Canvas, CanvasDeleteEffect, Placement};
use crate::error::{AppError, AppResult};

/// Every canvas in the project, in the order the left column shows them.
pub fn list_canvases_for(state: &AppState, project_id: i64) -> AppResult<Vec<Canvas>> {
    state.with_db(|conn| {
        let mut stmt =
            conn.prepare("SELECT * FROM canvas WHERE project_id = ?1 ORDER BY sort_order, id")?;
        let rows = stmt
            .query_map([project_id], row_to_canvas)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    })
}

pub fn create_canvas_for(state: &AppState, project_id: i64, name: String) -> AppResult<Canvas> {
    state.with_db(|conn| {
        let now = now_iso8601();
        let next_order: i64 = conn.query_row(
            "SELECT coalesce(max(sort_order), -1) + 1 FROM canvas WHERE project_id = ?1",
            [project_id],
            |r| r.get(0),
        )?;
        conn.execute(
            "INSERT INTO canvas (project_id, name, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            rusqlite::params![project_id, name, next_order, now],
        )?;
        let id = conn.last_insert_rowid();
        Ok(conn.query_row("SELECT * FROM canvas WHERE id = ?1", [id], row_to_canvas)?)
    })
}

#[tauri::command]
pub fn list_canvases(state: tauri::State<'_, AppState>, project_id: i64) -> AppResult<Vec<Canvas>> {
    list_canvases_for(&state, project_id)
}

#[tauri::command]
pub fn create_canvas(
    state: tauri::State<'_, AppState>,
    project_id: i64,
    name: String,
) -> AppResult<Canvas> {
    create_canvas_for(&state, project_id, name)
}

/// Rename a canvas. Names are not required to be unique — nothing states a uniqueness rule,
/// and enforcing one would make rename fail in a way no state is drawn for.
pub fn rename_canvas_for(state: &AppState, canvas_id: i64, name: String) -> AppResult<Canvas> {
    state.with_db(|conn| {
        let changed = conn.execute(
            "UPDATE canvas SET name = ?2, updated_at = ?3 WHERE id = ?1",
            rusqlite::params![canvas_id, name, now_iso8601()],
        )?;
        if changed == 0 {
            return Err(AppError::NotFound(format!("canvas {canvas_id}")));
        }
        Ok(conn.query_row(
            "SELECT * FROM canvas WHERE id = ?1",
            [canvas_id],
            row_to_canvas,
        )?)
    })
}

/// Delete a canvas, and with it every placement on it, the items that lose their last
/// placement, the connections the cascade takes, and the asset files no remaining payload
/// still names — all in one transaction (`persistence-strategy`).
///
/// Every row the effect reports is read *before* the canvas row goes, because `placement`
/// and `connection` are both children of `canvas(id)` with `ON DELETE CASCADE` and foreign
/// keys are on: after the delete those selects return nothing and the undo would be a no-op.
pub fn delete_canvas_for(state: &AppState, canvas_id: i64) -> AppResult<CanvasDeleteEffect> {
    // Folder guard before db guard, always.
    let folder = state.project_folder();

    let effect = state.with_db(|conn| {
        let tx = conn.transaction()?;

        let canvas = tx
            .query_row(
                "SELECT * FROM canvas WHERE id = ?1",
                [canvas_id],
                row_to_canvas,
            )
            .map_err(|_| AppError::NotFound(format!("canvas {canvas_id}")))?;

        let siblings: i64 = tx.query_row(
            "SELECT count(*) FROM canvas WHERE project_id = ?1",
            [canvas.project_id],
            |r| r.get(0),
        )?;
        if siblings <= 1 {
            // A project with no canvas has no drawn state, and the left column would have
            // nothing to make active.
            return Err(AppError::Invalid(String::from(
                "the last canvas in a project cannot be deleted",
            )));
        }

        let placement_ids: Vec<i64> = {
            let mut stmt =
                tx.prepare("SELECT id FROM placement WHERE canvas_id = ?1 ORDER BY z_order, id")?;
            let ids = stmt
                .query_map([canvas_id], |r| r.get(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            ids
        };
        let inner = delete_placements_tx(&tx, &placement_ids)?;

        tx.execute("DELETE FROM canvas WHERE id = ?1", [canvas_id])?;
        tx.commit()?;

        Ok(CanvasDeleteEffect {
            canvas,
            placements: inner.placements,
            items: inner.items,
            connections: inner.connections,
            assets: inner.assets,
        })
    })?;

    // Trashing happens after the commit: a rolled-back delete must not have moved a file.
    if let Some(folder) = folder.as_deref() {
        for name in &effect.assets {
            assets::trash(folder, name)?;
        }
    }
    Ok(effect)
}

/// Put a deleted canvas back — the row, its cards, its lines and its asset files together.
///
/// Every row goes back under its own primary key. Ids are `AUTOINCREMENT` and never
/// re-issued, so a deleted id is always free, and keeping it is what leaves the rest of the
/// undo stack valid: a move or an edit recorded against a card on this canvas still names a
/// row that exists once the canvas is back (`undo-model`). An item that kept a placement
/// elsewhere was never deleted, so its live row is reused rather than inserted twice.
///
/// It also restores a canvas the user has only *created* — `create_canvas`'s undo — where the
/// effect carries the canvas row and nothing else.
pub fn restore_canvas_for(state: &AppState, effect: CanvasDeleteEffect) -> AppResult<Canvas> {
    // Untrash before the rows go in, so a card is never on a canvas pointing at a file that
    // is still in the trash. Folder guard taken and dropped before `with_db`.
    if let Some(folder) = state.project_folder().as_deref() {
        for item in &effect.items {
            for name in asset_names(&item.kind, &item.payload) {
                assets::untrash(folder, &name)?;
            }
        }
    }

    state.with_db(|conn| {
        let tx = conn.transaction()?;

        let canvas_id = effect.canvas.id;
        // A canvas the user restores twice in a row (undo, redo, undo) is already there.
        let live: Option<Canvas> = tx
            .query_row(
                "SELECT * FROM canvas WHERE id = ?1",
                [canvas_id],
                row_to_canvas,
            )
            .ok();
        if live.is_none() {
            tx.execute(
                "INSERT INTO canvas (id, project_id, name, sort_order, view_x, view_y, view_zoom,
                                     created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    canvas_id,
                    effect.canvas.project_id,
                    effect.canvas.name,
                    effect.canvas.sort_order,
                    effect.canvas.view_x,
                    effect.canvas.view_y,
                    effect.canvas.view_zoom,
                    effect.canvas.created_at,
                    now_iso8601(),
                ],
            )?;
        }

        for item in &effect.items {
            if find_item(&tx, item.id)?.is_some() {
                continue;
            }
            insert_item_with_id(
                &tx,
                Some(item.id),
                item.project_id,
                &item.kind,
                &item.payload,
            )?;
        }

        for placement in &effect.placements {
            insert_placement_with_id(
                &tx,
                Some(placement.id),
                canvas_id,
                placement.item_id,
                placement.x,
                placement.y,
                placement.width,
                placement.height,
                Some(placement.z_order),
            )?;
        }

        for connection in &effect.connections {
            tx.execute(
                "INSERT INTO connection (id, canvas_id, from_placement_id, to_placement_id, label,
                                         directed)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    connection.id,
                    canvas_id,
                    connection.from_placement_id,
                    connection.to_placement_id,
                    connection.label,
                    connection.directed
                ],
            )?;
        }

        let restored = tx.query_row(
            "SELECT * FROM canvas WHERE id = ?1",
            [canvas_id],
            row_to_canvas,
        )?;
        tx.commit()?;
        Ok(restored)
    })
}

/// Every placement on a canvas, used by the tests and by `delete_canvas_for`'s read pass.
pub fn placements_on(state: &AppState, canvas_id: i64) -> AppResult<Vec<Placement>> {
    state.with_db(|conn| {
        let mut stmt =
            conn.prepare("SELECT * FROM placement WHERE canvas_id = ?1 ORDER BY z_order, id")?;
        let rows = stmt
            .query_map([canvas_id], row_to_placement)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    })
}

#[tauri::command]
pub fn rename_canvas(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    name: String,
) -> AppResult<Canvas> {
    rename_canvas_for(&state, canvas_id, name)
}

#[tauri::command]
pub fn delete_canvas(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
) -> AppResult<CanvasDeleteEffect> {
    delete_canvas_for(&state, canvas_id)
}

#[tauri::command]
pub fn restore_canvas(
    state: tauri::State<'_, AppState>,
    effect: CanvasDeleteEffect,
) -> AppResult<Canvas> {
    restore_canvas_for(&state, effect)
}

pub fn update_canvas_view_for(
    state: &AppState,
    canvas_id: i64,
    view_x: f64,
    view_y: f64,
    view_zoom: f64,
) -> AppResult<()> {
    state.with_db(|conn| {
        conn.execute(
            "UPDATE canvas SET view_x = ?2, view_y = ?3, view_zoom = ?4, updated_at = ?5
             WHERE id = ?1",
            rusqlite::params![canvas_id, view_x, view_y, view_zoom, now_iso8601()],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn update_canvas_view(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    view_x: f64,
    view_y: f64,
    view_zoom: f64,
) -> AppResult<()> {
    update_canvas_view_for(&state, canvas_id, view_x, view_y, view_zoom)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::project::open_project_at;
    use crate::commands::{asset, connection, placement};
    use std::path::Path;

    /// A project with two canvases, a note card on each, an image card on the second, and a
    /// line joining the second canvas's two cards. Returns the two canvas ids.
    fn project_with_two_canvases(state: &AppState, folder: &Path) -> (i64, i64) {
        let project = open_project_at(state, folder).unwrap();
        let first = list_canvases_for(state, project.id).unwrap()[0].id;
        let second = create_canvas_for(state, project.id, "Second".into())
            .unwrap()
            .id;

        placement::create_note_card_for(
            state,
            first,
            0.0,
            0.0,
            240.0,
            140.0,
            "On first".into(),
            "body".into(),
        )
        .unwrap();

        let note = placement::create_note_card_for(
            state,
            second,
            10.0,
            10.0,
            240.0,
            140.0,
            "On second".into(),
            "body".into(),
        )
        .unwrap();

        std::fs::write(folder.join("assets").join("abc123.png"), b"png bytes").unwrap();
        let image = asset::create_image_card_for(
            state,
            second,
            300.0,
            10.0,
            200.0,
            150.0,
            "abc123.png".into(),
            200,
            150,
            "a picture".into(),
            "source.png".into(),
        )
        .unwrap();

        connection::create_connection_for(
            state,
            second,
            note.placement.id,
            image.placement.id,
            Some("joins".into()),
            1,
        )
        .unwrap();

        (first, second)
    }

    #[test]
    fn rename_canvas_new_name_is_read_back() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        let id = list_canvases_for(&state, project.id).unwrap()[0].id;

        let renamed = rename_canvas_for(&state, id, "Hull studies".into()).unwrap();
        assert_eq!(renamed.name, "Hull studies");
        assert_eq!(
            list_canvases_for(&state, project.id).unwrap()[0].name,
            "Hull studies"
        );
    }

    #[test]
    fn delete_canvas_only_canvas_in_project_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        let id = list_canvases_for(&state, project.id).unwrap()[0].id;

        let error = delete_canvas_for(&state, id).expect_err("the last canvas must survive");
        assert!(error.to_string().contains("last canvas"), "{error}");
        assert_eq!(list_canvases_for(&state, project.id).unwrap().len(), 1);
    }

    #[test]
    fn delete_canvas_with_cards_and_lines_reports_every_row_it_removed() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let (first, second) = project_with_two_canvases(&state, dir.path());

        let effect = delete_canvas_for(&state, second).expect("delete");

        assert_eq!(effect.canvas.id, second);
        assert_eq!(effect.canvas.name, "Second");
        assert_eq!(effect.placements.len(), 2);
        assert_eq!(effect.items.len(), 2);
        assert_eq!(
            effect.connections.len(),
            1,
            "the cascade's line must be reported"
        );
        assert_eq!(effect.connections[0].label.as_deref(), Some("joins"));

        // The other canvas is untouched.
        assert_eq!(placements_on(&state, first).unwrap().len(), 1);
        assert!(connection::list_connections_for(&state, second)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn delete_canvas_item_used_only_there_is_deleted_and_its_asset_trashed() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let (_first, second) = project_with_two_canvases(&state, dir.path());

        let effect = delete_canvas_for(&state, second).expect("delete");

        assert_eq!(effect.assets, vec![String::from("abc123.png")]);
        assert!(!dir.path().join("assets").join("abc123.png").exists());
        assert!(dir.path().join(".trash").join("abc123.png").exists());
    }

    #[test]
    fn restore_canvas_from_its_effect_puts_back_rows_lines_and_files() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let (_first, second) = project_with_two_canvases(&state, dir.path());
        let effect = delete_canvas_for(&state, second).unwrap();

        let restored = restore_canvas_for(&state, effect.clone()).expect("restore");

        assert_eq!(restored.name, "Second");
        assert_eq!(restored.sort_order, effect.canvas.sort_order);
        assert_eq!(
            restored.id, second,
            "a restored canvas keeps the id it had, so the rest of the undo stack stays valid"
        );

        let placements = placements_on(&state, restored.id).unwrap();
        assert_eq!(placements.len(), 2);
        assert_eq!(
            connection::list_connections_for(&state, restored.id)
                .unwrap()
                .len(),
            1
        );
        assert!(dir.path().join("assets").join("abc123.png").exists());
    }

    #[test]
    fn restore_canvas_puts_every_row_back_under_the_id_it_had() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let (_first, second) = project_with_two_canvases(&state, dir.path());
        let effect = delete_canvas_for(&state, second).unwrap();
        let old_line = effect.connections[0].clone();
        let old_placements: Vec<i64> = effect.placements.iter().map(|p| p.id).collect();

        let restored = restore_canvas_for(&state, effect).unwrap();

        let placements = placements_on(&state, restored.id).unwrap();
        let ids: Vec<i64> = placements.iter().map(|p| p.id).collect();
        let line = &connection::list_connections_for(&state, restored.id).unwrap()[0];

        for id in &old_placements {
            assert!(ids.contains(id), "placement {id} must come back as itself");
        }
        assert_eq!(line.id, old_line.id);
        assert_eq!(line.from_placement_id, old_line.from_placement_id);
        assert_eq!(line.to_placement_id, old_line.to_placement_id);
        assert_eq!(line.canvas_id, restored.id);
    }

    /// The bug this rule exists for: one delete, undone and redone twice. Every round has to
    /// name rows that exist, which it only can while the ids stay put.
    #[test]
    fn restore_canvas_undone_and_redone_twice_keeps_naming_live_rows() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let (_first, second) = project_with_two_canvases(&state, dir.path());

        let effect = delete_canvas_for(&state, second).unwrap();
        for _ in 0..2 {
            let restored = restore_canvas_for(&state, effect.clone()).expect("restore");
            assert_eq!(restored.id, second);
            assert_eq!(placements_on(&state, second).unwrap().len(), 2);
            assert_eq!(
                connection::list_connections_for(&state, second)
                    .unwrap()
                    .len(),
                1
            );
            let again = delete_canvas_for(&state, second).expect("delete again");
            assert_eq!(again.placements.len(), 2);
        }
    }

    #[test]
    fn create_canvas_for_assigns_the_next_sort_order() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();

        let second = create_canvas_for(&state, project.id, "Second".into()).unwrap();
        let third = create_canvas_for(&state, project.id, "Third".into()).unwrap();

        assert_eq!(second.sort_order, 1);
        assert_eq!(third.sort_order, 2);
    }

    #[test]
    fn update_canvas_view_for_survives_a_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let canvas_id = {
            let state = AppState::default();
            let project = open_project_at(&state, dir.path()).unwrap();
            let id = list_canvases_for(&state, project.id).unwrap()[0].id;
            update_canvas_view_for(&state, id, -120.0, 44.5, 0.4).unwrap();
            id
        };

        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        let canvas = list_canvases_for(&state, project.id)
            .unwrap()
            .into_iter()
            .find(|c| c.id == canvas_id)
            .unwrap();
        assert_eq!(canvas.view_x, -120.0);
        assert_eq!(canvas.view_y, 44.5);
        assert_eq!(canvas.view_zoom, 0.4);
    }
}
