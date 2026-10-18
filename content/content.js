(function() {
  'use strict';

  var VERSION = '2.10.1';
  console.log('[Aistim] ===== Content script v' + VERSION + ' loaded =====');
  console.log('[Aistim] URL:', window.location.href);

  // Shim: listener window 'load' tetap jalan walau script diinject setelah load selesai
  var LOAD_SHIM = "window.addEventListener=(function(orig){return function(t,f,o){if(t==='load'&&document.readyState==='complete'){try{setTimeout(f,0);}catch(e){}return;}return orig.call(window,t,f,o);};})(window.addEventListener);";

  // ===== SAFE DEBUG =====
  // Visual indicator hanya tampil saat ada aksi relevan — console selalu log.
  function showDebug(msg, color, silent) {
    console.log('[Aistim]', msg);
    if (silent) return; // hanya console, tanpa badge visual
    if (!document.body) return; // skip kalau body belum ready
    var ind = document.getElementById('aistim-debug');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'aistim-debug';
      ind.style.cssText = 'position:fixed;bottom:5px;right:5px;z-index:999999;padding:4px 8px;font-size:10px;font-family:monospace;border-radius:4px;opacity:0.8;transition:all 0.3s;';
      document.body.appendChild(ind);
    }
    ind.style.background = color || '#333';
    ind.style.color = '#fff';
    ind.textContent = 'Aistim: ' + msg;
  }

  // ===== METADATA PARSER (untuk dynamic scripts) =====
  function parseMetadata(code) {
    var meta = { name: 'Unnamed', version: '1.0.0', match: [], include: [], exclude: [] };
    var bm = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
    if (!bm) return meta;
    bm[1].split('\n').forEach(function(line) {
      var m = line.match(/\/\/\s*@(\w+)\s+(.*)/);
      if (!m) return;
      var k = m[1].toLowerCase(), v = m[2].trim();
      if (k === 'name') meta.name = v;
      if (k === 'version') meta.version = v;
      if (k === 'match') meta.match.push(v);
      if (k === 'include') meta.include.push(v);
      if (k === 'exclude') meta.exclude.push(v);
    });
    return meta;
  }

  function matchPattern(url, p) {
    if (!p) return false;
    try {
      var re = new RegExp(p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '\\?'));
      return re.test(url);
    } catch (e) { return false; }
  }

  function matchUrl(url, meta) {
    if (meta.exclude.some(function(p) { return matchPattern(url, p); })) return false;
    var pats = meta.match.concat(meta.include);
    if (pats.length === 0) return true;
    return pats.some(function(p) { return matchPattern(url, p); });
  }

  // ===== DYNAMIC SCRIPTS =====
  // Jalur utama: chrome.userScripts API di background (kebal CSP halaman).
  // Jalur fallback: inject <script> tag + handshake — untuk browser tanpa userScripts.

  // Penampung hasil handshake dari script yang diinject ke page world
  var execResults = {};
  document.addEventListener('aistim-exec', function(e) {
    try {
      var parts = String(e.detail).split('|');
      execResults[parts[1]] = { ok: parts[0] === 'ok', err: parts.slice(2).join('|') };
    } catch (err) {}
  });

  function runDynamicScripts() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      fallbackDynamic();
      return;
    }
    try {
      chrome.runtime.sendMessage({ action: 'us-status' }, function(res) {
        if (chrome.runtime.lastError) { fallbackDynamic(); return; }
        if (res && res.userScripts) {
          console.log('[Aistim] Engine: userScripts API (CSP-safe) — dynamic script dihandle background');
        } else {
          fallbackDynamic();
        }
      });
    } catch (e) { fallbackDynamic(); }
  }

  function fallbackDynamic() {
    console.log('[Aistim] Engine: fallback script-tag');
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    // effectiveScripts = gabungan bundled + remote + manual, sudah di-dedupe oleh background
    chrome.storage.local.get(['effectiveScripts', 'scripts'], function(data) {
      var list = (data.effectiveScripts && data.effectiveScripts.length)
        ? data.effectiveScripts
        : (data.scripts || []);
      var scripts = list.filter(function(s) { return s.enabled !== false; });
      if (scripts.length === 0) return;
      scripts.forEach(function(s) {
        fetch(s.url, { cache: 'no-store' })
          .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
          })
          .then(function(code) {
            var meta = parseMetadata(code);
            if (!matchUrl(window.location.href, meta)) {
              console.log('[Aistim] Skip (no match):', meta.name);
              return;
            }
            injectWithHandshake(s, code, meta);
          })
          .catch(function(err) {
            console.error('[Aistim] ❌ Fetch gagal:', s.url, err);
          });
      });
    });
  }

  function injectWithHandshake(s, code, meta) {
    // Escape penutup tag script di dalam kode user
    code = code.replace(/<\/script/gi, '<\\/script');
    var wrapped = LOAD_SHIM + '\ntry {\n' + code +
      '\ndocument.dispatchEvent(new CustomEvent("aistim-exec",{detail:"ok|' + s.id + '"}));' +
      '\n} catch(e) { document.dispatchEvent(new CustomEvent("aistim-exec",{detail:"err|' + s.id + '|"+(e&&e.message)})); }';

    var tag = document.createElement('script');
    tag.textContent = wrapped;
    (document.head || document.documentElement).appendChild(tag);
    tag.remove(); // eksekusi terjadi saat append (kecuali diblokir CSP)

    // Handshake: baru bilang OK kalau script BENAR-BENAR jalan
    setTimeout(function() {
      var r = execResults[s.id];
      if (r && r.ok) {
        showDebug('Dynamic OK: ' + meta.name, '#22c55e');
        console.log('[Aistim] ✅ Dynamic injected:', meta.name, 'v' + meta.version);
      } else if (r && !r.ok) {
        showDebug('❌ ' + meta.name + ' error', '#dc2626');
        console.error('[Aistim] ❌ Script error:', meta.name, r.err);
      } else {
        showDebug('❌ ' + meta.name + ' diblokir CSP', '#dc2626');
        console.error('[Aistim] ❌ ' + meta.name + ' diblokir CSP situs ini. Solusi: aktifkan userScripts (browser Chromium 120+ / developer mode).');
      }
    }, 2000);
  }

  // ===== INIT =====
  function init() {
    if (!document.body) {
      console.log('[Aistim] Body belum ready, tunggu...');
      setTimeout(init, 300);
      return;
    }
    runDynamicScripts(); // userScripts engine / fallback
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ===== JEMBATAN FETCH LINTAS DOMAIN =====
  // Userscript (MAIN world) kirim: window.postMessage({ aistimFetch: { id, url, opts } }, location.origin)
  // Balasan:                        window.postMessage({ aistimFetchResult: { id, ok, status, text, error } }, location.origin)
  // Hanya dilayani di halaman *.erzap.com; host tujuan dibatasi lagi di background (X_FETCH_ALLOW).
  if (/(^|\.)erzap\.com$/i.test(location.hostname)) {
    window.addEventListener('message', function(ev) {
      if (ev.source !== window || !ev.data || !ev.data.aistimFetch) return;
      var q = ev.data.aistimFetch;
      if (!q.id || !q.url) return;
      try {
        chrome.runtime.sendMessage({ action: 'x-fetch', url: q.url, opts: q.opts || {} }, function(res) {
          var err = chrome.runtime.lastError;
          var out = res || { ok: false, status: 0, error: err ? err.message : 'tidak ada respons' };
          out.id = q.id;
          window.postMessage({ aistimFetchResult: out }, location.origin);
        });
      } catch (e) {
        window.postMessage({ aistimFetchResult: { id: q.id, ok: false, status: 0, error: String(e && e.message || e) } }, location.origin);
      }
    });
    // penanda supaya userscript tahu jembatan tersedia
    try { document.documentElement.setAttribute('data-aistim-xfetch', '1'); } catch (e) {}
  }

  // Turbolinks / SPA navigation
  document.addEventListener('turbolinks:load', function() { setTimeout(init, 500); });
  window.addEventListener('pageshow', function(e) { if (e.persisted) setTimeout(init, 500); });
})();
