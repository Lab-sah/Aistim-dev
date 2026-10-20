const VERSION = '2.10.5';
const X_FETCH_ALLOW = ['partdistro.com'];   // host yang boleh diakses lewat jembatan x-fetch

// ===== KONFIGURASI =====
// Script dibundel di folder scripts/ (daftar ada di scripts/index.json)
// + auto-sync dari folder scripts/ di GitHub — versi lebih baru di GitHub otomatis dipakai
const REPO = {
  owner: 'devtim-lab',
  repo: 'Aistim-dev',
  branch: 'main',
  dir: 'scripts'
};
const LIST_CACHE_MS = 1 * 60 * 1000; // cache daftar file 1 menit (v2.9.2: dipicu ulang tiap menit oleh alarm)

// Shim: listener window 'load' tetap jalan walau script diinject setelah load selesai
const LOAD_SHIM = "window.addEventListener=(function(orig){return function(t,f,o){if(t==='load'&&document.readyState==='complete'){try{setTimeout(f,0);}catch(e){}return;}return orig.call(window,t,f,o);};})(window.addEventListener);";

// ===== METADATA PARSER =====
function parseMetadata(code) {
  const meta = { name: 'Unnamed', version: '1.0.0', match: [], include: [], exclude: [], world: 'user_script' };
  const bm = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!bm) return meta;
  bm[1].split('\n').forEach(line => {
    const m = line.match(/\/\/\s*@(\w+)\s+(.*)/);
    if (!m) return;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'name') meta.name = v;
    if (k === 'version') meta.version = v;
    if (k === 'match') meta.match.push(v);
    if (k === 'include') meta.include.push(v);
    if (k === 'exclude') meta.exclude.push(v);
    // @world main -> script butuh konteks halaman (akses jQuery / variabel window milik situs)
    if (k === 'world') meta.world = v.toLowerCase();
  });
  return meta;
}

// Bandingkan versi: 1 jika a > b, -1 jika a < b, 0 jika sama (tahan format non-semver)
function compareVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// Hanya terima match pattern format Chrome; fallback ke <all_urls>
function validMatchPatterns(patterns) {
  const ok = (patterns || []).filter(p =>
    p === '<all_urls>' || /^(\*|http|https|file|ftp):\/\/(\*|\*\.[^/]+|[^/*]+)\//.test(p)
  );
  return ok.length ? ok : ['<all_urls>'];
}

function isUserScriptsAvailable() {
  try {
    return !!(chrome.userScripts && chrome.userScripts.register);
  } catch (e) {
    return false; // API melempar error kalau belum diizinkan user
  }
}

// ===== DAFTAR HAPUS =====
// scripts/index.json boleh berisi "hapus": ["nama_file.js", ...]. Script di daftar itu tidak dijalankan
// dan tidak tampil di popup, termasuk salinan yang sudah terlanjur dibundel di paket ekstensi pengguna.
// Daftar dari GitHub disimpan permanen (storage 'daftarHapus') supaya tetap berlaku saat offline;
// ditimpa setiap kali index.json GitHub berhasil dibaca (hapus nama dari daftar = script kembali).
function bacaDaftarHapus(idx) {
  return Array.isArray(idx && idx.hapus) ? idx.hapus.filter(n => typeof n === 'string' && n) : [];
}

async function getDaftarHapus() {
  return (await chrome.storage.local.get(['daftarHapus'])).daftarHapus || [];
}

// ===== BUNDLED: baca scripts/index.json + kode dari paket ekstensi =====
async function loadBundledScripts(hapus) {
  try {
    const idxRes = await fetch(chrome.runtime.getURL('scripts/index.json'));
    if (!idxRes.ok) throw new Error('HTTP ' + idxRes.status);
    const idx = await idxRes.json();
    const dihapus = new Set(hapus.concat(bacaDaftarHapus(idx)));
    const out = [];
    for (const file of (idx.scripts || [])) {
      if (dihapus.has(file)) continue;
      try {
        const url = chrome.runtime.getURL('scripts/' + file);
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const code = await res.text();
        out.push({ file: file, code: code, meta: parseMetadata(code), extUrl: url, source: 'bundled' });
      } catch (e) {
        console.error('[Aistim] ❌ Gagal baca bundel:', file, e);
      }
    }
    return out;
  } catch (e) {
    console.error('[Aistim] ❌ scripts/index.json tidak terbaca:', e);
    return [];
  }
}

// ===== REMOTE: auto-sync dari folder scripts/ di GitHub =====
function rawUrl(name) {
  return 'https://raw.githubusercontent.com/' + REPO.owner + '/' + REPO.repo +
         '/' + REPO.branch + '/' + REPO.dir + '/' + name;
}

// raw.githubusercontent.com disajikan lewat CDN yang punya cache sendiri dan TIDAK
// ditembus oleh cache:'no-store' (itu cuma cache browser). Query param unik bikin
// versi baru langsung kebaca, bukan nunggu edge cache expired.
// Dipakai hanya saat fetch — URL yang disimpan ke storage tetap versi bersihnya.
function bust(url) {
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
}

// Daftar file diambil dari scripts/index.json lewat raw CDN (tanpa batas kuota).
// GitHub API sengaja TIDAK dipakai sebagai jalur utama: limitnya cuma 60 request/jam
// per IP untuk request tanpa token, dan kalau habis, remote sync gagal diam-diam
// lalu ekstensi balik ke versi bundled yang lama.
async function discoverRemoteFiles() {
  const cached = (await chrome.storage.local.get(['repoListCache'])).repoListCache;
  if (cached && Date.now() - cached.time < LIST_CACHE_MS) return cached.files;

  let files = null;

  try {
    const res = await fetch(bust(rawUrl('index.json')), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const idx = await res.json();
    const hapus = bacaDaftarHapus(idx);
    files = (idx.scripts || [])
      .filter(n => typeof n === 'string' && /\.js$/i.test(n) && hapus.indexOf(n) === -1)
      .map(n => ({ name: n, url: rawUrl(n) }));
    if (!files.length) throw new Error('index.json kosong');
    await chrome.storage.local.set({ daftarHapus: hapus });
  } catch (e) {
    console.warn('[Aistim] index.json remote gagal (' + e.message + ') — coba GitHub API');
    files = null;
  }

  // Cadangan: GitHub API (berguna kalau ada file .js baru yang belum terdaftar di index.json)
  if (!files) {
    const api = 'https://api.github.com/repos/' + REPO.owner + '/' + REPO.repo +
                '/contents/' + REPO.dir + '?ref=' + REPO.branch;
    const res = await fetch(api, {
      cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github+json' }
    });
    if (!res.ok) {
      if (cached) {
        console.warn('[Aistim] GitHub API ' + res.status + ' — pakai cache daftar file lama');
        return cached.files;
      }
      throw new Error('GitHub API ' + res.status);
    }
    const items = await res.json();
    files = items
      .filter(f => f.type === 'file' && /\.js$/i.test(f.name))
      .map(f => ({ name: f.name, url: rawUrl(f.name) }));
  }

  await chrome.storage.local.set({ repoListCache: { time: Date.now(), files: files } });
  return files;
}

async function loadRemoteScripts() {
  try {
    const files = await discoverRemoteFiles();
    const out = [];
    for (const f of files) {
      try {
        const res = await fetch(bust(f.url), { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const code = await res.text();
        out.push({ file: f.name, code: code, meta: parseMetadata(code), url: f.url, source: 'remote' });
      } catch (e) {
        console.error('[Aistim] ❌ Fetch remote gagal:', f.name, e);
      }
    }
    return out;
  } catch (e) {
    console.log('[Aistim] Remote sync dilewati (offline / rate limit) — pakai bundel saja');
    return [];
  }
}

// ===== MERGE: dedupe by @name, versi lebih tinggi menang =====
function mergeScripts(bundled, remote) {
  const byName = {};
  for (const s of bundled.concat(remote)) {
    const key = String(s.meta.name || s.file).toLowerCase();
    const cur = byName[key];
    if (!cur || compareVersion(s.meta.version, cur.meta.version) > 0) {
      byName[key] = s;
    }
  }
  return Object.values(byName);
}

// v2.10.5: pemuat script "manual" (URL sembarang dari storage `scripts`, sisa popup lama)
// dibuang. Tidak ada UI yang mengisinya lagi, dan Web Store tidak mengizinkan kode dari
// URL yang tidak ditentukan di dalam paket. Sumber script kini hanya: bundel + GitHub repo ini.

// ===== SYNC UTAMA =====
// v2.9.3: syncUserScripts() dipicu dari banyak sumber (onInstalled, onStartup,
// alarm 1 menit, storage.onChanged) yang bisa nyaris bersamaan — kalau 2
// panggilan tumpang tindih, keduanya sama-sama lihat "belum ada script
// terdaftar" lalu sama-sama register() id yang sama -> Chrome menolak yang
// kedua dengan "Duplicate script ID" dan script itu gagal aktif. Dikunci di
// sini: hanya 1 sync jalan sekaligus; panggilan yang masuk saat sync masih
// jalan cukup antre & dijalankan ulang sekali setelah yang jalan selesai
// (bukan ditumpuk berkali-kali).
let syncPromise = null;
let syncQueued = false;

function syncUserScripts() {
  if (syncPromise) {
    syncQueued = true;
    return syncPromise;
  }
  syncPromise = syncUserScriptsSekarang()
    .catch(e => console.error('[Aistim] syncUserScripts gagal:', e))
    .finally(() => {
      syncPromise = null;
      if (syncQueued) {
        syncQueued = false;
        syncUserScripts();
      }
    });
  return syncPromise;
}

async function syncUserScriptsSekarang() {
  const data = await chrome.storage.local.get(['disabledAuto']);
  const disabledAuto = data.disabledAuto || [];

  // Remote dulu: membaca index.json GitHub sekaligus memperbarui daftar hapus
  const remoteMentah = await loadRemoteScripts();
  const hapus = await getDaftarHapus();
  const remote = remoteMentah.filter(s => hapus.indexOf(s.file) === -1);   // mis. daftar file dari cache / GitHub API
  const bundled = await loadBundledScripts(hapus);
  if (hapus.length) console.log('[Aistim] Dihapus lewat index.json:', hapus.join(', '));

  // Gabung: bundled + remote, dedupe by @name (versi tertinggi menang)
  const merged = mergeScripts(bundled, remote);
  const all = merged;

  // Status untuk popup: hanya script auto (bundled/remote) yang dapat toggle disabledAuto
  // name/version/match ikut disimpan supaya popup tidak perlu fetch tiap file saat dibuka
  const auto = merged.map(s => ({
    id: 'auto-' + s.file,
    file: s.file,
    url: s.source === 'bundled' ? s.extUrl : s.url,
    enabled: disabledAuto.indexOf(s.file) === -1,
    name: s.meta.name,
    version: s.meta.version,
    match: s.meta.match.concat(s.meta.include)
  }));
  await chrome.storage.local.set({
    autoScripts: auto,
    syncStatus: { waktu: Date.now(), sumber: remote.length ? 'github' : 'bawaan' }
  });

  // Yang aktif = tidak di-disable via popup
  const active = all.filter(s => disabledAuto.indexOf(s.file) === -1);

  // Daftar untuk content script fallback (browser tanpa userScripts)
  await chrome.storage.local.set({
    effectiveScripts: active.map(s => ({
      id: 'auto-' + s.file,
      url: s.source === 'bundled' ? s.extUrl : s.url
    }))
  });

  // Register via userScripts API (CSP-safe) kalau tersedia
  if (!isUserScriptsAvailable()) {
    console.log('[Aistim] userScripts API tidak tersedia — content script pakai fallback');
    return;
  }
  try {
    const existing = await chrome.userScripts.getScripts();
    const managed = existing.filter(x => x.id.indexOf('aistim-') === 0).map(x => x.id);
    if (managed.length) await chrome.userScripts.unregister({ ids: managed });

    for (const s of active) {
      try {
        const code = s.code.replace(/<\/script/gi, '<\\/script');
        await chrome.userScripts.register([{
          id: 'aistim-auto-' + s.file,
          matches: validMatchPatterns(s.meta.match),
          js: [{ code: LOAD_SHIM }, { code: code }],
          runAt: 'document_idle',
          world: s.meta.world === 'main' ? 'MAIN' : 'USER_SCRIPT'
        }]);
        console.log('[Aistim] ✅ registered:', s.meta.name, 'v' + s.meta.version, '(' + s.source + (s.meta.world === 'main' ? ', MAIN world' : '') + ')');
      } catch (e) {
        console.error('[Aistim] ❌ Gagal register:', s.file || s.id, e);
      }
    }
    console.log('[Aistim] Sync selesai:', active.length, 'script aktif (' + merged.length + ' terdaftar)');
  } catch (e) {
    console.error('[Aistim] userScripts sync error:', e);
  }
}

// ===== LIFECYCLE =====
const ALARM_SYNC = 'aistim-auto-sync';

chrome.runtime.onInstalled.addListener(() => {
  syncUserScripts();
  chrome.alarms.create(ALARM_SYNC, { periodInMinutes: 1 });
  console.log('[Aistim] v' + VERSION + ' installed — bundled scripts + auto-sync GitHub (CSP-safe)');
});

chrome.runtime.onStartup.addListener(() => {
  syncUserScripts();
  chrome.alarms.create(ALARM_SYNC, { periodInMinutes: 1 });
});

// v2.9.2: auto-cek GitHub tiap 1 menit (mendekati realtime) — sebelumnya cuma
// sync saat install/startup/toggle popup, jadi update script baru bisa telat
// sampai user restart browser atau klik 🔄 manual.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_SYNC) syncUserScripts();
});

// Re-sync saat toggle ON/OFF dari popup berubah
// (autoScripts & effectiveScripts sengaja TIDAK didengar — ditulis oleh sync sendiri)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.disabledAuto) syncUserScripts();
});

// ===== MESSAGING =====
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (!req || !req.action) return false;

  if (req.action === 'us-status') {
    (async () => {
      let active = false;
      try {
        if (isUserScriptsAvailable()) {
          const regs = await chrome.userScripts.getScripts();
          active = regs.some(s => s.id.indexOf('aistim-') === 0);
        }
      } catch (e) { active = false; }
      // tersedia = izin "skrip pengguna" sudah dinyalakan, walau belum ada script terdaftar
      // (mis. semua script dimatikan, atau sync pertama setelah update masih berjalan)
      sendResponse({ userScripts: active, tersedia: isUserScriptsAvailable(), version: VERSION });
    })();
    return true; // async response
  }

  // Jembatan fetch lintas domain untuk userscript (dipakai olzap.js -> partdistro.com).
  // Dibatasi: hanya dari halaman *.erzap.com dan hanya ke host yang ada di X_FETCH_ALLOW,
  // supaya ekstensi tidak jadi proxy terbuka untuk situs lain.
  if (req.action === 'x-fetch') {
    (async () => {
      try {
        const asal = sender && sender.url ? new URL(sender.url) : null;
        if (!asal || !/(^|\.)erzap\.com$/i.test(asal.hostname)) throw new Error('asal tidak diizinkan');
        const target = new URL(req.url);
        if (target.protocol !== 'https:' || !X_FETCH_ALLOW.some(h => target.hostname === h || target.hostname.endsWith('.' + h)))
          throw new Error('host tidak diizinkan: ' + target.hostname);
        const opts = req.opts || {};
        const res = await fetch(target.href, {
          method: opts.method || 'GET',
          headers: opts.headers || {},
          body: opts.body,
          credentials: 'include',
          cache: 'no-store',
          redirect: 'follow'
        });
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, url: res.url, text: text });
      } catch (e) {
        sendResponse({ ok: false, status: 0, error: String(e && e.message || e) });
      }
    })();
    return true;
  }

  if (req.action === 'resync') {
    // Paksa refresh: hapus cache daftar file lalu sync ulang
    (async () => {
      await chrome.storage.local.remove(['repoListCache']);
      await syncUserScripts();
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});
