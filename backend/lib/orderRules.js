const { DAY_NAMES, parseISODate, earliestDeliveryDate } = require("./schedule");

const METHODS = ["card", "bank_transfer", "cod", "to_be_confirmed"];

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isUaeMobile(phone) {
  return /^\+9715(0|2|4|5|6|8)\d{7}$/.test(phone);
}

function calorieLabel(band) {
  if (!band || band.minKcal == null || band.maxKcal == null) return null;
  if (Number(band.minKcal) === Number(band.maxKcal)) return `${band.minKcal} kcal`;
  return `${band.minKcal}–${band.maxKcal} kcal`;
}

function validateOrderInput(body, catalog) {
  const errors = [];
  const source = body || {};
  if (clean(source.company, 80)) errors.push("The order could not be submitted.");

  const plan = (catalog.plans || []).find((item) => item.slug === source.plan && item.active !== false);
  if (!plan) errors.push("Choose a meal plan.");

  const mealsPerDay = Number(source.mealsPerDay);
  if (![1, 2, 3, 4].includes(mealsPerDay)) errors.push("Choose 1, 2, 3, or 4 meals per day.");
  if (plan && mealsPerDay === 4 && !plan.allowFourMeals) errors.push("Four meals are not available on this plan.");

  const duration = (catalog.durations || []).find((item) => Number(item.days) === Number(source.duration) && item.active !== false);
  if (!duration) errors.push("Choose a subscription length.");

  const quoting = catalog.mode === "quote";
  const allowedDays = new Set((catalog.weekdays || []).map(Number));
  const days = Array.isArray(source.days) ? [...new Set(source.days.map(Number))].sort((a, b) => a - b) : [];
  const minimum = Number(catalog.minDeliveryDays) > 0 ? Number(catalog.minDeliveryDays) : 1;
  const slot = (catalog.slots || []).find((item) => Number(item.id) === Number(source.slotId) && item.active !== false);
  const start = parseISODate(source.startDate);
  const earliest = earliestDeliveryDate(catalog.now || new Date(), catalog.cutoffTime, Number(catalog.cutoffLeadDays));
  const emirate = clean(source.emirate, 40);

  if (!quoting) {
    if (days.some((day) => !allowedDays.has(day))) errors.push("Choose delivery days Nature Fit currently serves.");
    if (days.length < minimum) errors.push(`Select at least ${minimum} delivery day${minimum === 1 ? "" : "s"}.`);
    if (!slot) errors.push("Choose a delivery time.");
    if (!start) errors.push("Choose a start date.");
    else if (source.startDate < earliest) errors.push(`The earliest start date is ${earliest}.`);
    else if (!days.includes(start.getUTCDay())) errors.push("The start date has to be one of the selected delivery days.");
    if (!(catalog.emirates || []).includes(emirate)) errors.push("Choose an emirate Nature Fit delivers to.");
  }
  const fullName = clean(source.fullName, 150);
  const email = clean(source.email, 150).toLowerCase();
  const area = clean(source.area, 80);
  const building = clean(source.building, 160);
  const addressLine = clean(source.addressLine, 300);
  const instructions = clean(source.instructions, 500);
  const allergies = clean(source.allergies, 500);
  const password = String(source.password || "");

  if (!quoting) {
    if (fullName.length < 2) errors.push("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Enter a valid email address.");
    if (area.length < 2) errors.push("Enter your area.");
    if (building.length < 2) errors.push("Enter the building or apartment.");
    if (addressLine.length < 8) errors.push("Enter the delivery address.");
    if (source.privacyConsent !== true) errors.push("Privacy consent is required before the order can be saved.");
    if (source.allergyAcknowledged !== true) errors.push("Please confirm the allergy note.");
    if (catalog.requirePassword) {
      if (password.length < 8 || password.length > 100) errors.push("Choose a password of at least 8 characters.");
    }
  }

  const requestedMenu = Array.isArray(source.menuItemIds) ? [...new Set(source.menuItemIds.map(Number))] : [];
  const menuItemIds = catalog.mealCustomization
    ? requestedMenu.filter((id) => (catalog.menuItems || []).some((item) => Number(item.id) === id && item.active !== false))
    : [];
  if (catalog.mealCustomization && requestedMenu.length !== menuItemIds.length) {
    errors.push("One of the selected meals is no longer available.");
  }

  const requestedAddOns = Array.isArray(source.addOnIds) ? [...new Set(source.addOnIds.map(Number))] : [];
  const addOns = requestedAddOns.map((id) => (catalog.addOns || []).find((item) => Number(item.id) === id && item.active !== false));
  if (addOns.some((item) => !item)) errors.push("One of the selected add-ons is no longer available.");

  const method = METHODS.includes(source.paymentMethod) ? source.paymentMethod : quoting ? "to_be_confirmed" : "";
  if (!quoting && !method) errors.push("Choose a payment method.");

  const band = plan && (plan.calories || []).find((item) => Number(item.mealsPerDay) === mealsPerDay);

  return {
    errors,
    selection: {
      plan,
      mealsPerDay,
      durationDays: duration ? Number(duration.days) : null,
      days,
      dayLabels: days.map((day) => DAY_NAMES[day]),
      slot,
      startDate: start ? source.startDate : null,
      earliest,
      emirate,
      fullName,
      email,
      area,
      building,
      addressLine,
      instructions,
      allergies,
      password,
      privacyConsent: source.privacyConsent === true,
      whatsappOptIn: source.whatsappOptIn === true,
      allergyAcknowledged: source.allergyAcknowledged === true,
      menuItemIds,
      addOns: addOns.filter(Boolean),
      promoCode: clean(source.promoCode, 40).toUpperCase(),
      paymentMethod: method,
      calorieLabel: calorieLabel(band),
    },
  };
}

module.exports = { validateOrderInput, calorieLabel, isUaeMobile, METHODS };
