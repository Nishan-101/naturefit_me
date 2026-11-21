const crypto = require("crypto");

function stripeMode(secretKey = process.env.STRIPE_SECRET_KEY || "") {
  if (secretKey.startsWith("sk_live_")) return "stripe_live";
  if (secretKey.startsWith("sk_test_")) return "stripe_test";
  return "not_configured";
}

function checkoutGate({ secretKey, webhookSecret, liveEnabled = false }) {
  const mode = stripeMode(secretKey);
  if (mode === "not_configured") {
    return {
      ok: false,
      statusCode: 503,
      message: "Online payment is not configured. Add the Stripe test secret key on the server. No card was charged.",
    };
  }
  if (mode === "stripe_live" && liveEnabled !== true) {
    return {
      ok: false,
      statusCode: 503,
      message: "Live payments are switched off. Use the Stripe test secret key until testing is complete. No card was charged.",
    };
  }
  if (!webhookSecret) {
    return {
      ok: false,
      statusCode: 503,
      message: "The Stripe webhook secret is missing, so a payment cannot be verified. No checkout was started.",
    };
  }
  return { ok: true, mode };
}

function verifyStripeSignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!rawBody || !header || !secret) return false;
  const parts = {};
  String(header)
    .split(",")
    .forEach((piece) => {
      const index = piece.indexOf("=");
      if (index === -1) return;
      parts[piece.slice(0, index).trim()] = piece.slice(index + 1).trim();
    });
  if (!parts.t || !parts.v1) return false;
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
  const prefix = Buffer.from(`${parts.t}.`);
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const expected = crypto.createHmac("sha256", secret).update(Buffer.concat([prefix, body])).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(parts.v1);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function createCheckoutSession({
  secretKey,
  reference,
  amountFils,
  successUrl,
  cancelUrl,
  customerEmail,
  idempotencyKey,
  productName,
  fetchImpl,
}) {
  const gate = checkoutGate({
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    liveEnabled: process.env.STRIPE_LIVE_ENABLED === "true",
  });
  if (!gate.ok) {
    const error = new Error(gate.message);
    error.statusCode = gate.statusCode;
    throw error;
  }
  if (!Number.isInteger(amountFils) || amountFils <= 0) {
    const error = new Error("The package price could not be charged.");
    error.statusCode = 400;
    throw error;
  }

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);
  body.set("client_reference_id", reference);
  body.set("metadata[orderReference]", reference);
  body.set("payment_intent_data[metadata][orderReference]", reference);
  body.set("line_items[0][quantity]", "1");
  body.set("adaptive_pricing[enabled]", "false");
  body.set("line_items[0][price_data][currency]", "aed");
  body.set("line_items[0][price_data][unit_amount]", String(amountFils));
  body.set(
    "line_items[0][price_data][product_data][name]",
    productName || `Nature Fit meal plan ${reference}`
  );
  // Payment methods come from the Stripe Dashboard. Checkout Sessions reject
  // payment_method_types, and automatic_payment_methods is not a session field.
  body.set("payment_method_options[card][request_three_d_secure]", "automatic");
  if (customerEmail) body.set("customer_email", customerEmail);

  const doFetch = fetchImpl || fetch;
  const response = await doFetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error && payload.error.message ? payload.error.message : "Stripe could not start checkout.";
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }
  return { id: payload.id, url: payload.url };
}

async function retrieveCheckoutSession({ secretKey, sessionId, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  const response = await doFetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error && payload.error.message ? payload.error.message : "Stripe could not open the payment page.";
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }
  return {
    id: payload.id,
    url: payload.url,
    status: payload.status,
    paymentStatus: payload.payment_status,
    amountTotal: payload.amount_total,
    currency: payload.currency,
  };
}

module.exports = { stripeMode, checkoutGate, verifyStripeSignature, createCheckoutSession, retrieveCheckoutSession };
