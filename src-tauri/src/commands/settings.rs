//! The one configuration file the product has: `%APPDATA%\IdeaScape\settings.json`.
//!
//! It holds exactly the five values the Settings screen edits (PRD §8.2), it is written by
//! the application, it has working defaults, and it is never required to exist. A missing,
//! empty, unparseable or partially invalid file reads as the drawn defaults and is never an
//! error — the file holds no user data, so losing it costs the user five preferences.
//!
//! Both `read_settings_at` and `write_settings_at` take the directory as a parameter,
//! exactly as `project::read_recent` does, so no test ever writes to this machine's real
//! `%APPDATA%`.

use crate::commands::project::app_data_dir;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// The file name inside `%APPDATA%\IdeaScape`. A sibling of `recent.json`, not part of it.
const SETTINGS_FILE_NAME: &str = "settings.json";
const SETTINGS_TEMP_FILE_NAME: &str = "settings.json.tmp";

/// The six values, camelCase on the wire because the TypeScript `Settings` interface
/// shipped in Phase 1 already is. `RecentProject` is snake_case on both sides; this struct
/// deliberately is not.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StoredSettings {
    pub auto_save_ms: i64,
    pub snap_to_grid: bool,
    pub zoom_with: String,
    pub theme: String,
    pub font: String,
    /// Whether the writing pack's card types appear in the Cards menu.
    ///
    /// `#[serde(default)]` is on the container, so a settings.json written before Phase 6 —
    /// which has no such key — falls back to this struct's `Default`, which is `true`. That
    /// is the whole mechanism: reading a missing key as `false` would silently empty the
    /// Cards menu in every existing project.
    pub show_writing_cards: bool,
}

/// Design-system §9.11's drawn defaults — the same six `DEFAULT_SETTINGS` carries in
/// `src/lib/settings.svelte.ts`.
impl Default for StoredSettings {
    fn default() -> Self {
        Self {
            auto_save_ms: 3000,
            snap_to_grid: false,
            zoom_with: "scroll".into(),
            theme: "light".into(),
            font: "serif".into(),
            show_writing_cards: true,
        }
    }
}

const AUTO_SAVE_OPTIONS: [i64; 3] = [1000, 3000, 10000];
const ZOOM_OPTIONS: [&str; 2] = ["scroll", "ctrl-scroll"];
const THEME_OPTIONS: [&str; 3] = ["light", "dark", "system"];
const FONT_OPTIONS: [&str; 3] = ["serif", "sans", "marker"];

/// Replace any field outside its allowed set with that field's default, and only that
/// field. A user who hand-edits one line does not lose the other five (PRD §8.2:
/// "deleting it resets those values and nothing else").
fn sanitize(mut s: StoredSettings) -> StoredSettings {
    let d = StoredSettings::default();
    if !AUTO_SAVE_OPTIONS.contains(&s.auto_save_ms) {
        s.auto_save_ms = d.auto_save_ms;
    }
    if !ZOOM_OPTIONS.contains(&s.zoom_with.as_str()) {
        s.zoom_with = d.zoom_with;
    }
    if !THEME_OPTIONS.contains(&s.theme.as_str()) {
        s.theme = d.theme;
    }
    if !FONT_OPTIONS.contains(&s.font.as_str()) {
        s.font = d.font;
    }
    // snap_to_grid and show_writing_cards are bools and cannot be out of range.
    s
}

/// The six values, sanitized. Never an error.
pub fn read_settings_at(dir: &Path) -> StoredSettings {
    let Ok(text) = std::fs::read_to_string(dir.join(SETTINGS_FILE_NAME)) else {
        return StoredSettings::default();
    };
    sanitize(serde_json::from_str::<StoredSettings>(&text).unwrap_or_default())
}

/// Write the file atomically: a temp file beside it, then a rename over the real name.
/// §9.11's own helper text promises "written atomically", and a rename within one
/// directory is that promise on Windows.
///
/// io failures are mapped explicitly rather than through `?`: `From<std::io::Error>` in
/// `error.rs` produces `AppError::DatabaseOpen`, whose message is a false sentence here.
pub fn write_settings_at(dir: &Path, s: &StoredSettings) -> AppResult<()> {
    std::fs::create_dir_all(dir).map_err(write_failed)?;
    let text = serde_json::to_string_pretty(s)?;
    let temp = dir.join(SETTINGS_TEMP_FILE_NAME);
    std::fs::write(&temp, text).map_err(write_failed)?;
    std::fs::rename(&temp, dir.join(SETTINGS_FILE_NAME)).map_err(write_failed)?;
    Ok(())
}

fn write_failed(e: std::io::Error) -> AppError {
    AppError::Invalid(format!("settings could not be written: {e}"))
}

#[tauri::command]
pub fn read_settings() -> AppResult<StoredSettings> {
    Ok(read_settings_at(&app_data_dir()))
}

/// Sanitizes before writing, so a bad value can never reach the file even if the front end
/// somehow sends one.
#[tauri::command]
pub fn write_settings(settings: StoredSettings) -> AppResult<()> {
    write_settings_at(&app_data_dir(), &sanitize(settings))
}

/// The folder the application actually resolved, for the Settings page footer. `app_data_dir`
/// has two documented fallbacks for a missing `%APPDATA%`, and a footer printing a path the
/// file is not at would defeat the point of naming it.
#[tauri::command]
pub fn settings_location() -> AppResult<String> {
    Ok(app_data_dir().to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn non_default() -> StoredSettings {
        StoredSettings {
            auto_save_ms: 10000,
            snap_to_grid: true,
            zoom_with: "ctrl-scroll".into(),
            theme: "dark".into(),
            font: "marker".into(),
        }
    }

    #[test]
    fn read_settings_at_missing_file_is_defaults() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_settings_at(dir.path()), StoredSettings::default());
        // Reading must not create the file.
        assert!(!dir.path().join("settings.json").exists());
    }

    #[test]
    fn read_settings_at_junk_file_is_defaults() {
        let dir = tempfile::tempdir().unwrap();
        for junk in ["", "not json at all", "[1,2,3]", "\"a string\""] {
            std::fs::write(dir.path().join("settings.json"), junk).unwrap();
            assert_eq!(read_settings_at(dir.path()), StoredSettings::default());
        }
    }

    #[test]
    fn read_settings_at_unknown_extra_key_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("settings.json"),
            r#"{"theme":"dark","somethingElse":42}"#,
        )
        .unwrap();
        let read = read_settings_at(dir.path());
        assert_eq!(read.theme, "dark");
        assert_eq!(read.auto_save_ms, 3000);
    }

    #[test]
    fn sanitize_out_of_range_cadence_falls_back_to_three_seconds() {
        let s = sanitize(StoredSettings {
            auto_save_ms: 250,
            ..Default::default()
        });
        assert_eq!(s.auto_save_ms, 3000);
    }

    #[test]
    fn sanitize_unknown_theme_falls_back_to_light() {
        let s = sanitize(StoredSettings {
            theme: "sepia".into(),
            ..Default::default()
        });
        assert_eq!(s.theme, "light");
    }

    #[test]
    fn sanitize_one_bad_field_keeps_the_other_four() {
        let mut bad = non_default();
        bad.zoom_with = "pinch".into();
        let s = sanitize(bad);
        assert_eq!(s.zoom_with, "scroll");
        assert_eq!(s.auto_save_ms, 10000);
        assert!(s.snap_to_grid);
        assert_eq!(s.theme, "dark");
        assert_eq!(s.font, "marker");
    }

    #[test]
    fn sanitize_unknown_font_falls_back_to_serif() {
        let s = sanitize(StoredSettings {
            font: "wingdings".into(),
            ..Default::default()
        });
        assert_eq!(s.font, "serif");
    }

    #[test]
    fn write_settings_at_then_read_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        write_settings_at(dir.path(), &non_default()).unwrap();
        assert_eq!(read_settings_at(dir.path()), non_default());

        let text = std::fs::read_to_string(dir.path().join("settings.json")).unwrap();
        // Pretty-printed camelCase, exactly five keys.
        assert!(text.contains("\n"));
        assert!(text.contains("\"autoSaveMs\""));
        assert!(text.contains("\"snapToGrid\""));
        assert!(text.contains("\"zoomWith\""));
        assert!(text.contains("\"theme\""));
        assert!(text.contains("\"font\""));
        let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed.as_object().unwrap().len(), 5);
    }

    #[test]
    fn write_settings_at_leaves_no_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        write_settings_at(dir.path(), &non_default()).unwrap();
        assert!(!dir.path().join("settings.json.tmp").exists());
        let siblings: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(siblings, vec!["settings.json".to_string()]);
    }

    #[test]
    fn write_settings_at_missing_folder_creates_it() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("IdeaScape");
        write_settings_at(&nested, &StoredSettings::default()).unwrap();
        assert!(nested.join("settings.json").exists());
    }

    #[test]
    fn write_settings_bad_value_never_reaches_the_file() {
        let dir = tempfile::tempdir().unwrap();
        write_settings_at(
            dir.path(),
            &sanitize(StoredSettings {
                theme: "neon".into(),
                auto_save_ms: 7,
                ..Default::default()
            }),
        )
        .unwrap();
        let read = read_settings_at(dir.path());
        assert_eq!(read.theme, "light");
        assert_eq!(read.auto_save_ms, 3000);
    }

    /// Milestone 1's checkpoint: one whole lifecycle against a real temp directory —
    /// defaults from an empty folder with no file created, a non-default value for each of
    /// the five written and read back, and one corrupted field falling back alone.
    #[test]
    fn milestone1_settings_lifecycle_defaults_write_read_and_partial_corruption() {
        let dir = tempfile::tempdir().unwrap();

        assert_eq!(read_settings_at(dir.path()), StoredSettings::default());
        assert!(std::fs::read_dir(dir.path()).unwrap().next().is_none());

        write_settings_at(dir.path(), &non_default()).unwrap();
        assert!(!dir.path().join("settings.json.tmp").exists());
        assert_eq!(read_settings_at(dir.path()), non_default());

        std::fs::write(
            dir.path().join("settings.json"),
            r#"{"autoSaveMs":10000,"snapToGrid":true,"zoomWith":"sideways","theme":"dark"}"#,
        )
        .unwrap();
        let read = read_settings_at(dir.path());
        assert_eq!(read.zoom_with, "scroll");
        assert_eq!(read.auto_save_ms, 10000);
        assert!(read.snap_to_grid);
        assert_eq!(read.theme, "dark");
    }
}
