//! Placements — where a card sits on one canvas, and how it stacks. A multi-row change
//! (a drag, a reorder, a delete) is written in exactly one transaction.

use crate::assets;
use crate::commands::connection::connections_touching;
use crate::commands::item::{
    asset_names, find_item, insert_item, insert_item_with_id, reference_count,
};
use crate::commands::project::AppState;
#[cfg(debug_assertions)]
use crate::db::connection::now_iso8601;
use crate::db::models::{
    row_to_item, row_to_placement, DeleteEffect, Item, Placement, PlacementUpdate,
    PlacementWithItem,
};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::collections::HashSet;

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
    insert_placement_with_id(conn, None, canvas_id, item_id, x, y, width, height, None)
}

/// Insert a placement, optionally keeping the id it had before it was deleted and the stack
/// position it held. See `restore_card_for` for why an undo puts the old id back.
/// `z_order` of `None` means "on top", which is what a brand-new card wants.
#[allow(clippy::too_many_arguments)]
pub fn insert_placement_with_id(
    conn: &Connection,
    id: Option<i64>,
    canvas_id: i64,
    item_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    z_order: Option<i64>,
) -> AppResult<Placement> {
    let z = match z_order {
        Some(z) => z,
        None => next_z_order(conn, canvas_id)?,
    };
    match id {
        Some(id) => conn.execute(
            "INSERT INTO placement (id, canvas_id, item_id, x, y, width, height, z_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![id, canvas_id, item_id, x, y, width, height, z],
        )?,
        None => conn.execute(
            "INSERT INTO placement (canvas_id, item_id, x, y, width, height, z_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![canvas_id, item_id, x, y, width, height, z],
        )?,
    };
    let id = id.unwrap_or_else(|| conn.last_insert_rowid());
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

/// Create a link card. It is written with `fetched_at: null` and no assets, because
/// contract 2 requires the card to exist *before* the network is consulted; the preview is
/// patched in afterwards through `update_item_payload`.
#[allow(clippy::too_many_arguments)]
pub fn create_link_card_for(
    state: &AppState,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    url: String,
) -> AppResult<PlacementWithItem> {
    let payload = serde_json::json!({
        "url": url,
        "title": "",
        "description": "",
        "favicon_asset": serde_json::Value::Null,
        "thumbnail_asset": serde_json::Value::Null,
        "fetched_at": serde_json::Value::Null,
    })
    .to_string();
    create_card_for(state, canvas_id, x, y, width, height, "link", &payload)
}

/// Create a video card, on the same before-the-network contract.
#[allow(clippy::too_many_arguments)]
pub fn create_video_card_for(
    state: &AppState,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    url: String,
    provider: String,
) -> AppResult<PlacementWithItem> {
    let payload = serde_json::json!({
        "url": url,
        "provider": provider,
        "title": "",
        "thumbnail_asset": serde_json::Value::Null,
        "fetched_at": serde_json::Value::Null,
    })
    .to_string();
    create_card_for(state, canvas_id, x, y, width, height, "video", &payload)
}

/// One card of any kind, in one transaction. The shared body of every card creator.
#[allow(clippy::too_many_arguments)]
fn create_card_for(
    state: &AppState,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    kind: &str,
    payload: &str,
) -> AppResult<PlacementWithItem> {
    state.with_db(|conn| {
        let tx = conn.transaction()?;
        let project_id: i64 = tx.query_row(
            "SELECT project_id FROM canvas WHERE id = ?1",
            [canvas_id],
            |r| r.get(0),
        )?;
        let item = insert_item(&tx, project_id, kind, payload)?;
        let placement = insert_placement(&tx, canvas_id, item.id, x, y, width, height)?;
        tx.commit()?;
        Ok(PlacementWithItem { placement, item })
    })
}

/// Re-create a card that was deleted, keeping its geometry and its place in the stack.
/// This is the write half of undoing a delete: the row genuinely goes back on disk, rather
/// than only back into the front end's memory.
///
/// `placement_id` and `item_id` are the ids the card had before it was deleted. Passing them
/// puts the row back under its own primary key, which is what keeps every *other* command on
/// the undo stack valid — a move, an edit or a line recorded against the old id would
/// otherwise name a row that no longer exists and fail the moment it was redone. Ids are
/// `AUTOINCREMENT`, so a deleted id is never re-issued and cannot collide. An item id that is
/// still live (the item kept a placement on another canvas) is reused rather than re-inserted.
///
/// Both are `None` when the caller wants a genuinely new card from an existing payload —
/// duplicate and paste — which is the one case where a new id is the point.
#[allow(clippy::too_many_arguments)]
pub fn restore_card_for(
    state: &AppState,
    canvas_id: i64,
    placement_id: Option<i64>,
    item_id: Option<i64>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    z_order: i64,
    kind: String,
    payload: String,
) -> AppResult<PlacementWithItem> {
    // Untrash before the row goes in, so a card is never on the canvas pointing at a file
    // that is still in the trash. The folder guard is taken and dropped before `with_db`:
    // `folder` and `db` are separate mutexes and only one lock order is deadlock-free.
    let folder = state.project_folder();
    if let Some(folder) = folder.as_deref() {
        for name in asset_names(&kind, &payload) {
            assets::untrash(folder, &name)?;
        }
    }

    state.with_db(|conn| {
        let tx = conn.transaction()?;
        let project_id: i64 = tx.query_row(
            "SELECT project_id FROM canvas WHERE id = ?1",
            [canvas_id],
            |r| r.get(0),
        )?;
        let live = match item_id {
            Some(id) => find_item(&tx, id)?,
            None => None,
        };
        let item = match live {
            Some(item) => item,
            None => insert_item_with_id(&tx, item_id, project_id, &kind, &payload)?,
        };
        let placement = insert_placement_with_id(
            &tx,
            placement_id,
            canvas_id,
            item.id,
            x,
            y,
            width,
            height,
            Some(z_order),
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

/// The whole delete, inside a transaction the caller owns. `delete_canvas` calls this so a
/// canvas and its cascade are one transaction rather than two, and so the orphan-item and
/// reference-count rules are written once rather than twice. The returned `assets` are named
/// but not yet moved: trashing happens after the caller commits.
pub(crate) fn delete_placements_tx(
    tx: &rusqlite::Transaction<'_>,
    ids: &[i64],
) -> AppResult<DeleteEffect> {
    {
        let mut effect = DeleteEffect::default();
        let mut seen_connections: HashSet<i64> = HashSet::new();
        let mut orphaned: Vec<String> = Vec::new();

        for id in ids {
            let placement = tx
                .query_row(
                    "SELECT * FROM placement WHERE id = ?1",
                    [id],
                    row_to_placement,
                )
                .ok();
            let Some(placement) = placement else { continue };

            // Capture the attached connections *before* the delete: the foreign-key cascade
            // removes them, and after it the select returns nothing. Deduplicated by id,
            // because a line whose two endpoints are both in `ids` is found twice.
            for row in connections_touching(tx, placement.id)? {
                if seen_connections.insert(row.id) {
                    effect.connections.push(row);
                }
            }

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
                // Collect the asset names, and whether anything else still holds them,
                // inside the transaction: after the item row goes the payload is unreadable
                // and the reference count would come out one short.
                for name in asset_names(&item.kind, &item.payload) {
                    if reference_count(tx, &name, item.id)? == 0 && !orphaned.contains(&name) {
                        orphaned.push(name);
                    }
                }
                tx.execute("DELETE FROM item WHERE id = ?1", [placement.item_id])?;
                effect.items.push(item);
            }
            effect.placements.push(placement);
        }

        effect.assets = orphaned;
        Ok(effect)
    }
}

/// Delete placements, and any item left with no placement at all. The returned effect names
/// every row removed, so one undo command can put all of it back together.
pub fn delete_placements_for(state: &AppState, ids: Vec<i64>) -> AppResult<DeleteEffect> {
    // Clone the folder out of its mutex before taking the db lock — never the other way
    // round, or two commands can deadlock.
    let folder = state.project_folder();

    let effect = state.with_db(|conn| {
        let tx = conn.transaction()?;
        let effect = delete_placements_tx(&tx, &ids)?;
        tx.commit()?;
        Ok(effect)
    })?;

    // Trashing happens after the commit: a rolled-back delete must not have moved a file.
    if let Some(folder) = folder.as_deref() {
        for name in &effect.assets {
            assets::trash(folder, name)?;
        }
    }
    Ok(effect)
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
pub fn create_link_card(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    url: String,
) -> AppResult<PlacementWithItem> {
    create_link_card_for(&state, canvas_id, x, y, width, height, url)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_video_card(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    url: String,
    provider: String,
) -> AppResult<PlacementWithItem> {
    create_video_card_for(&state, canvas_id, x, y, width, height, url, provider)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn restore_card(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    placement_id: Option<i64>,
    item_id: Option<i64>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    z_order: i64,
    kind: String,
    payload: String,
) -> AppResult<PlacementWithItem> {
    restore_card_for(
        &state,
        canvas_id,
        placement_id,
        item_id,
        x,
        y,
        width,
        height,
        z_order,
        kind,
        payload,
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

/// Development-only: fill a canvas with `count` cards spread over a large world rectangle,
/// so the 250-card performance gate has something to measure.
///
/// The mix is roughly 40% notes, 30% image, 20% link and 10% video, because pictures and
/// thumbnails are real decoded bitmaps and are the first per-frame work the Phase 1
/// measurement did not cover. Every seeded image card points at one real asset — copied in
/// through `assets::copy_in`, which content-hash dedupe reduces to a single file — and five
/// point at a deliberately absent name, so the missing-file marker is on screen during the
/// measurement.
///
/// **The harness makes no network call.** Link and video cards are seeded already-fetched
/// against that same local asset, and three of each are seeded not-fetched.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn seed_mixed_cards(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    count: i64,
) -> AppResult<i64> {
    seed_mixed_cards_for(&state, canvas_id, count)
}

/// The old name, kept as a thin wrapper so nothing that calls it breaks.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn seed_note_cards(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    count: i64,
) -> AppResult<i64> {
    seed_mixed_cards_for(&state, canvas_id, count)
}

/// The seeded asset, or `None` when the icon this copies in cannot be found — a missing
/// development file must not stop the harness, it just means fewer pictures on screen.
#[cfg(debug_assertions)]
fn seed_asset(folder: Option<&std::path::Path>) -> Option<String> {
    let folder = folder?;
    // The icon ships with the crate and is a real PNG, so no test fixture is needed.
    let source = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("icons/128x128.png");
    assets::copy_in(folder, &source).ok().map(|a| a.name)
}

#[cfg(debug_assertions)]
fn seed_mixed_cards_for(state: &AppState, canvas_id: i64, count: i64) -> AppResult<i64> {
    // The folder is cloned out of its mutex before the db lock, as everywhere else.
    let folder = state.project_folder();
    let asset = seed_asset(folder.as_deref());
    let missing_asset =
        String::from("0000000000000000000000000000000000000000000000000000000000000000.png");

    state.with_db(|conn| {
        let tx = conn.transaction()?;
        let project_id: i64 = tx.query_row(
            "SELECT project_id FROM canvas WHERE id = ?1",
            [canvas_id],
            |r| r.get(0),
        )?;
        let first_z = next_z_order(&tx, canvas_id)?;
        let columns = 20;
        let mut seeded: Vec<i64> = Vec::new();
        let mut images = 0;
        let mut links = 0;
        let mut videos = 0;

        for (z, n) in (first_z..).zip(0..count) {
            let col = n % columns;
            let row = n / columns;
            // 40 / 30 / 20 / 10 across every block of ten.
            let (kind, payload, width, height) = match n % 10 {
                0..=3 => (
                    "note",
                    serde_json::json!({
                        "title": format!("Seeded Note {}", n + 1),
                        "text": format!("Card **{}** of the seeded set.\n\n- one\n- two", n + 1),
                    })
                    .to_string(),
                    236.0,
                    150.0,
                ),
                4..=6 => {
                    images += 1;
                    // The first five image cards point at a name that is not there.
                    let name = if images <= 5 {
                        Some(missing_asset.clone())
                    } else {
                        asset.clone()
                    };
                    (
                        "image",
                        serde_json::json!({
                            "asset": name.unwrap_or_else(|| missing_asset.clone()),
                            "natural_width": 128,
                            "natural_height": 128,
                            "alt": "A seeded picture",
                            "source_name": format!("seeded-{}.png", n + 1),
                        })
                        .to_string(),
                        220.0,
                        220.0,
                    )
                }
                7..=8 => {
                    links += 1;
                    let fetched = links > 3;
                    (
                        "link",
                        serde_json::json!({
                            "url": format!("https://example.com/seeded/{}", n + 1),
                            "title": if fetched { format!("Seeded Page {}", n + 1) } else { String::new() },
                            "description": if fetched { String::from("A seeded preview description.") } else { String::new() },
                            "favicon_asset": if fetched { asset.clone() } else { None },
                            "thumbnail_asset": if fetched { asset.clone() } else { None },
                            "fetched_at": if fetched { Some(now_iso8601()) } else { None },
                        })
                        .to_string(),
                        236.0,
                        236.0,
                    )
                }
                _ => {
                    videos += 1;
                    let fetched = videos > 3;
                    (
                        "video",
                        serde_json::json!({
                            "url": format!("https://www.youtube.com/watch?v=seeded{:05}", n + 1),
                            "provider": "youtube",
                            "title": if fetched { format!("Seeded Video {}", n + 1) } else { String::new() },
                            "thumbnail_asset": if fetched { asset.clone() } else { None },
                            "fetched_at": if fetched { Some(now_iso8601()) } else { None },
                        })
                        .to_string(),
                        272.0,
                        246.0,
                    )
                }
            };

            let item = insert_item(&tx, project_id, kind, &payload)?;
            tx.execute(
                "INSERT INTO placement (canvas_id, item_id, x, y, width, height, z_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    canvas_id,
                    item.id,
                    col as f64 * 340.0,
                    row as f64 * 300.0,
                    width,
                    height,
                    z
                ],
            )?;
            seeded.push(tx.last_insert_rowid());
        }

        // One connection per adjacent pair, so the harness measures a realistic mixed
        // canvas rather than cards alone.
        for pair in seeded.windows(2) {
            tx.execute(
                "INSERT INTO connection (canvas_id, from_placement_id, to_placement_id, label, directed)
                 VALUES (?1, ?2, ?3, NULL, 1)",
                rusqlite::params![canvas_id, pair[0], pair[1]],
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
    fn delete_placements_reports_every_connection_it_removed() {
        use crate::commands::connection::{create_connection_for, list_connections_for};
        let (_dir, state, canvas_id) = open();
        let mut ids = Vec::new();
        for n in 0..3 {
            ids.push(
                create_note_card_for(
                    &state,
                    canvas_id,
                    n as f64 * 400.0,
                    0.0,
                    236.0,
                    150.0,
                    "T".into(),
                    String::new(),
                )
                .unwrap()
                .placement
                .id,
            );
        }
        create_connection_for(&state, canvas_id, ids[0], ids[1], Some("a".into()), 1).unwrap();
        create_connection_for(&state, canvas_id, ids[1], ids[2], Some("b".into()), 2).unwrap();

        // Deleting the middle card takes both lines with it, and each is reported once.
        let effect = delete_placements_for(&state, vec![ids[1]]).unwrap();
        assert_eq!(effect.connections.len(), 2);
        let labels: Vec<_> = effect
            .connections
            .iter()
            .map(|c| c.label.as_deref().unwrap_or(""))
            .collect();
        assert!(labels.contains(&"a") && labels.contains(&"b"));
        assert!(list_connections_for(&state, canvas_id).unwrap().is_empty());
    }

    #[test]
    fn delete_placements_a_line_between_two_deleted_cards_is_reported_once() {
        use crate::commands::connection::create_connection_for;
        let (_dir, state, canvas_id) = open();
        let a = create_note_card_for(
            &state,
            canvas_id,
            0.0,
            0.0,
            236.0,
            150.0,
            "T".into(),
            String::new(),
        )
        .unwrap()
        .placement
        .id;
        let b = create_note_card_for(
            &state,
            canvas_id,
            400.0,
            0.0,
            236.0,
            150.0,
            "T".into(),
            String::new(),
        )
        .unwrap()
        .placement
        .id;
        create_connection_for(&state, canvas_id, a, b, None, 1).unwrap();

        let effect = delete_placements_for(&state, vec![a, b]).unwrap();
        assert_eq!(effect.connections.len(), 1);
    }

    /// Milestone 1's checkpoint. It composes hashing, dedupe, reference counting, the
    /// delete cascade and the undo write path — none of which any single task's tests
    /// exercise together — over a real temp project folder.
    #[test]
    fn milestone1_assets_dedupe_reference_count_trash_and_restore_round_trip_real_bytes() {
        use crate::assets;
        use std::io::Write;

        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("project");
        let state = AppState::default();
        let project = open_project_at(&state, &folder).unwrap();
        let canvas_id = list_canvases_for(&state, project.id).unwrap()[0].id;

        // (a) the same bytes under two different original names produce exactly one file.
        let scratch = dir.path().join("scratch");
        std::fs::create_dir_all(&scratch).unwrap();
        let bytes = b"a picture's bytes, whatever they are";
        for name in ["first.png", "second.png"] {
            let mut file = std::fs::File::create(scratch.join(name)).unwrap();
            file.write_all(bytes).unwrap();
        }
        let first = assets::copy_in(&folder, &scratch.join("first.png")).unwrap();
        let second = assets::copy_in(&folder, &scratch.join("second.png")).unwrap();
        assert_eq!(first.name, second.name, "content hashing must dedupe");
        let count = std::fs::read_dir(assets::assets_dir(&folder))
            .unwrap()
            .count();
        assert_eq!(count, 1, "assets/ must hold exactly one file");

        // (b) two image cards pointing at that one asset.
        let mut cards = Vec::new();
        for n in 0..2 {
            cards.push(
                crate::commands::asset::create_image_card_for(
                    &state,
                    canvas_id,
                    n as f64 * 400.0,
                    0.0,
                    320.0,
                    240.0,
                    first.name.clone(),
                    100,
                    80,
                    String::from("alt text"),
                    format!("original-{n}.png"),
                )
                .unwrap(),
            );
        }

        // (c) deleting the first leaves the file, because the second still references it.
        delete_placements_for(&state, vec![cards[0].placement.id]).unwrap();
        assert!(
            assets::status(&folder, &first.name).exists,
            "a shared asset must survive one of its holders going"
        );

        // (d) deleting the second takes the file out of assets/ and into .trash/.
        let effect = delete_placements_for(&state, vec![cards[1].placement.id]).unwrap();
        assert_eq!(effect.assets, vec![first.name.clone()]);
        assert!(!assets::status(&folder, &first.name).exists);
        assert!(folder
            .join(assets::TRASH_DIR_NAME)
            .join(&first.name)
            .is_file());

        // (e) restoring the card brings the file back, byte-identical, under its own ids.
        let restored = restore_card_for(
            &state,
            canvas_id,
            Some(effect.placements[0].id),
            Some(effect.items[0].id),
            0.0,
            0.0,
            320.0,
            240.0,
            0,
            effect.items[0].kind.clone(),
            effect.items[0].payload.clone(),
        )
        .unwrap();
        assert_eq!(restored.item.kind, "image");
        assert_eq!(restored.placement.id, effect.placements[0].id);
        assert_eq!(restored.item.id, effect.items[0].id);
        assert!(assets::status(&folder, &first.name).exists);
        let back = std::fs::read(assets::assets_dir(&folder).join(&first.name)).unwrap();
        assert_eq!(back, bytes, "the restored file must be byte-identical");
    }

    #[test]
    fn delete_placements_an_image_whose_file_is_already_missing_still_succeeds() {
        let (_dir, state, canvas_id) = open();
        let card = crate::commands::asset::create_image_card_for(
            &state,
            canvas_id,
            0.0,
            0.0,
            320.0,
            240.0,
            String::from("deadbeef.png"),
            0,
            0,
            String::new(),
            String::from("gone.png"),
        )
        .unwrap();

        let effect = delete_placements_for(&state, vec![card.placement.id]).unwrap();
        assert_eq!(effect.items.len(), 1);
        assert_eq!(effect.assets, vec![String::from("deadbeef.png")]);
    }

    #[cfg(debug_assertions)]
    #[test]
    fn seed_mixed_cards_for_two_hundred_and_fifty_gives_the_intended_mix_and_no_network() {
        let (_dir, state, canvas_id) = open();
        assert_eq!(seed_mixed_cards_for(&state, canvas_id, 250).unwrap(), 250);

        let cards = list_placements_for(&state, canvas_id).unwrap();
        assert_eq!(cards.len(), 250);

        let count = |kind: &str| cards.iter().filter(|c| c.item.kind == kind).count();
        assert_eq!(count("note"), 100, "40% notes");
        assert_eq!(count("image"), 75, "30% image");
        assert_eq!(count("link"), 50, "20% link");
        assert_eq!(count("video"), 25, "10% video");

        // Five image cards deliberately point at an absent name, so the missing-file marker
        // is on screen during the measurement.
        let missing = cards
            .iter()
            .filter(|c| c.item.kind == "image" && c.item.payload.contains("0000000000"))
            .count();
        assert_eq!(missing, 5);

        // Three link cards and three video cards are seeded not-fetched.
        let not_fetched = |kind: &str| {
            cards
                .iter()
                .filter(|c| c.item.kind == kind && c.item.payload.contains("\"fetched_at\":null"))
                .count()
        };
        assert_eq!(not_fetched("link"), 3);
        assert_eq!(not_fetched("video"), 3);

        // The seeded assets deduplicate to one real file, which is what content hashing is for.
        let files = std::fs::read_dir(crate::assets::assets_dir(_dir.path()))
            .unwrap()
            .count();
        assert_eq!(files, 1, "one asset shared by every seeded picture");
    }

    /// §15.2's "missing asset" row, driven through the real command path: add a picture,
    /// close the project, delete the file from `assets/`, reopen. The item, the placement and
    /// the alt text all survive, the card keeps its authored size, and nothing errors.
    #[test]
    fn step4_missing_asset_deleting_the_file_and_reopening_keeps_the_item_and_its_alt_text() {
        use crate::assets;
        use std::io::Write;

        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("project");

        let (canvas_id, asset_name) = {
            let state = AppState::default();
            let project = open_project_at(&state, &folder).unwrap();
            let canvas_id = list_canvases_for(&state, project.id).unwrap()[0].id;

            let source = dir.path().join("picture.png");
            let mut file = std::fs::File::create(&source).unwrap();
            file.write_all(b"the picture's bytes").unwrap();
            drop(file);
            let asset = assets::copy_in(&folder, &source).unwrap();

            crate::commands::asset::create_image_card_for(
                &state,
                canvas_id,
                40.0,
                60.0,
                320.0,
                200.0,
                asset.name.clone(),
                640,
                400,
                String::from("A steel truss"),
                String::from("picture.png"),
            )
            .unwrap();
            (canvas_id, asset.name)
        };

        // The file leaves the folder behind the application's back.
        std::fs::remove_file(assets::assets_dir(&folder).join(&asset_name)).unwrap();

        let state = AppState::default();
        open_project_at(&state, &folder)
            .expect("a missing asset must never stop a project opening");
        let cards = list_placements_for(&state, canvas_id).unwrap();
        assert_eq!(cards.len(), 1, "the item and its placement survive");
        assert_eq!(cards[0].placement.width, 320.0, "the authored size is kept");
        assert_eq!(cards[0].placement.height, 200.0);
        assert!(
            cards[0].item.payload.contains("A steel truss"),
            "the alt text survives"
        );
        assert!(!assets::status(&folder, &asset_name).exists);
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
