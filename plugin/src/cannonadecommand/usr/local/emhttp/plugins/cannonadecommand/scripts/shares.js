// CannonadeCommand - GLOBAL Shares/Docker sub-page-tab enhancer.
//
// Loaded on EVERY Unraid page via the Buttons .page hook
// (CannonadeCommand.Shares.page). Like header.js it does the MINIMUM in JS:
//   * toggle html.cc-shares-on -> the auto-injected sheet only takes effect when the
//     "Freigaben" (Shares) area is enabled in CC settings, so a disabled area = ZERO
//     effect on any page.
//   * mirror the CC accent/text/badge-shape vars onto the document root so the sheet
//     can follow the user's configured theme.
//   * the CC tab pills only render when Unraid's [display] tabs=0 (Tabbed) mode is on;
//     ensureTabbed() flips that global setting on ONCE (then reloads) when the area is
//     enabled and a multi-subpage page (/Shares or /Docker) is showing NO tab bar.
//   * a single-tab bar (e.g. /Docker's lone tab) is redundant -> hideRedundantTabs()
//     is the JS fallback for the :has() CSS; the /Shares page legitimately keeps its
//     one User-Shares tab, so it is excluded.
// All actual styling lives in sheets/CannonadeCommand.Shares.css, every rule of it
// scoped to html.cc-shares-on. Default is OFF (enabling flips Unraid's global tabbed
// setting): the user opts in under Settings > CannonadeCommand > Bereiche > Freigaben.
(function () {
  "use strict";
  var mo = null, moPending = false, tabbedTried = false;
  function g(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function idealText(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#fff";
    var n = parseInt(m[1], 16), L = 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255);
    return L > 150 ? "#161616" : "#fff";
  }
  // adopt toggle: cc.styleshares on -> shared cc.* keys, else this area's own ccsh.* keys
  function eff(k, d) { return g("cc.styleshares", "1") !== "0" ? g("cc." + k, d) : g("ccsh." + k, d); }
  function accent() { var a = eff("accent", "#2f6feb"); return /^#[0-9a-f]{6}$/i.test(a) ? a : "#2f6feb"; }
  // cc.badgeshape is a GLOBAL key (one Badge-Form control for every area) -> read it
  // DIRECTLY, not via eff(): eff() would fall back to an UNSET ccsh.badgeshape when the
  // adopt toggle is off, so --cc-b-radius would flip between pages (see header.js).
  function shape() { return ({ pill: "999px", rounded: "6px", square: "0px" })[g("cc.badgeshape", "pill")] || "999px"; }
  var RB = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"];
  var RB_OFF = Math.floor(Math.random() * RB.length);
  function pal() { try { var p = JSON.parse(eff("rbpal", "null")); if (p && p.length) return p; } catch (e) {} return RB; }
  function rbOn() { return eff("rainbow", "0") === "1"; }
  function rbColor(i) { if (!rbOn()) return accent(); var off = eff("rainbowrot", "0") === "0" ? 0 : RB_OFF; var p = pal(); return p[(i + off) % p.length]; }
  // /Shares editor is /Shares/Share?name=... -> a strict, trailing-slash-normalised
  // pathname check keeps us on the LANDING pages only (see settingsgrid.onSettings).
  function pn() { try { return location.pathname.replace(/\/+$/, ""); } catch (e) { return ""; } }
  // tiny i18n (same shape as docker.js): en fallback, de when the page lang is German.
  var LANG = (document.documentElement.lang || navigator.language || "en").slice(0, 2).toLowerCase();
  var T = { de: { browse: "Durchsuchen" }, en: { browse: "Browse" } };
  function t(k) { return (T[LANG] || T.en)[k] || T.en[k]; }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  // rainbow: paint the ACTIVE tab button a rotated palette colour; accent mode = clear
  // our overrides so the sheet's --cc-accent shows through. Inline style writes are
  // attribute changes, so they never re-trigger the childList observer.
  function paintTabs() {
    try {
      var rb = rbOn(), btns = document.querySelectorAll('#displaybox nav.tabs button[role="tab"]');
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i], active = b.getAttribute("aria-selected") === "true";
        if (rb && active) { var c = rbColor(i); b.style.setProperty("background", c, "important"); b.style.setProperty("color", idealText(c), "important"); }
        else { b.style.removeProperty("background"); b.style.removeProperty("color"); }
      }
    } catch (e) {}
  }
  // Enabling the area needs Unraid's [display] tabs=0 (Tabbed) mode so a multi-section
  // page renders the tab bar we restyle. The current value is NOT exposed to JS, so we
  // infer "tabbed is OFF" from the ABSENCE of #displaybox nav.tabs on a page that HAS
  // >=2 subpages (/Shares or /Docker). POST once (csrf_token is auto-appended by the
  // global $.ajaxPrefilter) + reload; the module-level guard makes it fire at most once
  // per page load, and the reloaded page HAS nav.tabs -> the query short-circuits, so no
  // reload loop.
  function ensureTabbed() {
    try {
      if (tabbedTried) return;
      if (g("cc.enable.shares", "0") === "0") return;
      var p = pn();
      if (p !== "/Shares" && p !== "/Docker") return;
      if (document.querySelector("#displaybox nav.tabs")) return; // already tabbed
      if (!window.jQuery) return;
      // sessionStorage guard: attempt the tabbed flip at most ONCE per browser session.
      // The module flag only covers a single page load — without this, a POST that never
      // takes (write blocked / setting won't stick) would re-fire after every reload =
      // infinite reload loop. On success the reloaded page HAS nav.tabs and short-circuits
      // above anyway; on failure the session flag stops the retry. Cleared on a new session.
      try { if (sessionStorage.getItem("cc-tabbed-tried") === "1") return; sessionStorage.setItem("cc-tabbed-tried", "1"); } catch (e) {}
      tabbedTried = true;
      window.jQuery.post("/update.php", { "#file": "dynamix/dynamix.cfg", "#section": "display", "tabs": "0" }, function () {
        try { location.reload(); } catch (e) {}
      });
    } catch (e) {}
  }
  // A single-tab bar (e.g. /Docker's lone redundant tab) adds nothing -> hide it. The
  // CSS :has() rule does the same; this is the fallback for browsers without :has. The
  // /Shares page legitimately shows one User-Shares tab, so it is never hidden.
  function hideRedundantTabs() {
    try {
      if (g("cc.enable.shares", "0") === "0") return;
      // the CSS :has() rule already does this AND reverts cleanly when the area is disabled.
      // Only run the JS fallback where :has is unsupported, so we never leave an inline
      // display:none that outlives the sheet (pre-121 Firefox only).
      if (window.CSS && CSS.supports && CSS.supports("selector(:has(*))")) return;
      var navs = document.querySelectorAll("#displaybox nav.tabs");
      for (var i = 0; i < navs.length; i++) {
        var nav = navs[i], btns = nav.querySelectorAll('button[role="tab"]');
        if (btns.length <= 1 && pn() !== "/Shares") nav.style.display = "none";
      }
    } catch (e) {}
  }
  // /Shares list polish: wrap each SMB/NFS/Storage/Size/Free value in a CC badge and lift
  // the browse link (a.view) into its own "Browse" column. Unraid replaces the whole tbody
  // innerHTML on every Compute/refill, wiping our work AND any marker, so this re-runs from
  // the MutationObserver; a per-row data-cc-sh set-and-bail guard makes each pass idempotent
  // (no double-wrap, no observer loop — a marked row emits no mutations). The browse <td>
  // shifts nth-child, so we snapshot the cells BEFORE inserting it.
  function badgeCell(td) {
    if (!td || td.querySelector(":scope > .cc-b")) return; // already wrapped
    var txt = (td.textContent || "").trim();
    if (txt === "" || txt === "-") return; // leave empty / "-" un-badged
    var b = el("span", "cc-b"), v = el("span", "cc-b-v");
    while (td.firstChild) v.appendChild(td.firstChild); // keep links/icons/orbs working
    b.appendChild(v); td.appendChild(b);
  }
  function enhanceRow(tr) {
    if (tr.getAttribute("data-cc-sh")) return; // set-and-bail idempotency
    tr.setAttribute("data-cc-sh", "1");
    var empty = tr.querySelector(":scope > td.empty");
    if (empty) { empty.colSpan = (empty.colSpan || 1) + 1; return; } // no-shares placeholder: just widen
    var tds = Array.prototype.slice.call(tr.children); // snapshot BEFORE inserting the browse cell
    var name = tds[0]; if (!name) return;
    var bt = el("td", "cc-browse-col"); // new Browse cell, always inserted (keeps column alignment)
    var view = name.querySelector("a.view");
    if (view && view.getAttribute("href")) { // real browse link (disk sub-rows carry an empty a.view)
      view.classList.add("cc-b-browse");
      if (!view.querySelector(".cc-b-lab")) view.appendChild(el("span", "cc-b-lab", t("browse")));
      bt.appendChild(view); // moves it OUT of the Name cell, href/onclick intact
    }
    name.parentNode.insertBefore(bt, name.nextSibling);
    for (var i = 2; i < tds.length; i++) badgeCell(tds[i]); // SMB, NFS, Storage, Size, Free (skip Name+Comment)
  }
  function enhanceHead(table) {
    var head = table && table.querySelector("thead tr");
    if (!head || head.getAttribute("data-cc-sh")) return;
    head.setAttribute("data-cc-sh", "1");
    var first = head.children[0]; if (!first) return;
    head.insertBefore(el("td", "cc-browse-col", t("browse")), first.nextSibling);
  }
  function enhanceShares() {
    try {
      if (g("cc.enable.shares", "0") === "0") return; // area disabled -> don't touch the DOM
      if (pn() !== "/Shares") return; // only the Freigaben landing page
      var ids = ["shareslist", "disk_list"]; // User Shares + Disk Shares tables
      for (var j = 0; j < ids.length; j++) {
        var tb = document.getElementById(ids[j]); if (!tb) continue;
        var table = tb.closest ? tb.closest("table") : null; if (table) enhanceHead(table);
        var rows = tb.children;
        for (var r = 0; r < rows.length; r++) if (rows[r].tagName === "TR") enhanceRow(rows[r]);
      }
    } catch (e) {}
  }
  function apply() {
    try {
      var root = document.documentElement;
      var on = g("cc.enable.shares", "0") !== "0"; // default OFF (flips Unraid's tabbed setting: opt in)
      root.classList.toggle("cc-shares-on", on);
      // /Shares legitimately shows one tab family -> mark it so the CSS single-tab-hide excludes it
      root.classList.toggle("cc-on-shares", on && pn() === "/Shares");
      if (!on) return;
      var a = accent();
      // ISOLATED accent var — NOT the shared --cc-accent. Every global enhancer (header.js,
      // shares.js) writes --cc-accent on documentElement, so they clobber each other: the
      // Freigaben colour bled onto the menu bar and the header colour got overwritten. Each
      // area now owns its var; Shares.css reads --cc-shr-accent only. (--cc-b-radius stays
      // shared: it's the one global Badge-Form, identical for every area.)
      root.style.setProperty("--cc-shr-accent", a);
      root.style.setProperty("--cc-shr-accent-text", idealText(a));
      root.style.setProperty("--cc-b-radius", shape());
      root.classList.toggle("cc-shares-rb", rbOn());
      ensureTabbed();
      hideRedundantTabs();
      paintTabs();
      enhanceShares();
    } catch (e) {}
  }
  // Observe the content container ONLY (never body). apply()'s follow-ups make no
  // childList changes (a class on <html> + inline styles = attribute changes), so they
  // can't re-trigger this childList observer; debounced for AJAX content swaps.
  function watch() {
    try {
      var host = document.getElementById("displaybox") || document.getElementById("content");
      if (!host) return;
      mo = new MutationObserver(function () {
        if (moPending) return; moPending = true;
        setTimeout(function () { moPending = false; hideRedundantTabs(); paintTabs(); enhanceShares(); }, 150);
      });
      mo.observe(host, { childList: true, subtree: true });
    } catch (e) {}
  }
  function boot() {
    try { window.ccSharesApply = apply; } catch (e) {} // let the Settings page live-update
    if (g("cc.enable.shares", "0") === "0") return; // area disabled in CC settings
    apply();
    watch();
    // the CC settings page writes cc.*/ccsh.* keys from another origin/tab -> re-apply on
    // any of them. NB "ccsh.accent" needs [a-z]* (two letters) to be caught (see header.js).
    try { window.addEventListener("storage", function (e) { if (e && e.key && /^cc[a-z]*\./.test(e.key)) apply(); }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
