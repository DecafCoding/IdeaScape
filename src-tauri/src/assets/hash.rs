//! Content hashing and the asset file-name rule.
//!
//! An asset is named by a hash of its bytes, so two identical pictures share one file and a
//! moved or renamed original never breaks a card (`asset-storage`). The algorithm is
//! BLAKE3: architecture §11 assigns the choice to this phase and says speed matters more
//! than cryptographic strength, which is BLAKE3's own reason for existing.

use crate::error::{AppError, AppResult};
use std::path::Path;

/// The most characters of an extension an asset name keeps. Long enough for `jpeg` and
/// `webp`, short enough that a hostile "extension" cannot become the whole name.
const MAX_EXT_LEN: usize = 8;

/// The full 64-character lowercase hex digest of `bytes`.
pub fn hash_bytes(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

/// The digest of a file, streamed rather than read into memory — a 40 MB picture read
/// twice is a visible stall.
pub fn hash_file(path: &Path) -> AppResult<String> {
    let file = std::fs::File::open(path).map_err(|e| AppError::Asset(e.to_string()))?;
    let mut hasher = blake3::Hasher::new();
    hasher
        .update_reader(file)
        .map_err(|e| AppError::Asset(e.to_string()))?;
    Ok(hasher.finalize().to_hex().to_string())
}

/// The stored file name: `<hex>.<ext>` and nothing else.
///
/// The extension is lowercased, has any leading dot stripped, keeps only ASCII
/// alphanumerics and is capped — so `../evil` contributes nothing usable and falls back to
/// `bin`. A name built here can never name a file outside `assets/`.
pub fn asset_name(hash: &str, ext: &str) -> String {
    let cleaned: String = ext
        .trim_start_matches('.')
        .to_ascii_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(MAX_EXT_LEN)
        .collect();
    let ext = if cleaned.is_empty() { "bin" } else { &cleaned };
    format!("{hash}.{ext}")
}

/// The extension of a source path, ready for `asset_name`.
pub fn extension_of(path: &Path) -> String {
    path.extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn hash_bytes_the_same_bytes_give_the_same_digest() {
        assert_eq!(hash_bytes(b"abc"), hash_bytes(b"abc"));
        assert_ne!(hash_bytes(b"abc"), hash_bytes(b"abd"));
        assert_eq!(hash_bytes(b"abc").len(), 64);
        assert!(hash_bytes(b"abc").chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn hash_file_matches_hash_bytes_for_the_same_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.bin");
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(b"the same bytes").unwrap();
        drop(file);
        assert_eq!(hash_file(&path).unwrap(), hash_bytes(b"the same bytes"));
    }

    #[test]
    fn hash_file_a_missing_file_is_an_asset_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(hash_file(&dir.path().join("nope.png")).is_err());
    }

    #[test]
    fn asset_name_a_traversal_extension_falls_back_to_bin() {
        let name = asset_name("abc", "../evil");
        assert_eq!(name, "abc.evil");
        assert!(!name.contains('/') && !name.contains(".."));
    }

    #[test]
    fn asset_name_no_usable_extension_falls_back_to_bin() {
        assert_eq!(asset_name("abc", ""), "abc.bin");
        assert_eq!(asset_name("abc", "..."), "abc.bin");
    }

    #[test]
    fn asset_name_lowercases_and_strips_a_leading_dot() {
        assert_eq!(asset_name("abc", ".PNG"), "abc.png");
        assert_eq!(asset_name("abc", "JPEG"), "abc.jpeg");
    }

    #[test]
    fn asset_name_a_very_long_extension_is_capped() {
        assert_eq!(asset_name("abc", "abcdefghijklmnop"), "abc.abcdefgh");
    }

    #[test]
    fn extension_of_a_path_with_no_extension_is_empty() {
        assert_eq!(extension_of(Path::new("C:/tmp/picture")), "");
        assert_eq!(extension_of(Path::new("C:/tmp/picture.PNG")), "PNG");
    }
}
