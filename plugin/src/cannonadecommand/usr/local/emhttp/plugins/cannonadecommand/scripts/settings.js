/* CannonadeCommand settings page. Client-side only: renders a polished,
 * card-based form (ShipLog-style, Carbon dark) into #cc-settings and persists to
 * localStorage (cc.accent / cc.rainbow / cc.iconcolor / cc.iconstrength /
 * cc.density / cc.view / cc.colview). The Docker-tab enhancer reads the same keys
 * and reacts live via the storage event. */
(function () {
  "use strict";
  var root = document.getElementById("cc-settings");
  if (!root) return;
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
    c.appendChild(el("div", "cc-set-h", title)); if (sub) c.appendChild(el("div", "cc-set-sub", sub)); return c;
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
    root.classList.toggle("cc-rainbow", rainbow);
    root.style.setProperty("--cc-accent", accent);
    root.style.setProperty("--cc-accent-text", idealText(accent));

    var head = el("div", "cc-set-head");
    var hero = el("div", "cc-set-hero");
    var hleft = el("div", "cc-set-heroleft");
    var lg = el("img", "cc-set-logo"); lg.src = "/plugins/cannonadecommand/images/logo.svg"; lg.alt = "";
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
    var wrapMain = el("div", "cc-set-wrap");
    var adoptToggles = {}; // adopt-key → its toggle element (a colour pick flips it live); declared UP here (not further down) because the Docker area's styleToggle now runs early, with the moved global Badges card
    // MASTER THEMING switch (first, prominent). Off = keep ONLY the Docker orchestration
    // FUNCTIONS (start plan, dependencies, health-gate, watchdog, schedules, limits, bandwidth,
    // idle-stop) and disable ALL visual theming (badges, colours, rainbow, cards, and every
    // area's restyling). Defaults on, so existing installs are unchanged. render() on change
    // keeps the toggle in sync; the tabs pick it up via their storage listeners / on next load.
    (function () {
      var tc = card(T("Theming", "Theming"), T("Aus = nur die Docker-FUNKTIONEN von CannonadeCommand bleiben (Startplan, Abhängigkeiten, Health-Gate, Watchdog, Zeitpläne, Limits, Bandbreite, Auto-Stop bei Leerlauf). Das gesamte visuelle Theming — Badges, Farben, Rainbow, Karten und die Umgestaltung aller Tabs — wird abgeschaltet.", "Off = only CannonadeCommand's Docker FUNCTIONS remain (start plan, dependencies, health-gate, watchdog, schedules, limits, bandwidth, idle auto-stop). All visual theming — badges, colours, rainbow, cards and every tab's restyling — is turned off."));
      tc.appendChild(toggleRow(T("Theming aktiv", "Theming on"), localStorage.getItem("cc.theming") !== "0", function (v) { set("cc.theming", v ? "1" : "0"); render(); syncHeaderBar(); syncSharesBar(); }));
      wrapMain.appendChild(tc);
    })();
    // Bereiche: enable/disable each area CannonadeCommand enhances
    (function () {
      var c = card(T("Bereiche", "Areas"), T("Aktiviere, welche Bereiche CannonadeCommand verschönert. Ein deaktivierter Bereich blendet seinen Tab hier sofort aus.", "Choose which areas CannonadeCommand enhances. Disabling an area hides its tab here immediately."));
      [["cc.enable.main", T("Start", "Start"), "0"], ["cc.enable.header", T("Hauptmenüleiste", "Main menu bar"), "0"], ["cc.enable.shares", T("Freigaben", "Shares"), "0"], ["cc.enable.docker", T("Docker-Tab", "Docker tab"), "1"], ["cc.enable.plugins", T("Plugin-Tab", "Plugins tab"), "1"], ["cc.enable.vms", T("VM-Tab", "VMs tab"), "1"], ["cc.enable.settings", T("Einstellungen & Werkzeuge", "Settings & Tools"), "1"], ["cc.enable.favorites", T("Favoriten", "Favorites"), "1"]].forEach(function (a) {
        var row = el("div", "cc-set-row cc-set-inline");
        row.appendChild(el("span", null, a[1]));
        var cur = localStorage.getItem(a[0]);
        row.appendChild(toggle(cur == null ? a[2] !== "0" : cur !== "0", function (v) { localStorage.setItem(a[0], v ? "1" : "0"); refreshTabs(); }));
        c.appendChild(row);
      });
      wrapMain.appendChild(c);
    })();
    var SECS = [
      { t: T("Allgemein", "General"), w: wrapMain, key: null },
      { t: T("Start", "Start"), w: wrapStart, key: "cc.enable.main" },
      { t: T("Hauptmenüleiste", "Main menu bar"), w: wrapHeader, key: "cc.enable.header" },
      { t: T("Freigaben", "Shares"), w: wrapShares, key: "cc.enable.shares" },
      { t: T("Docker-Tab", "Docker tab"), w: wrap, key: "cc.enable.docker" },
      { t: T("Plugin-Tab", "Plugins tab"), w: wrapPlugin, key: "cc.enable.plugins" },
      { t: T("VM-Tab", "VMs tab"), w: wrapVms, key: "cc.enable.vms" },
      { t: T("Einstellungen & Werkzeuge", "Settings & Tools"), w: wrapSettings, key: "cc.enable.settings" },
      { t: T("Favoriten", "Favorites"), w: wrapFavorites, key: "cc.enable.favorites" }
    ];
    var tabBtns = [];
    function areaOn(key) { return !key || localStorage.getItem(key) !== "0"; }
    function showSec(i) {
      if (!SECS[i] || !areaOn(SECS[i].key)) i = 0; // never land on a hidden section
      localStorage.setItem("cc.settab", String(i));
      SECS.forEach(function (sc, j) { sc.w.style.display = j === i ? "" : "none"; tabBtns[j].classList.toggle("cc-set-tab-on", j === i); });
      paintSetTabs();
    }
    // rainbow: colour EVERY settings tab per palette index (was: only the accent-filled active tab, so
    // rainbow never reached the CC tab bar). palG() is the shared rainbow palette; idealText is hoisted.
    function paintSetTabs() {
      var rb = get("cc.rainbow", "0") === "1";
      // palG() is scoped inside buildStyleCards, not reachable here -> read the palette directly.
      var DEF = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"], p = DEF;
      try { var j = JSON.parse(get("cc.rbpal", "null")); if (j && j.length) p = j; } catch (e) {}
      tabBtns.forEach(function (b, i) {
        if (rb) { var c = p[i % p.length]; b.style.setProperty("background", c, "important"); b.style.setProperty("color", idealText(c), "important"); }
        else { b.style.removeProperty("background"); b.style.removeProperty("color"); }
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
    var pick = inlinePicker(/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#2f6feb", function (v) { accent = v; hexIn.value = v; set("cc.accent", v); root.style.setProperty("--cc-accent", v); root.style.setProperty("--cc-accent-text", idealText(v)); paintPrev(); syncSwOn(); syncHeaderBar(); syncSharesBar(); });
    function setAccent(v) { accent = v; pick._set(v); hexIn.value = v; set("cc.accent", accent); root.style.setProperty("--cc-accent", accent); root.style.setProperty("--cc-accent-text", idealText(accent)); paintPrev(); syncSwOn(); syncHeaderBar(); syncSharesBar(); }
    hexIn.addEventListener("input", function () { var v = normHex(hexIn.value); if (v) setAccent(v); });
    prow.appendChild(pick); prow.appendChild(hexIn); c1.appendChild(prow);
    // ...and the preset swatches sit BELOW it.
    var srow = el("div", "cc-set-swatches");
    PRESETS.forEach(function (c) {
      // a <span>, NOT a <button>: Unraid's global button CSS was bloating these into
      // big bordered rectangles. dataset.c lets syncSwOn highlight the active one.
      var sw = el("span", "cc-set-sw" + (c === accent ? " cc-set-sw-on" : "")); sw.title = c; sw.style.background = c; sw.dataset.c = c;
      sw.addEventListener("click", function () { accent = c; set("cc.accent", accent); render(); syncHeaderBar(); syncSharesBar(); });
      srow.appendChild(sw);
    });
    c1.appendChild(srow);
    // GLOBAL badge SHAPE (Form) — one control for every area, exactly like the global colour above
    // (writes the shared cc.badgeshape). The per-area cards no longer repeat it.
    c1.appendChild(segRow(T("Badge-Form", "Badge shape"), [["pill", "Pills"], ["rounded", T("abgerundet", "rounded")], ["square", T("eckig", "square")], ["circle", T("Kreise", "Circles")]], get("cc.badgeshape", "pill"), function (v) { set("cc.badgeshape", v); applyShape(); syncHeaderBar(); syncSharesBar(); }));
    // rainbow toggle: label + switch adjacent (no parenthetical, no far-right spacer)
    var rr = el("div", "cc-set-row cc-set-inline");
    rr.appendChild(el("span", null, T("Regenbogen-Modus", "Rainbow mode")));
    rr.appendChild(toggle(rainbow, function (v) { rainbow = v; set("cc.rainbow", v ? "1" : "0"); if (!v) set("cc.rainbowrot", "0"); render(); syncHeaderBar(); syncSharesBar(); }));
    c1.appendChild(rr);
    // rotation toggle: on = every tab reload deals a fresh colour mapping; off = stable colours
    var rrot = el("div", "cc-set-row cc-set-inline");
    var rrotL = el("span", "cc-set-lblwrap");
    rrotL.appendChild(el("span", null, T("Automatische Farbenrotation", "Automatic colour rotation")));
    rrotL.appendChild(infoIcon(T("Mischt die Rainbow-Farben bei jedem Neuladen der Seite neu durch, statt die Reihenfolge fest zu lassen.", "Reshuffles the rainbow colours on every page reload instead of keeping the order fixed.")));
    rrot.appendChild(rrotL);
    rrot.appendChild(toggle(get("cc.rainbowrot", "1") !== "0", function (v) { set("cc.rainbowrot", v ? "1" : "0"); syncHeaderBar(); syncSharesBar(); }));
    if (!rainbow) { rrot.style.opacity = ".4"; rrot.style.pointerEvents = "none"; } // only makes sense WITH rainbow
    c1.appendChild(rrot);
    // rainbow sub-mode: "active only" — idle badges go neutral grey, the ACTIVE one keeps its colour,
    // and any badge shows its colour on hover. Global like cc.rainbow; live-applied via the sync.
    var rmode = el("div", "cc-set-row cc-set-inline");
    var rmodeL = el("span", "cc-set-lblwrap");
    rmodeL.appendChild(el("span", null, T("Nur aktives Badge färben", "Colour only the active badge")));
    rmodeL.appendChild(infoIcon(T("Statt alle Badges einzufärben, bleiben sie neutral-grau; nur das aktive Badge zeigt Farbe, und jedes Badge wird bei Mausüber farbig. Gilt für die Hauptmenüleiste.", "Instead of colouring every badge, they stay neutral grey; only the active badge shows colour, and any badge colours on hover. Applies to the main menu bar.")));
    rmode.appendChild(rmodeL);
    rmode.appendChild(toggle(get("cc.rbmode", "all") === "active", function (v) { set("cc.rbmode", v ? "active" : "all"); syncHeaderBar(); syncSharesBar(); }));
    if (!rainbow) { rmode.style.opacity = ".4"; rmode.style.pointerEvents = "none"; } // only makes sense WITH rainbow
    c1.appendChild(rmode);
    // EVERY rainbow palette colour is editable: click a swatch, adjust it in the
    // embedded picker below; stored as cc.rbpal (JSON), read live by the Docker tab.
    var RBDEF = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"]; // real rainbow order
    var rbpal = null; try { rbpal = JSON.parse(get("cc.rbpal", "null")); } catch (e) { rbpal = null; }
    if (!rbpal || rbpal.length !== RBDEF.length) rbpal = RBDEF.slice();
    c1.appendChild(el("div", "cc-set-lbl", T("Rainbow-Farben (Feld anklicken zum Anpassen)", "Rainbow colours (click a field to adjust)")));
    var rbrow = el("div", "cc-set-swatches");
    var rbPick = null, rbIdx = -1, rbPickWrap = el("div", "cc-set-pickrow"); rbPickWrap.style.display = "none";
    rbpal.forEach(function (cx, ix) {
      var sw = el("span", "cc-set-sw"); sw.style.background = cx; sw.title = cx;
      sw.addEventListener("click", function () {
        rbIdx = ix; rbPickWrap.style.display = "";
        if (!rbPick) {
          rbPick = inlinePicker(rbpal[ix], function (v) { if (rbIdx >= 0) { rbpal[rbIdx] = v; rbrow.children[rbIdx].style.background = v; rbrow.children[rbIdx].title = v; set("cc.rbpal", JSON.stringify(rbpal)); syncHeaderBar(); syncSharesBar(); } });
          rbPickWrap.appendChild(rbPick);
        } else rbPick._set(rbpal[ix]);
      });
      rbrow.appendChild(sw);
    });
    var rbReset = el("span", "cc-btn cc-btn-sm", T("Farben zurücksetzen", "Reset colours"));
    rbReset.addEventListener("click", function () { del("cc.rbpal"); render(); syncHeaderBar(); syncSharesBar(); });
    c1.appendChild(rbrow); c1.appendChild(rbPickWrap); c1.appendChild(rbReset);
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
    c2.appendChild(toggleRow(T("Hintergrund", "Background"), iconbg, function (v) { set("cc.iconbg", v ? "1" : "0"); applyBgMode(v); }));
    var ihexIn = el("input", "cc-set-hexin"); ihexIn.type = "text"; ihexIn.value = iconcolor || ""; ihexIn.placeholder = "#1f9d55"; ihexIn.maxLength = 7; ihexIn.spellcheck = false;
    var ipick = inlinePicker(/^#[0-9a-f]{6}$/i.test(iconcolor) ? iconcolor : (/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#1f9d55"), function (v) { iconcolor = v; ihexIn.value = v; set("cc.iconcolor", v); syncIconTog(); });
    // A real ON/OFF toggle drives the tint (empty cc.iconcolor = off). The picker/hex
    // set WHICH colour; changing either also switches the tint on.
    function iconOn() { return !!iconcolor; }
    var iconTog = el("span", "cc-set-toggle" + (iconOn() ? " cc-set-toggle-on" : "")); iconTog.setAttribute("role", "switch"); iconTog.setAttribute("tabindex", "0"); iconTog.setAttribute("aria-checked", iconOn() ? "true" : "false"); iconTog.appendChild(el("span", "cc-set-knob"));
    function syncIconTog() { var on = iconOn(); iconTog.classList.toggle("cc-set-toggle-on", on); iconTog.setAttribute("aria-checked", on ? "true" : "false"); try { tintPrev(); } catch (e9) {} }
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
    sl.addEventListener("input", function () { iconstrength = parseInt(sl.value, 10); set("cc.iconstrength", sl.value); try { tintPrev(); } catch (e9) {} });
    strow.appendChild(sl);
    c2.appendChild(strow);
    // (the VM-icons toggle is obsolete — the VM tab has its own style section)
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
        tprevImgs.forEach(function (im9) { im9.style.filter = "url(#cc-set-mono)"; im9.style.background = ""; im9.style.borderRadius = "8px"; im9.style.padding = "6px"; });
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

    // ── View + density ──
    var c4 = card(T("Ansicht", "View"), null);
    c4.appendChild(segRow(T("Standard-Ansicht", "Default view"), [["list", T("Liste", "List")], ["grid", T("Raster", "Grid")]], view, function (v) { view = v; set("cc.view", v); }));
    c4.appendChild(segRow(T("Zeilenhöhe", "Row density"), [["compact", T("kompakt", "compact")], ["normal", "normal"], ["airy", T("luftig", "airy")]], density, function (v) { density = v; set("cc.density", v); }));
    function applyShape() { var m9 = { pill: "999px", rounded: "6px", square: "0px", circle: "999px" }; var sh9 = get("cc.badgeshape", "pill"); var r9 = m9[sh9] || "999px"; root.style.setProperty("--cc-b-radius", r9); document.documentElement.style.setProperty("--cc-b-radius", r9); document.documentElement.classList.toggle("cc-shape-circle", sh9 === "circle"); }
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
        if (onChange) onChange(); syncHeaderBar(); syncSharesBar();
      });
      adoptToggles[key] = tg; row.appendChild(tg);
      return row;
    }
    var cP = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cP.appendChild(styleToggle("cc.styleplugin", null));
    // per-tab style controls — the SAME set as the Docker tab, active while the
    // adopt-toggle above is OFF (own key prefix per tab)
    // The Plugin/VM sections carry EXACTLY the Docker tab's style cards (same
    // picker, swatches, rainbow palette, tint toggle + strength) on their own
    // key prefix; they apply while "Adopt the Docker-tab style" is OFF.
    function buildStyleCards(P, into, samples, noLogos) {
      var acc = get(P + "accent", "#2f6feb"), icol = get(P + "iconcolor", ""), istr = parseInt(get(P + "iconstrength", "100"), 10) || 100;
      // Picking a colour in an area's card means "this area uses its OWN style" — so turn its
      // adopt toggle OFF (else eff() keeps reading the global cc.* accent and the pick is
      // ignored, the "colour not applied to the menu" bug). Reflected live on the toggle +
      // the real header bar. Turn adopt back ON to re-follow the global Docker accent.
      var ADOPT = { "ccd.": "cc.styledocker", "ccp.": "cc.styleplugin", "ccv.": "cc.stylevms", "cch.": "cc.styleheader", "ccs.": "cc.stylesettings", "ccsh.": "cc.styleshares", "ccf.": "cc.stylefavorites", "ccm.": "cc.stylemain" };
      var adoptKey = ADOPT[P];
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
        var sw = el("span", "cc-set-sw" + (c === acc ? " cc-set-sw-on" : "")); sw.title = c; sw.style.background = c;
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
      into.appendChild(cA);
      // Badge-Form (shape) is now a single GLOBAL control in the Allgemein "Badges" card, so it is
      // no longer repeated per area here.
      var cB = card(T("Logos", "Logos"), T("Der Schalter aktiviert die Färbung.", "The switch turns the tint on."));
      var ibg = get(P + "iconbg", P === "ccs." ? "1" : "0") === "1";
      function applyBg2(v) { ibg = v; cB.classList.toggle("cc-bg-mode", v); st2.style.opacity = v ? ".4" : ""; st2.style.pointerEvents = v ? "none" : ""; tpw.classList.toggle("cc-prev-bg", v); try { tp(); } catch (e9) {} }
      cB.appendChild(toggleRow(T("Hintergrund", "Background"), ibg, function (v) { set(P + "iconbg", v ? "1" : "0"); applyBg2(v); }));
      var ihx = el("input", "cc-set-hexin"); ihx.type = "text"; ihx.value = icol || ""; ihx.placeholder = "#1f9d55"; ihx.maxLength = 7; ihx.spellcheck = false;
      var ipk = inlinePicker(/^#[0-9a-f]{6}$/i.test(icol) ? icol : "#1f9d55", function (v) { icol = v; ihx.value = v; set(P + "iconcolor", v); sy(); });
      function on2() { return !!icol; }
      var tg2 = el("span", "cc-set-toggle" + (on2() ? " cc-set-toggle-on" : "")); tg2.setAttribute("role", "switch"); tg2.setAttribute("tabindex", "0"); tg2.appendChild(el("span", "cc-set-knob"));
      function sy() { tg2.classList.toggle("cc-set-toggle-on", on2()); tg2.setAttribute("aria-checked", on2() ? "true" : "false"); try { tp(); } catch (e9) {} }
      tg2.addEventListener("click", function () { if (on2()) { icol = ""; del(P + "iconcolor"); ihx.value = ""; } else { icol = ipk._get(); ihx.value = icol; set(P + "iconcolor", icol); } sy(); });
      ihx.addEventListener("input", function () { var v = normHex(ihx.value); if (v) { icol = v; ipk._set(v); set(P + "iconcolor", v); sy(); } });
      var ir2 = el("div", "cc-set-pickrow"); ir2.appendChild(ipk); ir2.appendChild(ihx); cB.appendChild(ir2);
      var tr2 = el("div", "cc-set-row cc-set-inline"); tr2.appendChild(el("span", null, T("Einfärben", "Colourise"))); tr2.appendChild(tg2); cB.appendChild(tr2);
      var st2 = el("div", "cc-set-row"); st2.appendChild(el("span", "cc-set-rl", T("Intensität", "Strength")));
      var sl2 = el("input"); sl2.type = "range"; sl2.min = "10"; sl2.max = "100"; sl2.value = String(istr); sl2.style.flex = "1";
      sl2.addEventListener("input", function () { set(P + "iconstrength", sl2.value); try { tp(); } catch (e9) {} });
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
          tpImgs.forEach(function (im9) { im9.style.filter = "url(#" + mid8 + ")"; im9.style.background = ""; im9.style.borderRadius = "8px"; im9.style.padding = "6px"; });
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
      if (!noLogos) into.appendChild(cB); // header tab: badges only, no logo card
    }
    // the adopt "Stil" card is the FIRST card of every section (user call), then
    // the Badges/Logos cards. Same cards for the Hauptmenueleiste as Plugins/VMs.
    var cV = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cV.appendChild(styleToggle("cc.stylevms", null));
    var cH = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cH.appendChild(styleToggle("cc.styleheader", null));
    var cSh = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cSh.appendChild(styleToggle("cc.styleshares", null));
    var cSet = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cSet.appendChild(styleToggle("cc.stylesettings", null));
    var cFav = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cFav.appendChild(styleToggle("cc.stylefavorites", null));
    var cStart = card(T("Stil", "Style"), T("AN = die globale Badge-Farbe (Allgemein) gilt auch hier. AUS = die eigene Farbe dieses Abschnitts gilt.", "ON = the global badge colour (General) applies here too. OFF = this section's own colour applies."));
    cStart.appendChild(styleToggle("cc.stylemain", null));
    wrapHeader.appendChild(cH); wrapShares.appendChild(cSh); wrapPlugin.appendChild(cP); wrapVms.appendChild(cV); wrapSettings.appendChild(cSet); wrapFavorites.appendChild(cFav); wrapStart.appendChild(cStart);
    // per-area "Tab-Ansicht" toggle: native Unraid sub-tabs (default) vs stacked CC sections. Persists
    // cc.sections.<area> (default "0" = native sub-tabs; the user opts INTO stacking per tab). Shown ONLY
    // in areas that actually HAVE sub-tabs to flatten: Freigaben (/Shares/Share), Start (/Main), Plugin
    // (/Plugins) and VM (/VMs). Live re-apply via each area's same-page hook.
    function sectionsToggleRow(area, applyFn) {
      return toggleRow(T("Unterreiter als Abschnitte stapeln", "Stack sub-tabs as sections"), get("cc.sections." + area, "0") !== "0", function (v) { set("cc.sections." + area, v ? "1" : "0"); if (applyFn) applyFn(); });
    }
    function sectionsCard(area, applyFn) {
      var c = card(T("Tab-Ansicht", "Tab view"), T("AN = Unterreiter als CC-Abschnitte untereinander. AUS = native Unraid-Unterreiter (Standard).", "ON = sub-tabs stacked as CC sections. OFF = native Unraid sub-tabs (default)."));
      c.appendChild(sectionsToggleRow(area, applyFn));
      return c;
    }
    function syncPluginsBar() { try { if (typeof window.ccPluginsApply === "function") window.ccPluginsApply(); } catch (e) {} }
    function syncVmsBar() { try { if (typeof window.ccVmsApply === "function") window.ccVmsApply(); } catch (e) {} }
    wrapShares.appendChild(sectionsCard("shares", syncSharesBar));
    wrapStart.appendChild(sectionsCard("main", syncSharesBar));
    wrapPlugin.appendChild(sectionsCard("plugins", syncPluginsBar));
    wrapVms.appendChild(sectionsCard("vms", syncVmsBar));
    buildStyleCards("cch.", wrapHeader, [], true); // Hauptmenueleiste: pill/badge settings only
    buildStyleCards("ccsh.", wrapShares, [], true); // Freigaben: tab pills use FA glyphs -> badges only, no logo card
    buildStyleCards("ccs.", wrapSettings, ["fa-cog", "fa-globe", "fa-star"], false); // Einstellungs-Tab: badges + logo-tint + Logo-Hintergrund cards; the tiles use FA glyphs, so the preview shows sample glyphs (cog/globe/star = System/Network/User category icons), coloured via CSS not the raster filter
    buildStyleCards("ccp.", wrapPlugin, ["/plugins/dynamix.plugin.manager/images/dynamix.plugin.manager.png", "/plugins/dynamix.docker.manager/images/dynamix.docker.manager.png", "/plugins/cannonadecommand/images/cannonadecommand.png"]);
    buildStyleCards("ccv.", wrapVms, ["/plugins/dynamix.vm.manager/templates/images/linux.png", "/plugins/dynamix.vm.manager/templates/images/windows.png", "/plugins/cannonadecommand/images/cannonadecommand.png"]);
    buildStyleCards("ccf.", wrapFavorites, ["fa-star", "fa-heart", "fa-cog"], false); // Favoriten: tiles use FA glyphs -> preview shows sample glyphs coloured via CSS (like the Settings card)
    buildStyleCards("ccm.", wrapStart, [], true); // Start (/Main): disk_status value + name badges, no per-row logos -> badges only, no logo card
    refreshTabs();
    showSec(parseInt(localStorage.getItem("cc.settab") || "0", 10) || 0);
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
  function segRow(labelText, opts, cur, onChange) {
    var row = el("div", "cc-set-row"); row.appendChild(el("span", "cc-set-rl", labelText)); var seg = el("div", "cc-seg");
    opts.forEach(function (o) {
      // <span> not <button> (Unraid's button CSS painted orange borders on these)
      var b = el("span", "cc-seg-btn" + (cur === o[0] ? " cc-seg-on" : "")); b.textContent = o[1];
      b.addEventListener("click", function () { onChange(o[0]); Array.prototype.slice.call(seg.children).forEach(function (x) { x.classList.remove("cc-seg-on"); }); b.classList.add("cc-seg-on"); });
      seg.appendChild(b);
    });
    row.appendChild(seg); return row;
  }

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
