//! Listing and creating the canvases in the open project, and saving a canvas's pan and
//! zoom so it is restored the next time the canvas opens.

use crate::commands::project::AppState;
use crate::db::connection::now_iso8601;
use crate::db::models::{row_to_canvas, Canvas};
use crate::error::AppResult;

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
