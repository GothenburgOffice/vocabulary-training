-- Languages are no longer ordered by hand (#73): highlighted ones come first, then the rest,
-- each by name. "Other" stays last in the app.
ALTER TABLE languages ADD COLUMN highlighted boolean NOT NULL DEFAULT false;
ALTER TABLE languages DROP COLUMN position;
