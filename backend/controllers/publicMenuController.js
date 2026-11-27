const { httpError } = require("../config/session");
const publicMenuModel = require("../models/publicMenuModel");
const { sanitizePublicMenuProfile } = require("../lib/publicMenu");

async function listPublic(req, res) {
  try {
    const overrides = await publicMenuModel.listProfiles();
    res.json({ success: true, overrides });
  } catch (error) {
    console.error("Public menu details are unavailable:", error.code || error.message);
    res.json({ success: true, overrides: [], unavailable: true });
  }
}

async function listAdmin(req, res, next) {
  try {
    const overrides = await publicMenuModel.listProfiles();
    res.json({ success: true, overrides });
  } catch (error) {
    next(error);
  }
}

async function saveAdmin(req, res, next) {
  try {
    const checked = sanitizePublicMenuProfile(req.body, req.body && req.body.id);
    if (!checked.ok) throw httpError(400, checked.message);
    await publicMenuModel.saveProfile(checked.profile);
    res.json({
      success: true,
      profile: checked.profile,
      message: "Dish details saved. Prices, photos, checkout, and the meal-plan builder were not changed.",
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listPublic, listAdmin, saveAdmin };
