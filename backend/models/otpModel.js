const { pool } = require("../config/db");
const { sqlDateTime } = require("../lib/otpPolicy");

async function recentForPhone(phone, sinceMs) {
  const [rows] = await pool.execute(
    `SELECT id, created_at FROM phone_verifications
     WHERE phone_e164 = ? AND created_at >= ?
     ORDER BY id DESC`,
    [phone, sqlDateTime(sinceMs)]
  );
  return rows;
}

async function insertPending({ phone, twilioSid, expiresAtMs }) {
  const [result] = await pool.execute(
    `INSERT INTO phone_verifications (phone_e164, status, twilio_sid, send_count, check_count, expires_at)
     VALUES (?, 'pending', ?, 1, 0, ?)`,
    [phone, twilioSid || null, sqlDateTime(expiresAtMs)]
  );
  return result.insertId;
}

async function latestPending(phone) {
  const [rows] = await pool.execute(
    `SELECT * FROM phone_verifications
     WHERE phone_e164 = ? AND status = 'pending' AND expires_at > UTC_TIMESTAMP()
     ORDER BY id DESC
     LIMIT 1`,
    [phone]
  );
  return rows[0] || null;
}

async function addCheck(id) {
  await pool.execute("UPDATE phone_verifications SET check_count = check_count + 1 WHERE id = ?", [id]);
  const [rows] = await pool.execute("SELECT check_count FROM phone_verifications WHERE id = ?", [id]);
  return Number(rows[0].check_count);
}

async function setStatus(id, status) {
  await pool.execute("UPDATE phone_verifications SET status = ? WHERE id = ?", [status, id]);
}

async function markVerified(id, proofHash, proofExpiresAtMs) {
  const [result] = await pool.execute(
    `UPDATE phone_verifications
     SET status = 'verified', verified_at = UTC_TIMESTAMP(), proof_hash = ?, proof_expires_at = ?
     WHERE id = ? AND status = 'pending'`,
    [proofHash, sqlDateTime(proofExpiresAtMs), id]
  );
  return result.affectedRows === 1;
}

async function lockProof(connection, proofHash) {
  const [rows] = await connection.execute(
    "SELECT * FROM phone_verifications WHERE proof_hash = ? LIMIT 1 FOR UPDATE",
    [proofHash]
  );
  return rows[0] || null;
}

async function attachOrder(connection, id, orderId) {
  await connection.execute(
    "UPDATE phone_verifications SET consumed_at = UTC_TIMESTAMP(), order_id = ? WHERE id = ? AND order_id IS NULL",
    [orderId, id]
  );
}

module.exports = {
  recentForPhone,
  insertPending,
  latestPending,
  addCheck,
  setStatus,
  markVerified,
  lockProof,
  attachOrder,
};
