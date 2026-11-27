const express = require("express");
const { stripeMode } = require("../lib/stripe");
const { ALLERGY_NOTE } = require("../controllers/inquiryController");
const catalogModel = require("../models/catalogModel");
const publicMenu = require("../controllers/publicMenuController");

const router = express.Router();

router.get("/menu/details", publicMenu.listPublic);

router.get("/site", async (req, res, next) => {
  try {
    const settings = await catalogModel.getSettings();
    const data = await catalogModel.catalog();
    const gateway = stripeMode();
    const methods = [];
    if (settings.cardEnabled) {
      methods.push({
        id: "card",
        label: "Card",
        mode: gateway,
        note:
          gateway === "not_configured"
            ? "Card checkout is not live until Nature Fit connects a payment gateway. An order can still be saved, and no card is charged."
            : gateway === "stripe_test"
              ? "Stripe test mode is on. Real cards are not charged."
              : "You will be redirected to a secure card page. Nature Fit never sees the card number.",
      });
    }
    if (settings.bankTransferEnabled && settings.bankDetails) {
      methods.push({ id: "bank_transfer", label: "Bank transfer", mode: "manual" });
    }
    if (settings.codEnabled) methods.push({ id: "cod", label: "Cash on delivery", mode: "manual" });
    methods.push({
      id: "to_be_confirmed",
      label: "Confirm price with Nature Fit",
      mode: "quote",
      note: "Use this when a price has not been published.",
    });
    res.json({
      success: true,
      plans: data.plans.filter((plan) => plan.active),
      durations: data.durations.filter((item) => item.active),
      slots: data.slots.filter((item) => item.active),
      addOns: data.addOns.filter((item) => item.active),
      menu: settings.mealCustomization ? data.menu.filter((item) => item.active) : [],
      testimonials: await catalogModel.approvedTestimonials(),
      allergyNote: ALLERGY_NOTE,
      settings: {
        whatsappNumber: settings.whatsappNumber,
        whatsappUrl: settings.whatsappNumber ? `https://wa.me/${settings.whatsappNumber}` : null,
        whatsappMode: settings.whatsappMode,
        mealCustomization: settings.mealCustomization,
        minDeliveryDays: settings.minDeliveryDays,
        deliveryWeekdays: settings.weekdays,
        serviceEmirates: settings.emirates,
        deliveryFeeAed: settings.deliveryFeeAed,
        cutoffTime: settings.cutoffTime,
        cutoffLeadDays: settings.cutoffLeadDays,
        phone: settings.phone,
        email: settings.email,
        address: settings.address,
        hours: settings.hours,
        instagramUrl: settings.instagramUrl,
        facebookUrl: settings.facebookUrl,
        paymentMethods: methods,
        paymentGateway: gateway,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
