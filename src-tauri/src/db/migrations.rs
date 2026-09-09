//! The migration runner. Migrations are the numbered `.sql` files in `src-tauri/migrations/`
//! (the flat layout CLAUDE.md fixes), embedded in the binary with `include_str!` and applied
//! when a project opens — not at application start, because there is one database per project
//! folder, not one per install.
//!
//! To add a migration: write the next numbered `.sql` file and append one `M::up` line to
//! `MIGRATION_SQL`. Never edit a migration that has shipped.

use crate::error::AppResult;
use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use std::sync::OnceLock;

const MIGRATION_SQL: [&str; 9] = [
    include_str!("../../migrations/0001_initial_schema.sql"),
    include_str!("../../migrations/0002_connection_style.sql"),
    include_str!("../../migrations/0003_connection_label_visible.sql"),
    include_str!("../../migrations/0004_connection_route.sql"),
    include_str!("../../migrations/0005_connection_anchor.sql"),
    include_str!("../../migrations/0006_connection_bend.sql"),
    include_str!("../../migrations/0007_item_blueprint_kind.sql"),
    include_str!("../../migrations/0008_connection_role.sql"),
    include_str!("../../migrations/0009_list_entry.sql"),
];

fn migrations() -> &'static Migrations<'static> {
    static CELL: OnceLock<Migrations<'static>> = OnceLock::new();
    CELL.get_or_init(|| Migrations::new(MIGRATION_SQL.iter().map(|sql| M::up(sql)).collect()))
}

/// Bring `conn` up to the newest schema version. Running this against an already-current
/// database is a no-op.
pub fn apply(conn: &mut Connection) -> AppResult<()> {
    migrations().to_latest(conn)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_well_formed() {
        assert!(migrations().validate().is_ok());
    }

    /// A database brought up to `through` migrations only, so a later one can be tested
    /// against data that was written before it existed.
    fn conn_through(through: usize) -> Connection {
        let mut conn = Connection::open_in_memory().expect("open");
        let subset = Migrations::new(
            MIGRATION_SQL
                .iter()
                .take(through)
                .map(|sql| M::up(sql))
                .collect(),
        );
        subset.to_latest(&mut conn).expect("partial migrate");
        conn
    }

    /// Migrate the way `open_project_db` does — foreign keys off around the run, on after.
    /// rusqlite's bundled SQLite defaults `foreign_keys` to ON, so migrating without this
    /// order really does empty `placement` when 0007 drops `item`.
    fn apply_all(conn: &mut Connection) {
        conn.pragma_update(None, "foreign_keys", "OFF").unwrap();
        migrations().to_latest(conn).expect("migrate");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
    }

    /// A project on the pre-0007 schema holding one item of each of the four original kinds,
    /// each with a placement. Returns the item ids in insertion order.
    fn seed_phase_five(conn: &Connection) -> Vec<i64> {
        conn.execute(
            "INSERT INTO project (id, name, created_at, updated_at) VALUES (1, 'P', 't', 't')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO canvas (id, project_id, name, sort_order, created_at, updated_at)
             VALUES (1, 1, 'C', 0, 't', 't')",
            [],
        )
        .unwrap();
        let mut ids = Vec::new();
        for (n, (kind, payload)) in [
            ("note", r#"{"title":"T","text":"body"}"#),
            ("image", r#"{"asset":"h.png","alt":""}"#),
            ("link", r#"{"url":"https://example.com"}"#),
            ("video", r#"{"url":"https://youtu.be/x","provider":"youtube"}"#),
        ]
        .iter()
        .enumerate()
        {
            conn.execute(
                "INSERT INTO item (project_id, kind, payload, created_at, updated_at)
                 VALUES (1, ?1, ?2, 't', 't')",
                rusqlite::params![kind, payload],
            )
            .unwrap();
            let id = conn.last_insert_rowid();
            ids.push(id);
            conn.execute(
                "INSERT INTO placement (canvas_id, item_id, x, y, width, height, z_order)
                 VALUES (1, ?1, ?2, 0, 100, 100, ?3)",
                rusqlite::params![id, n as f64 * 10.0, n as i64],
            )
            .unwrap();
        }
        ids
    }

    #[test]
    fn migration_0007_keeps_every_item_row_and_its_placements() {
        let mut conn = conn_through(6);
        let ids = seed_phase_five(&conn);
        let before: Vec<(i64, String, String)> = conn
            .prepare("SELECT id, kind, payload FROM item ORDER BY id")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        apply_all(&mut conn);

        let after: Vec<(i64, String, String)> = conn
            .prepare("SELECT id, kind, payload FROM item ORDER BY id")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(before, after, "every item row survives byte-identical");
        assert_eq!(after.len(), 4);

        let placements: i64 = conn
            .query_row("SELECT count(*) FROM placement", [], |r| r.get(0))
            .unwrap();
        assert_eq!(placements, 4, "the cascade must not have fired");
        for id in ids {
            let n: i64 = conn
                .query_row(
                    "SELECT count(*) FROM placement WHERE item_id = ?1",
                    [id],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(n, 1, "item {id} kept its placement");
        }
    }

    #[test]
    fn migration_0007_accepts_a_blueprint_item_and_still_refuses_an_unknown_kind() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply_all(&mut conn);
        conn.execute(
            "INSERT INTO project (id, name, created_at, updated_at) VALUES (1, 'P', 't', 't')",
            [],
        )
        .unwrap();
        assert!(conn
            .execute(
                "INSERT INTO item (project_id, kind, payload, created_at, updated_at)
                 VALUES (1, 'blueprint', '{}', 't', 't')",
                [],
            )
            .is_ok());
        assert!(conn
            .execute(
                "INSERT INTO item (project_id, kind, payload, created_at, updated_at)
                 VALUES (1, 'character', '{}', 't', 't')",
                [],
            )
            .is_err());
    }

    #[test]
    fn migration_0007_recreates_the_item_project_index() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply_all(&mut conn);
        let n: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master
                 WHERE type = 'index' AND name = 'idx_item_project'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn migration_0007_leaves_foreign_keys_on_and_the_check_clean() {
        let dir = tempfile::tempdir().unwrap();
        {
            // Build a pre-0007 project in a real file, then reopen it through the shipped path.
            let mut conn = Connection::open(dir.path().join("ideascape.db")).unwrap();
            let subset = Migrations::new(
                MIGRATION_SQL
                    .iter()
                    .take(6)
                    .map(|sql| M::up(sql))
                    .collect(),
            );
            subset.to_latest(&mut conn).unwrap();
            seed_phase_five(&conn);
        }
        let conn = crate::db::open_project_db(dir.path()).expect("reopen");
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1, "foreign keys must be back on");
        let broken: i64 = conn
            .prepare("PRAGMA foreign_key_check")
            .unwrap()
            .query_map([], |_| Ok(()))
            .unwrap()
            .count() as i64;
        assert_eq!(broken, 0);
        let placements: i64 = conn
            .query_row("SELECT count(*) FROM placement", [], |r| r.get(0))
            .unwrap();
        assert_eq!(placements, 4);
    }

    #[test]
    fn migration_0008_gives_every_existing_connection_a_null_role() {
        let mut conn = conn_through(7);
        seed_phase_five(&conn);
        conn.execute(
            "INSERT INTO connection (canvas_id, from_placement_id, to_placement_id, label, directed)
             VALUES (1, 1, 2, 'L', 1)",
            [],
        )
        .unwrap();

        apply_all(&mut conn);

        let role: Option<String> = conn
            .query_row("SELECT role FROM connection WHERE id = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(role, None, "no back-fill: NULL reads as Relates To");
    }

    #[test]
    fn migration_0009_creates_an_empty_uniquely_indexed_list_entry_table() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply_all(&mut conn);
        conn.execute(
            "INSERT INTO project (id, name, created_at, updated_at) VALUES (1, 'P', 't', 't')",
            [],
        )
        .unwrap();
        let n: i64 = conn
            .query_row("SELECT count(*) FROM list_entry", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);

        conn.execute(
            "INSERT INTO list_entry (project_id, list, text, created_at)
             VALUES (1, 'themes', 'Grief', 't')",
            [],
        )
        .unwrap();
        assert!(
            conn.execute(
                "INSERT INTO list_entry (project_id, list, text, created_at)
                 VALUES (1, 'themes', 'Grief', 't')",
                [],
            )
            .is_err(),
            "the unique index must refuse a duplicate"
        );
    }

    #[test]
    fn migration_0009_deleting_a_project_removes_its_list_entries() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply_all(&mut conn);
        conn.execute(
            "INSERT INTO project (id, name, created_at, updated_at) VALUES (1, 'P', 't', 't')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO list_entry (project_id, list, text, created_at)
             VALUES (1, 'themes', 'Grief', 't')",
            [],
        )
        .unwrap();
        conn.execute("DELETE FROM project WHERE id = 1", []).unwrap();
        let n: i64 = conn
            .query_row("SELECT count(*) FROM list_entry", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    /// The phase's single most important test: a real Phase 5 project folder, holding every
    /// card kind and a fully styled connection, opened through the shipped path so all three
    /// new migrations run in sequence against data written before they existed.
    #[test]
    fn migrations_0007_to_0009_open_a_phase_five_project_intact() {
        let dir = tempfile::tempdir().unwrap();
        let before_items: Vec<(i64, String, String)>;
        {
            let mut conn = Connection::open(dir.path().join("ideascape.db")).unwrap();
            let subset =
                Migrations::new(MIGRATION_SQL.iter().take(6).map(|sql| M::up(sql)).collect());
            subset.to_latest(&mut conn).unwrap();
            seed_phase_five(&conn);
            // A second canvas and a third, so the project is not a single-canvas toy.
            conn.execute(
                "INSERT INTO canvas (id, project_id, name, sort_order, created_at, updated_at)
                 VALUES (2, 1, 'Two', 1, 't', 't'), (3, 1, 'Three', 2, 't', 't')",
                [],
            )
            .unwrap();
            // Connections carrying labels, styles, anchors and a bend.
            conn.execute(
                r#"INSERT INTO connection
                   (id, canvas_id, from_placement_id, to_placement_id, label, directed,
                    color, width, label_visible, route, from_anchor, to_anchor, bend)
                 VALUES (1, 1, 1, 2, 'feeds', 1, 'rose', 3, 1, 'elbow', 'right', 'left',
                         '{"a":0.5,"b":0.25}'),
                        (2, 1, 3, 4, NULL, 0, 'default', 1, 0, 'straight', 'auto', 'auto', '')"#,
                [],
            )
            .unwrap();
            before_items = conn
                .prepare("SELECT id, kind, payload FROM item ORDER BY id")
                .unwrap()
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .unwrap()
                .map(|r| r.unwrap())
                .collect();
        }

        let conn = crate::db::open_project_db(dir.path()).expect("reopen a Phase 5 project");

        // Every item row survives with its id, kind and payload byte-identical.
        let after_items: Vec<(i64, String, String)> = conn
            .prepare("SELECT id, kind, payload FROM item ORDER BY id")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(before_items, after_items);

        // Every placement and connection survives, with its styling intact.
        let placements: i64 = conn
            .query_row("SELECT count(*) FROM placement", [], |r| r.get(0))
            .unwrap();
        assert_eq!(placements, 4);
        let (label, color, route, from_anchor, bend): (String, String, String, String, String) =
            conn.query_row(
                "SELECT label, color, route, from_anchor, bend FROM connection WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap();
        assert_eq!(
            (
                label.as_str(),
                color.as_str(),
                route.as_str(),
                from_anchor.as_str()
            ),
            ("feeds", "rose", "elbow", "right")
        );
        assert_eq!(bend, r#"{"a":0.5,"b":0.25}"#);

        // Integrity, and the pragma is back on.
        let broken = conn
            .prepare("PRAGMA foreign_key_check")
            .unwrap()
            .query_map([], |_| Ok(()))
            .unwrap()
            .count();
        assert_eq!(broken, 0);
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);

        // The index and the widened CHECK.
        let idx: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master
                 WHERE type = 'index' AND name = 'idx_item_project'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(idx, 1);
        assert!(conn
            .execute(
                "INSERT INTO item (project_id, kind, payload, created_at, updated_at)
                 VALUES (1, 'blueprint', '{}', 't', 't')",
                [],
            )
            .is_ok());
        assert!(conn
            .execute(
                "INSERT INTO item (project_id, kind, payload, created_at, updated_at)
                 VALUES (1, 'character', '{}', 't', 't')",
                [],
            )
            .is_err());

        // Every pre-existing connection reads role = NULL.
        let nulls: i64 = conn
            .query_row(
                "SELECT count(*) FROM connection WHERE role IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(nulls, 2);

        // list_entry is there, empty, and unique-indexed.
        let entries: i64 = conn
            .query_row("SELECT count(*) FROM list_entry", [], |r| r.get(0))
            .unwrap();
        assert_eq!(entries, 0);
        let unique: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master
                 WHERE type = 'index' AND name = 'idx_list_entry_unique'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(unique, 1);
    }
}
