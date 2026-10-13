/* =========================================================
   NATURE FIT RESTAURANT — FRONTEND SCRIPT
========================================================= */

// ---- CONFIG ----
// Set this to your deployed backend API base URL (Render), e.g. "https://naturefit-api.onrender.com"
// Left as "" it will call a relative "/api" path (useful if frontend and backend share a domain).
const API_BASE_URL = window.NATURE_FIT_API_URL || "https://naturefit-me.onrender.com";
// const API_BASE_URL = window.NATURE_FIT_API_URL || "https://naturefit-api.onrender.com";
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initHeader();
  initMobileNav();
  initRevealAnimations();
  initMenuTabs();
  initFaqAccordion();
  initBackToTop();
  initContactForm();
  initPlanBuilder();
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

  if (toggleBtn) toggleBtn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem(storageKey, next);
  });
}

/* ---------- Sticky header on scroll ---------- */
function initHeader() {
  const header = document.getElementById("siteHeader");
  if (!header) return;
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
  if (!navToggle || !mainNav) return;

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
  if (!btn) return;
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
  if (!form) return;
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

/* ---------- Meal plan builder ---------- */
function initPlanBuilder() {
  const root = document.getElementById("plans");
  if (!root) return;

  const plans = {
    "weight-loss": "Weight Loss",
    "muscle-gain": "Muscle Gain",
    balance: "Balance",
    lifestyle: "Healthy Lifestyle",
  };
  const mealNames = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    am: "AM Meal",
    pm: "PM Meal",
  };
  const mealOrder = ["breakfast", "lunch", "dinner", "am", "pm"];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const state = {
    plan: "weight-loss",
    meals: new Set(["breakfast", "lunch", "dinner"]),
    days: new Set([0, 1, 2, 3, 4]),
    duration: 20,
  };

  const hint = document.getElementById("planHint");
  const summary = document.getElementById("planSummaryLine");

  function showHint(message) {
    hint.hidden = !message;
    hint.textContent = message || "";
  }

  function mealOk(next) {
    const hasMain = next.has("lunch") || next.has("dinner");
    return next.size >= 2 && hasMain;
  }

  root.querySelectorAll(".ps-more").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".ps-style");
      const open = card.classList.toggle("is-open");
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.textContent = open ? "Show less" : "Learn more";
    });
  });

  root.querySelectorAll(".ps-select").forEach((button) => {
    button.addEventListener("click", () => {
      state.plan = button.dataset.plan;
      showHint("");
      render();
    });
  });

  root.querySelectorAll(".ps-meal").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.meal;
      const next = new Set(state.meals);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (!mealOk(next)) {
        showHint("Select at least 2 meals, including lunch or dinner.");
        return;
      }
      state.meals = next;
      showHint("");
      render();
    });
  });

  root.querySelectorAll(".ps-day").forEach((button) => {
    button.addEventListener("click", () => {
      const day = Number(button.dataset.day);
      const next = new Set(state.days);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      if (next.size < 5) {
        showHint("Select at least 5 days a week.");
        return;
      }
      state.days = next;
      showHint("");
      render();
    });
  });

  root.querySelectorAll(".ps-duration").forEach((button) => {
    button.addEventListener("click", () => {
      state.duration = Number(button.dataset.days);
      showHint("");
      render();
    });
  });

  function render() {
    root.querySelectorAll(".ps-style").forEach((card) => {
      const on = card.dataset.style === state.plan;
      card.classList.toggle("is-selected", on);
      const button = card.querySelector(".ps-select");
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.innerHTML = on
        ? '<i class="fa-solid fa-check"></i> Selected'
        : "Select plan";
    });

    root.querySelectorAll(".ps-meal").forEach((button) => {
      const on = state.meals.has(button.dataset.meal);
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });

    root.querySelectorAll(".ps-day").forEach((button) => {
      const on = state.days.has(Number(button.dataset.day));
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });

    root.querySelectorAll(".ps-duration").forEach((button) => {
      const on = Number(button.dataset.days) === state.duration;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });

    const chosenMeals = mealOrder.filter((id) => state.meals.has(id)).map((id) => mealNames[id]);
    const chosenDays = [...state.days].sort((a, b) => a - b).map((day) => dayNames[day]);
    const planName = plans[state.plan];
    summary.textContent = `${planName}, ${chosenMeals.length} meals, ${chosenDays.length} days per week, ${state.duration} days`;

  }

  function currentDraft() {
    return {
      plan: state.plan,
      meals: mealOrder.filter((id) => state.meals.has(id)),
      days: [...state.days].sort((a, b) => a - b),
      duration: state.duration,
    };
  }

  const submitBtn = document.getElementById("planSubmit");
  const submitStatus = document.getElementById("planSubmitStatus");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      const draft = currentDraft();
      if (window.NatureFit) NatureFit.saveDraft(draft);
      if (submitStatus) submitStatus.textContent = "Add your contact details so we can email you back.";
      location.href = "account.html";
    });
  }

  render();
}
