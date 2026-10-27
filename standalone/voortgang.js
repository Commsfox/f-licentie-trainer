// Alleen in de losse versie: bewaart alle voortgang (alles in localStorage dat met 'flic.' begint) in een
// bestand op deze computer, via de ingebouwde server. Zo blijft de voortgang bewaard, ook als je de browser
// leegmaakt of een andere browser gebruikt. Dit script draait vóór de app, zodat die meteen de juiste data ziet.
(function () {
  var URL = '/api/voortgang', PFX = 'flic.', SKIP = { 'flic.auth': 1 };
  var setItem = Storage.prototype.setItem, removeItem = Storage.prototype.removeItem, clear = Storage.prototype.clear;
  var ls; try { ls = window.localStorage; } catch (e) { return; }
  var mine = function (k) { return typeof k === 'string' && k.indexOf(PFX) === 0 && !SKIP[k]; };

  function dump() {
    var keys = {};
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (mine(k)) keys[k] = ls.getItem(k); }
    return JSON.stringify({ versie: 1, opgeslagen: Date.now(), keys: keys });
  }

  // 1. Bij het opstarten: de voortgang uit het bestand terugzetten (het bestand is leidend).
  var info = {};
  try {
    var x = new XMLHttpRequest();
    x.open('GET', URL, false);
    x.send();
    if (x.status === 200) {
      info = JSON.parse(x.responseText);
      var d = info.data;
      if (d && d.keys) {
        var weg = [];
        for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (mine(k) && !(k in d.keys)) weg.push(k); }
        weg.forEach(function (k) { removeItem.call(ls, k); });
        for (var k2 in d.keys) if (mine(k2)) setItem.call(ls, k2, d.keys[k2]);
      }
    }
  } catch (e) { /* geen server: gewoon verder met wat de browser heeft */ }
  window.FLIC_BESTAND = { pad: info.pad || '', ok: !!info.pad };

  // 2. Bij elke wijziging: na een korte pauze het hele pakket naar het bestand schrijven.
  var timer = null, dirty = !(info.data && info.data.keys);   // nog geen bestand: wat er in de browser staat meteen opslaan
  function save() {
    timer = null;
    if (!dirty) return;
    dirty = false;
    try { fetch(URL, { method: 'PUT', body: dump(), keepalive: true }).catch(function () { dirty = true; }); } catch (e) { dirty = true; }
  }
  function later() { dirty = true; if (!timer) timer = setTimeout(save, 700); }
  Storage.prototype.setItem = function (k, v) { setItem.call(this, k, v); if (this === ls && mine(k)) later(); };
  Storage.prototype.removeItem = function (k) { removeItem.call(this, k); if (this === ls && mine(k)) later(); };
  Storage.prototype.clear = function () { clear.call(this); if (this === ls) later(); };
  function flush() {
    if (!dirty) return;
    if (timer) { clearTimeout(timer); timer = null; }
    dirty = false;
    try { navigator.sendBeacon(URL, dump()); } catch (e) { /* negeren */ }
  }
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  if (dirty) setTimeout(save, 0);
})();
