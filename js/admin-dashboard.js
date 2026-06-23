function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function formatCents(cents) {
  return `$${((cents || 0) / 100).toFixed(0)}`;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatTime(value) {
  return String(value).slice(0, 5);
}

// bookings.service is stored as "Brow Threading — $35, Back Wax — $55" (1-3 items).
function parseServiceLine(label) {
  const items = String(label)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*?)\s*—\s*\$(\d+)\s*$/);
      return match ? { name: match[1].trim(), priceCents: parseInt(match[2], 10) * 100 } : { name: part, priceCents: 0 };
    });
  const totalCents = items.reduce((sum, item) => sum + item.priceCents, 0);
  return { items, totalCents };
}

async function api(path, options = {}) {
  const response = await fetch(`/api/admin/${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }
  return data;
}

/* ---------- Login ---------- */

async function checkAuthAndLoad() {
  try {
    await api("overview");
    showApp();
  } catch (err) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("admin-app").style.display = "none";
}

function showApp() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("admin-app").style.display = "flex";
  loadSection("dashboard");
}

function setupLogin() {
  const loginBtn = document.getElementById("admin-login-btn");
  const passwordInput = document.getElementById("admin-password");
  const status = document.getElementById("login-status");

  const attempt = async () => {
    status.textContent = "Logging in...";
    status.className = "";
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput.value }),
      });
      if (response.ok) {
        passwordInput.value = "";
        showApp();
      } else {
        const result = await response.json();
        status.textContent = result.error || "Login failed.";
        status.className = "error";
      }
    } catch (err) {
      status.textContent = "Something went wrong.";
      status.className = "error";
    }
  };

  loginBtn.addEventListener("click", attempt);
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attempt();
  });

  document.getElementById("admin-logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    showLogin();
  });
}

/* ---------- Section switching ---------- */

function setupSidebar() {
  document.querySelectorAll(".admin-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-nav-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadSection(btn.dataset.section);
    });
  });
}

function loadSection(name) {
  document.querySelectorAll(".admin-section").forEach((s) => { s.style.display = "none"; });
  document.getElementById(`section-${name}`).style.display = "block";

  if (name === "dashboard") loadDashboard();
  if (name === "appointments") loadAppointments();
  if (name === "clients") loadClients();
  if (name === "services") loadServicesAdmin();
  if (name === "revenue") loadRevenue();
  if (name === "reviews") loadReviews();
  if (name === "settings") loadSettings();
}

/* ---------- Dashboard ---------- */

async function loadDashboard() {
  try {
    const data = await api("overview");
    document.getElementById("stat-total-appointments").textContent = data.totalAppointments;
    document.getElementById("stat-today-appointments").textContent = data.todayAppointments;
    document.getElementById("stat-monthly-revenue").textContent = formatCents(data.monthlyRevenueCents);
    document.getElementById("stat-new-clients").textContent = data.newClientsThisMonth;

    const upcoming = document.getElementById("upcoming-list");
    upcoming.innerHTML = data.upcoming.length === 0
      ? '<p class="admin-empty">No upcoming appointments.</p>'
      : data.upcoming.map((b) => `
          <div class="admin-row-card" style="cursor: default;">
            <div class="admin-row-main">
              <h4>${escapeHtml(b.name)}</h4>
              <div class="admin-row-meta">${escapeHtml(b.service)} · ${formatDate(b.preferred_date)} at ${formatTime(b.preferred_time)}</div>
            </div>
            <span class="status-badge status-${b.status}">${b.status}</span>
          </div>
        `).join("");

    const mostBooked = document.getElementById("most-booked-list");
    mostBooked.innerHTML = data.mostBooked.length === 0
      ? '<p class="admin-empty">No bookings yet this month.</p>'
      : data.mostBooked.map((s) => `
          <div class="admin-row-card" style="cursor: default;">
            <div class="admin-row-main"><h4>${escapeHtml(s.name)}</h4></div>
            <div class="admin-row-meta">${s.count} booking${s.count === 1 ? "" : "s"}</div>
          </div>
        `).join("");
  } catch (err) {
    showToast(err.message);
  }
}

/* ---------- Appointments ---------- */

let appointmentFilters = { status: "", search: "" };

async function loadAppointments() {
  const list = document.getElementById("appointments-list");
  try {
    const params = new URLSearchParams();
    if (appointmentFilters.status) params.set("status", appointmentFilters.status);
    if (appointmentFilters.search) params.set("search", appointmentFilters.search);
    const data = await api(`bookings?${params.toString()}`);

    if (data.bookings.length === 0) {
      list.innerHTML = '<p class="admin-empty">No appointments found.</p>';
      return;
    }

    list.innerHTML = data.bookings.map((b) => {
      const { items, totalCents } = parseServiceLine(b.service);
      const servicesHtml = items
        .map((item) => `<div class="appt-service-line">${escapeHtml(item.name)} <span>${formatCents(item.priceCents)}</span></div>`)
        .join("");
      return `
      <div class="admin-row-card" data-id="${b.id}">
        <div class="admin-row-main">
          <h4>${escapeHtml(b.name)}</h4>
          <div class="admin-row-meta">
            <div class="appt-services-list">
              ${servicesHtml}
              <div class="appt-service-line appt-service-total">Total <span>${formatCents(totalCents)}</span></div>
            </div>
            ${formatDate(b.preferred_date)} at ${formatTime(b.preferred_time)}<br>
            ${escapeHtml(b.phone)} · ${escapeHtml(b.email)}
            ${b.notes ? `<br>Notes: ${escapeHtml(b.notes)}` : ""}
          </div>
        </div>
        <div class="admin-row-actions">
          <select class="status-select" data-id="${b.id}">
            <option value="pending" ${b.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="confirmed" ${b.status === "confirmed" ? "selected" : ""}>Confirmed</option>
            <option value="completed" ${b.status === "completed" ? "selected" : ""}>Completed</option>
            <option value="cancelled" ${b.status === "cancelled" ? "selected" : ""}>Cancelled</option>
          </select>
          <button class="edit-appt-btn" data-id="${b.id}">Edit</button>
        </div>
      </div>
    `;
    }).join("");

    list.querySelectorAll(".status-select").forEach((select) => {
      select.addEventListener("click", (e) => e.stopPropagation());
      select.addEventListener("change", async () => {
        try {
          await api("booking-status", { method: "PUT", body: JSON.stringify({ id: select.dataset.id, status: select.value }) });
          showToast("Status updated");
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    list.querySelectorAll(".edit-appt-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const booking = data.bookings.find((b) => String(b.id) === btn.dataset.id);
        openAppointmentModal(booking);
      });
    });
  } catch (err) {
    list.innerHTML = '<p class="admin-empty">Could not load appointments.</p>';
  }
}

function setupAppointmentFilters() {
  document.getElementById("appt-search").addEventListener("input", (e) => {
    appointmentFilters.search = e.target.value;
    loadAppointments();
  });

  document.querySelectorAll("#status-filter-pills .admin-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#status-filter-pills .admin-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      appointmentFilters.status = pill.dataset.status;
      loadAppointments();
    });
  });

  document.getElementById("new-appointment-btn").addEventListener("click", () => openAppointmentModal(null));
}

function openAppointmentModal(booking) {
  const modal = document.getElementById("appointment-modal");
  document.getElementById("appointment-modal-title").textContent = booking ? "Edit Appointment" : "New Appointment";
  document.getElementById("appt-id").value = booking ? booking.id : "";
  document.getElementById("appt-name").value = booking ? booking.name : "";
  document.getElementById("appt-phone").value = booking ? booking.phone : "";
  document.getElementById("appt-email").value = booking ? booking.email : "";
  document.getElementById("appt-service").value = booking ? booking.service : "";
  document.getElementById("appt-date").value = booking ? booking.preferred_date.slice(0, 10) : "";
  document.getElementById("appt-time").value = booking ? formatTime(booking.preferred_time) : "";
  document.getElementById("appt-notes").value = booking ? (booking.notes || "") : "";
  document.getElementById("appt-name").disabled = !!booking;
  document.getElementById("appt-phone").disabled = !!booking;
  document.getElementById("appt-email").disabled = !!booking;
  document.getElementById("appointment-modal-status").textContent = "";
  modal.classList.add("open");
}

function setupAppointmentModal() {
  document.getElementById("appointment-modal-close").addEventListener("click", () => {
    document.getElementById("appointment-modal").classList.remove("open");
  });

  document.getElementById("appointment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("appointment-modal-status");
    const id = document.getElementById("appt-id").value;

    const payload = {
      name: document.getElementById("appt-name").value,
      phone: document.getElementById("appt-phone").value,
      email: document.getElementById("appt-email").value,
      service: document.getElementById("appt-service").value,
      date: document.getElementById("appt-date").value,
      time: document.getElementById("appt-time").value,
      notes: document.getElementById("appt-notes").value,
    };

    try {
      if (id) {
        payload.id = id;
        await api("booking-update", { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("booking-create", { method: "POST", body: JSON.stringify(payload) });
      }
      document.getElementById("appointment-modal").classList.remove("open");
      showToast("Appointment saved");
      loadAppointments();
    } catch (err) {
      status.textContent = err.message;
      status.className = "error";
    }
  });
}

/* ---------- Clients ---------- */

async function loadClients(search) {
  const list = document.getElementById("clients-list");
  try {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    const data = await api(`clients${params}`);

    if (data.clients.length === 0) {
      list.innerHTML = '<p class="admin-empty">No clients found.</p>';
      return;
    }

    list.innerHTML = data.clients.map((c) => `
      <div class="admin-row-card" data-id="${c.id}">
        <div class="admin-row-main">
          <h4>${escapeHtml(c.name)}</h4>
          <div class="admin-row-meta">
            ${escapeHtml(c.email || "")} ${c.phone ? "· " + escapeHtml(c.phone) : ""}<br>
            ${c.appointment_count} appointment${c.appointment_count === "1" ? "" : "s"}
            ${c.last_visit ? ` · Last visit ${formatDate(c.last_visit)}` : ""}
          </div>
        </div>
      </div>
    `).join("");

    list.querySelectorAll(".admin-row-card").forEach((card) => {
      card.addEventListener("click", () => openClientDetail(card.dataset.id));
    });
  } catch (err) {
    list.innerHTML = '<p class="admin-empty">Could not load clients.</p>';
  }
}

async function openClientDetail(id) {
  const panel = document.getElementById("client-detail-panel");
  panel.style.display = "block";
  panel.innerHTML = '<p class="admin-empty">Loading...</p>';

  try {
    const data = await api(`client-detail?id=${id}`);
    const client = data.client;

    panel.innerHTML = `
      <h3 class="admin-panel-title">${escapeHtml(client.name)}</h3>
      <div class="admin-row-meta" style="margin-bottom: 18px;">
        ${escapeHtml(client.email || "")}<br>${escapeHtml(client.phone || "")}
      </div>
      <div class="form-group">
        <label>Treatment Notes</label>
        <textarea id="client-notes-input" rows="4">${escapeHtml(client.notes || "")}</textarea>
      </div>
      <button class="btn btn-solid" id="save-client-notes-btn">Save Notes</button>
      <div id="client-notes-status"></div>
      <h4 style="margin: 26px 0 12px; font-size: 0.95rem; color: #b8b0a0; text-transform: uppercase; letter-spacing: 0.5px;">Booking History</h4>
      ${data.bookings.length === 0
        ? '<p class="admin-empty">No bookings yet.</p>'
        : data.bookings.map((b) => `
            <div class="admin-row-card" style="cursor: default;">
              <div class="admin-row-main">
                <h4>${escapeHtml(b.service)}</h4>
                <div class="admin-row-meta">${formatDate(b.preferred_date)} at ${formatTime(b.preferred_time)}</div>
              </div>
              <span class="status-badge status-${b.status}">${b.status}</span>
            </div>
          `).join("")}
    `;

    document.getElementById("save-client-notes-btn").addEventListener("click", async () => {
      const notesStatus = document.getElementById("client-notes-status");
      try {
        await api("client-notes", {
          method: "PUT",
          body: JSON.stringify({ id, notes: document.getElementById("client-notes-input").value }),
        });
        notesStatus.textContent = "Saved.";
        notesStatus.className = "success";
      } catch (err) {
        notesStatus.textContent = err.message;
        notesStatus.className = "error";
      }
    });
  } catch (err) {
    panel.innerHTML = '<p class="admin-empty">Could not load client.</p>';
  }
}

function setupClientSearch() {
  document.getElementById("client-search").addEventListener("input", (e) => loadClients(e.target.value));
}

/* ---------- Services ---------- */

async function loadServicesAdmin() {
  const list = document.getElementById("services-admin-list");
  try {
    const data = await api("services-admin");
    const groups = {};
    data.services.forEach((s) => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    });

    list.innerHTML = Object.entries(groups).map(([category, services]) => `
      <h3 class="admin-panel-title" style="margin-top: 24px;">${escapeHtml(category)}</h3>
      ${services.map((s) => `
        <div class="admin-row-card" style="cursor: default;">
          <div class="admin-row-main">
            <h4>${escapeHtml(s.name)} ${s.is_featured ? "&#11088;" : ""} ${!s.is_active ? '<span class="status-badge status-cancelled">Inactive</span>' : ""}</h4>
            <div class="admin-row-meta">${escapeHtml(s.duration)} · $${(s.price_cents / 100).toFixed(0)}</div>
          </div>
          <div class="admin-row-actions">
            <button class="edit-service-btn" data-id="${s.id}">Edit</button>
            <button class="delete-service-btn" data-id="${s.id}">Delete</button>
          </div>
        </div>
      `).join("")}
    `).join("");

    list.querySelectorAll(".edit-service-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const service = data.services.find((s) => String(s.id) === btn.dataset.id);
        openServiceModal(service);
      });
    });

    list.querySelectorAll(".delete-service-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this service?")) return;
        try {
          await api(`services-admin?id=${btn.dataset.id}`, { method: "DELETE" });
          showToast("Service deleted");
          loadServicesAdmin();
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  } catch (err) {
    list.innerHTML = '<p class="admin-empty">Could not load services.</p>';
  }
}

function openServiceModal(service) {
  const modal = document.getElementById("service-edit-modal");
  document.getElementById("service-edit-modal-title").textContent = service ? "Edit Service" : "Add Service";
  document.getElementById("svc-id").value = service ? service.id : "";
  document.getElementById("svc-category").value = service ? service.category : "Waxing";
  document.getElementById("svc-name").value = service ? service.name : "";
  document.getElementById("svc-duration").value = service ? service.duration : "";
  document.getElementById("svc-price").value = service ? Math.round(service.price_cents / 100) : "";
  document.getElementById("svc-description").value = service ? (service.description || "") : "";
  document.getElementById("svc-featured").checked = service ? service.is_featured : false;
  document.getElementById("svc-active").checked = service ? service.is_active : true;
  document.getElementById("service-edit-status").textContent = "";
  modal.classList.add("open");
}

function setupServiceModal() {
  document.getElementById("service-edit-modal-close").addEventListener("click", () => {
    document.getElementById("service-edit-modal").classList.remove("open");
  });

  document.getElementById("new-service-btn").addEventListener("click", () => openServiceModal(null));

  document.getElementById("service-edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("service-edit-status");
    const id = document.getElementById("svc-id").value;

    const payload = {
      category: document.getElementById("svc-category").value,
      name: document.getElementById("svc-name").value,
      duration: document.getElementById("svc-duration").value,
      priceCents: Math.round(parseFloat(document.getElementById("svc-price").value) * 100),
      description: document.getElementById("svc-description").value,
      isFeatured: document.getElementById("svc-featured").checked,
      isActive: document.getElementById("svc-active").checked,
    };

    try {
      if (id) {
        payload.id = id;
        await api("services-admin", { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("services-admin", { method: "POST", body: JSON.stringify(payload) });
      }
      document.getElementById("service-edit-modal").classList.remove("open");
      showToast("Service saved");
      loadServicesAdmin();
    } catch (err) {
      status.textContent = err.message;
      status.className = "error";
    }
  });
}

/* ---------- Revenue ---------- */

async function loadRevenue() {
  try {
    const data = await api("revenue");
    document.getElementById("revenue-all-time").textContent = formatCents(data.allTimeCents);
    document.getElementById("revenue-this-month").textContent = formatCents(data.thisMonthCents);
    document.getElementById("revenue-last-month").textContent = formatCents(data.lastMonthCents);

    const chart = document.getElementById("revenue-chart");

    // Always show all 30 days, even ones with no completed revenue, so the
    // chart reads as a continuous timeline rather than only the active days.
    const byDate = {};
    data.daily.forEach((d) => { byDate[d.date] = d.cents; });
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, cents: byDate[key] || 0 });
    }

    const max = Math.max(...days.map((d) => d.cents), 1);
    const width = 900;
    const height = 260;
    const topPad = 30;
    const bottomPad = 36;
    const barAreaHeight = height - topPad - bottomPad;
    const slot = width / days.length;
    const barWidth = Math.max(slot - 6, 4);

    const bars = days.map((d, i) => {
      const barHeight = d.cents > 0 ? (d.cents / max) * barAreaHeight : 0;
      const x = i * slot + (slot - barWidth) / 2;
      const y = topPad + barAreaHeight - barHeight;
      const dayNum = parseInt(d.date.slice(8, 10), 10);
      const showDateLabel = dayNum % 3 === 1 || i === days.length - 1;
      const valueLabel = d.cents > 0
        ? `<text class="revenue-bar-value" x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle">${formatCents(d.cents)}</text>`
        : "";
      const dateLabel = showDateLabel
        ? `<text class="revenue-bar-date" x="${x + barWidth / 2}" y="${height - 14}" text-anchor="middle">${dayNum}</text>`
        : "";
      return `
        <rect class="revenue-bar" x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, d.cents > 0 ? 3 : 0)}" rx="3">
          <title>${d.date}: ${formatCents(d.cents)}</title>
        </rect>
        ${valueLabel}
        ${dateLabel}
      `;
    }).join("");

    const baseline = `<line x1="0" y1="${topPad + barAreaHeight}" x2="${width}" y2="${topPad + barAreaHeight}" class="revenue-baseline"/>`;

    chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 260px;">${baseline}${bars}</svg>`;
  } catch (err) {
    showToast(err.message);
  }
}

/* ---------- Reviews ---------- */

async function loadReviews() {
  const pendingList = document.getElementById("reviews-pending-list");
  const approvedList = document.getElementById("reviews-approved-list");
  try {
    const data = await api("reviews");
    const pending = data.reviews.filter((r) => !r.is_approved);
    const approved = data.reviews.filter((r) => r.is_approved);

    pendingList.innerHTML = pending.length === 0
      ? '<p class="admin-empty">No reviews waiting for approval.</p>'
      : pending.map((r) => `
          <div class="admin-row-card" style="cursor: default;">
            <div class="admin-row-main">
              <h4>${escapeHtml(r.client_name)} — ${"&#9733;".repeat(r.rating)}${"&#9734;".repeat(5 - r.rating)}</h4>
              <div class="admin-row-meta">${escapeHtml(r.comment)}</div>
            </div>
            <div class="admin-row-actions">
              <button class="approve-review-btn" data-id="${r.id}">Approve</button>
              <button class="delete-review-btn" data-id="${r.id}">Reject</button>
            </div>
          </div>
        `).join("");

    approvedList.innerHTML = approved.length === 0
      ? '<p class="admin-empty">No approved reviews yet.</p>'
      : approved.map((r) => `
          <div class="admin-row-card" style="cursor: default;">
            <div class="admin-row-main">
              <h4>${escapeHtml(r.client_name)} — ${"&#9733;".repeat(r.rating)}${"&#9734;".repeat(5 - r.rating)}</h4>
              <div class="admin-row-meta">${escapeHtml(r.comment)}</div>
            </div>
            <div class="admin-row-actions">
              <button class="feature-review-btn" data-id="${r.id}" data-featured="${r.is_featured}">${r.is_featured ? "Unfeature" : "Feature"}</button>
              <button class="delete-review-btn" data-id="${r.id}">Delete</button>
            </div>
          </div>
        `).join("");

    document.querySelectorAll(".approve-review-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await api("reviews", { method: "PUT", body: JSON.stringify({ id: btn.dataset.id, isApproved: true }) });
        showToast("Review approved");
        loadReviews();
      });
    });

    document.querySelectorAll(".feature-review-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const newFeatured = btn.dataset.featured !== "true";
        await api("reviews", { method: "PUT", body: JSON.stringify({ id: btn.dataset.id, isFeatured: newFeatured }) });
        showToast(newFeatured ? "Featured" : "Unfeatured");
        loadReviews();
      });
    });

    document.querySelectorAll(".delete-review-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await api(`reviews?id=${btn.dataset.id}`, { method: "DELETE" });
        showToast("Removed");
        loadReviews();
      });
    });
  } catch (err) {
    pendingList.innerHTML = '<p class="admin-empty">Could not load reviews.</p>';
  }
}

/* ---------- Settings ---------- */

async function loadSettings() {
  try {
    const data = await api("settings");
    const general = data.settings.general || {};
    const hours = data.settings.business_hours || {};

    document.getElementById("settings-phone").value = general.phone || "";
    document.getElementById("settings-email").value = general.email || "";
    document.getElementById("settings-address").value = general.address || "";
    document.getElementById("settings-hours-weekday").value = hours.mon_fri || "";
    document.getElementById("settings-hours-weekend").value = hours.sat_sun || "";
  } catch (err) {
    showToast(err.message);
  }
}

function setupSettingsForms() {
  document.getElementById("general-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("general-settings-status");
    try {
      await api("settings", {
        method: "PUT",
        body: JSON.stringify({
          key: "general",
          value: {
            phone: document.getElementById("settings-phone").value,
            email: document.getElementById("settings-email").value,
            address: document.getElementById("settings-address").value,
          },
        }),
      });
      status.textContent = "Saved.";
      status.className = "success";
    } catch (err) {
      status.textContent = err.message;
      status.className = "error";
    }
  });

  document.getElementById("hours-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("hours-settings-status");
    try {
      await api("settings", {
        method: "PUT",
        body: JSON.stringify({
          key: "business_hours",
          value: {
            mon_fri: document.getElementById("settings-hours-weekday").value,
            sat_sun: document.getElementById("settings-hours-weekend").value,
          },
        }),
      });
      status.textContent = "Saved.";
      status.className = "success";
    } catch (err) {
      status.textContent = err.message;
      status.className = "error";
    }
  });
}

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", () => {
  setupLogin();
  setupSidebar();
  setupAppointmentFilters();
  setupAppointmentModal();
  setupClientSearch();
  setupServiceModal();
  setupSettingsForms();
  checkAuthAndLoad();
});
