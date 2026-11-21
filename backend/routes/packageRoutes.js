const express = require("express");
const rateLimit = require("express-rate-limit");
const { catalog, quote, sendOtp, checkOtp, checkout, retryCheckout, createInquiry, inquiryStatus } = require("../controllers/packageController");

const router = express.Router();

function limit(max, message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
  });
}

router.get("/packages", catalog);
router.post("/packages/quote", limit(400, "Too many price checks. Please wait a few minutes."), quote);
router.post("/packages/otp/send", limit(8, "Too many verification requests. Please wait a few minutes."), sendOtp);
router.post("/packages/otp/check", limit(20, "Too many verification attempts. Please wait a few minutes."), checkOtp);
router.post("/packages/checkout", limit(10, "Too many payment attempts. Please wait a few minutes."), checkout);
router.post("/packages/checkout/retry", limit(10, "Too many payment attempts. Please wait a few minutes."), retryCheckout);
router.post("/packages/inquiry", limit(10, "Too many inquiries. Please wait a few minutes."), createInquiry);
router.get("/packages/inquiries/:reference", inquiryStatus);

module.exports = router;
