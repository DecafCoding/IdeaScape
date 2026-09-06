//! Opening a project's database. The folder and its `assets/` subfolder are created if
//! absent, WAL and foreign keys are set on every open (both are per-connection), and the
//! migrations run before the connection is handed back.

use crate::db::migrations;
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::path::Path;

pub const DB_FILE_NAME: &str = "ideascape.db";

/// Open (creating if needed) the project folder at `folder` and return a migrated
/// connection to its database.
pub fn open_project_db(folder: &Path) -> AppResult<Connection> {
    std::fs::create_dir_all(folder)?;
    std::fs::create_dir_all(folder.join("assets"))?;

    let mut conn = Connection::open(folder.join(DB_FILE_NAME))
        .map_err(|e| AppError::DatabaseOpen(e.to_string()))?;

    // PRAGMA journal_mode returns a row, so it cannot go through `execute`.
    let _: String = conn.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    migrations::apply(&mut conn)?;
    Ok(conn)
}

/// The current time as ISO-8601 text, which is what every `created_at` / `updated_at`
/// column stores — it keeps the project's database file readable by hand.
pub fn now_iso8601() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| String::from("1970-01-01T00:00:00Z"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_project() -> tempfile::TempDir {
        tempfile::tempdir().expect("a temp directory")
    }

    #[test]
    fn open_project_db_fresh_folder_creates_schema_and_assets() {
        let dir = temp_project();
        let path = dir.path().join("project");
        let conn = open_project_db(&path).expect("open");

        assert!(path.join("assets").is_dir());
        assert!(path.join(DB_FILE_NAME).is_file());

        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        for expected in ["canvas", "connection", "item", "placement", "project"] {
            assert!(tables.contains(&expected.to_string()), "missing {expected}");
        }
    }

    #[test]
    fn open_project_db_reports_wal_journal_mode() {
        let dir = temp_project();
        let conn = open_project_db(dir.path()).expect("open");
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert_eq!(mode.to_lowercase(), "wal");
    }

    #[test]
    fn open_project_db_already_migrated_file_is_a_no_op() {
        let dir = temp_project();
        {
            let conn = open_project_db(dir.path()).expect("first open");
            conn.execute(
                "INSERT INTO project (name, created_at, updated_at) VALUES ('P', 'x', 'x')",
                [],
            )
            .unwrap();
        }
        let conn = open_project_db(dir.path()).expect("second open");
        let count: i64 = conn
            .query_row("SELECT count(*) FROM project", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn placement_referencing_a_missing_canvas_is_rejected() {
        let dir = temp_project();
        let conn = open_project_db(dir.path()).expect("open");
        let result = conn.execute(
            "INSERT INTO placement (canvas_id, item_id, x, y, width, height, z_order)
             VALUES (999, 999, 0, 0, 10, 10, 0)",
            [],
        );
        assert!(result.is_err(), "foreign keys must be enforced");
    }
}
