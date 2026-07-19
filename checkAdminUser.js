const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

dotenv.config({ path: require("path").join(__dirname, ".env") });

async function checkAdminUser() {
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
    console.log("Checking admin user...");

    const [users] = await connection.query(
      "SELECT id, name, email, role_id, status FROM users WHERE email = ?",
      ["admin@crm.com"]
    );

    if (users.length === 0) {
      console.log("❌ Admin user not found in database");
      console.log("Creating admin user...");

      // Check if Admin role exists
      const [roles] = await connection.query("SELECT id FROM roles WHERE name = ?", ["Admin"]);
      let roleId;

      if (roles.length === 0) {
        const [result] = await connection.query("INSERT INTO roles (name) VALUES (?)", ["Admin"]);
        roleId = result.insertId;
        console.log("✓ Created Admin role with ID:", roleId);
      } else {
        roleId = roles[0].id;
        console.log("✓ Admin role exists with ID:", roleId);
      }

      // Hash password
      const hashedPassword = await bcrypt.hash("admin123", 10);
      console.log("✓ Password hashed");

      // Insert admin user
      const [result] = await connection.query(
        "INSERT INTO users (name, email, phone, password, role_id, status) VALUES (?, ?, ?, ?, ?, ?)",
        ["Admin User", "admin@crm.com", "1234567890", hashedPassword, roleId, "active"]
      );

      console.log("✅ Admin user created with ID:", result.insertId);
      console.log("Email: admin@crm.com");
      console.log("Password: admin123");
    } else {
      console.log("✓ Admin user found:", users[0]);
      console.log("Status:", users[0].status);
      console.log("Role ID:", users[0].role_id);

      // Test password verification
      const [userWithPassword] = await connection.query(
        "SELECT password FROM users WHERE email = ?",
        ["admin@crm.com"]
      );

      const isMatch = await bcrypt.compare("admin123", userWithPassword[0].password);
      console.log("Password verification for 'admin123':", isMatch ? "✓ Valid" : "✗ Invalid");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await connection.end();
  }
}

checkAdminUser();
