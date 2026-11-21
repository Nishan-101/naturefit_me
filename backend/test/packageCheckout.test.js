const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { findPackage, listPackages, pricesForPlan } = require("../config/packagePrices");
const { displayAed, toFils } = require("../lib/money");
const { validatePackageOrder, blockingPayment, INQUIRY_CONFIRMATION } = require("../lib/packageOrder");
const { buildDeliveryDates } = require("../lib/schedule");
const { createCheckoutSession } = require("../lib/stripe");
const { sendAllowed, checkAllowed, publicOtpError, packageOtpRequired } = require("../lib/otpPolicy");
const { isolationFailure, connectedDatabaseFailure, publicSiteOrigin } = require("../lib/runtimeIsolation");
const { createVerification, checkVerification } = require("../lib/twilioVerify");
const { checkoutGate } = require("../lib/stripe");
const { packageChatMessage, inquiryChatMessage } = require("../lib/whatsapp");
const { buildPackageInquiryEmail } = require("../config/mailer");

const EXPECTED = {
  "weight-loss": {
    name: "Fat Loss",
    1: { 1: 45, 20: 800, 28: 1110 },
    2: { 1: 60, 20: 1050, 28: 1500 },
    3: { 1: 70, 20: 1350, 28: 1900 },
  },
  balance: {
    name: "Balance",
    1: { 1: 50, 20: 900, 28: 1200 },
    2: { 1: 60, 20: 1100, 28: 1500 },
    3: { 1: 80, 20: 1400, 28: 2000 },
  },
  lifestyle: {
    name: "Healthy Lifestyle",
    1: { 1: 55, 20: 1000, 28: 1400 },
    2: { 1: 65, 20: 1250, 28: 1750 },
    3: { 1: 85, 20: 1500, 28: 2100 },
  },
  "muscle-gain": {
    name: "Muscle Gain",
    1: { 1: 60, 20: 1000, 28: 1400 },
    2: { 1: 70, 20: 1300, 28: 1900 },
    3: { 1: 85, 20: 1650, 28: 2300 },
    4: { 1: 115, 20: 2150, 28: 3000 },
  },
};

test("package prices match the Nature Fit price list exactly", () => {
  Object.entries(EXPECTED).forEach(([slug, plan]) => {
    Object.entries(plan).forEach(([meals, prices]) => {
      if (meals === "name") return;
      Object.entries(prices).forEach(([days, amount]) => {
        const found = findPackage(slug, Number(meals), Number(days));
        assert.equal(found.priceAed, amount);
        assert.equal(found.planName, plan.name);
        assert.equal(found.discountAed, undefined);
      });
    });
  });
  assert.equal(findPackage("weight-loss", 4, 20), null);
  assert.equal(findPackage("lifestyle", 3, 30), null);
  assert.equal(findPackage("balance", 3, 0), null);
  assert.equal(findPackage("muscle-gain", 4, 29), null);
  assert.notEqual(findPackage("balance", 3, 24), null);
  assert.equal(displayAed(1350), "AED 1,350");
  assert.equal(displayAed(70), "AED 70");
  assert.equal(displayAed(1127.63), "AED 1,127.63");
  listPackages().forEach((plan) => {
    assert.equal(plan.prices, undefined);
  });
  const one = pricesForPlan("weight-loss");
  assert.equal(one.prices.length, 3);
  assert.equal(pricesForPlan("missing-plan"), null);
  assert.equal(JSON.stringify(pricesForPlan("balance")).includes("2150"), false);
});

test("a browser-supplied price cannot change the package total", () => {
  const checked = validatePackageOrder(
    {
      plan: "weight-loss",
      mealsPerDay: 3,
      duration: 20,
      totalAed: 1,
      priceAed: 1,
      paymentStatus: "paid",
      fullName: "John Smith",
      email: "john@example.com",
      countryCode: "971",
      nationalNumber: "0501234567",
      addressLine: "Al Safa Complex, Dubai, UAE",
      startDate: "2026-11-20",
      deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      endDate: "1999-01-01",
      privacyConsent: true,
    },
    { earliest: "2026-11-18" }
  );
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.order.priceAed, 1350);
  assert.equal(checked.order.endDate, "2026-12-09");
  assert.deepEqual(checked.order.days, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(checked.order.paymentStatus, "unpaid");
  assert.equal(checked.order.phone, "+971501234567");
  assert.equal(checked.order.planName, "Fat Loss");
});

test("package details are rejected when required information is missing", () => {
  const checked = validatePackageOrder(
    { plan: "muscle-gain", mealsPerDay: 4, duration: 28, totalAed: 1 },
    { earliest: "2026-11-18" }
  );
  assert.ok(checked.errors.length > 0);
  assert.equal(checked.order, null);
  const landline = validatePackageOrder(
    {
      plan: "balance",
      mealsPerDay: 1,
      duration: 1,
      fullName: "Amina Noor",
      email: "amina@example.com",
      nationalNumber: "412345678",
      addressLine: "Al Safa Complex, Dubai",
      startDate: "2026-11-20",
      privacyConsent: true,
    },
    { earliest: "2026-11-18" }
  );
  assert.ok(landline.errors.some((error) => /UAE mobile/i.test(error)));
});

test("Stripe checkout stays in test mode until a webhook secret exists", () => {
  assert.equal(checkoutGate({ secretKey: "sk_test_123", webhookSecret: "whsec_123" }).ok, true);
  assert.equal(checkoutGate({ secretKey: "sk_live_123", webhookSecret: "whsec_123" }).ok, false);
  assert.equal(checkoutGate({ secretKey: "sk_test_123", webhookSecret: "" }).ok, false);
  assert.equal(
    checkoutGate({ secretKey: "sk_live_123", webhookSecret: "whsec_123", liveEnabled: true }).mode,
    "stripe_live"
  );
});

test("OTP stays required in production and is optional only on isolated Stripe test staging", () => {
  const staging = {
    nodeEnv: "production",
    appEnv: "staging",
    stripeSecretKey: "sk_test_123",
    liveEnabled: "false",
    stagingOtpOptional: "true",
    publicSiteUrl: "https://naturefit-staging.vercel.app",
    clientOrigin: "https://naturefit-staging.vercel.app",
    stagingDbAddon: "naturefit_staging",
    stagingDbHost: "staging-db.mysql.services.clever-cloud.com",
    stagingDbName: "bgeneratedstagingdb",
    stagingDbUser: "ustaginggenerated",
    dbHost: "staging-db.mysql.services.clever-cloud.com",
    dbName: "bgeneratedstagingdb",
    dbUser: "ustaginggenerated",
    dbPassword: "staging-secret",
    productionDbHost: "production-db.mysql.services.clever-cloud.com",
    productionDbName: "naturefit_live",
    productionDbUser: "ulive",
    twilioConfigured: false,
  };
  assert.equal(packageOtpRequired(staging), false);
  assert.equal(packageOtpRequired({ ...staging, dbName: "" }), true);
  assert.equal(packageOtpRequired({ ...staging, dbName: "naturefit_staging" }), true);
  assert.equal(packageOtpRequired({ ...staging, dbName: "production_db" }), true);
  assert.equal(packageOtpRequired({ ...staging, dbHost: "other.mysql.services.clever-cloud.com" }), true);
  assert.equal(packageOtpRequired({ ...staging, dbUser: "other_user" }), true);
  assert.equal(packageOtpRequired({ ...staging, dbHost: staging.productionDbHost }), true);
  assert.equal(packageOtpRequired({ ...staging, dbName: staging.productionDbName, stagingDbName: staging.productionDbName }), true);
  assert.equal(packageOtpRequired({ ...staging, productionDbHost: "" }), true);
  assert.equal(packageOtpRequired({ ...staging, publicSiteUrl: "" }), true);
  assert.equal(packageOtpRequired({ ...staging, clientOrigin: "" }), true);
  assert.equal(packageOtpRequired({ ...staging, stripeSecretKey: "" }), true);
  assert.equal(packageOtpRequired({ ...staging, appEnv: "production" }), true);
  assert.equal(packageOtpRequired({ ...staging, appEnv: "" }), true);
  assert.equal(packageOtpRequired({ ...staging, stripeSecretKey: "sk_live_123" }), true);
  assert.equal(packageOtpRequired({ ...staging, liveEnabled: "true" }), true);
  assert.equal(packageOtpRequired({ ...staging, stagingOtpOptional: "" }), true);
  assert.equal(packageOtpRequired({ ...staging, publicSiteUrl: "https://naturefit.site" }), true);
  assert.equal(packageOtpRequired({ ...staging, clientOrigin: "https://naturefit.site,https://www.naturefit.site" }), true);
  assert.equal(
    packageOtpRequired({
      nodeEnv: "production",
      appEnv: "production",
      stripeSecretKey: "sk_test_123",
      stagingOtpOptional: "true",
      publicSiteUrl: "https://example.test",
      clientOrigin: "https://example.test",
    }),
    true
  );
  assert.equal(
    packageOtpRequired({
      nodeEnv: "development",
      stripeSecretKey: "sk_test_123",
      publicSiteUrl: "http://localhost:5000",
      twilioConfigured: false,
    }),
    true
  );
});

test("staging accepts the real Clever Cloud database name and refuses the production database", () => {
  const stagingPassword = "staging-secret";
  const productionPassword = "production-secret-must-not-appear";
  const staging = {
    APP_ENV: "staging",
    NODE_ENV: "production",
    STAGING_DB_ADDON: "naturefit_staging",
    STAGING_DB_HOST: "staging-db.mysql.services.clever-cloud.com",
    STAGING_DB_NAME: "bgeneratedstagingdb",
    STAGING_DB_USER: "ustaginggenerated",
    DB_HOST: "staging-db.mysql.services.clever-cloud.com",
    DB_NAME: "bgeneratedstagingdb",
    DB_USER: "ustaginggenerated",
    DB_PASSWORD: stagingPassword,
    PRODUCTION_DB_HOST: "production-db.mysql.services.clever-cloud.com",
    PRODUCTION_DB_NAME: "naturefit_live",
    PRODUCTION_DB_USER: "ulive",
    PUBLIC_SITE_URL: "https://nature-fit-git-meal-plan-inquiry-checkout.vercel.app",
    CLIENT_ORIGIN: "https://nature-fit-git-meal-plan-inquiry-checkout.vercel.app",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_LIVE_ENABLED: "",
  };
  assert.equal(isolationFailure(staging), "");
  assert.equal(isolationFailure(staging).includes(stagingPassword), false);
  assert.equal(publicSiteOrigin(staging), "https://nature-fit-git-meal-plan-inquiry-checkout.vercel.app");
  assert.match(isolationFailure({ ...staging, DB_NAME: "naturefit_staging" }), /STAGING_DB_NAME/);
  assert.match(isolationFailure({ ...staging, DB_NAME: "naturefit_live" }), /production database name/);
  assert.match(isolationFailure({ ...staging, DB_HOST: "other.mysql.services.clever-cloud.com" }), /DB_HOST must match/);
  assert.match(isolationFailure({ ...staging, DB_USER: "other_user" }), /DB_USER must match/);
  assert.match(isolationFailure({ ...staging, DB_HOST: "" }), /DB_HOST/);
  assert.match(isolationFailure({ ...staging, DB_PASSWORD: "" }), /DB_PASSWORD/);
  assert.match(isolationFailure({ ...staging, STAGING_DB_NAME: "" }), /STAGING_DB_NAME/);
  assert.match(isolationFailure({ ...staging, STAGING_DB_ADDON: "naturefit_live" }), /STAGING_DB_ADDON/);
  assert.match(isolationFailure({ ...staging, PRODUCTION_DB_HOST: "" }), /PRODUCTION_DB_HOST/);
  assert.match(isolationFailure({ ...staging, DB_HOST: staging.PRODUCTION_DB_HOST, STAGING_DB_HOST: staging.PRODUCTION_DB_HOST }), /production database host/);
  assert.match(isolationFailure({ ...staging, DB_USER: staging.PRODUCTION_DB_USER, STAGING_DB_USER: staging.PRODUCTION_DB_USER }), /production database user/);
  const passwordRefusal = isolationFailure({ ...staging, PRODUCTION_DB_PASSWORD: productionPassword });
  assert.match(passwordRefusal, /PRODUCTION_DB_PASSWORD/);
  assert.equal(passwordRefusal.includes(productionPassword), false);
  assert.equal(passwordRefusal.includes(stagingPassword), false);
  assert.match(isolationFailure({ ...staging, PUBLIC_SITE_URL: "https://naturefit.site" }), /naturefit\.site/);
  assert.match(isolationFailure({ ...staging, STRIPE_SECRET_KEY: "sk_live_123" }), /live Stripe/);
  assert.match(isolationFailure({ ...staging, APP_ENV: "production" }), /staging database/);
  assert.match(isolationFailure({ APP_ENV: "", NODE_ENV: "production" }), /APP_ENV/);
  assert.equal(isolationFailure({ APP_ENV: "production", NODE_ENV: "production", DB_NAME: "live_db" }), "");
  assert.match(
    isolationFailure({ APP_ENV: "production", NODE_ENV: "production", DB_NAME: "naturefit_staging" }),
    /naturefit_staging/
  );
  assert.equal(publicSiteOrigin({ APP_ENV: "staging", PUBLIC_SITE_URL: "https://naturefit.site" }), "");
  assert.equal(publicSiteOrigin({ APP_ENV: "production", PUBLIC_SITE_URL: "" }), "https://naturefit.site");
  assert.equal(
    connectedDatabaseFailure(
      { databaseName: "bgeneratedstagingdb", currentUser: "ustaginggenerated@%" },
      staging
    ),
    ""
  );
  assert.match(
    connectedDatabaseFailure({ databaseName: "naturefit_live", currentUser: "ustaginggenerated@%" }, staging),
    /STAGING_DB_NAME|production database/
  );
  assert.match(
    connectedDatabaseFailure({ databaseName: "bgeneratedstagingdb", currentUser: "ulive@%" }, staging),
    /STAGING_DB_USER|production database user/
  );
  const dbSource = fs.readFileSync(path.join(__dirname, "../config/db.js"), "utf8");
  assert.equal(dbSource.includes("PRODUCTION_DB_"), false);
  assert.match(dbSource, /database: process\.env\.DB_NAME/);

  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, "../../frontend/vercel.json"), "utf8"));
  const productionDestination = "https://naturefit-me.onrender.com/api/:path*";
  const stagingDestination = "https://naturefit-me-1.onrender.com/api/:path*";
  const production = vercel.rewrites.filter((rule) => rule.destination === productionDestination);
  const stagingRewrite = vercel.rewrites.find((rule) => rule.destination === stagingDestination);
  assert.equal(production.length, 2);
  production.forEach((rule) => {
    assert.equal(rule.destination, productionDestination);
    assert.equal(rule.has[0].type, "host");
    assert.match(rule.has[0].value, /naturefit\.site$/);
  });
  assert.equal(vercel.rewrites.at(-1), stagingRewrite);
  assert.equal(stagingRewrite.destination, stagingDestination);
  assert.equal(stagingRewrite.has, undefined);
  const contactScript = fs.readFileSync(path.join(__dirname, "../../frontend/js/script.js"), "utf8");
  const subscribeScript = fs.readFileSync(path.join(__dirname, "../../frontend/js/subscribe.js"), "utf8");
  assert.equal(contactScript.includes("onrender.com"), false);
  assert.equal(subscribeScript.includes("onrender.com"), false);
  assert.match(contactScript, /\/api\/contact/);
  assert.match(subscribeScript, /\/api\/packages\/checkout/);
});

test("OTP sends are rate limited and codes expire after too many guesses", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  assert.equal(sendAllowed([now - 10 * 1000], now).ok, false);
  assert.equal(sendAllowed([now - 70 * 1000], now).ok, true);
  assert.equal(sendAllowed([1, 2, 3, 4, 5].map((item) => now - item * 60 * 1000), now).code, "rate");
  assert.equal(checkAllowed(4), true);
  assert.equal(checkAllowed(5), false);
  assert.equal(publicOtpError(404, 20404).statusCode, 400);
  assert.equal(publicOtpError(429, 60203).statusCode, 429);
});

test("Twilio Verify requests stay on Twilio and never put the auth token in the URL", async () => {
  let captured;
  const created = await createVerification({
    accountSid: "ACexample",
    authToken: "secret-token",
    serviceSid: "VAexample",
    to: "+971501234567",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({ sid: "VEexample", status: "pending" }) };
    },
  });
  assert.equal(created.ok, true);
  assert.equal(captured.url, "https://verify.twilio.com/v2/Services/VAexample/Verifications");
  assert.equal(captured.url.includes("secret-token"), false);
  assert.equal(String(captured.options.body).includes("secret-token"), false);
  assert.match(String(captured.options.body), /Channel=sms/);
  assert.match(captured.options.headers.Authorization, /^Basic /);

  const checked = await checkVerification({
    accountSid: "ACexample",
    authToken: "secret-token",
    serviceSid: "VAexample",
    to: "+971501234567",
    code: "123456",
    fetchImpl: async (url, options) => {
      captured = { url, body: String(options.body) };
      return { ok: true, json: async () => ({ status: "approved" }) };
    },
  });
  assert.equal(checked.status, "approved");
  assert.equal(captured.url, "https://verify.twilio.com/v2/Services/VAexample/VerificationCheck");
  assert.match(captured.body, /Code=123456/);
});

test("the WhatsApp draft includes the paid order and does not mention a discount", () => {
  const text = packageChatMessage(
    {
      customerName: "John Smith",
      reference: "NF-20261117-ABC123",
      planName: "Fat Loss",
      mealsPerDay: 3,
      durationDays: 20,
      totalAed: 1350,
      startDate: "2026-11-20",
      addressLine: "Al Safa Complex, Dubai, UAE",
    },
    "pi_test_123"
  );
  assert.match(text, /Customer: John Smith/);
  assert.match(text, /Order ID: NF-20261117-ABC123/);
  assert.match(text, /Meal Plan: Fat Loss/);
  assert.match(text, /Meals Per Day: 3/);
  assert.match(text, /Subscription: 20 Days/);
  assert.match(text, /Total Price: AED 1,350/);
  assert.match(text, /Delivery Start Date: 2026-11-20/);
  assert.match(text, /Delivery Address: Al Safa Complex, Dubai, UAE/);
  assert.match(text, /Payment Reference: pi_test_123/);
  assert.doesNotMatch(text, /discount|saving|was AED/i);
});

test("an unpaid inquiry draft is labeled unpaid and uses the official total", () => {
  const inquiry = {
    reference: "NQ-20261121-ABC123",
    customerName: "John Smith",
    planName: "Fat Loss",
    mealsPerDay: 3,
    durationDays: 20,
    totalAed: 1350,
    startDate: "2026-11-20",
    addressLine: "Al Safa Complex, Dubai, UAE",
  };
  const text = inquiryChatMessage(inquiry);
  assert.match(text, /Unpaid meal plan inquiry/);
  assert.match(text, /No payment has been made/);
  assert.match(text, /Inquiry: NQ-20261121-ABC123/);
  assert.match(text, /Quoted total: AED 1,350/);
  assert.doesNotMatch(text, /Payment Successful|paid order/i);
  const email = buildPackageInquiryEmail({
    inquiry: { ...inquiry, dayLabels: ["Monday"], instructions: "Leave at reception" },
    customer: { full_name: "John Smith", phone_e164: "+971501234567", email: "john@example.com" },
  });
  assert.match(email.subject, /Unpaid meal plan inquiry NQ-20261121-ABC123/);
  assert.match(email.text, /UNPAID MEAL PLAN INQUIRY/);
  assert.match(email.text, /No payment has been made/);
  assert.match(email.text, /Quoted total: AED 1350.00/);
  assert.match(email.text, /Payment status: Unpaid inquiry/);
  assert.equal(email.text.includes("Payment Successful"), false);
});

test("an open card payment blocks a second charge", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  assert.ok(blockingPayment([{ status: "pending", createdAt: "2026-11-17 11:00:00" }], now));
  assert.ok(blockingPayment([{ status: "starting", createdAt: "2026-11-17T11:50:00Z" }], now));
  assert.equal(blockingPayment([{ status: "starting", createdAt: "2026-11-17T10:00:00Z" }], now), undefined);
  assert.equal(blockingPayment([{ status: "failed", createdAt: "2026-11-17T11:59:00Z" }], now), undefined);
});

test("the package page does not show discounts or send a price to the server", () => {
  const root = path.join(__dirname, "../../frontend");
  const page = fs.readFileSync(path.join(root, "subscribe.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "js/subscribe.js"), "utf8");
  assert.doesNotMatch(page, /line-through|discount|saving/i);
  assert.doesNotMatch(script, /line-through|discount|saving/i);
  const payload = script.slice(script.indexOf("function checkoutPayload"), script.indexOf("async function sendCode"));
  assert.doesNotMatch(payload, /amount|price|total/i);
  assert.match(payload, /deliveryDays/);
  assert.match(page, /id="dayRange"/);
  assert.match(page, /min="1" max="28"/);
  assert.match(page, /id="summaryCard" hidden/);
  assert.match(page, /id="sendInquiry"/);
  assert.match(page, /id="payNow"/);
  assert.match(page, /Send Inquiry/);
  assert.match(page, /Pay Now/);
  assert.match(page, /Submit without payment/);
  assert.match(script, /\/api\/packages\/inquiry/);
  assert.match(script, /checkoutUrl/);
  const inquiryPage = fs.readFileSync(path.join(root, "inquiry.html"), "utf8");
  const orderPage = fs.readFileSync(path.join(root, "order.html"), "utf8");
  assert.equal(
    INQUIRY_CONFIRMATION,
    "Thank you for your interest in Nature Fit Healthy Restaurant. Your meal plan inquiry has been received successfully. Our team will contact you shortly."
  );
  assert.match(inquiryPage, /No payment has been made/);
  assert.match(inquiryPage, /Thank you for your interest in Nature Fit Healthy Restaurant/);
  assert.match(orderPage, /Payment Successful!/);
  assert.match(orderPage, /Thank you for choosing Nature Fit Healthy Restaurant\. Your meal plan order has been received successfully\./);
  assert.match(orderPage, /does not mark an order as paid/);
  assert.match(orderPage, /result === "cancelled"/);
  assert.equal(findPackage("weight-loss", 3, 29), null);
  assert.equal(findPackage("weight-loss", 3, 90), null);
});

test("every meal plan and meal count is priced for each length from 1 to 28 days", () => {
  assert.equal(findPackage("lifestyle", 3, 15).priceAed, 1127.63);
  assert.equal(findPackage("lifestyle", 3, 15).priceFils, 112763);
  assert.equal(findPackage("weight-loss", 1, 7).priceAed, 283.42);
  assert.equal(findPackage("muscle-gain", 4, 21).priceAed, 2256.25);
  assert.equal(findPackage("muscle-gain", 2, 25).priceAed, 1675);
  assert.equal(findPackage("weight-loss", 3, 1).priceAed, 70);
  assert.equal(findPackage("weight-loss", 3, 20).priceAed, 1350);
  assert.equal(findPackage("weight-loss", 3, 28).priceAed, 1900);

  let combinations = 0;
  Object.entries(EXPECTED).forEach(([slug, plan]) => {
    Object.entries(plan).forEach(([meals, prices]) => {
      if (meals === "name") return;
      let previous = 0;
      for (let days = 1; days <= 28; days += 1) {
        const found = findPackage(slug, Number(meals), days);
        combinations += 1;
        assert.ok(found, `${slug} ${meals} meals ${days} days`);
        assert.equal(found.priceFils, toFils(found.priceAed));
        assert.equal(Math.round(found.priceAed * 100), found.priceFils);
        assert.ok(found.priceFils >= previous);
        previous = found.priceFils;
        const raw =
          days < 20
            ? prices[1] + ((days - 1) * (prices[20] - prices[1])) / 19
            : prices[20] + ((days - 20) * (prices[28] - prices[20])) / 8;
        const anchor = days === 1 || days === 20 || days === 28;
        if (anchor) assert.equal(found.priceAed, prices[days]);
        else assert.equal(found.priceAed, Math.round((raw + Number.EPSILON) * 100) / 100);
      }
    });
  });
  assert.equal(combinations, 13 * 28);
});

test("the ending date follows the start date, weekdays, and purchased days", () => {
  const checked = validatePackageOrder(
    {
      plan: "lifestyle",
      mealsPerDay: 3,
      duration: 15,
      totalAed: 10,
      priceAed: 10,
      fullName: "John Smith",
      email: "john@example.com",
      countryCode: "971",
      nationalNumber: "501234567",
      addressLine: "Al Safa Complex, Dubai, UAE",
      startDate: "2026-11-20",
      deliveryDays: [1, 3, 5],
      privacyConsent: true,
    },
    { earliest: "2026-11-18" }
  );
  const dates = buildDeliveryDates("2026-11-20", [1, 3, 5], 15, []);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.order.priceAed, 1127.63);
  assert.equal(checked.order.endDate, dates[dates.length - 1]);
  assert.equal(checked.order.endDate, "2026-12-23");
  assert.deepEqual(checked.order.dayLabels, ["Monday", "Wednesday", "Friday"]);

  const everyday = validatePackageOrder(
    {
      plan: "muscle-gain",
      mealsPerDay: 4,
      duration: 1,
      fullName: "John Smith",
      email: "john@example.com",
      nationalNumber: "501234567",
      addressLine: "Al Safa Complex, Dubai, UAE",
      startDate: "2026-11-20",
      deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      privacyConsent: true,
    },
    { earliest: "2026-11-18" }
  );
  assert.equal(everyday.order.priceAed, 115);
  assert.equal(everyday.order.endDate, "2026-11-20");

  const missingDays = validatePackageOrder(
    {
      plan: "balance",
      mealsPerDay: 2,
      duration: 10,
      fullName: "John Smith",
      email: "john@example.com",
      nationalNumber: "501234567",
      addressLine: "Al Safa Complex, Dubai, UAE",
      startDate: "2026-11-20",
      deliveryDays: [],
      privacyConsent: true,
    },
    { earliest: "2026-11-18" }
  );
  assert.equal(missingDays.order, null);
  assert.ok(missingDays.errors.some((error) => /delivery day/i.test(error)));
  assert.equal(findPackage("balance", 2, 10).priceAed > 0, true);
});

test("Stripe checkout charges AED fils and asks for 3D Secure when required", async () => {
  const previous = {
    secret: process.env.STRIPE_WEBHOOK_SECRET,
    live: process.env.STRIPE_LIVE_ENABLED,
  };
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_value";
  delete process.env.STRIPE_LIVE_ENABLED;
  let captured;
  try {
    const session = await createCheckoutSession({
      secretKey: "sk_test_123",
      reference: "NF-20261121-ABC123",
      amountFils: 112763,
      productName: "Healthy Lifestyle · 3 meals a day · 15 days",
      successUrl: "https://naturefit.site/order?ref=NF-20261121-ABC123",
      cancelUrl: "https://naturefit.site/order?ref=NF-20261121-ABC123",
      customerEmail: "john@example.com",
      idempotencyKey: "nf-pkg-NF-20261121-ABC123-9",
      fetchImpl: async (url, options) => {
        captured = { url, options, body: String(options.body) };
        return { ok: true, json: async () => ({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }) };
      },
    });
    const params = new URLSearchParams(captured.body);
    assert.equal(session.id, "cs_test_123");
    assert.equal(captured.url, "https://api.stripe.com/v1/checkout/sessions");
    assert.match(captured.options.headers.Authorization, /^Bearer sk_test_123$/);
    assert.equal(captured.body.includes("sk_test_123"), false);
    assert.equal(params.get("line_items[0][price_data][currency]"), "aed");
    assert.equal(params.get("line_items[0][price_data][unit_amount]"), "112763");
    assert.equal(params.get("automatic_payment_methods[enabled]"), "true");
    assert.equal(params.get("payment_method_options[card][request_three_d_secure]"), "automatic");
    assert.equal(params.get("line_items[0][price_data][unit_amount]") === "1127.63", false);
  } finally {
    if (previous.secret == null) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous.secret;
    if (previous.live == null) delete process.env.STRIPE_LIVE_ENABLED;
    else process.env.STRIPE_LIVE_ENABLED = previous.live;
  }
});
