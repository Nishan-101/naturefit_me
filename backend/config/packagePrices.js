/**
 * Official Nature Fit package prices, in AED.
 * The 1-day, 20-day, and 28-day amounts are the source of truth.
 * Every other length from 2 to 27 days is interpolated from those amounts.
 * The browser cannot change these prices.
 * Do not add discounts, compare-at prices, or savings here.
 */

const MIN_DAYS = 1;
const MAX_DAYS = 28;
const ANCHOR_DAYS = [1, 20, 28];
const DURATIONS = ANCHOR_DAYS;

const PACKAGES = [
  {
    slug: "weight-loss",
    name: "Fat Loss",
    calorieLabel: "3 meals · 1350–1500 kcal",
    meals: [1, 2, 3],
    prices: {
      1: { 1: 45, 20: 800, 28: 1110 },
      2: { 1: 60, 20: 1050, 28: 1500 },
      3: { 1: 70, 20: 1350, 28: 1900 },
    },
  },
  {
    slug: "balance",
    name: "Balance",
    calorieLabel: "3 meals · 1600–1750 kcal",
    meals: [1, 2, 3],
    prices: {
      1: { 1: 50, 20: 900, 28: 1200 },
      2: { 1: 60, 20: 1100, 28: 1500 },
      3: { 1: 80, 20: 1400, 28: 2000 },
    },
  },
  {
    slug: "lifestyle",
    name: "Healthy Lifestyle",
    calorieLabel: "3 meals · 1750–1800 kcal",
    meals: [1, 2, 3],
    prices: {
      1: { 1: 55, 20: 1000, 28: 1400 },
      2: { 1: 65, 20: 1250, 28: 1750 },
      3: { 1: 85, 20: 1500, 28: 2100 },
    },
  },
  {
    slug: "muscle-gain",
    name: "Muscle Gain",
    calorieLabel: "3 meals · 1900–2100 kcal · 4 meals · 2200–2300 kcal",
    meals: [1, 2, 3, 4],
    prices: {
      1: { 1: 60, 20: 1000, 28: 1400 },
      2: { 1: 70, 20: 1300, 28: 1900 },
      3: { 1: 85, 20: 1650, 28: 2300 },
      4: { 1: 115, 20: 2150, 28: 3000 },
    },
  },
];

function wholeDays(value) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) return null;
  return days;
}

/**
 * Linear interpolation in fils so the rounded result is exact to two decimals.
 * 1, 20, and 28 days return the official price unchanged.
 * 2–19 days move from the 1-day price to the 20-day price across 19 steps.
 * 21–27 days move from the 20-day price to the 28-day price across 8 steps.
 */
function interpolatedFils(day1, day20, day28, days) {
  const low = day1 * 100;
  const mid = day20 * 100;
  const high = day28 * 100;
  if (days === 1) return low;
  if (days === 20) return mid;
  if (days === 28) return high;
  if (days < 20) {
    const numerator = low * 19 + (days - 1) * (mid - low);
    return Math.round(numerator / 19);
  }
  const numerator = mid * 8 + (days - 20) * (high - mid);
  return Math.round(numerator / 8);
}

function findPackage(slug, mealsPerDay, durationDays) {
  const plan = PACKAGES.find((item) => item.slug === slug);
  const meals = Number(mealsPerDay);
  const days = wholeDays(durationDays);
  if (!plan || !plan.meals.includes(meals) || days == null) return null;
  const anchors = plan.prices[meals];
  if (!anchors) return null;
  const fils = interpolatedFils(anchors[1], anchors[20], anchors[28], days);
  if (!Number.isInteger(fils) || fils <= 0) return null;
  return {
    slug: plan.slug,
    planName: plan.name,
    calorieLabel: plan.calorieLabel,
    mealsPerDay: meals,
    durationDays: days,
    priceAed: fils / 100,
    priceFils: fils,
  };
}

function listPackages() {
  return PACKAGES.map((plan) => ({
    slug: plan.slug,
    name: plan.name,
    calorieLabel: plan.calorieLabel,
    meals: plan.meals.slice(),
  }));
}

function pricesForPlan(slug) {
  const plan = PACKAGES.find((item) => item.slug === slug);
  if (!plan) return null;
  return {
    slug: plan.slug,
    name: plan.name,
    calorieLabel: plan.calorieLabel,
    meals: plan.meals.slice(),
    prices: plan.meals.map((meals) => ({
      mealsPerDay: meals,
      durations: ANCHOR_DAYS.map((days) => ({
        days,
        amountAed: plan.prices[meals][days],
      })),
    })),
  };
}

module.exports = {
  MIN_DAYS,
  MAX_DAYS,
  ANCHOR_DAYS,
  DURATIONS,
  PACKAGES,
  findPackage,
  listPackages,
  pricesForPlan,
};
