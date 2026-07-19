const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

async function setupDatabase() {
  // First connect without database to create it
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log("Connected to MySQL server");

    // Create database if it doesn't exist
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✓ Database '${process.env.DB_NAME}' created or already exists`);

    await connection.end();

    // Now connect to the specific database
    const dbConnection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    console.log(`Connected to database '${process.env.DB_NAME}'`);

    // Read the database.sql file
    const sqlFile = path.join(__dirname, "database.sql");
    let sql = fs.readFileSync(sqlFile, "utf8");

    // Remove comments
    sql = sql.replace(/--.*$/gm, "");

    // Split by semicolon, keeping multi-line statements intact
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.toLowerCase().includes("create database") && !s.toLowerCase().startsWith("use "));

    console.log(`Executing ${statements.length} SQL statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await dbConnection.query(statement);
        console.log(`✓ Executed statement ${i + 1}/${statements.length}`);
      } catch (err) {
        console.error(`✗ Error executing statement ${i + 1}/${statements.length}:`, err.message);
        console.error("Statement:", statement.substring(0, 150) + "...");
      }
    }

    console.log("\n✅ Database setup completed!");
    await dbConnection.end();
  } catch (error) {
    console.error("❌ Database setup failed:", error);
  } finally {
    if (connection) await connection.end();
  }
}

setupDatabase();
