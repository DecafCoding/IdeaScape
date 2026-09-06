//! Open Graph extraction from an HTML string, and the one text-cleaning function every
//! fetched value passes through. Pure: a string in, a struct out. No client, no socket, no
//! `async` — which is what makes the security rules testable without a network.
//!
//! `clean_text` deliberately does not *escape*. Escaping here would double-escape once the
//! front end inserts the value correctly, and inserting it as a text node is what makes it
//! safe. A page whose title is `<img src=x onerror=alert(1)>` comes out of here verbatim
//! and appears on the card as visible characters.

use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use url::Url;

/// The cap on a fetched title, and on a fetched description. Neither is stated anywhere;
/// each is one constant and the smallest reversible option.
pub const MAX_TITLE_LEN: usize = 300;
pub const MAX_DESCRIPTION_LEN: usize = 1000;

/// What one page's `<head>` yielded. Every URL is absolute and `http`/`https`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Preview {
    pub title: String,
    pub description: String,
    pub image_url: Option<String>,
    pub favicon_url: Option<String>,
}

/// A `Selector` is expensive to build, so each is built exactly once.
fn selector(cell: &'static OnceLock<Selector>, css: &str) -> &'static Selector {
    cell.get_or_init(|| Selector::parse(css).expect("a static selector must parse"))
}

fn meta_selector() -> &'static Selector {
    static CELL: OnceLock<Selector> = OnceLock::new();
    selector(&CELL, "meta")
}

fn title_selector() -> &'static Selector {
    static CELL: OnceLock<Selector> = OnceLock::new();
    selector(&CELL, "title")
}

fn icon_selector() -> &'static Selector {
    static CELL: OnceLock<Selector> = OnceLock::new();
    selector(&CELL, "link[rel~=icon]")
}

/// Collapse whitespace, strip control characters, trim, and truncate on a character
/// boundary. Nothing is decoded and nothing is escaped.
pub fn clean_text(value: &str, max: usize) -> String {
    let collapsed: String = value
        .chars()
        .map(|c| if c.is_whitespace() { ' ' } else { c })
        .filter(|c| !c.is_control())
        .collect();

    let mut out = String::new();
    let mut last_was_space = false;
    for c in collapsed.chars() {
        if c == ' ' {
            if !last_was_space && !out.is_empty() {
                out.push(' ');
            }
            last_was_space = true;
            continue;
        }
        last_was_space = false;
        out.push(c);
    }
    let trimmed = out.trim_end();
    trimmed.chars().take(max).collect()
}

/// Resolve `candidate` against `base` and keep it only if it ends up `http`/`https`.
fn absolute_web_url(base: &Url, candidate: &str) -> Option<String> {
    let joined = base.join(candidate.trim()).ok()?;
    if joined.scheme() != "http" && joined.scheme() != "https" {
        return None;
    }
    Some(joined.to_string())
}

/// Read one page's preview data. Open Graph wins; `<title>`, `meta[name=description]`,
/// `link[rel~=icon]` and `/favicon.ico` are the fallbacks.
pub fn extract(html: &str, base: &Url) -> Preview {
    let document = Html::parse_document(html);

    let mut og_title = None;
    let mut og_description = None;
    let mut og_image = None;
    let mut og_image_secure = None;
    let mut meta_description = None;

    for element in document.select(meta_selector()) {
        let value = element.value();
        let content = value.attr("content").unwrap_or("");
        if content.is_empty() {
            continue;
        }
        if let Some(property) = value.attr("property") {
            match property.trim().to_ascii_lowercase().as_str() {
                "og:title" => og_title = og_title.or(Some(content)),
                "og:description" => og_description = og_description.or(Some(content)),
                "og:image" => og_image = og_image.or(Some(content)),
                "og:image:secure_url" => og_image_secure = og_image_secure.or(Some(content)),
                _ => {}
            }
        }
        if value
            .attr("name")
            .is_some_and(|n| n.trim().eq_ignore_ascii_case("description"))
        {
            meta_description = meta_description.or(Some(content));
        }
    }

    let document_title = document
        .select(title_selector())
        .next()
        .map(|t| t.text().collect::<String>());

    let title = clean_text(
        og_title.unwrap_or(document_title.as_deref().unwrap_or("")),
        MAX_TITLE_LEN,
    );
    let description = clean_text(
        og_description.or(meta_description).unwrap_or(""),
        MAX_DESCRIPTION_LEN,
    );

    // The secure variant is preferred when both are present.
    let image_url = og_image_secure
        .or(og_image)
        .and_then(|candidate| absolute_web_url(base, candidate));

    let favicon_url = document
        .select(icon_selector())
        .find_map(|link| link.value().attr("href"))
        .and_then(|href| absolute_web_url(base, href))
        .or_else(|| absolute_web_url(base, "/favicon.ico"));

    Preview {
        title,
        description,
        image_url,
        favicon_url,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Url {
        Url::parse("https://example.com/articles/one").unwrap()
    }

    #[test]
    fn extract_full_open_graph_tags_win_over_the_title_element() {
        let html = r#"<html><head>
            <title>Document Title</title>
            <meta property="og:title" content="Graph Title">
            <meta property="og:description" content="Graph description.">
            <meta name="description" content="Meta description.">
        </head><body></body></html>"#;
        let preview = extract(html, &base());
        assert_eq!(preview.title, "Graph Title");
        assert_eq!(preview.description, "Graph description.");
    }

    #[test]
    fn extract_a_page_with_no_open_graph_tags_falls_back_correctly() {
        let html = r#"<html><head>
            <title>  Document
            Title </title>
            <meta name="description" content="Meta description.">
        </head></html>"#;
        let preview = extract(html, &base());
        assert_eq!(preview.title, "Document Title");
        assert_eq!(preview.description, "Meta description.");
    }

    #[test]
    fn extract_a_relative_og_image_resolves_against_the_base() {
        let html = r#"<meta property="og:image" content="../pictures/hero.png">"#;
        let preview = extract(html, &base());
        assert_eq!(
            preview.image_url.as_deref(),
            Some("https://example.com/pictures/hero.png")
        );
    }

    #[test]
    fn extract_a_protocol_relative_og_image_takes_the_base_scheme() {
        let html = r#"<meta property="og:image" content="//cdn.example.com/hero.png">"#;
        let preview = extract(html, &base());
        assert_eq!(
            preview.image_url.as_deref(),
            Some("https://cdn.example.com/hero.png")
        );
    }

    #[test]
    fn extract_a_data_uri_og_image_is_dropped() {
        let html = r#"<meta property="og:image" content="data:image/png;base64,AAA">"#;
        assert_eq!(extract(html, &base()).image_url, None);
    }

    #[test]
    fn extract_the_secure_url_variant_is_preferred() {
        let html = r#"<meta property="og:image" content="http://example.com/a.png">
            <meta property="og:image:secure_url" content="https://example.com/b.png">"#;
        assert_eq!(
            extract(html, &base()).image_url.as_deref(),
            Some("https://example.com/b.png")
        );
    }

    #[test]
    fn extract_a_javascript_favicon_is_dropped_and_the_default_is_used() {
        let html = r#"<link rel="icon" href="javascript:alert(1)">"#;
        assert_eq!(
            extract(html, &base()).favicon_url.as_deref(),
            Some("https://example.com/favicon.ico")
        );
    }

    #[test]
    fn extract_no_icon_link_falls_back_to_the_default_favicon_path() {
        assert_eq!(
            extract("<html><head></head></html>", &base())
                .favicon_url
                .as_deref(),
            Some("https://example.com/favicon.ico")
        );
    }

    #[test]
    fn extract_a_hostile_title_survives_verbatim_as_text() {
        let html = r#"<meta property="og:title" content="<img src=x onerror=alert(1)>">"#;
        assert_eq!(extract(html, &base()).title, "<img src=x onerror=alert(1)>");
    }

    #[test]
    fn clean_text_collapses_a_newline_laden_title() {
        assert_eq!(clean_text("  A\n\tlong\r\n title  ", 300), "A long title");
    }

    #[test]
    fn clean_text_strips_a_null_character() {
        assert_eq!(clean_text("ab\u{0}cd", 300), "abcd");
    }

    #[test]
    fn clean_text_truncates_a_five_thousand_character_description_to_one_thousand() {
        let long = "x".repeat(5000);
        assert_eq!(clean_text(&long, MAX_DESCRIPTION_LEN).len(), 1000);
    }

    #[test]
    fn clean_text_truncates_on_a_character_boundary() {
        // Four-byte characters: a byte-wise cut would panic or produce invalid UTF-8.
        let value = "🧱".repeat(10);
        assert_eq!(clean_text(&value, 3).chars().count(), 3);
    }

    #[test]
    fn extract_a_twenty_thousand_character_title_is_capped() {
        let html = format!(
            r#"<meta property="og:title" content="{}">"#,
            "t".repeat(20_000)
        );
        assert_eq!(extract(&html, &base()).title.len(), MAX_TITLE_LEN);
    }
}
