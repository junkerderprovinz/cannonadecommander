/* CannonadeCommander - Docker tab enhancer.
 *
 * Turns EVERY datum in Unraid's native container row into a clean, uniform BADGE
 * and hides the native clutter (the green play glyph + "started" text), with NO
 * bar or section of our own. The heavy lifting is done by CSS: we add classes to
 * the persistent <table id=docker_containers> and the CSS restyles the native
 * cells (update status, force-update, image tag, network, IP, port, LAN, CPU/RAM)
 * into pills IN PLACE. The native elements stay live (Unraid's nchan websocket
 * keeps CPU/RAM ticking), clickable (start/stop stays on the icon's context menu)
 * and sortable (the .appname sort key is untouched). JS only ADDS a clickable
 * start/stop badge, the plan chip, and the Container-ID / "Von" badges per row,
 * plus the single gear in the table header that holds the global controls.
 *
 * Ground truth for every selector below is Unraid's webgui master source
 * (dynamix.docker.manager/include/DockerContainers.php + DockerContainers.page).
 *
 * Everything is idempotent + wrapped in try/catch, and SELF-REMOVING: if the
 * same-origin proxy 404s (the plugin was uninstalled) we tear the whole thing
 * down, so nothing lingers even from a cached page. #docker_list (the tbody) is
 * re-rendered wholesale every 3-5s, so per-row injection is re-applied via a
 * debounced MutationObserver; the table + <thead> persist, so our CSS classes
 * and header gear survive re-renders without churn.
 */
(function () {
  "use strict";

  var PROXY = "/plugins/cannonadecommander/server/api.php";
  var SHIPLOG = "/plugins/shiplog/server/status.php";
  var VIEW_KEY = "cc.view", COLS_KEY = "cc.colview"; // cols2: reset stale v0.3 prefs
  var MARK = "data-cc", ROWMARK = "data-cc-row";
  var PROBES = ["health", "running", "tcp"], POLICIES = ["abort", "continue", "degrade"];
  var SCHED_ACTIONS = ["start", "stop", "restart"];
  var LANG = (document.documentElement.lang || navigator.language || "en").slice(0, 2).toLowerCase();
  // Mon-first day toggles; value is Go's time.Weekday (0=Sun..6=Sat).
  var DAYS = LANG === "de"
    ? [["Mo", 1], ["Di", 2], ["Mi", 3], ["Do", 4], ["Fr", 5], ["Sa", 6], ["So", 0]]
    : [["Mo", 1], ["Tu", 2], ["We", 3], ["Th", 4], ["Fr", 5], ["Sa", 6], ["Su", 0]];

  var T = {
    de: { uptodate: "Aktuell", update: "Update", start: "Starten", stop: "Stoppen", restart: "Neustart", pause: "Pause", resume: "Fortsetzen", force: "Update erzwingen", save: "Plan speichern", startorder: "In Reihenfolge starten", filter: "filtern…", cols: "Badges", view: "Ansicht", list: "Liste", grid: "Raster", plan: "Startplan", done: "erledigt", saving: "speichere…", saved: "gespeichert", after: "nach", active: "aktiv", watchdog: "Watchdog (Auto-Neustart)", wUnhealthy: "bei „unhealthy“", wExit: "bei Absturz (nicht bei normalem Stopp)", wMax: "max./Std.", schedules: "Zeitpläne", addsched: "+ Zeitplan", remove: "entfernen" },
    en: { uptodate: "up to date", update: "Update", start: "Start", stop: "Stop", restart: "Restart", pause: "Pause", resume: "Resume", force: "Force update", save: "Save plan", startorder: "Start in order", filter: "filter…", cols: "Badges", view: "View", list: "List", grid: "Grid", plan: "Plan", done: "done", saving: "saving…", saved: "saved", after: "after", active: "active", watchdog: "Watchdog (auto-restart)", wUnhealthy: "when unhealthy", wExit: "on crash (not on a normal stop)", wMax: "max/hour", schedules: "Schedules", addsched: "+ schedule", remove: "remove" },
  };
  function t(k) { return (T[LANG] || T.en)[k] || T.en[k]; }
  var STATE_LABELS = {
    de: { running: "läuft", exited: "gestoppt", created: "erstellt", paused: "pausiert", restarting: "startet neu", removing: "wird entfernt", dead: "tot" },
    en: { running: "running", exited: "stopped", created: "created", paused: "paused", restarting: "restarting", removing: "removing", dead: "dead" },
  };
  function stateLabel(s) { var m = STATE_LABELS[LANG] || STATE_LABELS.en; return m[s] || s || "?"; }

  var mode = localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  var containers = [], containerNames = [], stats = {}, shiplog = {}, workingPlan = {}, lastRun = {}, iconCache = {};
  // Automation config (schedules + watchdogs + notify) lives on the flash next to
  // the plan; loaded whole, mutated per-container in the editor, and PUT back whole.
  var config = { schedules: [], watchdogs: [], notify: { unraid: false, webhook: "" } };
  var filterText = "", gridHolder = null, openPop = null, menu = null, menuAnchor = null, menuStatusEl = null, toastEl = null, toastTimer = null;
  var mo = null, dead = false, lastAdv = false, timers = [], moPending = false, moTimer = null;

  // ───────────────────────── api + helpers
  function api(method, path, body, query) {
    var opts = { method: method, headers: { Accept: "application/json" } };
    if (body != null) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    var url = PROXY + "?path=" + encodeURIComponent(path); if (query) url += "&" + query;
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (t2) {
        var data = null; try { data = t2 ? JSON.parse(t2) : null; } catch (e) { data = null; }
        if (!r.ok) { var err = new Error((data && data.error) ? data.error : "HTTP " + r.status); err.status = r.status; throw err; }
        return data;
      });
    });
  }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function norm(s) { return String(s || "").trim().toLowerCase(); }
  function humanBytes(b) { if (!b) return "0"; var u = ["B", "K", "M", "G", "T"], i = 0, n = b; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10) + u[i]; }

  // ───────────────────────── native table (source-verified selectors)
  function nativeTable() { var l = document.getElementById("docker_list"); if (l) return l.closest("table") || l.parentNode; return document.getElementById("docker_containers") || document.querySelector("table#docker_containers"); }
  function headerRow() { var tb = nativeTable(); if (!tb || tb.tagName !== "TABLE") return null; return tb.querySelector("thead tr:last-child") || tb.querySelector("thead tr") || null; }
  function isFolderHeader(tr) { return !!(tr.classList.contains("folder") || tr.querySelector(":scope > td.folder-name, :scope > td.folder-update")); }
  function findRows() {
    var cands = ["#docker_list tr.sortable, #docker_list tr.folder-element", "#docker_list > tr", "table#docker_containers tbody tr", "table.tablesorter tbody tr", "div.tabs table tbody tr", "table tbody tr"];
    for (var i = 0; i < cands.length; i++) {
      var rows = Array.prototype.slice.call(document.querySelectorAll(cands[i])).filter(function (tr) { return !isFolderHeader(tr) && !tr.classList.contains("advanced") && (tr.querySelector("td.ct-name, td.updatecolumn") || (tr.querySelector("img") && tr.textContent.trim().length > 1)); });
      if (rows.length) return rows;
    }
    return [];
  }
  function rowName(tr) { var a = tr.querySelector("td.ct-name .appname"); if (a && a.textContent.trim()) return a.textContent.trim(); var id = tr.id || ""; if (/^ct-/.test(id)) return id.slice(3); var img = tr.querySelector("img"); var cell = img ? (img.closest("td") || tr) : tr; var link = cell.querySelector("a"); return (link && link.textContent.trim() ? link.textContent.trim() : (cell.textContent || tr.textContent).trim().split("\n")[0].trim()); }
  function hideNative(hide) { var tb = nativeTable(); if (tb) tb.style.display = hide ? "none" : ""; }
  // container state from the native glyph <i id='load-..' class='fa fa-play|pause|square ..'>
  function glyphState(g) { if (!g) return ""; var c = " " + (g.className || "") + " "; if (/\bfa-play\b/.test(c)) return "running"; if (/\bfa-pause\b/.test(c)) return "paused"; if (/\bfa-square\b/.test(c)) return "exited"; return ""; }
  // Unraid's Advanced/Basic view is a cookie + global .advanced/.basic toggle (no body class).
  function isAdvancedView() {
    try { var m = document.cookie.match(/(?:^|;\s*)docker_listview_mode=([^;]+)/); if (m) return decodeURIComponent(m[1]) === "advanced"; var a = document.querySelector("#docker_list .advanced"); return a ? getComputedStyle(a).display !== "none" : false; } catch (e) { return false; }
  }
  function readContainerId(advDiv) { try { var m = /container id[:\s]+([0-9a-f]{6,})/i.exec(advDiv.textContent || ""); return m ? m[1] : ""; } catch (e) { return ""; } }

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
  function loadConfig() {
    return api("GET", "config").then(function (c) {
      if (c && typeof c === "object") config = { schedules: c.schedules || [], watchdogs: c.watchdogs || [], notify: c.notify || { unraid: false, webhook: "" } };
    }).catch(function () { /* older engine or transient: keep the current config */ });
  }
  function watchdogFor(name) { var k = norm(name); for (var i = 0; i < config.watchdogs.length; i++) if (norm(config.watchdogs[i].name) === k) return config.watchdogs[i]; return null; }
  function schedulesFor(name) { var k = norm(name); return config.schedules.filter(function (s) { return norm(s.name) === k; }); }
  // Replace this container's entries in the whole-config, leaving every other
  // container (and notify) untouched, so a per-row save never clobbers the rest.
  function setWatchdog(name, wd) { var k = norm(name); config.watchdogs = config.watchdogs.filter(function (w) { return norm(w.name) !== k; }); if (wd) config.watchdogs.push(wd); }
  function setSchedules(name, list) { var k = norm(name); config.schedules = config.schedules.filter(function (s) { return norm(s.name) !== k; }); list.forEach(function (s) { config.schedules.push(s); }); }
  function containerByName(name) { var k = norm(name); for (var i = 0; i < containers.length; i++) if (norm(containers[i].name) === k) return containers[i]; return null; }
  // The plan badge's LABEL already says "Startplan"; the value only adds detail
  // (or nothing when unmanaged) so the chip never reads "Startplan Startplan".
  function depsTxt(node) { return node ? (node.after && node.after.length ? t("after") + " " + node.after.join(", ") : t("active")) : ""; }
  function iconFor(name) {
    if (iconCache[name] !== undefined) return iconCache[name];
    var src = "", row = document.getElementById("ct-" + name), img = row && row.querySelector("img");
    if (!img) { var all = document.querySelectorAll("#docker_containers img, #docker_list img"); for (var i = 0; i < all.length; i++) { var tr = all[i].closest("tr"); if (tr && norm(rowName(tr)) === norm(name)) { img = all[i]; break; } } }
    if (img) src = img.getAttribute("src") || ""; iconCache[name] = src; return src;
  }

  // ───────────────────────── badge builders (uniform)
  function stateBadge(c) { var s = (c && c.state) || "unknown", b = el("span", "cc-badge cc-badge-" + s, stateLabel(s)); if (c && c.health === "unhealthy") { b.classList.add("cc-badge-alert"); b.textContent = stateLabel(s) + " ✕"; } else if (c && c.health === "starting") b.textContent = stateLabel(s) + " …"; return b; }
  function stateToggle(name, state) {
    var s = state || "unknown", b = el("span", "cc-badge cc-badge-" + s + " cc-badge-toggle", stateLabel(s));
    var action = s === "running" ? "stop" : (s === "paused" ? "unpause" : "start");
    b.title = t(action === "stop" ? "stop" : action === "unpause" ? "resume" : "start");
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); doAction(name, action); });
    return b;
  }
  function badgeInfo(label, value, kind) { var b = el("span", "cc-b cc-b-info" + (kind ? " cc-b-" + kind : "")); b.appendChild(el("span", "cc-b-k", label)); b.appendChild(el("span", "cc-b-v", value)); return b; }
  function planBadge(name) {
    var node = workingPlan[name], wdOn = !!watchdogFor(name), schedN = schedulesFor(name).length, auto = wdOn || schedN > 0;
    var chip = el("a", "cc-b cc-plan" + (node ? " cc-plan-on" : "") + (auto ? " cc-plan-auto" : ""));
    chip.href = "#"; chip.innerHTML = '<span class="cc-b-k">⛓ ' + t("plan") + '</span><span class="cc-b-v"></span>';
    chip.querySelector(".cc-b-v").textContent = depsTxt(node);
    chip.title = "start order for " + name + (wdOn ? " · watchdog" : "") + (schedN ? " · " + schedN + "× " + t("schedules").toLowerCase() : "");
    // a small marker so the row shows at a glance that automation is attached
    if (auto) { var m = el("span", "cc-plan-mark"); m.textContent = (wdOn ? "⏻" : "") + (schedN ? "⏱" : ""); chip.appendChild(m); }
    chip.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openEditor(chip, name); });
    return chip;
  }
  function lastRunPill(name) { var lr = lastRun[name]; if (!lr) return null; var p = el("span", "cc-pill cc-pill-" + lr.state, lr.state); p.title = lr.reason || ""; return p; }

  // ───────────────────────── column model → CSS classes on the table + JS badge gates
  // Everything defaults ON: the user wants every datum as a badge. Advanced-only
  // data (image tag, CPU/RAM, container-ID, Von) only shows in Unraid's Advanced
  // view because the native elements are .advanced (hidden by Unraid in Basic).
  var COLS = [
    { key: "update", label: { de: "Update-Status", en: "Update status" } },
    { key: "force", label: { de: "Update erzwingen", en: "Force update" } },
    { key: "version", label: { de: "Image-Tag", en: "Image tag" } },
    { key: "net", label: { de: "Netzwerk / IP / Port", en: "Network / IP / Port" } },
    { key: "res", label: { de: "CPU / RAM", en: "CPU / RAM" } },
    { key: "id", label: { de: "Container-ID", en: "Container ID" } },
    { key: "von", label: { de: "Von / Quelle", en: "From / source" } },
    { key: "plan", label: { de: "Startplan", en: "Plan" } },
  ];
  // Per-view visibility matrix: each column can show in the Simple and/or Advanced
  // view (set in the Settings page). {s,a} = show in simple / advanced. Defaults:
  // advanced-detail badges (force/version/res/id/von) only in advanced.
  function defaultColview() {
    var adv = { s: false, a: true }, both = { s: true, a: true };
    // res (CPU/RAM) defaults ON in both views — it is a headline feature, and the
    // CSS force-shows the native resource column even in Simple view.
    return { update: both, force: adv, version: adv, net: both, res: both, id: adv, von: adv, plan: both };
  }
  function loadColview() {
    try { var j = JSON.parse(localStorage.getItem(COLS_KEY) || "null"); if (j && typeof j === "object") { var d = defaultColview(); Object.keys(d).forEach(function (k) { if (j[k]) d[k] = { s: !!j[k].s, a: !!j[k].a }; }); return d; } } catch (e) {}
    return defaultColview();
  }
  var colview = loadColview();
  function colOn(key) { var v = colview[key]; if (!v) return true; return isAdvancedView() ? !!v.a : !!v.s; }

  // Settings (localStorage): accent colour + row density → CSS variables; picked up
  // live from the Settings page (which writes the same keys + a poke event).
  // hue of a hex colour (for the icon tint), or -1 if unparseable.
  function hexHue(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return -1; var n = parseInt(m[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0; if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return h; }
  function applySettings() {
    try {
      var root = document.documentElement.style;
      var accent = localStorage.getItem("cc.accent"); if (accent) root.setProperty("--cc-accent", accent);
      var dens = localStorage.getItem("cc.density"); root.setProperty("--cc-density", { compact: "5px", normal: "9px", airy: "14px" }[dens] || "9px");
      // icon tint: approximate a colour via grayscale+sepia+hue-rotate+saturate.
      var ic = localStorage.getItem("cc.iconcolor"), hue = hexHue(ic);
      if (ic && hue >= 0) { var s = parseInt(localStorage.getItem("cc.iconstrength") || "100", 10); root.setProperty("--cc-icon-filter", "grayscale(1) sepia(1) hue-rotate(" + Math.round(hue - 50) + "deg) saturate(" + (Math.max(10, s) / 100 * 5 + 0.6) + ")"); }
      else { root.removeProperty("--cc-icon-filter"); }
      colview = loadColview();
    } catch (e) {}
  }

  // CSS-driven cell → pill styling. Toggling a class flips that badge kind on/off
  // for the CURRENT view (Simple/Advanced), per the visibility matrix; also carries
  // the rainbow + icon-tint modes chosen in the Settings page.
  function applyEnhanceClasses() {
    try {
      var tb = nativeTable(); if (!tb || tb.tagName !== "TABLE") return;
      tb.classList.add("cc-enh"); tb.classList.toggle("cc-adv", isAdvancedView());
      tb.classList.toggle("cc-rainbow", localStorage.getItem("cc.rainbow") === "1");
      tb.classList.toggle("cc-tint-icons", !!localStorage.getItem("cc.iconcolor"));
      COLS.forEach(function (c) { tb.classList.toggle("cc-c-" + c.key, colOn(c.key)); });
    } catch (e) {}
  }
  function removeEnhanceClasses() { try { var tb = nativeTable(); if (!tb) return; tb.classList.remove("cc-enh", "cc-adv", "cc-rainbow", "cc-tint-icons"); COLS.forEach(function (c) { tb.classList.remove("cc-c-" + c.key); }); } catch (e) {} }

  // read a positional cell's value (docker_readmore), stripping nested advanced
  // (MAC) + Tailscale tooltip, collapsed to one short line.
  function readmoreText(tr, n) {
    try {
      var cell = tr.querySelector(":scope > td:nth-child(" + n + ")"); if (!cell) return "";
      var rm = cell.querySelector("span.docker_readmore") || cell;
      var clone = rm.cloneNode(true);
      Array.prototype.slice.call(clone.querySelectorAll(".advanced, .TS_tooltip, script, style")).forEach(function (x) { x.remove(); });
      return (clone.textContent || "").trim().replace(/\s+/g, " ").slice(0, 42);
    } catch (e) { return ""; }
  }

  // ───────────────────────── LIST mode: per-row JS badges, thematically placed
  function injectRowBadges(tr) {
    try {
      if (tr.getAttribute(ROWMARK)) return;
      tr.setAttribute(ROWMARK, "1");
      var name = rowName(tr);
      if (filterText) tr.style.display = (norm(name).indexOf(filterText) >= 0) ? "" : "none";
      var nameCell = tr.querySelector("td.ct-name"), upCell = tr.querySelector("td.updatecolumn");
      var adv = isAdvancedView(), c = containerByName(name);

      // ── NAME cell (col 1): start/stop badge, and BENEATH it Container-ID / Von ──
      if (nameCell) {
        var glyph = nameCell.querySelector(".inner i[id^='load-']");
        var st = glyphState(glyph) || (c && c.state) || "unknown";
        var meta = el("div", "cc-namemeta"); meta.setAttribute(MARK, "1");
        var sb = stateToggle(name, st); if (c && c.health === "unhealthy") { sb.classList.add("cc-badge-alert"); sb.textContent = stateLabel(st) + " ✕"; }
        meta.appendChild(sb);
        var advDiv = nameCell.querySelector(":scope > div.advanced");
        if (advDiv) {
          var idrow = el("div", "cc-namemeta-ids"), added = false;
          if (colOn("id")) { var cid = readContainerId(advDiv); if (cid) { idrow.appendChild(badgeInfo("ID", cid.slice(0, 12), "id")); added = true; } }
          if (colOn("von")) { var a = advDiv.querySelector("a[target='_blank']"); if (a && a.textContent.trim()) { var vb = badgeInfo("Von", a.textContent.trim(), "von"); vb.title = a.getAttribute("href") || ""; idrow.appendChild(vb); added = true; } }
          if (added) { advDiv.classList.add("cc-hidden"); meta.appendChild(idrow); }
        }
        var inner = nameCell.querySelector(".inner") || nameCell; inner.appendChild(meta);
      }

      // ── CPU/RAM limits editor: a small gear on the resource cell ──
      if (colOn("res")) {
        var cpuCell = tr.querySelector(":scope > td.advanced");
        if (cpuCell && !cpuCell.querySelector(".cc-limbtn")) {
          var lb = el("span", "cc-limbtn"); lb.setAttribute(MARK, "1"); lb.textContent = "⚙"; lb.title = "CPU/RAM-Limits";
          lb.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openLimits(lb, name); });
          cpuCell.appendChild(lb);
        }
      }

      // ── VERSION cell (col 2): native update/force/tag pills stay (CSS); add last-run ──
      if (upCell) { var p = lastRunPill(name); if (p) { var lh = el("div", "cc-rowbadges"); lh.setAttribute(MARK, "1"); lh.appendChild(p); upCell.appendChild(lh); } }

      // ── NETWORK group (col 3): consolidate Netzwerk / Container IP / LAN IP / Port ──
      if (colOn("net")) {
        var c3 = tr.querySelector(":scope > td:nth-child(3)");
        if (c3) {
          var netTxt = readmoreText(tr, 3), ipTxt = readmoreText(tr, 4), portTxt = readmoreText(tr, 5), lanTxt = readmoreText(tr, 6);
          var g = el("div", "cc-rowbadges cc-netgroup"); g.setAttribute(MARK, "1");
          if (netTxt) g.appendChild(badgeInfo("Netzwerk", netTxt, "net"));
          if (ipTxt) g.appendChild(badgeInfo("Container IP", ipTxt, "ip"));
          if (lanTxt) g.appendChild(badgeInfo("LAN IP", lanTxt, "lan"));
          if (portTxt) g.appendChild(badgeInfo("Port", portTxt, "port"));
          var nrm = c3.querySelector("span.docker_readmore"); if (nrm) nrm.classList.add("cc-hidden");
          if (g.children.length) c3.appendChild(g);
        }
      }

      // ── PLAN chip → autostart cell (col 9), grouped with the native autostart toggle ──
      if (colOn("plan")) {
        var c9 = tr.querySelector(":scope > td:nth-child(9)");
        if (c9) { var ph = el("div", "cc-rowbadges cc-planholder"); ph.setAttribute(MARK, "1"); ph.appendChild(planBadge(name)); c9.appendChild(ph); }
      }
    } catch (e) { /* one bad row must never break Unraid's page */ }
  }
  function injectAllRowBadges() { findRows().forEach(injectRowBadges); }
  function clearRowBadges() {
    var root = document.getElementById("docker_list") || nativeTable() || document; // scope to the list, not the whole page
    Array.prototype.slice.call(root.querySelectorAll("[" + MARK + "]")).forEach(function (n) { n.remove(); });
    Array.prototype.slice.call(root.querySelectorAll("[" + ROWMARK + "]")).forEach(function (n) { n.removeAttribute(ROWMARK); });
    Array.prototype.slice.call(root.querySelectorAll(".cc-hidden")).forEach(function (n) { n.classList.remove("cc-hidden"); });
  }
  function reinjectRowBadges() { clearRowBadges(); injectAllRowBadges(); }

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

  // ───────────────────────── GRID mode (engine-driven cards)
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
    if (c.network) badges.appendChild(badgeInfo("NET", c.network, "net"));
    if (c.ip) badges.appendChild(badgeInfo("IP", c.ip, "ip"));
    if (c.ports && c.ports.length) badges.appendChild(badgeInfo("PORT", c.ports.join(" "), "port"));
    if (badges.children.length) wrap.appendChild(badges);
    var act = el("div", "cc-card-actions");
    act.appendChild(lifecycle(c));
    act.appendChild(planBadge(c.name));
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
    gridHolder.classList.toggle("cc-rainbow", localStorage.getItem("cc.rainbow") === "1");
    gridHolder.classList.toggle("cc-tint-icons", !!localStorage.getItem("cc.iconcolor"));
    var grid = el("div", "cc-grid");
    containers.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) { grid.appendChild(card(c)); });
    gridHolder.appendChild(grid);
  }

  // ───────────────────────── gear + menu (the only global control surface)
  function makeGear(extra) { var g = el("button", "cc-hgear" + (extra ? " " + extra : ""), "⚙"); g.type = "button"; g.title = "CannonadeCommander"; g.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); toggleMenu(g); }); return g; }
  function injectHeaderGear() {
    try {
      // Global idempotency: never place a second list-mode gear once one exists.
      if (document.querySelector(".cc-hgear:not(.cc-hgear-grid)")) return true;
      // Preferred home: as a small icon in Unraid's Advanced/Basic view toggle bar.
      var tv = document.querySelector("div.ToggleViewMode");
      if (tv && tv.parentNode) { if (tv.parentNode.querySelector(".cc-hgear-bar")) return true; tv.parentNode.insertBefore(makeGear("cc-hgear-bar"), tv); return true; }
      var tb = nativeTable(); if (!tb) return false;
      var hr = headerRow();
      if (hr) { if (hr.querySelector(".cc-hgear")) return true; var th = hr.querySelector("th"); if (th) { th.appendChild(makeGear("cc-hgear-th")); return true; } }
      var wrap = tb.parentNode;
      if (wrap && !wrap.querySelector(".cc-hgear-float")) { try { if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative"; } catch (e) {} wrap.appendChild(makeGear("cc-hgear-float")); }
      return true;
    } catch (e) { return false; }
  }
  function menuHead(txt) { return el("div", "cc-menu-h", txt); }
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
    m.appendChild(el("div", "cc-menu-sep"));
    var prow = el("div", "cc-menu-row cc-menu-plain");
    var save = el("button", "cc-btn", t("save")), fire = el("button", "cc-btn cc-btn-primary", t("startorder"));
    save.addEventListener("click", function () { savePlan(false); }); fire.addEventListener("click", function () { savePlan(true); });
    prow.appendChild(save); prow.appendChild(fire); m.appendChild(prow);
    var link = el("a", "cc-menu-link", "⚙ " + (LANG === "de" ? "Einstellungen (Farbe, Spalten)…" : "Settings (color, columns)…"));
    link.href = "/Settings/CannonadeCommander"; m.appendChild(link);
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
  function toggleMenu(anchor) { if (menu) closeMenu(); else openMenu(anchor); }

  // ───────────────────────── mode
  function setMode(m) { mode = m; localStorage.setItem(VIEW_KEY, m); refresh(); }
  function refresh() { applyMode(); if (mode === "grid") refreshStats(); }
  function applyMode() {
    try {
      if (dead) return;
      if (mode === "grid") { removeEnhanceClasses(); clearRowBadges(); hideNative(true); renderGrid(); }
      else { hideNative(false); removeGridHolder(); applyEnhanceClasses(); injectAllRowBadges(); }
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
  function refreshChip(chip, name) { var node = workingPlan[name]; chip.classList.toggle("cc-plan-on", !!node); var v = chip.querySelector(".cc-b-v"); if (v) v.textContent = depsTxt(node); }
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
    var drow = el("div", "cc-pop-row"); drow.appendChild(el("label", "cc-pop-lbl", "Start delay"));
    var delay = el("input", "cc-in cc-port"); delay.type = "number"; delay.min = "0"; delay.placeholder = "sec"; delay.value = node.delay_seconds ? node.delay_seconds : "";
    drow.appendChild(delay); drow.appendChild(el("span", null, " " + (LANG === "de" ? "Sek. vor dem Start warten" : "sec to wait before starting"))); body.appendChild(drow);
    var prow = el("div", "cc-pop-row"); prow.appendChild(el("label", "cc-pop-lbl", "Ready when"));
    var probe = el("select", "cc-in"); PROBES.forEach(function (p) { var o = el("option", null, p); o.value = p; if (node.probe && node.probe.kind === p) o.selected = true; probe.appendChild(o); });
    var port = el("input", "cc-in cc-port"); port.type = "number"; port.placeholder = "port"; port.value = (node.probe && node.probe.port) ? node.probe.port : "";
    var syncPort = function () { port.style.display = probe.value === "tcp" ? "" : "none"; }; syncPort();
    prow.appendChild(probe); prow.appendChild(port); body.appendChild(prow);
    var polrow = el("div", "cc-pop-row"); polrow.appendChild(el("label", "cc-pop-lbl", "On fail"));
    var pol = el("select", "cc-in"); POLICIES.forEach(function (p) { var o = el("option", null, p); o.value = p; if (node.policy === p) o.selected = true; pol.appendChild(o); });
    polrow.appendChild(pol); body.appendChild(polrow); pop.appendChild(body);
    pop.appendChild(el("div", "cc-pop-foot", "abort skips dependents · continue/degrade start them anyway."));

    // ── Watchdog (auto-restart) — independent of plan membership ──
    var wd = watchdogFor(name);
    var wSec = el("div", "cc-pop-auto");
    var wHead = el("label", "cc-pop-row cc-pop-toggle"), wEn = el("input"); wEn.type = "checkbox"; wEn.checked = !!(wd && wd.enabled);
    wHead.appendChild(wEn); wHead.appendChild(el("span", "cc-pop-sech", t("watchdog"))); wSec.appendChild(wHead);
    var wBody = el("div", "cc-pop-sub" + (wEn.checked ? "" : " cc-dis"));
    var wUrow = el("label", "cc-pop-row"), wU = el("input"); wU.type = "checkbox"; wU.checked = wd ? !!wd.on_unhealthy : true;
    wUrow.appendChild(wU); wUrow.appendChild(el("span", null, " " + t("wUnhealthy"))); wBody.appendChild(wUrow);
    var wXrow = el("label", "cc-pop-row"), wX = el("input"); wX.type = "checkbox"; wX.checked = wd ? !!wd.on_exit : false;
    wXrow.appendChild(wX); wXrow.appendChild(el("span", null, " " + t("wExit"))); wBody.appendChild(wXrow);
    var wMrow = el("div", "cc-pop-row"); wMrow.appendChild(el("label", "cc-pop-lbl", t("wMax")));
    // Default a NEW watchdog to a sane per-hour cap (not unlimited), so a flapping
    // container is bounded and yields a single "gave up" instead of restarting
    // forever. An existing watchdog keeps its saved value; blank = 0 = unlimited.
    var wM = el("input", "cc-in cc-port"); wM.type = "number"; wM.min = "0"; wM.placeholder = "0 = ∞"; wM.value = wd ? (wd.max_restarts ? wd.max_restarts : "") : "6";
    wMrow.appendChild(wM); wBody.appendChild(wMrow); wSec.appendChild(wBody);
    wEn.addEventListener("change", function () { wBody.classList.toggle("cc-dis", !wEn.checked); });
    pop.appendChild(wSec);
    function readWatchdog() { if (!wEn.checked) return null; return { name: name, enabled: true, on_unhealthy: !!wU.checked, on_exit: !!wX.checked, max_restarts: parseInt(wM.value, 10) || 0 }; }

    // ── Schedules (timed lifecycle actions) — independent of plan membership ──
    function schedRow(s) {
      var row = el("div", "cc-sched-row");
      var act2 = el("select", "cc-in cc-sched-act"); SCHED_ACTIONS.forEach(function (a) { var o = el("option", null, t(a)); o.value = a; if (s && s.action === a) o.selected = true; act2.appendChild(o); });
      var time = el("input", "cc-in cc-sched-time"); time.type = "time"; time.value = (s && s.time) || "";
      var days = el("div", "cc-days"), sel = {}; ((s && s.days) || []).forEach(function (d) { sel[d] = true; });
      DAYS.forEach(function (d) { var b = el("button", "cc-day" + (sel[d[1]] ? " cc-day-on" : ""), d[0]); b.type = "button"; b.dataset.day = d[1]; b.addEventListener("click", function (e) { e.preventDefault(); b.classList.toggle("cc-day-on"); }); days.appendChild(b); });
      var rm = el("span", "cc-sched-x", "✕"); rm.title = t("remove"); rm.addEventListener("click", function () { row.remove(); });
      row.appendChild(act2); row.appendChild(time); row.appendChild(days); row.appendChild(rm);
      // empty days = every day; only rows with a valid HH:MM time are saved
      row._read = function () { if (!/^\d{2}:\d{2}$/.test(time.value)) return null; var ds = []; Array.prototype.slice.call(days.children).forEach(function (x) { if (x.classList.contains("cc-day-on")) ds.push(parseInt(x.dataset.day, 10)); }); var o = { name: name, action: act2.value, time: time.value, enabled: true }; if (ds.length) o.days = ds; return o; };
      return row;
    }
    var sSec = el("div", "cc-pop-auto"); sSec.appendChild(el("div", "cc-pop-sech cc-pop-sech-lone", t("schedules")));
    var sList = el("div", "cc-sched-list"); schedulesFor(name).forEach(function (s) { sList.appendChild(schedRow(s)); }); sSec.appendChild(sList);
    var addB = el("button", "cc-btn cc-btn-sm", t("addsched")); addB.type = "button"; addB.addEventListener("click", function () { sList.appendChild(schedRow(null)); }); sSec.appendChild(addB);
    pop.appendChild(sSec);
    function readSchedules() { var out = []; Array.prototype.slice.call(sList.children).forEach(function (r) { if (r._read) { var v = r._read(); if (v) out.push(v); } }); return out; }

    // Plan actions live here now (the Docker-tab gear is gone): save the whole plan
    // AND this container's automation, or run it in dependency order immediately.
    var act = el("div", "cc-pop-row cc-pop-act");
    var bSave = el("button", "cc-btn", t("save")), bRun = el("button", "cc-btn cc-btn-primary", t("startorder"));
    bSave.addEventListener("click", function () { saveEditor(name, readWatchdog(), readSchedules(), false); });
    bRun.addEventListener("click", function () { saveEditor(name, readWatchdog(), readSchedules(), true); });
    act.appendChild(bSave); act.appendChild(bRun); pop.appendChild(act);
    function commit() {
      if (!manage.checked) { delete workingPlan[name]; body.classList.add("cc-dis"); refreshChip(anchor, name); return; }
      body.classList.remove("cc-dis");
      var afterList = after.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var pr = { kind: probe.value }, pv = parseInt(port.value, 10);
      if (probe.value === "tcp" && pv > 0) pr.port = pv; if (probe.value === "running") pr.grace_seconds = 3;
      var dv = parseInt(delay.value, 10);
      var n = { name: name, after: afterList, probe: pr, policy: pol.value };
      if (dv > 0) n.delay_seconds = dv;
      workingPlan[name] = n; refreshChip(anchor, name);
    }
    manage.addEventListener("change", commit);
    [after, delay, probe, port, pol].forEach(function (n) { n.addEventListener("change", commit); n.addEventListener("input", commit); });
    probe.addEventListener("change", syncPort);
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect(), w = pop.offsetWidth || 320;
    pop.style.left = Math.max(window.scrollX + 8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - w - 12)) + "px";
    pop.style.top = (window.scrollY + r.bottom + 6) + "px"; openPop = pop;
  }

  // ───────────────────────── CPU/RAM limits editor (Docker container-update)
  // return 0 for an empty field (= leave unchanged), a positive value for a valid
  // limit, or -1 for unparseable input (comma decimals are normalised first).
  function parseMem(s) { s = String(s || "").trim().replace(",", "."); if (!s) return 0; var m = /^([\d.]+)\s*([kmgt]?)i?b?$/i.exec(s); if (!m) return -1; var mult = { "": 1, k: 1024, m: 1048576, g: 1073741824, t: 1099511627776 }[m[2].toLowerCase()]; return Math.round(parseFloat(m[1]) * mult); }
  function parseCPU(s) { s = String(s || "").trim().replace(",", "."); if (!s) return 0; if (!/^[\d.]+$/.test(s)) return -1; var n = parseFloat(s); return n > 0 ? Math.round(n * 1e9) : 0; }
  function fmtMem(b) { if (b >= 1073741824) return (Math.round(b / 1073741824 * 100) / 100) + "G"; if (b >= 1048576) return Math.round(b / 1048576) + "M"; return String(b); }
  function openLimits(anchor, name) {
    closePop();
    var pop = el("div", "cc-pop"), head = el("div", "cc-pop-head"); head.appendChild(el("b", null, name + " — CPU / RAM"));
    var x = el("span", "cc-pop-x", "✕"); x.addEventListener("click", closePop); head.appendChild(x); pop.appendChild(head);
    var body = el("div", "cc-pop-body");
    var mrow = el("div", "cc-pop-row"); mrow.appendChild(el("label", "cc-pop-lbl", "RAM-Limit"));
    var mem = el("input", "cc-in"); mem.type = "text"; mem.placeholder = "z.B. 2G · 512M · leer = unverändert"; mrow.appendChild(mem); body.appendChild(mrow);
    var crow = el("div", "cc-pop-row"); crow.appendChild(el("label", "cc-pop-lbl", "CPU-Limit"));
    var cpu = el("input", "cc-in"); cpu.type = "text"; cpu.placeholder = "z.B. 1.5 · leer = unverändert"; crow.appendChild(cpu); body.appendChild(crow);
    pop.appendChild(body);
    pop.appendChild(el("div", "cc-pop-foot", "Sofort per Docker-Update angewendet, kein Neustart. Leeres Feld lässt den Wert unverändert (ein bestehendes Limit ganz entfernen geht nur durch Neu-Erstellen des Containers)."));
    var srow = el("div", "cc-pop-row"); var save = el("button", "cc-btn cc-btn-primary", t("save")); srow.appendChild(save); pop.appendChild(srow);
    save.addEventListener("click", function () {
      var mb = parseMem(mem.value), nc = parseCPU(cpu.value);
      if (mb < 0 || nc < 0) { flash(LANG === "de" ? "Ungültige Eingabe" : "invalid value", true); return; }
      if (mb === 0 && nc === 0) { closePop(); return; }
      flash(t("saving")); api("POST", "limits", { name: name, mem_bytes: mb, nano_cpus: nc })
        .then(function () { flash(t("done")); closePop(); }).catch(function (e) { flash("Error: " + e.message, true); });
    });
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect(), w = pop.offsetWidth || 340;
    pop.style.left = Math.max(window.scrollX + 8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - w - 12)) + "px";
    pop.style.top = (window.scrollY + r.bottom + 6) + "px"; openPop = pop;
    api("GET", "limits", null, "name=" + encodeURIComponent(name)).then(function (l) { if (!l) return; if (l.mem_bytes > 0) mem.value = fmtMem(l.mem_bytes); if (l.nano_cpus > 0) cpu.value = String(Math.round(l.nano_cpus / 1e9 * 100) / 100); }).catch(function () {});
  }

  // ───────────────────────── save / apply + toast
  function collectPlan() { var nodes = []; Object.keys(workingPlan).forEach(function (k) { nodes.push(workingPlan[k]); }); return { nodes: nodes }; }
  function savePlan(thenApply) { flash(t("saving")); api("PUT", "plan", collectPlan()).then(function () { if (thenApply) return apply(); flash(t("saved")); }).catch(function (e) { flash("Error: " + e.message, true); }); }
  // Persist this container's automation (watchdog + schedules) AND the start plan,
  // then optionally run the plan. Config is PUT whole, so other containers' entries
  // and the notify block (set in Settings) are preserved. Config is saved FIRST and
  // independently: the automation is unrelated to the plan, so an invalid/stale
  // plan (a bad dependency) must never cause the watchdog/schedules to be lost.
  function saveEditor(name, wd, scheds, thenApply) {
    flash(t("saving"));
    // Read-modify-write: re-fetch the LIVE config, replace ONLY this container's
    // watchdog + schedules, then write it back — so notify (set in Settings) and
    // every other container's entries are preserved even if they changed since this
    // page loaded. If the fresh read fails we abort (no PUT), never wiping config.
    api("GET", "config")
      .then(function (fresh) {
        // Abort rather than fall back to an empty config: writing this container's
        // edits onto an empty base would wipe every other container + notify. The
        // engine always returns a config object on success, so this only guards the
        // unexpected (a null/garbage body), never a legitimate first save.
        if (!fresh || typeof fresh !== "object") throw new Error("config unreadable");
        config = { schedules: fresh.schedules || [], watchdogs: fresh.watchdogs || [], notify: fresh.notify || { unraid: false, webhook: "" } };
        setWatchdog(name, wd); setSchedules(name, scheds);
        return api("PUT", "config", config);
      })
      .then(function () { return api("PUT", "plan", collectPlan()); })
      .then(function () { closePop(); if (mode === "list") reinjectRowBadges(); else renderGrid(); if (thenApply) return apply(); flash(t("saved")); })
      .catch(function (e) { flash("Error: " + e.message, true); });
  }
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

  // ───────────────────────── observer + timers (factored so re-arm can restart them)
  function connectObserver() {
    try {
      if (!mo) mo = new MutationObserver(function () {
        if (dead || mode !== "list" || moPending) return;
        moPending = true;
        moTimer = setTimeout(function () {
          moTimer = null;
          if (dead) { moPending = false; return; } // a teardown may have fired during the debounce window
          try { applyEnhanceClasses(); injectAllRowBadges(); } catch (e) {}
          // release the guard AFTER our own DOM writes flush (defence vs a re-inject loop)
          Promise.resolve().then(function () { moPending = false; });
        }, 250);
      });
      // Observe ONLY #docker_list's direct children: Unraid replaces the tbody
      // wholesale every 3-5s (which we must re-tag), but subtree:false keeps the
      // per-second nchan CPU/RAM text ticks — and our own deep badge appends — from
      // waking the observer, so there is no tick-storm and no double sweep.
      var body = document.getElementById("docker_list");
      if (body) mo.observe(body, { childList: true }); else mo.observe(nativeTable() || document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  function startTimers() {
    lastAdv = isAdvancedView();
    // reinject id/Von + re-apply the advanced class on an Advanced/Basic flip
    // (Unraid's toggle has no reliable event, so poll the effective state)
    timers.push(setInterval(function () { try { if (dead || mode !== "list") return; var a = isAdvancedView(); if (a !== lastAdv) { lastAdv = a; applyEnhanceClasses(); reinjectRowBadges(); } } catch (e) {} }, 1500));
    // FAST, UNGATED liveness: the moment the proxy 404/410s (uninstalled) tear the
    // UI down — within ~4s, and NOT blocked by an open menu/popover like the 9s
    // poll. This is what makes an uninstall visibly clean up the open tab quickly.
    timers.push(setInterval(function () { try { if (dead) return; fetch(PROXY + "?path=" + encodeURIComponent("state"), { headers: { Accept: "application/json" } }).then(function (r) { if (r.status === 404 || r.status === 410) teardown(); }).catch(function () {}); } catch (e) {} }, 4000));
    timers.push(setInterval(function () { try { if (!dead && !openPop && mode === "grid") refreshStats(); } catch (e) {} }, 3500));
    timers.push(setInterval(function () { try { if (!dead && !openPop && !menu) load(); } catch (e) {} }, 9000));
  }

  // ───────────────────────── SELF-REMOVE + re-arm
  // On a 404/403/410 from the state proxy (the plugin's files are gone) tear the
  // whole thing down so nothing lingers, even in a cached tab. A persistent, low
  // rate re-probe keeps checking; when the proxy returns (a reinstall, or a
  // transient blip during an update) re-arm and rebuild — no page reload needed.
  function teardown() {
    try {
      if (dead) return;
      dead = true;
      if (mo) { try { mo.disconnect(); } catch (e) {} }
      if (moTimer) { clearTimeout(moTimer); moTimer = null; } // cancel an in-flight debounced sweep
      timers.forEach(function (id) { try { clearInterval(id); } catch (e) {} }); timers = [];
      try { closePop(); } catch (e) {} try { closeMenu(); } catch (e) {}
      removeEnhanceClasses();
      clearRowBadges();
      try { var rs = document.documentElement.style; ["--cc-icon-filter", "--cc-accent", "--cc-density"].forEach(function (p) { rs.removeProperty(p); }); } catch (e) {}
      Array.prototype.slice.call(document.querySelectorAll(".cc-hgear, .cc-grid-holder, .cc-menu, .cc-toast, .cc-pop, #cc-names")).forEach(function (n) { n.remove(); });
      hideNative(false);
    } catch (e) {}
  }
  function rearm() { try { if (!dead) return; dead = false; connectObserver(); startTimers(); load(); } catch (e) {} }

  // ───────────────────────── run
  function load() {
    if (dead) return Promise.resolve();
    return Promise.all([api("GET", "state"), loadShiplog(), loadConfig()]).then(function (res) {
      indexState(res[0]); ensureNames(); refresh();
      if (res[0] && res[0].docker_error) flash("docker: " + res[0].docker_error, true);
    }).catch(function (e) {
      // 404/410 = proxy file gone (uninstalled) → self-remove now; the re-probe
      // rebuilds if it ever returns. 502 = engine down but installed (do NOT tear
      // down); 403 = a transient auth/session blip (NOT an uninstall); 400 = a
      // disallowed path (a real bug — surface it).
      if (e && (e.status === 404 || e.status === 410)) { teardown(); return; }
      flash("engine unreachable: " + e.message, true);
    });
  }
  function boot() {
    try {
      applySettings();
      load();
      connectObserver();
      startTimers();
      // the Settings page (separate tab) writes cc.* keys → re-apply live here
      window.addEventListener("storage", function (e) {
        try {
          if (dead || !e.key || e.key.indexOf("cc.") !== 0) return;
          if (e.key === "cc.view") { setMode(localStorage.getItem("cc.view") === "grid" ? "grid" : "list"); return; }
          applySettings();
          if (mode === "list") { applyEnhanceClasses(); reinjectRowBadges(); }
          else if (mode === "grid") renderGrid();
        } catch (e2) {}
      });
      // persistent re-probe (NEVER cleared by teardown): rebuild when the proxy returns
      setInterval(function () { try { if (!dead) return; fetch(PROXY + "?path=" + encodeURIComponent("state"), { headers: { Accept: "application/json" } }).then(function (r) { if (r.ok) rearm(); }).catch(function () {}); } catch (e) {} }, 8000);
      window.addEventListener("scroll", function () { try { if (menu) positionMenu(); } catch (e) {} }, true);
      document.addEventListener("click", function (e) { try { if (openPop && !openPop.contains(e.target) && !e.target.closest(".cc-plan")) closePop(); if (menu && !menu.contains(e.target) && !e.target.closest(".cc-hgear")) closeMenu(); } catch (e2) {} });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") { try { closePop(); closeMenu(); } catch (e2) {} } });
    } catch (e) { /* a failure here must never break Unraid's page */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
