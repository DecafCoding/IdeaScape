-- The project's own vocabulary. A value the user types into a Pick or Pick Many field is
-- accepted, saved here, and offered again next time.
--
-- PER PROJECT, not per machine, which is what makes a copied project folder carry the words
-- its author invented. `list` names one of the shipped lists ('genres', 'subgenres',
-- 'story-tropes', 'character-tropes', 'themes', 'points-of-view'); `text` is what the user
-- typed, verbatim.
--
-- THERE IS DELIBERATELY NO `id` COLUMN. A shipped entry carries a permanent id from the
-- Book Guides library and the sources it came from; a user-typed value carries neither, and
-- that absence is what marks it as the user's own (`feature-writing-pack.html` §5). A
-- nullable id that was always NULL would be a column waiting to be misused.
--
-- The unique index makes a duplicate insert a no-op through INSERT OR IGNORE rather than a
-- failed action. SQLite compares TEXT case-sensitively, so "Chosen One" and "chosen one"
-- would be two rows here — the case-insensitive check happens in Rust before the insert.

CREATE TABLE list_entry (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  list       TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_list_entry_unique ON list_entry(project_id, list, text);
CREATE INDEX idx_list_entry_list ON list_entry(project_id, list);
