const { formatAed, displayAed } = require("./money");

function businessChatLink(number, text) {
  const digits = String(number || "").replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function orderMessage(order) {
  const total = order.totalAed == null ? "To be confirmed by Nature Fit" : formatAed(order.totalAed);
  const days = Array.isArray(order.dayLabels) ? order.dayLabels.join(", ") : "";
  return [
    "Nature Fit meal plan order",
    `Order: ${order.reference}`,
    `Name: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    `Email: ${order.customerEmail || "Not provided"}`,
    `Plan: ${order.planName}`,
    `Meals per day: ${order.mealsPerDay}`,
    `Duration: ${order.durationDays} delivery days`,
    `Delivery days: ${days}`,
    `Delivery time: ${order.deliverySlotLabel || "Not selected"}`,
    `Start date: ${order.startDate}`,
    `Address: ${order.addressLine}`,
    `Emirate / area: ${order.emirate}, ${order.area}`,
    `Building: ${order.building || "Not provided"}`,
    `Instructions: ${order.instructions || "None"}`,
    `Allergies / diet: ${order.allergies || "None stated"}`,
    `Total: ${total}`,
    `Payment: ${order.paymentMethod} — ${order.paymentStatus}`,
  ].join("\n");
}

function customerTemplateParameters(order) {
  const total = order.totalAed == null ? "To be confirmed" : formatAed(order.totalAed);
  return [
    order.customerName,
    order.reference,
    order.planName,
    String(order.mealsPerDay),
    `${order.durationDays} delivery days`,
    order.startDate,
    total,
    order.paymentStatus,
  ];
}

function packageChatMessage(order, paymentReference) {
  return [
    "NATURE FIT RESTAURANT",
    `Customer: ${order.customerName}`,
    `Order ID: ${order.reference}`,
    `Meal Plan: ${order.planName}`,
    `Meals Per Day: ${order.mealsPerDay}`,
    `Subscription: ${order.durationDays} Days`,
    `Total Price: ${displayAed(order.totalAed)}`,
    `Delivery Start Date: ${order.startDate}`,
    order.endDate ? `Delivery End Date: ${order.endDate}` : "",
    Array.isArray(order.dayLabels) && order.dayLabels.length ? `Delivery Schedule: ${order.dayLabels.join(", ")}` : "",
    `Delivery Address: ${order.addressLine}`,
    `Payment Reference: ${paymentReference}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function inquiryChatMessage(inquiry) {
  return [
    "NATURE FIT RESTAURANT",
    "Unpaid meal plan inquiry",
    "No payment has been made.",
    `Inquiry: ${inquiry.reference}`,
    `Customer: ${inquiry.customerName}`,
    `Meal Plan: ${inquiry.planName}`,
    `Meals Per Day: ${inquiry.mealsPerDay}`,
    `Number of days: ${inquiry.durationDays}`,
    `Quoted total: ${displayAed(inquiry.totalAed)}`,
    `Preferred start date: ${inquiry.startDate}`,
    inquiry.addressLine ? `Delivery address: ${inquiry.addressLine}` : "",
    "Payment status: Unpaid inquiry",
  ]
    .filter(Boolean)
    .join("\n");
}

module.exports = { businessChatLink, orderMessage, customerTemplateParameters, packageChatMessage, inquiryChatMessage };
