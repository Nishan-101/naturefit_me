const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { quoteTotals, paymentTransition } = require("../lib/pricing");
const { buildDeliveryDates, earliestDeliveryDate, reconcileDeliveries, effectivePauseRanges } = require("../lib/schedule");
const { validateOrderInput } = require("../lib/orderRules");
const { businessChatLink, orderMessage } = require("../lib/whatsapp");
const { verifyStripeSignature } = require("../lib/stripe");

const catalog = {
  mode: "order",
  plans: [
    {
      slug: "weight-loss",
      name: "Weight Loss",
      active: true,
      allowFourMeals: false,
      calories: [{ mealsPerDay: 3, minKcal: 1350, maxKcal: 1500 }],
    },
    { slug: "muscle-gain", name: "Muscle Gain", active: true, allowFourMeals: true, calories: [] },
  ],
  durations: [{ days: 20, active: true }],
  slots: [{ id: 1, label: "Morning", active: true }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  minDeliveryDays: 5,
  emirates: ["Dubai"],
  addOns: [],
  menuItems: [],
  mealCustomization: false,
  cutoffTime: "18:00",
  cutoffLeadDays: 1,
  now: new Date("2026-11-17T06:00:00Z"),
  requirePassword: true,
};

function validBody(overrides = {}) {
  return {
    plan: "weight-loss",
    mealsPerDay: 3,
    duration: 20,
    days: [0, 1, 2, 3, 4],
    slotId: 1,
    startDate: "2026-11-18",
    emirate: "Dubai",
    fullName: "Amina Noor",
    email: "amina@example.com",
    area: "Al Safa",
    building: "Al Safa Complex 12",
    addressLine: "Al Safa Complex, Dubai",
    privacyConsent: true,
    allergyAcknowledged: true,
    password: "a-long-password",
    paymentMethod: "to_be_confirmed",
    company: "",
    ...overrides,
  };
}

test("prices a package from the published amount and ignores nothing the client did not supply", () => {
  const quote = quoteTotals({
    priceAed: 100,
    addOnPrices: [10],
    promo: { discountType: "percent", discountValue: 10, active: true },
    deliveryFeeAed: 5,
  });
  assert.equal(quote.priced, true);
  assert.equal(quote.subtotalAed, 110);
  assert.equal(quote.discountAed, 11);
  assert.equal(quote.totalAed, 104);
  assert.equal(quoteTotals({ priceAed: null, addOnPrices: [], deliveryFeeAed: 15 }).priced, false);
});

test("a success-page visit does not mark a payment as paid", () => {
  assert.equal(paymentTransition("pending", { type: "success_page_visited" }), "pending");
  assert.equal(paymentTransition("unpaid", { type: "cancel_page_visited" }), "unpaid");
  assert.equal(
    paymentTransition("pending", {
      type: "checkout.session.completed",
      paid: true,
      currency: "aed",
      amountFils: 10400,
      expectedFils: 10400,
    }),
    "paid"
  );
  assert.equal(
    paymentTransition("pending", {
      type: "checkout.session.completed",
      paid: true,
      currency: "aed",
      amountFils: 100,
      expectedFils: 10400,
    }),
    "pending"
  );
});

test("delivery dates follow weekdays and skip approved pauses", () => {
  const dates = buildDeliveryDates("2026-11-18", [1, 3], 4, [{ startDate: "2026-11-23", endDate: "2026-11-25" }]);
  assert.deepEqual(dates, ["2026-11-18", "2026-11-30", "2026-12-02", "2026-12-07"]);
});

test("cut-off uses Dubai time", () => {
  assert.equal(earliestDeliveryDate(new Date("2026-11-17T06:00:00Z"), "18:00", 1), "2026-11-18");
  assert.equal(earliestDeliveryDate(new Date("2026-11-17T15:00:00Z"), "18:00", 1), "2026-11-19");
});

test("schedule changes keep delivered meals and add the replacement days", () => {
  const actions = reconcileDeliveries(
    [
      { id: 1, date: "2026-11-18", status: "delivered" },
      { id: 2, date: "2026-11-23", status: "scheduled" },
    ],
    ["2026-11-18", "2026-11-30"]
  );
  assert.deepEqual(actions, [
    { type: "delete", id: 2, date: "2026-11-23" },
    { type: "insert", date: "2026-11-30", status: "scheduled" },
  ]);
});

test("an approved resume gives paused days back", () => {
  const ranges = effectivePauseRanges([
    { requestType: "pause", status: "approved", startDate: "2026-12-01", endDate: "2026-12-10" },
    { requestType: "resume", status: "approved", startDate: "2026-12-05", endDate: "2026-12-06" },
  ]);
  assert.deepEqual(ranges, [
    { startDate: "2026-12-01", endDate: "2026-12-04" },
    { startDate: "2026-12-07", endDate: "2026-12-10" },
  ]);
});

test("order validation rejects four meals on plans that do not offer them", () => {
  const blocked = validateOrderInput(validBody({ plan: "weight-loss", mealsPerDay: 4 }), catalog);
  assert.ok(blocked.errors.some((error) => /four meals/i.test(error)));
  const allowed = validateOrderInput(validBody(), catalog);
  assert.deepEqual(allowed.errors, []);
  assert.equal(allowed.selection.calorieLabel, "1350–1500 kcal");
});

test("quote validation does not require a customer price", () => {
  const quote = validateOrderInput(
    { plan: "weight-loss", mealsPerDay: 3, duration: 20, totalAed: 1, priceAed: 1 },
    { ...catalog, mode: "quote", requirePassword: false }
  );
  assert.deepEqual(quote.errors, []);
  assert.equal(quote.selection.paymentMethod, "to_be_confirmed");
});

test("click-to-chat link is a manual WhatsApp draft, not a sent message", () => {
  const order = {
    reference: "NF-20261117-ABC123",
    customerName: "Amina Noor",
    customerPhone: "+971501234567",
    customerEmail: "amina@example.com",
    planName: "Weight Loss",
    mealsPerDay: 3,
    durationDays: 20,
    dayLabels: ["Sunday"],
    deliverySlotLabel: "Morning",
    startDate: "2026-11-18",
    addressLine: "Al Safa Complex, Dubai",
    emirate: "Dubai",
    area: "Al Safa",
    building: "12",
    instructions: "",
    allergies: "None",
    totalAed: null,
    paymentMethod: "to_be_confirmed",
    paymentStatus: "unpaid",
  };
  const link = businessChatLink("971502483083", orderMessage(order));
  assert.match(link, /^https:\/\/wa\.me\/971502483083\?text=/);
  assert.match(decodeURIComponent(link), /To be confirmed/);
  assert.match(decodeURIComponent(link), /unpaid/);
});

test("stripe signatures reject tampered bodies", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_1" });
  const timestamp = 1_700_000_000;
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, timestamp), true);
  assert.equal(verifyStripeSignature(`${payload} `, `t=${timestamp},v1=${signature}`, secret, timestamp), false);
});
