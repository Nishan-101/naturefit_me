require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { initDatabase, testConnection } = require("./config/db");
const { verifyMailer } = require("./config/mailer");
const contactRoutes = require("./routes/contactRoutes");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;

app.set("trust proxy", 1);
/* ---------------- Security & core middleware ---------------- */
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

/* ---------------- CORS ----------------
   Only the origins listed in CLIENT_ORIGIN (comma-separated) are allowed —
   this should include your Vercel-deployed frontend URL(s).
*/
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (curl, mobile apps, server-to-server, health checks)
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

/* ---------------- Routes ---------------- */
app.get("/", (req, res) => {
  res.json({ success: true, message: "Nature Fit Restaurant API is running." });
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/contact", contactRoutes);

/* ---------------- 404 + Error handling ---------------- */
app.use(notFoundHandler);
app.use(errorHandler);

/* ---------------- Start server ---------------- */
async function start() {
  try {
    await testConnection();
    await initDatabase();
    await verifyMailer();

    app.listen(PORT, () => {
      console.log(`🚀 Nature Fit Restaurant API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

start();
