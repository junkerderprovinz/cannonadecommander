/* CannonadeCommander settings page. Client-side only: renders a polished,
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
  var PROXY = "/plugins/cannonadecommander/server/ccapi.php";
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
        try { if (String(k).indexOf("cc.") === 0 && k !== "cc.stateCache") { uiPending[k] = 1; clearTimeout(uiSyncT); uiSyncT = setTimeout(pushUISettings, 800); } } catch (e) {}
      };
    } catch (e) {}
  })();
  function collectUISettings() { var o = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf("cc.") === 0 && k !== "cc.stateCache") o[k] = localStorage.getItem(k); } return o; }
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
    try { Object.keys(u || {}).forEach(function (k) { if (k.indexOf("cc.") === 0 && localStorage.getItem(k) !== u[k]) { (window.__ccLS || localStorage.setItem.bind(localStorage))(k, u[k]); changed = true; } }); } catch (e) {}
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
    var c = el("div", "cc-set-card");
    // coloured top bar per card: the accent normally, the rotating palette in rainbow mode
    var bar = "var(--cc-accent, #2f6feb)";
    if (localStorage.getItem("cc.rainbow") === "1") {
      var pal = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"];
      try { var jp = JSON.parse(localStorage.getItem("cc.rbpal") || "null"); if (jp && jp.length) pal = jp; } catch (e9) {}
      bar = pal[cardN++ % pal.length];
    }
    c.style.setProperty("border-top", "3px solid " + bar, "important");
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
    var lg = el("img", "cc-set-logo"); lg.src = "/plugins/cannonadecommander/images/logo.svg"; lg.alt = "";
    hleft.appendChild(lg);
    var htx = el("div", null);
    var brand = el("div", "cc-set-brand"); brand.appendChild(el("b", null, "Cannonade")); brand.appendChild(el("span", null, "Command"));
    htx.appendChild(brand);
    htx.appendChild(el("div", "cc-set-claim", "Shoots your commands where you need them — and that very nicely."));
    hleft.appendChild(htx);
    hero.appendChild(hleft);
    head.appendChild(hero);
    head.appendChild(el("div", "cc-set-sub", T("Aussehen des Docker-Tab-Panels — wirkt sofort im Docker-Tab (pro Browser gespeichert).", "Look of the Docker-tab panel — applies live in the Docker tab (per browser).")));
    // The RUNNING engine version, always findable HERE (the Docker-tab gear was hard to
    // locate) — an old value after an update = the update didn't take / daemon not restarted.
    var CC_VER = "@@CCVER@@"; if (CC_VER.indexOf("@@") === 0) CC_VER = "dev";
    var verLine = el("div", "cc-set-sub cc-set-version", "UI v" + CC_VER + " · " + T("Engine: verbinde…", "Engine: connecting…"));
    head.appendChild(verLine);
    api("GET", "state").then(function (s) {
      verLine.textContent = "UI v" + CC_VER + " · " + ((s && s.version) ? ("Engine " + String(s.version).replace(/^v/, "v")) + " · " + T("läuft", "running") : T("Engine läuft (Version unbekannt)", "Engine running (version unknown)"));
    }).catch(function (e) { verLine.textContent = "UI v" + CC_VER + " · " + T("Engine NICHT erreichbar", "Engine NOT reachable") + " — " + (e && e.message ? e.message : ""); verLine.style.color = "#d9433f"; });
    root.appendChild(head);

    var wrap = el("div", "cc-set-wrap");
    root.appendChild(wrap);

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
    rr.appendChild(toggle(rainbow, function (v) { rainbow = v; set("cc.rainbow", v ? "1" : "0"); render(); }));
    c1.appendChild(rr);
    // rotation toggle: on = every tab reload deals a fresh colour mapping; off = stable colours
    var rrot = el("div", "cc-set-row cc-set-inline");
    rrot.appendChild(el("span", null, T("Farben bei jedem Neuladen rotieren", "Rotate colours on every reload")));
    rrot.appendChild(toggle(get("cc.rainbowrot", "1") !== "0", function (v) { set("cc.rainbowrot", v ? "1" : "0"); }));
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
    var prev = el("div", "cc-set-prev");
    ["net", "ip", "lan", "port"].forEach(function (k) { var b = el("span", "cc-b cc-b-" + k); b.appendChild(elk({ net: "Netzwerk", ip: "IP", lan: "LAN", port: "Port" }[k])); b.appendChild(elv("br0.20")); prev.appendChild(b); });
    prev.id = "cc-set-prev"; c1.appendChild(prev);
    wrap.appendChild(c1);

    // ── Container icons ──
    var c2 = card(T("Container-Icons einfärben", "Colourise container icons"), T("Der Schalter aktiviert die Färbung.", "The switch turns the tint on."));
    var ihexIn = el("input", "cc-set-hexin"); ihexIn.type = "text"; ihexIn.value = iconcolor || ""; ihexIn.placeholder = "#1f9d55"; ihexIn.maxLength = 7; ihexIn.spellcheck = false;
    var ipick = inlinePicker(/^#[0-9a-f]{6}$/i.test(iconcolor) ? iconcolor : (/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#1f9d55"), function (v) { iconcolor = v; ihexIn.value = v; set("cc.iconcolor", v); syncIconTog(); });
    // A real ON/OFF toggle drives the tint (empty cc.iconcolor = off). The picker/hex
    // set WHICH colour; changing either also switches the tint on.
    function iconOn() { return !!iconcolor; }
    var iconTog = el("span", "cc-set-toggle" + (iconOn() ? " cc-set-toggle-on" : "")); iconTog.setAttribute("role", "switch"); iconTog.setAttribute("tabindex", "0"); iconTog.setAttribute("aria-checked", iconOn() ? "true" : "false"); iconTog.appendChild(el("span", "cc-set-knob"));
    function syncIconTog() { var on = iconOn(); iconTog.classList.toggle("cc-set-toggle-on", on); iconTog.setAttribute("aria-checked", on ? "true" : "false"); }
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
    sl.addEventListener("input", function () { iconstrength = parseInt(sl.value, 10); set("cc.iconstrength", sl.value); });
    strow.appendChild(sl);
    c2.appendChild(strow);
    c2.appendChild(toggleRow(T("VM-Icons auch einfärben", "Also tint VM icons"), vmicons, function (v) { vmicons = v; set("cc.vmicons", v ? "1" : "0"); }));
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
    wrap.appendChild(c4);

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

    root.appendChild(el("div", "cc-set-foot", T("Öffne (oder wechsle zu) den Docker-Tab — die Änderungen erscheinen sofort. Zeitpläne und Watchdog stellst du pro Container über den ⛓-Chip im Docker-Tab ein.", "Open (or switch to) the Docker tab — changes appear immediately. Set schedules and the watchdog per container via the ⛓ chip in the Docker tab.")));
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
  function paintPrev() { var p = document.getElementById("cc-set-prev"); if (!p) return; var kinds = { net: "#1f9d55", ip: "#2f6feb", lan: "#e0912a", port: "#8b5cf6" }; Array.prototype.slice.call(p.children).forEach(function (b) { var k = (b.className.match(/cc-b-(\w+)/) || [])[1]; var c = rainbow ? kinds[k] : accent; b.style.background = c; b.style.color = idealText(c); }); }
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
