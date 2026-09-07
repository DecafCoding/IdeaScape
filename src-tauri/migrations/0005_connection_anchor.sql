-- Which side of each card a connection leaves and enters. Design-system §9.13, "Anchor".
--
-- Two columns, one per end, each holding a KEY the way `color`, `width` and `route` do:
-- 'auto' (the geometry picks the side, which is what every line has always done) or one of
-- 'top', 'right', 'bottom', 'left'. No coordinate is stored, so a card that moves or grows
-- still writes nothing here and the front end can retune the stub length and the side rules
-- without a migration.
--
-- Both default to 'auto', so no existing canvas changes shape.

ALTER TABLE connection ADD COLUMN from_anchor TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE connection ADD COLUMN to_anchor TEXT NOT NULL DEFAULT 'auto';
