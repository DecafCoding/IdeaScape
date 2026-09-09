//! Opening a project folder and reading the project row back. Holds the shared
//! `AppState` — the open connection behind a `Mutex`, because `rusqlite::Connection` is
//! not `Sync`. Every command here is a plain `fn`, never `async fn`, so the guard is
//! never held across an await point.

use crate::db::connection::{now_iso8601, open_project_db};
use crate::db::models::{row_to_project, Project};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// How many recent projects the file keeps. Four is what design-system §9.1 draws — a
/// 2 × 2 grid — so a fifth entry would be data the user cannot reach.
pub const RECENT_LIMIT: usize = 4;

/// The file name inside `%APPDATA%\IdeaScape`. Deliberately a sibling of the Phase 5
/// `settings.json` rather than part of it: PRD §8.2 says that file holds exactly the four
/// values the Settings screen edits and no user data.
const RECENT_FILE_NAME: &str = "recent.json";

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

/// One entry in `%APPDATA%\IdeaScape\recent.json` — a project the user has opened, with
/// the counts and the timestamp the picker's Recent card prints. Field names must stay in
/// step with `RecentProject` in `src/lib/types.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    pub canvas_count: i64,
    pub card_count: i64,
    pub opened_at: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct RecentFile {
    #[serde(default)]
    projects: Vec<RecentProject>,
}

/// `%APPDATA%\IdeaScape` — the per-machine folder `settings-storage` and PRD §8.2 both
/// name. Tauri's `app_config_dir()` returns `%APPDATA%\com.ideascape.app`, which is not
/// that path and which the Phase 5 Settings screen would print to the user, so the
/// environment variable is read directly.
pub fn app_data_dir() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        if !appdata.is_empty() {
            return PathBuf::from(appdata).join("IdeaScape");
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        if !home.is_empty() {
            return PathBuf::from(home)
                .join("AppData")
                .join("Roaming")
                .join("IdeaScape");
        }
    }
    PathBuf::from(".").join("IdeaScape")
}

/// The recent-projects list, newest first. A missing, empty or unparseable file reads as an
/// empty list and is never an error: this file holds no user data, and losing it costs the
/// user four folder paths.
pub fn read_recent(dir: &Path) -> Vec<RecentProject> {
    let Ok(text) = std::fs::read_to_string(dir.join(RECENT_FILE_NAME)) else {
        return Vec::new();
    };
    serde_json::from_str::<RecentFile>(&text)
        .map(|f| f.projects)
        .unwrap_or_default()
}

/// Put `entry` at the front of the list, remove any earlier entry for the same folder, and
/// write the file back. Paths are compared case-insensitively because Windows paths are.
pub fn record_recent(dir: &Path, entry: RecentProject) -> AppResult<()> {
    let mut projects = read_recent(dir);
    let key = entry.path.to_lowercase();
    projects.retain(|p| p.path.to_lowercase() != key);
    projects.insert(0, entry);
    projects.truncate(RECENT_LIMIT);

    std::fs::create_dir_all(dir)?;
    let text = serde_json::to_string_pretty(&RecentFile { projects })?;
    std::fs::write(dir.join(RECENT_FILE_NAME), text)?;
    Ok(())
}

/// `std::fs::canonicalize` on Windows returns a `\\?\`-prefixed path, which is ugly in the
/// picker's path line. The prefix is stripped before the path is stored or shown.
fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy().to_string();
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}

/// The two counts a Recent card prints: canvases in the project, and cards across all of
/// them.
pub fn project_stats(conn: &Connection, project_id: i64) -> AppResult<(i64, i64)> {
    let canvases: i64 = conn.query_row(
        "SELECT count(*) FROM canvas WHERE project_id = ?1",
        [project_id],
        |r| r.get(0),
    )?;
    let cards: i64 = conn.query_row(
        "SELECT count(*) FROM placement p JOIN canvas c ON c.id = p.canvas_id
         WHERE c.project_id = ?1",
        [project_id],
        |r| r.get(0),
    )?;
    Ok((canvases, cards))
}

/// Note the just-opened project in the recents file under `dir`. A failure to write is
/// logged and never fails the open — the file is a convenience, not project data.
pub fn note_recent_in(dir: &Path, conn: &Connection, path: &Path, project: &Project) {
    let stored = std::fs::canonicalize(path)
        .map(|p| display_path(&p))
        .unwrap_or_else(|_| display_path(path));
    let stats = match project_stats(conn, project.id) {
        Ok(stats) => stats,
        Err(error) => {
            log::warn!("the project counts could not be read for the recents file: {error}");
            return;
        }
    };
    let entry = RecentProject {
        path: stored,
        name: project.name.clone(),
        canvas_count: stats.0,
        card_count: stats.1,
        opened_at: now_iso8601(),
    };
    if let Err(error) = record_recent(dir, entry) {
        log::warn!("the recent-projects file could not be written: {error}");
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

    // Recorded only under a real Tauri runtime: the Rust tests open projects with `app` as
    // `None`, and they must never write to this machine's own `%APPDATA%`. `note_recent_in`
    // takes its directory so the recents tests exercise the same path against a temp folder.
    if app.is_some() {
        note_recent_in(&app_data_dir(), &conn, path, &project);
    }

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

/// Make a new project folder under `parent_path` and open it. The name is a plain folder
/// name, never a path: the front end builds no paths, and a separator or a `..` in the name
/// is refused here rather than reaching the file system.
/// Returns the folder it created, not the project row, so the front end never has to build
/// `<parent>/<name>` itself — `ipc-contract` says the front end builds no file path, and the
/// caller needs the path to open the project into its store.
pub fn create_project_for(
    state: &AppState,
    parent_path: &str,
    name: &str,
    app: Option<&tauri::AppHandle>,
) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Invalid(String::from("a project needs a name")));
    }
    if !crate::commands::item::is_bare_file_name(trimmed) {
        return Err(AppError::Invalid(format!(
            "{trimmed} is not a folder name — leave out any \\ / : or .."
        )));
    }

    let target = Path::new(parent_path).join(trimmed);
    if target.exists() {
        return Err(AppError::Invalid(format!(
            "a folder called {trimmed} is already there"
        )));
    }

    std::fs::create_dir_all(&target)?;
    open_project_at_with(state, &target, app)?;
    Ok(display_path(&target))
}

#[tauri::command]
pub fn create_project(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    parent_path: String,
    name: String,
) -> AppResult<String> {
    create_project_for(&state, &parent_path, &name, Some(&app))
}

/// Let go of the open project, so the picker can show another one. The recent entry's
/// counts are refreshed from the still-open connection first, because they are what the
/// picker card will print the moment this returns. `recents_dir` is `None` in the tests, so
/// no test writes to this machine's own `%APPDATA%`.
pub fn close_project_for(state: &AppState, recents_dir: Option<&Path>) -> AppResult<()> {
    // Folder guard before db guard, per the lock-order rule above.
    let folder = state.project_folder();
    {
        let mut db = state.db.lock().map_err(|_| AppError::NoProject)?;
        if let (Some(conn), Some(folder), Some(recents)) =
            (db.as_ref(), folder.as_deref(), recents_dir)
        {
            if let Ok(project) = conn.query_row(
                "SELECT * FROM project ORDER BY id LIMIT 1",
                [],
                row_to_project,
            ) {
                note_recent_in(recents, conn, folder, &project);
            }
        }
        *db = None;
    }
    *state.folder.lock().map_err(|_| AppError::NoProject)? = None;
    Ok(())
}

#[tauri::command]
pub fn close_project(state: tauri::State<'_, AppState>) -> AppResult<()> {
    close_project_for(&state, Some(&app_data_dir()))
}

/// The recent projects the picker's 2 × 2 grid draws, newest first.
#[tauri::command]
pub fn list_recent_projects() -> AppResult<Vec<RecentProject>> {
    Ok(read_recent(&app_data_dir()))
}

/// Where the New project dialog offers to put a new folder — `%USERPROFILE%\Documents`.
/// The front end never builds a path, so the default comes from here.
#[tauri::command]
pub fn default_project_parent() -> AppResult<String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| String::from("."));
    Ok(PathBuf::from(home)
        .join("Documents")
        .to_string_lossy()
        .to_string())
}

/// The folder the `--perf-gate` measurement harness opens. This is all that survives of the
/// Phase 1 developer path: the picker is the only interactive route into a project, but
/// `nfr-targets` requires the 250-card frame gate to stay measurable in Phases 4 and 5, and
/// the harness needs a project without a human clicking one.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn perf_gate_project_path() -> AppResult<String> {
    Ok(resolve_perf_gate_project_path()
        .to_string_lossy()
        .to_string())
}

#[cfg(debug_assertions)]
pub fn resolve_perf_gate_project_path() -> PathBuf {
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

    fn entry(path: &str) -> RecentProject {
        RecentProject {
            path: String::from(path),
            name: String::from("P"),
            canvas_count: 1,
            card_count: 0,
            opened_at: now_iso8601(),
        }
    }

    #[test]
    fn record_recent_four_folders_keeps_newest_first() {
        let dir = tempfile::tempdir().unwrap();
        for path in [r"C:\a", r"C:\b", r"C:\c", r"C:\d"] {
            record_recent(dir.path(), entry(path)).unwrap();
        }
        let list = read_recent(dir.path());
        let paths: Vec<&str> = list.iter().map(|p| p.path.as_str()).collect();
        assert_eq!(paths, vec![r"C:\d", r"C:\c", r"C:\b", r"C:\a"]);
    }

    #[test]
    fn record_recent_same_folder_twice_is_one_entry_moved_to_front() {
        let dir = tempfile::tempdir().unwrap();
        record_recent(dir.path(), entry(r"C:\a")).unwrap();
        record_recent(dir.path(), entry(r"C:\b")).unwrap();
        // The same folder in a different case is the same folder on Windows.
        record_recent(dir.path(), entry(r"c:\A")).unwrap();

        let list = read_recent(dir.path());
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].path, r"c:\A");
        assert_eq!(list[1].path, r"C:\b");
    }

    #[test]
    fn record_recent_fifth_folder_drops_the_oldest() {
        let dir = tempfile::tempdir().unwrap();
        for path in [r"C:\a", r"C:\b", r"C:\c", r"C:\d", r"C:\e"] {
            record_recent(dir.path(), entry(path)).unwrap();
        }
        let list = read_recent(dir.path());
        assert_eq!(list.len(), RECENT_LIMIT);
        assert!(!list.iter().any(|p| p.path == r"C:\a"));
        assert_eq!(list[0].path, r"C:\e");
    }

    #[test]
    fn read_recent_missing_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_recent(dir.path()).is_empty());

        // Junk in the file is the same as no file: it holds no user data.
        std::fs::write(dir.path().join("recent.json"), "not json at all").unwrap();
        assert!(read_recent(dir.path()).is_empty());
    }

    #[test]
    fn open_project_at_records_counts_in_the_recent_file() {
        let recents = tempfile::tempdir().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        canvas::create_canvas_for(&state, project.id, "Second".into()).unwrap();
        crate::commands::placement::create_note_card_for(
            &state,
            canvas::list_canvases_for(&state, project.id).unwrap()[0].id,
            0.0,
            0.0,
            240.0,
            140.0,
            "A note".into(),
            String::new(),
        )
        .unwrap();

        state
            .with_db(|conn| {
                note_recent_in(recents.path(), conn, dir.path(), &project);
                Ok(())
            })
            .unwrap();

        let list = read_recent(recents.path());
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].canvas_count, 2);
        assert_eq!(list[0].card_count, 1);
        assert_eq!(list[0].name, project.name);
        // The `\\?\` prefix canonicalize adds on Windows must not reach the picker.
        assert!(!list[0].path.starts_with(r"\\?\"));
    }

    #[test]
    fn create_project_fresh_folder_creates_the_folder_and_first_canvas() {
        let parent = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let created = create_project_for(
            &state,
            &parent.path().to_string_lossy(),
            "  Ship notes  ",
            None,
        )
        .expect("create");

        let folder = parent.path().join("Ship notes");
        assert!(
            created.ends_with("Ship notes"),
            "the created folder is returned: {created}"
        );
        let project = state
            .with_db(|conn| {
                Ok(conn.query_row(
                    "SELECT * FROM project ORDER BY id LIMIT 1",
                    [],
                    row_to_project,
                )?)
            })
            .unwrap();
        assert!(folder.join("ideascape.db").is_file());
        assert!(folder.join("assets").is_dir());
        let canvases = canvas::list_canvases_for(&state, project.id).unwrap();
        assert_eq!(canvases.len(), 1);
        assert_eq!(canvases[0].name, "Canvas 1");
    }

    #[test]
    fn create_project_existing_folder_is_rejected() {
        let parent = tempfile::tempdir().unwrap();
        std::fs::create_dir(parent.path().join("Taken")).unwrap();
        let error = create_project_for(
            &AppState::default(),
            &parent.path().to_string_lossy(),
            "Taken",
            None,
        )
        .expect_err("an existing folder must be refused");
        assert!(error.to_string().contains("already there"), "{error}");
    }

    #[test]
    fn create_project_name_with_a_separator_is_rejected() {
        let parent = tempfile::tempdir().unwrap();
        for name in [r"a\b", "a/b", "..", "  ", "C:notes"] {
            let error = create_project_for(
                &AppState::default(),
                &parent.path().to_string_lossy(),
                name,
                None,
            )
            .expect_err("a name that is not a bare folder name must be refused");
            assert!(matches!(error, AppError::Invalid(_)), "{name}: {error}");
        }
    }

    #[test]
    fn close_project_then_with_db_reports_no_project() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        open_project_at(&state, dir.path()).unwrap();

        close_project_for(&state, None).expect("close");

        assert!(state.project_folder().is_none());
        let error = state.with_db(|_| Ok(())).expect_err("no project is open");
        assert!(matches!(error, AppError::NoProject));
    }

    #[test]
    fn open_project_damaged_file_error_names_the_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path()).unwrap();
        std::fs::write(dir.path().join("ideascape.db"), b"this is not a database").unwrap();

        let error = open_project_at(&AppState::default(), dir.path())
            .expect_err("a damaged database must not open");
        assert!(
            error.to_string().contains("ideascape.db"),
            "the message must name the file: {error}"
        );
    }

    /// Milestone 1's checkpoint. One test drives a whole project lifecycle through the
    /// command layer against real SQLite files: two projects recorded newest-first with their
    /// counts, three canvases in one, cards and a line on two of them, a canvas deleted with
    /// everything it owned, restored from its own effect, and a term that matches both a
    /// canvas name and a note body coming back canvas-first. No single task's VALIDATE
    /// crosses the recents file, the delete cascade and the ranking rule at once.
    #[test]
    fn milestone1_project_lifecycle_recents_cascade_restore_and_ranking() {
        use crate::commands::search;

        let recents = tempfile::tempdir().unwrap();
        let parent = tempfile::tempdir().unwrap();
        let state = AppState::default();

        // --- Two projects, recorded newest first with correct counts ------------------
        create_project_for(&state, &parent.path().to_string_lossy(), "Alpha", None).unwrap();
        let alpha_folder = parent.path().join("Alpha");
        let first_project = open_project_at(&state, &alpha_folder).unwrap();

        let alpha_canvas_1 = canvas::list_canvases_for(&state, first_project.id).unwrap()[0].id;
        canvas::rename_canvas_for(&state, alpha_canvas_1, "Chapter 3".into()).unwrap();
        let alpha_canvas_2 = canvas::create_canvas_for(&state, first_project.id, "Hull".into())
            .unwrap()
            .id;
        let alpha_canvas_3 = canvas::create_canvas_for(&state, first_project.id, "Spare".into())
            .unwrap()
            .id;
        assert_eq!(
            canvas::list_canvases_for(&state, first_project.id)
                .unwrap()
                .len(),
            3,
            "three canvases inside one project"
        );

        // Cards on two of the three, a picture, and a line between two of them.
        crate::commands::placement::create_note_card_for(
            &state,
            alpha_canvas_1,
            0.0,
            0.0,
            240.0,
            140.0,
            "Keel".into(),
            "the keel".into(),
        )
        .unwrap();
        let note = crate::commands::placement::create_note_card_for(
            &state,
            alpha_canvas_2,
            0.0,
            0.0,
            240.0,
            140.0,
            "Frames".into(),
            "chapter 3 is where the frames go".into(),
        )
        .unwrap();
        std::fs::write(alpha_folder.join("assets").join("pic.png"), b"bytes").unwrap();
        let image = crate::commands::asset::create_image_card_for(
            &state,
            alpha_canvas_2,
            300.0,
            0.0,
            200.0,
            150.0,
            "pic.png".into(),
            200,
            150,
            "alt".into(),
            "pic.png".into(),
        )
        .unwrap();
        crate::commands::connection::create_connection_for(
            &state,
            alpha_canvas_2,
            note.placement.id,
            image.placement.id,
            Some("joins".into()),
            1,
            None,
        )
        .unwrap();

        state
            .with_db(|conn| {
                note_recent_in(recents.path(), conn, &alpha_folder, &first_project);
                Ok(())
            })
            .unwrap();

        create_project_for(&state, &parent.path().to_string_lossy(), "Beta", None).unwrap();
        let beta_folder = parent.path().join("Beta");
        let second_project = open_project_at(&state, &beta_folder).unwrap();
        state
            .with_db(|conn| {
                note_recent_in(recents.path(), conn, &beta_folder, &second_project);
                Ok(())
            })
            .unwrap();

        let list = read_recent(recents.path());
        assert_eq!(list.len(), 2, "both projects are remembered");
        assert_eq!(list[0].name, "Beta", "newest first");
        assert_eq!(list[1].name, "Alpha");
        assert_eq!(list[1].canvas_count, 3);
        assert_eq!(list[1].card_count, 3, "two notes and one picture");

        // --- Back into Alpha: delete a canvas, and check it took everything with it ----
        open_project_at(&state, &alpha_folder).unwrap();
        let effect = canvas::delete_canvas_for(&state, alpha_canvas_2).expect("delete the canvas");

        assert_eq!(effect.placements.len(), 2);
        assert_eq!(
            effect.items.len(),
            2,
            "both items lost their last placement"
        );
        assert_eq!(
            effect.connections.len(),
            1,
            "the cascade's line is reported"
        );
        assert_eq!(effect.assets, vec![String::from("pic.png")]);
        assert!(!alpha_folder.join("assets").join("pic.png").exists());
        assert!(alpha_folder.join(".trash").join("pic.png").exists());
        assert_eq!(
            canvas::list_canvases_for(&state, first_project.id)
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            canvas::placements_on(&state, alpha_canvas_1).unwrap().len(),
            1
        );
        assert_eq!(
            canvas::placements_on(&state, alpha_canvas_3).unwrap().len(),
            0
        );

        // --- Restore it, and check every row and file came back -----------------------
        let restored = canvas::restore_canvas_for(&state, effect).expect("restore the canvas");

        assert_eq!(restored.name, "Hull");
        assert_eq!(
            canvas::list_canvases_for(&state, first_project.id)
                .unwrap()
                .len(),
            3
        );
        assert_eq!(canvas::placements_on(&state, restored.id).unwrap().len(), 2);
        let lines = crate::commands::connection::list_connections_for(&state, restored.id).unwrap();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].label.as_deref(), Some("joins"));
        let restored_ids: Vec<i64> = canvas::placements_on(&state, restored.id)
            .unwrap()
            .iter()
            .map(|p| p.id)
            .collect();
        assert!(
            restored_ids.contains(&lines[0].from_placement_id)
                && restored_ids.contains(&lines[0].to_placement_id),
            "the restored line joins the restored cards"
        );
        assert!(alpha_folder.join("assets").join("pic.png").exists());

        // --- The ranking rule, against a deliberately ambiguous term ------------------
        let results = search::search_project_for(&state, "chapter 3".into()).unwrap();
        assert_eq!(results.canvases.len(), 1, "the canvas name matched");
        assert_eq!(results.canvases[0].name, "Chapter 3");
        assert_eq!(results.cards.len(), 1, "and one note body matched");
        assert_eq!(results.cards[0].title, "Frames");
        assert!(!results.cards[0].matched_title, "found by its body");
        assert_eq!(
            results.cards[0].canvas_name, "Hull",
            "the hit carries the canvas it is on, which is the restored one"
        );
    }

    #[test]
    fn current_project_with_no_open_project_is_none() {
        let state = AppState::default();
        let guard = state.db.lock().unwrap();
        assert!(guard.is_none());
    }
}
