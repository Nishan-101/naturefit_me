/* Reusable menu details. Dish copy and nutrition live in data/menu-details.json. */
(function () {
  const CATEGORY_LABELS = {
    picks: "Picks for You",
    breakfast: "Breakfast",
    salads: "Salads",
    burgers: "Burgers & Wraps",
    main: "Main Course",
    bowls: "Bowls",
    juice: "Fresh Juice",
  };

  const FALLBACK_DISCLAIMER =
    "Nutritional values are approximate per serving and may vary depending on ingredients, portion sizes and preparation methods.";

  let catalog = null;
  let overrides = new Map();
  let lastFocus = null;
  let closeTimer = null;

  function apiBase() {
    if (window.NATURE_FIT_API_URL) return String(window.NATURE_FIT_API_URL).replace(/\/$/, "");
    if (location.port === "5000") return "";
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return "http://localhost:5000";
    return "";
  }

  function normalizeName(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function categoryLabel(categories) {
    const list = Array.isArray(categories) ? categories : [];
    const specific = list.find((item) => item !== "picks") || list[0];
    return CATEGORY_LABELS[specific] || "Menu";
  }

  function mergeItem(base, override) {
    if (!override) return base;
    const nutrition = override.nutrition && typeof override.nutrition === "object" ? override.nutrition : {};
    return {
      ...base,
      description: override.description || base.description,
      ingredients: Array.isArray(override.ingredients) ? override.ingredients : base.ingredients,
      preparationMethod: override.preparationMethod || base.preparationMethod,
      servingSize: override.servingSize || base.servingSize,
      dietaryBenefits: override.dietaryBenefits || base.dietaryBenefits,
      allergens: Array.isArray(override.allergens) ? override.allergens : base.allergens,
      allergenNote: override.allergenNote || base.allergenNote,
      dietaryTags: Array.isArray(override.dietaryTags) ? override.dietaryTags : base.dietaryTags,
      missingInfo: Array.isArray(override.missingInfo) ? override.missingInfo : base.missingInfo,
      nutritionBasis: override.nutritionBasis || nutrition.basis || base.nutritionBasis,
      nutritionVerificationStatus:
        override.nutritionVerificationStatus || nutrition.verificationStatus || base.nutritionVerificationStatus,
      calories: Object.prototype.hasOwnProperty.call(override, "calories") ? override.calories : base.calories,
      protein: Object.prototype.hasOwnProperty.call(override, "protein") ? override.protein : base.protein,
      carbohydrates: Object.prototype.hasOwnProperty.call(override, "carbohydrates")
        ? override.carbohydrates
        : base.carbohydrates,
      fats: Object.prototype.hasOwnProperty.call(override, "fats") ? override.fats : base.fats,
      fibre: Object.prototype.hasOwnProperty.call(override, "fibre") ? override.fibre : base.fibre,
      id: base.id,
      name: base.name,
      priceAed: base.priceAed,
      image: base.image,
      imageAlt: base.imageAlt,
      publishedCalories: base.publishedCalories,
      categories: base.categories,
    };
  }

  function itemById(id) {
    const base = (catalog.items || []).find((item) => item.id === id);
    if (!base) return null;
    return mergeItem(base, overrides.get(id));
  }

  function numbersVisible(item) {
    return item.nutritionVerificationStatus !== "withheld" && item.calories != null;
  }

  function formatNumber(value) {
    if (value == null || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function ensureModal() {
    let root = document.getElementById("nfDishModal");
    if (root) return root;
    root = el("div", "nf-dish-modal");
    root.id = "nfDishModal";
    root.hidden = true;
    const dialog = el("div", "nf-dish-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "nfDishTitle");
    dialog.tabIndex = -1;
    const close = el("button", "nf-dish-close", "\u00d7");
    close.type = "button";
    close.setAttribute("aria-label", "Close dish details");
    const scroll = el("div", "nf-dish-scroll");
    scroll.id = "nfDishContent";
    dialog.append(close, scroll);
    root.append(dialog);
    document.body.append(root);

    close.addEventListener("click", closeModal);
    root.addEventListener("click", (event) => {
      if (event.target === root) closeModal();
    });
    document.addEventListener("keydown", (event) => {
      if (root.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll("button, [href], summary, [tabindex]:not([tabindex='-1'])")].filter(
        (node) => !node.disabled
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    return root;
  }

  function setPageInert(inert) {
    document.querySelectorAll("header, main, footer, .nf-wa, .back-to-top").forEach((node) => {
      if (inert) node.setAttribute("inert", "");
      else node.removeAttribute("inert");
    });
  }

  function render(item) {
    const content = document.getElementById("nfDishContent");
    content.replaceChildren();
    const hero = el("div", "nf-dish-hero");
    const image = document.createElement("img");
    image.src = item.image;
    image.alt = item.imageAlt || item.name;
    hero.append(image);

    const body = el("div", "nf-dish-body");
    body.append(el("p", "nf-dish-kicker", categoryLabel(item.categories)));
    const heading = el("div", "nf-dish-heading");
    const title = el("h2", null, item.name);
    title.id = "nfDishTitle";
    heading.append(title);
    if (item.priceAed != null) heading.append(el("p", "nf-dish-price", `AED ${item.priceAed}`));
    body.append(heading);

    if (item.dietaryTags && item.dietaryTags.length) {
      const tags = el("ul", "nf-dish-tags");
      item.dietaryTags.forEach((tag) => tags.append(el("li", null, tag)));
      body.append(tags);
    }

    body.append(el("p", "nf-dish-copy", item.description));

    const macros = el("div", "nf-dish-macros");
    [
      ["Calories", numbersVisible(item) ? formatNumber(item.calories) : "—", "kcal"],
      ["Protein", numbersVisible(item) ? formatNumber(item.protein) : "—", "g"],
      ["Carbs", numbersVisible(item) ? formatNumber(item.carbohydrates) : "—", "g"],
      ["Fats", numbersVisible(item) ? formatNumber(item.fats) : "—", "g"],
    ].forEach(([label, value, unit]) => {
      const card = el("div", "nf-dish-macro");
      card.append(el("strong", null, value));
      card.append(el("span", null, `${label}${value === "—" ? "" : ` · ${unit}`}`));
      macros.append(card);
    });
    body.append(macros);

    if (numbersVisible(item) && item.fibre != null) {
      body.append(el("p", "nf-dish-fibre", `Fibre ${formatNumber(item.fibre)} g per serving`));
    }
    body.append(el("p", "nf-dish-note", `Serving size: ${item.servingSize || "Not published."}`));

    if (numbersVisible(item) && item.publishedCalories != null && Number(item.publishedCalories) !== Number(item.calories)) {
      body.append(
        el(
          "p",
          "nf-dish-published",
          `The current menu card also shows ${item.publishedCalories} kcal. That printed figure was not recalculated here.`
        )
      );
    }

    body.append(el("p", "nf-dish-disclaimer", catalog.disclaimer || FALLBACK_DISCLAIMER));

    body.append(section("Ingredients", item.ingredients, ""));
    body.append(textSection("Preparation", item.preparationMethod));
    body.append(textSection("Dietary notes", item.dietaryBenefits));
    body.append(section("Allergens", item.allergens, "No major allergen is named for this dish."));
    if (item.allergenNote) body.append(el("p", "nf-dish-note", item.allergenNote));
    if (catalog.labellingNote) body.append(el("p", "nf-dish-disclaimer", catalog.labellingNote));

    content.append(hero, body);
  }

  function section(title, items, emptyText) {
    const block = el("section", "nf-dish-block");
    block.append(el("h3", null, title));
    if (!items || !items.length) {
      block.append(el("p", null, emptyText));
      return block;
    }
    const list = el("ul", "nf-dish-list");
    items.forEach((item) => list.append(el("li", null, item)));
    block.append(list);
    return block;
  }

  function textSection(title, text) {
    const block = el("section", "nf-dish-block");
    block.append(el("h3", null, title));
    block.append(el("p", null, text || ""));
    return block;
  }

  function openModal(id, imageSrc) {
    const item = itemById(id);
    if (!item) return;
    if (imageSrc) item.image = imageSrc;
    const root = ensureModal();
    render(item);
    lastFocus = document.activeElement;
    if (closeTimer) window.clearTimeout(closeTimer);
    root.hidden = false;
    root.classList.remove("is-closing");
    document.body.style.overflow = "hidden";
    setPageInert(true);
    requestAnimationFrame(() => root.classList.add("is-open"));
    const dialog = root.querySelector(".nf-dish-dialog");
    dialog.focus();
  }

  function closeModal() {
    const root = document.getElementById("nfDishModal");
    if (!root || root.hidden || root.classList.contains("is-closing")) return;
    root.classList.remove("is-open");
    root.classList.add("is-closing");
    const finish = () => {
      if (root.hidden) return;
      root.hidden = true;
      root.classList.remove("is-closing");
      document.body.style.overflow = "";
      setPageInert(false);
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    };
    const dialog = root.querySelector(".nf-dish-dialog");
    dialog.addEventListener("transitionend", finish, { once: true });
    closeTimer = window.setTimeout(finish, 360);
  }

  function enhanceCards() {
    const byName = new Map((catalog.items || []).map((item) => [normalizeName(item.name), item]));
    document.querySelectorAll(".nf-menu-card").forEach((card) => {
      const title = card.querySelector("h3");
      const name = normalizeName(title && title.textContent);
      const item = byName.get(name);
      if (!item || !title) return;
      card.dataset.menuId = item.id;
      const image = card.querySelector(".nf-menu-image");
      [image, title].forEach((node) => {
        if (!node) return;
        node.classList.add("nf-menu-open");
        node.dataset.menuOpen = item.id;
        node.tabIndex = 0;
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", `View nutrition and details for ${item.name}`);
      });
      if (!card.querySelector(".nf-menu-details-cue")) {
        const cue = document.createElement("button");
        cue.type = "button";
        cue.className = "nf-menu-details-cue";
        cue.dataset.menuOpen = item.id;
        cue.textContent = "View Nutrition & Details";
        const body = card.querySelector(".nf-menu-card-body");
        if (body) body.append(cue);
      }
    });

    const grid = document.querySelector(".nf-menu-grid");
    if (!grid || grid.dataset.detailsBound === "true") return;
    grid.dataset.detailsBound = "true";
    function cardImage(opener) {
      const card = opener.closest(".nf-menu-card");
      const image = card && card.querySelector("img");
      return image ? image.getAttribute("src") : "";
    }
    grid.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-menu-open]");
      if (!opener || !grid.contains(opener)) return;
      openModal(opener.dataset.menuOpen, cardImage(opener));
    });
    grid.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const opener = event.target.closest("[data-menu-open]");
      if (!opener || !grid.contains(opener) || opener.tagName === "BUTTON") return;
      event.preventDefault();
      openModal(opener.dataset.menuOpen, cardImage(opener));
    });
  }

  async function loadOverrides() {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`${apiBase()}/api/menu/details`, { signal: controller.signal });
      if (!response.ok) return;
      const payload = await response.json();
      (payload.overrides || []).forEach((item) => {
        if (item && item.id) overrides.set(item.id, item);
      });
    } catch (error) {
      overrides = new Map();
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function init() {
    if (!document.querySelector(".nf-menu-card")) return;
    const response = await fetch(new URL("data/menu-details.json", window.location.href));
    catalog = await response.json();
    await loadOverrides();
    enhanceCards();
    ensureModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init().catch((error) => {
        console.error("Menu details could not be loaded.", error);
      });
    });
  } else {
    init().catch((error) => {
      console.error("Menu details could not be loaded.", error);
    });
  }
})();
