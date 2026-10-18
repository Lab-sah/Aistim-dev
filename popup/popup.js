// Popup Aistim Tool (tampilan dari Aistim.sdk): status engine userScripts, daftar script auto
// (bundel + GitHub) dengan saklar on/off, dan cek versi ekstensi terbaru di GitHub Releases.
// Engine & sinkron tetap di background.js (pesan 'us-status' / 'resync', storage 'disabledAuto').

const $ = (id) => document.getElementById(id);
const RELEASES_API_URL = 'https://api.github.com/repos/devtim-lab/Aistim-dev/releases/latest';
const CURRENT_VERSION = chrome.runtime.getManifest().version;

let daftar = [];          // [{ file, nama, versi, matches, nyala }]
let engineSiap = false;
let statusSync = null;    // { waktu, ok, sumber } ditulis background.js
let halamanUrl = '';      // URL tab erzap yang sedang dibuka, atau ''

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  n.append(...children);
  return n;
}

function imsg(text, kind = '') { const m = $('pesan'); m.textContent = text; m.className = kind; }
function ringkasMatch(m) { return m.replace(/^https?:\/\/(\*\.)?/, ''); }
function jam(t) { return new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }

function kirim(pesan) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(pesan, (res) => resolve(chrome.runtime.lastError ? null : res));
    } catch (e) { resolve(null); }
  });
}

// ---- metadata script ----
function parseMetadata(code) {
  const meta = { name: 'Unnamed', version: '1.0.0', match: [] };
  const bm = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!bm) return meta;
  bm[1].split('\n').forEach((line) => {
    const m = line.match(/\/\/\s*@(\w+)\s+(.*)/);
    if (!m) return;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'name') meta.name = v;
    if (k === 'version') meta.version = v;
    if (k === 'match' || k === 'include') meta.match.push(v);
  });
  return meta;
}

// autoScripts dari background.js lama belum menyimpan nama/versi/match: baca dari file-nya.
async function lengkapiMeta(s) {
  if (s.name) return s;
  try {
    const res = await fetch(s.url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const meta = parseMetadata(await res.text());
    return Object.assign({}, s, { name: meta.name, version: meta.version, match: meta.match });
  } catch (e) {
    return Object.assign({}, s, { name: s.file, version: '?', match: [] });
  }
}

async function muatDaftar() {
  const d = await chrome.storage.local.get(['autoScripts', 'syncStatus']);
  statusSync = d.syncStatus || null;
  const auto = await Promise.all((d.autoScripts || []).map(lengkapiMeta));
  daftar = auto.map((s) => ({ file: s.file, nama: s.name, versi: s.version, matches: s.match || [], nyala: s.enabled }));
}

/** Cocokkan URL dengan pola match userscript (*://host/path*). */
function cocokUrl(pola, url) {
  try {
    const m = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(pola);
    if (!m) return false;
    const u = new URL(url);
    if (m[1] !== '*' && m[1] + ':' !== u.protocol) return false;
    const host = m[2];
    if (host === '*') { /* semua host */ }
    else if (host.startsWith('*.')) { const b = host.slice(2); if (u.hostname !== b && !u.hostname.endsWith('.' + b)) return false; }
    else if (u.hostname !== host) return false;
    const re = new RegExp('^' + m[3].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return re.test(u.pathname + u.search);
  } catch { return false; }
}

const aktifDiHalaman = (s) => !!halamanUrl && s.nyala && s.matches.some((m) => cocokUrl(m, halamanUrl));

async function cekHalaman() {
  halamanUrl = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && /^https:\/\/([^/]+\.)?erzap\.com\//.test(tab.url || '')) halamanUrl = tab.url;
  } catch { halamanUrl = ''; }
}

async function cekEngine() {
  const res = await kirim({ action: 'us-status' });
  engineSiap = !!(res && (res.userScripts || res.tersedia));
}

// ---- tampilan ----
function renderEngine() {
  $('engine').className = 'kartu ' + (engineSiap ? 'ok' : 'warn');
  $('engine-judul').textContent = engineSiap ? 'Engine Aktif' : 'Engine belum aktif';
  const jalan = daftar.filter((s) => s.nyala).length;
  $('engine-info').textContent = !engineSiap ? 'Aktifkan "Izinkan skrip pengguna" untuk Aistim Tool'
    : (statusSync ? `Sinkron ${jam(statusSync.waktu)} · ` : '') + `${jalan} script berjalan` +
      (statusSync ? (statusSync.sumber === 'github' ? ' · GitHub ✓' : ' · bawaan') : '');
  $('engine-help').hidden = engineSiap;
  $('buka-detail').hidden = engineSiap;
  const h = $('engine-halaman');
  h.hidden = !(engineSiap && halamanUrl);
  if (halamanUrl) {
    const n = daftar.filter(aktifDiHalaman).length;
    h.className = n ? 'ok' : 'warn';
    h.textContent = n ? `Aktif di halaman ini: ${n} script` : 'Tidak ada script untuk halaman ini.';
  }
}

// Script yang selalu paling atas di daftar (rekam.js = devtool)
const PIN = ['rekam.js'];
const urutPin = (arr) => [...arr].sort((a, b) => (PIN.includes(b.file) ? 1 : 0) - (PIN.includes(a.file) ? 1 : 0));

function renderManager() {
  const q = $('cari-script').value.trim().toLowerCase();
  const items = urutPin(daftar).filter((s) => !q || s.nama.toLowerCase().includes(q) || s.matches.some((m) => m.toLowerCase().includes(q)));
  $('empty').hidden = daftar.length > 0;
  $('cari-combo').hidden = daftar.length === 0;
  $('manager').replaceChildren(...items.map((s) => {
    const cb = el('input', { type: 'checkbox', checked: s.nyala });
    cb.setAttribute('role', 'switch');
    cb.setAttribute('aria-label', 'Aktifkan ' + s.nama);
    cb.addEventListener('change', () => ubahScript(s, cb));
    const chips = s.matches.slice(0, 2).map((m) => el('span', { className: 'chip', textContent: ringkasMatch(m), title: m }));
    if (s.matches.length > 2) chips.push(el('span', { className: 'chip', textContent: `+${s.matches.length - 2}` }));
    const li = el('li', { className: (s.nyala ? 'on' : 'off') + (engineSiap && aktifDiHalaman(s) ? ' live' : '') },
      el('div', { className: 'isi' },
        el('div', { className: 'baris' },
          el('span', { className: 'nama', textContent: s.nama })),
        el('div', { className: 'chips' }, ...chips)),
      el('div', { className: 'kanan' },
        el('span', { className: 'ver', textContent: 'v' + s.versi }),
        el('label', { className: 'switch' }, cb, el('span'))));
    li.dataset.file = s.file;
    return li;
  }));
}

async function segarkan() {
  await Promise.all([muatDaftar(), cekEngine(), cekHalaman()]);
  renderEngine(); renderManager();
}

// ---- aksi ----
async function jalankanSync() {
  const tombol = $('sync');
  tombol.classList.add('putar');
  imsg('Menyinkronkan...');
  try {
    const res = await kirim({ action: 'resync' });
    await segarkan();
    cekUpdate(true);
    if (!res) imsg('Gagal sinkron. Periksa internetmu.', 'err');
    else if (!engineSiap) imsg('Aktifkan "Izinkan skrip pengguna" untuk extension ini.', 'err');
    else imsg(`${daftar.filter((s) => s.nyala).length} script berjalan.`, 'ok');
  } finally { tombol.classList.remove('putar'); }
}

// Saklar menulis disabledAuto; background.js mendengar perubahan itu lalu sinkron ulang sendiri.
async function ubahScript(s, cb) {
  const nyala = cb.checked;
  cb.disabled = true;
  try {
    const d = await chrome.storage.local.get(['disabledAuto', 'autoScripts']);
    const mati = (d.disabledAuto || []).filter((f) => f !== s.file);
    if (!nyala) mati.push(s.file);
    const autoScripts = (d.autoScripts || []).map((x) => Object.assign({}, x, { enabled: mati.indexOf(x.file) === -1 }));
    await chrome.storage.local.set({ disabledAuto: mati, autoScripts: autoScripts });
    s.nyala = nyala;
    renderEngine(); renderManager();
    imsg(nyala ? `${s.nama} dinyalakan.` : `${s.nama} dimatikan.`, 'ok');
  } finally { cb.disabled = false; }
}

// ---- cek versi ekstensi terbaru ----
function compareVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// Pasangan dari Chrome Web Store di-update otomatis oleh Web Store: kartu Download tidak perlu.
const DARI_WEB_STORE = /clients2\.google\.com/.test(chrome.runtime.getManifest().update_url || '');

async function cekUpdate(paksa = false) {
  if (DARI_WEB_STORE) return;
  try {
    // Saat popup dibuka pakai cache 1 jam (GitHub API cuma 60 request/jam per IP tanpa token);
    // tombol sinkron 🔄 cek langsung.
    let tag = null;
    const c = (await chrome.storage.local.get(['releaseCheckCache'])).releaseCheckCache;
    if (!paksa && c && Date.now() - c.time < 60 * 60 * 1000) tag = c.tag;
    if (tag === null) {
      const res = await fetch(RELEASES_API_URL, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      tag = String((await res.json()).tag_name || '');
      await chrome.storage.local.set({ releaseCheckCache: { time: Date.now(), tag: tag } });
    }
    const latest = tag.replace(/^v/, '');
    if (!latest || compareVersion(latest, CURRENT_VERSION) <= 0) return;
    $('update-link').href = 'https://github.com/devtim-lab/Aistim-dev/releases/download/' + tag + '/Aistim-dev-' + latest + '.zip';
    $('update-versi').textContent = 'v' + latest;
    $('update').hidden = false;
  } catch (e) { /* diam: cek update bukan fitur utama */ }
}

$('sync').addEventListener('click', jalankanSync);
$('cari-script').addEventListener('input', renderManager);
// Pintasan ke halaman Detail extension (tempat tombol "Izinkan skrip pengguna")
$('buka-detail').addEventListener('click', () => { chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id }); });
// Download lewat chrome.tabs (lebih andal daripada link di popup, terutama di Android)
$('update-link').addEventListener('click', (e) => {
  e.preventDefault();
  try { chrome.tabs.create({ url: e.currentTarget.href }); } catch (err) { window.open(e.currentTarget.href, '_blank'); }
});

// Scrollbar daftar script: muncul saat digulir, hilang sendiri setelah berhenti
{
  let t = 0;
  $('manager').addEventListener('scroll', () => {
    $('manager').classList.add('gulir');
    clearTimeout(t);
    t = setTimeout(() => $('manager').classList.remove('gulir'), 900);
  }, { passive: true });
}

// ---- combobox Cari script: ketik untuk menyaring daftar, atau buka dropdown untuk memilih satu script ----
{
  const inp = $('cari-script'), list = $('cari-list'), btn = $('cari-buka'), box = $('cari-combo');
  let aktif = -1;
  const opsi = (q) => urutPin(daftar).filter((s) => !q || s.nama.toLowerCase().includes(q));
  const tutup = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-expanded', 'false'); aktif = -1; };
  const pilih = (s) => { inp.value = s.nama; tutup(); renderManager(); };
  function buka(semua) {
    const o = opsi(semua ? '' : inp.value.trim().toLowerCase());
    list.replaceChildren(...(o.length ? o.map((s) => {
      const li = el('li', { textContent: s.nama }, el('span', { textContent: 'v' + s.versi }));
      li.setAttribute('role', 'option');
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pilih(s); });
      return li;
    }) : [el('li', { className: 'none', textContent: 'Tidak ada script' })]));
    list.hidden = false; aktif = -1;
    inp.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-expanded', 'true');
  }
  const sorot = (i) => {
    const li = [...list.querySelectorAll('li:not(.none)')];
    if (!li.length) return;
    aktif = (i + li.length) % li.length;
    li.forEach((n, k) => n.classList.toggle('aktif', k === aktif));
    li[aktif].scrollIntoView({ block: 'nearest' });
  };
  inp.addEventListener('input', () => buka(false));
  inp.addEventListener('focus', () => buka(false));
  btn.addEventListener('mousedown', (e) => { e.preventDefault(); if (list.hidden) { inp.focus(); buka(true); } else tutup(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) buka(false); sorot(aktif + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (list.hidden) buka(false); sorot(aktif - 1); }
    else if (e.key === 'Enter' && aktif >= 0) { e.preventDefault(); const o = opsi(inp.value.trim().toLowerCase()); if (o[aktif]) pilih(o[aktif]); }
    else if (e.key === 'Escape') tutup();
  });
  document.addEventListener('mousedown', (e) => { if (!box.contains(e.target)) tutup(); });
}

// ---- salin teks yang diblok (menu salin bawaan browser sering tidak muncul di popup) ----
{
  const tombol = $('salin-pilihan');
  let teks = '';
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    const t = sel ? sel.toString().trim() : '';
    if (t) { teks = t; tombol.textContent = 'Salin teks terpilih'; tombol.hidden = false; }
    else if (document.activeElement !== tombol) tombol.hidden = true;
  });
  tombol.addEventListener('pointerdown', (e) => e.preventDefault());   // jangan sampai menekan tombol menghapus blok
  tombol.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(teks); ok = true; } catch { /* coba cara lama */ }
    if (!ok) { try { ok = document.execCommand('copy'); } catch { ok = false; } }
    tombol.textContent = ok ? 'Tersalin' : 'Gagal menyalin';
    setTimeout(() => { tombol.hidden = true; }, 1100);
  });
}

// ---- mulai ----
(async () => {
  $('ver').textContent = 'v' + CURRENT_VERSION;
  try { await segarkan(); } catch (e) { /* tampilkan saja */ }
  $('view-memuat').hidden = true;
  $('view-user').hidden = false;
  cekUpdate();
})();
