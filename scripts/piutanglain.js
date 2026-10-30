// ==UserScript==
// @name         ERZAP - Piutang Lain (Rincian Transaksi)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Rincian Transaksi Piutang Lain: pilih jumlah baris tampil (5-100), tabel bisa di-scroll, pencarian di semua kolom, data diambil sesuai kebutuhan; tampilan responsif untuk layar sempit.
// @match        https://*.erzap.com/jurnals/form_kelola_piutang_debitur/kelola*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const tbl = document.getElementById('data_table');
  if (!tbl || !tbl.tFoot || !tbl.tBodies[0]) return;
  if (window.__piutangTabelLoaded) return;
  window.__piutangTabelLoaded = true;

  // ====== HAK AKSES & FITUR (JSON) ======
  // "admin"   -> daftar nama yang SELALU bisa memakai SEMUA fitur (public maupun private).
  // "private" -> nama fitur yang HANYA boleh dipakai "admin". Nama fitur: pilihBaris, cari, muatUlang, responsif.
  // "public"  -> nama fitur yang boleh dipakai SEMUA user yang membuka halaman ini.
  // Fitur yang tidak disebut di keduanya dianggap private (hanya admin).
  // Nama di "admin" dibaca dari tulisan "NAMA (JABATAN)" di pojok kanan bawah ERZAP. Cukup sebagian nama
  // (tidak peduli huruf besar/kecil); isi nama lengkap persis seperti di ERZAP agar tidak salah cocok dengan user lain.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada yang memakai fitur apa pun).
  // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script dan muat ulang halaman ERZAP.
  const AKSES_JSON = `{
    "admin": ["SENTOT ARI HANDOKO", "DIMAS", "PUGUH", "MANAJEMEN PUSAT", "SURYO", "CEO TIMORITEL", "SILVI", "WIWIT", "ISA", "ANIK"],
    "private": [],
    "public": ["pilihBaris", "cari", "muatUlang", "responsif"]
  }`;

  function bacaAkses() {
    try {
      const a = JSON.parse(AKSES_JSON) || {};
      return {
        admin: Array.isArray(a.admin) ? a.admin.map(String) : [],
        public: Array.isArray(a.public) ? a.public.map(String) : [],
      };
    } catch (err) {
      console.error('[piutanglain] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { admin: [], public: [] };
    }
  }
  const AKSES = bacaAkses();

  // dicek saat dipakai (bukan sekali di awal), karena nama kasir di pojok ERZAP bisa dimuat belakangan
  function bolehFitur(fitur) {
    if (AKSES.public.indexOf(fitur) !== -1) return true;
    const nama = (((document.getElementById('info_kasir') || {}).textContent) || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return AKSES.admin.some(u => {
      u = u.replace(/\s+/g, ' ').trim().toLowerCase();
      return !!u && nama.indexOf(u) !== -1;
    });
  }


  // Link nomor halaman dari paginasi server
  const numLinks = [...tbl.tFoot.querySelectorAll('a')].filter(a => /^\d+$/.test(a.textContent.trim()));
  // Jika tidak ada paginasi (data sedikit), semua baris sudah ada di halaman
  const hasPaging = numLinks.length > 0;
  const maxPage = hasPaging ? Math.max(...numLinks.map(a => +a.textContent.trim())) : 1;
  const sampleHref = hasPaging ? new URL(numLinks[0].getAttribute('href'), location.href).href : '';
  const pageUrl = p => sampleHref.replace(/([?&]page=)\d+/, '$1' + p);

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const DELAY_MS = 4000;      // jeda antar permintaan halaman
  const RETRY_WAIT_MS = 30000; // tunggu jika server membatasi permintaan

  let allRows = [];          // <tr> dari halaman yang sudah diambil (berurutan)
  let nextPage = 1;          // halaman server berikutnya yang belum diambil
  let size = 5;              // jumlah baris tampil (dropdown hanya 5 agar server tidak terbebani)
  let busy = false;

  // ---------- Style ----------
  const style = document.createElement('style');
  style.textContent = `
    #pt-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:8px 0; font-size:13px; }
    #pt-toolbar label { display:flex; align-items:center; gap:6px; white-space:nowrap; }
    #pt-toolbar select, #pt-toolbar input#pt-search, #pt-toolbar button {
      height:34px; box-sizing:border-box; padding:0 10px; border:1px solid #bbb; border-radius:4px;
      background:#fff; color:#222; font-size:13px; margin:0;
    }
    #pt-toolbar input#pt-search { flex:1 1 220px; min-width:0; }
    #pt-toolbar button { cursor:pointer; min-width:34px; }
    #pt-toolbar button:disabled { opacity:.5; cursor:default; }
    .pt-scroll { width:100%; overflow:auto; -webkit-overflow-scrolling:touch; }
    .pt-scroll table { min-width:640px; }
    .pt-scroll thead th { position:sticky; top:0; background:#fff; z-index:1; }
    #pt-status { color:#555; font-size:13px; margin:6px 0; }
    @media (max-width: 768px) {
      #pt-toolbar { flex-direction:column; align-items:stretch; }
      #pt-toolbar label { justify-content:flex-start; }
      #pt-toolbar input#pt-search { flex:none; width:100%; }
      #pt-toolbar button#pt-reload { width:100%; }
      .pt-scroll table { font-size:12px; }
      .make_content_float_left, .noprint { float:none !important; width:100% !important; max-width:100% !important; box-sizing:border-box !important; }
      .make_content_float_left { padding:0 10px !important; }
      .make_content_float_left form.new_jurnal, .make_content_float_left .transaksi_body, .make_content_float_left .field { width:100% !important; max-width:100% !important; box-sizing:border-box !important; }
    }`;
  // responsif: blok @media dipasang di akhir CSS, jadi cukup dibuang bila fitur ini tidak diizinkan
  if (!bolehFitur('responsif')) style.textContent = style.textContent.replace(/@media \(max-width: 768px\) \{[\s\S]*\}\s*$/, '');
  document.head.appendChild(style);

  // ---------- Toolbar ----------
  const bar = document.createElement('div');
  bar.id = 'pt-toolbar';
  bar.innerHTML = `
    <label>Tampilkan
      <select id="pt-size">
        <option value="5" selected>5</option>
        <option value="10">10</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
    </label>
    <input id="pt-search" type="search" placeholder="Cari di semua kolom...">
    <button id="pt-reload" type="button" title="Muat ulang data" aria-label="Muat ulang data">&#x21bb;</button>`;
  tbl.parentNode.insertBefore(bar, tbl);
  // fitur yang tidak diizinkan disembunyikan; nilainya tetap (5 baris, kolom cari kosong, tanpa muat ulang)
  if (!bolehFitur('pilihBaris')) bar.querySelector('#pt-size').closest('label').style.display = 'none';
  if (!bolehFitur('cari')) bar.querySelector('#pt-search').style.display = 'none';
  if (!bolehFitur('muatUlang')) bar.querySelector('#pt-reload').style.display = 'none';
  tbl.tFoot.style.display = 'none';

  const scroll = document.createElement('div');
  scroll.className = 'pt-scroll';
  tbl.parentNode.insertBefore(scroll, tbl);
  scroll.appendChild(tbl);

  const statusEl = document.createElement('div');
  statusEl.id = 'pt-status';
  scroll.insertAdjacentElement('afterend', statusEl);

  const $ = id => document.getElementById(id);

  // ---------- Ambil data dari server (hanya halaman yang dibutuhkan) ----------
  async function fetchPage(p) {
    const html = await fetch(pageUrl(p), { credentials: 'same-origin' }).then(r => r.text());
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('#data_table tbody tr')];
  }

  // Ambil halaman berikutnya sampai jumlah baris >= target (atau semua halaman jika target = Infinity)
  async function ensureRows(target) {
    if (busy) return false;
    busy = true;
    try {
      while (nextPage <= maxPage && allRows.length < target) {
        let rows = [];
        for (let attempt = 1; attempt <= 4 && !rows.length; attempt++) {
          statusEl.textContent = `Memuat halaman ${nextPage}/${maxPage}...` + (attempt > 1 ? ` (coba ${attempt})` : '');
          rows = await fetchPage(nextPage);
          if (!rows.length) {
            statusEl.textContent = 'Server membatasi permintaan, menunggu 30 detik...';
            await sleep(RETRY_WAIT_MS);
          }
        }
        if (!rows.length) {
          statusEl.textContent = `Gagal memuat halaman ${nextPage}. Klik tombol ↻ untuk coba lagi.`;
          return false;
        }
        rows.forEach(tr => allRows.push(document.importNode(tr, true)));
        nextPage++;
        if (nextPage <= maxPage && allRows.length < target) await sleep(DELAY_MS);
      }
      return true;
    } finally {
      busy = false;
    }
  }

  if (!hasPaging) {
    allRows = [...tbl.tBodies[0].rows].map(tr => document.importNode(tr, true));
    nextPage = 2; // sudah selesai, tidak perlu ambil dari server
  }

  // ---------- Tampilan ----------
  function currentFilter() {
    const q = $('pt-search').value.trim().toLowerCase();
    return q ? allRows.filter(tr => tr.textContent.toLowerCase().includes(q)) : allRows.slice();
  }

  function render() {
    const q = $('pt-search').value.trim();
    const matched = currentFilter();
    const shown = matched.slice(0, size);   // jumlah baris sesuai pilihan (5, 10, 50, 100)
    shown.forEach((tr, i) => { if (tr.cells[0]) tr.cells[0].textContent = String(i + 1); });
    tbl.tBodies[0].replaceChildren(...shown);

    // Tinggi kotak tabel = header + jumlah baris pilihan; sisanya di-scroll
    const thead = tbl.tHead ? tbl.tHead.getBoundingClientRect().height : 36;
    const sample = shown[0] ? shown[0].getBoundingClientRect().height : 0;
    const rowH = sample > 0 ? sample : 44;
    // Kotak tabel terlihat maksimal 10 baris (atau sesuai pilihan jika lebih kecil); sisanya di-scroll
    scroll.style.maxHeight = Math.round(thead + Math.min(size, 10) * rowH + 4) + 'px';

    const more = nextPage <= maxPage ? ' (data lain diambil saat dibutuhkan)' : '';
    statusEl.textContent = shown.length
      ? `Menampilkan ${shown.length} baris dari ${matched.length} data` + (q ? ' (hasil cari)' : '') + more
      : (nextPage <= maxPage && q ? 'Mengambil semua data untuk pencarian...' : 'Tidak ada data yang cocok');
  }

  // Ubah jumlah baris: ambil data secukupnya saja
  async function onSizeChange() {
    size = +$('pt-size').value;
    // Ambil dulu sebanyak tinggi kotak (maks 10); sisanya diambil saat kotak di-scroll ke bawah
    const need = Math.min(size, 10);
    if (allRows.length < need) {
      const ok = await ensureRows(need);
      if (!ok) { render(); return; }
    }
    render();
  }

  // Pencarian: perlu semua data, jadi ambil semua halaman
  async function onSearch() {
    const q = $('pt-search').value.trim();
    if (q && nextPage <= maxPage) {
      const ok = await ensureRows(Infinity);
      if (!ok) { render(); return; }
    }
    render();
  }

  // Scroll ke bawah: ambil 10 data berikutnya (sampai jumlah yang dipilih)
  scroll.addEventListener('scroll', async () => {
    if (scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 40) return;
    if (allRows.length >= size || nextPage > maxPage || busy) return;
    const ok = await ensureRows(Math.min(size, allRows.length + 10));
    if (ok || allRows.length) render();
  });

  $('pt-size').addEventListener('change', onSizeChange);
  $('pt-search').addEventListener('input', onSearch);
  $('pt-reload').addEventListener('click', () => {
    allRows = [];
    nextPage = 1;
    onSizeChange();
  });

  // Mulai: ambil halaman pertama yang cukup untuk tampilan awal
  onSizeChange();
})();
