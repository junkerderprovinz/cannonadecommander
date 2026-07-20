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
  var LANG = (document.documentElement.lang || navigator.language || "en").slice(0, 2).toLowerCase();
  function T(d, e) { return LANG === "de" ? d : e; }   // same bilingual helper as settings.js
  function eff(k, d) { return g("cc.styleheader", "1") !== "0" ? g("cc." + k, d) : g("cch." + k, d); }
  function accent() { var a = eff("accent", "#2f6feb"); return /^#[0-9a-f]{6}$/i.test(a) ? a : "#2f6feb"; }
  // cc.badgeshape is a GLOBAL key (one Badge-Form control for every area), so read it
  // DIRECTLY, not via eff(): eff() would fall back to an UNSET cch.badgeshape when the
  // header's adopt toggle is off, so --cc-b-radius (and thus the menu-bar badge shape)
  // would flip between pages depending on which script set it last.
  function shape() { return ({ pill: "999px", rounded: "6px", square: "0px", circle: "999px" })[g("cc.badgeshape", "pill")] || "999px"; }
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
  // rainbow sub-mode "active only" (cc.rbmode=active, global like cc.rainbow): idle badges go
  // neutral, only the active one keeps its colour, and CSS colours any badge on hover using the
  // per-item --cc-rb-c/--cc-rb-ct vars this function still stamps on every item.
  function rbNeutral() { return g("cc.rbmode", "all") === "active"; }
  function paintNav() {
    try {
      // gate on the enabled class: if the menu-bar area is OFF, rb=false -> every branch below
      // removeProperty's, so a disabled area (even with Rainbow ON) never paints and any lingering
      // inline colours are cleared. paintNav runs from apply() + the always-on search observer.
      var rb = rbOn() && document.documentElement.classList.contains("cc-header-on"), neutral = rb && rbNeutral(), n = 0;
      document.documentElement.classList.toggle("cc-header-rbneutral", neutral);
      // each item ALWAYS carries its rotated colour as --cc-rb-c/--cc-rb-ct (for the CSS :hover);
      // the DIRECT background is painted only when NOT neutral, or on the ACTIVE left tab.
      function stamp(elm, c, t) { elm.style.setProperty("--cc-rb-c", c); elm.style.setProperty("--cc-rb-ct", t); }
      function clear(elm) { elm.style.removeProperty("background"); elm.style.removeProperty("color"); elm.style.removeProperty("--cc-rb-c"); elm.style.removeProperty("--cc-rb-ct"); }
      Array.prototype.slice.call(document.querySelectorAll("#menu .nav-tile .nav-item:not(.util) > a")).forEach(function (aEl) {   // tabs match in EITHER tile — the merged drag zone can park one on the right
        if (!rb) { clear(aEl); n++; return; }
        var c = rbColor(n), t = idealText(c), item = aEl.closest(".nav-item"), active = !!(item && item.classList.contains("active"));
        stamp(aEl, c, t);
        if (!neutral || active) { aEl.style.setProperty("background", c, "important"); aEl.style.setProperty("color", t, "important"); }
        else { aEl.style.removeProperty("background"); aEl.style.removeProperty("color"); }
        n++;
      });
      Array.prototype.slice.call(document.querySelectorAll("#menu .nav-tile .nav-item.util > a")).forEach(function (aEl) {   // icons match in EITHER tile
        var gl = aEl.querySelector("b.system, img.system");
        if (!rb) { clear(aEl); if (gl) gl.style.removeProperty("color"); n++; return; }
        var c = rbColor(n), t = idealText(c);
        stamp(aEl, c, t);
        if (!neutral) { aEl.style.setProperty("background", c, "important"); if (gl) gl.style.setProperty("color", t, "important"); }
        else { aEl.style.removeProperty("background"); if (gl) gl.style.removeProperty("color"); }
        n++;
      });
      var u = document.querySelector("#menu .usage-bar > span");
      if (u) {
        if (!rb) { clear(u); }
        else { var cu = rbColor(n), tu = idealText(cu); stamp(u, cu, tu); if (!neutral) { u.style.setProperty("background", cu, "important"); u.style.setProperty("color", tu, "important"); } else { u.style.removeProperty("background"); u.style.removeProperty("color"); } }
      }
    } catch (e) {}
  }
  // popup title badges follow the COLOUR MODES (user): accent by default (CSS vars), palette in
  // rainbow — painted here because dialogs appear as direct BODY children at any time.
  function paintPopups() {
    try {
      if (!document.documentElement.classList.contains("cc-popups-on")) return;
      var ts = document.querySelectorAll(".ui-dialog .ui-dialog-title, .sweet-alert h2");
      for (var i = 0; i < ts.length; i++) {
        if (!rbOn()) { ts[i].style.removeProperty("background"); ts[i].style.removeProperty("color"); continue; }   // CSS accent vars rule
        var c = rbColor(i), t = idealText(c);
        ts[i].style.setProperty("background", c, "important"); ts[i].style.setProperty("color", t, "important");
      }
    } catch (e) {}
  }
  // dialog CONTENT often lives in a SAME-ORIGIN iframe the parent CSS cannot style — inject a
  // small CC style into the inner document (user: "der button in den popupfenstern soll
  // groesser sein und linksbuendig"): big accent buttons, left-aligned button rows.
  function ccPopIframes() {
    try {
      var acc = (getComputedStyle(document.documentElement).getPropertyValue("--cc-hdr-accent") || "").trim() || "#2f6feb";
      var ifr = document.querySelectorAll(".ui-dialog iframe");
      for (var i = 0; i < ifr.length; i++) {
        (function (f) {
          function inject() {
            try {
              var d = f.contentDocument;
              if (!d || !d.head || d.getElementById("cc-pop-inner")) return;
              var st = d.createElement("style"); st.id = "cc-pop-inner";
              // 36px/14px literals: keep in sync with --cc-lgb-* in Header.css (iframes cannot read the parent's CSS vars)
              // focus law duplicated here too: the inner document cannot read the parent's focus-kill rules
              st.textContent = "input[type=button],input[type=submit],button{height:36px !important;padding:0 24px !important;font-size:14px !important;border:0 !important;border-radius:6px !important;box-shadow:none !important;background:" + acc + " !important;color:" + idealText(acc) + " !important;font-weight:600 !important;text-transform:uppercase !important;letter-spacing:.6px !important;cursor:pointer} center,.buttons{text-align:left !important} a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:none !important;box-shadow:none !important;filter:brightness(1.18)}";
              d.head.appendChild(st);
            } catch (e2) {}
          }
          inject();
          try { f.addEventListener("load", inject); } catch (e3) {}
        })(ifr[i]);
      }
    } catch (e) {}
  }
  var ccPopObs = null;
  function watchPopups() {
    try {
      if (ccPopObs) return; ccPopObs = new MutationObserver(function () { paintPopups(); ccPopIframes(); });
      ccPopObs.observe(document.body, { childList: true });   // dialogs/sweetalerts append as direct body children — cheap, no subtree
    } catch (e) {}
  }
  // ── SELF-MEASURING alignment anchor (v2.17.0). Every CC area lines its left edge up with the main
  // menu bar (rule cc-align-everything-to-menu-bar). We used to GUESS the offset with a header-gated
  // px constant (10px native text edge / 15px CC-pill edge) — which was fragile and drifted (Settings
  // sat 5-10px off). Instead MEASURE it: the first menu item's real left edge minus #displaybox's own
  // left, written once to the shared --cc-align-left custom property on <html>. Every area's sheet
  // already reads `padding-left: var(--cc-align-left)`, so ONE measured value aligns them all — correct
  // for any theme, font size, and header-on/off, with no per-area guessing. Runs on every apply() +
  // resize; the static per-sheet 10/15px stays as a no-JS fallback.
  function measureAlign() {
    try {
      var root = document.documentElement;
      if (root.classList.contains("Theme--sidebar")) return;   // vertical left menu — the horizontal-edge model doesn't apply (sheets exclude it too)
      var box = document.getElementById("displaybox");
      var tile = document.querySelector("#menu .nav-tile:not(.right)");
      var a = tile && tile.querySelector(".nav-item > a");
      if (!box || !a) return;                                  // no menu/content here -> leave the CSS fallback in place
      var aRect = a.getBoundingClientRect(), boxRect = box.getBoundingClientRect();
      // compensate for horizontal scroll INSIDE the menu tile (many tabs) so the value is stable
      var scroll = tile.scrollLeft || 0;
      var edge;
      if (root.classList.contains("cc-header-on")) {
        edge = aRect.left + scroll;                            // CC pill: its background box IS the visible left edge
      } else {
        var cs = getComputedStyle(a);                         // native text menu: the visible edge is the TEXT, i.e. past the anchor's own padding/border
        edge = aRect.left + scroll + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.borderLeftWidth) || 0);
      }
      var align = Math.round(edge - boxRect.left);
      if (align >= 0 && align < 200) root.style.setProperty("--cc-align-left", align + "px");  // sanity-bounded; overrides the sheets' static fallback inline
    } catch (e) {}
  }
  // ── DRAG-AND-DROP main-menu tab ordering (v2.20.0). The left menu tabs (#menu .nav-tile:not(.right)
  // > .nav-item, each an <a href="/PageName">) can be reordered, but ONLY after a press-and-HOLD arms it
  // (v2.24.1): the cursor stays the normal link pointer (no grab hand), and a plain click just navigates.
  // Hold an item for ~450ms and its ZONE starts to jiggle (cc-nav-wiggle) to signal "you can move me
  // now"; from that same held press a drag reorders it. TWO zones (v2.25.0, user request): the LEFT tab
  // tile (keys = hrefs, cc.navorder) and the RIGHT tile's utility icons + array-usage meter (keys =
  // link signature / "usage-bar", cc.navorder.right); items reorder only within their own zone, and
  // non-participants on the right (user menu, transient search box) never move. Native order comes from
  // the server, so this is a pure front-end reorder + persistence. Only active while the header area is
  // on (opt-in via cc.navdrag, default on). New/unknown items keep native position AFTER the saved ones.
  function navTile() { return document.querySelector("#menu .nav-tile:not(.right)"); }
  function navTileR() { return document.querySelector("#menu .nav-tile.right"); }
  // ONE MERGED ZONE across BOTH tiles (v2.30.0, user chose per popup: "alles überall anordnen").
  // Participants = every page tab, every utility icon AND the array-usage meter, in EITHER tile.
  // Non-participants (user menu .nav-user, the transient #guiSearchBoxSpan) never move.
  function navParts(tile) { if (!tile) return []; return Array.prototype.slice.call(tile.querySelectorAll(":scope > .nav-item, :scope > .usage-bar")); }
  function navAllParts() { return navParts(navTile()).concat(navParts(navTileR())); }
  // stable key: tabs by href; utils by link signature (href, else onclick, else the localised
  // title — a language switch then just resets that one icon); the meter fixed.
  function navKeyAll(it) {
    if (it.classList.contains("usage-bar")) return "usage-bar";
    var a = it.querySelector("a"); if (!a) return null;
    return ((a.getAttribute("href") || a.getAttribute("onclick") || a.getAttribute("title") || "") + "").slice(0, 160) || null;
  }
  // storage: cc.navorder.all = {left:[keys], right:[keys]} — each tile's own sequence INCLUDING
  // items dragged over from the other side. One-time fallback-migration from the old zone keys.
  function navReadAll() {
    try { var o = JSON.parse(g("cc.navorder.all", "null")); if (o && o.left && o.right) return o; } catch (e) {}
    try {
      var l = JSON.parse(g("cc.navorder", "null")) || [], r = JSON.parse(g("cc.navorder.right", "null")) || [];
      if (l.length || r.length) return { left: l, right: r };
    } catch (e2) {}
    return null;
  }
  function applyNavOrder() {
    try {
      if (ccReorder || ccDragged) return;                      // never fight a live drag
      // TRUCE (freeze root cause, live-proven via localStorage stack dumps): Unraid's Connect
      // auto-mount script observes the menu and REBUILDS its component nodes on our reorder —
      // its rebuild refires our observer, place() reorders again, and the two observers ping-pong
      // the main thread into a hard freeze (>4000 insertBefore from place() captured). If the
      // arrangement does not SETTLE after a few attempts, stand down for a while.
      if (Date.now() < ccNavTruce) return;
      var o = navReadAll(); if (!o) return;
      var lt = navTile(), rt = navTileR(); if (!lt || !rt) return;
      var byKey = {}, all = navAllParts(), i, k;
      for (i = 0; i < all.length; i++) { k = navKeyAll(all[i]); if (k && !byKey[k]) byKey[k] = all[i]; }
      // IDEMPOTENCE GATE — this also runs from the #menu observer now. THE OLD BUG ("die
      // Reihenfolge wird nicht gespeichert"): the order was applied ONLY at boot, but most
      // utility icons are appended by native scripts AFTER boot, so their saved positions
      // never took effect. insertBefore always mutates, so re-running from the observer
      // demands a strict no-op when the arrangement already matches — else it loops.
      function inPlace(tile2, want) {
        var wantHere = [], wset = {}, have = [], cur = navParts(tile2), j, kk;
        for (j = 0; j < want.length; j++) if (byKey[want[j]]) { wantHere.push(want[j]); wset[want[j]] = 1; }
        for (j = 0; j < cur.length; j++) { kk = navKeyAll(cur[j]); if (kk && wset[kk]) have.push(kk); }
        if (have.length !== wantHere.length) return false;     // a saved item currently sits in the OTHER tile
        for (j = 0; j < have.length; j++) if (have[j] !== wantHere[j]) return false;
        return true;
      }
      if (inPlace(lt, o.left) && inPlace(rt, o.right)) { ccNavTries = 0; return; }
      // Auto-mount undoes our reorder ASYNCHRONOUSLY, so a post-place re-check would always pass —
      // instead count how often we have to RE-place within a short window: a lone apply (page load,
      // late-added icon) is 1-2 rounds, a fight is an endless chain. Stand down BEFORE placing, so
      // the opponent gets nothing to react to and the chain dies.
      var now = Date.now();
      if (now - ccNavLast > 3000) ccNavTries = 0;              // old rounds don't count as a fight
      ccNavLast = now;
      if (++ccNavTries >= 4) { ccNavTruce = now + 5000; ccNavTries = 0; return; }
      function place(tile2, want) {
        var anchor = tile2.querySelector(":scope > .nav-user");   // the user menu stays the tail; null => append
        for (var j = 0; j < want.length; j++) { var it = byKey[want[j]]; if (it) tile2.insertBefore(it, anchor); }
      }
      place(lt, o.left); place(rt, o.right);                   // unknown/new items keep their native tile + slot
    } catch (e) {}
  }
  function saveNavOrder() {
    try {
      var lt = navTile(), rt = navTileR(); if (!lt || !rt) return;
      function seq(tile2) { var out = [], ps = navParts(tile2), i, k; for (i = 0; i < ps.length; i++) { k = navKeyAll(ps[i]); if (k) out.push(k); } return out; }
      localStorage.setItem("cc.navorder.all", JSON.stringify({ left: seq(lt), right: seq(rt) }));
    } catch (e) {}
  }
  var ccDragged = null, ccReorder = false, ccHoldTimer = null, ccPressXY = null, ccSuppressClick = false, ccDocBound = false;
  var ccNavTruce = 0, ccNavTries = 0, ccNavLast = 0;   // anti-ping-pong truce vs Unraid's Connect auto-mount observer (see applyNavOrder)
  function cancelHold() { if (ccHoldTimer) { clearTimeout(ccHoldTimer); ccHoldTimer = null; } ccPressXY = null; }
  function enterReorder() {   // long-press satisfied => EVERYTHING jiggles and becomes draggable (one zone)
    if (ccReorder) return; ccReorder = true;
    navAllParts().forEach(function (it) { it.setAttribute("draggable", "true"); it.classList.add("cc-nav-wiggle"); });
  }
  function exitReorder() {    // back to plain, clickable, un-draggable items
    ccReorder = false;
    navAllParts().forEach(function (it) { it.setAttribute("draggable", "false"); it.classList.remove("cc-nav-wiggle", "cc-dragging"); });
  }
  // wire ONE participant. Guard PER ITEM (the old per-TILE guard skipped every icon a native
  // script appended after the first pass — those were never draggable and never restored).
  function wireNavItem(it) {
    if (it.getAttribute("data-cc-drag") === "1") return; it.setAttribute("data-cc-drag", "1");
    it.setAttribute("draggable", "false"); it.classList.add("cc-navdrag");   // NOT draggable until a long-press arms it — a plain click just acts normally
    var la = it.querySelectorAll("a"); for (var ai = 0; ai < la.length; ai++) la[ai].setAttribute("draggable", "false");  // else the browser drags the LINK URL instead of our item
    // press-and-HOLD to arm: hold ~450ms without moving => enterReorder(). Moving before it fires,
    // or a short click, cancels the hold and just clicks. Once armed, the native HTML5 drag runs.
    it.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;                            // left button only
      cancelHold(); ccPressXY = { x: e.clientX, y: e.clientY };
      ccHoldTimer = setTimeout(function () { ccHoldTimer = null; enterReorder(); }, 450);
    });
    it.addEventListener("pointermove", function (e) {
      if (!ccPressXY || ccReorder) return;                  // once armed, let the native drag run
      if (Math.abs(e.clientX - ccPressXY.x) > 8 || Math.abs(e.clientY - ccPressXY.y) > 8) cancelHold();  // moved before arming => it's a click/scroll, not a hold
    });
    it.addEventListener("dragstart", function (e) {
      if (!ccReorder) { e.preventDefault(); return; }        // no dragging until the long-press armed the bar
      ccDragged = it; it.classList.add("cc-dragging");
      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", navKeyAll(it) || ""); } catch (e2) {}
    });
    it.addEventListener("dragend", function () { ccDragged = null; saveNavOrder(); exitReorder(); });
    it.addEventListener("dragover", function (e) {
      if (!ccDragged || ccDragged === it) return; e.preventDefault();
      var r = it.getBoundingClientRect(), before = e.clientX < r.left + r.width / 2;
      it.parentNode.insertBefore(ccDragged, before ? it : it.nextSibling);   // parentNode = whichever TILE the hovered item lives in => cross-tile drops just work
    });
    // a long-press that never turned into a drag must not ALSO fire the item's click/navigation
    it.addEventListener("click", function (e) { if (ccSuppressClick) { e.preventDefault(); e.stopPropagation(); ccSuppressClick = false; } });
  }
  function setupNavDrag() {
    try {
      if (g("cc.navdrag", "1") === "0") return;                 // opt-out
      navAllParts().forEach(wireNavItem);
      if (!ccDocBound) {   // release/Escape anywhere ends an armed-but-undragged hold — bind once, not per replaced tile
        ccDocBound = true;
        document.addEventListener("pointerup", function () {
          var armed = ccReorder && !ccDragged;   // held long enough to jiggle but released without dragging
          cancelHold();
          if (armed) { ccSuppressClick = true; exitReorder(); }
        });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape" && ccReorder && !ccDragged) exitReorder(); });
      }
    } catch (e) {}
  }
  // ── STATUS ISLAND (user-approved concept). The 91px top strip (div#header) is EMPTY between
  // Unraid's two Connect web components (unraid-header-os-version left, unraid-user-profile
  // right). Both are Shadow-DOM and UNTOUCHABLE (law: never restyle/move them) — so we build
  // our OWN light-DOM span#cc-island NEXT to them (inserted before the profile; the sheet's
  // margin-left:auto pushes it right). Data source = the CSS-hidden native footer: span#statusbar
  // textContent is bullet-separated ("Array gestartet•shiplog: started (pid …, port …)" — first
  // segment = array state, each following segment = "name: status (details)" per service), and
  // the footer text also carries the CPU/board temps ("38 °C27.8 °C" — unmarked spans, so we
  // parse TEXT, not structure). Chips are S-tier (~21px, 11px font) with 10px state dots
  // (radius var(--cc-dot-r)); tooltips ride the frameless CC data-cc-tip bubble, never title=.
  var ccIslandObs = null, ccIslandSig = "";
  function ccIslandOn() { return g("cc.enable.header", "0") !== "0" && g("cc.theming", "1") !== "0" && g("cc.island", "1") !== "0"; }
  function ccIsland() {
    try {
      var isle = document.getElementById("cc-island");
      if (!ccIslandOn()) { if (isle && isle.parentNode) isle.parentNode.removeChild(isle); ccIslandSig = ""; return; }   // teardown: gate off = island gone
      var hdr = document.getElementById("header"); if (!hdr) return;
      var foot = document.getElementById("footer"), sb = document.getElementById("statusbar");
      var raw = ((sb && sb.textContent) || "").replace(/^\s+|\s+$/g, "");
      var footTxt = (foot && foot.textContent) || "";
      // every "NN.N °C" in the footer text (defensive: temp span markup varies per board/plugins)
      var temps = [], tm, tre = /(\d+(?:[.,]\d+)?)\s*°\s*C/g;
      while ((tm = tre.exec(footTxt))) temps.push(parseFloat(tm[1].replace(",", ".")));
      var warn = parseFloat(g("cc.tempwarn", "60")); if (!isFinite(warn) || warn <= 0) warn = 60;
      // parity/…% progress text (e.g. "Parity … 12.3 %") — goes into the ARRAY chip tooltip only
      var par = /parit[^•%]{0,120}?\d+(?:[.,]\d+)?\s*%/i.exec(footTxt);
      // native uptime + edition (top-strip restyle): the Connect profile's FIRST row carries
      // "Betriebszeit …" (span.text-xs, title "Server hoch seit …") and "Unraid OS" + <em>edition.
      // Both spans STAY in the DOM (Header.css hides them visually) — we only READ them here
      // (law: never move/edit inside the components). Missing uptime span = chip skipped.
      var up = document.querySelector("#UserProfile > div:first-child span.text-xs");
      var upTxt = ((up && up.textContent) || "").replace(/\s+/g, " ").replace(/^\s|\s$/g, "");
      var upTitle = (up && up.getAttribute("title")) || "";
      var osSp = null, osRow = document.querySelector("#UserProfile > div:first-child");
      if (osRow) { var sps = osRow.querySelectorAll("span"); for (var oj = 0; oj < sps.length; oj++) { if (/Unraid\s*OS/i.test(sps[oj].textContent || "")) { osSp = sps[oj]; break; } } }
      // the span's textContent already includes the nested <em> edition ("Unraid OS Plus"); no em -> plain "Unraid OS"
      var osLabel = osSp ? (osSp.textContent || "").replace(/\s+/g, " ").replace(/^\s|\s$/g, "") : "Unraid OS";
      // array fill level: mirror the menu usage-bar's text (the native bar hides under
      // cc-usage-isl while the island is on — the chip replaces it, user call)
      var ub = document.querySelector("#menu .usage-bar > span");
      var usage = ub ? (ub.textContent || "").replace(/\s+/g, "").trim() : "";
      // usage MINI BAR geometry (user: "die Füllstandanzeige soll so ein schöner balken sein wie
      // zuvor"): fill width = the percentage, fill COLOUR carries the state (green <80, amber <95,
      // red above — the same thresholds the dot used); non-numeric text -> empty grey track
      var un = parseInt(usage, 10);
      var uw = isNaN(un) ? 0 : Math.max(0, Math.min(100, un));
      var uc = isNaN(un) ? "#8d8d8d" : un >= 95 ? "#d9433f" : un >= 80 ? "#d6a243" : "#3fae6a";
      // idempotence guard: nchan rewrites the footer every few seconds with UNCHANGED text most
      // of the time — compare the source signature and skip the DOM rebuild when nothing moved
      // (bar width/colour included so a fill change always redraws)
      var sig = upTxt + "|" + upTitle + "|" + osLabel + "|" + raw + "|" + temps.join(",") + "|" + warn + "|" + usage + "|" + uw + uc + "|" + (par ? par[0] : "");
      if (isle && sig === ccIslandSig) return;
      ccIslandSig = sig;
      if (!isle) {
        isle = document.createElement("span"); isle.id = "cc-island";
        var prof = hdr.querySelector("unraid-user-profile");   // insert BESIDE the web component, never inside it
        if (prof) hdr.insertBefore(isle, prof); else hdr.appendChild(isle);
      }
      while (isle.firstChild) isle.removeChild(isle.firstChild);   // clear + refill = idempotent rebuild
      function chip(label, dot, tip, cls) {
        var c = document.createElement("span"); c.className = "cc-isl-chip" + (cls ? " " + cls : "");
        var d = document.createElement("span"); d.className = "cc-isl-dot";
        d.style.background = dot;   // state COLOUR inline; size/shape (var(--cc-dot-r)) in the sheet
        c.appendChild(d); c.appendChild(document.createTextNode(label));
        if (tip) c.setAttribute("data-cc-tip", tip);   // frameless CC bubble (law) — no native balloon
        isle.appendChild(c);
      }
      // UPTIME chip first: label = the native text minus its leading word ("Betriebszeit"/"Uptime"
      // per locale); bubble = the native title ("Server hoch seit …") + the full text
      if (upTxt) chip(upTxt.replace(/^(Betriebszeit|Uptime)\s*/i, ""), "#3fae6a", (upTitle ? upTitle + " — " : "") + upTxt, "cc-isl-up");
      // OS/edition chip: neutral grey dot — informational, not a state. The native 7.3.2 version
      // dropdown stays functional in place (CSS restyles it) — deliberately NOT duplicated here.
      chip(osLabel, "#8d8d8d", T("Unraid-Edition", "Unraid edition"), "cc-isl-os");
      var segs = raw ? raw.split("•") : [], i, s;
      for (i = 0; i < segs.length; i++) {
        s = segs[i].replace(/^\s+|\s+$/g, ""); if (!s) continue;
        if (i === 0) {   // ARRAY chip: first segment = array state, label = the segment text
          var low = s.toLowerCase(), dc = "#d6a243";   // amber = unclear/transitional state
          if (low.indexOf("gestartet") !== -1 || low.indexOf("started") !== -1) dc = "#3fae6a";
          else if (low.indexOf("gestoppt") !== -1 || low.indexOf("stopped") !== -1) dc = "#d9433f";
          chip(s, dc, par ? s + " — " + par[0].replace(/\s+/g, " ") : s);
          // FILL-LEVEL chip right beside the array state: MINI BAR (track + fill) + % text, no
          // dot — the fill colour alone carries the state (uw/uc computed above with the sig)
          if (usage) {
            var uch = document.createElement("span"); uch.className = "cc-isl-chip cc-isl-usage";
            var ubar = document.createElement("span"); ubar.className = "cc-isl-bar";
            var ufill = document.createElement("span"); ufill.className = "cc-isl-fill";
            ufill.style.width = uw + "%"; ufill.style.background = uc;   // width/state inline; track size/shape in the sheet
            ubar.appendChild(ufill); uch.appendChild(ubar); uch.appendChild(document.createTextNode(usage));
            uch.setAttribute("data-cc-tip", T("Array-Füllstand ", "Array usage ") + usage);
            isle.appendChild(uch);
          }
        }
        // service segments (e.g. "shiplog: started …") are deliberately NOT mirrored as chips —
        // the user questioned them twice; that daemon status stays in the (hidden) native footer
      }
      // TEMP chips: always visible (user call) — the DOT carries the state (green below the
      // cc.tempwarn threshold, amber at/above, red at threshold+15)
      for (i = 0; i < temps.length; i++) {
        chip(Math.round(temps[i]) + " °C", temps[i] >= warn + 15 ? "#d9433f" : temps[i] >= warn ? "#d6a243" : "#3fae6a", temps[i] + " °C");
      }
    } catch (e) {}
  }
  function watchIsland() {   // nchan rewrites the (hidden) footer live — mirror every update into the island
    try {
      if (ccIslandObs) return;
      var f = document.getElementById("footer"); if (!f) return;   // no footer yet -> the next apply() retries
      ccIslandObs = new MutationObserver(function () { ccIsland(); });
      ccIslandObs.observe(f, { childList: true, subtree: true, characterData: true });   // we write into #header, never #footer -> no loop
    } catch (e) {}
  }
  // ── SERVER-NAME BRAND (top-strip restyle). span#cc-brand = FIRST child of div#header, a
  // light-DOM SIBLING of the Connect components (law: never inside them — auto-mount rebuilds
  // their nodes; our sibling survives, and Header.css does all the styling). Name source is the
  // document title ("Bottich/Dashboard" -> "Bottich"), fallback the native server-name span in
  // the profile's controls row, else "Unraid". Gates on header+theming ONLY — NOT cc.island:
  // hiding the status island must not remove the server name.
  var ccBrandSig = "";
  function ccBrandOn() { return g("cc.enable.header", "0") !== "0" && g("cc.theming", "1") !== "0"; }
  function ccBrand() {
    try {
      var br = document.getElementById("cc-brand");
      if (!ccBrandOn()) { if (br && br.parentNode) br.parentNode.removeChild(br); ccBrandSig = ""; return; }   // teardown: gate off = brand gone (island idiom)
      var hdr = document.getElementById("header"); if (!hdr) return;
      var name = (document.title.split("/")[0] || "").replace(/^\s+|\s+$/g, "");
      if (!name) {   // titleless page -> read the native server-name span (first span of the profile's controls row)
        var ns = document.querySelector("#UserProfile > div:nth-child(2) span");
        name = ((ns && ns.textContent) || "").replace(/^\s+|\s+$/g, "");
      }
      if (!name) name = "Unraid";
      if (br && name === ccBrandSig) return;   // idempotence: profile rebuilds re-run us, only a real change re-renders
      ccBrandSig = name;
      if (!br) { br = document.createElement("span"); br.id = "cc-brand"; hdr.insertBefore(br, hdr.firstChild); }
      while (br.firstChild) br.removeChild(br.firstChild);   // clear + refill = idempotent rebuild
      var nm = document.createElement("span"); nm.className = "cc-brand-name";
      nm.appendChild(document.createTextNode(name));
      br.appendChild(nm);
    } catch (e) {}
  }
  var ccProfObs = null, ccProfT = null;
  function watchProfile() {   // uptime/edition/name live inside the Connect profile — auto-mount rebuilds it at will
    try {
      if (ccProfObs) return;
      // observe the CUSTOM ELEMENT when present (it survives auto-mount replacing div#UserProfile
      // wholesale), never div#header — we write #cc-island/#cc-brand into #header ourselves and
      // must not observe our own writes
      var p = document.querySelector("unraid-user-profile") || document.getElementById("UserProfile");
      if (!p) return;   // not mounted yet -> the next apply() retries (watchIsland idiom)
      ccProfObs = new MutationObserver(function () {
        if (ccProfT) return;   // DEBOUNCE 120ms (freeze law): coalesce auto-mount's rebuild burst into ONE pass
        ccProfT = setTimeout(function () {
          ccProfT = null;
          ccIsland(); ccBrand();   // both are sig-guarded no-ops when nothing changed; we never write inside the component, so no loop is possible — the debounce stays anyway
          ccDockProfile();         // auto-mount replaced div#UserProfile -> the fresh node needs its dock styles again (diff-written, attribute-only: this observer ignores them)
        }, 120);
      });
      ccProfObs.observe(p, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
  }
  // ── GLOBAL FLOATING hover bubble (user: "im Start-Tab passen viele Mouseover-Bubbles nicht …
  // systemweit checken"). Pure-CSS ::after bubbles get CLIPPED by overflow ancestors (nav tiles,
  // tables) and by the viewport edge — so ONE shared body-mounted div#cc-tipfloat serves EVERY
  // [data-cc-tip]/[data-tip] anchor DOCUMENT-WIDE (island chips, docker lists, shares tables,
  // the settings panel …) via delegation on document (survives any rebuild). Positioning: fixed,
  // centred under the anchor, clamped into the viewport (8px margins, the arrow stays over the
  // anchor), FLIPPED above the anchor when the bottom edge would clip it (cc-tip-above turns the
  // arrow downward). Hidden on scroll + pointerdown. Master-theming gated (cc-popups-on mirrors it).
  var ccTipBound = false, ccTipCur = null;
  function ccTipEl() {
    var d = document.getElementById("cc-tipfloat");
    if (!d) { d = document.createElement("div"); d.id = "cc-tipfloat"; document.body.appendChild(d); }
    return d;
  }
  function ccTipHide() { var d = document.getElementById("cc-tipfloat"); if (d) d.style.display = "none"; ccTipCur = null; }
  function ccTipShow(t) {
    var tip = t.getAttribute("data-cc-tip") || t.getAttribute("data-tip"); if (!tip) return;
    var d = ccTipEl(), r = t.getBoundingClientRect();
    d.textContent = tip;
    d.style.display = "block";                                     // show first — size only measures while visible
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = document.documentElement.clientHeight || window.innerHeight;
    var w = d.offsetWidth, h = d.offsetHeight, cx = r.left + r.width / 2;
    var x = Math.max(8 + w / 2, Math.min(vw - 8 - w / 2, cx));     // clamp INTO the viewport (tables/rows run to both edges)
    d.style.left = x + "px";                                       // left = bubble CENTRE (CSS translateX(-50%))
    // vertical FLIP: a bubble that would clip at the bottom edge opens ABOVE the anchor instead
    // (only when it actually fits up there); cc-tip-above points the arrow downward
    var above = r.bottom + 8 + h > vh && r.top - 8 - h >= 0;
    d.classList.toggle("cc-tip-above", above);
    d.style.top = (above ? r.top - 8 - h : r.bottom + 8) + "px";
    d.style.setProperty("--cc-tip-ax", Math.max(10, Math.min(w - 10, cx - (x - w / 2))) + "px");   // arrow stays over the anchor even when the bubble clamps
  }
  function ccWireTips() {
    try {
      if (ccTipBound) return;
      ccTipBound = true;
      function over(e) {
        if (!document.documentElement.classList.contains("cc-popups-on")) return;   // master theming off -> fully native
        var t = e.target && e.target.closest ? e.target.closest("[data-cc-tip], [data-tip], [title]") : null;
        if (!t) return;
        // a raw title anywhere (a menu icon a script never converted, a native control) becomes a
        // CC bubble on the fly + the OS balloon is suppressed — so EVERY hover text is a CC bubble
        // (user: "die Symbole haben nicht alle ein Mouseover-Text"). Skip empty/whitespace titles.
        if (!t.getAttribute("data-cc-tip") && !t.getAttribute("data-tip")) {
          var nt = t.getAttribute("title");
          if (nt && nt.trim()) { t.setAttribute("data-cc-tip", nt); t.removeAttribute("title"); }
          else return;
        }
        if (t === ccTipCur) return;                                // same anchor -> the bubble already stands
        ccTipCur = t; ccTipShow(t);
      }
      function out(e) {
        if (!ccTipCur) return;
        var to = e.relatedTarget;
        if (to && ccTipCur.contains(to)) return;                   // moved within the same anchor
        ccTipHide();
      }
      document.addEventListener("mouseover", over);
      document.addEventListener("mouseout", out);
      document.addEventListener("focusin", over);
      document.addEventListener("focusout", out);
      document.addEventListener("pointerdown", ccTipHide, true);   // a press means action, not reading -> hide
      window.addEventListener("scroll", ccTipHide, true);          // any scroll de-anchors the fixed bubble -> hide (capture catches inner-container scrolls too)
    } catch (e) {}
  }
  // ── BELL + BURGER DOCK (user call: the two profile triggers join the MENU icon row at its FAR
  // RIGHT END, freeing the whole top strip for the island). div#UserProfile lives INSIDE the
  // Connect component, so it is never MOVED in the DOM (law — auto-mount rebuilds would wipe it);
  // it is PINNED with inline styles instead: position:fixed, left = 8px RIGHT of the row's last
  // visible item — the .nav-tile.right 84px padding-right (Header.css) reserves the room, and the
  // Plugins-button pin (plugins.js) includes the docked pair in its right-edge measurement.
  // Diff-written styles are attribute-only mutations, which the childList-only profile observer
  // ignores -> no loop. Re-measured on apply()/scroll/resize/menu+profile passes.
  var ccDockProps = ["position", "left", "right", "top", "height", "width", "z-index"];
  var ccDockRaf = 0;
  function ccDockPass() { ccDockRaf = 0; ccDockProfile(); }
  function ccDockProfile() {
    try {
      if (!document.documentElement.classList.contains("cc-header-on")) { ccUndockProfile(); return; }
      var up = document.getElementById("UserProfile"); if (!up) return;
      // anchor = the VISUALLY rightmost row participant (icons + usage meter): the merged drag
      // zone lets DOM order differ from visual order, so take the max right edge, not the last node
      var parts = document.querySelectorAll("#menu .nav-item.util > a, #menu .usage-bar"), r = null, i, rr;
      for (i = 0; i < parts.length; i++) { rr = parts[i].getBoundingClientRect(); if (rr.width > 0 && rr.height > 0 && (!r || rr.right > r.right)) r = rr; }
      if (!r) return;                                              // no icon row (sidebar theme / bare pages) -> leave the native layout alone
      var menuEl = document.getElementById("menu");
      var mz = menuEl ? parseInt(getComputedStyle(menuEl).zIndex, 10) : NaN;
      function set(p, v) { if (up.style.getPropertyValue(p) !== v) up.style.setProperty(p, v, "important"); }   // "important" beats the Tailwind utilities; diff-write = zero mutations once settled
      // the triggers carry Tailwind MIN-width/height (36px) that beat even sheet !important
      // height rules (live-proven) — enforce the 30px icon box INLINE per span
      var sp = up.querySelectorAll(":scope > div:nth-child(2) > span");
      for (i = 0; i < sp.length; i++) {
        var ss = sp[i].style;
        if (ss.getPropertyValue("min-height") !== "30px") { ss.setProperty("width", "30px", "important"); ss.setProperty("height", "30px", "important"); ss.setProperty("min-width", "30px", "important"); ss.setProperty("min-height", "30px", "important"); }
        // CC bubbles instead of native balloons (the #menu sweep can't reach these — they
        // live outside #menu); i===0 = bell, the last = burger (auto-mount keeps this order)
        if (!sp[i].getAttribute("data-cc-tip")) sp[i].setAttribute("data-cc-tip", i === 0 ? T("Benachrichtigungen", "Notifications") : T("Menü", "Menu"));
        if (sp[i].getAttribute("title")) sp[i].removeAttribute("title");
      }
      var vw = document.documentElement.clientWidth;
      var target = Math.min(Math.round(r.right + 8), vw - 84);     // 8px right of the row tail, clamped into the viewport
      set("position", "fixed");
      set("right", "auto");
      set("width", "76px");                                        // container = content: its native 236px width parked the flex-end row 160px right of `left` (live-proven off-screen boxes)
      set("top", Math.round(r.top + (r.height - 30) / 2) + "px");  // centre the 30px boxes on the icon line
      set("height", "30px");
      set("z-index", String(isFinite(mz) ? mz + 1 : 1000));        // above the sticky menu it overlaps
      set("left", target + "px");
      // MEASURED correction against the VISIBLE BELL BOX (not the container/row — inner margins
      // offset both from it, live-proven ±4px): align the first trigger's box exactly to the
      // icon line on both axes. v2.31.9 idiom — measure where it landed, shift by the delta.
      if (sp.length) {
        var sr = sp[0].getBoundingClientRect();
        if (sr.width > 0) {
          var dx = target - Math.round(sr.left);
          if (dx) set("left", (parseInt(up.style.getPropertyValue("left"), 10) + dx) + "px");
          var dy = Math.round(r.top) - Math.round(sr.top);   // r = the icon rect; align box top to icon top
          if (dy) set("top", (parseInt(up.style.getPropertyValue("top"), 10) + dy) + "px");
        }
      }
    } catch (e) {}
  }
  function ccUndockProfile() {                                     // OFF branch: remove exactly the props we set -> fully native again
    try {
      var up = document.getElementById("UserProfile"); if (!up) return;
      for (var i = 0; i < ccDockProps.length; i++) up.style.removeProperty(ccDockProps[i]);
      var sp = up.querySelectorAll(":scope > div:nth-child(2) > span");
      for (i = 0; i < sp.length; i++) { ["width", "height", "min-width", "min-height"].forEach(function (p) { sp[i].style.removeProperty(p); }); }
    } catch (e) {}
  }
  function apply() {
    try {
      var root = document.documentElement;
      // MASTER THEMING off (cc.theming="0") behaves like the area being disabled — header is
      // purely presentational. The storage listener re-runs apply(), so a live toggle reverts.
      var on = g("cc.enable.header", "0") !== "0" && g("cc.theming", "1") !== "0";
      root.classList.toggle("cc-header-on", on);
      // GLOBAL Badge-Form "circle": header.js runs on every page, so it owns the one global class the
      // per-object 50%-radius overrides in every sheet key off. Set it UNCONDITIONALLY (badge shape is
      // global, independent of whether the header area itself is on) — it only rounds SQUARE badges, and
      // if no area is enabled there are no badges to round, so it's harmless when everything is off.
      root.classList.toggle("cc-shape-circle", g("cc.badgeshape", "pill") === "circle");
      // GLOBAL popup theming (user: "alle Subfenster/Popupfenster in den CC Style"): the native
      // jQuery-UI dialogs (openBox/openPlugin) + SweetAlert confirmations follow the CC look on
      // every page. Master-gated only — it is chrome, not an area of its own.
      root.classList.toggle("cc-popups-on", g("cc.theming", "1") !== "0");
      // GLOBAL footer hide (user: "die native Leiste wo Array gestartet steht ... komplett
      // ausblenden"): footer#footer = the fixed 28px strip (#statusraid/#statusbar + temps +
      // copyright). DEFAULT HIDDEN — cc.footer="0" (settings toggle) brings it back. Same
      // master-gating idiom as cc-popups-on; the storage listener re-runs apply() live.
      root.classList.toggle("cc-footer-off", g("cc.footer", "1") === "1" && g("cc.theming", "1") !== "0");
      // array-usage chip lives in the island now — hide the native menu usage-bar while the
      // island is on (its data source; the chip mirrors the text). Island off = native bar back.
      root.classList.toggle("cc-usage-isl", on && ccIslandOn());
      paintPopups(); watchPopups();
      ccWireTips();     // document-wide floating-bubble delegation (bound once) — on EVERY page: docker/shares/settings anchors ride it even with the header area off
      // paintNav() with cc-header-on now removed => rb=false => it removeProperty's every
      // lingering rainbow inline colour, so a live theming-OFF (even with Rainbow on) fully
      // reverts the menu bar instead of leaving the coloured tabs behind.
      if (!on) {
        paintNav(); measureAlign();
        ccIsland();   // gate off inside -> removes span#cc-island from div#header
        ccBrand();    // same teardown for span#cc-brand (server name)
        // styled hover bubbles -> native title balloons back (area off = fully native)
        var tps0 = document.querySelectorAll("#menu [data-cc-tip]");
        for (var tq = 0; tq < tps0.length; tq++) { tps0[tq].setAttribute("title", tps0[tq].getAttribute("data-cc-tip")); tps0[tq].removeAttribute("data-cc-tip"); }
        ccTipHide();        // the floating bubble must not linger once the titles are native again
        ccUndockProfile();  // bell/burger back to their native top-right spot
        return;   // measure even when the header area is off: OTHER areas (shares/settings) still align to the native menu-text edge
      }
      // utility-icon titles -> the styled CC bubble (user: hover bubbles frameless + badge-form;
      // the native OS balloon can't be styled). Idempotent; the off-branch above restores.
      var tps1 = document.querySelectorAll("#menu .nav-item.util a[title], #menu .usage-bar [title]");
      for (var tr1 = 0; tr1 < tps1.length; tr1++) { var th = tps1[tr1]; th.setAttribute("data-cc-tip", th.getAttribute("title")); th.removeAttribute("title"); }
      var a = accent();
      // ISOLATED accent var — NOT the shared --cc-accent. Other global enhancers (shares.js,
      // the page-specific docker/plugins/vms) also write --cc-accent on documentElement and
      // would clobber the menu-bar colour (and vice-versa); each area now owns its var and the
      // sheet reads --cc-hdr-accent. (--cc-b-radius stays shared: one global Badge-Form.)
      root.style.setProperty("--cc-hdr-accent", a);
      root.style.setProperty("--cc-hdr-accent-text", idealText(a));
      root.style.setProperty("--cc-b-radius", shape());
      root.classList.toggle("cc-header-rb", rbOn());
      applyNavOrder();  // restore the user's saved tab order BEFORE painting/measuring (it reorders the DOM)
      setupNavDrag();   // make the tabs draggable (idempotent per tile)
      paintNav();
      measureAlign();   // after the pill geometry is live -> measure the real left edge
      ccIsland();       // status island in the top strip (self-gated on cc.island, default on)
      ccBrand();        // server-name brand, first child of the top strip (header+theming gated, NOT cc.island)
      watchIsland();    // live footer observer so nchan status/temp updates flow into the chips
      watchProfile();   // debounced profile observer so uptime/edition/name rebuilds flow into chips + brand
      ccDockProfile();  // glue bell+burger onto the far right end of the menu icon row (re-measured every pass)
      // late passes against STALE geometry (live-proven: the first pass measured the icon row
      // 160px right of its settled position and nothing re-triggered) — the row settles as
      // late-loading icons/styles arrive, so re-pin twice after the dust
      setTimeout(ccDockProfile, 300); setTimeout(ccDockProfile, 1200);
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
      // DEBOUNCED (freeze fix): a synchronous callback here ping-ponged with Unraid's Connect
      // auto-mount observer (its component rebuilds refire us, our reorder refires it) and the
      // microtask storm froze the tab. The timer hop lets the event loop breathe and coalesces
      // auto-mount's burst into ONE pass; the applyNavOrder truce covers the rest.
      var moT = null;
      var mo = new MutationObserver(function () {
        if (moT) return;
        moT = setTimeout(function () {
          moT = null;
          reorderSearch();
          document.documentElement.classList.toggle("cc-search-open", !!document.getElementById("guiSearchBoxSpan"));
          // late-added utility icons (native scripts append them AFTER boot) get their saved slot
          // + drag wiring here — applyNavOrder is a strict no-op once the arrangement matches.
          if (document.documentElement.classList.contains("cc-header-on")) { applyNavOrder(); setupNavDrag(); }
          paintNav();
          ccDockProfile();   // the icon row shifts when the search box opens/closes or icons arrive late — re-pin the dock (self-gated)
        }, 120);
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
    // re-measure the alignment anchor after fonts settle + on resize (the pill edge shifts with the
    // viewport/font). rAF catches the post-layout pass; the load event catches late web-font swaps.
    try {
      if (window.requestAnimationFrame) window.requestAnimationFrame(measureAlign);
      window.addEventListener("resize", measureAlign);
      window.addEventListener("load", measureAlign);
    } catch (e) {}
    watchSearch();
    wireSearchToggle();
    // the dock is position:fixed against the STICKY menu row: while #header scrolls away the icon
    // row's y shifts, so re-measure on scroll (rAF-throttled, passive) + resize (debounced)
    try {
      var dockRz = null;
      window.addEventListener("scroll", function () {
        if (ccDockRaf) return;
        ccDockRaf = window.requestAnimationFrame ? window.requestAnimationFrame(ccDockPass) : setTimeout(ccDockPass, 16);
      }, { passive: true });
      window.addEventListener("resize", function () { if (dockRz) clearTimeout(dockRz); dockRz = setTimeout(function () { dockRz = null; ccDockProfile(); }, 120); });
    } catch (e) {}
    // the Settings page (or the Docker tab) writes cc.* AND section-specific keys (cch./ccs./
    // ccp./ccv.) from another origin/tab — re-apply on any of them. NB: "cch.accent" does NOT
    // contain the substring "cc." so the old indexOf("cc.")===0 check silently missed it.
    try { window.addEventListener("storage", function (e) { if (e && e.key && e.key !== "cc.stateCache" && /^cc[a-z]*\./.test(e.key)) apply(); }); } catch (e) {} // cc.stateCache EXCLUDED: docker.js rewrites it every 9s, which would repaint this area on a 9s loop in every other open tab
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
