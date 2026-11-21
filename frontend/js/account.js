(function () {
  if (!window.NatureFit) return;
  const { api } = window.NatureFit;
  const statusEl = document.getElementById("accountStatus");
  const authCard = document.getElementById("authCard");
  const dashCard = document.getElementById("dashCard");

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

  function money(value) {
    return value == null ? "To be confirmed" : `AED ${Number(value).toFixed(2)}`;
  }

  async function showDashboard() {
    const data = await api("/api/account/dashboard");
    authCard.hidden = true;
    dashCard.hidden = false;
    document.getElementById("hello").textContent = `Hello ${data.customer.fullName || ""}. Subscriptions stay inactive until payment is verified and Nature Fit approves them.`;
    document.getElementById("planList").innerHTML = data.plans.length
      ? data.plans
          .map((plan) => {
            const upcoming = (plan.upcoming || []).map((item) => item.date).join(", ") || "None scheduled yet";
            return `<article class="summary-box" style="margin-bottom:12px">
              <strong>${escapeHtml(plan.reference)}</strong> · ${escapeHtml(plan.planName)}<br>
              ${plan.mealsPerDay} meals · ${plan.durationDays} delivery days · ${escapeHtml(plan.startDate)} to ${escapeHtml(plan.endDate || "pending approval")}<br>
              Status: ${escapeHtml(plan.orderStatus)} · Payment: ${escapeHtml(plan.paymentStatus)} · Subscription: ${escapeHtml(plan.subscriptionStatus || "inactive")}<br>
              Remaining delivery days: ${plan.remainingDeliveryDays}<br>
              Upcoming: ${escapeHtml(upcoming)}<br>
              Total: ${escapeHtml(money(plan.totalAed))}
              <div class="stack-form" style="margin-top:10px">
                <input data-pause-start="${plan.subscriptionId}" type="date" aria-label="Pause start">
                <input data-pause-end="${plan.subscriptionId}" type="date" aria-label="Pause end">
                <button type="button" data-pause="${plan.subscriptionId}">Request pause</button>
                <button type="button" data-resume="${plan.subscriptionId}">Request resume</button>
                <input data-renew="${plan.subscriptionId}" type="date" aria-label="Renewal start date">
                <button type="button" data-renew-btn="${plan.subscriptionId}">Request renewal</button>
                ${plan.paymentStatus === "paid" ? "" : `<button type="button" data-pay="${escapeHtml(plan.reference)}">Pay by card if checkout is live</button>`}
              </div>
            </article>`;
          })
          .join("")
      : "<p>No meal plans yet. <a href=\"build.html\">Build your meal plan</a>.</p>";
    document.getElementById("paymentRows").innerHTML = data.payments.length
      ? data.payments
          .map(
            (payment) =>
              `<tr><td>${escapeHtml(payment.reference)}</td><td>${escapeHtml(money(payment.amountAed))}</td><td>${escapeHtml(payment.status)}</td><td>${escapeHtml(payment.providerRef || "—")}</td></tr>`
          )
          .join("")
      : "<tr><td colspan=\"4\">No payments recorded.</td></tr>";
    const support = document.getElementById("supportLink");
    if (data.supportWhatsapp) support.href = data.supportWhatsapp;
    else support.hidden = true;
    bindPlanActions();
  }

  function bindPlanActions() {
    document.querySelectorAll("[data-pause]").forEach((button) => {
      button.addEventListener("click", () => sendChange(button.dataset.pause, "pause"));
    });
    document.querySelectorAll("[data-resume]").forEach((button) => {
      button.addEventListener("click", () => sendChange(button.dataset.resume, "resume"));
    });
    document.querySelectorAll("[data-renew-btn]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.renewBtn;
        const startDate = document.querySelector(`[data-renew="${id}"]`).value;
        try {
          const result = await api(`/api/account/subscriptions/${id}/renew`, { method: "POST", body: { startDate } });
          setStatus(`${result.message} Order ${result.reference}.`, "success");
          await showDashboard();
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
    });
    document.querySelectorAll("[data-pay]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const result = await api(`/api/orders/${button.dataset.pay}/pay`, { method: "POST", body: { paymentMethod: "card" } });
          if (result.payment && result.payment.checkoutUrl) location.href = result.payment.checkoutUrl;
          else setStatus((result.payment && result.payment.message) || "No card payment was taken.", "pending");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
    });
  }

  async function sendChange(id, type) {
    const startDate = document.querySelector(`[data-pause-start="${id}"]`).value;
    const endDate = document.querySelector(`[data-pause-end="${id}"]`).value;
    try {
      const result = await api(`/api/account/subscriptions/${id}/pause`, {
        method: "POST",
        body: { type, startDate, endDate },
      });
      setStatus(result.message, "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/account/login", {
        method: "POST",
        body: {
          email: document.getElementById("loginEmail").value,
          password: document.getElementById("loginPassword").value,
        },
      });
      await showDashboard();
      setStatus("");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  document.getElementById("registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/account/register", {
        method: "POST",
        body: {
          fullName: document.getElementById("fullName").value,
          email: document.getElementById("email").value,
          countryCode: "971",
          nationalNumber: document.getElementById("nationalNumber").value,
          password: document.getElementById("password").value,
          privacyConsent: document.getElementById("privacyConsent").checked,
          whatsappOptIn: document.getElementById("whatsappOptIn").checked,
        },
      });
      await showDashboard();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  document.getElementById("addressForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/account/address", {
        method: "PATCH",
        body: {
          reference: document.getElementById("reference").value.trim(),
          emirate: document.getElementById("emirate").value.trim(),
          area: document.getElementById("area").value.trim(),
          building: document.getElementById("building").value.trim(),
          addressLine: document.getElementById("addressLine").value.trim(),
          instructions: document.getElementById("instructions").value.trim(),
        },
      });
      setStatus(result.message, "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await api("/api/account/logout", { method: "POST", body: {} });
    location.reload();
  });

  api("/api/account/me")
    .then((data) => {
      if (data.customer) return showDashboard();
      return null;
    })
    .catch((error) => setStatus(error.message, "error"));
})();
