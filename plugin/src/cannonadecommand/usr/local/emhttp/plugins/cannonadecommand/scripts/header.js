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
  var RB = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"];
  var RB_OFF = Math.floor(Math.random() * RB.length);
  function pal() { try { var p = JSON.parse(eff("rbpal", "null")); if (p && p.length) return p; } catch (e) {} return RB; }
  function rbOn() { return eff("rainbow", "0") === "1"; }
  function rbColor(i) { if (!rbOn()) return accent(); var off = eff("rainbowrot", "0") === "0" ? 0 : RB_OFF; var p = pal(); return p[(i + off) % p.length]; }
  // rainbow: colour the active tab, each utility icon box and the usage fill with a
  // rotated palette colour (in accent mode the CSS handles it via --cc-accent, so we
  // just clear our overrides). childList observer only, so these style writes can't loop.
  function paintNav() {
    try {
      var rb = rbOn();
      var act = document.querySelector("#menu .nav-tile:not(.right) .nav-item.active > a");
      if (act) { if (rb) { var c0 = rbColor(0); act.style.setProperty("background", c0, "important"); act.style.setProperty("color", idealText(c0), "important"); } else { act.style.removeProperty("background"); act.style.removeProperty("color"); } }
      Array.prototype.slice.call(document.querySelectorAll("#menu .nav-tile.right .nav-item.util > a")).forEach(function (aEl, i) {
        var gl = aEl.querySelector("b.system, img.system");
        if (rb) { var c = rbColor(i + 1); aEl.style.setProperty("background", c, "important"); if (gl) gl.style.setProperty("color", idealText(c), "important"); }
        else { aEl.style.removeProperty("background"); if (gl) gl.style.removeProperty("color"); }
      });
      var u = document.querySelector("#menu .usage-bar > span");
      if (u) { if (rb) { var cu = rbColor(9); u.style.setProperty("background", cu, "important"); u.style.setProperty("color", idealText(cu), "important"); } else { u.style.removeProperty("background"); u.style.removeProperty("color"); } }
    } catch (e) {}
  }
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
      root.classList.toggle("cc-header-rb", rbOn());
      paintNav();
    } catch (e) {}
  }
  // gui_search() prepends #guiSearchBoxSpan at the FAR-LEFT of .nav-tile.right, focuses
  // the input, and closes the search on the input's focusout. We want the field to sit
  // directly LEFT of the search toggle (magnifier) — but MOVING the span in the DOM
  // blurs the focused input, which fires gui_search's onfocusout and instantly closes
  // the search (the field never appears). So we position the span purely with flex
  // `order` (no DOM move => no blur => the field stays open). Setting `order` is an
  // attribute change, not a childList mutation, so it never re-triggers our observer.
  // On close (no span) we reset the orders. Only when CC header is on + top-nav layout.
  function reorderSearch() {
    try {
      var root = document.documentElement;
      if (!root.classList.contains("cc-header-on") || root.classList.contains("Theme--sidebar")) return;
      var right = document.querySelector("#menu .nav-tile.right");
      if (!right) return;
      var kids = right.children, j;
      var span = document.getElementById("guiSearchBoxSpan");
      if (!span) { for (j = 0; j < kids.length; j++) kids[j].style.removeProperty("order"); return; }
      var toggle = right.querySelector('[onclick*="gui_search"]');
      toggle = toggle ? toggle.closest(".nav-item") : right.querySelector(".nav-item.gui_search");
      if (!toggle) { for (j = 0; j < kids.length; j++) kids[j].style.removeProperty("order"); return; }
      var order = 0;
      for (j = 0; j < kids.length; j++) {
        if (kids[j] === span) continue;                 // placed just before the toggle below
        if (kids[j] === toggle) { span.style.setProperty("order", order); order++; }
        kids[j].style.setProperty("order", order); order++;
      }
    } catch (e) {}
  }
  function watchSearch() {
    try {
      var target = document.getElementById("menu") || document.body;
      var mo = new MutationObserver(function () {
        reorderSearch();
        document.documentElement.classList.toggle("cc-search-open", !!document.getElementById("guiSearchBoxSpan"));
        paintNav();
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
