require("dotenv").config();

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Confirms a Resend API key is present on startup (logs only — does not crash the server).
 * Unlike SMTP, there's no "connection" to verify — this is just a config sanity check.
 */
async function verifyMailer() {
  if (!process.env.RESEND_API_KEY) {
    console.error("⚠️  Resend: RESEND_API_KEY is missing from environment variables");
    return;
  }
  console.log("✅ Resend: API key found, ready to send email");
}

/**
 * Sends an admin notification email whenever a new contact message is submitted.
 * Uses Resend's HTTPS API directly (fetch) instead of an SMTP socket connection —
 * this avoids outbound SMTP ports being blocked/restricted on some free-tier hosts.
 */
async function sendContactNotification({ fullName, email, phone, subject, message }) {
  const payload = {
    from: process.env.MAIL_FROM || "Nature Fit Restaurant <onboarding@resend.dev>",
    to: [process.env.ADMIN_EMAIL],
    reply_to: email,
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

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = { verifyMailer, sendContactNotification };