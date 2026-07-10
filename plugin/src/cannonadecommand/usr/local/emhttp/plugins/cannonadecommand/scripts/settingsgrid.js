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
  // cc.badgeshape is a GLOBAL key -> read it DIRECTLY, not via eff() (see header.js): an
  // adopt-aware read would fall back to an unset ccs.badgeshape and flip the shape per page.
  function shape() { return ({ pill: "999px", rounded: "6px", square: "0px" })[g("cc.badgeshape", "pill")] || "999px"; }
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
  // COLOUR-TINT mode (mutually exclusive with the accent badge): when the badge is OFF
  // (ccs.iconbg="0") and a colour is chosen (ccs.iconcolor), recolour each tile icon to
  // that colour instead. Font glyphs get an !important text colour; raster img.PanelImg
  // get the SAME shading-preserving feColorMatrix the Docker tab uses (own host+filter id
  // here). ccs.iconstrength blends the RASTER tint back over the original; it does not
  // affect font glyphs (a flat colour has no shading to keep). ccs.* read directly via g().
  function ensureTintFilter() {
    var ic = g("ccs.iconcolor", ""), m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ic || "");
    var host = document.getElementById("cc-sg-tint-svg");
    if (!m) { if (host) host.remove(); return false; }
    var tr = parseInt(m[1], 16) / 255, tg = parseInt(m[2], 16) / 255, tb = parseInt(m[3], 16) / 255;
    var s = (Math.max(10, parseInt(g("ccs.iconstrength", "100"), 10)) / 100).toFixed(3);
    if (!host) { host = document.createElement("div"); host.id = "cc-sg-tint-svg"; host.setAttribute("aria-hidden", "true"); host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(host); }
    var lum = function (c) { return (0.2126 * c).toFixed(4) + " " + (0.7152 * c).toFixed(4) + " " + (0.0722 * c).toFixed(4); };
    var mid = '<feColorMatrix in="SourceGraphic" type="matrix" result="flat" values="' + lum(tr) + ' 0 0 ' + lum(tg) + ' 0 0 ' + lum(tb) + ' 0 0 0 0 0 1 0"/>';
    if (parseFloat(s) < 0.999) mid += '<feComponentTransfer in="flat" result="faded"><feFuncA type="linear" slope="' + s + '"/></feComponentTransfer><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="faded"/></feMerge>';
    host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="cc-sg-icon-tint" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">' + mid + '</filter></svg>';
    return true;
  }
  // paint the tint onto every tile icon: glyph colour + raster filter; also drop any stray
  // rainbow badge background the span may carry from a previous badge-mode render.
  function paintTint() {
    try {
      var ic = g("ccs.iconcolor", ""), f = ensureTintFilter() ? "url(#cc-sg-icon-tint)" : "";
      var spans = document.querySelectorAll("#displaybox .Panel > a > span");
      for (var i = 0; i < spans.length; i++) {
        var s = spans[i], gl = s.querySelector("i.PanelIcon"), im = s.querySelector("img.PanelImg");
        s.style.removeProperty("background");
        if (gl) gl.style.setProperty("color", ic, "important");
        if (im) im.style.filter = f;
      }
    } catch (e) {}
  }
  // undo the tint everywhere (inline glyph colour + raster filter + stray span background)
  // and drop the filter host, so badge mode / a disabled area starts from a clean slate.
  function clearTint() {
    try {
      var spans = document.querySelectorAll("#displaybox .Panel > a > span");
      for (var i = 0; i < spans.length; i++) {
        var s = spans[i], gl = s.querySelector("i.PanelIcon"), im = s.querySelector("img.PanelImg");
        s.style.removeProperty("background");
        if (gl) gl.style.removeProperty("color");
        if (im) im.style.filter = "";
      }
      var host = document.getElementById("cc-sg-tint-svg"); if (host) host.remove();
    } catch (e) {}
  }
  function apply() {
    try {
      var root = document.documentElement;
      var live = g("cc.enable.settings", "1") !== "0" && onSettings();
      var badge = live && g("ccs.iconbg", "1") !== "0";
      // tint only when the badge is OFF and a valid colour is set (mutually exclusive UI)
      var tint = live && !badge && /^#[0-9a-f]{6}$/i.test(g("ccs.iconcolor", ""));
      root.classList.toggle("cc-settingsgrid-on", badge);
      root.classList.toggle("cc-settingsgrid-tint", tint);
      if (badge) {
        clearTint(); // badge takes precedence — drop any tint from a previous render
        var a = accent();
        root.style.setProperty("--cc-accent", a);
        root.style.setProperty("--cc-accent-text", idealText(a));
        root.style.setProperty("--cc-b-radius", shape());
        paintGrid();
      } else if (tint) {
        paintTint();
      } else {
        clearTint(); // neither mode active — leave the native icons untouched
      }
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
