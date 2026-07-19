-- Adds meeting_time column to activities for meeting scheduling

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS meeting_time TIME NULL;

-- Also ensure activities.status supports canceled (route uses 'canceled')
-- MySQL cannot add a value without redefining enum; use a guard by checking definition.
-- If your table already has the correct enum, this will be a no-op after successful alter.

SET @current_enum := NULL;
SELECT COLUMN_TYPE INTO @current_enum
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'activities'
  AND COLUMN_NAME = 'status';

-- If it doesn't contain 'canceled', alter the enum.
SET @has_canceled := (CASE WHEN @current_enum LIKE '%canceled%' THEN 1 ELSE 0 END);

SET @sql := IF(
  @has_canceled = 1,
  'SELECT 1',
  'ALTER TABLE activities MODIFY status ENUM(\'pending\',\'completed\',\'canceled\') DEFAULT \'pending\''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

