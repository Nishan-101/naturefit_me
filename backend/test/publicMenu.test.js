const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { sanitizePublicMenuProfile } = require("../lib/publicMenu");

const root = path.join(__dirname, "..", "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "frontend", "data", "menu-details.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");

function cardNames(source) {
  const names = [];
  const pattern = /<h3>([\s\S]*?)<\/h3>/g;
  let match = pattern.exec(source);
  while (match) {
    const name = match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (name) names.push(name);
    match = pattern.exec(source);
  }
  return names;
}

test("public menu details cover every homepage dish once", () => {
  const start = html.indexOf('<div class="nf-menu-grid">');
  const end = html.indexOf('<div class="nf-menu-footer">');
  const menuHtml = html.slice(start, end);
  const names = cardNames(menuHtml);
  assert.ok(names.length >= 20);
  const ids = new Set();
  names.forEach((name) => {
    const matches = catalog.items.filter((item) => item.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(ids.has(matches[0].id), false);
    ids.add(matches[0].id);
  });
  assert.equal(catalog.items.length, names.length);
});

test("nutrition estimates stay separate from printed menu calories", () => {
  const banned = /gluten[-\s]?free|sugar[-\s]?free|low[-\s]?fat|fat[-\s]?free|dairy[-\s]?free|keto/i;
  catalog.items.forEach((item) => {
    assert.match(item.nutritionVerificationStatus, /^(estimated|incomplete|approved|withheld)$/);
    assert.equal(banned.test(item.description), false, item.id);
    assert.equal((item.dietaryTags || []).some((tag) => banned.test(tag)), false, item.id);
    assert.equal(fs.existsSync(path.join(root, "frontend", item.image.replace(/^\.\//, ""))), true, item.image);
    if (item.nutritionVerificationStatus === "incomplete") {
      assert.equal(item.calories, null);
      assert.ok(item.missingInfo.length > 0);
      return;
    }
    assert.equal(typeof item.calories, "number");
    assert.equal(typeof item.protein, "number");
    assert.equal(typeof item.carbohydrates, "number");
    assert.equal(typeof item.fats, "number");
    assert.ok(item.nutritionBasis.length > 40);
    if (item.publishedCalories != null) {
      assert.equal(Object.prototype.hasOwnProperty.call(item, "publishedCalories"), true);
    }
  });
  assert.match(catalog.disclaimer, /Nutritional values are approximate per serving/);
});

test("prices on the detail record match the printed cards", () => {
  const priced = Object.fromEntries(catalog.items.map((item) => [item.name, item.priceAed]));
  assert.equal(priced["Nature Granola"], 40);
  assert.equal(priced["Carrot Juice"], 29);
  assert.equal(priced["Orange Juice"], 24);
  catalog.items
    .filter((item) => !["Nature Granola", "Carrot Juice", "Orange Juice"].includes(item.name))
    .forEach((item) => assert.equal(item.priceAed, null, item.name));
});

test("staff edits cannot publish unsupported dietary claims or change the dish id", () => {
  const rejected = sanitizePublicMenuProfile(
    { nutritionVerificationStatus: "approved", dietaryTags: ["Gluten-free"] },
    "omega"
  );
  assert.equal(rejected.ok, false);
  const saved = sanitizePublicMenuProfile(
    {
      id: "omega",
      description: "Kitchen-approved description",
      calories: 500,
      protein: 35,
      carbohydrates: 40,
      fats: 18,
      fibre: 6,
      nutritionVerificationStatus: "approved",
      dietaryTags: ["High Protein"],
    },
    "omega"
  );
  assert.equal(saved.ok, true);
  assert.equal(saved.profile.id, "omega");
  assert.equal(saved.profile.calories, 500);
  assert.equal(Object.prototype.hasOwnProperty.call(saved.profile, "priceAed"), false);
  const incomplete = sanitizePublicMenuProfile(
    { calories: 100, nutritionVerificationStatus: "incomplete" },
    "muscle-man"
  );
  assert.equal(incomplete.profile.calories, null);
});
