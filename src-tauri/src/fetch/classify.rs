//! Address classification, as pure functions. Everything downstream branches on this one
//! answer — the paste router and Refetch both ask for it — so it is built and tested before
//! anything that opens a socket, and it lives here rather than being re-implemented in
//! TypeScript so there is one source of truth about what a YouTube address is.
//!
//! No regular-expression crate: hosts, schemes and path segments are what a URL parser is
//! for and what a regular expression is famously bad at.

use serde::{Deserialize, Serialize};
use url::Url;

/// The longest string that is even considered an address.
const MAX_URL_LEN: usize = 2048;

/// A YouTube video id: exactly eleven of `[A-Za-z0-9_-]`.
const VIDEO_ID_LEN: usize = 11;

/// What a pasted string turns out to be. Vimeo left the MVP on 2026-09-06 and takes the
/// ordinary link-preview path, so `Video` means YouTube and nothing else.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum UrlKind {
    Video {
        url: String,
        provider: String,
        video_id: String,
    },
    Link {
        url: String,
    },
    None,
}

/// Parse `text` as an address, accepting only `http` and `https`.
///
/// `Url::parse("www.example.com")` succeeds and yields the scheme `www.example.com` with an
/// empty host, so the scheme is checked against the allow-list *after* parsing and the
/// `https://` prefix is tried only when the input has no scheme separator at all.
fn parse_web_url(text: &str) -> Option<Url> {
    let trimmed = text.trim().trim_matches(|c| c == '<' || c == '>');
    if trimmed.is_empty() || trimmed.len() > MAX_URL_LEN {
        return None;
    }
    if trimmed.chars().any(char::is_whitespace) {
        return None;
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else if trimmed.contains(':') {
        // A scheme with no authority — `javascript:`, `mailto:`, `data:` — is never a card.
        return None;
    } else if trimmed.contains('.') {
        format!("https://{trimmed}")
    } else {
        return None;
    };

    let url = Url::parse(&candidate).ok()?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return None;
    }
    if !url.host_str().is_some_and(|h| h.contains('.')) {
        return None;
    }
    Some(url)
}

fn is_video_id(value: &str) -> bool {
    value.len() == VIDEO_ID_LEN
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Whether `host` is a YouTube host, with or without `www.`, `m.` or `music.`.
fn youtube_host(host: &str) -> Option<&'static str> {
    let bare = host
        .trim_start_matches("www.")
        .trim_start_matches("m.")
        .trim_start_matches("music.");
    match bare {
        "youtube.com" => Some("youtube.com"),
        "youtu.be" => Some("youtu.be"),
        _ => None,
    }
}

/// The video id in a YouTube address, or `None` when the address is a channel, a playlist
/// with no `v`, or anything else that is not one video.
fn youtube_video_id(url: &Url) -> Option<String> {
    let host = youtube_host(url.host_str()?)?;
    let segments: Vec<&str> = url
        .path_segments()
        .map(|s| s.filter(|p| !p.is_empty()).collect())
        .unwrap_or_default();

    if host == "youtu.be" {
        return segments
            .first()
            .filter(|id| is_video_id(id))
            .map(|id| id.to_string());
    }

    // youtube.com/watch?v=ID
    if segments.first() == Some(&"watch") {
        return url
            .query_pairs()
            .find(|(key, _)| key == "v")
            .map(|(_, value)| value.to_string())
            .filter(|id| is_video_id(id));
    }

    // youtube.com/shorts/ID, /embed/ID, /live/ID
    if let [first, second, ..] = segments.as_slice() {
        if matches!(*first, "shorts" | "embed" | "live") && is_video_id(second) {
            return Some(second.to_string());
        }
    }

    // A bare `?v=` on any other youtube.com path still names one video.
    url.query_pairs()
        .find(|(key, _)| key == "v")
        .map(|(_, value)| value.to_string())
        .filter(|id| is_video_id(id))
}

/// The one classification the whole phase branches on.
pub fn classify(text: &str) -> UrlKind {
    let Some(url) = parse_web_url(text) else {
        return UrlKind::None;
    };
    match youtube_video_id(&url) {
        Some(video_id) => UrlKind::Video {
            url: url.to_string(),
            provider: String::from("youtube"),
            video_id,
        },
        None => UrlKind::Link {
            url: url.to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "dQw4w9WgXcQ";

    fn video_id_of(kind: &UrlKind) -> Option<&str> {
        match kind {
            UrlKind::Video { video_id, .. } => Some(video_id),
            _ => None,
        }
    }

    #[test]
    fn classify_the_six_youtube_forms_all_give_the_same_video_id() {
        let forms = [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            "https://youtube.com/embed/dQw4w9WgXcQ",
            "https://m.youtube.com/live/dQw4w9WgXcQ",
            "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD",
        ];
        for form in forms {
            let kind = classify(form);
            assert_eq!(video_id_of(&kind), Some(ID), "{form}");
            assert!(matches!(kind, UrlKind::Video { ref provider, .. } if provider == "youtube"));
        }
    }

    #[test]
    fn classify_a_youtube_channel_is_a_link_not_a_video() {
        assert!(matches!(
            classify("https://www.youtube.com/@somechannel"),
            UrlKind::Link { .. }
        ));
        assert!(matches!(
            classify("https://www.youtube.com/playlist?list=PL123"),
            UrlKind::Link { .. }
        ));
    }

    #[test]
    fn classify_a_vimeo_address_is_a_link() {
        assert!(matches!(
            classify("https://vimeo.com/123456789"),
            UrlKind::Link { .. }
        ));
    }

    #[test]
    fn classify_a_bare_host_is_normalised_to_https() {
        assert_eq!(
            classify("www.example.com"),
            UrlKind::Link {
                url: String::from("https://www.example.com/")
            }
        );
        assert_eq!(
            classify("example.com/deep/page"),
            UrlKind::Link {
                url: String::from("https://example.com/deep/page")
            }
        );
    }

    #[test]
    fn classify_an_address_wrapped_in_angle_brackets_or_padded_still_parses() {
        assert!(matches!(
            classify("  <https://example.com/x>  "),
            UrlKind::Link { .. }
        ));
    }

    #[test]
    fn classify_every_other_scheme_and_plain_prose_is_none() {
        for text in [
            "javascript:alert(1)",
            "file:///c:/x",
            "data:text/html,x",
            "mailto:someone@example.com",
            "ftp://example.com/x",
            "just some words",
            "",
            "   ",
            "https://example.com/a b",
            "localhost",
        ] {
            assert_eq!(classify(text), UrlKind::None, "{text}");
        }
    }

    #[test]
    fn classify_an_address_over_the_length_ceiling_is_none() {
        let long = format!("https://example.com/{}", "a".repeat(MAX_URL_LEN));
        assert_eq!(classify(&long), UrlKind::None);
    }

    #[test]
    fn classify_a_watch_address_with_a_malformed_id_is_a_link() {
        assert!(matches!(
            classify("https://www.youtube.com/watch?v=short"),
            UrlKind::Link { .. }
        ));
    }
}
