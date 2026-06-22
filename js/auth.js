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

async function updateAccountNav() {
  const link = document.getElementById("account-nav-link");
  if (!link) return;

  const user = await getCurrentUser();
  if (user) {
    link.textContent = user.full_name ? user.full_name.split(" ")[0] : "Account";
    link.href = "account.html";
  } else {
    link.textContent = "Log In";
    link.href = "login.html";
  }
}

document.addEventListener("DOMContentLoaded", updateAccountNav);
