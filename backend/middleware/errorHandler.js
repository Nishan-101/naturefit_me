/* eslint-disable no-unused-vars */

// 404 handler — for any route that doesn't match.
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

// Centralized error handler — keeps error responses consistent and hides internals in production.
function errorHandler(err, req, res, next) {
  console.error("❌ Unhandled error:", err);

  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === "production";

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? "Something went wrong on our end. Please try again later." : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

module.exports = { notFoundHandler, errorHandler };
