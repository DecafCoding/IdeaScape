//! Items — the content half of a card. An item lives in the project library; a placement
//! puts it on one canvas. The payload is a JSON text column, validated against `kind`
//! before it is written.

use crate::commands::project::AppState;
use crate::db::connection::now_iso8601;
use crate::db::models::{row_to_item, Item};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;

pub const KINDS: [&str; 4] = ["note", "image", "link", "video"];

/// Reject a kind outside the schema's CHECK list, and a payload that is not a JSON object,
/// before either reaches the database.
pub fn validate_payload(kind: &str, payload: &str) -> AppResult<()> {
    if !KINDS.contains(&kind) {
        return Err(AppError::Invalid(format!("card kind {kind}")));
    }
    let value: serde_json::Value = serde_json::from_str(payload)?;
    if !value.is_object() {
        return Err(AppError::Invalid(String::from(
            "a card payload must be an object",
        )));
    }
    if kind == "note" && !value.get("title").is_some_and(|t| t.is_string()) {
        return Err(AppError::Invalid(String::from(
            "a note payload needs a title",
        )));
    }
    Ok(())
}

pub fn insert_item(
    conn: &Connection,
    project_id: i64,
    kind: &str,
    payload: &str,
) -> AppResult<Item> {
    validate_payload(kind, payload)?;
    let now = now_iso8601();
    conn.execute(
        "INSERT INTO item (project_id, kind, payload, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        rusqlite::params![project_id, kind, payload, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row("SELECT * FROM item WHERE id = ?1", [id], row_to_item)?)
}

#[tauri::command]
pub fn create_item(
    state: tauri::State<'_, AppState>,
    project_id: i64,
    kind: String,
    payload: String,
) -> AppResult<Item> {
    state.with_db(|conn| insert_item(conn, project_id, &kind, &payload))
}

#[tauri::command]
pub fn update_item_payload(
    state: tauri::State<'_, AppState>,
    item_id: i64,
    payload: String,
) -> AppResult<Item> {
    state.with_db(|conn| {
        let kind: String = conn
            .query_row("SELECT kind FROM item WHERE id = ?1", [item_id], |r| {
                r.get(0)
            })
            .map_err(|_| AppError::NotFound(format!("item {item_id}")))?;
        validate_payload(&kind, &payload)?;
        conn.execute(
            "UPDATE item SET payload = ?2, updated_at = ?3 WHERE id = ?1",
            rusqlite::params![item_id, payload, now_iso8601()],
        )?;
        Ok(
            conn.query_row("SELECT * FROM item WHERE id = ?1", [item_id], |r| {
                row_to_item(r)
            })?,
        )
    })
}

#[tauri::command]
pub fn delete_item(state: tauri::State<'_, AppState>, item_id: i64) -> AppResult<()> {
    state.with_db(|conn| {
        conn.execute("DELETE FROM item WHERE id = ?1", [item_id])?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_payload_unknown_kind_is_rejected() {
        assert!(validate_payload("sketch", "{}").is_err());
    }

    #[test]
    fn validate_payload_note_without_a_title_is_rejected() {
        assert!(validate_payload("note", r#"{"text":"hi"}"#).is_err());
    }

    #[test]
    fn validate_payload_well_formed_note_is_accepted() {
        assert!(validate_payload("note", r#"{"title":"T","text":"hi"}"#).is_ok());
    }

    #[test]
    fn validate_payload_non_object_json_is_rejected() {
        assert!(validate_payload("link", "[1,2,3]").is_err());
    }
}
