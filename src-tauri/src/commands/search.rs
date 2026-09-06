//! Text search over the open project — three plain `LIKE` scans in one command: canvas
//! names, note titles, note body text. Canvas names always rank first; that ranking is the
//! requirement, not the indexing (`search-method`). FTS5 is present in the bundled SQLite
//! and deliberately unused.
//!
//! Only `note` items are searched. `search-method` names exactly three queries, and image
//! alt text, link titles and video titles are not among them. `CardHit::kind` is carried
//! anyway so a later phase can widen the search by changing a query, not a shape.

use crate::commands::project::AppState;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};

/// How many rows each group returns. No document states a limit; 25 rows at the drawn row
/// height scrolls comfortably inside the popover's 420 px, and the group header count is the
/// number of rows returned so it can never disagree with what is on screen.
const GROUP_LIMIT: i64 = 25;

/// About how many characters of body text a snippet shows, centred on the match.
const SNIPPET_WIDTH: usize = 120;

/// One canvas whose name matched. Field names must stay in step with `src/lib/types.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanvasHit {
    pub canvas_id: i64,
    pub name: String,
    pub card_count: i64,
    pub updated_at: String,
}

/// One card whose note title or body text matched. `matched_title` says which of the two
/// found it, so the popover can name the result by its title either way.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CardHit {
    pub placement_id: i64,
    pub canvas_id: i64,
    pub canvas_name: String,
    pub item_id: i64,
    pub kind: String,
    pub title: String,
    pub snippet: String,
    pub matched_title: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SearchResults {
    pub canvases: Vec<CanvasHit>,
    pub cards: Vec<CardHit>,
}

/// Turn a user's query into a `LIKE` pattern that matches it literally.
///
/// `%` and `_` typed by the user are `LIKE` wildcards: without this plus an explicit
/// `ESCAPE '\'` clause on every query, searching `100%` matches every row in the project.
/// The backslash is escaped first, or escaping the other two would double-escape it.
pub fn escape_like(query: &str) -> String {
    let mut pattern = String::with_capacity(query.len() + 2);
    pattern.push('%');
    for ch in query.chars() {
        if ch == '\\' || ch == '%' || ch == '_' {
            pattern.push('\\');
        }
        pattern.push(ch);
    }
    pattern.push('%');
    pattern
}

/// A window of about `width` characters of `body` centred on the first case-insensitive
/// match of `query`, with a leading and/or trailing `…` when it was cut, and newlines
/// collapsed to spaces.
///
/// Everything works in `char_indices()`: `&body[a..b]` panics when a or b lands mid-character,
/// which any multi-byte body would eventually do.
pub fn snippet(body: &str, query: &str, width: usize) -> String {
    let flat: String = body
        .chars()
        .map(|c| if c.is_whitespace() { ' ' } else { c })
        .collect();
    let chars: Vec<char> = flat.chars().collect();

    if chars.len() <= width {
        return flat.trim().to_string();
    }

    // The match position in *characters*, not bytes.
    let lower = flat.to_lowercase();
    let needle = query.trim().to_lowercase();
    let at = if needle.is_empty() {
        0
    } else {
        lower
            .find(&needle)
            .map(|byte| lower[..byte].chars().count())
            .unwrap_or(0)
    };

    let match_len = needle.chars().count();
    let half = width.saturating_sub(match_len) / 2;
    let mut start = at.saturating_sub(half);
    let mut end = (start + width).min(chars.len());
    // A match near the end still gets a full window.
    if end == chars.len() {
        start = chars.len().saturating_sub(width);
    }
    end = (start + width).min(chars.len());

    let mut out = String::new();
    if start > 0 {
        out.push('…');
    }
    out.push_str(chars[start..end].iter().collect::<String>().trim());
    if end < chars.len() {
        out.push('…');
    }
    out
}

pub fn search_project_for(state: &AppState, query: String) -> AppResult<SearchResults> {
    // A blank query touches the database at all.
    if query.trim().is_empty() {
        return Ok(SearchResults::default());
    }
    let pattern = escape_like(query.trim());
    let needle = query.trim().to_string();

    state.with_db(|conn| {
        let project_id: i64 =
            conn.query_row("SELECT id FROM project ORDER BY id LIMIT 1", [], |r| {
                r.get(0)
            })?;

        // (1) Canvas names. Ranked first, which is the whole point of the feature.
        let canvases = {
            let mut stmt = conn.prepare(
                "SELECT c.id, c.name, c.updated_at,
                        (SELECT count(*) FROM placement p WHERE p.canvas_id = c.id) AS card_count
                 FROM canvas c
                 WHERE c.project_id = ?1 AND c.name LIKE ?2 ESCAPE '\\'
                 ORDER BY c.sort_order, c.id
                 LIMIT ?3",
            )?;
            let rows = stmt
                .query_map(rusqlite::params![project_id, pattern, GROUP_LIMIT], |r| {
                    Ok(CanvasHit {
                        canvas_id: r.get("id")?,
                        name: r.get("name")?,
                        card_count: r.get("card_count")?,
                        updated_at: r.get("updated_at")?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };

        // (2) note titles, then (3) note body text. Both join through to the placement the
        // popover selects and the canvas name it prints.
        let card_sql = |field: &str| {
            format!(
                "SELECT p.id AS placement_id, c.id AS canvas_id, c.name AS canvas_name,
                        i.id AS item_id, i.kind AS kind,
                        coalesce(json_extract(i.payload, '$.title'), '') AS title,
                        coalesce(json_extract(i.payload, '$.text'), '') AS body
                 FROM item i
                 JOIN placement p ON p.item_id = i.id
                 JOIN canvas c ON c.id = p.canvas_id
                 WHERE c.project_id = ?1 AND i.kind = 'note'
                   AND json_extract(i.payload, '{field}') LIKE ?2 ESCAPE '\\'
                 ORDER BY c.sort_order, p.z_order, p.id
                 LIMIT ?3"
            )
        };

        let mut cards: Vec<CardHit> = Vec::new();
        let mut seen_items: Vec<i64> = Vec::new();

        for (field, matched_title) in [("$.title", true), ("$.text", false)] {
            let mut stmt = conn.prepare(&card_sql(field))?;
            let rows = stmt
                .query_map(rusqlite::params![project_id, pattern, GROUP_LIMIT], |r| {
                    let body: String = r.get("body")?;
                    Ok((
                        CardHit {
                            placement_id: r.get("placement_id")?,
                            canvas_id: r.get("canvas_id")?,
                            canvas_name: r.get("canvas_name")?,
                            item_id: r.get("item_id")?,
                            kind: r.get("kind")?,
                            title: r.get("title")?,
                            snippet: String::new(),
                            matched_title,
                        },
                        body,
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;

            for (mut hit, body) in rows {
                // A card matching on either title or body is one result, named by its title
                // (design-system §9.8), so the title pass wins and the body pass skips it.
                if seen_items.contains(&hit.item_id) {
                    continue;
                }
                seen_items.push(hit.item_id);
                hit.snippet = snippet(&body, &needle, SNIPPET_WIDTH);
                cards.push(hit);
            }
        }
        cards.truncate(GROUP_LIMIT as usize);

        Ok(SearchResults { canvases, cards })
    })
}

#[tauri::command]
pub fn search_project(
    state: tauri::State<'_, AppState>,
    query: String,
) -> AppResult<SearchResults> {
    search_project_for(&state, query)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::canvas::{create_canvas_for, list_canvases_for, rename_canvas_for};
    use crate::commands::placement::create_note_card_for;
    use crate::commands::project::open_project_at;

    fn note(state: &AppState, canvas_id: i64, title: &str, text: &str) {
        create_note_card_for(
            state,
            canvas_id,
            0.0,
            0.0,
            240.0,
            140.0,
            title.into(),
            text.into(),
        )
        .unwrap();
    }

    #[test]
    fn json_extract_is_available_in_the_bundled_sqlite() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        let title: String = conn
            .query_row(
                r#"SELECT json_extract('{"title":"Hull"}', '$.title')"#,
                [],
                |r| r.get(0),
            )
            .expect("json_extract must be built in");
        assert_eq!(title, "Hull");
    }

    #[test]
    fn escape_like_percent_and_underscore_are_escaped() {
        assert_eq!(escape_like("100%"), r"%100\%%");
        assert_eq!(escape_like("a_b"), r"%a\_b%");
        assert_eq!(escape_like(r"c:\x"), r"%c:\\x%");
        assert_eq!(escape_like("plain"), "%plain%");
    }

    #[test]
    fn snippet_match_in_the_middle_is_windowed_with_ellipses() {
        let body = format!("{} needle {}", "a".repeat(200), "b".repeat(200));
        let out = snippet(&body, "needle", 40);
        assert!(out.starts_with('…'), "{out}");
        assert!(out.ends_with('…'), "{out}");
        assert!(out.contains("needle"), "{out}");
        assert!(out.chars().count() <= 42, "{}", out.chars().count());
    }

    #[test]
    fn snippet_multibyte_body_does_not_panic() {
        let body = format!("{}éüñ match {}", "日本語".repeat(60), "漢字".repeat(60));
        let out = snippet(&body, "match", 30);
        assert!(out.contains("match"), "{out}");

        // A short body comes back whole, with newlines collapsed.
        assert_eq!(snippet("one\ntwo", "two", 120), "one two");
    }

    #[test]
    fn search_project_term_matching_both_returns_the_canvas_first() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        let first = list_canvases_for(&state, project.id).unwrap()[0].id;
        rename_canvas_for(&state, first, "Chapter 3".into()).unwrap();
        let second = create_canvas_for(&state, project.id, "Loose".into())
            .unwrap()
            .id;
        note(
            &state,
            second,
            "Chapter 3",
            "a note that names chapter 3 in its body",
        );

        let results = search_project_for(&state, "chapter 3".into()).unwrap();

        assert_eq!(results.canvases.len(), 1);
        assert_eq!(results.canvases[0].name, "Chapter 3");
        assert_eq!(results.cards.len(), 1);
        // Canvases are a separate, earlier group — the ranking is structural, not a sort key.
        assert_eq!(results.cards[0].canvas_name, "Loose");
    }

    #[test]
    fn search_project_title_and_body_both_match_is_one_result() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        let canvas = list_canvases_for(&state, project.id).unwrap()[0].id;
        note(&state, canvas, "Rudder", "the rudder again");

        let results = search_project_for(&state, "rudder".into()).unwrap();

        assert_eq!(results.cards.len(), 1, "one result, not two");
        assert!(results.cards[0].matched_title, "named by its title");
        assert_eq!(results.cards[0].title, "Rudder");
    }

    #[test]
    fn search_project_blank_query_returns_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        note(
            &state,
            list_canvases_for(&state, project.id).unwrap()[0].id,
            "Anything",
            "text",
        );

        for query in ["", "   ", "\t\n"] {
            let results = search_project_for(&state, query.into()).unwrap();
            assert!(
                results.canvases.is_empty() && results.cards.is_empty(),
                "{query:?}"
            );
        }
    }

    #[test]
    fn search_project_card_on_another_canvas_carries_that_canvas_name() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        let second = create_canvas_for(&state, project.id, "Hull studies".into())
            .unwrap()
            .id;
        note(&state, second, "Frames", "the forward frames");

        let results = search_project_for(&state, "frames".into()).unwrap();
        assert_eq!(results.cards.len(), 1);
        assert_eq!(results.cards[0].canvas_name, "Hull studies");
        assert_eq!(results.cards[0].canvas_id, second);
        assert_eq!(results.cards[0].kind, "note");
    }

    #[test]
    fn search_project_wildcard_characters_are_matched_literally() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::default();
        let project = open_project_at(&state, dir.path()).unwrap();
        let first = list_canvases_for(&state, project.id).unwrap()[0].id;
        rename_canvas_for(&state, first, "100% done".into()).unwrap();
        create_canvas_for(&state, project.id, "Nothing like it".into()).unwrap();

        let results = search_project_for(&state, "100%".into()).unwrap();
        assert_eq!(results.canvases.len(), 1, "% must not act as a wildcard");
        assert_eq!(results.canvases[0].name, "100% done");
    }
}
