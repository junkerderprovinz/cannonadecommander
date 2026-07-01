/* CannonadeCommander - Docker-tab panel.
 *
 * Renders a self-contained panel into Unraid's Docker tab that lets you declare
 * a dependency-ordered, health-gated start plan for your containers and fire it
 * ("start in order"). It reads and writes the host supervisor through a
 * same-origin PHP proxy; it never touches the Docker socket from the browser.
 */
(function () {
  "use strict";

  var PROXY = "/plugins/cannonadecommander/server/api.php";
  var PROBES = ["health", "running", "tcp"];
  var POLICIES = ["abort", "continue", "degrade"];

  // state -> dot class
  function stateClass(c) {
    if (c.health === "healthy") return "cc-ok";
    if (c.health === "unhealthy") return "cc-bad";
    if (c.health === "starting") return "cc-warn";
    if (c.state === "running") return "cc-ok";
    return "cc-off";
  }
  function runClass(s) {
    return { ready: "cc-ok", degraded: "cc-warn", failed: "cc-bad", skipped: "cc-off" }[s] || "cc-off";
  }

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function api(method, path, body) {
    var opts = { method: method, headers: { Accept: "application/json" } };
    if (body != null) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(PROXY + "?path=" + encodeURIComponent(path), opts).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        if (!r.ok) {
          var msg = (data && data.error) ? data.error : ("HTTP " + r.status);
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  // Build a name -> plan-node map so the editor keeps the user's settings.
  function planIndex(plan) {
    var m = {};
    (plan && plan.nodes ? plan.nodes : []).forEach(function (n) { m[n.name] = n; });
    return m;
  }

  var mount, statusEl;

  function render(state) {
    mount.innerHTML = "";
    var byName = planIndex(state.plan);
    var lastRun = {};
    if (state.last_run && state.last_run.nodes) {
      state.last_run.nodes.forEach(function (r) { lastRun[r.name] = r; });
    }

    // header
    var head = el("div", "cc-head");
    head.appendChild(el("span", "cc-title", "CannonadeCommander"));
    statusEl = el("span", "cc-status");
    head.appendChild(statusEl);
    var spacer = el("span", "cc-spacer");
    head.appendChild(spacer);
    var saveBtn = el("button", "cc-btn", "Save plan");
    var fireBtn = el("button", "cc-btn cc-btn-primary", "Start in order");
    head.appendChild(saveBtn);
    head.appendChild(fireBtn);
    mount.appendChild(head);

    if (state.docker_error) {
      mount.appendChild(el("div", "cc-err", "Docker: " + state.docker_error));
    }

    // table
    var table = el("table", "cc-table");
    var thead = el("thead");
    var hr = el("tr");
    ["", "Container", "State", "Depends on (after)", "Ready when", "On fail", "Last run"].forEach(function (h) {
      hr.appendChild(el("th", null, h));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el("tbody");

    var containers = (state.containers || []).slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    containers.forEach(function (c) {
      var node = byName[c.name] || null;
      var tr = el("tr");

      // manage checkbox
      var manageTd = el("td");
      var manage = el("input");
      manage.type = "checkbox";
      manage.checked = !!node;
      manage.dataset.name = c.name;
      manage.className = "cc-manage";
      manageTd.appendChild(manage);
      tr.appendChild(manageTd);

      // name + state dot
      var nameTd = el("td", "cc-name");
      nameTd.appendChild(el("span", "cc-dot " + stateClass(c)));
      nameTd.appendChild(el("span", null, c.name));
      tr.appendChild(nameTd);

      tr.appendChild(el("td", "cc-dim", c.state || "?"));

      // after
      var afterTd = el("td");
      var after = el("input", "cc-in cc-after");
      after.type = "text";
      after.placeholder = "gluetun, postgres";
      after.value = node && node.after ? node.after.join(", ") : "";
      afterTd.appendChild(after);
      tr.appendChild(afterTd);

      // probe kind + port
      var probeTd = el("td", "cc-probe");
      var probe = el("select", "cc-in cc-probe-kind");
      PROBES.forEach(function (p) {
        var o = el("option", null, p);
        o.value = p;
        if (node && node.probe && node.probe.kind === p) o.selected = true;
        probe.appendChild(o);
      });
      var port = el("input", "cc-in cc-port");
      port.type = "number";
      port.placeholder = "port";
      port.value = node && node.probe && node.probe.port ? node.probe.port : "";
      var syncPort = function () { port.style.display = probe.value === "tcp" ? "" : "none"; };
      probe.addEventListener("change", syncPort);
      syncPort();
      probeTd.appendChild(probe);
      probeTd.appendChild(port);
      tr.appendChild(probeTd);

      // policy
      var polTd = el("td");
      var pol = el("select", "cc-in cc-policy");
      POLICIES.forEach(function (p) {
        var o = el("option", null, p);
        o.value = p;
        if (node && node.policy === p) o.selected = true;
        pol.appendChild(o);
      });
      polTd.appendChild(pol);
      tr.appendChild(polTd);

      // last run
      var runTd = el("td");
      var lr = lastRun[c.name];
      if (lr) {
        var pill = el("span", "cc-pill " + runClass(lr.state), lr.state);
        pill.title = lr.reason || "";
        runTd.appendChild(pill);
      } else {
        runTd.appendChild(el("span", "cc-dim", "-"));
      }
      tr.appendChild(runTd);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    mount.appendChild(table);
    mount.appendChild(el("div", "cc-foot", "Ready-when: health uses the image HEALTHCHECK, running waits for the container, tcp waits for a port to open. On fail: abort skips dependents, continue/degrade start them anyway."));

    saveBtn.addEventListener("click", function () { savePlan(collectPlan()); });
    fireBtn.addEventListener("click", function () { savePlan(collectPlan(), true); });

    setStatus(state);
  }

  function setStatus(state) {
    var n = (state.containers || []).length;
    statusEl.textContent = "engine up - " + n + " containers";
    statusEl.className = "cc-status cc-ok-text";
  }

  // Read the editor rows back into a Plan.
  function collectPlan() {
    var nodes = [];
    var rows = mount.querySelectorAll("table.cc-table tbody tr");
    rows.forEach(function (tr) {
      var manage = tr.querySelector(".cc-manage");
      if (!manage || !manage.checked) return;
      var name = manage.dataset.name;
      var afterRaw = tr.querySelector(".cc-after").value || "";
      var after = afterRaw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var kind = tr.querySelector(".cc-probe-kind").value;
      var portVal = parseInt(tr.querySelector(".cc-port").value, 10);
      var policy = tr.querySelector(".cc-policy").value;
      var probe = { kind: kind };
      if (kind === "tcp" && portVal > 0) probe.port = portVal;
      if (kind === "running") probe.grace_seconds = 3;
      nodes.push({ name: name, after: after, probe: probe, policy: policy });
    });
    return { nodes: nodes };
  }

  function savePlan(plan, thenApply) {
    flash("Saving...");
    api("PUT", "plan", plan).then(function () {
      if (thenApply) return apply();
      flash("Plan saved");
    }).catch(function (e) { flash("Error: " + e.message, true); });
  }

  function apply() {
    flash("Starting in order...");
    return api("POST", "apply").then(function (res) {
      flash("Started (" + (res && res.nodes ? res.nodes.length : 0) + " containers)");
      return load();
    }).catch(function (e) { flash("Error: " + e.message, true); });
  }

  function flash(msg, bad) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "cc-status " + (bad ? "cc-bad-text" : "cc-ok-text");
  }

  function ensureMount() {
    mount = document.getElementById("cannonade-root");
    if (mount) return mount;
    // Fallback: the .page didn't place a mount - create one at the top of the
    // Docker tab content so the panel still appears.
    mount = el("div", "cc-panel");
    mount.id = "cannonade-root";
    var host = document.getElementById("docker_containers") ||
      document.querySelector(".tabs") || document.body;
    host.parentNode ? host.parentNode.insertBefore(mount, host) : host.appendChild(mount);
    return mount;
  }

  function load() {
    return api("GET", "state").then(render).catch(function (e) {
      mount.innerHTML = "";
      mount.appendChild(el("div", "cc-err", "CannonadeCommander engine unreachable: " + e.message));
    });
  }

  function boot() {
    ensureMount();
    mount.classList.add("cc-panel");
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
