const { currentSession, httpError } = require("../config/session");

function requireAdmin(req, res, next) {
  const session = currentSession(req);
  if (!session || session.role !== "admin") {
    return next(httpError(401, "Staff login required."));
  }
  req.auth = session;
  return next();
}

function requireCustomer(req, res, next) {
  const session = currentSession(req);
  if (!session || session.role !== "customer" || !session.sub) {
    return next(httpError(401, "Please log in to view your meal plans."));
  }
  req.auth = session;
  return next();
}

module.exports = { requireAdmin, requireCustomer };
