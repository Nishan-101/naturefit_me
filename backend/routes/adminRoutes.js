const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAdmin } = require("../middleware/requireAuth");
const { login, logout, listCustomers, listInquiries, setStatus } = require("../controllers/adminController");
const { resendAdmin } = require("../controllers/inquiryController");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many staff login attempts. Please wait and try again." },
});

router.post("/login", loginLimiter, login);
router.post("/logout", logout);
router.get("/customers", requireAdmin, listCustomers);
router.get("/inquiries", requireAdmin, listInquiries);
router.patch("/inquiries/:id", requireAdmin, setStatus);
router.post("/inquiries/:id/resend", requireAdmin, resendAdmin);

module.exports = router;
