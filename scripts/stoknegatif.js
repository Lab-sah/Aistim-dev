// ==UserScript==
// @name         ERZAP - Stok Negatif
// @namespace    partdistro.erzap.stoknegatif
// @version      1.2.6
// @description  Tombol "Stok Negatif" di halaman Daftar Data Produk ERZAP (dibuka dari menu Audit Stok di produks.js), khusus role pusat (pilih toko dulu): daftar stok toko < 0, solusi (Cek Gudang / Buat BA), form BA Stok In & Stok Out, dan analisa.
// @author       PartDistro Indonesia
// @match        https://*.erzap.com/produks*
// @run-at       document-idle
// @grant        none
// @world        main
// ==/UserScript==

(function () {
  'use strict';

  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user.
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua). Nama fitur: stokNegatif.
  // "role"    -> "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil, cukup sebagian nama),
  //              "fitur" = fitur private yang boleh dipakai role itu.
  // Daftar nama pusat sama dengan home.js dan cekpemindahan.js. Tombol ini dibuka dari menu Audit Stok di produks.js.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tombol tidak dipasang untuk siapa pun).
  const AKSES_JSON = `{
    "public": [],
    "private": ["stokNegatif"],
    "role": {
      "pusat": {
        "nama": ["SURYO", "SENTOT", "PUGUH", "DIMAS", "MANAJEMEN PUSAT"],
        "fitur": ["*"]
      }
    }
  }`;
  const rapihNama = (t) => (t || '').replace(/\s+/g, ' ').trim();
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
      console.error('[stoknegatif.js] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { public: [], role: [] };
    }
  }
  const AKSES = bacaAkses();
  // Cadangan bila #info_kasir tidak ada: elemen daun berpola "NAMA (JABATAN)", mis. "SENTOT ARI HANDOKO (STAF IT)"
  const RE_LABEL_USER = /^[A-Z][A-Z.' -]{2,60}\([^()]{2,40}\)$/;
  function namaUser() {
    const kasir = document.getElementById('info_kasir');
    if (kasir) return rapihNama(kasir.textContent).toLowerCase();
    for (const e of document.querySelectorAll('label, a, span, div, button')) {
      if (e.children.length) continue;
      const t = rapihNama(e.textContent);
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

  // Tunggu sampai jQuery & form pencarian ERZAP siap, lalu pasang tombol Stok Negatif
  // Tombol dipindah dari Home ke halaman /produks: cukup jQuery + body siap. Tombol #sm-bar disembunyikan dan
  // diklik oleh menu Audit Stok (produks.js), karena script ini jalan di MAIN world dan produks.js tidak.
  function siap() { return window.jQuery && document.body; }
  function mulai() {

  if (window.__smOff) window.__smOff();   // lepas listener dari pemasangan sebelumnya
  if (window.__smObs) window.__smObs.disconnect();
  document.getElementById('sm-bar')?.remove();
  document.getElementById('sm-overlay')?.remove();

  // ---------- Style ----------
  let st = document.getElementById('sm-style');
  if (!st) { st = document.createElement('style'); st.id = 'sm-style'; document.head.appendChild(st); }
  st.textContent = `
#sm-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;align-items:center;justify-content:center}
#sm-overlay.open{display:flex}
body.sm-open{overflow:hidden!important}
#sm-box{background:#fff;border-radius:6px;width:1100px;max-width:96vw;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.3)}
#sm-res{overflow-y:auto;overflow-x:auto;max-height:70vh;overscroll-behavior:contain;transform:translateZ(0);will-change:scroll-position}
#sm-res table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
#sm-res th,#sm-res td{padding:5px;border-right:1px solid #ddd;border-bottom:1px solid #ddd;position:static;white-space:nowrap}
#sm-res th{background:#eef1f5;position:sticky;top:0;z-index:5;text-align:left;border-top:1px solid #ddd}
#sm-res tr>:first-child{border-left:1px solid #ddd}
#sm-res td:nth-child(3){white-space:normal;word-break:break-word}
#sm-res td:nth-child(7){white-space:normal;min-width:140px;max-width:170px}
#sm-res .c{text-align:center}
#sm-res .n{text-align:center;font-weight:600}
#sm-res .neg{color:#d33}
#sm-res .pos{color:#0a7d2c}
#sm-res .sol-move{color:#0a7d2c;font-weight:600}
#sm-res .sol-crm{color:#c25e00;font-weight:600}
#sm-tabs{display:flex;gap:4px;border-bottom:2px solid #ddd;margin-bottom:10px}
#sm-tabs button{background:#f3f4f6;border:1px solid #ddd;border-bottom:0;border-radius:5px 5px 0 0;padding:7px 14px;cursor:pointer;font-weight:600;color:#555;margin-bottom:-2px}
#sm-tabs button.active{background:#fff;color:#1a73e8;border-color:#ddd;border-bottom:2px solid #fff}
#sm-tabs .cnt{display:inline-block;min-width:18px;padding:0 5px;margin-left:6px;border-radius:9px;background:#e5e7eb;color:#333;font-size:11px;line-height:18px;text-align:center}
#sm-tabs button.active .cnt{background:#1a73e8;color:#fff}
#sm-res tr.sm-hide{display:none}
#sm-prog{display:none;margin:-4px 0 10px;font-size:12px;color:#555}
#sm-prog.on{display:block}
#sm-prog .bar{height:6px;background:#eef1f5;border-radius:3px;overflow:hidden;margin-top:4px}
#sm-prog .bar>span{display:block;height:100%;width:0;background:#1a73e8;transition:width .15s}
#sm-box{height:85vh;height:85dvh;max-height:85dvh}
#sm-box>.sm-body{flex:1;min-height:0}
#sm-foot{flex:0 0 auto;display:flex;justify-content:flex-end;padding:8px 16px;border-top:1px solid #ddd;background:#fafafa;border-radius:0 0 6px 6px}
#sm-tutup{background:#757575;color:#fff;border:0;border-radius:3px;padding:4px 12px;font-size:12px;cursor:pointer}
#sm-tutup:hover{background:#5f5f5f}
#sm-res{flex:1;min-height:0;max-height:none}
#sm-res.ba-mode #sm-main,#sm-res:not(.ba-mode) #sm-ba-wrap,#sm-res.ba-mode #sm-empty{display:none!important}
#sm-ba-wrap.out #sm-ba,#sm-ba-wrap:not(.out) #sm-bo{display:none}
#sm-ba-sub{display:flex;gap:6px;margin-bottom:8px}
#sm-ba-sub button{border:1px solid #ccc;background:#fff;border-radius:14px;padding:4px 14px;cursor:pointer;font-weight:600;color:#555;font-size:12px}
#sm-ba-sub button.active{background:#1a73e8;border-color:#1a73e8;color:#fff}
#sm-ba-sub .cnt{display:inline-block;margin-left:6px;padding:0 6px;border-radius:8px;background:rgba(0,0,0,.08);font-size:11px}
#sm-ba-sub button.active .cnt{background:rgba(255,255,255,.25)}
.sm-addout{border:1px solid #1a73e8;background:#fff;color:#1a73e8;border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;font-weight:600}
.sm-addout:disabled{border-color:#ccc;color:#999;cursor:default;background:#f6f6f6}
.sm-del{border:0;background:none;color:#d33;font-size:16px;cursor:pointer;line-height:1}
#sm-ba-stats{margin-bottom:12px}
#sm-ba td:nth-child(7),#sm-bo td:nth-child(7){min-width:220px;max-width:none;width:28%}
#sm-bo td:nth-child(8){width:50px}
#sm-ba textarea.sm-ket,#sm-bo textarea.sm-ket{width:100%;min-width:0;box-sizing:border-box;padding:3px 5px;border:1px solid #ccc;border-radius:3px;font:12px/1.4 inherit;resize:none;overflow:hidden;display:block}
#sm-res.ba-mode{overflow:hidden;display:flex;flex-direction:column}
#sm-res.ba-mode #sm-ba-wrap{flex:1;min-height:0;display:flex;flex-direction:column}
#sm-ba-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:auto;overscroll-behavior:contain}
#sm-ba-stats .sm-card .v{font-size:20px}
#sm-ba td:nth-child(2),#sm-bo td:nth-child(2){white-space:nowrap!important;word-break:normal}
#sm-ba td:nth-child(3),#sm-bo td:nth-child(3){white-space:normal;word-break:break-word}
#sm-ba td:nth-child(3),#sm-bo td:nth-child(3){min-width:180px}
#sm-ba input,#sm-bo input{width:100%;box-sizing:border-box;padding:3px 5px;border:1px solid #ccc;border-radius:3px;font-size:12px}
#sm-ba input.num,#sm-bo input.num{width:70px;text-align:center}
#sm-res.ana-mode #sm-main,#sm-res.ana-mode #sm-ba-wrap,#sm-res.ana-mode #sm-empty{display:none!important}
#sm-res:not(.ana-mode) #sm-ana{display:none}
#sm-ana h4{margin:16px 0 8px;font-size:14px;color:#333}
#sm-ana h4:first-child{margin-top:0}
.sm-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.sm-card{border:1px solid #e3e6ea;border-radius:6px;padding:10px 12px;background:#fafbfc}
.sm-card .v{font-size:22px;font-weight:700;line-height:1.2}
.sm-card .l{font-size:12px;color:#666;margin-top:2px}
.sm-bar{height:8px;background:#eef1f5;border-radius:4px;overflow:hidden;min-width:80px}
.sm-bar>span{display:block;height:100%;background:#d33}
#sm-tabs button[data-tab=ana] .cnt{display:none}
.sm-panel{border:1px solid #e3e6ea;border-radius:8px;background:#fff;padding:12px 14px;margin-top:14px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.sm-panel h4{margin:0 0 10px!important}
#sm-dd-arrow:hover{background:#1557b0!important}
.sm-cekbtn{margin-left:6px;border:1px solid transparent;background:transparent;color:#555;border-radius:4px;padding:2px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle}
.sm-cekbtn:hover{background:#eef1f5;border-color:#d5d9df;color:#111}
#sm-main td .sm-cekbtn{float:right;margin-left:6px}
#sm-res:not(.cek-mode) .sm-cekbtn{display:none}
.sm-aktbtn{border:1px solid transparent;background:transparent;color:#555;border-radius:4px;padding:2px;margin-left:6px;cursor:pointer;vertical-align:middle;line-height:0}
.sm-aktbtn:hover{background:#eef1f5;border-color:#d5d9df;color:#111}
.sm-aktbtn:disabled{color:#ccc;cursor:default;background:transparent;border-color:transparent}
#sm-aksi{position:fixed;z-index:100003;background:#fff;border:1px solid #d5d9df;border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.18);padding:4px;display:flex;flex-direction:column;min-width:120px}
#sm-aksi button{display:flex;align-items:center;gap:8px;border:0;background:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:13px;color:#333;text-align:left}
#sm-aksi button:hover{background:#eef4ff;color:#1a73e8}
#sm-aksi button[data-a=cek] svg{color:#0a7d2c}
#sm-aksi button[data-a=pindah] svg{color:#1a73e8}
#sm-aksi button[data-a=toko] svg{color:#0a7d2c}
#sm-aksi button[data-a=gudang] svg{color:#c25e00}
#sm-aksi button[data-a=out] svg{color:#1a73e8}
#sm-aksi button.off{color:#999;cursor:default;background:none}
#sm-cari-res .sm-addout{display:none}
#sm-cari-res td:nth-child(7),#sm-cari-res th:nth-child(7){width:50px;min-width:0;max-width:60px}
#sm-cari-res .sm-aktbtn{margin-left:0}
#sm-akt-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100005;display:flex;align-items:center;justify-content:center}
#sm-akt-modal .sm-am-box{background:#fff;border-radius:8px;width:960px;max-width:95vw;height:86vh;display:flex;flex-direction:column;box-shadow:0 10px 34px rgba(0,0,0,.35)}
#sm-akt-modal .sm-am-head{padding:12px 16px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
#sm-akt-modal .sm-am-sub{font-size:12px;color:#666;margin-top:2px}
#sm-akt-modal .sm-am-x{cursor:pointer;font-size:22px;line-height:1}
#sm-akt-modal .sm-am-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:14px 16px;font-size:13px}
#sm-akt-modal .sm-am-foot{padding:10px 16px;border-top:1px solid #ddd;display:flex;justify-content:flex-end;gap:8px}
#sm-akt-modal .sm-am-foot button{border:1px solid #ccc;background:#fff;border-radius:4px;padding:6px 14px;cursor:pointer;font-weight:600}
#sm-akt-modal .sm-am-erzap{color:#1a73e8;border-color:#1a73e8!important}
#sm-akt-modal .sm-am-note{background:#fff8ec;border:1px solid #f3d9a8;border-radius:6px;padding:8px 12px;margin-bottom:12px}
#sm-akt-modal .sm-am-note p{margin:4px 0}
#sm-akt-modal .sm-am-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#sm-akt-modal .sm-am-grid .sm-panel{margin-top:14px}
#sm-akt-modal table{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px}
#sm-akt-modal th,#sm-akt-modal td{padding:4px 6px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
#sm-akt-modal th{background:#eef1f5;position:sticky;top:0}
#sm-akt-modal .c{text-align:center}#sm-akt-modal .n{text-align:center;font-weight:600}
#sm-akt-modal .neg{color:#d33}#sm-akt-modal .pos{color:#0a7d2c}
#sm-akt-modal .sm-am-scroll{max-height:300px;overflow-y:auto;overscroll-behavior:contain}
#sm-akt-modal .sm-am-box{width:min(960px,96vw);height:min(86vh,900px)}
#sm-akt-modal .sm-am-body{contain:content;-webkit-overflow-scrolling:touch}
#sm-akt-modal .sm-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
#sm-akt-modal .sm-cards .sm-card{min-width:0}
#sm-akt-modal .sm-am-grid>.sm-panel{min-width:0;overflow-x:auto}
#sm-akt-modal .sm-panel{overflow-x:auto}
#sm-akt-modal .sm-am-scroll{max-height:45vh;overflow:auto;will-change:scroll-position}
#sm-akt-modal th{white-space:nowrap;z-index:2}
#sm-akt-modal td:first-child{white-space:nowrap;width:78px}
#sm-akt-modal .sm-am-hist{min-width:800px}
#sm-akt-modal .sm-am-hist td:nth-child(4){width:1%;white-space:normal}
#sm-akt-modal .sm-am-hist td:nth-child(2){white-space:normal;word-break:break-all;width:calc(11.5ch + 12px);min-width:calc(11.5ch + 12px);max-width:calc(11.5ch + 12px)}
@media (max-width:820px){#sm-akt-modal .sm-am-grid{grid-template-columns:1fr}#sm-akt-modal .sm-am-head,#sm-akt-modal .sm-am-body,#sm-akt-modal .sm-am-foot{padding-left:10px;padding-right:10px}#sm-akt-modal .sm-am-box{height:94vh;width:98vw}}
.sm-toast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);background:#323232;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;z-index:100004;box-shadow:0 4px 12px rgba(0,0,0,.25)}
body.sm-open .ui-dialog{z-index:100002!important}
body.sm-open .ui-widget-overlay{z-index:100001!important}
#sm-cari-res .sm-scroll{max-height:320px;overflow-y:auto;overflow-x:auto;overscroll-behavior:contain;border-bottom:2px solid #8f98a3}
@media (max-width:900px){
#sm-box{width:98vw;max-width:98vw}
.sm-head{padding:8px 10px!important;flex-wrap:wrap;gap:6px}
.sm-body{padding:10px!important}
#sm-foot{padding:8px 10px}
#sm-toko{min-width:0!important;max-width:62vw}
#sm-tabs{overflow-x:auto}
#sm-tabs button{padding:6px 10px;white-space:nowrap;flex:0 0 auto}
#sm-res table{font-size:12px}
#sm-ba-sub{flex-wrap:wrap}
}`;

  // ---------- Helper ----------
  const tok = () => document.querySelector('meta[name=csrf-token]')?.content;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Parse HTML dari server tanpa menjalankan apa pun (innerHTML pada elemen terlepas tetap memuat gambar / onerror)
  const parseHtml = html => new DOMParser().parseFromString(html, 'text/html').body;

  // Ambil daftar produk lewat request terpisah (halaman di belakang popup tidak berubah).
  // Berdiri sendiri: TIDAK memakai isian panel pencarian kanan (nama, barcode, kategori, dll.).
  // Yang dipakai hanya outlet aktif + gudang TOKO, dengan Perkiraan Jumlah < 0.
  // Toko yang dipilih di popup (kosong sampai dipilih)
  let tokoId = '', tokoNama = '', tokoOtl = '';
  const berjalan = new Set();   // request lihat_stok yang sedang berjalan (mengubah filter di server)
  async function fetchList(op, val, extra) {
    const data = [
      { name: 'utf8', value: '✓' },
      { name: 'authenticity_token', value: tok() || '' },
      { name: 'pencarian[perbandingan_jumlah]', value: op },
      { name: 'pencarian[jumlah]', value: val },
      { name: 'pencarian[umur_produk_satuan_waktu]', value: 'day' },
      { name: 'pencarian[idoutlet_own]', value: '' },
      { name: 'pencarian[idgudang]', value: tokoId },
    ];
    if (extra) Object.entries(extra).forEach(([k, v]) => {
      const it = data.find(x => x.name === k);
      if (it) it.value = v; else data.push({ name: k, value: v });
    });
    const req = jQuery.ajax({
      url: '/produk_gudangs/lihat_stok/new',
      type: 'POST',
      data: jQuery.param(data),
      dataType: 'text',
      headers: { Accept: 'text/javascript, application/javascript, */*' },
    });
    berjalan.add(req);
    let js;
    try { js = await req; } finally { berjalan.delete(req); }
    // Respons berupa JS: $('#tab_index_produk').html("...") -> ambil HTML-nya saja, jangan dijalankan
    const m = js.match(/\$\(['"]#tab_index_produk['"]\)\.html\("((?:[^"\\]|\\.)*)"\)/);
    if (!m) throw new Error('format respons tidak dikenali');
    const html = JSON.parse('"' + m[1].replace(/\\'/g, "'") + '"');
    return parseHtml(html);
  }

  // Baca baris dari tabel ERZAP
  function readTable(doc) {
    const t = doc.querySelector('#data_table_produk');
    const hs = [...t.querySelectorAll('thead th')].map(h => h.textContent.trim());
    const ix = n => hs.findIndex(h => h.includes(n));
    const iB = ix('Barcode'), iN = ix('Nama'), iS = ix('Stok'), iK = ix('Kategori'), iM = ix('Merek');
    return [...t.tBodies[0].rows]
      .filter(r => r.cells[iS])
      .map(r => {
        const c = r.cells;
        return {
          b: c[iB].textContent.trim().split(/\s+/)[0],
          n: c[iN].textContent.trim().replace(/\s+/g, ' '),
          k: (iK >= 0 && c[iK] ? c[iK].textContent.trim() : '') || '(Tanpa kategori)',
          m: (iM >= 0 && c[iM] ? c[iM].textContent.trim() : '') || '-',
          id: r.querySelector('.produk')?.innerHTML.trim(),
          otl: r.querySelector('[data-otl]')?.dataset.otl,
        };
      })
      .filter(x => x.n);
  }

  // Ambil stok toko & gudang (sumber sama dengan popup Total Stok)
  async function detail(r) {
    try {
      const html = await jQuery.ajax({
        url: '/produk_gudangs/detail_stok/new',
        dataType: 'text',
        data: { authenticity_token: tok(), idproduk: r.id, idoutlet: tokoOtl || r.otl },
      });
      const d = parseHtml(html);
      // Outlet milik toko yang dipilih (ERZAP mengembalikan daftar semua outlet bila outlet tidak diisi)
      if (!tokoOtl && tokoNama) {
        const m = [...d.querySelectorAll('a.bt_detail_stok_aktifitas')].find(a => (a.dataset.gudangNama || '').trim().toUpperCase() === tokoNama.toUpperCase());
        if (m) tokoOtl = m.dataset.otl;
      }
      let toko = 0, gud = 0, ft = false;
      const akt = [];   // data link Aktifitas Stok per toko/gudang (untuk tombol Cek)
      d.querySelectorAll('a.bt_detail_stok_aktifitas').forEach(a => {
        if (tokoOtl && a.dataset.otl && a.dataset.otl !== tokoOtl) return;
        akt.push([...a.attributes].filter(x => x.name.startsWith('data-')).reduce((o, x) => (o[x.name] = x.value, o), {}));
        const v = parseFloat(a.textContent.replace(/,/g, '').trim());
        if (isNaN(v)) return;
        if (/GUDANG/i.test(a.dataset.gudangNama || '')) gud += v;
        else { toko += v; ft = true; }
      });
      return { toko: ft ? toko : NaN, gud, akt };
    } catch (e) { return null; }
  }

  // Isi 1 baris popup
  function fill(tr, d) {
    const c = tr.cells;
    if (!d) { c[3].textContent = c[4].textContent = c[5].textContent = c[6].textContent = '?'; return; }
    const { toko: tk, gud: gd } = d;
    c[3].textContent = isNaN(tk) ? '-' : tk; c[3].className = 'n' + (tk < 0 ? ' neg' : '');
    c[4].textContent = gd;                    c[4].className = 'n' + (gd < 0 ? ' neg' : '');
    const v = (isNaN(tk) ? 0 : tk) + gd;       // Total Min = stok toko + stok gudang
    c[5].textContent = Math.abs(v);            // tanpa tanda + / -
    c[5].className = 'n' + (v < 0 ? ' neg' : v > 0 ? ' pos' : '');
    let txt = '-', cls = '';
    if (tk < 0 && gd > 0) { txt = 'Cek Gudang'; cls = 'sol-move'; }
    else if (tk < 0 && gd <= 0) { txt = 'Buat BA di CRM'; cls = 'sol-crm'; }
    c[6].textContent = txt; c[6].className = cls;
    if (cls === 'sol-move') {
      // tombol Cek: buka popup Aktifitas Stok ERZAP untuk gudang outlet ini
      const g = (d.akt || []).find(x => /GUDANG/i.test(x['data-gudang-nama'] || '')) || (d.akt || [])[0];
      if (g) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'sm-cekbtn'; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:block"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
        btn.title = 'Aksi';
        btn.onclick = e => { e.stopPropagation(); toggleAksi(btn, g, tr._row); };
        c[6].appendChild(btn);
      }
    }
    tr.dataset.sol = cls === 'sol-move' ? 'cek' : cls === 'sol-crm' ? 'ba' : '';
    tr._d = { tk: isNaN(tk) ? 0 : tk, gd };
    if (tr.dataset.sol === 'ba') addBaRow(tr, isNaN(tk) ? 0 : tk);
  }

  // Buka popup Aktifitas Stok bawaan ERZAP (fungsi fetch_aktifitas_stok milik halaman)
  function openAktifitas(attrs) {
    if (typeof window.fetch_aktifitas_stok !== 'function') { alert('Fitur Aktifitas Stok ERZAP tidak ditemukan di halaman ini.'); return; }
    let h = document.getElementById('sm-akt-holder');
    if (!h) { h = document.createElement('div'); h.id = 'sm-akt-holder'; h.style.display = 'none'; document.body.appendChild(h); }
    h.innerHTML = '';
    const a = document.createElement('a');
    a.className = 'bt_detail_stok_aktifitas';
    Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v));
    h.appendChild(a);
    window.fetch_aktifitas_stok(a);
  }

  // Menu titik tiga: Cek (Aktifitas Stok) & Pindah (Kirim Barang gudang -> toko)
  const IC_CEK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  const IC_PINDAH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
  const IC_OUT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  const IC_DOTS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:block"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
  function tutupAksi() { document.getElementById('sm-aksi')?.remove(); }
  // menu kecil di bawah tombol titik tiga
  function menuAksi(btn, items) {
    const lama = document.getElementById('sm-aksi');
    if (lama && lama._btn === btn) { tutupAksi(); return; }
    tutupAksi();
    const m = document.createElement('div');
    m.id = 'sm-aksi'; m._btn = btn;
    m.innerHTML = items.map((it, k) => `<button type="button" data-a="${it.a}" data-k="${k}"${it.off ? ' class="off"' : ''}>${it.ic}<span>${it.label}</span></button>`).join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + 4) + 'px';
    m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px';
    m.querySelectorAll('button').forEach(b => b.onclick = () => { tutupAksi(); items[+b.dataset.k].fn(); });
  }
  function toggleAksi(btn, g, row) {
    const lama = document.getElementById('sm-aksi');
    if (lama && lama._btn === btn) { tutupAksi(); return; }
    tutupAksi();
    const m = document.createElement('div');
    m.id = 'sm-aksi'; m._btn = btn;
    m.innerHTML =
      `<button type="button" data-a="cek">${IC_CEK}<span>Cek</span></button>` +
      `<button type="button" data-a="pindah">${IC_PINDAH}<span>Pindah</span></button>`;
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + 4) + 'px';
    m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px';
    m.querySelector('[data-a=cek]').onclick = () => { tutupAksi(); openAktifitas(g); };
    m.querySelector('[data-a=pindah]').onclick = () => {
      tutupAksi();
      // salin barcode supaya tinggal ditempel di form Kirim Barang
      try { navigator.clipboard.writeText(row.b); } catch (e) {}
      window.open('/pemindahan_barangs/new', '_blank');
      toast('Form Kirim Barang dibuka di tab baru. Barcode ' + row.b + ' sudah disalin.');
    };
  }
  const onDocClick = e => { if (!e.target.closest('#sm-aksi,.sm-cekbtn,.sm-aktbtn')) tutupAksi(); };
  document.addEventListener('click', onDocClick);
  document.addEventListener('scroll', tutupAksi, true);
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'sm-toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  // ---------- Popup Analisa Aktifitas Stok (dipakai menu "Cek Toko") ----------
  const angka = s => { const x = parseFloat(String(s).replace(/\s+/g, '').replace(/,/g, '')); return isNaN(x) ? 0 : x; };
  const fmtN = v => (Math.round(v * 100) / 100).toLocaleString('id-ID');
  function tutupAnalisa() { document.getElementById('sm-akt-modal')?.remove(); }
  async function analisaAktifitas(a, row) {
    tutupAksi(); tutupAnalisa();
    const md = document.createElement('div');
    md.id = 'sm-akt-modal';
    md.innerHTML =
      '<div class="sm-am-box"><div class="sm-am-head"><div><b>Analisa Aktifitas Stok</b><div class="sm-am-sub"></div></div><span class="sm-am-x" title="Tutup">&times;</span></div>' +
      '<div class="sm-am-body"><p style="color:#666">Memuat aktifitas stok...</p></div>' +
      '<div class="sm-am-foot"><button type="button" class="sm-am-erzap">Buka Aktifitas ERZAP</button><button type="button" class="sm-am-tutup">Tutup</button></div></div>';
    document.body.appendChild(md);
    md.querySelector('.sm-am-sub').textContent = `${row.b} — ${row.n} · ${a['data-gudang-nama'] || ''}`;
    md.addEventListener('click', e => { if (e.target === md || e.target.closest('.sm-am-x,.sm-am-tutup')) tutupAnalisa(); });
    md.querySelector('.sm-am-erzap').onclick = () => { tutupAnalisa(); openAktifitas(a); };
    const body = md.querySelector('.sm-am-body');
    let html;
    try {
      html = await jQuery.ajax({
        url: '/produk_gudangs/aktifitas_stok/new', dataType: 'text',
        data: { authenticity_token: tok(), idproduk: a['data-prd'], idgudang: a['data-gdn'], idoutlet: a['data-otl'], idproduk_harga: a['data-prd-hrg'] || '', hide_stok_awal_stok_akhir: false },
      });
    } catch (e) { body.innerHTML = '<p style="color:#d33">Gagal memuat aktifitas stok.</p>'; return; }
    if (!document.body.contains(md)) return;
    const d = parseHtml(html.replace(/<script[\s\S]*?<\/script>/gi, ''));
    const sekarang = angka(((d.textContent.match(/Jumlah Total pada Gudang\s*=\s*(-?[\d.,]+)/) || [])[1]) || 0);
    const tb = d.querySelector('table');
    const rows = tb ? [...tb.rows].slice(1) : [];
    const it = rows.map(r => {
      const c = [...r.cells].map(x => x.textContent.trim().replace(/\s+/g, ' '));
      const m = (c[0] || '').match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
      return { tgl: m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)) : null, tglTxt: (c[0] || '').replace(/:\d{2}\s*\+\d{4}$/, ''), kode: c[1] || '', jenis: c[2] || '-', awal: angka(c[3]), jml: angka(c[4]), akhir: angka(c[5]), ket: c[6] || '', op: c[7] || '' };
    }).filter(x => x.tgl);
    if (!it.length) { body.innerHTML = '<p style="color:#666">Belum ada aktifitas stok untuk barang ini.</p>'; return; }
    // Urut dari lama ke baru. ERZAP menampilkan terbaru di atas, jadi untuk waktu yang sama baris yang lebih bawah dianggap lebih dulu.
    const asc = it.map((x, k) => [x, k]).sort((p, q) => (p[0].tgl - q[0].tgl) || (q[1] - p[1])).map(x => x[0]);
    const masuk = asc.filter(x => x.jml > 0), keluar = asc.filter(x => x.jml < 0);
    const uMasuk = masuk.reduce((s, x) => s + x.jml, 0), uKeluar = keluar.reduce((s, x) => s - x.jml, 0);
    // kapan terakhir berubah jadi negatif
    let mulaiNeg = null;
    asc.forEach(x => { if (x.awal >= 0 && x.akhir < 0) mulaiNeg = x; });
    // transaksi tidak nyambung (stok akhir != awal + jumlah, atau awal != akhir transaksi sebelumnya)
    const anomali = [];
    asc.forEach((x, k) => {
      if (Math.abs(x.awal + x.jml - x.akhir) > 0.001) anomali.push({ x, why: `Stok Awal ${fmtN(x.awal)} ${x.jml >= 0 ? '+' : '−'} ${fmtN(Math.abs(x.jml))} ≠ Stok Akhir ${fmtN(x.akhir)}` });
      else if (k > 0 && Math.abs(x.awal - asc[k - 1].akhir) > 0.001) anomali.push({ x, why: `Stok Awal ${fmtN(x.awal)} ≠ Stok Akhir transaksi sebelumnya ${fmtN(asc[k - 1].akhir)}` });
    });
    // per jenis
    const pj = {};
    asc.forEach(x => { const j = pj[x.jenis] = pj[x.jenis] || { n: 0, in: 0, out: 0 }; j.n++; if (x.jml > 0) j.in += x.jml; else j.out -= x.jml; });
    // pembeli & operator
    const top = (arr, key) => Object.entries(arr.reduce((o, x) => { const k = key(x); if (k) o[k] = (o[k] || 0) + Math.abs(x.jml); return o; }, {})).sort((p, q) => q[1] - p[1]).slice(0, 5);
    const pembeli = top(keluar, x => ((x.ket.match(/Penjualan ke (.+?) sebanyak/i) || [])[1] || '').trim());
    const operator = top(asc, x => x.op);
    const lastIn = [...masuk].pop(), lastOut = [...keluar].pop();
    const card = (v, l, col) => `<div class="sm-card"><div class="v" style="color:${col || '#333'}">${v}</div><div class="l">${l}</div></div>`;
    const kesimpulan = [];
    if (sekarang < 0) {
      if (mulaiNeg) kesimpulan.push(`Stok jadi <b>negatif</b> sejak <b>${esc(mulaiNeg.tglTxt)}</b> karena <b>${esc(mulaiNeg.jenis)}</b> ${esc(mulaiNeg.kode)} (${esc(mulaiNeg.ket)}) oleh ${esc(mulaiNeg.op)}. Sebelum transaksi itu stok tinggal <b>${fmtN(mulaiNeg.awal)}</b>.`);
      else kesimpulan.push('Stok sudah negatif sejak sebelum periode data yang tampil.');
      if (lastIn && mulaiNeg && lastIn.tgl < mulaiNeg.tgl) kesimpulan.push(`Barang masuk terakhir ${esc(lastIn.tglTxt)} (${esc(lastIn.jenis)} +${fmtN(lastIn.jml)}), setelah itu hanya ada pengurangan.`);
      if (!masuk.length) kesimpulan.push('Tidak ada barang masuk di periode data ini — kemungkinan terjual/dikirim padahal fisik tidak tercatat masuk, atau terjual memakai barcode ini padahal barangnya barcode lain.');
    } else kesimpulan.push(`Stok saat ini ${fmtN(sekarang)} (tidak negatif).`);
    if (anomali.length) kesimpulan.push(`Ada <b>${anomali.length}</b> transaksi yang angkanya tidak nyambung — perlu dicek.`);
    body.innerHTML =
      `<div class="sm-am-note">${kesimpulan.map(k => `<p>${k}</p>`).join('')}</div>` +
      '<div class="sm-cards">' +
        card(fmtN(sekarang), 'Stok saat ini', sekarang < 0 ? '#d33' : '#0a7d2c') +
        card('+' + fmtN(uMasuk), `Masuk (${masuk.length} transaksi)`, '#0a7d2c') +
        card('−' + fmtN(uKeluar), `Keluar (${keluar.length} transaksi)`, '#d33') +
        card(asc.length, `Transaksi (${esc(asc[0].tglTxt.slice(0, 10))} s/d ${esc(asc[asc.length - 1].tglTxt.slice(0, 10))})`) +
        card(anomali.length, 'Transaksi tidak nyambung', anomali.length ? '#c25e00' : '#0a7d2c') +
      '</div>' +
      '<div class="sm-am-grid">' +
        '<div class="sm-panel"><h4>Per Jenis Transaksi</h4><table><thead><tr><th>Jenis</th><th class="c">Transaksi</th><th class="c">Masuk</th><th class="c">Keluar</th></tr></thead><tbody>' +
          Object.entries(pj).sort((p, q) => (q[1].in + q[1].out) - (p[1].in + p[1].out)).map(([j, v]) => `<tr><td>${esc(j)}</td><td class="c">${v.n}</td><td class="n pos">${v.in ? '+' + fmtN(v.in) : '-'}</td><td class="n neg">${v.out ? '−' + fmtN(v.out) : '-'}</td></tr>`).join('') +
        '</tbody></table></div>' +
        '<div class="sm-panel"><h4>Pembeli Terbanyak</h4>' + (pembeli.length ? '<table><tbody>' + pembeli.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${fmtN(v)}</td></tr>`).join('') + '</tbody></table>' : '<p style="color:#888;margin:0">Tidak ada penjualan.</p>') +
        '<h4 style="margin-top:12px!important">Operator</h4><table><tbody>' + operator.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${fmtN(v)}</td></tr>`).join('') + '</tbody></table></div>' +
      '</div>' +
      (anomali.length ? '<div class="sm-panel"><h4>Transaksi Tidak Nyambung</h4><table><thead><tr><th>Tanggal</th><th>Kode</th><th>Jenis</th><th>Masalah</th></tr></thead><tbody>' +
        anomali.map(({ x, why }) => `<tr style="background:#fff8ec"><td style="line-height:1.35">${esc(x.tglTxt).replace(' ', '<br><span style="color:#888">')}</span></td><td>${esc(x.kode)}</td><td>${esc(x.jenis)}</td><td style="white-space:normal">${esc(why)}</td></tr>`).join('') + '</tbody></table></div>' : '') +
      '<div class="sm-panel"><h4>Riwayat (terbaru di atas)</h4><div class="sm-am-scroll"><table class="sm-am-hist"><thead><tr><th>Tanggal</th><th>Kode</th><th>Operator</th><th>Jenis</th><th class="c">Awal</th><th class="c">Jumlah</th><th class="c">Akhir</th><th>Keterangan</th></tr></thead><tbody>' +
        [...asc].reverse().map(x => `<tr${x === mulaiNeg ? ' style="background:#fff4f4"' : ''}><td style="line-height:1.35">${esc(x.tglTxt).replace(' ', '<br><span style="color:#888">')}</span></td><td>${esc(x.kode)}</td><td style="white-space:normal">${esc(x.op)}</td><td>${esc(x.jenis)}</td><td class="c">${fmtN(x.awal)}</td><td class="n ${x.jml < 0 ? 'neg' : 'pos'}">${x.jml > 0 ? '+' : ''}${fmtN(x.jml)}</td><td class="n${x.akhir < 0 ? ' neg' : ''}">${fmtN(x.akhir)}</td><td style="white-space:normal">${esc(x.ket)}</td></tr>`).join('') +
      '</tbody></table></div><p style="margin:6px 0 0;font-size:12px;color:#888">Baris merah muda = transaksi yang membuat stok jadi negatif. Data diambil dari halaman pertama Aktifitas Stok ERZAP (maks. 50 transaksi terakhir).</p></div>';
  }

  // ---------- Tab Buat BA Stok In: form BA ----------
  function addBaRow(tr, stokProgram) {
    const r = tr._row, tbody = document.querySelector('#sm-ba tbody');
    if (!tbody) return;
    const b = document.createElement('tr');
    b.dataset.i = tr.dataset.i;
    b.innerHTML =
      `<td class="c"></td><td>${esc(r.b)}</td><td>${esc(r.n)}</td>` +
      `<td class="n${stokProgram < 0 ? ' neg' : ''}">${stokProgram}</td>` +
      `<td class="c"><input class="num sm-real" type="number" value="0"></td>` +
      `<td class="n sm-sel"></td>` +
      `<td><textarea class="sm-ket" rows="1" placeholder="Keterangan"></textarea></td>`;
    b._prog = stokProgram;
    // urutkan sesuai urutan data
    const after = [...tbody.rows].find(x => +x.dataset.i > +b.dataset.i);
    tbody.insertBefore(b, after || null);
    b.querySelectorAll('input,textarea').forEach(inp => inp.addEventListener('input', () => calcBa(b)));
    autoGrow(b.querySelector('.sm-ket'));
    calcBa(b);
  }
  function calcBa(b) {
    const real = parseFloat(b.querySelector('.sm-real').value);
    const sel = isNaN(real) ? NaN : real - b._prog;          // Selisih = Stok Real - Stok Program
    const cs = b.querySelector('.sm-sel');
    cs.textContent = isNaN(sel) ? '' : sel;
    cs.className = 'n sm-sel' + (sel < 0 ? ' neg' : sel > 0 ? ' pos' : '');
    renderBaStats();
  }

  // Keterangan memanjang ke bawah mengikuti isi
  const fitKet = ta => { if (!ta.offsetParent) return; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };
  function autoGrow(ta) {
    if (!ta) return;
    ta.addEventListener('input', () => fitKet(ta));
    requestAnimationFrame(() => fitKet(ta));
  }

  // ---------- Buat BA: statistik ----------
  function renderBaStats() {
    const box = document.getElementById('sm-ba-stats');
    if (!box) return;
    const num = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
    const inRows = [...document.querySelectorAll('#sm-ba tbody tr')];
    const inSel = inRows.reduce((a, r) => a + num(r.querySelector('.sm-sel')?.textContent), 0);
    const inKet = inRows.filter(r => !(r.querySelector('.sm-ket')?.value || '').trim()).length;
    const outSel = boList.reduce((a, x) => a + (x.real === '' ? 0 : x.real - x.prog), 0);
    const outKet = boList.filter(x => !String(x.ket || '').trim()).length;
    const card = (v, l, col) => `<div class="sm-card"><div class="v" style="color:${col || '#333'}">${v}</div><div class="l">${l}</div></div>`;
    const sg = v => (v > 0 ? '+' : '') + v;
    box.innerHTML = '<div class="sm-cards">' +
      card(inRows.length, 'Produk Stok In', '#c25e00') +
      card(sg(inSel), 'Total selisih Stok In (unit)', inSel > 0 ? '#0a7d2c' : inSel < 0 ? '#d33' : '#333') +
      card(boList.length, 'Produk Stok Out', '#1a73e8') +
      card(sg(outSel), 'Total selisih Stok Out (unit)', outSel > 0 ? '#0a7d2c' : outSel < 0 ? '#d33' : '#333') +
      card(sg(inSel + outSel), 'Selisih bersih (unit)', (inSel + outSel) > 0 ? '#0a7d2c' : (inSel + outSel) < 0 ? '#d33' : '#333') +
      card(inKet + outKet, 'Keterangan belum diisi', (inKet + outKet) ? '#c25e00' : '#0a7d2c') +
    '</div>';
  }

  // ---------- Buat BA > Stok Out (diisi dari Analisa > Cari Nama Barang yang Sama) ----------
  // tetap tersimpan walau script dijalankan ulang (selama halaman tidak di-refresh); dikosongkan saat popup dibuka atau toko diganti
  const boList = window.__smBoList || (window.__smBoList = []);
  let baSub = 'in';
  function renderBo() {
    const tb = document.querySelector('#sm-bo tbody');
    if (!tb) return;
    if (!boList.length) {
      tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;padding:14px;white-space:normal">Belum ada. Tambahkan dari tab <b>Analisa</b> → <b>Cari Nama Barang yang Sama</b> (menu <b>⋮ → Stok Out</b>).</td></tr>';
    } else {
      tb.innerHTML = boList.map((x, k) =>
        `<tr data-b="${esc(x.b)}"><td class="c">${k + 1}</td><td>${esc(x.b)}</td><td>${esc(x.n)}</td>` +
        `<td class="n${x.prog < 0 ? ' neg' : ''}">${x.prog}</td>` +
        `<td class="c"><input class="num sm-real" type="number" value="${x.real}"></td>` +
        `<td class="n sm-sel"></td>` +
        `<td><textarea class="sm-ket" rows="1" placeholder="Keterangan">${esc(x.ket)}</textarea></td>` +
        `<td class="c"><button type="button" class="sm-del" title="Hapus">&times;</button></td></tr>`).join('');
      [...tb.rows].forEach((tr, k) => {
        const x = boList[k];
        const calc = () => {
          const real = parseFloat(tr.querySelector('.sm-real').value);
          x.real = isNaN(real) ? '' : real; x.ket = tr.querySelector('.sm-ket').value;
          const sel = isNaN(real) ? NaN : real - x.prog;   // Selisih = Stok Real - Stok Program
          const cs = tr.querySelector('.sm-sel');
          cs.textContent = isNaN(sel) ? '' : sel;
          cs.className = 'n sm-sel' + (sel < 0 ? ' neg' : sel > 0 ? ' pos' : '');
        };
        tr.querySelectorAll('input,textarea').forEach(i => i.addEventListener('input', () => { calc(); renderBaStats(); }));
        autoGrow(tr.querySelector('.sm-ket'));
        tr.querySelector('.sm-del').onclick = () => { boList.splice(k, 1); renderBo(); syncAddButtons(); applyTab(); };
        calc();
      });
    }
  }
  function addBo(item) {
    if (boList.some(x => x.b === item.b)) return;
    // Stok Real = stok toko barang ini dikurangi jumlah stok minus (baris merah muda) di hasil pencarian
    const real = Math.max(0, item.tk - (item.min || 0));
    boList.push({ b: item.b, n: item.n, prog: item.tk, real, ket: item.ket || '', covers: item.covers || [] });
    renderBo(); syncAddButtons(); applyTab();
    toast('Ditambahkan ke Buat BA → Stok Out: ' + item.n);
  }
  function syncAddButtons() {
    document.querySelectorAll('#sm-cari-res .sm-addout').forEach(btn => {
      const ada = boList.some(x => x.b === btn.dataset.b);
      if (btn.dataset.ready !== '1') return;
      btn.disabled = ada;
      btn.textContent = ada ? '✓ Stok Out' : '+ Stok Out';
    });
  }

  // ---------- Tab Analisa ----------
  function renderAna() {
    const box = document.getElementById('sm-ana');
    if (!box) return;
    const trs = [...document.querySelectorAll('#sm-main tbody tr')];
    const done = trs.filter(tr => tr._d);
    if (!trs.length) { box.innerHTML = '<p style="color:#090">Tidak ada produk dengan stok minus.</p>'; return; }
    const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
    const minus = tr => Math.max(0, -tr._d.tk);                       // unit minus di toko
    const tutup = tr => Math.min(minus(tr), Math.max(0, tr._d.gd));    // bisa ditutup dari gudang
    const cek = done.filter(tr => tr.dataset.sol === 'cek'), ba = done.filter(tr => tr.dataset.sol === 'ba');
    const uMinus = sum(done, minus), uTutup = sum(done, tutup), uSisa = uMinus - uTutup;
    const card = (v, l, col) => `<div class="sm-card"><div class="v" style="color:${col || '#333'}">${v}</div><div class="l">${l}</div></div>`;
    const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
    // per kategori
    const g = {};
    done.forEach(tr => {
      const k = tr._row.k;
      g[k] = g[k] || { n: 0, u: 0, cek: 0, ba: 0 };
      g[k].n++; g[k].u += minus(tr);
      if (tr.dataset.sol === 'cek') g[k].cek++; else if (tr.dataset.sol === 'ba') g[k].ba++;
    });
    const kat = Object.entries(g).sort((a, b) => b[1].u - a[1].u || b[1].n - a[1].n);
    const maxU = Math.max(1, ...kat.map(([, v]) => v.u));
    const sumBox = document.getElementById('sm-ana-sum');
    sumBox.innerHTML =
      (done.length < trs.length ? `<p style="color:#666;margin:0 0 8px">Memuat stok ${done.length}/${trs.length}...</p>` : '') +
      '<h4>Ringkasan</h4><div class="sm-cards">' +
        card(done.length, 'Produk stok minus') +
        card(cek.length, 'Lakukan Cek (' + pct(cek.length, done.length) + ')', '#0a7d2c') +
        card(ba.length, 'Buat BA Stok In (' + pct(ba.length, done.length) + ')', '#c25e00') +
        card(uMinus, 'Total unit minus di toko', '#d33') +
        card(uTutup, 'Unit bisa ditutup dari gudang', '#0a7d2c') +
        card(uSisa, 'Sisa unit perlu BA', '#c25e00') +
      '</div>' +
      '<div class="sm-panel"><h4>Per Kategori</h4><table><thead><tr><th>Kategori</th><th class="c">Produk</th><th class="c">Unit Negatif</th><th></th><th class="c">Perlu Dicek</th><th class="c">Buat BA</th></tr></thead><tbody>' +
        kat.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="c">${v.n}</td><td class="n neg">${v.u}</td><td style="width:30%"><div class="sm-bar"><span style="width:${v.u / maxU * 100}%"></span></div></td><td class="n pos">${v.cek}</td><td class="n" style="color:#c25e00">${v.ba}</td></tr>`).join('') +
      '</tbody></table></div>';
  }

  // Analisa: cari barang dengan nama yang sama (pilih dari dropdown)
  function buildCari(rows) {
    const box = document.getElementById('sm-ana-cari');
    if (!box) return;
    const names = [...new Set(rows.map(r => r.n))].sort((a, b) => a.localeCompare(b));
    // Dropdown buatan sendiri (bukan <select>) supaya pasti bisa dipilih & bisa diketik untuk mencari
    box.className = 'sm-panel';
    box.innerHTML =
      '<h4>Cari Nama Barang yang Sama</h4>' +
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<div id="sm-dd" style="position:relative;flex:0 1 450px;min-width:260px">' +
        '<textarea id="sm-dd-in" rows="1" autocomplete="off" spellcheck="false" placeholder="Klik / ketik untuk nama barang yang negatif" ' +
          'style="width:100%;box-sizing:border-box;padding:6px 32px 6px 8px;border:1px solid #ccc;border-radius:4px;font:13px/18px inherit;resize:none;overflow:hidden;display:block"></textarea>' +
        '<span id="sm-dd-arrow" title="Tampilkan semua nama barang" style="position:absolute;right:4px;top:4px;height:22px;width:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;font-weight:700;font-size:12px;border-radius:3px;background:#1a73e8">▾</span>' +
        '<div id="sm-dd-list" style="display:none;position:absolute;left:0;right:0;top:100%;margin-top:2px;max-height:271px;overflow-y:auto;background:#fff;border:1px solid #ccc;border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.15);z-index:20"></div>' +
      '</div>' +
      '<span id="sm-cari-info" style="color:#555;font-size:13px"></span>' +
      '</div>' +
      '<div id="sm-cari-res" style="margin-top:10px"></div>';
    const inp = box.querySelector('#sm-dd-in'), list = box.querySelector('#sm-dd-list');
    // kolom nama memanjang ke bawah kalau teksnya panjang
    const grow = () => { if (!inp.offsetParent) return; inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 2 + 'px'; };
    const setVal = v => { inp.value = v; grow(); };
    const show = (all) => {
      const q = all === true ? '' : inp.value.trim().toUpperCase();
      // nama barang minus yang sudah punya pengganti (Stok Out) tidak ditampilkan lagi
      const sudah = new Set(boList.flatMap(x => x.covers || []));
      const f = names.filter(n => !sudah.has(n) && (!q || n.toUpperCase().includes(q)));
      list.innerHTML = f.length
        ? f.map(n => `<div class="sm-dd-it" data-v="${esc(n).replace(/"/g, '&quot;')}" style="padding:4px 8px;line-height:18px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(n).replace(/"/g, '&quot;')}">${esc(n)}</div>`).join('')
        : '<div style="padding:6px 8px;color:#888;font-size:13px">Tidak ada yang cocok</div>';
      list.style.display = 'block';
      // tampil 10 nama; kalau ruang di bawah tidak cukup, buka ke atas
      const res = document.getElementById('sm-res');
      const rb = res.getBoundingClientRect(), ib = inp.getBoundingClientRect();
      const below = rb.bottom - ib.bottom, above = ib.top - rb.top;
      if (below < 275 && above > below) { list.style.top = 'auto'; list.style.bottom = '100%'; list.style.marginBottom = '2px'; }
      else { list.style.top = '100%'; list.style.bottom = 'auto'; list.style.marginBottom = '0'; }
    };
    let tmr;
    const pick = v => { clearTimeout(tmr); setVal(v); list.style.display = 'none'; cariNama(v, rows); };
    inp.addEventListener('focus', () => show());
    inp.addEventListener('click', () => show());
    // Panah ▾: selalu tampilkan semua nama barang, walau kolom sudah terisi
    box.querySelector('#sm-dd-arrow').addEventListener('mousedown', e => {
      e.preventDefault();
      if (list.style.display === 'block' && list.dataset.all === '1') { list.style.display = 'none'; return; }
      inp.focus(); show(true); list.dataset.all = '1';
    });
    // Ketik bebas: otomatis cari setelah berhenti mengetik (min. 3 huruf), mis. "CASE FROSTED VIVO"
    inp.addEventListener('input', () => {
      if (/\n/.test(inp.value)) inp.value = inp.value.replace(/\s*\n\s*/g, ' ');   // tanpa baris baru (mis. hasil paste)
      grow();
      show(); list.dataset.all = '';
      clearTimeout(tmr);
      const q = inp.value.trim();
      tmr = setTimeout(() => { if (q.length >= 3 || !q) cariNama(q, rows); }, 600);
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(tmr); list.style.display = 'none'; cariNama(inp.value.trim(), rows); }
      if (e.key === 'Escape') list.style.display = 'none';
    });
    list.addEventListener('mousedown', e => {
      e.preventDefault();   // jangan sampai input kehilangan fokus sebelum item terpilih
      const it = e.target.closest('.sm-dd-it'); if (it) pick(it.dataset.v);
    });
    list.addEventListener('mouseover', e => {
      list.querySelectorAll('.sm-dd-it').forEach(x => x.style.background = '');
      const it = e.target.closest('.sm-dd-it'); if (it) it.style.background = '#eef4ff';
    });
    inp.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; }, 150));
  }
  // Tinggi daftar hasil disesuaikan supaya yang scroll hanya tabel di dalam card (popup tidak ikut scroll)
  function fitCari() {
    const res = document.getElementById('sm-res'), sc = document.querySelector('#sm-cari-res .sm-scroll');
    if (!res || !sc) return;
    sc.style.maxHeight = 'none';
    const over = res.scrollHeight - res.clientHeight;
    sc.style.maxHeight = Math.max(160, sc.clientHeight - over - 2) + 'px';
  }
  window.addEventListener('resize', fitCari);
  let cariSeq = 0;
  async function cariNama(nama, rows) {
    const out = document.getElementById('sm-cari-res'), info = document.getElementById('sm-cari-info');
    if (!nama) { out.innerHTML = ''; info.textContent = ''; return; }
    const seq = ++cariSeq;
    out.innerHTML = ''; info.textContent = 'Mencari...';
    let list, terpotong = '';
    try {
      // gudang toko terpilih, tanpa filter Perkiraan Jumlah, nama = pilihan dropdown
      // ERZAP menganggap % dan _ sebagai wildcard (mis. "tc 100%" ikut memunculkan "SWITCH ... 8100").
      // Jadi: kirim bagian teks tanpa % / _ ke server, lalu saring di sini harus mengandung teks persis yang diketik.
      const srv = nama.split(/[%_]/).map(x => x.trim()).sort((a, b) => b.length - a.length)[0] || nama;
      const doc = await fetchList('', '', { 'pencarian[nama]': srv });
      const lit = nama.toUpperCase().replace(/\s+/g, ' ');
      const semua = readTable(doc);
      const total = +((doc.textContent.match(/Total data\s*=\s*(\d+)/) || [])[1] || 0);
      // hanya halaman pertama yang dibaca; beri tahu kalau ada data lain yang tidak ikut
      if (total > semua.length) terpotong = ` — baru ${semua.length} dari ${total} data yang dibaca, persempit nama barangnya`;
      list = semua.filter(r => r.n.toUpperCase().includes(lit));
    } catch (e) { if (seq === cariSeq) info.textContent = 'Gagal mencari.'; return; }
    if (seq !== cariSeq) return;
    if (!list.length) { info.textContent = 'Tidak ditemukan.'; return; }
    info.innerHTML = `${list.length} barang dengan nama mengandung "<b>${esc(nama)}</b>"` + (terpotong ? `<span style="color:#c25e00">${esc(terpotong)}</span>` : '');
    const minusB = new Set(rows.map(r => r.b));
    // barcode yang stok tokonya minus (baris merah muda) ditaruh paling atas
    list.sort((a, b) => (minusB.has(a.b) ? 0 : 1) - (minusB.has(b.b) ? 0 : 1));
    out.innerHTML =
      '<div class="sm-scroll"><table><thead><tr><th class="c">No</th><th>Barcode</th><th>Nama</th><th class="c">Stok Toko</th><th class="c">Stok Gudang</th><th class="c">Total</th><th class="c">Aksi</th></tr></thead><tbody>' +
      list.map((r, i) => `<tr${minusB.has(r.b) ? ' style="background:#fff4f4"' : ''}><td class="c">${i + 1}</td><td>${esc(r.b)}</td><td style="white-space:normal">${esc(r.n)}</td><td class="n">…</td><td class="n">…</td><td class="n">…</td><td class="c" style="white-space:nowrap"><button type="button" class="sm-addout" data-b="${esc(r.b)}" disabled>+ Stok Out</button><button type="button" class="sm-aktbtn" title="Cek Aktifitas Stok" disabled>${IC_DOTS}</button></td></tr>`).join('') +
      '</tbody></table></div>' +
      '<p style="margin:6px 0 0;font-size:12px;color:#888">Baris merah muda = barcode yang stok tokonya minus.</p>';
    fitCari();
    const trs = out.querySelectorAll('tbody tr');
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        const k = i++, d = await detail(list[k]);
        if (seq !== cariSeq) return;
        const c = trs[k].cells;
        if (!d) { c[3].textContent = c[4].textContent = c[5].textContent = '?'; continue; }
        const tk = isNaN(d.toko) ? 0 : d.toko, t = tk + d.gud;
        [[3, tk], [4, d.gud], [5, t]].forEach(([j, v]) => { c[j].textContent = v; c[j].className = 'n' + (v < 0 ? ' neg' : v > 0 ? ' pos' : ''); });
        // titik tiga: Cek Toko / Cek Gudang (popup Aktifitas Stok)
        const ab = c[6].querySelector('.sm-aktbtn');
        const tA = (d.akt || []).find(x => !/GUDANG/i.test(x['data-gudang-nama'] || ''));
        const gA = (d.akt || []).find(x => /GUDANG/i.test(x['data-gudang-nama'] || ''));
        if (tA || gA || tk > 0) {
          ab.disabled = false; ab.title = 'Aksi';
          ab.onclick = e => {
            e.stopPropagation();
            const sudah = boList.some(x => x.b === list[k].b);
            menuAksi(ab, [
              tA && { a: 'toko', ic: IC_CEK, label: 'Cek Toko', fn: () => analisaAktifitas(tA, list[k]) },
              gA && { a: 'gudang', ic: IC_CEK, label: 'Cek Gudang', fn: () => analisaAktifitas(gA, list[k]) },
              // Stok Out ikut di menu titik tiga (hanya untuk stok toko > 0)
              tk > 0 && (sudah
                ? { a: 'out', ic: IC_OUT, label: '✓ Sudah di Stok Out', off: true, fn: () => {} }
                : { a: 'out', ic: IC_OUT, label: 'Stok Out', fn: () => btn.onclick && btn.onclick() }),
            ].filter(Boolean));
          };
        }
        else ab.style.visibility = 'hidden';
        // tombol + Stok Out: hanya untuk barang yang stok tokonya lebih dari 0
        const btn = c[6].querySelector('.sm-addout');
        if (tk > 0) {
          btn.dataset.ready = '1';
          btn.onclick = () => {
            // barang merah muda (stok toko < 0) di hasil pencarian ini
            const minRows = [...out.querySelectorAll('tbody tr')].filter(tr => tr.style.display !== 'none' && parseFloat(tr.cells[3].textContent) < 0);
            const min = minRows.reduce((a, tr) => a - parseFloat(tr.cells[3].textContent), 0);
            // keterangan Stok Out = barang minus yang ditutup
            const ket = minRows.length ? 'Pengganti stok minus: ' + minRows.map(tr => `${tr.cells[1].textContent} ${tr.cells[2].textContent} (${tr.cells[3].textContent})`).join('; ') : '';
            addBo({ b: list[k].b, n: list[k].n, tk, min, ket, covers: minRows.map(tr => tr.cells[2].textContent) });
            // barang minus yang sudah ditangani disembunyikan dari hasil pencarian
            minRows.forEach(tr => { tr.style.display = 'none'; tr.dataset.done = '1'; });
            renum();
          };
        }
        else btn.style.visibility = 'hidden';
        if (tk === 0) trs[k].style.display = 'none';   // stok toko 0 tidak ditampilkan
        if (tk < 0 && !minusB.has(list[k].b)) { trs[k].style.background = '#fff4f4'; trs[k].dataset.minus = '1'; }
        renum(); syncAddButtons();
      }
    };
    // nomor urut & jumlah hanya untuk baris yang tampil
    const renum = () => {
      // urutkan Stok Toko dari kecil ke besar (minus otomatis di atas); yang belum termuat di bawah
      const tb = out.querySelector('tbody');
      if (tb) {
        const val = (tr, k) => { const v = parseFloat(tr.cells[3].textContent); return isNaN(v) ? (minusB.has(list[k].b) ? -Infinity : Infinity) : v; };
        const order = [...trs].map((tr, k) => [tr, k, val(tr, k)]).sort((x, y) => (x[2] - y[2]) || x[1] - y[1]).map(x => x[0]);
        const cur = [...tb.rows];
        if (order.some((r, k) => r !== cur[k])) order.forEach(r => tb.appendChild(r));
      }
      let n = 0;
      [...(tb ? tb.rows : trs)].forEach(tr => { if (tr.style.display !== 'none') tr.cells[0].textContent = ++n; });
      info.innerHTML = `${n} barang dengan nama mengandung "<b>${esc(nama)}</b>"` + (terpotong ? `<span style="color:#c25e00">${esc(terpotong)}</span>` : '');
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    syncAddButtons();
    if (seq === cariSeq && ![...trs].some(tr => tr.style.display !== 'none')) {
      out.innerHTML = '';
      info.innerHTML = `Tidak ada barang "<b>${esc(nama)}</b>" dengan stok toko selain 0.`;
    }
    fitCari();
  }

  // ---------- Tab: Data / Lakukan Cek / Buat BA Stok In / Analisa ----------
  let curTab = 'all';
  function applyTab() {
    // Urutkan: produk "Cek Gudang" di atas, sisanya tetap sesuai urutan asal
    const tb = document.querySelector('#sm-main tbody');
    if (tb) {
      const cur = [...tb.rows];
      const sorted = [...cur].sort((a, b) => ((a.dataset.sol === 'cek' ? 0 : 1) - (b.dataset.sol === 'cek' ? 0 : 1)) || (a.dataset.i - b.dataset.i));
      if (sorted.some((r, k) => r !== cur[k])) sorted.forEach(r => tb.appendChild(r));
    }
    const trs = [...document.querySelectorAll('#sm-main tbody tr')];
    let n = 0;
    trs.forEach(tr => {
      const show = curTab === 'all' || tr.dataset.sol === curTab;
      tr.classList.toggle('sm-hide', !show);
      if (show) tr.cells[0].textContent = ++n;   // nomor urut per tab
    });
    const cnt = k => trs.filter(tr => k === 'all' || tr.dataset.sol === k).length;
    document.querySelectorAll('#sm-tabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === curTab);
      b.querySelector('.cnt').textContent = b.dataset.tab === 'ba' ? cnt('ba') + boList.length : cnt(b.dataset.tab);
    });
    // sub-tab Buat BA: Stok In / Stok Out
    const wrap = document.getElementById('sm-ba-wrap');
    if (wrap) {
      wrap.classList.toggle('out', baSub === 'out');
      wrap.querySelectorAll('#sm-ba-sub button').forEach(b => {
        b.classList.toggle('active', b.dataset.sub === baSub);
        b.querySelector('.cnt').textContent = b.dataset.sub === 'out' ? boList.length : cnt('ba');
      });
    }
    if (curTab === 'ba') { renderBaStats(); requestAnimationFrame(() => document.querySelectorAll('#sm-ba-wrap textarea.sm-ket').forEach(fitKet)); }
    const res = document.getElementById('sm-res');
    if (res) { res.classList.toggle('ba-mode', curTab === 'ba'); res.classList.toggle('ana-mode', curTab === 'ana'); res.classList.toggle('cek-mode', curTab === 'cek'); }
    if (curTab === 'ana') renderAna();
    document.querySelectorAll('#sm-ba tbody tr').forEach((b, k) => b.cells[0].textContent = k + 1);
    const empty = document.getElementById('sm-empty');
    if (empty) empty.style.display = trs.length && !n ? 'block' : 'none';
  }

  // Ambil data sesuai filter popup, lalu tampilkan (halaman di belakang tidak diubah)
  // Progress muat data toko (di atas hasil, tampil di semua tab). teks kosong = sembunyikan
  function setProg(teks, done, total) {
    const p = document.getElementById('sm-prog');
    if (!p) return;
    if (!teks) { p.classList.remove('on'); return; }
    p.classList.add('on');
    p.querySelector('.t').textContent = teks;
    p.querySelector('.bar > span').style.width = total ? Math.round(done / total * 100) + '%' : '0%';
  }
  let running = false;
  async function runScan() {
    if (running) return;
    running = true;
    const res = document.getElementById('sm-res');
    try {
      if (!tokoId) { res.innerHTML = '<p style="color:#666">Pilih toko dulu di kanan atas untuk melihat stok negatif.</p>'; applyTab(); return; }
      setProg('Memuat daftar stok minus ' + tokoNama + '...', 0, 0);
      res.innerHTML = '<p style="color:#666">Memuat data...</p>';
      const op = '<', val = '0';   // Stok Min: selalu Perkiraan Jumlah < 0
      let doc;
      try { doc = await fetchList(op, val); }
      catch (e) { res.innerHTML = '<p style="color:#d33">Gagal memuat data. Coba tutup lalu buka lagi popup-nya.</p>'; applyTab(); return; }
      const rows = readTable(doc);
      const total = +((doc.textContent.match(/Total data\s*=\s*(\d+)/) || [])[1] || 0);
      if (!rows.length) { res.innerHTML = '<p style="color:#090">Tidak ada produk dengan stok minus.</p>'; applyTab(); return; }
      res.innerHTML =
        '<table id="sm-main"><thead><tr><th class="c">No</th><th>Barcode</th><th>Nama</th><th class="c">Stok Toko</th><th class="c">Stok Gudang</th><th class="c">Total Min</th><th>Solusi</th></tr></thead><tbody>' +
        rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.b)}</td><td>${esc(r.n)}</td><td class="n">…</td><td class="n">…</td><td class="n">…</td><td>…</td></tr>`).join('') +
        '</tbody></table>' +
        '<div id="sm-ba-wrap">' +
          '<div id="sm-ba-stats"></div>' +
          '<div id="sm-ba-sub"><button type="button" data-sub="in">Stok In<span class="cnt">0</span></button><button type="button" data-sub="out">Stok Out<span class="cnt">0</span></button></div>' +
          '<div id="sm-ba-scroll">' +
          '<table id="sm-ba"><thead><tr><th class="c">No</th><th>Kode SKU</th><th>Nama Barang *</th><th class="c">Stok Program</th><th class="c">Stok Real</th><th class="c">Selisih</th><th>Keterangan</th></tr></thead><tbody></tbody></table>' +
          '<table id="sm-bo"><thead><tr><th class="c">No</th><th>Kode SKU</th><th>Nama Barang *</th><th class="c">Stok Program</th><th class="c">Stok Real</th><th class="c">Selisih</th><th>Keterangan</th><th class="c">Hapus</th></tr></thead><tbody></tbody></table>' +
          '</div>' +
        '</div>' +
        '<div id="sm-ana"><div id="sm-ana-sum"></div><div id="sm-ana-cari"></div></div>';
      const trs = res.querySelectorAll('#sm-main tbody tr');
      trs.forEach((tr, k) => { tr.dataset.i = k; tr._row = rows[k]; });
      buildCari(rows);
      res.querySelectorAll('#sm-ba-sub button').forEach(b => b.onclick = () => { baSub = b.dataset.sub; applyTab(); });
      renderBo();
      let i = 0;
      res.insertAdjacentHTML('beforeend', '<p id="sm-empty" style="display:none;color:#090;margin:10px 0">Tidak ada data di tab ini.</p>');
      if (total > rows.length) res.insertAdjacentHTML('afterbegin', `<p style="color:#c25e00;margin:0 0 8px">Menampilkan ${rows.length} dari total ${total} produk.</p>`);
      applyTab();
      // progress: berhenti kalau toko diganti saat masih memuat (rerun), supaya angka tidak campur dengan toko baru
      let done = 0;
      const prog = () => setProg('Memuat stok ' + tokoNama + ': ' + done + ' / ' + rows.length + ' produk', done, rows.length);
      prog();
      const worker = async () => { while (i < rows.length && !rerun) { const k = i++; fill(trs[k], await detail(rows[k])); done++; prog(); applyTab(); } };
      await Promise.all([worker(), worker(), worker(), worker()]);
    } finally {
      setProg('');
      running = false;
      if (rerun) { rerun = false; runScan(); }
    }
  }
  let rerun = false;
  function requestScan() { if (running) rerun = true; else runScan(); }

  // ---------- Popup ----------
  const ov = document.createElement('div');
  ov.id = 'sm-overlay';
  ov.innerHTML =
    '<div id="sm-box">' +
      '<div class="sm-head" style="padding:12px 16px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center"><b>Stok Negatif</b><span style="margin-left:auto;margin-right:14px"><select id="sm-toko" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;min-width:200px"><option value="">Pilih Toko</option></select></span><span id="sm-x" style="cursor:pointer;font-size:20px">&times;</span></div>' +
      '<div class="sm-body" style="padding:16px;overflow:hidden;display:flex;flex-direction:column">' +
        '<div id="sm-tabs">' +
          '<button type="button" data-tab="all">Data<span class="cnt">0</span></button>' +
          '<button type="button" data-tab="cek">Lakukan Cek<span class="cnt">0</span></button>' +
          '<button type="button" data-tab="ba">Buat BA<span class="cnt">0</span></button>' +
          '<button type="button" data-tab="ana">Analisa<span class="cnt"></span></button>' +
        '</div>' +
        '<div id="sm-prog"><span class="t"></span><div class="bar"><span></span></div></div>' +
        '<div id="sm-res"></div>' +
      '</div>' +
      '<div id="sm-foot"><button type="button" id="sm-tutup">Tutup</button></div>' +
    '</div>';
  document.body.appendChild(ov);
  ov.querySelectorAll('#sm-tabs button').forEach(b => b.onclick = () => { curTab = b.dataset.tab; applyTab(); });
  const close = () => { tutupAksi(); tutupAnalisa(); ov.classList.remove('open'); document.body.classList.remove('sm-open'); pulihSnap(); };
  ov.addEventListener('click', e => { if (e.target === ov || e.target.id === 'sm-x' || e.target.id === 'sm-tutup') close(); });
  const selToko = ov.querySelector('#sm-toko');

  // ---------- Filter Lihat Stok milik user ----------
  // ERZAP menyimpan filter Lihat Stok di server (session) dan setiap POST pencarian mengubahnya. Filter dicatat saat popup
  // dibuka (mulaiSnap) dan dikembalikan persis seperti semula saat popup ditutup (pulihSnap) -> halaman Lihat Stok user tidak berubah.
  const LS_URL = '/produk_gudangs/lihat_stok/new';
  const KEEP_FIELDS = ['utf8', 'pencarian[umur_produk_satuan_waktu]'];   // field lain dikosongkan; idoutlet_own kosong = semua outlet
  let snapAwal = null, snapJanji = null, pulihJanji = Promise.resolve();
  const snapFd = (snap) => {
    const fd = new FormData();
    snap.entries.forEach(([k, v]) => fd.append(k, v));
    const t = tok();
    if (t && !fd.has('authenticity_token')) fd.append('authenticity_token', t);
    return fd;
  };
  async function ambilSnap() {
    await pulihJanji;   // kalau popup baru saja ditutup, tunggu filter selesai dipulihkan dulu
    const r = await fetch(LS_URL, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const form = d.querySelector('#form_pencarian_lihat_stok');
    if (!form) throw new Error('Form Lihat Stok tidak ditemukan (sudah login?)');
    return { form, entries: [...new FormData(form).entries()] };
  }
  function mulaiSnap() {
    snapJanji = ambilSnap().then(s => { if (ov.classList.contains('open')) snapAwal = s; return s; })
      .catch(e => { console.warn('[stoknegatif.js] filter Lihat Stok tidak bisa dicatat:', e.message); return null; });
    return snapJanji;
  }
  function pulihSnap() {
    const s = snapAwal, j = snapJanji; snapAwal = null; snapJanji = null;
    if (!s && !j) return;
    // tunggu catatan filter (bila popup ditutup sebelum selesai dicatat) dan request pencarian yang masih berjalan,
    // supaya pemulihan tidak tertimpa
    pulihJanji = Promise.allSettled([...berjalan])
      .then(() => s || j)
      .then(snap => {
        if (!snap) return;
        const t = tok();
        return fetch(LS_URL + '?page=1', { method: 'POST', body: snapFd(snap), credentials: 'same-origin', headers: t ? { 'X-CSRF-Token': t } : {} });
      })
      .catch(() => {});
  }
  // kalau halaman ditutup/dimuat ulang saat popup masih terbuka, tetap coba kembalikan filter
  const onPageHide = () => { if (snapAwal && navigator.sendBeacon) navigator.sendBeacon(LS_URL + '?page=1', snapFd(snapAwal)); };
  window.addEventListener('pagehide', onPageHide);

  // ---------- Daftar toko ----------
  // Halaman Lihat Stok apa adanya hanya memuat gudang menurut filter tersimpan (mis. satu outlet). Daftar lengkap semua outlet
  // didapat dari respons POST pencarian dengan outlet dikosongkan (cara yang sama dengan cekpemindahan.js).
  const opsiGudang = (sel) => [...(sel ? sel.options : [])].filter(o => o.value).map(o => ({ id: o.value, nama: o.text.trim() }));
  const selGudang = (doc) => doc.querySelector('#pencarian_idgudang') || doc.querySelector('[name="pencarian[idgudang]"]');
  async function daftarGudang() {
    const snap = await snapJanji;
    if (snap) {
      try {
        const fd = new FormData();
        for (const [k, v] of snap.entries) fd.append(k, KEEP_FIELDS.includes(k) ? v : '');
        fd.set('pencarian[idgudang]', ''); fd.set('pencarian[jumlah]', '0'); fd.set('pencarian[perbandingan_jumlah]', '>');
        const t = tok();
        if (t) fd.set('authenticity_token', t);
        const r = await fetch(LS_URL + '?page=1', { method: 'POST', body: fd, credentials: 'same-origin', headers: t ? { 'X-CSRF-Token': t } : {} });
        if (r.ok) {
          const list = opsiGudang(selGudang(new DOMParser().parseFromString(await r.text(), 'text/html')));
          if (list.length) return list;
        }
      } catch (e) { console.warn('[stoknegatif.js] daftar gudang lewat pencarian gagal, pakai halaman apa adanya:', e.message); }
      return opsiGudang(selGudang(snap.form));   // cadangan: daftar di halaman Lihat Stok
    }
    const r = await fetch(LS_URL, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return opsiGudang(selGudang(new DOMParser().parseFromString(await r.text(), 'text/html')));
  }
  let tokoMuat = null;
  function muatToko() {
    if (tokoMuat) return tokoMuat;
    const info = (teks) => { selToko.options[0].textContent = teks; };
    info('Memuat toko...');
    tokoMuat = daftarGudang().then(list => {
      const toko = list.filter(g => /^TOKO\b/i.test(g.nama)).sort((a, b) => a.nama.localeCompare(b.nama, 'id', { numeric: true }));
      if (!toko.length) {
        console.warn('[stoknegatif.js] tidak ada gudang berawalan "TOKO". Gudang yang terbaca (' + list.length + '):', list.map(g => g.nama));
        info(list.length ? 'Tidak ada toko (lihat console)' : 'Daftar gudang kosong');
        tokoMuat = null;   // popup dibuka lagi = coba ulang
        return;
      }
      toko.forEach(g => { const op = document.createElement('option'); op.value = g.id; op.textContent = g.nama; selToko.appendChild(op); });
      info('Pilih Toko');
    }).catch(e => {
      console.warn('[stoknegatif.js] gagal memuat daftar toko:', e.message);
      info('Gagal memuat toko, tutup lalu buka lagi');
      tokoMuat = null;
    });
    return tokoMuat;
  }
  selToko.onchange = () => {
    tokoOtl = ''; tokoId = selToko.value; tokoNama = tokoId ? selToko.selectedOptions[0].text : '';
    boList.length = 0; renderBo && renderBo();   // Stok Out per toko
    tutupAksi(); tutupAnalisa(); curTab = 'all'; requestScan();
  };

  // ---------- Tombol Stok Min (sejajar judul, kanan) ----------
  function ensureBar() {
    if (document.getElementById('sm-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'sm-bar';
    bar.style.cssText = 'display:none';
    bar.innerHTML = '<button type="button" style="background:#f0a500;color:#fff;border:0;border-radius:4px;padding:6px 14px;font-weight:600;cursor:pointer">⚠ Stok Negatif</button>';
    bar.firstChild.onclick = () => {
      // selalu mulai kosong: pilih toko dulu
      tokoId = ''; tokoNama = ''; tokoOtl = ''; selToko.value = ''; boList.length = 0; curTab = 'all';
      ov.classList.add('open'); document.body.classList.add('sm-open');
      mulaiSnap(); muatToko(); requestScan();
    };
    document.body.appendChild(bar);
  }
  ensureBar();

  // Pasang ulang tombol kalau halaman memuat ulang konten
  const target = document.getElementById('content') || document.body;
  let pend = false;
  window.__smOff = () => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('scroll', tutupAksi, true);
    window.removeEventListener('resize', fitCari);
    window.removeEventListener('pagehide', onPageHide);
  };
  window.__smObs = new MutationObserver(() => {
    if (pend) return;
    pend = true;
    requestAnimationFrame(() => { pend = false; ensureBar(); });
  });
  window.__smObs.observe(target, { childList: true, subtree: true });
  }
  // Tombol hanya dipasang untuk role yang punya fitur "stokNegatif". Nama kasir bisa dimuat belakangan,
  // jadi selama nama belum terbaca (null) dicoba lagi; setelah diputuskan (boleh / tidak) pemeriksaan berhenti.
  function coba() {
    if (!siap()) return false;
    const akses = cekAkses('stokNegatif');
    if (akses === null) return false;
    if (akses) mulai();
    return true;
  }
  if (!coba()) {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (coba() || Date.now() - t0 > 30000) clearInterval(iv);
    }, 300);
  }
})();
