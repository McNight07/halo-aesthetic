async function getCurrentUser() {
  try {
    const response = await fetch("/api/account/me");
    if (!response.ok) return null;
    const data = await response.json();
    return data.user || null;
  } catch (err) {
    return null;
  }
}

function getInitials(fullName) {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ? parts[0][0] : "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function buildAvatarMenu(link, user) {
  const li = link.closest("li");
  li.classList.add("nav-avatar-item");

  const avatarHtml = user.photo_url
    ? `<img src="${user.photo_url}" alt="${user.full_name || "Account"}" class="nav-avatar-img">`
    : `<span class="nav-avatar-initials">${getInitials(user.full_name)}</span>`;

  li.innerHTML = `
    <button type="button" class="nav-avatar-btn" id="nav-avatar-btn" aria-haspopup="true" aria-expanded="false">
      <span class="nav-avatar">${avatarHtml}</span>
    </button>
    <div class="nav-avatar-dropdown" id="nav-avatar-dropdown">
      <div class="nav-avatar-dropdown-header">
        <span class="nav-avatar-dropdown-name">${user.full_name ? user.full_name.split(" ")[0] : "Account"}</span>
        <span class="nav-avatar-dropdown-email">${user.email || ""}</span>
      </div>
      <a href="account.html">My Dashboard</a>
      <a href="appointment-history.html">My Bookings</a>
      <button type="button" id="nav-avatar-logout">Log Out</button>
    </div>
  `;

  const btn = li.querySelector("#nav-avatar-btn");
  const dropdown = li.querySelector("#nav-avatar-dropdown");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (e) => {
    if (!li.contains(e.target)) {
      dropdown.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }
  });

  li.querySelector("#nav-avatar-logout").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "index.html";
  });
}

async function updateAccountNav() {
  const link = document.getElementById("account-nav-link");
  if (!link) return;

  const user = await getCurrentUser();
  if (user) {
    buildAvatarMenu(link, user);
  } else {
    link.textContent = "Log In";
    link.href = "login.html";
  }
}

document.addEventListener("DOMContentLoaded", updateAccountNav);
