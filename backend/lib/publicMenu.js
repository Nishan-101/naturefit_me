const STATUSES = new Set(["estimated", "incomplete", "approved", "withheld"]);
const BANNED_TAG = /gluten[-\s]?free|sugar[-\s]?free|low[-\s]?fat|fat[-\s]?free|dairy[-\s]?free|weight\s*loss|guarantees?\s+muscle|keto/i;

function cleanText(value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanList(value, maxItems, maxLength) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
  return source.slice(0, maxItems).map((item) => cleanText(item, maxLength)).filter(Boolean);
}

function numberOrNull(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 10) / 10;
}

function sanitizePublicMenuProfile(input, slug) {
  const id = cleanText(slug || (input && input.id), 80).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    return { ok: false, message: "Choose a dish from the public menu." };
  }
  const status = cleanText(input && input.nutritionVerificationStatus, 40) || "estimated";
  if (!STATUSES.has(status)) {
    return { ok: false, message: "Choose a valid nutrition status." };
  }
  const tags = cleanList(input && input.dietaryTags, 8, 40);
  const banned = tags.find((tag) => BANNED_TAG.test(tag));
  if (banned) {
    return { ok: false, message: `Remove the unsupported claim “${banned}”.` };
  }
  const calories = numberOrNull(input && input.calories);
  const protein = numberOrNull(input && input.protein);
  const carbohydrates = numberOrNull(input && input.carbohydrates);
  const fats = numberOrNull(input && input.fats);
  const fibre = numberOrNull(input && input.fibre);
  const numbers = [calories, protein, carbohydrates, fats, fibre];
  if (numbers.some((value) => value != null && (value < 0 || value > 2000))) {
    return { ok: false, message: "Nutrition values must be between 0 and 2000." };
  }
  const hideNumbers = status === "incomplete" || status === "withheld";
  const profile = {
    id,
    description: cleanText(input && input.description, 1200),
    ingredients: cleanList(input && input.ingredients, 30, 160),
    preparationMethod: cleanText(input && input.preparationMethod, 800),
    servingSize: cleanText(input && input.servingSize, 400),
    dietaryBenefits: cleanText(input && input.dietaryBenefits, 800),
    allergens: cleanList(input && input.allergens, 16, 80),
    allergenNote: cleanText(input && input.allergenNote, 600),
    dietaryTags: tags,
    missingInfo: cleanList(input && input.missingInfo, 16, 180),
    nutritionBasis: cleanText(input && input.nutritionBasis, 1200),
    nutritionVerificationStatus: status,
    calories: hideNumbers && status === "incomplete" ? null : calories,
    protein: hideNumbers && status === "incomplete" ? null : protein,
    carbohydrates: hideNumbers && status === "incomplete" ? null : carbohydrates,
    fats: hideNumbers && status === "incomplete" ? null : fats,
    fibre: hideNumbers && status === "incomplete" ? null : fibre,
  };
  return { ok: true, profile };
}

module.exports = { sanitizePublicMenuProfile, STATUSES };
