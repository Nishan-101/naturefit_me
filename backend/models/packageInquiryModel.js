const crypto = require("crypto");
const { pool } = require("../config/db");
const { DAY_NAMES } = require("../config/plans");

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function dateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function inquiryReference() {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");
  return `NQ-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function shapeInquiry(row) {
  if (!row) return null;
  const days = parseJson(row.delivery_days, []);
  return {
    id: row.id,
    reference: row.reference,
    customerId: row.customer_id,
    planSlug: row.plan_slug,
    planName: row.plan_name,
    mealsPerDay: Number(row.meals_per_day),
    durationDays: Number(row.duration_days),
    days,
    dayLabels: days.map((day) => DAY_NAMES[day] || day),
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    addressLine: row.address_line,
    instructions: row.instructions,
    totalAed: row.total_aed == null ? null : Number(row.total_aed),
    currency: row.currency || "AED",
    requestType: row.request_type || "inquiry",
    paymentStatus: row.payment_status || "unpaid",
    status: row.status,
    emailSent: Boolean(row.email_sent),
    createdAt: row.created_at,
    customerName: row.full_name || null,
    customerPhone: row.phone_e164 || null,
    customerEmail: row.email || null,
  };
}

const INQUIRY_SELECT = `SELECT i.*, c.full_name, c.phone_e164, c.email
  FROM package_inquiries i
  JOIN customers c ON c.id = i.customer_id`;

async function findById(id) {
  const [rows] = await pool.execute(`${INQUIRY_SELECT} WHERE i.id = ? LIMIT 1`, [id]);
  return shapeInquiry(rows[0]);
}

async function findByReference(reference) {
  const [rows] = await pool.execute(`${INQUIRY_SELECT} WHERE i.reference = ? LIMIT 1`, [reference]);
  return shapeInquiry(rows[0]);
}

async function findOpenDuplicate({ customerId, planSlug, mealsPerDay, durationDays, startDate, days, addressLine, instructions, totalAed }) {
  const [rows] = await pool.execute(
    `${INQUIRY_SELECT}
     WHERE i.customer_id = ? AND i.plan_slug = ? AND i.meals_per_day = ? AND i.duration_days = ?
       AND i.start_date = ? AND i.delivery_days = ? AND i.address_line = ? AND i.total_aed = ?
       AND i.instructions <=> ?
       AND i.request_type = 'inquiry' AND i.payment_status = 'unpaid'
       AND i.status IN ('new', 'reviewing')
       AND i.created_at > (NOW() - INTERVAL 15 MINUTE)
     ORDER BY i.id DESC
     LIMIT 1`,
    [
      customerId,
      planSlug,
      mealsPerDay,
      durationDays,
      startDate,
      JSON.stringify(days),
      addressLine,
      totalAed,
      instructions || null,
    ]
  );
  return shapeInquiry(rows[0]);
}

async function createInquiry(input) {
  const days = JSON.stringify(input.days);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reference = inquiryReference();
    try {
      const [result] = await pool.execute(
        `INSERT INTO package_inquiries (
          reference, customer_id, plan_slug, plan_name, meals_per_day, duration_days, delivery_days,
          start_date, end_date, address_line, instructions, total_aed, currency, request_type, payment_status, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AED', 'inquiry', 'unpaid', 'new')`,
        [
          reference,
          input.customerId,
          input.planSlug,
          input.planName,
          input.mealsPerDay,
          input.durationDays,
          days,
          input.startDate,
          input.endDate || null,
          input.addressLine,
          input.instructions || null,
          input.totalAed,
        ]
      );
      return findById(result.insertId);
    } catch (error) {
      lastError = error;
      if (!error || error.code !== "ER_DUP_ENTRY") throw error;
    }
  }
  throw lastError;
}

async function markEmailed(id, sent) {
  await pool.execute("UPDATE package_inquiries SET email_sent = ? WHERE id = ?", [sent ? 1 : 0, id]);
}

async function listAll() {
  const [rows] = await pool.execute(`${INQUIRY_SELECT} ORDER BY i.created_at DESC LIMIT 200`);
  return rows.map(shapeInquiry);
}

module.exports = {
  inquiryReference,
  createInquiry,
  findByReference,
  findOpenDuplicate,
  markEmailed,
  listAll,
};
