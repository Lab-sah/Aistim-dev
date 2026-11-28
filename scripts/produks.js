// ==UserScript==
// @name         ERZAP - Audit Stok (Daftar Data Produk)
// @namespace    partdistro.erzap.produks
// @version      1.7.0
// @description  Menambahkan tombol Audit Stok (Stok Negatif, Cek Pemindahan, Digital Aktivasi, Stok Terpesan, Analisa Stok) di halaman Daftar Data Produk ERZAP. v1.6.0: klik angka Terpesan menampilkan No Faktur, Outlet, Store
// @author       Pak mon
// @match        https://*.erzap.com/produks*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ===== KONFIGURASI =====
  var AUDIT_STOK_LABEL = 'Audit Stok';
  var ANCHOR_TEXT = 'Tambah Data Marketplace';
  var BUTTON_COLOR = '#1897ff';        // sama dengan tombol "Tambah Data Marketplace"
  var BUTTON_COLOR_HOVER = '#0f86e6';
  var MENU_COLOR = '#0d6efd';
  var MENU_COLOR_HOVER = '#0b5ed7';

  var AKTIVASI_KATEGORI = 'TOOLS';
  var AKTIVASI_SUB_KATEGORI = 'AKTIVASI';
  // ID kategori di server (TOOLS = 1, AKTIVASI = 9). Ubah jika ID di sistem berubah.
  var KATEGORI_ID = 1;
  var SUB_KATEGORI_ID = 9;
  var MAX_PAGES = 200;

  // Pilihan yang muncul setelah tombol Audit Stok diklik (ubah url sesuai kebutuhan)
  var MENU_ITEMS = [
    {
      label: 'Stok Negatif',
      fitur: 'stokNegatif',
      popup: true,   // popup dibuat oleh stoknegatif.js; menu ini mengklik tombol #sm-bar miliknya
      action: 'stoknegatif',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 18l-9.5-9.5-5 5L1 6"/><polyline points="17 18 23 18 23 12"/></svg>'
    },
    {
      label: 'Cek Pemindahan',
      fitur: 'cekPemindahan',
      popup: true,   // popup dibuat oleh cekpemindahan.js; menu ini mengklik tombol .cg-bulk miliknya
      action: 'cekpemindahan',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>'
    },
    {
      label: 'Digital Aktivasi',
      fitur: 'digitalAktivasi',
      popup: true,   // tampilkan popup, bukan pindah halaman
      action: 'aktivasi',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>'
    },
    {
      label: 'Stok Terpesan',
      fitur: 'stokTerpesan',
      popup: true,
      action: 'terpesan',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="16" x2="13" y2="16"/></svg>'
    },
    {
      label: 'Analisa Stok',
      fitur: 'analisaStok',
      popup: true,
      action: 'analisa',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
    }
  ];

  var BUTTON_ID = 'tm-btn-audit-stok';
  var tutupMenuAktif = null;   // fungsi penutup menu milik tombol yang sedang terpasang

  // ===== HAK AKSES (JSON) =====
  // "public"  -> fitur (menu Audit Stok) yang boleh dipakai SEMUA user. Kosong = tidak ada.
  // "role"    -> "nama" dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil, harus kata utuh:
  //              "ISA" cocok dengan "ISA RAHMA", tidak dengan "LISA"); "fitur" = fitur untuk role itu ("*" = semua).
  // "private" -> catatan fitur yang khusus role. Tidak dibaca kode; yang menentukan adalah "fitur" di tiap role.
  // Nama fitur: stokNegatif, cekPemindahan, digitalAktivasi, stokTerpesan, analisaStok.
  // Jika JSON salah ketik, akses ditutup (tidak ada menu yang tampil untuk siapa pun).
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  var AKSES_JSON = `{
    "public": [],
    "private": ["stokNegatif", "cekPemindahan", "digitalAktivasi", "stokTerpesan", "analisaStok"],
    "role": {
        "pusat": {
            "nama": ["SENTOT ARI HANDOKO", "SURYO"],
            "fitur": ["*"]
        }
    }
}`;
  var akses = (function () {
    try {
      var a = JSON.parse(AKSES_JSON) || {};
      var role = a.role && typeof a.role === 'object' ? a.role : {};
      return {
        public: Array.isArray(a.public) ? a.public.map(String) : [],
        role: Object.keys(role).map(function (k) {
          var r = role[k] || {};
          return {
            nama: Array.isArray(r.nama) ? r.nama.map(String) : [],
            fitur: Array.isArray(r.fitur) ? r.fitur.map(String) : []
          };
        })
      };
    } catch (err) {
      console.error('[produks] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { public: [], role: [] };
    }
  })();
  function kata(t) {
    return ' ' + String(t || '').replace(/[^0-9a-z]+/gi, ' ').trim().toLowerCase() + ' ';
  }
  // Dicek saat dipakai (bukan sekali di awal), karena nama kasir bisa dimuat belakangan.
  function bolehFitur(fitur) {
    if (akses.public.indexOf(fitur) !== -1) return true;
    var nama = kata((document.getElementById('info_kasir') || {}).textContent);
    for (var i = 0; i < akses.role.length; i++) {
      var r = akses.role[i];
      var cocok = r.nama.some(function (u) { u = kata(u); return u.trim() !== '' && nama.indexOf(u) !== -1; });
      if (cocok) return r.fitur.indexOf('*') !== -1 || r.fitur.indexOf(fitur) !== -1;
    }
    return false;
  }

  // ===== Helper umum =====
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function findAnchorButton() {
    var candidates = document.querySelectorAll('a, button');
    for (var i = 0; i < candidates.length; i++) {
      if ((candidates[i].textContent || '').replace(/\s+/g, ' ').trim() === ANCHOR_TEXT) {
        return candidates[i];
      }
    }
    return null;
  }

  // Stok Negatif: popup milik stoknegatif.js (MAIN world). Dibuka dengan mengklik tombol #sm-bar yang disembunyikan.
  function bukaStokNegatif() {
    var bar = document.getElementById('sm-bar');
    var b = bar && bar.querySelector('button');
    if (!b) { alert('Stok Negatif belum siap. Tunggu sebentar lalu coba lagi, atau pastikan script Stok Negatif aktif dan akun Anda punya akses.'); return; }
    b.click();
  }

  // Cek Pemindahan: popup milik cekpemindahan.js (MAIN world). Dibuka dengan mengklik tombol .cg-bulk yang disembunyikan.
  function bukaCekPemindahan() {
    var b = document.querySelector('.cg-bulk');
    if (!b) { alert('Cek Pemindahan belum siap. Tunggu sebentar lalu coba lagi, atau pastikan script Cek Pemindahan aktif dan akun Anda punya akses.'); return; }
    b.click();
  }

  // ===== Tombol & menu Audit Stok =====
  // Sembunyikan menu yang tidak boleh dipakai user ini; bila tidak ada satu pun, tampilkan pesan.
  function tampilkanMenuSesuaiAkses(menu) {
    var ada = 0;
    menu.querySelectorAll('li[data-fitur]').forEach(function (li) {
      var ok = bolehFitur(li.getAttribute('data-fitur'));
      li.style.display = ok ? '' : 'none';
      if (ok) ada++;
    });
    var info = menu.querySelector('li[data-tanpa-akses]');
    if (!info) {
      info = document.createElement('li');
      info.setAttribute('data-tanpa-akses', '1');
      info.style.cssText = 'padding:8px 16px;color:#666;white-space:nowrap;';
      info.textContent = 'Tidak ada akses';
      menu.appendChild(info);
    }
    info.style.display = ada ? 'none' : '';
  }

  function addAuditStokButton() {
    if (document.getElementById(BUTTON_ID)) return true;

    var anchor = findAnchorButton();
    if (!anchor) return false;

    var wrap = document.createElement('span');
    wrap.id = BUTTON_ID;
    wrap.style.cssText = 'position:relative;display:inline-block;margin-left:6px;';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = AUDIT_STOK_LABEL;
    btn.style.cssText = 'background:' + BUTTON_COLOR + ';border-color:' + BUTTON_COLOR + ';color:#fff;';

    var menu = document.createElement('ul');
    menu.style.cssText =
      'display:none;position:absolute;top:100%;right:0;z-index:1050;' +
      'min-width:180px;margin:4px 0 0;padding:0;list-style:none;' +
      'background:#fff;border:1px solid rgba(0,0,0,.15);border-radius:4px;' +
      'box-shadow:0 6px 12px rgba(0,0,0,.175);overflow:hidden;';

    MENU_ITEMS.forEach(function (item, idx) {
      var li = document.createElement('li');
      li.setAttribute('data-fitur', item.fitur);
      if (idx > 0) li.style.borderTop = '1px solid rgba(255,255,255,.4)';

      var a = document.createElement('a');
      a.href = item.popup ? '#' : item.url;
      if (item.popup) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          if (!bolehFitur(item.fitur)) return;
          menu.style.display = 'none';
          btn.style.background = BUTTON_COLOR;
          btn.style.borderColor = BUTTON_COLOR;
          if (item.action === 'stoknegatif') {
            bukaStokNegatif();
          } else if (item.action === 'cekpemindahan') {
            bukaCekPemindahan();
          } else if (item.action === 'analisa') {
            openAnalisaStokPopup();
          } else if (item.action === 'terpesan') {
            openStokTerpesanPopup();
          } else {
            startAktivasiScan();
          }
        });
      }
      a.innerHTML =
        '<span style="display:inline-flex;vertical-align:middle;margin-right:8px;">' + item.icon + '</span>' +
        '<span style="vertical-align:middle;">' + item.label + '</span>';
      a.style.cssText =
        'display:block;padding:8px 16px;color:#fff;background:' + MENU_COLOR + ';' +
        'text-decoration:none;white-space:nowrap;';
      a.onmouseover = function () { a.style.background = MENU_COLOR_HOVER; };
      a.onmouseout = function () { a.style.background = MENU_COLOR; };

      li.appendChild(a);
      menu.appendChild(li);
    });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.style.display === 'block';
      if (!open) tampilkanMenuSesuaiAkses(menu);
      menu.style.display = open ? 'none' : 'block';
      btn.style.background = open ? BUTTON_COLOR : BUTTON_COLOR_HOVER;
      btn.style.borderColor = btn.style.background;
    });

    // Tutup menu jika klik di luar (listener dokumen dipasang sekali di init dan memanggil fungsi ini)
    tutupMenuAktif = function () {
      if (menu.style.display === 'block') {
        menu.style.display = 'none';
        btn.style.background = BUTTON_COLOR;
        btn.style.borderColor = BUTTON_COLOR;
      }
    };

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    anchor.insertAdjacentElement('afterend', wrap);
    return true;
  }

  // ===== Popup umum =====
  // Ukuran dan gaya tabel mengikuti popup Stok Negatif (stoknegatif.js: #sm-box dan tabel #sm-res):
  // lebar 1100px (maks. 96vw), tinggi 85vh, tabel 13px dengan garis sel, header abu-abu menempel di atas.
  function pasangGaya() {
    if (document.getElementById('tm-style')) return;
    var st = document.createElement('style');
    st.id = 'tm-style';
    st.textContent =
      '#tm-popup-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center}' +
      '#tm-popup-overlay .tm-box{background:#fff;border-radius:6px;width:1100px;max-width:96vw;height:85vh;height:85dvh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.3)}' +
      '#tm-popup-overlay .tm-head{padding:12px 16px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center}' +
      '#tm-popup-overlay .tm-x{cursor:pointer;font-size:20px;line-height:1;background:none;border:0;padding:0}' +
      '#tm-popup-overlay .tm-body{padding:16px;flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;font-size:13px;color:#333}' +
      '#tm-popup-overlay .tm-fill{flex:1;min-height:0;display:flex;flex-direction:column}' +
      '#tm-popup-overlay .tm-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:auto;overscroll-behavior:contain}' +
      '#tm-popup-overlay .tm-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}' +
      '#tm-popup-overlay .tm-tbl th,#tm-popup-overlay .tm-tbl td{padding:5px;border-right:1px solid #ddd;border-bottom:1px solid #ddd;white-space:nowrap}' +
      '#tm-popup-overlay .tm-tbl th{background:#eef1f5;position:sticky;top:0;z-index:5;text-align:left;border-top:1px solid #ddd}' +
      '#tm-popup-overlay .tm-tbl tr>:first-child{border-left:1px solid #ddd}' +
      '#tm-popup-overlay .tm-tbl .c{text-align:center}' +
      '#tm-popup-overlay .tm-tbl .n{text-align:center;font-weight:600}' +
      '#tm-popup-overlay .tm-tbl .nm{white-space:normal;word-break:break-word}' +
      '#tm-popup-overlay .tm-tbl th[data-sort]{cursor:pointer;user-select:none}' +
      '#tm-popup-overlay .tm-foot{flex:0 0 auto;display:flex;justify-content:flex-end;padding:8px 16px;border-top:1px solid #ddd;background:#fafafa;border-radius:0 0 6px 6px}' +
      '#tm-popup-overlay .tm-tutup{background:#757575;color:#fff;border:0;border-radius:3px;padding:4px 12px;font-size:12px;cursor:pointer}' +
      '#tm-popup-overlay .tm-tutup:hover{background:#5f5f5f}' +
      '#tm-popup-overlay #tm-terpesan-list .tm-scroll{border:1px solid #d0d4da !important;border-radius:6px !important;overflow:auto !important;-webkit-overflow-scrolling:touch !important;max-height:calc(85vh - 200px) !important;flex:1 !important;min-height:0 !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl{width:100% !important;min-width:520px !important;border-collapse:separate !important;border-spacing:0 !important;font-size:13px !important;table-layout:auto !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl th{position:sticky !important;top:0 !important;z-index:2 !important;background:#e4e8ee !important;color:#000 !important;font-weight:700 !important;padding:9px 10px !important;border-top:none !important;border-right:none !important;border-bottom:2px solid #b9c0ca !important;white-space:nowrap !important;text-align:left !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl th[data-sort]:hover{background:#d6dde8 !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl td{padding:8px 10px !important;border-right:none !important;border-left:none !important;border-top:none !important;border-bottom:1px solid #eef0f3 !important;vertical-align:middle !important;color:#000 !important;white-space:nowrap !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl tbody tr:nth-child(even) td{background:#f8fafc !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl tbody tr:hover td{background:#eef5ff !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl td:nth-child(2){font-family:Consolas,monospace !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl td:nth-child(3){white-space:normal !important;word-break:break-word !important;min-width:240px !important;line-height:1.35 !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl td:nth-child(1),#tm-popup-overlay #tm-terpesan-list table.tm-tbl th:nth-child(1){text-align:center !important;width:48px !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl td:last-child,#tm-popup-overlay #tm-terpesan-list table.tm-tbl th:last-child{text-align:right !important;width:110px !important}' +
      '#tm-popup-overlay #tm-terpesan-list .tm-terp-link{display:inline-block !important;min-width:52px !important;padding:3px 10px !important;border-radius:12px !important;background:#e7f0ff !important;color:#0d6efd !important;font-weight:700 !important;text-decoration:none !important;text-align:center !important}' +
      '#tm-popup-overlay #tm-terpesan-list .tm-terp-link:hover{background:#cfe2ff !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl th:nth-child(2),#tm-popup-overlay #tm-terpesan-list table.tm-tbl td:nth-child(2){border-right:2px solid #b9c0ca !important}' +
      '#tm-popup-overlay #tm-terpesan-list table.tm-tbl td:nth-child(2),#tm-popup-overlay #tm-terpesan-list table.tm-tbl th:nth-child(2){padding-right:14px !important}' +
      '#tm-popup-overlay .tm-body > .tm-scroll{border:1px solid #d0d4da !important;border-radius:6px !important;max-height:calc(85vh - 170px) !important;overflow:auto !important;-webkit-overflow-scrolling:touch !important}' +
      '#tm-popup-overlay .tm-body > .tm-scroll table.tm-tbl{width:100% !important;min-width:560px !important;border-collapse:separate !important;border-spacing:0 !important;font-size:13px !important}' +
      '#tm-popup-overlay .tm-body > .tm-scroll table.tm-tbl th{position:sticky !important;top:0 !important;z-index:2 !important;background:#e4e8ee !important;color:#000 !important;font-weight:700 !important;padding:9px 10px !important;border:none !important;border-bottom:2px solid #b9c0ca !important;white-space:nowrap !important;text-align:left !important}' +
      '#tm-popup-overlay .tm-body > .tm-scroll table.tm-tbl td{padding:8px 10px !important;border:none !important;border-bottom:1px solid #eef0f3 !important;color:#000 !important;vertical-align:middle !important;white-space:nowrap !important}' +
      '#tm-popup-overlay .tm-body > .tm-scroll table.tm-tbl th:nth-child(1),#tm-popup-overlay .tm-body > .tm-scroll table.tm-tbl td:nth-child(1){text-align:center !important;width:48px !important}' +
      '#tm-popup-overlay .tm-body > .tm-scroll table.tm-tbl td:nth-child(2){font-family:Consolas,monospace !important;font-weight:600 !important}' +
      '#tm-popup-overlay .tm-body > .tm-scroll table.tm-tbl td:nth-child(4){white-space:normal !important;word-break:break-word !important;min-width:160px !important}' +
      '#tm-popup-overlay .tm-body > .tm-scroll table.tm-tbl tbody tr:nth-child(even) td{background:#f8fafc !important}' +
      '#tm-popup-overlay .tm-body > .tm-scroll table.tm-tbl tbody tr:hover td{background:#eef5ff !important}' +
      '#tm-popup-overlay #tm-kembali{display:inline-flex !important;align-items:center !important;gap:6px !important;background:#4b5563 !important;color:#fff !important;border:0 !important;border-radius:6px !important;padding:8px 14px !important;font-size:13px !important;font-weight:600 !important;cursor:pointer !important;box-sizing:border-box !important;line-height:1.2 !important}' +
      '#tm-popup-overlay #tm-kembali:hover{background:#374151 !important}' +
      '#tm-popup-overlay #tm-kembali:focus-visible{outline:2px solid #0d6efd !important;outline-offset:2px !important}' +
      '@media (max-width:700px){#tm-popup-overlay #tm-kembali{width:100% !important;justify-content:center !important;padding:10px 14px !important;font-size:14px !important}}' +
      '@media (max-width:900px){#tm-popup-overlay .tm-foot{padding:8px 10px}#tm-popup-overlay .tm-box{width:98vw;max-width:98vw}#tm-popup-overlay .tm-head{padding:8px 10px}#tm-popup-overlay .tm-body{padding:10px}#tm-popup-overlay .tm-tbl{min-width:420px}}';
    document.head.appendChild(st);
  }

  var kunciLama = null;   // overflow body sebelum popup dibuka (null = tidak sedang dikunci)
  function openPopup(title, fillBody) {
    pasangGaya();
    // kunci scroll halaman seperti popup Stok Negatif, supaya popup tepat di tengah layar
    if (kunciLama === null) { kunciLama = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    var overlay = document.getElementById('tm-popup-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'tm-popup-overlay';

    var box = document.createElement('div');
    box.className = 'tm-box';

    var head = document.createElement('div');
    head.className = 'tm-head';
    head.innerHTML = '<b>' + escapeHtml(title) + '</b>';

    var closeX = document.createElement('button');
    closeX.type = 'button';
    closeX.className = 'tm-x';
    closeX.title = 'Tutup';
    closeX.innerHTML = '&times;';
    head.appendChild(closeX);

    var body = document.createElement('div');
    body.id = 'tm-popup-body';
    body.className = 'tm-body';

    var foot = document.createElement('div');
    foot.className = 'tm-foot';
    var tutup = document.createElement('button');
    tutup.type = 'button';
    tutup.className = 'tm-tutup';
    tutup.textContent = 'Tutup';
    foot.appendChild(tutup);

    box.appendChild(head);
    box.appendChild(body);
    box.appendChild(foot);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
      if (kunciLama !== null) { document.body.style.overflow = kunciLama; kunciLama = null; }
    }
    closeX.addEventListener('click', close);
    tutup.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    if (typeof fillBody === 'function') fillBody(body);
    return body;
  }

  // ===== Digital Aktivasi: Barcode & Nama Produk dengan Kategori TOOLS + Sub Kategori AKTIVASI =====

  function renderResult(items, pages, tebakKolom, adaHarga) {
    var body = openPopup('Digital Aktivasi', null);
    var head =
      '<div style="margin-bottom:10px;color:#555;">Kategori: <b>' + AKTIVASI_KATEGORI +
      '</b> &middot; Sub Kategori: <b>' + AKTIVASI_SUB_KATEGORI + '</b></div>' +
      '<div style="margin-bottom:10px;"><b>Total: ' + items.length + ' produk</b> <span style="color:#888;">(' + pages + ' halaman dibaca)</span></div>' +
      (items.length && !adaHarga ? '<div style="margin-bottom:10px;color:#c25e00;">Kolom harga tidak ditemukan di tabel produk ERZAP, jadi harga tidak ditampilkan.</div>' : '');
    if (!items.length) {
      body.innerHTML = head + '<p style="margin:0;color:#888;">Tidak ada produk dengan filter ini.</p>' +
        (tebakKolom ? '<p style="margin:8px 0 0;color:#c25e00;">Header tabel ERZAP tidak terbaca, jadi posisi kolom memakai tebakan. Bila seharusnya ada produk, susunan kolom mungkin berubah.</p>' : '');
      return;
    }
    var rowsHtml = items.map(function (r, i) {
      return '<tr><td class="c">' + (i + 1) + '</td><td>' + escapeHtml(r.barcode) + '</td><td class="nm">' + escapeHtml(r.nama) + '</td>' +
        (adaHarga ? '<td class="c">' + escapeHtml(r.harga || '-') + '</td>' : '') + '</tr>';
    }).join('');
    body.innerHTML = head +
      '<div class="tm-scroll"><table class="tm-tbl">' +
      '<thead><tr><th class="c">No</th><th>Barcode</th><th>Nama Produk</th>' + (adaHarga ? '<th class="c">Harga</th>' : '') + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
  }

  // Posisi kolom dibaca dari header tabel supaya tidak rusak bila ERZAP menggeser kolom.
  // Bila header tidak bisa dipakai, kembali ke posisi tetap (dariHeader = false).
  function petaKolom(doc, trs) {
    var f = { barcode: 3, nama: 4, kategori: 11, sub: 12, harga: -1 };
    var ths = Array.prototype.slice.call(doc.querySelectorAll('thead th'));
    if (ths.length && trs.length && ths.length === trs[0].cells.length) {
      var t = ths.map(function (th) { return th.textContent.replace(/\s+/g, ' ').trim().toLowerCase(); });
      var cari = function (re) { return t.findIndex(function (x) { return re.test(x); }); };
      var g = { barcode: cari(/barcode/), nama: cari(/^nama/), kategori: cari(/^kategori/), sub: cari(/^sub\s*kategori/) };
      // kolom harga (opsional): utamakan "Harga Jual", kalau tidak ada pakai kolom "Harga..." pertama selain harga beli/modal/diskon
      g.harga = cari(/^harga\s*jual/);
      if (g.harga < 0) g.harga = cari(/^harga(?!.*(beli|modal|diskon))/);
      if (g.barcode >= 0 && g.nama >= 0 && g.kategori >= 0 && g.sub >= 0) return { f: g, dariHeader: true };
    }
    return { f: f, dariHeader: false };
  }

  // Mengambil semua halaman langsung dari server (fetch), tanpa pindah halaman
  async function fetchAllAktivasi() {
    var base = 'produk_simple[idproduk_kategori]=' + KATEGORI_ID +
      '&produk_simple[idproduk_sub_kategori]=' + SUB_KATEGORI_ID;
    var seen = new Map();
    var dibaca = {};   // semua baris yang sudah pernah dibaca (bukan hanya yang cocok)
    var pages = 0;
    var peta = null;
    for (var p = 1; p <= MAX_PAGES; p++) {
      var res = await fetch('/produks/index/new?page=' + p + '&' + base, { credentials: 'include' });
      var doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      var trs = Array.from(doc.querySelectorAll('tr')).filter(function (tr) {
        return tr.querySelector('td') && tr.cells.length >= 20;
      });
      if (!trs.length) break;
      if (!peta) peta = petaKolom(doc, trs);
      var c = peta.f;
      // ERZAP bisa mengembalikan halaman terakhir lagi untuk nomor halaman di luar batas -> berhenti kalau tidak ada baris baru
      var baru = 0;
      trs.forEach(function (tr) {
        var kunci = tr.cells[3].innerText.trim() + '|' + tr.cells[4].innerText.trim();
        if (!dibaca[kunci]) { dibaca[kunci] = true; baru++; }
      });
      if (!baru) break;
      pages++;
      trs.forEach(function (tr) {
        if (tr.cells[c.kategori].innerText.trim().toUpperCase() !== AKTIVASI_KATEGORI) return;
        if (tr.cells[c.sub].innerText.trim().toUpperCase() !== AKTIVASI_SUB_KATEGORI) return;
        var lines = tr.cells[c.barcode].innerText.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        var bc = lines[lines.length - 1];
        var nm = tr.cells[c.nama].innerText.trim();
        var hg = c.harga >= 0 && tr.cells[c.harga] ? tr.cells[c.harga].innerText.trim() : '';
        seen.set(bc + '|' + nm, { barcode: bc, nama: nm, harga: hg });
      });
    }
    return { items: Array.from(seen.values()), pages: pages, tebakKolom: !!peta && !peta.dariHeader, adaHarga: !!peta && peta.f.harga >= 0 };
  }

  // ===== Stok Terpesan =====
  // Sumber daftar: statistik produk terpesan. Server mengabaikan parameter page, jadi cukup satu permintaan.
  // Klik angka Terpesan -> popup berisi pesanan yang memuat barang itu (No Faktur, Outlet, Store).
  var TERPESAN_URL = '/pesanan_penjualans/index_statistik_produk_terpesan/new';
  var DAFTAR_PESANAN_URL = '/pesanan_penjualans/index/new';
  var PESANAN_MAX = 300;        // jumlah pesanan terbaru yang diperiksa untuk Outlet & Store
  var PESANAN_JEDA_MS = 350;    // jeda antar permintaan detail pesanan (hindari 429)

  var cachePesanan = null;      // hasil scan pesanan; disimpan selama halaman belum dimuat ulang

  function tunggu(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function parseDoc(html) { return new DOMParser().parseFromString(html, 'text/html'); }
  function teksSel(el) { return el ? el.innerText.replace(/\s+/g, ' ').trim() : ''; }

  // Ambil halaman. Bila kena 429 (terlalu banyak permintaan), tunggu lalu coba lagi.
  async function ambilHalaman(url) {
    for (var k = 0; k < 4; k++) {
      var res = await fetch(url, { credentials: 'include' });
      if (res.status !== 429) return res;
      await tunggu(1500 * (k + 1));
    }
    throw new Error('HTTP 429 (terlalu banyak permintaan, coba lagi beberapa menit)');
  }

  // Posisi kolom dibaca dari header; bila tidak cocok dipakai posisi tetap (dariHeader = false).
  function petaKolomTerpesan(doc, trs) {
    var f = { barcode: 1, nama: 2, merek: 3, kategori: 4, jumlah: 5 };
    var ths = Array.prototype.slice.call(doc.querySelectorAll('thead th'));
    if (ths.length && trs.length && ths.length === trs[0].cells.length) {
      var t = ths.map(function (th) { return th.textContent.replace(/\s+/g, ' ').trim().toLowerCase(); });
      var cari = function (re) { return t.findIndex(function (x) { return re.test(x); }); };
      var g = { barcode: cari(/barcode/), nama: cari(/^nama/), merek: cari(/merek/), kategori: cari(/^kategori/), jumlah: cari(/terpesan|^jumlah|^qty/) };
      if (g.barcode < 0 && g.nama > 0) g.barcode = g.nama - 1;
      if (g.barcode >= 0 && g.nama >= 0 && g.merek >= 0 && g.kategori >= 0 && g.jumlah >= 0) return { f: g, dariHeader: true };
    }
    return { f: f, dariHeader: false };
  }

  // Satu permintaan saja (halaman 1), karena parameter page diabaikan server.
  async function fetchStokTerpesan() {
    var res = await ambilHalaman(TERPESAN_URL + '?page=1');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var doc = parseDoc(await res.text());
    var trs = Array.from(doc.querySelectorAll('table tbody tr')).filter(function (tr) { return tr.querySelector('td') && tr.cells.length >= 6; });
    var peta = petaKolomTerpesan(doc, trs);
    var c = peta.f;
    var items = trs.map(function (tr) {
      var lines = tr.cells[c.barcode].innerText.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      return {
        barcode: lines[lines.length - 1] || '',
        nama: tr.cells[c.nama].innerText.trim(),
        merek: tr.cells[c.merek].innerText.trim(),
        kategori: tr.cells[c.kategori].innerText.trim(),
        jumlah: parseFloat(tr.cells[c.jumlah].innerText.replace(/[^0-9.\-]/g, '')) || 0
      };
    });
    return { items: items, tebakKolom: !peta.dariHeader };
  }

  // Membaca daftar pesanan terbaru, lalu detail tiap pesanan: No Faktur (kolom Kode),
  // Outlet (pilihan outlet di detail), Store (kolom Pemesan), dan teks tabel barang.
  async function kumpulkanPesanan(onProgress) {
    if (cachePesanan) return cachePesanan;
    var pesanan = [];
    var masalah = '';
    var halaman = 1;
    outer:
    while (pesanan.length < PESANAN_MAX) {
      var res = await ambilHalaman(DAFTAR_PESANAN_URL + '?page=' + halaman);
      if (!res.ok) { masalah = 'daftar pesanan halaman ' + halaman + ' gagal (HTTP ' + res.status + ')'; break; }
      var doc = parseDoc(await res.text());
      var baris = Array.from(doc.querySelectorAll('table tbody tr')).filter(function (tr) { return tr.cells.length >= 8; });
      if (!baris.length) break;
      for (var i = 0; i < baris.length; i++) {
        if (pesanan.length >= PESANAN_MAX) break outer;
        var tr = baris[i];
        var id = null;
        Array.from(tr.querySelectorAll('a[href]')).some(function (a) {
          var m = (a.getAttribute('href') || '').match(/\/pesanan_penjualans\/(\d+)/);
          if (m) { id = m[1]; return true; }
          return false;
        });
        if (!id) continue;
        var faktur = teksSel(tr.cells[2]);
        var barisPemesan = (tr.cells[3].innerText || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean)[0] || '';
        var kanal = barisPemesan.match(/shopee|tokopedia|tiktok|lazada|blibli|website/i);
        var store = kanal ? kanal[0].toUpperCase() : barisPemesan;
        await tunggu(PESANAN_JEDA_MS);
        var rd = await ambilHalaman('/pesanan_penjualans/' + id);
        if (!rd.ok) { masalah = 'detail ' + faktur + ' gagal (HTTP ' + rd.status + ')'; break outer; }
        var dd = parseDoc(await rd.text());
        var sel = dd.querySelector('select[name="pesanan_penjualan[idoutlet_own]"]');
        var outlet = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text.trim() : '-';
        var barcodes = Array.from(dd.querySelectorAll('input[name$="[data_produk_barcode]"]')).map(function (i) { return (i.value || '').trim(); }).filter(Boolean);
        pesanan.push({ faktur: faktur, outlet: outlet, store: store, barcodes: barcodes });
        if (onProgress) onProgress(pesanan.length);
      }
      halaman++;
    }
    var hasil = { pesanan: pesanan, masalah: masalah };
    if (!masalah) cachePesanan = hasil;   // hasil yang tidak lengkap tidak disimpan
    return hasil;
  }

  // Popup: pesanan yang memuat barcode tertentu.
  function bukaDetailTerpesan(barcode, nama) {
    openPopup('Outlet Terpesan: ' + nama, function (body) {
      body.innerHTML = '<div style="margin-bottom:8px;"><button type="button" id="tm-kembali" style="background:#6b7280;color:#fff;border:0;border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer;">&larr; Kembali ke Stok Terpesan</button></div>' +
        '<div id="tm-dt-info" style="margin-bottom:8px;color:#555;">' +
        '<div style="margin-bottom:6px;">Memeriksa pesanan terbaru, mohon tunggu...</div>' +
        '<div style="background:#e5e7eb;border-radius:4px;height:14px;overflow:hidden;">' +
        '<div id="tm-dt-bar" style="height:100%;width:0%;background:#0d6efd;transition:width .2s;"></div></div>' +
        '<div id="tm-dt-pct" style="margin-top:4px;font-size:12px;color:#555;">0 dari ' + PESANAN_MAX + ' pesanan (0%)</div></div>';
      body.querySelector('#tm-kembali').addEventListener('click', function () { openStokTerpesanPopup(); });
      var info = body.querySelector('#tm-dt-info');
      kumpulkanPesanan(function (n) {
        var pct = Math.min(100, Math.round(n / PESANAN_MAX * 100));
        var bar = body.querySelector('#tm-dt-bar');
        var teks = body.querySelector('#tm-dt-pct');
        if (bar) bar.style.width = pct + '%';
        if (teks) teks.textContent = n + ' dari ' + PESANAN_MAX + ' pesanan (' + pct + '%)';
      }).then(function (r) {
        var hasil = r.pesanan.filter(function (p) { return p.barcodes.indexOf(barcode) !== -1; });
        var msg = '<b>' + hasil.length + ' pesanan</b> memuat barcode ' + escapeHtml(barcode) +
          ' (dari ' + r.pesanan.length + ' pesanan terbaru yang diperiksa)';
        if (r.masalah) msg += '<div style="margin-top:4px;color:#c25e00;">Pemeriksaan berhenti: ' + escapeHtml(r.masalah) + '.</div>';
        info.innerHTML = msg;
        var wrap = document.createElement('div');
        wrap.className = 'tm-scroll';
        var baris = hasil.map(function (p, i) {
          return '<tr><td class="c">' + (i + 1) + '</td><td>' + escapeHtml(p.faktur) + '</td><td>' + escapeHtml(p.outlet) +
            '</td><td>' + escapeHtml(p.store) + '</td></tr>';
        }).join('');
        wrap.innerHTML = '<table class="tm-tbl"><thead><tr><th class="c">No</th><th>No Faktur</th><th>Outlet</th><th>Store</th></tr></thead><tbody>' +
          (baris || '<tr><td colspan="4" class="c">Tidak ditemukan di pesanan yang diperiksa</td></tr>') + '</tbody></table>';
        body.appendChild(wrap);
      }).catch(function (e) {
        info.textContent = 'Gagal memeriksa pesanan: ' + e.message;
      });
    });
  }

  function openStokTerpesanPopup() {
    openPopup('Stok Terpesan', function (body) {
      body.innerHTML =
        '<div style="margin-bottom:10px;"><input id="tm-terpesan-cari" type="text" placeholder="Cari Barcode / Nama / Merek / Kategori" ' +
        'style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ccc;border-radius:4px;"></div>' +
        '<style>@keyframes tmMuat{0%{left:-40%}100%{left:100%}}</style>' +
        '<div id="tm-terpesan-info" style="margin-bottom:8px;color:#555;">' +
        '<div style="margin-bottom:6px;">Memuat data stok terpesan...</div>' +
        '<div style="position:relative;background:#e5e7eb;border-radius:4px;height:10px;overflow:hidden;">' +
        '<div style="position:absolute;top:0;height:100%;width:40%;background:#0d6efd;animation:tmMuat 1.2s linear infinite;"></div></div></div>' +
        '<div id="tm-terpesan-list" class="tm-fill"></div>';
      var input = body.querySelector('#tm-terpesan-cari');
      var info = body.querySelector('#tm-terpesan-info');
      var list = body.querySelector('#tm-terpesan-list');
      var data = [], peringatan = '';
      var urutKey = 'jumlah', urutArah = -1;
      var angka = function (v) { return Math.round(v * 100) / 100; };

      function urutkan(items) {
        return items.slice().sort(function (a, b) {
          var r = urutKey === 'jumlah' ? a.jumlah - b.jumlah : String(a[urutKey]).localeCompare(String(b[urutKey]), 'id', { numeric: true });
          return (r * urutArah) || String(a.nama).localeCompare(String(b.nama), 'id', { numeric: true });
        });
      }

      function render() {
        var q = input.value.trim().toLowerCase();
        var items = data.filter(function (r) {
          return !q || [r.barcode, r.nama, r.merek, r.kategori].some(function (x) { return String(x).toLowerCase().indexOf(q) >= 0; });
        });
        info.innerHTML = '<b>' + items.length + ' produk</b> terpesan' + (q ? ' (sesuai pencarian)' : '') +
          ' &middot; dari total ' + data.length + ' produk' + peringatan;
        if (!items.length) { list.innerHTML = '<p style="margin:0;color:#888;">Tidak ada data.</p>'; return; }
        var rowsHtml = urutkan(items).map(function (r, i) {
          return '<tr><td class="c">' + (i + 1) + '</td><td>' + escapeHtml(r.barcode) + '</td><td class="nm">' + escapeHtml(r.nama) + '</td>' +
            '<td class="n"><a href="#" class="tm-terp-link" style="color:#0d6efd;text-decoration:underline;" data-bc="' + escapeHtml(r.barcode) +
            '" data-nama="' + escapeHtml(r.nama) + '">' + angka(r.jumlah) + '</a></td></tr>';
        }).join('');
        var th = function (key, label, cls) {
          return '<th data-sort="' + key + '"' + (cls ? ' class="' + cls + '"' : '') + ' title="Klik untuk mengurutkan">' + label +
            (urutKey === key ? (urutArah > 0 ? ' &#9650;' : ' &#9660;') : '') + '</th>';
        };
        list.innerHTML = '<div class="tm-scroll"><table class="tm-tbl"><thead><tr><th class="c">No</th>' +
          th('barcode', 'Barcode') + th('nama', 'Nama Produk') + th('jumlah', 'Terpesan', 'c') +
          '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
        list.querySelectorAll('th[data-sort]').forEach(function (h) {
          h.addEventListener('click', function () {
            var k = h.getAttribute('data-sort');
            if (urutKey === k) urutArah = -urutArah; else { urutKey = k; urutArah = k === 'jumlah' ? -1 : 1; }
            render();
          });
        });
      }

      list.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('.tm-terp-link');
        if (!a) return;
        e.preventDefault();
        bukaDetailTerpesan(a.getAttribute('data-bc'), a.getAttribute('data-nama'));
      });
      input.addEventListener('input', render);
      fetchStokTerpesan().then(function (r) {
        data = r.items;
        peringatan = r.tebakKolom ? '<div style="margin-top:4px;color:#c25e00;">Header tabel ERZAP tidak terbaca, posisi kolom memakai tebakan.</div>' : '';
        render();
      }).catch(function (e) {
        info.textContent = 'Gagal mengambil data stok terpesan: ' + e.message;
      });
    });
  }

  // Popup Analisa Stok (isi popup belum ditentukan, sementara placeholder)
  function openAnalisaStokPopup() {
    openPopup('Analisa Stok', function (body) {
      body.innerHTML = '<p style="margin:0;">Isi popup Analisa Stok di sini.</p>';
    });
  }

  function startAktivasiScan() {
    openPopup('Digital Aktivasi', function (body) {
      body.innerHTML = '<div>Memuat seluruh data, mohon tunggu...</div>';
    });
    var popup = document.getElementById('tm-popup-overlay');
    // jangan munculkan lagi hasilnya kalau popup sudah ditutup (atau diganti popup lain) sebelum selesai
    var masihTampil = function () { return popup && document.body.contains(popup); };
    fetchAllAktivasi().then(function (r) {
      if (masihTampil()) renderResult(r.items, r.pages, r.tebakKolom, r.adaHarga);
    }).catch(function () {
      if (!masihTampil()) return;
      openPopup('Digital Aktivasi', function (body) {
        body.innerHTML = '<div>Gagal mengambil data dari server.</div>';
      });
    });
  }

  // ===== Inisialisasi =====
  function init() {
    addAuditStokButton();

    document.addEventListener('click', function () { if (tutupMenuAktif) tutupMenuAktif(); });

    // Tombol bisa dirender belakangan atau toolbar dirender ulang oleh ERZAP (AJAX): pantau terus dan pasang lagi bila hilang
    var terjadwal = false;
    new MutationObserver(function () {
      if (terjadwal || document.getElementById(BUTTON_ID)) return;
      terjadwal = true;
      setTimeout(function () { terjadwal = false; addAuditStokButton(); }, 200);
    }).observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
