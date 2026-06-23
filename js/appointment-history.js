function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function formatDate(value) {
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value) {
  const [h, m] = String(value).slice(0, 5).split(":");
  const hour = parseInt(h, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${m} ${period}`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

const SEEN_KEY = "halo_seen_booking_updates";

function getSeenMap() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
  } catch (err) {
    return {};
  }
}

function markSeen(bookingId, updatedAt) {
  const seen = getSeenMap();
  seen[bookingId] = updatedAt;
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
}

let allBookings = [];

async function loadHistoryPage() {
  const user = await getCurrentUser();
  if (!user) {
    document.getElementById("not-logged-in").style.display = "block";
    document.getElementById("history-content").style.display = "none";
    return;
  }

  document.getElementById("not-logged-in").style.display = "none";
  document.getElementById("history-content").style.display = "block";

  await loadMyBookings();
}

async function loadMyBookings() {
  const list = document.getElementById("bookings-list");
  try {
    const response = await fetch("/api/account/my-bookings");
    if (!response.ok) throw new Error("failed");
    const data = await response.json();
    allBookings = data.bookings;
    renderUpdateBanner();
    renderBookings();
  } catch (err) {
    list.innerHTML = '<p class="admin-empty">Could not load your booking requests.</p>';
  }
}

function renderUpdateBanner() {
  const banner = document.getElementById("update-banner");
  const seen = getSeenMap();
  const updatedByAdmin = allBookings.filter(
    (b) => b.last_modified_by === "admin" && seen[b.id] !== b.updated_at
  );
  if (updatedByAdmin.length === 0) {
    banner.style.display = "none";
    return;
  }
  banner.style.display = "block";
  banner.textContent =
    updatedByAdmin.length === 1
      ? `Your request for "${updatedByAdmin[0].service}" was just updated by the salon. Open it to see what changed.`
      : `${updatedByAdmin.length} of your requests were recently updated by the salon. Open them to see what changed.`;
}

function getFilteredBookings() {
  const search = document.getElementById("filter-search").value.trim().toLowerCase();
  const status = document.getElementById("filter-status").value;
  return allBookings.filter((b) => {
    if (status && b.status !== status) return false;
    if (search && !b.service.toLowerCase().includes(search)) return false;
    return true;
  });
}

function renderBookings() {
  const list = document.getElementById("bookings-list");
  const bookings = getFilteredBookings();

  if (bookings.length === 0) {
    list.innerHTML = '<p class="admin-empty">No appointment requests match your filters.</p>';
    return;
  }

  list.innerHTML = bookings
    .map((b) => {
      const seen = getSeenMap();
      const updatedBySalon = b.last_modified_by === "admin" && seen[b.id] !== b.updated_at;
      return `
        <div class="admin-card booking-row" data-id="${b.id}" style="cursor: pointer;">
          <div class="admin-card-top">
            <h4>Request #${b.id} — ${escapeHtml(b.service)}</h4>
            <div>
              <span class="status-badge status-${b.status}">${b.status.replace(/^./, (c) => c.toUpperCase())}</span>
              ${updatedBySalon ? `<span class="review-badge">Updated by Salon</span>` : ""}
            </div>
          </div>
          <div class="admin-field">${formatDate(b.preferred_date)} at ${formatTime(b.preferred_time)}</div>
          <div class="admin-time">Submitted ${formatDateTime(b.created_at)} · Last updated ${formatDateTime(b.updated_at || b.created_at)}</div>
          ${
            b.status === "pending"
              ? `<button class="btn edit-my-booking-btn" data-id="${b.id}" style="margin-top: 12px;">Edit &amp; Resubmit</button>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  list.querySelectorAll(".booking-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".edit-my-booking-btn")) return;
      const booking = allBookings.find((b) => String(b.id) === row.dataset.id);
      if (booking) openDetailModal(booking);
    });
  });

  list.querySelectorAll(".edit-my-booking-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const booking = allBookings.find((b) => String(b.id) === btn.dataset.id);
      if (booking) openEditBookingModal(booking);
    });
  });
}

function actionLabel(item) {
  const labels = {
    submitted: "Original Submission",
    modified: item.changed_by === "client" ? "Client Modification" : "Admin Update",
    status_changed: "Status Update",
    pre_modification_snapshot: null,
  };
  return labels[item.action] !== undefined ? labels[item.action] : item.action;
}

const DIFF_FIELDS = [
  { key: "service", label: "Service(s)" },
  { key: "preferred_date", label: "Date" },
  { key: "preferred_time", label: "Time" },
  { key: "notes", label: "Notes" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "status", label: "Status" },
];

function renderDiff(before, after) {
  const rows = DIFF_FIELDS.filter((f) => String(before[f.key] || "") !== String(after[f.key] || ""))
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

async function openDetailModal(booking) {
  document.getElementById("detail-id").textContent = `#${booking.id}`;
  document.getElementById("detail-body").innerHTML = `
    <div class="admin-field"><strong>Service(s):</strong> ${escapeHtml(booking.service)}</div>
    <div class="admin-field"><strong>Date:</strong> ${formatDate(booking.preferred_date)}</div>
    <div class="admin-field"><strong>Time:</strong> ${formatTime(booking.preferred_time)}</div>
    <div class="admin-field"><strong>Status:</strong> <span class="status-badge status-${booking.status}">${booking.status.replace(/^./, (c) => c.toUpperCase())}</span></div>
    ${booking.notes ? `<div class="admin-field"><strong>Notes:</strong> ${escapeHtml(booking.notes)}</div>` : ""}
    <div class="admin-field"><strong>Contact:</strong> ${escapeHtml(booking.phone)} · ${escapeHtml(booking.email)}</div>
  `;

  const historyEl = document.getElementById("detail-history");
  historyEl.innerHTML = '<p class="admin-empty">Loading...</p>';
  document.getElementById("detail-modal").classList.add("open");

  markSeen(booking.id, booking.updated_at);
  renderUpdateBanner();
  renderBookings();

  try {
    const response = await fetch(`/api/account/my-booking-history?id=${booking.id}`);
    if (!response.ok) throw new Error("failed");
    const { history } = await response.json();

    const visible = history.filter((item) => item.action !== "pre_modification_snapshot");

    let lastSnapshot = null;
    historyEl.innerHTML = visible
      .map((item) => {
        const label = actionLabel(item);
        let diffHtml = "";
        if (lastSnapshot && (item.action === "modified" || item.action === "status_changed")) {
          diffHtml = `<div style="margin-top: 8px;">${renderDiff(lastSnapshot, item.snapshot)}</div>`;
        }
        lastSnapshot = item.snapshot;
        return `
          <div class="history-item">
            <div class="history-label">${label}${item.changed_by === "admin" ? " (by salon)" : item.changed_by === "client" ? " (by you)" : ""}</div>
            <div class="history-time">${formatDateTime(item.created_at)}</div>
            ${diffHtml}
          </div>
        `;
      })
      .join("");

    if (visible.length === 0) {
      historyEl.innerHTML = '<p class="admin-empty">No history recorded yet.</p>';
    }
  } catch (err) {
    historyEl.innerHTML = '<p class="admin-empty">Could not load the request timeline.</p>';
  }
}

function closeDetailModal() {
  document.getElementById("detail-modal").classList.remove("open");
}

function openEditBookingModal(booking) {
  document.getElementById("eb-id").value = booking.id;
  document.getElementById("eb-name").value = booking.name;
  document.getElementById("eb-phone").value = booking.phone || "";
  document.getElementById("eb-email").value = booking.email || "";
  document.getElementById("eb-service").value = booking.service;
  document.getElementById("eb-date").value = booking.preferred_date.slice(0, 10);
  document.getElementById("eb-time").value = booking.preferred_time.slice(0, 5);
  document.getElementById("eb-notes").value = booking.notes || "";
  document.getElementById("edit-booking-status").textContent = "";
  document.getElementById("edit-booking-modal").classList.add("open");
}

function closeEditBookingModal() {
  document.getElementById("edit-booking-modal").classList.remove("open");
}

document.addEventListener("DOMContentLoaded", () => {
  loadHistoryPage();

  document.getElementById("filter-search").addEventListener("input", renderBookings);
  document.getElementById("filter-status").addEventListener("change", renderBookings);

  document.getElementById("detail-close").addEventListener("click", closeDetailModal);
  document.getElementById("detail-modal").addEventListener("click", (e) => {
    if (e.target.id === "detail-modal") closeDetailModal();
  });

  document.getElementById("edit-booking-cancel").addEventListener("click", closeEditBookingModal);
  document.getElementById("edit-booking-modal").addEventListener("click", (e) => {
    if (e.target.id === "edit-booking-modal") closeEditBookingModal();
  });

  document.getElementById("edit-booking-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("edit-booking-status");
    const payload = {
      id: document.getElementById("eb-id").value,
      name: document.getElementById("eb-name").value,
      phone: document.getElementById("eb-phone").value,
      email: document.getElementById("eb-email").value,
      service: document.getElementById("eb-service").value,
      date: document.getElementById("eb-date").value,
      time: document.getElementById("eb-time").value,
      notes: document.getElementById("eb-notes").value,
    };

    status.textContent = "Resubmitting...";
    status.className = "";

    try {
      const response = await fetch("/api/account/my-bookings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (response.ok) {
        showToast("Booking request resubmitted");
        closeEditBookingModal();
        loadMyBookings();
      } else {
        status.textContent = result.error || "Could not update your request.";
        status.className = "error";
      }
    } catch (err) {
      status.textContent = "Something went wrong. Please try again.";
      status.className = "error";
    }
  });
});
