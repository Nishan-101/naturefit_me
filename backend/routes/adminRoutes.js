const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAdmin } = require("../middleware/requireAuth");
const { login, logout, listCustomers, listInquiries, setStatus } = require("../controllers/adminController");
const { resendAdmin } = require("../controllers/inquiryController");
const commerce = require("../controllers/adminCommerceController");

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
router.get("/overview", requireAdmin, commerce.overview);
router.get("/schedule", requireAdmin, commerce.schedule);
router.get("/export/orders", requireAdmin, commerce.exportOrders);
router.get("/export/customers", requireAdmin, commerce.exportCustomers);
router.post("/orders/:id/payment", requireAdmin, commerce.recordPayment);
router.post("/orders/:id/decision", requireAdmin, commerce.decide);
router.post("/pauses/:id/decision", requireAdmin, commerce.decidePause);
router.post("/prices", requireAdmin, commerce.savePrice);
router.post("/durations", requireAdmin, commerce.saveDuration);
router.post("/calories", requireAdmin, commerce.saveCalorie);
router.post("/slots", requireAdmin, commerce.saveSlot);
router.post("/addons", requireAdmin, commerce.saveAddOn);
router.post("/menu", requireAdmin, commerce.saveMenu);
router.post("/menu/:id/photo", requireAdmin, commerce.uploadMenuPhoto);
router.delete("/menu/:id", requireAdmin, commerce.removeMenu);
router.post("/promos", requireAdmin, commerce.savePromo);
router.post("/settings", requireAdmin, commerce.saveSettings);
router.post("/testimonials", requireAdmin, commerce.saveTestimonial);

module.exports = router;
