//! Asset files — the file half of `asset-storage`.
//!
//! A picture is copied into the project's `assets/` folder and named by a hash of its
//! bytes, so two identical pictures share one file and a payload never holds a path. This
//! module is pure file work: it knows nothing about SQL and nothing about `commands/`,
//! which is what the import-direction rule requires of it.
//!
//! A delete *moves* an asset to a project-root `.trash/` folder rather than destroying the
//! bytes, because `undo-model` requires undo to bring the file back with the card. The
//! trash is purged when a project opens: the undo stack is session-only, so a trashed file
//! that survived a restart could never be restored.

pub mod hash;

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// The largest file that may be copied in — 64 MB. A mis-drop of a video file is refused
/// before anything is written, rather than silently filling the project folder.
pub const MAX_ASSET_BYTES: u64 = 64 * 1024 * 1024;

/// The folder a deleted asset waits in until the session ends. Project root, not inside
/// `assets/`, so a reference scan over `assets/` never sees a trashed file.
pub const TRASH_DIR_NAME: &str = ".trash";

/// One asset that is now in the folder: its file name, and how large it is.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AssetRef {
    pub name: String,
    pub byte_size: u64,
}

/// Whether a named asset is actually in `assets/`, and how large it is if so.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AssetStatus {
    pub name: String,
    pub exists: bool,
    pub byte_size: u64,
}

/// The project's `assets/` folder. `open_project_db` already creates it; this only names it.
pub fn assets_dir(folder: &Path) -> PathBuf {
    folder.join("assets")
}

fn trash_dir(folder: &Path) -> PathBuf {
    folder.join(TRASH_DIR_NAME)
}

fn io(e: std::io::Error) -> AppError {
    AppError::Asset(e.to_string())
}

/// True when `name` is a plain file name: no separator, no traversal, not empty. Every
/// entry point checks it, so a hand-edited payload can never reach outside the folder.
fn is_bare_file_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
        && !name.contains(':')
}

/// Copy the file at `source_path` into `assets/`, named by its content hash.
///
/// The hash is taken first and the write is skipped entirely when the target already
/// exists — that is the dedupe, and it is why adding the same picture twice under two
/// different names produces one file.
pub fn copy_in(folder: &Path, source_path: &Path) -> AppResult<AssetRef> {
    let meta = fs::metadata(source_path).map_err(io)?;
    if !meta.is_file() {
        return Err(AppError::Asset(String::from("that is not a file")));
    }
    if meta.len() > MAX_ASSET_BYTES {
        return Err(AppError::Asset(format!(
            "the file is larger than the {} MB limit",
            MAX_ASSET_BYTES / (1024 * 1024)
        )));
    }

    let digest = hash::hash_file(source_path)?;
    let name = hash::asset_name(&digest, &hash::extension_of(source_path));
    let dir = assets_dir(folder);
    fs::create_dir_all(&dir).map_err(io)?;
    let target = dir.join(&name);
    if !target.exists() {
        fs::copy(source_path, &target).map_err(io)?;
    }
    Ok(AssetRef {
        name,
        byte_size: meta.len(),
    })
}

/// Write `bytes` into `assets/`, named by their content hash. The clipboard route and the
/// fetch layer's thumbnail capture both come through here.
pub fn write_in(folder: &Path, bytes: &[u8], ext: &str) -> AppResult<AssetRef> {
    if bytes.len() as u64 > MAX_ASSET_BYTES {
        return Err(AppError::Asset(format!(
            "the picture is larger than the {} MB limit",
            MAX_ASSET_BYTES / (1024 * 1024)
        )));
    }
    let name = hash::asset_name(&hash::hash_bytes(bytes), ext);
    let dir = assets_dir(folder);
    fs::create_dir_all(&dir).map_err(io)?;
    let target = dir.join(&name);
    if !target.exists() {
        fs::write(&target, bytes).map_err(io)?;
    }
    Ok(AssetRef {
        name,
        byte_size: bytes.len() as u64,
    })
}

/// Whether one named asset is in `assets/`. An unknown name is reported as absent rather
/// than as an error — a missing file is a drawn card state, never a failure.
pub fn status(folder: &Path, name: &str) -> AssetStatus {
    if !is_bare_file_name(name) {
        return AssetStatus {
            name: name.to_string(),
            exists: false,
            byte_size: 0,
        };
    }
    match fs::metadata(assets_dir(folder).join(name)) {
        Ok(meta) if meta.is_file() => AssetStatus {
            name: name.to_string(),
            exists: true,
            byte_size: meta.len(),
        },
        _ => AssetStatus {
            name: name.to_string(),
            exists: false,
            byte_size: 0,
        },
    }
}

/// Move an asset out of `assets/` and into `.trash/`. Idempotent: a name that is not where
/// it is expected is a no-op, never an error, so deleting a card whose file is *already*
/// missing still succeeds.
pub fn trash(folder: &Path, name: &str) -> AppResult<()> {
    move_between(&assets_dir(folder), &trash_dir(folder), name)
}

/// Move an asset back from `.trash/` into `assets/` — the write half of undoing a delete.
pub fn untrash(folder: &Path, name: &str) -> AppResult<()> {
    move_between(&trash_dir(folder), &assets_dir(folder), name)
}

/// One `fs::rename` across a directory boundary inside the project folder: atomic and
/// cheap. Deliberately not copy-then-delete.
fn move_between(from: &Path, to: &Path, name: &str) -> AppResult<()> {
    if !is_bare_file_name(name) {
        return Err(AppError::Asset(format!("asset file name {name}")));
    }
    let source = from.join(name);
    if !source.is_file() {
        return Ok(());
    }
    fs::create_dir_all(to).map_err(io)?;
    let target = to.join(name);
    if target.exists() {
        // The same content is already at the destination; the source copy is redundant.
        fs::remove_file(&source).map_err(io)?;
        return Ok(());
    }
    fs::rename(&source, &target).map_err(io)?;
    Ok(())
}

/// Remove `.trash/` entirely. Called once when a project opens.
pub fn purge_trash(folder: &Path) -> AppResult<()> {
    let dir = trash_dir(folder);
    if !dir.exists() {
        return Ok(());
    }
    fs::remove_dir_all(&dir).map_err(io)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn source(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
        let path = dir.join(name);
        let mut file = fs::File::create(&path).unwrap();
        file.write_all(bytes).unwrap();
        path
    }

    #[test]
    fn copy_in_the_same_bytes_under_two_names_produce_one_file() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path();
        let a = source(folder, "first.png", b"identical bytes");
        let b = source(folder, "second.png", b"identical bytes");

        let first = copy_in(folder, &a).unwrap();
        let second = copy_in(folder, &b).unwrap();
        assert_eq!(first.name, second.name);

        let files: Vec<_> = fs::read_dir(assets_dir(folder))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(files, vec![first.name]);
    }

    #[test]
    fn copy_in_a_second_copy_of_identical_bytes_does_not_rewrite_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path();
        let a = source(folder, "first.png", b"identical bytes");
        let first = copy_in(folder, &a).unwrap();
        let target = assets_dir(folder).join(&first.name);
        let before = fs::metadata(&target).unwrap().modified().unwrap();

        let b = source(folder, "second.png", b"identical bytes");
        copy_in(folder, &b).unwrap();
        let after = fs::metadata(&target).unwrap().modified().unwrap();
        assert_eq!(before, after, "the existing file must not be rewritten");
    }

    #[test]
    fn copy_in_a_file_over_the_ceiling_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path();
        let path = folder.join("huge.bin");
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_ASSET_BYTES + 1).unwrap();
        drop(file);
        assert!(copy_in(folder, &path).is_err());
        assert!(
            !assets_dir(folder).join("x").exists(),
            "nothing may be copied before the ceiling is checked"
        );
    }

    #[test]
    fn copy_in_a_zero_byte_file_and_a_file_with_no_extension_both_work() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path();
        let empty = source(folder, "empty.png", b"");
        assert_eq!(copy_in(folder, &empty).unwrap().byte_size, 0);
        let bare = source(folder, "noext", b"some bytes");
        assert!(copy_in(folder, &bare).unwrap().name.ends_with(".bin"));
    }

    #[test]
    fn write_in_names_the_file_by_its_content_hash() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path();
        let asset = write_in(folder, b"pasted bytes", "png").unwrap();
        assert!(asset.name.ends_with(".png"));
        assert!(assets_dir(folder).join(&asset.name).is_file());
        assert_eq!(asset.byte_size, 12);
    }

    #[test]
    fn status_an_unknown_name_reports_absent_without_erroring() {
        let dir = tempfile::tempdir().unwrap();
        let reported = status(dir.path(), "nothing.png");
        assert!(!reported.exists);
        assert_eq!(reported.byte_size, 0);
    }

    #[test]
    fn status_a_name_naming_a_path_reports_absent() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!status(dir.path(), "../ideascape.db").exists);
    }

    #[test]
    fn status_a_copied_asset_reports_present_with_its_size() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path();
        let asset = write_in(folder, b"1234567890", "png").unwrap();
        let reported = status(folder, &asset.name);
        assert!(reported.exists);
        assert_eq!(reported.byte_size, 10);
    }

    #[test]
    fn trash_then_untrash_leaves_byte_identical_content() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path();
        let asset = write_in(folder, b"the original bytes", "png").unwrap();

        trash(folder, &asset.name).unwrap();
        assert!(!status(folder, &asset.name).exists);
        assert!(folder.join(TRASH_DIR_NAME).join(&asset.name).is_file());

        untrash(folder, &asset.name).unwrap();
        assert!(status(folder, &asset.name).exists);
        let bytes = fs::read(assets_dir(folder).join(&asset.name)).unwrap();
        assert_eq!(bytes, b"the original bytes");
    }

    #[test]
    fn trash_a_name_that_is_not_there_is_ok() {
        let dir = tempfile::tempdir().unwrap();
        assert!(trash(dir.path(), "absent.png").is_ok());
    }

    #[test]
    fn untrash_an_absent_name_is_ok() {
        let dir = tempfile::tempdir().unwrap();
        assert!(untrash(dir.path(), "absent.png").is_ok());
    }

    #[test]
    fn trash_a_name_naming_a_path_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        assert!(trash(dir.path(), "../ideascape.db").is_err());
        assert!(untrash(dir.path(), "sub/x.png").is_err());
    }

    #[test]
    fn purge_trash_removes_the_folder_and_is_a_no_op_when_absent() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path();
        let asset = write_in(folder, b"bytes", "png").unwrap();
        trash(folder, &asset.name).unwrap();
        assert!(folder.join(TRASH_DIR_NAME).exists());
        purge_trash(folder).unwrap();
        assert!(!folder.join(TRASH_DIR_NAME).exists());
        assert!(purge_trash(folder).is_ok());
    }
}
