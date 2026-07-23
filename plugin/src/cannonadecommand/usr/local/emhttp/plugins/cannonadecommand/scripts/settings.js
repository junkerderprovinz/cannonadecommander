/* CannonadeCommand settings page. Client-side only: renders a polished,
 * card-based form (ShipLog-style, Carbon dark) into #cc-settings and persists to
 * localStorage (cc.accent / cc.rainbow / cc.iconcolor / cc.iconstrength /
 * cc.density / cc.view / cc.colview). The Docker-tab enhancer reads the same keys
 * and reacts live via the storage event. */
(function () {
  "use strict";
  var root = document.getElementById("cc-settings");
  if (!root) return;
  // tiny page-local style additions (docker.css is owned elsewhere): md-tier buttons for the
  // backup section (30px line, pad 0 14px, grey fill + hover accent via .cc-btn) + its inline
  // notice. NO borders/outlines/rings anywhere (house law); lives in <head>, survives render().
  (function () {
    if (document.getElementById("cc-set-xtra")) return;
    var st = document.createElement("style"); st.id = "cc-set-xtra";
    st.textContent =
      "#cc-settings .cc-set-xbtn{display:inline-flex;align-items:center;justify-content:center;height:var(--cc-md-h,30px);padding:var(--cc-md-btnpad,0 14px);font-size:var(--cc-md-fs,13px);font-weight:600;border-radius:var(--cc-b-radius,999px);box-sizing:border-box;margin:12px 10px 0 0}" +
      "#cc-settings .cc-set-xnote{margin-top:10px;font-size:12px;white-space:pre-wrap}" +
      // #17 flag picker: colour-stripe swatches + searchable custom dropdown (emoji flags fail on Windows)
      "#cc-settings .cc-flag-sw{display:inline-block;width:22px;height:15px;border-radius:3px;flex:0 0 auto;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}" +
      "#cc-settings .cc-flag-sw-lg{width:34px;height:22px}" +
      // #2 real flag image (4:3 SVG); same footprint as the stripe swatch, subtle hairline
      "#cc-settings .cc-flag-img{display:inline-block;width:22px;height:15px;flex:0 0 auto;object-fit:cover;border-radius:3px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}" +
      "#cc-settings .cc-flag-img-lg{width:34px;height:22px}" +
      // #3 rainbow palette + flag colours stretch to fill the card width; reset icon aligns right (toggle line)
      "#cc-settings .cc-set-swatches.cc-fill{display:flex;gap:6px;align-items:center}" +
      "#cc-settings .cc-set-swatches.cc-fill .cc-set-sw{flex:1 1 0;height:22px;min-width:0;border-radius:4px}" +
      "#cc-settings .cc-set-swatches.cc-fill .cc-set-ibtn{flex:0 0 auto;margin-left:auto}" +
      // #28 palette presets
      "#cc-settings .cc-set-presets{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}" +
      "#cc-settings .cc-preset{cursor:pointer;border-radius:8px;overflow:hidden;background:#232323;padding-bottom:5px;width:104px;transition:filter .12s,transform .12s}" +
      "#cc-settings .cc-preset:hover{filter:brightness(1.16);transform:translateY(-1px)}" +
      "#cc-settings .cc-preset:focus-visible{outline:none;filter:brightness(1.2)}" +
      "#cc-settings .cc-preset-strip{display:flex;height:22px}" +
      "#cc-settings .cc-preset-strip span{flex:1}" +
      "#cc-settings .cc-preset-name{display:block;text-align:center;font-size:11px;font-weight:600;color:#cfcfcf;margin-top:5px}" +
      // #26 settings search + nuke-reset button
      "#cc-settings .cc-set-searchrow{margin:12px 0 2px}" +
      "#cc-settings .cc-set-search{box-sizing:border-box;width:100%;max-width:420px;background:#232323;color:#eaeaea;border:none;outline:none;border-radius:8px;padding:9px 13px;font-size:13px;transition:background-color .12s}" +
      "#cc-settings .cc-set-search::placeholder{color:#8d8d8d}" +
      "#cc-settings .cc-set-search:focus{background:#2e2e2e}" +
      "#cc-settings .cc-set-danger{background:#5a2a2a!important;color:#ffd7d7!important}" +
      "#cc-settings .cc-set-danger:hover{filter:brightness(1.18)}" +
      "#cc-settings .cc-flag-picker{position:relative;margin-top:6px;max-width:340px}" +
      "#cc-settings .cc-flag-trigger{display:flex;align-items:center;gap:9px;background:#232323;border-radius:8px;padding:7px 12px;cursor:pointer;user-select:none}" +
      "#cc-settings .cc-flag-trigger:hover{filter:brightness(1.1)}" +
      "#cc-settings .cc-flag-name{font-size:13px;color:#eaeaea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#cc-settings .cc-flag-caret{margin-left:auto;color:#9a9a9a;font-size:11px}" +
      "#cc-settings .cc-flag-panel{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:50;background:#1c1c1c;border-radius:10px;box-shadow:0 12px 34px rgba(0,0,0,.6);overflow:hidden}" +
      "#cc-settings .cc-flag-search{box-sizing:border-box;background:#232323;color:#eaeaea;border:none;outline:none;border-radius:8px;padding:8px 10px;margin:8px;width:calc(100% - 16px);font-size:13px}" +
      "#cc-settings .cc-flag-list{max-height:260px;overflow-y:auto;padding:0 6px 6px}" +
      "#cc-settings .cc-flag-item{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:6px;cursor:pointer}" +
      "#cc-settings .cc-flag-item:hover,#cc-settings .cc-flag-item.cc-sel{background:rgba(255,255,255,.09)}";   // #25 keyboard highlight
    document.head.appendChild(st);
  })();
  var LANG = (document.documentElement.lang || navigator.language || "en").slice(0, 2).toLowerCase();
  var de = LANG === "de";
  function T(d, e) { return de ? d : e; }

  var COLS = [
    { key: "update", label: T("Update-Status", "Update status") },
    { key: "force", label: T("Update erzwingen", "Force update") },
    { key: "version", label: T("Image-Tag (latest)", "Image tag (latest)") },
    { key: "net", label: T("Netzwerk", "Network") },
    { key: "ip", label: T("Container-IP", "Container IP") },
    { key: "lan", label: T("LAN-IP", "LAN IP") },
    { key: "port", label: T("Ports", "Ports") },
    { key: "res", label: T("CPU / RAM", "CPU / RAM") },
    { key: "id", label: T("Container-ID", "Container ID") },
    { key: "von", label: T("Von / Quelle", "From / source") },
    { key: "vol", label: T("Volumes", "Volumes") },
    { key: "plan", label: T("Startplan", "Plan") },
  ];
  var PRESETS = ["#2f6feb", "#1f9d55", "#ff8c2f", "#8b5cf6", "#e0912a", "#d9433f", "#0ea5a4", "#e05299", "#525252"];
  // rainbow-mode colour per column (same order as COLS): the matrix checkboxes take
  // these when rainbow mode is on, so the settings echo the Docker-tab badge colours.
  // net/ip/lan/port share a network-ish family (net kept its old purple; ip/lan/port added after it).
  var RB = ["#1f9d55", "#2f6feb", "#6b7280", "#8b5cf6", "#7c6df0", "#5b8def", "#4aa3c7", "#d9433f", "#0ea5a4", "#e05299", "#0891b2", "#6366f1"];

  // Each column gets its OWN object via a factory call — chkCell mutates colview[key][v] IN PLACE, so a
  // SHARED `both`/`adv` reference let one checkbox flip every aliased column (net/ip/lan/port all aliased
  // `both`, blanking the whole Simple-view network area). Must stay in lock-step with docker.js defaultColview().
  function defColview() { var adv = function () { return { s: false, a: true }; }, both = function () { return { s: true, a: true }; }; return { update: both(), force: adv(), version: adv(), net: both(), ip: both(), lan: both(), port: both(), res: both(), id: adv(), von: adv(), vol: adv(), plan: both() }; }
  function get(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function loadColview() { try { var j = JSON.parse(localStorage.getItem("cc.colview2") || "null"); if (j && typeof j === "object") { var d = defColview(); Object.keys(d).forEach(function (k) { if (j[k]) d[k] = { s: !!j[k].s, a: !!j[k].a }; }); return d; } } catch (e) {} return defColview(); }

  var accent = get("cc.accent", "#2f6feb");
  var rainbow = get("cc.rainbow", "0") === "1";
  var iconcolor = get("cc.iconcolor", "");
  var iconstrength = parseInt(get("cc.iconstrength", "100"), 10);
  var vmicons = get("cc.vmicons", "1") === "1"; // ON by default; the switch is an opt-OUT
  var density = get("cc.density", "normal");
  var view = get("cc.view", "list");
  var colview = loadColview();

  // Notifications are engine-side config (not localStorage): loaded/saved through
  // the same-origin proxy. We keep the WHOLE config so a notify save never drops
  // the per-container schedules/watchdogs set in the Docker tab.
  var PROXY = "/plugins/cannonadecommand/server/ccapi.php";
  var fullConfig = { schedules: [], watchdogs: [], notify: { unraid: false, webhook: "" } };
  var notify = { unraid: false, webhook: "" };
  var shapeIface = "";       // engine config: interface the egress shaping runs on (blank = eth0)
  var notifyDirty = false;   // true once the user has touched the Notifications card
  var shapeDirty = false;    // true once the user has touched the shaping-interface field
  var configLoaded = false;  // true only after a SUCCESSFUL initial GET /config
  // mirror every cc.* write into the engine config — localStorage is per-origin,
  // so without this the toggles only ever applied to the origin they were set on
  var uiSyncT = null, uiPending = {};
  (function () {
    try {
      var orig = localStorage.setItem.bind(localStorage);
      window.__ccLS = orig;
      localStorage.setItem = function (k, v) {
        orig(k, v);
        try { if (/^cc[a-z]*\./.test(String(k)) && k !== "cc.stateCache") { uiPending[k] = 1; clearTimeout(uiSyncT); uiSyncT = setTimeout(pushUISettings, 800); } } catch (e) {}
      };
    } catch (e) {}
  })();
  function collectUISettings() { var o = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && /^cc[a-z]*\./.test(k) && k !== "cc.stateCache") o[k] = localStorage.getItem(k); } return o; }
  // merge ONLY the changed keys into the server map (never replace it wholesale)
  function pushUISettings() {
    var keys = Object.keys(uiPending); if (!keys.length) return;
    api("GET", "config").then(function (c) {
      if (!c || typeof c !== "object") return;
      var u = c.ui_settings || {};
      keys.forEach(function (k) { var v = localStorage.getItem(k); if (v === null) delete u[k]; else u[k] = v; });
      uiPending = {};
      c.ui_settings = u;
      return api("PUT", "config", c);
    }).catch(function () {});
  }
  function adoptUISettings(u) {
    var changed = false;
    try { Object.keys(u || {}).forEach(function (k) { if (/^cc[a-z]*\./.test(k) && k !== "cc.stateCache" && localStorage.getItem(k) !== u[k]) { (window.__ccLS || localStorage.setItem.bind(localStorage))(k, u[k]); changed = true; } }); } catch (e) {}
    return changed;
  }
  function api(method, path, body) {
    var opts = { method: method, headers: { Accept: "application/json" } };
    var u = PROXY + "?path=" + encodeURIComponent(path);
    var tk = "";
    try { tk = (typeof window.csrf_token !== "undefined" && window.csrf_token) || (document.querySelector('input[name="csrf_token"]') || {}).value || ((document.cookie || "").match(/csrf_token=([0-9A-Za-z]+)/) || [])[1] || ""; } catch (e) {}
    if (method !== "GET") { // emhttp accepts the csrf_token ONLY in a form body
      opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.body = (tk ? "csrf_token=" + encodeURIComponent(tk) + "&" : "") + "data=" + encodeURIComponent(JSON.stringify(body != null ? body : {}));
    }
    return fetch(u, opts).then(function (r) {
      return r.text().then(function (tx) { var d = null; try { d = tx ? JSON.parse(tx) : null; } catch (e) {} if (!r.ok) throw new Error((d && d.error) || ("HTTP " + r.status)); return d; });
    });
  }
  // ── permanently embedded colour picker (no OS popup window) ──
  function hexToHsv(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return null;
    var n = parseInt(m[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); }
    if (h < 0) h += 360;
    return { h: h, s: mx ? d / mx : 0, v: mx };
  }
  function hsvToHex(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    var f = function (u) { return ("0" + Math.round((u + m) * 255).toString(16)).slice(-2); };
    return "#" + f(r) + f(g) + f(b);
  }
  // An always-visible SV-square + hue bar; el._set(hex) syncs it, el._get() reads it.
  function inlinePicker(hex, onChange) {
    var box = el("div", "cc-ip"), sv = el("div", "cc-ip-sv"), dot = el("span", "cc-ip-dot"), hue = el("div", "cc-ip-hue"), hdot = el("span", "cc-ip-hdot");
    sv.appendChild(dot); hue.appendChild(hdot); box.appendChild(sv); box.appendChild(hue);
    var st = hexToHsv(hex) || { h: 220, s: 0.8, v: 0.9 };
    function paint() {
      sv.style.background = "linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(" + Math.round(st.h) + ",100%,50%))";
      dot.style.left = (st.s * 100) + "%"; dot.style.top = ((1 - st.v) * 100) + "%";
      hdot.style.left = (st.h / 360 * 100) + "%";
    }
    function emit() { onChange(hsvToHex(st.h, st.s, st.v)); }
    function drag(target, apply2) {
      function mv(e) {
        var r = target.getBoundingClientRect();
        var cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY;
        apply2(Math.min(1, Math.max(0, (cx - r.left) / r.width)), Math.min(1, Math.max(0, (cy - r.top) / r.height)));
        paint(); emit(); e.preventDefault();
      }
      function up() { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); document.removeEventListener("touchmove", mv); document.removeEventListener("touchend", up); }
      function down(e) { mv(e); document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up); document.addEventListener("touchmove", mv); document.addEventListener("touchend", up); }
      target.addEventListener("mousedown", down); target.addEventListener("touchstart", down);
    }
    drag(sv, function (x, y) { st.s = x; st.v = 1 - y; });
    drag(hue, function (x) { st.h = Math.min(359.9, x * 360); });
    box._set = function (h2) { var p = hexToHsv(h2); if (p) { st = p; paint(); } };
    box._get = function () { return hsvToHex(st.h, st.s, st.v); };
    paint(); return box;
  }

  // Serialise config read-modify-write so the Notifications and Bandwidth cards saving
  // near-simultaneously can't lose each other's field: each GET-modify-PUT waits for the
  // previous to settle, so the second GET always sees the first's PUT.
  var cfgChain = Promise.resolve();
  function withConfigLock(fn) { var p = cfgChain.then(fn, fn); cfgChain = p.catch(function () {}); return p; }

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  var cardN = 0;
  function card(title, sub) {
    var c = el("div", "cc-set-card"); // no coloured top bar (user call)
    var h = el("div", "cc-set-h", title);
    if (sub) h.appendChild(infoIcon(sub)); // info text lives behind the ⓘ bubble, never on the card (user call)
    c.appendChild(h); return c;
  }
  function elk(t) { var s = el("span", "cc-b-k"); s.textContent = t; return s; }
  function elv(t) { var s = el("span", "cc-b-v"); s.textContent = t; return s; }
  // Systemwide INFO ICON: a small "i" in a circle; hover OR keyboard-focus shows a CSS bubble with
  // the explanation (styled in docker.css). Lets us tuck long info texts behind a clean glyph so the
  // cards stay uncluttered — reuse this anywhere a control needs a "what does this do?" hint.
  function infoIcon(tip) { var s = el("span", "cc-info"); s.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.1" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="4.7" r="1.05" fill="currentColor"/><rect x="7.05" y="6.8" width="1.9" height="5" rx=".95" fill="currentColor"/></svg>'; if (tip) { s.setAttribute("data-tip", tip); s.setAttribute("aria-label", tip); } s.setAttribute("tabindex", "0"); return s; }
  // normalise a typed hex ("2f6feb" / "#2F6FEB") to "#rrggbb", or "" if invalid.
  function normHex(s) { var v = String(s || "").trim(); if (/^[0-9a-f]{6}$/i.test(v)) v = "#" + v; return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : ""; }

  // a badge-styled on/off toggle. A <span> (NOT a <button>): Unraid's global button
  // CSS was painting an orange border and limiting the knob travel to mid-way.
  function toggle(on, onChange) {
    var t = el("span", "cc-set-toggle" + (on ? " cc-set-toggle-on" : ""));
    t.setAttribute("role", "switch"); t.setAttribute("tabindex", "0"); t.setAttribute("aria-checked", on ? "true" : "false");
    t.appendChild(el("span", "cc-set-knob"));
    function paint() { t.classList.toggle("cc-set-toggle-on", on); t.setAttribute("aria-checked", on ? "true" : "false"); }
    function flip() { on = !on; paint(); onChange(on); }
    t._setOn = function (v) { if (v === on) return; on = v; paint(); }; // programmatic sync, fires NO onChange
    t.addEventListener("click", flip);
    t.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } });
    return t;
  }
  function toggleRow(labelText, on, onChange) {
    var row = el("div", "cc-set-row"); row.appendChild(el("span", null, labelText)); var sp = el("span", "cc-set-spacer"); row.appendChild(sp);
    row.appendChild(toggle(on, onChange)); return row;
  }

  function render() {
    root.innerHTML = "";
    // #1 FIX: re-read the live theming snapshot on EVERY render. accent/rainbow/iconcolor/iconstrength
    // are module-init vars (read once at load, lines 67-70); a setting change calls render(), so without
    // refreshing them here the UI repaints from the STALE load-time value. Root cause of "Rainbow-Toggle
    // funktioniert nicht": rbOnly used the stale `rainbow`, so the switch snapped back OFF after every
    // click (and the reactive/rotation/palette rows stayed greyed) even though cc.rainbow flipped to 1.
    accent = get("cc.accent", "#2f6feb");
    rainbow = get("cc.rainbow", "0") === "1";
    iconcolor = get("cc.iconcolor", "");
    iconstrength = parseInt(get("cc.iconstrength", "100"), 10);
    root.classList.toggle("cc-rainbow", rainbow);
    root.style.setProperty("--cc-accent", accent);
    root.style.setProperty("--cc-accent-text", idealText(accent));

    var head = el("div", "cc-set-head");
    var hero = el("div", "cc-set-hero");
    var hleft = el("div", "cc-set-heroleft");
    var lg = el("img", "cc-set-logo"); lg.src = "/plugins/cannonadecommand/images/cannonadecommand-unraid.svg"; lg.alt = "";   // theme-safe double-ring variant (reads on every Unraid theme)
    hleft.appendChild(lg);
    var htx = el("div", null);
    var brand = el("div", "cc-set-brand"); brand.appendChild(el("b", null, "Cannonade")); brand.appendChild(el("span", null, "Command"));
    htx.appendChild(brand);
    htx.appendChild(el("div", "cc-set-claim", "Firepower and finish for Unraid's Docker, Plugins and VM tabs."));
    hleft.appendChild(htx);
    hero.appendChild(hleft);
    head.appendChild(hero);
    // The RUNNING engine version, always findable HERE (the Docker-tab gear was hard to
    // locate) — an old value after an update = the update didn't take / daemon not restarted.
    var CC_VER = "@@CCVER@@"; if (CC_VER.indexOf("@@") === 0) CC_VER = "dev";
    var verLine = el("div", "cc-set-sub cc-set-version", "UI v" + CC_VER + " · " + T("Engine: verbinde…", "Engine: connecting…"));
    hero.appendChild(verLine); // far right of the hero (user call)
    api("GET", "state").then(function (s) {
      verLine.textContent = "UI v" + CC_VER + " · " + ((s && s.version) ? ("Engine " + String(s.version).replace(/^v/, "v")) + " · " + T("läuft", "running") : T("Engine läuft (Version unbekannt)", "Engine running (version unknown)"));
    }).catch(function (e) { verLine.textContent = "UI v" + CC_VER + " · " + T("Engine NICHT erreichbar", "Engine NOT reachable") + " — " + (e && e.message ? e.message : ""); verLine.style.color = "#d9433f"; });
    // #26: quick settings search — filters cards/rows across ALL tabs (wired below, once the sections exist)
    var setSearch = el("input", "cc-set-search"); setSearch.type = "search"; setSearch.placeholder = T("Einstellungen durchsuchen …", "Search settings …"); setSearch.spellcheck = false;
    var searchRow = el("div", "cc-set-searchrow"); searchRow.appendChild(setSearch); head.appendChild(searchRow);
    root.appendChild(head);

    // the Unraid title strip between the main menu and our hero is redundant here
    try { Array.prototype.slice.call(document.querySelectorAll("div.title")).forEach(function (tt) { tt.style.setProperty("display", "none", "important"); }); } catch (e9) {}
    // three sections: Docker Tab | Plugin Tab | VM Tab (minimal tab row)
    var tabRow = el("div", "cc-set-tabs");
    var wrap = el("div", "cc-set-wrap");
    var wrapPlugin = el("div", "cc-set-wrap"), wrapVms = el("div", "cc-set-wrap"), wrapHeader = el("div", "cc-set-wrap"), wrapShares = el("div", "cc-set-wrap");
    var wrapSettings = el("div", "cc-set-wrap");
    var wrapFavorites = el("div", "cc-set-wrap");
    var wrapStart = el("div", "cc-set-wrap");   // Start (/Main) area — its own CC-settings section
    var wrapMain = el("div", "cc-set-wrap");    // Allgemein — also hosts the export/import card (last)
    var adoptToggles = {}; // adopt-key → its toggle element (a colour pick flips it live); declared UP here (not further down) because the Docker area's styleToggle now runs early, with the moved global Badges card
    var styleCardSync = {}; // adopt-key → refresher: repaints an area card's picker/hex/swatches/preview with the EFFECTIVE colour (global while adopt is ON, own while OFF)
    function syncAllStyleCards() { for (var k9 in styleCardSync) { try { styleCardSync[k9](); } catch (e9) {} } }
    // MASTER THEMING switch (first, prominent). Off = keep ONLY the Docker orchestration
    // FUNCTIONS (start plan, dependencies, health-gate, watchdog, schedules, limits, bandwidth,
    // idle-stop) and disable ALL visual theming (badges, colours, rainbow, cards, and every
    // area's restyling). Defaults on, so existing installs are unchanged. render() on change
    // keeps the toggle in sync; the tabs pick it up via their storage listeners / on next load.
    var themingCard; // the first Allgemein card — Sichern & Übertragen moves in here (user call)
    (function () {
      var tc = card(T("Theming", "Theming"), T("Aus = nur die Docker-FUNKTIONEN von CannonadeCommand bleiben (Startplan, Abhängigkeiten, Health-Gate, Watchdog, Zeitpläne, Limits, Bandbreite, Auto-Stop bei Leerlauf). Das gesamte visuelle Theming — Badges, Farben, Rainbow, Karten und die Umgestaltung aller Tabs — wird abgeschaltet.", "Off = only CannonadeCommand's Docker FUNCTIONS remain (start plan, dependencies, health-gate, watchdog, schedules, limits, bandwidth, idle auto-stop). All visual theming — badges, colours, rainbow, cards and every tab's restyling — is turned off."));
      tc.appendChild(toggleRow(T("Theming aktiv", "Theming on"), localStorage.getItem("cc.theming") !== "0", function (v) { set("cc.theming", v ? "1" : "0"); render(); syncHeaderBar(); syncSharesBar(); }));
      themingCard = tc;
      wrapMain.appendChild(tc);
    })();
    // ── Anzeige (Unraid), LIVE-SYNC (Option A rework): mirroring all ~21 native display fields into CC
    // was "super unübersichtlich" (user). Now the FULL native Display Settings live on Unraid's own page
    // — Carbon-styled by CannonadeCommand (cc-tools-on covers /Settings/*), tile un-hidden — and CC keeps
    // only the handful that were genuinely useful here as LIVE-SYNC controls: they POST the SAME field via
    // update.php (URLSearchParams -> 200; multipart 504s) + reload, so switching here flips the native
    // setting too. csrf_token gates the POST. "favorites" also drives cc.hidefavtab.
    if (typeof csrf_token !== "undefined") (function () {
      var postDisplay = function (field, value) {
        try {
          var fd = new URLSearchParams();
          fd.append("#file", "dynamix/dynamix.cfg"); fd.append("#section", "display");
          fd.append("csrf_token", window.csrf_token); fd.append(field, value);
          if (field === "favorites") set("cc.hidefavtab", value === "no" ? "1" : "0");
          fetch("/update.php", { method: "POST", body: fd, credentials: "same-origin" }).then(function () { location.reload(); });
        } catch (e9) {}
      };
      // field -> concise CC help text [de, en] (native page ships none)
      var H = {
        width: ["Verpackt hält den Inhalt in fester Breite; Unbegrenzt nutzt die volle Fensterbreite.", "Packed keeps a fixed content width; Unlimited uses the full window width."],
        locale: ["Sprache der WebGUI.", "Language of the WebGUI."],
        font: ["Grundschriftgröße der Oberfläche.", "Base UI font size."],
        tty: ["Schriftgröße im eingebauten Terminal.", "Font size in the built-in terminal."],
        terminalButton: ["Terminal-Knopf im Kopfbereich anzeigen.", "Show the terminal button in the header."],
        number: ["Dezimal- und Tausender-Trennzeichen für Zahlen.", "Decimal and thousands separators for numbers."],
        scale: ["Einheit für Dateigrößen (automatisch oder fest).", "Unit for file sizes (automatic or fixed)."],
        tabs: ["Unterseiten als Tabs oder als eine lange Abschnitts-Seite.", "Sub-pages as tabs or one long sectioned page."],
        users: ["Wo das Benutzermenü sitzt: Kopfzeile oder Einstellungsmenü.", "Where the user menu sits: header or settings menu."],
        resize: ["Listen automatisch mitwachsen lassen oder feste Höhe.", "Let lists grow automatically or use a fixed height."],
        raw: ["Datenträgernamen normalisiert oder roh anzeigen.", "Show disk names normalised or raw."],
        wwn: ["World-Wide-Name in der Geräte-ID einblenden.", "Show the World-Wide-Name in the device ID."],
        total: ["Summenzeile mit Array-Gesamtwerten anzeigen.", "Show a totals row with array totals."],
        usage: ["Auslastungsbalken pro Datenträger anzeigen.", "Show a usage bar per disk."],
        unit: ["Temperaturen in Celsius oder Fahrenheit.", "Temperatures in Celsius or Fahrenheit."],
        theme: ["Grund-Farbschema von Unraid (CannonadeCommand färbt darüber).", "Unraid's base colour scheme (CannonadeCommand paints over it)."],
        text: ["Darstellung der Belegt/Frei-Spalten (Text, Balken, Farbe).", "How the used/free columns look (text, bar, colour)."],
        headerdescription: ["Beschreibungstext im Kopfbereich anzeigen.", "Show the description text in the header."],
        banner: ["Eigenes Kopf-Banner ein-/ausblenden (Bild unten hochladen).", "Show/hide a custom header banner (upload the image below)."],
        showBannerGradient: ["Weichen Farbverlauf über dem Banner anzeigen.", "Show a soft gradient over the banner."],
        favorites: ["Favoriten-Funktion aktivieren; Nein blendet den Favoriten-Tab aus.", "Enable favourites; No hides the Favorites tab."],
        header: ["Native Kopfzeilen-Textfarbe. Sichtbar nur, wenn CannonadeCommands Kopfbereich AUS ist (sonst übermalt CC den Kopf).", "Native header text colour. Visible only when CannonadeCommand's header area is OFF (otherwise CC overpaints the header)."],
        headermetacolor: ["Native Kopfzeilen-Sekundärtextfarbe. Wirkt nur bei ausgeschaltetem CC-Kopfbereich.", "Native header secondary text colour. Only when CC's header area is off."],
        background: ["Native Kopf-Hintergrundfarbe. Wirkt nur bei ausgeschaltetem CC-Kopfbereich.", "Native header background colour. Only when CC's header area is off."]
      };
      function help(nm) { var h = H[nm]; return h ? T(h[0], h[1]) : ""; }
      function fieldLabel(c, nm) { var dd = c.closest("dd"), dt = dd ? dd.previousElementSibling : null; return (dt && dt.tagName === "DT") ? (dt.textContent || "").replace(/\s*:\s*$/, "").trim() : nm; }
      // #7 native header COLOUR field -> CC picker + hex; commit (post+reload) on hex change or 700ms
      // after the picker settles (dragging must not reload per-frame).
      function colorRow(lbl, hexv, onCommit, helpTxt) {
        hexv = (hexv || "").replace(/^#/, "");
        var row = el("div", "cc-set-row"); var rl = el("span", "cc-set-rl", lbl); if (helpTxt) rl.appendChild(infoIcon(helpTxt)); row.appendChild(rl);
        var pr = el("div", "cc-set-pickrow"), colT;
        var hx = el("input", "cc-set-hexin"); hx.type = "text"; hx.value = hexv ? "#" + hexv : ""; hx.placeholder = "#000000"; hx.maxLength = 7; hx.spellcheck = false;
        var pk = inlinePicker(/^[0-9a-f]{6}$/i.test(hexv) ? "#" + hexv : "#161616", function (v) { hx.value = v; clearTimeout(colT); colT = setTimeout(function () { onCommit(v.replace(/^#/, "")); }, 700); });
        hx.addEventListener("change", function () { clearTimeout(colT); var v = normHex(hx.value); if (v) { pk._set(v); onCommit(v.replace(/^#/, "")); } else if (!hx.value) onCommit(""); });
        pr.appendChild(pk); pr.appendChild(hx); row.appendChild(pr); return row;
      }
      // #6 the native banner IMAGE upload is a file-drop on Unraid's page — link out to it (re-implementing
      // a multipart file upload through the proxy is out of scope; the native page is reachable by URL).
      function bannerUploadRow() {
        var row = el("div", "cc-set-row"); row.appendChild(el("span", "cc-set-rl", T("Eigenes Banner-Bild", "Custom banner image")));
        var b = el("button", "cc-btn", T("Hochladen / ändern …", "Upload / change …")); b.type = "button";
        b.addEventListener("click", function () { location.href = "/Settings/DisplaySettings"; });
        row.appendChild(b); return row;
      }
      // #5 (cleanup): mirroring Unraid's display PREFS into CC felt redundant once the native page is
      // CC-styled + one click away ("es sind noch alte Einstellungen ... in den cc settings"). We now keep
      // ONLY the 3 header COLOURS here — they affect CannonadeCommand's OWN header and were explicitly
      // wanted back (#7) — as live-sync controls; theme/tabbed-view/banner/favourites live natively.
      var KEEP = ["header", "headermetacolor", "background"];
      var cCard = card(T("Anzeige — Kopf-Farben (live)", "Display — header colours (live)"), T("Die nativen Kopfzeilen-Farben, hier direkt anpassbar — sie schalten live in Unraids Anzeige-Einstellungen mit um und wirken, wenn CannonadeCommands Kopfbereich AUS ist. Alle weiteren Anzeige-Optionen liegen auf der nativen Seite (jetzt im CannonadeCommand-Stil).", "Unraid's header colours, adjustable here — they live-sync into Unraid's Display Settings and apply when CannonadeCommand's header area is OFF. Every other display option lives on the native page (now in CannonadeCommand style)."));
      (function () {
        var b = el("button", "cc-btn", T("Alle Unraid-Anzeige-Einstellungen öffnen …", "Open all Unraid display settings …")); b.type = "button";
        b.addEventListener("click", function () { location.href = "/Settings/DisplaySettings"; });
        var r = el("div", "cc-set-row"); r.appendChild(el("span", "cc-set-rl", T("Native Anzeige-Seite", "Native display page"))); r.appendChild(b); cCard.appendChild(r);
      })();
      wrapMain.appendChild(cCard);
      fetch("/Settings/DisplaySettings", { credentials: "same-origin" }).then(function (r) { return r.text(); }).then(function (html) {
        try {
          var doc = new DOMParser().parseFromString(html, "text/html");
          // Scope STRICTLY to the #section=display form (other forms carry stray selects disks/op/queue).
          var form = null;
          Array.prototype.forEach.call(doc.querySelectorAll("form"), function (f) { var s = f.querySelector('input[name="#section"]'); if (s && s.value === "display") form = f; });
          if (!form) return;
          KEEP.forEach(function (nm) {
            var c = form.querySelector('input[name="' + nm + '"][type="text"]'); if (!c) return;   // the 3 colour fields
            cCard.appendChild(colorRow(fieldLabel(c, nm), c.value || "", function (v) { postDisplay(nm, v); }, help(nm)));   // #7 header colour
          });
          // the favourites CONTROL now lives natively, but its value still drives cc.hidefavtab (favorites tab)
          var fav = form.querySelector('select[name="favorites"]'); if (fav) set("cc.hidefavtab", fav.value === "no" ? "1" : "0");
          syncHeaderBar();
        } catch (e9) {}
      }).catch(function () {});
    })();
    // Bereiche: enable/disable each area CannonadeCommand enhances
    (function () {
      var c = card(T("Bereiche", "Areas"), T("Aktiviere, welche Bereiche CannonadeCommand verschönert. Ein deaktivierter Bereich blendet seinen Tab hier sofort aus.", "Choose which areas CannonadeCommand enhances. Disabling an area hides its tab here immediately."));
      [["cc.enable.main", T("Start-Tab", "Start tab"), "0"], ["cc.enable.header", T("Kopfbereich", "Header area"), "0"], ["cc.enable.shares", T("Freigaben-Tab", "Shares tab"), "0"], ["cc.enable.docker", T("Docker-Tab", "Docker tab"), "1"], ["cc.enable.plugins", T("Plugin-Tab", "Plugins tab"), "1"], ["cc.enable.vms", T("VM-Tab", "VMs tab"), "1"], ["cc.enable.settings", T("Einstellungen- & Werkzeuge-Tabs", "Settings & Tools tabs"), "1"], ["cc.enable.favorites", T("Favoriten-Tab", "Favorites tab"), "1"]].forEach(function (a) {
        var row = el("div", "cc-set-row cc-set-inline");
        row.appendChild(el("span", null, a[1]));
        var cur = localStorage.getItem(a[0]);
        row.appendChild(toggle(cur == null ? a[2] !== "0" : cur !== "0", function (v) { localStorage.setItem(a[0], v ? "1" : "0"); refreshTabs(); }));
        c.appendChild(row);
      });
      wrapMain.appendChild(c);
    })();
    // (the compact live-sync "Anzeige (Unraid, live)" card is built above; everything else lives natively)
    // ── section order = the USER'S main-menu order. header.js persists the drag-reordered
    // menu as cc.navorder.all {left:[href keys],right:[...]}; read DEFENSIVELY (accept .left
    // or a plain array; absent/garbage -> native menu order fallback below).
    var NAVDEF = ["Start", "Favorites", "Freigaben", "Einstellungen", "Docker", "Plugins", "VMs", "Werkzeuge", "Stats", "Apps"];
    var navOrder = NAVDEF;
    try { var no9 = JSON.parse(get("cc.navorder.all", "null")); var arr9 = no9 && no9.left ? no9.left : no9; if (arr9 && arr9.length && typeof arr9.forEach === "function") navOrder = arr9; } catch (e9b) {}
    // one normalised token per entry: "/Docker" == "Docker" == "docker" (hrefs, labels alike)
    var navToks = [];
    navOrder.forEach(function (k9) { navToks.push(String(k9).replace(/^\//, "").split(/[/?#]/)[0].toLowerCase()); });
    function navRank(aliases) { var best = -1; aliases.forEach(function (a9) { var i9 = navToks.indexOf(a9); if (i9 >= 0 && (best < 0 || i9 < best)) best = i9; }); return best; }
    // fixed head: Allgemein first, Kopfbereich second (chrome, not a menu tab). The tab
    // sections follow the menu order; tabs missing from it keep native relative order at the
    // END. Each section carries a STABLE id — cc.settab persists that id, never the index.
    var SECS = [
      { id: "general", t: T("Allgemein", "General"), w: wrapMain, key: null },
      { id: "header", t: T("Kopfbereich", "Header area"), w: wrapHeader, key: "cc.enable.header" }
    ];
    [
      { id: "main", t: T("Start-Tab", "Start tab"), w: wrapStart, key: "cc.enable.main", tabs: ["start", "main"] },
      { id: "shares", t: T("Freigaben-Tab", "Shares tab"), w: wrapShares, key: "cc.enable.shares", tabs: ["freigaben", "shares"] },
      { id: "docker", t: T("Docker-Tab", "Docker tab"), w: wrap, key: "cc.enable.docker", tabs: ["docker"] },
      { id: "plugins", t: T("Plugin-Tab", "Plugins tab"), w: wrapPlugin, key: "cc.enable.plugins", tabs: ["plugins"] },
      { id: "vms", t: T("VM-Tab", "VMs tab"), w: wrapVms, key: "cc.enable.vms", tabs: ["vms"] },
      { id: "settings", t: T("Einstellungen- & Werkzeuge-Tabs", "Settings & Tools tabs"), w: wrapSettings, key: "cc.enable.settings", tabs: ["einstellungen", "settings", "werkzeuge", "tools"] },
      { id: "favorites", t: T("Favoriten-Tab", "Favorites tab"), w: wrapFavorites, key: "cc.enable.favorites", tabs: ["favorites", "favoriten"] }
    ].map(function (s9, i9) { return { s: s9, i: i9, r: navRank(s9.tabs) }; })
      .sort(function (a9, b9) { return (a9.r < 0 ? 1e9 + a9.i : a9.r) - (b9.r < 0 ? 1e9 + b9.i : b9.r) || a9.i - b9.i; })
      .forEach(function (d9) { SECS.push(d9.s); });
    var tabBtns = [];
    function areaOn(key) { return !key || localStorage.getItem(key) !== "0"; }
    function showSec(i) {
      if (!SECS[i] || !areaOn(SECS[i].key)) i = 0; // never land on a hidden section
      localStorage.setItem("cc.settab", SECS[i].id); // stable id, NOT the index — a menu reorder must never restore the wrong tab
      SECS.forEach(function (sc, j) { sc.w.style.display = j === i ? "" : "none"; tabBtns[j].classList.toggle("cc-set-tab-on", j === i); });
      paintSetTabs();
    }
    // rainbow: colour EVERY settings tab per palette index (was: only the accent-filled active tab, so
    // rainbow never reached the CC tab bar). palG() is the shared rainbow palette; idealText is hoisted.
    function paintSetTabs() {
      var rb = get("cc.rainbow", "0") === "1";
      // reactive sub-mode: idle tabs rest on the grey base CSS and only carry their palette
      // colour as vars (--cc-rb-c/--cc-rb-ct — the docker.css :hover rule paints from them);
      // the ACTIVE tab keeps its direct colour.
      var reactive = rb && get("cc.rbmode", "all") === "active";
      // palG() is scoped inside buildStyleCards, not reachable here -> read the palette directly.
      var DEF = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"], p = DEF;
      try { var j = JSON.parse(get("cc.rbpal", "null")); if (j && j.length) p = j; } catch (e) {}
      tabBtns.forEach(function (b, i) {
        if (rb) {
          var c = p[i % p.length];
          b.style.setProperty("--cc-rb-c", c); b.style.setProperty("--cc-rb-ct", idealText(c));
          if (reactive && !b.classList.contains("cc-set-tab-on")) { b.style.removeProperty("background"); b.style.removeProperty("color"); return; }
          b.style.setProperty("background", c, "important"); b.style.setProperty("color", idealText(c), "important");
        } else {
          b.style.removeProperty("background"); b.style.removeProperty("color");
          b.style.removeProperty("--cc-rb-c"); b.style.removeProperty("--cc-rb-ct");
        }
      });
    }
    // hide the tab of any disabled area immediately; if we were ON it, fall back to Bereiche
    function refreshTabs() {
      var activeHidden = false;
      SECS.forEach(function (sc, j) {
        var on = areaOn(sc.key);
        // .cc-set-tab is `display: inline-flex !important` (badge sizing), so a plain
        // inline "none" can't hide it -> use inline !important, which outranks the sheet.
        if (on) tabBtns[j].style.removeProperty("display"); else tabBtns[j].style.setProperty("display", "none", "important");
        if (!on && tabBtns[j].classList.contains("cc-set-tab-on")) { activeHidden = true; sc.w.style.display = "none"; }
      });
      if (activeHidden) showSec(0);
    }
    SECS.forEach(function (sc, i) {
      var b = el("button", "cc-set-tab", sc.t); b.type = "button";
      b.addEventListener("click", function () { showSec(i); });
      tabBtns.push(b); tabRow.appendChild(b);
    });
    root.appendChild(tabRow);
    alignSetTabs(); // indent the strip to the first main-menu tab (internally try/catch'd, can't break the build)
    root.appendChild(wrapMain); root.appendChild(wrapStart); root.appendChild(wrapHeader); root.appendChild(wrapShares); root.appendChild(wrap); root.appendChild(wrapPlugin); root.appendChild(wrapVms); root.appendChild(wrapSettings); root.appendChild(wrapFavorites);

    // ── Badges ──
    var c1 = card(T("Badges", "Badges"), T("Akzentfarbe und Farbmodus der Badges.", "Accent colour and colour mode of the badges."));
    // The colour-picker field stays ALWAYS visible, PLUS a hex text field beside it;
    // both edit the same value and stay in sync.
    // picker sits DIRECTLY under the card sub in BOTH colour cards (same height), full
    // card width, hex field BELOW it — no "Akzentfarbe" label (the card title says it).
    var prow = el("div", "cc-set-pickrow");
    // PERMANENTLY EMBEDDED picker (an <input type=color> opens the OS colour dialog in
    // its own window — "ich will das Farbwählfeld fest integriert").
    var hexIn = el("input", "cc-set-hexin"); hexIn.type = "text"; hexIn.value = accent; hexIn.placeholder = "#2f6feb"; hexIn.maxLength = 7; hexIn.spellcheck = false;
    // the global accent handlers must ALSO push the new colour onto the live bars (header + shares
    // use their OWN isolated vars, so setting --cc-accent here alone doesn't reach them) — this is
    // why "the global colour didn't apply everywhere": the menu bar / Freigaben only updated on
    // reload. syncHeaderBar/syncSharesBar re-run their apply() so every enabled area follows live.
    var pick = inlinePicker(/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#2f6feb", function (v) { accent = v; hexIn.value = v; set("cc.accent", v); root.style.setProperty("--cc-accent", v); root.style.setProperty("--cc-accent-text", idealText(v)); paintPrev(); syncSwOn(); syncAllStyleCards(); syncHeaderBar(); syncSharesBar(); });
    function setAccent(v) { accent = v; pick._set(v); hexIn.value = v; set("cc.accent", accent); root.style.setProperty("--cc-accent", accent); root.style.setProperty("--cc-accent-text", idealText(accent)); paintPrev(); syncSwOn(); syncAllStyleCards(); syncHeaderBar(); syncSharesBar(); }
    hexIn.addEventListener("input", function () { var v = normHex(hexIn.value); if (v) setAccent(v); });
    prow.appendChild(pick); prow.appendChild(hexIn); c1.appendChild(prow);
    // ...and the preset swatches sit BELOW it.
    var srow = el("div", "cc-set-swatches");
    PRESETS.forEach(function (c) {
      // a <span>, NOT a <button>: Unraid's global button CSS was bloating these into
      // big bordered rectangles. dataset.c lets syncSwOn highlight the active one.
      var sw = el("span", "cc-set-sw" + (c === accent ? " cc-set-sw-on" : "")); sw.setAttribute("data-tip", c); sw.style.background = c; sw.dataset.c = c;
      sw.addEventListener("click", function () { accent = c; set("cc.accent", accent); render(); syncHeaderBar(); syncSharesBar(); });
      srow.appendChild(sw);
    });
    c1.appendChild(srow);
    // GLOBAL badge SHAPE (Form) — one control for every area, exactly like the global colour above
    // (writes the shared cc.badgeshape). The per-area cards no longer repeat it.
    // options sorted by ASCENDING roundness (square -> circle), keys unchanged (user call)
    c1.appendChild(segRow(T("Badge-Form", "Badge shape"), [["square", T("eckig", "square")], ["rounded", T("abgerundet", "rounded")], ["pill", "Pills"], ["circle", T("Kreise", "Circles")]], get("cc.badgeshape", "pill"), function (v) { set("cc.badgeshape", v); applyShape(); syncHeaderBar(); syncSharesBar(); }));
    // #17: Rainbow-Modus and Flaggen-Modus are TWO mutually-exclusive palette modes sharing ONE colour
    // engine. cc.rainbow="1" is the master "a palette is active" flag every reader checks; cc.flagmode="1"
    // means the ACTIVE palette is a country flag (else the rainbow palette). rbOnly = rainbow is the
    // active mode. Turning one on turns the other off; the UI greys the inactive one out (user call).
    var flagOn = get("cc.flagmode", "0") === "1";
    var rbOnly = rainbow && !flagOn;
    // rainbow toggle: label + switch adjacent (no parenthetical, no far-right spacer)
    var rr = el("div", "cc-set-row cc-set-inline");
    rr.appendChild(el("span", null, T("Regenbogen-Modus", "Rainbow mode")));
    rr.appendChild(toggle(rbOnly, function (v) { set("cc.rainbow", v ? "1" : "0"); set("cc.flagmode", "0"); if (v) { del("cc.flag"); del("cc.rbpal"); } else set("cc.rainbowrot", "0"); render(); syncHeaderBar(); syncSharesBar(); }));
    if (flagOn) { rr.style.opacity = ".4"; rr.style.pointerEvents = "none"; }   // greyed while Flaggen-Modus is active
    c1.appendChild(rr);
    // rainbow sub-mode: REACTIVE — everything rests neutral grey, colours on hover, the ACTIVE
    // one keeps its colour. Global like cc.rainbow (key cc.rbmode); sits DIRECTLY under the
    // rainbow master switch (user call). Live-applied via the sync + the settings tab strip.
    var rmode = el("div", "cc-set-row cc-set-inline");
    var rmodeL = el("span", "cc-set-lblwrap");
    rmodeL.appendChild(el("span", null, T("Reaktiver Regenbogen-Modus", "Reactive rainbow mode")));
    rmodeL.appendChild(infoIcon(T("AN = alles ruht grau und färbt sich beim Überfahren; Aktives bleibt farbig. Gilt global für alle Bereiche inklusive Logo-Hintergründen.", "ON = everything rests grey and colours on hover; active stays coloured. Global, including logo backgrounds.")));
    rmode.appendChild(rmodeL);
    rmode.appendChild(toggle(get("cc.rbmode", "all") === "active", function (v) { set("cc.rbmode", v ? "active" : "all"); paintSetTabs(); syncHeaderBar(); syncSharesBar(); }));
    if (!rbOnly) { rmode.style.opacity = ".4"; rmode.style.pointerEvents = "none"; } // only with rainbow mode (also greyed under flag mode)
    c1.appendChild(rmode);
    // rotation toggle: on = every tab reload deals a fresh colour mapping; off = stable colours
    var rrot = el("div", "cc-set-row cc-set-inline");
    var rrotL = el("span", "cc-set-lblwrap");
    rrotL.appendChild(el("span", null, T("Automatische Farbenrotation", "Automatic colour rotation")));
    rrotL.appendChild(infoIcon(T("Mischt die Rainbow-Farben bei jedem Neuladen der Seite neu durch, statt die Reihenfolge fest zu lassen.", "Reshuffles the rainbow colours on every page reload instead of keeping the order fixed.")));
    rrot.appendChild(rrotL);
    rrot.appendChild(toggle(get("cc.rainbowrot", "1") !== "0", function (v) { set("cc.rainbowrot", v ? "1" : "0"); syncHeaderBar(); syncSharesBar(); }));
    if (!rbOnly) { rrot.style.opacity = ".4"; rrot.style.pointerEvents = "none"; } // only with rainbow mode
    c1.appendChild(rrot);
    // EVERY rainbow palette colour is editable: click a swatch, adjust it in the
    // embedded picker below; stored as cc.rbpal (JSON), read live by the Docker tab.
    var RBDEF = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"]; // real rainbow order
    var rbpal = null; try { rbpal = JSON.parse(get("cc.rbpal", "null")); } catch (e) { rbpal = null; }
    if (!rbpal || rbpal.length !== RBDEF.length) rbpal = RBDEF.slice();
    var rbLbl = el("div", "cc-set-lbl", T("Rainbow-Farben (Feld anklicken zum Anpassen)", "Rainbow colours (click a field to adjust)"));
    c1.appendChild(rbLbl);
    var rbrow = el("div", "cc-set-swatches cc-fill");
    var rbPick = null, rbIdx = -1, rbPickWrap = el("div", "cc-set-pickrow"); rbPickWrap.style.display = "none";
    rbpal.forEach(function (cx, ix) {
      var sw = el("span", "cc-set-sw"); sw.style.background = cx; sw.setAttribute("data-tip", cx);
      sw.addEventListener("click", function () {
        rbIdx = ix; rbPickWrap.style.display = "";
        if (!rbPick) {
          rbPick = inlinePicker(rbpal[ix], function (v) { if (rbIdx >= 0) { rbpal[rbIdx] = v; rbrow.children[rbIdx].style.background = v; rbrow.children[rbIdx].setAttribute("data-tip", v); set("cc.rbpal", JSON.stringify(rbpal)); del("cc.flag"); syncHeaderBar(); syncSharesBar(); } });   // manual edit -> no longer a flag preset
          rbPickWrap.appendChild(rbPick);
        } else rbPick._set(rbpal[ix]);
      });
      rbrow.appendChild(sw);
    });
    // icon-only undo arrow RIGHT of the swatches (user: "statt dem badge ... nur so ein rueckgaengig pfeil")
    var rbReset = el("span", "cc-set-ibtn");
    rbReset.setAttribute("data-tip", T("Farben zurücksetzen", "Reset colours"));
    var rbRi = document.createElement("i"); rbRi.className = "fa fa-undo"; rbReset.appendChild(rbRi);
    rbReset.addEventListener("click", function () { del("cc.rbpal"); del("cc.flag"); render(); syncHeaderBar(); syncSharesBar(); });
    rbrow.appendChild(rbReset);
    c1.appendChild(rbrow); c1.appendChild(rbPickWrap);
    if (!rbOnly) { [rbLbl, rbrow, rbPickWrap].forEach(function (e9) { e9.style.opacity = ".4"; e9.style.pointerEvents = "none"; }); }   // rainbow palette editor belongs to rainbow mode
    // ── FLAGGEN-MODUS (#17): a SEPARATE mode with its OWN toggle, reactive toggle, picker and colour
    // display, mutually exclusive with Rainbow (each greys the other). A country's flag colours become
    // the active palette (cc.rbpal, cycled to 8 slots) that drives the SAME engine. The picker draws the
    // flag COLOURS as stripe-swatches + searches by name — the emoji flags render as "DE"/"AF" letter
    // codes on Windows, so colour swatches are shown instead. Data: window.CC_FLAGS (scripts/flags.js).
    if (window.CC_FLAGS && window.CC_FLAGS.length) {
      var FLAG_BASE = "/plugins/cannonadecommand/images/flags/";
      // #2: the REAL flag (flag-icons 4:3 SVG, bundled) — a country's actual pattern, not colour bars.
      // Falls back to the colour-stripe swatch if the SVG is missing (e.g. a code we don't ship).
      var flagImg = function (f9, big) {
        var im = document.createElement("img");
        im.className = "cc-flag-img" + (big ? " cc-flag-img-lg" : "");
        im.src = FLAG_BASE + f9.code + ".svg"; im.alt = f9.name_de; im.loading = "lazy"; im.draggable = false;
        im.onerror = function () { try { if (im.parentNode) im.parentNode.replaceChild(flagSwatch(f9.colors, big), im); } catch (e9) {} };
        return im;
      };
      var flagSwatch = function (colors, big) {
        var s = el("span", "cc-flag-sw" + (big ? " cc-flag-sw-lg" : "")); var n = colors.length, stops = [];
        for (var i9 = 0; i9 < n; i9++) { stops.push(colors[i9] + " " + Math.round(i9 / n * 100) + "% " + Math.round((i9 + 1) / n * 100) + "%"); }
        s.style.background = "linear-gradient(to bottom, " + stops.join(", ") + ")"; return s;
      };
      var curFlag = function () { var c9 = get("cc.flag", ""); for (var j9 = 0; j9 < window.CC_FLAGS.length; j9++) if (window.CC_FLAGS[j9].code === c9) return window.CC_FLAGS[j9]; return null; };
      var applyFlag = function (f9) { var pal = []; for (var k9 = 0; k9 < RBDEF.length; k9++) pal.push(f9.colors[k9 % f9.colors.length]); set("cc.flag", f9.code); set("cc.rbpal", JSON.stringify(pal)); };
      // flag master toggle (mutually exclusive with Rainbow)
      var fr = el("div", "cc-set-row cc-set-inline");
      fr.appendChild(el("span", null, T("Flaggen-Modus", "Flag mode")));
      fr.appendChild(toggle(flagOn, function (v) {
        if (v) { set("cc.flagmode", "1"); set("cc.rainbow", "1"); var f0 = curFlag() || window.CC_FLAGS.filter(function (x9) { return x9.code === "de"; })[0] || window.CC_FLAGS[0]; applyFlag(f0); }
        else { set("cc.flagmode", "0"); set("cc.rainbow", "0"); }
        render(); syncHeaderBar(); syncSharesBar();
      }));
      if (rbOnly) { fr.style.opacity = ".4"; fr.style.pointerEvents = "none"; }   // greyed while Rainbow is active
      c1.appendChild(fr);
      // reactive flag toggle — shares cc.rbmode (only one mode is active at a time)
      var fmode = el("div", "cc-set-row cc-set-inline");
      var fmodeL = el("span", "cc-set-lblwrap");
      fmodeL.appendChild(el("span", null, T("Reaktiver Flaggen-Modus", "Reactive flag mode")));
      fmodeL.appendChild(infoIcon(T("AN = alles ruht grau und färbt sich beim Überfahren in den Flaggenfarben; Aktives bleibt farbig.", "ON = everything rests grey and colours in the flag colours on hover; active stays coloured.")));
      fmode.appendChild(fmodeL);
      fmode.appendChild(toggle(get("cc.rbmode", "all") === "active", function (v) { set("cc.rbmode", v ? "active" : "all"); paintSetTabs(); syncHeaderBar(); syncSharesBar(); }));
      // #4: the picker sits DIRECTLY under the Flaggen-Modus toggle — NO "Land wählen" heading — and the
      // reactive-flag toggle (fmode, built above) is appended AFTER the picker (see below).
      // custom flag picker: real flag image + name, searchable (native <select> can't show flag images).
      var picker = el("div", "cc-flag-picker");
      var trigger = el("div", "cc-flag-trigger"); trigger.setAttribute("tabindex", "0");
      var renderTrigger = function () { trigger.innerHTML = ""; var f0 = curFlag(); if (f0) { trigger.appendChild(flagImg(f0)); trigger.appendChild(el("span", "cc-flag-name", f0.name_de)); } else trigger.appendChild(el("span", "cc-flag-name", T("— kein Land —", "— none —"))); trigger.appendChild(el("span", "cc-flag-caret", "▾")); };
      renderTrigger();
      var panel = el("div", "cc-flag-panel"); panel.style.display = "none";
      var search = el("input", "cc-flag-search"); search.type = "text"; search.placeholder = T("Suchen…", "Search…"); search.spellcheck = false; panel.appendChild(search);
      var list = el("div", "cc-flag-list");
      var buildList = function (q) {
        list.innerHTML = ""; q = (q || "").toLowerCase();
        window.CC_FLAGS.forEach(function (f0) {
          if (q && f0.name_de.toLowerCase().indexOf(q) < 0 && f0.name.toLowerCase().indexOf(q) < 0 && f0.code.indexOf(q) < 0) return;
          var row = el("div", "cc-flag-item"); row.appendChild(flagImg(f0)); row.appendChild(el("span", "cc-flag-name", f0.name_de));
          row.addEventListener("click", function () { applyFlag(f0); render(); syncHeaderBar(); syncSharesBar(); });
          list.appendChild(row);
        });
      };
      buildList(""); panel.appendChild(list);
      search.addEventListener("input", function () { buildList(search.value); });
      var openPanel = function () {
        panel.style.display = ""; search.value = ""; buildList(""); try { search.focus(); } catch (e9) {}
        var closer = function (e9) { if (!picker.contains(e9.target)) { panel.style.display = "none"; document.removeEventListener("click", closer, true); } };
        setTimeout(function () { document.addEventListener("click", closer, true); }, 0);   // self-removing click-outside (no leak across render)
      };
      var closePanel = function () { panel.style.display = "none"; try { trigger.focus(); } catch (e9) {} };
      trigger.addEventListener("click", function () { if (panel.style.display !== "none") panel.style.display = "none"; else openPanel(); });
      // #25: keyboard-operable — Enter/Space/ArrowDown on the trigger opens; then arrows move the
      // highlight, Enter picks, Escape closes. The search already matches name_de / English name / code.
      trigger.addEventListener("keydown", function (e9) { if (e9.key === "Enter" || e9.key === " " || e9.key === "ArrowDown") { e9.preventDefault(); openPanel(); } });
      var moveSel = function (dir) { var items = list.querySelectorAll(".cc-flag-item"); if (!items.length) return; var cur = list.querySelector(".cc-flag-item.cc-sel"); var idx = cur ? Array.prototype.indexOf.call(items, cur) : -1; idx += dir; if (idx < 0) idx = 0; if (idx >= items.length) idx = items.length - 1; if (cur) cur.classList.remove("cc-sel"); items[idx].classList.add("cc-sel"); items[idx].scrollIntoView({ block: "nearest" }); };
      search.addEventListener("keydown", function (e9) { if (e9.key === "ArrowDown") { e9.preventDefault(); moveSel(1); } else if (e9.key === "ArrowUp") { e9.preventDefault(); moveSel(-1); } else if (e9.key === "Enter") { e9.preventDefault(); var sel = list.querySelector(".cc-flag-item.cc-sel") || list.querySelector(".cc-flag-item"); if (sel) sel.click(); } else if (e9.key === "Escape") { e9.preventDefault(); closePanel(); } });
      picker.appendChild(trigger); picker.appendChild(panel);
      c1.appendChild(picker);
      c1.appendChild(fmode);   // #4: reactive-flag toggle AFTER the picker
      // the selected flag's COLOURS, shown separately (not the rainbow editor)
      var f1 = curFlag();
      if (f1) {
        c1.appendChild(el("div", "cc-set-lbl", T("Flaggenfarben", "Flag colours")));
        // #3: the colour fields stretch to fill the card width (each cc-set-sw flex:1) + a reset icon
        // pushed to the far right, in line with the toggle switches. Reset clears the flag selection.
        var frow = el("div", "cc-set-swatches cc-fill");
        f1.colors.forEach(function (c9) { var sw9 = el("span", "cc-set-sw"); sw9.style.background = c9; sw9.setAttribute("data-tip", c9); frow.appendChild(sw9); });
        var fReset = el("span", "cc-set-ibtn"); fReset.setAttribute("data-tip", T("Flagge zurücksetzen", "Reset flag"));
        var fRi = document.createElement("i"); fRi.className = "fa fa-undo"; fReset.appendChild(fRi);
        fReset.addEventListener("click", function () { del("cc.flag"); del("cc.rbpal"); render(); syncHeaderBar(); syncSharesBar(); });
        frow.appendChild(fReset);
        c1.appendChild(frow);
      }
      if (!flagOn) { [fmode, picker].forEach(function (e9) { e9.style.opacity = ".4"; e9.style.pointerEvents = "none"; }); }   // flag sub-controls only when flag mode is on
    }
    // #28: one-click curated PALETTE PRESETS — apply the 8 colours as cc.rbpal + turn Rainbow on (and
    // clear any flag). A quick way to a nice look without hand-picking eight swatches.
    (function () {
      var PRESETS = [
        { n: "Carbon", c: ["#393939", "#525252", "#6f6f6f", "#8d8d8d", "#a8a8a8", "#c6c6c6", "#e0e0e0", "#f4f4f4"] },
        { n: "Nord", c: ["#bf616a", "#d08770", "#ebcb8b", "#a3be8c", "#88c0d0", "#81a1c1", "#b48ead", "#5e81ac"] },
        { n: "Solarized", c: ["#dc322f", "#cb4b16", "#b58900", "#859900", "#2aa198", "#268bd2", "#6c71c4", "#d33682"] },
        { n: "Dracula", c: ["#ff5555", "#ffb86c", "#f1fa8c", "#50fa7b", "#8be9fd", "#6272a4", "#bd93f9", "#ff79c6"] },
        { n: "Sunset", c: ["#ff5e62", "#ff9966", "#ffcc70", "#ffdd94", "#fc9d9a", "#f9748f", "#c06c84", "#6c5b7b"] },
        { n: "Forest", c: ["#1b4332", "#2d6a4f", "#40916c", "#52b788", "#74c69d", "#95d5b2", "#b7e4c7", "#d8f3dc"] }
      ];
      c1.appendChild(el("div", "cc-set-lbl", T("Paletten-Presets (ein Klick übernimmt)", "Palette presets (one click applies)")));
      var prow = el("div", "cc-set-presets");
      PRESETS.forEach(function (p) {
        var chip = el("div", "cc-preset"); chip.setAttribute("data-tip", p.n); chip.setAttribute("tabindex", "0");
        var strip = el("div", "cc-preset-strip");
        p.c.forEach(function (cx) { var sw = el("span"); sw.style.background = cx; strip.appendChild(sw); });
        chip.appendChild(strip); chip.appendChild(el("span", "cc-preset-name", p.n));
        var apply = function () { set("cc.rbpal", JSON.stringify(p.c)); set("cc.rainbow", "1"); set("cc.flagmode", "0"); del("cc.flag"); render(); syncHeaderBar(); syncSharesBar(); };
        chip.addEventListener("click", apply);
        chip.addEventListener("keydown", function (e9) { if (e9.key === "Enter" || e9.key === " ") { e9.preventDefault(); apply(); } });
        prow.appendChild(chip);
      });
      c1.appendChild(prow);
    })();
    // #16 (user): let STATE indicators keep their NATIVE state colour (green/amber/red) instead of
    // folding into the accent/rainbow/flag palette. Default OFF = integrated (current look). ON stamps
    // html.cc-state-native; the sheets then let the native semantic colours through (usage bars, dots).
    var snR = el("div", "cc-set-row cc-set-inline");
    var snL = el("span", "cc-set-lblwrap");
    snL.appendChild(el("span", null, T("Zustandsanzeigen nativ färben", "Native state colours")));
    snL.appendChild(infoIcon(T("AN = Auslastungsbalken und Zustands-Punkte behalten ihre native Zustandsfarbe (grün/gelb/rot). AUS = sie werden in den aktuellen Farbmodus (Akzent/Regenbogen/Flagge) integriert.", "ON = usage bars and state dots keep their native state colour (green/amber/red). OFF = they fold into the current colour mode (accent/rainbow/flag).")));
    snR.appendChild(snL);
    snR.appendChild(toggle(get("cc.statenative", "0") === "1", function (v) { set("cc.statenative", v ? "1" : "0"); syncHeaderBar(); syncSharesBar(); }));
    c1.appendChild(snR);
    c1.appendChild(el("div", "cc-set-lbl", T("Vorschau", "Preview")));
    var prev = el("div", "cc-set-prev");
    // 2-3 mixed categories (user call): a NAME headline badge (lg), a key/value badge (sm) and a
    // menu-style tab pill (md) — shows CC's badge range, cleaner than the old eight Docker badges.
    var pvName = el("span", "cc-b cc-b-lg", "nextcloud");
    var pvVal = el("span", "cc-b"); pvVal.appendChild(elk("CPU")); pvVal.appendChild(elv("2/8"));
    var pvTab = el("span", "cc-navtab cc-navtab-on", "Docker");
    prev.appendChild(pvName); prev.appendChild(pvVal); prev.appendChild(pvTab);
    prev.id = "cc-set-prev"; c1.appendChild(prev);
    wrapMain.appendChild(c1); // GLOBAL badge colour + rainbow -> the "Allgemein" tab (was the Docker tab)
    // ── Dichte (GLOBAL): cc.density is ONE key that every list (Docker, Start, Freigaben) reads,
    // so it belongs in Allgemein with the other global controls — not buried in the Docker tab.
    (function () {
      var cD = card(T("Dichte", "Density"), T("Zeilenhöhe für alle Listen (Docker, Start, Freigaben) auf einmal.", "Row height for every list (Docker, Start, Shares) at once."));
      cD.appendChild(segRow(T("Dichte (global)", "Density (global)"), [["compact", T("Kompakt", "Compact")], ["normal", "Normal"], ["airy", T("Luftig", "Airy")]], density, function (v) { density = v; set("cc.density", v); }));
      wrapMain.appendChild(cD);
    })();
    // ── Logos & Icons (GLOBAL): edits the shared cc.iconbg / cc.iconcolor / cc.iconstrength
    // keys every adopting tab resolves through eff('icon…'). Same control set as the per-area
    // Logos cards, minus the preview (this card is the source, not a consumer).
    (function () {
      var cLI = card(T("Logos & Icons", "Logos & icons"), T("Globale Logo-/Icon-Farben. Tabs mit aktivem 'Globale Badge-Farbe übernehmen' folgen auch hier.", "Global logo/icon colours. Tabs adopting the global colour follow these too."));
      var gcol = get("cc.iconcolor", ""), gbg = get("cc.iconbg", "0") === "1";
      var gstrow; // strength row — dimmed in background mode (same rule as the area cards)
      function gsync() { syncAllStyleCards(); syncHeaderBar(); syncSharesBar(); } // adopt-ON area cards repaint with the new globals
      function gApplyBg(v) { gbg = v; gstrow.style.opacity = v ? ".4" : ""; gstrow.style.pointerEvents = v ? "none" : ""; }
      cLI.appendChild(toggleRow(T("Hintergrund", "Background"), gbg, function (v) { set("cc.iconbg", v ? "1" : "0"); gApplyBg(v); gsync(); }));
      var ghx = el("input", "cc-set-hexin"); ghx.type = "text"; ghx.value = gcol || ""; ghx.placeholder = "#1f9d55"; ghx.maxLength = 7; ghx.spellcheck = false;
      var gpk = inlinePicker(/^#[0-9a-f]{6}$/i.test(gcol) ? gcol : "#1f9d55", function (v) { gcol = v; ghx.value = v; set("cc.iconcolor", v); gsy(); });
      function gOn() { return !!gcol; }
      var gtg = el("span", "cc-set-toggle" + (gOn() ? " cc-set-toggle-on" : "")); gtg.setAttribute("role", "switch"); gtg.setAttribute("tabindex", "0"); gtg.setAttribute("aria-checked", gOn() ? "true" : "false"); gtg.appendChild(el("span", "cc-set-knob"));
      function gsy() { gtg.classList.toggle("cc-set-toggle-on", gOn()); gtg.setAttribute("aria-checked", gOn() ? "true" : "false"); gsync(); }
      gtg.addEventListener("click", function () { if (gOn()) { gcol = ""; del("cc.iconcolor"); ghx.value = ""; } else { gcol = gpk._get(); ghx.value = gcol; set("cc.iconcolor", gcol); } gsy(); });
      gtg.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); gtg.click(); } });
      ghx.addEventListener("input", function () { var v = normHex(ghx.value); if (v) { gcol = v; gpk._set(v); set("cc.iconcolor", v); gsy(); } });
      var gir = el("div", "cc-set-pickrow"); gir.appendChild(gpk); gir.appendChild(ghx); cLI.appendChild(gir);
      var gtr = el("div", "cc-set-row cc-set-inline"); gtr.appendChild(el("span", null, T("Einfärben", "Colourise"))); gtr.appendChild(gtg); cLI.appendChild(gtr);
      gstrow = el("div", "cc-set-row"); gstrow.appendChild(el("span", "cc-set-rl", T("Intensität", "Strength")));
      var gsl = el("input"); gsl.type = "range"; gsl.min = "10"; gsl.max = "100"; gsl.value = String(parseInt(get("cc.iconstrength", "100"), 10) || 100); gsl.style.flex = "1";
      gsl.addEventListener("input", function () { set("cc.iconstrength", gsl.value); gsync(); });
      gstrow.appendChild(gsl); cLI.appendChild(gstrow);
      gApplyBg(gbg);
      wrapMain.appendChild(cLI);
    })();
    // Docker is now a normal area like the others: a "Stil" adopt card + its OWN Badges (accent)
    // card at the TOP of the Docker tab. buildStyleCards writes ccd.accent; docker.js reads it via
    // effc() (adopt on = follow global cc.accent, the default -> no change for existing installs).
    var cD = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cD.appendChild(styleToggle("cc.styledocker", null));
    wrap.appendChild(cD);
    buildStyleCards("ccd.", wrap, [], true);

    // ── Logos (one card: tint OR background) ──
    var c2 = card(T("Logos", "Logos"), T("Der Schalter aktiviert die Färbung.", "The switch turns the tint on."));
    var iconbg = get("cc.iconbg", "0") === "1";
    function applyBgMode(v) { iconbg = v; c2.classList.toggle("cc-bg-mode", v); strow.style.opacity = v ? ".4" : ""; strow.style.pointerEvents = v ? "none" : ""; tprevWrap.classList.toggle("cc-prev-bg", v); try { tintPrev(); } catch (e9) {} }
    c2.appendChild(toggleRow(T("Hintergrund", "Background"), iconbg, function (v) { set("cc.iconbg", v ? "1" : "0"); applyBgMode(v); syncAllStyleCards(); }));
    var ihexIn = el("input", "cc-set-hexin"); ihexIn.type = "text"; ihexIn.value = iconcolor || ""; ihexIn.placeholder = "#1f9d55"; ihexIn.maxLength = 7; ihexIn.spellcheck = false;
    var ipick = inlinePicker(/^#[0-9a-f]{6}$/i.test(iconcolor) ? iconcolor : (/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#1f9d55"), function (v) { iconcolor = v; ihexIn.value = v; set("cc.iconcolor", v); syncIconTog(); });
    // A real ON/OFF toggle drives the tint (empty cc.iconcolor = off). The picker/hex
    // set WHICH colour; changing either also switches the tint on.
    function iconOn() { return !!iconcolor; }
    var iconTog = el("span", "cc-set-toggle" + (iconOn() ? " cc-set-toggle-on" : "")); iconTog.setAttribute("role", "switch"); iconTog.setAttribute("tabindex", "0"); iconTog.setAttribute("aria-checked", iconOn() ? "true" : "false"); iconTog.appendChild(el("span", "cc-set-knob"));
    function syncIconTog() { var on = iconOn(); iconTog.classList.toggle("cc-set-toggle-on", on); iconTog.setAttribute("aria-checked", on ? "true" : "false"); try { tintPrev(); } catch (e9) {} syncAllStyleCards(); /* global cc.iconcolor changed -> adopt-ON area cards follow */ }
    function setIcon(v) { iconcolor = v; ipick._set(v); ihexIn.value = v; set("cc.iconcolor", iconcolor); syncIconTog(); }
    function setIconOn(on) { if (on) { setIcon(ipick._get()); } else { iconcolor = ""; del("cc.iconcolor"); ihexIn.value = ""; syncIconTog(); } }
    iconTog.addEventListener("click", function () { setIconOn(!iconOn()); });
    iconTog.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setIconOn(!iconOn()); } });
    ihexIn.addEventListener("input", function () { var v = normHex(ihexIn.value); if (v) setIcon(v); });
    // picker FIRST (same position/height as the Badges card's picker), toggle below
    var irow = el("div", "cc-set-pickrow"); irow.appendChild(ipick); irow.appendChild(ihexIn); c2.appendChild(irow);
    var togRow = el("div", "cc-set-row cc-set-inline"); togRow.appendChild(el("span", null, T("Einfärben", "Colourise"))); togRow.appendChild(iconTog); c2.appendChild(togRow);
    var strow = el("div", "cc-set-row");
    strow.appendChild(el("span", "cc-set-rl", T("Intensität", "Strength")));
    var sl = el("input"); sl.type = "range"; sl.min = "10"; sl.max = "100"; sl.value = String(iconstrength); sl.style.flex = "1";
    sl.addEventListener("input", function () { iconstrength = parseInt(sl.value, 10); set("cc.iconstrength", sl.value); try { tintPrev(); } catch (e9) {} syncAllStyleCards(); });
    strow.appendChild(sl);
    c2.appendChild(strow);
    // (the VM-icons toggle is obsolete — the VM tab has its own style section)
    // cc.sgsize is GLOBAL (one key): the SAME row closes the Docker "Logos" card and the
    // Einstellungen/Werkzeuge "Stil" card — normalised slot: always the LAST row of its card.
    function tileSizeRow() {
      var r = segRow(T("Kachelgröße", "Tile size"), [["s", T("Klein", "Small")], ["m", T("Mittel", "Medium")], ["l", T("Groß", "Large")]], get("cc.sgsize", "m"), function (v) { set("cc.sgsize", v); });
      r.insertBefore(infoIcon(T("Gilt global – dieselbe Größe steuert das Einstellungen-/Werkzeuge-Raster und die Docker-/Plugin-Logos.", "Global – the same size drives the Settings/Tools grid and the Docker/Plugin logos.")), r.lastChild);
      return r;
    }
    c2.appendChild(el("div", "cc-set-lbl", T("Vorschau", "Preview")));
    var tprevWrap = el("div", "cc-set-prev");
    var tprevImgs = [];
    function addPrevImg(src9) {
      var im9 = el("img"); im9.src = src9; im9.alt = "";
      im9.style.width = "48px"; im9.style.height = "48px"; im9.style.objectFit = "contain";
      im9.onerror = function () { this.style.display = "none"; };
      tprevImgs.push(im9); tprevWrap.appendChild(im9);
    }
    // REAL container logos (up to four) — Unraid stores every container icon under
    // this path; our own logo is only the fallback when none load
    api("GET", "state").then(function (st9) {
      var cs9 = (st9 && st9.containers) || [];
      cs9.slice(0, 4).forEach(function (c9) { if (c9 && c9.name) addPrevImg("/state/plugins/dynamix.docker.manager/images/" + encodeURIComponent(c9.name) + "-icon.png"); });
      if (!cs9.length) addPrevImg("/plugins/cannonadecommand/images/cannonadecommand.png");
      tintPrev();
    }).catch(function () { addPrevImg("/plugins/cannonadecommand/images/cannonadecommand.png"); tintPrev(); });
    function tintPrev() {
      if (iconbg) {
        var bg8 = /^#[0-9a-f]{6}$/i.test(iconcolor) ? iconcolor : accent;
        // Logo on a coloured badge. The badge colour AND the mono-inked logo are
        // composited INSIDE one SVG filter (feColorMatrix ink → feFlood badge →
        // feComposite over). The badge must NOT be the <img>'s own background: a CSS
        // `filter` recolours the element's background too, so any mono matrix (or the
        // old grayscale/brightness(0)/invert chain) turned the whole box opaque ink and
        // hid the badge — that was the "background preview doesn't work" bug. The ink is
        // idealText(bg8) → dark logo on a light badge, white logo on a dark one.
        var ink8 = idealText(bg8); if (ink8.length === 4) ink8 = "#" + ink8[1] + ink8[1] + ink8[2] + ink8[2] + ink8[3] + ink8[3];
        var im8 = parseInt(ink8.slice(1), 16), ir8 = (im8 >> 16 & 255) / 255, ig8 = (im8 >> 8 & 255) / 255, ib8 = (im8 & 255) / 255;
        var mhost8 = document.getElementById("cc-set-monosvg");
        if (!mhost8) { mhost8 = document.createElement("div"); mhost8.id = "cc-set-monosvg"; mhost8.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(mhost8); }
        mhost8.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="cc-set-mono" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 ' + ir8 + ' 0 0 0 0 ' + ig8 + ' 0 0 0 0 ' + ib8 + ' 0 0 0 1 0" result="ink"/><feFlood flood-color="' + bg8 + '" result="bg"/><feComposite in="ink" in2="bg" operator="over"/></filter></svg>';
        // same min-capped tile radius as the glyph preview (badgeshape family, CIRCLE bypasses the 16px cap)
        var sh8 = get("cc.badgeshape", "pill");
        var br8 = sh8 === "circle" ? "50%" : "min(" + ({ pill: "999px", rounded: "6px", square: "0px", circle: "999px" }[sh8] || "999px") + ", 16px)";
        tprevImgs.forEach(function (im9) { im9.style.filter = "url(#cc-set-mono)"; im9.style.background = ""; im9.style.borderRadius = br8; im9.style.padding = "6px"; });
        return;
      }
      var hx9 = /^#?([0-9a-f]{6})$/i.exec(iconcolor || "");
      if (!hx9) { tprevImgs.forEach(function (im9) { im9.style.filter = "none"; im9.style.background = ""; im9.style.padding = ""; im9.style.borderRadius = ""; }); return; }
      var n9 = parseInt(hx9[1], 16), r9 = (n9 >> 16 & 255) / 255, g9 = (n9 >> 8 & 255) / 255, b9 = (n9 & 255) / 255;
      var st9 = Math.max(10, iconstrength || 100) / 100, i9 = 1 - st9;
      function row9(c9, ix9) { var v9 = [0.2126 * c9 * st9, 0.7152 * c9 * st9, 0.0722 * c9 * st9, 0, 0]; v9[ix9] += i9; return v9.join(" "); }
      var host9 = document.getElementById("cc-set-tintsvg");
      if (!host9) { host9 = document.createElement("div"); host9.id = "cc-set-tintsvg"; host9.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(host9); }
      host9.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="cc-set-tint" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values="' + row9(r9, 0) + " " + row9(g9, 1) + " " + row9(b9, 2) + ' 0 0 0 1 0"/></filter></svg>';
      tprevImgs.forEach(function (im9) { im9.style.filter = "url(#cc-set-tint)"; im9.style.background = ""; im9.style.padding = ""; im9.style.borderRadius = ""; });
    }
    c2.appendChild(tprevWrap); tintPrev(); applyBgMode(iconbg);
    c2.appendChild(tileSizeRow()); // tile size is ALWAYS the card's last row (same slot as the Settings/Tools card)
    wrap.appendChild(c2);

    // (The CPU/RAM diagnostics card is built right before the Bandwidth card below,
    //  so it sits DIRECTLY above it — explicit user placement request.)

    // ── Columns matrix ──
    var c3 = card(T("Spalten / Badges je Ansicht", "Columns / badges per view"), T("Welche Badges in der einfachen und in der Advanced-Ansicht erscheinen.", "Which badges appear in the Simple and the Advanced view."));
    var tbl = el("table", "cc-set-tbl");
    var thr = el("tr"); thr.appendChild(el("th")); thr.appendChild(thc(T("Einfach", "Simple"))); thr.appendChild(thc(T("Advanced", "Advanced"))); tbl.appendChild(thr);
    COLS.forEach(function (c, i) {
      var tr = el("tr"); tr.appendChild(el("td", "cc-set-cname", c.label));
      tr.appendChild(chkCell(c.key, "s", RB[i])); tr.appendChild(chkCell(c.key, "a", RB[i])); tbl.appendChild(tr);
    });
    c3.appendChild(tbl);
    wrap.appendChild(c3);

    // ── View ──
    // (Dichte is ONE GLOBAL key and lives in the Allgemein tab now — see the global density
    //  card added to wrapMain below, so the user finds it with the other global controls.)
    var c4 = card(T("Ansicht", "View"), null);
    c4.appendChild(segRow(T("Standard-Ansicht", "Default view"), [["list", T("Liste", "List")], ["grid", T("Raster", "Grid")]], view, function (v) { view = v; set("cc.view", v); }));
    function applyShape() { var m9 = { pill: "999px", rounded: "6px", square: "0px", circle: "999px" }; var sh9 = get("cc.badgeshape", "pill"); var r9 = m9[sh9] || "999px"; root.style.setProperty("--cc-b-radius", r9); document.documentElement.style.setProperty("--cc-b-radius", r9); document.documentElement.classList.toggle("cc-shape-circle", sh9 === "circle"); var d9 = { pill: "50%", rounded: "3px", square: "0px", circle: "50%" }[sh9] || "50%"; document.documentElement.style.setProperty("--cc-dot-r", d9); /* dot token: the preset swatches follow the badge form too (user call) */ }
    wrap.appendChild(c4);
    // Badge-Form (shape) is a single GLOBAL control in the Allgemein "Badges" card now — not per
    // area — so the Docker tab has no inline Badge-Form card either. Keep the initial applyShape()
    // so the settings page's --cc-b-radius is set on first render.
    applyShape();

    // ── Notifications (engine-side; saved to the flash) ──
    var c5 = card(T("Benachrichtigungen", "Notifications"), T("Warnungen bei Watchdog-Neustarts, fehlgeschlagenen Starts und Zeitplan-Fehlern.", "Alerts on watchdog restarts, failed starts and schedule errors."));
    c5.appendChild(toggleRow(T("Unraid-Benachrichtigungen", "Unraid notifications"), notify.unraid, function (v) { notify.unraid = v; notifyDirty = true; }));
    var wrow = el("div", "cc-set-row"); wrow.appendChild(el("span", "cc-set-rl", T("Webhook-URL", "Webhook URL")));
    var win = el("input", "cc-set-txt"); win.type = "url"; win.placeholder = "https://…"; win.value = notify.webhook || "";
    win.addEventListener("input", function () { notify.webhook = win.value.trim(); notifyDirty = true; });
    wrow.appendChild(win); c5.appendChild(wrow);
    // Save stays disabled until the current config has been read once, so we never
    // save notify over a config we haven't seen (and by then there is no in-flight
    // initial GET left to race a just-saved value back to stale).
    var save5 = el("span", "cc-btn cc-btn-primary cc-set-save" + (configLoaded ? "" : " cc-set-disabled"), configLoaded ? T("Speichern", "Save") : T("lädt…", "loading…"));
    save5.addEventListener("click", function () { if (configLoaded && !save5.classList.contains("cc-set-disabled")) saveNotify(save5); }); c5.appendChild(save5);
    wrap.appendChild(c5);

    // ── Bandwidth / network shaping (engine-side; saved to the flash) ──
    // ── Limit diagnostics: the engine's last CPU/RAM limit operations, VERIFIED ——
    // sits DIRECTLY before the Bandwidth card (explicit placement request).
    var cd = card(T("Diagnose: CPU/RAM-Limits", "Diagnostics: CPU/RAM limits"), T("Die letzten Limit-Änderungen mit Docker-Ergebnis und verifizierten Werten danach.", "The most recent limit changes with docker's result and the verified values after."));
    var diag = el("div", "cc-set-diag"); diag.textContent = "…"; cd.appendChild(diag); wrap.appendChild(cd);
    api("GET", "limitlog").then(function (ops) {
      diag.textContent = "";
      if (!ops || !ops.length) { diag.textContent = T("Noch keine Limit-Änderung seit dem Daemon-Start.", "No limit change since the daemon started."); return; }
      ops.forEach(function (o) {
        var row = el("div", "cc-set-diag-row" + (o.result === "ok" ? "" : " cc-set-diag-bad"));
        row.textContent = o.time + "  " + o.name + "  [" + o.req + "]  → " + o.result + (o.after ? "  · " + T("danach", "after") + ": " + o.after : "");
        diag.appendChild(row);
      });
    }).catch(function (e) { diag.textContent = T("Diagnose nicht verfügbar: ", "Diagnostics unavailable: ") + e.message; });

    var c6 = card(T("Bandbreite", "Bandwidth"), T("Schnittstelle IM Container, auf der die Limits gesetzt werden. LEER = automatisch (Default-Route des Containers) — empfohlen. Pro-Container-Limits stellst du im Docker-Tab ein.", "Interface INSIDE the container the limits are applied to. BLANK = automatic (the container's default route) — recommended. Set per-container limits in the Docker tab."));
    var ifrow = el("div", "cc-set-row"); ifrow.appendChild(el("span", "cc-set-rl", T("Schnittstelle", "Interface")));
    var ifin = el("input", "cc-set-txt"); ifin.type = "text"; ifin.placeholder = T("automatisch", "automatic"); ifin.value = shapeIface; ifin.maxLength = 15; ifin.spellcheck = false; ifin.setAttribute("list", "cc-iface-list");
    var dl = el("datalist"); dl.id = "cc-iface-list"; ["eth0", "eth1", "eth2"].forEach(function (n) { var o = el("option"); o.value = n; dl.appendChild(o); });
    ifin.addEventListener("input", function () { shapeIface = ifin.value.trim(); shapeDirty = true; });
    ifrow.appendChild(ifin); ifrow.appendChild(dl); c6.appendChild(ifrow);
    var save6 = el("span", "cc-btn cc-btn-primary cc-set-save" + (configLoaded ? "" : " cc-set-disabled"), configLoaded ? T("Speichern", "Save") : T("lädt…", "loading…"));
    save6.addEventListener("click", function () { if (configLoaded && !save6.classList.contains("cc-set-disabled")) saveShape(save6); }); c6.appendChild(save6);
    wrap.appendChild(c6);

    // ── Plugin-Tab / VM-Tab sections: adopt the global badge colour there too? ──
    // Push the header area's live state onto the real top bar on THIS page (browsers don't
    // fire 'storage' in the originating document, so header.js won't hear a same-page change).
    function syncHeaderBar() { try { if (typeof window.ccHeaderApply === "function") window.ccHeaderApply(); } catch (e) {} }
    // same live push for the Freigaben tabs (no 'storage' event fires in this document)
    function syncSharesBar() { try { if (typeof window.ccSharesApply === "function") window.ccSharesApply(); } catch (e) {} }
    // adopt-key -> the area's own key prefix (for seeding its own accent on adopt-OFF)
    var ADOPT_PREF = { "cc.styleheader": "cch.", "cc.styleshares": "ccsh.", "cc.styledocker": "ccd.", "cc.styleplugin": "ccp.", "cc.stylevms": "ccv.", "cc.stylesettings": "ccs.", "cc.stylefavorites": "ccf.", "cc.stylemain": "ccm." };
    function styleToggle(key, onChange, lbl) {
      // the SAME knob switch as everywhere else (the text-in-pill variant looked wrong)
      var row = el("div", "cc-set-row cc-set-inline");
      row.appendChild(el("span", null, lbl || T("Globale Badge-Farbe übernehmen", "Adopt the global badge colour")));
      var tg = toggle(localStorage.getItem(key) !== "0", function (v) {
        localStorage.setItem(key, v ? "1" : "0");
        // Adopt OFF + this area never had its OWN colour: seed it from the CURRENT global accent, so
        // (a) the colour doesn't jump to the #2f6feb default and (b) the area's picker reflects the
        // live colour and any later edit visibly applies (the "toggle does nothing" the user hit —
        // an unset own-accent otherwise fell back to the same default as the global).
        var p = ADOPT_PREF[key];
        if (!v && p && localStorage.getItem(p + "accent") == null) set(p + "accent", get("cc.accent", "#2f6feb"));
        if (styleCardSync[key]) styleCardSync[key](); // picker/swatches/preview jump to the now-effective colour (user call)
        if (onChange) onChange(); syncHeaderBar(); syncSharesBar();
      });
      adoptToggles[key] = tg; row.appendChild(tg);
      return row;
    }
    // per-area "Tabansicht" row — lives IN the Stil card now (was its own Tab-Ansicht card).
    // INVERTED vs storage on purpose: toggle ON = cc.sections.<area> "0" (native Unraid
    // sub-tabs, the DEFAULT), toggle OFF = "1" (sub-tabs stacked as CC sections). Only areas
    // that actually HAVE sub-tabs get it: Freigaben, Start (/Main), Plugin, VM.
    function tabviewRow(area, applyFn) {
      var row = el("div", "cc-set-row cc-set-inline");
      var lw = el("span", "cc-set-lblwrap");
      lw.appendChild(el("span", null, T("Tabansicht", "Tabbed view")));
      lw.appendChild(infoIcon(T("AUS = Unterreiter dieses Tabs werden als CC-Abschnitte untereinander gestapelt. Unraids globale Tabansicht (Theming-Karte) ist der Master: steht sie auf 'Ohne Tabs', rendert Unraid überall Abschnitte und dieser Schalter wirkt nicht.", "OFF = this tab's sub-tabs stack as CC sections. Unraid's global tabbed view (Theming card) is the master: set to non-tabbed, Unraid renders sections everywhere and this switch has no effect.")));
      row.appendChild(lw);
      row.appendChild(toggle(get("cc.sections." + area, "0") === "0", function (v) { set("cc.sections." + area, v ? "0" : "1"); if (applyFn) applyFn(); }));
      return row;
    }
    var cP = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cP.appendChild(styleToggle("cc.styleplugin", null));
    cP.appendChild(tabviewRow("plugins", syncPluginsBar));
    // per-tab style controls — the SAME set as the Docker tab, active while the
    // adopt-toggle above is OFF (own key prefix per tab)
    // The Plugin/VM sections carry EXACTLY the Docker tab's style cards (same
    // picker, swatches, rainbow palette, tint toggle + strength) on their own
    // key prefix; they apply while "Adopt the Docker-tab style" is OFF.
    function buildStyleCards(P, into, samples, noLogos) {
      // Picking a colour in an area's card means "this area uses its OWN style" — so turn its
      // adopt toggle OFF (else eff() keeps reading the global cc.* accent and the pick is
      // ignored, the "colour not applied to the menu" bug). Reflected live on the toggle +
      // the real header bar. Turn adopt back ON to re-follow the global Docker accent.
      var ADOPT = { "ccd.": "cc.styledocker", "ccp.": "cc.styleplugin", "ccv.": "cc.stylevms", "cch.": "cc.styleheader", "ccs.": "cc.stylesettings", "ccsh.": "cc.styleshares", "ccf.": "cc.stylefavorites", "ccm.": "cc.stylemain" };
      var adoptKey = ADOPT[P];
      // the card always shows the EFFECTIVE colour: the global accent while adopt is ON,
      // the area's own accent while OFF (user call: the fields must "jump" on adopt)
      function effAcc() { return (adoptKey && localStorage.getItem(adoptKey) !== "0") ? get("cc.accent", "#2f6feb") : get(P + "accent", "#2f6feb"); }
      var acc = effAcc(), icol = get(P + "iconcolor", ""), istr = parseInt(get(P + "iconstrength", "100"), 10) || 100;
      function useOwn() {
        if (adoptKey && localStorage.getItem(adoptKey) !== "0") {
          localStorage.setItem(adoptKey, "0");
          if (adoptToggles[adoptKey] && adoptToggles[adoptKey]._setOn) adoptToggles[adoptKey]._setOn(false);
        }
        syncHeaderBar(); syncSharesBar();
      }
      var cA = card(T("Badges", "Badges"), T("Akzentfarbe und Farbmodus der Badges.", "Accent colour and colour mode of the badges."));
      var pr = el("div", "cc-set-pickrow");
      var hx = el("input", "cc-set-hexin"); hx.type = "text"; hx.value = acc; hx.placeholder = "#2f6feb"; hx.maxLength = 7; hx.spellcheck = false;
      var pk = inlinePicker(/^#[0-9a-f]{6}$/i.test(acc) ? acc : "#2f6feb", function (v) { acc = v; hx.value = v; set(P + "accent", v); useOwn(); paintPv(); });
      hx.addEventListener("input", function () { var v = normHex(hx.value); if (v) { acc = v; pk._set(v); set(P + "accent", v); useOwn(); paintPv(); } });
      pr.appendChild(pk); pr.appendChild(hx); cA.appendChild(pr);
      var sr = el("div", "cc-set-swatches");
      PRESETS.forEach(function (c) {
        var sw = el("span", "cc-set-sw" + (c === acc ? " cc-set-sw-on" : "")); sw.setAttribute("data-tip", c); sw.style.background = c;
        sw.addEventListener("click", function () { acc = c; pk._set(c); hx.value = c; set(P + "accent", c); useOwn(); paintPv(); });
        sr.appendChild(sw);
      });
      cA.appendChild(sr);
      // Rainbow is a GLOBAL mode now (one switch + one palette in the top Badges card): when it's
      // on, EVERY enabled area rainbows, so there is NO per-area rainbow toggle/palette here — just
      // this area's single accent colour above. The preview below still reflects the global rainbow.
      var RB2 = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"];
      function palG() { try { var pj = JSON.parse(get("cc.rbpal", "null")); if (pj && pj.length) return pj; } catch (e2) {} return RB2; }
      // live preview — the Hauptmenueleiste (cch.) previews the MENU TABS (idle grey pill +
      // one accent-filled active pill, mirroring CannonadeCommand.Header.css); every other
      // area previews the Docker badges.
      // both the Hauptmenueleiste (cch.) and Freigaben (ccsh.) restyle Unraid TAB bars ->
      // preview tab pills (menu tabs vs the two Shares sub-tabs); every other area = badges.
      var isTabs = P === "cch." || P === "ccsh.";
      cA.appendChild(el("div", "cc-set-lbl", T("Vorschau", "Preview")));
      var pv = el("div", "cc-set-prev" + (isTabs ? " cc-set-navprev" : ""));
      var activeIx = P === "ccsh." ? 0 : 2; // one active tab, like the real bar
      var pvBadges;
      if (isTabs) {
        var TABS = P === "ccsh."
          ? [T("Benutzer-Freigaben", "User Shares"), T("Laufwerks-Freigaben", "Disk Shares")]
          : [T("Übersicht", "Main"), "Shares", "Docker", "VMs", T("Einstellungen", "Settings"), "Tools"];
        pvBadges = TABS.map(function (nm9, i9) {
          var t9 = el("span", "cc-navtab" + (i9 === activeIx ? " cc-navtab-on" : ""), nm9); pv.appendChild(t9); return t9;
        });
      } else {
        // 2-3 mixed categories (same as the Allgemein preview): NAME headline (lg) + key/value (sm) + tab pill (md)
        var pvName9 = el("span", "cc-b cc-b-lg", "nextcloud"); pv.appendChild(pvName9);
        var pvVal9 = el("span", "cc-b"); pvVal9.appendChild(el("span", "cc-b-k", "CPU")); pvVal9.appendChild(el("span", "cc-b-v", "2/8")); pv.appendChild(pvVal9);
        var pvTab9 = el("span", "cc-navtab cc-navtab-on", "Docker"); pv.appendChild(pvTab9);
        pvBadges = [pvName9, pvVal9, pvTab9];
      }
      function paintPv() {
        var rbOn9 = get("cc.rainbow", "0") === "1", p9 = palG();
        pvBadges.forEach(function (b9, i9) {
          if (rbOn9) {   // rainbow: colour EVERY badge/tab by index (matches the now-fully-rainbow live bar)
            var cr = p9[i9 % p9.length];
            b9.style.setProperty("background", cr, "important"); b9.style.setProperty("color", idealText(cr), "important");
            return;
          }
          if (isTabs && i9 !== activeIx) { b9.style.removeProperty("background"); b9.style.removeProperty("color"); return; } // accent: idle tab keeps its grey CSS pill
          b9.style.setProperty("background", acc, "important"); b9.style.setProperty("color", idealText(acc), "important");
        });
      }
      paintPv();
      cA.appendChild(pv);
      // adopt flip / global edit → this card repaints with the effective colour. ALSO repaints
      // the Logos card below with the EFFECTIVE icon values (adopt ON -> global cc.icon*, OFF ->
      // this area's own P+icon*) — same effAcc() pattern, reusing sy()/applyBg2 for the paint.
      // The cB handles (bgTg/ipk/ihx/sl2) are vars assigned below; the refresher only ever runs
      // after buildStyleCards finished, so they are live by then.
      if (adoptKey) styleCardSync[adoptKey] = function () {
        acc = effAcc();
        try { pk._set(/^#[0-9a-f]{6}$/i.test(acc) ? acc : "#2f6feb"); } catch (e9) {}
        hx.value = acc;
        Array.prototype.slice.call(sr.querySelectorAll(".cc-set-sw")).forEach(function (sw9) { sw9.classList.toggle("cc-set-sw-on", sw9.getAttribute("data-tip") === acc); });
        paintPv();
        var ga = localStorage.getItem(adoptKey) !== "0";
        icol = ga ? get("cc.iconcolor", "") : get(P + "iconcolor", "");
        try { ipk._set(/^#[0-9a-f]{6}$/i.test(icol) ? icol : "#1f9d55"); } catch (e9) {}
        ihx.value = icol || "";
        sl2.value = String(parseInt(ga ? get("cc.iconstrength", "100") : get(P + "iconstrength", "100"), 10) || 100);
        sy(); // Einfärben knob + preview follow icol
        var ebg = (ga ? get("cc.iconbg", "0") : get(P + "iconbg", P === "ccs." ? "1" : "0")) === "1";
        bgTg._setOn(ebg); applyBg2(ebg);
      };
      into.appendChild(cA);
      // Badge-Form (shape) is now a single GLOBAL control in the Allgemein "Badges" card, so it is
      // no longer repeated per area here.
      var cB = card(T("Logos", "Logos"), T("Der Schalter aktiviert die Färbung.", "The switch turns the tint on."));
      var ibg = get(P + "iconbg", P === "ccs." ? "1" : "0") === "1";
      function applyBg2(v) { ibg = v; cB.classList.toggle("cc-bg-mode", v); st2.style.opacity = v ? ".4" : ""; st2.style.pointerEvents = v ? "none" : ""; tpw.classList.toggle("cc-prev-bg", v); try { tp(); } catch (e9) {} }
      // every value change = "this area uses its OWN style" -> useOwn() flips the adopt toggle
      // off, exactly like the Badges card handlers (own key set FIRST so the bar sync reads it).
      // bgTg is kept as a handle: the adopt-sync refresher below repaints it with the EFFECTIVE state.
      var bgTg = toggle(ibg, function (v) { set(P + "iconbg", v ? "1" : "0"); useOwn(); applyBg2(v); });
      var bgRow = el("div", "cc-set-row"); bgRow.appendChild(el("span", null, T("Hintergrund", "Background"))); bgRow.appendChild(el("span", "cc-set-spacer")); bgRow.appendChild(bgTg);
      cB.appendChild(bgRow);
      var ihx = el("input", "cc-set-hexin"); ihx.type = "text"; ihx.value = icol || ""; ihx.placeholder = "#1f9d55"; ihx.maxLength = 7; ihx.spellcheck = false;
      var ipk = inlinePicker(/^#[0-9a-f]{6}$/i.test(icol) ? icol : "#1f9d55", function (v) { icol = v; ihx.value = v; set(P + "iconcolor", v); useOwn(); sy(); });
      function on2() { return !!icol; }
      var tg2 = el("span", "cc-set-toggle" + (on2() ? " cc-set-toggle-on" : "")); tg2.setAttribute("role", "switch"); tg2.setAttribute("tabindex", "0"); tg2.appendChild(el("span", "cc-set-knob"));
      function sy() { tg2.classList.toggle("cc-set-toggle-on", on2()); tg2.setAttribute("aria-checked", on2() ? "true" : "false"); try { tp(); } catch (e9) {} }
      tg2.addEventListener("click", function () { if (on2()) { icol = ""; del(P + "iconcolor"); ihx.value = ""; } else { icol = ipk._get(); ihx.value = icol; set(P + "iconcolor", icol); } useOwn(); sy(); });
      ihx.addEventListener("input", function () { var v = normHex(ihx.value); if (v) { icol = v; ipk._set(v); set(P + "iconcolor", v); useOwn(); sy(); } });
      var ir2 = el("div", "cc-set-pickrow"); ir2.appendChild(ipk); ir2.appendChild(ihx); cB.appendChild(ir2);
      var tr2 = el("div", "cc-set-row cc-set-inline"); tr2.appendChild(el("span", null, T("Einfärben", "Colourise"))); tr2.appendChild(tg2); cB.appendChild(tr2);
      var st2 = el("div", "cc-set-row"); st2.appendChild(el("span", "cc-set-rl", T("Intensität", "Strength")));
      var sl2 = el("input"); sl2.type = "range"; sl2.min = "10"; sl2.max = "100"; sl2.value = String(istr); sl2.style.flex = "1";
      sl2.addEventListener("input", function () { set(P + "iconstrength", sl2.value); useOwn(); try { tp(); } catch (e9) {} });
      st2.appendChild(sl2); cB.appendChild(st2);
      // live logo preview with real icons of this tab
      cB.appendChild(el("div", "cc-set-lbl", T("Vorschau", "Preview")));
      var tpw = el("div", "cc-set-prev"); var tpImgs = [], tpGlyphs = [];
      // A sample beginning with "fa-"/"icon-" is a FONT GLYPH (the Settings/Tools tiles use FA/Unraid
      // font icons, not raster PNGs) — render it as an <i> coloured via CSS. Anything else is a raster
      // logo <img> tinted via the SVG feColorMatrix filter below. This is why ccs. showed no preview:
      // its samples were empty because there are no PNGs; now it passes glyph classes instead.
      (samples || []).forEach(function (s9) {
        if (/^(fa-|icon-)/.test(s9)) {
          var gi9 = el("i", "fa " + s9);
          gi9.style.cssText = "width:48px;height:48px;display:inline-flex;align-items:center;justify-content:center;font-size:26px;box-sizing:border-box";
          tpGlyphs.push(gi9); tpw.appendChild(gi9);
        } else {
          var im9 = el("img"); im9.src = s9; im9.alt = "";
          im9.style.width = "48px"; im9.style.height = "48px"; im9.style.objectFit = "contain";
          im9.onerror = function () { this.style.display = "none"; };
          tpImgs.push(im9); tpw.appendChild(im9);
        }
      });
      var fid = "cc-set-tint-" + P.replace(/[^a-z]/g, "");
      function tp() {
        // FONT-GLYPH samples (Settings/Tools): recolour via CSS (color/background), NOT the SVG filter
        // — a font glyph has no raster to matrix. Mirrors the tile treatment: background ON => a filled
        // accent badge with contrast glyph; colourise ON => tinted glyph; neither => native.
        tpGlyphs.forEach(function (gi9) {
          if (ibg) {
            var gbg9 = /^#[0-9a-f]{6}$/i.test(icol) ? icol : acc;
            gi9.style.background = gbg9; gi9.style.color = idealText(gbg9);
            // same square-badge radius family as the real tiles: rounded-square, except CIRCLE mode
            // which makes the square glyph a full circle (the 16px cap must be bypassed there).
            var sh9b = get("cc.badgeshape", "pill");
            var brm9 = { pill: "999px", rounded: "6px", square: "0px", circle: "999px" }[sh9b] || "999px";
            gi9.style.borderRadius = sh9b === "circle" ? "50%" : "min(" + brm9 + ", 16px)"; gi9.style.padding = "";
          } else if (/^#[0-9a-f]{6}$/i.test(icol)) {
            gi9.style.background = "none"; gi9.style.color = icol; gi9.style.borderRadius = "";
          } else {
            gi9.style.background = "none"; gi9.style.color = ""; gi9.style.borderRadius = "";
          }
        });
        if (ibg) {
          var bg8 = /^#[0-9a-f]{6}$/i.test(icol) ? icol : acc;
          // badge colour + mono-inked logo composited inside ONE filter (feColorMatrix
          // ink → feFlood badge → feComposite over). The badge must NOT be the <img>'s
          // background — a CSS filter recolours that too — see the Docker-card note.
          var ink8 = idealText(bg8); if (ink8.length === 4) ink8 = "#" + ink8[1] + ink8[1] + ink8[2] + ink8[2] + ink8[3] + ink8[3];
          var mi8 = parseInt(ink8.slice(1), 16), ir8 = (mi8 >> 16 & 255) / 255, ig8 = (mi8 >> 8 & 255) / 255, ib8 = (mi8 & 255) / 255;
          var mid8 = fid + "-mono", mhost8 = document.getElementById(mid8 + "-svg");
          if (!mhost8) { mhost8 = document.createElement("div"); mhost8.id = mid8 + "-svg"; mhost8.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(mhost8); }
          mhost8.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="' + mid8 + '" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 ' + ir8 + ' 0 0 0 0 ' + ig8 + ' 0 0 0 0 ' + ib8 + ' 0 0 0 1 0" result="ink"/><feFlood flood-color="' + bg8 + '" result="bg"/><feComposite in="ink" in2="bg" operator="over"/></filter></svg>';
          // same min-capped tile radius as the glyph branch above (badgeshape family, CIRCLE bypasses the 16px cap)
          var sh8 = get("cc.badgeshape", "pill");
          var br8 = sh8 === "circle" ? "50%" : "min(" + ({ pill: "999px", rounded: "6px", square: "0px", circle: "999px" }[sh8] || "999px") + ", 16px)";
          tpImgs.forEach(function (im9) { im9.style.filter = "url(#" + mid8 + ")"; im9.style.background = ""; im9.style.borderRadius = br8; im9.style.padding = "6px"; });
          return;
        }
        var hx9 = /^#?([0-9a-f]{6})$/i.exec(icol || "");
        if (!hx9) { tpImgs.forEach(function (im9) { im9.style.filter = "none"; im9.style.background = ""; im9.style.padding = ""; im9.style.borderRadius = ""; }); return; }
        var n9 = parseInt(hx9[1], 16), r9 = (n9 >> 16 & 255) / 255, g9 = (n9 >> 8 & 255) / 255, b9 = (n9 & 255) / 255;
        var st9 = Math.max(10, parseInt(get(P + "iconstrength", "100"), 10) || 100) / 100, i9 = 1 - st9;
        function row9(c9, ix9) { var v9 = [0.2126 * c9 * st9, 0.7152 * c9 * st9, 0.0722 * c9 * st9, 0, 0]; v9[ix9] += i9; return v9.join(" "); }
        var host9 = document.getElementById(fid + "-svg");
        if (!host9) { host9 = document.createElement("div"); host9.id = fid + "-svg"; host9.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(host9); }
        host9.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="' + fid + '" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values="' + row9(r9, 0) + " " + row9(g9, 1) + " " + row9(b9, 2) + ' 0 0 0 1 0"/></filter></svg>';
        tpImgs.forEach(function (im9) { im9.style.filter = "url(#" + fid + ")"; im9.style.background = ""; im9.style.padding = ""; im9.style.borderRadius = ""; });
      }
      cB.appendChild(tpw); tp(); applyBg2(ibg);
      // initial paint = the EFFECTIVE values (cA already initialises via effAcc(); run the
      // refresher once so cB starts on the global icon values while adopt is ON, own while OFF)
      if (adoptKey) { try { styleCardSync[adoptKey](); } catch (e9) {} }
      if (!noLogos) into.appendChild(cB); // header tab: badges only, no logo card
    }
    // the adopt "Stil" card is the FIRST card of every section (user call), then
    // the Badges/Logos cards. Same cards for the Kopfbereich (menu bar) as Plugins/VMs;
    // the Kopfbereich additionally carries the Fussleiste toggle + Status-Insel card.
    var cV = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cV.appendChild(styleToggle("cc.stylevms", null));
    cV.appendChild(tabviewRow("vms", syncVmsBar));
    var cH = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cH.appendChild(styleToggle("cc.styleheader", null));
    // footer visibility (cc.footer, "1" hidden = DEFAULT): header.js applies it; same-page live via syncHeaderBar
    var cHf = el("div", "cc-set-row cc-set-inline");
    var cHfL = el("span", "cc-set-lblwrap");
    cHfL.appendChild(el("span", null, T("Fußleiste ausblenden", "Hide footer bar")));
    cHfL.appendChild(infoIcon(T("Blendet die untere Statusleiste komplett aus.", "Hides the bottom status bar completely.")));
    cHf.appendChild(cHfL);
    cHf.appendChild(toggle(get("cc.footer", "1") !== "0", function (v) { set("cc.footer", v ? "1" : "0"); syncHeaderBar(); }));
    cH.appendChild(cHf);
    var cSh = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cSh.appendChild(styleToggle("cc.styleshares", null));
    cSh.appendChild(tabviewRow("shares", syncSharesBar));
    var cSet = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cSet.appendChild(styleToggle("cc.stylesettings", null));
    // tile size of the /Settings + /Tools category grid (cc.sgsize s/m/l, default m; settingsgrid.js
    // reads it) — the SAME shared row as the Docker Logos card, always the card's LAST row
    cSet.appendChild(tileSizeRow());
    var cFav = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cFav.appendChild(styleToggle("cc.stylefavorites", null));
    var cStart = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cStart.appendChild(styleToggle("cc.stylemain", null));
    cStart.appendChild(tabviewRow("main", syncSharesBar));
    wrapHeader.appendChild(cH); wrapShares.appendChild(cSh); wrapPlugin.appendChild(cP); wrapVms.appendChild(cV); wrapSettings.appendChild(cSet); wrapFavorites.appendChild(cFav); wrapStart.appendChild(cStart);
    // (the per-area Tabansicht toggle lives IN each Stil card now — see tabviewRow above)
    function syncPluginsBar() { try { if (typeof window.ccPluginsApply === "function") window.ccPluginsApply(); } catch (e) {} }
    function syncVmsBar() { try { if (typeof window.ccVmsApply === "function") window.ccVmsApply(); } catch (e) {} }
    buildStyleCards("cch.", wrapHeader, [], true); // Kopfbereich (menu bar): pill/badge settings only
    // Kopfbereich covers the main menu bar AND the top strip: the Status-Insel (top strip)
    // belongs to THIS area. header.js renders it and reads cc.island / cc.tempwarn live.
    (function () {
      var cI = card(T("Status-Insel", "Status island"), T("Die Status-Insel im oberen Streifen gehört zum Kopfbereich.", "The status island in the top strip belongs to the header area."));
      cI.appendChild(toggleRow(T("Status-Insel anzeigen", "Show status island"), get("cc.island", "1") !== "0", function (v) { set("cc.island", v ? "1" : "0"); syncHeaderBar(); }));
      // per-element checklist (user: an/abhaken welche Chips die Insel zeigt); header.js renders
      // them in a FIXED order and reads cc.isl.<key> live. Default all on.
      cI.appendChild(el("div", "cc-set-lbl", T("Angezeigte Elemente", "Shown elements")));
      [["uptime", T("Betriebszeit", "Uptime")], ["os", T("Unraid-Edition", "Unraid edition")], ["version", T("Unraid-Version", "Unraid version")], ["array", T("Array-Zustand", "Array state")], ["fill", T("Array-Füllstand", "Array usage")], ["ram", T("RAM-Auslastung", "RAM usage")], ["cpu", T("CPU-Last", "CPU load")], ["temps", T("Temperaturen", "Temperatures")]].forEach(function (it) {
        cI.appendChild(toggleRow(it[1], get("cc.isl." + it[0], "1") !== "0", function (v) { set("cc.isl." + it[0], v ? "1" : "0"); syncHeaderBar(); }));
      });
      cI.appendChild(segRow(T("Temperatur-Warnschwelle", "Temperature warning threshold"), [["50", "50 °C"], ["60", "60 °C"], ["70", "70 °C"]], get("cc.tempwarn", "60"), function (v) { set("cc.tempwarn", v); syncHeaderBar(); }));
      wrapHeader.appendChild(cI);
    })();
    // ── SERVERNAME card (user: size/weight/italic/font/colour customisable). header.js reads the
    // cc.brand.* keys live and inlines them on span.cc-brand-name — the REAL header is the preview
    // (no card preview). Controls are all dropdowns (stringent, no lone slider/toggle); colour
    // stays a picker like every other CC colour control.
    (function () {
      var cB = card(T("Servername", "Server name"), T("Aussehen des Servernamens oben links. Änderungen erscheinen live im Kopfbereich.", "Look of the server name at the top left. Changes appear live in the header."));
      // size (preset dropdown — replaces the lone slider)
      var SZ = ["16", "18", "20", "22", "24", "26", "28", "30", "32", "36", "40", "44", "48", "56", "64"].map(function (s) { return [s, s + " px"]; });
      cB.appendChild(dropRow(T("Größe", "Size"), SZ, get("cc.brand.size", "30"), function (v) { set("cc.brand.size", v); syncHeaderBar(); }));
      // weight
      cB.appendChild(dropRow(T("Stärke", "Weight"), [["300", T("Dünn", "Thin")], ["400", "Normal"], ["500", "Medium"], ["650", T("Halbfett", "Semibold")], ["800", T("Fett", "Bold")]], get("cc.brand.weight", "650"), function (v) { set("cc.brand.weight", v); syncHeaderBar(); }));
      // italic (dropdown, not a lone toggle — keep the control set uniform)
      cB.appendChild(dropRow(T("Kursiv", "Italic"), [["0", T("Normal", "Normal")], ["1", T("Kursiv", "Italic")]], get("cc.brand.italic", "0"), function (v) { set("cc.brand.italic", v); syncHeaderBar(); }));
      // font family (system / web-safe stacks — each option renders in its own face)
      var FONTS = [
        ["", T("Standard", "Default")],
        ['system-ui,-apple-system,"Segoe UI",sans-serif', "System"],
        ['Arial,Helvetica,sans-serif', "Arial"],
        ['"Segoe UI",system-ui,sans-serif', "Segoe UI"],
        ['Verdana,Geneva,sans-serif', "Verdana"],
        ['Tahoma,Geneva,sans-serif', "Tahoma"],
        ['"Trebuchet MS",Helvetica,sans-serif', "Trebuchet MS"],
        ['"Century Gothic","Apple Gothic",sans-serif', "Century Gothic"],
        ['Impact,Charcoal,sans-serif', "Impact"],
        ['Georgia,"Times New Roman",serif', "Georgia"],
        ['"Times New Roman",Times,serif', "Times New Roman"],
        ['"Palatino Linotype","Book Antiqua",Palatino,serif', "Palatino"],
        ['Garamond,"Times New Roman",serif', "Garamond"],
        ['"Courier New",Courier,monospace', "Courier New"],
        ['Consolas,"Lucida Console",monospace', "Consolas"],
        ['"Lucida Console",Monaco,monospace', "Lucida Console"],
        ['"Comic Sans MS","Comic Sans",cursive', "Comic Sans"]
      ].map(function (f) { return [f[0], f[1], f[0]]; }); // o[2] = self-preview face
      cB.appendChild(dropRow(T("Schriftart", "Font"), FONTS, get("cc.brand.font", ""), function (v) { set("cc.brand.font", v); syncHeaderBar(); }));
      // colour picker + hex (empty = default light)
      var col = get("cc.brand.color", "");
      cB.appendChild(el("div", "cc-set-lbl", T("Farbe", "Colour")));
      var pr = el("div", "cc-set-pickrow");
      var hx = el("input", "cc-set-hexin"); hx.type = "text"; hx.value = col || ""; hx.placeholder = "#f4f4f4"; hx.maxLength = 7; hx.spellcheck = false;
      var pk = inlinePicker(/^#[0-9a-f]{6}$/i.test(col) ? col : "#f4f4f4", function (v) { hx.value = v; set("cc.brand.color", v); syncHeaderBar(); });
      hx.addEventListener("input", function () { var v = normHex(hx.value); if (v) { pk._set(v); set("cc.brand.color", v); syncHeaderBar(); } else if (!hx.value) { del("cc.brand.color"); syncHeaderBar(); } });
      pr.appendChild(pk); pr.appendChild(hx); cB.appendChild(pr);
      wrapHeader.appendChild(cB);
    })();
    // #2b: per-icon SHOW/HIDE for the top-right utility icons (user: "jedes Icon ein-/ausblendbar").
    // Toggle ON = visible (default). cc.hideicon.<key>="1" hides it; header.js apply() stamps
    // html.cc-hideicon-<key> (Header.css hides the #menu .<Class>Button), and ccDockProfile hides the
    // docked bell/burger spans. Keys map to the native #menu button classes.
    (function () {
      var cIc = card(T("Kopf-Icons", "Header icons"), T("Blende einzelne Icons oben rechts aus. Aus = versteckt.", "Hide individual icons in the top-right. Off = hidden."));
      [["lang", T("Sprache", "Language")], ["search", T("Suche", "Search")], ["logout", T("Abmelden", "Logout")], ["terminal", T("Terminal", "Terminal")], ["browse", T("Datei-Verwaltung", "File manager")], ["feedback", T("Feedback", "Feedback")], ["info", T("Info", "Info")], ["log", T("Protokoll", "Log")], ["help", T("Hilfe", "Help")], ["bell", T("Benachrichtigungen", "Notifications")], ["burger", T("Menü", "Menu")]].forEach(function (ic) {
        cIc.appendChild(toggleRow(ic[1], get("cc.hideicon." + ic[0], "0") === "0", function (v) { set("cc.hideicon." + ic[0], v ? "0" : "1"); syncHeaderBar(); }));
      });
      wrapHeader.appendChild(cIc);
    })();
    buildStyleCards("ccsh.", wrapShares, [], true); // Freigaben: tab pills use FA glyphs -> badges only, no logo card
    buildStyleCards("ccs.", wrapSettings, ["fa-cog", "fa-globe", "fa-star"], false); // Einstellungs-Tab: badges + logo-tint + Logo-Hintergrund cards; the tiles use FA glyphs, so the preview shows sample glyphs (cog/globe/star = System/Network/User category icons), coloured via CSS not the raster filter
    buildStyleCards("ccp.", wrapPlugin, ["/plugins/dynamix.plugin.manager/images/dynamix.plugin.manager.png", "/plugins/dynamix.docker.manager/images/dynamix.docker.manager.png", "/plugins/cannonadecommand/images/cannonadecommand.png"]);
    buildStyleCards("ccv.", wrapVms, ["/plugins/dynamix.vm.manager/templates/images/linux.png", "/plugins/dynamix.vm.manager/templates/images/windows.png", "/plugins/cannonadecommand/images/cannonadecommand.png"]);
    buildStyleCards("ccf.", wrapFavorites, ["fa-star", "fa-heart", "fa-cog"], false); // Favoriten: tiles use FA glyphs -> preview shows sample glyphs coloured via CSS (like the Settings card)
    buildStyleCards("ccm.", wrapStart, [], true); // Start (/Main): disk_status value + name badges, no per-row logos -> badges only, no logo card
    // ── Sichern & Übertragen: export/import of every cc-family localStorage setting.
    // Lives INSIDE the Theming card now (user call) — a label row + the two buttons.
    (function () {
      var cX = themingCard;
      var lblw = el("div", "cc-set-lbl cc-set-lblwrap");
      lblw.appendChild(el("span", null, T("Sichern & Übertragen", "Backup & transfer")));
      lblw.appendChild(infoIcon(T("Exportiert alle CC-Einstellungen (cc.*-Schlüssel) als JSON-Datei. Der Import schreibt sie zurück und lädt die Seite neu.", "Exports every CC setting (cc.* keys) as a JSON file. Import writes them back and reloads the page.")));
      cX.appendChild(lblw);
      var note = el("div", "cc-set-xnote"); // inline notice — this page has no toast mechanism
      function say(msg, bad) { note.textContent = msg || ""; note.style.color = bad ? "#d9433f" : ""; }
      var ex = el("span", "cc-btn cc-set-xbtn", T("Exportieren", "Export")); // grey fill + hover accent, md tier, no rings
      ex.addEventListener("click", function () {
        try {
          // collectUISettings = every cc-family key except cc.stateCache (same set the engine mirrors)
          var blob = new Blob([JSON.stringify(collectUISettings(), null, 2)], { type: "application/json" });
          var a = el("a"); a.href = URL.createObjectURL(blob); a.download = "cannonadecommand-settings.json";
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          say("");
        } catch (e) { say(T("Export fehlgeschlagen: ", "Export failed: ") + ((e && e.message) || e), true); }
      });
      var im = el("span", "cc-btn cc-set-xbtn", T("Importieren", "Import"));
      var fin = el("input"); fin.type = "file"; fin.accept = ".json,application/json"; fin.style.display = "none";
      fin.addEventListener("change", function () {
        var f = fin.files && fin.files[0]; fin.value = ""; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          var o = null;
          try { o = JSON.parse(String(rd.result)); } catch (e) { say(T("Keine gültige JSON-Datei.", "Not a valid JSON file."), true); return; }
          // must be a FLAT object of cc-family string keys (never cc.stateCache)
          var ks = o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o) : [];
          var bad = ks.filter(function (k) { return !/^cc[a-z]*\./.test(k) || k === "cc.stateCache" || typeof o[k] !== "string"; });
          if (!ks.length || bad.length) { say(T("Ungültiges Format: erwartet wird ein flaches Objekt mit cc.*-Textwerten.", "Invalid format: expected a flat object of cc.* string values."), true); return; }
          var w = window.__ccLS || localStorage.setItem.bind(localStorage); // raw write, no 800ms mirror debounce
          ks.forEach(function (k) { try { w(k, o[k]); } catch (e) {} });
          // push into the engine mirror BEFORE reloading — the reloaded page re-adopts
          // ui_settings from the engine, which would revert an unmirrored import.
          withConfigLock(function () {
            return api("GET", "config").then(function (c) {
              if (!c || typeof c !== "object") return;
              var u = c.ui_settings || {};
              ks.forEach(function (k) { u[k] = o[k]; });
              c.ui_settings = u;
              return api("PUT", "config", c);
            });
          }).then(function () { location.reload(); }, function () { location.reload(); });
        };
        rd.onerror = function () { say(T("Datei konnte nicht gelesen werden.", "Could not read the file."), true); };
        rd.readAsText(f);
      });
      im.addEventListener("click", function () { fin.click(); });
      // #26: NUKE reset — two-step, clears every cc.* key AND the engine mirror, then reloads to defaults.
      var rs = el("span", "cc-btn cc-set-xbtn cc-set-danger", T("Alles zurücksetzen", "Reset all"));
      rs.addEventListener("click", function () {
        if (rs.getAttribute("data-armed") !== "1") { rs.setAttribute("data-armed", "1"); rs.textContent = T("Wirklich? Nochmal klicken", "Sure? Click again"); setTimeout(function () { rs.setAttribute("data-armed", "0"); rs.textContent = T("Alles zurücksetzen", "Reset all"); }, 3500); return; }
        try {
          var kill = []; for (var i9 = 0; i9 < localStorage.length; i9++) { var k9 = localStorage.key(i9); if (k9 && /^cc[a-z]*\./.test(k9) && k9 !== "cc.stateCache") kill.push(k9); }
          kill.forEach(function (k9) { try { localStorage.removeItem(k9); } catch (e9) {} });
          withConfigLock(function () { return api("GET", "config").then(function (c) { if (!c || typeof c !== "object") return; c.ui_settings = {}; return api("PUT", "config", c); }); })
            .then(function () { location.reload(); }, function () { location.reload(); });
        } catch (e) { say(T("Zurücksetzen fehlgeschlagen: ", "Reset failed: ") + ((e && e.message) || e), true); }
      });
      var brow = el("div", "cc-set-row"); brow.appendChild(ex); brow.appendChild(im); brow.appendChild(rs);
      cX.appendChild(brow); cX.appendChild(fin); cX.appendChild(note); // rows land at the end of the Theming card
    })();
    refreshTabs();
    // cc.settab holds a stable section id ("general"/"header"/…). A legacy numeric index
    // or any unknown value migrates silently to 0 (Allgemein).
    var st0 = localStorage.getItem("cc.settab"), ix0 = 0;
    SECS.forEach(function (sc9, j9) { if (sc9.id === st0) ix0 = j9; });
    showSec(ix0);
    // #26: settings search — filters cards + rows across ALL tabs; empty query restores the tabbed view.
    (function () {
      function restore() {
        Array.prototype.forEach.call(root.querySelectorAll(".cc-set-card, .cc-set-row, .cc-set-lbl"), function (e9) { e9.style.removeProperty("display"); });
        tabRow.style.removeProperty("display");
        var st9 = localStorage.getItem("cc.settab"), ix9 = 0; SECS.forEach(function (sc9, j9) { if (sc9.id === st9) ix9 = j9; }); showSec(ix9);
      }
      function runFilter(q) {
        q = (q || "").trim().toLowerCase();
        if (!q) { restore(); return; }
        tabRow.style.setProperty("display", "none");
        SECS.forEach(function (sc9) { sc9.w.style.display = ""; });
        Array.prototype.forEach.call(root.querySelectorAll(".cc-set-card"), function (cardEl) {
          var h9 = cardEl.querySelector(".cc-set-h"); var titleHit = !!(h9 && (h9.textContent || "").toLowerCase().indexOf(q) >= 0), any = false;
          Array.prototype.forEach.call(cardEl.querySelectorAll(".cc-set-row, .cc-set-lbl"), function (r9) {
            var hit = titleHit || (r9.textContent || "").toLowerCase().indexOf(q) >= 0; r9.style.display = hit ? "" : "none"; if (hit) any = true;
          });
          cardEl.style.display = (titleHit || any) ? "" : "none";
        });
      }
      setSearch.addEventListener("input", function () { runFilter(setSearch.value); });
    })();
    paintPrev();
  }
  function saveNotify(btn) {
    btn.textContent = T("Speichere…", "Saving…"); btn.classList.add("cc-set-disabled");
    function reset(txt) { btn.textContent = txt; setTimeout(function () { btn.textContent = T("Speichern", "Save"); btn.classList.remove("cc-set-disabled"); }, 1800); }
    // Read-modify-write against the LIVE config: re-fetch it, change ONLY notify,
    // then write it back. This never touches schedules/watchdogs — including any set
    // in the Docker tab after this page loaded — and if the fresh read fails we
    // ABORT (no PUT), so a transient engine outage can never wipe the automation.
    withConfigLock(function () {
      return api("GET", "config").then(function (c) {
        if (!c || typeof c !== "object") throw new Error("config unreadable");
        c.notify = { unraid: !!notify.unraid, webhook: notify.webhook || "" };
        return api("PUT", "config", c).then(function () { fullConfig = c; reset(T("Gespeichert ✓", "Saved ✓")); });
      });
    }).catch(function () { reset(T("Fehler — Engine erreichbar?", "Error — engine reachable?")); });
  }
  // Persist ONLY the shaping interface, read-modify-write against the LIVE config so
  // notify + every container's schedules/watchdogs/bandwidths are preserved. Aborts
  // (no PUT) if the fresh read fails, and surfaces a validation error from the engine.
  function saveShape(btn) {
    btn.textContent = T("Speichere…", "Saving…"); btn.classList.add("cc-set-disabled");
    function reset(txt) { btn.textContent = txt; setTimeout(function () { btn.textContent = T("Speichern", "Save"); btn.classList.remove("cc-set-disabled"); }, 1800); }
    withConfigLock(function () {
      return api("GET", "config").then(function (c) {
        if (!c || typeof c !== "object") throw new Error("config unreadable");
        c.shape_iface = shapeIface || "";
        return api("PUT", "config", c).then(function () { fullConfig = c; reset(T("Gespeichert ✓", "Saved ✓")); });
      });
    }).catch(function (e) { reset(/bad shaping interface/.test(String(e && e.message)) ? T("Ungültige Schnittstelle", "Invalid interface") : T("Fehler — Engine erreichbar?", "Error — engine reachable?")); });
  }
  // dark text on light backgrounds, white on dark (perceived luminance)
  function idealText(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#fff"; var n = parseInt(m[1], 16); var L = 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255); return L > 150 ? "#161616" : "#fff"; }
  // preview uses the REAL rainbow palette (identical to docker.css) so it matches
  // what the Docker tab actually shows, with auto-contrast text.
  function paintPrev() { var p = document.getElementById("cc-set-prev"); if (!p) return; var DEF = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"]; var pal = DEF; try { var j = JSON.parse(get("cc.rbpal", "null")); if (j && j.length) pal = j; } catch (e) {} Array.prototype.slice.call(p.children).forEach(function (b, i) { var c = rainbow ? pal[i % pal.length] : accent; b.style.background = c; b.style.color = idealText(c); }); }
  // live-highlight the preset swatch that matches the current accent (no re-render)
  function syncSwOn() { var a = (accent || "").toLowerCase(); Array.prototype.slice.call(document.querySelectorAll("#cc-settings .cc-set-sw")).forEach(function (sw) { sw.classList.toggle("cc-set-sw-on", (sw.dataset.c || "").toLowerCase() === a); }); }
  function thc(t) { var e = el("th", null, t); return e; }
  function chkCell(key, v, color) { var td = el("td", "cc-set-chk"); var cb = el("input"); cb.type = "checkbox"; cb.checked = !!(colview[key] && colview[key][v]); if (rainbow && color) cb.style.accentColor = color; cb.addEventListener("change", function () { var cur = colview[key] || { s: true, a: true }; colview[key] = { s: cur.s, a: cur.a }; colview[key][v] = cb.checked; set("cc.colview2", JSON.stringify(colview)); }); td.appendChild(cb); return td; }
  function segRow(labelText, opts, cur, onChange, help) {
    var row = el("div", "cc-set-row"); var rl = el("span", "cc-set-rl", labelText); if (help) rl.appendChild(infoIcon(help)); row.appendChild(rl); var seg = el("div", "cc-seg");
    opts.forEach(function (o) {
      // <span> not <button> (Unraid's button CSS painted orange borders on these)
      var b = el("span", "cc-seg-btn" + (cur === o[0] ? " cc-seg-on" : "")); b.textContent = o[1];
      b.addEventListener("click", function () { onChange(o[0]); Array.prototype.slice.call(seg.children).forEach(function (x) { x.classList.remove("cc-seg-on"); }); b.classList.add("cc-seg-on"); });
      seg.appendChild(b);
    });
    row.appendChild(seg); return row;
  }
  // Native <select> styled as a CC control (no orange Unraid border). opts = [value, label, face?];
  // when a third element is given the option renders in that font-family (used by the font picker).
  function dropRow(labelText, opts, cur, onChange, help) {
    var row = el("div", "cc-set-row"); var rl = el("span", "cc-set-rl", labelText); if (help) rl.appendChild(infoIcon(help)); row.appendChild(rl);
    var sel = el("select", "cc-set-sel");
    opts.forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; if (o[0] === cur) op.selected = true; if (o[2]) op.style.fontFamily = o[2]; sel.appendChild(op); });
    sel.addEventListener("change", function () { onChange(sel.value); });
    row.appendChild(sel); return row;
  }
  // indent the WHOLE panel (logo/hero, tab strip AND cards) so it starts at the first
  // main-menu tab: --cc-align-left is stamped by header.js (fallback 15px). Padding the
  // root is idempotent — the root's border edge doesn't move with its own padding.
  function alignSetTabs() {
    try {
      var need = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cc-align-left")) || 15) - root.getBoundingClientRect().left;
      if (need > 0 && need < 60) root.style.paddingLeft = need + "px"; else root.style.paddingLeft = "";
    } catch (e) {}
  }
  var alignT = null; // ONE debounced resize listener for the page's lifetime (module scope, added once)
  window.addEventListener("resize", function () { clearTimeout(alignT); alignT = setTimeout(alignSetTabs, 150); });

  render();
  // Pull the engine-side config so the Notifications card reflects what is saved,
  // then re-render. Failure (engine down / older build) leaves the defaults shown.
  // If the user already started editing the card during the round-trip, keep their
  // edits (don't overwrite notify or re-render on top of them).
  api("GET", "config").then(function (c) {
    if (!c || typeof c !== "object") return; // leave Save disabled if unreadable
    fullConfig = { schedules: c.schedules || [], watchdogs: c.watchdogs || [], bandwidths: c.bandwidths || [], notify: c.notify || { unraid: false, webhook: "" }, shape_iface: c.shape_iface || "", ui_settings: c.ui_settings || undefined };
    configLoaded = true;
    adoptUISettings(c.ui_settings); // render() below shows the adopted values
    if (!c.ui_settings || !Object.keys(c.ui_settings).length) { var seed9 = collectUISettings(); if (Object.keys(seed9).length) { Object.keys(seed9).forEach(function (k9) { uiPending[k9] = 1; }); pushUISettings(); } } // seed the mirror
    // keep the user's in-flight edits if they already started typing; otherwise
    // adopt the loaded values. Either way re-render to enable Save.
    if (!notifyDirty) notify = { unraid: !!fullConfig.notify.unraid, webhook: fullConfig.notify.webhook || "" };
    if (!shapeDirty) shapeIface = fullConfig.shape_iface || "";
    render();
  }).catch(function () {});
})();
