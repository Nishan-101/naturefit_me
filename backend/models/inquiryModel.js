const { pool } = require("../config/db");
const { DAY_NAMES, MEAL_NAMES } = require("../config/plans");

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function shapeInquiry(row) {
  const meals = parseJson(row.meals, []);
  const days = parseJson(row.days_of_week, []);
  return {
    id: row.id,
    customerId: row.customer_id,
    planName: row.plan_name,
    meals,
    mealLabels: meals.map((id) => MEAL_NAMES[id] || id),
    days,
    dayLabels: days.map((day) => DAY_NAMES[day] || day),
    durationDays: row.duration_days,
    notes: row.notes,
    status: row.status,
    emailSent: Boolean(row.email_sent),
    createdAt: row.created_at,
    customerName: row.full_name || null,
    customerPhone: row.phone_e164 || null,
    customerEmail: row.email || null,
  };
}

async function createInquiry({ customerId, planName, meals, days, durationDays, notes }) {
  const [result] = await pool.execute(
    `INSERT INTO meal_inquiries (customer_id, plan_name, meals, days_of_week, duration_days, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [customerId, planName, JSON.stringify(meals), JSON.stringify(days), durationDays, notes || null]
  );
  return findInquiry(result.insertId);
}

async function findOpenDuplicate({ customerId, planName, meals, days, durationDays }) {
  const [rows] = await pool.execute(
    `SELECT * FROM meal_inquiries
     WHERE customer_id = ? AND plan_name = ? AND meals = ? AND days_of_week = ? AND duration_days = ?
       AND status IN ('new', 'reviewing')
       AND created_at > (NOW() - INTERVAL 15 MINUTE)
     ORDER BY created_at DESC
     LIMIT 1`,
    [customerId, planName, JSON.stringify(meals), JSON.stringify(days), durationDays]
  );
  return rows[0] ? shapeInquiry(rows[0]) : null;
}

async function findInquiry(id) {
  const [rows] = await pool.execute("SELECT * FROM meal_inquiries WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? shapeInquiry(rows[0]) : null;
}

async function markEmailed(id, sent) {
  await pool.execute("UPDATE meal_inquiries SET email_sent = ? WHERE id = ?", [sent ? 1 : 0, id]);
}

async function listForCustomer(customerId) {
  const [rows] = await pool.execute(
    "SELECT * FROM meal_inquiries WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50",
    [customerId]
  );
  return rows.map(shapeInquiry);
}

async function listAll() {
  const [rows] = await pool.execute(
    `SELECT i.*, c.full_name, c.phone_e164, c.email
     FROM meal_inquiries i
     JOIN customers c ON c.id = i.customer_id
     ORDER BY i.created_at DESC
     LIMIT 200`
  );
  return rows.map(shapeInquiry);
}

async function updateStatus(id, status) {
  const [result] = await pool.execute("UPDATE meal_inquiries SET status = ? WHERE id = ?", [status, id]);
  if (!result.affectedRows) return null;
  return findInquiry(id);
}

module.exports = {
  createInquiry,
  findInquiry,
  findOpenDuplicate,
  markEmailed,
  listForCustomer,
  listAll,
  updateStatus,
};
