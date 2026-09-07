-- The shape a connection's line takes: 'straight' (one segment, the centre-ray clip that has
-- always been drawn) or 'elbow' (horizontal and vertical segments only, with rounded bends).
-- Design-system §9.13, "Route".
--
-- The row stores a KEY, never geometry, the same way `color` and `width` do: the front end
-- resolves it, so the bend radius and the side-choice rules can be retuned without a
-- migration. Existing lines keep the shape they were drawn with.

ALTER TABLE connection ADD COLUMN route TEXT NOT NULL DEFAULT 'straight';
