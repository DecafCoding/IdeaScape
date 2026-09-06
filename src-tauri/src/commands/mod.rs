//! The only Rust the front end can reach. One file per area; each command takes scalars
//! and returns typed rows, so the front end never builds SQL. `commands/` may use `db/`;
//! `db/` never calls back.

pub mod canvas;
pub mod item;
pub mod placement;
pub mod project;

pub use project::AppState;
