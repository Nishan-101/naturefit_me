const express = require("express");
const rateLimit = require("express-rate-limit");
const { quote, create, status, pay } = require("../controllers/orderController");
const { attachSession } = require("../controllers/paymentController");
const { requireCustomer } = require("../middleware/requireAuth");

const router = express.Router();
const writeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many orders from this device. Please wait a few minutes." },
});

router.post("/orders/quote", writeLimit, quote);
router.post("/orders", writeLimit, attachSession, create);
router.get("/orders/:reference/status", status);
router.post("/orders/:reference/pay", requireCustomer, pay);

module.exports = router;
