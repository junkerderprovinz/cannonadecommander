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
      if (inPlace(lt, o.left) && inPlace(rt, o.right)) return;
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
      paintPopups(); watchPopups();
      // paintNav() with cc-header-on now removed => rb=false => it removeProperty's every
      // lingering rainbow inline colour, so a live theming-OFF (even with Rainbow on) fully
      // reverts the menu bar instead of leaving the coloured tabs behind.
      if (!on) { paintNav(); measureAlign(); return; }   // measure even when the header area is off: OTHER areas (shares/settings) still align to the native menu-text edge
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
        // late-added utility icons (native scripts append them AFTER boot) get their saved slot
        // + drag wiring here — applyNavOrder is a strict no-op once the arrangement matches.
        if (document.documentElement.classList.contains("cc-header-on")) { applyNavOrder(); setupNavDrag(); }
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
    // re-measure the alignment anchor after fonts settle + on resize (the pill edge shifts with the
    // viewport/font). rAF catches the post-layout pass; the load event catches late web-font swaps.
    try {
      if (window.requestAnimationFrame) window.requestAnimationFrame(measureAlign);
      window.addEventListener("resize", measureAlign);
      window.addEventListener("load", measureAlign);
    } catch (e) {}
    watchSearch();
    wireSearchToggle();
    // the Settings page (or the Docker tab) writes cc.* AND section-specific keys (cch./ccs./
    // ccp./ccv.) from another origin/tab — re-apply on any of them. NB: "cch.accent" does NOT
    // contain the substring "cc." so the old indexOf("cc.")===0 check silently missed it.
    try { window.addEventListener("storage", function (e) { if (e && e.key && e.key !== "cc.stateCache" && /^cc[a-z]*\./.test(e.key)) apply(); }); } catch (e) {} // cc.stateCache EXCLUDED: docker.js rewrites it every 9s, which would repaint this area on a 9s loop in every other open tab
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
