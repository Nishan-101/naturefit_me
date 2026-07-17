const { body, validationResult } = require("express-validator");

// Validation + sanitization rules for the contact form fields.
const contactValidationRules = [
  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full name is required.")
    .isLength({ min: 2, max: 150 })
    .withMessage("Full name must be between 2 and 150 characters.")
    .matches(/^[a-zA-Z\u00C0-\u017F\s'.-]+$/)
    .withMessage("Full name contains invalid characters."),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email address is required.")
    .isEmail()
    .withMessage("Please provide a valid email address.")
    .normalizeEmail()
    .isLength({ max: 150 })
    .withMessage("Email address is too long."),

  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required.")
    .matches(/^[+0-9\s()-]{7,20}$/)
    .withMessage("Please provide a valid phone number."),

  body("subject")
    .trim()
    .notEmpty()
    .withMessage("Subject is required.")
    .isLength({ min: 3, max: 200 })
    .withMessage("Subject must be between 3 and 200 characters."),

  body("message")
    .trim()
    .notEmpty()
    .withMessage("Message is required.")
    .isLength({ min: 10, max: 3000 })
    .withMessage("Message must be between 10 and 3000 characters."),
];

/**
 * Collects validation errors (if any) and returns a clean 422 response.
 * Each error is mapped to { field, message } for easy frontend field-level display.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));
    return res.status(422).json({
      success: false,
      message: "Please correct the errors below and try again.",
      errors: formattedErrors,
    });
  }
  next();
}

module.exports = { contactValidationRules, handleValidationErrors };
