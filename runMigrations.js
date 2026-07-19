const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

async function runMigrations() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log(`Connected to database '${process.env.DB_NAME}'`);

    const migrationsDir = path.join(__dirname, "migrations");
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    console.log(`Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");

      // Remove comments
      const cleanSql = sql.replace(/--.*$/gm, "");

      // Split by semicolon
      const statements = cleanSql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      console.log(`\nRunning migration: ${file}`);

      for (const statement of statements) {
        try {
          await connection.query(statement);
          console.log(`  ✓ Executed`);
        } catch (err) {
          console.error(`  ✗ Error:`, err.message);
        }
      }
    }

    console.log("\n✅ All migrations completed!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await connection.end();
  }
}

runMigrations();
