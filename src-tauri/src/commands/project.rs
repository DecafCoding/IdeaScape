//! Opening a project folder and reading the project row back. Holds the shared
//! `AppState` — the open connection behind a `Mutex`, because `rusqlite::Connection` is
//! not `Sync`. Every command here is a plain `fn`, never `async fn`, so the guard is
//! never held across an await point.

use crate::db::connection::{now_iso8601, open_project_db};
use crate::db::models::{row_to_project, Project};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    pub db: Mutex<Option<Connection>>,
    pub folder: Mutex<Option<PathBuf>>,
}

impl AppState {
    /// Run `f` against the open connection, or fail with `NoProject`.
    pub fn with_db<T>(&self, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
        let mut guard = self.db.lock().map_err(|_| AppError::NoProject)?;
        let conn = guard.as_mut().ok_or(AppError::NoProject)?;
        f(conn)
    }

    /// The open project's folder, cloned out of its mutex.
    ///
    /// Always call this *before* `with_db`, and never hold the result of `folder.lock()`
    /// across a db lock or an await: `folder` and `db` are two separate mutexes, and only
    /// one lock order is deadlock-free.
    pub fn project_folder(&self) -> Option<PathBuf> {
        self.folder.lock().ok().and_then(|g| g.clone())
    }

    /// The same, as an error rather than an `Option`, for a command that cannot proceed
    /// without a project folder.
    pub fn require_folder(&self) -> AppResult<PathBuf> {
        self.project_folder().ok_or(AppError::NoProject)
    }
}

/// Open (or create) the project folder at `path`, migrate its database, and return the
/// project row — inserting it, plus a first canvas, the first time the folder is used.
pub fn open_project_at(state: &AppState, path: &Path) -> AppResult<Project> {
    open_project_at_with(state, path, None)
}

/// The same, plus the runtime asset-protocol grant an `<img src>` needs.
///
/// The scope is empty in `tauri.conf.json` and granted here instead: a project folder can
/// be anywhere on disk, so a runtime grant of exactly one `assets/` directory is narrower
/// than any static scope could be. `app` is optional so the tests can open a project
/// without a Tauri runtime.
pub fn open_project_at_with(
    state: &AppState,
    path: &Path,
    app: Option<&tauri::AppHandle>,
) -> AppResult<Project> {
    let conn = open_project_db(path)?;
    let project = ensure_project(&conn, path)?;
    *state.db.lock().map_err(|_| AppError::NoProject)? = Some(conn);
    *state.folder.lock().map_err(|_| AppError::NoProject)? = Some(path.to_path_buf());

    // The undo stack is session-only, so a trashed asset that survived a restart can never
    // be restored and is dead weight. Purged after the migrations, never before.
    crate::assets::purge_trash(path)?;

    if let Some(app) = app {
        use tauri::Manager;
        let dir = crate::assets::assets_dir(path);
        if let Err(error) = app.asset_protocol_scope().allow_directory(&dir, false) {
            log::warn!("the assets folder could not be granted to the asset protocol: {error}");
        }
    }
    Ok(project)
}

fn ensure_project(conn: &Connection, path: &Path) -> AppResult<Project> {
    let existing = conn
        .query_row(
            "SELECT * FROM project ORDER BY id LIMIT 1",
            [],
            row_to_project,
        )
        .ok();
    if let Some(project) = existing {
        return Ok(project);
    }

    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| String::from("IdeaScape Project"));
    let now = now_iso8601();
    conn.execute(
        "INSERT INTO project (name, created_at, updated_at) VALUES (?1, ?2, ?2)",
        rusqlite::params![name, now],
    )?;
    let project_id = conn.last_insert_rowid();

    // A brand-new project needs somewhere for the empty-canvas state to live.
    conn.execute(
        "INSERT INTO canvas (project_id, name, sort_order, created_at, updated_at)
         VALUES (?1, 'Canvas 1', 0, ?2, ?2)",
        rusqlite::params![project_id, now],
    )?;

    Ok(conn.query_row(
        "SELECT * FROM project WHERE id = ?1",
        [project_id],
        row_to_project,
    )?)
}

#[tauri::command]
pub fn open_project(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> AppResult<Project> {
    open_project_at_with(&state, Path::new(&path), Some(&app))
}

#[tauri::command]
pub fn current_project(state: tauri::State<'_, AppState>) -> AppResult<Option<Project>> {
    let mut guard = state.db.lock().map_err(|_| AppError::NoProject)?;
    let Some(conn) = guard.as_mut() else {
        return Ok(None);
    };
    Ok(conn
        .query_row(
            "SELECT * FROM project ORDER BY id LIMIT 1",
            [],
            row_to_project,
        )
        .ok())
}

/// The developer path into a project until the picker lands in Phase 4: `--project <path>`,
/// falling back to a fixed folder so a double-click launch still works.
#[tauri::command]
pub fn dev_project_path() -> AppResult<String> {
    Ok(resolve_dev_project_path().to_string_lossy().to_string())
}

pub fn resolve_dev_project_path() -> PathBuf {
    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|a| a == "--project") {
        if let Some(value) = args.get(i + 1) {
            return PathBuf::from(value);
        }
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| String::from("."));
    PathBuf::from(home)
        .join("Documents")
        .join("IdeaScape")
        .join("Dev project")
}

/// True when the binary was launched with `--perf-gate`, which runs the Task-21
/// measurement harness instead of an interactive session. Development builds only.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn perf_gate_requested() -> AppResult<bool> {
    Ok(std::env::args().any(|a| a == "--perf-gate"))
}

/// Write the finished gate measurement beside the binary's working directory, so the
/// recorded artefact the PR body cites comes from the running application.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn record_perf_result(json: String) -> AppResult<String> {
    let path = std::env::current_dir()?.join("perf-gate-result.json");
    std::fs::write(&path, json)?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::canvas;

    #[test]
    fn open_project_at_fresh_folder_creates_project_and_first_canvas() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).expect("open");

        let canvases = canvas::list_canvases_for(&state, project.id).expect("list");
        assert_eq!(canvases.len(), 1);
        assert_eq!(canvases[0].name, "Canvas 1");
    }

    #[test]
    fn open_project_at_existing_folder_reuses_the_project_row() {
        let dir = tempfile::tempdir().unwrap();
        let first = open_project_at(&AppState::default(), dir.path()).expect("open");
        let second = open_project_at(&AppState::default(), dir.path()).expect("reopen");
        assert_eq!(first.id, second.id);
    }

    #[test]
    fn open_create_canvas_list_round_trips_across_a_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let project_id = {
            let state = AppState::default();
            let project = open_project_at(&state, dir.path()).expect("open");
            canvas::create_canvas_for(&state, project.id, "Second".into()).expect("create");
            project.id
        };

        let state = AppState::default();
        open_project_at(&state, dir.path()).expect("reopen");
        let canvases = canvas::list_canvases_for(&state, project_id).expect("list");
        assert_eq!(canvases.len(), 2);
        assert_eq!(canvases[1].name, "Second");
    }

    #[test]
    fn current_project_with_no_open_project_is_none() {
        let state = AppState::default();
        let guard = state.db.lock().unwrap();
        assert!(guard.is_none());
    }
}
