/* CannonadeCommander settings page. Client-side only: renders a form into
 * #cc-settings and persists to localStorage (cc.accent / cc.density / cc.view /
 * cc.colview). The Docker-tab enhancer reads the same keys and reacts live via
 * the storage event, so changes here take effect the moment you switch tabs. */
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
    { key: "plan", label: T("Startplan", "Plan") },
  ];
  var PRESETS = ["#2f6feb", "#1f9d55", "#ff8c2f", "#8b5cf6", "#e0912a", "#d9433f", "#0ea5a4", "#525252"];

  function defColview() {
    var adv = { s: false, a: true }, both = { s: true, a: true };
    return { update: both, force: adv, version: adv, net: both, res: adv, id: adv, von: adv, plan: both };
  }
  function get(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function loadColview() { try { var j = JSON.parse(localStorage.getItem("cc.colview") || "null"); if (j && typeof j === "object") { var d = defColview(); Object.keys(d).forEach(function (k) { if (j[k]) d[k] = { s: !!j[k].s, a: !!j[k].a }; }); return d; } } catch (e) {} return defColview(); }

  var accent = get("cc.accent", "#2f6feb");
  var density = get("cc.density", "normal");
  var view = get("cc.view", "list");
  var colview = loadColview();

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function h(txt) { var e = el("div", "cc-menu-h"); e.textContent = txt; e.style.fontSize = "12px"; e.style.marginTop = "18px"; return e; }

  function render() {
    root.innerHTML = "";
    root.style.setProperty("--cc-accent", accent);
    root.style.maxWidth = "760px";

    var title = el("h2", null, "CannonadeCommander"); title.style.margin = "6px 0 2px";
    root.appendChild(title);
    root.appendChild(el("div", "cc-dim", T("Aussehen des Docker-Tab-Panels. Wird sofort im Docker-Tab wirksam (localStorage, pro Browser).", "Look of the Docker-tab panel. Applies live in the Docker tab (localStorage, per browser).")));

    // ── accent colour ──
    root.appendChild(h(T("Badge-Akzentfarbe", "Badge accent colour")));
    var srow = el("div"); srow.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px";
    PRESETS.forEach(function (c) {
      var sw = el("button"); sw.type = "button"; sw.title = c;
      sw.style.cssText = "width:26px;height:26px;border-radius:50%;border:2px solid " + (c === accent ? "#fff" : "transparent") + ";background:" + c + ";cursor:pointer";
      sw.addEventListener("click", function () { accent = c; set("cc.accent", accent); render(); });
      srow.appendChild(sw);
    });
    var pick = el("input"); pick.type = "color"; pick.value = accent;
    pick.style.cssText = "width:36px;height:30px;border:none;background:none;cursor:pointer";
    pick.addEventListener("input", function () { accent = pick.value; set("cc.accent", accent); previewOnly(); });
    pick.addEventListener("change", function () { render(); });
    srow.appendChild(pick);
    root.appendChild(srow);
    // live preview
    var prev = el("div", "cc-b"); prev.id = "cc-prev";
    prev.style.marginTop = "10px";
    prev.appendChild(elk("Netzwerk")); prev.appendChild(elv("br0.20"));
    root.appendChild(prev);

    // ── column visibility matrix ──
    root.appendChild(h(T("Spalten / Badges je Ansicht", "Columns / badges per view")));
    var tbl = el("table"); tbl.style.cssText = "border-collapse:collapse;margin-top:6px;font-size:13px";
    var thr = el("tr");
    thr.appendChild(thc(""));
    thr.appendChild(thc(T("Einfach", "Simple")));
    thr.appendChild(thc(T("Advanced", "Advanced")));
    tbl.appendChild(thr);
    COLS.forEach(function (c) {
      var tr = el("tr");
      var name = el("td", null, c.label); name.style.cssText = "padding:4px 16px 4px 0";
      tr.appendChild(name);
      tr.appendChild(chkCell(c.key, "s"));
      tr.appendChild(chkCell(c.key, "a"));
      tbl.appendChild(tr);
    });
    root.appendChild(tbl);

    // ── default view + density ──
    root.appendChild(h(T("Standard-Ansicht", "Default view")));
    var vrow = el("div"); vrow.style.marginTop = "6px";
    [["list", T("Liste", "List")], ["grid", T("Raster", "Grid")]].forEach(function (o) {
      var lab = el("label"); lab.style.marginRight = "16px";
      var rb = el("input"); rb.type = "radio"; rb.name = "cc-view"; rb.checked = view === o[0];
      rb.addEventListener("change", function () { view = o[0]; set("cc.view", view); });
      lab.appendChild(rb); lab.appendChild(document.createTextNode(" " + o[1]));
      vrow.appendChild(lab);
    });
    root.appendChild(vrow);

    root.appendChild(h(T("Zeilenhöhe", "Row density")));
    var drow = el("div"); drow.style.marginTop = "6px";
    [["compact", T("kompakt", "compact")], ["normal", T("normal", "normal")], ["airy", T("luftig", "airy")]].forEach(function (o) {
      var lab = el("label"); lab.style.marginRight = "16px";
      var rb = el("input"); rb.type = "radio"; rb.name = "cc-dens"; rb.checked = density === o[0];
      rb.addEventListener("change", function () { density = o[0]; set("cc.density", density); });
      lab.appendChild(rb); lab.appendChild(document.createTextNode(" " + o[1]));
      drow.appendChild(lab);
    });
    root.appendChild(drow);

    var note = el("div", "cc-dim", T("Öffne danach den Docker-Tab (oder wechsle dorthin) – die Änderungen erscheinen sofort.", "Open (or switch to) the Docker tab afterwards; changes appear immediately."));
    note.style.marginTop = "22px";
    root.appendChild(note);
  }
  function elk(t) { var s = el("span", "cc-b-k"); s.textContent = t; return s; }
  function elv(t) { var s = el("span", "cc-b-v"); s.textContent = t; return s; }
  function thc(t) { var e = el("th", null, t); e.style.cssText = "padding:4px 12px;text-align:center;color:#8a8a8a;font-weight:500;font-size:11px"; return e; }
  function chkCell(key, view2) {
    var td = el("td"); td.style.textAlign = "center";
    var cb = el("input"); cb.type = "checkbox"; cb.checked = !!(colview[key] && colview[key][view2]);
    cb.addEventListener("change", function () {
      if (!colview[key]) colview[key] = { s: true, a: true };
      colview[key][view2] = cb.checked; set("cc.colview", JSON.stringify(colview));
    });
    td.appendChild(cb); return td;
  }
  function previewOnly() { root.style.setProperty("--cc-accent", accent); var p = document.getElementById("cc-prev"); if (p) p.style.background = accent; }

  render();
})();
