const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

dotenv.config({ path: require("path").join(__dirname, ".env") });

async function resetAdminPassword() {
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
    console.log("Resetting admin password...");

    // Hash the password "admin123"
    const hashedPassword = await bcrypt.hash("admin123", 10);
    console.log("✓ Password hashed");

    // Update admin user password
    await connection.query(
      "UPDATE users SET password = ? WHERE email = ?",
      [hashedPassword, "admin@crm.com"]
    );

    console.log("✅ Admin password reset successfully");
    console.log("Email: admin@crm.com");
    console.log("Password: admin123");

    // Verify the update
    const [users] = await connection.query(
      "SELECT password FROM users WHERE email = ?",
      ["admin@crm.com"]
    );

    const isMatch = await bcrypt.compare("admin123", users[0].password);
    console.log("Password verification:", isMatch ? "✓ Valid" : "✗ Invalid");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await connection.end();
  }
}

resetAdminPassword();
