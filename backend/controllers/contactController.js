const { createContactMessage } = require("../models/contactModel");
const { sendContactNotification } = require("../config/mailer");

/**
 * POST /api/contact
 * Validates (via middleware) then persists the contact message to MySQL
 * and sends an email notification to the restaurant admin.
 */
async function submitContactForm(req, res, next) {
  try {
    const { fullName, email, phone, subject, message } = req.body;
    const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;

    // 1. Persist to MySQL (Clever Cloud)
    const insertId = await createContactMessage({ fullName, email, phone, subject, message, ipAddress });

    // 2. Notify admin via email — failure to send email should not fail the request,
    //    since the message is already safely stored in the database.
    sendContactNotification({ fullName, email, phone, subject, message }).catch((err) => {
      console.error("⚠️  Failed to send admin notification email:", err.message);
    });

    return res.status(201).json({
      success: true,
      message: "Thank you! Your message has been received. Our team will get back to you shortly.",
      data: { id: insertId },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { submitContactForm };
