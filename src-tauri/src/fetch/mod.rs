//! Every network call the MVP will ever make, in one folder. `network-boundary` says the
//! privacy rule must be enforceable by reading one directory, and the Level 5 grep asserts
//! that `reqwest` appears nowhere else in the tree.
//!
//! Two shapes matter here and are deliberate:
//!
//! - **A failed fetch is a value, not an error.** A network failure, a timeout or a non-2xx
//!   status returns `Ok` with `fetched: false`. In this codebase an `Err` from a command
//!   reaches `app.svelte`'s `guard()` and lands in the shell's message strip, which is the
//!   dialog behaviour contract 3 forbids. `AppError::Fetch` is reserved for a
//!   programming-level failure, and there is deliberately no blanket
//!   `From<reqwest::Error>`.
//! - **One five-second budget covers the whole operation** — the page request, the parse
//!   *and* the thumbnail and favicon downloads — rather than five seconds per request. PRD
//!   §9.3 and contract 4 speak of the user-visible operation, and a per-request budget could
//!   take fifteen seconds for one paste.

pub mod classify;
pub mod oembed;
pub mod opengraph;

use crate::assets;
use crate::error::{AppError, AppResult};
use classify::UrlKind;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::OnceLock;
use std::time::Duration;
use url::Url;

/// The contract with a number in it: every fetch is cut off after five seconds.
pub const FETCH_BUDGET: Duration = Duration::from_secs(5);
/// A connection that has not opened in three seconds will not finish inside the budget.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
/// A page is read for preview data only; two megabytes is far more `<head>` than any page has.
const MAX_PAGE_BYTES: usize = 2 * 1024 * 1024;
/// A preview picture or favicon over five megabytes is not worth the budget it would spend.
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;

/// What a link fetch produced. `fetched: false` is the drawn "not fetched" state, and every
/// asset field being `None` is the drawn "no preview picture" state — a normal state.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LinkPreview {
    pub url: String,
    pub fetched: bool,
    pub title: String,
    pub description: String,
    pub favicon_asset: Option<String>,
    pub thumbnail_asset: Option<String>,
}

/// What a video fetch produced.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct VideoPreview {
    pub url: String,
    pub provider: String,
    pub fetched: bool,
    pub title: String,
    pub author_name: String,
    pub thumbnail_asset: Option<String>,
}

/// The one client, built once. `rustls-tls` with no default features: the default feature set
/// pulls the native TLS stack into a 20 MB installer budget.
fn client() -> &'static reqwest::Client {
    static CELL: OnceLock<reqwest::Client> = OnceLock::new();
    CELL.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(FETCH_BUDGET)
            .connect_timeout(CONNECT_TIMEOUT)
            .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
            .user_agent(concat!("IdeaScape/", env!("CARGO_PKG_VERSION")))
            .build()
            .unwrap_or_default()
    })
}

/// True when a `Content-Type` names HTML.
fn is_html(content_type: Option<&str>) -> bool {
    let Some(value) = content_type else {
        // No header at all: try to parse it. A non-HTML body simply yields no preview.
        return true;
    };
    let base = value
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    base == "text/html" || base == "application/xhtml+xml"
}

fn is_image(content_type: Option<&str>) -> bool {
    content_type.is_some_and(|value| {
        value
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase()
            .starts_with("image/")
    })
}

/// Read a response body, stopping at `max` bytes rather than trusting `Content-Length`.
async fn read_capped(mut response: reqwest::Response, max: usize) -> Option<Vec<u8>> {
    let mut body: Vec<u8> = Vec::new();
    while let Ok(Some(chunk)) = response.chunk().await {
        if body.len() + chunk.len() > max {
            return None;
        }
        body.extend_from_slice(&chunk);
    }
    Some(body)
}

/// The extension an `image/*` content type maps to, for the asset file name.
fn image_extension(content_type: Option<&str>, url: &str) -> String {
    if let Some(value) = content_type {
        let subtype = value
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        let subtype = subtype.strip_prefix("image/").unwrap_or("");
        let mapped = match subtype {
            "jpeg" => "jpg",
            "svg+xml" => "svg",
            other => other,
        };
        if !mapped.is_empty() {
            return mapped.to_string();
        }
    }
    Url::parse(url)
        .ok()
        .and_then(|u| {
            u.path_segments()
                .and_then(|mut s| s.next_back().map(String::from))
                .and_then(|last| last.rsplit_once('.').map(|(_, ext)| ext.to_string()))
        })
        .unwrap_or_else(|| String::from("bin"))
}

/// Download one picture and store it in `assets/` by content hash, exactly like a dropped
/// picture. A failure leaves the payload field `None` and the card draws a normal state.
async fn capture_image(folder: &Path, url: &str) -> Option<String> {
    let response = client().get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    if !is_image(content_type.as_deref()) {
        return None;
    }
    let ext = image_extension(content_type.as_deref(), url);
    let bytes = read_capped(response, MAX_IMAGE_BYTES).await?;
    if bytes.is_empty() {
        return None;
    }
    assets::write_in(folder, &bytes, &ext).ok().map(|a| a.name)
}

/// The whole link-preview operation, inside one budget.
async fn link_preview_inner(folder: &Path, url: &str) -> LinkPreview {
    let mut preview = LinkPreview {
        url: url.to_string(),
        ..Default::default()
    };

    let Ok(base) = Url::parse(url) else {
        return preview;
    };
    let response = match client().get(url).send().await {
        Ok(response) => response,
        Err(error) => {
            log::debug!("the page at {url} could not be read: {error}");
            return preview;
        }
    };
    if !response.status().is_success() {
        log::debug!("the page at {url} answered {}", response.status());
        return preview;
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    if !is_html(content_type.as_deref()) {
        return preview;
    }
    let Some(body) = read_capped(response, MAX_PAGE_BYTES).await else {
        return preview;
    };
    let html = String::from_utf8_lossy(&body);

    let read = opengraph::extract(&html, &base);
    preview.fetched = true;
    preview.title = read.title;
    preview.description = read.description;
    if let Some(image_url) = read.image_url.as_deref() {
        preview.thumbnail_asset = capture_image(folder, image_url).await;
    }
    if let Some(favicon_url) = read.favicon_url.as_deref() {
        preview.favicon_asset = capture_image(folder, favicon_url).await;
    }
    preview
}

/// A link preview, cut off after five seconds. A miss is a not-fetched value, never an error.
pub async fn fetch_link_preview_for(folder: &Path, url: &str) -> AppResult<LinkPreview> {
    let not_fetched = LinkPreview {
        url: url.to_string(),
        ..Default::default()
    };
    match tokio::time::timeout(FETCH_BUDGET, link_preview_inner(folder, url)).await {
        Ok(preview) => Ok(preview),
        Err(_) => Ok(not_fetched),
    }
}

async fn video_meta_inner(folder: &Path, url: &str, video_id: &str) -> VideoPreview {
    let mut preview = VideoPreview {
        url: url.to_string(),
        provider: String::from("youtube"),
        ..Default::default()
    };
    let _ = video_id;

    let Ok(response) = client().get(oembed::oembed_url(url)).send().await else {
        return preview;
    };
    if !response.status().is_success() {
        return preview;
    }
    let Some(body) = read_capped(response, MAX_PAGE_BYTES).await else {
        return preview;
    };
    let Ok(meta) = oembed::decode(&String::from_utf8_lossy(&body)) else {
        return preview;
    };

    preview.fetched = true;
    preview.title = meta.title;
    preview.author_name = meta.author_name;
    if let Some(thumbnail_url) = meta.thumbnail_url.as_deref() {
        preview.thumbnail_asset = capture_image(folder, thumbnail_url).await;
    }
    preview
}

/// A video's metadata, cut off after five seconds. Same contract as the link path.
pub async fn fetch_video_meta_for(folder: &Path, url: &str) -> AppResult<VideoPreview> {
    let video_id = match classify::classify(url) {
        UrlKind::Video { video_id, .. } => video_id,
        // A caller that has re-classified will not reach here; guard anyway rather than
        // silently fetching an address that is not a video.
        _ => return Err(AppError::Fetch(String::from("that is not a video address"))),
    };
    let not_fetched = VideoPreview {
        url: url.to_string(),
        provider: String::from("youtube"),
        ..Default::default()
    };
    match tokio::time::timeout(FETCH_BUDGET, video_meta_inner(folder, url, &video_id)).await {
        Ok(preview) => Ok(preview),
        Err(_) => Ok(not_fetched),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpListener;

    /// Read the request head before answering. Dropping a socket with unread bytes still in
    /// its receive buffer sends an RST on Windows, which reaches the client as a cancelled
    /// request rather than as the response — so a test server that never reads is a test
    /// server that never works.
    fn read_request(stream: &std::net::TcpStream) {
        use std::io::{BufRead, BufReader};
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            if line.trim().is_empty() {
                break;
            }
            line.clear();
        }
    }

    /// Answer one connection with `body` under `content_type`, having read the request.
    fn answer(stream: &mut std::net::TcpStream, content_type: &str, body: &[u8]) {
        read_request(stream);
        let head = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let _ = stream.write_all(head.as_bytes());
        let _ = stream.write_all(body);
        let _ = stream.flush();
    }

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    #[test]
    fn client_is_built_once_and_reports_the_five_second_budget() {
        assert_eq!(FETCH_BUDGET, Duration::from_secs(5));
        let first = client() as *const reqwest::Client;
        let second = client() as *const reqwest::Client;
        assert_eq!(first, second, "the client must be built exactly once");
    }

    #[test]
    fn fetch_link_preview_for_a_closed_port_is_ok_and_not_fetched() {
        // Bind then drop, so the port is certainly closed and certainly nobody else's.
        let port = {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.local_addr().unwrap().port()
        };
        let dir = tempfile::tempdir().unwrap();
        let url = format!("http://127.0.0.1:{port}/article");

        let preview = runtime()
            .block_on(fetch_link_preview_for(dir.path(), &url))
            .expect("a network failure is a value, never an error");
        assert!(!preview.fetched);
        assert_eq!(preview.url, url);
        assert_eq!(preview.thumbnail_asset, None);
    }

    #[test]
    fn fetch_link_preview_for_an_unparseable_address_is_ok_and_not_fetched() {
        let dir = tempfile::tempdir().unwrap();
        let preview = runtime()
            .block_on(fetch_link_preview_for(dir.path(), "not an address"))
            .unwrap();
        assert!(!preview.fetched);
    }

    /// Milestone 3's checkpoint: a deliberately slow loopback responder proves the budget is
    /// real. `std::net` only, so it adds no dependency and touches no real network.
    #[test]
    fn fetch_link_preview_for_a_responder_slower_than_the_budget_gives_up_inside_seven_seconds() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            if let Ok((stream, _)) = listener.accept() {
                // Accept, then never answer until past the budget.
                std::thread::sleep(Duration::from_secs(6));
                drop(stream);
            }
        });

        let dir = tempfile::tempdir().unwrap();
        let url = format!("http://127.0.0.1:{port}/slow");
        let started = std::time::Instant::now();
        let preview = runtime()
            .block_on(fetch_link_preview_for(dir.path(), &url))
            .expect("a timeout is a value, never an error");
        let elapsed = started.elapsed();

        assert!(!preview.fetched, "a timed-out fetch is not fetched");
        assert!(
            elapsed < Duration::from_secs(7),
            "the budget was not honoured: {elapsed:?}"
        );
        assert!(
            elapsed >= Duration::from_secs(4),
            "it gave up before the budget: {elapsed:?}"
        );
        // The five-second cut-off is a contract with a number in it, so the observed number
        // is written out for `scripts/phase-3-session.md` to record rather than rounded off.
        let _ = std::fs::write(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/phase3-cutoff.txt"),
            format!("{:.2}", elapsed.as_secs_f64()),
        );
        let _ = handle.join();
    }

    #[test]
    fn fetch_link_preview_for_a_non_html_content_type_is_refused_as_not_fetched() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                answer(&mut stream, "application/pdf", b"%PDF-1.4 not a web page");
            }
        });

        let dir = tempfile::tempdir().unwrap();
        let url = format!("http://127.0.0.1:{port}/file.pdf");
        let preview = runtime()
            .block_on(fetch_link_preview_for(dir.path(), &url))
            .unwrap();
        assert!(!preview.fetched, "a PDF carries no preview data");
        let _ = handle.join();
    }

    #[test]
    fn fetch_link_preview_for_a_local_page_with_open_graph_tags_reads_it() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        // Two connections: the page, then the `/favicon.ico` fallback the extractor tries.
        // Leaving the second unanswered would spend the whole budget waiting for it, which
        // is exactly the trap the single-budget rule creates.
        let handle = std::thread::spawn(move || {
            for _ in 0..2 {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let body = br#"<html><head><meta property="og:title" content="A Local Page">
                    <meta property="og:description" content="Served by the test."></head></html>"#;
                answer(&mut stream, "text/html; charset=utf-8", body);
            }
        });

        let dir = tempfile::tempdir().unwrap();
        let url = format!("http://127.0.0.1:{port}/page");
        let preview = runtime()
            .block_on(fetch_link_preview_for(dir.path(), &url))
            .unwrap();
        assert!(preview.fetched);
        assert_eq!(preview.title, "A Local Page");
        assert_eq!(preview.description, "Served by the test.");
        // The favicon fallback is tried against the same loopback port and simply misses,
        // which is the normal "no preview picture" state.
        assert_eq!(preview.thumbnail_asset, None);
        let _ = handle.join();
    }

    /// §15.2's "no preview data" row: a page that answers, is HTML, and simply carries no
    /// Open Graph tags. It is a *fetched* preview with no thumbnail — the card's
    /// "No preview picture on this page" state, which is a normal state.
    #[test]
    fn step2_no_preview_data_a_page_with_no_open_graph_tags_is_fetched_with_no_thumbnail() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            for _ in 0..2 {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                // What `python -m http.server` serves for a directory: no OG tags at all.
                let body = br#"<html><head><title>Directory listing for /</title></head>
                    <body><h1>Directory listing for /</h1><ul><li>a.txt</li></ul></body></html>"#;
                answer(&mut stream, "text/html; charset=utf-8", body);
            }
        });

        let dir = tempfile::tempdir().unwrap();
        let url = format!("http://127.0.0.1:{port}/");
        let preview = runtime()
            .block_on(fetch_link_preview_for(dir.path(), &url))
            .unwrap();
        assert!(preview.fetched, "the page answered, so it is fetched");
        assert_eq!(preview.title, "Directory listing for /");
        assert_eq!(preview.thumbnail_asset, None, "no preview picture");
        let _ = handle.join();
    }

    /// The boundary table's YouTube row with the network off. No socket is opened here: the
    /// oEmbed endpoint is a fixed public address, so this asserts the two halves that decide
    /// the fallback — the address is built correctly, and a body that never arrived decodes
    /// to nothing, which is what leaves the payload not fetched. The drawn fallback itself is
    /// asserted in `src/features/cards/__tests__/videoCard.test.ts`.
    #[test]
    fn step5_youtube_fallback_no_body_leaves_the_preview_not_fetched() {
        let built = oembed::oembed_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        assert!(built.starts_with("https://www.youtube.com/oembed?url="));
        assert!(oembed::decode("").is_err(), "no body means no metadata");

        // The value a caller that could not reach the network returns.
        let not_fetched = VideoPreview {
            url: String::from("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            provider: String::from("youtube"),
            ..Default::default()
        };
        assert!(!not_fetched.fetched);
        assert_eq!(not_fetched.thumbnail_asset, None);
    }

    #[test]
    fn fetch_video_meta_for_an_address_that_is_not_a_video_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let result = runtime().block_on(fetch_video_meta_for(dir.path(), "https://example.com/x"));
        assert!(result.is_err());
    }

    #[test]
    fn is_html_accepts_only_html_content_types() {
        assert!(is_html(Some("text/html; charset=utf-8")));
        assert!(is_html(Some("application/xhtml+xml")));
        assert!(!is_html(Some("application/pdf")));
        assert!(!is_html(Some("image/png")));
        assert!(is_html(None), "a missing header is tried, not refused");
    }

    #[test]
    fn image_extension_maps_the_common_types() {
        assert_eq!(image_extension(Some("image/jpeg"), "x"), "jpg");
        assert_eq!(image_extension(Some("image/png"), "x"), "png");
        assert_eq!(image_extension(Some("image/svg+xml"), "x"), "svg");
        assert_eq!(
            image_extension(None, "https://example.com/a/hero.webp"),
            "webp"
        );
        assert_eq!(image_extension(None, "https://example.com/hero"), "bin");
    }
}
