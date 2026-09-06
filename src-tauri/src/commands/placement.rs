//! Placements — where a card sits on one canvas, and how it stacks. A multi-row change
//! (a drag, a reorder, a delete) is written in exactly one transaction.

use crate::commands::item::insert_item;
use crate::commands::project::AppState;
use crate::db::models::{
    row_to_item, row_to_placement, DeleteEffect, Item, Placement, PlacementUpdate,
    PlacementWithItem,
};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;

/// Every card on a canvas, placement joined to item, bottom of the stack first.
pub fn list_placements_for(state: &AppState, canvas_id: i64) -> AppResult<Vec<PlacementWithItem>> {
    state.with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT p.*, i.id AS i_id, i.project_id AS i_project_id, i.kind AS i_kind,
                    i.payload AS i_payload, i.created_at AS i_created_at,
                    i.updated_at AS i_updated_at
             FROM placement p JOIN item i ON i.id = p.item_id
             WHERE p.canvas_id = ?1
             ORDER BY p.z_order, p.id",
        )?;
        let rows = stmt
            .query_map([canvas_id], |r| {
                Ok(PlacementWithItem {
                    placement: row_to_placement(r)?,
                    item: Item {
                        id: r.get("i_id")?,
                        project_id: r.get("i_project_id")?,
                        kind: r.get("i_kind")?,
                        payload: r.get("i_payload")?,
                        created_at: r.get("i_created_at")?,
                        updated_at: r.get("i_updated_at")?,
                    },
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    })
}

fn next_z_order(conn: &Connection, canvas_id: i64) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT coalesce(max(z_order), -1) + 1 FROM placement WHERE canvas_id = ?1",
        [canvas_id],
        |r| r.get(0),
    )
}

pub fn insert_placement(
    conn: &Connection,
    canvas_id: i64,
    item_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> AppResult<Placement> {
    let z = next_z_order(conn, canvas_id)?;
    conn.execute(
        "INSERT INTO placement (canvas_id, item_id, x, y, width, height, z_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![canvas_id, item_id, x, y, width, height, z],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(
        "SELECT * FROM placement WHERE id = ?1",
        [id],
        row_to_placement,
    )?)
}

/// Create the item and its placement together, so a new note card is one transaction.
#[allow(clippy::too_many_arguments)]
pub fn create_note_card_for(
    state: &AppState,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    title: String,
    text: String,
) -> AppResult<PlacementWithItem> {
    state.with_db(|conn| {
        let tx = conn.transaction()?;
        let project_id: i64 = tx.query_row(
            "SELECT project_id FROM canvas WHERE id = ?1",
            [canvas_id],
            |r| r.get(0),
        )?;
        let payload = serde_json::json!({ "title": title, "text": text }).to_string();
        let item = insert_item(&tx, project_id, "note", &payload)?;
        let placement = insert_placement(&tx, canvas_id, item.id, x, y, width, height)?;
        tx.commit()?;
        Ok(PlacementWithItem { placement, item })
    })
}

/// Re-create a card that was deleted, keeping its geometry and its place in the stack.
/// This is the write half of undoing a delete: the row genuinely goes back on disk, rather
/// than only back into the front end's memory. The new row takes a new id, which the undo
/// command adopts.
#[allow(clippy::too_many_arguments)]
pub fn restore_card_for(
    state: &AppState,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    z_order: i64,
    kind: String,
    payload: String,
) -> AppResult<PlacementWithItem> {
    state.with_db(|conn| {
        let tx = conn.transaction()?;
        let project_id: i64 = tx.query_row(
            "SELECT project_id FROM canvas WHERE id = ?1",
            [canvas_id],
            |r| r.get(0),
        )?;
        let item = insert_item(&tx, project_id, &kind, &payload)?;
        tx.execute(
            "INSERT INTO placement (canvas_id, item_id, x, y, width, height, z_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![canvas_id, item.id, x, y, width, height, z_order],
        )?;
        let id = tx.last_insert_rowid();
        let placement = tx.query_row(
            "SELECT * FROM placement WHERE id = ?1",
            [id],
            row_to_placement,
        )?;
        tx.commit()?;
        Ok(PlacementWithItem { placement, item })
    })
}

/// Apply a whole multi-row move, resize or reorder in one transaction — a 200-frame drag
/// is one write, not two hundred.
pub fn update_placements_for(state: &AppState, updates: Vec<PlacementUpdate>) -> AppResult<()> {
    state.with_db(|conn| {
        let tx = conn.transaction()?;
        for u in &updates {
            let changed = tx.execute(
                "UPDATE placement SET x = ?2, y = ?3, width = ?4, height = ?5, z_order = ?6
                 WHERE id = ?1",
                rusqlite::params![u.id, u.x, u.y, u.width, u.height, u.z_order],
            )?;
            if changed == 0 {
                // One bad row rolls the whole batch back; a drag is atomic or it never happened.
                return Err(AppError::NotFound(format!("placement {}", u.id)));
            }
        }
        tx.commit()?;
        Ok(())
    })
}

/// Delete placements, and any item left with no placement at all. The returned effect names
/// every row removed, so one undo command can put all of it back together.
pub fn delete_placements_for(state: &AppState, ids: Vec<i64>) -> AppResult<DeleteEffect> {
    state.with_db(|conn| {
        let tx = conn.transaction()?;
        let mut effect = DeleteEffect::default();

        for id in &ids {
            let placement = tx
                .query_row(
                    "SELECT * FROM placement WHERE id = ?1",
                    [id],
                    row_to_placement,
                )
                .ok();
            let Some(placement) = placement else { continue };
            tx.execute("DELETE FROM placement WHERE id = ?1", [id])?;

            let remaining: i64 = tx.query_row(
                "SELECT count(*) FROM placement WHERE item_id = ?1",
                [placement.item_id],
                |r| r.get(0),
            )?;
            if remaining == 0 {
                let item = tx.query_row(
                    "SELECT * FROM item WHERE id = ?1",
                    [placement.item_id],
                    row_to_item,
                )?;
                tx.execute("DELETE FROM item WHERE id = ?1", [placement.item_id])?;
                effect.items.push(item);
            }
            effect.placements.push(placement);
        }

        tx.commit()?;
        Ok(effect)
    })
}

#[tauri::command]
pub fn list_placements(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
) -> AppResult<Vec<PlacementWithItem>> {
    list_placements_for(&state, canvas_id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_placement(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    item_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> AppResult<Placement> {
    state.with_db(|conn| insert_placement(conn, canvas_id, item_id, x, y, width, height))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_note_card(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    title: String,
    text: String,
) -> AppResult<PlacementWithItem> {
    create_note_card_for(&state, canvas_id, x, y, width, height, title, text)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn restore_card(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    z_order: i64,
    kind: String,
    payload: String,
) -> AppResult<PlacementWithItem> {
    restore_card_for(
        &state, canvas_id, x, y, width, height, z_order, kind, payload,
    )
}

#[tauri::command]
pub fn update_placements(
    state: tauri::State<'_, AppState>,
    updates: Vec<PlacementUpdate>,
) -> AppResult<()> {
    update_placements_for(&state, updates)
}

#[tauri::command]
pub fn delete_placements(
    state: tauri::State<'_, AppState>,
    ids: Vec<i64>,
) -> AppResult<DeleteEffect> {
    delete_placements_for(&state, ids)
}

/// Development-only: fill a canvas with `count` note cards spread over a large world
/// rectangle, so the 250-card performance gate has something to measure.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn seed_note_cards(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    count: i64,
) -> AppResult<i64> {
    state.with_db(|conn| {
        let tx = conn.transaction()?;
        let project_id: i64 = tx.query_row(
            "SELECT project_id FROM canvas WHERE id = ?1",
            [canvas_id],
            |r| r.get(0),
        )?;
        let first_z = next_z_order(&tx, canvas_id)?;
        let columns = 20;
        for (z, n) in (first_z..).zip(0..count) {
            let col = n % columns;
            let row = n / columns;
            let payload = serde_json::json!({
                "title": format!("Seeded Note {}", n + 1),
                "text": format!("Card **{}** of the seeded set.\n\n- one\n- two", n + 1),
            })
            .to_string();
            let item = insert_item(&tx, project_id, "note", &payload)?;
            tx.execute(
                "INSERT INTO placement (canvas_id, item_id, x, y, width, height, z_order)
                 VALUES (?1, ?2, ?3, ?4, 236, 150, ?5)",
                rusqlite::params![
                    canvas_id,
                    item.id,
                    col as f64 * 300.0,
                    row as f64 * 220.0,
                    z
                ],
            )?;
        }
        tx.commit()?;
        Ok(count)
    })
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
    fn create_note_card_round_trips_through_list_placements() {
        let (_dir, state, canvas_id) = open();
        create_note_card_for(
            &state,
            canvas_id,
            10.0,
            20.0,
            236.0,
            150.0,
            "T".into(),
            "b".into(),
        )
        .unwrap();

        let cards = list_placements_for(&state, canvas_id).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].placement.x, 10.0);
        assert_eq!(cards[0].item.kind, "note");
        assert!(cards[0].item.payload.contains("T"));
    }

    #[test]
    fn update_placements_with_a_failing_row_leaves_every_row_unchanged() {
        let (_dir, state, canvas_id) = open();
        let card = create_note_card_for(
            &state,
            canvas_id,
            0.0,
            0.0,
            236.0,
            150.0,
            "T".into(),
            String::new(),
        )
        .unwrap();

        let result = update_placements_for(
            &state,
            vec![
                PlacementUpdate {
                    id: card.placement.id,
                    x: 500.0,
                    y: 500.0,
                    width: 236.0,
                    height: 150.0,
                    z_order: 0,
                },
                PlacementUpdate {
                    id: 9999,
                    x: 1.0,
                    y: 1.0,
                    width: 50.0,
                    height: 50.0,
                    z_order: 0,
                },
            ],
        );
        assert!(result.is_err());

        let cards = list_placements_for(&state, canvas_id).unwrap();
        assert_eq!(
            cards[0].placement.x, 0.0,
            "the good row must have rolled back too"
        );
    }

    #[test]
    fn delete_placements_last_placement_of_an_item_removes_the_item() {
        let (_dir, state, canvas_id) = open();
        let card = create_note_card_for(
            &state,
            canvas_id,
            0.0,
            0.0,
            236.0,
            150.0,
            "T".into(),
            String::new(),
        )
        .unwrap();

        let effect = delete_placements_for(&state, vec![card.placement.id]).unwrap();
        assert_eq!(effect.placements.len(), 1);
        assert_eq!(effect.items.len(), 1);
        assert!(list_placements_for(&state, canvas_id).unwrap().is_empty());
    }

    #[test]
    fn delete_placements_one_of_two_leaves_the_item() {
        let (_dir, state, canvas_id) = open();
        let card = create_note_card_for(
            &state,
            canvas_id,
            0.0,
            0.0,
            236.0,
            150.0,
            "T".into(),
            String::new(),
        )
        .unwrap();
        state
            .with_db(|conn| {
                insert_placement(conn, canvas_id, card.item.id, 300.0, 0.0, 236.0, 150.0)
            })
            .unwrap();

        let effect = delete_placements_for(&state, vec![card.placement.id]).unwrap();
        assert_eq!(effect.placements.len(), 1);
        assert!(effect.items.is_empty(), "the item still has a placement");
        assert_eq!(list_placements_for(&state, canvas_id).unwrap().len(), 1);
    }

    #[test]
    fn persistence_create_move_close_reopen_keeps_every_change() {
        let dir = tempfile::tempdir().unwrap();
        let (canvas_id, placement_id, item_id) = {
            let state = AppState::default();
            let project = open_project_at(&state, dir.path()).unwrap();
            let canvas_id = list_canvases_for(&state, project.id).unwrap()[0].id;
            let card = create_note_card_for(
                &state,
                canvas_id,
                0.0,
                0.0,
                236.0,
                150.0,
                "First".into(),
                "body".into(),
            )
            .unwrap();
            update_placements_for(
                &state,
                vec![PlacementUpdate {
                    id: card.placement.id,
                    x: 640.0,
                    y: 480.0,
                    width: 300.0,
                    height: 200.0,
                    z_order: 3,
                }],
            )
            .unwrap();
            crate::commands::canvas::update_canvas_view_for(&state, canvas_id, -50.0, -60.0, 0.75)
                .unwrap();
            (canvas_id, card.placement.id, card.item.id)
        };
        // The connection is dropped without a clean close — WAL must still hold every commit.

        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        let cards = list_placements_for(&state, canvas_id).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].placement.id, placement_id);
        assert_eq!(cards[0].item.id, item_id);
        assert_eq!(cards[0].placement.x, 640.0);
        assert_eq!(cards[0].placement.width, 300.0);

        let canvas = list_canvases_for(&state, project.id)
            .unwrap()
            .into_iter()
            .find(|c| c.id == canvas_id)
            .unwrap();
        assert_eq!(canvas.view_x, -50.0);
        assert_eq!(canvas.view_zoom, 0.75);
    }
}
