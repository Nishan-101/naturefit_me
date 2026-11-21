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

function shapeOrder(row) {
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
    deliverySlotId: row.delivery_slot_id,
    deliverySlotLabel: row.delivery_slot_label,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    addressLine: row.address_line,
    emirate: row.emirate,
    area: row.area,
    building: row.building,
    instructions: row.instructions,
    allergies: row.allergies,
    menuItemIds: parseJson(row.menu_item_ids, []),
    addOnIds: parseJson(row.add_on_ids, []),
    promoCode: row.promo_code,
    subtotalAed: row.subtotal_aed == null ? null : Number(row.subtotal_aed),
    discountAed: Number(row.discount_aed || 0),
    deliveryFeeAed: Number(row.delivery_fee_aed || 0),
    totalAed: row.total_aed == null ? null : Number(row.total_aed),
    currency: row.currency || "AED",
    priceStatus: row.price_status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
    privacyConsent: Boolean(row.privacy_consent),
    whatsappOptIn: Boolean(row.whatsapp_opt_in),
    whatsappClickUrl: row.whatsapp_click_url,
    calorieLabel: row.calorie_label,
    emailSent: Boolean(row.email_sent),
    createdAt: row.created_at,
    customerName: row.full_name || null,
    customerPhone: row.phone_e164 || null,
    customerEmail: row.email || null,
    paymentReference: row.paid_ref || null,
    subscriptionId: row.subscription_id || null,
    subscriptionStatus: row.subscription_status || null,
  };
}

function orderReference() {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");
  return `NF-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function findByReference(reference) {
  const [rows] = await pool.execute(
    `SELECT o.*, c.full_name, c.phone_e164, c.email, s.id AS subscription_id, s.status AS subscription_status
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN subscriptions s ON s.order_id = o.id
     WHERE o.reference = ? LIMIT 1`,
    [reference]
  );
  return shapeOrder(rows[0]);
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT o.*, c.full_name, c.phone_e164, c.email, s.id AS subscription_id, s.status AS subscription_status
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN subscriptions s ON s.order_id = o.id
     WHERE o.id = ? LIMIT 1`,
    [id]
  );
  return shapeOrder(rows[0]);
}

async function findRecentDuplicate({ customerId, planSlug, mealsPerDay, durationDays, startDate }) {
  const [rows] = await pool.execute(
    `SELECT o.*, c.full_name, c.phone_e164, c.email, s.id AS subscription_id, s.status AS subscription_status
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN subscriptions s ON s.order_id = o.id
     WHERE o.customer_id = ? AND o.plan_slug = ? AND o.meals_per_day = ? AND o.duration_days = ? AND o.start_date = ?
       AND o.order_status NOT IN ('rejected', 'cancelled')
       AND o.created_at > (NOW() - INTERVAL 2 MINUTE)
     ORDER BY o.id DESC
     LIMIT 1`,
    [customerId, planSlug, mealsPerDay, durationDays, startDate]
  );
  return shapeOrder(rows[0]);
}

async function createOrder(input) {
  const reference = orderReference();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO orders (
        reference, customer_id, plan_slug, plan_name, meals_per_day, duration_days, delivery_days,
        delivery_slot_id, delivery_slot_label, start_date, address_line, emirate, area, building,
        instructions, allergies, menu_item_ids, add_on_ids, promo_code, subtotal_aed, discount_aed,
        delivery_fee_aed, total_aed, price_status, payment_method, payment_status, order_status,
        privacy_consent, whatsapp_opt_in, calorie_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reference,
        input.customerId,
        input.planSlug,
        input.planName,
        input.mealsPerDay,
        input.durationDays,
        JSON.stringify(input.days),
        input.deliverySlotId,
        input.deliverySlotLabel,
        input.startDate,
        input.addressLine,
        input.emirate,
        input.area,
        input.building,
        input.instructions || null,
        input.allergies || null,
        JSON.stringify(input.menuItemIds || []),
        JSON.stringify(input.addOnIds || []),
        input.promoCode || null,
        input.subtotalAed,
        input.discountAed || 0,
        input.deliveryFeeAed || 0,
        input.totalAed,
        input.priceStatus,
        input.paymentMethod,
        input.paymentStatus,
        input.orderStatus,
        input.privacyConsent ? 1 : 0,
        input.whatsappOptIn ? 1 : 0,
        input.calorieLabel,
      ]
    );
    await connection.execute(
      `INSERT INTO subscriptions (order_id, customer_id, status, start_date) VALUES (?, ?, 'inactive', ?)`,
      [result.insertId, input.customerId, input.startDate]
    );
    if (input.promoId) {
      const [promo] = await connection.execute("SELECT uses, max_uses, active FROM promo_codes WHERE id = ? FOR UPDATE", [
        input.promoId,
      ]);
      const row = promo[0];
      if (!row || !row.active || (row.max_uses != null && Number(row.uses) >= Number(row.max_uses))) {
        const error = new Error("That promotional code is no longer available.");
        error.statusCode = 400;
        throw error;
      }
      await connection.execute("UPDATE promo_codes SET uses = uses + 1 WHERE id = ?", [input.promoId]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return findByReference(reference);
}

async function listForCustomer(customerId) {
  const [rows] = await pool.execute(
    `SELECT o.*, c.full_name, c.phone_e164, c.email, s.id AS subscription_id, s.status AS subscription_status
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN subscriptions s ON s.order_id = o.id
     WHERE o.customer_id = ?
     ORDER BY o.id DESC
     LIMIT 50`,
    [customerId]
  );
  return rows.map(shapeOrder);
}

async function listAll() {
  const [rows] = await pool.execute(
    `SELECT o.*, c.full_name, c.phone_e164, c.email, s.id AS subscription_id, s.status AS subscription_status,
            (SELECT p.provider_ref FROM payments p WHERE p.order_id = o.id AND p.status = 'paid' ORDER BY p.id DESC LIMIT 1) AS paid_ref
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN subscriptions s ON s.order_id = o.id
     ORDER BY o.id DESC
     LIMIT 300`
  );
  return rows.map(shapeOrder);
}

async function setWhatsappLink(orderId, url) {
  await pool.execute("UPDATE orders SET whatsapp_click_url = ? WHERE id = ?", [url, orderId]);
}

async function markEmailed(orderId, sent) {
  await pool.execute("UPDATE orders SET email_sent = ? WHERE id = ?", [sent ? 1 : 0, orderId]);
}

async function updatePaymentState(orderId, paymentStatus, orderStatus) {
  await pool.execute("UPDATE orders SET payment_status = ?, order_status = ? WHERE id = ?", [
    paymentStatus,
    orderStatus,
    orderId,
  ]);
}

async function updateAddress(orderId, fields) {
  await pool.execute(
    `UPDATE orders SET address_line = ?, emirate = ?, area = ?, building = ?, instructions = ? WHERE id = ?`,
    [fields.addressLine, fields.emirate, fields.area, fields.building, fields.instructions || null, orderId]
  );
}

async function setOrderStatus(orderId, orderStatus) {
  await pool.execute("UPDATE orders SET order_status = ? WHERE id = ?", [orderStatus, orderId]);
}

function mapPayment(row) {
  return {
    id: row.id,
    provider: row.provider,
    method: row.method,
    amountAed: Number(row.amount_aed),
    currency: row.currency,
    status: row.status,
    providerRef: row.provider_ref,
    checkoutSessionId: row.checkout_session_id || null,
    createdAt: row.created_at,
  };
}

async function insertPayment({ orderId, provider, method, amountAed, status, providerRef }) {
  const [result] = await pool.execute(
    `INSERT INTO payments (order_id, provider, method, amount_aed, currency, status, provider_ref)
     VALUES (?, ?, ?, ?, 'AED', ?, ?)`,
    [orderId, provider, method, amountAed, status, providerRef || null]
  );
  return result.insertId;
}

async function insertPaymentOn(connection, input) {
  const [result] = await connection.execute(
    `INSERT INTO payments (order_id, provider, method, amount_aed, currency, status, provider_ref)
     VALUES (?, ?, ?, ?, 'AED', ?, ?)`,
    [input.orderId, input.provider, input.method, input.amountAed, input.status, input.providerRef || null]
  );
  return result.insertId;
}

async function paymentsForOrder(orderId) {
  const [rows] = await pool.execute("SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC", [orderId]);
  return rows.map(mapPayment);
}

async function paymentsForUpdate(connection, orderId) {
  await connection.execute("SELECT id FROM orders WHERE id = ? FOR UPDATE", [orderId]);
  const [rows] = await connection.execute("SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC", [orderId]);
  return rows.map(mapPayment);
}

async function setPackageTotal(orderId, amountAed) {
  const [result] = await pool.execute(
    `UPDATE orders
     SET subtotal_aed = ?, discount_aed = 0, delivery_fee_aed = 0, total_aed = ?, price_status = 'priced'
     WHERE id = ? AND payment_status <> 'paid'`,
    [amountAed, amountAed, orderId]
  );
  return result.affectedRows;
}

async function paymentsForCustomer(customerId) {
  const [rows] = await pool.execute(
    `SELECT p.*, o.reference FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE o.customer_id = ?
     ORDER BY p.id DESC
     LIMIT 50`,
    [customerId]
  );
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    provider: row.provider,
    method: row.method,
    amountAed: Number(row.amount_aed),
    currency: row.currency,
    status: row.status,
    providerRef: row.provider_ref,
    createdAt: row.created_at,
  }));
}

async function updatePaymentByRef(providerRef, status) {
  await pool.execute("UPDATE payments SET status = ? WHERE provider_ref = ?", [status, providerRef]);
}

async function updatePayment(id, { status, providerRef }) {
  await pool.execute("UPDATE payments SET status = ?, provider_ref = ? WHERE id = ?", [status, providerRef || null, id]);
}

async function updatePaymentOn(connection, id, { status, providerRef }) {
  await connection.execute("UPDATE payments SET status = ?, provider_ref = ? WHERE id = ?", [
    status,
    providerRef || null,
    id,
  ]);
}

async function rememberCheckoutSession(id, sessionId) {
  if (!id || !sessionId) return 0;
  const [result] = await pool.execute(
    `UPDATE payments
     SET checkout_session_id = ?
     WHERE id = ? AND (checkout_session_id IS NULL OR checkout_session_id = '')`,
    [sessionId, id]
  );
  return result.affectedRows;
}

async function rememberCheckoutSessionByRef(providerRef, sessionId) {
  if (!providerRef || !sessionId) return 0;
  const [result] = await pool.execute(
    `UPDATE payments
     SET checkout_session_id = ?
     WHERE provider_ref = ? AND (checkout_session_id IS NULL OR checkout_session_id = '')`,
    [sessionId, providerRef]
  );
  return result.affectedRows;
}

async function replaceProviderRef(currentRef, nextRef) {
  if (!currentRef || !nextRef || currentRef === nextRef) return 0;
  const [result] = await pool.execute("UPDATE payments SET provider_ref = ? WHERE provider_ref = ?", [nextRef, currentRef]);
  return result.affectedRows;
}

async function findPaymentByRef(providerRef) {
  const [rows] = await pool.execute("SELECT * FROM payments WHERE provider_ref = ? LIMIT 1", [providerRef]);
  return rows[0] || null;
}

async function subscriptionById(id) {
  const [rows] = await pool.execute(
    `SELECT s.*, o.reference, o.duration_days, o.delivery_days, o.customer_id AS owner_id, o.payment_status, o.order_status
     FROM subscriptions s
     JOIN orders o ON o.id = s.order_id
     WHERE s.id = ? LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    customerId: row.customer_id,
    status: row.status,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    reference: row.reference,
    durationDays: Number(row.duration_days),
    days: parseJson(row.delivery_days, []),
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
  };
}

async function setSubscription(id, status, endDate) {
  await pool.execute("UPDATE subscriptions SET status = ?, end_date = ? WHERE id = ?", [status, endDate, id]);
  await pool.execute("UPDATE orders o JOIN subscriptions s ON s.order_id = o.id SET o.end_date = ? WHERE s.id = ?", [
    endDate,
    id,
  ]);
}

async function deliveriesFor(subscriptionId) {
  const [rows] = await pool.execute(
    "SELECT id, delivery_date, status FROM deliveries WHERE subscription_id = ? ORDER BY delivery_date",
    [subscriptionId]
  );
  return rows.map((row) => ({ id: row.id, date: dateOnly(row.delivery_date), status: row.status }));
}

async function applyDeliveryActions(subscriptionId, actions) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const action of actions) {
      if (action.type === "delete") {
        await connection.execute("DELETE FROM deliveries WHERE id = ? AND subscription_id = ? AND status <> 'delivered'", [
          action.id,
          subscriptionId,
        ]);
      } else if (action.type === "update") {
        await connection.execute("UPDATE deliveries SET status = ? WHERE id = ? AND subscription_id = ?", [
          action.status,
          action.id,
          subscriptionId,
        ]);
      } else if (action.type === "insert") {
        await connection.execute(
          "INSERT IGNORE INTO deliveries (subscription_id, delivery_date, status) VALUES (?, ?, ?)",
          [subscriptionId, action.date, action.status]
        );
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createPause({ subscriptionId, customerId, requestType, startDate, endDate, reason }) {
  const [result] = await pool.execute(
    `INSERT INTO pause_requests (subscription_id, customer_id, request_type, start_date, end_date, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [subscriptionId, customerId, requestType, startDate, endDate, reason || null]
  );
  return result.insertId;
}

async function pauseRequests({ subscriptionId, status } = {}) {
  const clauses = [];
  const params = [];
  if (subscriptionId) {
    clauses.push("subscription_id = ?");
    params.push(subscriptionId);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [rows] = await pool.execute(
    `SELECT * FROM pause_requests ${where} ORDER BY id DESC LIMIT 200`,
    params
  );
  return rows.map((row) => ({
    id: row.id,
    subscriptionId: row.subscription_id,
    customerId: row.customer_id,
    requestType: row.request_type,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  }));
}

async function findPause(id) {
  const [rows] = await pool.execute("SELECT * FROM pause_requests WHERE id = ? LIMIT 1", [id]);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    customerId: row.customer_id,
    requestType: row.request_type,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    reason: row.reason,
    status: row.status,
  };
}

async function setPauseStatus(id, status) {
  await pool.execute("UPDATE pause_requests SET status = ? WHERE id = ?", [status, id]);
}

async function approvedPauses(subscriptionId) {
  const rows = await pauseRequests({ subscriptionId, status: "approved" });
  return rows.filter((row) => row.requestType === "pause").map((row) => ({ startDate: row.startDate, endDate: row.endDate }));
}

async function scheduleForDate(date) {
  const [rows] = await pool.execute(
    `SELECT d.delivery_date, d.status, o.reference, o.plan_name, o.address_line, o.area, o.building,
            o.delivery_slot_label, o.instructions, c.full_name, c.phone_e164
     FROM deliveries d
     JOIN subscriptions s ON s.id = d.subscription_id
     JOIN orders o ON o.id = s.order_id
     JOIN customers c ON c.id = o.customer_id
     WHERE d.delivery_date = ? AND s.status IN ('active', 'paused')
     ORDER BY o.delivery_slot_label, c.full_name`,
    [date]
  );
  return rows.map((row) => ({
    date: dateOnly(row.delivery_date),
    status: row.status,
    reference: row.reference,
    planName: row.plan_name,
    address: row.address_line,
    area: row.area,
    building: row.building,
    slot: row.delivery_slot_label,
    instructions: row.instructions,
    customerName: row.full_name,
    phone: row.phone_e164,
  }));
}

async function claimWhatsappLog({ orderId, direction, status, recipient, bodyPreview }) {
  try {
    await pool.execute(
      `INSERT INTO whatsapp_logs (order_id, direction, status, recipient, body_preview) VALUES (?, ?, ?, ?, ?)`,
      [orderId, direction, status, recipient || null, (bodyPreview || "").slice(0, 500)]
    );
    return true;
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") return false;
    throw error;
  }
}

async function claimStripeEvent(eventId, eventType, reference) {
  const id = String(eventId || "").trim();
  if (!id) return false;
  try {
    const [result] = await pool.execute(
      `INSERT INTO stripe_events (event_id, event_type, order_reference) VALUES (?, ?, ?)`,
      [id.slice(0, 255), String(eventType || "").slice(0, 80), reference || null]
    );
    return result.affectedRows === 1;
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") return false;
    throw error;
  }
}

async function releaseStripeEvent(eventId) {
  const id = String(eventId || "").trim();
  if (!id) return 0;
  const [result] = await pool.execute("DELETE FROM stripe_events WHERE event_id = ?", [id.slice(0, 255)]);
  return result.affectedRows;
}

async function finishWhatsappLog({ orderId, direction, status, providerMessageId, errorMessage }) {
  await pool.execute(
    `UPDATE whatsapp_logs
     SET status = ?, provider_message_id = ?, error_message = ?
     WHERE order_id = ? AND direction = ?`,
    [status, providerMessageId || null, errorMessage || null, orderId, direction]
  );
}

module.exports = {
  findByReference,
  findById,
  findRecentDuplicate,
  createOrder,
  listForCustomer,
  listAll,
  setWhatsappLink,
  markEmailed,
  updatePaymentState,
  updateAddress,
  setOrderStatus,
  insertPayment,
  insertPaymentOn,
  paymentsForOrder,
  paymentsForUpdate,
  setPackageTotal,
  paymentsForCustomer,
  updatePaymentByRef,
  updatePayment,
  updatePaymentOn,
  rememberCheckoutSession,
  rememberCheckoutSessionByRef,
  replaceProviderRef,
  findPaymentByRef,
  subscriptionById,
  setSubscription,
  deliveriesFor,
  applyDeliveryActions,
  createPause,
  pauseRequests,
  findPause,
  setPauseStatus,
  approvedPauses,
  scheduleForDate,
  claimWhatsappLog,
  finishWhatsappLog,
  claimStripeEvent,
  releaseStripeEvent,
};
