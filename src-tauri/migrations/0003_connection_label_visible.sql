-- Whether a connection's label chip is drawn on the canvas. The label text is kept either
-- way: hiding the chip is a display choice, and the properties panel still shows the words.

ALTER TABLE connection ADD COLUMN label_visible INTEGER NOT NULL DEFAULT 1;
