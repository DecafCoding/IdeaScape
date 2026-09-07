-- Per-connection appearance: a palette key and one of three width steps.
-- `color` holds a key from the front end's line palette ('default' plus seven hues), never a
-- hex value, so both themes can resolve it to their own ink. `width` is the step 1, 2 or 3.

ALTER TABLE connection ADD COLUMN color TEXT NOT NULL DEFAULT 'default';
ALTER TABLE connection ADD COLUMN width INTEGER NOT NULL DEFAULT 1;
