// ==UserScript==
// @name         ERZAP - Cek Pemindahan (Lihat Stok)
// @namespace    partdistro.erzap
// @version      1.9.0
// @description  Tombol "Cek Pemindahan" di halaman Daftar Data Produk (dibuka dari menu Audit Stok di produks.js), khusus role pusat: pilih GUDANG, scan semua produk stok > 0 (jeda 4 detik antar halaman), tampilkan aktifitas terakhir; pemindahan dalam periode tanggal disembunyikan.
// @match        https://*.erzap.com/produks*
// @grant        none
// @world        main
// @run-at       document-idle
// ==/UserScript==

// Cek Pemindahan — ERZAP (halaman Home)
// Tombol "Cek Pemindahan" di sebelah tombol Refresh di Home membuka popup.
// Di popup pilih Gudang (semua gudang dari filter Lihat Stok, semua outlet), lalu
// "Scan semua halaman": ambil semua produk gudang itu dengan stok > 0 dari Lihat Stok
// (jeda PAGE_DELAY_MS antar halaman) dan tampilkan aktifitas terakhir tiap produk.
// Produk yang Pemindahan terakhirnya masuk PERIODE disembunyikan (bisa ditampilkan lagi).
(() => {
  if (window.__cekGudangLoaded) return;
  window.__cekGudangLoaded = true;

  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user.
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua). Nama fitur: cekPemindahan.
  // "role"    -> "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil, cukup sebagian nama),
  //              "fitur" = fitur private yang boleh dipakai role itu.
  // Daftar nama pusat sama dengan home.js (tombol Aistim Audit di Home memanggil tombol ini).
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tombol tidak dipasang untuk siapa pun).
  const AKSES_JSON = `{
    "public": [],
    "private": ["cekPemindahan"],
    "role": {
      "pusat": {
        "nama": ["SURYO", "SENTOT", "PUGUH", "DIMAS", "MANAJEMEN PUSAT"],
        "fitur": ["*"]
      }
    }
  }`;
  const rapih = (t) => (t || '').replace(/\s+/g, ' ').trim();
  function bacaAkses() {
    try {
      const a = JSON.parse(AKSES_JSON) || {};
      const role = a.role && typeof a.role === 'object' ? a.role : {};
      return {
        public: Array.isArray(a.public) ? a.public.map(String) : [],
        role: Object.keys(role).map((k) => {
          const r = role[k] || {};
          return {
            nama: Array.isArray(r.nama) ? r.nama.map(String) : [],
            fitur: Array.isArray(r.fitur) ? r.fitur.map(String) : [],
          };
        }),
      };
    } catch (err) {
      console.error('[cekpemindahan.js] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { public: [], role: [] };
    }
  }
  const AKSES = bacaAkses();
  // Cadangan bila #info_kasir tidak ada: elemen daun berpola "NAMA (JABATAN)", mis. "SENTOT ARI HANDOKO (STAF IT)"
  const RE_LABEL_USER = /^[A-Z][A-Z.' -]{2,60}\([^()]{2,40}\)$/;
  function namaUser() {
    const kasir = document.getElementById('info_kasir');
    if (kasir) return rapih(kasir.textContent).toLowerCase();
    for (const e of document.querySelectorAll('label, a, span, div, button')) {
      if (e.children.length) continue;
      const t = rapih(e.textContent);
      if (RE_LABEL_USER.test(t)) return t.toLowerCase();
    }
    return '';
  }
  // true = boleh, false = tidak boleh, null = nama kasir belum terbaca (nama bisa dimuat belakangan)
  function cekAkses(fitur) {
    if (AKSES.public.indexOf(fitur) !== -1) return true;
    const n = namaUser();
    if (!n) return null;
    for (const r of AKSES.role) {
      if (r.nama.some((u) => n.indexOf(u.toLowerCase()) !== -1)) return r.fitur.indexOf('*') !== -1 || r.fitur.indexOf(fitur) !== -1;
    }
    return false;
  }

  // Sembunyikan produk yang Pemindahan terakhirnya hari ini s/d N hari ke belakang (2 = hari ini + 2 hari ke belakang)
  const HIDE_DAYS_BACK = 2; // periode default: hari ini + 2 hari ke belakang
  const CONCURRENCY = 3;        // produk yang dicek bersamaan
  const PAGE_DELAY_MS = 4000;   // jeda saat pindah halaman (4 detik)

  const css = `
  .cg-btn{background:#1e88e5;color:#fff;border:0;border-radius:3px;padding:4px 12px;font-size:12px;cursor:pointer}
  .cg-btn:hover{background:#1565c0}
  .cg-btn:disabled{opacity:.6;cursor:default}
  .cg-btn.grey{background:#757575}
  .cg-btn.red{background:#c62828}
  .cg-btn.green{background:#2e7d32}
  .cg-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;display:flex;align-items:flex-start;justify-content:center;padding-top:40px}
  .cg-modal{background:#fff;border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.3);width:min(1100px,95vw);max-height:85vh;display:flex;flex-direction:column;font-size:12px}
  .cg-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #ddd}
  .cg-head b{font-size:15px;margin-right:auto}
  .cg-ver{font-size:11px;color:#888;margin-right:10px}
  .cg-x{background:none;border:0;font-size:20px;cursor:pointer;line-height:1;color:#666}
  .cg-bar{display:flex;gap:8px;align-items:center;padding:8px 14px;border-bottom:1px solid #eee;flex-wrap:wrap}
  .cg-status{color:#555;flex-basis:100%;font-size:11px}
  .cg-body{overflow:auto;padding:0 14px 12px;margin-top:8px;flex:1 1 auto;min-height:0}
  /* footer tetap di bawah popup (tidak ikut scroll) */
  .cg-foot{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 14px;
    border-top:1px solid #ddd;background:#fafafa;border-radius:0 0 6px 6px}
  .cg-foot .cg-info{color:#333}
  .cg-tbl{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}
  /* header tetap di atas saat scroll, tidak tertimpa isi baris */
  .cg-tbl thead th{background:#f1f1f1!important;position:sticky;top:0;z-index:3;text-align:left;padding:6px 5px;
    border:1px solid #ddd;border-left:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 0 #ccc}
  .cg-tbl thead th:first-child{border-left:1px solid #ddd}
  .cg-tbl td{position:relative;z-index:1;padding:5px;border-right:1px solid #ddd;border-bottom:1px solid #ddd;vertical-align:top;
    white-space:normal!important;word-break:break-word;overflow-wrap:anywhere}
  .cg-tbl td:first-child{border-left:1px solid #ddd}
  /* lebar kolom: No, Barcode, Nama, Aktifitas, Operator, Stok Akhir, Keterangan */
  /* kolom: No, Nama (barcode + nama + tombol Lihat), Aktifitas Terakhir, Operator, Stok Akhir, Keterangan */
  .cg-tbl col.c1{width:42px} .cg-tbl col.c3{width:30%}
  .cg-tbl col.c4{width:145px} .cg-tbl col.c5{width:115px} .cg-tbl col.c6{width:82px} .cg-tbl col.c7{width:auto}
  .cg-tbl td:nth-child(1), .cg-tbl td:nth-child(5){text-align:center}
  .cg-tbl td:nth-child(3) div:last-child{white-space:nowrap!important;color:#555}
  .cg-tbl .cg-row{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px}
  /* barcode berbentuk label, ukurannya sama dengan tombol Aktifitas */
  .cg-tbl .cg-bc{background:#f1f3f5;border:1px solid #ced4da;border-radius:3px;padding:1px 6px;font-size:10px;line-height:16px;color:#495057;
    font-family:Menlo,Consolas,monospace;white-space:nowrap}
  .cg-tbl .cg-nm{font-weight:600;color:#333}
  .cg-tbl .cg-lihat{padding:1px 6px;font-size:10px;line-height:16px;flex:0 0 auto}
  @media (max-height: 760px){ .cg-ov{padding-top:12px} .cg-modal{max-height:94vh} }
  @media (max-width: 900px){
    .cg-ov{padding-top:8px}
    .cg-modal{width:98vw;max-height:96vh;font-size:11px}
    .cg-head{padding:8px 10px} .cg-bar,.cg-stats,.cg-foot{padding-left:10px;padding-right:10px} .cg-body{padding:0 10px 8px}
    .cg-tbl col.c1{width:34px} .cg-tbl col.c3{width:32%} .cg-tbl col.c4{width:118px} .cg-tbl col.c5{width:90px} .cg-tbl col.c6{width:64px}
  }
  /* layar sangat sempit: tabel bisa digeser ke samping, kolom tidak gepeng */
  .cg-tbl{min-width:560px}
  .cg-tbl tr.cg-recent{display:none}
  .cg-modal.show-all .cg-tbl tr.cg-recent{display:table-row;opacity:.5}
  .cg-err{color:#c62828}
  .cg-period{display:inline-flex;align-items:center;gap:6px;color:#333}
  .cg-range{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:1px solid #ccc;border-radius:4px;
    background:#fff;cursor:pointer;font-size:12px;color:#222}
  .cg-range:hover{border-color:#dc3545}
  .cg-range svg{width:14px;height:14px;fill:#dc3545}
  /* date range picker */
  .cg-dp{position:fixed;z-index:99999;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.25);
    font-size:13px;color:#333;display:flex;flex-direction:column;max-width:96vw}
  .cg-dp-main{display:flex}
  .cg-dp-pre{display:flex;flex-direction:column;padding:10px 0;border-right:1px solid #eee;min-width:170px}
  .cg-dp-pre button{background:none;border:0;text-align:left;padding:10px 22px;font-size:14px;color:#333;cursor:pointer}
  .cg-dp-pre button:hover{background:#fdf0f1}
  .cg-dp-pre button.on{color:#dc3545;font-weight:600}
  .cg-dp-cal{padding:12px 16px;position:relative}
  .cg-dp-nav{position:absolute;top:10px;background:none;border:0;color:#dc3545;font-size:22px;cursor:pointer;line-height:1;padding:2px 8px}
  .cg-dp-nav.prev{left:6px} .cg-dp-nav.next{right:6px}
  .cg-dp-months{display:flex;gap:18px}
  .cg-dp-month h4{margin:2px 0 10px;text-align:center;font-size:15px;font-weight:700}
  .cg-dp-month table{border-collapse:collapse}
  .cg-dp-month th{background:#ebebeb;color:#888;font-weight:400;padding:6px 0;width:38px;border:1px solid #c8ccd2;font-size:12px}
  .cg-dp-month td{border:1px solid #c8ccd2;height:34px;width:38px;text-align:center;padding:0}
  .cg-dp-month td.d{cursor:pointer}
  .cg-dp-month td.d:hover{background:#fdf0f1}
  .cg-dp-month td.today span{display:inline-block;width:30px;height:28px;line-height:26px;border:1px solid #dc3545;border-radius:5px}
  .cg-dp-month td.in{background:#fbe3e6}
  .cg-dp-month td.sel{background:#dc3545;color:#fff;font-weight:600}
  .cg-dp-month td.sel.today span{border-color:#fff}
  .cg-dp-foot{display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid #eee}
  .cg-dp-foot .txt{margin-right:auto;color:#666;font-size:12px}
  .cg-dp-foot button{height:36px;padding:0 22px;border-radius:5px;font-size:14px;cursor:pointer}
  .cg-dp-cancel{background:#fff;border:1px solid #ccc;color:#333}
  .cg-dp-ok{background:#dc3545;border:1px solid #dc3545;color:#fff;font-weight:600}
  @media (max-width: 700px){
    .cg-dp-main{flex-direction:column}
    .cg-dp-pre{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid #eee;padding:4px;min-width:0}
    .cg-dp-pre button{padding:6px 10px;font-size:12px}
    .cg-dp-month + .cg-dp-month{display:none}
  }
  .cg-stats{display:flex;flex-wrap:nowrap;gap:6px;align-items:center;padding:6px 14px;border-bottom:1px solid #eee;overflow-x:auto;scrollbar-width:thin}
  .cg-stats > *{flex:0 0 auto;white-space:nowrap}
  .cg-head, .cg-bar, .cg-stats{flex:0 0 auto} /* jangan ikut menyusut saat popup pendek */
  .cg-stats b{margin-right:4px}
  .cg-opwrap{display:none;align-items:center;gap:4px;margin-right:12px}
  .cg-gdwrap{display:inline-flex;align-items:center;gap:4px;margin-right:4px}
  .cg-gd{font-size:12px;height:28px;padding:2px 6px;border:1px solid #ccc;border-radius:3px;min-width:230px;max-width:100%}
  .cg-op{font-size:12px;height:26px;padding:2px 6px;border:1px solid #ccc;border-radius:3px;max-width:100%;min-width:220px}
  .cg-tbl tr.cg-opx{display:none!important}
  .cg-empty{padding:20px;text-align:center;color:#777}
  /* tombol Lihat di kolom Aktifitas */
  .cg-lihat{background:#fff;border:1px solid #1e88e5;color:#1e88e5;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer}
  .cg-lihat:hover{background:#1e88e5;color:#fff}
  /* popup Aktifitas Stok */
  .cg-ov2{z-index:100000;background:rgba(0,0,0,.35)}
  .cg-akt{width:min(1000px,96vw)}
  .cg-akt-info{flex:0 0 auto;padding:8px 14px;border-bottom:1px solid #eee}
  .cg-akt-info .nm{font-size:15px;font-weight:700;color:#444}
  /* popup Aktifitas Stok: hanya tabel yang di-scroll */
  .cg-akt .cg-body{overflow:hidden;display:flex;flex-direction:column;padding-bottom:10px}
  .cg-akt-top{flex:0 0 auto}
  .cg-akt-top .alert, .cg-akt-top [class*=alert]{margin-bottom:8px}
  /* tabel tetap tampilan asli ERZAP, hanya dibungkus wadah scroll */
  .cg-akt-scroll{flex:1 1 auto;min-height:0;overflow:auto}
  /* dialog Aktifitas Stok di Home: tab "Aktifitas" dibuat seperti di halaman Lihat Stok (tab biru) */
  .cg-akt-dlg ul{list-style:none;display:flex;gap:4px;padding:0;margin:10px 0 0;border-bottom:1px solid #dee2e6;text-align:left}
  .cg-akt-dlg ul li a{display:inline-block;padding:6px 14px;background:#1e88e5;color:#fff!important;border-radius:4px 4px 0 0;text-decoration:none;cursor:default}
  .cg-akt-dlg .tab-content, .cg-akt-dlg .tab-pane{text-align:left;border:1px solid #dee2e6;border-top:0;padding:10px}
  /* di Home CSS tabel ERZAP (Lihat Stok) tidak ada -> tiru tampilan popup Aktifitas Stok ERZAP */
  .cg-akt-scroll table{width:100%;border-collapse:collapse;font-size:12px}
  .cg-akt-scroll th, .cg-akt-scroll td{white-space:normal!important;min-width:0!important;padding:6px;border:1px solid #dee2e6;vertical-align:top;text-align:left}
  .cg-akt-scroll th{background:#ececec;font-weight:700;position:sticky;top:0;z-index:1}
  .cg-akt-scroll td:first-child{width:90px}
`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // urutan kolom tabel popup
  const C = { no: 0, nama: 1, last: 2, op: 3, stok: 4, ket: 5 };

  const toDiv = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const get = async (path, params) => {
    const r = await fetch(path + '?' + new URLSearchParams(params), {
      credentials: 'same-origin',
      // ERZAP returns 500 without this Accept header (same as jQuery dataType:'text')
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/plain, */*; q=0.01' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return toDiv(await r.text());
  };

  // ===== Data dari halaman Lihat Stok (form pencarian + daftar gudang) =====
  const SCRIPT_VERSION = '1.8.0';
  const LS_URL = '/produk_gudangs/lihat_stok/new';
  const csrf = () => document.querySelector('meta[name=csrf-token]')?.content || '';
  // field form yang dipertahankan; filter lain dikosongkan. idoutlet_own dikosongkan = semua outlet
  const KEEP_FIELDS = ['utf8', 'pencarian[umur_produk_satuan_waktu]'];
  let tpl = null; // { form, gudangs: [{id, nama}], hide }

  const postLihatStok = async (form, over, page) => {
    const tok = csrf();
    const fd = new FormData();
    for (const [k, v] of new FormData(form)) fd.append(k, KEEP_FIELDS.includes(k) ? v : '');
    for (const k in over) fd.set(k, over[k]);
    if (tok) fd.append('authenticity_token', tok);
    const r = await fetch(LS_URL + '?' + new URLSearchParams({ page }), {
      method: 'POST', body: fd, credentials: 'same-origin',
      headers: tok ? { 'X-CSRF-Token': tok } : {},
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return toDiv(await r.text());
  };

  // ===== Filter Lihat Stok milik user disimpan ERZAP di server (session).
  // Setiap POST pencarian mengubahnya, jadi sebelum script mengambil data, filter user dicatat
  // (snapshot) dan sesudahnya dikembalikan persis seperti semula -> halaman Lihat Stok tidak terpengaruh.
  async function takeSnapshot() {
    const r = await fetch(LS_URL, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = toDiv(await r.text());
    const form = d.querySelector('#form_pencarian_lihat_stok');
    if (!form) throw new Error('Form Lihat Stok tidak ditemukan (sudah login?)');
    return { form, entries: [...new FormData(form).entries()] };
  }
  const snapshotFd = (snap) => {
    const fd = new FormData();
    snap.entries.forEach(([k, v]) => fd.append(k, v));
    const tok = csrf();
    if (tok && !fd.has('authenticity_token')) fd.append('authenticity_token', tok);
    return fd;
  };
  async function restoreSnapshot(snap) {
    if (!snap) return;
    const tok = csrf();
    try {
      await fetch(LS_URL + '?page=1', { method: 'POST', body: snapshotFd(snap), credentials: 'same-origin', headers: tok ? { 'X-CSRF-Token': tok } : {} });
    } catch (e) { /* abaikan */ }
  }
  // kalau halaman ditutup saat scan berjalan, tetap coba kembalikan filter
  let pendingSnap = null;
  window.addEventListener('pagehide', () => {
    if (pendingSnap && navigator.sendBeacon) navigator.sendBeacon(LS_URL + '?page=1', snapshotFd(pendingSnap));
  });

  async function loadTemplate() {
    if (tpl) return tpl;
    const snap = await takeSnapshot();
    const form = snap.form;
    // tanpa outlet -> dropdown Gudang berisi semua gudang dari semua outlet
    let d1;
    pendingSnap = snap;
    try {
      d1 = await postLihatStok(form, { 'pencarian[idgudang]': '', 'pencarian[jumlah]': '0', 'pencarian[perbandingan_jumlah]': '>' }, 1);
    } finally {
      await restoreSnapshot(snap); // kembalikan filter Lihat Stok user
      pendingSnap = null;
    }
    const sel = d1.querySelector('#pencarian_idgudang') || form.querySelector('#pencarian_idgudang');
    const gudangs = sel ? [...sel.options]
      .filter((o) => o.value)
      .map((o) => ({ id: o.value, nama: o.text.trim() })) : [];
    if (!gudangs.length) throw new Error('Daftar gudang tidak ditemukan');
    const hide = d1.querySelector('#hide_stok_awal_stok_akhir')?.value || '';
    tpl = { form, gudangs, hide };
    return tpl;
  }

  // Ambil 1 halaman produk: Gudang = gdn, Perkiraan Jumlah > 0
  const getPage = (page, gdn) => postLihatStok(tpl.form, {
    'pencarian[idgudang]': gdn, 'pencarian[perbandingan_jumlah]': '>', 'pencarian[jumlah]': '0',
  }, page);

  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } },
  };

  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;   // 2026-11-24 (untuk input date)
  const idDate = (iso) => iso ? iso.split('-').reverse().join('-') : '';                        // 24-11-2026
  const tglToIso = (tgl) => { const m = (tgl || '').match(/^(\d{2})-(\d{2})-(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };

  // Aktifitas terakhir 1 produk di gudang terpilih
  async function cekProduk(p, gdn) {
    const d = await get('/produk_gudangs/detail_stok/new', { idproduk: p.prd, idoutlet: p.otl || '' });
    const a = [...d.querySelectorAll('.bt_detail_stok_aktifitas')].find((x) => x.dataset.gdn === gdn);
    const params = aktifitasParams(p.prd, gdn, (a && a.dataset.otl) || p.otl || '', (a && a.dataset.prdHrg) || '');
    const ad = await get('/produk_gudangs/aktifitas_stok/new', params);
    const row = ad.querySelector('table tbody tr');
    const cells = row ? [...row.children].map((c) => c.textContent.trim().replace(/\s+/g, ' ')) : [];
    if (!cells[0]) throw new Error('Belum ada aktifitas');
    // columns located by header (they shift when Stok Awal/Akhir are hidden)
    const hdr = [...ad.querySelectorAll('table th')].map((t) => t.textContent.trim().toLowerCase());
    const col = (name) => { const i = hdr.indexOf(name); return (i >= 0 && cells[i]) || '-'; };
    return {
      jenis: cells[2] || '-',
      tgl: cells[0].replace(/\s*[+-]\d{4}$/, ''),
      operator: col('operator'),
      stokAkhir: col('stok akhir'),
      ket: col('keterangan'),
      params,
    };
  }

  const aktifitasParams = (prd, gdn, otl, hrg) => {
    const hide = document.getElementById('hide_stok_awal_stok_akhir');
    return { idproduk: prd, idgudang: gdn, idoutlet: otl || '', idproduk_harga: hrg || '',
      hide_stok_awal_stok_akhir: hide ? hide.value : (tpl ? tpl.hide : '') };
  };

  // ===== Popup "Aktifitas Stok" lengkap untuk 1 produk (dibuka dari tombol ⋮ di Keterangan) =====
  // Pakai popup "Aktifitas Stok" bawaan ERZAP (fetch_aktifitas_stok) supaya tampilannya sama persis.
  // Kalau fungsi ERZAP tidak tersedia, pakai popup cadangan buatan script.
  const DLG = '#dialog_form_aktifitas_stok';
  const erzapDialogOpen = () => {
    const $ = window.jQuery;
    return !!($ && $(DLG).length && $(DLG).hasClass('ui-dialog-content') && $(DLG).dialog('isOpen'));
  };
  function openAktifitas(info) {
    const $ = window.jQuery;
    if (typeof window.fetch_aktifitas_stok === 'function' && $ && $(DLG).length) {
      const a = document.createElement('a');
      a.dataset.prd = info.params.idproduk;
      a.dataset.barcode = info.barcode;
      a.dataset.nama = info.nama;
      a.dataset.prdHrg = info.params.idproduk_harga || '';
      a.dataset.gdn = info.params.idgudang;
      a.dataset.gudangNama = info.gudang;
      a.dataset.otl = info.params.idoutlet || '';
      // popup Cek Pemindahan diturunkan sementara ke bawah popup ERZAP (z-index ERZAP ~1100),
      // lalu dikembalikan saat popup Aktifitas Stok ditutup
      const ov = document.querySelector('.cg-ov:not(.cg-ov2)');
      if (ov) ov.style.zIndex = '1000';
      window.fetch_aktifitas_stok(a);
      if (ov) {
        const t = setInterval(() => {
          if (!erzapDialogOpen()) { ov.style.zIndex = ''; clearInterval(t); }
        }, 250);
      }
      return;
    }
    if ($ && $.fn && $.fn.dialog) { openAktifitasErzapClone(info); return; }
    openAktifitasCadangan(info);
  }

  // Di Home fungsi ERZAP fetch_aktifitas_stok tidak ada, tapi jQuery UI ada.
  // Buat dialog yang sama persis dengan milik halaman Lihat Stok (markup + opsi dialog ERZAP).
  function openAktifitasErzapClone(info) {
    const $ = window.jQuery;
    let el = document.getElementById('dialog_form_aktifitas_stok');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dialog_form_aktifitas_stok';
      el.title = 'Aktifitas Stok';
      el.style.display = 'none';
      el.className = 'cg-akt-dlg';
      el.innerHTML = `
        <div><b style="width: auto; font-size: 14pt"><span id="barcode_produk_aktifitas"></span> - <span id="nama_produk_aktifitas"></span></b></div>
        <div><b style="width: 70px">Gudang</b>: <span id="gudang_aktifitas"></span></div>
        <div id="target_aktifitas_aktifitas_stok" style="text-align: center" class="mt-2">Loading data...</div>`;
      document.body.appendChild(el);
    }
    if (!$(el).hasClass('ui-dialog-content')) {
      $(el).dialog({
        autoOpen: false, show: 'blind', hide: 'blind',
        height: 500, width: Math.min(1200, window.innerWidth - 20), modal: true,
        buttons: { Tutup: function () { $(this).dialog('close'); } },
      });
    }
    $('#barcode_produk_aktifitas').text(info.barcode);
    $('#nama_produk_aktifitas').text(info.nama);
    $('#gudang_aktifitas').text(info.gudang);
    $('#target_aktifitas_aktifitas_stok').html('Loading data...');
    const ov = document.querySelector('.cg-ov:not(.cg-ov2)');
    if (ov) ov.style.zIndex = '1000';
    $(el).dialog('open');
    if (ov) {
      const t = setInterval(() => { if (!erzapDialogOpen()) { ov.style.zIndex = ''; clearInterval(t); } }, 250);
    }
    $.ajax({
      url: '/produk_gudangs/aktifitas_stok/new', dataType: 'text', data: info.params,
      success: (data) => {
        const d = toDiv(data);
        d.querySelectorAll('script').forEach((x) => x.remove());
        // link kode transaksi dibuka di tab baru supaya hasil scan tidak hilang
        d.querySelectorAll('a[href]').forEach((x) => {
          if (x.getAttribute('href').startsWith('#')) { x.removeAttribute('href'); return; } // tab, jangan pindah halaman
          x.target = '_blank'; x.rel = 'noopener';
        });
        const target = document.getElementById('target_aktifitas_aktifitas_stok');
        target.innerHTML = '';
        while (d.firstChild) target.appendChild(d.firstChild);
      },
      error: () => { $('#target_aktifitas_aktifitas_stok').text('Gagal memuat aktifitas.'); },
    });
  }

  async function openAktifitasCadangan(info) {
    document.querySelectorAll('.cg-ov2').forEach((x) => x.remove());
    const ov = document.createElement('div');
    ov.className = 'cg-ov cg-ov2';
    ov.innerHTML = `<div class="cg-modal cg-akt">
        <div class="cg-head"><b>Aktifitas Stok</b><button type="button" class="cg-x" title="Tutup">&times;</button></div>
        <div class="cg-akt-info"><div class="nm"></div><div class="gd"></div></div>
        <div class="cg-body"><div class="cg-empty">Memuat aktifitas...</div></div>
        <div class="cg-foot"><span></span><button type="button" class="cg-btn grey cg-close">Tutup</button></div>
      </div>`;
    ov.querySelector('.nm').textContent = `${info.barcode} - ${info.nama}`;
    ov.querySelector('.gd').innerHTML = '<b>Gudang:</b> ';
    ov.querySelector('.gd').appendChild(document.createTextNode(info.gudang));
    const close = () => ov.remove();
    ov.querySelector('.cg-x').onclick = close;
    ov.querySelector('.cg-close').onclick = close;
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    const body = ov.querySelector('.cg-body');
    try {
      const d = await get('/produk_gudangs/aktifitas_stok/new', info.params);
      d.querySelectorAll('script, style, link, ul.nav, .nav-tabs').forEach((x) => x.remove());
      // tab "Aktifitas" bawaan ERZAP tidak perlu
      d.querySelectorAll('ul').forEach((u) => { if (/^\s*aktifitas\s*$/i.test(u.textContent)) u.remove(); });
      // link kode transaksi dibuka di tab baru supaya hasil scan tidak hilang
      d.querySelectorAll('a[href]').forEach((x) => {
        if (x.getAttribute('href').startsWith('#')) { x.removeAttribute('href'); return; }
        x.target = '_blank'; x.rel = 'noopener';
      });
      // kolom teknis idproduk_harga tidak perlu ditampilkan
      d.querySelectorAll('table').forEach((t) => {
        const ths = [...t.querySelectorAll('thead th, tr:first-child th')];
        const i = ths.findIndex((th) => /idproduk_harga/i.test(th.textContent));
        if (i >= 0) t.querySelectorAll('tr').forEach((tr) => tr.children[i] && (tr.children[i].style.display = 'none'));
      });
      // tabel utama (yang paling banyak barisnya) dipindah ke wadah scroll sendiri,
      // info di atasnya (Jumlah Total, catatan kuning) tetap diam
      const main = [...d.querySelectorAll('table')].sort((a, b) => b.rows.length - a.rows.length)[0];
      body.innerHTML = '';
      if (!main) { body.innerHTML = '<div class="cg-empty">Belum ada aktifitas.</div>'; return; }
      main.remove();
      const topInfo = document.createElement('div');
      topInfo.className = 'cg-akt-top';
      while (d.firstChild) topInfo.appendChild(d.firstChild);
      const scroll = document.createElement('div');
      scroll.className = 'cg-akt-scroll';
      scroll.appendChild(main);
      body.append(topInfo, scroll);
    } catch (err) {
      body.innerHTML = '<div class="cg-empty cg-err"></div>';
      body.firstChild.textContent = 'Gagal memuat: ' + err.message;
    }
  }

  function produkDari(root) {
    return [...root.querySelectorAll('td.bt_dialog_aktifitas_stok')].map((td) => {
      const tr = td.closest('tr');
      return {
        prd: tr.querySelector('.produk')?.textContent.trim() || td.dataset.prd,
        otl: td.dataset.otl,
        barcode: td.dataset.barcode || '',
        nama: td.dataset.nama || tr.querySelector('td.nama_produk')?.textContent.trim() || '',
      };
    });
  }

  // "Menampilkan data 51 - 100 dari total data 462" -> { total: 462, perPage: 50 }
  function infoHalaman(root) {
    const m = (root.innerText || root.textContent || '').match(/Menampilkan data\s*(\d+)\s*-\s*(\d+)\s*dari total data\s*(\d+)/i);
    if (!m) return null;
    const from = +m[1], to = +m[2], total = +m[3];
    return { total, perPage: Math.max(1, to - from + 1) };
  }

  // ===== Kalender pilih periode (preset + 2 bulan, Batal / Terapkan) =====
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  function openRangePicker(anchor, cur, onApply) {
    document.querySelectorAll('.cg-dp').forEach((x) => x.remove());
    const today = isoDate(new Date());
    let from = cur.from, to = cur.to, preset = '';
    const base = from ? new Date(from + 'T00:00:00') : new Date();
    let vy = base.getFullYear(), vm = base.getMonth(); // bulan kiri yang ditampilkan

    const PRESETS = [
      ['minggu', 'Minggu Ini', () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return [isoDate(d), today]; }],
      ['bulan', 'Bulan Ini', () => { const d = new Date(); d.setDate(1); return [isoDate(d), today]; }],
      ['3bulan', '3 Bulan Terakhir', () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return [isoDate(d), today]; }],
      ['semua', 'Semua Data', () => ['', '']],
    ];

    const dp = document.createElement('div');
    dp.className = 'cg-dp';
    dp.innerHTML = `<div class="cg-dp-main"><div class="cg-dp-pre"></div><div class="cg-dp-cal">
        <button type="button" class="cg-dp-nav prev">&#8249;</button><button type="button" class="cg-dp-nav next">&#8250;</button>
        <div class="cg-dp-months"></div></div></div>
      <div class="cg-dp-foot"><span class="txt"></span>
        <button type="button" class="cg-dp-cancel">Batal</button><button type="button" class="cg-dp-ok">Terapkan</button></div>`;
    const pre = dp.querySelector('.cg-dp-pre');
    const months = dp.querySelector('.cg-dp-months');
    const txt = dp.querySelector('.txt');

    PRESETS.forEach(([key, label, fn]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.dataset.key = key;
      b.onclick = () => {
        [from, to] = fn(); preset = key;
        if (from) { const d = new Date(from + 'T00:00:00'); vy = d.getFullYear(); vm = d.getMonth(); }
        render();
      };
      pre.appendChild(b);
    });

    const monthHtml = (y, m) => {
      const first = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      let h = `<div class="cg-dp-month"><h4>${BULAN[m]} ${y}</h4><table><thead><tr>${HARI.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody><tr>`;
      let col = 0;
      for (let i = 0; i < first; i++, col++) h += '<td></td>';
      for (let d = 1; d <= days; d++, col++) {
        if (col && col % 7 === 0) h += '</tr><tr>';
        const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
        const cls = ['d'];
        if (iso === today) cls.push('today');
        const allData = !from && !to && preset === 'semua';
        if (!allData && from && (iso === from || iso === (to || from))) cls.push('sel');
        else if (!allData && from && to && iso > from && iso < to) cls.push('in');
        h += `<td class="${cls.join(' ')}" data-iso="${iso}"><span>${d}</span></td>`;
      }
      while (col % 7) { h += '<td></td>'; col++; }
      return h + '</tr></tbody></table></div>';
    };

    function render() {
      const y2 = vm === 11 ? vy + 1 : vy, m2 = (vm + 1) % 12;
      months.innerHTML = monthHtml(vy, vm) + monthHtml(y2, m2);
      pre.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.key === preset));
      txt.textContent = (!from && !to) ? 'Semua Data'
        : (to && to !== from ? `${idDate(from)} s/d ${idDate(to)}` : `${idDate(from)} — pilih tanggal akhir`);
    }

    months.addEventListener('click', (e) => {
      const td = e.target.closest('td.d');
      if (!td) return;
      const iso = td.dataset.iso;
      preset = '';
      if (!from || (from && to)) { from = iso; to = ''; }          // klik pertama: tanggal awal
      else if (iso < from) { to = from; from = iso; }               // klik kedua lebih awal: tukar
      else { to = iso; }                                            // klik kedua: tanggal akhir
      render();
    });
    dp.querySelector('.prev').onclick = () => { vm--; if (vm < 0) { vm = 11; vy--; } render(); };
    dp.querySelector('.next').onclick = () => { vm++; if (vm > 11) { vm = 0; vy++; } render(); };

    const closeDp = () => { dp.remove(); document.removeEventListener('mousedown', outside, true); };
    const outside = (e) => { if (!dp.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeDp(); };
    dp.querySelector('.cg-dp-cancel').onclick = closeDp;
    dp.querySelector('.cg-dp-ok').onclick = () => {
      if (from && !to) to = from;            // hanya 1 tanggal dipilih = 1 hari
      closeDp();
      onApply(from, to);
    };
    dp.addEventListener('click', (e) => e.stopPropagation());

    render();
    document.body.appendChild(dp);
    // posisi: di bawah tombol, tetap di dalam layar
    const r = anchor.getBoundingClientRect();
    const w = dp.offsetWidth, h = dp.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - w - 8); left = Math.max(8, left);
    let top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    dp.style.left = left + 'px'; dp.style.top = top + 'px';
    setTimeout(() => document.addEventListener('mousedown', outside, true));
  }

  function openPopup() {
    if (document.querySelector('.cg-ov')) return;
    let gdn = '';
    let gNama = '';

    const ov = document.createElement('div');
    ov.className = 'cg-ov';
    ov.innerHTML = `
      <div class="cg-modal">
        <div class="cg-head"><b></b><span class="cg-ver">v${SCRIPT_VERSION}</span><button type="button" class="cg-x" title="Tutup">&times;</button></div>
        <div class="cg-bar">
          <span class="cg-gdwrap"><b>Gudang:</b> <select class="cg-gd" disabled><option>Memuat daftar gudang...</option></select></span>
          <button type="button" class="cg-btn cg-scan-all" disabled>Scan semua halaman</button>
          <button type="button" class="cg-btn grey cg-toggle" style="display:none"></button>
          <span class="cg-status"></span>
        </div>
        <div class="cg-stats"><span class="cg-opwrap"></span>
          <span class="cg-period">Periode pemindahan:
            <button type="button" class="cg-range"><svg viewBox="0 0 24 24"><path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm-2 8h14v10H5V10z"/></svg><span></span></button></span>
        </div>
        <div class="cg-body"><div class="cg-empty">Klik <b>Scan semua halaman</b> untuk mulai.</div></div>
        <div class="cg-foot"><span class="cg-info"></span><button type="button" class="cg-btn grey cg-close">Tutup</button></div>
      </div>`;
    const modal = ov.querySelector('.cg-modal');
    const setTitle = () => { ov.querySelector('.cg-head b').textContent = 'Cek Pemindahan' + (gNama ? ' — ' + gNama : ''); };
    setTitle();
    const scanAllBtn = ov.querySelector('.cg-scan-all');
    // satu tombol: Scan semua halaman -> Stop -> Lanjut
    let btnMode = 'scan';
    const setBtn = (mode) => {
      btnMode = mode;
      scanAllBtn.classList.toggle('red', mode === 'stop' || mode === 'stopping');
      scanAllBtn.classList.toggle('green', mode === 'resume');
      scanAllBtn.textContent = { scan: 'Scan semua halaman', stop: 'Stop', stopping: 'Menghentikan...', resume: 'Lanjut' }[mode];
      scanAllBtn.disabled = mode === 'stopping';
    };
    let resumeState = null; // { gdn, page, pending, seen, totalProduk, totalPage, tbody, finished }
    const tg = ov.querySelector('.cg-toggle');
    const rangeBtn = ov.querySelector('.cg-range');
    // periode: { from, to } dalam format yyyy-mm-dd; keduanya kosong = Semua Data
    const period = (() => { const t = new Date(); const f = new Date(); f.setDate(f.getDate() - HIDE_DAYS_BACK); return { from: isoDate(f), to: isoDate(t) }; })();
    const periodText = () => (!period.from && !period.to) ? 'Semua Data'
      : (period.from === period.to ? idDate(period.from) : `${idDate(period.from)} s/d ${idDate(period.to)}`);
    const showPeriod = () => { rangeBtn.querySelector('span').textContent = periodText(); };
    showPeriod();
    // tandai baris yang Pemindahan terakhirnya masuk periode
    const inPeriod = (tr) => {
      const d = tr.dataset.iso;
      if (!d || !/pemindahan/i.test(tr.dataset.jenis || '')) return false;
      if (period.from && d < period.from) return false;
      if (period.to && d > period.to) return false;
      return true;
    };
    const classify = (tr) => tr.classList.toggle('cg-recent', inPeriod(tr));
    const status = ov.querySelector('.cg-status');
    const body = ov.querySelector('.cg-body');
    const stats = ov.querySelector('.cg-opwrap'); // dropdown operator (di sebelah kiri Periode)
    let opFilter = ''; // operator yang sedang difilter ('' = semua)

    let running = false;
    let stopReq = false;
    const close = () => {
      if (running && !confirm('Scan masih berjalan. Hentikan dan tutup popup?')) return;
      stopReq = true;
      document.querySelectorAll('.cg-dp, .cg-ov2').forEach((x) => x.remove());
      if (erzapDialogOpen()) window.jQuery(DLG).dialog('close');
      ov.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // Esc sudah dipakai popup Aktifitas Stok ERZAP untuk menutup dirinya -> jangan tutup Cek Pemindahan
      if (e.defaultPrevented || erzapDialogOpen()) return;
      const ak = document.querySelector('.cg-ov2');
      if (ak) { ak.remove(); return; } // Esc: tutup popup Aktifitas Stok dulu
      const dp = document.querySelector('.cg-dp');
      if (dp) { dp.remove(); return; } // Esc pertama: tutup kalender dulu
      close();
    };
    document.addEventListener('keydown', onKey);
    ov.querySelector('.cg-x').onclick = close;
    ov.querySelector('.cg-close').onclick = close;
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });

    const setToggle = () => {
      const n = body.querySelectorAll('tr.cg-recent').length;
      tg.style.display = n ? '' : 'none';
      tg.textContent = modal.classList.contains('show-all')
        ? `Sembunyikan pemindahan periode ini (${n})`
        : `Tampilkan pemindahan periode ini (${n})`;
    };
    // Kolom No selalu urut 1,2,3... untuk baris yang sedang terlihat
    const renumber = () => {
      const showAll = modal.classList.contains('show-all');
      let n = 0;
      body.querySelectorAll('.cg-tbl tbody tr').forEach((tr) => {
        const vis = (showAll || !tr.classList.contains('cg-recent')) && !tr.classList.contains('cg-opx');
        tr.children[0].textContent = vis ? ++n : '';
      });
      const total = body.querySelectorAll('.cg-tbl tbody tr').length;
      ov.querySelector('.cg-info').textContent = total
        ? `Ditampilkan ${n} dari ${total} produk` + (opFilter ? ` — operator: ${opFilter}` : '')
        : '';
    };

    // Stats operator: jumlah produk per operator (mengikuti baris yang ditampilkan,
    // termasuk pemindahan 3 hari terakhir kalau sedang ditampilkan). Klik untuk filter.
    const opName = (tr) => (tr.children[C.op].textContent.trim() || '-');
    const applyOpFilter = () => {
      body.querySelectorAll('.cg-tbl tbody tr').forEach((tr) => {
        tr.classList.toggle('cg-opx', !!opFilter && opName(tr) !== opFilter);
      });
    };
    const updateStats = () => {
      const showAll = modal.classList.contains('show-all');
      const rows = [...body.querySelectorAll('.cg-tbl tbody tr')]
        .filter((tr) => (showAll || !tr.classList.contains('cg-recent')) && tr.children[C.op].textContent.trim());
      if (!rows.length) { stats.style.display = 'none'; return; }
      const count = {};
      rows.forEach((tr) => { const k = opName(tr); count[k] = (count[k] || 0) + 1; });
      const list = Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (opFilter && !count[opFilter]) opFilter = '';
      // dropdown operator (jumlah produk per operator)
      let sel = stats.querySelector('select');
      if (!sel) {
        stats.innerHTML = '<b>Operator:</b>';
        sel = document.createElement('select');
        sel.className = 'cg-op';
        sel.onchange = () => { opFilter = sel.value; applyOpFilter(); renumber(); };
        stats.appendChild(sel);
      }
      sel.innerHTML = '';
      const add = (label, key, n) => {
        const o = document.createElement('option');
        o.value = key;
        o.textContent = `${label} (${n})`;
        sel.appendChild(o);
      };
      add('Semua operator', '', rows.length);
      list.forEach(([k, n]) => add(k, k, n));
      sel.value = opFilter;
      stats.style.display = 'flex';
    };
    tg.onclick = () => { modal.classList.toggle('show-all'); setToggle(); updateStats(); applyOpFilter(); renumber(); };

    // isi dropdown Gudang (semua outlet); pilihan terakhir diingat
    const gdSel = ov.querySelector('.cg-gd');
    const emptyMsg = () => { stats.style.display = 'none'; stats.innerHTML = ''; ov.querySelector('.cg-info').textContent = '';
      tg.style.display = 'none'; status.textContent = '';
      body.innerHTML = '<div class="cg-empty">Pilih Gudang lalu klik <b>Scan semua halaman</b>.</div>'; };
    loadTemplate().then((t) => {
      gdSel.innerHTML = '';
      // kelompokkan per outlet (nama setelah TOKO/GUDANG/SERVICE), di dalamnya urut: TOKO, GUDANG, RETUR, SERVICE, lainnya
      const TYPES = ['TOKO', 'GUDANG', 'RETUR', 'SERVICE'];
      const parse = (nama) => {
        const m = nama.trim().match(/^(TOKO|GUDANG|SERVICE)\s+(.*)$/i);
        if (!m) return { type: 4, outlet: nama.trim().toUpperCase() };
        let type = TYPES.indexOf(m[1].toUpperCase()); let outlet = m[2].trim();
        const r = outlet.match(/^RETUR\s+(.*)$/i);
        if (r) { type = 2; outlet = r[1].trim(); }
        return { type, outlet: outlet.toUpperCase() };
      };
      const byOutlet = new Map();
      t.gudangs.forEach((g) => {
        const k = parse(g.nama);
        if (!byOutlet.has(k.outlet)) byOutlet.set(k.outlet, []);
        byOutlet.get(k.outlet).push({ g, type: k.type });
      });
      [...byOutlet.keys()]
        .sort((a, b) => (a === 'PUSAT' ? -1 : b === 'PUSAT' ? 1 : a.localeCompare(b, 'id', { numeric: true })))
        .forEach((outlet) => {
          const og = document.createElement('optgroup'); og.label = outlet;
          byOutlet.get(outlet)
            .sort((x, y) => x.type - y.type || x.g.nama.localeCompare(y.g.nama, 'id', { numeric: true }))
            .forEach(({ g }) => { const o = document.createElement('option'); o.value = g.id; o.textContent = g.nama; og.appendChild(o); });
          gdSel.appendChild(og);
        });
      const last = store.get('cgGudangId');
      if (last && t.gudangs.some((g) => g.id === last)) gdSel.value = last;
      gdSel.disabled = false; scanAllBtn.disabled = false; setBtn('scan');
      gdn = gdSel.value; gNama = gdSel.selectedOptions[0].text; setTitle();
    }).catch((err) => {
      gdSel.innerHTML = '<option>Gagal memuat</option>';
      body.innerHTML = '<div class="cg-empty cg-err"></div>';
      body.firstChild.textContent = 'Gagal memuat daftar gudang: ' + err.message;
    });
    gdSel.onchange = () => {
      if (running) return;
      gdn = gdSel.value; gNama = gdSel.selectedOptions[0].text; setTitle();
      store.set('cgGudangId', gdn);
      resumeState = null; setBtn('scan');
      emptyMsg(); // hasil scan gudang sebelumnya tidak berlaku lagi
    };

    const startTable = () => {
      modal.classList.remove('show-all');
      opFilter = ''; stats.style.display = 'none'; stats.innerHTML = '';
      body.innerHTML = `<table class="cg-tbl"><colgroup><col class="c1"><col class="c3"><col class="c4"><col class="c5"><col class="c6"><col class="c7"></colgroup><thead><tr>
        <th>No</th><th>Nama</th><th>Aktifitas Terakhir</th>
        <th>Operator</th><th>Stok Akhir</th><th>Keterangan</th></tr></thead><tbody></tbody></table>`;
      return body.querySelector('tbody');
    };

    // Cek daftar produk dan tambahkan barisnya ke tabel popup
    let done = 0;
    const makeRows = (list, tbody) => {
      const items = list.map((p) => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td></td><td><div class="cg-row"><span class="cg-bc"></span></div><div class="cg-nm"></div></td><td>Menunggu...</td><td></td><td></td><td></td>';
        // kolom Nama: baris 1 = barcode + tombol Aktifitas (setelah dicek), baris 2 = nama
        tr.children[C.nama].querySelector('.cg-bc').textContent = p.barcode;
        tr.children[C.nama].querySelector('.cg-nm').textContent = p.nama;
        tbody.appendChild(tr);
        return { p, tr };
      });
      renumber();
      return items;
    };
    // queue = array {p,tr}; sisa yang belum dicek (karena Stop) tetap di queue untuk dilanjutkan
    async function scanList(queue, label) {
      const worker = async () => {
        while (queue.length && !stopReq) {
          const { p, tr } = queue.shift();
          tr.children[C.last].textContent = 'Memuat...';
          try {
            const r = await cekProduk(p, gdn);
            tr.children[C.last].innerHTML = '<div></div><div></div>'; // jenis, tanggal di bawahnya
            tr.children[C.last].children[0].textContent = r.jenis;
            tr.children[C.last].children[1].textContent = r.tgl;
            tr.children[C.op].textContent = r.operator;
            tr.children[C.stok].textContent = r.stokAkhir;
            tr.children[C.ket].textContent = r.ket;
            // tombol Aktifitas -> popup Aktifitas Stok lengkap
            const lihat = document.createElement('button');
            lihat.type = 'button'; lihat.className = 'cg-lihat'; lihat.textContent = 'Aktifitas Stok';
            lihat.onclick = (e) => {
              e.stopPropagation();
              openAktifitas({ barcode: p.barcode, nama: p.nama, gudang: gNama, params: r.params });
            };
            tr.children[C.nama].querySelector('.cg-row').appendChild(lihat);
            tr.dataset.jenis = r.jenis;
            tr.dataset.iso = tglToIso(r.tgl);
            classify(tr);
          } catch (err) {
            tr.children[C.last].textContent = err.message;
            tr.children[C.last].className = 'cg-err';
          }
          done++;
          status.textContent = label();
          if (opFilter) applyOpFilter();
          setToggle(); renumber();
          if (done % 25 === 0) updateStats();
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      // produk yang belum sempat dicek karena Stop: disembunyikan dari tabel, disimpan untuk Lanjut
      if (stopReq) { queue.forEach(({ tr }) => tr.remove()); renumber(); }
    }

    const begin = () => {
      running = true; stopReq = false; done = 0; finishedWord = '';
      gdSel.disabled = true; setBtn('stop');
    };
    let lastTotal = 0;
    let finishedWord = '';
    const summary = () => {
      const shown = body.querySelectorAll('.cg-tbl tbody tr').length;
      const hidden = body.querySelectorAll('tr.cg-recent').length;
      status.textContent = finishedWord +
        `${done}/${lastTotal} produk dicek — ${hidden} disembunyikan (pemindahan ${periodText()}), ${shown - hidden} ditampilkan.`;
    };
    // ganti periode -> langsung diterapkan ke hasil yang sudah ada (tanpa scan ulang)
    const onPeriod = () => {
      body.querySelectorAll('.cg-tbl tbody tr').forEach(classify);
      setToggle(); updateStats(); applyOpFilter(); renumber();
      if (!running && finishedWord) summary();
    };
    rangeBtn.onclick = (e) => {
      e.stopPropagation();
      openRangePicker(rangeBtn, period, (from, to) => { period.from = from; period.to = to; showPeriod(); onPeriod(); });
    };
    const finish = (total) => {
      lastTotal = total;
      finishedWord = stopReq ? 'Dihentikan. ' : 'Selesai. ';
      summary();
      setToggle(); updateStats(); applyOpFilter(); renumber();
      running = false;
      gdSel.disabled = false;
    };

    async function run(st) {
      begin();
      done = st.done || 0; // lanjutkan hitungan dari scan sebelumnya
      status.textContent = 'Menyimpan filter Lihat Stok...';
      let snap = null;
      try { snap = await takeSnapshot(); } catch (e) { /* tetap lanjut */ }
      pendingSnap = snap;
      const label = (pg) => () => `Halaman ${pg}${st.totalPage ? '/' + st.totalPage : ''} — produk ${done}${st.totalProduk ? '/' + st.totalProduk : ''}...`;
      try {
        // sisa produk dari scan sebelumnya (Lanjut)
        if (st.pending.length) {
          st.pending.forEach((it) => st.tbody.appendChild(it.tr));
          renumber();
          await scanList(st.pending, label(st.page - 1));
        }
        while (!stopReq) {
          const page = st.page;
          if (st.totalPage && page > st.totalPage) { st.finished = true; break; }
          if (page > 1) {
            // jeda saat pindah halaman
            for (let s = PAGE_DELAY_MS / 1000; s > 0 && !stopReq; s--) {
              status.textContent = `Jeda ${s} detik sebelum halaman ${page}${st.totalPage ? '/' + st.totalPage : ''}...`;
              await sleep(1000);
            }
            if (stopReq) break;
          }
          status.textContent = `Mengambil halaman ${page}${st.totalPage ? '/' + st.totalPage : ''}...`;
          let root;
          try {
            root = await getPage(page, gdn);
          } catch (err) {
            status.textContent = `Gagal mengambil halaman ${page}: ${err.message}`;
            break;
          }
          if (!st.totalPage) {
            const inf = infoHalaman(root);
            if (inf) { st.totalProduk = inf.total; st.totalPage = Math.ceil(inf.total / inf.perPage); }
          }
          // buang produk yang sudah ada (jaga-jaga kalau halaman berulang)
          const list = produkDari(root).filter((p) => !st.seen.has(p.prd) && st.seen.add(p.prd));
          if (!list.length) { st.finished = true; break; }
          st.page = page + 1;
          st.pending = makeRows(list, st.tbody);
          await scanList(st.pending, label(page));
        }
        if (!stopReq && !st.finished) st.finished = true;
        if (!st.pending.length && st.totalPage && st.page > st.totalPage) st.finished = true;
      } finally {
        status.textContent = 'Mengembalikan filter Lihat Stok...';
        await restoreSnapshot(snap); // halaman Lihat Stok kembali seperti sebelum scan (page 1)
        pendingSnap = null;
      }
      st.done = done;
      finish(st.totalProduk || done);
      // dihentikan sebelum selesai -> tawarkan Lanjut
      resumeState = (stopReq && !st.finished) ? st : null;
      setBtn(resumeState ? 'resume' : 'scan');
    }

    scanAllBtn.onclick = () => {
      if (btnMode === 'stop') { stopReq = true; setBtn('stopping'); return; }
      if (running || !gdn) return;
      if (btnMode === 'resume' && resumeState) {
        const st = resumeState; resumeState = null;
        run(st);
        return;
      }
      store.set('cgGudangId', gdn);
      resumeState = null;
      run({ page: 1, pending: [], seen: new Set(), totalProduk: 0, totalPage: 0, tbody: startTable(), finished: false });
    };

    document.body.appendChild(ov);
  }

  // Tombol "Cek Pemindahan" dipasang tersembunyi (.cg-bulk) di halaman /produks dan diklik oleh menu Audit Stok (produks.js),
  // karena script ini jalan di MAIN world dan produks.js tidak.
  // Hanya dipasang untuk role yang punya fitur "cekPemindahan" (lihat AKSES_JSON di atas).
  let pengamat = null, jadwalInject = null;
  const mulaiAkses = Date.now();
  function injectBulk() {
    jadwalInject = null;
    if (!document.body) return;
    if (document.querySelector('.cg-bulk')) { if (pengamat) pengamat.disconnect(); return; }
    const akses = cekAkses('cekPemindahan');
    if (akses === null) {
      // nama kasir belum terbaca: coba lagi pada perubahan halaman berikutnya, menyerah setelah 60 detik
      if (Date.now() - mulaiAkses > 60000 && pengamat) pengamat.disconnect();
      return;
    }
    if (!akses) { if (pengamat) pengamat.disconnect(); return; }   // bukan role yang boleh: tombol tidak dipasang
    document.querySelectorAll('.cg-bulk').forEach((b) => b.remove());
    const b = document.createElement('div');
    b.className = 'btn btn-outline-primary cg-bulk';
    b.style.display = 'none';
    b.innerHTML = '<i class="fa fa-fw fa-exchange"></i> <span>Cek Pemindahan</span>';
    b.addEventListener('click', (e) => { e.preventDefault(); openPopup(); });
    document.body.appendChild(b);
    if (pengamat) pengamat.disconnect();   // sudah terpasang
  }

  injectBulk();
  // perubahan halaman digabung (tidak dijalankan di tiap mutasi) supaya pengecekan nama kasir tidak berulang-ulang
  pengamat = new MutationObserver(() => { if (!jadwalInject) jadwalInject = setTimeout(injectBulk, 250); });
  pengamat.observe(document.body, { childList: true, subtree: true });
})();
