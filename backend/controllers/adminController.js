const crypto = require("crypto");
const { httpError, setSessionCookie, clearSessionCookie } = require("../config/session");
const customers = require("../models/customerModel");
const inquiries = require("../models/inquiryModel");

const STATUSES = ["new", "reviewing", "confirmed", "closed"];

function login(req, res, next) {
  try {
    const expected = process.env.ADMIN_PASSWORD || "";
    if (expected.length < 10) {
      throw httpError(503, "Staff login is not configured. Set ADMIN_PASSWORD on the server (at least 10 characters).");
    }
    const provided = String(req.body.password || "");
    const left = crypto.createHash("sha256").update(provided).digest();
    const right = crypto.createHash("sha256").update(expected).digest();
    if (!crypto.timingSafeEqual(left, right)) {
      throw httpError(401, "That staff password is incorrect.");
    }
    setSessionCookie(
      res,
      req,
      { sub: 0, role: "admin", exp: Date.now() + 12 * 60 * 60 * 1000 },
      12 * 60 * 60
    );
    res.json({ success: true, message: "Staff session started." });
  } catch (error) {
    next(error);
  }
}

function logout(req, res) {
  clearSessionCookie(res, req);
  res.json({ success: true, message: "Staff session ended." });
}

async function listCustomers(req, res, next) {
  try {
    res.json({ success: true, customers: await customers.listCustomers() });
  } catch (error) {
    next(error);
  }
}

async function listInquiries(req, res, next) {
  try {
    res.json({ success: true, inquiries: await inquiries.listAll() });
  } catch (error) {
    next(error);
  }
}

async function setStatus(req, res, next) {
  try {
    const status = String(req.body.status || "");
    if (!STATUSES.includes(status)) throw httpError(400, "Choose a valid inquiry status.");
    const inquiry = await inquiries.updateStatus(Number(req.params.id), status);
    if (!inquiry) throw httpError(404, "Inquiry not found.");
    res.json({ success: true, inquiry });
  } catch (error) {
    next(error);
  }
}

module.exports = { login, logout, listCustomers, listInquiries, setStatus };
