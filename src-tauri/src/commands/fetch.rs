//! The only two commands in the product that open a socket, plus the synchronous
//! classification the paste router asks for.
//!
//! Neither fetch command touches the database. Each clones the project folder out of
//! `AppState.folder` and drops the guard **before** the first `await`: holding a
//! `MutexGuard` across an await makes the future non-`Send` and the command does not
//! compile. The front end writes the resulting payload through `update_item_payload`.

use crate::commands::project::AppState;
use crate::error::AppResult;
use crate::fetch::{self, classify::UrlKind, LinkPreview, VideoPreview};

/// Pure and synchronous. One source of truth about what a YouTube address is.
#[tauri::command]
pub fn classify_url(text: String) -> AppResult<UrlKind> {
    Ok(fetch::classify::classify(&text))
}

#[tauri::command]
pub async fn fetch_link_preview(
    state: tauri::State<'_, AppState>,
    url: String,
) -> AppResult<LinkPreview> {
    // The guard is taken and dropped in its own statement, before any await point.
    let folder = state.require_folder()?;
    fetch::fetch_link_preview_for(&folder, &url).await
}

#[tauri::command]
pub async fn fetch_video_metadata(
    state: tauri::State<'_, AppState>,
    url: String,
) -> AppResult<VideoPreview> {
    let folder = state.require_folder()?;
    fetch::fetch_video_meta_for(&folder, &url).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_url_is_reachable_synchronously() {
        // No runtime, no await: the paste router calls this on the keystroke path.
        let kind = fetch::classify::classify("https://youtu.be/dQw4w9WgXcQ");
        assert!(matches!(kind, UrlKind::Video { .. }));
    }
}
