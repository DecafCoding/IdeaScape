//! The one error type returned to the front end. A raw Rust error string never reaches
//! the page: every command returns `AppResult<T>`, and `AppError`'s `Display` message is
//! what `src/lib/ipc.ts` turns into an `IpcError`.

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("the project database could not be opened: {0}")]
    DatabaseOpen(String),
    #[error("database error: {0}")]
    Database(String),
    #[error("migration failed: {0}")]
    Migration(String),
    #[error("no project is open")]
    NoProject,
    #[error("{0} was not found")]
    NotFound(String),
    #[error("that value is not valid: {0}")]
    Invalid(String),
    #[error("that picture could not be added: {0}")]
    Asset(String),
    #[error("that address could not be read: {0}")]
    Fetch(String),
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Database(e.to_string())
    }
}

impl From<rusqlite_migration::Error> for AppError {
    fn from(e: rusqlite_migration::Error) -> Self {
        AppError::Migration(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Invalid(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::DatabaseOpen(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
