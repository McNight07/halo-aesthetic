(function () {
  var STORAGE_KEY = "cookieConsent";

  function getConsent() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  function setConsent(value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  function buildBanner() {
    var banner = document.createElement("div");
    banner.className = "cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML =
      '<p class="cookie-banner-text">We use cookies to improve your experience and analyze site traffic. ' +
      'Choose how we may use cookies, or read more in our <a href="contact.html">privacy info</a>.</p>' +
      '<div class="cookie-banner-actions">' +
      '<button type="button" class="cookie-btn cookie-btn-reject">Reject</button>' +
      '<button type="button" class="cookie-btn cookie-btn-accept">Accept</button>' +
      "</div>";

    banner.querySelector(".cookie-btn-accept").addEventListener("click", function () {
      setConsent({ analytics: true, date: new Date().toISOString() });
      hideBanner(banner);
    });

    banner.querySelector(".cookie-btn-reject").addEventListener("click", function () {
      setConsent({ analytics: false, date: new Date().toISOString() });
      hideBanner(banner);
    });

    return banner;
  }

  function hideBanner(banner) {
    banner.classList.remove("cookie-banner-visible");
    setTimeout(function () {
      banner.remove();
    }, 300);
  }

  function init() {
    if (getConsent()) return;
    var banner = buildBanner();
    document.body.appendChild(banner);
    requestAnimationFrame(function () {
      banner.classList.add("cookie-banner-visible");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
