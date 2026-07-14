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
  // cc.badgeshape is a GLOBAL key (one Badge-Form control for every area), so read it
  // DIRECTLY, not via eff(): eff() would fall back to an UNSET cch.badgeshape when the
  // header's adopt toggle is off, so --cc-b-radius (and thus the menu-bar badge shape)
  // would flip between pages depending on which script set it last.
  function shape() { return ({ pill: "999px", rounded: "6px", square: "0px" })[g("cc.badgeshape", "pill")] || "999px"; }
  var RB = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"];
  var RB_OFF = Math.floor(Math.random() * RB.length);
  // Rainbow is a GLOBAL mode: read cc.rainbow / cc.rbpal / cc.rainbowrot DIRECTLY (not the
  // adopt-gated eff()), exactly like docker.js — so ONE global Rainbow switch colours EVERY
  // enabled area (the menu bar too), regardless of this bar's adopt state. The per-area accent
  // (eff("accent")) stays adopt-gated for the non-rainbow single-colour look.
  function pal() { try { var p = JSON.parse(g("cc.rbpal", "null")); if (p && p.length) return p; } catch (e) {} return RB; }
  function rbOn() { return g("cc.rainbow", "0") === "1"; }
  function rbColor(i) { if (!rbOn()) return accent(); var off = g("cc.rainbowrot", "0") === "0" ? 0 : RB_OFF; var p = pal(); return p[(i + off) % p.length]; }
  // rainbow: colour the active tab, each utility icon box and the usage fill with a
  // rotated palette colour (in accent mode the CSS handles it via --cc-accent, so we
  // just clear our overrides). childList observer only, so these style writes can't loop.
  function paintNav() {
    try {
      // gate on the enabled class: if the menu-bar area is OFF, rb=false -> every branch below
      // removeProperty's, so a disabled area (even with Rainbow ON) never paints and any lingering
      // inline colours are cleared. paintNav runs from apply() + the always-on search observer.
      var rb = rbOn() && document.documentElement.classList.contains("cc-header-on"), n = 0;
      // rainbow: paint EVERY left page tab (active AND idle), then the util icons, then the usage fill —
      // one running counter n sweeps the palette across the whole bar. Was: only .nav-item.active got a
      // colour, so the strip stayed grey and rainbow looked identical to accent mode.
      Array.prototype.slice.call(document.querySelectorAll("#menu .nav-tile:not(.right) .nav-item > a")).forEach(function (aEl) {
        if (rb) { var c = rbColor(n); aEl.style.setProperty("background", c, "important"); aEl.style.setProperty("color", idealText(c), "important"); }
        else { aEl.style.removeProperty("background"); aEl.style.removeProperty("color"); }
        n++;
      });
      Array.prototype.slice.call(document.querySelectorAll("#menu .nav-tile.right .nav-item.util > a")).forEach(function (aEl) {
        var gl = aEl.querySelector("b.system, img.system");
        if (rb) { var c = rbColor(n); aEl.style.setProperty("background", c, "important"); if (gl) gl.style.setProperty("color", idealText(c), "important"); }
        else { aEl.style.removeProperty("background"); if (gl) gl.style.removeProperty("color"); }
        n++;
      });
      var u = document.querySelector("#menu .usage-bar > span");
      if (u) { if (rb) { var cu = rbColor(n); u.style.setProperty("background", cu, "important"); u.style.setProperty("color", idealText(cu), "important"); } else { u.style.removeProperty("background"); u.style.removeProperty("color"); } }
    } catch (e) {}
  }
  function apply() {
    try {
      var root = document.documentElement;
      // MASTER THEMING off (cc.theming="0") behaves like the area being disabled — header is
      // purely presentational. The storage listener re-runs apply(), so a live toggle reverts.
      var on = g("cc.enable.header", "0") !== "0" && g("cc.theming", "1") !== "0";
      root.classList.toggle("cc-header-on", on);
      // paintNav() with cc-header-on now removed => rb=false => it removeProperty's every
      // lingering rainbow inline colour, so a live theming-OFF (even with Rainbow on) fully
      // reverts the menu bar instead of leaving the coloured tabs behind.
      if (!on) { paintNav(); return; }
      var a = accent();
      // ISOLATED accent var — NOT the shared --cc-accent. Other global enhancers (shares.js,
      // the page-specific docker/plugins/vms) also write --cc-accent on documentElement and
      // would clobber the menu-bar colour (and vice-versa); each area now owns its var and the
      // sheet reads --cc-hdr-accent. (--cc-b-radius stays shared: one global Badge-Form.)
      root.style.setProperty("--cc-hdr-accent", a);
      root.style.setProperty("--cc-hdr-accent-text", idealText(a));
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
  // Native gui_search only OPENS on a click; make a 2nd click on the magnifier CLOSE it.
  // Delegated capture-phase listener runs BEFORE the toggle's inline onclick="gui_search()",
  // so when the box is already open we close it and stop the event from re-opening it.
  function wireSearchToggle() {
    document.addEventListener("click", function (e) {
      try {
        if (!document.documentElement.classList.contains("cc-header-on")) return;
        if (!document.getElementById("guiSearchBoxSpan")) return; // not open -> let native open it
        var tgt = e.target && e.target.closest ? e.target.closest(".nav-item.gui_search, [onclick*='gui_search']") : null;
        if (!tgt) return; // click wasn't on the search toggle
        e.preventDefault(); e.stopImmediatePropagation(); // block the inline gui_search() re-open
        if (typeof window.closeSearchBox === "function") { window.closeSearchBox(); return; }
        var s = document.getElementById("guiSearchBoxSpan"); if (s) s.parentNode.removeChild(s);
        var hid = document.querySelectorAll(".nav-item.util, .nav-user.show");
        for (var i = 0; i < hid.length; i++) hid[i].style.removeProperty("display"); // restore what gui_search hid
      } catch (err) {}
    }, true);
  }
  function boot() {
    try { window.ccHeaderApply = apply; } catch (e) {} // let the Settings page live-update this bar same-page
    apply();
    watchSearch();
    wireSearchToggle();
    // the Settings page (or the Docker tab) writes cc.* AND section-specific keys (cch./ccs./
    // ccp./ccv.) from another origin/tab — re-apply on any of them. NB: "cch.accent" does NOT
    // contain the substring "cc." so the old indexOf("cc.")===0 check silently missed it.
    try { window.addEventListener("storage", function (e) { if (e.key && /^cc[a-z]?\./.test(e.key)) apply(); }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
