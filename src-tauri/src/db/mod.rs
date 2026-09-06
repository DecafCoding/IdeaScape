//! Database work: opening a project's SQLite file, running its migrations, and the row
//! structs the commands return. `commands/` uses this module; this module never calls
//! `commands/`.

pub mod connection;
pub mod migrations;
pub mod models;

pub use connection::open_project_db;
