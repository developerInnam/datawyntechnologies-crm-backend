const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const db = require("./config/db");

require("dotenv").config();

const app = express();

// Middleware

const allowedOrigins = [
  "http://localhost:5173",
  "https://datawyntechnologies-crm-sales.vercel.app",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/test-db", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT NOW() AS currentTime");

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
      code: err.code,
    });
  }
});

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/roles", require("./routes/roles"));
app.use("/api/permissions", require("./routes/permissions"));
app.use("/api/industries", require("./routes/industries"));
app.use("/api/activity-types", require("./routes/activityTypes"));
app.use("/api/call-status", require("./routes/callStatus"));
app.use("/api/users", require("./routes/users"));
app.use("/api/clients", require("./routes/clients"));
app.use("/api/projects", require("./routes/projects"));
app.use("/api/activities", require("./routes/activities"));
app.use("/api/notes", require("./routes/notes"));
app.use("/api/permission-requests", require("./routes/permissionRequests"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/notifications", require("./routes/notificationsStream"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/dashboard", require("./routes/dashboardOverviewDonut"));
app.use("/api/themes", require("./routes/themes"));
app.use("/api/custom-fields", require("./routes/customFields"));
app.use("/api/services", require("./routes/services"));

// Root route
app.get("/", (req, res) => {
  res.json({ message: "CRM System API" });
});

// Export for Vercel serverless
module.exports = app;
