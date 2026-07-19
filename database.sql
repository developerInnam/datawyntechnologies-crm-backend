-- CRM System Database Schema
-- Run this in phpMyAdmin or MySQL CLI after starting MySQL

CREATE DATABASE IF NOT EXISTS crm_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE crm_system;

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role-Permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- Industries table
CREATE TABLE IF NOT EXISTS industries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity types table
CREATE TABLE IF NOT EXISTS activity_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Call status table
CREATE TABLE IF NOT EXISTS call_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    role_id INT,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(100),
    contact_person VARCHAR(100),
    mobile VARCHAR(20),
    industry_id INT,
    office_location VARCHAR(200),
    assigned_to INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT,
    project_name VARCHAR(100) NOT NULL,
    project_location VARCHAR(200),
    status ENUM('ongoing', 'completed', 'cancelled') DEFAULT 'ongoing',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- Activities table
CREATE TABLE IF NOT EXISTS activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT,
    user_id INT,
    type_id INT,
    call_status_id INT,
    status ENUM('pending', 'completed', 'canceled') DEFAULT 'pending',
    follow_up_date DATE,
    meeting_time TIME NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (type_id) REFERENCES activity_types(id) ON DELETE SET NULL,
    FOREIGN KEY (call_status_id) REFERENCES call_status(id) ON DELETE SET NULL
);

-- Notes table
CREATE TABLE IF NOT EXISTS notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT,
    user_id INT,
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed data
INSERT INTO roles (name) VALUES ('Admin'), ('Executive'), ('Manager'), ('Sales'), ('Support') ON DUPLICATE KEY UPDATE name=name;
INSERT INTO permissions (name) VALUES ('view_users'), ('manage_users'), ('view_clients'), ('manage_clients'), ('view_projects'), ('manage_projects'), ('view_activities'), ('manage_activities'), ('view_notes'), ('manage_notes'), ('manage_meetings'), ('manage_leads') ON DUPLICATE KEY UPDATE name=name;
INSERT INTO activity_types (name) VALUES ('Call'), ('Email'), ('Meeting'), ('Site Visit'), ('Follow Up') ON DUPLICATE KEY UPDATE name=name;
INSERT INTO call_status (name) VALUES ('Answered'), ('No Answer'), ('Busy'), ('Wrong Number'), ('Callback Requested') ON DUPLICATE KEY UPDATE name=name;
INSERT INTO industries (name) VALUES ('Technology'), ('Healthcare'), ('Finance'), ('Education'), ('Manufacturing'), ('Retail'), ('Real Estate') ON DUPLICATE KEY UPDATE name=name;

-- Create default admin user (password: admin123)
-- Hash generated with bcrypt (salt rounds=10)
DELETE FROM users WHERE email = 'admin@crm.com';
INSERT INTO users (name, email, phone, password, role_id, status) 
VALUES (
    'Admin User',
    'admin@crm.com',
    '1234567890',
    '$2a$10$x/fgCvwO8oU0hzC4p5K5/uDU3nWlC9zPM0vB2K5lmZ8.F5Q3vC8Py',
    1,
    'active'
);
