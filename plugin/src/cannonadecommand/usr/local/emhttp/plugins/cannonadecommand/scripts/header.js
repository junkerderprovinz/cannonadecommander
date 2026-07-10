// CannonadeCommand - GLOBAL main-menu-bar enhancer.
//
// Loaded on EVERY Unraid page via the Buttons .page hook
// (CannonadeCommand.Header.page). It deliberately does the MINIMUM in JS:
//   * toggle html.cc-header-on  -> the auto-injected sheet only takes effect when
//     the "Hauptmenueleiste" (main menu bar) area is enabled in CC settings, so a
//     disabled area = ZERO effect on any page.
//   * mirror the CC accent/text/badge-shape vars onto the document root so the
//     sheet can follow the user's configured theme.
// All actual styling lives in sheets/CannonadeCommand.Header.css, every rule of it
// scoped to html.cc-header-on. Default is OFF: the user opts in under
// Settings > CannonadeCommand > Bereiche > Hauptmenueleiste.
(function () {
  "use strict";
  function g(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function idealText(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#fff";
    var n = parseInt(m[1], 16), L = 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255);
    return L > 150 ? "#161616" : "#fff";
  }
  function eff(k, d) { return g("cc.styleheader", "1") !== "0" ? g("cc." + k, d) : g("cch." + k, d); }
  function accent() { var a = eff("accent", "#2f6feb"); return /^#[0-9a-f]{6}$/i.test(a) ? a : "#2f6feb"; }
  function shape() { return ({ pill: "999px", rounded: "6px", square: "0px" })[eff("badgeshape", "pill")] || "999px"; }
  function apply() {
    try {
      var root = document.documentElement;
      var on = g("cc.enable.header", "0") !== "0"; // default OFF (new + global: opt in)
      root.classList.toggle("cc-header-on", on);
      if (!on) return;
      var a = accent();
      root.style.setProperty("--cc-accent", a);
      root.style.setProperty("--cc-accent-text", idealText(a));
      root.style.setProperty("--cc-b-radius", shape());
    } catch (e) {}
  }
  // gui_search() prepends #guiSearchBox into the bar; flag it so the sheet can clear
  // the tabs out of the way and give the field the full menu bar (reliable, no :has()).
  function watchSearch() {
    try {
      var target = document.getElementById("menu") || document.body;
      var mo = new MutationObserver(function () {
        document.documentElement.classList.toggle("cc-search-open", !!document.getElementById("guiSearchBoxSpan"));
      });
      mo.observe(target, { childList: true, subtree: true });
    } catch (e) {}
  }
  function boot() {
    apply();
    watchSearch();
    // the Settings page (or the Docker tab) writes cc.* keys from another origin/tab
    try { window.addEventListener("storage", function (e) { if (e.key && e.key.indexOf("cc.") === 0) apply(); }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
