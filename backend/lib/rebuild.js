const orders = require("../models/orderModel");
const { buildDeliveryDates, reconcileDeliveries, effectivePauseRanges } = require("./schedule");

async function rebuildSubscription(subscriptionId, status) {
  const subscription = await orders.subscriptionById(subscriptionId);
  if (!subscription) return null;
  const requests = await orders.pauseRequests({ subscriptionId });
  const dates = buildDeliveryDates(
    subscription.startDate,
    subscription.days,
    subscription.durationDays,
    effectivePauseRanges(requests)
  );
  const existing = await orders.deliveriesFor(subscriptionId);
  await orders.applyDeliveryActions(subscriptionId, reconcileDeliveries(existing, dates));
  const endDate = dates[dates.length - 1] || null;
  const nextStatus = status || subscription.status;
  await orders.setSubscription(subscriptionId, nextStatus, endDate);
  return { dates, endDate, status: nextStatus };
}

module.exports = { rebuildSubscription };
