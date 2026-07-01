/* CannonadeCommander - Docker tab enhancer.
 *
 * Enhances Unraid's OWN container LIST in place. There is deliberately NO bar or
 * section of our own above the list (that is what the user rejected): every
 * global control - the List/Grid switch, column toggles, the plan Save / Start
 * in order, filter - lives behind a single gear injected into the native table
 * header. Each row gets clean, toggleable badges (state as a start/stop switch,
 * plan, and optionally update/network/IP/port/CPU/RAM). The container name is
 * enlarged and Unraid's redundant under-name state text is hidden.
 *
 * A List/Grid toggle still switches to a card grid. The update badge is read
 * from ShipLog's status API if ShipLog is installed (it stays fully standalone;
 * absent = badge simply not shown). The native table is never removed, only
 * hidden while in Grid mode. The browser talks only to same-origin proxies; it
 * never touches the Docker socket. Everything is idempotent + wrapped in
 * try/catch so a failure can never break Unraid's native page.
 */
(function () {
  "use strict";

  var PROXY = "/plugins/cannonadecommander/server/api.php";
  var SHIPLOG = "/plugins/shiplog/server/status.php";
  var VIEW_KEY = "cc.view", COLS_KEY = "cc.cols", ADV_KEY = "cc.adv";
  var MARK = "data-cc", NAME_MARK = "data-cc-name";
  var PROBES = ["health", "running", "tcp"], POLICIES = ["abort", "continue", "degrade"];
  var UPDATE_PHRASES = ["aktualisierung", "auf dem neu", "nicht verf", "wird gepr", "up-to-date", "up to date", "update ready", "apply update", "rebuild ready"];
  var STATE_RE = /^(gestartet|gestoppt|angehalten|pausiert|neu ?gestartet|wird neu gestartet|started|stopped|paused|exited|running|dead|restarting)\b/;
  var LANG = (document.documentElement.lang || navigator.language || "en").slice(0, 2).toLowerCase();

  var T = {
    de: { uptodate: "Aktuell", start: "Starten", stop: "Stoppen", restart: "Neustart", pause: "Pause", resume: "Fortsetzen", force: "Update erzwingen", save: "Plan speichern", startorder: "In Reihenfolge starten", filter: "filtern…", cols: "Spalten", advanced: "Erweitert", view: "Ansicht", list: "Liste", grid: "Raster", noupd: "Update-Knopf nicht gefunden", done: "erledigt", saving: "speichere…", saved: "Plan gespeichert" },
    en: { uptodate: "up to date", start: "Start", stop: "Stop", restart: "Restart", pause: "Pause", resume: "Resume", force: "Force update", save: "Save plan", startorder: "Start in order", filter: "filter…", cols: "Columns", advanced: "Advanced", view: "View", list: "List", grid: "Grid", noupd: "no update control found", done: "done", saving: "saving…", saved: "plan saved" },
  };
  function t(k) { return (T[LANG] || T.en)[k] || T.en[k]; }
  var STATE_LABELS = {
    de: { running: "läuft", exited: "gestoppt", created: "erstellt", paused: "pausiert", restarting: "startet neu", removing: "wird entfernt", dead: "tot" },
    en: { running: "running", exited: "stopped", created: "created", paused: "paused", restarting: "restarting", removing: "removing", dead: "dead" },
  };
  function stateLabel(s) { var m = STATE_LABELS[LANG] || STATE_LABELS.en; return m[s] || s || "?"; }
  var RISK_CLASS = { low: "low", none: "low", medium: "mid", high: "high", unknown: "grey" };

  var mode = localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  var advanced = localStorage.getItem(ADV_KEY) === "1";
  var containers = [], containerNames = [], stats = {}, shiplog = {}, workingPlan = {}, lastRun = {}, iconCache = {};
  var filterText = "", gridHolder = null, openPop = null, menu = null, menuAnchor = null, menuStatusEl = null, toastEl = null, toastTimer = null;

  // ───────────────────────── api + helpers
  function api(method, path, body) {
    var opts = { method: method, headers: { Accept: "application/json" } };
    if (body != null) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(PROXY + "?path=" + encodeURIComponent(path), opts).then(function (r) {
      return r.text().then(function (t2) {
        var data = null; try { data = t2 ? JSON.parse(t2) : null; } catch (e) { data = null; }
        if (!r.ok) throw new Error((data && data.error) ? data.error : "HTTP " + r.status);
        return data;
      });
    });
  }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function norm(s) { return String(s || "").trim().toLowerCase(); }
  function humanBytes(b) { if (!b) return "0"; var u = ["B", "K", "M", "G", "T"], i = 0, n = b; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10) + u[i]; }

  // ───────────────────────── native table (ShipLog-proven finder)
  function nativeTable() { var l = document.getElementById("docker_list"); if (l) return l.closest("table") || l.parentNode; return document.getElementById("docker_containers") || document.querySelector("table#docker_containers"); }
  function headerRow() { var tb = nativeTable(); if (!tb || tb.tagName !== "TABLE") return null; return tb.querySelector("thead tr:last-child") || tb.querySelector("thead tr") || null; }
  function isFolderHeader(tr) { return !!(tr.classList.contains("folder") || tr.querySelector(":scope > td.folder-name, :scope > td.folder-update")); }
  function findRows() {
    var cands = ["#docker_list tr.sortable, #docker_list tr.folder-element", "#docker_list > tr", "table#docker_containers tbody tr", "table.tablesorter tbody tr", "div.tabs table tbody tr", "table tbody tr"];
    for (var i = 0; i < cands.length; i++) {
      var rows = Array.prototype.slice.call(document.querySelectorAll(cands[i])).filter(function (tr) { return !isFolderHeader(tr) && (tr.querySelector("td.ct-name, td.updatecolumn") || (tr.querySelector("img") && tr.textContent.trim().length > 1)); });
      if (rows.length) return rows;
    }
    return [];
  }
  function rowName(tr) { var a = tr.querySelector("td.ct-name .appname"); if (a && a.textContent.trim()) return a.textContent.trim(); var id = tr.id || ""; if (/^ct-/.test(id)) return id.slice(3); var img = tr.querySelector("img"); var cell = img ? (img.closest("td") || tr) : tr; var link = cell.querySelector("a"); return (link && link.textContent.trim() ? link.textContent.trim() : (cell.textContent || tr.textContent).trim().split("\n")[0].trim()); }
  function findUpdateCell(tr) { var d = tr.querySelector("td.updatecolumn:not(.folder-update)"); if (d) return d; var cells = Array.prototype.slice.call(tr.querySelectorAll("td")); for (var i = 0; i < cells.length; i++) { var x = cells[i].textContent.toLowerCase(); for (var j = 0; j < UPDATE_PHRASES.length; j++) if (x.indexOf(UPDATE_PHRASES[j]) >= 0) return cells[i]; } return cells[cells.length - 1] || tr; }
  function hideNative(hide) { var tb = nativeTable(); if (tb) tb.style.display = hide ? "none" : ""; }
  function triggerNativeUpdate(name) {
    var rows = findRows();
    for (var i = 0; i < rows.length; i++) {
      if (norm(rowName(rows[i])) !== norm(name)) continue;
      var cell = findUpdateCell(rows[i]);
      var cands = Array.prototype.slice.call(cell.querySelectorAll("a[onclick],[onclick],a[href]")).filter(function (n) { return !n.closest(".cc-cell"); });
      var blob = function (n) { return norm(n.textContent) + " " + norm(n.getAttribute("onclick") || ""); };
      var target = cands.find(function (n) { return /apply update|aktualisierung anwenden|installupdate|updatecontainer|installxml|rebuild ready/.test(blob(n)); }) || cands.find(function (n) { return /update|aktualisier/.test(blob(n)); });
      if (target) { target.click(); return true; }
      return false;
    }
    return false;
  }

  // ───────────────────────── data
  function indexState(state) {
    containers = (state && state.containers) || [];
    containerNames = containers.map(function (c) { return c.name; }).sort();
    workingPlan = {};
    if (state && state.plan && state.plan.nodes) state.plan.nodes.forEach(function (n) { workingPlan[n.name] = n; });
    lastRun = {};
    if (state && state.last_run && state.last_run.nodes) state.last_run.nodes.forEach(function (r) { lastRun[r.name] = r; });
  }
  function loadShiplog() {
    return fetch(SHIPLOG, { headers: { Accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      shiplog = {};
      if (Array.isArray(data)) data.forEach(function (st) { var n = st.container && st.container.name; if (n) shiplog[norm(n)] = st; });
    }).catch(function () { shiplog = {}; });
  }
  function containerByName(name) { var k = norm(name); for (var i = 0; i < containers.length; i++) if (norm(containers[i].name) === k) return containers[i]; return null; }
  function depsTxt(node) { return node ? (node.after && node.after.length ? "after " + node.after.join(", ") : "in plan") : "plan"; }
  function iconFor(name) {
    if (iconCache[name] !== undefined) return iconCache[name];
    var src = "", row = document.getElementById("ct-" + name), img = row && row.querySelector("img");
    if (!img) { var all = document.querySelectorAll("#docker_containers img, #docker_list img"); for (var i = 0; i < all.length; i++) { var tr = all[i].closest("tr"); if (tr && norm(rowName(tr)) === norm(name)) { img = all[i]; break; } } }
    if (img) src = img.getAttribute("src") || ""; iconCache[name] = src; return src;
  }

  // ───────────────────────── badge builders
  function stateBadge(c) { var s = (c && c.state) || "unknown", b = el("span", "cc-badge cc-badge-" + s, stateLabel(s)); if (c && c.health === "unhealthy") { b.classList.add("cc-badge-alert"); b.textContent = stateLabel(s) + " ✕"; } else if (c && c.health === "starting") b.textContent = stateLabel(s) + " …"; return b; }
  // The list-mode state badge doubles as a start/stop switch: click toggles the
  // container through the same host supervisor the grid uses.
  function stateToggle(c) {
    var b = stateBadge(c);
    var action = c.state === "running" ? "stop" : (c.state === "paused" ? "unpause" : "start");
    b.classList.add("cc-badge-toggle");
    b.title = t(action === "stop" ? "stop" : action === "unpause" ? "resume" : "start");
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); doAction(c.name, action); });
    return b;
  }
  function infoBadge(kind, text) { var b = el("span", "cc-info cc-info-" + kind); b.appendChild(el("span", "cc-info-k", kind)); b.appendChild(el("span", "cc-info-v", text)); return b; }
  function statBadge(label, val) { var b = el("span", "cc-info cc-info-stat"); b.appendChild(el("span", "cc-info-k", label)); b.appendChild(el("span", "cc-info-v", val)); return b; }
  function shiplogBadge(name) {
    var st = shiplog[norm(name)]; if (!st) return null;
    var kind = st.kind || "none", up = (kind === "none" || kind === "");
    var label = up ? t("uptodate") : (kind === "digest" ? "Update" : String(kind).toUpperCase());
    var cls = up ? "cc-up cc-up-low" : ("cc-up cc-up-" + (RISK_CLASS[st.risk] || "grey"));
    var b = el("span", cls, label); b.title = st.risk_reason || ""; return b;
  }
  function depsChip(name) {
    var node = workingPlan[name], chip = el("a", "cc-chip" + (node ? " cc-chip-on" : ""));
    chip.href = "#"; chip.innerHTML = '<span class="cc-ico">⛓</span><span class="cc-chip-txt"></span>';
    chip.querySelector(".cc-chip-txt").textContent = depsTxt(node); chip.title = "start order for " + name;
    chip.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openEditor(chip, name); });
    return chip;
  }
  function lastRunPill(name) { var lr = lastRun[name]; if (!lr) return null; var p = el("span", "cc-pill cc-pill-" + lr.state, lr.state); p.title = lr.reason || ""; return p; }
  function forceBtn(name) { var b = el("button", "cc-abtn", t("force")); b.addEventListener("click", function (e) { e.stopPropagation(); if (!triggerNativeUpdate(name)) flash(t("noupd"), true); }); return b; }

  // ───────────────────────── column model
  // Defaults are deliberately minimal (state + plan) so the injected badges sit
  // cleanly in the native cell and never duplicate Unraid's own advanced columns
  // (network / IP / port / CPU / RAM). Turn any of those on via the gear menu.
  var COLS = [
    { key: "state", label: { de: "Status", en: "State" }, def: true, render: function (c) { return stateToggle(c); } },
    { key: "plan", label: { de: "Startplan", en: "Plan" }, def: true, render: function (c) { return depsChip(c.name); } },
    { key: "update", label: { de: "Update", en: "Update" }, def: false, render: function (c) { return shiplogBadge(c.name); } },
    { key: "cpu", label: { de: "CPU", en: "CPU" }, def: false, render: function (c) { var s = stats[c.name]; return (s && c.state === "running") ? statBadge("CPU", (s.cpu_percent || 0) + "%") : null; } },
    { key: "ram", label: { de: "RAM", en: "RAM" }, def: false, render: function (c) { var s = stats[c.name]; return (s && c.state === "running") ? statBadge("RAM", humanBytes(s.mem_used)) : null; } },
    { key: "network", label: { de: "Netzwerk", en: "Network" }, def: false, render: function (c) { return c.network ? infoBadge("net", c.network) : null; } },
    { key: "ip", label: { de: "IP", en: "IP" }, def: false, render: function (c) { return c.ip ? infoBadge("ip", c.ip) : null; } },
    { key: "port", label: { de: "Port", en: "Port" }, def: false, render: function (c) { return (c.ports && c.ports.length) ? infoBadge("port", c.ports.join(" ")) : null; } },
    { key: "lastrun", label: { de: "Letzter Lauf", en: "Last run" }, def: false, render: function (c) { return lastRunPill(c.name); } },
    { key: "image", label: { de: "Image", en: "Image" }, adv: true, render: function (c) { return c.image ? infoBadge("img", c.image) : null; } },
    { key: "id", label: { de: "Container-ID", en: "Container ID" }, adv: true, render: function (c) { return c.id ? infoBadge("id", c.id.slice(0, 12)) : null; } },
    { key: "force", label: { de: "Update erzwingen", en: "Force update" }, adv: true, render: function (c) { return forceBtn(c.name); } },
  ];
  function defaultCols() { var s = {}; COLS.forEach(function (c) { if (c.def) s[c.key] = true; }); return s; }
  function loadCols() { try { var j = JSON.parse(localStorage.getItem(COLS_KEY) || "null"); if (j && typeof j === "object") return j; } catch (e) {} return defaultCols(); }
  var visibleCols = loadCols();
  function colOn(c) { return !!visibleCols[c.key] && (!c.adv || advanced); }
  function saveCols() { localStorage.setItem(COLS_KEY, JSON.stringify(visibleCols)); }
  function renderBadges(c) { var out = []; COLS.forEach(function (col) { if (!colOn(col)) return; var n = col.render(c); if (n) out.push(n); }); return out; }

  // ───────────────────────── lifecycle (grid buttons + list state toggle)
  function doAction(name, action) { flash(action + " " + name + "…"); api("POST", "action", { name: name, action: action }).then(function () { return load(); }).then(function () { flash(t("done")); }).catch(function (e) { flash("Error: " + e.message, true); }); }
  function actionBtn(label, name, action, primary) { var b = el("button", "cc-abtn" + (primary ? " cc-abtn-primary" : ""), label); b.addEventListener("click", function (e) { e.stopPropagation(); doAction(name, action); }); return b; }
  function lifecycle(c) {
    var box = el("span", "cc-life");
    if (c.state === "running") { box.appendChild(actionBtn(t("stop"), c.name, "stop")); box.appendChild(actionBtn(t("restart"), c.name, "restart")); box.appendChild(actionBtn(t("pause"), c.name, "pause")); }
    else if (c.state === "paused") { box.appendChild(actionBtn(t("resume"), c.name, "unpause", true)); box.appendChild(actionBtn(t("stop"), c.name, "stop")); }
    else box.appendChild(actionBtn(t("start"), c.name, "start", true));
    return box;
  }

  // ───────────────────────── LIST mode (in-place, IDEMPOTENT)
  // The MutationObserver calls tagRows on every DOM change, so injection MUST be
  // idempotent (a MARK guard per cell), or the observer and the injection would
  // re-trigger each other in an infinite loop. To refresh use retagRows().
  function decorateNameCell(tr) {
    try {
      var cell = tr.querySelector("td.ct-name");
      if (!cell || cell.getAttribute(NAME_MARK)) return;
      cell.setAttribute(NAME_MARK, "1");
      var app = cell.querySelector(".appname"); if (app) app.classList.add("cc-bigname");
      // Hide Unraid's redundant under-name state line ("Gestartet"/"Gestoppt"…) —
      // the state now lives in our start/stop badge. Only a short leaf element whose
      // text STARTS with a state word is touched, so nothing structural is hidden.
      var nodes = cell.querySelectorAll("span, div, font");
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.children.length > 1) continue;
        if (n.classList && n.classList.contains("appname")) continue;
        if (n.querySelector && n.querySelector(".appname")) continue;
        var tx = norm(n.textContent);
        if (tx && tx.length <= 22 && STATE_RE.test(tx)) { n.style.display = "none"; n.setAttribute("data-cc-hid", "1"); }
      }
    } catch (e) { /* one bad row must never break Unraid's page */ }
  }
  function tagRows() {
    if (mode !== "list") return;
    findRows().forEach(function (tr) {
      try {
        var name = rowName(tr), c = containerByName(name);
        if (filterText) tr.style.display = (norm(name).indexOf(filterText) >= 0) ? "" : "none";
        decorateNameCell(tr);
        var cell = findUpdateCell(tr);
        if (!cell || !c || cell.getAttribute(MARK)) return; // already tagged → skip
        cell.setAttribute(MARK, "1");
        var box = el("div", "cc-cell");
        renderBadges(c).forEach(function (n) { box.appendChild(n); });
        cell.appendChild(box);
      } catch (e) { /* one bad row must never break Unraid's page */ }
    });
  }
  function untagRows() { Array.prototype.slice.call(document.querySelectorAll("[" + MARK + "]")).forEach(function (cell) { cell.removeAttribute(MARK); var c = cell.querySelector(".cc-cell"); if (c) c.remove(); }); }
  function retagRows() { untagRows(); tagRows(); } // explicit one-shot refresh

  // ───────────────────────── GRID mode
  function card(c) {
    var wrap = el("div", "cc-card"); wrap.dataset.name = c.name;
    var head = el("div", "cc-card-head");
    var ico = iconFor(c.name);
    if (ico) { var im = el("img", "cc-card-ico"); im.src = ico; im.onerror = function () { this.style.visibility = "hidden"; }; head.appendChild(im); } else head.appendChild(el("div", "cc-card-ico cc-card-ico-ph"));
    var nb = el("div", "cc-card-name"); nb.appendChild(el("div", "cc-card-title", c.name)); nb.appendChild(el("div", "cc-card-img", c.image || "")); head.appendChild(nb);
    head.appendChild(stateBadge(c)); wrap.appendChild(head);
    var s = stats[c.name], sb = el("div", "cc-card-stats");
    if (s && c.state === "running") { sb.appendChild(gauge("CPU", s.cpu_percent, (s.cpu_percent || 0) + "%")); sb.appendChild(gauge("RAM", s.mem_percent, humanBytes(s.mem_used) + " / " + humanBytes(s.mem_limit))); } else sb.appendChild(el("div", "cc-stat cc-dim", c.state === "running" ? "…" : "not running"));
    wrap.appendChild(sb);
    var badges = el("div", "cc-card-badges");
    COLS.forEach(function (col) { if (col.key === "state" || col.key === "cpu" || col.key === "ram" || col.key === "plan" || col.key === "force") return; if (!colOn(col)) return; var n = col.render(c); if (n) badges.appendChild(n); });
    if (badges.children.length) wrap.appendChild(badges);
    var act = el("div", "cc-card-actions");
    act.appendChild(lifecycle(c));
    if (colOn({ key: "force", adv: true })) act.appendChild(forceBtn(c.name));
    act.appendChild(depsChip(c.name));
    var p = lastRunPill(c.name); if (p) act.appendChild(p);
    wrap.appendChild(act);
    if (filterText && norm(c.name).indexOf(filterText) < 0) wrap.style.display = "none";
    return wrap;
  }
  function gauge(label, pct, right) { var w = el("div", "cc-stat"); w.appendChild(el("span", "cc-stat-lbl", label)); var bar = el("div", "cc-gauge"), fill = el("div", "cc-gauge-fill" + (pct >= 90 ? " cc-hot" : "")); fill.style.width = Math.max(0, Math.min(100, pct)) + "%"; bar.appendChild(fill); w.appendChild(bar); w.appendChild(el("span", "cc-stat-val", right)); return w; }
  function ensureGridHolder() {
    if (gridHolder && gridHolder.parentNode) return gridHolder;
    gridHolder = el("div", "cc-grid-holder cc-root");
    try { var tb = nativeTable(); if (tb && tb.parentNode) tb.parentNode.insertBefore(gridHolder, tb); else document.body.appendChild(gridHolder); } catch (e) { document.body.appendChild(gridHolder); }
    return gridHolder;
  }
  function removeGridHolder() { try { if (gridHolder && gridHolder.parentNode) gridHolder.parentNode.removeChild(gridHolder); } catch (e) {} gridHolder = null; }
  function renderGrid() {
    ensureGridHolder(); gridHolder.innerHTML = "";
    gridHolder.appendChild(makeGear("cc-hgear-grid")); // header is hidden in grid → keep the gear reachable
    var grid = el("div", "cc-grid");
    containers.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) { grid.appendChild(card(c)); });
    gridHolder.appendChild(grid);
  }

  // ───────────────────────── gear + menu (the only global control surface)
  function makeGear(extra) {
    var g = el("button", "cc-hgear" + (extra ? " " + extra : ""), "⚙"); g.type = "button"; g.title = "CannonadeCommander";
    g.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); toggleMenu(g); });
    return g;
  }
  // Inject the gear into the native table header (list mode). No header cell (an
  // unknown skin) → a floating gear pinned to the table corner. Idempotent.
  function injectHeaderGear() {
    try {
      var tb = nativeTable(); if (!tb) return false;
      var hr = headerRow();
      if (hr) { if (hr.querySelector(".cc-hgear")) return true; var th = hr.querySelector("th"); if (th) { th.appendChild(makeGear("cc-hgear-th")); return true; } }
      var wrap = tb.parentNode;
      if (wrap && !wrap.querySelector(".cc-hgear-float")) { try { if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative"; } catch (e) {} wrap.appendChild(makeGear("cc-hgear-float")); }
      return true;
    } catch (e) { return false; }
  }
  function menuHead(txt) { return el("div", "cc-menu-h", txt); }
  function colRow(c) {
    var row = el("label", "cc-menu-row");
    var cb = el("input"); cb.type = "checkbox"; cb.checked = !!visibleCols[c.key];
    cb.addEventListener("change", function () { visibleCols[c.key] = cb.checked; saveCols(); refresh(); });
    row.appendChild(cb); row.appendChild(el("span", null, " " + (c.label[LANG] || c.label.en)));
    return row;
  }
  function buildMenu() {
    var m = el("div", "cc-menu cc-menu-wide");
    m.addEventListener("click", function (e) { e.stopPropagation(); });
    menuStatusEl = el("div", "cc-menu-status cc-ok-text", "engine up · " + containers.length); m.appendChild(menuStatusEl);

    m.appendChild(menuHead(t("view")));
    var seg = el("div", "cc-seg");
    var bL = el("button", "cc-seg-btn" + (mode === "list" ? " cc-seg-on" : ""), t("list"));
    var bG = el("button", "cc-seg-btn" + (mode === "grid" ? " cc-seg-on" : ""), t("grid"));
    bL.addEventListener("click", function () { closeMenu(); setMode("list"); }); bG.addEventListener("click", function () { closeMenu(); setMode("grid"); });
    seg.appendChild(bL); seg.appendChild(bG);
    var vrow = el("div", "cc-menu-row cc-menu-plain"); vrow.appendChild(seg); m.appendChild(vrow);

    var frow = el("div", "cc-menu-row cc-menu-plain");
    var filter = el("input", "cc-filter"); filter.type = "text"; filter.placeholder = t("filter"); filter.value = filterText;
    filter.addEventListener("input", function () { filterText = norm(filter.value); applyFilter(); });
    frow.appendChild(filter); m.appendChild(frow);

    m.appendChild(menuHead(t("cols")));
    COLS.filter(function (c) { return !c.adv; }).forEach(function (c) { m.appendChild(colRow(c)); });
    var advRow = el("label", "cc-menu-row");
    var advCb = el("input"); advCb.type = "checkbox"; advCb.checked = advanced;
    advCb.addEventListener("change", function () { advanced = advCb.checked; localStorage.setItem(ADV_KEY, advanced ? "1" : "0"); rebuildMenu(); refresh(); });
    advRow.appendChild(advCb); advRow.appendChild(el("span", null, " " + t("advanced")));
    m.appendChild(advRow);
    if (advanced) COLS.filter(function (c) { return c.adv; }).forEach(function (c) { m.appendChild(colRow(c)); });

    m.appendChild(el("div", "cc-menu-sep"));
    var prow = el("div", "cc-menu-row cc-menu-plain");
    var save = el("button", "cc-btn", t("save")), fire = el("button", "cc-btn cc-btn-primary", t("startorder"));
    save.addEventListener("click", function () { savePlan(false); }); fire.addEventListener("click", function () { savePlan(true); });
    prow.appendChild(save); prow.appendChild(fire); m.appendChild(prow);
    return m;
  }
  function positionMenu() {
    if (!menu || !menuAnchor) return;
    var r = menuAnchor.getBoundingClientRect(), w = menu.offsetWidth || 240;
    var left = Math.min(window.scrollX + r.right - w, window.scrollX + document.documentElement.clientWidth - w - 12);
    menu.style.left = Math.max(window.scrollX + 8, left) + "px";
    menu.style.top = (window.scrollY + r.bottom + 6) + "px";
  }
  function openMenu(anchor) { closeMenu(); menuAnchor = anchor; menu = buildMenu(); document.body.appendChild(menu); positionMenu(); }
  function closeMenu() { if (menu) { menu.remove(); menu = null; menuStatusEl = null; } }
  function rebuildMenu() { if (menu && menuAnchor) openMenu(menuAnchor); }
  function toggleMenu(anchor) { if (menu) closeMenu(); else openMenu(anchor); }

  // ───────────────────────── mode
  function setMode(m) { mode = m; localStorage.setItem(VIEW_KEY, m); refresh(); }
  function refresh() { applyMode(); if (mode === "grid") refreshStats(); }
  function applyMode() {
    try {
      if (mode === "grid") { hideNative(true); untagRows(); renderGrid(); }
      else { hideNative(false); removeGridHolder(); injectHeaderGear(); retagRows(); }
    } catch (e) { try { hideNative(false); } catch (e2) {} } // never leave the native list hidden or broken
  }
  function applyFilter() {
    if (mode === "grid") { if (gridHolder) Array.prototype.slice.call(gridHolder.querySelectorAll(".cc-card")).forEach(function (cd) { cd.style.display = (!filterText || norm(cd.dataset.name).indexOf(filterText) >= 0) ? "" : "none"; }); }
    else findRows().forEach(function (tr) { tr.style.display = (!filterText || norm(rowName(tr)).indexOf(filterText) >= 0) ? "" : "none"; });
  }
  function refreshStats() {
    api("GET", "stats").then(function (m) {
      stats = m || {};
      if (mode === "grid" && gridHolder) Array.prototype.slice.call(gridHolder.querySelectorAll(".cc-card")).forEach(function (cd) { var s = stats[cd.dataset.name]; if (!s) return; var f = cd.querySelectorAll(".cc-gauge-fill"), v = cd.querySelectorAll(".cc-stat-val"); if (f[0]) f[0].style.width = Math.min(100, s.cpu_percent) + "%"; if (v[0]) v[0].textContent = (s.cpu_percent || 0) + "%"; if (f[1]) f[1].style.width = Math.min(100, s.mem_percent) + "%"; if (v[1]) v[1].textContent = humanBytes(s.mem_used) + " / " + humanBytes(s.mem_limit); });
    }).catch(function () {});
  }

  // ───────────────────────── plan editor popover
  function closePop() { if (openPop) { openPop.remove(); openPop = null; } }
  function refreshChip(chip, name) { var node = workingPlan[name]; chip.classList.toggle("cc-chip-on", !!node); chip.querySelector(".cc-chip-txt").textContent = depsTxt(node); }
  function openEditor(anchor, name) {
    closePop();
    var existing = workingPlan[name], node = existing || { name: name, after: [], probe: { kind: "health" }, policy: "abort" };
    var pop = el("div", "cc-pop"), head = el("div", "cc-pop-head"); head.appendChild(el("b", null, name));
    var x = el("span", "cc-pop-x", "✕"); x.addEventListener("click", closePop); head.appendChild(x); pop.appendChild(head);
    var mrow = el("label", "cc-pop-row"), manage = el("input"); manage.type = "checkbox"; manage.checked = !!existing;
    mrow.appendChild(manage); mrow.appendChild(el("span", null, " Manage in the start plan")); pop.appendChild(mrow);
    var body = el("div", "cc-pop-body" + (existing ? "" : " cc-dis"));
    var arow = el("div", "cc-pop-row"); arow.appendChild(el("label", "cc-pop-lbl", "Depends on"));
    var after = el("input", "cc-in"); after.type = "text"; after.setAttribute("list", "cc-names"); after.placeholder = "comma-separated"; after.value = (node.after || []).join(", "); arow.appendChild(after); body.appendChild(arow);
    var prow = el("div", "cc-pop-row"); prow.appendChild(el("label", "cc-pop-lbl", "Ready when"));
    var probe = el("select", "cc-in"); PROBES.forEach(function (p) { var o = el("option", null, p); o.value = p; if (node.probe && node.probe.kind === p) o.selected = true; probe.appendChild(o); });
    var port = el("input", "cc-in cc-port"); port.type = "number"; port.placeholder = "port"; port.value = (node.probe && node.probe.port) ? node.probe.port : "";
    var syncPort = function () { port.style.display = probe.value === "tcp" ? "" : "none"; }; syncPort();
    prow.appendChild(probe); prow.appendChild(port); body.appendChild(prow);
    var polrow = el("div", "cc-pop-row"); polrow.appendChild(el("label", "cc-pop-lbl", "On fail"));
    var pol = el("select", "cc-in"); POLICIES.forEach(function (p) { var o = el("option", null, p); o.value = p; if (node.policy === p) o.selected = true; pol.appendChild(o); });
    polrow.appendChild(pol); body.appendChild(polrow); pop.appendChild(body);
    pop.appendChild(el("div", "cc-pop-foot", "abort skips dependents · continue/degrade start them anyway. Save plan to persist."));
    function commit() {
      if (!manage.checked) { delete workingPlan[name]; body.classList.add("cc-dis"); refreshChip(anchor, name); return; }
      body.classList.remove("cc-dis");
      var afterList = after.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var pr = { kind: probe.value }, pv = parseInt(port.value, 10);
      if (probe.value === "tcp" && pv > 0) pr.port = pv; if (probe.value === "running") pr.grace_seconds = 3;
      workingPlan[name] = { name: name, after: afterList, probe: pr, policy: pol.value }; refreshChip(anchor, name);
    }
    manage.addEventListener("change", commit);
    [after, probe, port, pol].forEach(function (n) { n.addEventListener("change", commit); n.addEventListener("input", commit); });
    probe.addEventListener("change", syncPort);
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect(), w = pop.offsetWidth || 320;
    pop.style.left = Math.max(window.scrollX + 8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - w - 12)) + "px";
    pop.style.top = (window.scrollY + r.bottom + 6) + "px"; openPop = pop;
  }

  // ───────────────────────── save / apply + toast
  function collectPlan() { var nodes = []; Object.keys(workingPlan).forEach(function (k) { nodes.push(workingPlan[k]); }); return { nodes: nodes }; }
  function savePlan(thenApply) { flash(t("saving")); api("PUT", "plan", collectPlan()).then(function () { if (thenApply) return apply(); flash(t("saved")); }).catch(function (e) { flash("Error: " + e.message, true); }); }
  function apply() { flash(t("startorder") + "…"); return api("POST", "apply").then(function () { return load(); }).then(function () { flash(t("done")); }).catch(function (e) { flash("Error: " + e.message, true); }); }
  function flash(msg, bad) {
    try {
      if (menuStatusEl) { menuStatusEl.textContent = msg; menuStatusEl.className = "cc-menu-status " + (bad ? "cc-bad-text" : "cc-ok-text"); }
      if (!toastEl) { toastEl = el("div", "cc-toast"); document.body.appendChild(toastEl); }
      toastEl.textContent = msg; toastEl.className = "cc-toast cc-toast-show " + (bad ? "cc-bad-text" : "cc-ok-text");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { if (toastEl) toastEl.className = "cc-toast"; }, 2600);
    } catch (e) {}
  }

  // ───────────────────────── names datalist (for the editor's "depends on")
  function ensureNames() {
    var dl = document.getElementById("cc-names"); if (!dl) { dl = el("datalist"); dl.id = "cc-names"; document.body.appendChild(dl); }
    dl.innerHTML = ""; containerNames.forEach(function (n) { var o = el("option"); o.value = n; dl.appendChild(o); });
  }

  // ───────────────────────── run
  function load() {
    return Promise.all([api("GET", "state"), loadShiplog()]).then(function (res) {
      indexState(res[0]); ensureNames(); refresh();
      if (res[0] && res[0].docker_error) flash("docker: " + res[0].docker_error, true);
    }).catch(function (e) { flash("engine unreachable: " + e.message, true); });
  }
  function boot() {
    try {
      load();
      var pending = false;
      var mo = new MutationObserver(function () {
        if (mode !== "list" || pending) return;
        pending = true;
        setTimeout(function () { pending = false; try { injectHeaderGear(); tagRows(); } catch (e) {} }, 250);
      });
      try { var tb = nativeTable(); mo.observe(tb || document.body, { childList: true, subtree: true }); } catch (e) {}
      window.addEventListener("scroll", function () { try { if (menu) positionMenu(); } catch (e) {} }, true);
      setInterval(function () { try { if (!openPop && mode === "grid") refreshStats(); } catch (e) {} }, 3500);
      setInterval(function () { try { if (!openPop && !menu) load(); } catch (e) {} }, 9000);
      document.addEventListener("click", function (e) { try { if (openPop && !openPop.contains(e.target) && !e.target.closest(".cc-chip")) closePop(); if (menu && !menu.contains(e.target) && !e.target.closest(".cc-hgear")) closeMenu(); } catch (e2) {} });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") { try { closePop(); closeMenu(); } catch (e2) {} } });
    } catch (e) { /* a failure here must never break Unraid's page */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
