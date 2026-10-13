const express = require("express");
const rateLimit = require("express-rate-limit");
const { create, listPlans } = require("../controllers/inquiryController");

const router = express.Router();

const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many inquiries from this device. Please wait a few minutes, or email naturefitdxb@gmail.com.",
  },
});

router.get("/plans", listPlans);
router.post("/inquiries", inquiryLimiter, create);

module.exports = router;
