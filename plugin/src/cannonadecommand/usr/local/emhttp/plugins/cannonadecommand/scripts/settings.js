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
    { key: "net", label: T("Netzwerk / IP / Port", "Network / IP / Port") },
    { key: "res", label: T("CPU / RAM", "CPU / RAM") },
    { key: "id", label: T("Container-ID", "Container ID") },
    { key: "von", label: T("Von / Quelle", "From / source") },
    { key: "vol", label: T("Volumes", "Volumes") },
    { key: "plan", label: T("Startplan", "Plan") },
  ];
  var PRESETS = ["#2f6feb", "#1f9d55", "#ff8c2f", "#8b5cf6", "#e0912a", "#d9433f", "#0ea5a4", "#e05299", "#525252"];
  // rainbow-mode colour per column (same order as COLS): the matrix checkboxes take
  // these when rainbow mode is on, so the settings echo the Docker-tab badge colours.
  var RB = ["#1f9d55", "#2f6feb", "#6b7280", "#8b5cf6", "#d9433f", "#0ea5a4", "#e05299", "#0891b2", "#6366f1"];

  function defColview() { var adv = { s: false, a: true }, both = { s: true, a: true }; return { update: both, force: adv, version: adv, net: both, res: both, id: adv, von: adv, vol: adv, plan: both }; }
  function get(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function loadColview() { try { var j = JSON.parse(localStorage.getItem("cc.colview") || "null"); if (j && typeof j === "object") { var d = defColview(); Object.keys(d).forEach(function (k) { if (j[k]) d[k] = { s: !!j[k].s, a: !!j[k].a }; }); return d; } } catch (e) {} return defColview(); }

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
        try { if (/^cc[pv]?\./.test(String(k)) && k !== "cc.stateCache") { uiPending[k] = 1; clearTimeout(uiSyncT); uiSyncT = setTimeout(pushUISettings, 800); } } catch (e) {}
      };
    } catch (e) {}
  })();
  function collectUISettings() { var o = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && /^cc[pv]?\./.test(k) && k !== "cc.stateCache") o[k] = localStorage.getItem(k); } return o; }
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
    try { Object.keys(u || {}).forEach(function (k) { if (/^cc[pv]?\./.test(k) && localStorage.getItem(k) !== u[k]) { (window.__ccLS || localStorage.setItem.bind(localStorage))(k, u[k]); changed = true; } }); } catch (e) {}
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
  // normalise a typed hex ("2f6feb" / "#2F6FEB") to "#rrggbb", or "" if invalid.
  function normHex(s) { var v = String(s || "").trim(); if (/^[0-9a-f]{6}$/i.test(v)) v = "#" + v; return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : ""; }

  // a badge-styled on/off toggle. A <span> (NOT a <button>): Unraid's global button
  // CSS was painting an orange border and limiting the knob travel to mid-way.
  function toggle(on, onChange) {
    var t = el("span", "cc-set-toggle" + (on ? " cc-set-toggle-on" : ""));
    t.setAttribute("role", "switch"); t.setAttribute("tabindex", "0"); t.setAttribute("aria-checked", on ? "true" : "false");
    t.appendChild(el("span", "cc-set-knob"));
    function flip() { on = !on; t.classList.toggle("cc-set-toggle-on", on); t.setAttribute("aria-checked", on ? "true" : "false"); onChange(on); }
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
    var wrapPlugin = el("div", "cc-set-wrap"), wrapVms = el("div", "cc-set-wrap"), wrapHeader = el("div", "cc-set-wrap");
    var wrapSettings = el("div", "cc-set-wrap");
    var wrapMain = el("div", "cc-set-wrap");
    // Bereiche: enable/disable each area CannonadeCommand enhances
    (function () {
      var c = card(T("Bereiche", "Areas"), T("Aktiviere, welche Bereiche CannonadeCommand verschönert. Ein deaktivierter Bereich blendet seinen Tab hier sofort aus.", "Choose which areas CannonadeCommand enhances. Disabling an area hides its tab here immediately."));
      [["cc.enable.header", T("Hauptmenüleiste", "Main menu bar"), "0"], ["cc.enable.docker", T("Docker-Tab", "Docker tab"), "1"], ["cc.enable.plugins", T("Plugin-Tab", "Plugins tab"), "1"], ["cc.enable.vms", T("VM-Tab", "VMs tab"), "1"], ["cc.enable.settings", T("Einstellungs-Tab", "Settings tab"), "1"]].forEach(function (a) {
        var row = el("div", "cc-set-row cc-set-inline");
        row.appendChild(el("span", null, a[1]));
        var cur = localStorage.getItem(a[0]);
        row.appendChild(toggle(cur == null ? a[2] !== "0" : cur !== "0", function (v) { localStorage.setItem(a[0], v ? "1" : "0"); refreshTabs(); }));
        c.appendChild(row);
      });
      wrapMain.appendChild(c);
    })();
    var SECS = [
      { t: T("Bereiche", "Areas"), w: wrapMain, key: null },
      { t: T("Hauptmenüleiste", "Main menu bar"), w: wrapHeader, key: "cc.enable.header" },
      { t: T("Docker-Tab", "Docker tab"), w: wrap, key: "cc.enable.docker" },
      { t: T("Plugin-Tab", "Plugins tab"), w: wrapPlugin, key: "cc.enable.plugins" },
      { t: T("VM-Tab", "VMs tab"), w: wrapVms, key: "cc.enable.vms" },
      { t: T("Einstellungs-Tab", "Settings tab"), w: wrapSettings, key: "cc.enable.settings" }
    ];
    var tabBtns = [];
    function areaOn(key) { return !key || localStorage.getItem(key) !== "0"; }
    function showSec(i) {
      if (!SECS[i] || !areaOn(SECS[i].key)) i = 0; // never land on a hidden section
      localStorage.setItem("cc.settab", String(i));
      SECS.forEach(function (sc, j) { sc.w.style.display = j === i ? "" : "none"; tabBtns[j].classList.toggle("cc-set-tab-on", j === i); });
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
    root.appendChild(wrapMain); root.appendChild(wrapHeader); root.appendChild(wrap); root.appendChild(wrapPlugin); root.appendChild(wrapVms); root.appendChild(wrapSettings);

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
    var pick = inlinePicker(/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#2f6feb", function (v) { accent = v; hexIn.value = v; set("cc.accent", v); root.style.setProperty("--cc-accent", v); root.style.setProperty("--cc-accent-text", idealText(v)); paintPrev(); syncSwOn(); });
    function setAccent(v) { accent = v; pick._set(v); hexIn.value = v; set("cc.accent", accent); root.style.setProperty("--cc-accent", accent); root.style.setProperty("--cc-accent-text", idealText(accent)); paintPrev(); syncSwOn(); }
    hexIn.addEventListener("input", function () { var v = normHex(hexIn.value); if (v) setAccent(v); });
    prow.appendChild(pick); prow.appendChild(hexIn); c1.appendChild(prow);
    // ...and the preset swatches sit BELOW it.
    var srow = el("div", "cc-set-swatches");
    PRESETS.forEach(function (c) {
      // a <span>, NOT a <button>: Unraid's global button CSS was bloating these into
      // big bordered rectangles. dataset.c lets syncSwOn highlight the active one.
      var sw = el("span", "cc-set-sw" + (c === accent ? " cc-set-sw-on" : "")); sw.title = c; sw.style.background = c; sw.dataset.c = c;
      sw.addEventListener("click", function () { accent = c; set("cc.accent", accent); render(); });
      srow.appendChild(sw);
    });
    c1.appendChild(srow);
    // rainbow toggle: label + switch adjacent (no parenthetical, no far-right spacer)
    var rr = el("div", "cc-set-row cc-set-inline");
    rr.appendChild(el("span", null, T("Regenbogen-Modus", "Rainbow mode")));
    rr.appendChild(toggle(rainbow, function (v) { rainbow = v; set("cc.rainbow", v ? "1" : "0"); if (!v) set("cc.rainbowrot", "0"); render(); }));
    c1.appendChild(rr);
    // rotation toggle: on = every tab reload deals a fresh colour mapping; off = stable colours
    var rrot = el("div", "cc-set-row cc-set-inline");
    rrot.appendChild(el("span", null, T("Automatische Farbenrotation", "Automatic colour rotation")));
    rrot.appendChild(toggle(get("cc.rainbowrot", "1") !== "0", function (v) { set("cc.rainbowrot", v ? "1" : "0"); }));
    if (!rainbow) { rrot.style.opacity = ".4"; rrot.style.pointerEvents = "none"; } // only makes sense WITH rainbow
    c1.appendChild(rrot);
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
          rbPick = inlinePicker(rbpal[ix], function (v) { if (rbIdx >= 0) { rbpal[rbIdx] = v; rbrow.children[rbIdx].style.background = v; rbrow.children[rbIdx].title = v; set("cc.rbpal", JSON.stringify(rbpal)); } });
          rbPickWrap.appendChild(rbPick);
        } else rbPick._set(rbpal[ix]);
      });
      rbrow.appendChild(sw);
    });
    var rbReset = el("span", "cc-btn cc-btn-sm", T("Farben zurücksetzen", "Reset colours"));
    rbReset.addEventListener("click", function () { del("cc.rbpal"); render(); });
    c1.appendChild(rbrow); c1.appendChild(rbPickWrap); c1.appendChild(rbReset);
    c1.appendChild(el("div", "cc-set-lbl", T("Vorschau", "Preview")));
    var prev = el("div", "cc-set-prev");
    var pvKinds = { net: ["Netzwerk", "br0.20"], ip: ["IP", "192.168.20.11"], lan: ["LAN", "192.168.20.11"], port: ["Port", "all"], cpu: ["CPU", "2/8"], ram: ["RAM", "4G"], bw: ["BW", "10 MB/s"], plan: ["Start", "#3"] };
    Object.keys(pvKinds).forEach(function (k) { var b = el("span", "cc-b cc-b-" + k); b.appendChild(elk(pvKinds[k][0])); b.appendChild(elv(pvKinds[k][1])); prev.appendChild(b); });
    prev.id = "cc-set-prev"; c1.appendChild(prev);
    wrap.appendChild(c1);

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
      if (iconbg) { var bg8 = /^#[0-9a-f]{6}$/i.test(iconcolor) ? iconcolor : accent; tprevImgs.forEach(function (im9) { im9.style.filter = "grayscale(1) brightness(0) invert(1)"; im9.style.background = bg8; im9.style.borderRadius = "8px"; im9.style.padding = "6px"; }); return; }
      var hx9 = /^#?([0-9a-f]{6})$/i.exec(iconcolor || "");
      if (!hx9) { tprevImgs.forEach(function (im9) { im9.style.filter = "none"; im9.style.background = ""; im9.style.padding = ""; }); return; }
      var n9 = parseInt(hx9[1], 16), r9 = (n9 >> 16 & 255) / 255, g9 = (n9 >> 8 & 255) / 255, b9 = (n9 & 255) / 255;
      var st9 = Math.max(10, iconstrength || 100) / 100, i9 = 1 - st9;
      function row9(c9, ix9) { var v9 = [0.2126 * c9 * st9, 0.7152 * c9 * st9, 0.0722 * c9 * st9, 0, 0]; v9[ix9] += i9; return v9.join(" "); }
      var host9 = document.getElementById("cc-set-tintsvg");
      if (!host9) { host9 = document.createElement("div"); host9.id = "cc-set-tintsvg"; host9.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(host9); }
      host9.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="cc-set-tint" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values="' + row9(r9, 0) + " " + row9(g9, 1) + " " + row9(b9, 2) + ' 0 0 0 1 0"/></filter></svg>';
      tprevImgs.forEach(function (im9) { im9.style.filter = "url(#cc-set-tint)"; im9.style.background = ""; im9.style.padding = ""; });
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
    function applyShape() { var m9 = { pill: "999px", rounded: "6px", square: "0px" }; var r9 = m9[get("cc.badgeshape", "pill")] || "999px"; root.style.setProperty("--cc-b-radius", r9); document.documentElement.style.setProperty("--cc-b-radius", r9); }
    wrap.appendChild(c4);
    // Badge-Form as its OWN card (kept identical across every section)
    var c4b = card(T("Badge-Form", "Badge shape"), T("Form der Badges: Pills, abgerundet oder eckig.", "Badge shape: pills, rounded or square."));
    c4b.appendChild(segRow(T("Badge-Form", "Badge shape"), [["pill", "Pills"], ["rounded", T("abgerundet", "rounded")], ["square", T("eckig", "square")]], get("cc.badgeshape", "pill"), function (v) { set("cc.badgeshape", v); applyShape(); }));
    applyShape();
    wrap.appendChild(c4b);

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

    // ── Plugin-Tab / VM-Tab sections: adopt the Docker-tab style there too? ──
    function styleToggle(key, onChange, lbl) {
      // the SAME knob switch as everywhere else (the text-in-pill variant looked wrong)
      var row = el("div", "cc-set-row cc-set-inline");
      row.appendChild(el("span", null, lbl || T("Docker-Tab-Stil übernehmen", "Adopt the Docker-tab style")));
      row.appendChild(toggle(localStorage.getItem(key) !== "0", function (v) { localStorage.setItem(key, v ? "1" : "0"); if (onChange) onChange(); }));
      return row;
    }
    var cP = card(T("Stil", "Style"), T("AN = die Docker-Tab-Einstellungen gelten auch hier. AUS = die eigenen Karten dieses Abschnitts gelten.", "ON = the Docker-tab settings apply here too. OFF = this section's own cards apply."));
    cP.appendChild(styleToggle("cc.styleplugin", null));
    // per-tab style controls — the SAME set as the Docker tab, active while the
    // adopt-toggle above is OFF (own key prefix per tab)
    // The Plugin/VM sections carry EXACTLY the Docker tab's style cards (same
    // picker, swatches, rainbow palette, tint toggle + strength) on their own
    // key prefix; they apply while "Adopt the Docker-tab style" is OFF.
    function buildStyleCards(P, into, samples, noLogos) {
      var acc = get(P + "accent", "#2f6feb"), icol = get(P + "iconcolor", ""), istr = parseInt(get(P + "iconstrength", "100"), 10) || 100;
      var cA = card(T("Badges", "Badges"), T("Akzentfarbe und Farbmodus der Badges.", "Accent colour and colour mode of the badges."));
      var pr = el("div", "cc-set-pickrow");
      var hx = el("input", "cc-set-hexin"); hx.type = "text"; hx.value = acc; hx.placeholder = "#2f6feb"; hx.maxLength = 7; hx.spellcheck = false;
      var pk = inlinePicker(/^#[0-9a-f]{6}$/i.test(acc) ? acc : "#2f6feb", function (v) { acc = v; hx.value = v; set(P + "accent", v); paintPv(); });
      hx.addEventListener("input", function () { var v = normHex(hx.value); if (v) { acc = v; pk._set(v); set(P + "accent", v); paintPv(); } });
      pr.appendChild(pk); pr.appendChild(hx); cA.appendChild(pr);
      var sr = el("div", "cc-set-swatches");
      PRESETS.forEach(function (c) {
        var sw = el("span", "cc-set-sw" + (c === acc ? " cc-set-sw-on" : "")); sw.title = c; sw.style.background = c;
        sw.addEventListener("click", function () { acc = c; pk._set(c); hx.value = c; set(P + "accent", c); paintPv(); });
        sr.appendChild(sw);
      });
      cA.appendChild(sr);
      var rr2 = el("div", "cc-set-row cc-set-inline");
      rr2.appendChild(el("span", null, T("Regenbogen-Modus", "Rainbow mode")));
      rr2.appendChild(toggle(get(P + "rainbow", "0") === "1", function (v) { set(P + "rainbow", v ? "1" : "0"); paintPv(); }));
      cA.appendChild(rr2);
      var RB2 = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"];
      var pal2 = null; try { pal2 = JSON.parse(get(P + "rbpal", "null")); } catch (e2) { pal2 = null; }
      if (!pal2 || pal2.length !== RB2.length) pal2 = RB2.slice();
      cA.appendChild(el("div", "cc-set-lbl", T("Rainbow-Farben (Feld anklicken zum Anpassen)", "Rainbow colours (click a field to adjust)")));
      var rw = el("div", "cc-set-swatches"), rp = null, ri = -1, rpw = el("div", "cc-set-pickrow"); rpw.style.display = "none";
      pal2.forEach(function (cx2, ix2) {
        var sw2 = el("span", "cc-set-sw"); sw2.style.background = cx2; sw2.title = cx2;
        sw2.addEventListener("click", function () {
          ri = ix2; rpw.style.display = "";
          if (!rp) { rp = inlinePicker(pal2[ix2], function (v) { if (ri >= 0) { pal2[ri] = v; rw.children[ri].style.background = v; rw.children[ri].title = v; set(P + "rbpal", JSON.stringify(pal2)); paintPv(); } }); rpw.appendChild(rp); }
          else rp._set(pal2[ix2]);
        });
        rw.appendChild(sw2);
      });
      var rs = el("span", "cc-btn cc-btn-sm", T("Farben zurücksetzen", "Reset colours"));
      rs.addEventListener("click", function () { del(P + "rbpal"); render(); });
      cA.appendChild(rw); cA.appendChild(rpw); cA.appendChild(rs);
      // live badge preview, exactly like the Docker section
      cA.appendChild(el("div", "cc-set-lbl", T("Vorschau", "Preview")));
      var pv = el("div", "cc-set-prev");
      var pvBadges = [["Netzwerk", "br0.20"], ["IP", "192.168.20.11"], ["LAN", "192.168.20.11"], ["Port", "all"], ["CPU", "2/8"], ["RAM", "4G"], ["BW", "10 MB/s"], ["Start", "#3"]].map(function (d9) {
        var b9 = el("span", "cc-b"); b9.appendChild(el("span", "cc-b-k", d9[0])); b9.appendChild(el("span", "cc-b-v", d9[1])); pv.appendChild(b9); return b9;
      });
      function paintPv() {
        var rbOn9 = get(P + "rainbow", "0") === "1";
        pvBadges.forEach(function (b9, i9) {
          var col9 = rbOn9 ? pal2[i9 % pal2.length] : acc;
          b9.style.setProperty("background", col9, "important");
          b9.style.setProperty("color", idealText(col9), "important");
        });
      }
      paintPv();
      cA.appendChild(pv);
      into.appendChild(cA);
      // Badge-Form as its own card (same as the Docker section, for consistency)
      var cS = card(T("Badge-Form", "Badge shape"), T("Form der Badges: Pills, abgerundet oder eckig.", "Badge shape: pills, rounded or square."));
      cS.appendChild(segRow(T("Badge-Form", "Badge shape"), [["pill", "Pills"], ["rounded", T("abgerundet", "rounded")], ["square", T("eckig", "square")]], get("cc.badgeshape", "pill"), function (v) { set("cc.badgeshape", v); applyShape(); }));
      into.appendChild(cS);
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
      var tpw = el("div", "cc-set-prev"); var tpImgs = [];
      (samples || []).forEach(function (s9) {
        var im9 = el("img"); im9.src = s9; im9.alt = "";
        im9.style.width = "48px"; im9.style.height = "48px"; im9.style.objectFit = "contain";
        im9.onerror = function () { this.style.display = "none"; };
        tpImgs.push(im9); tpw.appendChild(im9);
      });
      var fid = "cc-set-tint-" + P.replace(/[^a-z]/g, "");
      function tp() {
        if (ibg) { var bg8 = /^#[0-9a-f]{6}$/i.test(icol) ? icol : acc; tpImgs.forEach(function (im9) { im9.style.filter = "grayscale(1) brightness(0) invert(1)"; im9.style.background = bg8; im9.style.borderRadius = "8px"; im9.style.padding = "6px"; }); return; }
        var hx9 = /^#?([0-9a-f]{6})$/i.exec(icol || "");
        if (!hx9) { tpImgs.forEach(function (im9) { im9.style.filter = "none"; im9.style.background = ""; im9.style.padding = ""; }); return; }
        var n9 = parseInt(hx9[1], 16), r9 = (n9 >> 16 & 255) / 255, g9 = (n9 >> 8 & 255) / 255, b9 = (n9 & 255) / 255;
        var st9 = Math.max(10, parseInt(get(P + "iconstrength", "100"), 10) || 100) / 100, i9 = 1 - st9;
        function row9(c9, ix9) { var v9 = [0.2126 * c9 * st9, 0.7152 * c9 * st9, 0.0722 * c9 * st9, 0, 0]; v9[ix9] += i9; return v9.join(" "); }
        var host9 = document.getElementById(fid + "-svg");
        if (!host9) { host9 = document.createElement("div"); host9.id = fid + "-svg"; host9.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(host9); }
        host9.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="' + fid + '" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values="' + row9(r9, 0) + " " + row9(g9, 1) + " " + row9(b9, 2) + ' 0 0 0 1 0"/></filter></svg>';
        tpImgs.forEach(function (im9) { im9.style.filter = "url(#" + fid + ")"; im9.style.background = ""; im9.style.padding = ""; });
      }
      cB.appendChild(tpw); tp(); applyBg2(ibg);
      if (!noLogos) into.appendChild(cB); // header tab: badges only, no logo card
    }
    // the adopt "Stil" card is the FIRST card of every section (user call), then
    // the Badges/Logos cards. Same cards for the Hauptmenueleiste as Plugins/VMs.
    var cV = card(T("Stil", "Style"), T("AN = die Docker-Tab-Einstellungen gelten auch hier. AUS = die eigenen Karten dieses Abschnitts gelten.", "ON = the Docker-tab settings apply here too. OFF = this section's own cards apply."));
    cV.appendChild(styleToggle("cc.stylevms", null));
    var cH = card(T("Stil", "Style"), T("AN = die Docker-Tab-Einstellungen gelten auch hier. AUS = die eigenen Karten dieses Abschnitts gelten.", "ON = the Docker-tab settings apply here too. OFF = this section's own cards apply."));
    cH.appendChild(styleToggle("cc.styleheader", null));
    var cSet = card(T("Stil", "Style"), T("AN = die Docker-Tab-Einstellungen gelten auch hier. AUS = die eigenen Karten dieses Abschnitts gelten.", "ON = the Docker-tab settings apply here too. OFF = this section's own cards apply."));
    cSet.appendChild(styleToggle("cc.stylesettings", null));
    wrapHeader.appendChild(cH); wrapPlugin.appendChild(cP); wrapVms.appendChild(cV); wrapSettings.appendChild(cSet);
    buildStyleCards("cch.", wrapHeader, [], true); // Hauptmenueleiste: pill/badge settings only
    buildStyleCards("ccs.", wrapSettings, [], false); // Einstellungs-Tab: badges + shape + logo-tint + Logo-Hintergrund cards (font-glyph icons → empty preview)
    buildStyleCards("ccp.", wrapPlugin, ["/plugins/dynamix.plugin.manager/images/dynamix.plugin.manager.png", "/plugins/dynamix.docker.manager/images/dynamix.docker.manager.png", "/plugins/cannonadecommand/images/cannonadecommand.png"]);
    buildStyleCards("ccv.", wrapVms, ["/plugins/dynamix.vm.manager/templates/images/linux.png", "/plugins/dynamix.vm.manager/templates/images/windows.png", "/plugins/cannonadecommand/images/cannonadecommand.png"]);
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
  function paintPrev() { var p = document.getElementById("cc-set-prev"); if (!p) return; var kinds = { net: "#1f9d55", ip: "#2f6feb", lan: "#e0912a", port: "#8b5cf6", cpu: "#d9433f", ram: "#0ea5a4", bw: "#f97316", plan: "#e05299" }; Array.prototype.slice.call(p.children).forEach(function (b) { var k = (b.className.match(/cc-b-(\w+)/) || [])[1]; var c = rainbow ? kinds[k] : accent; b.style.background = c; b.style.color = idealText(c); }); }
  // live-highlight the preset swatch that matches the current accent (no re-render)
  function syncSwOn() { var a = (accent || "").toLowerCase(); Array.prototype.slice.call(document.querySelectorAll("#cc-settings .cc-set-sw")).forEach(function (sw) { sw.classList.toggle("cc-set-sw-on", (sw.dataset.c || "").toLowerCase() === a); }); }
  function thc(t) { var e = el("th", null, t); return e; }
  function chkCell(key, v, color) { var td = el("td", "cc-set-chk"); var cb = el("input"); cb.type = "checkbox"; cb.checked = !!(colview[key] && colview[key][v]); if (rainbow && color) cb.style.accentColor = color; cb.addEventListener("change", function () { if (!colview[key]) colview[key] = { s: true, a: true }; colview[key][v] = cb.checked; set("cc.colview", JSON.stringify(colview)); }); td.appendChild(cb); return td; }
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
