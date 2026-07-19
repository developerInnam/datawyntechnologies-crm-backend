-- Migration: Add 'consumed' status to permission_requests table
-- This is required for the single-use permission system to work
-- Run this in phpMyAdmin or MySQL CLI after updating the backend code

USE crm_system;

-- Update the status ENUM to include 'consumed'
ALTER TABLE permission_requests 
MODIFY status ENUM('pending', 'approved', 'rejected', 'consumed') DEFAULT 'pending';

-- Optional: View the change
-- SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_NAME = 'permission_requests' AND COLUMN_NAME = 'status';
