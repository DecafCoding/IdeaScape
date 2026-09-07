//! Connections — the lines joining two cards on one canvas. Endpoints are never stored as
//! coordinates: a row names two placements and the front end derives the geometry, so
//! moving or resizing a card writes nothing here.
//!
//! The table and its index already ship in `0001_initial_schema.sql`; this phase adds no
//! migration.

use crate::commands::project::AppState;
use crate::db::models::{row_to_connection, Connection};
use crate::error::{AppError, AppResult};
use rusqlite::Connection as SqlConnection;

/// An empty or whitespace-only label is stored as SQL NULL, so "has a label" is one test
/// everywhere and no empty chip is ever drawn.
fn normalise_label(label: Option<String>) -> Option<String> {
    label
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Every connection on a canvas, oldest first.
pub fn list_connections_for(state: &AppState, canvas_id: i64) -> AppResult<Vec<Connection>> {
    state.with_db(|conn| {
        let mut stmt = conn.prepare("SELECT * FROM connection WHERE canvas_id = ?1 ORDER BY id")?;
        let rows = stmt
            .query_map([canvas_id], row_to_connection)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    })
}

/// The rows attached to one placement, in either direction. Used by `delete_placements_for`
/// to record what the foreign-key cascade is about to destroy.
pub fn connections_touching(
    conn: &SqlConnection,
    placement_id: i64,
) -> rusqlite::Result<Vec<Connection>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM connection
         WHERE from_placement_id = ?1 OR to_placement_id = ?1
         ORDER BY id",
    )?;
    let rows = stmt
        .query_map([placement_id], row_to_connection)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Join two cards. A card may not connect to itself, and the same ordered pair may not be
/// connected twice — the front end catches the second case and selects the row that exists
/// rather than surfacing an error. The reverse pair is a genuinely different connection.
pub fn create_connection_for(
    state: &AppState,
    canvas_id: i64,
    from_placement_id: i64,
    to_placement_id: i64,
    label: Option<String>,
    directed: i64,
) -> AppResult<Connection> {
    if from_placement_id == to_placement_id {
        return Err(AppError::Invalid(
            "a card cannot be connected to itself".into(),
        ));
    }
    let label = normalise_label(label);

    state.with_db(|conn| {
        let existing: i64 = conn.query_row(
            "SELECT count(*) FROM connection
             WHERE canvas_id = ?1 AND from_placement_id = ?2 AND to_placement_id = ?3",
            rusqlite::params![canvas_id, from_placement_id, to_placement_id],
            |r| r.get(0),
        )?;
        if existing > 0 {
            return Err(AppError::Invalid(
                "those two cards are already connected".into(),
            ));
        }

        conn.execute(
            "INSERT INTO connection (canvas_id, from_placement_id, to_placement_id, label, directed)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                canvas_id,
                from_placement_id,
                to_placement_id,
                label,
                directed
            ],
        )?;
        let id = conn.last_insert_rowid();
        Ok(conn.query_row(
            "SELECT * FROM connection WHERE id = ?1",
            [id],
            row_to_connection,
        )?)
    })
}

/// Put a deleted line back under its own id, so an `edit_connection` still on the undo stack
/// keeps naming a row that exists. Ids are `AUTOINCREMENT` and never re-issued, so the old id
/// is always free; a row that is somehow already there is returned rather than re-inserted.
/// The duplicate-pair rule is not re-tested here — the id is the identity of a restore, and a
/// line that existed once was already legal.
pub fn restore_connection_for(state: &AppState, connection: Connection) -> AppResult<Connection> {
    state.with_db(|conn| {
        let existing = conn
            .query_row(
                "SELECT * FROM connection WHERE id = ?1",
                [connection.id],
                row_to_connection,
            )
            .ok();
        if let Some(existing) = existing {
            return Ok(existing);
        }
        conn.execute(
            "INSERT INTO connection (id, canvas_id, from_placement_id, to_placement_id, label,
                                     directed, color, width, label_visible, route,
                                     from_anchor, to_anchor)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                connection.id,
                connection.canvas_id,
                connection.from_placement_id,
                connection.to_placement_id,
                connection.label,
                connection.directed,
                connection.color,
                connection.width,
                connection.label_visible,
                connection.route,
                connection.from_anchor,
                connection.to_anchor
            ],
        )?;
        Ok(conn.query_row(
            "SELECT * FROM connection WHERE id = ?1",
            [connection.id],
            row_to_connection,
        )?)
    })
}

/// Change a connection's label, arrow direction and appearance. Every field is always sent
/// together, because the properties panel holds them all and a partial update would need a
/// second command. The width step is clamped to 1-3; an unknown colour, route or anchor key
/// is stored as given and resolved to the default by the front end.
#[allow(clippy::too_many_arguments)]
pub fn update_connection_for(
    state: &AppState,
    connection_id: i64,
    label: Option<String>,
    directed: i64,
    color: String,
    width: i64,
    label_visible: bool,
    route: String,
    from_anchor: String,
    to_anchor: String,
) -> AppResult<Connection> {
    let label = normalise_label(label);
    let width = width.clamp(1, 3);
    state.with_db(|conn| {
        let changed = conn.execute(
            "UPDATE connection SET label = ?2, directed = ?3, color = ?4, width = ?5,
                                   label_visible = ?6, route = ?7, from_anchor = ?8,
                                   to_anchor = ?9
             WHERE id = ?1",
            rusqlite::params![
                connection_id,
                label,
                directed,
                color,
                width,
                label_visible,
                route,
                from_anchor,
                to_anchor
            ],
        )?;
        if changed == 0 {
            return Err(AppError::NotFound(format!("connection {connection_id}")));
        }
        Ok(conn.query_row(
            "SELECT * FROM connection WHERE id = ?1",
            [connection_id],
            row_to_connection,
        )?)
    })
}

/// Delete connections, returning the rows removed so one undo command can put them back
/// with their labels and directions intact.
pub fn delete_connections_for(state: &AppState, ids: Vec<i64>) -> AppResult<Vec<Connection>> {
    state.with_db(|conn| {
        let tx = conn.transaction()?;
        let mut removed = Vec::new();
        for id in &ids {
            let row = tx
                .query_row(
                    "SELECT * FROM connection WHERE id = ?1",
                    [id],
                    row_to_connection,
                )
                .ok();
            let Some(row) = row else { continue };
            tx.execute("DELETE FROM connection WHERE id = ?1", [id])?;
            removed.push(row);
        }
        tx.commit()?;
        Ok(removed)
    })
}

#[tauri::command]
pub fn list_connections(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
) -> AppResult<Vec<Connection>> {
    list_connections_for(&state, canvas_id)
}

#[tauri::command]
pub fn create_connection(
    state: tauri::State<'_, AppState>,
    canvas_id: i64,
    from_placement_id: i64,
    to_placement_id: i64,
    label: Option<String>,
    directed: i64,
) -> AppResult<Connection> {
    create_connection_for(
        &state,
        canvas_id,
        from_placement_id,
        to_placement_id,
        label,
        directed,
    )
}

#[tauri::command]
pub fn restore_connection(
    state: tauri::State<'_, AppState>,
    connection: Connection,
) -> AppResult<Connection> {
    restore_connection_for(&state, connection)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_connection(
    state: tauri::State<'_, AppState>,
    connection_id: i64,
    label: Option<String>,
    directed: i64,
    color: String,
    width: i64,
    label_visible: bool,
    route: String,
    from_anchor: String,
    to_anchor: String,
) -> AppResult<Connection> {
    update_connection_for(
        &state,
        connection_id,
        label,
        directed,
        color,
        width,
        label_visible,
        route,
        from_anchor,
        to_anchor,
    )
}

#[tauri::command]
pub fn delete_connections(
    state: tauri::State<'_, AppState>,
    ids: Vec<i64>,
) -> AppResult<Vec<Connection>> {
    delete_connections_for(&state, ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::canvas::list_canvases_for;
    use crate::commands::placement::create_note_card_for;
    use crate::commands::project::open_project_at;

    fn open() -> (tempfile::TempDir, AppState, i64) {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        let canvas_id = list_canvases_for(&state, project.id).unwrap()[0].id;
        (dir, state, canvas_id)
    }

    fn card(state: &AppState, canvas_id: i64, x: f64) -> i64 {
        create_note_card_for(
            state,
            canvas_id,
            x,
            0.0,
            236.0,
            150.0,
            "T".into(),
            String::new(),
        )
        .unwrap()
        .placement
        .id
    }

    #[test]
    fn create_connection_round_trips_through_list_connections() {
        let (_dir, state, canvas_id) = open();
        let a = card(&state, canvas_id, 0.0);
        let b = card(&state, canvas_id, 400.0);

        let made =
            create_connection_for(&state, canvas_id, a, b, Some("causes".into()), 1).unwrap();

        let rows = list_connections_for(&state, canvas_id).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0], made);
        assert_eq!(rows[0].label.as_deref(), Some("causes"));
        assert_eq!(rows[0].directed, 1);
        // A new line starts on the default ink at the thin step, with its chip shown.
        assert_eq!(rows[0].color, "default");
        assert_eq!(rows[0].width, 1);
        assert!(rows[0].label_visible);
        // And on the straight route — an existing canvas never changes shape by itself.
        assert_eq!(rows[0].route, "straight");
        // And on automatic anchors, so the geometry still picks both sides.
        assert_eq!(rows[0].from_anchor, "auto");
        assert_eq!(rows[0].to_anchor, "auto");
        assert_eq!(rows[0].from_placement_id, a);
        assert_eq!(rows[0].to_placement_id, b);
    }

    #[test]
    fn create_connection_rejects_a_card_connected_to_itself() {
        let (_dir, state, canvas_id) = open();
        let a = card(&state, canvas_id, 0.0);

        assert!(create_connection_for(&state, canvas_id, a, a, None, 1).is_err());
        assert!(list_connections_for(&state, canvas_id).unwrap().is_empty());
    }

    #[test]
    fn create_connection_rejects_a_duplicate_ordered_pair() {
        let (_dir, state, canvas_id) = open();
        let a = card(&state, canvas_id, 0.0);
        let b = card(&state, canvas_id, 400.0);

        create_connection_for(&state, canvas_id, a, b, None, 1).unwrap();
        assert!(create_connection_for(&state, canvas_id, a, b, None, 1).is_err());
        // The reverse pair is a different connection and is allowed.
        create_connection_for(&state, canvas_id, b, a, None, 1).unwrap();
        assert_eq!(list_connections_for(&state, canvas_id).unwrap().len(), 2);
    }

    #[test]
    fn update_connection_empty_label_stores_null() {
        let (_dir, state, canvas_id) = open();
        let a = card(&state, canvas_id, 0.0);
        let b = card(&state, canvas_id, 400.0);
        let made = create_connection_for(&state, canvas_id, a, b, Some("x".into()), 1).unwrap();

        let updated = update_connection_for(
            &state,
            made.id,
            Some("   ".into()),
            3,
            "red".into(),
            2,
            false,
            "elbow".into(),
            "right".into(),
            "left".into(),
        )
        .unwrap();
        assert_eq!(updated.label, None);
        assert_eq!(updated.directed, 3);
        assert_eq!(updated.color, "red");
        assert_eq!(updated.width, 2);
        assert!(!updated.label_visible);
        assert_eq!(updated.route, "elbow");
        assert_eq!(updated.from_anchor, "right");
        assert_eq!(updated.to_anchor, "left");
        assert_eq!(
            list_connections_for(&state, canvas_id).unwrap()[0].label,
            None
        );
    }

    #[test]
    fn delete_connections_returns_the_rows_it_removed() {
        let (_dir, state, canvas_id) = open();
        let a = card(&state, canvas_id, 0.0);
        let b = card(&state, canvas_id, 400.0);
        let made = create_connection_for(&state, canvas_id, a, b, Some("why".into()), 2).unwrap();

        let removed = delete_connections_for(&state, vec![made.id, 9999]).unwrap();
        assert_eq!(removed, vec![made]);
        assert!(list_connections_for(&state, canvas_id).unwrap().is_empty());
    }

    /// The data half of the phase gate, walked against real SQLite in a temp folder:
    /// the numbered session `scripts/phase-2-session.md` records, in the engine that ships.
    #[test]
    fn gate_session_notes_lines_labels_directions_deletes_and_a_reopen() {
        use crate::commands::placement::{delete_placements_for, restore_card_for};
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        let canvas_id = list_canvases_for(&state, project.id).unwrap()[0].id;

        // Steps 1–2: four notes, three lines between them.
        let cards: Vec<i64> = (0..4)
            .map(|n| card(&state, canvas_id, n as f64 * 400.0))
            .collect();
        let mut made = Vec::new();
        for pair in cards.windows(2) {
            made.push(create_connection_for(&state, canvas_id, pair[0], pair[1], None, 1).unwrap());
        }
        assert_eq!(list_connections_for(&state, canvas_id).unwrap().len(), 3);

        // Step 3: label all three. Step 4: flip one direction.
        for (i, row) in made.iter().enumerate() {
            update_connection_for(
                &state,
                row.id,
                Some(format!("edge {}", i + 1)),
                1,
                "default".into(),
                1,
                true,
                "straight".into(),
                "auto".into(),
                "auto".into(),
            )
            .unwrap();
        }
        update_connection_for(
            &state,
            made[0].id,
            Some("edge 1".into()),
            2,
            "blue".into(),
            3,
            true,
            "elbow".into(),
            "auto".into(),
            "auto".into(),
        )
        .unwrap();
        let rows = list_connections_for(&state, canvas_id).unwrap();
        assert_eq!(rows[0].directed, 2);
        assert_eq!(rows[0].color, "blue");
        assert_eq!(rows[0].width, 3);
        assert_eq!(rows[0].route, "elbow");
        assert_eq!(rows[2].label.as_deref(), Some("edge 3"));

        // Step 7: delete a connected card; both its lines are reported and gone.
        let effect = delete_placements_for(&state, vec![cards[1]]).unwrap();
        assert_eq!(effect.connections.len(), 2);
        assert_eq!(list_connections_for(&state, canvas_id).unwrap().len(), 1);

        // Step 8: undo — the card and both lines come back under the ids they had, which is
        // what leaves the rest of the undo stack naming rows that exist.
        let restored = restore_card_for(
            &state,
            canvas_id,
            Some(effect.placements[0].id),
            Some(effect.items[0].id),
            400.0,
            0.0,
            236.0,
            150.0,
            1,
            "note".into(),
            "{\"title\":\"T\",\"text\":\"\"}".into(),
        )
        .unwrap();
        let new_id = restored.placement.id;
        assert_eq!(
            new_id, cards[1],
            "restore_card must put the card back under its own id"
        );
        for old in &effect.connections {
            restore_connection_for(&state, old.clone()).unwrap();
        }
        let rows = list_connections_for(&state, canvas_id).unwrap();
        assert_eq!(rows.len(), 3);
        assert!(rows.iter().any(|r| r.label.as_deref() == Some("edge 1")
            && r.directed == 2
            && r.color == "blue"
            && r.route == "elbow"));

        // Step 10: close and reopen — every line, label and direction survives.
        drop(state);
        let state = AppState::default();
        open_project_at(&state, dir.path()).unwrap();
        let rows = list_connections_for(&state, canvas_id).unwrap();
        assert_eq!(rows.len(), 3);
        assert!(rows.iter().any(|r| r.label.as_deref() == Some("edge 1")
            && r.directed == 2
            && r.route == "elbow"));
        assert!(rows
            .iter()
            .any(|r| r.from_placement_id == new_id || r.to_placement_id == new_id));
        // Every restored line kept its own id too.
        for old in &effect.connections {
            assert!(rows.iter().any(|r| r.id == old.id));
        }

        // Step 12: delete a line on its own — it goes, the cards stay.
        let removed = delete_connections_for(&state, vec![rows[0].id]).unwrap();
        assert_eq!(removed.len(), 1);
        assert_eq!(list_connections_for(&state, canvas_id).unwrap().len(), 2);
        assert_eq!(
            crate::commands::placement::list_placements_for(&state, canvas_id)
                .unwrap()
                .len(),
            4
        );
    }

    #[test]
    fn connection_survives_closing_and_reopening_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let (canvas_id, from_id, to_id) = {
            let state = AppState::default();
            let project = open_project_at(&state, dir.path()).unwrap();
            let canvas_id = list_canvases_for(&state, project.id).unwrap()[0].id;
            let a = card(&state, canvas_id, 0.0);
            let b = card(&state, canvas_id, 400.0);
            create_connection_for(&state, canvas_id, a, b, Some("leads to".into()), 3).unwrap();
            (canvas_id, a, b)
        };
        // The connection is dropped without a clean close — WAL must still hold the commit.

        let state = AppState::default();
        open_project_at(&state, dir.path()).unwrap();
        let rows = list_connections_for(&state, canvas_id).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].label.as_deref(), Some("leads to"));
        assert_eq!(rows[0].directed, 3);
        assert_eq!(rows[0].from_placement_id, from_id);
        assert_eq!(rows[0].to_placement_id, to_id);
    }
}
