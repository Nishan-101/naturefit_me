const SEND_WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CHECKS = 5;
const OTP_TTL_MS = 10 * 60 * 1000;
const PROOF_TTL_MS = 20 * 60 * 1000;

function sendAllowed(createdAtMs, nowMs) {
  const recent = (createdAtMs || []).filter((time) => nowMs - time < SEND_WINDOW_MS && nowMs - time >= 0);
  if (recent.length >= MAX_SENDS) {
    return { ok: false, code: "rate" };
  }
  const latest = recent.reduce((max, time) => (time > max ? time : max), 0);
  if (latest && nowMs - latest < RESEND_COOLDOWN_MS) {
    return {
      ok: false,
      code: "cooldown",
      retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - (nowMs - latest)) / 1000),
    };
  }
  return { ok: true };
}

function checkAllowed(checkCount) {
  return Number(checkCount) < MAX_CHECKS;
}

function publicOtpError(httpStatus, code) {
  if (httpStatus === 429 || code === 20429 || code === 60203) {
    return {
      statusCode: 429,
      message: "Too many verification messages. Wait a few minutes and try again.",
    };
  }
  if (code === 60200 || code === 60202 || code === 20404 || httpStatus === 404) {
    return {
      statusCode: 400,
      message: "That code is not valid. Request a new one if it has expired.",
    };
  }
  return {
    statusCode: 502,
    message: "The SMS provider could not complete verification. Your number was not marked as verified.",
  };
}

function referencesProductionSite(value) {
  return /naturefit\.site/i.test(String(value || ""));
}

const STAGING_DB_NAME = "naturefit_staging";

/**
 * SMS verification is skipped only for a fully identified staging sandbox.
 * Every other configuration, including a missing or mixed setting, keeps OTP required.
 */
function packageOtpRequired(env) {
  const source = env || {};
  const appEnv = String(source.appEnv || "").trim().toLowerCase();
  const secret = String(source.stripeSecretKey || "").trim();
  const liveEnabled = source.liveEnabled === true || source.liveEnabled === "true";
  const stagingOptOut = source.stagingOtpOptional === true || source.stagingOtpOptional === "true";
  const publicSite = String(source.publicSiteUrl || "").trim();
  const clientOrigin = String(source.clientOrigin || "").trim();
  const dbName = String(source.dbName || "").trim();
  const productionSite = referencesProductionSite(publicSite) || referencesProductionSite(clientOrigin);
  const testKey = secret.startsWith("sk_test_") && !secret.startsWith("sk_live_");
  const isolatedStaging =
    appEnv === "staging" &&
    stagingOptOut &&
    testKey &&
    !liveEnabled &&
    publicSite.length > 0 &&
    clientOrigin.length > 0 &&
    !productionSite &&
    dbName === STAGING_DB_NAME;
  return !isolatedStaging;
}

function parseSqlUtc(value) {
  if (value instanceof Date) return value.getTime();
  if (!value) return NaN;
  const text = String(value).trim().replace(" ", "T");
  return Date.parse(text.endsWith("Z") ? text : `${text}Z`);
}

function sqlDateTime(epochMs) {
  return new Date(epochMs).toISOString().slice(0, 19).replace("T", " ");
}

module.exports = {
  SEND_WINDOW_MS,
  MAX_SENDS,
  RESEND_COOLDOWN_MS,
  MAX_CHECKS,
  OTP_TTL_MS,
  PROOF_TTL_MS,
  sendAllowed,
  checkAllowed,
  publicOtpError,
  STAGING_DB_NAME,
  packageOtpRequired,
  parseSqlUtc,
  sqlDateTime,
};
