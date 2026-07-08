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
      var nameEl = tds[1].querySelector("strong, b");
      var nm = nameEl ? nameEl.textContent.trim() : ((tds[3].id || "").replace(/^vid-/, ""));
      if (nameEl) nameEl.remove();
      var sup = null;
      Array.prototype.slice.call(tds[1].querySelectorAll("a")).forEach(function (a2) { if (/support/i.test(a2.textContent)) sup = a2; });
      var box = el("div", "cc-plugname");
      var icoWrap = el("div", "cc-plugico");
      while (tds[0].firstChild) icoWrap.appendChild(tds[0].firstChild);
      var txt = el("div", "cc-plugtxt");
      txt.appendChild(el("div", "cc-plugtitle", nm));
      if (sup) {
        var sb = el("a", "cc-b cc-plugsup", LANG === "de" ? "Support-Thread" : "Support thread");
        sb.href = sup.href; sb.target = "_blank"; sb.setAttribute(MARK, "1");
        sb.style.setProperty("background", "#3a3a3a", "important");
        sb.style.setProperty("color", "#ddd", "important");
        sb.style.setProperty("text-decoration", "none", "important");
        sup.remove();
        txt.appendChild(sb);
      }
      box.appendChild(icoWrap); box.appendChild(txt);
      tds[0].appendChild(box);
    }
    var img = tds[0].querySelector("img, i.fa");
    if (img && img.tagName === "IMG") { img.style.setProperty("width", "62px", "important"); img.style.setProperty("height", "62px", "important"); img.style.setProperty("vertical-align", "middle", "important"); }
    else if (img) { img.style.setProperty("font-size", "48px", "important"); }
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
    if (stEl && !stEl.getAttribute(MARK)) {
      var t2 = sid.textContent.toLowerCase();
      if (/up.to.date|aktuell|neuesten stand|current/.test(t2)) { pill(stEl, "#1f9d55", "#fff"); stEl.setAttribute(MARK, "1"); }
      else if (/update|aktualis|install/.test(t2) && !/checking|prüf/.test(t2)) { pill(stEl, "#e0912a", "#161616"); stEl.setAttribute(MARK, "1"); }
    }
    var lnk = sid.querySelector("a"); if (lnk) lnk.style.setProperty("color", "inherit", "important");
    // ── col 6: the remove action as a red badge
    var rm = tds[5].querySelector("a");
    if (rm && !rm.getAttribute(MARK)) {
      rm.setAttribute(MARK, "1");
      pill(rm, "#d9433f", "#fff");
      var rt = rm.textContent.trim(); if (!rt) rm.textContent = LANG === "de" ? "Entfernen" : "Remove";
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
      [600, 1500, 3500].forEach(function (ms) { setTimeout(paint, ms); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
