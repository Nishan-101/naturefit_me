const crypto = require("crypto");
const { pool } = require("../config/db");
const { httpError } = require("../config/session");
const { findPackage, listPackages, MIN_DAYS, MAX_DAYS, ANCHOR_DAYS } = require("../config/packagePrices");
const { displayAed, toFils } = require("../lib/money");
const { DAY_NAMES, earliestDeliveryDate, parseISODate, buildDeliveryDates } = require("../lib/schedule");
const {
  OTP_TTL_MS,
  PROOF_TTL_MS,
  SEND_WINDOW_MS,
  sendAllowed,
  checkAllowed,
  publicOtpError,
  parseSqlUtc,
  packageOtpRequired,
} = require("../lib/otpPolicy");
const { validatePackageOrder, readDeliveryDays, INQUIRY_CONFIRMATION } = require("../lib/packageOrder");
const { normalizePhone } = require("../lib/phone");
const { isUaeMobile } = require("../lib/orderRules");
const { twilioConfig, createVerification, checkVerification } = require("../lib/twilioVerify");
const { publicSiteOrigin } = require("../lib/runtimeIsolation");
const { stripeMode, checkoutGate, createCheckoutSession, retrieveCheckoutSession } = require("../lib/stripe");
const { businessChatLink, inquiryChatMessage } = require("../lib/whatsapp");
const { sendPackageInquiryNotification } = require("../config/mailer");
const catalogModel = require("../models/catalogModel");
const customers = require("../models/customerModel");
const orders = require("../models/orderModel");
const otpModel = require("../models/otpModel");
const packageInquiries = require("../models/packageInquiryModel");

function hashProof(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function siteOrigin(req) {
  const host = req && req.get ? req.get("host") : "";
  if (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `${req.protocol}://${host}`;
  const origin = publicSiteOrigin();
  if (!origin) throw httpError(503, "Staging checkout cannot return customers to the live website.");
  return origin;
}

function otpRequiredNow() {
  return packageOtpRequired({
    nodeEnv: process.env.NODE_ENV,
    appEnv: process.env.APP_ENV,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    liveEnabled: process.env.STRIPE_LIVE_ENABLED,
    stagingOtpOptional: process.env.STAGING_OTP_OPTIONAL,
    publicSiteUrl: process.env.PUBLIC_SITE_URL,
    clientOrigin: process.env.CLIENT_ORIGIN,
    dbHost: process.env.DB_HOST,
    dbName: process.env.DB_NAME,
    dbUser: process.env.DB_USER,
    dbPassword: process.env.DB_PASSWORD,
    stagingDbAddon: process.env.STAGING_DB_ADDON,
    stagingDbHost: process.env.STAGING_DB_HOST,
    stagingDbName: process.env.STAGING_DB_NAME,
    stagingDbUser: process.env.STAGING_DB_USER,
    productionDbHost: process.env.PRODUCTION_DB_HOST,
    productionDbName: process.env.PRODUCTION_DB_NAME,
    productionDbUser: process.env.PRODUCTION_DB_USER,
    productionDbPassword: process.env.PRODUCTION_DB_PASSWORD,
    twilioConfigured: twilioConfig().configured,
  });
}

async function earliestStart() {
  const settings = await catalogModel.getSettings();
  return earliestDeliveryDate(new Date(), settings.cutoffTime, settings.cutoffLeadDays);
}

async function catalog(req, res, next) {
  try {
    const twilio = twilioConfig();
    const mode = stripeMode();
    res.json({
      success: true,
      currency: "AED",
      minDays: MIN_DAYS,
      maxDays: MAX_DAYS,
      anchors: ANCHOR_DAYS.slice(),
      weekdays: DAY_NAMES.map((name, index) => ({ day: index, name })),
      earliestStartDate: await earliestStart(),
      otpConfigured: twilio.configured,
      otpRequired: otpRequiredNow(),
      paymentMode: mode,
      plans: listPackages(),
    });
  } catch (error) {
    next(error);
  }
}

async function quote(req, res, next) {
  try {
    const body = req.body || {};
    const selected = findPackage(body.plan, body.mealsPerDay, body.duration);
    if (!selected) throw httpError(400, "Choose a meal plan, meals per day, and a length from 1 to 28 days.");
    const earliest = await earliestStart();
    let deliveryDays = null;
    let dayLabels = [];
    let endDate = null;
    if (body.deliveryDays != null || body.startDate) {
      deliveryDays = readDeliveryDays(body.deliveryDays);
      const startDate = parseISODate(body.startDate);
      if (!deliveryDays) throw httpError(400, "Choose at least one delivery day. All seven days can be selected.");
      if (!startDate) throw httpError(400, "Choose a delivery start date.");
      const dates = buildDeliveryDates(body.startDate, deliveryDays, selected.durationDays, []);
      if (dates.length !== selected.durationDays) throw httpError(400, "The delivery schedule could not be calculated.");
      dayLabels = deliveryDays.map((day) => DAY_NAMES[day]);
      endDate = dates[dates.length - 1];
    }
    res.json({
      success: true,
      currency: "AED",
      plan: selected.planName,
      mealsPerDay: selected.mealsPerDay,
      durationDays: selected.durationDays,
      calorieLabel: selected.calorieLabel,
      amountAed: selected.priceAed,
      totalLabel: displayAed(selected.priceAed),
      totalMeals: selected.mealsPerDay * selected.durationDays,
      deliveryDays,
      dayLabels,
      endDate,
      earliestStartDate: earliest,
    });
  } catch (error) {
    next(error);
  }
}

function readUaePhone(body) {
  const phone = normalizePhone((body && body.countryCode) || "971", body && body.nationalNumber);
  if (!isUaeMobile(phone)) return null;
  return phone;
}

async function sendOtp(req, res, next) {
  try {
    const phone = readUaePhone(req.body);
    if (!phone) throw httpError(400, "Enter a UAE mobile number.");
    const twilio = twilioConfig();
    if (!twilio.configured) {
      throw httpError(
        503,
        "SMS verification is not live yet. Add the Twilio Verify account SID, auth token, and service SID on the server. No code was sent."
      );
    }
    const now = Date.now();
    const recent = await otpModel.recentForPhone(phone, now - SEND_WINDOW_MS);
    const decision = sendAllowed(
      recent.map((row) => parseSqlUtc(row.created_at)),
      now
    );
    if (!decision.ok && decision.code === "cooldown") {
      throw httpError(429, `You can request another code in ${decision.retryAfterSeconds} seconds.`);
    }
    if (!decision.ok) {
      throw httpError(429, "Too many codes were sent to this number. Wait 15 minutes and try again.");
    }
    const result = await createVerification({ ...twilio, to: phone });
    if (!result.ok || result.status !== "pending") {
      const mapped = publicOtpError(result.httpStatus, result.code);
      throw httpError(mapped.statusCode, mapped.message);
    }
    await otpModel.insertPending({ phone, twilioSid: result.sid, expiresAtMs: now + OTP_TTL_MS });
    res.json({
      success: true,
      sent: true,
      expiresInSeconds: Math.round(OTP_TTL_MS / 1000),
      resendAfterSeconds: 60,
    });
  } catch (error) {
    next(error);
  }
}

async function checkOtp(req, res, next) {
  try {
    const phone = readUaePhone(req.body);
    if (!phone) throw httpError(400, "Enter a UAE mobile number.");
    const code = String((req.body && req.body.code) || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) throw httpError(400, "Enter the 6-digit code.");
    const twilio = twilioConfig();
    if (!twilio.configured) {
      throw httpError(503, "SMS verification is not live yet. No code was checked.");
    }
    const pending = await otpModel.latestPending(phone);
    if (!pending) throw httpError(400, "That code has expired. Request a new one.");
    if (!checkAllowed(pending.check_count)) {
      await otpModel.setStatus(pending.id, "locked");
      throw httpError(429, "Too many incorrect codes. Request a new one.");
    }
    const result = await checkVerification({ ...twilio, to: phone, code });
    if (!result.ok) {
      const mapped = publicOtpError(result.httpStatus, result.code);
      if (mapped.statusCode !== 502) {
        const checks = await otpModel.addCheck(pending.id);
        if (checks >= 5) await otpModel.setStatus(pending.id, "locked");
      }
      throw httpError(mapped.statusCode, mapped.message);
    }
    if (result.status !== "approved") {
      const checks = await otpModel.addCheck(pending.id);
      if (checks >= 5) await otpModel.setStatus(pending.id, "locked");
      throw httpError(400, "That code is incorrect.");
    }
    const token = crypto.randomBytes(32).toString("hex");
    const saved = await otpModel.markVerified(pending.id, hashProof(token), Date.now() + PROOF_TTL_MS);
    if (!saved) throw httpError(400, "That code has expired. Request a new one.");
    res.json({
      success: true,
      verified: true,
      verificationToken: token,
      expiresInSeconds: Math.round(PROOF_TTL_MS / 1000),
    });
  } catch (error) {
    next(error);
  }
}

async function attachPackageCustomer(draft, options = {}) {
  const byEmail = await customers.findCustomerByEmail(draft.email);
  const byPhone = await customers.findCustomerByPhone(draft.phone);
  if (byEmail && (!byPhone || byEmail.id !== byPhone.id)) {
    throw httpError(409, "That email is already used by another Nature Fit account. Log in, or contact Nature Fit.");
  }
  if (byPhone && byPhone.email && byPhone.email.toLowerCase() !== draft.email) {
    throw httpError(409, "This mobile number is linked to a different email. Use that email, or contact Nature Fit.");
  }
  const customer = byPhone || (await customers.createCustomer(draft.phone));
  await customers.updateCustomerIdentity(customer.id, draft.fullName, draft.email);
  const saved = await customers.findCustomerById(customer.id);
  const whatsappOptIn = options.preserveWhatsapp ? Boolean(saved && saved.whatsapp_opt_in) : false;
  await customers.setConsent(customer.id, { privacyConsent: true, whatsappOptIn });
  return customers.findCustomerById(customer.id);
}

function sameDayList(left, right) {
  return [...(left || [])].map(Number).sort((a, b) => a - b).join(",") === [...(right || [])].map(Number).sort((a, b) => a - b).join(",");
}

function samePackage(order, draft) {
  return (
    order.planSlug === draft.slug &&
    order.mealsPerDay === draft.mealsPerDay &&
    order.durationDays === draft.durationDays &&
    order.startDate === draft.startDate &&
    sameDayList(order.days, draft.days) &&
    toFils(order.totalAed) === toFils(draft.priceAed)
  );
}

async function prepareCharge(draft, token) {
  const customer = await attachPackageCustomer(draft);
  const connection = await pool.getConnection();
  let order;
  try {
    await connection.beginTransaction();
    const row = token ? await otpModel.lockProof(connection, hashProof(token)) : null;
    if (token) {
      if (!row || row.status !== "verified") throw httpError(400, "Verify your mobile number before payment.");
      if (row.phone_e164 !== draft.phone) throw httpError(400, "Use the same mobile number you verified.");
      if (!(parseSqlUtc(row.proof_expires_at) > Date.now())) {
        throw httpError(400, "The verification expired. Request a new code.");
      }
    }

    if (row && row.order_id) {
      order = await orders.findById(row.order_id);
      if (!order || order.customerId !== customer.id || !samePackage(order, draft)) {
        throw httpError(400, "This verification was already used for a different package. Request a new code.");
      }
    } else {
      const duplicate = await orders.findRecentDuplicate({
        customerId: customer.id,
        planSlug: draft.slug,
        mealsPerDay: draft.mealsPerDay,
        durationDays: draft.durationDays,
        startDate: draft.startDate,
      });
      if (duplicate && duplicate.paymentStatus === "paid") {
        throw httpError(409, "This package was just paid. Open your order confirmation instead of paying again.");
      }
      order = duplicate && samePackage(duplicate, draft) ? duplicate : null;
      if (!order) {
        order = await orders.createOrder({
          customerId: customer.id,
          planSlug: draft.slug,
          planName: draft.planName,
          mealsPerDay: draft.mealsPerDay,
          durationDays: draft.durationDays,
          days: draft.days,
          deliverySlotId: null,
          deliverySlotLabel: "Morning · 8:00 AM – 12:00 PM",
          startDate: draft.startDate,
          addressLine: draft.addressLine,
          emirate: "Dubai",
          area: "Dubai",
          building: null,
          instructions: draft.instructions,
          allergies: null,
          menuItemIds: [],
          addOnIds: [],
          promoCode: null,
          subtotalAed: draft.priceAed,
          discountAed: 0,
          deliveryFeeAed: 0,
          totalAed: draft.priceAed,
          priceStatus: "priced",
          paymentMethod: "card",
          paymentStatus: "unpaid",
          orderStatus: "pending_payment",
          privacyConsent: true,
          whatsappOptIn: false,
          calorieLabel: draft.calorieLabel,
        });
      }
      if (row) await otpModel.attachOrder(connection, row.id, order.id);
    }

    if (order.paymentStatus === "paid") throw httpError(400, "This order is already paid.");
    if (toFils(order.totalAed) !== toFils(draft.priceAed)) {
      throw httpError(409, "The saved order total does not match the package price. Start the order again.");
    }
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("OTP checkout rollback failed:", rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }

  try {
    await customers.updateDelivery(customer.id, {
      deliveryAddress: draft.addressLine,
      deliveryInstructions: draft.instructions,
      emirate: "Dubai",
      area: "Dubai",
      building: null,
    });
  } catch (error) {
    console.error("Delivery profile update failed:", error.message);
  }

  return { order };
}

function paymentGate() {
  return checkoutGate({
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    liveEnabled: process.env.STRIPE_LIVE_ENABLED === "true",
  });
}

async function claimPayment(order) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const payments = await orders.paymentsForUpdate(connection, order.id);
    if (order.paymentStatus === "paid" || payments.some((payment) => payment.status === "paid")) {
      throw httpError(400, "This order is already paid.");
    }
    const pending = payments.find(
      (payment) => payment.status === "pending" && String(payment.providerRef || "").startsWith("cs_")
    );
    if (pending && toFils(pending.amountAed) === toFils(order.totalAed)) {
      await connection.commit();
      return { reuseRef: pending.providerRef };
    }
    if (pending) {
      await orders.updatePaymentOn(connection, pending.id, { status: "cancelled", providerRef: pending.providerRef });
    }
    const starting = payments.find((payment) => {
      if (payment.status !== "starting") return false;
      const created = new Date(payment.createdAt).getTime();
      return Number.isFinite(created) && Date.now() - created < 2 * 60 * 1000;
    });
    if (starting) {
      throw httpError(409, "A payment is already in progress for this order. Wait a moment and try again. No second charge was started.");
    }
    const paymentId = await orders.insertPaymentOn(connection, {
      orderId: order.id,
      provider: stripeMode(),
      method: "card",
      amountAed: order.totalAed,
      status: "starting",
      providerRef: null,
    });
    await connection.commit();
    return { paymentId };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Payment claim rollback failed:", rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function storeSession(order, email, req, paymentId) {
  const amountFils = toFils(order.totalAed);
  try {
    const session = await createCheckoutSession({
      secretKey: process.env.STRIPE_SECRET_KEY,
      reference: order.reference,
      amountFils,
      productName: `${order.planName} · ${order.mealsPerDay} ${order.mealsPerDay === 1 ? "meal" : "meals"} a day · ${order.durationDays} ${order.durationDays === 1 ? "day" : "days"}`,
      successUrl: `${siteOrigin(req)}/order?ref=${encodeURIComponent(order.reference)}&result=success`,
      cancelUrl: `${siteOrigin(req)}/order?ref=${encodeURIComponent(order.reference)}&result=cancelled`,
      customerEmail: email,
      idempotencyKey: `nf-pkg-${order.reference}-${paymentId}`,
    });
    await orders.updatePayment(paymentId, { status: "pending", providerRef: session.id });
    await orders.rememberCheckoutSession(paymentId, session.id);
    await orders.updatePaymentState(order.id, "pending", "pending_payment");
    return session;
  } catch (error) {
    await orders.updatePayment(paymentId, { status: "failed", providerRef: `failed-${paymentId}` }).catch(() => {});
    throw error;
  }
}

async function startSession(order, email, req) {
  const official = findPackage(order.planSlug, order.mealsPerDay, order.durationDays);
  if (!official) throw httpError(400, "Choose a meal plan, meals per day, and a length from 1 to 28 days.");
  if (toFils(order.totalAed) !== official.priceFils) {
    const updated = await orders.setPackageTotal(order.id, official.priceAed);
    if (!updated) throw httpError(409, "This order is already paid.");
    order.totalAed = official.priceAed;
  }
  let claim = await claimPayment(order);
  if (claim.reuseRef) {
    const existing = await retrieveCheckoutSession({
      secretKey: process.env.STRIPE_SECRET_KEY,
      sessionId: claim.reuseRef,
    });
    if (existing.status === "complete" && existing.paymentStatus === "paid") {
      throw httpError(409, "A payment was already submitted for this order. It is confirmed only after Stripe verifies it. No second charge was started.");
    }
    if (
      existing.status === "open" &&
      existing.currency === "aed" &&
      existing.amountTotal === official.priceFils &&
      existing.url
    ) {
      return existing;
    }
    await orders.updatePaymentByRef(claim.reuseRef, "cancelled");
    claim = await claimPayment(order);
  }
  if (!claim.paymentId) {
    throw httpError(409, "A payment is already in progress for this order. No second charge was started.");
  }
  return storeSession(order, email, req, claim.paymentId);
}

function checkoutPayload(mode, order, session) {
  return {
    success: true,
    reference: order.reference,
    paymentStatus: "pending",
    paid: false,
    checkoutUrl: session.url,
    testMode: mode === "stripe_test",
    message:
      mode === "stripe_test"
        ? "Stripe is in test mode. A real card will not be charged."
        : "Continue to the secure payment page.",
  };
}

async function checkout(req, res, next) {
  try {
    const gate = paymentGate();
    if (!gate.ok) throw httpError(gate.statusCode, gate.message);
    const token = String((req.body && req.body.verificationToken) || "");
    const skipOtp = !otpRequiredNow();
    if (!skipOtp && !/^[a-f0-9]{64}$/.test(token)) throw httpError(400, "Verify your mobile number before payment.");
    const earliest = await earliestStart();
    const checked = validatePackageOrder(req.body, { earliest });
    if (!checked.order) throw httpError(400, checked.errors[0]);

    const { order } = await prepareCharge(checked.order, skipOtp ? "" : token);
    const session = await startSession(order, checked.order.email, req);
    res.status(201).json(checkoutPayload(gate.mode, order, session));
  } catch (error) {
    next(error);
  }
}

async function retryCheckout(req, res, next) {
  try {
    const gate = paymentGate();
    if (!gate.ok) throw httpError(gate.statusCode, gate.message);
    const reference = String((req.body && req.body.reference) || "").trim();
    if (!/^NF-\d{8}-[A-F0-9]{6}$/.test(reference)) throw httpError(400, "Open the payment page from your order link.");
    const order = await orders.findByReference(reference);
    if (!order) throw httpError(404, "Order not found.");
    if (order.paymentStatus === "paid") throw httpError(409, "This package is already paid.");
    const session = await startSession(order, order.customerEmail, req);
    res.json(checkoutPayload(gate.mode, order, session));
  } catch (error) {
    next(error);
  }
}

async function inquiryWhatsapp(inquiry) {
  const settings = await catalogModel.getSettings();
  const number = (settings && settings.whatsappNumber) || process.env.WHATSAPP_BUSINESS_NUMBER || "971502483083";
  return businessChatLink(number, inquiryChatMessage(inquiry));
}

function inquiryPayload(inquiry, whatsappUrl) {
  return {
    success: true,
    reference: inquiry.reference,
    requestType: "inquiry",
    paid: false,
    paymentStatus: "unpaid",
    paymentNote: "No payment has been made.",
    customerName: inquiry.customerName,
    planName: inquiry.planName,
    mealsPerDay: inquiry.mealsPerDay,
    durationDays: inquiry.durationDays,
    dayLabels: inquiry.dayLabels,
    startDate: inquiry.startDate,
    endDate: inquiry.endDate,
    addressLine: inquiry.addressLine,
    instructions: inquiry.instructions,
    totalAed: inquiry.totalAed,
    totalLabel: displayAed(inquiry.totalAed),
    currency: "AED",
    createdAt: inquiry.createdAt,
    message: INQUIRY_CONFIRMATION,
    confirmationPath: `/inquiry?ref=${encodeURIComponent(inquiry.reference)}`,
    whatsappUrl: whatsappUrl || null,
    whatsappNote: whatsappUrl
      ? "This opens WhatsApp with your unpaid inquiry written out. It is not sent until you press send in WhatsApp."
      : null,
  };
}

async function createInquiry(req, res, next) {
  try {
    const earliest = await earliestStart();
    const checked = validatePackageOrder(req.body, { earliest });
    if (!checked.order) throw httpError(400, checked.errors[0]);
    const draft = checked.order;
    const customer = await attachPackageCustomer(draft, { preserveWhatsapp: true });
    try {
      await customers.updateDelivery(customer.id, {
        deliveryAddress: draft.addressLine,
        deliveryInstructions: draft.instructions,
        emirate: "Dubai",
        area: "Dubai",
        building: null,
      });
    } catch (error) {
      console.error("Delivery profile update failed:", error.message);
    }
    const duplicate = await packageInquiries.findOpenDuplicate({
      customerId: customer.id,
      planSlug: draft.slug,
      mealsPerDay: draft.mealsPerDay,
      durationDays: draft.durationDays,
      startDate: draft.startDate,
      days: draft.days,
      addressLine: draft.addressLine,
      instructions: draft.instructions,
      totalAed: draft.priceAed,
    });
    const inquiry =
      duplicate ||
      (await packageInquiries.createInquiry({
        customerId: customer.id,
        planSlug: draft.slug,
        planName: draft.planName,
        mealsPerDay: draft.mealsPerDay,
        durationDays: draft.durationDays,
        days: draft.days,
        startDate: draft.startDate,
        endDate: draft.endDate,
        addressLine: draft.addressLine,
        instructions: draft.instructions,
        totalAed: draft.priceAed,
      }));
    const whatsappUrl = await inquiryWhatsapp(inquiry);
    res.status(duplicate ? 200 : 201).json(inquiryPayload(inquiry, whatsappUrl));
    if (!duplicate) {
      sendPackageInquiryNotification({
        inquiry,
        customer: { full_name: customer.full_name, phone_e164: customer.phone_e164, email: customer.email },
      })
        .then(() => packageInquiries.markEmailed(inquiry.id, true))
        .catch((error) => {
          console.error("Package inquiry email failed:", error.message);
          packageInquiries.markEmailed(inquiry.id, false).catch(() => {});
        });
    }
  } catch (error) {
    next(error);
  }
}

async function inquiryStatus(req, res, next) {
  try {
    const reference = String(req.params.reference || "").trim();
    if (!/^NQ-\d{8}-[A-F0-9]{6}$/.test(reference)) throw httpError(400, "Open the inquiry page from your confirmation link.");
    const inquiry = await packageInquiries.findByReference(reference);
    if (!inquiry) throw httpError(404, "Inquiry not found.");
    const whatsappUrl = await inquiryWhatsapp(inquiry);
    res.json(inquiryPayload(inquiry, whatsappUrl));
  } catch (error) {
    next(error);
  }
}

module.exports = { catalog, quote, sendOtp, checkOtp, checkout, retryCheckout, createInquiry, inquiryStatus, INQUIRY_CONFIRMATION };
