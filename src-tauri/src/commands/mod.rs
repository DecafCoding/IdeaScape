//! The only Rust the front end can reach. One file per area; each command takes scalars
//! and returns typed rows, so the front end never builds SQL. `commands/` may use `db/`;
//! `db/` never calls back.

pub mod asset;
pub mod canvas;
pub mod connection;
pub mod fetch;
pub mod item;
pub mod placement;
pub mod project;
pub mod search;
pub mod settings;

pub use project::AppState;
