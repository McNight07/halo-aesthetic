function escapeHtmlAdmin(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function formatDateTime(value) {
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function showAdminToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function renderBookings(bookings) {
  const container = document.getElementById("bookings-list");
  if (bookings.length === 0) {
    container.innerHTML = '<p class="admin-empty">No bookings yet.</p>';
    return;
  }
  container.innerHTML = bookings
    .map((b) => {
      const date = new Date(b.preferred_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return `
        <div class="admin-card">
          <div class="admin-card-top">
            <h4>${escapeHtmlAdmin(b.name)}</h4>
            <div class="admin-time">Requested ${formatDateTime(b.created_at)}</div>
          </div>
          <div class="admin-field"><strong>Service:</strong> ${escapeHtmlAdmin(b.service)}</div>
          <div class="admin-field"><strong>Wants:</strong> ${date} at ${escapeHtmlAdmin(b.preferred_time.slice(0, 5))}</div>
          <div class="admin-field"><strong>Contact:</strong> ${escapeHtmlAdmin(b.phone)} · ${escapeHtmlAdmin(b.email)}</div>
          ${b.notes ? `<div class="admin-field"><strong>Notes:</strong> ${escapeHtmlAdmin(b.notes)}</div>` : ""}
        </div>
      `;
    })
    .join("");
}

function renderMessages(messages) {
  const container = document.getElementById("messages-list");
  if (messages.length === 0) {
    container.innerHTML = '<p class="admin-empty">No messages yet.</p>';
    return;
  }
  container.innerHTML = messages
    .map(
      (m) => `
        <div class="admin-card">
          <div class="admin-card-top">
            <h4>${escapeHtmlAdmin(m.name)}</h4>
            <div class="admin-time">${formatDateTime(m.created_at)}</div>
          </div>
          <div class="admin-field"><strong>Email:</strong> ${escapeHtmlAdmin(m.email)}</div>
          <div class="admin-field" style="margin-top: 10px;">${escapeHtmlAdmin(m.message)}</div>
        </div>
      `
    )
    .join("");
}

async function loadDashboard() {
  const response = await fetch("/api/admin/data");
  if (!response.ok) {
    document.getElementById("login-panel").style.display = "block";
    document.getElementById("dashboard-panel").style.display = "none";
    return;
  }
  const { bookings, messages } = await response.json();
  renderBookings(bookings);
  renderMessages(messages);
  document.getElementById("login-panel").style.display = "none";
  document.getElementById("dashboard-panel").style.display = "block";
}

document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();

  const loginBtn = document.getElementById("admin-login-btn");
  const passwordInput = document.getElementById("admin-password");
  const loginStatus = document.getElementById("login-status");

  const attemptLogin = async () => {
    const password = passwordInput.value;
    loginStatus.textContent = "Logging in...";
    loginStatus.className = "";
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        passwordInput.value = "";
        loginStatus.textContent = "";
        await loadDashboard();
      } else {
        const result = await response.json();
        loginStatus.textContent = result.error || "Login failed.";
        loginStatus.className = "error";
      }
    } catch (err) {
      loginStatus.textContent = "Something went wrong. Please try again.";
      loginStatus.className = "error";
    }
  };

  loginBtn.addEventListener("click", attemptLogin);
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptLogin();
  });

  const logoutBtn = document.getElementById("admin-logout-btn");
  logoutBtn.addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    document.getElementById("dashboard-panel").style.display = "none";
    document.getElementById("login-panel").style.display = "block";
    showAdminToast("Logged out");
  });
});
