const PLANS = [
  {
    id: "weight-loss",
    name: "Weight Loss",
    goals: ["Fat Loss", "Weight Management"],
    summary: "Calorie-conscious portions with enough protein to stay full.",
  },
  {
    id: "balance",
    name: "Balance",
    goals: ["Balanced Diet"],
    summary: "Everyday meals for steady energy, without a strict cut or bulk.",
  },
  {
    id: "lifestyle",
    name: "Healthy Lifestyle",
    goals: ["Healthy Lifestyle"],
    summary: "Whole-food meals for people who want to eat well every day.",
  },
  {
    id: "muscle-gain",
    name: "Muscle Gain",
    goals: ["Muscle Gain"],
    summary: "Protein-focused plates for training and recovery.",
  },
];

const MEAL_IDS = ["breakfast", "lunch", "dinner", "am", "pm"];
const MEAL_NAMES = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  am: "AM Meal",
  pm: "PM Meal",
};
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DURATIONS = [20, 24, 30, 90];

const GOALS = ["Fat Loss", "Balanced Diet", "Healthy Lifestyle", "Muscle Gain", "Weight Management", "Other"];
const ACTIVITIES = ["Sedentary", "Lightly active", "Moderately active", "Very active", "Athlete"];
const ALLERGIES = [
  "No known food allergies",
  "Dairy",
  "Eggs",
  "Peanuts",
  "Tree nuts",
  "Fish",
  "Shellfish",
  "Soy",
  "Gluten / wheat",
  "Sesame",
  "Other",
];
const DIETS = ["Regular", "Vegetarian", "Vegan", "Pescatarian", "Halal", "Other", "No specific preference"];

function recommendPlan(primaryGoal) {
  return PLANS.find((plan) => plan.goals.includes(primaryGoal)) || null;
}

module.exports = {
  PLANS,
  MEAL_IDS,
  MEAL_NAMES,
  DAY_NAMES,
  DURATIONS,
  GOALS,
  ACTIVITIES,
  ALLERGIES,
  DIETS,
  recommendPlan,
};
