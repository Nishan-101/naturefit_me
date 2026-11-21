const { pool } = require("../config/db");

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const PUBLIC_KEYS = [
  "whatsapp_business_number",
  "whatsapp_mode",
  "delivery_weekdays",
  "min_delivery_days",
  "delivery_fee_aed",
  "cod_enabled",
  "bank_transfer_enabled",
  "bank_details",
  "card_payments_enabled",
  "meal_customization_enabled",
  "change_cutoff_time",
  "change_cutoff_lead_days",
  "service_emirates",
  "instagram_url",
  "facebook_url",
  "public_phone",
  "public_email",
  "public_address",
  "public_hours",
];

async function allSettings() {
  const [rows] = await pool.execute("SELECT setting_key, setting_value FROM app_settings");
  const settings = {};
  rows.forEach((row) => {
    settings[row.setting_key] = row.setting_value;
  });
  return settings;
}

function readSettings(raw) {
  const bool = (key) => raw[key] === "true";
  return {
    whatsappNumber: String(raw.whatsapp_business_number || "").replace(/\D/g, ""),
    whatsappMode: raw.whatsapp_mode === "cloud_api" ? "cloud_api" : "click_to_chat",
    weekdays: parseJson(raw.delivery_weekdays, [0, 1, 2, 3, 4, 5, 6]).map(Number),
    minDeliveryDays: Number(raw.min_delivery_days) || 1,
    deliveryFeeAed: raw.delivery_fee_aed == null || raw.delivery_fee_aed === "" ? 0 : Number(raw.delivery_fee_aed),
    codEnabled: bool("cod_enabled"),
    bankTransferEnabled: bool("bank_transfer_enabled"),
    bankDetails: raw.bank_details || "",
    cardEnabled: raw.card_payments_enabled !== "false",
    mealCustomization: bool("meal_customization_enabled"),
    cutoffTime: /^\d{2}:\d{2}$/.test(raw.change_cutoff_time || "") ? raw.change_cutoff_time : "18:00",
    cutoffLeadDays: Number(raw.change_cutoff_lead_days) >= 0 ? Number(raw.change_cutoff_lead_days) : 1,
    emirates: parseJson(raw.service_emirates, ["Dubai"]),
    instagramUrl: raw.instagram_url || "",
    facebookUrl: raw.facebook_url || "",
    phone: raw.public_phone || "",
    email: raw.public_email || "",
    address: raw.public_address || "",
    hours: raw.public_hours || "",
  };
}

async function getSettings() {
  return readSettings(await allSettings());
}

async function updateSettings(input) {
  const current = await allSettings();
  const next = { ...current };
  PUBLIC_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) next[key] = input[key] == null ? "" : String(input[key]);
  });
  for (const key of PUBLIC_KEYS) {
    await pool.execute(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, next[key] ?? ""]
    );
  }
  return readSettings(next);
}

function shapePlan(row, calories) {
  return {
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    description: row.description,
    benefits: parseJson(row.benefits, []),
    active: Boolean(row.active),
    allowFourMeals: Boolean(row.allow_four_meals),
    calories: calories
      .filter((band) => band.plan_slug === row.slug)
      .map((band) => ({
        mealsPerDay: Number(band.meals_per_day),
        minKcal: band.min_kcal == null ? null : Number(band.min_kcal),
        maxKcal: band.max_kcal == null ? null : Number(band.max_kcal),
      })),
  };
}

async function catalog() {
  const [plans] = await pool.execute("SELECT * FROM meal_plan_catalog ORDER BY sort_order, id");
  const [calories] = await pool.execute("SELECT * FROM calorie_bands ORDER BY meals_per_day");
  const [durations] = await pool.execute("SELECT * FROM plan_durations ORDER BY sort_order, days");
  const [slots] = await pool.execute("SELECT * FROM delivery_slots ORDER BY sort_order, id");
  const [prices] = await pool.execute("SELECT * FROM price_rules ORDER BY plan_slug, meals_per_day, duration_days");
  const [addOns] = await pool.execute("SELECT * FROM add_ons ORDER BY name");
  const [menu] = await pool.execute("SELECT * FROM menu_items ORDER BY sort_order, name");
  const [promos] = await pool.execute("SELECT * FROM promo_codes ORDER BY code");
  return {
    plans: plans.map((row) => shapePlan(row, calories)),
    durations: durations.map((row) => ({
      id: row.id,
      days: Number(row.days),
      label: row.label,
      active: Boolean(row.active),
    })),
    slots: slots.map((row) => ({ id: row.id, label: row.label, active: Boolean(row.active) })),
    prices: prices.map((row) => ({
      id: row.id,
      planSlug: row.plan_slug,
      mealsPerDay: Number(row.meals_per_day),
      durationDays: Number(row.duration_days),
      priceAed: row.price_aed == null ? null : Number(row.price_aed),
      active: Boolean(row.active),
    })),
    addOns: addOns.map((row) => ({
      id: row.id,
      name: row.name,
      priceAed: Number(row.price_aed),
      active: Boolean(row.active),
    })),
    menu: menu.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      kcal: row.kcal == null ? null : Number(row.kcal),
      proteinG: row.protein_g == null ? null : Number(row.protein_g),
      carbsG: row.carbs_g == null ? null : Number(row.carbs_g),
      fatG: row.fat_g == null ? null : Number(row.fat_g),
      imagePath: row.image_path,
      active: Boolean(row.active),
    })),
    promos: promos.map((row) => ({
      id: row.id,
      code: row.code,
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      active: Boolean(row.active),
      maxUses: row.max_uses == null ? null : Number(row.max_uses),
      uses: Number(row.uses),
      expiresAt: row.expires_at ? String(row.expires_at).slice(0, 10) : null,
    })),
  };
}

async function findPrice(planSlug, mealsPerDay, durationDays) {
  const [rows] = await pool.execute(
    `SELECT * FROM price_rules
     WHERE plan_slug = ? AND meals_per_day = ? AND duration_days = ? AND active = 1
     LIMIT 1`,
    [planSlug, mealsPerDay, durationDays]
  );
  if (!rows[0] || rows[0].price_aed == null) return null;
  return Number(rows[0].price_aed);
}

async function findPromo(code) {
  if (!code) return null;
  const [rows] = await pool.execute("SELECT * FROM promo_codes WHERE code = ? LIMIT 1", [code]);
  const row = rows[0];
  if (!row || !row.active) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (row.expires_at && String(row.expires_at).slice(0, 10) < today) return null;
  if (row.max_uses != null && Number(row.uses) >= Number(row.max_uses)) return null;
  return {
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    active: true,
  };
}

async function upsertPrice({ planSlug, mealsPerDay, durationDays, priceAed, active }) {
  await pool.execute(
    `INSERT INTO price_rules (plan_slug, meals_per_day, duration_days, price_aed, active)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE price_aed = VALUES(price_aed), active = VALUES(active)`,
    [planSlug, mealsPerDay, durationDays, priceAed, active ? 1 : 0]
  );
}

async function saveDuration({ id, days, label, active }) {
  if (id) {
    await pool.execute("UPDATE plan_durations SET days = ?, label = ?, active = ? WHERE id = ?", [
      days,
      label,
      active ? 1 : 0,
      id,
    ]);
    return;
  }
  await pool.execute("INSERT INTO plan_durations (days, label, active, sort_order) VALUES (?, ?, ?, ?)", [
    days,
    label,
    active ? 1 : 0,
    days,
  ]);
}

async function saveCalorie({ planSlug, mealsPerDay, minKcal, maxKcal }) {
  await pool.execute(
    `INSERT INTO calorie_bands (plan_slug, meals_per_day, min_kcal, max_kcal)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE min_kcal = VALUES(min_kcal), max_kcal = VALUES(max_kcal)`,
    [planSlug, mealsPerDay, minKcal, maxKcal]
  );
}

async function setPlanFlag(slug, allowFourMeals, active) {
  await pool.execute("UPDATE meal_plan_catalog SET allow_four_meals = ?, active = ? WHERE slug = ?", [
    allowFourMeals ? 1 : 0,
    active ? 1 : 0,
    slug,
  ]);
}

async function saveSlot({ id, label, active }) {
  if (id) {
    await pool.execute("UPDATE delivery_slots SET label = ?, active = ? WHERE id = ?", [label, active ? 1 : 0, id]);
    return;
  }
  await pool.execute("INSERT INTO delivery_slots (label, active) VALUES (?, ?)", [label, active ? 1 : 0]);
}

async function saveAddOn({ id, name, priceAed, active }) {
  if (id) {
    await pool.execute("UPDATE add_ons SET name = ?, price_aed = ?, active = ? WHERE id = ?", [
      name,
      priceAed,
      active ? 1 : 0,
      id,
    ]);
    return;
  }
  await pool.execute("INSERT INTO add_ons (name, price_aed, active) VALUES (?, ?, ?)", [name, priceAed, active ? 1 : 0]);
}

async function saveMenuItem(item) {
  const values = [
    item.name,
    item.description || null,
    item.category || "Meal",
    item.kcal,
    item.proteinG,
    item.carbsG,
    item.fatG,
    item.active ? 1 : 0,
  ];
  if (item.id) {
    await pool.execute(
      `UPDATE menu_items
       SET name = ?, description = ?, category = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, active = ?
       WHERE id = ?`,
      [...values, item.id]
    );
    return item.id;
  }
  const [result] = await pool.execute(
    `INSERT INTO menu_items (name, description, category, kcal, protein_g, carbs_g, fat_g, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    values
  );
  return result.insertId;
}

async function setMenuImage(id, imagePath) {
  await pool.execute("UPDATE menu_items SET image_path = ? WHERE id = ?", [imagePath, id]);
}

async function deleteMenuItem(id) {
  await pool.execute("DELETE FROM menu_items WHERE id = ?", [id]);
}

async function savePromo(promo) {
  const values = [
    promo.code,
    promo.discountType,
    promo.discountValue,
    promo.active ? 1 : 0,
    promo.maxUses,
    promo.expiresAt,
  ];
  if (promo.id) {
    await pool.execute(
      `UPDATE promo_codes
       SET code = ?, discount_type = ?, discount_value = ?, active = ?, max_uses = ?, expires_at = ?
       WHERE id = ?`,
      [...values, promo.id]
    );
    return;
  }
  await pool.execute(
    `INSERT INTO promo_codes (code, discount_type, discount_value, active, max_uses, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    values
  );
}

async function approvedTestimonials() {
  const [rows] = await pool.execute(
    "SELECT id, author_name, area, quote_text FROM testimonials WHERE approved = 1 ORDER BY id DESC LIMIT 12"
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.author_name,
    area: row.area,
    quote: row.quote_text,
  }));
}

async function allTestimonials() {
  const [rows] = await pool.execute("SELECT * FROM testimonials ORDER BY id DESC LIMIT 100");
  return rows.map((row) => ({
    id: row.id,
    name: row.author_name,
    area: row.area,
    quote: row.quote_text,
    approved: Boolean(row.approved),
  }));
}

async function saveTestimonial({ id, name, area, quote, approved }) {
  if (id) {
    await pool.execute("UPDATE testimonials SET author_name = ?, area = ?, quote_text = ?, approved = ? WHERE id = ?", [
      name,
      area || null,
      quote,
      approved ? 1 : 0,
      id,
    ]);
    return;
  }
  await pool.execute("INSERT INTO testimonials (author_name, area, quote_text, approved) VALUES (?, ?, ?, ?)", [
    name,
    area || null,
    quote,
    approved ? 1 : 0,
  ]);
}

module.exports = {
  getSettings,
  updateSettings,
  catalog,
  findPrice,
  findPromo,
  upsertPrice,
  saveDuration,
  saveCalorie,
  setPlanFlag,
  saveSlot,
  saveAddOn,
  saveMenuItem,
  setMenuImage,
  deleteMenuItem,
  savePromo,
  approvedTestimonials,
  allTestimonials,
  saveTestimonial,
};
