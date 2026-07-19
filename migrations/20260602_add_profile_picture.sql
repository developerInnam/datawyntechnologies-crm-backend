-- Add profile picture column to users table (optional for self-profile page)

ALTER TABLE users
  ADD COLUMN profile_picture VARCHAR(255) NULL;

