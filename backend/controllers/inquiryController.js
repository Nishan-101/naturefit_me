const { httpError } = require("../config/session");
const { PLANS, MEAL_IDS, DURATIONS } = require("../config/plans");
const { sendInquiryNotification } = require("../config/mailer");
const { normalizePhone } = require("../lib/phone");
const { validateProfile } = require("./profileController");
const customers = require("../models/customerModel");
const inquiries = require("../models/inquiryModel");

const ALLERGY_NOTE =
  "Allergy and dietary notes help the kitchen plan meals. They do not guarantee a meal is free of an allergen. Staff must confirm suitability before the plan starts. Meals are prepared in a kitchen that handles common allergens.";

function validateSelection(body) {
  const plan = PLANS.find((item) => item.id === body.plan || item.name === body.plan);
  const meals = Array.isArray(body.meals) ? [...new Set(body.meals)] : [];
  const days = Array.isArray(body.days) ? [...new Set(body.days.map(Number))].sort((a, b) => a - b) : [];
  const duration = Number(body.duration);
  const notes = String(body.notes || "").trim().slice(0, 1000);

  if (!plan) return "Choose a meal plan.";
  if (meals.some((meal) => !MEAL_IDS.includes(meal))) return "Choose meals from the list.";
  if (meals.length < 2 || (!meals.includes("lunch") && !meals.includes("dinner"))) {
    return "Select at least 2 meals, including lunch or dinner.";
  }
  if (days.length < 5 || days.some((day) => day < 0 || day > 6)) return "Select at least 5 days a week.";
  if (!DURATIONS.includes(duration)) return "Choose a plan length of 20, 24, 30, or 90 days.";
  return { plan, meals, days, duration, notes };
}

function inquiryMessage() {
  return "Thank you. Our team will reach you soon.";
}

async function deliverInquiryEmail(send, payload) {
  try {
    await send(payload);
    return true;
  } catch (error) {
    console.error("Inquiry email failed:", error.message);
    return false;
  }
}

function notificationPayload(inquiry, customer, profile) {
  return {
    inquiry,
    customer,
    profile,
    mealLabels: inquiry.mealLabels,
    dayLabels: inquiry.dayLabels,
    allergyNote: ALLERGY_NOTE,
  };
}

async function create(req, res, next) {
  try {
    const body = req.body || {};
    const selection = validateSelection(body);
    if (typeof selection === "string") throw httpError(400, selection);

    const phone = normalizePhone(body.countryCode, body.nationalNumber);
    if (!phone) throw httpError(400, "Enter a valid phone number, including the country code.");

    const checked = validateProfile(body, { requireEmail: true, inquiry: true });
    if (checked.errors.length) throw httpError(400, checked.errors[0]);

    let customer = await customers.findCustomerByPhone(phone);
    if (!customer) customer = await customers.createCustomer(phone);
    await customers.updateCustomerIdentity(customer.id, checked.fullName, checked.email);
    const profile = await customers.saveProfile(customer.id, checked.profile);
    customer = await customers.findCustomerById(customer.id);

    const duplicate = await inquiries.findOpenDuplicate({
      customerId: customer.id,
      planName: selection.plan.name,
      meals: selection.meals,
      days: selection.days,
      durationDays: selection.duration,
    });
    if (duplicate) {
      throw httpError(409, "You already sent this meal-plan inquiry. Nature Fit has it on file.");
    }

    const inquiry = await inquiries.createInquiry({
      customerId: customer.id,
      planName: selection.plan.name,
      meals: selection.meals,
      days: selection.days,
      durationDays: selection.duration,
      notes: selection.notes,
    });

    res.status(201).json({
      success: true,
      inquiryId: inquiry.id,
      message: inquiryMessage(),
    });

    deliverInquiryEmail(sendInquiryNotification, notificationPayload(inquiry, customer, profile))
      .then((emailSent) => inquiries.markEmailed(inquiry.id, emailSent))
      .catch((error) => console.error("Inquiry email failed:", error.message));
  } catch (error) {
    next(error);
  }
}

async function resendAdmin(req, res, next) {
  try {
    const inquiry = await inquiries.findInquiry(req.params.id);
    if (!inquiry) throw httpError(404, "Inquiry not found.");
    const customer = await customers.findCustomerById(inquiry.customerId);
    const profile = await customers.getProfile(inquiry.customerId);
    const emailSent = await deliverInquiryEmail(sendInquiryNotification, notificationPayload(inquiry, customer, profile));
    await inquiries.markEmailed(inquiry.id, emailSent);
    res.json({
      success: true,
      emailSent,
      message: emailSent ? "The kitchen email was sent." : "The inquiry is saved, but the email could not be sent.",
    });
  } catch (error) {
    next(error);
  }
}

function listPlans(req, res) {
  res.json({
    success: true,
    startingPriceAed: 1250,
    allergyNote: ALLERGY_NOTE,
    plans: PLANS,
  });
}

module.exports = {
  create,
  resendAdmin,
  listPlans,
  ALLERGY_NOTE,
  validateSelection,
  deliverInquiryEmail,
  inquiryMessage,
};
