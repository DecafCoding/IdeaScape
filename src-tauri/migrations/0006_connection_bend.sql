-- A hand-placed bend in the middle of a connection. Design-system §9.13, "Bend".
--
-- One column holding a JSON object, `{"a":…,"b":…}`, or the empty string for "no bend" —
-- the same shape rule the item payload follows, and the same key-not-geometry rule the
-- anchors follow, one step further: the pair is a position in the frame of the two card
-- CENTRES, never a canvas coordinate.
--
-- `a` runs along the line from the first card's centre to the second's, 0 at one end and 1
-- at the other. `b` runs at a right angle to it, measured in the same units as that
-- distance. So the bend slides, stretches and turns with the two cards, and the shape the
-- user drew survives a card being moved. The front end owns that arithmetic, so the frame
-- can be retuned without a migration.
--
-- Empty by default, so no existing line gains a bend.

ALTER TABLE connection ADD COLUMN bend TEXT NOT NULL DEFAULT '';
