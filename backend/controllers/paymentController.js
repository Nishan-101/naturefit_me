const { httpError, currentSession } = require("../config/session");
const { verifyStripeSignature, stripeMode } = require("../lib/stripe");
const { paymentTransition } = require("../lib/pricing");
const { toFils } = require("../lib/money");
const { sendOrderNotification } = require("../config/mailer");
const orders = require("../models/orderModel");

function orderStatusFor(paymentStatus, current) {
  if (paymentStatus === "paid") return "paid";
  if (paymentStatus === "cancelled") return "cancelled";
  if (paymentStatus === "failed") return "pending_payment";
  return current;
}

async function stripeWebhook(req, res, next) {
  let claimedEventId = "";
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
    if (stripeMode() === "not_configured" || !secret) {
      throw httpError(503, "Stripe webhooks are not configured.");
    }
    const signature = req.headers["stripe-signature"];
    if (!verifyStripeSignature(req.body, signature, secret)) {
      throw httpError(400, "Invalid Stripe signature.");
    }
    const event = JSON.parse(req.body.toString("utf8"));
    const eventId = String(event.id || "").trim();
    if (!eventId) throw httpError(400, "Stripe event id is missing.");
    const session = event.data && event.data.object ? event.data.object : {};
    const reference = (session.metadata && session.metadata.orderReference) || session.client_reference_id || null;
    const claimed = await orders.claimStripeEvent(eventId, event.type, reference);
    if (!claimed) {
      res.json({ received: true, duplicate: true });
      return;
    }
    claimedEventId = eventId;
    if (!reference) {
      res.json({ received: true, ignored: true });
      return;
    }
    const order = await orders.findByReference(reference);
    if (!order || order.totalAed == null) {
      res.json({ received: true, ignored: true });
      return;
    }
    if (event.type === "payment_intent.payment_failed" || event.type === "checkout.session.async_payment_failed") {
      // A declined card does not confirm or cancel the booking. Checkout stays open for another attempt.
      res.json({ received: true, ignored: true });
      return;
    }
    if (event.type === "checkout.session.expired") {
      if (session.id) await orders.updatePaymentByRef(session.id, "cancelled");
      const stillOpen = (await orders.paymentsForOrder(order.id)).some(
        (payment) => payment.status === "pending" || payment.status === "starting"
      );
      if (!stillOpen && order.paymentStatus !== "paid") {
        await orders.updatePaymentState(order.id, "cancelled", orderStatusFor("cancelled", order.orderStatus));
      }
      res.json({ received: true });
      return;
    }
    const nextStatus = paymentTransition(order.paymentStatus, {
      type: event.type,
      paid: session.payment_status === "paid",
      currency: session.currency,
      amountFils: session.amount_total,
      expectedFils: toFils(order.totalAed),
    });
    const becamePaid = nextStatus === "paid" && order.paymentStatus !== "paid";
    if (nextStatus !== order.paymentStatus) {
      await orders.updatePaymentState(order.id, nextStatus, orderStatusFor(nextStatus, order.orderStatus));
      if (session.id) await orders.updatePaymentByRef(session.id, nextStatus);
    }
    if (session.id && String(session.id).startsWith("cs_")) {
      await orders.rememberCheckoutSessionByRef(session.id, session.id);
    }
    if (nextStatus === "paid" && session.id && session.payment_intent) {
      const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
      if (intent) await orders.replaceProviderRef(session.id, intent);
    }
    if (becamePaid && !order.emailSent) {
      orders
        .findById(order.id)
        .then((fresh) => (fresh ? sendOrderNotification({ ...fresh, paymentStatus: "paid" }) : null))
        .then((sent) => (sent ? orders.markEmailed(order.id, true) : null))
        .catch((error) => console.error("Order email failed:", error.message));
    }
    res.json({ received: true });
  } catch (error) {
    if (claimedEventId) {
      await orders.releaseStripeEvent(claimedEventId).catch((releaseError) => {
        console.error("Stripe event release failed:", releaseError.message);
      });
    }
    next(error);
  }
}

function attachSession(req, res, next) {
  req.auth = currentSession(req);
  next();
}

module.exports = { stripeWebhook, attachSession };
