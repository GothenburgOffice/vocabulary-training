-- Lists autosave while they are edited (#67), so a list can have no name for a while; the app
-- shows "Untitled list". Sessions keep needing a title: the app records the shown one.
ALTER TABLE lists DROP CONSTRAINT lists_title_check;
ALTER TABLE lists ADD CONSTRAINT lists_title_check CHECK (length(title) <= 200);
