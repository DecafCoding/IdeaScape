//! Blueprint cards — the writing pack's item lifecycle.
//!
//! `list_blueprints` hands the shipped card types to the front end once at boot; everything
//! else here reads or writes one `blueprint` item. The card *type* lives inside the payload,
//! so none of this needs a migration when a seventh type is added.
//!
//! A card with only a default name is a complete card. Nothing here is ever required and
//! nothing here blocks a save.

use crate::blueprints::{self, Blueprint};
use crate::commands::project::AppState;
use crate::db::models::{row_to_item, Item};
use crate::error::AppResult;

/// Every shipped card type, in menu order. It takes no state: the blueprints are the same in
/// every project, so this is answered before a project is open.
pub fn list_blueprints_for() -> AppResult<Vec<Blueprint>> {
    Ok(blueprints::all().to_vec())
}

#[tauri::command]
pub fn list_blueprints() -> AppResult<Vec<Blueprint>> {
    list_blueprints_for()
}

/// Every `blueprint` item in the project with no row in `placement`.
///
/// The corrected delete rule leaves a blueprint item alive when its last placement goes, so
/// a Character survives being taken off the one canvas they appeared on. This is what keeps
/// the old rule's promise that nothing becomes invisible junk: the left column's *Unplaced*
/// section draws exactly this list.
pub fn list_unplaced_items_for(state: &AppState) -> AppResult<Vec<Item>> {
    state.with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT i.* FROM item i
             WHERE i.kind = 'blueprint'
               AND NOT EXISTS (SELECT 1 FROM placement p WHERE p.item_id = i.id)
             ORDER BY i.updated_at DESC, i.id",
        )?;
        let rows = stmt
            .query_map([], row_to_item)?
            .collect::<rusqlite::Result<Vec<Item>>>()?;
        Ok(rows)
    })
}

#[tauri::command]
pub fn list_unplaced_items(state: tauri::State<'_, AppState>) -> AppResult<Vec<Item>> {
    list_unplaced_items_for(&state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_blueprints_returns_the_six_shipped_types() {
        let list = list_blueprints_for().expect("blueprints");
        assert_eq!(list.len(), 6);
        assert_eq!(list[0].id, "book");
    }
}
