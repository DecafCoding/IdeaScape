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
    if kind == "image" && !value.get("asset").is_some_and(|a| a.is_string()) {
        return Err(AppError::Invalid(String::from(
            "an image payload needs an asset file name",
        )));
    }
    if (kind == "link" || kind == "video") && !value.get("url").is_some_and(|u| u.is_string()) {
        return Err(AppError::Invalid(format!("a {kind} payload needs a url")));
    }
    if kind == "video" && !value.get("provider").is_some_and(|p| p.is_string()) {
        return Err(AppError::Invalid(String::from(
            "a video payload needs a provider",
        )));
    }
    // An asset value names a file inside `assets/` and nothing else. Refusing a separator
    // or a `..` here is what stops a hand-edited payload naming a file outside the folder.
    for name in asset_names(kind, payload) {
        if !is_bare_file_name(&name) {
            return Err(AppError::Invalid(format!("asset file name {name}")));
        }
    }
    Ok(())
}

/// True when `name` is a plain file name — no separator, no traversal, not empty.
pub fn is_bare_file_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
        && !name.contains(':')
}

/// The asset file names a payload holds. This is the one place that knows which fields of
/// which kind are assets; `delete_placements` and `restore_card` both read it.
pub fn asset_names(kind: &str, payload: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) else {
        return Vec::new();
    };
    let fields: &[&str] = match kind {
        "image" => &["asset"],
        "link" => &["favicon_asset", "thumbnail_asset"],
        "video" => &["thumbnail_asset"],
        _ => &[],
    };
    fields
        .iter()
        .filter_map(|field| value.get(field).and_then(|v| v.as_str()))
        .filter(|name| !name.is_empty())
        .map(String::from)
        .collect()
}

/// How many items other than `ignoring_item_id` still name `name` in their payload.
///
/// A single scan rather than a stored count: content-hash naming means two items
/// legitimately share one file, and a derived count cannot drift from the payloads the way
/// a column can. The pattern is anchored on the surrounding quotes so a hash prefix can
/// never match a different name.
pub fn reference_count(conn: &Connection, name: &str, ignoring_item_id: i64) -> AppResult<i64> {
    let pattern = format!("%\"{name}\"%");
    Ok(conn.query_row(
        "SELECT count(*) FROM item WHERE payload LIKE ?1 AND id != ?2",
        rusqlite::params![pattern, ignoring_item_id],
        |r| r.get(0),
    )?)
}

pub fn insert_item(
    conn: &Connection,
    project_id: i64,
    kind: &str,
    payload: &str,
) -> AppResult<Item> {
    insert_item_with_id(conn, None, project_id, kind, payload)
}

/// Insert an item, optionally keeping the primary key it had before it was deleted.
///
/// Undo restores a row under its original id (`undo-model`): every id column is
/// `AUTOINCREMENT`, so a deleted id is never handed out again and re-using it can never
/// collide. Keeping the id is what lets the *other* commands still on the undo stack — a
/// move, an edit, a line — keep naming rows that exist after a restore.
pub fn insert_item_with_id(
    conn: &Connection,
    id: Option<i64>,
    project_id: i64,
    kind: &str,
    payload: &str,
) -> AppResult<Item> {
    validate_payload(kind, payload)?;
    let now = now_iso8601();
    match id {
        Some(id) => conn.execute(
            "INSERT INTO item (id, project_id, kind, payload, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            rusqlite::params![id, project_id, kind, payload, now],
        )?,
        None => conn.execute(
            "INSERT INTO item (project_id, kind, payload, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            rusqlite::params![project_id, kind, payload, now],
        )?,
    };
    let id = id.unwrap_or_else(|| conn.last_insert_rowid());
    Ok(conn.query_row("SELECT * FROM item WHERE id = ?1", [id], row_to_item)?)
}

/// The item row with this id, when it is still there. A restore reuses a live item rather
/// than inserting a second copy: an item kept by a placement on another canvas was never
/// deleted, so its id is still in use.
pub fn find_item(conn: &Connection, id: i64) -> AppResult<Option<Item>> {
    Ok(conn
        .query_row("SELECT * FROM item WHERE id = ?1", [id], row_to_item)
        .ok())
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

    #[test]
    fn validate_payload_image_without_an_asset_is_rejected() {
        assert!(validate_payload("image", r#"{"alt":"a"}"#).is_err());
    }

    #[test]
    fn validate_payload_link_without_a_url_is_rejected() {
        assert!(validate_payload("link", r#"{"title":"T"}"#).is_err());
    }

    #[test]
    fn validate_payload_video_without_a_provider_is_rejected() {
        assert!(validate_payload("video", r#"{"url":"https://x/y"}"#).is_err());
    }

    #[test]
    fn validate_payload_well_formed_image_link_and_video_are_accepted() {
        assert!(validate_payload("image", r#"{"asset":"ab.png","alt":""}"#).is_ok());
        assert!(validate_payload("link", r#"{"url":"https://example.com"}"#).is_ok());
        assert!(validate_payload(
            "video",
            r#"{"url":"https://youtu.be/x","provider":"youtube"}"#
        )
        .is_ok());
    }

    #[test]
    fn validate_payload_an_asset_naming_a_path_is_rejected() {
        assert!(validate_payload("image", r#"{"asset":"../evil.png"}"#).is_err());
        assert!(validate_payload("image", r#"{"asset":"sub/evil.png"}"#).is_err());
        assert!(validate_payload("image", r#"{"asset":"sub\\evil.png"}"#).is_err());
        assert!(validate_payload("image", r#"{"asset":"c:evil.png"}"#).is_err());
    }

    #[test]
    fn asset_names_a_fully_fetched_link_returns_both_names() {
        let payload = r#"{"url":"https://x/","favicon_asset":"a.ico","thumbnail_asset":"b.png"}"#;
        let names = asset_names("link", payload);
        assert_eq!(names, vec!["a.ico".to_string(), "b.png".to_string()]);
    }

    #[test]
    fn asset_names_a_note_returns_none() {
        assert!(asset_names("note", r#"{"title":"T","text":""}"#).is_empty());
    }

    #[test]
    fn asset_names_a_null_thumbnail_is_skipped() {
        let payload = r#"{"url":"https://x/","provider":"youtube","thumbnail_asset":null}"#;
        assert!(asset_names("video", payload).is_empty());
    }

    #[test]
    fn reference_count_a_name_shared_by_two_items_counts_the_other_one() {
        use crate::commands::project::open_project_at;
        let dir = tempfile::tempdir().unwrap();
        let state = crate::commands::project::AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();

        state
            .with_db(|conn| {
                let a = insert_item(conn, project.id, "image", r#"{"asset":"h.png"}"#)?;
                let b = insert_item(conn, project.id, "image", r#"{"asset":"h.png"}"#)?;
                assert_eq!(reference_count(conn, "h.png", a.id)?, 1);
                // With the other row gone, the remaining holder is the ignored one.
                conn.execute("DELETE FROM item WHERE id = ?1", [b.id])?;
                assert_eq!(reference_count(conn, "h.png", a.id)?, 0);
                Ok(())
            })
            .unwrap();
    }
}
