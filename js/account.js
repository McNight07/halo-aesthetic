function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function formatActivityAction(action) {
  return action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
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

let currentUser = null;

function renderDashboardAvatar(user) {
  const el = document.getElementById("dashboard-avatar");
  if (!el) return;
  el.innerHTML = user.photo_url
    ? `<img src="${user.photo_url}" alt="${user.full_name || "Profile photo"}">`
    : `<span class="dashboard-avatar-initials">${(user.full_name || "?")
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}</span>`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

async function loadAccount() {
  const user = await getCurrentUser();
  if (!user) {
    document.getElementById("not-logged-in").style.display = "block";
    document.getElementById("account-content").style.display = "none";
    return;
  }

  currentUser = user;
  document.getElementById("not-logged-in").style.display = "none";
  document.getElementById("account-content").style.display = "block";
  document.getElementById("account-heading").textContent = `Welcome back, ${user.full_name.split(" ")[0]}`;

  renderDashboardAvatar(user);
  document.getElementById("d-full-name").textContent = user.full_name || "—";
  document.getElementById("d-email").textContent = user.email || "—";
  document.getElementById("d-phone").textContent = user.phone || "—";
  document.getElementById("d-created").textContent = formatDate(user.created_at);

  document.getElementById("p-full-name").value = user.full_name || "";
  document.getElementById("p-username").value = user.username || "";
  document.getElementById("p-email").value = user.email || "";
  document.getElementById("p-phone").value = user.phone || "";
  document.getElementById("p-dob").value = user.date_of_birth ? user.date_of_birth.slice(0, 10) : "";
  document.getElementById("p-gender").value = user.gender || "";
  document.getElementById("p-bio").value = user.bio || "";
  document.getElementById("p-location").value = user.location || "";
  document.getElementById("p-education").value = user.education || "";
  document.getElementById("p-skills").value = (user.skills || []).join(", ");
  document.getElementById("p-interests").value = (user.interests || []).join(", ");

  const socialLinks = user.social_links || {};
  document.getElementById("p-instagram").value = socialLinks.instagram || "";
  document.getElementById("p-website").value = socialLinks.website || "";

  document.getElementById("p-is-private").checked = !!user.is_private;

  loadNotificationPreferences();
  loadActivity();
  loadBookings();
  loadEmailHistory();
}

function formatServiceDateTime(booking) {
  return `${formatDate(booking.preferred_date)} at ${booking.preferred_time || ""}`;
}

async function loadBookings() {
  const upcomingEl = document.getElementById("upcoming-list");
  const historyEl = document.getElementById("appointment-history-list");
  try {
    const response = await fetch("/api/account/my-bookings");
    if (!response.ok) throw new Error("failed");
    const { bookings } = await response.json();

    const upcoming = bookings.filter((b) => ["pending", "confirmed"].includes(b.status));
    const past = bookings.filter((b) => ["completed", "cancelled"].includes(b.status));

    upcomingEl.innerHTML = upcoming.length
      ? upcoming
          .map(
            (b) => `
            <div class="admin-card">
              <div class="admin-card-top">
                <h4>${b.service}</h4>
                <span class="dashboard-status-pill ${b.status}">${b.status}</span>
              </div>
              <div class="admin-field">${formatServiceDateTime(b)}</div>
            </div>
          `
          )
          .join("")
      : '<p class="admin-empty">No upcoming appointments.</p>';

    historyEl.innerHTML = past.length
      ? past
          .map(
            (b) => `
            <div class="admin-card">
              <div class="admin-card-top">
                <h4>${b.service}</h4>
                <span class="dashboard-status-pill ${b.status}">${b.status}</span>
              </div>
              <div class="admin-field">${formatServiceDateTime(b)}</div>
            </div>
          `
          )
          .join("")
      : '<p class="admin-empty">No past appointments yet.</p>';
  } catch (err) {
    upcomingEl.innerHTML = '<p class="admin-empty">Could not load appointments.</p>';
    historyEl.innerHTML = '<p class="admin-empty">Could not load appointment history.</p>';
  }
}

async function loadEmailHistory() {
  const list = document.getElementById("email-history-list");
  try {
    const response = await fetch("/api/account/email-history");
    if (!response.ok) throw new Error("failed");
    const { emails } = await response.json();
    list.innerHTML = emails.length
      ? emails
          .map(
            (e) => `
            <div class="admin-card">
              <div class="admin-card-top">
                <h4>${e.subject}</h4>
                <span class="dashboard-status-pill sent">${e.status}</span>
              </div>
              <div class="admin-field">${formatDateTime(e.created_at)}</div>
            </div>
          `
          )
          .join("")
      : '<p class="admin-empty">No emails sent yet.</p>';
  } catch (err) {
    list.innerHTML = '<p class="admin-empty">Could not load email history.</p>';
  }
}

function resizeImageFile(file, maxSize = 320, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadNotificationPreferences() {
  try {
    const response = await fetch("/api/account/notifications");
    if (!response.ok) return;
    const { preferences } = await response.json();
    document.getElementById("n-booking-reminders").checked = !!preferences.email_booking_reminders;
    document.getElementById("n-marketing").checked = !!preferences.email_marketing;
  } catch (err) {
    // leave defaults
  }
}

async function loadActivity() {
  const list = document.getElementById("activity-list");
  try {
    const response = await fetch("/api/account/activity");
    if (!response.ok) throw new Error("failed");
    const { activity } = await response.json();
    if (activity.length === 0) {
      list.innerHTML = '<p class="admin-empty">No activity yet.</p>';
      return;
    }
    list.innerHTML = activity
      .map(
        (item) => `
          <div class="admin-card">
            <div class="admin-card-top">
              <h4>${formatActivityAction(item.action)}</h4>
              <div class="admin-time">${formatDateTime(item.created_at)}</div>
            </div>
          </div>
        `
      )
      .join("");
  } catch (err) {
    list.innerHTML = '<p class="admin-empty">Could not load activity history.</p>';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadAccount();

  const settingsToggle = document.getElementById("settings-toggle");
  const settingsBody = document.getElementById("settings-body");
  settingsToggle.addEventListener("click", () => {
    settingsBody.classList.toggle("open");
  });

  document.getElementById("photo-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file);
      const response = await fetch("/api/account/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: dataUrl }),
      });
      if (response.ok) {
        const { user } = await response.json();
        currentUser = user;
        renderDashboardAvatar(user);
        showToast("Profile photo updated");
        updateAccountNav();
      } else {
        showToast("Could not upload photo");
      }
    } catch (err) {
      showToast("Could not upload photo");
    }
  });

  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("profile-status");
    const skills = document.getElementById("p-skills").value.split(",").map((s) => s.trim()).filter(Boolean);
    const interests = document.getElementById("p-interests").value.split(",").map((s) => s.trim()).filter(Boolean);

    const payload = {
      fullName: document.getElementById("p-full-name").value,
      phone: document.getElementById("p-phone").value,
      dateOfBirth: document.getElementById("p-dob").value || null,
      gender: document.getElementById("p-gender").value,
      bio: document.getElementById("p-bio").value,
      location: document.getElementById("p-location").value,
      education: document.getElementById("p-education").value,
      skills,
      interests,
      socialLinks: {
        instagram: document.getElementById("p-instagram").value,
        website: document.getElementById("p-website").value,
      },
    };

    status.textContent = "Saving...";
    status.className = "";

    try {
      const response = await fetch("/api/account/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (response.ok) {
        status.textContent = "Profile saved.";
        status.className = "success";
        showToast("Profile updated");
      } else {
        status.textContent = result.error || "Could not save profile.";
        status.className = "error";
      }
    } catch (err) {
      status.textContent = "Something went wrong. Please try again.";
      status.className = "error";
    }
  });

  document.getElementById("p-is-private").addEventListener("change", async (e) => {
    const status = document.getElementById("privacy-status");
    try {
      const response = await fetch("/api/account/privacy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrivate: e.target.checked }),
      });
      if (response.ok) {
        status.textContent = e.target.checked ? "Your profile is now private." : "Your profile is now public.";
        status.className = "success";
      } else {
        status.textContent = "Could not update privacy setting.";
        status.className = "error";
      }
    } catch (err) {
      status.textContent = "Something went wrong.";
      status.className = "error";
    }
  });

  document.getElementById("save-notifications-btn").addEventListener("click", async () => {
    const status = document.getElementById("notifications-status");
    try {
      const response = await fetch("/api/account/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailBookingReminders: document.getElementById("n-booking-reminders").checked,
          emailMarketing: document.getElementById("n-marketing").checked,
        }),
      });
      if (response.ok) {
        status.textContent = "Preferences saved.";
        status.className = "success";
      } else {
        status.textContent = "Could not save preferences.";
        status.className = "error";
      }
    } catch (err) {
      status.textContent = "Something went wrong.";
      status.className = "error";
    }
  });

  document.getElementById("password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("password-status");
    const currentPassword = document.getElementById("current-password").value;
    const newPassword = document.getElementById("new-password").value;

    status.textContent = "Updating password...";
    status.className = "";

    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json();
      if (response.ok) {
        status.textContent = "Password changed.";
        status.className = "success";
        document.getElementById("password-form").reset();
      } else {
        status.textContent = result.error || "Could not change password.";
        status.className = "error";
      }
    } catch (err) {
      status.textContent = "Something went wrong.";
      status.className = "error";
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "index.html";
  });
});
