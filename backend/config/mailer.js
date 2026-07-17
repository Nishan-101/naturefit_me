const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

/**
 * Verifies SMTP credentials/connection on startup (logs only — does not crash the server).
 */
async function verifyMailer() {
  try {
    await transporter.verify();
    console.log("✅ Nodemailer: SMTP connection verified");
  } catch (error) {
    console.error("⚠️  Nodemailer: SMTP verification failed —", error.message);
  }
}

/**
 * Sends an admin notification email whenever a new contact message is submitted.
 */
async function sendContactNotification({ fullName, email, phone, subject, message }) {
  const mailOptions = {
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: process.env.ADMIN_EMAIL,
    replyTo: email,
    subject: `New Contact Form Submission: ${subject}`,
    text: `
New message from Nature Fit Restaurant website contact form:

Name: ${fullName}
Email: ${email}
Phone: ${phone}
Subject: ${subject}

Message:
${message}
    `.trim(),
    html: `
      <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto;">
        <h2 style="color:#1B4332;">New Contact Form Submission</h2>
        <p style="color:#555;">You've received a new message from the Nature Fit Restaurant website.</p>
        <table style="width:100%; border-collapse:collapse; margin-top:16px;">
          <tr><td style="padding:8px 0; font-weight:bold; width:120px;">Name</td><td style="padding:8px 0;">${escapeHtml(fullName)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:bold;">Email</td><td style="padding:8px 0;">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:bold;">Phone</td><td style="padding:8px 0;">${escapeHtml(phone)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:bold;">Subject</td><td style="padding:8px 0;">${escapeHtml(subject)}</td></tr>
        </table>
        <p style="font-weight:bold; margin-top:16px;">Message:</p>
        <p style="white-space:pre-wrap; background:#FBF7EF; padding:14px; border-radius:8px; color:#1F2A24;">${escapeHtml(message)}</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = { transporter, verifyMailer, sendContactNotification };
