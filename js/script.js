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

  loadServicesIntoSelect();
  loadServicesIntoPage();
});

const FALLBACK_SERVICES = [
  { category: "Waxing", name: "Back Wax", price_cents: 5500 },
  { category: "Waxing", name: "Bikini Line Wax", price_cents: 4000 },
  { category: "Waxing", name: "Full Arm Wax", price_cents: 4500 },
  { category: "Waxing", name: "Full Body Wax", price_cents: 15000 },
  { category: "Waxing", name: "Full Legs Wax", price_cents: 5000 },
  { category: "Waxing", name: "Half Arms Wax", price_cents: 3000 },
  { category: "Waxing", name: "Half Legs Wax", price_cents: 3500 },
  { category: "Waxing", name: "Stomach Wax", price_cents: 3000 },
  { category: "Waxing", name: "Under Arm Wax", price_cents: 2000 },
  { category: "Waxing", name: "Underarms Wax", price_cents: 2000 },
  { category: "Threading", name: "Beard Line Threading", price_cents: 3000 },
  { category: "Threading", name: "Brow Threading", price_cents: 3500 },
  { category: "Threading", name: "Chin Threading", price_cents: 1500 },
  { category: "Threading", name: "Forehead Threading", price_cents: 2000 },
  { category: "Threading", name: "Full Face Threading", price_cents: 5500 },
  { category: "Threading", name: "Sideburns Threading", price_cents: 3000 },
  { category: "Threading", name: "Upper Lip Threading", price_cents: 1000 },
  { category: "Facial & Other", name: "Hydrating Glow Facial", price_cents: 15000 },
  { category: "Facial & Other", name: "Henna Design", price_cents: 2500 },
  { category: "Bundle", name: "Brow & Lip Combo", price_cents: 4000 },
  { category: "Bundle", name: "Smooth Legs & Bikini", price_cents: 8000 },
  { category: "Bundle", name: "Full Face Refresh", price_cents: 19000 },
];

function groupByCategory(services) {
  const groups = {};
  services.forEach((service) => {
    if (!groups[service.category]) groups[service.category] = [];
    groups[service.category].push(service);
  });
  return groups;
}

function renderServiceOptions(select, services) {
  const groups = groupByCategory(services);
  select.innerHTML = '<option value="">Select a treatment</option>';
  Object.entries(groups).forEach(([category, items]) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = category === "Bundle" ? "Bundles" : category;
    items.forEach((item) => {
      const option = document.createElement("option");
      const price = (item.price_cents / 100).toFixed(0);
      option.textContent = `${item.name} — $${price}`;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  });
}

async function loadServicesIntoSelect() {
  const select = document.getElementById("b-service");
  if (!select) return;

  try {
    const response = await fetch("/api/services");
    if (!response.ok) throw new Error("services fetch failed");
    const { services } = await response.json();
    if (Array.isArray(services) && services.length > 0) {
      renderServiceOptions(select, services);
      return;
    }
    throw new Error("empty services list");
  } catch (err) {
    renderServiceOptions(select, FALLBACK_SERVICES);
  }
}

const CATEGORY_CONTAINER_IDS = {
  Waxing: "waxing-rows",
  Threading: "threading-rows",
  "Facial & Other": "facial-rows",
};

function renderServiceRows(container, items) {
  container.innerHTML = items
    .map((item) => {
      const price = (item.price_cents / 100).toFixed(0);
      return `
        <div class="service-row">
          <div><h3>${item.name}</h3><p>${item.duration}</p></div>
          <div class="price">$${price}</div>
        </div>
      `;
    })
    .join("");
}

async function loadServicesIntoPage() {
  const hasAnyContainer = Object.values(CATEGORY_CONTAINER_IDS).some((id) => document.getElementById(id));
  if (!hasAnyContainer) return;

  try {
    const response = await fetch("/api/services");
    if (!response.ok) throw new Error("services fetch failed");
    const { services } = await response.json();
    if (!Array.isArray(services) || services.length === 0) throw new Error("empty services list");

    const groups = groupByCategory(services);
    Object.entries(CATEGORY_CONTAINER_IDS).forEach(([category, containerId]) => {
      const container = document.getElementById(containerId);
      if (container && groups[category]) {
        renderServiceRows(container, groups[category]);
      }
    });
  } catch (err) {
    // Leave the hardcoded fallback markup already in the page untouched.
  }
}
