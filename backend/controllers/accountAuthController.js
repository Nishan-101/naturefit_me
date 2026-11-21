const { httpError, setSessionCookie, clearSessionCookie, currentSession } = require("../config/session");
const { normalizePhone } = require("../lib/phone");
const { isUaeMobile } = require("../lib/orderRules");
const { hashPassword, verifyPassword } = require("../lib/passwords");
const customers = require("../models/customerModel");

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function register(req, res, next) {
  try {
    const fullName = clean(req.body.fullName, 150);
    const email = clean(req.body.email, 150).toLowerCase();
    const password = String(req.body.password || "");
    const phone = normalizePhone(req.body.countryCode || "971", req.body.nationalNumber);
    if (fullName.length < 2) throw httpError(400, "Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "Enter a valid email address.");
    if (!isUaeMobile(phone)) throw httpError(400, "Enter a UAE mobile number.");
    if (password.length < 8 || password.length > 100) throw httpError(400, "Choose a password of at least 8 characters.");
    if (req.body.privacyConsent !== true) throw httpError(400, "Privacy consent is required.");

    const byEmail = await customers.findCustomerByEmail(email);
    const byPhone = await customers.findCustomerByPhone(phone);
    if (byEmail && (!byPhone || byEmail.id !== byPhone.id)) {
      throw httpError(409, "That email is already registered. Log in instead.");
    }
    if (byPhone && byPhone.password_hash) throw httpError(409, "This mobile number already has an account. Log in instead.");
    if (byPhone && byPhone.email && byPhone.email.toLowerCase() !== email) {
      throw httpError(409, "This mobile number is linked to a different email.");
    }
    const customer = byPhone || (await customers.createCustomer(phone));
    await customers.updateCustomerIdentity(customer.id, fullName, email);
    await customers.setPassword(customer.id, hashPassword(password));
    await customers.setConsent(customer.id, {
      privacyConsent: true,
      whatsappOptIn: req.body.whatsappOptIn === true,
    });
    const saved = await customers.findCustomerById(customer.id);
    await customers.touchLogin(saved.id);
    setSessionCookie(res, req, { sub: saved.id, role: "customer", exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }, 30 * 24 * 60 * 60);
    res.status(201).json({ success: true, customer: customers.publicCustomer(saved) });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const email = clean(req.body.email, 150).toLowerCase();
    const password = String(req.body.password || "");
    const customer = await customers.findCustomerByEmail(email);
    if (!customer || !customer.password_hash || !verifyPassword(password, customer.password_hash)) {
      throw httpError(401, "That email or password is incorrect.");
    }
    await customers.touchLogin(customer.id);
    setSessionCookie(res, req, { sub: customer.id, role: "customer", exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }, 30 * 24 * 60 * 60);
    res.json({ success: true, customer: customers.publicCustomer(customer) });
  } catch (error) {
    next(error);
  }
}

function logout(req, res) {
  clearSessionCookie(res, req);
  res.json({ success: true });
}

async function me(req, res, next) {
  try {
    const session = currentSession(req);
    if (!session || session.role !== "customer") {
      res.json({ success: true, customer: null });
      return;
    }
    const customer = await customers.findCustomerById(session.sub);
    res.json({ success: true, customer: customers.publicCustomer(customer) });
  } catch (error) {
    next(error);
  }
}

module.exports = { register, login, logout, me };
