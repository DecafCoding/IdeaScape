-- What a line between two cards MEANS. Design-system §9.13, "Role".
--
-- One nullable column holding a KEY the way `color`, `route` and the anchors do — one of
-- 'feeds', 'follows', 'part-of', 'appears-in', 'told-by', 'set-in', 'relates-to', or any
-- text the user typed. No glyph, no label and no colour is stored; the front end resolves
-- the key, so the vocabulary can grow without a migration.
--
-- NULLABLE, WITH NO DEFAULT, DELIBERATELY. NULL is the meaningful value: it reads as
-- "Relates To" and draws no glyph at all, which is exactly how every line drawn before this
-- phase already looks. Giving this column DEFAULT 'relates-to' would be the same thing
-- semantically and would rewrite every existing row for no visible gain — so do not add one,
-- and do not normalise NULL into 'relates-to' on write. "No back-fill is needed" is the
-- compatibility promise this column makes.

ALTER TABLE connection ADD COLUMN role TEXT;
