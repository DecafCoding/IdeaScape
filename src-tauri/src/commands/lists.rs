//! The vocabulary a Pick or Pick Many field offers: the shipped entries, plus the words this
//! project's author typed.
//!
//! A typed value is always accepted and is saved to the project's own list, so it is offered
//! again next time. `list_entry` is per project rather than per machine, which is what makes
//! a copied project folder carry its own vocabulary.
//!
//! A user entry never gains an `id`, even when its text later matches a shipped entry
//! exactly. The id means "this came from there"; minting one retrospectively would be a
//! false claim.

use crate::blueprints::lists::{shipped, ListEntry};
use crate::commands::project::AppState;
use crate::db::connection::now_iso8601;
use crate::error::{AppError, AppResult};

/// The one project row every read and write is scoped by. There is exactly one project row
/// per folder, so this is a lookup rather than an argument the front end has to carry.
fn project_id(conn: &rusqlite::Connection) -> AppResult<i64> {
    Ok(conn.query_row("SELECT id FROM project ORDER BY id LIMIT 1", [], |r| {
        r.get(0)
    })?)
}

/// The shipped entries for `list`, then this project's own rows that are not already present
/// by text. The comparison is case-insensitive: "Chosen One" and "chosen one" are one entry.
pub fn list_entries_for(state: &AppState, list: String) -> AppResult<Vec<ListEntry>> {
    state.with_db(|conn| {
        let project = project_id(conn)?;
        let mut entries: Vec<ListEntry> = shipped(&list).to_vec();
        let mut seen: Vec<String> = entries.iter().map(|e| e.text.to_lowercase()).collect();

        let mut stmt = conn.prepare(
            "SELECT text FROM list_entry WHERE project_id = ?1 AND list = ?2
             ORDER BY text COLLATE NOCASE, id",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![project, list], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<String>>>()?;

        for text in rows {
            let key = text.to_lowercase();
            if seen.contains(&key) {
                continue;
            }
            seen.push(key);
            // No id and no tags, permanently — that absence is what marks it as the user's.
            entries.push(ListEntry {
                id: None,
                text,
                tags: Vec::new(),
            });
        }
        Ok(entries)
    })
}

/// Save a value the user typed. Returns whether a row was actually written, which is what
/// lets undo know there is anything to reverse.
pub fn add_list_entry_for(state: &AppState, list: String, text: String) -> AppResult<bool> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err(AppError::Invalid(String::from(
            "a list entry needs some text",
        )));
    }
    state.with_db(|conn| {
        let project = project_id(conn)?;
        // Deduplicate against the shipped entries in Rust: SQLite compares TEXT
        // case-sensitively, so the unique index alone would let two casings through.
        let lower = text.to_lowercase();
        if shipped(&list).iter().any(|e| e.text.to_lowercase() == lower) {
            return Ok(false);
        }
        let existing: i64 = conn.query_row(
            "SELECT count(*) FROM list_entry
             WHERE project_id = ?1 AND list = ?2 AND lower(text) = ?3",
            rusqlite::params![project, list, lower],
            |r| r.get(0),
        )?;
        if existing > 0 {
            return Ok(false);
        }
        let changed = conn.execute(
            "INSERT OR IGNORE INTO list_entry (project_id, list, text, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![project, list, text, now_iso8601()],
        )?;
        Ok(changed > 0)
    })
}

/// Remove one of this project's own entries. A shipped entry is not stored here, so removing
/// one is a no-op rather than an error — nothing the user can do makes the shipped list shrink.
pub fn remove_list_entry_for(state: &AppState, list: String, text: String) -> AppResult<()> {
    state.with_db(|conn| {
        let project = project_id(conn)?;
        conn.execute(
            "DELETE FROM list_entry
             WHERE project_id = ?1 AND list = ?2 AND lower(text) = ?3",
            rusqlite::params![project, list, text.trim().to_lowercase()],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn list_entries(state: tauri::State<'_, AppState>, list: String) -> AppResult<Vec<ListEntry>> {
    list_entries_for(&state, list)
}

#[tauri::command]
pub fn add_list_entry(
    state: tauri::State<'_, AppState>,
    list: String,
    text: String,
) -> AppResult<bool> {
    add_list_entry_for(&state, list, text)
}

#[tauri::command]
pub fn remove_list_entry(
    state: tauri::State<'_, AppState>,
    list: String,
    text: String,
) -> AppResult<()> {
    remove_list_entry_for(&state, list, text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::project::open_project_at;

    fn open() -> (tempfile::TempDir, AppState) {
        let dir = tempfile::tempdir().expect("a temp directory");
        let state = AppState::default();
        open_project_at(&state, dir.path()).expect("open");
        (dir, state)
    }

    #[test]
    fn list_entries_with_no_user_rows_returns_the_shipped_entries() {
        let (_dir, state) = open();
        let entries = list_entries_for(&state, String::from("genres")).unwrap();
        assert_eq!(entries.len(), 8);
        assert!(entries.iter().all(|e| e.id.is_some()));
    }

    #[test]
    fn add_list_entry_a_new_value_is_offered_next_time() {
        let (_dir, state) = open();
        let wrote =
            add_list_entry_for(&state, String::from("themes"), String::from("Ark ship")).unwrap();
        assert!(wrote);
        let entries = list_entries_for(&state, String::from("themes")).unwrap();
        let mine = entries.iter().find(|e| e.text == "Ark ship").expect("kept");
        assert_eq!(mine.id, None, "a typed value never gains an id");
        assert!(mine.tags.is_empty());
    }

    #[test]
    fn add_list_entry_a_value_already_shipped_writes_nothing() {
        let (_dir, state) = open();
        let shipped_text = shipped("genres")[0].text.clone();
        let wrote = add_list_entry_for(&state, String::from("genres"), shipped_text).unwrap();
        assert!(!wrote);
        assert_eq!(
            list_entries_for(&state, String::from("genres"))
                .unwrap()
                .len(),
            8
        );
    }

    #[test]
    fn add_list_entry_the_same_value_twice_writes_one_row() {
        let (_dir, state) = open();
        assert!(add_list_entry_for(&state, String::from("themes"), String::from("Chosen One")).unwrap());
        assert!(!add_list_entry_for(&state, String::from("themes"), String::from("Chosen One")).unwrap());
        // And in another casing — one row, not two.
        assert!(!add_list_entry_for(&state, String::from("themes"), String::from("chosen one")).unwrap());
        let entries = list_entries_for(&state, String::from("themes")).unwrap();
        let mine: Vec<_> = entries
            .iter()
            .filter(|e| e.text.to_lowercase() == "chosen one")
            .collect();
        assert_eq!(mine.len(), 1);
    }

    #[test]
    fn add_list_entry_an_empty_string_is_refused() {
        let (_dir, state) = open();
        assert!(add_list_entry_for(&state, String::from("themes"), String::from("   ")).is_err());
    }

    #[test]
    fn remove_list_entry_removes_only_the_user_row() {
        let (_dir, state) = open();
        add_list_entry_for(&state, String::from("themes"), String::from("Ark ship")).unwrap();
        remove_list_entry_for(&state, String::from("themes"), String::from("Ark ship")).unwrap();
        let entries = list_entries_for(&state, String::from("themes")).unwrap();
        assert!(!entries.iter().any(|e| e.text == "Ark ship"));
        assert_eq!(entries.len(), shipped("themes").len());
    }

    #[test]
    fn list_entries_are_scoped_to_one_project() {
        let (_a, state_a) = open();
        add_list_entry_for(&state_a, String::from("themes"), String::from("Ark ship")).unwrap();

        let (_b, state_b) = open();
        let entries = list_entries_for(&state_b, String::from("themes")).unwrap();
        assert!(
            !entries.iter().any(|e| e.text == "Ark ship"),
            "a second project carries its own vocabulary"
        );
    }
}
