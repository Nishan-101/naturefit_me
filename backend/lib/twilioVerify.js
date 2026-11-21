function basicAuth(accountSid, authToken) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function verificationUrl(serviceSid, check) {
  const service = encodeURIComponent(serviceSid);
  const action = check ? "VerificationCheck" : "Verifications";
  return `https://verify.twilio.com/v2/Services/${service}/${action}`;
}

function twilioConfig(env = process.env) {
  const accountSid = env.TWILIO_ACCOUNT_SID || "";
  const authToken = env.TWILIO_AUTH_TOKEN || "";
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID || "";
  return {
    configured: Boolean(accountSid && authToken && serviceSid),
    accountSid,
    authToken,
    serviceSid,
  };
}

async function postVerify({ accountSid, authToken, serviceSid, form, check, fetchImpl }) {
  const response = await fetchImpl(verificationUrl(serviceSid, check), {
    method: "POST",
    headers: {
      Authorization: basicAuth(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, httpStatus: response.status, code: payload.code || null };
  }
  return { ok: true, sid: payload.sid || null, status: payload.status || "" };
}

async function createVerification({ accountSid, authToken, serviceSid, to, fetchImpl = fetch }) {
  return postVerify({
    accountSid,
    authToken,
    serviceSid,
    check: false,
    fetchImpl,
    form: { To: to, Channel: "sms" },
  });
}

async function checkVerification({ accountSid, authToken, serviceSid, to, code, fetchImpl = fetch }) {
  return postVerify({
    accountSid,
    authToken,
    serviceSid,
    check: true,
    fetchImpl,
    form: { To: to, Code: code },
  });
}

module.exports = { twilioConfig, verificationUrl, createVerification, checkVerification };
