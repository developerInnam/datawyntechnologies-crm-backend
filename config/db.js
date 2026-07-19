const mysql = require("mysql2/promise");
const path = require("path");
const dotenv = require("dotenv");

// Load .env locally
dotenv.config({ path: path.join(__dirname, "..", ".env") });

console.log("========== DATABASE CONFIG ==========");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_PORT:", process.env.DB_PORT);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_NAME:", process.env.DB_NAME);
console.log("=====================================");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  connectTimeout: 30000,

  ssl: {
    rejectUnauthorized: false,
  },
});

// Test Database Connection
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Connected to Railway MySQL Database");
    connection.release();
  } catch (err) {
    console.error("❌ Database Connection Failed");
    console.error(err);
  }
})();

module.exports = pool;