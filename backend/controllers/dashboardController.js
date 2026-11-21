const { httpError } = require("../config/session");
const { earliestDeliveryDate, dubaiParts, remainingDeliveryDays } = require("../lib/schedule");
const { quoteTotals } = require("../lib/pricing");
const catalogModel = require("../models/catalogModel");
const orders = require("../models/orderModel");
const customers = require("../models/customerModel");
const { normalizePhone } = require("../lib/phone");
const { isUaeMobile } = require("../lib/orderRules");

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function ownedSubscription(id, customerId) {
  const subscription = await orders.subscriptionById(id);
  if (!subscription || subscription.customerId !== customerId) throw httpError(404, "Meal plan not found.");
  return subscription;
}

async function nextLocked(subscription) {
  const settings = await catalogModel.getSettings();
  const earliest = earliestDeliveryDate(new Date(), settings.cutoffTime, settings.cutoffLeadDays);
  const deliveries = await orders.deliveriesFor(subscription.id);
  const today = dubaiParts(new Date()).date;
  const next = deliveries.find((item) => item.status === "scheduled" && item.date >= today);
  return { settings, earliest, deliveries, today, next, locked: Boolean(next && next.date < earliest) };
}

async function dashboard(req, res, next) {
  try {
    const customer = await customers.findCustomerById(req.auth.sub);
    const list = await orders.listForCustomer(customer.id);
    const today = dubaiParts(new Date()).date;
    const plans = [];
    for (const order of list) {
      const deliveries = order.subscriptionId ? await orders.deliveriesFor(order.subscriptionId) : [];
      const upcoming = deliveries.filter((item) => item.status === "scheduled" && item.date >= today).slice(0, 8);
      plans.push({
        ...order,
        deliveries,
        upcoming,
        remainingDeliveryDays: remainingDeliveryDays(deliveries, today),
      });
    }
    const settings = await catalogModel.getSettings();
    res.json({
      success: true,
      customer: customers.publicCustomer(customer),
      plans,
      payments: await orders.paymentsForCustomer(customer.id),
      supportWhatsapp: settings.whatsappNumber ? `https://wa.me/${settings.whatsappNumber}` : null,
    });
  } catch (error) {
    next(error);
  }
}

async function updateAddress(req, res, next) {
  try {
    const order = await orders.findByReference(req.body.reference);
    if (!order || order.customerId !== req.auth.sub) throw httpError(404, "Order not found.");
    if (order.subscriptionStatus === "active" || order.subscriptionStatus === "paused") {
      const subscription = await orders.subscriptionById(order.subscriptionId);
      const lock = await nextLocked(subscription);
      if (lock.locked) {
        throw httpError(400, `Address changes need to be in before ${lock.earliest}. The next delivery is already inside the cut-off.`);
      }
    }
    const settings = await catalogModel.getSettings();
    const emirate = clean(req.body.emirate, 40);
    const area = clean(req.body.area, 80);
    const building = clean(req.body.building, 160);
    const addressLine = clean(req.body.addressLine, 300);
    const instructions = clean(req.body.instructions, 500);
    if (!settings.emirates.includes(emirate)) throw httpError(400, "Choose an emirate Nature Fit delivers to.");
    if (area.length < 2 || building.length < 2 || addressLine.length < 8) {
      throw httpError(400, "Enter the area, building, and delivery address.");
    }
    await orders.updateAddress(order.id, { addressLine, emirate, area, building, instructions });
    await customers.updateDelivery(order.customerId, {
      deliveryAddress: addressLine,
      deliveryInstructions: instructions,
      emirate,
      area,
      building,
    });
    res.json({ success: true, message: "Delivery address updated." });
  } catch (error) {
    next(error);
  }
}

async function requestChange(req, res, next) {
  try {
    const subscription = await ownedSubscription(req.params.id, req.auth.sub);
    if (!["active", "paused"].includes(subscription.status)) {
      throw httpError(400, "Pause and resume are available after Nature Fit approves the subscription.");
    }
    const type = req.body.type === "resume" ? "resume" : "pause";
    const startDate = String(req.body.startDate || "");
    const endDate = String(req.body.endDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
      throw httpError(400, "Choose a valid date range.");
    }
    const lock = await nextLocked(subscription);
    if (startDate < lock.earliest) {
      throw httpError(400, `Changes need to start on or after ${lock.earliest}, which is outside the cut-off.`);
    }
    const id = await orders.createPause({
      subscriptionId: subscription.id,
      customerId: req.auth.sub,
      requestType: type,
      startDate,
      endDate,
      reason: clean(req.body.reason, 300),
    });
    res.status(201).json({
      success: true,
      id,
      message: type === "pause" ? "Pause request sent to Nature Fit." : "Resume request sent to Nature Fit.",
    });
  } catch (error) {
    next(error);
  }
}

async function renew(req, res, next) {
  try {
    const subscription = await ownedSubscription(req.params.id, req.auth.sub);
    const order = await orders.findById(subscription.orderId);
    const startDate = String(req.body.startDate || "");
    const settings = await catalogModel.getSettings();
    const earliest = earliestDeliveryDate(new Date(), settings.cutoffTime, settings.cutoffLeadDays);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < earliest) {
      throw httpError(400, `Choose a renewal start date on or after ${earliest}.`);
    }
    const weekday = new Date(`${startDate}T00:00:00Z`).getUTCDay();
    if (!order.days.includes(weekday)) throw httpError(400, "The renewal start date has to match the delivery days.");
    const priceAed = await catalogModel.findPrice(order.planSlug, order.mealsPerDay, order.durationDays);
    const totals = quoteTotals({ priceAed, addOnPrices: [], promo: null, deliveryFeeAed: settings.deliveryFeeAed });
    const created = await orders.createOrder({
      customerId: order.customerId,
      planSlug: order.planSlug,
      planName: order.planName,
      mealsPerDay: order.mealsPerDay,
      durationDays: order.durationDays,
      days: order.days,
      deliverySlotId: order.deliverySlotId,
      deliverySlotLabel: order.deliverySlotLabel,
      startDate,
      addressLine: order.addressLine,
      emirate: order.emirate,
      area: order.area,
      building: order.building,
      instructions: order.instructions,
      allergies: order.allergies,
      menuItemIds: [],
      addOnIds: [],
      promoCode: null,
      subtotalAed: totals.subtotalAed,
      discountAed: 0,
      deliveryFeeAed: totals.deliveryFeeAed,
      totalAed: totals.totalAed,
      priceStatus: totals.priced ? "priced" : "unpriced",
      paymentMethod: "to_be_confirmed",
      paymentStatus: "unpaid",
      orderStatus: totals.priced ? "pending_payment" : "awaiting_price",
      privacyConsent: true,
      whatsappOptIn: order.whatsappOptIn,
      calorieLabel: order.calorieLabel,
    });
    res.status(201).json({
      success: true,
      reference: created.reference,
      totalAed: created.totalAed,
      message: "Renewal request saved. It stays unpaid until a payment is verified.",
    });
  } catch (error) {
    next(error);
  }
}

async function support(req, res, next) {
  try {
    const settings = await catalogModel.getSettings();
    const customer = await customers.findCustomerById(req.auth.sub);
    if (!isUaeMobile(customer.phone_e164) && !settings.whatsappNumber) {
      throw httpError(400, "WhatsApp support is not configured.");
    }
    const digits = normalizePhone("971", customer.phone_e164) || customer.phone_e164;
    res.json({
      success: true,
      url: settings.whatsappNumber
        ? `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(`Hello Nature Fit, I need help with my meal plan. My number is ${digits}.`)}`
        : null,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { dashboard, updateAddress, requestChange, renew, support };
