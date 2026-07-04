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
  var vmicons = get("cc.vmicons", "0") === "1";
  var density = get("cc.density", "normal");
  var view = get("cc.view", "list");
  var colview = loadColview();

  // Notifications are engine-side config (not localStorage): loaded/saved through
  // the same-origin proxy. We keep the WHOLE config so a notify save never drops
  // the per-container schedules/watchdogs set in the Docker tab.
  var PROXY = "/plugins/cannonadecommander/server/api.php";
  var fullConfig = { schedules: [], watchdogs: [], notify: { unraid: false, webhook: "" } };
  var notify = { unraid: false, webhook: "" };
  var notifyDirty = false;   // true once the user has touched the Notifications card
  var configLoaded = false;  // true only after a SUCCESSFUL initial GET /config
  function api(method, path, body) {
    var opts = { method: method, headers: { Accept: "application/json" } };
    if (body != null) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(PROXY + "?path=" + encodeURIComponent(path), opts).then(function (r) {
      return r.text().then(function (tx) { var d = null; try { d = tx ? JSON.parse(tx) : null; } catch (e) {} if (!r.ok) throw new Error((d && d.error) || ("HTTP " + r.status)); return d; });
    });
  }

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function card(title, sub) { var c = el("div", "cc-set-card"); c.appendChild(el("div", "cc-set-h", title)); if (sub) c.appendChild(el("div", "cc-set-sub", sub)); return c; }
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
    var brand = el("div", "cc-set-brand"); brand.appendChild(el("b", null, "Cannonade")); brand.appendChild(el("span", null, "Commander"));
    head.appendChild(brand);
    head.appendChild(el("div", "cc-set-sub", T("Aussehen des Docker-Tab-Panels — wirkt sofort im Docker-Tab (pro Browser gespeichert).", "Look of the Docker-tab panel — applies live in the Docker tab (per browser).")));
    root.appendChild(head);

    var wrap = el("div", "cc-set-wrap");
    root.appendChild(wrap);

    // ── Badges ──
    var c1 = card(T("Badges", "Badges"), T("Akzentfarbe und Farbmodus der Badges.", "Accent colour and colour mode of the badges."));
    // The colour-picker field stays ALWAYS visible, PLUS a hex text field beside it;
    // both edit the same value and stay in sync.
    c1.appendChild(el("div", "cc-set-lbl", T("Akzentfarbe", "Accent colour")));
    var prow = el("div", "cc-set-pickrow");
    var pick = el("input", "cc-set-pick cc-set-pick-lg"); pick.type = "color"; pick.value = /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#2f6feb";
    var hexIn = el("input", "cc-set-hexin"); hexIn.type = "text"; hexIn.value = accent; hexIn.placeholder = "#2f6feb"; hexIn.maxLength = 7; hexIn.spellcheck = false;
    function setAccent(v) { accent = v; pick.value = v; hexIn.value = v; set("cc.accent", accent); root.style.setProperty("--cc-accent", accent); root.style.setProperty("--cc-accent-text", idealText(accent)); paintPrev(); syncSwOn(); }
    pick.addEventListener("input", function () { setAccent(pick.value); });
    hexIn.addEventListener("input", function () { var v = normHex(hexIn.value); if (v) setAccent(v); });
    pick.addEventListener("change", render);
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
    var prev = el("div", "cc-set-prev");
    ["net", "ip", "lan", "port"].forEach(function (k) { var b = el("span", "cc-b cc-b-" + k); b.appendChild(elk({ net: "Netzwerk", ip: "IP", lan: "LAN", port: "Port" }[k])); b.appendChild(elv("br0.20")); prev.appendChild(b); });
    prev.id = "cc-set-prev"; c1.appendChild(prev);
    wrap.appendChild(c1);

    // ── Container icons ──
    var c2 = card(T("Container-Icons einfärben", "Colourise container icons"), T("Tönt alle Icons in eine Farbe. „Aus“ lässt die Original-Icons.", "Tints every icon toward one colour. “Off” keeps the original icons."));
    var irow = el("div", "cc-set-pickrow");
    var ipick = el("input", "cc-set-pick cc-set-pick-lg"); ipick.type = "color"; ipick.value = /^#[0-9a-f]{6}$/i.test(iconcolor) ? iconcolor : accent;
    var ihexIn = el("input", "cc-set-hexin"); ihexIn.type = "text"; ihexIn.value = iconcolor || ""; ihexIn.placeholder = "#1f9d55"; ihexIn.maxLength = 7; ihexIn.spellcheck = false;
    var offbtn = el("span", "cc-set-mini" + (iconcolor ? "" : " cc-set-mini-on")); offbtn.textContent = T("Aus", "Off");
    // colour-picker field + hex field, kept in sync; both set the icon tint live.
    function setIcon(v) { iconcolor = v; ipick.value = v; ihexIn.value = v; set("cc.iconcolor", iconcolor); offbtn.classList.remove("cc-set-mini-on"); }
    ipick.addEventListener("input", function () { setIcon(ipick.value); });
    ihexIn.addEventListener("input", function () { var v = normHex(ihexIn.value); if (v) setIcon(v); });
    offbtn.addEventListener("click", function () { iconcolor = ""; del("cc.iconcolor"); render(); });
    irow.appendChild(ipick); irow.appendChild(ihexIn); irow.appendChild(offbtn);
    c2.appendChild(irow);
    var strow = el("div", "cc-set-row");
    strow.appendChild(el("span", "cc-set-rl", T("Intensität", "Strength")));
    var sl = el("input"); sl.type = "range"; sl.min = "10"; sl.max = "100"; sl.value = String(iconstrength); sl.style.flex = "1";
    sl.addEventListener("input", function () { iconstrength = parseInt(sl.value, 10); set("cc.iconstrength", sl.value); });
    strow.appendChild(sl);
    c2.appendChild(strow);
    c2.appendChild(toggleRow(T("VM-Icons auch einfärben", "Also tint VM icons"), vmicons, function (v) { vmicons = v; set("cc.vmicons", v ? "1" : "0"); }));
    wrap.appendChild(c2);

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
    api("GET", "config").then(function (c) {
      if (!c || typeof c !== "object") throw new Error("config unreadable");
      c.notify = { unraid: !!notify.unraid, webhook: notify.webhook || "" };
      return api("PUT", "config", c).then(function () { fullConfig = c; reset(T("Gespeichert ✓", "Saved ✓")); });
    }).catch(function () { reset(T("Fehler — Engine erreichbar?", "Error — engine reachable?")); });
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
    fullConfig = { schedules: c.schedules || [], watchdogs: c.watchdogs || [], notify: c.notify || { unraid: false, webhook: "" } };
    configLoaded = true;
    // keep the user's in-flight edits if they already started typing; otherwise
    // adopt the loaded values. Either way re-render to enable Save.
    if (!notifyDirty) notify = { unraid: !!fullConfig.notify.unraid, webhook: fullConfig.notify.webhook || "" };
    render();
  }).catch(function () {});
})();
