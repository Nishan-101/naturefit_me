const { findPackage } = require("../config/packagePrices");
const { normalizePhone } = require("./phone");
const { isUaeMobile } = require("./orderRules");
const { DAY_NAMES, parseISODate, formatISODate, addDays, buildDeliveryDates } = require("./schedule");

function clean(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function readDeliveryDays(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) return null;
  const days = [];
  for (const item of value) {
    if (typeof item !== "number" && typeof item !== "string") return null;
    if (typeof item === "string" && !/^\d$/.test(item)) return null;
    const day = Number(item);
    if (!Number.isInteger(day) || day < 0 || day > 6) return null;
    if (!days.includes(day)) days.push(day);
  }
  days.sort((left, right) => left - right);
  return days.length ? days : null;
}

function blockingPayment(payments, nowMs) {
  return (payments || []).find((payment) => {
    if (payment.status === "paid" || payment.status === "pending") return true;
    if (payment.status === "starting") {
      const created = new Date(payment.createdAt).getTime();
      return Number.isFinite(created) && nowMs - created < 15 * 60 * 1000;
    }
    return false;
  });
}

function validatePackageOrder(body, options) {
  const source = body || {};
  const errors = [];
  if (clean(source.company, 80)) {
    return { errors: ["The order could not be submitted."], order: null };
  }

  const selected = findPackage(source.plan, source.mealsPerDay, source.duration);
  if (!selected) errors.push("Choose a meal plan, meals per day, and a length from 1 to 28 days.");
  const deliveryDays = readDeliveryDays(source.deliveryDays);
  if (!deliveryDays) errors.push("Choose at least one delivery day. All seven days can be selected.");

  const fullName = clean(source.fullName, 150);
  const email = clean(source.email, 150).toLowerCase();
  const phone = normalizePhone(source.countryCode || "971", source.nationalNumber);
  const addressLine = clean(source.addressLine, 300);
  const instructions = clean(source.instructions, 500);
  const startDate = clean(source.startDate, 10);
  const earliest = options && options.earliest;

  if (fullName.length < 2) errors.push("Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Enter a valid email address.");
  if (!isUaeMobile(phone)) errors.push("Enter a UAE mobile number.");
  if (addressLine.length < 8) errors.push("Enter the delivery address.");
  if (!parseISODate(startDate)) errors.push("Choose a delivery start date.");
  else if (earliest && startDate < earliest) errors.push(`The earliest delivery start date is ${earliest}.`);
  else if (earliest && startDate > formatISODate(addDays(parseISODate(earliest), 120))) {
    errors.push("Choose a delivery start date within the next 120 days.");
  }
  if (source.privacyConsent !== true) errors.push("Privacy consent is required before the order can be saved.");

  const deliveryDates =
    selected && deliveryDays && parseISODate(startDate)
      ? buildDeliveryDates(startDate, deliveryDays, selected.durationDays, [])
      : [];
  if (selected && deliveryDays && parseISODate(startDate) && deliveryDates.length !== selected.durationDays) {
    errors.push("The delivery schedule could not be calculated.");
  }

  if (errors.length || !selected || !deliveryDays) return { errors, order: null };

  return {
    errors: [],
    order: {
      slug: selected.slug,
      planName: selected.planName,
      calorieLabel: selected.calorieLabel,
      mealsPerDay: selected.mealsPerDay,
      durationDays: selected.durationDays,
      priceAed: selected.priceAed,
      priceFils: selected.priceFils,
      days: deliveryDays,
      dayLabels: deliveryDays.map((day) => DAY_NAMES[day]),
      fullName,
      email,
      phone,
      addressLine,
      instructions,
      startDate,
      endDate: deliveryDates[deliveryDates.length - 1],
      paymentStatus: "unpaid",
    },
  };
}

const INQUIRY_CONFIRMATION =
  "Thank you for your interest in Nature Fit Healthy Restaurant. Your meal plan inquiry has been received successfully. Our team will contact you shortly.";

module.exports = { validatePackageOrder, blockingPayment, readDeliveryDays, INQUIRY_CONFIRMATION };
