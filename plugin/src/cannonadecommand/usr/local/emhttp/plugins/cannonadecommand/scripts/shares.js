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
      // Flatten the sub-tabs to CARDS: the CSS reveals every <section role=tabpanel> and hides the tab
      // buttons; here we prepend a header (the now-hidden tab button's icon + label) to each panel.
      // Pair panel<->button by DOM INDEX, NOT aria-labelledby: Unraid's MainContentTabbed.php numbers
      // buttons and panels in two separate loops with different skip logic ($skipIndexIncrement fires
      // only in the panel loop for the no-Title parent Share.page), so a panel's aria-labelledby can
      // point to a non-existent button id -> the old getElementById() returned null and the header
      // shouted the raw "tabN-panel" id. Both loops emit one item per titled child in the SAME order,
      // so the Nth button describes the Nth panel. Iterate the FULL list + skip carded ones BY
      // ATTRIBUTE so i stays the real DOM index that lines up with tabBtns[i].
      var tablist = box.querySelector('nav.tabs, [role="tablist"]');
      var tabBtns = tablist ? tablist.querySelectorAll('button[role="tab"]') : [];
      var panels = box.querySelectorAll('section[role="tabpanel"]');
      for (var i = 0; i < panels.length; i++) {
        var section = panels[i];
        if (section.getAttribute("data-cc-card")) continue;   // idempotent; keeps i == real DOM index
        section.setAttribute("data-cc-card", "1");
        ccCards(section);   // clone-settings block(s) -> Nebencard beside their Hauptcard (handles all 3 Unraid variants; SMB "User Access" form becomes its own Hauptcard automatically)
        var head = document.createElement("div");
        head.className = "cc-card-head";
        var btn = tabBtns[i];
        if (btn && btn.childNodes.length) {                   // clone the localized <span.left><icon>Title</span>
          var kids = btn.childNodes;
          for (var k = 0; k < kids.length; k++) head.appendChild(kids[k].cloneNode(true));
        } else {                                              // last resort: never shout the raw id
          head.textContent = (btn && btn.textContent.trim()) || (section.id || "").replace(/-panel$/, "");
        }
        // EVERY Hauptcard gets its OWN title badge (user: "SMB Benutzerzugriff hat kein Titelbadge in
        // der Card"). The FIRST .cc-main-col takes the tab-button-derived head; a SECOND crow in the
        // same panel (SMB "User Access", whose Hauptcard is the smb_user_edit .shade) takes a badge
        // built from the native .title.nocontrol sub-heading that precedes its crow — which is then
        // hidden (.cc-carded), its "guests …" note kept as a small line under the badge.
        var cols = section.querySelectorAll(".cc-main-col");
        if (!cols.length) { section.insertBefore(head, section.firstChild); }   // no split: section is the card
        else {
          cols[0].insertBefore(head, cols[0].firstChild);
          for (var ci = 1; ci < cols.length; ci++) {
            var col = cols[ci];
            if (col.querySelector(":scope > .cc-card-head")) continue;   // idempotent
            var crow = col.closest(".cc-split-row"), nh = crow ? crow.previousElementSibling : null;
            // walk back to the nearest native .title, but STOP at the previous crow so we never grab an
            // earlier unrelated heading (bounded search).
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
      ccSelects(box);   // convert native <select> to the CC disk-dropdown look (see ccWrapSelect)
    } catch (e) {}
  }
  function apply() {
    try {
      var root = document.documentElement;
      // MASTER THEMING off behaves like the area being disabled → on=false runs the teardown
      // branch below (cards unwrapped, classes removed) for a clean live revert.
      var on = g("cc.enable.shares", "0") !== "0" && g("cc.theming", "1") !== "0"; // default OFF (flips Unraid's tabbed setting: opt in)
      root.classList.toggle("cc-shares-on", on);
      // /Shares legitimately shows one tab family -> mark it so the CSS single-tab-hide excludes it
      root.classList.toggle("cc-on-shares", on && pn() === "/Shares");
      // the share DETAIL page (/Shares/Share) is a legit single-family tab page too -> mark it so the
      // single-tab-hide rule skips it (else the prev/next arrows, which live in the tab bar, vanish)
      // and so its own CC theming (buttons/inputs/title) applies.
      root.classList.toggle("cc-on-share-detail", on && pn() === "/Shares/Share");
      // the file manager (/<parent>/Browse). CSS-ONLY area: nothing is injected, so this class toggle IS
      // the whole teardown. NB the page runs DESTRUCTIVE jobs (delete/move) — see the cc-on-browse block
      // in Shares.css for the rules on why nothing there touches rows, columns or the check glyphs.
      root.classList.toggle("cc-on-browse", on && onBrowse());
      // /Stats: CSS-only, like Browse — the class toggle IS the teardown.
      root.classList.toggle("cc-on-stats", on && onStats());
      if (!on) {
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
        } catch (e) {}
        return;
      }
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
      paintCards();         // rainbow (or accent) on the detail-page card title badges
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
        setTimeout(function () { moPending = false; if (g("cc.theming", "1") === "0") return; hideRedundantTabs(); paintTabs(); enhanceShares(); paintRows(); enhanceShareDetail(); paintCards(); }, 150); // MASTER THEMING off: observer must not re-inject (apply()'s teardown already cleaned up)
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
    try { window.addEventListener("storage", function (e) { if (e && e.key && e.key !== "cc.stateCache" && /^cc[a-z]*\./.test(e.key)) apply(); }); } catch (e) {} // cc.stateCache EXCLUDED: docker.js rewrites it every 9s, which would repaint this area on a 9s loop in every other open tab
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
