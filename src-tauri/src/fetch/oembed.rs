//! The YouTube oEmbed address and its response decoder. Public endpoint: no key, no
//! account, which is what `network-boundary` settles on.
//!
//! The response carries `title`, `author_name` and `thumbnail_url` and **no duration**,
//! which is why the drawn duration chip in design-system §9.6 is not built: the only
//! endpoint that reports one needs an API key, and CLAUDE.md rules those out outright.

use crate::error::{AppError, AppResult};
use crate::fetch::opengraph::{clean_text, MAX_TITLE_LEN};
use serde::{Deserialize, Serialize};

/// The public consumer endpoint.
const ENDPOINT: &str = "https://www.youtube.com/oembed";

/// A video's metadata, as far as oEmbed reports it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct VideoMeta {
    pub title: String,
    pub author_name: String,
    pub thumbnail_url: Option<String>,
}

#[derive(Deserialize)]
struct OEmbedResponse {
    #[serde(default)]
    title: String,
    #[serde(default)]
    author_name: String,
    #[serde(default)]
    thumbnail_url: Option<String>,
}

/// Percent-encode everything that is not unreserved, so a `?` or an `&` inside the video
/// address cannot break out of the `url` parameter.
fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        let c = *byte as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            out.push(c);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// `https://www.youtube.com/oembed?url=<percent-encoded>&format=json`.
pub fn oembed_url(video_url: &str) -> String {
    format!(
        "{ENDPOINT}?url={}&format=json",
        percent_encode(video_url.trim())
    )
}

/// The 4:3 thumbnail names YouTube serves. Each of these is a 4:3 picture with the video
/// letterboxed inside it, so it carries a black bar above and below the frame. oEmbed
/// always reports `hqdefault.jpg`, which is why a video card drew that bar.
const LETTERBOXED: [&str; 3] = ["hqdefault.jpg", "sddefault.jpg", "default.jpg"];

/// The 16:9 names, best first. `maxresdefault.jpg` is 1280x720 but is only present for
/// videos uploaded at that size; `mqdefault.jpg` is 320x180 and always present.
const WIDESCREEN: [&str; 2] = ["maxresdefault.jpg", "mqdefault.jpg"];

/// The thumbnail addresses to try, best first, ending with the address oEmbed reported.
///
/// A letterboxed name is swapped for its 16:9 twins; anything else is returned unchanged,
/// so a non-YouTube host is never rewritten. The caller downloads them in order and keeps
/// the first that arrives.
pub fn thumbnail_candidates(thumbnail_url: &str) -> Vec<String> {
    let Some((base, name)) = thumbnail_url.rsplit_once('/') else {
        return vec![thumbnail_url.to_string()];
    };
    if !LETTERBOXED.contains(&name) {
        return vec![thumbnail_url.to_string()];
    }
    let mut out: Vec<String> = WIDESCREEN
        .iter()
        .map(|wide| format!("{base}/{wide}"))
        .collect();
    out.push(thumbnail_url.to_string());
    out
}

/// Read the three fields, each through `clean_text`. A body that is not the expected JSON
/// is a programming-level failure, which is the only thing `AppError::Fetch` is for.
pub fn decode(json: &str) -> AppResult<VideoMeta> {
    let raw: OEmbedResponse = serde_json::from_str(json)
        .map_err(|e| AppError::Fetch(format!("the video metadata could not be read: {e}")))?;
    Ok(VideoMeta {
        title: clean_text(&raw.title, MAX_TITLE_LEN),
        author_name: clean_text(&raw.author_name, MAX_TITLE_LEN),
        thumbnail_url: raw
            .thumbnail_url
            .map(|u| clean_text(&u, 2048))
            .filter(|u| u.starts_with("http://") || u.starts_with("https://")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A captured response body, shortened. The real endpoint returns these fields.
    const CAPTURED: &str = r#"{
        "title": "Rick Astley - Never Gonna Give You Up",
        "author_name": "Rick Astley",
        "author_url": "https://www.youtube.com/@RickAstleyYT",
        "type": "video",
        "height": 113,
        "width": 200,
        "version": "1.0",
        "provider_name": "YouTube",
        "provider_url": "https://www.youtube.com/",
        "thumbnail_height": 360,
        "thumbnail_width": 480,
        "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        "html": "<iframe width=\"200\" height=\"113\" src=\"https://www.youtube.com/embed/dQw4w9WgXcQ\"></iframe>"
    }"#;

    #[test]
    fn oembed_url_percent_encodes_a_question_mark_in_the_video_address() {
        let built = oembed_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        assert!(built.starts_with(
            "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D"
        ));
        assert!(built.ends_with("&format=json"));
        // Exactly one `?` and one `&` — the encoding did not leak a second parameter.
        assert_eq!(built.matches('?').count(), 1);
        assert_eq!(built.matches('&').count(), 1);
    }

    #[test]
    fn decode_a_captured_response_returns_the_three_fields() {
        let meta = decode(CAPTURED).unwrap();
        assert_eq!(meta.title, "Rick Astley - Never Gonna Give You Up");
        assert_eq!(meta.author_name, "Rick Astley");
        assert_eq!(
            meta.thumbnail_url.as_deref(),
            Some("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
        );
    }

    #[test]
    fn decode_a_body_that_is_not_json_is_a_fetch_error() {
        assert!(decode("<html>404</html>").is_err());
    }

    #[test]
    fn decode_a_missing_thumbnail_is_none_rather_than_an_error() {
        let meta = decode(r#"{"title":"T","author_name":"A"}"#).unwrap();
        assert_eq!(meta.thumbnail_url, None);
    }

    #[test]
    fn decode_a_non_http_thumbnail_is_dropped() {
        let meta = decode(r#"{"title":"T","thumbnail_url":"javascript:alert(1)"}"#).unwrap();
        assert_eq!(meta.thumbnail_url, None);
    }

    #[test]
    fn decode_a_hostile_title_survives_verbatim_as_text() {
        let meta = decode(r#"{"title":"<script>alert(1)</script>"}"#).unwrap();
        assert_eq!(meta.title, "<script>alert(1)</script>");
    }

    #[test]
    fn thumbnail_candidates_a_letterboxed_name_puts_the_widescreen_twins_first() {
        let got = thumbnail_candidates("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
        assert_eq!(
            got,
            vec![
                "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
                "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
                "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            ]
        );
    }

    #[test]
    fn thumbnail_candidates_an_address_that_is_not_letterboxed_is_returned_unchanged() {
        let got = thumbnail_candidates("https://example.com/preview.png");
        assert_eq!(got, vec!["https://example.com/preview.png"]);
    }
}
