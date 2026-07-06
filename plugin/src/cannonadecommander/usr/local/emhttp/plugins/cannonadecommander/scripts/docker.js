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
  var PROBES = ["health", "running", "tcp", "http", "exec", "log"], POLICIES = ["abort", "continue", "degrade"];
  var SCHED_ACTIONS = ["start", "stop", "restart"];
  // The FRONTEND version, stamped by pkg_build.sh at package time. Shown next to the
  // engine version so a stale browser/plugin frontend is instantly distinguishable from
  // a stale daemon (repeated "it still doesn't work" turned out to be old UIs under test).
  var CC_VER = "@@CCVER@@"; if (CC_VER.indexOf("@@") === 0) CC_VER = "dev";
  var LANG = (document.documentElement.lang || navigator.language || "en").slice(0, 2).toLowerCase();
  // Mon-first day toggles; value is Go's time.Weekday (0=Sun..6=Sat).
  var DAYS = LANG === "de"
    ? [["Mo", 1], ["Di", 2], ["Mi", 3], ["Do", 4], ["Fr", 5], ["Sa", 6], ["So", 0]]
    : [["Mo", 1], ["Tu", 2], ["We", 3], ["Th", 4], ["Fr", 5], ["Sa", 6], ["Su", 0]];

  var T = {
    de: { uptodate: "Aktuell", update: "Update", start: "Starten", stop: "Stoppen", restart: "Neustart", pause: "Pause", resume: "Fortsetzen", force: "Update erzwingen", save: "Plan speichern", startorder: "In Reihenfolge starten", filter: "filtern…", cols: "Badges", view: "Ansicht", list: "Liste", grid: "Raster", plan: "Startplan", done: "erledigt", saving: "speichere…", saved: "gespeichert", after: "nach", active: "aktiv", watchdog: "Auto-Start", wUnhealthy: "bei „unhealthy“", wExit: "bei Absturz (nicht bei normalem Stopp)", wMax: "max./Std.", schedules: "Zeitpläne", addsched: "+ Zeitplan", remove: "entfernen", manage: "Im Startplan verwalten", dependsOn: "Hängt ab von", commaSep: "kommagetrennt", startDelay: "Startverzögerung", secWait: "Sek. vor dem Start warten", readyWhen: "Bereit wenn", onFail: "Bei Fehlschlag", failhint: "abort überspringt Abhängige · continue/degrade starten sie trotzdem.", ramLimit: "RAM-Limit", cpuLimit: "CPU-Limit", cpuram: "CPU/RAM-Limits", ramPh: "z. B. 2G · 512M · leer = unverändert", cpuPh: "z. B. 1.5 · leer = unverändert", limitsFoot: "Sofort per Docker-Update angewendet, kein Neustart. Leeres Feld lässt den Wert unverändert. „Limit entfernen“ setzt auf unbegrenzt (Docker kann ein Limit live nicht ganz löschen — restlos weg erst durch Neu-Erstellen des Containers).", invalid: "Ungültige Eingabe", saveShort: "Speichern", ramNum: "z. B. 2 · leer = unverändert", cpuNum: "z. B. 1.5 · leer", cpuPin: "CPU-Pinning", cpuPinPh: "z. B. 0-3,6  (leer = alle)", cfgSet: "eingestellt", cfgUnset: "nicht eingestellt (Standard)", removeLim: "Limit entfernen", execPh: "Befehl im Container, z. B. pg_isready", logPh: "Text im Log, z. B. ready", bandwidth: "Bandbreite", egress: "Egress (Upload)", upload: "↑ Upload", download: "↓ Download", bwFoot: "Up-/Download-Limit per tc im Container (Upload = tbf-Shaper, Download = Ingress-Policing). Wird laufend angewendet; nach einem Container-Neustart erst im nächsten Zyklus wieder. Braucht nsenter + tc auf dem Host; die Schnittstelle stellst du in den Einstellungen ein." },
    en: { uptodate: "up to date", update: "Update", start: "Start", stop: "Stop", restart: "Restart", pause: "Pause", resume: "Resume", force: "Force update", save: "Save plan", startorder: "Start in order", filter: "filter…", cols: "Badges", view: "View", list: "List", grid: "Grid", plan: "Plan", done: "done", saving: "saving…", saved: "saved", after: "after", active: "active", watchdog: "Auto-start", wUnhealthy: "when unhealthy", wExit: "on crash (not on a normal stop)", wMax: "max/hour", schedules: "Schedules", addsched: "+ schedule", remove: "remove", manage: "Manage in the start plan", dependsOn: "Depends on", commaSep: "comma-separated", startDelay: "Start delay", secWait: "sec to wait before starting", readyWhen: "Ready when", onFail: "On fail", failhint: "abort skips dependents · continue/degrade start them anyway.", ramLimit: "RAM limit", cpuLimit: "CPU limit", cpuram: "CPU/RAM limits", ramPh: "e.g. 2G · 512M · empty = unchanged", cpuPh: "e.g. 1.5 · empty = unchanged", limitsFoot: "Applied instantly via Docker update, no restart. An empty field leaves the value unchanged. “Remove limit” sets it to unlimited (Docker can't fully unset a limit live — gone for good only by recreating the container).", invalid: "invalid value", saveShort: "Save", ramNum: "e.g. 2 · empty = unchanged", cpuNum: "e.g. 1.5 · empty", cpuPin: "CPU pinning", cpuPinPh: "e.g. 0-3,6  (empty = all)", cfgSet: "configured", cfgUnset: "not set (default)", removeLim: "Remove limit", execPh: "command in the container, e.g. pg_isready", logPh: "text in the log, e.g. ready", bandwidth: "Bandwidth", egress: "Egress (upload)", upload: "↑ Upload", download: "↓ Download", bwFoot: "Up/download limit via tc inside the container (upload = tbf shaper, download = ingress policing). Re-applied while running; after a container restart it returns on the next cycle. Needs nsenter + tc on the host; set the interface on the Settings page." },
  };
  function t(k) { return (T[LANG] || T.en)[k] || T.en[k]; }
  var STATE_LABELS = {
    // "created" (built but never started, e.g. right after an Unraid edit/recreate) reads
    // as plain "stopped" — to the user it IS a stopped container ("bei gestoppten steht erstellt").
    de: { running: "läuft", exited: "gestoppt", created: "gestoppt", paused: "pausiert", restarting: "startet neu", removing: "wird entfernt", dead: "tot" },
    en: { running: "running", exited: "stopped", created: "stopped", paused: "paused", restarting: "restarting", removing: "removing", dead: "dead" },
  };
  function stateLabel(s) { var m = STATE_LABELS[LANG] || STATE_LABELS.en; return m[s] || s || "?"; }

  var mode = localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  var containers = [], containerNames = [], stats = {}, shiplog = {}, workingPlan = {}, lastRun = {}, iconCache = {};
  var netPrev = {}; // name → {rx,tx,t} previous cumulative net counters, to derive the live down/up RATE
  var daemonVersion = ""; // the RUNNING daemon's version (from /api/state) — shown in the gear menu so it's obvious which backend is live after an update
  // Did the LAST /api/state reach the host daemon? CPU/RAM/BW ALL need the daemon; the VM
  // icon tint does NOT (it's pure client CSS). So a working tint with failing limits means
  // the daemon is unreachable, not a feature bug. We paint the gear RED and say so plainly
  // instead of the old, misleading "engine up · 0". null = not probed yet.
  var daemonUp = null;
  // Automation config (schedules + watchdogs + notify) lives on the flash next to
  // the plan; loaded whole, mutated per-container in the editor, and PUT back whole.
  var config = { schedules: [], watchdogs: [], bandwidths: [], notify: { unraid: false, webhook: "" } };
  var limits = {}; // name → CONFIGURED caps {mem_bytes,nano_cpus,cpuset_cpus}, for the "is a limit set?" dots
  var hostCpus = 0, hostCoreOf = [], hostMem = 0; // the HOST's logical-CPU count + HT grouping + total RAM (from the engine)
  var hostPCores = [], hostECores = []; // Intel hybrid P/E-core CPU lists (empty on non-hybrid CPUs)
  var filterText = "", gridHolder = null, openPop = null, openPopAnchor = null, menu = null, menuAnchor = null, menuStatusEl = null, toastEl = null, toastTimer = null;
  var mo = null, dead = false, lastAdv = false, timers = [], moPending = false, moTimer = null, lastObsLoad = 0;

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
  // live network rate label from a stats snapshot with derived _rxr/_txr (bytes/sec):
  // "↓1.2M ↑340K" (down = received, up = transmitted). "…" until the second sample.
  function netRate(s) { if (!s || s._rxr == null || s._txr == null) return "…"; return "↓" + humanBytes(s._rxr) + " ↑" + humanBytes(s._txr); }

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
    if (state && state.host_cpus) hostCpus = state.host_cpus;
    if (state && state.host_core_of) hostCoreOf = state.host_core_of;
    if (state && state.host_pcores) hostPCores = state.host_pcores;
    if (state && state.host_ecores) hostECores = state.host_ecores;
    if (state && state.host_mem) hostMem = state.host_mem;
    if (state && state.version) daemonVersion = state.version;
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
      if (c && typeof c === "object") config = { schedules: c.schedules || [], watchdogs: c.watchdogs || [], bandwidths: c.bandwidths || [], notify: c.notify || { unraid: false, webhook: "" }, shape_iface: c.shape_iface || "" };
    }).catch(function () { /* older engine or transient: keep the current config */ });
  }
  // bulk-load every container's CONFIGURED caps in one call (the engine inspects
  // them concurrently) so the CPU/RAM badges can flag which have a limit set.
  function loadLimits() {
    return api("GET", "limits").then(function (m) { if (m && typeof m === "object") limits = m; }).catch(function () { /* keep previous */ });
  }
  // Limits are near-static (they change only on an explicit edit), and fetching
  // them means one inspect PER container — far heavier than /api/state. So we do it
  // OFF the render path: fetch once, then repaint the dots. NOT part of the 9s
  // load() cycle (that would gate every paint on a full inspect sweep).
  function refreshLimits() { return loadLimits().then(function () { if (!dead && mode === "list") reinjectRowBadges(); }); }
  function watchdogFor(name) { var k = norm(name); for (var i = 0; i < config.watchdogs.length; i++) if (norm(config.watchdogs[i].name) === k) return config.watchdogs[i]; return null; }
  function schedulesFor(name) { var k = norm(name); return config.schedules.filter(function (s) { return norm(s.name) === k; }); }
  // Replace this container's entries in the whole-config, leaving every other
  // container (and notify) untouched, so a per-row save never clobbers the rest.
  function setWatchdog(name, wd) { var k = norm(name); config.watchdogs = config.watchdogs.filter(function (w) { return norm(w.name) !== k; }); if (wd) config.watchdogs.push(wd); }
  function setSchedules(name, list) { var k = norm(name); config.schedules = config.schedules.filter(function (s) { return norm(s.name) !== k; }); list.forEach(function (s) { config.schedules.push(s); }); }
  function bandwidthFor(name) { var k = norm(name), list = config.bandwidths || []; for (var i = 0; i < list.length; i++) if (norm(list[i].name) === k) return list[i]; return null; }
  // egressKbit = upload cap, ingressKbit = download cap; 0 clears that direction. The entry
  // is dropped only when BOTH are 0.
  function setBandwidth(name, egressKbit, ingressKbit) { var k = norm(name); config.bandwidths = (config.bandwidths || []).filter(function (b) { return norm(b.name) !== k; }); if (egressKbit > 0 || ingressKbit > 0) config.bandwidths.push({ name: name, egress_kbit: egressKbit || 0, ingress_kbit: ingressKbit || 0 }); }
  // a kbit rate as "5 Mbit" / "500 kbit" / "–" (0 = none).
  function bwKbitLabel(kbit) { if (!(kbit > 0)) return "–"; return kbit >= 1000 ? (Math.round(kbit / 100) / 10) + " Mbit" : kbit + " kbit"; }
  // configured UPLOAD cap for the badge tooltip: "↑ 5 Mbit". Download shaping was removed
  // (its tc ingress qdisc crashes some Unraid kernels), so only the upload cap is shown.
  function bwTitle(bw) { return "↑ " + bwKbitLabel(bw && bw.egress_kbit); }
  function bwHasLimit(bw) { return !!(bw && bw.egress_kbit > 0); }
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
  // While a container is PAUSED its healthchecks can't run, so right after an unpause
  // Docker often still reports "unhealthy" until the next check passes — a pause artifact,
  // not a real problem. After an unpause WE performed, give the health 90s of grace before
  // alarming; a genuinely sick container turns red after that anyway.
  var unpauseGrace = {};
  function showUnhealthy(c) { return !!(c && c.health === "unhealthy" && !(unpauseGrace[c.name] > Date.now())); }
  var UNHEALTHY_TIP_D = "Healthcheck meldet unhealthy — nach einer Pause normal; erholt sich mit dem nächsten erfolgreichen Check.";
  var UNHEALTHY_TIP_E = "Healthcheck reports unhealthy — normal right after a pause; recovers with the next passing check.";
  function unhealthyTip() { return LANG === "de" ? UNHEALTHY_TIP_D : UNHEALTHY_TIP_E; }
  function stateBadge(c) { var s = (c && c.state) || "unknown", b = el("span", "cc-badge cc-badge-" + s, stateLabel(s)); b.dataset.name = (c && c.name) || ""; if (showUnhealthy(c)) { b.classList.add("cc-badge-alert"); b.textContent = stateLabel(s) + " ✕"; b.title = unhealthyTip(); } else if (c && c.health === "starting") b.textContent = stateLabel(s) + " …"; return b; }
  function stateToggle(name, state) {
    var s = state || "unknown", b = el("span", "cc-badge cc-badge-" + s + " cc-badge-toggle", stateLabel(s)); b.dataset.name = name;
    var action = s === "running" ? "stop" : (s === "paused" ? "unpause" : "start");
    b.title = t(action === "stop" ? "stop" : action === "unpause" ? "resume" : "start");
    // Decide the action AT CLICK TIME from the CURRENT state, not the state the badge was
    // built with: badges are now live-synced in place (syncStateBadges), so a badge that
    // flipped running→stopped must start (not re-stop) on the next click.
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var c = containerByName(name), st = (c && c.state) || s;
      doAction(name, st === "running" ? "stop" : (st === "paused" ? "unpause" : "start"));
    });
    return b;
  }
  // Live-sync every state badge IN PLACE from the freshly-loaded container state. The list
  // rows are injected ONCE and then skipped (ROWMARK), so without this the list badge kept
  // its old label forever ("the badge doesn't switch on stop/restart"); it also replaces a
  // transient "wird gestoppt…" badge with the confirmed state on the next load.
  function syncStateBadges() {
    try {
      Array.prototype.slice.call(document.querySelectorAll(".cc-badge[data-name]")).forEach(function (b) {
        if (pendingAction[b.dataset.name]) return; // action in flight — keep the transient badge
        var c = containerByName(b.dataset.name);
        if (!c) return;
        var s = c.state || "unknown", label = stateLabel(s);
        var unh = showUnhealthy(c);
        if (unh) label += " ✕"; else if (c.health === "starting") label += " …";
        var isToggle = b.classList.contains("cc-badge-toggle");
        var cls = "cc-badge cc-badge-" + s + (isToggle ? " cc-badge-toggle" : "") + (unh ? " cc-badge-alert" : "");
        if (unh) b.title = unhealthyTip();
        if (b.textContent !== label) b.textContent = label;
        if (b.className !== cls) b.className = cls;
        // keep the toggle's tooltip in step with the NEW state (the click handler already
        // re-derives its action at click time).
        if (isToggle) b.title = t(s === "running" ? "stop" : s === "paused" ? "resume" : "start");
      });
    } catch (e) {}
  }
  function badgeInfo(label, value, kind) { var b = el("span", "cc-b cc-b-info" + (kind ? " cc-b-" + kind : "")); b.appendChild(el("span", "cc-b-k", label)); b.appendChild(el("span", "cc-b-v", value)); return b; }
  // one resource line: a badge + its gear, side by side; the res-group stacks these.
  function resLine(badge, gear) { var line = el("div", "cc-resline"); line.appendChild(badge); line.appendChild(gear); return line; }
  function planBadge(name) {
    var node = workingPlan[name], wdOn = !!watchdogFor(name), schedN = schedulesFor(name).length, auto = wdOn || schedN > 0;
    var chip = el("a", "cc-b cc-plan" + (node ? " cc-plan-on" : "") + (auto ? " cc-plan-auto" : ""));
    chip.href = "#"; chip.innerHTML = '<span class="cc-b-k"></span><span class="cc-b-v"></span>';
    chip.querySelector(".cc-b-k").textContent = t("plan");
    chip.querySelector(".cc-b-v").textContent = depsTxt(node);
    chip.title = "start order for " + name + (wdOn ? " · watchdog" : "") + (schedN ? " · " + schedN + "× " + t("schedules").toLowerCase() : "");
    // a small marker so the row shows at a glance that automation is attached
    if (auto) { var m = el("span", "cc-plan-mark"); m.textContent = (wdOn ? "⏻" : "") + (schedN ? "⏱" : ""); chip.appendChild(m); }
    chip.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openEditor(chip, name); });
    return chip;
  }
  function lastRunPill(name) { var lr = lastRun[name]; if (!lr) return null; var p = el("span", "cc-pill cc-pill-" + lr.state, lr.state); p.title = lr.reason || ""; return p; }
  // a little status dot on a badge: filled = a value is configured here, hollow = not.
  // Lets you tell at a glance which containers have a CPU/RAM limit or a custom
  // network set, and which are on the defaults.
  function cfgDot(on) { var d = el("span", "cc-cfg " + (on ? "cc-cfg-on" : "cc-cfg-off")); d.title = on ? t("cfgSet") : t("cfgUnset"); return d; }
  // whether a container is on a deliberately-chosen network (a custom docker network
  // / static IP) rather than the stock bridge/host defaults.
  function netConfigured(c) { if (!c) return false; var n = String(c.network || "").toLowerCase(); return !!n && n !== "bridge" && n !== "host" && n !== "none"; }
  // whether the network is an Unraid macvlan/ipvlan bound to a host interface (br0,
  // br0.20, eth0, bond0…). ONLY these give the container an IP directly on the LAN, so
  // only for these is the container IP also the LAN IP. A custom docker *bridge*
  // (e.g. "proxynet") has a NAT-internal IP that is NOT LAN-reachable.
  function isMacvlan(c) { return !!c && /^(br|bond|eth)\d/i.test(String(c.network || "")); }
  // A limit at (near) the host's full RAM / all cores is effectively "no limit": Docker
  // cannot UNSET a cap through a live update, so our "remove" sets it to that value.
  // These treat such a value as NOT configured (hollow dot, empty editor field).
  function ramLimited(lm) { return !!(lm && lm.mem_bytes > 0 && (!hostMem || lm.mem_bytes < hostMem * 0.95)); }
  function cpuLimited(lm) { if (!lm || !(lm.nano_cpus > 0)) return false; var all = hostCpus > 0 ? hostCpus * 1e9 : 0; return !all || lm.nano_cpus < all * 0.99; }
  function cpuPinned(lm) { if (!lm || !lm.cpuset_cpus) return false; var s = cpusetToSet(lm.cpuset_cpus); return s.length > 0 && (!hostCpus || s.length < hostCpus); }

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
    { key: "vol", label: { de: "Volumes", en: "Volumes" } },
    { key: "plan", label: { de: "Startplan", en: "Plan" } },
  ];
  // Per-view visibility matrix: each column can show in the Simple and/or Advanced
  // view (set in the Settings page). {s,a} = show in simple / advanced. Defaults:
  // advanced-detail badges (force/version/res/id/von) only in advanced.
  function defaultColview() {
    var adv = { s: false, a: true }, both = { s: true, a: true };
    // res (CPU/RAM) defaults ON in both views — it is a headline feature, and the
    // CSS force-shows the native resource column even in Simple view.
    return { update: both, force: adv, version: adv, net: both, res: both, id: adv, von: adv, vol: adv, plan: both };
  }
  function loadColview() {
    try { var j = JSON.parse(localStorage.getItem(COLS_KEY) || "null"); if (j && typeof j === "object") { var d = defaultColview(); Object.keys(d).forEach(function (k) { if (j[k]) d[k] = { s: !!j[k].s, a: !!j[k].a }; }); return d; } } catch (e) {}
    return defaultColview();
  }
  var colview = loadColview();
  function colOn(key) { var v = colview[key]; if (!v) return true; return isAdvancedView() ? !!v.a : !!v.s; }

  // Settings (localStorage): accent colour + row density → CSS variables; picked up
  // live from the Settings page (which writes the same keys + a poke event).
  // ideal badge text colour for a background: dark on light, white on dark.
  function idealText(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#fff"; var n = parseInt(m[1], 16); var L = 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255); return L > 150 ? "#161616" : "#fff"; }
  // Tint the container icons EXACTLY to the chosen colour with an inline SVG filter
  // (feColorMatrix) applied DIRECTLY to each icon <img>/<i>. A filter on the element
  // can't be mis-positioned (the earlier overlay was offset on the real row), and
  // feColorMatrix maps to the precise sRGB colour — grayscale→sepia→hue-rotate only
  // APPROXIMATED the hue, which is why the colour was wrong. The icon becomes a flat
  // silhouette in the chosen colour; the strength slider blends it back toward the
  // original for detail. Ground truth: the icon is `td.ct-name span.hand > .img`.
  function ensureTintFilter() {
    var ic = localStorage.getItem("cc.iconcolor"), m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ic || "");
    var host = document.getElementById("cc-tint-svg");
    if (!m) { if (host) host.remove(); return false; }
    var tr = parseInt(m[1], 16) / 255, tg = parseInt(m[2], 16) / 255, tb = parseInt(m[3], 16) / 255;
    var s = (Math.max(10, parseInt(localStorage.getItem("cc.iconstrength") || "100", 10)) / 100).toFixed(3);
    if (!host) { host = document.createElement("div"); host.id = "cc-tint-svg"; host.setAttribute("aria-hidden", "true"); host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(host); }
    // SHADING-PRESERVING tint: each output channel = the pixel's LUMINANCE × the target
    // colour, so shadows stay dark and highlights stay bright in the chosen hue (the old
    // matrix mapped every opaque pixel to ONE flat colour, losing all shading). The
    // strength slider still blends the tinted result back over the original.
    var lum = function (c) { return (0.2126 * c).toFixed(4) + " " + (0.7152 * c).toFixed(4) + " " + (0.0722 * c).toFixed(4); };
    host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="cc-icon-tint" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">'
      + '<feColorMatrix in="SourceGraphic" type="matrix" result="flat" values="' + lum(tr) + ' 0 0 ' + lum(tg) + ' 0 0 ' + lum(tb) + ' 0 0 0 0 0 1 0"/>'
      + '<feComponentTransfer in="flat" result="faded"><feFuncA type="linear" slope="' + s + '"/></feComponentTransfer>'
      + '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="faded"/></feMerge>'
      + '</filter></svg>';
    return true;
  }
  function iconFilter() { return ensureTintFilter() ? "url(#cc-icon-tint)" : ""; }
  function tintTargets() {
    var out = [], rows = findRows();
    for (var i = 0; i < rows.length; i++) {
      var img = rows[i].querySelector("td.ct-name span.hand > .img") || rows[i].querySelector("td.ct-name img") || rows[i].querySelector("td.ct-name i.img");
      if (img) out.push(img);
    }
    return out;
  }
  function applyIconTint() {
    try {
      var f = iconFilter();
      var imgs = tintTargets();
      for (var i = 0; i < imgs.length; i++) {
        var n = imgs[i];
        n.style.filter = f;
        // Size hardened INLINE (+30% per user call: 48 → 62px): Unraid's theme kept
        // beating our stylesheet on the real page and the icons "shrank back".
        n.style.setProperty("width", "62px", "important");
        n.style.setProperty("height", "62px", "important");
        if (n.tagName === "IMG") n.style.setProperty("object-fit", "contain", "important");
        else n.style.setProperty("font-size", "62px", "important");
      }
      if (gridHolder) { var g = gridHolder.querySelectorAll("img.cc-card-ico"); for (var j = 0; j < g.length; j++) g[j].style.filter = f; }
    } catch (e) {}
  }
  function applySettings() {
    try {
      var root = document.documentElement.style;
      var accent = localStorage.getItem("cc.accent"); if (accent) { root.setProperty("--cc-accent", accent); root.setProperty("--cc-accent-text", idealText(accent)); }
      var dens = localStorage.getItem("cc.density"); root.setProperty("--cc-density", { compact: "5px", normal: "9px", airy: "14px" }[dens] || "9px");
      // Colour for ShipLog's "update all" button (which we restyle to match our badges,
      // in the toggle row). documentElement so it reaches .ToggleViewMode, which lives
      // OUTSIDE our enhanced table. Green in rainbow mode, the accent otherwise.
      var ub = localStorage.getItem("cc.rainbow") === "1" ? "#1f9d55" : (accent || "#2f6feb");
      root.setProperty("--cc-updall-bg", ub); root.setProperty("--cc-updall-text", idealText(ub));
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
      // row density as a CLASS too (not only the --cc-density padding var): the row height
      // is mostly the badge content, so compact/airy also tighten/loosen the badge spacing.
      var dens = localStorage.getItem("cc.density") || "normal";
      ["compact", "normal", "airy"].forEach(function (d) { tb.classList.toggle("cc-dens-" + d, dens === d); });
      COLS.forEach(function (c) { tb.classList.toggle("cc-c-" + c.key, colOn(c.key)); });
      applyIconTint();
    } catch (e) {}
  }
  function removeEnhanceClasses() { try { var tb = nativeTable(); if (!tb) return; tb.classList.remove("cc-enh", "cc-adv", "cc-rainbow", "cc-tint-icons", "cc-dens-compact", "cc-dens-normal", "cc-dens-airy"); COLS.forEach(function (c) { tb.classList.remove("cc-c-" + c.key); }); var t2 = tintTargets(); for (var i = 0; i < t2.length; i++) t2[i].style.filter = ""; if (gridHolder) Array.prototype.slice.call(gridHolder.querySelectorAll("img.cc-card-ico")).forEach(function (n) { n.style.filter = ""; }); Array.prototype.slice.call(document.querySelectorAll(".cc-ico-tint")).forEach(function (n) { n.remove(); }); var sv = document.getElementById("cc-tint-svg"); if (sv) sv.remove(); } catch (e) {} }

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
        var sb = stateToggle(name, st); if (showUnhealthy(c)) { sb.classList.add("cc-badge-alert"); sb.textContent = stateLabel(st) + " ✕"; sb.title = unhealthyTip(); }
        meta.appendChild(sb);
        var advDiv = nameCell.querySelector(":scope > div.advanced");
        var idrow = el("div", "cc-namemeta-ids"), added = false, hideAdv = false;
        if (advDiv) {
          if (colOn("id")) { var cid = readContainerId(advDiv); if (cid) { idrow.appendChild(badgeInfo("ID", cid.slice(0, 12), "id")); added = true; hideAdv = true; } }
          if (colOn("von")) { var a = advDiv.querySelector("a[target='_blank']"); if (a && a.textContent.trim()) { var vb = badgeInfo("Von", a.textContent.trim(), "von"); vb.title = a.getAttribute("href") || ""; idrow.appendChild(vb); added = true; hideAdv = true; } }
        }
        // Volumes come from the ENGINE (Mounts), so they show even for a stopped
        // container that has no native advanced block. One badge = the mount count,
        // with every "source → dest" (ro/rw) in its tooltip.
        if (colOn("vol") && c && c.mounts && c.mounts.length) {
          var volB = badgeInfo("Volumes", String(c.mounts.length), "vol");
          volB.title = c.mounts.map(function (m) { return m.source + " → " + m.dest + (m.rw ? "" : " (ro)"); }).join("\n");
          idrow.appendChild(volB); added = true;
        }
        if (added) { if (hideAdv && advDiv) advDiv.classList.add("cc-hidden"); meta.appendChild(idrow); }
        var inner = nameCell.querySelector(".inner") || nameCell; inner.appendChild(meta);
      }

      // ── CPU / RAM: the live values as badges FROM THE ENGINE, so they show in the
      // Simple view too (Unraid does not populate the native resource cell there),
      // each with a gear for its own limit editor. The native cell is hidden by CSS. ──
      if (colOn("res")) {
        var resCell = tr.querySelector(":scope > td:nth-child(8)") || tr.querySelector(":scope > td.advanced");
        if (resCell && !resCell.querySelector(".cc-resgroup")) {
          var rg = el("div", "cc-rowbadges cc-resgroup"); rg.setAttribute(MARK, "1"); rg.dataset.name = name;
          var lm = limits[name] || {};
          var cpuSet = cpuLimited(lm) || cpuPinned(lm), ramSet = ramLimited(lm);
          // CPU, RAM and Bandwidth each on their OWN line (a .cc-resline), stacked
          // vertically so the three limits always sit one under the other. NO status dot on
          // these three — the GEAR turning green already signals "a limit is set" here.
          var cpuB = badgeInfo("CPU", "…", "cpu");
          rg.appendChild(resLine(cpuB, limGear(name, "cpu", cpuSet)));
          var ramB = badgeInfo("RAM", "…", "ram");
          rg.appendChild(resLine(ramB, limGear(name, "ram", ramSet)));
          var bw = bandwidthFor(name), bwSet = bwHasLimit(bw);
          // value = LIVE down/up rate (filled by updateResGroup); the configured up/down
          // caps show in the tooltip. Starts "…" until the first rate.
          var bwB = badgeInfo("BW", "…", "bw"); bwB.title = t("bandwidth") + " " + bwTitle(bw);
          rg.appendChild(resLine(bwB, bwGear(name, bwSet)));
          updateResGroup(rg, stats[name], c && c.state);
          resCell.appendChild(rg);
        }
      }

      // ── VERSION cell (col 2): image tag as our OWN badge (Advanced-only), + last-run.
      // We read the tag text out of Unraid's native div.advanced then hide that div, so
      // the tag never leaks into the Simple view and always renders as a real badge. ──
      if (upCell) {
        var vh = el("div", "cc-rowbadges"); vh.setAttribute(MARK, "1");
        var advs = upCell.querySelectorAll(":scope > div.advanced");
        var tagDiv = null; // the LAST advanced div without an action link = the image-tag text
        for (var ai = advs.length - 1; ai >= 0; ai--) { if (!advs[ai].querySelector("a.exec")) { tagDiv = advs[ai]; break; } }
        var tagTxt = tagDiv ? tagDiv.textContent.replace(/\s+/g, " ").trim() : "";
        // Hide only the TEXT advanced divs (the image tag we re-render as a badge) — NOT
        // the one carrying the force-update a.exec link, or the "Update erzwingen" badge
        // could never show no matter what the column matrix says.
        Array.prototype.forEach.call(advs, function (d) { if (!d.querySelector("a.exec")) d.classList.add("cc-hidden"); });
        if (colOn("version") && tagTxt) vh.appendChild(badgeInfo("Tag", tagTxt, "version"));
        var p = lastRunPill(name); if (p) vh.appendChild(p);
        if (vh.children.length) upCell.appendChild(vh);
      }

      // ── NETWORK group (col 3): consolidate Netzwerk / Container IP / LAN IP / Port ──
      if (colOn("net")) {
        var c3 = tr.querySelector(":scope > td:nth-child(3)");
        if (c3) {
          var netTxt = readmoreText(tr, 3), ipTxt = readmoreText(tr, 4), portTxt = readmoreText(tr, 5), lanTxt = readmoreText(tr, 6);
          // a STOPPED container has no runtime IP in the native cell, so fall back to
          // the engine's value (the configured static br0.x IP, which survives a stop).
          if (!ipTxt && c && c.ip) ipTxt = c.ip;
          if (!netTxt && c && c.network) netTxt = c.network;
          // on an Unraid macvlan/ipvlan (br0.x) the container's static IP IS its LAN IP,
          // so show it for a stopped container too (the native LAN cell is empty). Only
          // for real host-interface nets — a custom docker bridge IP is NOT LAN-reachable.
          if (!lanTxt && c && c.ip && isMacvlan(c)) lanTxt = c.ip;
          var g = el("div", "cc-rowbadges cc-netgroup"); g.setAttribute(MARK, "1");
          if (netTxt) { var netB = badgeInfo("Netzwerk", netTxt, "net"); netB.appendChild(cfgDot(netConfigured(c))); g.appendChild(netB); }
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
  function reinjectRowBadges() { clearRowBadges(); injectAllRowBadges(); applyIconTint(); }

  // ───────────────────────── lifecycle (grid buttons + list state toggle)
  // The transient state to show IMMEDIATELY when the user clicks an action, until the next
  // load() confirms the real Docker state — so a stop/restart gives instant "wird gestoppt" /
  // "startet neu" feedback (Docker has no "stopping" state to poll, so we show it optimistically).
  function transientLabel(action) {
    var de = LANG === "de";
    var m = { stop: de ? "wird gestoppt" : "stopping", restart: de ? "startet neu" : "restarting", start: de ? "startet" : "starting", unpause: de ? "startet" : "resuming", pause: de ? "pausiert…" : "pausing" };
    return m[action] || "";
  }
  // Names with an action in flight: syncStateBadges skips them so an OVERLAPPING load()
  // (started before the click, landing during the action) can't revert the optimistic
  // transient badge to the stale pre-action state mid-action.
  var pendingAction = {};
  function markTransient(name, action) {
    var lbl = transientLabel(action); if (!lbl) return;
    try {
      Array.prototype.slice.call(document.querySelectorAll(".cc-badge")).forEach(function (b) {
        if (b.dataset && b.dataset.name === name) {
          b.textContent = lbl;
          b.className = b.className.replace(/cc-badge-(running|exited|paused|created|restarting|removing|dead|unknown)\b/g, "").replace(/\s+/g, " ").trim() + " cc-badge-transient";
        }
      });
    } catch (e) {}
  }
  function doAction(name, action) {
    if (action === "unpause") unpauseGrace[name] = Date.now() + 90000; // pause artifact: stale "unhealthy" gets 90s to recover
    pendingAction[name] = true; markTransient(name, action); flash(action + " " + name + "…");
    api("POST", "action", { name: name, action: action })
      .then(function () { delete pendingAction[name]; return load(); }) // clear BEFORE the confirming load so its sync updates this badge
      .then(function () { flash(t("done")); })
      .catch(function (e) { delete pendingAction[name]; flash("Error: " + e.message, true); syncStateBadges(); });
  }
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
    if (s && c.state === "running") {
      sb.appendChild(gauge("CPU", s.cpu_percent, (s.cpu_percent || 0) + "%"));
      sb.appendChild(gauge("RAM", s.mem_percent, humanBytes(s.mem_used) + " / " + humanBytes(s.mem_limit)));
      var nl = el("div", "cc-stat cc-stat-net"); nl.appendChild(el("span", "cc-stat-lbl", "NET")); nl.appendChild(el("span", "cc-stat-val cc-card-net", netRate(s))); sb.appendChild(nl);
    } else sb.appendChild(el("div", "cc-stat cc-dim", c.state === "running" ? "…" : "not running"));
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
    // CPU / RAM / Bandwidth limit gears — the SAME three the list view injects (see
    // injectRowBadges). They were LIST-ONLY, so in GRID (card) mode no gear was ever
    // rendered — which is exactly why setting AND removing CPU/RAM/BW "did nothing" in
    // card view: there was no editor to open, no request ever fired, no error to show.
    var rg = el("div", "cc-rowbadges cc-resgroup cc-card-res"); rg.setAttribute(MARK, "1"); rg.dataset.name = c.name;
    var lm = limits[c.name] || {};
    var cpuB = badgeInfo("CPU", "…", "cpu");
    rg.appendChild(resLine(cpuB, limGear(c.name, "cpu", cpuLimited(lm) || cpuPinned(lm))));
    var ramB = badgeInfo("RAM", "…", "ram");
    rg.appendChild(resLine(ramB, limGear(c.name, "ram", ramLimited(lm))));
    var bw = bandwidthFor(c.name);
    var bwB = badgeInfo("BW", "…", "bw"); bwB.title = t("bandwidth") + " " + bwTitle(bw);
    rg.appendChild(resLine(bwB, bwGear(c.name, bwHasLimit(bw))));
    updateResGroup(rg, stats[c.name], c.state);
    wrap.appendChild(rg);
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
    // The grid needs its OWN gear: the list-toolbar gear lives in/near the native table
    // area, which is not a reliable anchor in card view ("which gear menu?"). This one is
    // pinned to the grid holder's top-right corner. A rebuild detaches the old gear — if
    // the menu is open and anchored to it, re-anchor to the NEW gear so positionMenu()
    // doesn't compute from a disconnected node (menu teleporting to the corner).
    var hg = makeGear("cc-hgear-grid");
    gridHolder.appendChild(hg);
    if (menu && menuAnchor && !menuAnchor.isConnected) { menuAnchor = hg; positionMenu(); }
    var grid = el("div", "cc-grid");
    containers.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) { grid.appendChild(card(c)); });
    gridHolder.appendChild(grid);
    applyIconTint();
  }

  // ───────────────────────── gear + menu (the only global control surface)
  function makeGear(extra) { var g = el("button", "cc-hgear" + (extra ? " " + extra : "") + (daemonUp === false ? " cc-hgear-down" : ""), "⚙"); g.type = "button"; g.title = daemonUp === false ? "CannonadeCommander — daemon not reachable" : "CannonadeCommander"; g.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); toggleMenu(g); }); return g; }
  function injectHeaderGear() {
    try {
      // Global idempotency: never place a second list-mode gear once one exists.
      if (document.querySelector(".cc-hgear:not(.cc-hgear-grid)")) return true;
      // Preferred home: INSIDE Unraid's Advanced/Basic view-toggle row (a full-width
      // flex-end row), as its first child, so the gear sits in the visible right-aligned
      // control group next to the toggle — NOT as a preceding sibling, which lands it
      // orphaned on the line above where it's easy to miss ("there's no gear").
      var tv = document.querySelector("div.ToggleViewMode");
      if (tv) { if (tv.querySelector(".cc-hgear-bar")) return true; tv.insertBefore(makeGear("cc-hgear-bar"), tv.firstChild); return true; }
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
    // Honest, reachability-aware status. When the daemon can't be reached, CPU/RAM/BW cannot
    // work AT ALL — so say so in red instead of the old misleading "engine up · 0". When it IS
    // reachable, show its RUNNING version so it's unmistakable which backend is live (an update
    // that didn't restart the daemon, or a stale install, shows the OLD version here).
    if (daemonUp === false) {
      menuStatusEl = el("div", "cc-menu-status cc-bad-text", "engine DOWN — daemon not reachable · UI v" + CC_VER);
    } else {
      menuStatusEl = el("div", "cc-menu-status cc-ok-text", "engine up · " + containers.length + (daemonVersion ? " · v" + String(daemonVersion).replace(/^v/, "") : "") + " · UI v" + CC_VER);
    }
    m.appendChild(menuStatusEl);
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
  function refresh() { applyMode(); if (mode === "grid" || (mode === "list" && colOn("res"))) refreshStats(); }
  // update one CPU/RAM engine-badge group in place (values only).
  function updateResGroup(rg, s, state) {
    // Target the live values BY KIND (not by index). The BW badge now shows the live
    // DOWN/UP rate (↓rx ↑tx), like CPU/RAM show live usage; the configured egress cap is
    // still indicated by the badge's dot + gear colour (and the badge's title tooltip).
    var cpuV = rg.querySelector(".cc-b-cpu .cc-b-v"), ramV = rg.querySelector(".cc-b-ram .cc-b-v"), bwV = rg.querySelector(".cc-b-bw .cc-b-v");
    if (state !== "running") { if (cpuV) cpuV.textContent = "–"; if (ramV) ramV.textContent = "–"; if (bwV) bwV.textContent = "–"; return; }
    if (cpuV) cpuV.textContent = s ? (s.cpu_percent || 0) + "%" : "…";
    if (ramV) ramV.textContent = s ? humanBytes(s.mem_used) + " / " + humanBytes(s.mem_limit) : "…";
    if (bwV) bwV.textContent = netRate(s);
  }
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
      // derive the live down/up RATE (bytes/sec) by diffing the cumulative net counters
      // against the previous sample. Guard the counter-reset case (container restart →
      // counters drop) so a rate never goes negative.
      var now = Date.now();
      Object.keys(stats).forEach(function (nm) {
        var s = stats[nm], p = netPrev[nm];
        if (p && now > p.t && s.net_rx >= p.rx && s.net_tx >= p.tx) {
          var dt = (now - p.t) / 1000;
          s._rxr = (s.net_rx - p.rx) / dt; s._txr = (s.net_tx - p.tx) / dt;
        }
        netPrev[nm] = { rx: s.net_rx || 0, tx: s.net_tx || 0, t: now };
      });
      if (mode === "grid" && gridHolder) Array.prototype.slice.call(gridHolder.querySelectorAll(".cc-card")).forEach(function (cd) { var s = stats[cd.dataset.name]; if (!s) return; var f = cd.querySelectorAll(".cc-gauge-fill"), v = cd.querySelectorAll(".cc-stat-val"); if (f[0]) f[0].style.width = Math.min(100, s.cpu_percent) + "%"; if (v[0]) v[0].textContent = (s.cpu_percent || 0) + "%"; if (f[1]) f[1].style.width = Math.min(100, s.mem_percent) + "%"; if (v[1]) v[1].textContent = humanBytes(s.mem_used) + " / " + humanBytes(s.mem_limit); var nv = cd.querySelector(".cc-card-net"); if (nv) nv.textContent = netRate(s); });
      // update the CPU/RAM/BW resource badges live in BOTH modes — the resgroup now
      // exists on grid cards too (querySelectorAll finds the list-cell AND the card ones).
      Array.prototype.slice.call(document.querySelectorAll(".cc-resgroup")).forEach(function (rg) { var cn = containerByName(rg.dataset.name); updateResGroup(rg, stats[rg.dataset.name], cn && cn.state); });
    }).catch(function () {});
  }

  // ───────────────────────── plan editor popover
  // INLINE style hardening: Unraid's theme styles inputs/rows with selectors that beat
  // our stylesheet on the REAL page (the harness renders looked right, the box didn't —
  // "Abstände passen immer noch nicht", "Felder haben keinen helleren Hintergrund").
  // Inline styles with priority "important" cannot be beaten by ANY stylesheet.
  function hardenPop(root) {
    try {
      Array.prototype.slice.call(root.querySelectorAll(".cc-pop-row")).forEach(function (r) {
        r.style.setProperty("padding", "3px 10px", "important");
        r.style.setProperty("margin", "0", "important");
        // the row itself: one tight flex line, nothing may wrap or stretch it
        r.style.setProperty("display", "flex", "important");
        r.style.setProperty("align-items", "center", "important");
        r.style.setProperty("flex-wrap", "nowrap", "important");
        r.style.setProperty("min-height", "0", "important");
        r.style.setProperty("row-gap", "0", "important");
        // EVERY child (labels and spans too, not only .cc-in): the remaining gaps sat
        // exactly after the text-input rows — some child still carried theme margins.
        Array.prototype.slice.call(r.children).forEach(function (ch) {
          ch.style.setProperty("margin", "0", "important");
          ch.style.setProperty("line-height", "1.4", "important");
          ch.style.setProperty("min-height", "0", "important");
          // flex children default to min-width:auto — an <input>'s intrinsic width then
          // refuses to shrink and pokes out of the popup ("Textfelder schießen über den
          // Rand"). min-width:0 lets every child shrink to fit the nowrap row.
          ch.style.setProperty("min-width", "0", "important");
        });
      });
      Array.prototype.slice.call(root.querySelectorAll(".cc-in")).forEach(function (i) {
        i.style.setProperty("min-width", "0", "important");
        i.style.setProperty("max-width", "100%", "important");
        i.style.setProperty("box-sizing", "border-box", "important");
        i.style.setProperty("background", "#2e2e2e", "important");
        i.style.setProperty("border", "none", "important");
        i.style.setProperty("box-shadow", "none", "important");
        i.style.setProperty("margin", "0", "important");
        i.style.setProperty("min-height", "0", "important");
        i.style.setProperty("height", "auto", "important");
        i.style.setProperty("padding", "5px 8px", "important");
        i.style.setProperty("border-radius", "6px", "important");
        i.style.setProperty("line-height", "1.35", "important");
      });
    } catch (e) {}
  }
  function closePop() { if (openPop) { openPop.remove(); openPop = null; openPopAnchor = null; } Array.prototype.slice.call(document.querySelectorAll(".cc-drop")).forEach(function (n) { n.remove(); }); }
  // clicking the SAME badge again closes its popover (toggle). Returns true if it closed.
  function togglePop(anchor) { if (openPop && openPopAnchor === anchor) { closePop(); return true; } return false; }
  function refreshChip(chip, name) { var node = workingPlan[name]; chip.classList.toggle("cc-plan-on", !!node); var v = chip.querySelector(".cc-b-v"); if (v) v.textContent = depsTxt(node); }
  // A small ⓘ next to a label; hovering (or focusing) it shows a tidy explainer of the
  // dropdown's options, so "Bereit wenn" / "Bei Fehlschlag" no longer need prior knowledge.
  function infoBubble(items) {
    var b = el("span", "cc-info", "ⓘ"); b.setAttribute("tabindex", "0"); b.setAttribute("aria-label", "info");
    var tip = el("span", "cc-tip");
    items.forEach(function (it) { var r = el("span", "cc-tip-row"); r.appendChild(el("b", "cc-tip-k", it[0])); r.appendChild(document.createTextNode(it[1])); tip.appendChild(r); });
    b.appendChild(tip); return b;
  }
  function lblInfo(text, items) { var l = el("label", "cc-pop-lbl cc-lbl-info"); l.appendChild(document.createTextNode(text)); l.appendChild(infoBubble(items)); return l; }
  function probeItems() {
    return LANG === "de"
      ? [["health", "Docker-Healthcheck meldet healthy"], ["running", "Container läuft (kurze Karenz)"], ["tcp", "ein TCP-Port nimmt Verbindungen an"], ["http", "ein HTTP-GET liefert 2xx/3xx"], ["exec", "ein Befehl im Container endet mit Code 0"], ["log", "ein Text taucht im Log auf"]]
      : [["health", "Docker healthcheck reports healthy"], ["running", "container is up (short grace)"], ["tcp", "a TCP port accepts connections"], ["http", "an HTTP GET returns 2xx/3xx"], ["exec", "a command inside exits 0"], ["log", "a string appears in the log"]];
  }
  function policyItems() {
    return LANG === "de"
      ? [["abort", "Kette anhalten, Abhängige nicht starten"], ["continue", "trotzdem weiter, Abhängige starten"], ["degrade", "weiter, aber als degraded markieren"]]
      : [["abort", "stop the chain, don't start dependents"], ["continue", "carry on, start dependents anyway"], ["degrade", "carry on but mark as degraded"]];
  }
  function openEditor(anchor, name) {
    if (togglePop(anchor)) return;
    closePop();
    var existing = workingPlan[name], node = existing || { name: name, after: [], probe: { kind: "health" }, policy: "abort" };
    var pop = el("div", "cc-pop"); if (localStorage.getItem("cc.rainbow") === "1") pop.classList.add("cc-rainbow");
    var head = el("div", "cc-pop-head"); head.appendChild(el("b", null, name));
    var x = el("span", "cc-pop-x", "✕"); x.addEventListener("click", closePop); head.appendChild(x); pop.appendChild(head);
    // "Manage in the start plan" is a TOGGLE (not a checkbox). manageOn drives commit().
    var manageOn = !!existing;
    var manageTog = el("span", "cc-set-toggle" + (manageOn ? " cc-set-toggle-on" : "")); manageTog.setAttribute("role", "switch"); manageTog.setAttribute("tabindex", "0"); manageTog.setAttribute("aria-checked", manageOn ? "true" : "false"); manageTog.appendChild(el("span", "cc-set-knob"));
    function flipManage() { manageOn = !manageOn; manageTog.classList.toggle("cc-set-toggle-on", manageOn); manageTog.setAttribute("aria-checked", manageOn ? "true" : "false"); commit(); }
    manageTog.addEventListener("click", flipManage);
    manageTog.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flipManage(); } });
    var mrow = el("div", "cc-pop-row cc-pop-toggle"); mrow.appendChild(el("span", "cc-pop-sech", t("manage"))); mrow.appendChild(el("span", "cc-set-spacer")); mrow.appendChild(manageTog); pop.appendChild(mrow);
    var body = el("div", "cc-pop-body" + (existing ? "" : " cc-dis"));
    var arow = el("div", "cc-pop-row"); arow.appendChild(el("label", "cc-pop-lbl", t("dependsOn")));
    var after = el("input", "cc-in"); after.type = "text"; after.placeholder = t("commaSep"); after.value = (node.after || []).join(", "); arow.appendChild(after); body.appendChild(arow);
    // MULTI-select dropdown (a native datalist replaces the whole value = only ONE
    // container pickable): our own list opens on focus, every click TOGGLES a container
    // in the comma list, and it stays open for picking several.
    (function () {
      var panel = null;
      function closePanel() { if (panel) { panel.remove(); panel = null; document.removeEventListener("mousedown", onDoc, true); } }
      function onDoc(e) { if (panel && !panel.contains(e.target) && e.target !== after) closePanel(); }
      function vals() { return after.value.split(",").map(function (s2) { return s2.trim(); }).filter(Boolean); }
      after.addEventListener("focus", function () {
        if (panel) return;
        panel = el("div", "cc-drop");
        containerNames.forEach(function (n2) {
          if (n2 === name) return;
          var it = el("div", "cc-drop-it", n2);
          var sync = function () { it.classList.toggle("cc-drop-on", vals().indexOf(n2) >= 0); };
          sync();
          it.addEventListener("mousedown", function (ev) {
            ev.preventDefault(); ev.stopPropagation(); // keep focus, keep the panel open
            var l2 = vals(), ix = l2.indexOf(n2);
            if (ix >= 0) l2.splice(ix, 1); else l2.push(n2);
            after.value = l2.join(", "); sync(); commit();
          });
          panel.appendChild(it);
        });
        var r2 = after.getBoundingClientRect();
        panel.style.left = (window.scrollX + r2.left) + "px"; panel.style.top = (window.scrollY + r2.bottom + 3) + "px"; panel.style.minWidth = r2.width + "px";
        document.body.appendChild(panel);
        document.addEventListener("mousedown", onDoc, true);
      });
    })();
    var drow = el("div", "cc-pop-row"); drow.appendChild(el("label", "cc-pop-lbl", t("startDelay")));
    var delay = el("input", "cc-in cc-port"); delay.type = "number"; delay.min = "0"; delay.placeholder = "sec"; delay.value = node.delay_seconds ? node.delay_seconds : "";
    // no trailing "sec to wait" span: the placeholder already says "sec", and the extra
    // flex child could wrap and double the row height (one source of the stubborn gap).
    drow.appendChild(delay); body.appendChild(drow);
    var prow = el("div", "cc-pop-row"); prow.appendChild(lblInfo(t("readyWhen"), probeItems()));
    var probe = el("select", "cc-in"); PROBES.forEach(function (p) { var o = el("option", null, p); o.value = p; if (node.probe && node.probe.kind === p) o.selected = true; probe.appendChild(o); });
    var port = el("input", "cc-in cc-port"); port.type = "number"; port.placeholder = "port"; port.value = (node.probe && node.probe.port) ? node.probe.port : "";
    var pathIn = el("input", "cc-in cc-port"); pathIn.type = "text"; pathIn.placeholder = "/health"; pathIn.value = (node.probe && node.probe.path) ? node.probe.path : "";
    var cmdIn = el("input", "cc-in"); cmdIn.type = "text"; cmdIn.placeholder = t("execPh"); cmdIn.value = (node.probe && node.probe.command) ? node.probe.command : "";
    var matchIn = el("input", "cc-in"); matchIn.type = "text"; matchIn.placeholder = t("logPh"); matchIn.value = (node.probe && node.probe.match) ? node.probe.match : "";
    var syncPort = function () { var k = probe.value; port.style.display = (k === "tcp" || k === "http") ? "" : "none"; pathIn.style.display = k === "http" ? "" : "none"; cmdIn.style.display = k === "exec" ? "" : "none"; matchIn.style.display = k === "log" ? "" : "none"; }; syncPort();
    prow.appendChild(probe); prow.appendChild(port); prow.appendChild(pathIn); prow.appendChild(cmdIn); prow.appendChild(matchIn); body.appendChild(prow);
    var polrow = el("div", "cc-pop-row"); polrow.appendChild(lblInfo(t("onFail"), policyItems()));
    var pol = el("select", "cc-in"); POLICIES.forEach(function (p) { var o = el("option", null, p); o.value = p; if (node.policy === p) o.selected = true; pol.appendChild(o); });
    polrow.appendChild(pol); body.appendChild(polrow); pop.appendChild(body);
    pop.appendChild(el("div", "cc-pop-foot", t("failhint")));

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
      DAYS.forEach(function (d) { var b = el("span", "cc-day" + (sel[d[1]] ? " cc-day-on" : ""), d[0]); b.dataset.day = d[1]; b.addEventListener("click", function (e) { e.preventDefault(); b.classList.toggle("cc-day-on"); }); days.appendChild(b); });
      var rm = el("span", "cc-sched-x", "✕"); rm.title = t("remove"); rm.addEventListener("click", function () { row.remove(); });
      row.appendChild(act2); row.appendChild(time); row.appendChild(days); row.appendChild(rm);
      // empty days = every day; only rows with a valid HH:MM time are saved
      row._read = function () { if (!/^\d{2}:\d{2}$/.test(time.value)) return null; var ds = []; Array.prototype.slice.call(days.children).forEach(function (x) { if (x.classList.contains("cc-day-on")) ds.push(parseInt(x.dataset.day, 10)); }); var o = { name: name, action: act2.value, time: time.value, enabled: true }; if (ds.length) o.days = ds; return o; };
      return row;
    }
    var sSec = el("div", "cc-pop-auto"); sSec.appendChild(el("div", "cc-pop-sech cc-pop-sech-lone", t("schedules")));
    var sList = el("div", "cc-sched-list"); schedulesFor(name).forEach(function (s) { sList.appendChild(schedRow(s)); }); sSec.appendChild(sList);
    var addB = el("span", "cc-btn cc-btn-sm", t("addsched")); addB.addEventListener("click", function () { sList.appendChild(schedRow(null)); }); sSec.appendChild(addB);
    pop.appendChild(sSec);
    function readSchedules() { var out = []; Array.prototype.slice.call(sList.children).forEach(function (r) { if (r._read) { var v = r._read(); if (v) out.push(v); } }); return out; }

    // (Bandwidth moved out of this editor: it now has its own gear in the CPU/RAM
    // resource group — a third stacked badge, so all three limits sit together.)

    // Plan actions live here now (the Docker-tab gear is gone): save the whole plan
    // AND this container's automation, or run it in dependency order immediately.
    var act = el("div", "cc-pop-row cc-pop-act");
    var bSave = el("span", "cc-btn", t("save")), bRun = el("span", "cc-btn cc-btn-primary", t("startorder"));
    bSave.addEventListener("click", function () { saveEditor(name, readWatchdog(), readSchedules(), false); });
    bRun.addEventListener("click", function () { saveEditor(name, readWatchdog(), readSchedules(), true); });
    act.appendChild(bSave); act.appendChild(bRun); pop.appendChild(act);
    function commit() {
      if (!manageOn) { delete workingPlan[name]; body.classList.add("cc-dis"); refreshChip(anchor, name); return; }
      body.classList.remove("cc-dis");
      var afterList = after.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var pr = { kind: probe.value }, pv = parseInt(port.value, 10);
      if (probe.value === "tcp" && pv > 0) pr.port = pv;
      if (probe.value === "http") { if (pv > 0) pr.port = pv; var pt = pathIn.value.trim(); if (pt) pr.path = pt; }
      if (probe.value === "exec") { var cm = cmdIn.value.trim(); if (cm) pr.command = cm; }
      if (probe.value === "log") { var mt = matchIn.value.trim(); if (mt) pr.match = mt; }
      if (probe.value === "running") pr.grace_seconds = 3;
      var dv = parseInt(delay.value, 10);
      var n = { name: name, after: afterList, probe: pr, policy: pol.value };
      if (dv > 0) n.delay_seconds = dv;
      workingPlan[name] = n; refreshChip(anchor, name);
    }
    [after, delay, probe, port, pathIn, cmdIn, matchIn, pol].forEach(function (n) { n.addEventListener("change", commit); n.addEventListener("input", commit); });
    probe.addEventListener("change", syncPort);
    // in rainbow mode, colour the editor's checkboxes too (the manage toggle + day
    // toggles are handled in CSS via .cc-pop.cc-rainbow).
    if (localStorage.getItem("cc.rainbow") === "1") {
      var rbc = ["#1f9d55", "#2f6feb", "#8b5cf6", "#e0912a", "#d9433f", "#0ea5a4"];
      Array.prototype.slice.call(pop.querySelectorAll("input[type=checkbox]")).forEach(function (cb, i) { cb.style.accentColor = rbc[i % rbc.length]; });
    }
    document.body.appendChild(pop); hardenPop(pop);
    var r = anchor.getBoundingClientRect(), w = pop.offsetWidth || 320;
    pop.style.left = Math.max(window.scrollX + 8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - w - 12)) + "px";
    pop.style.top = (window.scrollY + r.bottom + 6) + "px"; openPop = pop; openPopAnchor = anchor;
  }

  // ───────────────────────── CPU/RAM limits editor (Docker container-update)
  // parseCPU: 0 for empty (= leave unchanged), NanoCPUs for a valid count, or -1 for
  // unparseable input (comma decimals normalised first). RAM is a number + MB/GB unit.
  function parseCPU(s) { s = String(s || "").trim().replace(",", "."); if (!s) return 0; if (!/^[\d.]+$/.test(s)) return -1; var n = parseFloat(s); return n > 0 ? Math.round(n * 1e9) : 0; }
  // cpuset string ("0-3,6") <-> a sorted array of core indices, for the pin grid.
  function cpusetToSet(str) { var out = []; String(str || "").split(",").forEach(function (p) { p = p.trim(); var m = /^(\d+)-(\d+)$/.exec(p); if (m) { for (var i = +m[1]; i <= +m[2]; i++) out.push(i); } else if (/^\d+$/.test(p)) out.push(+p); }); return out; }
  function setToCpuset(arr) { arr = arr.slice().sort(function (a, b) { return a - b; }); var parts = [], i = 0; while (i < arr.length) { var j = i; while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++; parts.push(i === j ? String(arr[i]) : arr[i] + "-" + arr[j]); i = j + 1; } return parts.join(","); }
  function limGear(name, which, set) {
    var lb = el("span", "cc-limbtn" + (set ? " cc-limbtn-set" : "")); lb.setAttribute(MARK, "1"); lb.textContent = "⚙";
    lb.title = (which === "cpu" ? t("cpuLimit") : t("ramLimit")) + " · " + (set ? t("cfgSet") : t("cfgUnset"));
    lb.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openLimits(lb, name, which); });
    return lb;
  }
  // the Bandwidth gear (third resource line) — opens the egress-limit editor.
  function bwGear(name, set) {
    var lb = el("span", "cc-limbtn" + (set ? " cc-limbtn-set" : "")); lb.setAttribute(MARK, "1"); lb.textContent = "⚙";
    lb.title = t("bandwidth") + " · " + (set ? t("cfgSet") : t("cfgUnset"));
    lb.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openBandwidth(lb, name); });
    return lb;
  }
  // Egress rate-limit editor, mirroring the CPU/RAM limit popover. Save writes the whole
  // config (read-modify-write) so nothing else is dropped; the monitor (re-)applies the tc
  // rule on the Settings-chosen interface while the container runs. "Remove" clears it.
  function openBandwidth(anchor, name) {
    if (togglePop(anchor)) return;
    closePop();
    var pop = el("div", "cc-pop"); if (localStorage.getItem("cc.rainbow") === "1") pop.classList.add("cc-rainbow");
    var head = el("div", "cc-pop-head"); head.appendChild(el("b", null, name + " — " + t("bandwidth")));
    var x = el("span", "cc-pop-x", "✕"); x.addEventListener("click", closePop); head.appendChild(x); pop.appendChild(head);
    var body = el("div", "cc-pop-body");
    var cur = bandwidthFor(name);
    // one Mbit/s field per direction. curKbit prefills it (blank = no cap).
    function rateRow(labelText, curKbit) {
      var row = el("div", "cc-pop-row"); row.appendChild(el("label", "cc-pop-lbl", labelText));
      var inp = el("input", "cc-in"); inp.type = "number"; inp.min = "0"; inp.step = "0.1"; inp.placeholder = "0 = ∞";
      inp.value = (curKbit > 0) ? (Math.round(curKbit / 1000 * 100) / 100) : "";
      row.appendChild(inp); row.appendChild(el("span", "cc-unit", "Mbit/s")); body.appendChild(row);
      return inp;
    }
    // UPLOAD only. The download field is gone on purpose: download limiting needed a tc
    // INGRESS qdisc, which crashes some Unraid kernels (sch_ingress → the WebUI/SSH freeze).
    // Upload is shaped safely with a tbf egress qdisc and stays.
    var upIn = rateRow(t("upload"), cur && cur.egress_kbit);
    pop.appendChild(body);
    var foot = el("div", "cc-pop-foot");
    foot.textContent = LANG === "de"
      ? "Nur Upload (tbf-Egress). Das Download-Limit wurde entfernt — es braucht eine tc-ingress-qdisc, die manche Unraid-Kernel zum Absturz bringt (WebUI/SSH werden unerreichbar)."
      : "Upload only (tbf egress). Download limiting was removed — it needs a tc ingress qdisc that crashes some Unraid kernels (WebUI/SSH become unreachable).";
    pop.appendChild(foot);
    function readKbit(inp) { var v = parseFloat(String(inp.value).trim().replace(",", ".")); return v > 0 ? Math.round(v * 1000) : 0; }
    var srow = el("div", "cc-pop-row cc-pop-act");
    var rem = el("span", "cc-btn", t("removeLim")); rem.addEventListener("click", function () { saveBandwidth(name, 0, 0); });
    var save = el("span", "cc-btn cc-btn-primary", t("saveShort")); save.addEventListener("click", function () { saveBandwidth(name, readKbit(upIn), 0); });
    srow.appendChild(rem); srow.appendChild(save); pop.appendChild(srow);
    document.body.appendChild(pop); hardenPop(pop);
    var r = anchor.getBoundingClientRect(), w = pop.offsetWidth || 300;
    pop.style.left = Math.max(window.scrollX + 8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - w - 12)) + "px";
    pop.style.top = (window.scrollY + r.bottom + 6) + "px"; openPop = pop; openPopAnchor = anchor;
  }
  // Show the EXACT backend/Docker rejection INSIDE the open popup and keep it there (a
  // 2.6s toast is unreadable) so the user can read back why `docker update` refused — the
  // only way to diagnose a set/remove failure once a stale install is ruled out. Also logs it.
  function popError(e) {
    var m = (e && e.message) ? e.message : String(e);
    try { console.error("CannonadeCommander:", e); } catch (_) {}
    var p = openPop; if (!p) { flash("Error: " + m, true); return; }
    var box = p.querySelector(".cc-pop-err");
    if (!box) { box = el("div", "cc-pop-err"); var foot = p.querySelector(".cc-pop-foot"); if (foot && foot.nextSibling) p.insertBefore(box, foot.nextSibling); else p.appendChild(box); }
    box.classList.remove("cc-pop-ok"); box.textContent = "✕ " + m; box.style.display = "block";
  }
  function popClearError() { var p = openPop; if (!p) return; var box = p.querySelector(".cc-pop-err"); if (box) { box.textContent = ""; box.style.display = "none"; box.classList.remove("cc-pop-ok"); } }
  // Green confirmation in the SAME slot as the error line — the verified applied values.
  function popOk(msg) {
    var p = openPop; if (!p) { flash(msg); return; }
    var box = p.querySelector(".cc-pop-err");
    if (!box) { box = el("div", "cc-pop-err"); var foot = p.querySelector(".cc-pop-foot"); if (foot && foot.nextSibling) p.insertBefore(box, foot.nextSibling); else p.appendChild(box); }
    box.classList.add("cc-pop-ok"); box.textContent = msg; box.style.display = "block";
  }
  // Persist ONE container's up/down caps (0/0 = remove), read-modify-write against the LIVE
  // config so schedules/watchdogs/notify/shape_iface and every other container survive.
  function saveBandwidth(name, egressKbit, ingressKbit) {
    popClearError(); flash(t("saving"));
    api("GET", "config")
      .then(function (fresh) {
        if (!fresh || typeof fresh !== "object") throw new Error("config unreadable");
        config = { schedules: fresh.schedules || [], watchdogs: fresh.watchdogs || [], bandwidths: fresh.bandwidths || [], notify: fresh.notify || { unraid: false, webhook: "" }, shape_iface: fresh.shape_iface || "" };
        setBandwidth(name, egressKbit, ingressKbit);
        return api("PUT", "config", config);
      })
      .then(function () { flash(t("done")); closePop(); if (mode === "list") reinjectRowBadges(); else renderGrid(); })
      .catch(function (e) { popError(e); });
  }
  // which = "cpu" | "ram" (each badge's own gear) — shows only that field.
  // RAM = a number + a MB/GB unit; CPU = a core count + an optional pin (cpuset).
  function openLimits(anchor, name, which) {
    if (togglePop(anchor)) return;
    closePop();
    var showRam = which !== "cpu", showCpu = which !== "ram";
    var title = which === "cpu" ? t("cpuLimit") : which === "ram" ? t("ramLimit") : "CPU / RAM";
    var pop = el("div", "cc-pop"); if (localStorage.getItem("cc.rainbow") === "1") pop.classList.add("cc-rainbow");
    var head = el("div", "cc-pop-head"); head.appendChild(el("b", null, name + " — " + title));
    var x = el("span", "cc-pop-x", "✕"); x.addEventListener("click", closePop); head.appendChild(x); pop.appendChild(head);
    var body = el("div", "cc-pop-body"), memNum = null, memUnit = null, cpu = null;
    var readCpuset = function () { return ""; }, fillCpuset = function () {};
    if (showRam) {
      var mrow = el("div", "cc-pop-row"); mrow.appendChild(el("label", "cc-pop-lbl", t("ramLimit")));
      memNum = el("input", "cc-in"); memNum.type = "number"; memNum.min = "0"; memNum.step = "0.5"; memNum.placeholder = t("ramNum");
      memUnit = el("select", "cc-in cc-unit"); ["MB", "GB"].forEach(function (u) { var o = el("option", null, u); o.value = u; if (u === "GB") o.selected = true; memUnit.appendChild(o); });
      mrow.appendChild(memNum); mrow.appendChild(memUnit); body.appendChild(mrow);
    }
    if (showCpu) {
      var crow = el("div", "cc-pop-row"); crow.appendChild(el("label", "cc-pop-lbl", t("cpuLimit")));
      cpu = el("input", "cc-in"); cpu.type = "text"; cpu.placeholder = t("cpuNum"); crow.appendChild(cpu); body.appendChild(crow);
      // CPU pinning as a GRAPHICAL core picker like the VM manager: one BOX per physical
      // core, its hyperthreads stacked vertically inside, wrapping into rows — so a
      // 32-thread CPU is a tidy block, not a long column. On an Intel hybrid CPU the boxes
      // carry a P / E tag (from the engine's /sys cpu_core+cpu_atom lists). The counts come
      // from the ENGINE (the HOST's CPUs), not navigator.hardwareConcurrency. Empty = all.
      pop.classList.add("cc-pop-wide"); // pinning needs the extra width
      var prow = el("div", "cc-pop-row cc-pin-row"); prow.appendChild(el("label", "cc-pop-lbl", t("cpuPin")));
      var ncpu = hostCpus || navigator.hardwareConcurrency || 0;
      var coreOf = (hostCoreOf && hostCoreOf.length === ncpu) ? hostCoreOf : null;
      var isE = {}; hostECores.forEach(function (n) { isE[n] = true; });
      var hybrid = hostPCores.length > 0 && hostECores.length > 0;
      if (ncpu > 0 && ncpu <= 512) {
        var grid = el("div", "cc-cores");
        // group the logical CPUs by physical core (flat: every CPU is its own group)
        var groups = {}, order = [];
        for (var ci = 0; ci < ncpu; ci++) {
          var g = coreOf ? coreOf[ci] : ci;
          if (!groups[g]) { groups[g] = []; order.push(g); }
          groups[g].push(ci);
        }
        order.forEach(function (g) {
          var box = el("span", "cc-corebox");
          if (hybrid) {
            var e = groups[g].every(function (n) { return isE[n]; });
            box.classList.add(e ? "cc-corebox-e" : "cc-corebox-p");
            box.appendChild(el("span", "cc-corebox-tag", e ? "E" : "P"));
          }
          groups[g].forEach(function (cpu2) {
            var core = el("span", "cc-core cc-rb-" + (g % 8), String(cpu2)); core.dataset.core = cpu2; // cc-rb-N: rainbow mode colours selected cores per physical-core group
            core.title = "CPU " + cpu2 + (coreOf ? " · core " + g : "") + (hybrid ? (isE[cpu2] ? " · E-core" : " · P-core") : "");
            core.addEventListener("click", function () { this.classList.toggle("cc-core-on"); });
            box.appendChild(core);
          });
          grid.appendChild(box);
        });
        prow.appendChild(grid);
        readCpuset = function () { var sel = []; Array.prototype.slice.call(grid.querySelectorAll(".cc-core")).forEach(function (c) { if (c.classList.contains("cc-core-on")) sel.push(parseInt(c.dataset.core, 10)); }); return setToCpuset(sel); };
        fillCpuset = function (str) { var s = cpusetToSet(str); Array.prototype.slice.call(grid.querySelectorAll(".cc-core")).forEach(function (c) { c.classList.toggle("cc-core-on", s.indexOf(parseInt(c.dataset.core, 10)) >= 0); }); };
      } else {
        var pinIn = el("input", "cc-in"); pinIn.type = "text"; pinIn.placeholder = t("cpuPinPh"); prow.appendChild(pinIn);
        readCpuset = function () { return String(pinIn.value).trim().replace(/\s+/g, ""); };
        fillCpuset = function (str) { pinIn.value = str || ""; };
      }
      body.appendChild(prow);
    }
    pop.appendChild(body);
    pop.appendChild(el("div", "cc-pop-foot", t("limitsFoot")));
    function submitLimits(payload) {
      popClearError(); flash(t("saving")); api("POST", "limits", payload)
        .then(function (resp) {
          // The engine now VERIFIES the change by re-reading the live caps and returns
          // them — show the confirmed values in green so "did it apply?" is answered
          // right in the editor, then close.
          var msg = "✓ " + (LANG === "de" ? "Angewendet" : "Applied");
          if (resp && resp.after_mem != null) {
            msg += " · RAM " + humanBytes(resp.after_mem);
            if (resp.after_nano > 0) msg += " · CPU " + (Math.round(resp.after_nano / 1e7) / 100);
            if (resp.after_cpuset) msg += " · " + resp.after_cpuset;
            // Seed the cache with the docker-VERIFIED values so an immediate reopen
            // prefills instantly — the bulk re-inspect below can take seconds.
            limits[name] = { mem_bytes: resp.after_mem, nano_cpus: resp.after_nano || 0, cpuset_cpus: resp.after_cpuset || "" };
            cur = limits[name]; curLoaded = true;
          }
          popOk(msg); flash(t("done")); return loadLimits();
        })
        .then(function () {
          if (mode === "list") reinjectRowBadges(); else renderGrid();
          // Close ONLY this editor instance: capture the closure's OWN popup node — NOT
          // openPop at schedule time, which (this .then runs after the slow bulk sweep)
          // can already be a popup the user REOPENED, and the timer would kill it
          // (reproduced headless: "TIMER1800 FIRED → reopened popup removed").
          setTimeout(function () { if (openPop === pop) closePop(); }, 1800);
        })
        .catch(function (e) { popError(e); });
    }
    var srow = el("div", "cc-pop-row cc-pop-act");
    // "remove" is an explicit flag, NOT a client-computed value: the engine sets the
    // field to practical-unlimited (host RAM / all cores) and strips it from the
    // template. Sending remove_* (rather than mem_bytes=hostMem) fixes the case where
    // the browser's cached hostMem was 0 and the Remove button did nothing.
    var rem = el("span", "cc-btn", t("removeLim"));
    rem.addEventListener("click", function () {
      var payload = { name: name };
      if (showRam) payload.remove_mem = true;
      if (showCpu) payload.remove_cpu = true;
      submitLimits(payload);
    });
    // `cur` = this container's CURRENT limits, from the FRESH per-name prefill GET (not
    // the bulk map, which can be stale). curLoaded flips true once that GET lands. The
    // "clear a field to remove" decision uses cur AND only fires when curLoaded — so a
    // Save fired before the prefill returns can't false-remove a limit the user never
    // touched, and can't miss a real removal because the bulk map was stale.
    var cur = limits[name] || {}, curLoaded = false;
    var save = el("span", "cc-btn cc-btn-primary", t("saveShort"));
    save.addEventListener("click", function () {
      // The fields are PREFILLED with the current limits, so CLEARING a field means
      // "remove that limit" (what a user does to lift a cap) — not "leave unchanged".
      // A value sets the limit; an empty field on a currently-limited container removes
      // it (remove_mem/remove_cpu). This fixes "it doesn't save when I delete the value".
      var payload = { name: name }, act = false;
      if (memNum) {
        var v = String(memNum.value).trim().replace(",", ".");
        if (v) {
          var num = parseFloat(v);
          if (!(num >= 0)) { flash(t("invalid"), true); return; }
          payload.mem_bytes = Math.round(num * (memUnit.value === "GB" ? 1073741824 : 1048576)); act = true;
        } else if (curLoaded && ramLimited(cur)) { payload.remove_mem = true; act = true; } // cleared → remove
      }
      if (showCpu) {
        var cv = cpu ? String(cpu.value).trim() : "";
        var cpuset = readCpuset();
        if (cpuset && !/^[0-9,\-]+$/.test(cpuset)) { flash(t("invalid"), true); return; }
        var nc = cv ? parseCPU(cpu.value) : 0;
        if (nc < 0) { flash(t("invalid"), true); return; }
        if (nc > 0 || cpuset) {
          if (nc > 0) payload.nano_cpus = nc;
          if (cpuset) payload.cpuset_cpus = cpuset;
          act = true;
        } else if (curLoaded && (cpuLimited(cur) || cpuPinned(cur))) { payload.remove_cpu = true; act = true; } // both CPU controls cleared → remove
      }
      if (!act) { closePop(); return; } // nothing set and nothing to remove
      submitLimits(payload);
    });
    srow.appendChild(rem); srow.appendChild(save); pop.appendChild(srow);
    document.body.appendChild(pop); hardenPop(pop);
    var r = anchor.getBoundingClientRect(), w = pop.offsetWidth || 340;
    pop.style.left = Math.max(window.scrollX + 8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - w - 12)) + "px";
    pop.style.top = (window.scrollY + r.bottom + 6) + "px"; openPop = pop; openPopAnchor = anchor;
    // Prefill IMMEDIATELY from the cached bulk map: the fresh per-name GET can queue
    // SECONDS behind the save-triggered bulk inspect sweep, and an editor that renders
    // empty in that window reads as "wird nicht gespeichert" although the limit IS saved
    // (reproduced headless: popup empty 500ms+ after reopen while docker held the value).
    // The authoritative per-name read then refreshes the fields when it lands.
    // Only prefill REAL limits; a practical-unlimited value (a prior "remove") stays blank.
    function prefill(l) {
      if (!l) return;
      if (memNum && ramLimited(l)) { if (l.mem_bytes >= 1073741824) { memNum.value = Math.round(l.mem_bytes / 1073741824 * 100) / 100; memUnit.value = "GB"; } else { memNum.value = Math.round(l.mem_bytes / 1048576); memUnit.value = "MB"; } }
      if (cpu && cpuLimited(l)) cpu.value = String(Math.round(l.nano_cpus / 1e9 * 100) / 100);
      if (cpuPinned(l)) fillCpuset(l.cpuset_cpus);
    }
    if (limits[name]) prefill(limits[name]); // instant (cur/curLoaded stay with the FRESH read, so clear-to-remove can't act on a stale map)
    api("GET", "limits", null, "name=" + encodeURIComponent(name)).then(function (l) {
      if (!l) return;
      cur = l; curLoaded = true; // fresh current limits — the "clear to remove" decision uses these
      prefill(l);
    }).catch(function () {});
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
    // watchdog + schedules, then write it back — so notify + the shaping interface
    // (set in Settings), every container's bandwidth (set via its own gear) and every
    // other container's entries are preserved even if they changed since this page
    // loaded. If the fresh read fails we abort (no PUT), never wiping config.
    api("GET", "config")
      .then(function (fresh) {
        // Abort rather than fall back to an empty config: writing this container's
        // edits onto an empty base would wipe every other container + notify. The
        // engine always returns a config object on success, so this only guards the
        // unexpected (a null/garbage body), never a legitimate first save.
        if (!fresh || typeof fresh !== "object") throw new Error("config unreadable");
        config = { schedules: fresh.schedules || [], watchdogs: fresh.watchdogs || [], bandwidths: fresh.bandwidths || [], notify: fresh.notify || { unraid: false, webhook: "" }, shape_iface: fresh.shape_iface || "" };
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
          // A native-list rebuild usually means Unraid just FINISHED a container action
          // (stop/start via ITS buttons/menu) — our state map is stale until the next 9s
          // poll, so the re-injected badge showed the OLD state ("only switches after the
          // page refreshes"). Pull fresh state now, throttled so our own idempotent
          // re-injects can't turn this into a request loop.
          try { if (Date.now() - lastObsLoad > 2000) { lastObsLoad = Date.now(); load(); } } catch (e) {}
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
    timers.push(setInterval(function () { try { if (!dead && !openPop && (mode === "grid" || (mode === "list" && colOn("res")))) refreshStats(); } catch (e) {} }, 3500));
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
      try { var rs = document.documentElement.style; ["--cc-icon-color", "--cc-icon-strength", "--cc-accent", "--cc-density"].forEach(function (p) { rs.removeProperty(p); }); } catch (e) {}
      Array.prototype.slice.call(document.querySelectorAll(".cc-hgear, .cc-grid-holder, .cc-menu, .cc-toast, .cc-pop, #cc-names")).forEach(function (n) { n.remove(); });
      hideNative(false);
    } catch (e) {}
  }
  function rearm() { try { if (!dead) return; dead = false; connectObserver(); startTimers(); load().then(refreshLimits); } catch (e) {} }

  // ───────────────────────── run
  function load() {
    if (dead) return Promise.resolve();
    return Promise.all([api("GET", "state"), loadShiplog(), loadConfig()]).then(function (res) {
      daemonUp = true; indexState(res[0]); ensureNames(); refresh(); syncStateBadges(); updateGearHealth();
      if (res[0] && res[0].docker_error) flash("docker: " + res[0].docker_error, true);
    }).catch(function (e) {
      // 404/410 = proxy file gone (uninstalled) → self-remove now; the re-probe
      // rebuilds if it ever returns. 502 = engine down but installed (do NOT tear
      // down); 403 = a transient auth/session blip (NOT an uninstall); 400 = a
      // disallowed path (a real bug — surface it).
      if (e && (e.status === 404 || e.status === 410)) { teardown(); return; }
      daemonUp = false; updateGearHealth();
      flash("engine unreachable: " + e.message, true);
    });
  }
  // Paint EVERY gear red while the daemon is unreachable — a permanent, always-visible
  // health signal (the "engine unreachable" toast lasts 2.6s and is easy to miss). Blue = up.
  function updateGearHealth() {
    try { var bad = daemonUp === false; Array.prototype.slice.call(document.querySelectorAll(".cc-hgear")).forEach(function (g) { g.classList.toggle("cc-hgear-down", bad); }); } catch (e) {}
  }
  function boot() {
    try {
      applySettings();
      // fill the "limit set?" dots AFTER the first paint (so containers are indexed),
      // off the 9s render path — a bulk inspect must not gate or race the paint.
      load().then(refreshLimits);
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
