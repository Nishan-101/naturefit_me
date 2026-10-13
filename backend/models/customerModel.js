const { pool } = require("../config/db");

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function shapeProfile(row) {
  if (!row) return null;
  return {
    age: row.age,
    gender: row.gender,
    heightCm: row.height_cm,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    targetWeightKg: row.target_weight_kg === null ? null : Number(row.target_weight_kg),
    activityLevel: row.activity_level,
    primaryGoal: row.primary_goal,
    extraGoals: parseJson(row.extra_goals, []),
    allergies: parseJson(row.allergies, []),
    allergyOther: row.allergy_other,
    diet: row.diet,
    dietOther: row.diet_other,
    dislikes: row.dislikes,
    calorieKcal: row.calorie_kcal == null ? null : Number(row.calorie_kcal),
    calorieGuidance: Boolean(row.calorie_guidance),
    proteinGrams: row.protein_grams == null ? null : Number(row.protein_grams),
    proteinGuidance: Boolean(row.protein_guidance),
    mealsPerDay: row.meals_per_day == null ? null : Number(row.meals_per_day),
    preferredDuration: row.preferred_duration == null ? null : Number(row.preferred_duration),
    deliveryAddress: row.delivery_address,
    deliveryInstructions: row.delivery_instructions,
    allergyAcknowledged: Boolean(row.allergy_ack),
    completed: Boolean(row.completed),
  };
}

async function findCustomerByPhone(phone) {
  const [rows] = await pool.execute("SELECT * FROM customers WHERE phone_e164 = ? LIMIT 1", [phone]);
  return rows[0] || null;
}

async function findCustomerById(id) {
  const [rows] = await pool.execute("SELECT * FROM customers WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

async function createCustomer(phone) {
  const [result] = await pool.execute("INSERT INTO customers (phone_e164) VALUES (?)", [phone]);
  return findCustomerById(result.insertId);
}

async function touchLogin(id) {
  await pool.execute("UPDATE customers SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
}

async function updateCustomerIdentity(id, fullName, email) {
  await pool.execute("UPDATE customers SET full_name = ?, email = ? WHERE id = ?", [
    fullName,
    email || null,
    id,
  ]);
}

async function getProfile(customerId) {
  const [rows] = await pool.execute("SELECT * FROM customer_profiles WHERE customer_id = ? LIMIT 1", [customerId]);
  return shapeProfile(rows[0]);
}

async function saveProfile(customerId, profile) {
  await pool.execute(
    `INSERT INTO customer_profiles (
      customer_id, age, gender, height_cm, weight_kg, target_weight_kg, activity_level,
      primary_goal, extra_goals, allergies, allergy_other, diet, diet_other, dislikes,
      calorie_kcal, calorie_guidance, protein_grams, protein_guidance, meals_per_day,
      preferred_duration, delivery_address, delivery_instructions, allergy_ack, completed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      age = VALUES(age),
      gender = VALUES(gender),
      height_cm = VALUES(height_cm),
      weight_kg = VALUES(weight_kg),
      target_weight_kg = VALUES(target_weight_kg),
      activity_level = VALUES(activity_level),
      primary_goal = VALUES(primary_goal),
      extra_goals = VALUES(extra_goals),
      allergies = VALUES(allergies),
      allergy_other = VALUES(allergy_other),
      diet = VALUES(diet),
      diet_other = VALUES(diet_other),
      dislikes = VALUES(dislikes),
      calorie_kcal = VALUES(calorie_kcal),
      calorie_guidance = VALUES(calorie_guidance),
      protein_grams = VALUES(protein_grams),
      protein_guidance = VALUES(protein_guidance),
      meals_per_day = VALUES(meals_per_day),
      preferred_duration = VALUES(preferred_duration),
      delivery_address = VALUES(delivery_address),
      delivery_instructions = VALUES(delivery_instructions),
      allergy_ack = VALUES(allergy_ack),
      completed = VALUES(completed)`,
    [
      customerId,
      profile.age,
      profile.gender,
      profile.heightCm,
      profile.weightKg,
      profile.targetWeightKg,
      profile.activityLevel,
      profile.primaryGoal,
      JSON.stringify(profile.extraGoals),
      JSON.stringify(profile.allergies),
      profile.allergyOther,
      profile.diet,
      profile.dietOther,
      profile.dislikes,
      profile.calorieKcal,
      profile.calorieGuidance ? 1 : 0,
      profile.proteinGrams,
      profile.proteinGuidance ? 1 : 0,
      profile.mealsPerDay,
      profile.preferredDuration,
      profile.deliveryAddress,
      profile.deliveryInstructions,
      profile.allergyAcknowledged ? 1 : 0,
      profile.completed ? 1 : 0,
    ]
  );
  return getProfile(customerId);
}

async function listCustomers() {
  const [rows] = await pool.execute(
    `SELECT c.id, c.phone_e164, c.full_name, c.email, c.created_at, c.last_login_at,
            p.age, p.gender, p.height_cm, p.weight_kg, p.target_weight_kg, p.activity_level,
            p.primary_goal, p.extra_goals, p.allergies, p.allergy_other, p.diet, p.diet_other,
            p.dislikes, p.calorie_kcal, p.calorie_guidance, p.protein_grams, p.protein_guidance,
            p.meals_per_day, p.preferred_duration, p.delivery_address, p.delivery_instructions,
            p.allergy_ack, p.completed
     FROM customers c
     LEFT JOIN customer_profiles p ON p.customer_id = c.id
     ORDER BY c.created_at DESC
     LIMIT 200`
  );
  return rows.map((row) => ({
    id: row.id,
    phone: row.phone_e164,
    fullName: row.full_name,
    email: row.email,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    profile: row.primary_goal || row.allergies ? shapeProfile(row) : null,
  }));
}

module.exports = {
  findCustomerByPhone,
  findCustomerById,
  createCustomer,
  touchLogin,
  updateCustomerIdentity,
  getProfile,
  saveProfile,
  listCustomers,
};
