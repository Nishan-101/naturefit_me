const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizePhone } = require("../lib/phone");
const { validateProfile } = require("../controllers/profileController");
const { validateSelection, deliverInquiryEmail } = require("../controllers/inquiryController");
const { buildInquiryEmail, sendInquiryNotification } = require("../config/mailer");

function validProfile(overrides = {}) {
  return {
    fullName: "Amina Noor",
    age: 29,
    gender: "Female",
    heightCm: 165,
    weightKg: 62,
    primaryGoal: "Fat Loss",
    allergies: ["Dairy", "Other"],
    allergyOther: "Mustard",
    diet: "Regular",
    dislikes: "Coriander",
    calorieKcal: 1800,
    proteinGrams: 110,
    mealsPerDay: 3,
    preferredDuration: 20,
    deliveryAddress: "Al Safa Complex, Dubai",
    deliveryInstructions: "Call on arrival",
    allergyAcknowledged: true,
    ...overrides,
  };
}

test("normalizes a UAE phone number to E.164", () => {
  assert.equal(normalizePhone("971", "0502483083"), "+971502483083");
  assert.equal(normalizePhone("+971", "971502483083"), "+971502483083");
  assert.equal(normalizePhone("971", "123"), null);
});

test("requires a reply email for a meal-plan inquiry", () => {
  const missing = validateProfile(validProfile({ email: "" }), { requireEmail: true });
  assert.ok(missing.errors.some((error) => /email/i.test(error)));
  const ready = validateProfile(validProfile({ email: "amina@example.com" }), { requireEmail: true });
  assert.deepEqual(ready.errors, []);
  assert.equal(ready.email, "amina@example.com");
});

test("accepts a complete profile and does not invent a calorie target", () => {
  const guided = validateProfile(validProfile({ calorieGuidance: true, calorieKcal: 2200, proteinGuidance: true }));
  assert.deepEqual(guided.errors, []);
  assert.equal(guided.profile.calorieKcal, null);
  assert.equal(guided.profile.calorieGuidance, true);
  assert.equal(guided.profile.proteinGrams, null);
  assert.equal(guided.profile.completed, true);

  const chosen = validateProfile(validProfile());
  assert.equal(chosen.profile.calorieKcal, 1800);
  assert.equal(chosen.profile.proteinGrams, 110);
  assert.equal(chosen.profile.deliveryAddress, "Al Safa Complex, Dubai");
});

test("rejects an incomplete profile", () => {
  const missing = validateProfile(validProfile({ deliveryAddress: "short", calorieKcal: "", allergyAcknowledged: false }));
  assert.ok(missing.errors.some((error) => /delivery address/i.test(error)));
  assert.ok(missing.errors.some((error) => /calorie/i.test(error)));
  assert.ok(missing.errors.some((error) => /allergy note/i.test(error)));
  assert.equal(missing.profile.completed, false);
});

test("validates a meal-plan selection", () => {
  assert.equal(typeof validateSelection({ plan: "weight-loss", meals: ["breakfast"], days: [0, 1, 2, 3, 4], duration: 20 }), "string");
  const ok = validateSelection({
    plan: "weight-loss",
    meals: ["lunch", "dinner"],
    days: [0, 1, 2, 3, 4],
    duration: 24,
  });
  assert.equal(ok.plan.name, "Weight Loss");
  assert.equal(ok.duration, 24);
});

test("keeps an inquiry when the kitchen email fails", async () => {
  const sent = await deliverInquiryEmail(async () => true, {});
  const failed = await deliverInquiryEmail(async () => {
    throw new Error("mailbox unavailable");
  }, {});
  assert.equal(sent, true);
  assert.equal(failed, false);
});

test("throws instead of sending when the email key is missing", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  await assert.rejects(() => sendInquiryNotification({}), /RESEND_API_KEY/);
  if (previous) process.env.RESEND_API_KEY = previous;
});

test("inquiry email goes to Gmail and replies to the customer", () => {
  const message = buildInquiryEmail({
    inquiry: {
      id: 12,
      planName: "Weight Loss",
      durationDays: 20,
      notes: "",
      createdAt: "2026-10-12T12:00:00Z",
    },
    customer: { full_name: "Amina Noor", phone_e164: "+971501112233", email: "amina@example.com" },
    profile: validateProfile(validProfile()).profile,
    mealLabels: ["Lunch", "Dinner"],
    dayLabels: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
    allergyNote: "Staff must confirm suitability.",
  });
  assert.equal(message.to, process.env.INQUIRY_EMAIL || "naturefitdxb@gmail.com");
  assert.equal(message.replyTo, "amina@example.com");
  for (const part of ["Amina Noor", "+971501112233", "amina@example.com", "Fat Loss", "Weight Loss", "Lunch", "20 days", "Dairy", "Regular", "1800 kcal", "110 g", "Al Safa Complex", "2026-10-12T12:00:00.000Z"]) {
    assert.equal(message.text.includes(part), true, part);
    assert.equal(message.html.includes(part) || message.html.includes(encodeURIComponent(part)), true, `html ${part}`);
  }
  assert.equal(message.html.includes("mailto:amina%40example.com"), true);
  assert.equal(message.html.includes("tel:+971501112233"), true);
  assert.equal(message.text.includes("SESSION_SECRET"), false);
});
