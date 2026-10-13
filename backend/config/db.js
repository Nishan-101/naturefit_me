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
  const statements = [
    `CREATE TABLE IF NOT EXISTS contact_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      email VARCHAR(150) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      subject VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone_e164 VARCHAR(20) NOT NULL UNIQUE,
      full_name VARCHAR(150) NULL,
      email VARCHAR(150) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS customer_profiles (
      customer_id INT PRIMARY KEY,
      age TINYINT UNSIGNED NULL,
      gender VARCHAR(30) NULL,
      height_cm SMALLINT UNSIGNED NULL,
      weight_kg DECIMAL(5,1) NULL,
      target_weight_kg DECIMAL(5,1) NULL,
      activity_level VARCHAR(40) NULL,
      primary_goal VARCHAR(40) NULL,
      extra_goals TEXT NULL,
      allergies TEXT NULL,
      allergy_other VARCHAR(200) NULL,
      diet VARCHAR(40) NULL,
      diet_other VARCHAR(200) NULL,
      dislikes TEXT NULL,
      allergy_ack TINYINT NOT NULL DEFAULT 0,
      completed TINYINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_profile_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS meal_inquiries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT NOT NULL,
      plan_name VARCHAR(80) NOT NULL,
      meals TEXT NOT NULL,
      days_of_week TEXT NOT NULL,
      duration_days INT NOT NULL,
      notes TEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'new',
      email_sent TINYINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_inquiry_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];

  const connection = await pool.getConnection();
  try {
    for (const statement of statements) {
      await connection.query(statement);
    }
    const extraColumns = [
      ["customer_profiles", "calorie_kcal", "INT NULL"],
      ["customer_profiles", "calorie_guidance", "TINYINT NOT NULL DEFAULT 0"],
      ["customer_profiles", "protein_grams", "INT NULL"],
      ["customer_profiles", "protein_guidance", "TINYINT NOT NULL DEFAULT 0"],
      ["customer_profiles", "meals_per_day", "TINYINT UNSIGNED NULL"],
      ["customer_profiles", "preferred_duration", "INT NULL"],
      ["customer_profiles", "delivery_address", "VARCHAR(300) NULL"],
      ["customer_profiles", "delivery_instructions", "VARCHAR(500) NULL"],
    ];
    for (const [table, column, definition] of extraColumns) {
      const [rows] = await connection.execute(
        `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
      );
      if (!Number(rows[0].total)) {
        await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      }
    }
    const [indexRows] = await connection.execute(
      `SELECT COUNT(*) AS total FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meal_inquiries' AND INDEX_NAME = 'idx_inquiries_customer_created'`
    );
    if (!Number(indexRows[0].total)) {
      await connection.query(
        "CREATE INDEX idx_inquiries_customer_created ON meal_inquiries (customer_id, created_at)"
      );
    }
    console.log("✅ MySQL: contact, customer, profile, and inquiry tables ready");
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
