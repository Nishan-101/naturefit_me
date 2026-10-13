(function () {
  function apiBase() {
    if (window.NATURE_FIT_API_URL) return String(window.NATURE_FIT_API_URL).replace(/\/$/, "");
    if (location.port === "5000") return "";
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return "http://localhost:5000";
    return "https://naturefit-me.onrender.com";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function api(path, options) {
    const opts = options || {};
    const response = await fetch(`${apiBase()}${path}`, {
      method: opts.method || "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "Something went wrong. Please try again.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function setStatus(el, message, type) {
    if (!el) return;
    el.textContent = message || "";
    const base = el.classList.contains("step-status") ? "step-status" : "app-status";
    el.className = `${base} ${type || ""}`.trim();
  }

  function readDraft() {
    try {
      return JSON.parse(sessionStorage.getItem("nf-plan-draft") || "null");
    } catch {
      return null;
    }
  }

  function saveDraft(draft) {
    sessionStorage.setItem("nf-plan-draft", JSON.stringify(draft));
  }

  function contactActions(email, phone) {
    const links = [];
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) {
      const subject = encodeURIComponent("Your Nature Fit meal plan");
      links.push(`<a href="mailto:${encodeURIComponent(email)}?subject=${subject}">Email</a>`);
    }
    const tel = String(phone || "").replace(/[^\d+]/g, "");
    if (/^\+[1-9]\d{7,14}$/.test(tel)) links.push(`<a href="tel:${tel}">Call</a>`);
    return links.join(" · ");
  }

  const GOALS = ["Fat Loss", "Weight Management", "Balanced Diet", "Healthy Lifestyle", "Muscle Gain", "Other"];
  const ALLERGIES = [
    "No known food allergies",
    "Dairy",
    "Eggs",
    "Peanuts",
    "Tree nuts",
    "Fish",
    "Shellfish",
    "Soy",
    "Gluten / wheat",
    "Sesame",
    "Other",
  ];

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  }

  const PLAN_NAMES = {
    "weight-loss": "Weight Loss",
    "muscle-gain": "Muscle Gain",
    balance: "Balance",
    lifestyle: "Healthy Lifestyle",
  };

  function initAccount() {
    const wizard = document.getElementById("wizard");
    if (!wizard) return;
    const sent = document.getElementById("sent");
    wizard.hidden = false;

    function showStep(step, options) {
      document.querySelectorAll(".wizard-step").forEach((panel) => {
        panel.hidden = panel.dataset.step !== String(step);
      });
      document.getElementById("stepLabel").textContent = `Step ${step} of 3`;
      if (options && options.scroll === false) return;
      const top = wizard.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }

    function stepStatus(step) {
      return document.getElementById(`step${step}Status`);
    }

    function syncGuidance(boxId, inputId) {
      const box = document.getElementById(boxId);
      const input = document.getElementById(inputId);
      input.disabled = box.checked;
      if (box.checked) input.value = "";
    }

    function describeDraft(draft) {
      const name = PLAN_NAMES[draft.plan] || draft.plan || "Meal plan";
      const meals = Array.isArray(draft.meals) ? draft.meals.join(", ") : "";
      const days = Array.isArray(draft.days) ? draft.days.length : 0;
      return `${name} · ${meals} · ${days} days a week · ${draft.duration} days`;
    }

    const draftLine = document.getElementById("draftSummary");
    const openingDraft = readDraft();
    if (draftLine) {
      draftLine.textContent = openingDraft
        ? describeDraft(openingDraft)
        : "Choose a meal plan on the home page before sending this inquiry.";
      draftLine.className = openingDraft ? "field-note" : "setup-banner";
    }

    function profileBody() {
      return {
        fullName: document.getElementById("fullName").value,
        email: document.getElementById("email").value,
        age: document.getElementById("age").value,
        gender: document.getElementById("gender").value,
        heightCm: document.getElementById("heightCm").value,
        weightKg: document.getElementById("weightKg").value,
        primaryGoal: document.getElementById("primaryGoal").value,
        extraGoals: [],
        calorieGuidance: document.getElementById("calorieGuidance").checked,
        calorieKcal: document.getElementById("calorieKcal").value,
        proteinGuidance: document.getElementById("proteinGuidance").checked,
        proteinGrams: document.getElementById("proteinGrams").value,
        mealsPerDay: document.getElementById("mealsPerDay").value,
        preferredDuration: document.getElementById("preferredDuration").value,
        allergies: checkedValues("allergy"),
        allergyOther: document.getElementById("allergyOther").value,
        diet: document.getElementById("diet").value,
        dietOther: document.getElementById("dietOther").value,
        dislikes: document.getElementById("dislikes").value,
        deliveryAddress: document.getElementById("deliveryAddress").value,
        deliveryInstructions: document.getElementById("deliveryInstructions").value,
        allergyAcknowledged: document.getElementById("allergyAck").checked,
      };
    }

    document.getElementById("calorieGuidance").addEventListener("change", () => syncGuidance("calorieGuidance", "calorieKcal"));
    document.getElementById("proteinGuidance").addEventListener("change", () => syncGuidance("proteinGuidance", "proteinGrams"));
    document.getElementById("toStep2").addEventListener("click", () => {
      const name = document.getElementById("fullName").value.trim();
      const email = document.getElementById("email").value.trim();
      const phone = document.getElementById("nationalNumber").value.replace(/\D/g, "");
      const age = Number(document.getElementById("age").value);
      const height = Number(document.getElementById("heightCm").value);
      const weight = Number(document.getElementById("weightKg").value);
      const notice = stepStatus(1);
      if (name.length < 2) return setStatus(notice, "Enter your full name.", "error");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return setStatus(notice, "Enter the email address where Nature Fit should reply.", "error");
      }
      if (phone.length < 8) return setStatus(notice, "Enter a phone number so Nature Fit can call you.", "error");
      if (!Number.isInteger(age) || age < 18 || age > 90) return setStatus(notice, "Enter an age between 18 and 90.", "error");
      if (!Number.isInteger(height) || height < 120 || height > 230) return setStatus(notice, "Enter your height in centimeters.", "error");
      if (!Number.isFinite(weight) || weight < 35 || weight > 250) return setStatus(notice, "Enter your weight in kilograms.", "error");
      setStatus(notice, "", "");
      showStep(2);
    });
    document.getElementById("toStep3").addEventListener("click", () => {
      const goal = document.getElementById("primaryGoal").value;
      const calorieGuidance = document.getElementById("calorieGuidance").checked;
      const proteinGuidance = document.getElementById("proteinGuidance").checked;
      const calories = Number(document.getElementById("calorieKcal").value);
      const protein = Number(document.getElementById("proteinGrams").value);
      const notice = stepStatus(2);
      if (!goal) return setStatus(notice, "Choose a fitness goal.", "error");
      if (!calorieGuidance && (!Number.isInteger(calories) || calories < 800 || calories > 4500)) {
        return setStatus(notice, "Enter a calorie target, or ask Nature Fit for guidance.", "error");
      }
      if (!proteinGuidance && (!Number.isInteger(protein) || protein < 30 || protein > 300)) {
        return setStatus(notice, "Enter a protein target, or ask Nature Fit for guidance.", "error");
      }
      if (!document.getElementById("mealsPerDay").value) return setStatus(notice, "Choose how many meals you want each day.", "error");
      if (!document.getElementById("preferredDuration").value) return setStatus(notice, "Choose a plan length.", "error");
      setStatus(notice, "", "");
      showStep(3);
    });
    document.getElementById("backTo1").addEventListener("click", () => showStep(1));
    document.getElementById("backTo2").addEventListener("click", () => showStep(2));

    document.getElementById("profileForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const draft = readDraft();
      const saveBtn = document.getElementById("saveProfile");
      const notice = stepStatus(3);
      const allergies = checkedValues("allergy");
      const diet = document.getElementById("diet").value;
      const address = document.getElementById("deliveryAddress").value.trim();
      if (!draft) {
        setStatus(notice, "Choose a meal plan on the home page first.", "error");
        return;
      }
      if (!allergies.length) {
        setStatus(notice, "Choose a food allergy, or select no known food allergies.", "error");
        return;
      }
      if (allergies.includes("No known food allergies") && allergies.length > 1) {
        setStatus(notice, "If you have no known food allergies, uncheck the other allergy boxes.", "error");
        return;
      }
      if (allergies.includes("Other") && document.getElementById("allergyOther").value.trim().length < 2) {
        setStatus(notice, "Describe the other allergy.", "error");
        return;
      }
      if (!diet) {
        setStatus(notice, "Choose a dietary preference.", "error");
        return;
      }
      if (diet === "Other" && document.getElementById("dietOther").value.trim().length < 2) {
        setStatus(notice, "Describe the other dietary preference.", "error");
        return;
      }
      if (address.length < 8) {
        setStatus(notice, "Enter a delivery address.", "error");
        return;
      }
      if (!document.getElementById("allergyAck").checked) {
        setStatus(notice, "Please confirm that you understand the allergy note.", "error");
        return;
      }
      saveBtn.disabled = true;
      setStatus(notice, "Emailing your meal-plan inquiry to Nature Fit…", "pending");
      try {
        const result = await api("/api/inquiries", {
          method: "POST",
          body: {
            ...profileBody(),
            countryCode: document.getElementById("countryCode").value,
            nationalNumber: document.getElementById("nationalNumber").value,
            notes: document.getElementById("inquiryNotes").value,
            plan: draft.plan,
            meals: draft.meals,
            days: draft.days,
            duration: draft.duration,
          },
        });
        sessionStorage.removeItem("nf-plan-draft");
        wizard.hidden = true;
        sent.hidden = false;
        document.getElementById("sentMessage").textContent = result.message;
        setStatus(notice, "", "");
      } catch (error) {
        setStatus(notice, error.message, "error");
        saveBtn.disabled = false;
      }
    });

    showStep(1, { scroll: false });
  }

  function initAdmin() {
    const form = document.getElementById("adminLogin");
    if (!form) return;
    const status = document.getElementById("adminStatus");
    const board = document.getElementById("adminBoard");

    function inquiryRows(items) {
      const body = document.getElementById("inquiryRows");
      if (!items.length) {
        body.innerHTML = "<tr><td colspan=\"6\">No meal-plan inquiries yet.</td></tr>";
        return;
      }
      body.innerHTML = items
        .map(
          (item) => `<tr>
            <td>${escapeHtml(item.customerName || "—")}<br><span>${escapeHtml(item.customerPhone || "")}</span><br><span>${escapeHtml(item.customerEmail || "")}</span><br>${contactActions(item.customerEmail, item.customerPhone)}</td>
            <td>${escapeHtml(item.planName)}<br><span>${escapeHtml(item.durationDays)} days</span></td>
            <td>${escapeHtml(item.mealLabels.join(", "))}<br><span>${escapeHtml(item.dayLabels.join(", "))}</span></td>
            <td>${escapeHtml(item.notes || "—")}</td>
            <td>${item.emailSent ? "Sent" : `<button type="button" class="btn btn-outline btn-small" data-admin-resend="${escapeHtml(item.id)}">Retry</button>`}</td>
            <td>
              <label class="sr-only" for="status-${item.id}">Status for inquiry ${item.id}</label>
              <select id="status-${item.id}" data-inquiry="${item.id}">
                ${["new", "reviewing", "confirmed", "closed"]
                  .map((statusName) => `<option ${statusName === item.status ? "selected" : ""}>${statusName}</option>`)
                  .join("")}
              </select>
            </td>
          </tr>`
        )
        .join("");
      body.querySelectorAll("select").forEach((select) => {
        select.addEventListener("change", async () => {
          try {
            await api(`/api/admin/inquiries/${select.dataset.inquiry}`, {
              method: "PATCH",
              body: { status: select.value },
            });
            setStatus(status, "Inquiry updated.", "success");
          } catch (error) {
            setStatus(status, error.message, "error");
          }
        });
      });
      body.querySelectorAll("[data-admin-resend]").forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const result = await api(`/api/admin/inquiries/${button.dataset.adminResend}/resend`, {
              method: "POST",
              body: {},
            });
            setStatus(status, result.message, result.emailSent ? "success" : "error");
            await loadBoard();
          } catch (error) {
            setStatus(status, error.message, "error");
            button.disabled = false;
          }
        });
      });
    }

    function customerRows(items) {
      const body = document.getElementById("customerRows");
      if (!items.length) {
        body.innerHTML = "<tr><td colspan=\"5\">No customers yet.</td></tr>";
        return;
      }
      body.innerHTML = items
        .map((item) => {
          const profile = item.profile;
          const allergies = profile?.allergies?.length ? profile.allergies.join(", ") : "Not provided";
          const flagged = profile?.allergies?.some((allergy) => allergy !== "No known food allergies");
          return `<tr>
            <td>${escapeHtml(item.fullName || "—")}<br><span>${escapeHtml(item.phone)}</span><br><span>${escapeHtml(item.email || "")}</span><br>${contactActions(item.email, item.phone)}</td>
            <td>${profile ? `${escapeHtml(profile.primaryGoal || "—")} · ${escapeHtml(profile.activityLevel || "")}` : "Profile not finished"}</td>
            <td>${profile ? `${escapeHtml(profile.age || "—")} yrs · ${escapeHtml(profile.heightCm || "—")} cm · ${escapeHtml(profile.weightKg || "—")} kg` : "—"}</td>
            <td class="${flagged ? "allergy-flag" : ""}">${escapeHtml(allergies)}${profile?.allergyOther ? ` (${escapeHtml(profile.allergyOther)})` : ""}<br><span>${escapeHtml(profile?.diet || "")} ${escapeHtml(profile?.dislikes || "")}</span></td>
            <td>${profile?.completed ? "Complete" : "Incomplete"}</td>
          </tr>`;
        })
        .join("");
    }

    async function loadBoard() {
      const [people, plans] = await Promise.all([api("/api/admin/customers"), api("/api/admin/inquiries")]);
      customerRows(people.customers);
      inquiryRows(plans.inquiries);
      form.hidden = true;
      board.hidden = false;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus(status, "Checking staff password…", "pending");
      try {
        await api("/api/admin/login", {
          method: "POST",
          body: { password: document.getElementById("adminPassword").value },
        });
        await loadBoard();
        setStatus(status, "", "");
      } catch (error) {
        setStatus(status, error.message, "error");
      }
    });

    document.getElementById("adminLogout").addEventListener("click", async () => {
      await api("/api/admin/logout", { method: "POST", body: {} });
      location.reload();
    });

    api("/api/admin/customers")
      .then(loadBoard)
      .catch(() => {
        /* staff is not logged in yet */
      });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page;
    if (page === "account") initAccount();
    if (page === "admin") initAdmin();
  });

  window.NatureFit = { api, saveDraft, readDraft, GOALS, ALLERGIES };
})();
