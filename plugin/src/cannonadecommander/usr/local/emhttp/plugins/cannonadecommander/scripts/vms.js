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

  function hexHue(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return -1; var n = parseInt(m[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0; if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return h; }
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function filter() {
    var ic = ls("cc.iconcolor"), hue = hexHue(ic);
    if (dead || ls("cc.vmicons") !== "1" || !ic || hue < 0) return "";
    var s = parseInt(ls("cc.iconstrength") || "100", 10);
    return "grayscale(1) sepia(1) hue-rotate(" + Math.round(hue - 50) + "deg) saturate(" + (Math.max(10, s) / 100 * 5 + 0.6) + ")";
  }
  // best-effort VM-row icon selectors (narrow on purpose: no broad page-wide match)
  function vmImgs() {
    var sels = ["#vms tr.sortable td img", "#vms td img", "table#vms img", "div.tabs table.vm_manager td img"];
    for (var i = 0; i < sels.length; i++) { var n = document.querySelectorAll(sels[i]); if (n.length) return n; }
    return [];
  }
  function apply() {
    try { var f = filter(), imgs = vmImgs(); for (var i = 0; i < imgs.length; i++) imgs[i].style.filter = f; } catch (e) {}
  }
  function connectObserver() {
    var host = document.getElementById("vms") || document.body;
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
    try { var imgs = vmImgs(); for (var i = 0; i < imgs.length; i++) imgs[i].style.filter = ""; } catch (e) {}
  }
  function arm() {
    dead = false;
    apply();
    connectObserver();
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
