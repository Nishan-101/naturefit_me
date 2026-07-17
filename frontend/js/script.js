/* =========================================================
   NATURE FIT RESTAURANT — FRONTEND SCRIPT
========================================================= */

// ---- CONFIG ----
// Set this to your deployed backend API base URL (Render), e.g. "https://naturefit-api.onrender.com"
// Left as "" it will call a relative "/api" path (useful if frontend and backend share a domain).
const API_BASE_URL = window.NATURE_FIT_API_URL || "https://naturefit-api.onrender.com";
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initHeader();
  initMobileNav();
  initRevealAnimations();
  initMenuTabs();
  initFaqAccordion();
  initBackToTop();
  initContactForm();
  document.getElementById("year").textContent = new Date().getFullYear();
});

/* ---------- Light / dark theme ---------- */
function initTheme() {
  const root = document.documentElement;
  const toggleBtn = document.getElementById("themeToggle");
  const storageKey = "nature-fit-theme";

  const stored = localStorage.getItem(storageKey);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = stored || (prefersDark ? "dark" : "light");
  root.setAttribute("data-theme", initial);

  toggleBtn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem(storageKey, next);
  });
}

/* ---------- Sticky header on scroll ---------- */
function initHeader() {
  const header = document.getElementById("siteHeader");
  const toggle = () => {
    if (window.scrollY > 40) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  };
  toggle();
  window.addEventListener("scroll", toggle, { passive: true });
}

/* ---------- Mobile nav ---------- */
function initMobileNav() {
  const navToggle = document.getElementById("navToggle");
  const mainNav = document.getElementById("mainNav");

  navToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", isOpen);
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

/* ---------- Scroll reveal animations ---------- */
function initRevealAnimations() {
  const revealEls = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  revealEls.forEach((el) => observer.observe(el));
}

/* ---------- Menu category tabs ---------- */
function initMenuTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const cards = document.querySelectorAll(".menu-card");

  function applyFilter(category) {
    cards.forEach((card) => {
      const match = card.dataset.cat === category;
      card.classList.toggle("show", match);
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyFilter(btn.dataset.tab);
    });
  });

  // default view
  applyFilter(tabButtons[0]?.dataset.tab || "bowls");
}

/* ---------- FAQ accordion ---------- */
function initFaqAccordion() {
  const items = document.querySelectorAll(".faq-item");
  items.forEach((item) => {
    const question = item.querySelector(".faq-q");
    question.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");
      items.forEach((i) => i.classList.remove("open"));
      if (!isOpen) item.classList.add("open");
    });
  });
}

/* ---------- Back to top button ---------- */
function initBackToTop() {
  const btn = document.getElementById("backToTop");
  window.addEventListener(
    "scroll",
    () => {
      if (window.scrollY > 500) btn.classList.add("show");
      else btn.classList.remove("show");
    },
    { passive: true }
  );
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

/* ---------- Contact form ---------- */
function initContactForm() {
  const form = document.getElementById("contactForm");
  const submitBtn = document.getElementById("submitBtn");
  const statusEl = document.getElementById("formStatus");

  const fields = {
    fullName: { el: document.getElementById("fullName"), validate: validateName },
    email: { el: document.getElementById("email"), validate: validateEmail },
    phone: { el: document.getElementById("phone"), validate: validatePhone },
    subject: { el: document.getElementById("subject"), validate: validateSubject },
    message: { el: document.getElementById("message"), validate: validateMessage },
  };

  function validateName(v) {
    return v.trim().length >= 2 ? "" : "Please enter your full name (min. 2 characters).";
  }
  function validateEmail(v) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(v.trim()) ? "" : "Please enter a valid email address.";
  }
  function validatePhone(v) {
    const re = /^[+0-9\s()-]{7,20}$/;
    return re.test(v.trim()) ? "" : "Please enter a valid phone number.";
  }
  function validateSubject(v) {
    return v.trim().length >= 3 ? "" : "Please enter a subject (min. 3 characters).";
  }
  function validateMessage(v) {
    return v.trim().length >= 10 ? "" : "Message should be at least 10 characters.";
  }

  function showFieldError(name, message) {
    const field = fields[name];
    const errorEl = document.getElementById(`err-${name}`);
    field.el.closest(".form-group").classList.toggle("has-error", !!message);
    errorEl.textContent = message;
  }

  // live validation
  Object.entries(fields).forEach(([name, field]) => {
    field.el.addEventListener("blur", () => {
      showFieldError(name, field.validate(field.el.value));
    });
  });

  function validateAll() {
    let isValid = true;
    Object.entries(fields).forEach(([name, field]) => {
      const error = field.validate(field.el.value);
      showFieldError(name, error);
      if (error) isValid = false;
    });
    return isValid;
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.querySelector(".btn-text").textContent = isLoading ? "Sending..." : "Send Message";
    submitBtn.querySelector(".btn-spinner").hidden = !isLoading;
  }

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `form-status ${type || ""}`.trim();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("", "");

    if (!validateAll()) {
      setStatus("Please fix the highlighted fields above.", "error");
      return;
    }

    const payload = {
      fullName: fields.fullName.el.value.trim(),
      email: fields.email.el.value.trim(),
      phone: fields.phone.el.value.trim(),
      subject: fields.subject.el.value.trim(),
      message: fields.message.el.value.trim(),
    };

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.errors && Array.isArray(data.errors)) {
          data.errors.forEach((err) => {
            if (fields[err.field]) showFieldError(err.field, err.message);
          });
        }
        throw new Error(data.message || "Something went wrong. Please try again.");
      }

      setStatus("Thank you! Your message has been sent — we'll get back to you shortly.", "success");
      form.reset();
    } catch (err) {
      setStatus(err.message || "Unable to send your message right now. Please try again later.", "error");
    } finally {
      setLoading(false);
    }
  });
}
