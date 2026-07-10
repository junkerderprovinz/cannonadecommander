// CannonadeCommand - GLOBAL Settings-page category-icon restyler.
//
// Loaded on EVERY Unraid page via the Buttons .page hook
// (CannonadeCommand.SettingsGrid.page). Like header.js it does the MINIMUM in JS:
//   * ONLY on the /Settings LANDING page AND when the "Einstellungen" area is enabled
//     (cc.enable.settings != "0") -> toggle html.cc-settingsgrid-on so the auto-injected
//     sheet turns each category-tile icon wrapper (a bare <span> inside the tile <a>)
//     into a big square accent badge. Any other page (incl. the identically-marked
//     /Tools) or a disabled area = ZERO effect anywhere.
//   * mirror the CC accent/text/badge-shape vars onto the document root; in rainbow mode
//     paint each badge a rotated palette colour (accent mode = pure CSS via --cc-accent).
// All sizing/shape lives in sheets/CannonadeCommand.SettingsGrid.css, every rule of it
// scoped html.cc-settingsgrid-on. Default ON (opt-out under
// Settings > CannonadeCommand > Bereiche > Einstellungen).
(function () {
  "use strict";
  var mo = null, moPending = false;
  function g(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function idealText(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#fff";
    var n = parseInt(m[1], 16), L = 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255);
    return L > 150 ? "#161616" : "#fff";
  }
  // adopt toggle: cc.stylesettings on -> shared cc.* keys, else this area's own ccs.* keys
  function eff(k, d) { return g("cc.stylesettings", "1") !== "0" ? g("cc." + k, d) : g("ccs." + k, d); }
  function accent() { var a = eff("accent", "#2f6feb"); return /^#[0-9a-f]{6}$/i.test(a) ? a : "#2f6feb"; }
  // cc.badgeshape is SHARED across all areas; eff() returns it while the adopt toggle is on
  function shape() { return ({ pill: "999px", rounded: "6px", square: "0px" })[eff("badgeshape", "pill")] || "999px"; }
  var RB = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"];
  var RB_OFF = Math.floor(Math.random() * RB.length);
  function pal() { try { var p = JSON.parse(eff("rbpal", "null")); if (p && p.length) return p; } catch (e) {} return RB; }
  function rbOn() { return eff("rainbow", "0") === "1"; }
  function rbColor(i) { if (!rbOn()) return accent(); var off = eff("rainbowrot", "0") === "0" ? 0 : RB_OFF; var p = pal(); return p[(i + off) % p.length]; }
  // Settings LANDING page only. A Settings sub-page is /Settings/<Name>; /Tools has the
  // SAME .Panel markup, so a strict pathname check is what keeps us off both.
  function onSettings() { try { return location.pathname.replace(/\/+$/, "") === "/Settings"; } catch (e) { return false; } }
  // rainbow: paint each badge <span> a rotated palette colour + contrast glyph; accent
  // mode: clear our inline overrides so the sheet's --cc-accent shows through. Inline
  // style writes are attribute changes, so they never re-trigger the childList observer.
  function paintGrid() {
    try {
      var rb = rbOn(), spans = document.querySelectorAll("#displaybox .Panel > a > span");
      for (var i = 0; i < spans.length; i++) {
        var s = spans[i], gl = s.querySelector("i.PanelIcon");
        if (rb) {
          var c = rbColor(i);
          s.style.setProperty("background", c, "important");
          if (gl) gl.style.setProperty("color", idealText(c), "important");
        } else {
          s.style.removeProperty("background");
          if (gl) gl.style.removeProperty("color");
        }
      }
    } catch (e) {}
  }
  function apply() {
    try {
      var root = document.documentElement;
      var on = g("cc.enable.settings", "1") !== "0" && onSettings();
      root.classList.toggle("cc-settingsgrid-on", on);
      if (!on) return;
      var a = accent();
      root.style.setProperty("--cc-accent", a);
      root.style.setProperty("--cc-accent-text", idealText(a));
      root.style.setProperty("--cc-b-radius", shape());
      paintGrid();
    } catch (e) {}
  }
  // Observe the content container ONLY (never body). apply() makes no childList changes
  // (toggles a class on <html> + writes inline styles = attribute changes), so it can't
  // re-trigger this childList observer; debounced for AJAX content swaps.
  function watch() {
    try {
      var host = document.getElementById("displaybox") || document.getElementById("content");
      if (!host) return;
      mo = new MutationObserver(function () {
        if (moPending) return; moPending = true;
        setTimeout(function () { moPending = false; apply(); }, 150);
      });
      mo.observe(host, { childList: true, subtree: true });
    } catch (e) {}
  }
  function boot() {
    if (g("cc.enable.settings", "1") === "0") return; // area disabled in CC settings
    apply();
    watch();
    // the CC settings page writes cc.*/ccs.* keys from another origin/tab
    try { window.addEventListener("storage", function (e) { if (e && e.key && e.key.indexOf("cc") === 0) apply(); }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
