(function () {
  if (!document.getElementById("adminApp") || !window.NatureFit) return;
  const { api } = window.NatureFit;
  const statusEl = document.getElementById("adminStatus");
  const login = document.getElementById("adminLogin");
  const app = document.getElementById("adminApp");
  const panel = document.getElementById("panel");
  let data = null;
  let tab = "orders";

  function setStatus(message, type) {
    statusEl.textContent = message || "";
    statusEl.className = `app-status ${type || ""}`.trim();
  }
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  async function load() {
    data = await api("/api/admin/overview");
    const people = await api("/api/admin/customers");
    const inquiries = await api("/api/admin/inquiries");
    data.customers = people.customers;
    data.inquiries = inquiries.inquiries;
    data.packageInquiries = inquiries.packageInquiries || [];
    login.hidden = true;
    app.hidden = false;
    render();
  }
  function tabs() {
    const names = [
      ["orders", "orders"],
      ["inquiries", "inquiries"],
      ["pricing", "pricing"],
      ["menu", "menu"],
      ["dishes", "menu details"],
      ["delivery", "delivery"],
      ["schedule", "schedule"],
      ["promos", "promos"],
      ["reviews", "reviews"],
      ["settings", "settings"],
    ];
    document.getElementById("tabs").innerHTML = names
      .map(([name, label]) => `<button type="button" class="${name === tab ? "is-on" : ""}" data-tab="${name}">${label}</button>`)
      .join("");
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        tab = button.dataset.tab;
        render();
      });
    });
  }
  function render() {
    tabs();
    if (tab === "orders") renderOrders();
    else if (tab === "inquiries") renderInquiries();
    else if (tab === "pricing") renderPricing();
    else if (tab === "menu") renderMenu();
    else if (tab === "dishes") renderDishes();
    else if (tab === "delivery") renderDelivery();
    else if (tab === "schedule") renderSchedule();
    else if (tab === "promos") renderPromos();
    else if (tab === "reviews") renderReviews();
    else renderSettings();
  }
  function orderWhen(value) {
    if (!value) return "";
    return String(value).replace("T", " ").slice(0, 16);
  }
  function renderOrders() {
    const rows = data.orders
      .map(
        (order) => `<tr>
        <td>${escapeHtml(order.reference)}<br><span>${escapeHtml(order.customerName)} · ${escapeHtml(order.customerPhone)}</span><br><span>${escapeHtml(orderWhen(order.createdAt))}</span></td>
        <td>${escapeHtml(order.planName)} · ${order.mealsPerDay} meals · ${order.durationDays} days<br><span>${escapeHtml(order.startDate)} · ${escapeHtml(order.addressLine)}</span></td>
        <td>${order.totalAed == null ? "Unpriced" : `AED ${Number(order.totalAed).toFixed(2)}`}<br><span>${escapeHtml(order.paymentStatus)} / ${escapeHtml(order.orderStatus)}</span>${order.paymentReference ? `<br><span>${escapeHtml(order.paymentReference)}</span>` : ""}</td>
        <td>
          <input data-ref="${order.id}" placeholder="Transaction ID" aria-label="Transaction ID for ${escapeHtml(order.reference)}">
          <button type="button" data-paid="${order.id}">Record payment</button>
          <button type="button" data-approve="${order.id}">Approve</button>
          <button type="button" data-reject="${order.id}">Reject</button>
        </td>
      </tr>`
      )
      .join("");
    const pauses = data.pauses
      .map(
        (pause) => `<tr><td>${pause.id}</td><td>${escapeHtml(pause.requestType)}</td><td>${escapeHtml(pause.startDate)} – ${escapeHtml(pause.endDate)}</td><td>${escapeHtml(pause.status)}</td>
        <td><button type="button" data-pause-yes="${pause.id}">Approve</button> <button type="button" data-pause-no="${pause.id}">Reject</button></td></tr>`
      )
      .join("");
    panel.innerHTML = `<p><a href="#" id="exportOrders">Export orders</a> · <a href="#" id="exportCustomers">Export customers</a></p>
      <p class="notice">Card payments are verified by the payment provider. Recording a payment here is for a bank transfer, cash collection, or a transaction ID you have already checked. Approving a plan builds the real delivery dates.</p>
      <div class="table-wrap"><table><thead><tr><th>Order</th><th>Plan</th><th>Payment</th><th>Actions</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>No orders yet.</td></tr>"}</tbody></table></div>
      <h2>Pause and resume requests</h2>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Type</th><th>Dates</th><th>Status</th><th></th></tr></thead><tbody>${pauses || "<tr><td colspan='5'>None.</td></tr>"}</tbody></table></div>`;
    panel.querySelector("#exportOrders").addEventListener("click", (event) => download(event, "/api/admin/export/orders", "nature-fit-orders.csv"));
    panel.querySelector("#exportCustomers").addEventListener("click", (event) => download(event, "/api/admin/export/customers", "nature-fit-customers.csv"));
    panel.querySelectorAll("[data-paid]").forEach((button) => button.addEventListener("click", () => paid(button.dataset.paid)));
    panel.querySelectorAll("[data-approve]").forEach((button) => button.addEventListener("click", () => decide(button.dataset.approve, "approve")));
    panel.querySelectorAll("[data-reject]").forEach((button) => button.addEventListener("click", () => decide(button.dataset.reject, "reject")));
    panel.querySelectorAll("[data-pause-yes]").forEach((button) => button.addEventListener("click", () => pause(button.dataset.pauseYes, "approve")));
    panel.querySelectorAll("[data-pause-no]").forEach((button) => button.addEventListener("click", () => pause(button.dataset.pauseNo, "reject")));
  }
  async function download(event, path, filename) {
    event.preventDefault();
    const response = await fetch(path, { credentials: "include" });
    if (!response.ok) {
      setStatus("Export failed.", "error");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function paid(id) {
    try {
      const result = await api(`/api/admin/orders/${id}/payment`, {
        method: "POST",
        body: { method: "bank_transfer", providerRef: panel.querySelector(`[data-ref="${id}"]`).value },
      });
      setStatus(result.message, "success");
      await load();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }
  async function decide(id, decision) {
    try {
      const result = await api(`/api/admin/orders/${id}/decision`, { method: "POST", body: { decision } });
      setStatus(result.message, "success");
      await load();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }
  async function pause(id, decision) {
    try {
      const result = await api(`/api/admin/pauses/${id}/decision`, { method: "POST", body: { decision } });
      setStatus(result.message, "success");
      await load();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }
  function renderInquiries() {
    const inquiries = data.inquiries
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.customerName)}<br><span>${escapeHtml(item.customerEmail)}</span></td><td>${escapeHtml(item.planName)}</td><td>${escapeHtml(item.status)}</td></tr>`
      )
      .join("");
    const customers = data.customers
      .map((item) => `<tr><td>${escapeHtml(item.fullName)}</td><td>${escapeHtml(item.phone)}</td><td>${escapeHtml(item.email)}</td></tr>`)
      .join("");
    const packages = (data.packageInquiries || [])
      .map((item) => {
        const total = item.totalAed == null ? "—" : `AED ${Number(item.totalAed).toFixed(2)}`;
        return `<tr><td>${escapeHtml(item.reference)}<br><span>${escapeHtml(item.customerName)} · ${escapeHtml(item.customerEmail)}</span></td><td>${escapeHtml(item.planName)} · ${escapeHtml(item.mealsPerDay)} meals · ${escapeHtml(item.durationDays)} days</td><td>${escapeHtml(total)}</td><td>Unpaid inquiry</td></tr>`;
      })
      .join("");
    panel.innerHTML = `<h2>Customers</h2><div class="table-wrap"><table><tbody>${customers || "<tr><td>None yet.</td></tr>"}</tbody></table></div>
      <h2>Meal plan inquiries</h2><p class="notice">These requests were saved without payment. A paid order is listed under Orders.</p>
      <div class="table-wrap"><table><tbody>${packages || "<tr><td>None yet.</td></tr>"}</tbody></table></div>
      <h2>Earlier email inquiries</h2><div class="table-wrap"><table><tbody>${inquiries || "<tr><td>None yet.</td></tr>"}</tbody></table></div>`;
  }
  function renderPricing() {
    const prices = data.catalog.prices
      .map(
        (price) =>
          `<tr><td>${escapeHtml(price.planSlug)}</td><td>${price.mealsPerDay}</td><td>${price.durationDays}</td><td>${price.priceAed == null ? "Not set" : `AED ${price.priceAed.toFixed(2)}`}</td></tr>`
      )
      .join("");
    const plans = data.catalog.plans.map((plan) => `<option value="${escapeHtml(plan.slug)}">${escapeHtml(plan.name)}</option>`).join("");
    panel.innerHTML = `<p class="notice">Enter the full package price in AED for a plan, meal count, and duration. Leave the price blank to unpublish it. Nothing is charged until a price is saved.</p>
      <form id="priceForm" class="stack-form">
        <div class="form-group"><label>Plan</label><select id="planSlug">${plans}</select></div>
        <div class="form-group"><label>Meals per day</label><input id="mealsPerDay" type="number" min="1" max="4" value="3"></div>
        <div class="form-group"><label>Delivery days</label><input id="durationDays" type="number" min="1" value="20"></div>
        <div class="form-group"><label>Price AED</label><input id="priceAed" inputmode="decimal" placeholder="Leave blank if not set"></div>
        <button class="btn btn-forest" type="submit">Save price</button>
      </form>
      <h2>Calories</h2>
      <form id="calorieForm" class="stack-form">
        <div class="form-group"><label>Plan</label><select id="calPlan">${plans}</select></div>
        <div class="form-group"><label>Meals per day</label><input id="calMeals" type="number" min="1" max="4" value="1"></div>
        <div class="form-group"><label>Minimum kcal</label><input id="minKcal" inputmode="numeric"></div>
        <div class="form-group"><label>Maximum kcal</label><input id="maxKcal" inputmode="numeric"></div>
        <label class="check-line"><input id="allowFour" type="checkbox"> Allow 4 meals on this plan</label>
        <button class="btn btn-forest" type="submit">Save calories</button>
      </form>
      <h2>Duration</h2>
      <form id="durationForm" class="stack-form">
        <div class="form-group"><label>Days</label><input id="durationCount" type="number" min="1" required></div>
        <div class="form-group"><label>Label</label><input id="durationLabel" required></div>
        <button class="btn btn-forest" type="submit">Save duration</button>
      </form>
      <div class="table-wrap"><table><thead><tr><th>Plan</th><th>Meals</th><th>Days</th><th>Price</th></tr></thead><tbody>${prices || "<tr><td colspan='4'>No prices published.</td></tr>"}</tbody></table></div>`;
    panel.querySelector("#priceForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const result = await api("/api/admin/prices", {
          method: "POST",
          body: {
            planSlug: panel.querySelector("#planSlug").value,
            mealsPerDay: Number(panel.querySelector("#mealsPerDay").value),
            durationDays: Number(panel.querySelector("#durationDays").value),
            priceAed: panel.querySelector("#priceAed").value,
          },
        });
        setStatus(result.message, "success");
        await load();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    panel.querySelector("#calorieForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const result = await api("/api/admin/calories", {
          method: "POST",
          body: {
            planSlug: panel.querySelector("#calPlan").value,
            mealsPerDay: Number(panel.querySelector("#calMeals").value),
            minKcal: panel.querySelector("#minKcal").value,
            maxKcal: panel.querySelector("#maxKcal").value,
            allowFourMeals: panel.querySelector("#allowFour").checked,
          },
        });
        setStatus(result.message, "success");
        await load();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    const calPlan = panel.querySelector("#calPlan");
    const allowFour = panel.querySelector("#allowFour");
    const syncFour = () => {
      const selected = data.catalog.plans.find((plan) => plan.slug === calPlan.value);
      allowFour.checked = Boolean(selected && selected.allowFourMeals);
    };
    calPlan.addEventListener("change", syncFour);
    syncFour();
    panel.querySelector("#durationForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const result = await api("/api/admin/durations", {
          method: "POST",
          body: { days: Number(panel.querySelector("#durationCount").value), label: panel.querySelector("#durationLabel").value },
        });
        setStatus(result.message, "success");
        await load();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  }
  function renderMenu() {
    const rows = data.catalog.menu
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.name)}<br><span>${item.kcal ?? "—"} kcal · P ${item.proteinG ?? "—"} · C ${item.carbsG ?? "—"} · F ${item.fatG ?? "—"}</span></td><td>${item.active ? "Shown" : "Hidden"}</td><td><button type="button" data-delete="${item.id}">Remove</button></td></tr>`
      )
      .join("");
    panel.innerHTML = `<form id="menuForm" class="stack-form">
        <div class="form-group"><label>Name</label><input id="menuName" required></div>
        <div class="form-group"><label>Category</label><input id="menuCategory" value="Meal"></div>
        <div class="form-group wide"><label>Description</label><input id="menuDescription"></div>
        <div class="form-group"><label>kcal</label><input id="menuKcal"></div>
        <div class="form-group"><label>Protein g</label><input id="menuProtein"></div>
        <div class="form-group"><label>Carbs g</label><input id="menuCarbs"></div>
        <div class="form-group"><label>Fat g</label><input id="menuFat"></div>
        <button class="btn btn-forest" type="submit">Save meal</button>
      </form>
      <form id="photoForm"><label>Photo for meal ID <input id="photoId" type="number" required></label><input id="photoFile" type="file" accept="image/png,image/jpeg,image/webp" required><button type="submit">Upload</button></form>
      <label class="check-line"><input id="customMeals" type="checkbox" ${data.settings.mealCustomization ? "checked" : ""}> Let customers choose these meals in the builder</label>
      <button type="button" id="saveCustom">Save meal-choice setting</button>
      <div class="table-wrap"><table><tbody>${rows || "<tr><td>No subscription meals yet. The public menu on the homepage is unchanged.</td></tr>"}</tbody></table></div>`;
    panel.querySelector("#menuForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const result = await api("/api/admin/menu", {
          method: "POST",
          body: {
            name: panel.querySelector("#menuName").value,
            category: panel.querySelector("#menuCategory").value,
            description: panel.querySelector("#menuDescription").value,
            kcal: panel.querySelector("#menuKcal").value,
            proteinG: panel.querySelector("#menuProtein").value,
            carbsG: panel.querySelector("#menuCarbs").value,
            fatG: panel.querySelector("#menuFat").value,
          },
        });
        setStatus(result.message, "success");
        await load();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    panel.querySelector("#photoForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = panel.querySelector("#photoFile").files[0];
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const result = await api(`/api/admin/menu/${panel.querySelector("#photoId").value}/photo`, {
            method: "POST",
            body: { dataUrl: reader.result },
          });
          setStatus("Photo saved.", "success");
          await load();
          return result;
        } catch (error) {
          setStatus(error.message, "error");
        }
      };
      reader.readAsDataURL(file);
    });
    panel.querySelector("#saveCustom").addEventListener("click", async () => {
      try {
        await saveSettings({ meal_customization_enabled: panel.querySelector("#customMeals").checked });
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    panel.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        await api(`/api/admin/menu/${button.dataset.delete}`, { method: "DELETE" });
        await load();
      });
    });
  }
  function renderDelivery() {
    const slots = data.catalog.slots.map((slot) => `<li>${escapeHtml(slot.label)} ${slot.active ? "" : "(hidden)"}</li>`).join("");
    panel.innerHTML = `<form id="slotForm" class="stack-form">
        <div class="form-group"><label>Delivery time</label><input id="slotLabel" required></div>
        <button class="btn btn-forest" type="submit">Add time</button>
      </form>
      <form id="feeForm" class="stack-form">
        <div class="form-group"><label>Delivery charge AED</label><input id="deliveryFee" value="${escapeHtml(data.settings.deliveryFeeAed)}"></div>
        <div class="form-group"><label>Minimum delivery days</label><input id="minDays" type="number" min="1" max="7" value="${escapeHtml(data.settings.minDeliveryDays)}"></div>
        <div class="form-group"><label>Cut-off time</label><input id="cutoff" value="${escapeHtml(data.settings.cutoffTime)}"></div>
        <div class="form-group"><label>Lead days</label><input id="lead" type="number" min="0" value="${escapeHtml(data.settings.cutoffLeadDays)}"></div>
        <button class="btn btn-forest" type="submit">Save delivery rules</button>
      </form>
      <ul>${slots}</ul>`;
    panel.querySelector("#slotForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await api("/api/admin/slots", { method: "POST", body: { label: panel.querySelector("#slotLabel").value } });
      await load();
    });
    panel.querySelector("#feeForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveSettings({
        delivery_fee_aed: panel.querySelector("#deliveryFee").value,
        min_delivery_days: panel.querySelector("#minDays").value,
        change_cutoff_time: panel.querySelector("#cutoff").value,
        change_cutoff_lead_days: panel.querySelector("#lead").value,
      });
    });
  }
  function renderSchedule() {
    panel.innerHTML = `<form id="scheduleForm"><label>Date <input id="scheduleDate" type="date" value="${escapeHtml(data.scheduleDate)}"></label><button type="submit">Show</button></form><div id="scheduleList"></div>`;
    panel.querySelector("#scheduleForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const result = await api(`/api/admin/schedule?date=${panel.querySelector("#scheduleDate").value}`);
      panel.querySelector("#scheduleList").innerHTML = result.deliveries.length
        ? `<ul>${result.deliveries
            .map(
              (item) =>
                `<li>${escapeHtml(item.customerName)} · ${escapeHtml(item.reference)} · ${escapeHtml(item.slot)} · ${escapeHtml(item.address)} · ${escapeHtml(item.status)}</li>`
            )
            .join("")}</ul>`
        : "<p>No deliveries on that date.</p>";
    });
  }
  function renderPromos() {
    const rows = data.catalog.promos
      .map((promo) => `<li>${escapeHtml(promo.code)} · ${escapeHtml(promo.discountType)} ${promo.discountValue} · used ${promo.uses}</li>`)
      .join("");
    const addOns = data.catalog.addOns.map((item) => `<li>${escapeHtml(item.name)} · AED ${item.priceAed.toFixed(2)}</li>`).join("");
    panel.innerHTML = `<form id="promoForm" class="stack-form">
        <div class="form-group"><label>Code</label><input id="promoCode" required></div>
        <div class="form-group"><label>Type</label><select id="promoType"><option value="percent">Percent</option><option value="fixed">Fixed AED</option></select></div>
        <div class="form-group"><label>Value</label><input id="promoValue" required></div>
        <button class="btn btn-forest" type="submit">Save code</button>
      </form>
      <form id="addonForm" class="stack-form">
        <div class="form-group"><label>Add-on</label><input id="addonName" required></div>
        <div class="form-group"><label>Price AED</label><input id="addonPrice" required></div>
        <button class="btn btn-forest" type="submit">Save add-on</button>
      </form>
      <ul>${rows || "<li>No codes.</li>"}</ul><ul>${addOns || "<li>No add-ons.</li>"}</ul>`;
    panel.querySelector("#promoForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const result = await api("/api/admin/promos", {
          method: "POST",
          body: {
            code: panel.querySelector("#promoCode").value,
            discountType: panel.querySelector("#promoType").value,
            discountValue: panel.querySelector("#promoValue").value,
          },
        });
        setStatus(result.message, "success");
        await load();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    panel.querySelector("#addonForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await api("/api/admin/addons", {
        method: "POST",
        body: { name: panel.querySelector("#addonName").value, priceAed: panel.querySelector("#addonPrice").value },
      });
      await load();
    });
  }
  function renderReviews() {
    panel.innerHTML = `<p class="notice">Only reviews Nature Fit has permission to publish should be marked approved. Nothing is shown until then.</p>
      <form id="reviewForm" class="stack-form">
        <div class="form-group"><label>Name</label><input id="reviewName" required></div>
        <div class="form-group"><label>Area</label><input id="reviewArea"></div>
        <div class="form-group wide"><label>Review</label><textarea id="reviewQuote" required></textarea></div>
        <label class="check-line"><input id="reviewApproved" type="checkbox"> Approved for the website</label>
        <button class="btn btn-forest" type="submit">Save review</button>
      </form>`;
    panel.querySelector("#reviewForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const result = await api("/api/admin/testimonials", {
        method: "POST",
        body: {
          name: panel.querySelector("#reviewName").value,
          area: panel.querySelector("#reviewArea").value,
          quote: panel.querySelector("#reviewQuote").value,
          approved: panel.querySelector("#reviewApproved").checked,
        },
      });
      setStatus(result.message, "success");
      await load();
    });
  }
  function renderSettings() {
    const settings = data.settings;
    panel.innerHTML = `<p class="notice">Payment gateway: ${escapeHtml(data.paymentGateway)}. Live card payments need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET on the server. WhatsApp automatic messages need the Cloud API variables. Click-to-chat does not send messages for the customer.</p>
      <form id="settingsForm" class="stack-form">
        <div class="form-group"><label>WhatsApp number</label><input id="waNumber" value="${escapeHtml(settings.whatsappNumber)}"></div>
        <div class="form-group"><label>WhatsApp mode</label><select id="waMode"><option value="click_to_chat">Click to chat</option><option value="cloud_api">Cloud API templates</option></select></div>
        <label class="check-line"><input id="codEnabled" type="checkbox" ${settings.codEnabled ? "checked" : ""}> Cash on delivery</label>
        <label class="check-line"><input id="bankEnabled" type="checkbox" ${settings.bankTransferEnabled ? "checked" : ""}> Bank transfer</label>
        <div class="form-group wide"><label>Bank details</label><textarea id="bankDetails">${escapeHtml(settings.bankDetails)}</textarea></div>
        <label class="check-line"><input id="cardEnabled" type="checkbox" ${settings.cardEnabled ? "checked" : ""}> Card payments</label>
        <button class="btn btn-forest" type="submit">Save settings</button>
      </form>`;
    panel.querySelector("#waMode").value = settings.whatsappMode;
    panel.querySelector("#settingsForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveSettings({
        whatsapp_business_number: panel.querySelector("#waNumber").value,
        whatsapp_mode: panel.querySelector("#waMode").value,
        cod_enabled: panel.querySelector("#codEnabled").checked,
        bank_transfer_enabled: panel.querySelector("#bankEnabled").checked,
        bank_details: panel.querySelector("#bankDetails").value,
        card_payments_enabled: panel.querySelector("#cardEnabled").checked,
      });
    });
  }
  async function saveSettings(extra) {
    const settings = data.settings;
    const result = await api("/api/admin/settings", {
      method: "POST",
      body: {
        whatsapp_business_number: settings.whatsappNumber,
        whatsapp_mode: settings.whatsappMode,
        delivery_weekdays: settings.weekdays,
        min_delivery_days: settings.minDeliveryDays,
        delivery_fee_aed: settings.deliveryFeeAed,
        cod_enabled: settings.codEnabled,
        bank_transfer_enabled: settings.bankTransferEnabled,
        bank_details: settings.bankDetails,
        card_payments_enabled: settings.cardEnabled,
        meal_customization_enabled: settings.mealCustomization,
        change_cutoff_time: settings.cutoffTime,
        change_cutoff_lead_days: settings.cutoffLeadDays,
        service_emirates: settings.emirates,
        instagram_url: settings.instagramUrl,
        facebook_url: settings.facebookUrl,
        public_phone: settings.phone,
        public_email: settings.email,
        public_address: settings.address,
        public_hours: settings.hours,
        ...extra,
      },
    });
    setStatus(result.message, "success");
    await load();
  }
  async function renderDishes() {
    panel.innerHTML = "<p>Loading public menu details…</p>";
    let catalog;
    try {
      const response = await fetch("data/menu-details.json");
      catalog = await response.json();
    } catch (error) {
      panel.innerHTML = "<p>The public menu details file could not be loaded.</p>";
      return;
    }
    let overrides = new Map();
    try {
      const saved = await api("/api/admin/public-menu");
      overrides = new Map((saved.overrides || []).map((item) => [item.id, item]));
    } catch (error) {
      setStatus("Saved edits are unavailable until the database can be reached. Prices and the meal-plan builder are unchanged.", "error");
    }
    const options = catalog.items
      .map((item) => {
        const status = (overrides.get(item.id) || item).nutritionVerificationStatus || "estimated";
        return `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(status)}</option>`;
      })
      .join("");
    panel.innerHTML = `<form id="dishForm" class="stack-form">
        <p>Edit the public menu details. Saving stores a review copy for this dish. It does not change the printed price, the photo, checkout, or the meal-plan builder. The extra database table is created only when you save.</p>
        <div class="form-group"><label>Dish</label><select id="dishId">${options}</select></div>
        <div class="form-group"><label>Printed price</label><input id="dishPrice" disabled></div>
        <div class="form-group wide"><label>Description</label><textarea id="dishDescription" rows="4"></textarea></div>
        <div class="form-group wide"><label>Ingredients, one per line</label><textarea id="dishIngredients" rows="5"></textarea></div>
        <div class="form-group wide"><label>Preparation</label><textarea id="dishPreparation" rows="3"></textarea></div>
        <div class="form-group wide"><label>Serving size</label><textarea id="dishServing" rows="2"></textarea></div>
        <div class="form-group"><label>Calories</label><input id="dishCalories" inputmode="decimal"></div>
        <div class="form-group"><label>Protein g</label><input id="dishProtein" inputmode="decimal"></div>
        <div class="form-group"><label>Carbohydrates g</label><input id="dishCarbs" inputmode="decimal"></div>
        <div class="form-group"><label>Fats g</label><input id="dishFats" inputmode="decimal"></div>
        <div class="form-group"><label>Fibre g</label><input id="dishFibre" inputmode="decimal"></div>
        <div class="form-group"><label>Nutrition on the menu</label>
          <select id="dishStatus">
            <option value="estimated">Show nutrition</option>
            <option value="withheld">Hide nutrition</option>
          </select>
        </div>
        <div class="form-group wide"><label>Allergens, one per line</label><textarea id="dishAllergens" rows="3"></textarea></div>
        <div class="form-group wide"><label>Allergen note</label><textarea id="dishAllergenNote" rows="2"></textarea></div>
        <div class="form-group wide"><label>Labels, one per line</label><textarea id="dishTags" rows="3"></textarea></div>
        <div class="form-group wide"><label>Dietary notes</label><textarea id="dishBenefits" rows="3"></textarea></div>
        <button class="btn btn-forest" type="submit">Save dish details</button>
      </form>`;
    const form = panel.querySelector("#dishForm");
    const select = panel.querySelector("#dishId");
    const lines = (value) => (Array.isArray(value) ? value.join("\n") : "");
    const fill = () => {
      const base = catalog.items.find((item) => item.id === select.value);
      const item = { ...base, ...(overrides.get(select.value) || {}) };
      panel.querySelector("#dishPrice").value = base.priceAed == null ? "Not printed on the card" : `AED ${base.priceAed}`;
      panel.querySelector("#dishDescription").value = item.description || "";
      panel.querySelector("#dishIngredients").value = lines(item.ingredients);
      panel.querySelector("#dishPreparation").value = item.preparationMethod || "";
      panel.querySelector("#dishServing").value = item.servingSize || "";
      panel.querySelector("#dishCalories").value = item.calories ?? "";
      panel.querySelector("#dishProtein").value = item.protein ?? "";
      panel.querySelector("#dishCarbs").value = item.carbohydrates ?? "";
      panel.querySelector("#dishFats").value = item.fats ?? "";
      panel.querySelector("#dishFibre").value = item.fibre ?? "";
      panel.querySelector("#dishStatus").value = item.nutritionVerificationStatus || "estimated";
      panel.querySelector("#dishAllergens").value = lines(item.allergens);
      panel.querySelector("#dishAllergenNote").value = item.allergenNote || "";
      panel.querySelector("#dishTags").value = lines(item.dietaryTags);
      panel.querySelector("#dishBenefits").value = item.dietaryBenefits || "";
    };
    const itemBasis = (id) => {
      const base = catalog.items.find((item) => item.id === id) || {};
      const saved = overrides.get(id) || {};
      return saved.nutritionBasis || base.nutritionBasis || "";
    };
    select.addEventListener("change", fill);
    fill();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const split = (id) =>
        panel
          .querySelector(id)
          .value.split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
      try {
        const result = await api("/api/admin/public-menu", {
          method: "POST",
          body: {
            id: select.value,
            description: panel.querySelector("#dishDescription").value,
            ingredients: split("#dishIngredients"),
            preparationMethod: panel.querySelector("#dishPreparation").value,
            servingSize: panel.querySelector("#dishServing").value,
            calories: panel.querySelector("#dishCalories").value,
            protein: panel.querySelector("#dishProtein").value,
            carbohydrates: panel.querySelector("#dishCarbs").value,
            fats: panel.querySelector("#dishFats").value,
            fibre: panel.querySelector("#dishFibre").value,
            nutritionVerificationStatus: panel.querySelector("#dishStatus").value,
            allergens: split("#dishAllergens"),
            allergenNote: panel.querySelector("#dishAllergenNote").value,
            dietaryTags: split("#dishTags"),
            dietaryBenefits: panel.querySelector("#dishBenefits").value,
            nutritionBasis: itemBasis(select.value),
            missingInfo: [],
          },
        });
        overrides.set(result.profile.id, result.profile);
        setStatus(result.message, "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  }

  document.getElementById("staffForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/login", { method: "POST", body: { password: document.getElementById("adminPassword").value } });
      await load();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
  document.getElementById("adminLogout").addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST", body: {} });
    location.reload();
  });
  load().catch(() => {
    /* staff is not logged in yet */
  });
})();
