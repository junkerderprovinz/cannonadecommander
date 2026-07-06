/* CannonadeCommander - VM-icon tint for Unraid's VMs tab.
 *
 * A tiny, self-contained companion to the Docker-tab enhancer: when "Also tint VM
 * icons" is on in the Settings page (cc.vmicons) and an icon colour is chosen
 * (cc.iconcolor), it tints the VM row icons with the SAME filter recipe used for
 * container icons, applied DIRECTLY as an inline style (robust against re-renders).
 *
 * It touches nothing else on the page and adds no bar/panel. It self-clears on an
 * uninstall (the same-origin proxy 404s), and reacts live to Settings changes via
 * the storage event. The VM-row selectors are best-effort against Unraid's VM
 * manager DOM; if a build renders icons differently, it simply tints nothing.
 */
(function () {
  "use strict";
  var PROXY = "/plugins/cannonadecommander/server/api.php";
  var dead = false, mo = null, liveTimer = null, moPending = false;

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  // EXACT-colour tint via an inline SVG feColorMatrix (identical recipe to
  // docker.js): map every opaque pixel to the chosen sRGB colour, keep alpha, and
  // blend the original back by (100 - strength)%. hue-rotate only APPROXIMATES a
  // hue and got the colour wrong; feColorMatrix hits the picked colour exactly.
  // VM tinting is ON by DEFAULT whenever a container-icon colour is chosen (cc.vmicons
  // is an opt-OUT: only the literal "0" disables it). Requiring a separate "1" opt-in was
  // an easy-to-miss toggle that made VMs look like they "never tinted".
  function vmTintOff() { return ls("cc.vmicons") === "0"; }
  function ensureTintFilter() {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ls("cc.iconcolor") || "");
    var host = document.getElementById("cc-vm-tint-svg");
    if (dead || vmTintOff() || !m) { if (host) host.remove(); return false; }
    var tr = parseInt(m[1], 16) / 255, tg = parseInt(m[2], 16) / 255, tb = parseInt(m[3], 16) / 255;
    var s = (Math.max(10, parseInt(ls("cc.iconstrength") || "100", 10)) / 100).toFixed(3);
    // shading-preserving: channel = luminance × target colour (matches docker.js)
    var lum = function (c) { return (0.2126 * c).toFixed(4) + " " + (0.7152 * c).toFixed(4) + " " + (0.0722 * c).toFixed(4); };
    if (!host) { host = document.createElement("div"); host.id = "cc-vm-tint-svg"; host.setAttribute("aria-hidden", "true"); host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.appendChild(host); }
    // IDEMPOTENT: only rewrite the SVG when the colour/strength actually changed. The host
    // lives on document.body; a blind innerHTML write on every apply() would be a DOM
    // mutation that — if an observer ever watched body — re-triggers apply() into a
    // ~300ms CPU-pegging loop (the classic non-idempotent-inject + MutationObserver trap).
    var sig = tr + "|" + tg + "|" + tb + "|" + s + "|lum";
    if (host.dataset.sig !== sig) {
      host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><filter id="cc-vm-icon-tint" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">'
        + '<feColorMatrix in="SourceGraphic" type="matrix" result="flat" values="' + lum(tr) + ' 0 0 ' + lum(tg) + ' 0 0 ' + lum(tb) + ' 0 0 0 0 0 1 0"/>'
        + '<feComponentTransfer in="flat" result="faded"><feFuncA type="linear" slope="' + s + '"/></feComponentTransfer>'
        + '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="faded"/></feMerge>'
        + '</filter></svg>';
      host.dataset.sig = sig;
    }
    return true;
  }
  function filterVal() { return ensureTintFilter() ? "url(#cc-vm-icon-tint)" : ""; }
  // The chosen colour as a plain hex, gated the same way. Unraid renders MOST VM
  // icons as a FontAwesome/icon-font glyph (`<i class="fa fa-… img">`), whose colour
  // comes from CSS `color:`, NOT from an image filter — so a glyph never tinted
  // before. Real `.png` icons render as `<img class="img">` and DO take the filter.
  function tintColor() {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ls("cc.iconcolor") || "");
    if (dead || vmTintOff() || !m) return "";
    return "#" + m[1] + m[2] + m[3];
  }
  // VM-row icon selector — GROUND TRUTH from unraid/webgui dynamix.vm.manager
  // VMMachines.php: the VM list is tbody#kvm_list, each row td.vm-name has the icon at
  // span[id^="vm-"] > .img (an <img class="img"> or an <i class="… img"> glyph). The
  // old selectors used #vms, which does not exist — that's why VM icons never tinted.
  function vmImgs() {
    var sels = ["#kvm_list td.vm-name span[id^='vm-'] > .img", "#kvm_list td.vm-name img.img", "#kvm_list td.vm-name img"];
    for (var i = 0; i < sels.length; i++) { var n = document.querySelectorAll(sels[i]); if (n.length) return n; }
    return [];
  }
  function apply() {
    try {
      var f = filterVal(), c = tintColor(), imgs = vmImgs();
      for (var i = 0; i < imgs.length; i++) {
        var n = imgs[i];
        if (n.tagName === "IMG") { n.style.filter = f; n.style.removeProperty("color"); }
        // font-glyph: `color` is the reliable exact tint. Set it with PRIORITY — Unraid's
        // VM CSS colours these glyphs via a class rule, which a plain inline colour can
        // lose to; `!important` on the inline style wins. The filter is a harmless bonus.
        else { if (c) { n.style.setProperty("color", c, "important"); } else { n.style.removeProperty("color"); } n.style.filter = f; }
      }
    } catch (e) {}
  }
  function connectObserver() {
    // Observe ONLY the VM list container — NEVER document.body: our tint SVG host lives
    // on body, so observing body could see our own writes. If the list container isn't
    // present there is nothing to tint (the tbody is server-rendered on the real page).
    var host = document.getElementById("kvm_list") || document.getElementById("kvm_table");
    if (!host) return;
    // debounced: the VM list re-renders in bursts; re-apply at most every ~300ms.
    // (childList only — we never observe attributes, so our own style writes can't
    // re-trigger this into a loop.)
    mo = new MutationObserver(function () {
      if (dead || moPending) return;
      moPending = true;
      setTimeout(function () { moPending = false; if (!dead) apply(); }, 300);
    });
    mo.observe(host, { childList: true, subtree: true });
  }
  function teardown() {
    if (dead) return; dead = true;
    try { if (mo) mo.disconnect(); mo = null; } catch (e) {}
    try { if (liveTimer) clearInterval(liveTimer); liveTimer = null; } catch (e) {}
    try { var imgs = vmImgs(); for (var i = 0; i < imgs.length; i++) { imgs[i].style.filter = ""; imgs[i].style.removeProperty("color"); } } catch (e) {}
    try { var sv = document.getElementById("cc-vm-tint-svg"); if (sv) sv.remove(); } catch (e) {}
  }
  function arm() {
    dead = false;
    apply();
    connectObserver();
    // The VM list tbody (#kvm_list) is usually populated by an AJAX loadlist() AFTER this
    // defer-loaded script runs — so connectObserver() no-ops (no tbody yet) and the first
    // apply() finds nothing. That is why the tint "sometimes" didn't take: a timing race,
    // not the colour code. Retry attaching the observer AND re-applying for a short window
    // until the list appears and is tinted, so a late-rendered VM list still colours.
    var tries = 0;
    var poll = setInterval(function () {
      if (dead) { clearInterval(poll); return; }
      tries++;
      if (!mo) connectObserver();
      apply();
      if ((mo && vmImgs().length) || tries >= 20) clearInterval(poll); // done, or give up after ~10s
    }, 500);
    // liveness: a 404/410 from the proxy means the plugin is gone → clear + stop
    liveTimer = setInterval(function () {
      try { fetch(PROXY + "?path=state", { headers: { Accept: "application/json" } }).then(function (r) { if (r.status === 404 || r.status === 410) teardown(); }).catch(function () {}); } catch (e) {}
    }, 8000);
  }
  function boot() {
    try {
      arm();
      window.addEventListener("storage", function (e) { try { if (!dead && e && e.key && e.key.indexOf("cc.") === 0) apply(); } catch (e2) {} });
      // persistent re-probe (NEVER cleared): re-arm when the proxy returns, so a
      // transient gap during a plugin UPDATE doesn't kill the tint until reload.
      setInterval(function () { try { if (!dead) return; fetch(PROXY + "?path=state", { headers: { Accept: "application/json" } }).then(function (r) { if (r.ok) arm(); }).catch(function () {}); } catch (e) {} }, 8000);
    } catch (e) { /* never break Unraid's VM page */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
