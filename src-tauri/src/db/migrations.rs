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

const MIGRATION_SQL: [&str; 5] = [
    include_str!("../../migrations/0001_initial_schema.sql"),
    include_str!("../../migrations/0002_connection_style.sql"),
    include_str!("../../migrations/0003_connection_label_visible.sql"),
    include_str!("../../migrations/0004_connection_route.sql"),
    include_str!("../../migrations/0005_connection_anchor.sql"),
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
}
