/* CannonadeCommand — enhances Unraid's PLUGINS tab in place, Docker-tab style:
 * plugin cell with container-sized logo + name + support badge, description in
 * its own column, version + changelog badges stacked, status and remove as
 * pills, accent or rainbow colours — all idempotent on top of the native
 * #plugin_table (ground truth: dynamix.plugin.manager/Plugins.page +
 * include/ShowPlugins.php; the name lives as <strong> in the README markdown). */
(function () {
  "use strict";
  if (window.__ccPlug) return; window.__ccPlug = 1;
  var PROXY = "/plugins/cannonadecommand/server/ccapi.php";
  var LANG = ((document.documentElement.lang || navigator.language || "en").toLowerCase().indexOf("de") === 0) ? "de" : "en";
  var MARK = "data-ccp";

  function ls(k) { return localStorage.getItem(k); }
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }

  var RB_PAL = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"];
  function pal() { try { var jp = JSON.parse(ls("cc.rbpal") || "null"); if (jp && jp.length) return jp; } catch (e) {} return RB_PAL; }
  function idealText(bg) { var n = parseInt(String(bg).replace("#", ""), 16), L = 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255); return L > 150 ? "#161616" : "#fff"; }
  function accent() { return ls("cc.accent") || "#2f6feb"; }
  function colorFor(i) { return ls("cc.rainbow") === "1" ? pal()[i % pal().length] : accent(); }

  // the Docker-tab icon tint, standalone: luminance x target colour via an SVG
  // feColorMatrix, blended by cc.iconstrength; imgs get filter: url(#cc-plug-tint)
  function ensureTint() {
    var hex = /^#?([0-9a-f]{6})$/i.exec(ls("cc.iconcolor") || "");
    if (!hex) return "";
    var n = parseInt(hex[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    var st = Math.max(10, parseInt(ls("cc.iconstrength") || "100", 10)) / 100;
    var lr = 0.2126, lg = 0.7152, lb = 0.0722, i2 = 1 - st;
    function row(c, idx) { var v = [lr * c * st, lg * c * st, lb * c * st, 0, 0]; v[idx] += i2; return v.join(" "); }
    var vals = row(r, 0) + " " + row(g, 1) + " " + row(b, 2) + " 0 0 0 1 0";
    var host = document.getElementById("cc-plug-tint-svg");
    if (!host) { host = document.createElement("div"); host.id = "cc-plug-tint-svg"; host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(host); }
    host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="cc-plug-tint" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="' + vals + '"/></filter></svg>';
    return "url(#cc-plug-tint)";
  }
  function pill(node, bg, tx) {
    node.style.setProperty("background", bg, "important");
    node.style.setProperty("color", tx || idealText(bg), "important");
    node.style.setProperty("border-radius", "999px", "important");
    node.style.setProperty("padding", "3px 12px", "important");
    node.style.setProperty("border", "none", "important");
    node.style.setProperty("box-shadow", "none", "important");
    node.style.setProperty("display", "inline-block", "important");
    node.style.setProperty("line-height", "1.5", "important");
    node.style.setProperty("text-decoration", "none", "important");
  }
  function badge(label, value, i) {
    var b = el("span", "cc-b cc-b-info"); b.setAttribute(MARK, "1");
    var bg = colorFor(i);
    b.style.setProperty("background", bg, "important");
    b.style.setProperty("color", idealText(bg), "important");
    if (label) b.appendChild(el("span", "cc-b-k", label));
    b.appendChild(el("span", "cc-b-v", value));
    return b;
  }

  function paintRow(tr, idx) {
    var tds = tr.children;
    if (!tds || tds.length < 6) return;
    for (var i = 0; i < tds.length; i++) tds[i].style.setProperty("vertical-align", "middle", "important");
    // ── col 1 becomes the PLUGIN cell, Docker-ct-name style: logo at container
    // size + the name in the container font, support-thread badge underneath.
    // The name lives as <strong> inside the README markdown of col 2 — pull it
    // out; the description keeps its own column.
    if (!tds[0].getAttribute(MARK)) {
      tds[0].setAttribute(MARK, "1");
      var nameEl = tds[1].querySelector("h1, h2, h3") || tds[1].querySelector("strong, b");
      var nm = nameEl ? nameEl.textContent.trim() : ((tds[3].id || "").replace(/^vid-/, ""));
      if (nameEl) nameEl.remove(); // no doubled name in the description column
      var sup = null;
      Array.prototype.slice.call(tds[1].querySelectorAll("a")).forEach(function (a2) { if (/support|hilfe|foren|forum/i.test(a2.textContent)) sup = a2; });
      var box = el("div", "cc-plugname");
      var icoWrap = el("div", "cc-plugico");
      while (tds[0].firstChild) icoWrap.appendChild(tds[0].firstChild);
      var txt = el("div", "cc-plugtxt");
      txt.appendChild(el("div", "cc-plugtitle", nm));
      if (sup) {
        var sb = el("a", "cc-b cc-plugsup", LANG === "de" ? "Support-Thread" : "Support thread");
        sb.href = sup.href; sb.target = "_blank"; sb.setAttribute(MARK, "1");
        var sbg = colorFor(idx + 9);
        sb.style.setProperty("background", sbg, "important");
        sb.style.setProperty("color", idealText(sbg), "important");
        sb.style.setProperty("text-decoration", "none", "important");
        sup.remove();
        txt.appendChild(sb);
      }
      box.appendChild(icoWrap); box.appendChild(txt);
      tds[0].appendChild(box);
    }
    var ico = tds[0].querySelector(".cc-plugico");
    if (ico) { ico.style.setProperty("width", "64px", "important"); ico.style.setProperty("height", "64px", "important"); }
    var img = tds[0].querySelector("img, i.fa");
    var tintOn = ls("cc.plugtint") !== "0";
    if (img && img.tagName === "IMG") {
      img.style.setProperty("max-width", "62px", "important");
      img.style.setProperty("max-height", "62px", "important");
      img.style.setProperty("width", "auto", "important");
      img.style.setProperty("height", "auto", "important");
      img.style.setProperty("vertical-align", "middle", "important");
      var f2 = tintOn ? ensureTint() : ""; img.style.setProperty("filter", f2 || "none", "important");
    } else if (img) { img.style.setProperty("font-size", "46px", "important"); var f3 = tintOn ? ensureTint() : ""; img.style.setProperty("filter", f3 || "none", "important"); }
    // col 3: author as a badge
    var au = tds[2];
    if (!au.querySelector(".cc-b")) {
      var name = au.textContent.trim();
      if (name) { au.textContent = ""; au.appendChild(badge("Von", name, idx)); }
    }
    // ── col 4 (vid): version badge with the CHANGELOG badge stacked underneath
    // (Docker-tab style); the native info-circle keeps its delegated handler —
    // it is hidden and our badge clicks it.
    var vid = tds[3];
    if (!vid.querySelector(".cc-b")) {
      var icon = vid.querySelector("span.fa, i.fa");
      var vtxt = "";
      Array.prototype.slice.call(vid.childNodes).forEach(function (n2) { if (n2.nodeType === 3) { vtxt += n2.textContent; n2.textContent = ""; } });
      vtxt = vtxt.replace(/ /g, " ").trim();
      var col = el("div", "cc-plugver");
      if (vtxt) col.appendChild(badge("Version", vtxt, idx + 3));
      if (icon) {
        icon.style.setProperty("display", "none", "important");
        var ib = el("span", "cc-b"); ib.setAttribute(MARK, "1");
        ib.appendChild(el("span", "cc-b-v", "Changelog"));
        var bg2 = colorFor(idx + 6);
        ib.style.setProperty("background", bg2, "important");
        ib.style.setProperty("color", idealText(bg2), "important");
        ib.style.setProperty("cursor", "pointer", "important");
        ib.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); icon.click(); });
        col.appendChild(ib);
      }
      if (col.children.length) vid.appendChild(col);
    }
    // ── col 5 (sid): status badge — green "auf dem neuesten Stand", amber update.
    // The cell is REWRITTEN by the update-check ajax, so this re-runs per mutation.
    var sid = tds[4], stEl = sid.querySelector("span, a");
    if (!stEl && sid.textContent.trim() && !/checking|prüf/i.test(sid.textContent)) {
      stEl = el("span", null); while (sid.firstChild) stEl.appendChild(sid.firstChild); sid.appendChild(stEl);
    }
    if (stEl && !stEl.getAttribute(MARK)) {
      var t2 = sid.textContent.toLowerCase();
      if (/up.to.date|aktuell|neue?sten stand|current/.test(t2)) { pill(stEl, "#1f9d55", "#fff"); stEl.setAttribute(MARK, "1"); }
      else if (/update|aktualis|install/.test(t2) && !/checking|prüf/.test(t2)) { pill(stEl, "#e0912a", "#161616"); stEl.setAttribute(MARK, "1"); }
    }
    var lnk = sid.querySelector("a"); if (lnk) lnk.style.setProperty("color", "inherit", "important");
    // ── col 6: the remove action as a red badge
    var cb = tds[5].querySelector("input[type=checkbox]");
    if (cb && !cb.getAttribute(MARK)) { cb.setAttribute(MARK, "1"); cb.style.setProperty("accent-color", accent(), "important"); cb.style.setProperty("width", "17px", "important"); cb.style.setProperty("height", "17px", "important"); cb.style.setProperty("cursor", "pointer", "important"); }
    var rm = tds[5].querySelector("a, input[type=button], input[type=submit], button");
    if (rm && !rm.getAttribute(MARK)) {
      rm.setAttribute(MARK, "1");
      pill(rm, "#d9433f", "#fff");
      rm.style.setProperty("cursor", "pointer", "important");
      rm.style.setProperty("letter-spacing", "0", "important");
      rm.style.setProperty("text-transform", "none", "important");
      rm.style.setProperty("font-weight", "600", "important");
      if (rm.tagName === "INPUT" && !rm.value.trim()) rm.value = LANG === "de" ? "Entfernen" : "Remove";
    }
    // col 2: description in its own column, dimmed but readable
    var desc = tds[1].querySelector(".desc_readmore");
    if (desc) { desc.style.setProperty("color", "#9a9a9a", "important"); desc.style.setProperty("font-size", "12px", "important"); }
  }

  function paint() {
    try {
      if (ls("cc.styleplugin") === "0") return; // takeover disabled in the settings
      var tb = document.getElementById("plugin_table"); if (!tb) return;
      tb.classList.add("cc-plug");
      var ths = tb.querySelectorAll("thead th");
      if (ths.length >= 2 && !ths[0].getAttribute(MARK)) {
        ths[0].setAttribute(MARK, "1");
        ths[0].textContent = "Plugin";
        ths[1].textContent = LANG === "de" ? "Beschreibung" : "Description";
      }
      var rows = document.querySelectorAll("#plugin_list > tr");
      Array.prototype.slice.call(rows).forEach(function (tr, i) { try { paintRow(tr, i); } catch (e) {} });
      // the page TABS become filled pills — no frames, minimal. Unraid builds
      // differ, so every plausible strip is covered (.tabs-container is the one
      // the Plugins page itself appends its buttons to).
      var tabEls = document.querySelectorAll(".tabs label, #tabs label, div.tabs > div, .tabs-container > a, .tabs-container > div:not(.status), .tabs-container .tab, [id^='tab'] > label");
      Array.prototype.slice.call(tabEls).forEach(function (lb2) {
        if (lb2.querySelector("input[type=button], input[type=submit]")) return; // not the action buttons
        var txt2 = (lb2.textContent || "").trim(); if (!txt2 || txt2.length > 40) return;
        var inp = document.getElementById(lb2.htmlFor || "") || lb2.querySelector("input[type=radio]");
        var act = !!(inp && inp.checked) || /(^|\s)(active|current|selected)(\s|$)/.test(lb2.className) || lb2.getAttribute("aria-selected") === "true";
        lb2.style.setProperty("background", act ? accent() : "transparent", "important");
        lb2.style.setProperty("color", act ? idealText(accent()) : "#9a9a9a", "important");
        lb2.style.setProperty("border", "none", "important");
        lb2.style.setProperty("box-shadow", "none", "important");
        lb2.style.setProperty("border-radius", "999px", "important");
        lb2.style.setProperty("padding", "4px 14px", "important");
        lb2.style.setProperty("text-transform", "uppercase", "important");
        lb2.style.setProperty("letter-spacing", "1.5px", "important");
        lb2.style.setProperty("font-size", "12px", "important");
      });
      // Install-Plugin tab: clean dark input + accent pill button + accent checkbox
      Array.prototype.slice.call(document.querySelectorAll("form[name=plugin_install]")).forEach(function (fm) {
        var ti = fm.querySelector("input[type=text]");
        if (ti && !ti.getAttribute(MARK)) {
          ti.setAttribute(MARK, "1");
          ti.style.setProperty("background", "#1c1c1c", "important");
          ti.style.setProperty("border", "1px solid #333", "important");
          ti.style.setProperty("border-radius", "8px", "important");
          ti.style.setProperty("padding", "7px 12px", "important");
          ti.style.setProperty("color", "#e6e6e6", "important");
        }
        var sub = fm.querySelector("input[type=submit]");
        if (sub && !sub.getAttribute(MARK)) { sub.setAttribute(MARK, "1"); pill(sub, accent()); sub.style.setProperty("cursor", "pointer", "important"); }
        var fc = fm.querySelector("input[type=checkbox]");
        if (fc && !fc.getAttribute(MARK)) { fc.setAttribute(MARK, "1"); fc.style.setProperty("accent-color", accent(), "important"); }
      });
      // every OTHER table on the composite page (install errors / stale tab)
      Array.prototype.slice.call(document.querySelectorAll("table.tablesorter")).forEach(function (t4) { if (t4.id !== "plugin_table") t4.classList.add("cc-plug-lite"); });
      // the Check/Update/Remove buttons in the tab bar become accent pills
      Array.prototype.slice.call(document.querySelectorAll("#checkall input, #updateall input, #removeall input")).forEach(function (b2, i2) {
        if (!b2.getAttribute(MARK)) { pill(b2, colorFor(i2 + 6)); b2.style.setProperty("cursor", "pointer", "important"); b2.setAttribute(MARK, "1"); }
      });
    } catch (e) {}
  }

  // adopt the engine-mirrored cc.* settings first, so accent/rainbow match the
  // other tabs on EVERY origin, then paint and follow the ajax rewrites
  function adopt(done) {
    fetch(PROXY + "?path=config", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) {
        try { var u = c && c.ui_settings; if (u) Object.keys(u).forEach(function (k) { if (k.indexOf("cc.") === 0 && ls(k) !== u[k]) localStorage.setItem(k, u[k]); }); } catch (e) {}
        done();
      })
      .catch(function () { done(); });
  }

  function boot() {
    adopt(function () {
      paint();
      var host = document.getElementById("plugin_list") || document.body;
      var t3 = null;
      new MutationObserver(function () { clearTimeout(t3); t3 = setTimeout(paint, 250); }).observe(host, { childList: true, subtree: true, characterData: true });
      document.addEventListener("change", function () { setTimeout(paint, 50); }); // tab switches repaint the pills
      [600, 1500, 3500].forEach(function (ms) { setTimeout(paint, ms); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
