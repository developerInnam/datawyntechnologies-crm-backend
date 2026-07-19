const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const db = require("./config/db");

// Always load backend/.env explicitly so env vars are available regardless of CWD
// If .env is missing or not readable, you can temporarily point to .env.debug.
dotenv.config({ path: path.join(__dirname, ".env.debug") });

const app = express();

// Middleware
app.use(cors());
const allowedOrigins = [
  // "http://localhost:5173",
  "https://datawyntechnologies-crm-sales.vercel.app", // Production frontend
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (Postman, mobile apps, curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

const PORT = process.env.PORT || 5000;

// Auto-cancel overdue meetings job
async function autoCancelOverdueMeetings() {
  try {
    await db.query(`
      UPDATE activities 
      SET status = 'canceled' 
      WHERE status = 'pending' 
      AND follow_up_date IS NOT NULL 
      AND (
        (meeting_time IS NOT NULL AND CONCAT(follow_up_date, ' ', meeting_time) < NOW())
        OR
        (meeting_time IS NULL AND DATE(follow_up_date) < CURDATE())
      )
    `);
    console.log("Auto-cancel job: Overdue meetings canceled successfully");
  } catch (error) {
    console.error("Auto-cancel job error:", error);
  }
}

// Run auto-cancel job every hour (3600000 ms)
const AUTO_CANCEL_INTERVAL = 3600000; // 1 hour
setInterval(autoCancelOverdueMeetings, AUTO_CANCEL_INTERVAL);

// Run once on server startup
autoCancelOverdueMeetings();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(
    `Auto-cancel job scheduled to run every ${AUTO_CANCEL_INTERVAL / 60000} minutes`,
  );
});
