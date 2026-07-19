-- Custom Fields (definitions + values)
-- Adds dynamic form fields that can be attached to specific pages/resources.

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  resource_type VARCHAR(50) NOT NULL,        -- e.g. 'client'
  page_key VARCHAR(100) NOT NULL,           -- e.g. 'clients/add' or 'clients/edit'

  label VARCHAR(150) NOT NULL,
  field_key VARCHAR(80) NOT NULL,           -- stable key used in payloads
  field_type VARCHAR(20) NOT NULL,         -- input|textarea|select|date|time|radio

  required TINYINT(1) NOT NULL DEFAULT 0,
  helper_text VARCHAR(255) NULL,
  options_json JSON NULL,                   -- for select/radio

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_resource_page_field (resource_type, page_key, field_key)
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id INT AUTO_INCREMENT PRIMARY KEY,

  resource_type VARCHAR(50) NOT NULL,
  resource_id INT NOT NULL,                 -- e.g. client.id

  field_key VARCHAR(80) NOT NULL,
  value_text TEXT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_resource_field (resource_type, resource_id, field_key),
  INDEX idx_resource (resource_type, resource_id)
);


