document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
  }

  const bookingForm = document.getElementById("booking-form");
  if (bookingForm) {
    bookingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("form-status");
      const submitBtn = bookingForm.querySelector('button[type="submit"]');
      const data = Object.fromEntries(new FormData(bookingForm).entries());

      const selected = getSelectedServices();
      const serviceError = document.getElementById("b-service-error");
      if (selected.length === 0) {
        serviceError.style.display = "block";
        return;
      }
      serviceError.style.display = "none";
      data.service = selected.map((s) => `${s.name} — $${(s.price_cents / 100).toFixed(0)}`).join(", ");

      submitBtn.disabled = true;
      status.textContent = "Sending your request...";
      status.className = "";

      try {
        const response = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const result = await response.json();

        if (response.ok) {
          status.textContent = "Thank you — your request has been received. We'll confirm by email shortly.";
          status.className = "success";
          bookingForm.reset();
          updateServiceCheckboxLimit();
          localStorage.removeItem(CART_KEY);
          updateCartBadge();
          const note = document.getElementById("cart-prefill-note");
          if (note) note.remove();
        } else {
          status.textContent = result.error || "Something went wrong. Please try again or call us directly.";
          status.className = "error";
        }
      } catch (err) {
        status.textContent = "Something went wrong. Please try again or call us directly.";
        status.className = "error";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  const contactForm = document.getElementById("contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("contact-status");
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const data = Object.fromEntries(new FormData(contactForm).entries());

      submitBtn.disabled = true;
      status.textContent = "Sending your message...";
      status.className = "";

      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const result = await response.json();

        if (response.ok) {
          status.textContent = "Message sent — we'll get back to you within 24 hours.";
          status.className = "success";
          contactForm.reset();
        } else {
          status.textContent = result.error || "Something went wrong. Please try again or email us directly.";
          status.className = "error";
        }
      } catch (err) {
        status.textContent = "Something went wrong. Please try again or email us directly.";
        status.className = "error";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  loadServicesIntoSelect().then(prefillBookingFromCart);
  loadServicesIntoPage();
  setupServiceModal();
  setupAddToCartButtons();
  updateCartBadge();
});

function setupAddToCartButtons() {
  document.querySelectorAll(".add-to-cart-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.name;
      const priceCents = parseInt(btn.dataset.priceCents, 10);
      addToCart({ name, price_cents: priceCents });
      flashAddedButton(btn);
      showToast(`${name} added to cart`);
    });
  });
}

const FALLBACK_SERVICES = [
  { category: "Waxing", name: "Back Wax", duration: "1 hr", price_cents: 5500, description: "Smooth, long-lasting hair removal for the full back." },
  { category: "Waxing", name: "Bikini Line Wax", duration: "30 mins", price_cents: 4000, description: "Clean, precise shaping along the bikini line." },
  { category: "Waxing", name: "Full Arm Wax", duration: "30 mins", price_cents: 4500, description: "Hair removal for the entire arm, shoulder to wrist." },
  { category: "Waxing", name: "Full Body Wax", duration: "2 hrs 30 mins", price_cents: 15000, description: "Complete head-to-toe waxing in one extended session." },
  { category: "Waxing", name: "Full Legs Wax", duration: "1 hr 30 mins", price_cents: 5000, description: "Smooth, hair-free legs from thigh to ankle." },
  { category: "Waxing", name: "Half Arms Wax", duration: "1 hr 30 mins", price_cents: 3000, description: "Hair removal from elbow to wrist." },
  { category: "Waxing", name: "Half Legs Wax", duration: "1 hr 30 mins", price_cents: 3500, description: "Hair removal from knee to ankle." },
  { category: "Waxing", name: "Stomach Wax", duration: "1 hr 30 mins", price_cents: 3000, description: "Gentle hair removal for the abdomen area." },
  { category: "Waxing", name: "Under Arm Wax", duration: "30 mins", price_cents: 2000, description: "Quick, thorough underarm hair removal." },
  { category: "Waxing", name: "Underarms Wax", duration: "1 hr 30 mins", price_cents: 2000, description: "Thorough underarm hair removal with extra care for sensitive skin." },
  { category: "Threading", name: "Beard Line Threading", duration: "30 mins", price_cents: 3000, description: "Clean, sharp shaping along the beard line." },
  { category: "Threading", name: "Brow Threading", duration: "15 mins", price_cents: 3500, description: "Precision eyebrow shaping using traditional threading technique." },
  { category: "Threading", name: "Chin Threading", duration: "10 mins", price_cents: 1500, description: "Quick, precise hair removal for the chin area." },
  { category: "Threading", name: "Forehead Threading", duration: "20 mins", price_cents: 2000, description: "Clean hairline shaping along the forehead." },
  { category: "Threading", name: "Full Face Threading", duration: "30 mins", price_cents: 5500, description: "Complete facial hair removal for a smooth, polished look." },
  { category: "Threading", name: "Sideburns Threading", duration: "20 mins", price_cents: 3000, description: "Precise shaping and tidying of the sideburn area." },
  { category: "Threading", name: "Upper Lip Threading", duration: "15 mins", price_cents: 1000, description: "Fast, precise hair removal for the upper lip." },
  { category: "Facial & Other", name: "Hydrating Glow Facial", duration: "30 mins", price_cents: 15000, description: "A nourishing facial treatment that leaves skin hydrated and glowing." },
  { category: "Facial & Other", name: "Henna Design", duration: "30 mins", price_cents: 2500, description: "Custom henna application for a beautiful temporary design." },
  { category: "Bundle", name: "Brow & Lip Combo", duration: "per visit", price_cents: 4000, description: "Brow threading and upper lip threading together in one visit." },
  { category: "Bundle", name: "Smooth Legs & Bikini", duration: "per visit", price_cents: 8000, description: "Full legs wax and bikini line wax together in one visit." },
  { category: "Bundle", name: "Full Face Refresh", duration: "per visit", price_cents: 19000, description: "Full face threading paired with a hydrating glow facial." },
];

function groupByCategory(services) {
  const groups = {};
  services.forEach((service) => {
    if (!groups[service.category]) groups[service.category] = [];
    groups[service.category].push(service);
  });
  return groups;
}

const MAX_SERVICES_PER_BOOKING = 3;

function renderServiceCheckboxes(container, services) {
  const groups = groupByCategory(services);
  container.innerHTML = Object.entries(groups)
    .map(([category, items]) => {
      const label = category === "Bundle" ? "Bundles" : category;
      const rows = items
        .map((item, i) => {
          const price = (item.price_cents / 100).toFixed(0);
          const inputId = `b-svc-${category.replace(/\W+/g, "")}-${i}`;
          return `
            <label class="service-checkbox-item" for="${inputId}">
              <input type="checkbox" id="${inputId}" data-name="${escapeHtml(item.name)}" data-price-cents="${item.price_cents}">
              ${escapeHtml(item.name)}
              <span class="price">$${price}</span>
            </label>
          `;
        })
        .join("");
      return `<div class="service-checkbox-group-label">${escapeHtml(label)}</div>${rows}`;
    })
    .join("");

  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", updateServiceCheckboxLimit);
  });
  updateServiceCheckboxLimit();
}

function getSelectedServices() {
  const container = document.getElementById("b-service-checkboxes");
  if (!container) return [];
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => ({
    name: cb.dataset.name,
    price_cents: parseInt(cb.dataset.priceCents, 10),
  }));
}

function updateServiceCheckboxLimit() {
  const container = document.getElementById("b-service-checkboxes");
  const countLabel = document.getElementById("b-service-count");
  if (!container) return;

  const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
  const checkedCount = checkboxes.filter((cb) => cb.checked).length;

  checkboxes.forEach((cb) => {
    const atLimit = checkedCount >= MAX_SERVICES_PER_BOOKING && !cb.checked;
    cb.disabled = atLimit;
    cb.closest(".service-checkbox-item").classList.toggle("disabled", atLimit);
  });

  if (countLabel) countLabel.textContent = `(${checkedCount}/${MAX_SERVICES_PER_BOOKING} selected)`;

  const subtotalEl = document.getElementById("b-service-subtotal");
  if (subtotalEl) {
    const totalCents = getSelectedServices().reduce((sum, s) => sum + s.price_cents, 0);
    subtotalEl.textContent = `$${(totalCents / 100).toFixed(0)}`;
  }
}

async function loadServicesIntoSelect() {
  const container = document.getElementById("b-service-checkboxes");
  if (!container) return;

  try {
    const response = await fetch("/api/services");
    if (!response.ok) throw new Error("services fetch failed");
    const { services } = await response.json();
    if (Array.isArray(services) && services.length > 0) {
      renderServiceCheckboxes(container, services);
      return;
    }
    throw new Error("empty services list");
  } catch (err) {
    renderServiceCheckboxes(container, FALLBACK_SERVICES);
  }
}

const CATEGORY_CONTAINER_IDS = {
  Waxing: "waxing-rows",
  Threading: "threading-rows",
  "Facial & Other": "facial-rows",
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function renderServiceRows(container, items) {
  container.innerHTML = items
    .map((item, index) => {
      const price = (item.price_cents / 100).toFixed(0);
      const rowId = `${container.id}-${index}`;
      return `
        <div class="service-row clickable" data-row-id="${rowId}">
          <div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.duration)}</p></div>
          <div class="price">$${price}</div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".service-row.clickable").forEach((row, index) => {
    row.addEventListener("click", () => openServiceModal(items[index]));
  });
}

async function loadServicesIntoPage() {
  const hasAnyContainer = Object.values(CATEGORY_CONTAINER_IDS).some((id) => document.getElementById(id));
  if (!hasAnyContainer) return;

  let services;
  try {
    const response = await fetch("/api/services");
    if (!response.ok) throw new Error("services fetch failed");
    const data = await response.json();
    if (!Array.isArray(data.services) || data.services.length === 0) throw new Error("empty services list");
    services = data.services;
  } catch (err) {
    services = FALLBACK_SERVICES;
  }

  const groups = groupByCategory(services);
  Object.entries(CATEGORY_CONTAINER_IDS).forEach(([category, containerId]) => {
    const container = document.getElementById(containerId);
    if (container && groups[category]) {
      renderServiceRows(container, groups[category]);
    }
  });
}

/* ---------- Service detail modal ---------- */

function openServiceModal(service) {
  const modal = document.getElementById("service-modal");
  if (!modal) return;

  const price = (service.price_cents / 100).toFixed(0);
  document.getElementById("modal-name").textContent = service.name;
  document.getElementById("modal-duration").textContent = service.duration || "";
  document.getElementById("modal-price").textContent = `$${price}`;
  document.getElementById("modal-description").textContent = service.description || "";

  const addBtn = document.getElementById("modal-add-to-cart");
  addBtn.onclick = () => {
    addToCart(service);
    flashAddedButton(addBtn);
    showToast(`${service.name} added to cart`);
    setTimeout(closeServiceModal, 500);
  };

  modal.classList.add("open");
}

function closeServiceModal() {
  const modal = document.getElementById("service-modal");
  if (modal) modal.classList.remove("open");
}

function setupServiceModal() {
  const modal = document.getElementById("service-modal");
  if (!modal) return;

  document.getElementById("modal-close").addEventListener("click", closeServiceModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeServiceModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeServiceModal();
  });
}

/* ---------- Cart (localStorage) ---------- */

const CART_KEY = "halo_cart";

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const cart = raw ? JSON.parse(raw) : [];
    return Array.isArray(cart) ? cart : [];
  } catch (err) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

function addToCart(service) {
  const cart = getCart();
  const existing = cart.find((item) => item.name === service.name);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id: service.id || null,
      name: service.name,
      price_cents: service.price_cents,
      qty: 1,
    });
  }
  saveCart(cart);
  animateCartIcon();
}

function removeFromCart(name) {
  saveCart(getCart().filter((item) => item.name !== name));
}

function animateCartIcon() {
  const cartLink = document.getElementById("cart-link");
  const badge = document.getElementById("cart-badge");
  if (cartLink) {
    cartLink.classList.remove("bump");
    void cartLink.offsetWidth;
    cartLink.classList.add("bump");
    setTimeout(() => cartLink.classList.remove("bump"), 600);
  }
  if (badge) {
    badge.classList.remove("pop");
    void badge.offsetWidth;
    badge.classList.add("pop");
    setTimeout(() => badge.classList.remove("pop"), 500);
  }
}

function flashAddedButton(btn) {
  if (!btn) return;
  const originalText = btn.textContent;
  btn.textContent = "Added ✓";
  btn.classList.add("added");
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = originalText;
    btn.classList.remove("added");
    btn.disabled = false;
  }, 1200);
}

function updateCartBadge() {
  const badge = document.getElementById("cart-badge");
  if (!badge) return;
  const count = getCart().reduce((sum, item) => sum + item.qty, 0);
  badge.textContent = count;
  badge.classList.toggle("visible", count > 0);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function prefillBookingFromCart() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("fromCart") !== "1") return;

  const cart = getCart();
  if (cart.length === 0) return;

const container = document.getElementById("b-service-checkboxes");
  const notes = document.getElementById("b-notes");
  if (!container || !notes) return;

  cart.slice(0, MAX_SERVICES_PER_BOOKING).forEach((item) => {
    const checkbox = Array.from(container.querySelectorAll('input[type="checkbox"]')).find((cb) => cb.dataset.name === item.name);
    if (checkbox) checkbox.checked = true;
  });
  updateServiceCheckboxLimit();

  const summaryLines = cart.map((item) => `${item.name} (x${item.qty})`).join(", ");
  notes.value = `Requested from cart: ${summaryLines}` + (notes.value ? `\n${notes.value}` : "");

  const formPanel = document.querySelector(".form-panel");
  if (formPanel && !document.getElementById("cart-prefill-note")) {
    const note = document.createElement("div");
    note.id = "cart-prefill-note";
    note.className = "cart-note";
    note.textContent = `Carried over from your cart: ${summaryLines}. We've added these to your notes below — feel free to adjust the Treatment field if needed.`;
    formPanel.prepend(note);
  }
}

/* ---------- Cart page ---------- */

function renderCartPage() {
  const itemsContainer = document.getElementById("cart-items");
  const emptyState = document.getElementById("cart-empty");
  const summary = document.getElementById("cart-summary");
  if (!itemsContainer || !emptyState || !summary) return;

  const cart = getCart();

  if (cart.length === 0) {
    itemsContainer.innerHTML = "";
    emptyState.style.display = "block";
    summary.classList.remove("visible");
    return;
  }

  emptyState.style.display = "none";
  summary.classList.add("visible");

  itemsContainer.innerHTML = cart
    .map((item) => {
      const lineTotal = ((item.price_cents * item.qty) / 100).toFixed(0);
      return `
        <div class="cart-row">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="cart-row-meta">Qty: ${item.qty}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 18px;">
            <div class="price">$${lineTotal}</div>
            <button class="cart-row-remove" data-name="${escapeHtml(item.name)}">Remove</button>
          </div>
        </div>
      `;
    })
    .join("");

  itemsContainer.querySelectorAll(".cart-row-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFromCart(btn.dataset.name);
      renderCartPage();
    });
  });

  const totalCents = cart.reduce((sum, item) => sum + item.price_cents * item.qty, 0);
  document.getElementById("cart-total").textContent = `$${(totalCents / 100).toFixed(0)}`;
}
