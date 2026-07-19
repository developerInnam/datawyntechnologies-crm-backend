-- Adds per-user dashboard theme preference (light/dark)
-- Date: 2026-06-02

ALTER TABLE users
  ADD COLUMN dashboard_theme VARCHAR(10) NULL;

-- Optional defaults for existing rows
UPDATE users
  SET dashboard_theme = 'light'
  WHERE dashboard_theme IS NULL;

