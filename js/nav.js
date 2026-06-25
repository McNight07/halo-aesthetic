document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!toggle || !links) return;

  const closeBtn = document.createElement("button");
  closeBtn.className = "nav-close";
  closeBtn.setAttribute("aria-label", "Close menu");
  closeBtn.innerHTML = "&times;";
  closeBtn.addEventListener("click", () => links.classList.remove("open"));
  links.prepend(closeBtn);

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    links.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!links.classList.contains("open") || e.target === toggle) return;
    const clickedInteractive = e.target.closest("a, button");
    if (!clickedInteractive || !links.contains(clickedInteractive)) {
      links.classList.remove("open");
    }
  });
});
