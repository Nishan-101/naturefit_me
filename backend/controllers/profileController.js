const { httpError } = require("../config/session");
const { GOALS, ACTIVITIES, ALLERGIES, DIETS, DURATIONS, recommendPlan } = require("../config/plans");
const customers = require("../models/customerModel");

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function validateProfile(body, options = {}) {
  const errors = [];
  const fullName = cleanText(body.fullName, 150);
  const email = cleanText(body.email, 150);
  const inquiry = Boolean(options.inquiry);
  const blank = (value) => value === "" || value == null;
  const age = blank(body.age) ? null : Number(body.age);
  const gender = cleanText(body.gender, 30);
  const heightCm = blank(body.heightCm) ? null : Number(body.heightCm);
  const weightKg = blank(body.weightKg) ? null : Number(body.weightKg);
  const targetRaw = body.targetWeightKg === "" || body.targetWeightKg == null ? null : Number(body.targetWeightKg);
  const activityLevel = cleanText(body.activityLevel, 40);
  const primaryGoal = cleanText(body.primaryGoal, 40);
  const extraGoals = Array.isArray(body.extraGoals) ? [...new Set(body.extraGoals.map((item) => cleanText(item, 40)))] : [];
  const allergies = Array.isArray(body.allergies) ? [...new Set(body.allergies.map((item) => cleanText(item, 40)))] : [];
  const allergyOther = cleanText(body.allergyOther, 200);
  const diet = cleanText(body.diet, 40);
  const dietOther = cleanText(body.dietOther, 200);
  const dislikes = cleanText(body.dislikes, 1000);
  const calorieGuidance = Boolean(body.calorieGuidance) || (inquiry && blank(body.calorieKcal));
  const proteinGuidance = Boolean(body.proteinGuidance) || (inquiry && blank(body.proteinGrams));
  const calorieKcal = calorieGuidance || blank(body.calorieKcal) ? null : Number(body.calorieKcal);
  const proteinGrams = proteinGuidance || blank(body.proteinGrams) ? null : Number(body.proteinGrams);
  const mealsPerDay = blank(body.mealsPerDay) ? null : Number(body.mealsPerDay);
  const preferredDuration = blank(body.preferredDuration) ? null : Number(body.preferredDuration);
  const deliveryAddress = cleanText(body.deliveryAddress, 300);
  const deliveryInstructions = cleanText(body.deliveryInstructions, 500);
  const allergyAcknowledged = Boolean(body.allergyAcknowledged);

  if (fullName.length < 2) errors.push("Enter your full name.");
  if (options.requireEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Enter the email address where Nature Fit should reply.");
    }
  } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Enter a valid email address, or leave it blank.");
  }
  if (!(inquiry && age == null) && (!Number.isInteger(age) || age < 18 || age > 90)) errors.push("Enter an age between 18 and 90.");
  if (gender && !["Female", "Male", "Other", "Prefer not to say"].includes(gender)) errors.push("Choose a valid gender option.");
  if (!(inquiry && heightCm == null) && (!Number.isInteger(heightCm) || heightCm < 120 || heightCm > 230)) {
    errors.push("Enter your height in centimeters.");
  }
  if (!(inquiry && weightKg == null) && (!Number.isFinite(weightKg) || weightKg < 35 || weightKg > 250)) {
    errors.push("Enter your current weight in kilograms.");
  }
  if (targetRaw !== null && (!Number.isFinite(targetRaw) || targetRaw < 35 || targetRaw > 250)) {
    errors.push("Enter a target weight in kilograms, or leave it blank.");
  }
  if (activityLevel && !ACTIVITIES.includes(activityLevel)) errors.push("Choose a valid activity level.");
  if (!GOALS.includes(primaryGoal)) errors.push("Choose your main goal.");
  if (extraGoals.some((goal) => !GOALS.includes(goal) || goal === primaryGoal)) errors.push("Additional goals must be from the list.");
  if (!allergies.length || allergies.some((item) => !ALLERGIES.includes(item))) errors.push("Tell us about food allergies, or choose no known allergies.");
  if (allergies.includes("No known food allergies") && allergies.length > 1) errors.push("Remove other allergies if you have no known food allergies.");
  if (allergies.includes("Other") && allergyOther.length < 2) errors.push("Describe the other allergy.");
  if (!DIETS.includes(diet)) errors.push("Choose a dietary preference.");
  if (diet === "Other" && dietOther.length < 2) errors.push("Describe the other dietary preference.");
  if (!calorieGuidance && (!Number.isInteger(calorieKcal) || calorieKcal < 800 || calorieKcal > 4500)) {
    errors.push("Enter a daily calorie target between 800 and 4500, or ask Nature Fit for guidance.");
  }
  if (!proteinGuidance && (!Number.isInteger(proteinGrams) || proteinGrams < 30 || proteinGrams > 300)) {
    errors.push("Enter a daily protein target between 30 and 300 grams, or ask Nature Fit for guidance.");
  }
  if (!(inquiry && mealsPerDay == null) && ![2, 3, 4, 5].includes(mealsPerDay)) errors.push("Choose 2 to 5 meals per day.");
  if (!(inquiry && preferredDuration == null) && !DURATIONS.includes(preferredDuration)) {
    errors.push("Choose a plan length of 20, 24, 30, or 90 days.");
  }
  if (deliveryAddress.length < 8) errors.push("Enter a delivery address.");
  if (!allergyAcknowledged) errors.push("Please confirm that you understand the allergy note.");

  return {
    errors,
    fullName,
    email,
    profile: {
      age,
      gender: gender || null,
      heightCm,
      weightKg,
      targetWeightKg: targetRaw,
      activityLevel: activityLevel || null,
      primaryGoal,
      extraGoals,
      allergies,
      allergyOther: allergies.includes("Other") ? allergyOther : null,
      diet,
      dietOther: diet === "Other" ? dietOther : null,
      dislikes: dislikes || null,
      calorieKcal: calorieGuidance ? null : calorieKcal,
      calorieGuidance,
      proteinGrams: proteinGuidance ? null : proteinGrams,
      proteinGuidance,
      mealsPerDay,
      preferredDuration,
      deliveryAddress,
      deliveryInstructions: deliveryInstructions || null,
      allergyAcknowledged: true,
      completed: errors.length === 0,
    },
  };
}

async function save(req, res, next) {
  try {
    const { errors, fullName, email, profile } = validateProfile(req.body || {});
    if (errors.length) throw httpError(400, errors[0]);
    await customers.updateCustomerIdentity(req.auth.sub, fullName, email);
    const saved = await customers.saveProfile(req.auth.sub, profile);
    res.json({
      success: true,
      message: "Your nutrition profile is saved.",
      profile: saved,
      profileComplete: true,
      recommendedPlan: recommendPlan(saved.primaryGoal),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { save, validateProfile };
