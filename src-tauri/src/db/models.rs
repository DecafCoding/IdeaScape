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

/// One line joining two cards on a canvas. Endpoints are derived from the two placement
/// rectangles at render time and are never stored, so a card that moves or grows writes
/// nothing here. `directed` is 0 none, 1 arrow at the `to` end, 2 at the `from` end, 3 both.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Connection {
    pub id: i64,
    pub canvas_id: i64,
    pub from_placement_id: i64,
    pub to_placement_id: i64,
    pub label: Option<String>,
    pub directed: i64,
    /// A key from the front end's line palette ('default' plus seven hues), never a hex
    /// value — each theme resolves the key to its own ink.
    pub color: String,
    /// The width step: 1 thin, 2 medium, 3 thick. Pixel values live in the front end.
    pub width: i64,
    /// Whether the label chip is drawn. The label text is kept when it is false.
    pub label_visible: bool,
    /// The line's shape: 'straight' or 'elbow'. A key, like `color` — the front end owns the
    /// geometry, so a bend radius change needs no migration.
    pub route: String,
    /// Which side of the `from` card the line leaves: 'auto', or 'top'/'right'/'bottom'/'left'.
    /// A key, like `route` — never a coordinate, so a card that moves writes nothing here.
    pub from_anchor: String,
    /// Which side of the `to` card the line enters. Same keys as `from_anchor`.
    pub to_anchor: String,
    /// A hand-placed bend, as JSON `{"a":…,"b":…}`, or empty for none. The pair is a
    /// position in the frame of the two card centres, never a canvas coordinate, so the
    /// bend moves with the cards. The front end owns that arithmetic.
    pub bend: String,
    /// What the line means: a key from the front end's role table, any text the user typed,
    /// or NULL. NULL reads as *Relates To* and draws no glyph, which is how every line made
    /// before Phase 6 already looks — so NULL is never normalised into 'relates-to'.
    pub role: Option<String>,
}

/// Everything `delete_placements` actually removed, so one undo command can restore the
/// placements, any orphaned items, the connections the cascade took with them and the asset
/// files no remaining payload still names, together.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct DeleteEffect {
    pub placements: Vec<Placement>,
    pub items: Vec<Item>,
    pub connections: Vec<Connection>,
    /// The asset file names moved out of `assets/` and into `.trash/`. The Rust side is the
    /// only thing that knows what a cascade and a reference count actually did.
    #[serde(default)]
    pub assets: Vec<String>,
}

/// Everything a canvas delete removed — the canvas row itself, every placement on it, the
/// items that lost their last placement, the connections the cascade took, and the asset
/// files no remaining payload still names. `restore_canvas` takes this whole structure back,
/// which is why the delete has to read every row *before* the cascade runs.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct CanvasDeleteEffect {
    pub canvas: Canvas,
    pub placements: Vec<Placement>,
    pub items: Vec<Item>,
    pub connections: Vec<Connection>,
    pub assets: Vec<String>,
    /// The items whose `detail_canvas_id` pointed at the deleted canvas, as they were
    /// BEFORE it was cleared — so `restore_canvas` can put the pointers back. Clearing them
    /// happens in the same transaction as the delete: a crash between the two would leave a
    /// card pointing at a canvas that is not there.
    #[serde(default)]
    pub detail_pointers: Vec<Item>,
}

impl Default for Canvas {
    fn default() -> Self {
        Canvas {
            id: 0,
            project_id: 0,
            name: String::new(),
            sort_order: 0,
            view_x: 0.0,
            view_y: 0.0,
            view_zoom: 1.0,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }
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

pub fn row_to_connection(row: &rusqlite::Row<'_>) -> rusqlite::Result<Connection> {
    Ok(Connection {
        id: row.get("id")?,
        canvas_id: row.get("canvas_id")?,
        from_placement_id: row.get("from_placement_id")?,
        to_placement_id: row.get("to_placement_id")?,
        label: row.get("label")?,
        directed: row.get("directed")?,
        color: row.get("color")?,
        width: row.get("width")?,
        label_visible: row.get("label_visible")?,
        route: row.get("route")?,
        from_anchor: row.get("from_anchor")?,
        to_anchor: row.get("to_anchor")?,
        bend: row.get("bend")?,
        role: row.get::<_, Option<String>>("role")?,
    })
}
