const mysql = require('mysql2');
const path = require('path');
const dotenv = require('dotenv');

// Explicitly load backend/.env (or equivalent) so DB credentials are available even if CWD differs
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Debug: ensure env values are actually present in this process
// (Keep minimal: do not print passwords)
console.log('[DB CONFIG] DB_HOST=', process.env.DB_HOST, 'DB_USER=', JSON.stringify(process.env.DB_USER), 'DB_NAME=', process.env.DB_NAME);

const mysql = require("mysql2");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  connectTimeout: 10000,

  ssl: {
    rejectUnauthorized: false,
  },
});

const promisePool = pool.promise();

// Test connection on startup and log clear diagnostics
promisePool.query('SELECT 1')
  .then(() => console.log('Database connected successfully.'))
  .catch(err => {
    console.error('\n❌ DATABASE CONNECTION FAILED ❌');
    console.error('Error:', err.code || err.message);
    console.error('Host:', process.env.DB_HOST || '127.0.0.1');
    console.error('Database:', process.env.DB_NAME);
    console.error('\nFix: Make sure MySQL is running in XAMPP Control Panel.');
    console.error('Then run: backend/database.sql in phpMyAdmin to create tables.\n');
  });

module.exports = promisePool;
