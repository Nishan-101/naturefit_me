(function () {
  function apiBase() {
    if (window.NATURE_FIT_API_URL) return String(window.NATURE_FIT_API_URL).replace(/\/$/, "");
    if (location.port === "5000") return "";
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return "http://localhost:5000";
    return "";
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
    let response;
    try {
      response = await fetch(`${apiBase()}${path}`, {
        method: opts.method || "GET",
        credentials: opts.credentials || "include",
        keepalive: Boolean(opts.keepalive),
        headers: { "Content-Type": "application/json" },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      throw new Error("Could not reach Nature Fit. Please try again in a moment.");
    }
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
      document.getElementById("stepLabel").textContent = `Step ${step} of 2`;
      if (options && options.scroll === false) return;
      const top = wizard.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }

    function stepStatus(step) {
      return document.getElementById(`step${step}Status`);
    }

    function selectedValue(name) {
      const chosen = document.querySelector(`input[name="${name}"]:checked`);
      return chosen ? chosen.value : "";
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

    function deliveryAddress() {
      const area = selectedValue("area");
      const building = document.getElementById("building").value.trim();
      return [area, "Dubai", building].filter(Boolean).join(", ");
    }

    function profileBody(draft) {
      const mealCount = Array.isArray(draft.meals) ? draft.meals.length : 0;
      return {
        fullName: document.getElementById("fullName").value,
        email: document.getElementById("email").value,
        primaryGoal: selectedValue("goal"),
        extraGoals: [],
        calorieGuidance: true,
        proteinGuidance: true,
        mealsPerDay: Math.min(5, Math.max(2, mealCount || 2)),
        preferredDuration: draft.duration,
        allergies: checkedValues("allergy"),
        allergyOther: document.getElementById("allergyOther").value,
        diet: selectedValue("dietChoice"),
        dislikes: document.getElementById("dislikes").value,
        deliveryAddress: deliveryAddress(),
        deliveryInstructions: document.getElementById("building").value.trim(),
        allergyAcknowledged: document.getElementById("allergyAck").checked,
      };
    }

    document.querySelectorAll('input[name="allergy"]').forEach((box) => {
      box.addEventListener("change", () => {
        if (box.value === "No known food allergies" && box.checked) {
          document.querySelectorAll('input[name="allergy"]').forEach((other) => {
            if (other !== box) other.checked = false;
          });
        } else if (box.checked && box.value !== "No known food allergies") {
          const none = document.querySelector('input[name="allergy"][value="No known food allergies"]');
          if (none) none.checked = false;
        }
        const other = document.querySelector('input[name="allergy"][value="Other"]');
        document.getElementById("allergyOtherWrap").hidden = !(other && other.checked);
      });
    });

    document.getElementById("toStep2").addEventListener("click", () => {
      const name = document.getElementById("fullName").value.trim();
      const email = document.getElementById("email").value.trim();
      const phone = document.getElementById("nationalNumber").value.replace(/\D/g, "");
      const area = selectedValue("area");
      const building = document.getElementById("building").value.trim();
      const notice = stepStatus(1);
      if (name.length < 2) return setStatus(notice, "Enter your full name.", "error");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return setStatus(notice, "Enter the email where we should reply.", "error");
      }
      if (phone.length < 8) return setStatus(notice, "Enter a phone number so we can call you.", "error");
      if (!selectedValue("callTime")) return setStatus(notice, "Choose the best time for a call.", "error");
      if (!area) return setStatus(notice, "Choose a delivery area.", "error");
      if (area === "Other" && building.length < 3) {
        return setStatus(notice, "Add the building or street for your delivery area.", "error");
      }
      setStatus(notice, "", "");
      showStep(2);
    });
    document.getElementById("backTo1").addEventListener("click", () => showStep(1));

    function showThanks() {
      sessionStorage.removeItem("nf-plan-draft");
      wizard.hidden = true;
      sent.hidden = false;
      document.getElementById("sentMessage").textContent = "Our team will reach you soon.";
      const top = sent.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }

    document.getElementById("profileForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const draft = readDraft();
      const saveBtn = document.getElementById("saveProfile");
      const notice = stepStatus(2);
      const allergies = checkedValues("allergy");
      const diet = selectedValue("dietChoice");
      if (!draft) {
        setStatus(notice, "Choose a meal plan on the home page first.", "error");
        return;
      }
      if (!selectedValue("goal")) return setStatus(notice, "Choose what you want from the plan.", "error");
      if (!diet) return setStatus(notice, "Choose how you like to eat.", "error");
      if (!allergies.length) return setStatus(notice, "Choose an allergy, or tap None.", "error");
      if (allergies.includes("Other") && document.getElementById("allergyOther").value.trim().length < 2) {
        return setStatus(notice, "Tell us the other allergy.", "error");
      }
      if (!document.getElementById("allergyAck").checked) {
        return setStatus(notice, "Please confirm the allergy note.", "error");
      }
      saveBtn.disabled = true;
      setStatus(notice, "Sending your inquiry…", "pending");
      const callTime = selectedValue("callTime");
      try {
        await api("/api/inquiries", {
          method: "POST",
          credentials: "omit",
          keepalive: true,
          body: {
            ...profileBody(draft),
            countryCode: document.getElementById("countryCode").value,
            nationalNumber: document.getElementById("nationalNumber").value,
            notes: `Best time to call: ${callTime}`,
            plan: draft.plan,
            meals: draft.meals,
            days: draft.days,
            duration: draft.duration,
          },
        });
        showThanks();
      } catch (error) {
        if (!error.status) {
          showThanks();
          return;
        }
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
