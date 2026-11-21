(function () {
  if (!document.getElementById("packageOrder") || !window.NatureFit) return;
  const { api } = window.NatureFit;
  const pageStatus = document.getElementById("pageStatus");
  const setupNotice = document.getElementById("setupNotice");
  const planChoices = document.getElementById("planChoices");
  const mealChoices = document.getElementById("mealChoices");
  const durationChoices = document.getElementById("durationChoices");
  const weekdayChoices = document.getElementById("weekdayChoices");
  const calorieLine = document.getElementById("calorieLine");
  const livePrice = document.getElementById("livePrice");
  const totalPrice = document.getElementById("totalPrice");
  const detailsCard = document.getElementById("detailsCard");
  const summaryCard = document.getElementById("summaryCard");
  const startDate = document.getElementById("startDate");
  const dayRange = document.getElementById("dayRange");
  const dayCount = document.getElementById("dayCount");
  const dayCaption = document.getElementById("dayCaption");
  const otpField = document.getElementById("otpField");
  const otpStatus = document.getElementById("otpStatus");
  const resendOtp = document.getElementById("resendOtp");
  const summary = document.getElementById("orderSummary");
  const payNow = document.getElementById("payNow");
  const sendInquiry = document.getElementById("sendInquiry");
  const choicePrice = document.getElementById("choicePrice");
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const ANCHORS = [1, 7, 14, 20, 28];

  const state = {
    catalog: null,
    plan: new URLSearchParams(location.search).get("plan") || "",
    meals: 0,
    duration: 0,
    days: [0, 1, 2, 3, 4, 5, 6],
    quote: null,
    token: "",
    otpRequired: true,
    verifiedPhone: "",
    resendTimer: 0,
    quoteTimer: 0,
    summaryWasHidden: true,
  };

  function setStatus(el, message, type) {
    el.textContent = message || "";
    el.className = `app-status ${type || ""}`.trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function digits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function nationalPhone() {
    return digits(document.getElementById("nationalNumber").value).replace(/^0+/, "").replace(/^971/, "");
  }

  function formatPhone(national) {
    const value = digits(national).replace(/^0+/, "").replace(/^971/, "");
    if (value.length !== 9) return value ? `+971 ${value}` : "";
    return `+971 ${value.slice(0, 2)} ${value.slice(2, 5)} ${value.slice(5)}`;
  }

  const cardCopy = {
    "weight-loss": {
      title: "Weight Loss",
      text: "Calorie-conscious plates with enough protein to stay satisfied.",
      icon: "fa-leaf",
    },
    balance: {
      title: "Balanced Lifestyle",
      text: "Everyday meals for steady energy, without a strict cut or bulk.",
      icon: "fa-scale-balanced",
    },
    lifestyle: {
      title: "Healthy Lifestyle",
      text: "Whole-food meals for people who want to eat well every day.",
      icon: "fa-heart",
    },
    "muscle-gain": {
      title: "Muscle Gain",
      text: "Higher-calorie plates for training and recovery. Four meals a day are available on this plan.",
      icon: "fa-dumbbell",
    },
  };

  function selectedPlan() {
    return (state.catalog.plans || []).find((plan) => plan.slug === state.plan) || null;
  }

  function updateRecap() {
    if (!state.catalog) return;
    const plan = selectedPlan();
    const copy = plan ? cardCopy[plan.slug] : null;
    const recap = document.getElementById("pickRecap");
    const bits = [];
    if (plan) bits.push(copy ? copy.title : plan.name);
    if (state.meals) bits.push(`${state.meals} ${state.meals === 1 ? "meal" : "meals"} a day`);
    if (state.duration) bits.push(`${state.duration} ${state.duration === 1 ? "day" : "days"}`);
    if (state.days.length) bits.push(state.days.length === 7 ? "Every day" : state.days.map((day) => WEEKDAY_SHORT[day]).join(", "));
    recap.hidden = bits.length === 0;
    recap.innerHTML = bits.map((bit) => `<span>${escapeHtml(bit)}</span>`).join("");
  }

  function paintDuration() {
    const chosen = state.duration >= 1;
    dayCount.textContent = chosen ? String(state.duration) : "—";
    dayCaption.textContent = chosen
      ? state.duration === 1
        ? "1 day"
        : `${state.duration} days`
      : "Any length from 1 to 28 days";
    if (chosen) dayRange.value = String(state.duration);
    dayRange.setAttribute("aria-valuenow", chosen ? String(state.duration) : "1");
    const max = Number(dayRange.max) || 28;
    const min = Number(dayRange.min) || 1;
    const current = Number(dayRange.value);
    const pct = ((current - min) / (max - min)) * 100;
    dayRange.style.background = chosen
      ? `linear-gradient(90deg, var(--forest) ${pct}%, #d9e5dc ${pct}%)`
      : "#d9e5dc";
  }

  function renderChoices() {
    planChoices.innerHTML = state.catalog.plans
      .map((plan) => {
        const copy = cardCopy[plan.slug] || { title: plan.name, text: "", icon: "fa-leaf" };
        const on = plan.slug === state.plan;
        return `<button type="button" class="nf-goal goal-pick${on ? " is-on" : ""}" data-plan="${escapeHtml(plan.slug)}" aria-pressed="${on}"><span class="goal-icon"><i class="fa-solid ${escapeHtml(copy.icon)}" aria-hidden="true"></i></span><h3>${escapeHtml(copy.title)}</h3><p>${escapeHtml(copy.text)}</p><p class="nf-kcal">${escapeHtml(plan.calorieLabel)}</p><span class="pick-mark"><i class="fa-solid fa-check" aria-hidden="true"></i> Selected</span></button>`;
      })
      .join("");
    const plan = selectedPlan();
    const meals = plan ? plan.meals : [];
    if (!meals.includes(state.meals)) state.meals = 0;
    mealChoices.innerHTML = meals.length
      ? meals
          .map((count) => {
            const on = count === state.meals;
            return `<button type="button" class="choice-btn${on ? " is-on" : ""}" data-meals="${count}" aria-pressed="${on}"><strong>${count}</strong><small>${count === 1 ? "Meal a day" : "Meals a day"}</small></button>`;
          })
          .join("")
      : `<p class="order-hint">Choose a goal above, then pick how many meals you want each day.</p>`;
    durationChoices.innerHTML = ANCHORS
      .map((days) => {
        const on = days === state.duration;
        return `<button type="button" class="choice-btn${on ? " is-on" : ""}" data-duration="${days}" aria-pressed="${on}"><strong>${days}</strong><small>${days === 1 ? "Day" : "Days"}</small></button>`;
      })
      .join("");
    weekdayChoices.innerHTML = WEEKDAYS.map((name, index) => {
      const on = state.days.includes(index);
      return `<button type="button" class="day-btn${on ? " is-on" : ""}" data-day="${index}" aria-pressed="${on}" aria-label="${name}">${WEEKDAY_SHORT[index]}</button>`;
    }).join("");
    paintDuration();
    calorieLine.textContent = plan ? plan.calorieLabel : "";
    updateRecap();
    document.getElementById("stepPlan").classList.toggle("is-done", Boolean(plan));
    document.getElementById("stepMeals").classList.toggle("is-waiting", !plan);
    document.getElementById("stepMeals").classList.toggle("is-done", Boolean(state.meals));
    document.getElementById("stepDays").classList.toggle("is-done", Boolean(state.duration));
    document.getElementById("stepWeekdays").classList.toggle("is-done", state.days.length > 0);
    planChoices.querySelectorAll("[data-plan]").forEach((button) => {
      button.onclick = () => {
        state.plan = button.dataset.plan;
        renderChoices();
        refreshQuote();
      };
    });
    mealChoices.querySelectorAll("[data-meals]").forEach((button) => {
      button.onclick = () => {
        state.meals = Number(button.dataset.meals);
        renderChoices();
        refreshQuote();
      };
    });
    durationChoices.querySelectorAll("[data-duration]").forEach((button) => {
      button.onclick = () => {
        state.duration = Number(button.dataset.duration);
        renderChoices();
        refreshQuote();
      };
    });
    weekdayChoices.querySelectorAll("[data-day]").forEach((button) => {
      button.onclick = () => {
        const day = Number(button.dataset.day);
        if (state.days.includes(day)) {
          if (state.days.length === 1) {
            setStatus(pageStatus, "Choose at least one delivery day.", "error");
            return;
          }
          state.days = state.days.filter((item) => item !== day);
        } else {
          state.days = state.days.concat(day).sort((left, right) => left - right);
          setStatus(pageStatus, "", "");
        }
        renderChoices();
        refreshQuote();
      };
    });
    renderSummary();
  }

  function quoteBody() {
    const body = { plan: state.plan, mealsPerDay: state.meals, duration: state.duration };
    if (startDate.value && state.days.length) {
      body.startDate = startDate.value;
      body.deliveryDays = state.days.slice();
    }
    return body;
  }

  async function refreshQuote() {
    window.clearTimeout(state.quoteTimer);
    if (!state.plan || !state.meals || !state.duration) {
      state.quote = null;
      livePrice.hidden = true;
      livePrice.textContent = "";
      totalPrice.textContent = "";
      if (choicePrice) choicePrice.textContent = "";
      renderSummary();
      return;
    }
    try {
      state.quote = await api("/api/packages/quote", { method: "POST", body: quoteBody() });
      livePrice.hidden = false;
      livePrice.textContent = state.quote.totalLabel;
      totalPrice.textContent = state.quote.totalLabel;
      if (choicePrice) choicePrice.textContent = state.quote.totalLabel;
      setStatus(pageStatus, "", "");
    } catch (error) {
      state.quote = null;
      livePrice.hidden = false;
      livePrice.textContent = "Unavailable";
      totalPrice.textContent = "";
      if (choicePrice) choicePrice.textContent = "";
      setStatus(pageStatus, error.message, "error");
    }
    renderSummary();
  }

  function scheduleQuote() {
    window.clearTimeout(state.quoteTimer);
    state.quoteTimer = window.setTimeout(refreshQuote, 120);
  }

  function customerReady() {
    const name = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const address = document.getElementById("addressLine").value.trim();
    if (!state.quote || !state.days.length) return false;
    if (name.length < 2) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    if (!/^5(0|2|4|5|6|8)\d{7}$/.test(nationalPhone())) return false;
    if (address.length < 8) return false;
    if (!startDate.value) return false;
    if (document.getElementById("privacyConsent").checked !== true) return false;
    return true;
  }

  function detailsComplete() {
    if (!customerReady()) return false;
    if (state.otpRequired && !state.token) return false;
    return true;
  }

  function setBusy(busy) {
    payNow.disabled = busy;
    sendInquiry.disabled = busy;
  }

  function renderSummary() {
    const ready = customerReady();
    summaryCard.hidden = !ready;
    if (!ready) {
      state.summaryWasHidden = true;
      summary.innerHTML = "";
      return;
    }
    const quote = state.quote;
    const rows = [
      ["Meal plan", quote.plan],
      ["Meals per day", String(quote.mealsPerDay)],
      ["Total meal plan days", String(quote.durationDays)],
      ["Delivery schedule", (quote.dayLabels || []).join(", ")],
      ["Starting date", startDate.value],
      ["Ending date", quote.endDate || "—"],
      ["Final total", quote.totalLabel],
    ];
    summary.innerHTML = rows
      .map(
        ([label, value]) =>
          `<div class="summary-line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
      )
      .join("");
    if (state.summaryWasHidden) {
      state.summaryWasHidden = false;
      summaryCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function checkoutPayload() {
    return {
      plan: state.plan,
      mealsPerDay: state.meals,
      duration: state.duration,
      deliveryDays: state.days.slice(),
      fullName: document.getElementById("fullName").value,
      email: document.getElementById("email").value,
      countryCode: "971",
      nationalNumber: nationalPhone(),
      addressLine: document.getElementById("addressLine").value,
      startDate: startDate.value,
      instructions: document.getElementById("instructions").value,
      privacyConsent: document.getElementById("privacyConsent").checked === true,
      verificationToken: state.token,
      company: document.getElementById("company").value,
    };
  }

  async function sendCode() {
    setStatus(otpStatus, "Sending the verification code…", "pending");
    const result = await api("/api/packages/otp/send", {
      method: "POST",
      body: { countryCode: "971", nationalNumber: nationalPhone() },
    });
    otpField.hidden = false;
    resendOtp.hidden = false;
    resendOtp.disabled = true;
    window.clearTimeout(state.resendTimer);
    state.resendTimer = window.setTimeout(() => {
      resendOtp.disabled = false;
    }, (result.resendAfterSeconds || 60) * 1000);
    setStatus(otpStatus, "A 6-digit code was sent by SMS. It expires in 10 minutes.", "success");
  }

  function selectionError() {
    if (!state.plan) return "Choose a meal plan.";
    if (!state.meals) return "Choose how many meals you want each day.";
    if (!state.duration) return "Choose a length from 1 to 28 days.";
    if (!state.days.length) return "Choose at least one delivery day. A green day is selected.";
    return "";
  }

  document.getElementById("continueButton").addEventListener("click", async () => {
    const problem = selectionError();
    if (problem) {
      setStatus(pageStatus, problem, "error");
      if (!state.days.length) document.getElementById("stepWeekdays").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!state.quote) await refreshQuote();
    if (!state.quote) return;
    setStatus(pageStatus, "", "");
    detailsCard.hidden = false;
    detailsCard.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("fullName").focus();
  });

  ["fullName", "email", "nationalNumber", "addressLine", "startDate", "instructions"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      if (id === "nationalNumber" && nationalPhone() !== state.verifiedPhone) state.token = "";
      if (id === "startDate") refreshQuote();
      else renderSummary();
    });
  });
  document.getElementById("privacyConsent").addEventListener("change", renderSummary);

  dayRange.addEventListener("input", () => {
    state.duration = Number(dayRange.value);
    paintDuration();
    durationChoices.querySelectorAll("[data-duration]").forEach((button) => {
      const on = Number(button.dataset.duration) === state.duration;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", String(on));
    });
    document.getElementById("stepDays").classList.toggle("is-done", true);
    updateRecap();
    scheduleQuote();
  });

  document.getElementById("sendOtp").addEventListener("click", () => {
    sendCode().catch((error) => setStatus(otpStatus, error.message, "error"));
  });
  resendOtp.addEventListener("click", () => {
    state.token = "";
    renderSummary();
    sendCode().catch((error) => setStatus(otpStatus, error.message, "error"));
  });
  document.getElementById("verifyOtp").addEventListener("click", async () => {
    try {
      setStatus(otpStatus, "Checking the code…", "pending");
      const result = await api("/api/packages/otp/check", {
        method: "POST",
        body: {
          countryCode: "971",
          nationalNumber: nationalPhone(),
          code: document.getElementById("otpCode").value,
        },
      });
      state.token = result.verificationToken || "";
      state.verifiedPhone = nationalPhone();
      setStatus(otpStatus, "Mobile number verified.", "success");
      renderSummary();
    } catch (error) {
      state.token = "";
      setStatus(otpStatus, error.message, "error");
      renderSummary();
    }
  });

  document.getElementById("packageForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!customerReady()) {
      setStatus(pageStatus, "Complete the required details before payment. Nothing was charged.", "error");
      return;
    }
    if (!detailsComplete()) {
      setStatus(pageStatus, "Verify your mobile number before payment. You can still send an inquiry without a code or a card.", "error");
      return;
    }
    setBusy(true);
    setStatus(pageStatus, "Opening the secure payment page…", "pending");
    try {
      const result = await api("/api/packages/checkout", { method: "POST", body: checkoutPayload() });
      if (!result.checkoutUrl) {
        setStatus(pageStatus, result.message || "Payment could not be started. No card was charged.", "error");
        setBusy(false);
        return;
      }
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setStatus(pageStatus, error.message, "error");
      setBusy(false);
    }
  });

  sendInquiry.addEventListener("click", async () => {
    if (!customerReady()) {
      setStatus(pageStatus, "Complete the required details before sending the inquiry. No payment was started.", "error");
      return;
    }
    setBusy(true);
    setStatus(pageStatus, "Sending your inquiry. No payment will be taken.", "pending");
    try {
      const result = await api("/api/packages/inquiry", { method: "POST", body: checkoutPayload() });
      if (!result.reference) {
        setStatus(pageStatus, result.message || "The inquiry could not be saved. No payment was started.", "error");
        setBusy(false);
        return;
      }
      window.location.assign(result.confirmationPath || `/inquiry?ref=${encodeURIComponent(result.reference)}`);
    } catch (error) {
      setStatus(pageStatus, error.message, "error");
      setBusy(false);
    }
  });

  api("/api/packages")
    .then((catalog) => {
      state.catalog = catalog;
      if (catalog.minDays) dayRange.min = String(catalog.minDays);
      if (catalog.maxDays) dayRange.max = String(catalog.maxDays);
      if (catalog.earliestStartDate) startDate.min = catalog.earliestStartDate;
      const notes = [];
      state.otpRequired = catalog.otpRequired !== false;
      if (!state.otpRequired) {
        document.getElementById("sendOtp").hidden = true;
        document.getElementById("otpField").hidden = true;
      } else if (!catalog.otpConfigured) {
        notes.push("Mobile verification will be available before payment.");
      }
      if (catalog.paymentMode === "not_configured") {
        notes.push("Card payment will open once Nature Fit connects Stripe.");
      }
      if (notes.length) {
        setupNotice.hidden = false;
        setupNotice.textContent = notes.join(" ");
      }
      renderChoices();
      if (state.plan) refreshQuote();
    })
    .catch((error) => setStatus(pageStatus, error.message, "error"));
})();
