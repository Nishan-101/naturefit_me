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

function buildInquiryEmail({ inquiry, customer, profile, mealLabels, dayLabels, allergyNote }) {
  const to = process.env.INQUIRY_EMAIL || "naturefitdxb@gmail.com";
  const name = customer.full_name || "Customer";
  const phone = customer.phone_e164 || "Not provided";
  const email = customer.email || "";
  const allergies = (profile.allergies || []).join(", ");
  const extraGoals = (profile.extraGoals || []).join(", ") || "None";
  const submitted = inquiry.createdAt ? new Date(inquiry.createdAt).toISOString() : "Unknown";
  const calories = profile.calorieGuidance ? "Guidance requested" : `${profile.calorieKcal} kcal`;
  const protein = profile.proteinGuidance ? "Guidance requested" : `${profile.proteinGrams} g`;
  const diet = `${profile.diet}${profile.dietOther ? ` (${profile.dietOther})` : ""}`;
  const allergyText = `${allergies}${profile.allergyOther ? ` (${profile.allergyOther})` : ""}`;
  const text = `
New Nature Fit meal-plan inquiry #${inquiry.id}
Submitted: ${submitted}

Reply to this email to reach the customer. You can also call the phone number below.

Customer: ${name}
Phone: ${phone}
Email: ${email || "Not provided"}

Requested meal plan: ${inquiry.planName}
Meals in this request: ${mealLabels.join(", ")}
Days: ${dayLabels.join(", ")}
Duration: ${inquiry.durationDays} days
Notes: ${inquiry.notes || "None"}

Fitness goal: ${profile.primaryGoal}
Other goals: ${extraGoals}
Meals per day: ${profile.mealsPerDay || "Not provided"}
Preferred duration: ${profile.preferredDuration ? `${profile.preferredDuration} days` : "Not provided"}
Daily calories: ${calories}
Daily protein: ${protein}
Diet: ${diet}
Allergies: ${allergyText}
Foods to avoid: ${profile.dislikes || "None"}

Age: ${profile.age}
Gender: ${profile.gender || "Not provided"}
Height: ${profile.heightCm} cm
Weight: ${profile.weightKg} kg

Delivery address: ${profile.deliveryAddress || "Not provided"}
Delivery instructions: ${profile.deliveryInstructions || "None"}

${allergyNote}
  `.trim();

  const replyHref = email ? `mailto:${encodeURIComponent(email)}` : "";
  const callHref = /^\+[1-9]\d{7,14}$/.test(phone) ? `tel:${phone}` : "";
  const actions = [
    replyHref
      ? `<a href="${replyHref}" style="display:inline-block;margin:0 8px 8px 0;background:#1B4332;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Reply to ${escapeHtml(name)}</a>`
      : "",
    callHref
      ? `<a href="${callHref}" style="display:inline-block;margin:0 8px 8px 0;background:#FBF7EF;color:#1B4332;text-decoration:none;padding:10px 16px;border-radius:8px;border:1px solid #1B4332;">Call ${escapeHtml(phone)}</a>`
      : "",
  ].join("");
  const row = (label, value) =>
    `<tr><td style="padding:6px 16px 6px 0;font-weight:bold;vertical-align:top;white-space:nowrap;">${label}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1F2A24;">
      <h2 style="color:#1B4332;">Meal plan inquiry #${escapeHtml(inquiry.id)}</h2>
      <p>Hit <strong>Reply</strong> in Gmail to write back to this customer. Their address is set as the reply address.</p>
      <p>${actions}</p>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Customer", name)}
        ${row("Phone", phone)}
        ${row("Email", email || "Not provided")}
        ${row("Plan", inquiry.planName)}
        ${row("Meals", mealLabels.join(", "))}
        ${row("Days", dayLabels.join(", "))}
        ${row("Duration", `${inquiry.durationDays} days`)}
        ${row("Notes", inquiry.notes || "None")}
        ${row("Goal", profile.primaryGoal)}
        ${row("Other goals", extraGoals)}
        ${row("Meals per day", String(profile.mealsPerDay || "Not provided"))}
        ${row("Calories", calories)}
        ${row("Protein", protein)}
        ${row("Diet", diet)}
        ${row("Allergies", allergyText)}
        ${row("Foods to avoid", profile.dislikes || "None")}
        ${row("Age", String(profile.age))}
        ${row("Gender", profile.gender || "Not provided")}
        ${row("Height", `${profile.heightCm} cm`)}
        ${row("Weight", `${profile.weightKg} kg`)}
        ${row("Delivery", profile.deliveryAddress || "Not provided")}
        ${row("Instructions", profile.deliveryInstructions || "None")}
        ${row("Submitted", submitted)}
      </table>
      <p style="color:#555;">${escapeHtml(allergyNote)}</p>
    </div>
  `;

  return {
    to,
    subject: `Meal plan inquiry: ${inquiry.planName} — ${name}`,
    text,
    html,
    replyTo: email || undefined,
  };
}

async function sendInquiryNotification(details) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const message = buildInquiryEmail(details);
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || "Nature Fit Restaurant <onboarding@resend.dev>",
      to: [message.to],
      reply_to: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${errorBody}`);
  }
  return response.json();
}

module.exports = { verifyMailer, sendContactNotification, sendInquiryNotification, buildInquiryEmail };