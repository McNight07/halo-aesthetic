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
  document.getElementById("account-heading").textContent = `Hi, ${user.full_name.split(" ")[0]}`;

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
