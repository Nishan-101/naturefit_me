(function () {
  const reviews = document.getElementById("reviews");
  const reviewGrid = document.getElementById("reviewGrid");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function kcalText(plan) {
    const three = (plan.calories || []).find((band) => band.mealsPerDay === 3 && band.minKcal != null);
    const four = (plan.calories || []).find((band) => band.mealsPerDay === 4 && band.minKcal != null);
    const parts = [];
    if (three) parts.push(`3 meals · ${three.minKcal}–${three.maxKcal} kcal`);
    if (four) parts.push(`4 meals · ${four.minKcal}–${four.maxKcal} kcal`);
    return parts.join(" · ") || "Calorie ranges are published by the kitchen.";
  }

  function apply(site) {
    const settings = site.settings || {};
    document.querySelectorAll("[data-whatsapp]").forEach((link) => {
      if (settings.whatsappUrl) link.href = settings.whatsappUrl;
    });
    if (settings.instagramUrl) {
      document.querySelectorAll("[data-instagram]").forEach((link) => {
        link.href = settings.instagramUrl;
      });
    }
    if (settings.facebookUrl) {
      document.querySelectorAll("[data-facebook]").forEach((link) => {
        link.href = settings.facebookUrl;
      });
    }
    if (Array.isArray(site.plans)) {
      document.querySelectorAll("[data-plan]").forEach((card) => {
        const plan = site.plans.find((item) => item.slug === card.dataset.plan);
        const line = card.querySelector("[data-kcal]");
        if (plan && line) line.textContent = kcalText(plan);
      });
    }
    if (reviews && reviewGrid && Array.isArray(site.testimonials) && site.testimonials.length) {
      reviewGrid.innerHTML = site.testimonials
        .map(
          (item) => `<article class="review-card">
            <p>"${escapeHtml(item.quote)}"</p>
            <div class="reviewer"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.area || "Dubai")}</span></div>
          </article>`
        )
        .join("");
      reviews.hidden = false;
    }
  }

  const api = window.NatureFit && window.NatureFit.api ? window.NatureFit.api : null;
  if (!api) return;
  api("/api/site")
    .then(apply)
    .catch(() => {
      /* the page already shows the published calorie ranges */
    });
})();
