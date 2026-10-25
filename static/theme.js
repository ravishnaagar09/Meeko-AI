/* Marginalia theme + greeting. Loaded in <head> so the saved theme is applied before the page is drawn (no flash). */
(function () {
  "use strict";
  var KEY = "marginalia-theme";
  var root = document.documentElement;

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function systemDark() { return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches); }
  function current() { var s = stored(); return s === "dark" || s === "light" ? s : (systemDark() ? "dark" : "light"); }
  function apply(t) { root.setAttribute("data-theme", t); }

  apply(current());

  function sync() {
    var dark = root.getAttribute("data-theme") === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-pressed", dark ? "true" : "false");
      b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      b.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
    });
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (!b) return;
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.classList.add("theme-anim");
    apply(next);
    try { localStorage.setItem(KEY, next); } catch (err) { /* private mode: it just won't be remembered */ }
    sync();
    setTimeout(function () { root.classList.remove("theme-anim"); }, 350);
  });

  // If the person never chose, follow the device setting when it changes.
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () { if (!stored()) { apply(current()); sync(); } };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
  }

  // Greeting from the device's local time.
  window.marginaliaGreeting = function (date) {
    var h = (date || new Date()).getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Good night";
  };

  document.addEventListener("DOMContentLoaded", function () {
    sync();
    document.querySelectorAll("[data-greeting]").forEach(function (el) {
      var name = el.getAttribute("data-name");
      el.textContent = window.marginaliaGreeting() + (name ? ", " + name : "");
    });
  });
})();