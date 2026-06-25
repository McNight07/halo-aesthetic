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
  refreshMessagesBadge();
  refreshFeedbackBadge();
  loadNotifications();
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

let appointmentsPollTimer = null;

function loadSection(name) {
  document.querySelectorAll(".admin-section").forEach((s) => { s.style.display = "none"; });
  document.getElementById(`section-${name}`).style.display = "block";

  clearInterval(appointmentsPollTimer);
  appointmentsPollTimer = null;

  if (name === "dashboard") loadDashboard();
  if (name === "appointments") {
    loadAppointments();
    loadWeeklyCalendar();
    appointmentsPollTimer = setInterval(loadAppointments, 15000);
  }
  if (name === "clients") loadClients();
  if (name === "services") loadServicesAdmin();
  if (name === "revenue") loadRevenue();
  if (name === "reviews") loadReviews();
  if (name === "messages") loadMessages();
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
              <div class="admin-row-meta">
                ${escapeHtml(b.service)} ·
                <span class="appt-date-badge">${formatDate(b.preferred_date)}</span>
                <span class="appt-time-badge">${formatTime(b.preferred_time)}</span>
              </div>
            </div>
            <span class="status-badge status-${b.status}">${b.status}</span>
          </div>
        `).join("");

    const mostBooked = document.getElementById("most-booked-list");
    mostBooked.innerHTML = data.mostBooked.length === 0
      ? '<p class="admin-empty">No bookings yet this month.</p>'
      : data.mostBooked.map((s) => `
          <div class="admin-row-card most-booked-row" data-name="${escapeHtml(s.name)}" data-count="${s.count}">
            <div class="admin-row-main"><h4>${escapeHtml(s.name)}</h4></div>
            <div class="admin-row-meta">${s.count} booking${s.count === 1 ? "" : "s"}</div>
          </div>
        `).join("");

    mostBooked.querySelectorAll(".most-booked-row").forEach((row) => {
      row.addEventListener("click", () => openServiceDetail(row.dataset.name, row.dataset.count));
    });
  } catch (err) {
    showToast(err.message);
  }
}

function setupDashboardClicks() {
  const todayKey = () => new Date().toISOString().slice(0, 10);

  document.getElementById("stat-card-today").addEventListener("click", () => openDayDetail(todayKey()));
  document.getElementById("panel-upcoming").addEventListener("click", (e) => {
    if (e.target.closest(".admin-row-card")) return;
    openDayDetail(todayKey());
  });

  document.getElementById("stat-card-total").addEventListener("click", () => {
    document.querySelector('.admin-nav-item[data-section="appointments"]').click();
  });
  document.getElementById("stat-card-revenue").addEventListener("click", () => {
    document.querySelector('.admin-nav-item[data-section="revenue"]').click();
  });
  document.getElementById("stat-card-clients").addEventListener("click", () => {
    document.querySelector('.admin-nav-item[data-section="clients"]').click();
  });

  document.getElementById("service-detail-modal-close").addEventListener("click", () => {
    document.getElementById("service-detail-modal").classList.remove("open");
  });
}

async function openServiceDetail(name, count) {
  const modal = document.getElementById("service-detail-modal");
  const title = document.getElementById("service-detail-title");
  const body = document.getElementById("service-detail-body");

  title.textContent = name;
  body.innerHTML = "Loading...";
  modal.classList.add("open");

  try {
    const data = await api("services-admin");
    const service = data.services.find((s) => s.name === name);

    if (!service) {
      body.innerHTML = `<div class="admin-row-meta">${count} booking${count === "1" ? "" : "s"} this month · full service details not found (it may have been removed).</div>`;
      return;
    }

    body.innerHTML = `
      <div class="admin-row-meta" style="margin-bottom: 14px;">
        <span class="appt-date-badge">${escapeHtml(service.category)}</span>
        <span class="appt-time-badge">${escapeHtml(service.duration)}</span>
        ${!service.is_active ? '<span class="status-badge status-cancelled">Inactive</span>' : ""}
        ${service.is_featured ? '<span class="status-badge status-confirmed">Featured</span>' : ""}
      </div>
      <div class="admin-row-meta" style="font-size: 1.1rem; color: #f3efe7; margin-bottom: 10px;">$${(service.price_cents / 100).toFixed(0)}</div>
      ${service.description ? `<div class="admin-row-meta" style="margin-bottom: 14px;">${escapeHtml(service.description)}</div>` : ""}
      <div class="admin-row-meta">${count} booking${count === "1" ? "" : "s"} this month</div>
    `;
  } catch (err) {
    body.innerHTML = '<p class="admin-empty">Could not load service details.</p>';
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
        .map((item) => `<div class="appt-service-line"><span class="appt-service-name">${escapeHtml(item.name)}</span> <span class="price-value">${formatCents(item.priceCents)}</span></div>`)
        .join("");
      const modifiedBadge = b.needs_review
        ? '<span class="urgent-badge">Requires Review</span><span class="review-badge">Updated by Client</span>'
        : b.last_modified_by === "client"
          ? '<span class="review-badge">Updated by Client</span>'
          : "";
      return `
      <div class="admin-row-card" data-id="${b.id}">
        <div class="admin-row-main">
          <h4>${escapeHtml(b.name)} ${modifiedBadge}</h4>
          <div class="admin-row-meta">
            <div class="appt-services-list">
              ${servicesHtml}
              <div class="appt-service-line appt-service-total">Total <span class="price-value">${formatCents(totalCents)}</span></div>
            </div>
            <span class="appt-date-badge">${formatDate(b.preferred_date)}</span>
            <span class="appt-time-badge">${formatTime(b.preferred_time)}</span>
            <span class="reminder-badge reminder-${b.reminder_status || "scheduled"}">Reminder: ${(b.reminder_status || "scheduled").replace(/^./, (c) => c.toUpperCase())}</span><br>
            ${escapeHtml(b.phone)} · ${escapeHtml(b.email)}
            ${b.notes ? `<br>Notes: ${escapeHtml(b.notes)}` : ""}
            ${b.client_modified_at ? `<br><span class="admin-time">Client last modified: ${formatDateTime(b.client_modified_at)}</span>` : ""}
            <br><span class="admin-time">Last updated: ${formatDateTime(b.updated_at || b.created_at)}</span>
          </div>
        </div>
        <div class="admin-row-actions">
          <select class="status-select" data-id="${b.id}">
            <option value="pending" ${b.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="confirmed" ${b.status === "confirmed" ? "selected" : ""}>Confirmed</option>
            <option value="completed" ${b.status === "completed" ? "selected" : ""}>Completed</option>
            <option value="cancelled" ${b.status === "cancelled" ? "selected" : ""}>Cancelled</option>
          </select>
          <button class="email-appt-btn" data-id="${b.id}">E-Mail</button>
          <button class="send-reminder-btn" data-id="${b.id}">Send Reminder Now</button>
          <button class="history-appt-btn" data-id="${b.id}">View History</button>
          <button class="edit-appt-btn" data-id="${b.id}">Edit</button>
          <button class="delete-appt-btn" data-id="${b.id}">Delete</button>
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

    list.querySelectorAll(".history-appt-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openAppointmentHistoryModal(btn.dataset.id);
      });
    });

    list.querySelectorAll(".email-appt-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const booking = data.bookings.find((b) => String(b.id) === btn.dataset.id);
        if (booking) openEmailComposeModal({ clientId: booking.client_id, bookingId: booking.id, email: booking.email, name: booking.name });
      });
    });

    list.querySelectorAll(".send-reminder-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        btn.textContent = "Sending...";
        try {
          await api("booking-send-reminder", { method: "POST", body: JSON.stringify({ id: btn.dataset.id }) });
          showToast("Reminder email sent");
          loadAppointments();
        } catch (err) {
          showToast(err.message || "Could not send the reminder.");
          btn.disabled = false;
          btn.textContent = "Send Reminder Now";
        }
      });
    });

    list.querySelectorAll(".delete-appt-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Delete this appointment? This cannot be undone.")) return;
        try {
          await api(`booking-delete?id=${btn.dataset.id}`, { method: "DELETE" });
          showToast("Appointment deleted");
          loadAppointments();
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  } catch (err) {
    list.innerHTML = '<p class="admin-empty">Could not load appointments.</p>';
  }
}

/* ---------- Weekly appointments calendar ---------- */

const WEEKDAY_FULL_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

let weekViewStart = getMonday(new Date());

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

async function loadWeeklyCalendar() {
  const grid = document.getElementById("weekly-calendar");
  const label = document.getElementById("week-range-label");
  if (!grid || !label) return;

  const weekEnd = new Date(weekViewStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  label.textContent = `${formatDate(dateKey(weekViewStart))} – ${formatDate(dateKey(weekEnd))}`;

  let bookings = [];
  try {
    const data = await api(`bookings?from=${dateKey(weekViewStart)}&to=${dateKey(weekEnd)}`);
    bookings = data.bookings || [];
  } catch (err) {
    grid.innerHTML = '<p class="admin-empty">Could not load this week\'s appointments.</p>';
    return;
  }

  const todayKey = dateKey(new Date());

  grid.innerHTML = WEEKDAY_FULL_NAMES.map((dayName, i) => {
    const day = new Date(weekViewStart);
    day.setDate(day.getDate() + i);
    const key = dateKey(day);
    const dayBookings = bookings
      .filter((b) => b.preferred_date.slice(0, 10) === key)
      .sort((a, b) => a.preferred_time.localeCompare(b.preferred_time));

    const apptsHtml = dayBookings.length === 0
      ? '<div class="weekly-day-empty">No appointments</div>'
      : dayBookings.map((b) => `
          <div class="weekly-appt" data-id="${b.id}">
            <span class="weekly-appt-time">${formatTime(b.preferred_time)}</span>
            <span class="weekly-appt-name">${escapeHtml(b.name)}</span>
          </div>
        `).join("");

    return `
      <div class="weekly-day ${key === todayKey ? "today" : ""}" data-date="${key}" data-day-name="${dayName}">
        <div class="weekly-day-header">
          <div class="weekly-day-name">${dayName.slice(0, 3)}</div>
          <div class="weekly-day-date">${day.getDate()}</div>
        </div>
        ${apptsHtml}
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".weekly-appt").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const booking = bookings.find((b) => String(b.id) === el.dataset.id);
      if (booking) openAppointmentModal(booking);
    });
  });

  grid.querySelectorAll(".weekly-day").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.date;
      const dayBookings = bookings
        .filter((b) => b.preferred_date.slice(0, 10) === key)
        .sort((a, b) => a.preferred_time.localeCompare(b.preferred_time));
      openWeekDayModal(el.dataset.dayName, key, dayBookings);
    });
  });
}

function openWeekDayModal(dayName, dateKeyValue, dayBookings) {
  const modal = document.getElementById("week-day-modal");
  const title = document.getElementById("week-day-modal-title");
  const list = document.getElementById("week-day-modal-list");

  title.textContent = `${dayName}, ${formatDate(dateKeyValue)}`;

  list.innerHTML = dayBookings.length === 0
    ? '<div class="admin-empty">No appointments scheduled for this day.</div>'
    : dayBookings.map((b) => {
        const { items, totalCents } = parseServiceLine(b.service);
        const serviceNames = items.map((item) => item.name).join(", ");
        return `
          <div class="admin-row-card week-day-modal-item" data-id="${b.id}" style="cursor: pointer;">
            <div class="admin-row-main">
              <h4>${escapeHtml(b.name)}</h4>
              <div class="admin-row-meta">${escapeHtml(serviceNames)}</div>
              <div class="admin-row-meta" style="margin-top: 6px;">
                <span class="appt-date-badge">${formatDate(dateKeyValue)}</span>
                <span class="appt-time-badge">${formatTime(b.preferred_time)}</span>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
              <span class="price-value">${formatCents(totalCents)}</span>
              <span class="status-badge status-${b.status}">${b.status}</span>
            </div>
          </div>
        `;
      }).join("");

  list.querySelectorAll(".week-day-modal-item").forEach((el) => {
    el.addEventListener("click", () => {
      modal.classList.remove("open");
      highlightAppointmentInList(el.dataset.id);
    });
  });

  modal.classList.add("open");
}

async function highlightAppointmentInList(id) {
  appointmentFilters.status = "";
  appointmentFilters.search = "";
  const searchInput = document.getElementById("appt-search");
  if (searchInput) searchInput.value = "";
  document.querySelectorAll("#status-filter-pills .admin-pill").forEach((p) => {
    p.classList.toggle("active", p.dataset.status === "");
  });

  await loadAppointments();

  const card = document.querySelector(`#appointments-list .admin-row-card[data-id="${id}"]`);
  if (!card) return;

  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("highlight-pulse");
  setTimeout(() => card.classList.remove("highlight-pulse"), 2000);
}

function setupWeekNav() {
  document.getElementById("week-prev-btn").addEventListener("click", () => {
    weekViewStart.setDate(weekViewStart.getDate() - 7);
    loadWeeklyCalendar();
  });
  document.getElementById("week-next-btn").addEventListener("click", () => {
    weekViewStart.setDate(weekViewStart.getDate() + 7);
    loadWeeklyCalendar();
  });
  document.getElementById("week-day-modal-close").addEventListener("click", () => {
    document.getElementById("week-day-modal").classList.remove("open");
  });
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

let cachedServiceOptions = null;

async function getServiceOptions() {
  if (cachedServiceOptions) return cachedServiceOptions;
  const data = await api("services-admin");
  cachedServiceOptions = data.services
    .filter((s) => s.is_active)
    .map((s) => ({ label: `${s.name} — $${(s.price_cents / 100).toFixed(0)}`, name: s.name, priceCents: s.price_cents }));
  return cachedServiceOptions;
}

function populateServiceSelects(selectedItems) {
  getServiceOptions().then((options) => {
    [1, 2, 3].forEach((n) => {
      const select = document.getElementById(`appt-service-${n}`);
      const selected = selectedItems[n - 1];
      const optionsHtml = options
        .map((opt) => `<option value="${escapeHtml(opt.label)}" ${selected && selected.name === opt.name ? "selected" : ""}>${escapeHtml(opt.label)}</option>`)
        .join("");
      select.innerHTML = `<option value="">${n === 1 ? "Select a service…" : "None"}</option>${optionsHtml}`;
      if (selected && !options.some((opt) => opt.name === selected.name)) {
        select.innerHTML += `<option value="${escapeHtml(selected.name)} — $${Math.round(selected.priceCents / 100)}" selected>${escapeHtml(selected.name)} (inactive) — $${Math.round(selected.priceCents / 100)}</option>`;
      }
    });
  });
}

function openAppointmentModal(booking) {
  const modal = document.getElementById("appointment-modal");
  document.getElementById("appointment-modal-title").textContent = booking ? "Edit Appointment" : "New Appointment";
  document.getElementById("appt-id").value = booking ? booking.id : "";
  document.getElementById("appt-name").value = booking ? booking.name : "";
  document.getElementById("appt-phone").value = booking ? booking.phone : "";
  document.getElementById("appt-email").value = booking ? booking.email : "";
  document.getElementById("appt-date").value = booking ? booking.preferred_date.slice(0, 10) : "";
  document.getElementById("appt-time").value = booking ? formatTime(booking.preferred_time) : "";
  document.getElementById("appt-notes").value = booking ? (booking.notes || "") : "";
  document.getElementById("appointment-modal-status").textContent = "";
  populateServiceSelects(booking ? parseServiceLine(booking.service).items : []);
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

    const service = [1, 2, 3]
      .map((n) => document.getElementById(`appt-service-${n}`).value)
      .filter(Boolean)
      .join(", ");

    if (!service) {
      status.textContent = "Select at least one service.";
      status.className = "error";
      return;
    }

    const payload = {
      name: document.getElementById("appt-name").value,
      phone: document.getElementById("appt-phone").value,
      email: document.getElementById("appt-email").value,
      service,
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

/* ---------- Email composer ---------- */

const EMAIL_TEMPLATES = {
  reminder: {
    subject: "Reminder: Your Upcoming Appointment at Halo Aesthetic",
    body: (name) => `<p>Hi ${name},</p><p>Just a friendly reminder about your upcoming appointment with us. We're looking forward to seeing you!</p><p>If you need to reschedule, just reply to this email or give us a call.</p>`,
  },
  confirmation: {
    subject: "Your Appointment is Confirmed — Halo Aesthetic",
    body: (name) => `<p>Hi ${name},</p><p>This confirms your appointment with us. Here's a quick summary:</p><ul><li>Service: </li><li>Date: </li><li>Time: </li></ul><p>We can't wait to see you!</p>`,
  },
  reschedule: {
    subject: "Let's Find a New Time — Halo Aesthetic",
    body: (name) => `<p>Hi ${name},</p><p>We need to reschedule your upcoming appointment. Could you let us know a few times that work for you, and we'll find the best fit?</p><p>Sorry for any inconvenience — we appreciate your flexibility.</p>`,
  },
  cancellation: {
    subject: "Your Appointment Has Been Cancelled — Halo Aesthetic",
    body: (name) => `<p>Hi ${name},</p><p>This is to confirm that your appointment has been cancelled. If you'd like to rebook, just reply to this email or call us at (303) 727-0746.</p><p>We hope to see you again soon.</p>`,
  },
  thankyou: {
    subject: "Thank You for Visiting Halo Aesthetic",
    body: (name) => `<p>Hi ${name},</p><p>Thank you so much for visiting us — it was a pleasure having you in the studio. We hope you're loving your results!</p><p>If you have a moment, we'd love to hear your feedback.</p>`,
  },
};

function openEmailComposeModal(target) {
  const modal = document.getElementById("email-compose-modal");
  document.getElementById("email-client-id").value = target.clientId || "";
  document.getElementById("email-booking-id").value = target.bookingId || "";
  document.getElementById("email-to").value = target.email || "";
  document.getElementById("email-to").dataset.name = target.name || "";
  document.getElementById("email-template").value = "";
  document.getElementById("email-subject").value = "";
  document.getElementById("email-body").innerHTML = "";
  document.getElementById("email-compose-status").textContent = "";
  document.getElementById("email-compose-status").className = "";
  modal.classList.add("open");
}

function setupEmailComposeModal() {
  const closeModal = () => document.getElementById("email-compose-modal").classList.remove("open");
  document.getElementById("email-compose-modal-close").addEventListener("click", closeModal);
  document.getElementById("email-cancel-btn").addEventListener("click", closeModal);

  document.querySelectorAll(".email-editor-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("email-body").focus();
      document.execCommand(btn.dataset.cmd);
    });
  });

  document.getElementById("email-template").addEventListener("change", (e) => {
    const key = e.target.value;
    const firstName = (document.getElementById("email-to").dataset.name || "").split(" ")[0] || "there";
    if (!key) {
      document.getElementById("email-subject").value = "";
      document.getElementById("email-body").innerHTML = "";
      return;
    }
    const tpl = EMAIL_TEMPLATES[key];
    document.getElementById("email-subject").value = tpl.subject;
    document.getElementById("email-body").innerHTML = tpl.body(firstName);
  });

  document.getElementById("email-compose-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("email-compose-status");
    const sendBtn = document.getElementById("email-send-btn");
    const body = document.getElementById("email-body").innerHTML.trim();

    if (!body) {
      status.textContent = "Please write a message.";
      status.className = "error";
      return;
    }

    const payload = {
      clientId: document.getElementById("email-client-id").value || null,
      bookingId: document.getElementById("email-booking-id").value || null,
      to: document.getElementById("email-to").value,
      subject: document.getElementById("email-subject").value,
      body,
    };

    sendBtn.disabled = true;
    sendBtn.classList.add("btn-loading");
    sendBtn.textContent = "Sending...";
    status.textContent = "";
    status.className = "";

    try {
      await api("client-email", { method: "POST", body: JSON.stringify(payload) });
      status.textContent = "Email sent successfully.";
      status.className = "success";
      showToast("Email sent");
      setTimeout(() => document.getElementById("email-compose-modal").classList.remove("open"), 900);
    } catch (err) {
      status.textContent = err.message || "Could not send the email. Please try again.";
      status.className = "error";
    } finally {
      sendBtn.disabled = false;
      sendBtn.classList.remove("btn-loading");
      sendBtn.textContent = "Send Email";
    }
  });
}

async function openEmailHistoryModal(clientId) {
  const modal = document.getElementById("email-history-modal");
  const list = document.getElementById("email-history-list");
  list.innerHTML = '<p class="admin-empty">Loading...</p>';
  modal.classList.add("open");

  try {
    const data = await api(`client-email?clientId=${clientId}`);
    list.innerHTML = data.emails.length === 0
      ? '<p class="admin-empty">No emails sent yet.</p>'
      : data.emails.map((e) => `
          <div class="admin-row-card" style="cursor: default;">
            <div class="admin-row-main">
              <h4>${escapeHtml(e.subject)}</h4>
              <div class="admin-row-meta">${formatDateTime(e.created_at)} &middot; to ${escapeHtml(e.to_email)}</div>
              <div class="admin-row-meta" style="margin-top: 8px;">${e.body.replace(/<[^>]+>/g, " ").trim().slice(0, 160)}</div>
            </div>
          </div>
        `).join("");
  } catch (err) {
    list.innerHTML = '<p class="admin-empty">Could not load email history.</p>';
  }
}

function setupEmailHistoryModal() {
  document.getElementById("email-history-modal-close").addEventListener("click", () => {
    document.getElementById("email-history-modal").classList.remove("open");
  });
}

/* ---------- Appointment history / audit trail ---------- */

const APPT_HISTORY_ACTION_LABELS = {
  submitted: "Original Submission",
  status_changed: "Status Update",
};

const APPT_DIFF_FIELDS = [
  { key: "service", label: "Service(s)" },
  { key: "preferred_date", label: "Date" },
  { key: "preferred_time", label: "Time" },
  { key: "notes", label: "Notes" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
];

function renderApptDiff(before, after) {
  const rows = APPT_DIFF_FIELDS.filter((f) => String(before[f.key] || "") !== String(after[f.key] || ""))
    .map(
      (f) => `
        <div class="diff-row">
          <span class="diff-field">${f.label}</span>
          <span><span class="diff-old">${escapeHtml(before[f.key] || "—")}</span> &rarr; <span class="diff-new">${escapeHtml(after[f.key] || "—")}</span></span>
        </div>
      `
    )
    .join("");
  return rows || '<p class="admin-empty">No field changes detected.</p>';
}

async function openAppointmentHistoryModal(id) {
  const modal = document.getElementById("appointment-history-modal");
  const list = document.getElementById("appointment-history-list");
  list.innerHTML = '<p class="admin-empty">Loading...</p>';
  modal.classList.add("open");

  try {
    const data = await api(`booking-history?id=${id}`);
    const visible = data.history.filter((item) => item.action !== "pre_modification_snapshot");

    if (visible.length === 0) {
      list.innerHTML = '<p class="admin-empty">No history recorded yet.</p>';
      return;
    }

    let lastSnapshot = null;
    list.innerHTML = visible
      .map((item) => {
        const label = APPT_HISTORY_ACTION_LABELS[item.action] || (item.action === "modified" ? (item.changed_by === "client" ? "Client Modification" : "Admin Update") : item.action);
        let diffHtml = "";
        if (lastSnapshot && (item.action === "modified" || item.action === "status_changed")) {
          diffHtml = `<div style="margin-top: 8px;">${renderApptDiff(lastSnapshot, item.snapshot)}</div>`;
        }
        lastSnapshot = item.snapshot;
        return `
          <div class="history-item">
            <div class="history-label">${escapeHtml(label)} <span class="admin-time">(${item.changed_by})</span></div>
            <div class="history-time">${formatDateTime(item.created_at)}</div>
            ${diffHtml}
          </div>
        `;
      })
      .join("");
  } catch (err) {
    list.innerHTML = '<p class="admin-empty">Could not load the request history.</p>';
  }
}

function setupAppointmentHistoryModal() {
  document.getElementById("appointment-history-modal-close").addEventListener("click", () => {
    document.getElementById("appointment-history-modal").classList.remove("open");
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
      <div style="display: flex; gap: 10px; margin-bottom: 18px;">
        <button class="btn" id="email-client-btn">E-Mail Client</button>
        <button class="btn" id="view-email-history-btn">View Email History</button>
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

    document.getElementById("email-client-btn").addEventListener("click", () => {
      openEmailComposeModal({ clientId: client.id, email: client.email, name: client.name });
    });

    document.getElementById("view-email-history-btn").addEventListener("click", () => {
      openEmailHistoryModal(client.id);
    });

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
  cachedServiceOptions = null;
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

let calendarMonth = (() => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() }; // month: 0-11
})();

async function loadRevenue() {
  try {
    const data = await api("revenue");
    document.getElementById("revenue-all-time").textContent = formatCents(data.allTimeCents);
    document.getElementById("revenue-this-month").textContent = formatCents(data.thisMonthCents);
    document.getElementById("revenue-last-month").textContent = formatCents(data.lastMonthCents);
    document.getElementById("revenue-all-time-count").textContent = `${data.allTimeCount} appointment${data.allTimeCount === 1 ? "" : "s"}`;
    document.getElementById("revenue-this-month-count").textContent = `${data.thisMonthCount} appointment${data.thisMonthCount === 1 ? "" : "s"}`;
    document.getElementById("revenue-last-month-count").textContent = `${data.lastMonthCount} appointment${data.lastMonthCount === 1 ? "" : "s"}`;
  } catch (err) {
    showToast(err.message);
  }
  loadCalendar();
}

function setupModalOutsideClick() {
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("open");
    });
  });
}

function setupRevenueClicks() {
  document.getElementById("stat-card-revenue-all-time").addEventListener("click", () => {
    openPeriodDetail("Total Revenue — All Time");
  });
  document.getElementById("stat-card-revenue-this-month").addEventListener("click", () => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    openPeriodDetail("This Month's Revenue", from);
  });
  document.getElementById("stat-card-revenue-last-month").addEventListener("click", () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const from = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate();
    const to = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    openPeriodDetail("Last Month's Revenue", from, to);
  });
}

async function openPeriodDetail(label, from, to) {
  const modal = document.getElementById("day-detail-modal");
  const title = document.getElementById("day-detail-title");
  const summary = document.getElementById("day-detail-summary");
  const list = document.getElementById("day-detail-list");

  title.textContent = label;
  summary.textContent = "Loading...";
  list.innerHTML = "";
  modal.classList.add("open");

  try {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const data = await api(`bookings?${params.toString()}`);
    const bookings = data.bookings;

    if (bookings.length === 0) {
      summary.textContent = "No appointments in this period.";
      return;
    }

    const completedCents = bookings
      .filter((b) => b.status === "completed")
      .reduce((sum, b) => sum + parseServiceLine(b.service).totalCents, 0);
    summary.textContent = `${bookings.length} appointment${bookings.length === 1 ? "" : "s"} · ${formatCents(completedCents)} completed revenue`;

    list.innerHTML = bookings
      .map((b) => {
        const { items } = parseServiceLine(b.service);
        const servicesHtml = items.map((item) => `<div class="appt-service-line">${escapeHtml(item.name)} <span class="price-value">${formatCents(item.priceCents)}</span></div>`).join("");
        return `
          <div class="admin-row-card" style="cursor: default;">
            <div class="admin-row-main">
              <h4>${escapeHtml(b.name)}</h4>
              <div class="admin-row-meta">
                <div class="appt-services-list">${servicesHtml}</div>
                <span class="appt-date-badge">${formatDate(b.preferred_date)}</span>
                <span class="appt-time-badge">${formatTime(b.preferred_time)}</span> · ${escapeHtml(b.phone)}
              </div>
            </div>
            <span class="status-badge status-${b.status}">${b.status}</span>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    summary.textContent = "Could not load revenue details.";
  }
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthParam() {
  return `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}`;
}

async function loadCalendar() {
  const grid = document.getElementById("revenue-calendar");
  document.getElementById("calendar-month-label").textContent = `${MONTH_NAMES[calendarMonth.month]} ${calendarMonth.year}`;

  let byDate = {};
  try {
    const data = await api(`calendar?month=${monthParam()}`);
    data.days.forEach((d) => { byDate[d.date] = d; });
  } catch (err) {
    showToast(err.message);
  }

  const firstOfMonth = new Date(calendarMonth.year, calendarMonth.month, 1);
  const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();
  const todayKey = new Date().toISOString().slice(0, 10);

  const weekdayCells = WEEKDAY_NAMES.map((d) => `<div class="calendar-weekday">${d}</div>`).join("");
  const blanks = Array.from({ length: startWeekday }, () => `<div class="calendar-day empty"></div>`).join("");

  const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const dateKey = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    const info = byDate[dateKey];
    const isToday = dateKey === todayKey;
    return `
      <div class="calendar-day ${isToday ? "today" : ""}" data-date="${dateKey}">
        <div class="calendar-day-num">${dayNum}</div>
        ${info && info.revenueCents > 0 ? `<div class="calendar-day-revenue">${formatCents(info.revenueCents)}</div>` : ""}
        ${info && info.appointmentCount > 0 ? `<div class="calendar-day-count">${info.appointmentCount} appt${info.appointmentCount === 1 ? "" : "s"}</div>` : ""}
      </div>
    `;
  }).join("");

  grid.innerHTML = weekdayCells + blanks + dayCells;

  grid.querySelectorAll(".calendar-day:not(.empty)").forEach((cell) => {
    cell.addEventListener("click", () => openDayDetail(cell.dataset.date));
  });
}

function setupCalendarNav() {
  document.getElementById("calendar-prev-btn").addEventListener("click", () => {
    calendarMonth.month -= 1;
    if (calendarMonth.month < 0) { calendarMonth.month = 11; calendarMonth.year -= 1; }
    loadCalendar();
  });
  document.getElementById("calendar-next-btn").addEventListener("click", () => {
    calendarMonth.month += 1;
    if (calendarMonth.month > 11) { calendarMonth.month = 0; calendarMonth.year += 1; }
    loadCalendar();
  });
  document.getElementById("day-detail-modal-close").addEventListener("click", () => {
    document.getElementById("day-detail-modal").classList.remove("open");
  });
}

async function openDayDetail(dateKey) {
  const modal = document.getElementById("day-detail-modal");
  const title = document.getElementById("day-detail-title");
  const summary = document.getElementById("day-detail-summary");
  const list = document.getElementById("day-detail-list");

  const niceDate = new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  title.textContent = niceDate;
  summary.textContent = "Loading...";
  list.innerHTML = "";
  modal.classList.add("open");

  try {
    const data = await api(`bookings?from=${dateKey}&to=${dateKey}`);
    const bookings = data.bookings;

    if (bookings.length === 0) {
      summary.textContent = "No appointments on this day.";
      return;
    }

    const totalCents = bookings
      .filter((b) => b.status === "completed")
      .reduce((sum, b) => sum + parseServiceLine(b.service).totalCents, 0);
    summary.textContent = `${bookings.length} appointment${bookings.length === 1 ? "" : "s"} · ${formatCents(totalCents)} completed revenue`;

    list.innerHTML = bookings
      .map((b) => {
        const { items } = parseServiceLine(b.service);
        const servicesHtml = items.map((item) => `<div class="appt-service-line">${escapeHtml(item.name)} <span class="price-value">${formatCents(item.priceCents)}</span></div>`).join("");
        return `
          <div class="admin-row-card" style="cursor: default;">
            <div class="admin-row-main">
              <h4>${escapeHtml(b.name)}</h4>
              <div class="admin-row-meta">
                <div class="appt-services-list">${servicesHtml}</div>
                <span class="appt-date-badge">${formatDate(b.preferred_date)}</span>
                <span class="appt-time-badge">${formatTime(b.preferred_time)}</span> · ${escapeHtml(b.phone)}
              </div>
            </div>
            <span class="status-badge status-${b.status}">${b.status}</span>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    summary.textContent = "Could not load appointments for this day.";
  }
}

/* ---------- Reviews ---------- */

function reviewFeedbackCard(item, { pending } = {}) {
  const title = item.type === "review"
    ? `${escapeHtml(item.name)} — ${"&#9733;".repeat(item.rating)}${"&#9734;".repeat(5 - item.rating)}`
    : `${escapeHtml(item.name)}${item.is_read === false ? ' <span class="admin-pill active" style="margin-left: 8px;">New</span>' : ""}`;

  const typeTag = `<span class="admin-pill" style="margin-left: 8px;">${item.type === "review" ? "Review" : "Feedback"}</span>`;

  const actions = pending
    ? `<button class="approve-item-btn" data-id="${item.id}" data-type="${item.type}">Approve</button>
       <button class="delete-item-btn" data-id="${item.id}" data-type="${item.type}">Reject</button>`
    : `<button class="approve-item-btn" data-id="${item.id}" data-type="${item.type}" data-unapprove="true">Unapprove</button>
       <button class="delete-item-btn" data-id="${item.id}" data-type="${item.type}">Delete</button>`;

  return `
    <div class="admin-row-card" style="cursor: default;">
      <div class="admin-row-main">
        <h4>${title}${typeTag}</h4>
        <div class="admin-row-meta">${escapeHtml(item.message)}</div>
      </div>
      <div class="admin-row-actions">${actions}</div>
    </div>
  `;
}

async function loadReviews() {
  const pendingList = document.getElementById("reviews-pending-list");
  const approvedList = document.getElementById("reviews-approved-list");
  try {
    const [reviewsData, feedbackData] = await Promise.all([api("reviews"), api("feedback")]);

    const reviews = reviewsData.reviews.map((r) => ({
      id: r.id, type: "review", name: r.client_name, message: r.comment, rating: r.rating,
      is_approved: r.is_approved, created_at: r.created_at,
    }));
    const feedback = feedbackData.feedback.map((f) => ({
      id: f.id, type: "feedback", name: f.name, message: f.message,
      is_approved: f.is_approved, is_read: f.is_read, created_at: f.created_at,
    }));

    const all = [...reviews, ...feedback].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const pending = all.filter((item) => !item.is_approved);
    const approved = all.filter((item) => item.is_approved);

    pendingList.innerHTML = pending.length === 0
      ? '<p class="admin-empty">Nothing waiting for approval.</p>'
      : pending.map((item) => reviewFeedbackCard(item, { pending: true })).join("");

    approvedList.innerHTML = approved.length === 0
      ? '<p class="admin-empty">Nothing approved yet.</p>'
      : approved.map((item) => reviewFeedbackCard(item, { pending: false })).join("");

    document.querySelectorAll(".approve-item-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.type === "review" ? "reviews" : "feedback";
        const isApproved = !btn.dataset.unapprove;
        await api(action, { method: "PUT", body: JSON.stringify({ id: btn.dataset.id, isApproved }) });
        showToast(isApproved ? "Approved" : "Unapproved");
        loadReviews();
        refreshFeedbackBadge();
      });
    });

    document.querySelectorAll(".delete-item-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.type === "review" ? "reviews" : "feedback";
        await api(`${action}?id=${btn.dataset.id}`, { method: "DELETE" });
        showToast("Removed");
        loadReviews();
        refreshFeedbackBadge();
      });
    });
  } catch (err) {
    pendingList.innerHTML = '<p class="admin-empty">Could not load reviews and feedback.</p>';
  }
}

/* ---------- Messages ---------- */

async function refreshMessagesBadge() {
  const badge = document.getElementById("messages-unread-badge");
  if (!badge) return;
  try {
    const data = await api("messages");
    const unread = data.messages.filter((m) => !m.is_read).length;
    badge.textContent = unread;
    badge.style.display = unread > 0 ? "inline-flex" : "none";
  } catch (err) {
    // ignore
  }
}

async function loadMessages() {
  const list = document.getElementById("messages-list");
  try {
    const data = await api("messages");

    list.innerHTML = data.messages.length === 0
      ? '<p class="admin-empty">No messages yet.</p>'
      : data.messages.map((m) => `
          <div class="admin-row-card" style="cursor: default; ${m.is_read ? "" : "border-left: 3px solid var(--gold);"}">
            <div class="admin-row-main">
              <h4>${escapeHtml(m.name)} ${m.is_read ? "" : '<span class="admin-pill active" style="margin-left: 8px;">New</span>'}</h4>
              <div class="admin-row-meta">${escapeHtml(m.email)}${m.phone ? ` &middot; ${escapeHtml(m.phone)}` : ""} &middot; ${formatDateTime(m.created_at)}</div>
              <div class="admin-row-meta" style="margin-top: 8px;">${escapeHtml(m.message)}</div>
            </div>
            <div class="admin-row-actions">
              <button class="answer-message-btn" data-id="${m.id}" style="background: var(--gold); color: #1c1a14; border-color: var(--gold);">Answer</button>
              ${m.is_read ? "" : `<button class="mark-read-message-btn" data-id="${m.id}">Mark Read</button>`}
              <button class="delete-message-btn" data-id="${m.id}">Delete</button>
            </div>
          </div>
        `).join("");

    document.querySelectorAll(".answer-message-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const message = data.messages.find((m) => String(m.id) === String(btn.dataset.id));
        if (message) openMessageReplyModal(message);
      });
    });

    document.querySelectorAll(".mark-read-message-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await api("messages", { method: "PUT", body: JSON.stringify({ id: btn.dataset.id, isRead: true }) });
        loadMessages();
        refreshMessagesBadge();
      });
    });

    document.querySelectorAll(".delete-message-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await api(`messages?id=${btn.dataset.id}`, { method: "DELETE" });
        showToast("Message deleted");
        loadMessages();
        refreshMessagesBadge();
      });
    });
  } catch (err) {
    list.innerHTML = '<p class="admin-empty">Could not load messages.</p>';
  }
}

/* ---------- Feedback ---------- */

async function refreshFeedbackBadge() {
  const badge = document.getElementById("feedback-unread-badge");
  if (!badge) return;
  try {
    const data = await api("feedback");
    const unread = data.feedback.filter((f) => !f.is_read).length;
    badge.textContent = unread;
    badge.style.display = unread > 0 ? "inline-flex" : "none";
  } catch (err) {
    // ignore
  }
}

/* ---------- Notifications ---------- */

async function loadNotifications() {
  const list = document.getElementById("notif-list");
  const badge = document.getElementById("notif-bell-badge");
  if (!list || !badge) return;

  try {
    const [messagesData, feedbackData, bookingsData] = await Promise.all([
      api("messages"),
      api("feedback"),
      api("bookings?status=pending"),
    ]);

    const items = [
      ...messagesData.messages.filter((m) => !m.is_read).map((m) => ({
        type: "Message", section: "messages", created_at: m.created_at,
        text: `${m.name}: ${m.message}`, id: m.id, kind: "message",
      })),
      ...feedbackData.feedback.filter((f) => !f.is_read).map((f) => ({
        type: "Feedback", section: "reviews", created_at: f.created_at,
        text: `${f.name}: ${f.message}`, id: f.id, kind: "feedback",
      })),
      ...bookingsData.bookings.map((b) => ({
        type: "Booking Request", section: "appointments", created_at: b.created_at || `${b.preferred_date}T${b.preferred_time}`,
        text: `${b.name} requested ${b.service}`, id: b.id, kind: "booking",
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    renderNotifList(items);
  } catch (err) {
    list.innerHTML = '<div class="notif-empty">Could not load notifications.</div>';
  }
}

function renderNotifList(items) {
  const list = document.getElementById("notif-list");
  const badge = document.getElementById("notif-bell-badge");
  if (!list || !badge) return;

  badge.textContent = items.length;
  badge.classList.toggle("visible", items.length > 0);

  list.innerHTML = items.length === 0
    ? '<div class="notif-empty">You\'re all caught up.</div>'
    : items.slice(0, 20).map((item, i) => `
        <button class="notif-item" data-index="${i}">
          <div class="notif-item-type">${escapeHtml(item.type)}</div>
          <div class="notif-item-text">${escapeHtml(item.text.slice(0, 90))}${item.text.length > 90 ? "…" : ""}</div>
        </button>
      `).join("");

  list.querySelectorAll(".notif-item").forEach((btn, i) => {
    btn.addEventListener("click", async () => {
      const item = items[i];
      document.getElementById("notif-dropdown").classList.remove("open");
      document.querySelector(`.admin-nav-item[data-section="${item.section}"]`).click();

      if (item.kind === "message") {
        api("messages", { method: "PUT", body: JSON.stringify({ id: item.id, isRead: true }) }).catch(() => {});
      } else if (item.kind === "feedback") {
        api("feedback", { method: "PUT", body: JSON.stringify({ id: item.id, isRead: true }) }).catch(() => {});
      }

      items.splice(i, 1);
      renderNotifList(items);
    });
  });
}

function setupNotifDropdown() {
  const bellBtn = document.getElementById("notif-bell-btn");
  const dropdown = document.getElementById("notif-dropdown");
  if (!bellBtn || !dropdown) return;

  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = !dropdown.classList.contains("open");
    dropdown.classList.toggle("open");
    if (opening) loadNotifications();
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== bellBtn) {
      dropdown.classList.remove("open");
    }
  });
}

function openMessageReplyModal(message) {
  document.getElementById("message-reply-id").value = message.id;
  document.getElementById("message-reply-original").innerHTML =
    `<strong>${escapeHtml(message.name)}</strong> (${escapeHtml(message.email)}) wrote:<br>${escapeHtml(message.message)}`;
  document.getElementById("message-reply-text").value = "";
  document.getElementById("message-reply-status").textContent = "";
  document.getElementById("message-reply-file").value = "";
  document.getElementById("message-reply-file-name").textContent = "";
  document.getElementById("message-reply-modal").classList.add("open");
}

const MAX_REPLY_ATTACHMENT_BYTES = 2.5 * 1024 * 1024;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupMessageReplyModal() {
  document.getElementById("message-reply-modal-close").addEventListener("click", () => {
    document.getElementById("message-reply-modal").classList.remove("open");
  });

  const fileInput = document.getElementById("message-reply-file");
  document.getElementById("message-reply-file-btn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const nameEl = document.getElementById("message-reply-file-name");
    const file = fileInput.files[0];
    if (!file) {
      nameEl.textContent = "";
      return;
    }
    if (file.size > MAX_REPLY_ATTACHMENT_BYTES) {
      nameEl.textContent = "File too large (max 2.5MB)";
      fileInput.value = "";
      return;
    }
    nameEl.textContent = file.name;
  });

  document.getElementById("message-reply-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("message-reply-status");
    const id = document.getElementById("message-reply-id").value;
    const reply = document.getElementById("message-reply-text").value.trim();
    if (!reply) return;

    status.textContent = "Sending...";
    try {
      const body = { id, reply };
      const file = fileInput.files[0];
      if (file) {
        body.attachment = { filename: file.name, content: await fileToBase64(file) };
      }
      await api("messages", { method: "POST", body: JSON.stringify(body) });
      status.textContent = "";
      document.getElementById("message-reply-modal").classList.remove("open");
      showToast("Reply sent");
      loadMessages();
      refreshMessagesBadge();
    } catch (err) {
      status.textContent = "Could not send reply. Please try again.";
    }
  });
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

    const reminders = data.settings.reminders || {};
    document.getElementById("reminder-enabled").checked = reminders.enabled !== false;
    document.getElementById("reminder-subject").value = reminders.subject || "";
    document.getElementById("reminder-body").value = reminders.body || "";
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

  document.getElementById("reminder-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("reminder-settings-status");
    try {
      await api("settings", {
        method: "PUT",
        body: JSON.stringify({
          key: "reminders",
          value: {
            enabled: document.getElementById("reminder-enabled").checked,
            subject: document.getElementById("reminder-subject").value,
            body: document.getElementById("reminder-body").value,
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
  setupWeekNav();
  setupNotifDropdown();
  setupEmailComposeModal();
  setupEmailHistoryModal();
  setupAppointmentHistoryModal();
  setupAppointmentModal();
  setupClientSearch();
  setupServiceModal();
  setupMessageReplyModal();
  setupSettingsForms();
  setupCalendarNav();
  setupDashboardClicks();
  setupRevenueClicks();
  setupModalOutsideClick();
  checkAuthAndLoad();
});
