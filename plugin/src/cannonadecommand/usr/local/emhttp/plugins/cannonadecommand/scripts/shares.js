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
  // Rainbow is a GLOBAL mode: read cc.rainbow / cc.rbpal / cc.rainbowrot DIRECTLY (not the
  // adopt-gated eff()), like docker.js — one global Rainbow switch colours every enabled area.
  // The per-area accent (eff("accent")) stays adopt-gated for the non-rainbow single colour.
  function pal() { try { var p = JSON.parse(g("cc.rbpal", "null")); if (p && p.length) return p; } catch (e) {} return RB; }
  function rbOn() { return g("cc.rainbow", "0") === "1"; }
  function rbColor(i) { if (!rbOn()) return accent(); var off = g("cc.rainbowrot", "0") === "0" ? 0 : RB_OFF; var p = pal(); return p[(i + off) % p.length]; }
  // /Shares editor is /Shares/Share?name=... -> a strict, trailing-slash-normalised
  // pathname check keeps us on the LANDING pages only (see settingsgrid.onSettings).
  function pn() { try { return location.pathname.replace(/\/+$/, ""); } catch (e) { return ""; } }
  // tiny i18n (same shape as docker.js): en fallback, de when the page lang is German.
  var LANG = (document.documentElement.lang || navigator.language || "en").slice(0, 2).toLowerCase();
  var T = { de: { browse: "Durchsuchen", protected: "Geschützt", unprotected: "Ungeschützt", protection: "Schutz" }, en: { browse: "Browse", protected: "Protected", unprotected: "Unprotected", protection: "Protection" } };
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
      var rb = rbOn(), ids = ["shareslist", "disk_list"];
      for (var j = 0; j < ids.length; j++) {
        var tb = document.getElementById(ids[j]); if (!tb) continue;
        var rows = tb.children, ri = 0;
        for (var r = 0; r < rows.length; r++) {
          var tr = rows[r]; if (tr.tagName !== "TR" || tr.querySelector(":scope > td.empty")) continue; // skip the no-shares placeholder
          var c = rb ? rbColor(ri) : "", tc = rb ? idealText(c) : "", bs = tr.querySelectorAll(".cc-b, .cc-b-browse"); // browse pill is coloured too now
          for (var k = 0; k < bs.length; k++) {
            if (rb) { bs[k].style.setProperty("background", c, "important"); bs[k].style.setProperty("color", tc, "important"); }
            else { bs[k].style.removeProperty("background"); bs[k].style.removeProperty("color"); }
          }
          ri++;
        }
      }
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
          // Keep the label a working toggle for the (now un-nested) checkbox: a for=/id pairing
          // works regardless of DOM position, so clicking the red "Löschen" badge still ticks
          // confirmDelete (fires its onchange -> chkDelete arms the Apply/Delete submit). Unraid
          // finds the checkbox by name, so assigning it an id is safe.
          if (!cb.id) cb.id = "cc-confirm-delete";
          label.setAttribute("for", cb.id);
        }
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
      // the share DETAIL page (/Shares/Share) is a legit single-family tab page too -> mark it so the
      // single-tab-hide rule skips it (else the prev/next arrows, which live in the tab bar, vanish)
      // and so its own CC theming (buttons/inputs/title) applies.
      root.classList.toggle("cc-on-share-detail", on && pn() === "/Shares/Share");
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
      paintRows(); // per-row rainbow AFTER the badges exist (re-applies when rbOn toggles via storage)
      enhanceShareDetail(); // inject the share-name title on /Shares/Share
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
        setTimeout(function () { moPending = false; hideRedundantTabs(); paintTabs(); enhanceShares(); paintRows(); enhanceShareDetail(); }, 150);
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
