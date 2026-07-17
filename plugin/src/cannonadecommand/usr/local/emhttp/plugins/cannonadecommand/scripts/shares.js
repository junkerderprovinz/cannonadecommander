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
  // The /Main (START) page is its OWN CC area (cc.enable.main / cc.stylemain / ccm.*), living in this
  // enhancer since it reuses the flatten + badge machinery. On /Main we set --cc-shr-accent to the START
  // accent (a distinct page load, so no clash with the Shares list colour), so every shares-scoped rule
  // there paints in the Start colour without needing a second CSS scope.
  function effMain(k, d) { return g("cc.stylemain", "1") !== "0" ? g("cc." + k, d) : g("ccm." + k, d); }
  function mainAccent() { var a = effMain("accent", "#2f6feb"); return /^#[0-9a-f]{6}$/i.test(a) ? a : "#2f6feb"; }
  // cc.badgeshape is a GLOBAL key (one Badge-Form control for every area) -> read it
  // DIRECTLY, not via eff(): eff() would fall back to an UNSET ccsh.badgeshape when the
  // adopt toggle is off, so --cc-b-radius would flip between pages (see header.js).
  function shape() { return ({ pill: "999px", rounded: "6px", square: "0px", circle: "999px" })[g("cc.badgeshape", "pill")] || "999px"; }
  var RB = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"];
  var RB_OFF = Math.floor(Math.random() * RB.length);
  // Rainbow is a GLOBAL mode: read cc.rainbow / cc.rbpal / cc.rainbowrot DIRECTLY (not the
  // adopt-gated eff()), like docker.js — one global Rainbow switch colours every enabled area.
  // The per-area accent (eff("accent")) stays adopt-gated for the non-rainbow single colour.
  function pal() { try { var p = JSON.parse(g("cc.rbpal", "null")); if (p && p.length) return p; } catch (e) {} return RB; }
  function rbOn() { return g("cc.rainbow", "0") === "1"; }
  function rbColor(i) { if (!rbOn()) return accent(); var off = g("cc.rainbowrot", "0") === "0" ? 0 : RB_OFF; var p = pal(); return p[(i + off) % p.length]; }
  // rainbow "active only" sub-mode (cc.rbmode=active): idle badges neutral, active painted, hover colours.
  function rbNeutral() { return g("cc.rbmode", "all") === "active"; }
  // /Shares editor is /Shares/Share?name=... -> a strict, trailing-slash-normalised
  // pathname check keeps us on the LANDING pages only (see settingsgrid.onSettings).
  function pn() { try { return location.pathname.replace(/\/+$/, ""); } catch (e) { return ""; } }
  // Browse / file manager. Reached as /<parent>/Browse?dir=… — the parent segment VARIES (/Shares/Browse
  // from ShareList.php's a.view, /Main/Browse from DiskList.php, /<task>/Browse from the global File
  // Manager button), so unlike onShares/onShareDetail this cannot be an exact pn() match; suffix-match
  // instead. The second condition is a DOM sentinel: table.indexer.tablesorter is STATIC markup
  // (Browse.page), present on first paint before the AJAX tbody lands. Do NOT drop it as "redundant" —
  // it is what stops a third-party page merely NAMED Browse from matching.
  function onBrowse() {
    try { return /\/Browse$/.test(pn()) && !!document.querySelector("#displaybox table.indexer.tablesorter"); } catch (e) { return false; }
  }
  // /Stats — the System Stats page. NOT part of unraid/webgui: it ships from the separate
  // unraid/dynamix repo (source/system-stats), which is why it is absent from the webgui source tree.
  // Stats.page is Type="xmenu" Tabs="true", so it renders Unraid's STANDARD tabbed layout
  // (#displaybox > nav.tabs > .tabs-container > button[role=tab]) — the same bar this area already
  // restyles everywhere else. We only need the marker so the alignment anchor + the control-row fix
  // below can be page-scoped; there is no plugin-internal markup in our selectors, so if the plugin is
  // absent the class simply never appears.
  function onStats() { return pn() === "/Stats"; }
  // /Stats: SystemStats.page injects its control group (`$('.tabs').append(<span class="status">…)`) —
  // two interval <select>s + a Reset button — INTO nav.tabs. The user wants it BELOW the graphs, not in
  // the tab bar. CSS `order` can't move it out of nav.tabs, so we relocate the whole <span.status> to
  // the end of #displaybox (after the graphs). It's moved as ONE unit, so the plugin's modeller()/
  // resizer() onchange handlers (by id) and its own $('span.status').show()/.hide() (by class) keep
  // working wherever it sits. Idempotent via data-cc-moved; re-homed to nav.tabs on teardown.
  function moveStatsControls() {
    try {
      var box = document.getElementById("displaybox"); if (!box) return;
      var st = box.querySelector("span.status"); if (!st) return;
      if (st.getAttribute("data-cc-moved") === "1" && st.parentNode === box) return;   // already at the bottom
      box.appendChild(st);                       // -> last child of #displaybox, under the graphs
      st.setAttribute("data-cc-moved", "1");
    } catch (e) {}
  }
  function statsControlsTeardown() {
    try {
      var st = document.querySelector("#displaybox > span.status[data-cc-moved]"); if (!st) return;
      var tabs = document.querySelector("#displaybox nav.tabs");
      if (tabs) tabs.appendChild(st);            // native home: SystemStats.page appended it to .tabs
      st.removeAttribute("data-cc-moved");
    } catch (e) {}
  }
  // tiny i18n (same shape as docker.js): en fallback, de when the page lang is German.
  var LANG = (document.documentElement.lang || navigator.language || "en").slice(0, 2).toLowerCase();
  var T = { de: { browse: "Durchsuchen", protected: "Geschützt", unprotected: "Ungeschützt", protection: "Schutz" }, en: { browse: "Browse", protected: "Protected", unprotected: "Unprotected", protection: "Protection" } };
  function t(k) { return (T[LANG] || T.en)[k] || T.en[k]; }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  // ── Browse (file manager): wrap the OWNER / PERMISSION / SIZE cell values in hugging CC badges (user:
  // "badges in alle Spalten, der Dateimanager auf allen Ebenen im CC-Style"). SAFETY (this page deletes
  // and moves): we touch ONLY the value cells owner_N/perm_N/the size cell — NEVER the check glyph
  // (td:first-child), the name cell, the Location cell (its icon colour encodes encryption state) or the
  // actions cell. We wrap the cell's existing TEXT NODE in a span; we do not add/remove columns, change
  // any cell's display, or alter tablesorter's data- attributes (sort still reads the td, not the span).
  // Idempotent via .cc-bcell; the tbody is AJAX-replaced, so this re-runs from the observer.
  function ccBrowseCell(td, cls) {
    if (!td || td.classList.contains("cc-bcell")) return;
    var txt = (td.textContent || "").trim(); if (!txt) return;
    var b = el("span", "cc-fmb " + (cls || ""), txt);   // cc-fmb = file-manager cell badge (distinct from the Shares-list .cc-b-browse link)
    td.textContent = ""; td.appendChild(b); td.classList.add("cc-bcell");
  }
  function enhanceBrowse() {
    try {
      if (!onBrowse()) return;
      var rows = document.querySelectorAll("#displaybox table.indexer tbody:not(.tablesorter-infoOnly) tr");
      for (var i = 0; i < rows.length; i++) {
        var tr = rows[i];
        ccBrowseCell(tr.querySelector('td[id^="owner_"]'), "cc-b-owner");
        ccBrowseCell(tr.querySelector('td[id^="perm_"]'), "cc-b-perm");
        // size = the td carrying a numeric data="" that is NOT the timestamp/name/loc; it sits right
        // after perm_N. Guard by "has a data attr and a plain text value, no child element".
        var perm = tr.querySelector('td[id^="perm_"]');
        var size = perm && perm.nextElementSibling;
        if (size && size.hasAttribute("data") && !size.querySelector("*") && !size.classList.contains("loc")) ccBrowseCell(size, "cc-b-size");
        // Modified/Date column (user: "badges in alle Spalten"): the plain-text td after size that also
        // carries a numeric data="" timestamp. Same safety guard (no child element, not the Location cell).
        var dateTd = size && size.nextElementSibling;
        if (dateTd && dateTd.hasAttribute("data") && !dateTd.querySelector("*") && !dateTd.classList.contains("loc")) ccBrowseCell(dateTd, "cc-b-date");
      }
    } catch (e) {}
  }
  // rainbow: paint the ACTIVE tab button a rotated palette colour; accent mode = clear
  // our overrides so the sheet's --cc-accent shows through. Inline style writes are
  // attribute changes, so they never re-trigger the childList observer.
  function paintTabs() {
    try {
      var rb = rbOn(), neutral = rb && rbNeutral(), btns = document.querySelectorAll('#displaybox nav.tabs button[role="tab"]');
      document.documentElement.classList.toggle("cc-shares-rbneutral", neutral); // also set by paintRows; needed here for the /Docker tab bar where paintRows never runs
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i], active = b.getAttribute("aria-selected") === "true";
        if (!rb) { b.style.removeProperty("background"); b.style.removeProperty("color"); b.style.removeProperty("--cc-rb-c"); b.style.removeProperty("--cc-rb-ct"); continue; }
        var c = rbColor(i), tc = idealText(c);
        b.style.setProperty("--cc-rb-c", c); b.style.setProperty("--cc-rb-ct", tc); // per-tab colour for the neutral-mode :hover
        // "all" mode paints every tab; "active only" paints ONLY the active tab (idle -> grey via base CSS, colour on hover)
        if (!neutral || active) { b.style.setProperty("background", c, "important"); b.style.setProperty("color", tc, "important"); }
        else { b.style.removeProperty("background"); b.style.removeProperty("color"); }
      }
    } catch (e) {}
  }
  // The share DETAIL page has NO tab bar (the sub-tabs are stacked cards), so paintTabs never touches
  // it — paint each card's title badge here instead, so rainbow follows the rotated palette on the
  // detail page too. Non-rainbow: clear the inline colour and the CSS var(--cc-shr-accent) shows.
  function paintCards() {
    try {
      if (pn() !== "/Shares/Share") return;
      var rb = rbOn(), heads = document.querySelectorAll("#displaybox .cc-card-head");
      for (var i = 0; i < heads.length; i++) {
        var h = heads[i];
        if (rb) { var c = rbColor(i); h.style.setProperty("background", c, "important"); h.style.setProperty("color", idealText(c), "important"); }
        else { h.style.removeProperty("background"); h.style.removeProperty("color"); }
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
      // re-gated from cc.enable.shares to cc.theming so ANY theming-on install adopts Unraid's Tabbed
      // mode once (the Tab-Ansicht feature needs it on /Shares, /Docker AND /Main). boot() still gates
      // the whole enhancer on cc.enable.shares, so in practice this fires when the Freigaben area is on.
      if (g("cc.theming", "1") === "0") return;
      var p = pn();
      if (p !== "/Shares" && p !== "/Docker" && p !== "/Main") return;
      if (p === "/Main" && g("cc.enable.main", "0") === "0") return; // /Main only flips Tabbed when the Start area is on
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
        if (btns.length <= 1 && pn() !== "/Shares" && pn() !== "/Shares/Share") nav.style.display = "none"; // keep the detail page's bar (holds the nav arrows)
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
  // Protected-status orb (i.orb.green-orb = protected, i.orb.yellow-orb/fa-warning =
  // unprotected) -> a small SEMANTIC pill for the OWN Status column. Hides the bare orb but
  // keeps its tooltip on the pill. Returns the pill, or null when there's no status orb (e.g.
  // disk sub-rows), so enhanceRow can drop it into the leading Status <td>.
  function statusPill(name) {
    var orb = name.querySelector("i.orb, i.green-orb, i.yellow-orb");
    if (!orb) return null;
    var cn = orb.className || "", green = /green-orb/.test(cn), yellow = /yellow-orb|fa-warning/.test(cn);
    if (!green && !yellow) return null;
    var sb = el("span", "cc-b-status " + (green ? "cc-b-prot" : "cc-b-unprot"), t(green ? "protected" : "unprotected"));
    var infoA = orb.closest("a"); // a.info.nohand — hide the bare orb, keep its tooltip on the pill
    if (infoA) { var ti = infoA.getAttribute("title"); if (ti) sb.title = ti; infoA.style.setProperty("display", "none", "important"); }
    else orb.style.setProperty("display", "none", "important");
    return sb;
  }
  // Turn the share-name link into a LARGE (lg) badge (href/onclick intact). Idempotent via the
  // class guard so a tbody refill never double-wraps; called only from the guarded enhanceRow.
  function enhanceName(name) {
    var nl = name.querySelector('a[href*="/Share?name="]'); // the share-name link
    if (nl && !nl.classList.contains("cc-b-name")) { nl.classList.add("cc-b"); nl.classList.add("cc-b-name"); }
  }
  // Row -> [Name] [Status] [Browse] [Comment] [values…]. The Status pill and the Browse control
  // each get their OWN column to the RIGHT of the name (user request); both cells are ALWAYS
  // inserted so the body column count matches the head. Snapshot the original cells BEFORE
  // inserting, since the two new <td>s shift nth-child. Idempotent via data-cc-sh set-and-bail.
  function enhanceRow(tr) {
    if (tr.getAttribute("data-cc-sh")) return; // set-and-bail idempotency
    tr.setAttribute("data-cc-sh", "1");
    var empty = tr.querySelector(":scope > td.empty");
    if (empty) { empty.colSpan = (empty.colSpan || 1) + 2; return; } // no-shares placeholder: widen by the 2 new cols
    var tds = Array.prototype.slice.call(tr.children); // snapshot BEFORE inserting the Status+Browse cells
    var name = tds[0]; if (!name) return;
    var st = el("td", "cc-status-col"); // Status cell, inserted right AFTER the Name cell
    var pill = statusPill(name); if (pill) st.appendChild(pill);
    name.parentNode.insertBefore(st, name.nextSibling);
    var bt = el("td", "cc-browse-col"); // Browse cell, inserted AFTER the Status cell
    var view = name.querySelector("a.view");
    if (view && view.getAttribute("href")) { // real browse link (disk sub-rows carry an empty a.view)
      view.classList.add("cc-b-browse");
      var ic = view.querySelector("i"); if (ic) ic.parentNode.removeChild(ic); // drop the folder glyph -> text-only badge
      if (!view.querySelector(".cc-b-lab")) view.appendChild(el("span", "cc-b-lab", t("browse")));
      bt.appendChild(view); // moves it OUT of the Name cell, href/onclick intact
    }
    name.parentNode.insertBefore(bt, st.nextSibling);
    enhanceName(name); // name link -> lg badge (status + browse have already left this cell)
    for (var i = 2; i < tds.length; i++) badgeCell(tds[i]); // SMB, NFS, Storage, Size, Free (skip Name+Comment)
  }
  function enhanceHead(table) {
    var head = table && table.querySelector("thead tr");
    if (!head || head.getAttribute("data-cc-sh")) return;
    head.setAttribute("data-cc-sh", "1");
    var name = head.children[0]; if (!name) return;
    var sh = el("td", "cc-status-col", t("protection"));
    head.insertBefore(sh, name.nextSibling); // Status header AFTER Name
    head.insertBefore(el("td", "cc-browse-col", t("browse")), sh.nextSibling); // Browse header AFTER Status
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
  // Rainbow PER ROW: when rainbow is on, paint EACH row's name + value badges (.cc-b) a
  // SINGLE rotated palette colour rbColor(rowIndex) with idealText() contrast, so a whole
  // row shares one colour. The Browse pill (a.cc-b-browse) and the semantic status pill
  // (.cc-b-status) are NOT .cc-b, so they keep their own colours. Accent mode: clear the
  // inline colour so the sheet's --cc-shr-accent default shows. Writes inline styles ONLY
  // (attribute changes) — no childList mutation, so the MutationObserver can't loop; the row
  // index counts only real (non-placeholder) rows so it stays stable across tbody refills.
  function paintRows() {
    try {
      if (g("cc.enable.shares", "0") === "0") return;
      if (pn() !== "/Shares") return;
      var rb = rbOn(), neutral = rb && rbNeutral(), ids = ["shareslist", "disk_list"];
      document.documentElement.classList.toggle("cc-shares-rbneutral", neutral); // "active only": rows neutral, whole row colours on hover
      for (var j = 0; j < ids.length; j++) {
        var tb = document.getElementById(ids[j]); if (!tb) continue;
        var rows = tb.children, ri = 0;
        for (var r = 0; r < rows.length; r++) {
          var tr = rows[r]; if (tr.tagName !== "TR" || tr.querySelector(":scope > td.empty")) continue; // skip the no-shares placeholder
          var bs = tr.querySelectorAll(".cc-b, .cc-b-browse"); // browse pill is coloured too now
          if (!rb) {
            tr.style.removeProperty("--cc-rb-c"); tr.style.removeProperty("--cc-rb-ct");
            for (var k = 0; k < bs.length; k++) { bs[k].style.removeProperty("background"); bs[k].style.removeProperty("color"); }
            ri++; continue;
          }
          var c = rbColor(ri), tc = idealText(c);
          tr.style.setProperty("--cc-rb-c", c); tr.style.setProperty("--cc-rb-ct", tc); // stamp on the ROW: custom props inherit to every badge + drive the neutral-mode :hover
          for (var k = 0; k < bs.length; k++) {
            if (!neutral) { bs[k].style.setProperty("background", c, "important"); bs[k].style.setProperty("color", tc, "important"); }
            else { bs[k].style.removeProperty("background"); bs[k].style.removeProperty("color"); }
          }
          ri++;
        }
      }
    } catch (e) {}
  }
  // ── Convert native <select> to the CC disk-dropdown look (user: "alle dropdownlisten ... alle
  // listen!"). A native <select>'s OPEN popup is OS-rendered and unreachable by CSS, so we build a
  // small overlay (.cc-sel) mirroring the options into the disk-chip look. The REAL <select> stays
  // (display:none) as the source of truth — the form POST + all Unraid inline JS read .value /
  // .selectedIndex; we write selectedIndex back + dispatch change so the inline onchange handlers
  // (updateScreen, checkShareSettingsSMB, checkPublicSelection, toggleButton) still fire. The storage
  // cascade (#primary/#secondary/#direction) is re-selected by updateScreen() via property writes (no
  // event, no attribute), invisible to the observer, so after every pick we re-sync each sibling label
  // (ccSyncGroup) — dispatch is synchronous, so updateScreen has already run.
  function ccSelects(box) {
    try {
      if (pn() !== "/Shares/Share") return;
      var sels = box.querySelectorAll('select:not([multiple]):not([data-cc-sel])'); // ALL single selects (incl. the clone-block "Read settings from"); multiples = dropdownchecklist (already badged)
      for (var i = 0; i < sels.length; i++) ccWrapSelect(sels[i]);
      // ...then RE-SYNC the ones already wrapped. Unraid re-labels and re-selects options at runtime
      // (updateScreen() rewrites #direction's option text via jQuery .text(), and re-points #primary/
      // #secondary by property writes). We are a defer script, so the FIRST updateScreen() runs after
      // we wrapped -> without this the labels stay as they were at wrap time (for #direction: EMPTY).
      // A .text() rewrite IS a childList mutation, so the observer already brings us back here.
      // ccSyncOne is guarded (it only writes when the text actually differs), so this cannot loop.
      var done = box.querySelectorAll("select[data-cc-sel]");
      for (var j = 0; j < done.length; j++) ccSyncOne(done[j]);
    } catch (e) {}
  }
  function ccWrapSelect(sel) {
    sel.setAttribute("data-cc-sel", "1");                 // set FIRST -> observer re-fire is a no-op
    var wrap = el("span", "cc-sel"); sel.parentNode.insertBefore(wrap, sel);
    sel.style.display = "none"; wrap.appendChild(sel);    // KEEP the select (form POST + Unraid JS read .value/.selectedIndex)
    var trig = el("span", "cc-sel-trigger"); wrap.appendChild(trig);
    var panel = el("div", "cc-sel-panel"); wrap.appendChild(panel);
    for (var k = 0; k < sel.options.length; k++) {        // build chips ONCE (no later childList mutation)
      var chip = el("div", "cc-sel-opt", sel.options[k].text); chip.setAttribute("data-i", k);
      chip.addEventListener("click", (function (idx) {
        return function (ev) {
          ev.stopPropagation();
          if (sel.options[idx].disabled) return;
          sel.selectedIndex = idx;
          sel.dispatchEvent(new Event("change", { bubbles: true })); // fires inline onchange (updateScreen etc.)
          ccSyncOne(sel);                                 // ALWAYS sync the picked select ITSELF: the clone block is a
          // SIBLING of the form, not inside it (ShareEdit.page: .relative = [div.clone-settings, form]), so readshare's
          // sel.form is NULL and the form-scoped ccSyncGroup below no-ops -> its label never updated. It only refreshed
          // on the NEXT open (see the trigger handler), which is exactly the reported "picked share is not shown, and
          // picking another shows the previous one". Cheap + idempotent, so the form-scoped pass may re-sync it.
          ccSyncGroup(sel.form);                          // + refresh SIBLING labels updateScreen just changed (form-scoped cascade)
          wrap.classList.remove("cc-open");
        };
      })(k));
      panel.appendChild(chip);
    }
    trig.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (sel.disabled) return;
      ccSyncOne(sel);                                     // reflect live disabled/selected BEFORE opening
      var open = wrap.classList.toggle("cc-open");
      if (open) { var o = document.querySelectorAll(".cc-sel.cc-open"); for (var j = 0; j < o.length; j++) if (o[j] !== wrap) o[j].classList.remove("cc-open"); }
    });
    ccSyncOne(sel);
  }
  function ccSyncOne(sel) {
    var w = sel.parentNode; if (!w) return;
    w.classList.toggle("cc-sel-disabled", !!sel.disabled);   // statically-disabled selects (shareCOW on existing shares, moverDirection2) read as inert, not interactive
    var t = w.querySelector(".cc-sel-trigger"), c = w.querySelectorAll(".cc-sel-opt");
    // GUARDED, like the chip loop below: since ccSelects() now re-syncs already-wrapped selects on
    // every observer tick, an UNCONDITIONAL textContent write here would replace the trigger's text
    // node even when the string is unchanged -> a childList mutation -> the MutationObserver
    // (childList:true, subtree:true) fires again -> enhanceShareDetail -> ccSelects -> this write again
    // -> a self-sustaining ~150ms repaint loop on /Shares/Share for as long as the page is open.
    var label = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : "";
    if (t && t.textContent !== label) t.textContent = label;
    for (var k = 0; k < c.length; k++) {
      var o = sel.options[+c[k].getAttribute("data-i")]; if (!o) continue;
      // The option TEXT is as live as .selected/.disabled — Unraid rewrites it at runtime. #direction
      // ("Mover action") is rendered by PHP with EMPTY option text (mk_option(direction(),'0','')) and
      // is only labelled later by updateScreen()'s jQuery .text() writes; shares.js is a defer script,
      // so it wraps the select BEFORE that runs. Chips built once from sel.options[k].text would stay
      // permanently BLANK there, and go stale on every Primary/Secondary change (which re-labels them).
      // The !== guard keeps this a no-op in the common case, so it emits no childList mutation and
      // cannot loop the observer.
      if (c[k].textContent !== o.text) c[k].textContent = o.text;
      c[k].classList.toggle("is-selected", o.selected);
      c[k].classList.toggle("is-disabled", !!o.disabled);
    }
  }
  function ccSyncGroup(f) { if (!f) return; var s = f.querySelectorAll("select[data-cc-sel]"); for (var i = 0; i < s.length; i++) ccSyncOne(s[i]); }
  function ccSelectsTeardown() {
    try {
      var wraps = document.querySelectorAll("#displaybox .cc-sel");
      for (var i = 0; i < wraps.length; i++) {
        var w = wraps[i], sel = w.querySelector("select");
        if (sel) { sel.style.display = ""; sel.removeAttribute("data-cc-sel"); w.parentNode.insertBefore(sel, w); }
        if (w.parentNode) w.parentNode.removeChild(w);
      }
    } catch (e) {}
  }
  // one-time: click outside any open cc-select closes it
  document.addEventListener("click", function () {
    var o = document.querySelectorAll(".cc-sel.cc-open"); for (var i = 0; i < o.length; i++) o[i].classList.remove("cc-open");
  });
  // One-time: Unraid's Read buttons (readShare/readSMB/readUserSMB/readNFS — the input.clone ones)
  // repoint the form's selects from INSIDE a $.get callback (e.g. `form.shareSecurity.value =
  // data.security;`). Those are PROPERTY writes: no change event, no attribute, no childList mutation
  // -> the observer stays silent and the cc-sel trigger keeps showing the OLD value while the form
  // POSTs the NEW one — the same desync class as the clone-block bug above, just reached via the Read
  // button. A sel.addEventListener("change") would NOT fix it: readSMB/readUserSMB fire their
  // $(form).find('select').trigger('change') BEFORE the AJAX lands, and a jQuery .trigger() only
  // reaches inline onchange + jQuery-bound handlers, never addEventListener. ajaxComplete fires right
  // AFTER the success callback, which is exactly when the new values are in place. URL-scoped to the
  // two clone endpoints so the page's other polling cannot cause a repaint loop. No teardown needed:
  // ccSelectsTeardown() strips data-cc-sel, after which this selector matches nothing.
  try {
    if (window.jQuery) window.jQuery(document).ajaxComplete(function (ev, xhr, opt) {
      if (!/\/(ProtocolData|ShareData)\.php/.test((opt && opt.url) || "")) return;
      var s = document.querySelectorAll("#displaybox select[data-cc-sel]");
      for (var i = 0; i < s.length; i++) ccSyncOne(s[i]);
    });
  } catch (e) {}

  // ── Clone-settings block -> Nebencard beside the Hauptcard. Unraid renders THREE variants of the
  // "Read/Write settings from" clone next to the settings form; we normalize all three to ONE structure
  // by REUSING the enclosing .relative as the flex row (adds .cc-split-row). It then holds exactly two
  // children: [.cc-main-col = Hauptcard (the whole settings form/blocks), .cc-side-card = Nebencard
  // (the clone block)].
  //   A  ShareEdit:        .relative = [clone, form]                -> Hauptcard = form
  //   B  SMB settings:     .relative = [clone];  form-.shade is the .relative's NEXT sibling
  //   C  SMB user-access:  .relative = [clone, .shade>form]         -> Hauptcard = .shade
  // Hauptcard = every NON-clone child of .relative, else (B — nothing inside) the following siblings up
  // to the next .title/.relative. WHOLE forms/blocks move as units — no field ever leaves its <form>, so
  // the share/SMB form JS (references by name/id) keeps working. Idempotent per clone (data-cc-clone);
  // REUSING .relative means no wrapper is ever inserted into the wrong parent — that mis-parenting was
  // the old bug (empty Hauptcard, form leaking out below, a stray shadow frame around the section).
  function ccCards(root) {
    try {
      var clones = root.querySelectorAll(".clone-settings:not([data-cc-clone])");
      for (var i = 0; i < clones.length; i++) {
        try {
          var clone = clones[i], rel = clone.closest(".relative");
          if (!rel || rel.classList.contains("cc-split-row")) continue;
          var mains = [], c;
          for (c = rel.firstElementChild; c; c = c.nextElementSibling) { if (c !== clone) mains.push(c); }
          if (!mains.length) {                        // variant B: the settings form lives AFTER .relative
            var n = rel.nextElementSibling;
            while (n && n.tagName !== "SCRIPT" && n.tagName !== "STYLE" && !(n.classList && (n.classList.contains("title") || n.classList.contains("relative")))) { var nx = n.nextElementSibling; mains.push(n); n = nx; }
          }
          var main = el("div", "cc-main-col"), side = el("div", "cc-side-card");
          for (var m = 0; m < mains.length; m++) main.appendChild(mains[m]);   // whole settings blocks -> Hauptcard (left)
          side.appendChild(clone);                                             // clone block -> Nebencard (right)
          rel.appendChild(main); rel.appendChild(side);                        // reuse .relative as the flex row
          rel.classList.add("cc-split-row");
          clone.setAttribute("data-cc-clone", "1");
        } catch (e) {}
      }
    } catch (e) {}
  }
  function ccUnwrap(node) { if (!node || !node.parentNode) return; while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node); node.parentNode.removeChild(node); }
  function ccCardsTeardown() {
    try {
      // Flatten each reused .relative row back: lift the Hauptcard + Nebencard children back up, drop
      // the row class + markers. The clone reverts to its native absolute float once the CSS is gone, so
      // the DOM order (main-then-clone) is visually irrelevant, and a re-enable re-runs ccCards cleanly.
      var rows = document.querySelectorAll("#displaybox .cc-split-row");
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var main = row.querySelector(":scope > .cc-main-col"), side = row.querySelector(":scope > .cc-side-card");
        if (main) ccUnwrap(main);
        if (side) ccUnwrap(side);
        row.classList.remove("cc-split-row");
      }
      var marks = document.querySelectorAll("#displaybox [data-cc-clone]");
      for (var k = 0; k < marks.length; k++) marks[k].removeAttribute("data-cc-clone");
    } catch (e) {}
  }

  // Flatten a tabbed container (nav.tabs + section[role=tabpanel]) into stacked CC cards: prepend a
  // .cc-card-head (cloned from each now-hidden tab button) to every panel. SHARED by the /Shares/Share
  // detail page and the /Main (START) tab — both render the identical MainContentTabbed DOM. Extracted
  // out of enhanceShareDetail so the per-area Tab-Ansicht toggle can gate the CALL (stacked sections
  // vs native sub-tabs). Panel<->button paired by DOM INDEX (not aria-labelledby): MainContentTabbed.php
  // numbers buttons and panels in two loops with different skip logic, so a panel's aria-labelledby can
  // point to a missing button id. Iterate the FULL list + skip carded ones BY ATTRIBUTE so i stays the
  // real DOM index that lines up with tabBtns[i]. Idempotent via data-cc-card.
  function cardPanels(box) {
    var tablist = box.querySelector('nav.tabs, [role="tablist"]');
    var tabBtns = tablist ? tablist.querySelectorAll('button[role="tab"]') : [];
    var panels = box.querySelectorAll('section[role="tabpanel"]');
    for (var i = 0; i < panels.length; i++) {
      var section = panels[i];
      if (section.getAttribute("data-cc-card")) continue;   // idempotent; keeps i == real DOM index
      section.setAttribute("data-cc-card", "1");
      ccCards(section);   // clone-settings block(s) -> Nebencard beside their Hauptcard (all 3 Unraid variants; /Main has none, so no-op)
      var head = document.createElement("div");
      head.className = "cc-card-head";
      var btn = tabBtns[i];
      if (btn && btn.childNodes.length) {                   // clone the localized <span.left><icon>Title</span>
        var kids = btn.childNodes;
        for (var k = 0; k < kids.length; k++) head.appendChild(kids[k].cloneNode(true));
      } else {                                              // last resort: never shout the raw id
        head.textContent = (btn && btn.textContent.trim()) || (section.id || "").replace(/-panel$/, "");
      }
      var cols = section.querySelectorAll(".cc-main-col");
      if (!cols.length) { section.insertBefore(head, section.firstChild); }   // no split (e.g. /Main): the section IS the card
      else {
        cols[0].insertBefore(head, cols[0].firstChild);
        for (var ci = 1; ci < cols.length; ci++) {
          var col = cols[ci];
          if (col.querySelector(":scope > .cc-card-head")) continue;   // idempotent
          var crow = col.closest(".cc-split-row"), nh = crow ? crow.previousElementSibling : null;
          while (nh && !(nh.classList && (nh.classList.contains("title") || nh.classList.contains("cc-split-row")))) nh = nh.previousElementSibling;
          if (nh && nh.classList && nh.classList.contains("cc-split-row")) nh = null;   // hit a crow first -> no heading for this col
          var lft = nh && (nh.querySelector("span.left") || nh);
          var h2 = el("div", "cc-card-head");
          h2.textContent = (lft && (lft.textContent || "").trim()) || "SMB";
          col.insertBefore(h2, col.firstChild);
          if (nh) {
            var rgt = nh.querySelector("span.right");
            if (rgt && (rgt.textContent || "").trim()) { var note = el("div", "cc-card-note"); note.textContent = (rgt.textContent || "").trim(); col.insertBefore(note, h2.nextSibling); }
            nh.classList.add("cc-carded");   // hide the now-redundant native heading (CSS: .title.cc-carded)
          }
        }
      }
    }
  }
  // Revert cardPanels: pull the injected .cc-card-head/.cc-card-note out, un-hide carded native headings,
  // drop the data-cc-card markers, unwrap the split/side card rows. Idempotent (guards on the markers).
  // Runs when a per-area Tab-Ansicht toggle is OFF so the native sub-tabs show instead of stacked sections.
  function flattenTeardown() {
    try {
      var stray = document.querySelectorAll("#displaybox .cc-card-head, #displaybox .cc-card-note");
      for (var s = 0; s < stray.length; s++) stray[s].parentNode.removeChild(stray[s]);
      var carded = document.querySelectorAll("#displaybox .cc-carded");
      for (var cd = 0; cd < carded.length; cd++) carded[cd].classList.remove("cc-carded");
      var marked = document.querySelectorAll("#displaybox [data-cc-card]");
      for (var m = 0; m < marked.length; m++) marked[m].removeAttribute("data-cc-card");
      ccCardsTeardown();
    } catch (e) {}
  }

  // Share DETAIL page (/Shares/Share): CC no longer injects a share-name title — the user pointed out
  // the name is already in the Freigabename field, so the heading above the tabs was redundant. This
  // now just cleans up any leftover .cc-share-title (e.g. from a cached older version). The detail
  // page's CC theming (buttons, inputs, flat sections) is all CSS via the cc-on-share-detail class.
  function enhanceShareDetail() {
    try {
      var box = document.getElementById("displaybox"); if (!box) return;
      if (pn() !== "/Shares/Share") return;   // only the share detail page (match the sibling enhancers' pn() gating; keeps the DOM-move off any other #displaybox form)
      if (g("cc.enable.shares", "0") === "0") return;   // area disabled -> don't inject/re-wrap (the observer can still fire after a runtime disable; teardown lives in apply()'s !on branch)
      var ttl = box.querySelector(":scope > .cc-share-title"); if (ttl) ttl.parentNode.removeChild(ttl);
      // Standardize the delete control to match the plugin list (user: badge must hug its text,
      // and the checkbox must NOT sit inside the badge). Unraid nests input[name=confirmDelete]
      // INSIDE label#deleteLabel, and the label is a <dl> grid item (justify-self:stretch -> full
      // width). So wrap both in one grid-item span, MOVE the checkbox out to a preceding sibling,
      // and tag both with the canonical classes. MOVE (never clone): chkDelete()/handleDeleteClick()
      // find the input by name/id (position-independent), so it stays functional; a clone would
      // duplicate name=confirmDelete and corrupt the POST. Idempotent: bail once .cc-del-wrap exists.
      var label = box.querySelector("dl > #deleteLabel");
      if (label && !box.querySelector(".cc-del-wrap")) {
        var cb = label.querySelector('input[type="checkbox"][name="confirmDelete"]');
        var dl = label.parentNode;
        if (cb && dl) {
          var wrap = document.createElement("span");
          wrap.className = "cc-del-wrap"; wrap.setAttribute("data-cc", "1");
          dl.insertBefore(wrap, label);
          wrap.appendChild(cb);          // checkbox first -> now a sibling OUTSIDE the pill
          wrap.appendChild(label);       // label is text-only now -> hugs "Löschen"
          cb.classList.add("cc-cb-del");
          label.classList.add("cc-b-del");
          // Delete gate (user: "der löschen button muss deaktiviert sein bis man die checkbox aktiviert").
          // The CHECKBOX arms (its native onchange -> chkDelete arms Unraid's real delete submit
          // #cmdEditShare); CSS greys the badge + makes it inert until the checkbox is checked. The red
          // (armed) badge is the delete trigger: clicking it forwards the user's click to #cmdEditShare.
          // No for= — we don't want the badge to un-tick the checkbox. This is a user-initiated forward,
          // NOT an auto-click. Runs once per wrap creation, so no extra guard needed.
          label.addEventListener("click", function () {
            if (cb.checked && !cb.disabled) { var sub = document.getElementById("cmdEditShare"); if (sub) sub.click(); }
          });
        }
      }
      // Tab-Ansicht: stacked CC sections (default) or native sub-tabs. cardPanels() prepends the
      // section-header badges; when the per-area toggle is OFF, flattenTeardown() reverts to the native
      // sub-tabs. ccSelects(box) runs in BOTH modes (the disk-dropdown look is layout-independent).
      if (g("cc.sections.shares", "1") !== "0") cardPanels(box); else flattenTeardown();
      ccSelects(box);   // convert native <select> to the CC disk-dropdown look (see ccWrapSelect)
    } catch (e) {}
  }
  // /Main (START tab): the device table is table.unraid.disk_status — 10 heterogeneous columns,
  // nchan-refilled, carrying structural rows (colspan placeholders, pool_header, tr_last, offline
  // colspan rows) that the fixed-9-col share_status logic would corrupt. So DUPLICATE the enhancer
  // (don't overload enhanceShares/enhanceRow): badge only TEXT-ONLY value cells and lift a.view into
  // its own Browse column colspan-awarely. onMain() gates on nav.tabs so it only fires in Tabbed mode.
  function onMain() { try { return pn() === "/Main" && !!document.querySelector("#displaybox nav.tabs"); } catch (e) { return false; } }
  // Badge EVERY value cell (user: "ALLES in badges") — move the cell's existing children into .cc-b>.cc-b-v
  // so Reads/Writes (span.diskio + span.number) and the errored-Errors info-icon keep working inside the
  // pill (verified native DOM: DiskList.php / device_list). Guards: the usage-disk bar (CSS-restyled, never
  // badged), the assignment <select> (stays interactive), a colspan structural cell, and the disk-name link
  // (which is its own lg badge via enhanceMainName). Idempotent via .cc-bcell; reversible in teardown.
  function mainBadgeCell(td) {
    if (!td || td.classList.contains("cc-bcell")) return;
    if (td.querySelector(".usage-disk")) return;             // usage bar -> restyled by CSS
    if (td.querySelector("select")) return;                  // array-stopped assignment dropdown stays native
    if (td.hasAttribute("colspan")) return;                  // structural spanning cell
    if (td.querySelector("a.cc-b-name")) return;             // disk-name link is the lg headline badge
    var txt = (td.textContent || "").trim(); if (txt === "" || txt === "-" || txt === "*") return;
    var b = el("span", "cc-b"), v = el("span", "cc-b-v");
    while (td.firstChild) v.appendChild(td.firstChild);      // keep diskio/number spans + the error info-icon/tooltip live
    b.appendChild(v); td.appendChild(b); td.classList.add("cc-bcell");
  }
  // Disk NAME -> lg headline badge like the share name. The name link a[href*="?name="] lives in the
  // Identification cell (td.desc), NOT the Device cell — so search the whole ROW (content-anchored) and tag
  // that link .cc-b.cc-b-name (href/onclick intact). This is why the disk name was never badged before.
  function enhanceMainName(tr) {
    var nl = tr.querySelector('a[href*="/Main/Device?name="], a[href*="/Main/Boot?name="]') || tr.querySelector(':scope > td.desc a[href]');
    if (nl && !nl.classList.contains("cc-b-name")) { nl.classList.add("cc-b"); nl.classList.add("cc-b-name"); }
  }
  function enhanceMainHead(table) {
    var h = table && table.querySelector("thead tr"); if (!h || h.getAttribute("data-cc-main")) return;
    h.setAttribute("data-cc-main", "1");
    var dev = h.children[0]; if (!dev) return;
    h.insertBefore(el("td", "cc-browse-col", t("browse")), dev.nextSibling);   // Browse header AFTER the Device cell
  }
  function enhanceMainRow(tr) {
    if (tr.getAttribute("data-cc-main")) return; tr.setAttribute("data-cc-main", "1");
    var first = tr.children[0]; if (!first) return;
    // structural rows (colspan placeholder / pool header / total / offline) -> just widen for the new col
    if (first.hasAttribute("colspan") || tr.classList.contains("pool_header") || tr.classList.contains("tr_last") || tr.querySelector(":scope > td.empty")) {
      var span = tr.querySelector("td[colspan]"); if (span) span.colSpan = (span.colSpan || 1) + 1; return;
    }
    var bt = el("td", "cc-browse-col");                      // Browse cell, inserted AFTER the Device cell
    var view = first.querySelector("a.view");
    if (view && view.getAttribute("href")) {
      view.classList.add("cc-b-browse");
      var ic = view.querySelector("i"); if (ic) ic.parentNode.removeChild(ic);   // drop the folder glyph -> text-only badge
      if (!view.querySelector(".cc-b-lab")) view.appendChild(el("span", "cc-b-lab", t("browse")));
      bt.appendChild(view);                                  // moves it OUT of the Device cell, href/onclick intact
    }
    first.parentNode.insertBefore(bt, first.nextSibling);
    enhanceMainName(tr);                                          // disk name link -> lg headline badge (wherever it is in the row)
    var tds = Array.prototype.slice.call(tr.children);
    for (var i = 2; i < tds.length; i++) mainBadgeCell(tds[i]);   // badge EVERY value cell (usage-disk/select/name-link self-skip)
  }
  function enhanceMain() {
    try {
      if (g("cc.enable.main", "0") === "0") return;   // Start (/Main) is its OWN area now (was cc.enable.shares)
      if (!onMain()) return;
      var box = document.getElementById("displaybox");
      if (box) { if (g("cc.sections.main", "0") !== "0") cardPanels(box); else flattenTeardown(); }   // Tab-Ansicht default OFF (native sub-tabs)
      var tbs = document.querySelectorAll("#displaybox table.unraid.disk_status");
      for (var i = 0; i < tbs.length; i++) {
        enhanceMainHead(tbs[i]);
        var rows = tbs[i].querySelectorAll("tbody > tr");
        for (var r = 0; r < rows.length; r++) enhanceMainRow(rows[r]);
      }
      if (box) enhanceArrayOps(box);   // Array-Vorgang form: CC buttons + (i) info-bubbles, separator lines removed via CSS
      ccLocalizeMain();   // s3-sleep button / UD strings / Internal-Boot sentence in the UI language
    } catch (e) {}
  }
  // ── /Main "Array-Vorgang" (ArrayOperation.page: table.ArrayOperation-Table.array_status). Each control
  //    is <tr><td>[status]</td><td>[button]</td><td>[description]</td></tr>, with separator rows
  //    <tr><td></td><td class="line" colspan=2></td></tr>. User: buttons flush + equal spacing, NO lines,
  //    ALL infotexts as (i) info-bubbles (style guide §9). We build a .cc-info span from the description in
  //    the button cell. PURE-TEXT description cells get .cc-aop-desc (CSS hides the whole cell). MIXED cells
  //    (verified native DOM: Check = prose + Schedule <a> + optionCorrect checkbox + <small> label; Reboot/
  //    Shutdown = prose + safemode <label>; Mover = #mover-text ASYNC-filled by JS with prose + Schedule <a>;
  //    Sleep = prose + Wiki <a>) fold ONLY their PROSE nodes (text/<b>/<br> -> .cc-aop-hide, hidden by CSS)
  //    while every control (input/select/a/label/button) AND a checkbox's trailing label stay inline + live —
  //    hiding those would break Start/Format/the links. data-cc-aop is set at the END (not first-pass) so the
  //    async #mover-text re-folds on the observer tick. Idempotent + reversible (aopTeardown un-hides/unwraps).
  function svgEl(tag, attrs) { var n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]); return n; }
  function ccInfoIcon(tip) {   // §9: span > inline-SVG (circle + top dot + rounded stem), all currentColor, NEVER accent
    var s = el("span", "cc-info"); s.setAttribute("data-tip", tip); s.setAttribute("aria-label", tip); s.setAttribute("tabindex", "0");
    var svg = svgEl("svg", { viewBox: "0 0 16 16", width: "15", height: "15", "aria-hidden": "true" });
    svg.appendChild(svgEl("circle", { cx: "8", cy: "8", r: "7", fill: "none", stroke: "currentColor", "stroke-width": "1.4" }));
    svg.appendChild(svgEl("circle", { cx: "8", cy: "4.4", r: "1.05", fill: "currentColor" }));
    svg.appendChild(svgEl("rect", { x: "7.1", y: "6.5", width: "1.8", height: "5.3", rx: ".9", fill: "currentColor" }));
    s.appendChild(svg); return s;
  }
  function ccIsCtrl(n) { if (n.nodeType !== 1) return false; var t = n.tagName; return t === "INPUT" || t === "SELECT" || t === "A" || t === "LABEL" || t === "BUTTON"; }
  // true when node n directly LABELS an immediately-preceding checkbox (skip whitespace / <br>) -> keep inline
  function ccPrevIsCheckbox(n) {
    var p = n.previousSibling;
    while (p) {
      if (p.nodeType === 1) { if (p.tagName === "INPUT") return /checkbox/i.test(p.getAttribute("type") || ""); if (p.tagName === "BR") { p = p.previousSibling; continue; } return false; }
      if (p.nodeType === 3) { if (p.textContent.trim()) return false; p = p.previousSibling; continue; }
      return false;
    }
    return false;
  }
  // Fold ONLY the descriptive PROSE of a mixed description cell into the (i)-bubble text, hiding each prose
  // node IN PLACE (reversible) while every interactive control stays visible + functional. Re-runnable: an
  // already-hidden node is only re-counted for the tip, never re-wrapped, so nchan refills of #mover-text
  // simply re-fold next tick without an observer loop.
  function ccFoldDesc(cell) {
    var tip = "", nodes = Array.prototype.slice.call(cell.childNodes);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (ccIsCtrl(n)) continue;                                                     // control (input/select/a/label/button) -> keep, not in tip
      if (n.nodeType === 1 && (n.tagName === "SMALL" || n.tagName === "SPAN") && ccPrevIsCheckbox(n)) continue;  // checkbox label element -> keep
      if (n.nodeType === 3 && ccPrevIsCheckbox(n)) continue;                         // bare-text checkbox label -> keep
      if (n.nodeType === 1 && n.classList.contains("cc-aop-hide")) { var ht = (n.textContent || "").replace(/\s+/g, " ").trim(); if (ht) tip += (tip ? " " : "") + ht; continue; } // already folded
      var s = (n.nodeType === 1 && n.tagName === "BR") ? "" : (n.textContent || "").replace(/\s+/g, " ").trim();
      if (s) tip += (tip ? " " : "") + s;
      if (n.nodeType === 1) { n.classList.add("cc-aop-hide"); }                      // hide <b>/<br>/prose element in place
      else if (s) { var w = el("span", "cc-aop-hide"); w.setAttribute("data-cc-aop-w", "1"); n.parentNode.insertBefore(w, n); w.appendChild(n); } // wrap+hide a prose text node
    }
    return tip.replace(/\s+/g, " ").trim();
  }
  function enhanceArrayOpRow(tr) {
    if (tr.querySelector(":scope > td.line")) { tr.setAttribute("data-cc-aop", "1"); return; }   // separator row -> CSS collapses it
    var tds = tr.children; if (tds.length < 3) return;
    var btnCell = tds[1], descCell = tds[2];
    if (!btnCell.querySelector("input, button, a")) return;                          // must hold a control
    var tip;
    if (!descCell.querySelector("input, select, a, button, label")) {                // PURE-TEXT description -> fold the whole cell
      tip = (descCell.textContent || "").replace(/\s+/g, " ").trim(); if (!tip) return;
      descCell.classList.add("cc-aop-desc");                                         // CSS hides the redundant inline text
    } else {                                                                          // MIXED cell -> fold prose only, keep the checkbox/link live
      tip = ccFoldDesc(descCell); if (!tip) return;
    }
    var info = btnCell.querySelector(":scope > .cc-info");
    if (info) { if (info.getAttribute("data-tip") !== tip) { info.setAttribute("data-tip", tip); info.setAttribute("aria-label", tip); } }
    else btnCell.appendChild(ccInfoIcon(tip));                                        // (i) bubble beside the button
    tr.setAttribute("data-cc-aop", "1");
  }
  // Array-state ("Gestartet") + parity ("Paritaet ist gueltig.") status cells -> two LARGE badges coloured
  // by status (user request). Language-INDEPENDENT colour sources (never match translated text): the native
  // status_indicator() orb class in the cell (green-orb = running, yellow-orb = unprotected, grey-orb =
  // stopped); the icon-less parity cell is identified by its ROW's controls (input[name=cmdCheck] = the
  // parity-VALID branch of ArrayOperation.page -> green; the pause/cancel pair = check running -> amber).
  // Cells that are neither (e.g. the Unmountable-disks list) stay native. The orb's a.info tooltip moves
  // INTO the pill and stays live.
  function aopStatusBadge(tr) {
    var td = tr.children[0]; if (!td || td.classList.contains("cc-aop-st")) return;
    if (td.querySelector(".cc-b")) return;
    var orb = td.querySelector("a.info i.orb");
    var isCheck = !!tr.querySelector('input[name="cmdCheck"]');
    var isRun = !!tr.querySelector("#pauseButton, #cancelButton");
    if (!orb && !isCheck && !isRun) return;
    var txt = (td.textContent || "").replace(/\s+/g, " ").trim(); if (!txt) return;   // empty status cell (e.g. Read-Check/Sync branch)
    var cls = orb ? (orb.classList.contains("green-orb") ? "cc-aop-ok" : orb.classList.contains("yellow-orb") ? "cc-aop-warn" : "cc-aop-off")
                  : (isRun ? "cc-aop-warn" : "cc-aop-ok");
    var b = el("span", "cc-b cc-aop-status " + cls), v = el("span", "cc-b-v");
    while (td.firstChild) v.appendChild(td.firstChild);
    b.appendChild(v); td.appendChild(b); td.classList.add("cc-aop-st");
  }
  function enhanceArrayOps(box) {
    try {
      var tables = box.querySelectorAll("table.array_status");
      for (var i = 0; i < tables.length; i++) { var rows = tables[i].rows; for (var r = 0; r < rows.length; r++) { aopStatusBadge(rows[r]); enhanceArrayOpRow(rows[r]); } }
    } catch (e) {}
  }
  function aopTeardown() {
    try {
      var infos = document.querySelectorAll("#displaybox table.array_status .cc-info");
      for (var i = 0; i < infos.length; i++) infos[i].parentNode.removeChild(infos[i]);
      var descs = document.querySelectorAll("#displaybox table.array_status td.cc-aop-desc");
      for (var d = 0; d < descs.length; d++) descs[d].classList.remove("cc-aop-desc");
      // un-fold mixed-cell prose: unwrap our text-node wrappers, strip the hide class off in-place elements
      var hid = document.querySelectorAll("#displaybox table.array_status .cc-aop-hide");
      for (var h = 0; h < hid.length; h++) { var n = hid[h]; if (n.tagName === "SPAN" && n.getAttribute("data-cc-aop-w") === "1") ccUnwrap(n); else n.classList.remove("cc-aop-hide"); }
      // un-badge the state/parity status pills (children move back into the cell, orb tooltip intact)
      var stb = document.querySelectorAll("#displaybox table.array_status td.cc-aop-st");
      for (var s = 0; s < stb.length; s++) {
        var bb = stb[s].querySelector(":scope > .cc-b.cc-aop-status");
        if (bb) { var vv = bb.querySelector(":scope > .cc-b-v"); if (vv) ccUnwrap(vv); ccUnwrap(bb); }
        stb[s].classList.remove("cc-aop-st");
      }
      var marked = document.querySelectorAll("#displaybox table.array_status tr[data-cc-aop]");
      for (var m = 0; m < marked.length; m++) marked[m].removeAttribute("data-cc-aop");
    } catch (e) {}
  }
  // ── /Main UI-LANGUAGE localisation (user: ALLES in der eingestellten Sprache). Three foreign sources
  // ship English on a non-English UI: (1) dynamix.s3.sleep — Sleep.php renders <input type="button"
  // value="Sleep" onclick="sleepS3()"> with the value NOT _()-wrapped (verified bergware/dynamix source),
  // and NOTHING reads the value back (sleepNow() only writes $('#sleepbutton').val(), an id this markup
  // doesn't even carry) -> a visual value swap is safe; (2) Unassigned Devices — headings/toggles/ADD
  // buttons/table heads are _()-wrapped upstream but missing from the user's pack, so plain text-node
  // replacement (onclick attrs untouched) is safe; (3) device_list's Internal-Boot placeholder sentence
  // (two text nodes around the wizard <a>). Same locale STRUCTURE as T/t() above (exact-English keys) —
  // add MAIN_T.<lang> for a new locale. Already-translated text never matches a key = no-op. Idempotent
  // via data-cc-i18n; reversible via data-cc-i18n-orig (ccI18nTeardown restores). Text-node writes are
  // characterData mutations -> invisible to the childList-only MutationObserver, so this can never loop.
  var MAIN_T = {
    de: {
      "Sleep": "Ruhezustand",
      "Unassigned Disks/Remote Shares/Historical Unassigned Devices": "Nicht zugewiesene Geräte/Remote-Freigaben/Historische Geräte",
      "Unassigned Disk Devices": "Nicht zugewiesene Datenträger",
      "Historical Unassigned Devices": "Historische nicht zugewiesene Geräte",
      "SMB Shares |": "SMB-Freigaben |",
      "NFS Shares |": "NFS-Freigaben |",
      "ISO File Shares": "ISO-Datei-Freigaben",
      "Add Remote SMB/NFS Share": "Remote-SMB/NFS-Freigabe hinzufügen",
      "Add ISO File Share": "ISO-Datei-Freigabe hinzufügen",
      "Add Root Share": "Root-Freigabe hinzufügen",
      "Disks": "Datenträger",
      "Shares": "Freigaben",
      "Historical": "Historisch",
      "Share Type": "Freigabetyp",
      "Source": "Quelle",
      "Mount Point": "Einhängepunkt",
      "Serial Number (Mount Point)": "Seriennummer (Einhängepunkt)",
      "No internal boot setup detected. Launch": "Kein internes Boot-Setup erkannt.",
      "to configure one.": "starten, um eines einzurichten."
    }
  };
  function mt(k) { var m = LANG !== "en" && MAIN_T[LANG]; return (m && m[k]) || null; }
  // translate the direct TEXT NODES of a host element (exact match after NBSP/whitespace normalisation);
  // child elements (icons, the wizard <a>, the UD imgs) stay untouched.
  function ccTr(host) {
    if (!host || host.nodeType !== 1 || host.getAttribute("data-cc-i18n")) return;
    var keys = [];
    for (var c = host.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 3) continue;
      var raw = c.textContent;
      var lead = (raw.match(/^\s*/) || [""])[0], trail = (raw.match(/\s*$/) || [""])[0];
      var core = raw.slice(lead.length, raw.length - trail.length); if (!core) continue;
      var k = core.replace(/ /g, " ").replace(/\s+/g, " "), tr = mt(k);
      if (!tr) continue;
      c.textContent = lead + tr + trail;
      keys.push(k);
    }
    if (keys.length) { host.setAttribute("data-cc-i18n", "1"); host.setAttribute("data-cc-i18n-orig", keys.join("")); }
  }
  function ccLocalizeMain() {
    try {
      if (pn() !== "/Main") return;
      if (LANG === "en" || !MAIN_T[LANG]) return;
      // (1) s3-sleep: relabel the VALUE only — the onclick handler chain never reads it (see header note)
      var sl = document.querySelectorAll('#displaybox table.array_status input[type="button"][onclick^="sleepS3"]');
      for (var s = 0; s < sl.length; s++) {
        var b = sl[s], tr = mt(b.value);
        if (tr && !b.getAttribute("data-cc-i18n")) { b.setAttribute("data-cc-i18n", "1"); b.setAttribute("data-cc-i18n-orig", b.value); b.value = tr; }
      }
      // (2) UD: section headings (div.title span.left incl. the SMB|NFS|ISO segments), the three ADD
      // <button>s (text nodes only, onclick attr untouched), the switchButton labels, the table heads
      // (exact-map-keyed, so native German disk_status heads can never match).
      var els = document.querySelectorAll(
        "#displaybox div.title span.left, " +
        "#displaybox button[onclick^='add_samba_share'], #displaybox button[onclick^='add_iso_share'], #displaybox button[onclick^='add_root_share'], " +
        "#displaybox span.switch-button-label, " +
        "#displaybox table thead td, #displaybox table thead th");
      for (var i = 0; i < els.length; i++) ccTr(els[i]);
      // (3) Internal-Boot sentence: the two text nodes AROUND the wizard link (device_list). parentNode,
      // NOT closest("td"): mainBadgeCell may have wrapped the cell text into .cc-b-v — the <a>'s parent
      // is the direct text-node container in both the wrapped and unwrapped case.
      var links = document.querySelectorAll('#displaybox a[href*="InternalBootWizard"]');
      for (var l = 0; l < links.length; l++) { var host = links[l].parentNode; if (host && host.nodeType === 1) ccTr(host); }
    } catch (e) {}
  }
  function ccI18nTeardown() {
    try {
      var els = document.querySelectorAll("#displaybox [data-cc-i18n]");
      for (var i = 0; i < els.length; i++) {
        var el2 = els[i], keys = (el2.getAttribute("data-cc-i18n-orig") || "").split("");
        if (el2.tagName === "INPUT") { if (keys[0]) el2.value = keys[0]; }
        else {
          for (var k = 0; k < keys.length; k++) {
            var tr = mt(keys[k]); if (!tr) continue;
            for (var c = el2.firstChild; c; c = c.nextSibling) {
              if (c.nodeType === 3 && c.textContent.replace(/ /g, " ").trim() === tr) { c.textContent = c.textContent.replace(tr, keys[k]); break; }
            }
          }
        }
        el2.removeAttribute("data-cc-i18n"); el2.removeAttribute("data-cc-i18n-orig");
      }
    } catch (e) {}
  }
  function apply() {
    try {
      var root = document.documentElement;
      // MASTER THEMING off behaves like the area being disabled → on=false runs the teardown
      // branch below (cards unwrapped, classes removed) for a clean live revert.
      var on = g("cc.enable.shares", "0") !== "0" && g("cc.theming", "1") !== "0"; // default OFF (flips Unraid's tabbed setting: opt in)
      // Start (/Main) is its OWN area (cc.enable.main). It reuses this enhancer, so we set the global
      // cc-shares-on class on /Main when the Start area is on even if the Shares area is off — but ONLY
      // on /Main (onMain() checks pathname), so it never leaks the Shares styling onto other pages.
      var onMainArea = g("cc.enable.main", "0") !== "0" && g("cc.theming", "1") !== "0";
      var active = on || (onMainArea && onMain());
      root.classList.toggle("cc-shares-on", active);
      // /Shares legitimately shows one tab family -> mark it so the CSS single-tab-hide excludes it
      root.classList.toggle("cc-on-shares", on && pn() === "/Shares");
      // the share DETAIL page (/Shares/Share) is a legit single-family tab page too -> mark it so the
      // single-tab-hide rule skips it (else the prev/next arrows, which live in the tab bar, vanish)
      // and so its own CC theming (buttons/inputs/title) applies.
      root.classList.toggle("cc-on-share-detail", on && pn() === "/Shares/Share");
      // per-area Tab-Ansicht gates (stacked CC sections vs native sub-tabs) + the /Main (START) marker.
      // cc-on-share-detail STAYS (it gates button/input/dropdown theming in BOTH modes); these are
      // additive gates. The merged CSS flatten rule keys off (.cc-on-share-detail.cc-sections-share)
      // OR (.cc-on-main.cc-sections-main), so turning a section toggle off reverts to native sub-tabs.
      root.classList.toggle("cc-sections-share", on && g("cc.sections.shares", "0") !== "0" && pn() === "/Shares/Share");   // Tab-Ansicht default OFF
      root.classList.toggle("cc-sections-main", onMainArea && g("cc.sections.main", "0") !== "0" && onMain());              // Tab-Ansicht default OFF
      root.classList.toggle("cc-on-main", onMainArea && onMain());
      // the file manager (/<parent>/Browse). CSS-ONLY area: nothing is injected, so this class toggle IS
      // the whole teardown. NB the page runs DESTRUCTIVE jobs (delete/move) — see the cc-on-browse block
      // in Shares.css for the rules on why nothing there touches rows, columns or the check glyphs.
      root.classList.toggle("cc-on-browse", on && onBrowse());
      if (on && onBrowse()) enhanceBrowse();   // wrap the owner/perm/size cell values in CC badges
      // /Stats: the class drives the CSS look; moveStatsControls() relocates the injected control group
      // below the graphs (a real DOM move, so it has its own teardown).
      var statsOn = on && onStats();
      root.classList.toggle("cc-on-stats", statsOn);
      if (statsOn) moveStatsControls(); else statsControlsTeardown();
      if (!active) {
        // area disabled at runtime: removing the class reverts every CSS rule (cards collapse back to
        // tab-switching), but the JS-injected card headers would linger as stray unstyled divs -> pull
        // them out and clear their markers so the page is clean without a reload.
        try {
          var stray = document.querySelectorAll("#displaybox .cc-card-head, #displaybox .cc-card-note");
          for (var s = 0; s < stray.length; s++) stray[s].parentNode.removeChild(stray[s]);
          // un-hide the native SMB "User Access" sub-heading we carded (its .cc-carded hide rule is
          // gated on cc-shares-on, so without stripping the class the native heading reappears AND the
          // orphaned .cc-card-note would show the same text = a duplicate that stacks per toggle).
          var carded = document.querySelectorAll("#displaybox .cc-carded");
          for (var cd = 0; cd < carded.length; cd++) carded[cd].classList.remove("cc-carded");
          var marked = document.querySelectorAll("#displaybox [data-cc-card]");
          for (var m = 0; m < marked.length; m++) marked[m].removeAttribute("data-cc-card");
          // rainbow "active only" leftovers: drop the neutral class and clear the inline rb colours
          // paintTabs/paintRows stamped (inline survives a class removal, so it must be cleared here).
          root.classList.remove("cc-shares-rbneutral");
          var painted = document.querySelectorAll('#displaybox nav.tabs button[role="tab"], #displaybox #shareslist tr, #displaybox #disk_list tr, #displaybox .cc-b, #displaybox .cc-b-browse');
          for (var p = 0; p < painted.length; p++) { painted[p].style.removeProperty("background"); painted[p].style.removeProperty("color"); painted[p].style.removeProperty("--cc-rb-c"); painted[p].style.removeProperty("--cc-rb-ct"); }
          ccSelectsTeardown();   // unwrap the custom <select> overlays -> native form back, clean
          ccCardsTeardown();     // unwrap the split/side/user-access card wrappers -> native structure back
          // /Main disk_status: pull the injected Browse column + unwrap value badges + drop markers so a
          // live area-disable reverts before the next nchan refill (the thead Browse cell is static markup;
          // any 1-too-wide structural colspan self-heals on the next tbody refill).
          var mbrowse = document.querySelectorAll("#displaybox table.unraid.disk_status td.cc-browse-col");
          for (var mb = 0; mb < mbrowse.length; mb++) mbrowse[mb].parentNode.removeChild(mbrowse[mb]);
          // unwrap value badges by MOVING children back (not textContent — that would destroy the wrapped
          // diskio/number spans + the error info-icon).
          var mbc = document.querySelectorAll("#displaybox table.unraid.disk_status td.cc-bcell");
          for (var bcx = 0; bcx < mbc.length; bcx++) {
            var cbx = mbc[bcx].querySelector(":scope > .cc-b"), vvx = cbx && cbx.querySelector(":scope > .cc-b-v");
            if (vvx) { while (vvx.firstChild) mbc[bcx].insertBefore(vvx.firstChild, cbx); }
            if (cbx) mbc[bcx].removeChild(cbx);
            mbc[bcx].classList.remove("cc-bcell");
          }
          var mmk = document.querySelectorAll("#displaybox [data-cc-main]");
          for (var mmx = 0; mmx < mmk.length; mmx++) mmk[mmx].removeAttribute("data-cc-main");
          // strip the lg disk-name badge classes off the device link.
          var mname = document.querySelectorAll("#displaybox table.unraid.disk_status a.cc-b-name");
          for (var mn = 0; mn < mname.length; mn++) { mname[mn].classList.remove("cc-b"); mname[mn].classList.remove("cc-b-name"); }
          aopTeardown();   // Array-Vorgang: pull (i) info-bubbles, un-hide description cells, drop markers
          ccI18nTeardown();   // restore the original English strings (sleep value + UD/native text nodes)
        } catch (e) {}
        return;
      }
      // On /Main the START area owns the colour: set --cc-shr-accent to the Start accent (distinct page
      // load, so no clash with the Shares-list colour). Everywhere else use the Shares accent.
      var a = (onMainArea && onMain()) ? mainAccent() : accent();
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
      paintRows(); // per-row rainbow AFTER the badges exist (re-applies when rbOn toggles via storage)
      enhanceShareDetail(); // inject the share-name title on /Shares/Share
      paintCards();         // rainbow (or accent) on the detail-page card title badges
      enhanceMain();        // /Main (START): stacked sections + disk_status row badges + Browse column
      if (onStats()) moveStatsControls(); // /Stats: keep the control group relocated below the graphs (span.status can arrive late)
      if (onBrowse()) enhanceBrowse();    // Browse: (re-)badge the owner/perm/size cells (tbody is AJAX-replaced on navigation)
    } catch (e) {}
  }
  // Observe the content container ONLY (never body). apply()'s follow-ups make no
  // childList changes (a class on <html> + inline styles = attribute changes), so they
  // can't re-trigger this childList observer; debounced for AJAX content swaps.
  function watch() {
    try {
      var host = document.getElementById("displaybox") || document.getElementById("content");
      if (!host) return;
      mo = new MutationObserver(function (recs) {
        if (g("cc.theming", "1") === "0") return; // MASTER THEMING off: apply()'s teardown already cleaned up
        // FLICKER FIX (/Main START tab): Unraid's devices subscriber WHOLESALE-replaces the disk table
        // body every nchan tick (ArrayOperation.page: `for (name in get) $('#'+name).html(get[name])` ->
        // $('#array_devices').html(<all rows>)), wiping our Browse column + badges. Re-applying via the
        // 150ms debounce below lands one paint frame LATE, so the browser PAINTS the plain 10-col rows
        // (misaligned vs our 11-col head) first, then repaints ours = the constant jitter. Re-apply
        // enhanceMain SYNCHRONOUSLY here: a MutationObserver callback is a microtask that runs AFTER
        // Unraid's .html() but BEFORE the next paint, so the un-enhanced state is never rendered.
        // enhanceMain is marker-idempotent, so its own writes re-enter this callback once then no-op.
        for (var i = 0; i < recs.length; i++) {
          var tgt = recs[i].target;
          if (tgt && (tgt.id === "array_devices" || (tgt.closest && tgt.closest("table.unraid.disk_status")))) { enhanceMain(); break; }
        }
        if (moPending) return; moPending = true;
        setTimeout(function () { moPending = false; if (g("cc.theming", "1") === "0") return; hideRedundantTabs(); paintTabs(); enhanceShares(); paintRows(); enhanceShareDetail(); paintCards(); enhanceMain(); if (g("cc.enable.shares", "0") !== "0" && onStats()) moveStatsControls(); if (g("cc.enable.shares", "0") !== "0" && onBrowse()) enhanceBrowse(); }, 150);
      });
      mo.observe(host, { childList: true, subtree: true });
    } catch (e) {}
  }
  function boot() {
    try { window.ccSharesApply = apply; } catch (e) {} // let the Settings page live-update (Shares AND Start)
    if (g("cc.enable.shares", "0") === "0" && g("cc.enable.main", "0") === "0") return; // both areas off -> inert
    apply();
    watch();
    // the CC settings page writes cc.*/ccsh.* keys from another origin/tab -> re-apply on
    // any of them. NB "ccsh.accent" needs [a-z]* (two letters) to be caught (see header.js).
    try { window.addEventListener("storage", function (e) { if (e && e.key && e.key !== "cc.stateCache" && /^cc[a-z]*\./.test(e.key)) apply(); }); } catch (e) {} // cc.stateCache EXCLUDED: docker.js rewrites it every 9s, which would repaint this area on a 9s loop in every other open tab
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
