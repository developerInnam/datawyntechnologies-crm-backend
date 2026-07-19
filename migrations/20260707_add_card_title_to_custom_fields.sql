-- Add card_title field to custom_field_definitions table
-- This allows custom fields to be organized under different card sections

ALTER TABLE custom_field_definitions 
ADD COLUMN card_title VARCHAR(150) NULL AFTER page_key
