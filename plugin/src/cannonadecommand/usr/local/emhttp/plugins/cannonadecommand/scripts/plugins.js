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
  // effective setting: adopt the Docker tab's cc.* while the takeover toggle is
  // on (default), otherwise this tab's own ccp.* keys
  function eff(name) { return ls("cc.styleplugin") !== "0" ? ls("cc." + name) : ls("ccp." + name); }
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }

  var RB_PAL = ["#d9433f", "#f97316", "#eab308", "#1f9d55", "#0ea5a4", "#2f6feb", "#8b5cf6", "#e05299"];
  var RB_OFFSET = Math.floor(Math.random() * RB_PAL.length); // fresh deal per reload, like the Docker tab
  // Rainbow is a GLOBAL mode: read cc.rainbow / cc.rbpal / cc.rainbowrot DIRECTLY (not the
  // adopt-gated eff()), like docker.js — one global Rainbow switch colours every enabled area.
  // accent() stays adopt-gated (eff) for the non-rainbow single colour.
  function pal() { try { var jp = JSON.parse(ls("cc.rbpal") || "null"); if (jp && jp.length) return jp; } catch (e) {} return RB_PAL; }
  function idealText(bg) { var n = parseInt(String(bg).replace("#", ""), 16), L = 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255); return L > 150 ? "#161616" : "#fff"; }
  function accent() { return eff("accent") || "#2f6feb"; }
  function colorFor(i) {
    if (ls("cc.rainbow") !== "1") return accent();
    var off = ls("cc.rainbowrot") === "0" ? 0 : RB_OFFSET;
    return pal()[(i + off) % pal().length];
  }

  // the Docker-tab icon tint, standalone: luminance x target colour via an SVG
  // feColorMatrix, blended by cc.iconstrength; imgs get filter: url(#cc-plug-tint)
  function ensureTint() {
    var hex = /^#?([0-9a-f]{6})$/i.exec(eff("iconcolor") || "");
    if (!hex) return "";
    var n = parseInt(hex[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    var st = Math.max(10, parseInt(eff("iconstrength") || "100", 10)) / 100;
    var lr = 0.2126, lg = 0.7152, lb = 0.0722, i2 = 1 - st;
    function row(c, idx) { var v = [lr * c * st, lg * c * st, lb * c * st, 0, 0]; v[idx] += i2; return v.join(" "); }
    var vals = row(r, 0) + " " + row(g, 1) + " " + row(b, 2) + " 0 0 0 1 0";
    var host = document.getElementById("cc-plug-tint-svg");
    if (!host) { host = document.createElement("div"); host.id = "cc-plug-tint-svg"; host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(host); }
    host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="cc-plug-tint" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values="' + vals + '"/></filter></svg>';
    return "url(#cc-plug-tint)";
  }
  // logo-background monochrome tint: flatten the logo to a single ink tone (the
  // ideal-contrast text colour for the accent badge box) via an SVG feColorMatrix
  // that keeps alpha but maps RGB to one grey. Signature-guarded so the shared
  // MutationObserver never re-writes identical SVG in a repaint loop.
  function ensureMonoFilter(hostId, filtId, accentHex) {
    var host = document.getElementById(hostId);
    var m = /^#?([0-9a-f]{6})$/i.exec(accentHex || "");
    if (!m) { if (host) host.remove(); return ""; }
    var ink = idealText("#" + m[1]);
    var hx = ink.length === 4 ? ink[1] + ink[1] + ink[2] + ink[2] + ink[3] + ink[3] : ink.slice(1);
    var c = ((parseInt(hx, 16) >> 16 & 255) / 255).toFixed(4);
    if (!host) { host = document.createElement("div"); host.id = hostId; host.setAttribute("aria-hidden", "true"); host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(host); }
    var sig = filtId + "|" + c;
    if (host.dataset.sig !== sig) {
      var vals = "0 0 0 0 " + c + " 0 0 0 0 " + c + " 0 0 0 0 " + c + " 0 0 0 1 0";
      host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="' + filtId + '" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values="' + vals + '"/></filter></svg>';
      host.dataset.sig = sig;
    }
    return "url(#" + filtId + ")";
  }
  function shapeRadius() { return ({ pill: "999px", rounded: "6px", square: "0px" })[ls("cc.badgeshape") || "pill"] || "999px"; }
  function pill(node, bg, tx) {
    node.style.setProperty("font-size", "12px", "important"); // same height as the badges
    node.style.setProperty("vertical-align", "middle", "important");
    node.style.setProperty("background", bg, "important");
    node.style.setProperty("color", tx || idealText(bg), "important");
    node.style.setProperty("border-radius", shapeRadius(), "important");
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

  // CONTENT-AWARE logo sizing: many plugin icons carry baked-in padding, so a
  // fixed box alone still LOOKS uneven. The alpha bounding box of each icon is
  // measured once on a canvas and the image scaled so the visible artwork spans
  // the same size everywhere.
  //
  // Deterministic icon normalization: the transform-scale hack was uneven (a 1.6x
  // cap left heavily-padded icons small, and drawing to a square distorted the
  // aspect ratio it measured from). Instead we crop each logo to its real content
  // bounding box (alpha) and RE-RENDER it centered at the same target fill in a
  // square canvas, then swap the src. Every plugin logo then shows content at the
  // SAME visual size regardless of its baked-in padding or source resolution.
  //
  var normCache = {};
  function applyNorm(img, url) {
    if (img.getAttribute("data-cc-normed") === url) return; // already swapped
    if (!img.getAttribute("data-cc-osrc")) img.setAttribute("data-cc-osrc", img.src);
    img.setAttribute("data-cc-normed", url);
    img.src = url;
  }
  function normalizeIcon(img) {
    // key on the ORIGINAL src so a re-render (Unraid rewrites the row) still hits cache
    var src = img.getAttribute("data-cc-osrc") || img.src || ""; if (!src) return;
    if (src.indexOf("data:") === 0) return;
    if (normCache[src] != null) { if (normCache[src] !== "1") applyNorm(img, normCache[src]); return; }
    normCache[src] = "1"; // provisional
    var probe = new Image();
    probe.onerror = function () { normCache[src] = "1"; };
    probe.onload = function () {
      try {
        var nw = probe.naturalWidth, nh = probe.naturalHeight; if (!nw || !nh) return;
        // draw the source contain-style into WxW so the measured bbox matches what is seen
        var W = 96, cv = document.createElement("canvas"); cv.width = cv.height = W;
        var cx = cv.getContext("2d");
        var sc = Math.min(W / nw, W / nh), dw = nw * sc, dh = nh * sc, ox = (W - dw) / 2, oy = (W - dh) / 2;
        cx.drawImage(probe, ox, oy, dw, dh);
        var dpx = cx.getImageData(0, 0, W, W).data;
        var minX = W, minY = W, maxX = -1, maxY = -1;
        for (var y = 0; y < W; y++) for (var x = 0; x < W; x++) { if (dpx[(y * W + x) * 4 + 3] > 12) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
        if (maxX < 0) { normCache[src] = "1"; return; }
        var bw = maxX - minX + 1, bh = maxY - minY + 1;
        // re-render the cropped content, centered, filling 88% of the output square
        var OUT = 128, avail = OUT * 0.82, k = Math.min(avail / bw, avail / bh);
        var out = document.createElement("canvas"); out.width = out.height = OUT;
        var ocx = out.getContext("2d"); ocx.imageSmoothingEnabled = true; ocx.imageSmoothingQuality = "high";
        var tw = bw * k, th = bh * k;
        ocx.drawImage(cv, minX, minY, bw, bh, (OUT - tw) / 2, (OUT - th) / 2, tw, th);
        var url = out.toDataURL("image/png"); // tainted (cross-origin) -> throws -> fallback below
        normCache[src] = url; applyNorm(img, url);
      } catch (e9) { normCache[src] = "1"; }
    };
    probe.src = src;
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
    // ALL THREE icon types Unraid emits in this cell: <img> (PNG), <i class="fa …">
    // (FontAwesome) AND <i class="icon-… list"> (Unraid's own glyph font). The old
    // "img, i.fa" selector missed the icon-* glyphs entirely and sized fa (46px) vs
    // img (62px) differently — exactly why the logos came out different sizes.
    var f2 = ensureTint();
    // logo-background badge on: flatten every logo to one ink tone so it reads on
    // the accent box (mono filter overrides the iconcolor tint f2 when active)
    var ibgOn = document.documentElement.classList.contains("cc-plugins-iconbg");
    var ibgIcon = eff("iconcolor"); var ibgBg = (ibgIcon && /^#?[0-9a-f]{6}$/i.test(ibgIcon)) ? ibgIcon : accent();
    var ibgMono = ibgOn ? ensureMonoFilter("cc-plug-mono-svg", "cc-plug-mono-tint", ibgBg) : "";
    Array.prototype.slice.call(tds[0].querySelectorAll("img, i")).forEach(function (el2) {
      el2.style.setProperty("width", "56px", "important");
      el2.style.setProperty("height", "56px", "important");
      el2.style.setProperty("vertical-align", "middle", "important");
      if (el2.tagName === "IMG") {
        el2.style.setProperty("object-fit", "contain", "important");
        el2.style.removeProperty("transform"); // superseded by content normalization
        normalizeIcon(el2); // crop to content bbox -> uniform visual size
        el2.style.setProperty("filter", ibgMono || f2 || "none", "important");
      } else {
        // font glyph (fa- or icon-): size + center to visually match the images
        el2.style.setProperty("font-size", "50px", "important");
        el2.style.setProperty("line-height", "56px", "important");
        el2.style.setProperty("text-align", "center", "important");
        el2.style.setProperty("display", "inline-block", "important");
        if (ibgOn) el2.style.setProperty("color", idealText(ibgBg), "important");
        el2.style.setProperty("filter", ibgMono || f2 || "none", "important");
      }
    });
    // col 3: author as a badge
    var au = tds[2];
    if (!au.querySelector(".cc-b")) {
      var name = au.textContent.trim();
      if (name) { au.textContent = ""; au.appendChild(badge("Von", name, idx)); }
    }
    // ── col 4 (vid): version badge with the CHANGELOG badge stacked underneath
    // (Docker-tab style); the native info-circle keeps its delegated handler —
    // it is hidden and our badge clicks it.
    // ── col 4 (vid): the stack is rebuilt after EVERY ajax rewrite —
    // [Neu <new>] (amber, only with a pending update) → [Version <old>] → [Changelog]
    var vid = tds[3];
    var col = vid.querySelector(".cc-plugver");
    if (!col) { col = el("div", "cc-plugver"); vid.appendChild(col); }
    var redV = vid.querySelector("span.red-text:not([data-ccp]), span.orange-text:not([data-ccp])");
    if (redV && redV.textContent.trim()) {
      redV.setAttribute(MARK, "1");
      redV.style.setProperty("display", "none", "important");
      var nb0 = el("span", "cc-b"); nb0.setAttribute(MARK, "1");
      nb0.appendChild(el("span", "cc-b-k", "Neu"));
      nb0.appendChild(el("span", "cc-b-v", redV.textContent.trim()));
      nb0.style.setProperty("background", "#e0912a", "important");
      nb0.style.setProperty("color", "#161616", "important");
      col.insertBefore(nb0, col.firstChild);
    }
    if (!col.querySelector(".cc-verb")) {
      var icon = vid.querySelector("span.fa, i.fa");
      var vtxt = "";
      Array.prototype.slice.call(vid.childNodes).forEach(function (n2) { if (n2.nodeType === 3) { vtxt += n2.textContent; n2.textContent = ""; } });
      vtxt = vtxt.replace(/ /g, " ").trim();
      if (vtxt) { var vb = badge("Version", vtxt, idx + 3); vb.classList.add("cc-verb"); col.appendChild(vb); }
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
    }
    // ── col 5 (sid): status badge — green "auf dem neuesten Stand", amber update.
    // The cell is REWRITTEN by the update-check ajax, so this re-runs per mutation.
    var sid = tds[4];
    var upA = sid.querySelector("a:not([data-ccp]), input[type=button]:not([data-ccp])");
    if (upA && /update|aktualis/i.test(upA.textContent || upA.value || "")) {
      upA.setAttribute(MARK, "1"); pill(upA, "#e0912a", "#161616");
      upA.style.setProperty("cursor", "pointer", "important");
      upA.style.setProperty("font-weight", "600", "important");
    }
    var stEl = sid.querySelector("span, a");
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
    // col 2: description in its own column — NOT click-expandable any more; a
    // fixed window whose content scrolls UP while hovered (Docker-volumes style)
    var desc = tds[1].querySelector(".desc_readmore, .cc-desc");
    if (desc && !desc.getAttribute(MARK)) {
      desc.setAttribute(MARK, "1");
      desc.classList.remove("desc_readmore"); // detach dynamix' click-to-expand
      desc.classList.add("cc-desc");
      var inn = el("div", "cc-descin");
      while (desc.firstChild) inn.appendChild(desc.firstChild);
      desc.appendChild(inn);
      var sib = desc.nextElementSibling; // the chevron the readmore lib left behind
      if (sib && /readmore|toggle/i.test(sib.className || "")) sib.style.setProperty("display", "none", "important");
      // manually scrollable window (the auto-marquee scrolled unevenly)
    }
    if (desc) {
      desc.style.setProperty("color", "#9a9a9a", "important"); desc.style.setProperty("font-size", "12px", "important");
      // inline, EVERY pass: the readmore lib left inline heights on some rows,
      // which killed the scroll window there
      desc.style.setProperty("display", "block", "important");
      desc.style.setProperty("height", "auto", "important");
      desc.style.setProperty("max-height", "5em", "important");
      desc.style.setProperty("overflow-y", "auto", "important");
      // IDENTICAL geometry in every row, so the scrollbars line up exactly
      desc.style.setProperty("width", "100%", "important");
      desc.style.setProperty("box-sizing", "border-box", "important");
      desc.style.setProperty("margin", "0", "important");
    }
  }

  // (4) colour the page tab buttons: colorFor() gives the accent normally and a
  // rotated palette colour in rainbow mode, so the active tab follows the theme.
  function colorTabs() {
    try {
      Array.prototype.slice.call(document.querySelectorAll("nav.tabs .tabs-container > button[role=tab]")).forEach(function (t, i) {
        if (t.getAttribute("aria-selected") === "true") { var c = colorFor(i); t.style.setProperty("background", c, "important"); t.style.setProperty("color", idealText(c), "important"); }
        else { t.style.removeProperty("background"); t.style.removeProperty("color"); }
      });
      Array.prototype.slice.call(document.querySelectorAll("div.tab input[type=radio] + label, .tabbed input[type=radio] + label")).forEach(function (l, i) {
        var r = l.previousElementSibling, chk = r && r.checked;
        if (chk) { var c2 = colorFor(i); l.style.setProperty("background", c2, "important"); l.style.setProperty("color", idealText(c2), "important"); }
        else { l.style.removeProperty("background"); l.style.removeProperty("color"); }
      });
    } catch (e) {}
  }
  function paint() {
    try {
      var tbs = document.querySelectorAll("#plugin_table, table.tablesorter");
      if (!tbs.length) return;
      Array.prototype.slice.call(tbs).forEach(function (t5) { t5.classList.add(t5.querySelector("#plugin_list") ? "cc-plug" : "cc-plug-lite"); });
      var tb = document.querySelector("table.cc-plug") || tbs[0];
      document.documentElement.style.setProperty("--cc-b-radius", shapeRadius());
      var ths = tb.querySelectorAll("thead th");
      if (ths.length >= 2 && !ths[0].getAttribute(MARK)) {
        ths[0].setAttribute(MARK, "1");
        ths[0].textContent = "Plugin";
        ths[1].textContent = LANG === "de" ? "Beschreibung" : "Description";
      }
      var rows = document.querySelectorAll("#plugin_list > tr");
      Array.prototype.slice.call(rows).forEach(function (tr, i) { try { paintRow(tr, i); } catch (e) {} });
      // the page TABS are styled by pure CSS (input:checked + label in docker.css)
      // — the accent lives in :root vars so the CSS follows the configured colour
      document.documentElement.style.setProperty("--cc-accent", accent());
      document.documentElement.style.setProperty("--cc-accent-text", idealText(accent()));
      // logo-background badge: scope the docker.css .cc-plugico box on/off from the
      // adopt-aware key (honours "Adopt Docker style" via eff()), same as the Docker tab
      document.documentElement.classList.toggle("cc-plugins-iconbg", eff("iconbg") === "1");
      var pIcon = eff("iconcolor");
      if (eff("iconbg") === "1" && pIcon && /^#?[0-9a-f]{6}$/i.test(pIcon)) document.documentElement.style.setProperty("--cc-iconbg-color", pIcon);
      else document.documentElement.style.removeProperty("--cc-iconbg-color");
      colorTabs();
      if (!window.__ccTabClick) { window.__ccTabClick = 1; document.addEventListener("click", function (e) { try { if (e.target.closest && e.target.closest("nav.tabs, div.tab, .tabbed")) setTimeout(colorTabs, 30); } catch (x) {} }, true); }
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
      // lite tables (install errors / stale): ERROR pill + red action link
      Array.prototype.slice.call(document.querySelectorAll("table.cc-plug-lite tbody tr")).forEach(function (tr5) {
        var st5 = tr5.querySelector("span.orange-text, span.red-text");
        if (st5 && !st5.getAttribute(MARK)) { st5.setAttribute(MARK, "1"); pill(st5, "#e0912a", "#161616"); }
        var ac5 = tr5.querySelector("a, input[type=button]");
        if (ac5 && !ac5.getAttribute(MARK)) { ac5.setAttribute(MARK, "1"); pill(ac5, "#d9433f", "#fff"); ac5.style.setProperty("cursor", "pointer", "important"); }
      });
      // the Check/Update/Remove buttons in the tab bar become accent pills
      Array.prototype.slice.call(document.querySelectorAll("#checkall input, #updateall input, #removeall input")).forEach(function (b2, i2) {
        if (!b2.getAttribute(MARK)) {
          pill(b2, colorFor(i2 + 6));
          // EXACT same box as the tab pills: fixed height + centered (pill()'s
          // line-height:1.5 had made these ~4px taller than the tabs)
          b2.style.setProperty("height", "var(--cc-md-h, 30px)", "important");
          b2.style.setProperty("padding", "var(--cc-md-pad, 0 20px)", "important");
          b2.style.setProperty("line-height", "1", "important");
          b2.style.setProperty("box-sizing", "border-box", "important");
          b2.style.setProperty("font-size", "var(--cc-md-fs, 13px)", "important");
          b2.style.setProperty("font-weight", "600", "important");
          b2.style.setProperty("text-transform", "uppercase", "important");
          b2.style.setProperty("letter-spacing", "1.5px", "important");
          b2.style.setProperty("cursor", "pointer", "important");
          b2.setAttribute(MARK, "1");
        }
      });
    } catch (e) {}
  }

  // adopt the engine-mirrored cc.* settings first, so accent/rainbow match the
  // other tabs on EVERY origin, then paint and follow the ajax rewrites
  function adopt(done) {
    fetch(PROXY + "?path=config", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) {
        try { var u = c && c.ui_settings; if (u) Object.keys(u).forEach(function (k) { if (/^cc[a-z]*\./.test(k) && k !== "cc.stateCache" && ls(k) !== u[k]) localStorage.setItem(k, u[k]); }); } catch (e) {}
        done();
      })
      .catch(function () { done(); });
  }

  function boot() {
    if (localStorage.getItem("cc.enable.plugins") === "0") return; // area disabled in CC settings
    adopt(function () {
      paint();
      var host = document.getElementById("displaybox") || document.body; // whole page: tab switches + ajax rewrites
      var t3 = null;
      new MutationObserver(function () { clearTimeout(t3); t3 = setTimeout(paint, 250); }).observe(host, { childList: true, subtree: true, characterData: true });
      document.addEventListener("change", function () { setTimeout(paint, 50); }); // tab switches repaint the pills
      [600, 1500, 3500].forEach(function (ms) { setTimeout(paint, ms); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
