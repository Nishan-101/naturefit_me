const { pool } = require("../config/db");

/**
 * Inserts a new contact message into the database.
 * @returns {Promise<number>} insertId of the created row
 */
async function createContactMessage({ fullName, email, phone, subject, message, ipAddress }) {
  const [result] = await pool.execute(
    `INSERT INTO contact_messages (full_name, email, phone, subject, message, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fullName, email, phone, subject, message, ipAddress || null]
  );
  return result.insertId;
}

module.exports = { createContactMessage };
