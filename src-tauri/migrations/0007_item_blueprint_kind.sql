-- One new item kind, `blueprint`, so a card can know what it is. Phase 6, the writing pack.
--
-- SQLite cannot alter a CHECK constraint in place, so `item` is rebuilt: a new table with
-- the widened CHECK, every row copied by name, the old table dropped, the index recreated.
-- This is the one non-additive migration in the project (`feature-writing-pack.html` §7,
-- exception 3) and it is expected to happen EXACTLY ONCE. From here the card *type* lives
-- inside the payload, so a seventh, eighth or twentieth card type is a data file and no
-- migration. A second rebuild proposed for the same reason is the signal to go back to
-- `dev-architecture` rather than to write it.
--
-- The columns are named in the INSERT … SELECT on purpose. A bare `SELECT *` binds by
-- position and would silently misfile every column if the two tables ever drifted.
--
-- SAFETY: `placement.item_id REFERENCES item(id) ON DELETE CASCADE`. With
-- `PRAGMA foreign_keys = ON`, `DROP TABLE item` performs an implicit DELETE that fires that
-- cascade and empties `placement` — every card on every canvas. The pragma is a no-op inside
-- a transaction and `rusqlite_migration` wraps each migration in one, so it cannot be set
-- here; `db/connection.rs` turns foreign keys OFF around the migration run, back ON after
-- it, and then runs `PRAGMA foreign_key_check`. That order is the whole safety of this file.

CREATE TABLE item_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('note', 'image', 'link', 'video', 'blueprint')),
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO item_new (id, project_id, kind, payload, created_at, updated_at)
SELECT id, project_id, kind, payload, created_at, updated_at FROM item;

DROP TABLE item;

ALTER TABLE item_new RENAME TO item;

CREATE INDEX idx_item_project ON item(project_id);
