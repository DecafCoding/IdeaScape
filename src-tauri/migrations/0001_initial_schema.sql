-- The PRD §6.9 data model. Never edit this file once it has shipped; add the next
-- numbered migration instead.

CREATE TABLE project (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE canvas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  view_x     REAL NOT NULL DEFAULT 0,
  view_y     REAL NOT NULL DEFAULT 0,
  view_zoom  REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE item (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('note', 'image', 'link', 'video')),
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE placement (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  canvas_id INTEGER NOT NULL REFERENCES canvas(id) ON DELETE CASCADE,
  item_id   INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  x         REAL NOT NULL,
  y         REAL NOT NULL,
  width     REAL NOT NULL,
  height    REAL NOT NULL,
  z_order   INTEGER NOT NULL
);

CREATE TABLE connection (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  canvas_id         INTEGER NOT NULL REFERENCES canvas(id) ON DELETE CASCADE,
  from_placement_id INTEGER NOT NULL REFERENCES placement(id) ON DELETE CASCADE,
  to_placement_id   INTEGER NOT NULL REFERENCES placement(id) ON DELETE CASCADE,
  label             TEXT,
  directed          INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_placement_canvas ON placement(canvas_id);
CREATE INDEX idx_placement_item ON placement(item_id);
CREATE INDEX idx_connection_canvas ON connection(canvas_id);
CREATE INDEX idx_canvas_project ON canvas(project_id);
CREATE INDEX idx_item_project ON item(project_id);
