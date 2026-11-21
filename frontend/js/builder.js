(function () {
  const form = document.getElementById("builderForm");
  if (!form || !window.NatureFit) return;
  const { api } = window.NatureFit;
  const statusEl = document.getElementById("builderStatus");
  const body = document.getElementById("stepBody");
  const progress = document.getElementById("progress");
  const backBtn = document.getElementById("backBtn");
  const nextBtn = document.getElementById("nextBtn");
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const SHORT = ["S", "M", "T", "W", "T", "F", "S"];

  let site = null;
  let step = 0;
  let quote = null;
  let customer = null;
  const state = {
    plan: new URLSearchParams(location.search).get("goal") || "weight-loss",
    mealsPerDay: 3,
    duration: 20,
    days: [0, 1, 2, 3, 4],
    slotId: null,
    startDate: "",
    menuItemIds: [],
    addOnIds: [],
    promoCode: "",
    fullName: "",
    email: "",
    nationalNumber: "",
    emirate: "Dubai",
    area: "",
    building: "",
    addressLine: "",
    instructions: "",
    allergies: "",
    password: "",
    privacyConsent: false,
    whatsappOptIn: false,
    allergyAcknowledged: false,
    paymentMethod: "to_be_confirmed",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(message, type) {
    statusEl.textContent = message || "";
    statusEl.className = `app-status ${type || ""}`.trim();
  }

  function steps() {
    const list = [
      ["Goal", "goal"],
      ["Meals", "meals"],
      ["Length", "duration"],
      ["Delivery", "delivery"],
    ];
    if (site && site.settings.mealCustomization && site.menu.length) list.push(["Meals menu", "menu"]);
    list.push(["Details", "details"], ["Summary", "summary"], ["Payment", "payment"]);
    return list;
  }

  function current() {
    return steps()[step][1];
  }

  function plan() {
    return site.plans.find((item) => item.slug === state.plan) || site.plans[0];
  }

  function kcal(meals) {
    const band = (plan().calories || []).find((item) => item.mealsPerDay === meals);
    if (!band || band.minKcal == null || band.maxKcal == null) return "Calorie range not set yet";
    return `${band.minKcal}–${band.maxKcal} kcal`;
  }

  function earliestDate() {
    const settings = site.settings;
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dubai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date())
        .map((part) => [part.type, part.value])
    );
    const [hours, minutes] = String(settings.cutoffTime || "18:00").split(":").map(Number);
    const lead = Number(settings.cutoffLeadDays) || 1;
    const past = Number(parts.hour) * 60 + Number(parts.minute) >= hours * 60 + minutes;
    const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
    date.setUTCDate(date.getUTCDate() + lead + (past ? 1 : 0));
    return date.toISOString().slice(0, 10);
  }

  function paintProgress() {
    progress.innerHTML = steps()
      .map((item, index) => `<li class="${index === step ? "is-on" : ""}">${index + 1}. ${escapeHtml(item[0])}</li>`)
      .join("");
  }

  function choice(name, value, title, copy, on) {
    return `<button type="button" class="choice-btn ${on ? "is-on" : ""}" data-choice="${escapeHtml(name)}" data-value="${escapeHtml(value)}">
      <strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small>
    </button>`;
  }

  function render() {
    paintProgress();
    const kind = current();
    backBtn.hidden = step === 0;
    nextBtn.textContent = kind === "payment" ? "Confirm subscription" : "Continue";
    if (kind === "goal") {
      body.innerHTML = `<h2>Select a fitness goal</h2><div class="choice-row">${site.plans
        .map((item) => choice("plan", item.slug, item.name, item.summary, state.plan === item.slug))
        .join("")}</div>`;
    } else if (kind === "meals") {
      const counts = plan().allowFourMeals ? [1, 2, 3, 4] : [1, 2, 3];
      body.innerHTML = `<h2>Meals per day</h2><div class="choice-row">${counts
        .map((count) => choice("meals", count, `${count} meal${count > 1 ? "s" : ""}`, kcal(count), state.mealsPerDay === count))
        .join("")}</div>`;
    } else if (kind === "duration") {
      body.innerHTML = `<h2>Subscription length</h2><p class="muted">Length is the number of delivery days, not calendar days.</p><div class="choice-row">${site.durations
        .map((item) => choice("duration", item.days, item.label, "Set by Nature Fit", Number(state.duration) === item.days))
        .join("")}</div>`;
    } else if (kind === "delivery") {
      const min = site.settings.minDeliveryDays;
      body.innerHTML = `<h2>Delivery days and time</h2>
        <p class="muted">Choose at least ${min} day${min === 1 ? "" : "s"}. Changes after ${escapeHtml(site.settings.cutoffTime)} Dubai time move to the following cut-off.</p>
        <div class="day-row" id="days">${site.settings.deliveryWeekdays
          .map(
            (day) =>
              `<button type="button" class="day-btn ${state.days.includes(day) ? "is-on" : ""}" data-day="${day}" aria-pressed="${state.days.includes(day)}" aria-label="${DAY_NAMES[day]}">${SHORT[day]}</button>`
          )
          .join("")}</div>
        <div class="choice-row" style="margin-top:16px">${site.slots
          .map((slot) => choice("slot", slot.id, slot.label, "Delivery window", Number(state.slotId) === slot.id))
          .join("")}</div>
        <div class="form-group" style="margin-top:16px"><label for="startDate">Start date</label>
          <input id="startDate" type="date" min="${earliestDate()}" value="${escapeHtml(state.startDate)}" required></div>`;
    } else if (kind === "menu") {
      body.innerHTML = `<h2>Choose meals</h2><p class="muted">Optional. Leave this blank and the kitchen will choose.</p><div class="choice-row">${site.menu
        .map((item) => {
          const macros = [item.kcal != null ? `${item.kcal} kcal` : "", item.proteinG != null ? `${item.proteinG}g protein` : ""]
            .filter(Boolean)
            .join(" · ");
          return choice("menu", item.id, item.name, macros || item.category, state.menuItemIds.includes(item.id));
        })
        .join("")}</div>`;
    } else if (kind === "details") {
      const emirates = site.settings.serviceEmirates
        .map((name) => `<option ${name === state.emirate ? "selected" : ""}>${escapeHtml(name)}</option>`)
        .join("");
      body.innerHTML = `<h2>Your details</h2>
        <div class="stack-form">
          <div class="form-group"><label for="fullName">Full name</label><input id="fullName" autocomplete="name" value="${escapeHtml(state.fullName)}" required></div>
          <div class="form-group"><label for="email">Email</label><input id="email" type="email" autocomplete="email" value="${escapeHtml(state.email)}" required></div>
          <div class="form-group"><label for="nationalNumber">UAE mobile number</label><input id="nationalNumber" inputmode="tel" autocomplete="tel" placeholder="50 123 4567" value="${escapeHtml(state.nationalNumber)}" required></div>
          ${customer ? "" : `<div class="form-group"><label for="password">Password</label><input id="password" type="password" autocomplete="new-password" minlength="8" required></div>`}
          <div class="form-group"><label for="emirate">Emirate</label><select id="emirate">${emirates}</select></div>
          <div class="form-group"><label for="area">Area</label><input id="area" value="${escapeHtml(state.area)}" required></div>
          <div class="form-group"><label for="building">Building / apartment</label><input id="building" value="${escapeHtml(state.building)}" required></div>
          <div class="form-group wide"><label for="addressLine">Delivery address</label><input id="addressLine" value="${escapeHtml(state.addressLine)}" required></div>
          <div class="form-group wide"><label for="instructions">Delivery instructions</label><input id="instructions" value="${escapeHtml(state.instructions)}"></div>
          <div class="form-group wide"><label for="allergies">Food allergies or dietary restrictions</label><textarea id="allergies">${escapeHtml(state.allergies)}</textarea></div>
        </div>
        <label class="check-line"><input id="privacyConsent" type="checkbox" ${state.privacyConsent ? "checked" : ""}> <span>I agree to Nature Fit storing my details to prepare this order. <a href="privacy.html">Privacy note</a></span></label>
        <label class="check-line"><input id="whatsappOptIn" type="checkbox" ${state.whatsappOptIn ? "checked" : ""}> <span>Send me order updates on WhatsApp. This is separate from the order itself.</span></label>
        <label class="check-line"><input id="allergyAck" type="checkbox" ${state.allergyAcknowledged ? "checked" : ""}> <span>${escapeHtml(site.allergyNote)}</span></label>
        <div class="honeypot"><label>Company<input name="company" tabindex="-1" autocomplete="off"></label></div>`;
    } else if (kind === "summary") {
      const money = quote && quote.priced ? `AED ${Number(quote.totalAed).toFixed(2)}` : "To be confirmed";
      const addOns = site.addOns
        .map(
          (item) =>
            `<label class="check-line"><input type="checkbox" data-addon="${item.id}" ${state.addOnIds.includes(item.id) ? "checked" : ""}> ${escapeHtml(item.name)} · AED ${Number(item.priceAed).toFixed(2)}</label>`
        )
        .join("");
      body.innerHTML = `<h2>Order summary</h2><div class="summary-box">
          <strong>${escapeHtml(plan().name)}</strong><br>
          ${state.mealsPerDay} meals a day · ${escapeHtml(kcal(state.mealsPerDay))}<br>
          ${state.duration} delivery days · ${state.days.map((day) => DAY_NAMES[day]).join(", ")}<br>
          Starts ${escapeHtml(state.startDate)} · ${escapeHtml((site.slots.find((slot) => slot.id === Number(state.slotId)) || {}).label || "")}<br>
          ${escapeHtml(state.addressLine)}, ${escapeHtml(state.area)}, ${escapeHtml(state.emirate)}
        </div>
        ${addOns}
        <div class="form-group"><label for="promoCode">Promotional code</label><input id="promoCode" value="${escapeHtml(state.promoCode)}"></div>
        <p><strong>Total: ${escapeHtml(money)}</strong></p>
        <p class="muted">${quote && quote.message ? escapeHtml(quote.message) : "The total is calculated by Nature Fit. A price typed into the page is not used."}</p>`;
    } else {
      const priced = quote && quote.priced;
      const methods = (site.settings.paymentMethods || []).filter((method) => (priced ? method.id !== "to_be_confirmed" : method.id === "to_be_confirmed"));
      body.innerHTML = `<h2>Payment</h2>
        <p class="notice">${priced ? "The amount is calculated on the server. Opening the confirmation page does not mark this order as paid." : "No price is published for this package yet. Nature Fit will confirm it. Nothing will be charged."}</p>
        <div class="choice-row">${methods
          .map((method) => choice("pay", method.id, method.label, method.note || "", state.paymentMethod === method.id))
          .join("")}</div>`;
    }
    bindChoices();
  }

  function bindChoices() {
    body.querySelectorAll("[data-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        readDetails();
        const name = button.dataset.choice;
        const value = button.dataset.value;
        if (name === "plan") state.plan = value;
        if (name === "meals") state.mealsPerDay = Number(value);
        if (name === "duration") state.duration = Number(value);
        if (name === "slot") state.slotId = Number(value);
        if (name === "pay") state.paymentMethod = value;
        if (name === "menu") {
          const id = Number(value);
          state.menuItemIds = state.menuItemIds.includes(id)
            ? state.menuItemIds.filter((item) => item !== id)
            : state.menuItemIds.concat(id);
        }
        render();
      });
    });
    body.querySelectorAll("[data-day]").forEach((button) => {
      button.addEventListener("click", () => {
        readDetails();
        const day = Number(button.dataset.day);
        state.days = state.days.includes(day) ? state.days.filter((item) => item !== day) : state.days.concat(day).sort();
        render();
      });
    });
  }

  function readDetails() {
    const read = (id) => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : state[id] || "";
    };
    if (document.getElementById("fullName")) {
      state.fullName = read("fullName");
      state.email = read("email");
      state.nationalNumber = read("nationalNumber");
      state.emirate = read("emirate");
      state.area = read("area");
      state.building = read("building");
      state.addressLine = read("addressLine");
      state.instructions = read("instructions");
      state.allergies = read("allergies");
      const password = document.getElementById("password");
      if (password) state.password = password.value;
      state.privacyConsent = document.getElementById("privacyConsent").checked;
      state.whatsappOptIn = document.getElementById("whatsappOptIn").checked;
      state.allergyAcknowledged = document.getElementById("allergyAck").checked;
    }
    if (document.getElementById("startDate")) state.startDate = document.getElementById("startDate").value;
    if (document.getElementById("promoCode")) state.promoCode = document.getElementById("promoCode").value.trim();
    state.addOnIds = [...body.querySelectorAll("[data-addon]:checked")].map((input) => Number(input.dataset.addon));
  }

  function payload() {
    return {
      plan: state.plan,
      mealsPerDay: state.mealsPerDay,
      duration: state.duration,
      days: state.days,
      slotId: state.slotId,
      startDate: state.startDate,
      menuItemIds: state.menuItemIds,
      addOnIds: state.addOnIds,
      promoCode: state.promoCode,
      fullName: state.fullName,
      email: state.email,
      countryCode: "971",
      nationalNumber: state.nationalNumber,
      emirate: state.emirate,
      area: state.area,
      building: state.building,
      addressLine: state.addressLine,
      instructions: state.instructions,
      allergies: state.allergies,
      password: state.password,
      privacyConsent: state.privacyConsent,
      whatsappOptIn: state.whatsappOptIn,
      allergyAcknowledged: state.allergyAcknowledged,
      paymentMethod: state.paymentMethod,
      company: (document.querySelector("[name=company]") || {}).value || "",
    };
  }

  function validateLocal() {
    const kind = current();
    if (kind === "meals" && state.mealsPerDay === 4 && !plan().allowFourMeals) return "Four meals are not available on this plan.";
    if (kind === "delivery") {
      readDetails();
      if (state.days.length < site.settings.minDeliveryDays) return `Select at least ${site.settings.minDeliveryDays} delivery days.`;
      if (!state.slotId) return "Choose a delivery time.";
      if (!state.startDate) return "Choose a start date.";
      if (state.startDate < earliestDate()) return `The earliest start date is ${earliestDate()}.`;
      const weekday = new Date(`${state.startDate}T00:00:00Z`).getUTCDay();
      if (!state.days.includes(weekday)) return "The start date has to be one of the selected delivery days.";
    }
    if (kind === "details") {
      readDetails();
      if (state.fullName.length < 2) return "Enter your full name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) return "Enter a valid email address.";
      if (state.nationalNumber.replace(/\D/g, "").length < 8) return "Enter a UAE mobile number.";
      if (!customer && state.password.length < 8) return "Choose a password of at least 8 characters.";
      if (state.area.length < 2 || state.building.length < 2 || state.addressLine.length < 8) return "Enter the area, building, and address.";
      if (!state.privacyConsent) return "Privacy consent is required.";
      if (!state.allergyAcknowledged) return "Please confirm the allergy note.";
    }
    return "";
  }

  async function refreshQuote() {
    readDetails();
    quote = await api("/api/orders/quote", { method: "POST", body: payload() });
    if (!quote.priced) state.paymentMethod = "to_be_confirmed";
    else if (state.paymentMethod === "to_be_confirmed") {
      const card = (site.settings.paymentMethods || []).find((method) => method.id === "card");
      state.paymentMethod = card ? "card" : (site.settings.paymentMethods.find((method) => method.id !== "to_be_confirmed") || {}).id || "to_be_confirmed";
    }
  }

  async function finish() {
    const result = await api("/api/orders", { method: "POST", body: payload() });
    form.hidden = true;
    progress.hidden = true;
    const done = document.getElementById("done");
    done.hidden = false;
    const total = result.totalAed == null ? "to be confirmed" : `AED ${Number(result.totalAed).toFixed(2)}`;
    document.getElementById("doneCopy").textContent = `Order ${result.reference} is saved. Total ${total}. Payment status: ${result.paymentStatus}. ${result.message}`;
    const link = document.getElementById("whatsappLink");
    const note = document.getElementById("whatsappNote");
    if (result.whatsapp && result.whatsapp.url) {
      link.href = result.whatsapp.url;
      note.textContent = result.whatsapp.explanation;
    } else {
      link.hidden = true;
      note.textContent = "WhatsApp is not configured yet. Nature Fit still has the order.";
    }
    const pay = document.getElementById("payCopy");
    if (result.payment && result.payment.checkoutUrl) {
      pay.innerHTML = `<a class="btn btn-forest" href="${escapeHtml(result.payment.checkoutUrl)}">Continue to secure card payment</a><br><span>${escapeHtml(result.payment.message || "You will only be marked paid after the payment provider confirms it.")}</span>`;
    } else if (result.payment && result.payment.bankDetails) {
      pay.textContent = `Transfer the total using these details, then send the receipt: ${result.payment.bankDetails}`;
    } else if (result.payment && result.payment.message) {
      pay.textContent = result.payment.message;
    } else {
      pay.textContent = "";
    }
    document.getElementById("statusLink").href = `order.html?ref=${encodeURIComponent(result.reference)}`;
    document.getElementById("statusLink").textContent = "Check payment status";
  }

  backBtn.addEventListener("click", () => {
    readDetails();
    step = Math.max(0, step - 1);
    setStatus("");
    render();
  });

  nextBtn.addEventListener("click", async () => {
    const problem = validateLocal();
    if (problem) {
      setStatus(problem, "error");
      return;
    }
    setStatus("");
    const kind = current();
    nextBtn.disabled = true;
    try {
      if (kind === "summary") await refreshQuote();
      if (kind === "payment") {
        readDetails();
        await finish();
        return;
      }
      step += 1;
      if (current() === "summary") {
        await refreshQuote();
      }
      render();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      nextBtn.disabled = false;
    }
  });

  api("/api/site")
    .then(async (data) => {
      site = data;
      if (!site.plans.length || !site.durations.length || !site.slots.length) {
        setStatus("Meal plans are not ready yet. Ask Nature Fit to publish durations and a delivery time.", "error");
        nextBtn.disabled = true;
        return;
      }
      if (!site.plans.some((item) => item.slug === state.plan)) state.plan = site.plans[0].slug;
      state.duration = site.durations.some((item) => item.days === state.duration) ? state.duration : site.durations[0].days;
      state.slotId = site.slots[0].id;
      const weekdays = site.settings.deliveryWeekdays;
      state.days = weekdays.slice(0, Math.min(weekdays.length, site.settings.minDeliveryDays || 1));
      try {
        const me = await api("/api/account/me");
        customer = me.customer;
        if (customer) {
          state.fullName = customer.fullName || "";
          state.email = customer.email || "";
          state.nationalNumber = String(customer.phone || "").replace(/^\+971/, "");
          state.privacyConsent = true;
        }
      } catch {
        customer = null;
      }
      render();
    })
    .catch((error) => setStatus(error.message, "error"));
})();
