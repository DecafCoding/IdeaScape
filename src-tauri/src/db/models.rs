//! Row structs shared with the front end. Field names must stay in step with the matching
//! interfaces in `src/lib/types.ts`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Canvas {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub sort_order: i64,
    pub view_x: f64,
    pub view_y: f64,
    pub view_zoom: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Item {
    pub id: i64,
    pub project_id: i64,
    pub kind: String,
    pub payload: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Placement {
    pub id: i64,
    pub canvas_id: i64,
    pub item_id: i64,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub z_order: i64,
}

/// One canvas card: a placement joined to the item it points at. `list_placements`
/// returns these so opening a canvas of 250 cards is one call, not 251.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlacementWithItem {
    pub placement: Placement,
    pub item: Item,
}

/// One placement's new geometry and stacking order, as sent to `update_placements`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlacementUpdate {
    pub id: i64,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub z_order: i64,
}

/// Everything `delete_placements` actually removed, so one undo command can restore the
/// placements and any orphaned items together.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct DeleteEffect {
    pub placements: Vec<Placement>,
    pub items: Vec<Item>,
}

pub fn row_to_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get("id")?,
        name: row.get("name")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn row_to_canvas(row: &rusqlite::Row<'_>) -> rusqlite::Result<Canvas> {
    Ok(Canvas {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        name: row.get("name")?,
        sort_order: row.get("sort_order")?,
        view_x: row.get("view_x")?,
        view_y: row.get("view_y")?,
        view_zoom: row.get("view_zoom")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn row_to_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<Item> {
    Ok(Item {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        kind: row.get("kind")?,
        payload: row.get("payload")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn row_to_placement(row: &rusqlite::Row<'_>) -> rusqlite::Result<Placement> {
    Ok(Placement {
        id: row.get("id")?,
        canvas_id: row.get("canvas_id")?,
        item_id: row.get("item_id")?,
        x: row.get("x")?,
        y: row.get("y")?,
        width: row.get("width")?,
        height: row.get("height")?,
        z_order: row.get("z_order")?,
    })
}
