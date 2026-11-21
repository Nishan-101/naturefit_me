const express = require("express");
const rateLimit = require("express-rate-limit");
const { register, login, logout, me } = require("../controllers/accountAuthController");
const { dashboard, updateAddress, requestChange, renew, support } = require("../controllers/dashboardController");
const { requireCustomer } = require("../middleware/requireAuth");

const router = express.Router();
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many sign-in attempts. Please wait and try again." },
});

router.post("/account/register", authLimit, register);
router.post("/account/login", authLimit, login);
router.post("/account/logout", logout);
router.get("/account/me", me);
router.get("/account/dashboard", requireCustomer, dashboard);
router.patch("/account/address", requireCustomer, updateAddress);
router.post("/account/subscriptions/:id/pause", requireCustomer, requestChange);
router.post("/account/subscriptions/:id/renew", requireCustomer, renew);
router.get("/account/support", requireCustomer, support);

module.exports = router;
