const fs = require("fs/promises");
const path = require("path");
const { httpError } = require("../config/session");
const { stripeMode } = require("../lib/stripe");
const catalogModel = require("../models/catalogModel");
const orders = require("../models/orderModel");
const { rebuildSubscription } = require("../lib/rebuild");
const { dubaiParts } = require("../lib/schedule");

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function sendCsv(res, filename, rows) {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(body);
}

async function overview(req, res, next) {
  try {
    const settings = await catalogModel.getSettings();
    const data = await catalogModel.catalog();
    res.json({
      success: true,
      orders: await orders.listAll(),
      pauses: await orders.pauseRequests(),
      scheduleDate: dubaiParts(new Date()).date,
      settings: { ...settings, bankDetails: settings.bankDetails },
      catalog: data,
      testimonials: await catalogModel.allTestimonials(),
      paymentGateway: stripeMode(),
    });
  } catch (error) {
    next(error);
  }
}

async function recordPayment(req, res, next) {
  try {
    const order = await orders.findById(Number(req.params.id));
    if (!order) throw httpError(404, "Order not found.");
    if (order.totalAed == null) throw httpError(400, "This order has no price to record.");
    if (order.paymentStatus === "paid") throw httpError(400, "This order is already marked paid.");
    const method = req.body.method;
    if (!["bank_transfer", "cod", "card"].includes(method)) throw httpError(400, "Choose a payment method.");
    const providerRef = clean(req.body.providerRef, 160);
    if (providerRef.length < 4) throw httpError(400, "Enter the bank reference or transaction ID.");
    await orders.insertPayment({
      orderId: order.id,
      provider: "staff",
      method,
      amountAed: order.totalAed,
      status: "paid",
      providerRef,
    });
    await orders.updatePaymentState(order.id, "paid", "paid");
    res.json({ success: true, message: "Payment recorded. The subscription is still waiting for approval." });
  } catch (error) {
    next(error);
  }
}

async function decide(req, res, next) {
  try {
    const order = await orders.findById(Number(req.params.id));
    if (!order) throw httpError(404, "Order not found.");
    const decision = req.body.decision;
    if (decision === "reject") {
      await orders.setOrderStatus(order.id, "rejected");
      if (order.subscriptionId) await orders.setSubscription(order.subscriptionId, "cancelled", order.endDate);
      res.json({ success: true, message: "Subscription rejected." });
      return;
    }
    if (decision !== "approve") throw httpError(400, "Choose approve or reject.");
    if (order.paymentStatus !== "paid") {
      throw httpError(400, "Record a verified payment before approving this subscription.");
    }
    await orders.setOrderStatus(order.id, "approved");
    await rebuildSubscription(order.subscriptionId, "active");
    res.json({ success: true, message: "Subscription approved and delivery days were calculated." });
  } catch (error) {
    next(error);
  }
}

async function decidePause(req, res, next) {
  try {
    const pause = await orders.findPause(Number(req.params.id));
    if (!pause) throw httpError(404, "Request not found.");
    const decision = req.body.decision === "approve" ? "approved" : "rejected";
    await orders.setPauseStatus(pause.id, decision);
    if (decision === "approved") await rebuildSubscription(pause.subscriptionId);
    res.json({ success: true, message: decision === "approved" ? "Schedule updated." : "Request rejected." });
  } catch (error) {
    next(error);
  }
}

async function savePrice(req, res, next) {
  try {
    const planSlug = clean(req.body.planSlug, 40);
    const mealsPerDay = Number(req.body.mealsPerDay);
    const durationDays = Number(req.body.durationDays);
    const raw = req.body.priceAed;
    const priceAed = raw === "" || raw == null ? null : Number(raw);
    if (!planSlug || ![1, 2, 3, 4].includes(mealsPerDay) || !Number.isInteger(durationDays)) {
      throw httpError(400, "Choose a plan, meal count, and duration.");
    }
    if (priceAed != null && (!Number.isFinite(priceAed) || priceAed < 0 || priceAed > 100000)) {
      throw httpError(400, "Enter a price in AED, or leave it blank to unpublish it.");
    }
    await catalogModel.upsertPrice({
      planSlug,
      mealsPerDay,
      durationDays,
      priceAed,
      active: req.body.active !== false,
    });
    res.json({ success: true, message: "Price saved." });
  } catch (error) {
    next(error);
  }
}

async function saveDuration(req, res, next) {
  try {
    const days = Number(req.body.days);
    const label = clean(req.body.label, 80);
    if (!Number.isInteger(days) || days < 1 || days > 366 || label.length < 2) {
      throw httpError(400, "Enter the number of delivery days and a label.");
    }
    await catalogModel.saveDuration({ id: Number(req.body.id) || null, days, label, active: req.body.active !== false });
    res.json({ success: true, message: "Duration saved." });
  } catch (error) {
    next(error);
  }
}

async function saveCalorie(req, res, next) {
  try {
    const mealsPerDay = Number(req.body.mealsPerDay);
    const minRaw = req.body.minKcal;
    const maxRaw = req.body.maxKcal;
    const minKcal = minRaw === "" || minRaw == null ? null : Number(minRaw);
    const maxKcal = maxRaw === "" || maxRaw == null ? null : Number(maxRaw);
    if (![1, 2, 3, 4].includes(mealsPerDay)) throw httpError(400, "Choose how many meals per day.");
    if ((minKcal == null) !== (maxKcal == null) || (minKcal != null && (minKcal < 0 || maxKcal < minKcal || maxKcal > 6000))) {
      throw httpError(400, "Enter both calorie values, or leave both blank.");
    }
    await catalogModel.saveCalorie({ planSlug: clean(req.body.planSlug, 40), mealsPerDay, minKcal, maxKcal });
    if (Object.prototype.hasOwnProperty.call(req.body, "allowFourMeals")) {
      const data = await catalogModel.catalog();
      const existing = data.plans.find((plan) => plan.slug === clean(req.body.planSlug, 40));
      const active = Object.prototype.hasOwnProperty.call(req.body, "active") ? req.body.active !== false : existing ? existing.active : true;
      await catalogModel.setPlanFlag(clean(req.body.planSlug, 40), req.body.allowFourMeals === true, active);
    }
    res.json({ success: true, message: "Calorie range saved." });
  } catch (error) {
    next(error);
  }
}

async function saveSlot(req, res, next) {
  try {
    const label = clean(req.body.label, 80);
    if (label.length < 2) throw httpError(400, "Enter the delivery time.");
    await catalogModel.saveSlot({ id: Number(req.body.id) || null, label, active: req.body.active !== false });
    res.json({ success: true, message: "Delivery time saved." });
  } catch (error) {
    next(error);
  }
}

async function saveAddOn(req, res, next) {
  try {
    const name = clean(req.body.name, 120);
    const priceAed = Number(req.body.priceAed);
    if (name.length < 2 || !Number.isFinite(priceAed) || priceAed < 0) throw httpError(400, "Enter an add-on name and price.");
    await catalogModel.saveAddOn({ id: Number(req.body.id) || null, name, priceAed, active: req.body.active !== false });
    res.json({ success: true, message: "Add-on saved." });
  } catch (error) {
    next(error);
  }
}

async function saveMenu(req, res, next) {
  try {
    const name = clean(req.body.name, 120);
    if (name.length < 2) throw httpError(400, "Enter the meal name.");
    const numberOrNull = (value) => (value === "" || value == null ? null : Number(value));
    const id = await catalogModel.saveMenuItem({
      id: Number(req.body.id) || null,
      name,
      description: clean(req.body.description, 400),
      category: clean(req.body.category, 40) || "Meal",
      kcal: numberOrNull(req.body.kcal),
      proteinG: numberOrNull(req.body.proteinG),
      carbsG: numberOrNull(req.body.carbsG),
      fatG: numberOrNull(req.body.fatG),
      active: req.body.active !== false,
    });
    res.json({ success: true, id, message: "Menu item saved." });
  } catch (error) {
    next(error);
  }
}

async function uploadMenuPhoto(req, res, next) {
  try {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(req.body.dataUrl || ""));
    if (!match) throw httpError(400, "Upload a PNG, JPG, or WebP image.");
    const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    if (buffer.length < 16 || buffer.length > 2 * 1024 * 1024) throw httpError(400, "Use an image under 2 MB.");
    const png = buffer[0] === 0x89 && buffer[1] === 0x50;
    const jpg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const webp = buffer.toString("ascii", 0, 4) === "RIFF";
    if (!png && !jpg && !webp) throw httpError(400, "The file is not a valid PNG, JPG, or WebP image.");
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const filename = `menu-${Number(req.params.id)}-${Date.now()}.${ext}`;
    const dir = path.join(__dirname, "../../frontend/images/uploads");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), buffer);
    await catalogModel.setMenuImage(Number(req.params.id), `images/uploads/${filename}`);
    res.json({ success: true, imagePath: `images/uploads/${filename}` });
  } catch (error) {
    next(error);
  }
}

async function removeMenu(req, res, next) {
  try {
    await catalogModel.deleteMenuItem(Number(req.params.id));
    res.json({ success: true, message: "Menu item removed." });
  } catch (error) {
    next(error);
  }
}

async function savePromo(req, res, next) {
  try {
    const code = clean(req.body.code, 40).toUpperCase();
    const discountType = req.body.discountType === "fixed" ? "fixed" : "percent";
    const discountValue = Number(req.body.discountValue);
    if (!/^[A-Z0-9-]{3,40}$/.test(code)) throw httpError(400, "Use a code of letters, numbers, or hyphens.");
    if (!Number.isFinite(discountValue) || discountValue <= 0) throw httpError(400, "Enter a discount value.");
    if (discountType === "percent" && discountValue > 100) throw httpError(400, "A percentage discount cannot be above 100.");
    const expiresAt = req.body.expiresAt ? String(req.body.expiresAt).slice(0, 10) : null;
    await catalogModel.savePromo({
      id: Number(req.body.id) || null,
      code,
      discountType,
      discountValue,
      active: req.body.active !== false,
      maxUses: req.body.maxUses === "" || req.body.maxUses == null ? null : Number(req.body.maxUses),
      expiresAt,
    });
    res.json({ success: true, message: "Promotional code saved." });
  } catch (error) {
    next(error);
  }
}

async function saveSettings(req, res, next) {
  try {
    const body = req.body || {};
    const weekdays = Array.isArray(body.delivery_weekdays) ? JSON.stringify(body.delivery_weekdays.map(Number)) : body.delivery_weekdays;
    const emirates = Array.isArray(body.service_emirates) ? JSON.stringify(body.service_emirates) : body.service_emirates;
    await catalogModel.updateSettings({
      ...body,
      delivery_weekdays: weekdays,
      service_emirates: emirates,
      whatsapp_business_number: String(body.whatsapp_business_number || "").replace(/\D/g, ""),
      whatsapp_mode: body.whatsapp_mode === "cloud_api" ? "cloud_api" : "click_to_chat",
      cod_enabled: body.cod_enabled === true || body.cod_enabled === "true" ? "true" : "false",
      bank_transfer_enabled: body.bank_transfer_enabled === true || body.bank_transfer_enabled === "true" ? "true" : "false",
      card_payments_enabled: body.card_payments_enabled === false || body.card_payments_enabled === "false" ? "false" : "true",
      meal_customization_enabled:
        body.meal_customization_enabled === true || body.meal_customization_enabled === "true" ? "true" : "false",
    });
    res.json({ success: true, message: "Settings saved." });
  } catch (error) {
    next(error);
  }
}

async function saveTestimonial(req, res, next) {
  try {
    const name = clean(req.body.name, 80);
    const quote = clean(req.body.quote, 600);
    if (name.length < 2 || quote.length < 8) throw httpError(400, "Enter the customer name and the review they approved.");
    await catalogModel.saveTestimonial({
      id: Number(req.body.id) || null,
      name,
      area: clean(req.body.area, 80),
      quote,
      approved: req.body.approved === true,
    });
    res.json({ success: true, message: "Review saved. It appears on the site only when approved." });
  } catch (error) {
    next(error);
  }
}

async function schedule(req, res, next) {
  try {
    const date = String(req.query.date || dubaiParts(new Date()).date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, "Choose a date.");
    res.json({ success: true, date, deliveries: await orders.scheduleForDate(date) });
  } catch (error) {
    next(error);
  }
}

async function exportOrders(req, res, next) {
  try {
    const list = await orders.listAll();
    const rows = [
      ["Reference", "Customer", "Phone", "Email", "Plan", "Meals per day", "Duration", "Start", "End", "Total AED", "Payment", "Order status"],
      ...list.map((order) => [
        order.reference,
        order.customerName,
        order.customerPhone,
        order.customerEmail,
        order.planName,
        order.mealsPerDay,
        order.durationDays,
        order.startDate,
        order.endDate,
        order.totalAed == null ? "" : order.totalAed,
        order.paymentStatus,
        order.orderStatus,
      ]),
    ];
    sendCsv(res, "nature-fit-orders.csv", rows);
  } catch (error) {
    next(error);
  }
}

async function exportCustomers(req, res, next) {
  try {
    const customers = require("../models/customerModel");
    const list = await customers.listCustomers();
    const rows = [
      ["Name", "Phone", "Email", "Goal", "Allergies", "Address"],
      ...list.map((customer) => [
        customer.fullName,
        customer.phone,
        customer.email,
        customer.profile ? customer.profile.primaryGoal : "",
        customer.profile && customer.profile.allergies ? customer.profile.allergies.join("; ") : "",
        customer.profile ? customer.profile.deliveryAddress : "",
      ]),
    ];
    sendCsv(res, "nature-fit-customers.csv", rows);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  overview,
  recordPayment,
  decide,
  decidePause,
  savePrice,
  saveDuration,
  saveCalorie,
  saveSlot,
  saveAddOn,
  saveMenu,
  uploadMenuPhoto,
  removeMenu,
  savePromo,
  saveSettings,
  saveTestimonial,
  schedule,
  exportOrders,
  exportCustomers,
};
