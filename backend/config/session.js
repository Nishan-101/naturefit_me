const crypto = require("crypto");

const COOKIE = "nf_session";

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length < 24) return null;
  return secret;
}

function signSession(data) {
  const secret = sessionSecret();
  if (!secret) {
    throw httpError(503, "Sign-in is not configured yet. Set SESSION_SECRET on the server (at least 24 characters).");
  }
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function readSession(token) {
  const secret = sessionSecret();
  if (!secret || !token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    if (!data.role || (data.role !== "admin" && !data.sub)) return null;
    return data;
  } catch {
    return null;
  }
}

function readCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  });
  return out;
}

function cookieFlags(req, maxAgeSeconds) {
  const secure = Boolean(req.secure || req.headers["x-forwarded-proto"] === "https");
  const sameSite = secure ? "None" : "Lax";
  return [
    "HttpOnly",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=${sameSite}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function setSessionCookie(res, req, data, maxAgeSeconds) {
  const token = signSession(data);
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; ${cookieFlags(req, maxAgeSeconds)}`);
}

function clearSessionCookie(res, req) {
  res.setHeader("Set-Cookie", `${COOKIE}=; ${cookieFlags(req, 0)}`);
}

function currentSession(req) {
  return readSession(readCookies(req)[COOKIE]);
}

module.exports = {
  COOKIE,
  httpError,
  sessionSecret,
  setSessionCookie,
  clearSessionCookie,
  currentSession,
};
