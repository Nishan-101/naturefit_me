const { httpError } = require("../config/session");
const { normalizePhone } = require("../lib/phone");
const { isUaeMobile } = require("../lib/orderRules");
const { validateOrderInput } = require("../lib/orderRules");
const { quoteTotals } = require("../lib/pricing");
const { toFils, displayAed } = require("../lib/money");
const { businessChatLink, orderMessage, customerTemplateParameters, packageChatMessage } = require("../lib/whatsapp");
const { stripeMode, createCheckoutSession } = require("../lib/stripe");
const { hashPassword } = require("../lib/passwords");
const catalogModel = require("../models/catalogModel");
const orders = require("../models/orderModel");
const customers = require("../models/customerModel");
const { sendOrderNotification } = require("../config/mailer");
const { buildDeliveryDates } = require("../lib/schedule");

function siteOrigin() {
  return (process.env.PUBLIC_SITE_URL || "https://naturefit.site").replace(/\/$/, "");
}

async function context(mode, requirePassword) {
  const settings = await catalogModel.getSettings();
  const data = await catalogModel.catalog();
  return {
    settings,
    data,
    catalog: {
      mode,
      plans: data.plans,
      durations: data.durations,
      slots: data.slots,
      weekdays: settings.weekdays,
      minDeliveryDays: settings.minDeliveryDays,
      emirates: settings.emirates,
      addOns: data.addOns,
      menuItems: data.menu,
      mealCustomization: settings.mealCustomization,
      cutoffTime: settings.cutoffTime,
      cutoffLeadDays: settings.cutoffLeadDays,
      now: new Date(),
      requirePassword,
    },
  };
}

async function priceSelection(selection) {
  const settings = await catalogModel.getSettings();
  const priceAed = await catalogModel.findPrice(selection.plan.slug, selection.mealsPerDay, selection.durationDays);
  const promo = selection.promoCode ? await catalogModel.findPromo(selection.promoCode) : null;
  if (selection.promoCode && !promo) {
    throw httpError(400, "That promotional code is not active.");
  }
  const totals = quoteTotals({
    priceAed,
    addOnPrices: selection.addOns.map((item) => item.priceAed),
    promo,
    deliveryFeeAed: settings.deliveryFeeAed,
  });
  return { totals, promo, settings };
}

function assertMethod(method, totals, settings) {
  if (!totals.priced) {
    if (method !== "to_be_confirmed") {
      throw httpError(400, "Nature Fit has not published a price for this package yet. Submit it for confirmation.");
    }
    return;
  }
  if (method === "to_be_confirmed") throw httpError(400, "Choose a payment method.");
  if (method === "card" && !settings.cardEnabled) throw httpError(400, "Card payments are turned off.");
  if (method === "bank_transfer" && (!settings.bankTransferEnabled || !settings.bankDetails)) {
    throw httpError(400, "Bank transfer is not available.");
  }
  if (method === "cod" && !settings.codEnabled) throw httpError(400, "Cash on delivery is not available.");
}

function publicQuote(selection, totals) {
  return {
    success: true,
    currency: "AED",
    plan: selection.plan.name,
    mealsPerDay: selection.mealsPerDay,
    durationDays: selection.durationDays,
    calorieLabel: selection.calorieLabel,
    priced: totals.priced,
    subtotalAed: totals.subtotalAed,
    addOnsAed: totals.addOnsAed,
    discountAed: totals.discountAed,
    deliveryFeeAed: totals.deliveryFeeAed,
    totalAed: totals.totalAed,
    message: totals.priced
      ? null
      : "Nature Fit has not published a price for this plan, meal count, and duration. The kitchen will confirm it.",
  };
}

async function quote(req, res, next) {
  try {
    const { catalog } = await context("quote", false);
    const checked = validateOrderInput(req.body, catalog);
    if (checked.errors.length) throw httpError(400, checked.errors[0]);
    const { totals } = await priceSelection(checked.selection);
    res.json(publicQuote(checked.selection, totals));
  } catch (error) {
    next(error);
  }
}

async function attachCustomer(body, selection, session) {
  const phone = normalizePhone(body.countryCode || "971", body.nationalNumber);
  if (!isUaeMobile(phone)) throw httpError(400, "Enter a UAE mobile number.");

  if (session && session.role === "customer") {
    const customer = await customers.findCustomerById(session.sub);
    if (!customer) throw httpError(401, "Please log in again.");
    if (customer.phone_e164 !== phone) {
      throw httpError(400, "Use the mobile number on your Nature Fit account, or log out to use a different number.");
    }
    await customers.updateCustomerIdentity(customer.id, selection.fullName, selection.email);
    await customers.setConsent(customer.id, selection);
    return customer;
  }

  const byPhone = await customers.findCustomerByPhone(phone);
  const byEmail = await customers.findCustomerByEmail(selection.email);
  if (byEmail && (!byPhone || byEmail.id !== byPhone.id)) {
    throw httpError(409, "That email is already used by another Nature Fit account. Log in instead.");
  }
  if (byPhone && byPhone.password_hash) {
    throw httpError(409, "This mobile number already has an account. Log in to continue.");
  }
  if (byPhone && byPhone.email && byPhone.email.toLowerCase() !== selection.email) {
    throw httpError(409, "This mobile number is already linked to a different email. Log in or contact Nature Fit.");
  }
  const customer = byPhone || (await customers.createCustomer(phone));
  await customers.updateCustomerIdentity(customer.id, selection.fullName, selection.email);
  await customers.setPassword(customer.id, hashPassword(selection.password));
  await customers.setConsent(customer.id, selection);
  return customers.findCustomerById(customer.id);
}

async function prepareWhatsapp(order) {
  const settings = await catalogModel.getSettings();
  const text = orderMessage(order);
  const claimed = await orders.claimWhatsappLog({
    orderId: order.id,
    direction: "business_link",
    status: "prepared",
    recipient: settings.whatsappNumber,
    bodyPreview: text,
  });
  let url = order.whatsappClickUrl;
  if (claimed) {
    url = businessChatLink(settings.whatsappNumber, text);
    if (url) await orders.setWhatsappLink(order.id, url);
  }
  let customerNotice = null;
  const mode = stripeMode();
  if (order.whatsappOptIn && settings.whatsappMode === "cloud_api") {
    customerNotice = await sendCustomerTemplate(order);
  } else if (order.whatsappOptIn) {
    customerNotice =
      "WhatsApp confirmation to your phone is not automatic. Click-to-chat only opens a message for you to send to Nature Fit.";
  }
  return {
    mode: "click_to_chat",
    automatic: false,
    url: url || order.whatsappClickUrl,
    explanation:
      "This opens WhatsApp with the order written out. Nature Fit does not send it until you press send in WhatsApp.",
    customerNotice,
    gateway: mode,
  };
}

async function sendCustomerTemplate(order) {
  const token = process.env.WHATSAPP_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const template = process.env.WHATSAPP_TEMPLATE_NAME || "";
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en";
  if (!token || !phoneNumberId || !template) {
    return "Customer WhatsApp is not configured. Set the Cloud API token, phone number ID, and approved template name on the server.";
  }
  const claimed = await orders.claimWhatsappLog({
    orderId: order.id,
    direction: "customer_template",
    status: "sending",
    recipient: order.customerPhone,
    bodyPreview: customerTemplateParameters(order).join(" | "),
  });
  if (!claimed) return "A WhatsApp confirmation was already recorded for this order.";
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: String(order.customerPhone || "").replace(/\D/g, ""),
        type: "template",
        template: {
          name: template,
          language: { code: lang },
          components: [
            {
              type: "body",
              parameters: customerTemplateParameters(order).map((text) => ({ type: "text", text: String(text).slice(0, 900) })),
            },
          ],
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error && payload.error.message ? payload.error.message : "WhatsApp rejected the template.";
      await orders.finishWhatsappLog({
        orderId: order.id,
        direction: "customer_template",
        status: "failed",
        errorMessage: message,
      });
      return message;
    }
    const messageId = payload.messages && payload.messages[0] ? payload.messages[0].id : null;
    await orders.finishWhatsappLog({
      orderId: order.id,
      direction: "customer_template",
      status: "sent",
      providerMessageId: messageId,
    });
    return "A WhatsApp template confirmation was sent.";
  } catch (error) {
    await orders.finishWhatsappLog({
      orderId: order.id,
      direction: "customer_template",
      status: "failed",
      errorMessage: error.message,
    });
    return "The WhatsApp confirmation could not be sent. Your order is still saved.";
  }
}

async function startCardPayment(order) {
  const mode = stripeMode();
  const secret = process.env.STRIPE_SECRET_KEY || "";
  if (mode === "not_configured" || !secret) {
    await orders.insertPayment({
      orderId: order.id,
      provider: "test",
      method: "card",
      amountAed: order.totalAed,
      status: "awaiting_gateway",
      providerRef: null,
    });
    await orders.updatePaymentState(order.id, "unpaid", "awaiting_gateway");
    return {
      checkoutUrl: null,
      testMode: true,
      message:
        "Card checkout is not live. No payment was taken. Add a Stripe secret key and webhook secret on the server before customers can pay by card.",
    };
  }
  const session = await createCheckoutSession({
    secretKey: secret,
    reference: order.reference,
    amountFils: toFils(order.totalAed),
    successUrl: `${siteOrigin()}/order?ref=${encodeURIComponent(order.reference)}`,
    cancelUrl: `${siteOrigin()}/order?ref=${encodeURIComponent(order.reference)}`,
    customerEmail: order.customerEmail,
  });
  await orders.insertPayment({
    orderId: order.id,
    provider: mode,
    method: "card",
    amountAed: order.totalAed,
    status: "pending",
    providerRef: session.id,
  });
  await orders.updatePaymentState(order.id, "pending", "pending_payment");
  return {
    checkoutUrl: session.url,
    testMode: mode === "stripe_test",
    message: mode === "stripe_test" ? "Stripe is in test mode. A real card will not be charged." : null,
  };
}

async function create(req, res, next) {
  try {
    const session = req.auth && req.auth.role === "customer" ? req.auth : null;
    const { catalog, settings } = await context("order", !session);
    const checked = validateOrderInput(req.body, catalog);
    if (checked.errors.length) throw httpError(400, checked.errors[0]);
    const selection = checked.selection;
    const { totals, promo } = await priceSelection(selection);
    assertMethod(selection.paymentMethod, totals, settings);

    const customer = await attachCustomer(req.body, selection, session);
    const duplicate = await orders.findRecentDuplicate({
      customerId: customer.id,
      planSlug: selection.plan.slug,
      mealsPerDay: selection.mealsPerDay,
      durationDays: selection.durationDays,
      startDate: selection.startDate,
    });
    if (duplicate) {
      const whatsapp = await prepareWhatsapp({ ...duplicate, customerName: customer.full_name, customerPhone: customer.phone_e164, customerEmail: customer.email });
      res.status(200).json(await confirmationPayload(duplicate, whatsapp, null));
      return;
    }

    let paymentStatus = "unpaid";
    let orderStatus = totals.priced ? "pending_payment" : "awaiting_price";
    if (!totals.priced) orderStatus = "awaiting_price";
    const order = await orders.createOrder({
      customerId: customer.id,
      planSlug: selection.plan.slug,
      planName: selection.plan.name,
      mealsPerDay: selection.mealsPerDay,
      durationDays: selection.durationDays,
      days: selection.days,
      deliverySlotId: selection.slot.id,
      deliverySlotLabel: selection.slot.label,
      startDate: selection.startDate,
      addressLine: selection.addressLine,
      emirate: selection.emirate,
      area: selection.area,
      building: selection.building,
      instructions: selection.instructions,
      allergies: selection.allergies,
      menuItemIds: selection.menuItemIds,
      addOnIds: selection.addOns.map((item) => item.id),
      promoCode: promo ? promo.code : null,
      promoId: promo ? promo.id : null,
      subtotalAed: totals.subtotalAed,
      discountAed: totals.discountAed,
      deliveryFeeAed: totals.deliveryFeeAed,
      totalAed: totals.totalAed,
      priceStatus: totals.priced ? "priced" : "unpriced",
      paymentMethod: selection.paymentMethod,
      paymentStatus,
      orderStatus,
      privacyConsent: true,
      whatsappOptIn: selection.whatsappOptIn,
      calorieLabel: selection.calorieLabel,
    });

    await customers.updateDelivery(customer.id, {
      deliveryAddress: selection.addressLine,
      deliveryInstructions: selection.instructions,
      emirate: selection.emirate,
      area: selection.area,
      building: selection.building,
    });

    let payment = null;
    if (selection.paymentMethod === "card" && totals.priced) {
      payment = await startCardPayment(order);
    } else if (selection.paymentMethod === "bank_transfer" && totals.priced) {
      await orders.insertPayment({
        orderId: order.id,
        provider: "manual",
        method: "bank_transfer",
        amountAed: order.totalAed,
        status: "pending",
        providerRef: null,
      });
      payment = { bankDetails: settings.bankDetails, message: "Transfer the exact total and send the receipt to Nature Fit. The plan starts after the payment is verified." };
    } else if (selection.paymentMethod === "cod" && totals.priced) {
      await orders.insertPayment({
        orderId: order.id,
        provider: "manual",
        method: "cod",
        amountAed: order.totalAed,
        status: "pending",
        providerRef: null,
      });
      payment = { message: "Cash on delivery is recorded as unpaid until Nature Fit confirms collection." };
    }

    const fresh = await orders.findById(order.id);
    const named = {
      ...fresh,
      customerName: selection.fullName,
      customerPhone: customer.phone_e164,
      customerEmail: selection.email,
    };
    const whatsapp = await prepareWhatsapp(named);
    sendOrderNotification(named)
      .then(() => orders.markEmailed(order.id, true))
      .catch((error) => {
        console.error("Order email failed:", error.message);
        orders.markEmailed(order.id, false);
      });

    res.status(201).json(await confirmationPayload(fresh, whatsapp, payment));
  } catch (error) {
    next(error);
  }
}

async function confirmationPayload(order, whatsapp, payment) {
  const fresh = await orders.findById(order.id);
  return {
    success: true,
    reference: fresh.reference,
    orderStatus: fresh.orderStatus,
    paymentStatus: fresh.paymentStatus,
    totalAed: fresh.totalAed,
    currency: "AED",
    priced: fresh.priceStatus === "priced",
    whatsapp,
    payment,
    message: "Your order is saved. A subscription starts only after payment is verified and Nature Fit approves it.",
  };
}

async function status(req, res, next) {
  try {
    const order = await orders.findByReference(req.params.reference);
    if (!order) throw httpError(404, "Order not found.");
    const paid = order.paymentStatus === "paid";
    const deliveryDates = buildDeliveryDates(order.startDate, order.days, order.durationDays, []);
    const endDate = order.endDate || deliveryDates[deliveryDates.length - 1] || null;
    let paymentReference = null;
    let stripeSessionId = null;
    let whatsappUrl = null;
    if (paid) {
      const payments = await orders.paymentsForOrder(order.id);
      const paidPayment = payments.find((item) => item.status === "paid");
      paymentReference = (paidPayment && paidPayment.providerRef) || null;
      stripeSessionId =
        (paidPayment && paidPayment.checkoutSessionId) ||
        (paidPayment && String(paidPayment.providerRef || "").startsWith("cs_") ? paidPayment.providerRef : null);
      const settings = await catalogModel.getSettings();
      whatsappUrl = businessChatLink(
        settings.whatsappNumber || "971502483083",
        packageChatMessage({ ...order, endDate }, paymentReference || "Verified by the payment provider")
      );
    }
    res.json({
      success: true,
      reference: order.reference,
      planName: order.planName,
      mealsPerDay: order.mealsPerDay,
      durationDays: order.durationDays,
      dayLabels: order.dayLabels,
      startDate: order.startDate,
      endDate,
      customerName: order.customerName,
      addressLine: order.addressLine,
      totalAed: order.totalAed,
      totalLabel: displayAed(order.totalAed),
      currency: "AED",
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      subscriptionStatus: order.subscriptionStatus,
      paid,
      paymentReference: paid ? paymentReference : null,
      stripeSessionId: paid ? stripeSessionId : null,
      whatsappUrl: paid ? whatsappUrl : null,
      whatsappNote: paid
        ? "This opens WhatsApp with your order written out. It is not sent until you press send in WhatsApp."
        : null,
    });
  } catch (error) {
    next(error);
  }
}

async function pay(req, res, next) {
  try {
    const order = await orders.findByReference(req.params.reference);
    if (!order || order.customerId !== req.auth.sub) throw httpError(404, "Order not found.");
    if (order.paymentStatus === "paid") throw httpError(400, "This order is already paid.");
    if (order.totalAed == null) throw httpError(400, "This order has no published price yet.");
    const settings = await catalogModel.getSettings();
    const method = req.body.paymentMethod;
    assertMethod(method, { priced: true }, settings);
    if (method === "card") {
      const payment = await startCardPayment(order);
      const fresh = await orders.findById(order.id);
      res.json({ success: true, reference: fresh.reference, paymentStatus: fresh.paymentStatus, payment });
      return;
    }
    await orders.updatePaymentState(order.id, "pending", "pending_payment");
    await orders.insertPayment({
      orderId: order.id,
      provider: "manual",
      method,
      amountAed: order.totalAed,
      status: "pending",
      providerRef: null,
    });
    res.json({
      success: true,
      reference: order.reference,
      paymentStatus: "pending",
      payment: method === "bank_transfer" ? { bankDetails: settings.bankDetails } : { message: "Cash on delivery stays unpaid until Nature Fit confirms it." },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { quote, create, status, pay, prepareWhatsapp, sendCustomerTemplate };
