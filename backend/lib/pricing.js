const { toFils, fromFils } = require("./money");

function quoteTotals({ priceAed, addOnPrices, promo, deliveryFeeAed }) {
  const unit = toFils(priceAed);
  if (unit == null || unit < 0) {
    return {
      priced: false,
      subtotalAed: null,
      addOnsAed: 0,
      discountAed: 0,
      deliveryFeeAed: 0,
      totalAed: null,
      totalFils: null,
    };
  }

  const addOns = (addOnPrices || []).reduce((sum, price) => sum + Math.max(0, toFils(price) || 0), 0);
  const subtotal = unit + addOns;
  let discount = 0;
  if (promo && promo.active !== false) {
    if (promo.discountType === "percent") {
      const percent = Number(promo.discountValue);
      if (percent > 0 && percent <= 100) discount = Math.round((subtotal * percent) / 100);
    } else if (promo.discountType === "fixed") {
      discount = Math.min(subtotal, Math.max(0, toFils(promo.discountValue) || 0));
    }
  }
  const delivery = Math.max(0, toFils(deliveryFeeAed) || 0);
  const total = Math.max(0, subtotal - discount + delivery);
  return {
    priced: true,
    subtotalAed: fromFils(subtotal),
    addOnsAed: fromFils(addOns),
    discountAed: fromFils(discount),
    deliveryFeeAed: fromFils(delivery),
    totalAed: fromFils(total),
    totalFils: total,
  };
}

function paymentTransition(current, event) {
  const status = current || "unpaid";
  if (!event || event.type === "success_page_visited" || event.type === "cancel_page_visited") return status;
  if (status === "paid") return "paid";
  if (
    event.type === "checkout.session.completed" &&
    event.paid === true &&
    event.currency === "aed" &&
    Number.isInteger(event.amountFils) &&
    event.amountFils === event.expectedFils
  ) {
    return "paid";
  }
  if (event.type === "checkout.session.expired") return "cancelled";
  if (event.type === "payment_failed") return "failed";
  return status;
}

module.exports = { quoteTotals, paymentTransition };
