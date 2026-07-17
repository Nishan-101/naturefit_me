const express = require("express");
const rateLimit = require("express-rate-limit");
const { contactValidationRules, handleValidationErrors } = require("../middleware/validateContact");
const { submitContactForm } = require("../controllers/contactController");

const router = express.Router();

// Limits contact form submissions to prevent spam/abuse.
const contactLimiter = rateLimit({
  windowMs: (Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000,
  max: Number(process.env.CONTACT_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many messages sent from this device. Please try again later.",
  },
});

// POST /api/contact
router.post("/", contactLimiter, contactValidationRules, handleValidationErrors, submitContactForm);

module.exports = router;
