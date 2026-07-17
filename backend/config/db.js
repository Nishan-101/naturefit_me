const mysql = require("mysql2/promise");
require("dotenv").config();

// Connection pool to the MySQL database hosted on Clever Cloud.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

/**
 * Ensures the `contact_messages` table exists.
 * Safe to call on every server start (CREATE TABLE IF NOT EXISTS).
 */
async function initDatabase() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      email VARCHAR(150) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      subject VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  const connection = await pool.getConnection();
  try {
    await connection.query(createTableQuery);
    console.log("✅ MySQL: contact_messages table ready");
  } finally {
    connection.release();
  }
}

async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    console.log("✅ MySQL: connected to Clever Cloud database");
  } finally {
    connection.release();
  }
}

module.exports = { pool, initDatabase, testConnection };
