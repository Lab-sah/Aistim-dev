// ==UserScript==
// @name         ERZAP - Audit Stok (Daftar Data Produk)
// @namespace    partdistro.erzap.produks
// @version      1.5.1
// @description  Menambahkan tombol Audit Stok (Stok Negatif, Cek Pemindahan, Digital Aktivasi, Stok Terpesan, Analisa Stok) di halaman Daftar Data Produk ERZAP
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
      '#tm-popup-overlay .tm-box{background:#fff;border-radius:6px;width:1100px;max-width:96vw;height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.3)}' +
      '#tm-popup-overlay .tm-head{padding:12px 16px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center}' +
      '#tm-popup-overlay .tm-x{cursor:pointer;font-size:20px;line-height:1;background:none;border:0;padding:0}' +
      '#tm-popup-overlay .tm-body{padding:16px;flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;font-size:13px;color:#333}' +
      '#tm-popup-overlay .tm-fill{flex:1;min-height:0;display:flex;flex-direction:column}' +
      '#tm-popup-overlay .tm-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}' +
      '#tm-popup-overlay .tm-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}' +
      '#tm-popup-overlay .tm-tbl th,#tm-popup-overlay .tm-tbl td{padding:5px;border-right:1px solid #ddd;border-bottom:1px solid #ddd;white-space:nowrap}' +
      '#tm-popup-overlay .tm-tbl th{background:#eef1f5;position:sticky;top:0;z-index:5;text-align:left;border-top:1px solid #ddd}' +
      '#tm-popup-overlay .tm-tbl tr>:first-child{border-left:1px solid #ddd}' +
      '#tm-popup-overlay .tm-tbl .c{text-align:center}' +
      '#tm-popup-overlay .tm-tbl .n{text-align:center;font-weight:600}' +
      '#tm-popup-overlay .tm-tbl .nm{white-space:normal;word-break:break-word}';
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

    box.appendChild(head);
    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
      if (kunciLama !== null) { document.body.style.overflow = kunciLama; kunciLama = null; }
    }
    closeX.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    if (typeof fillBody === 'function') fillBody(body);
    return body;
  }

  // ===== Digital Aktivasi: Barcode & Nama Produk dengan Kategori TOOLS + Sub Kategori AKTIVASI =====

  function renderResult(items, pages, tebakKolom) {
    var body = openPopup('Digital Aktivasi', null);
    var head =
      '<div style="margin-bottom:10px;color:#555;">Kategori: <b>' + AKTIVASI_KATEGORI +
      '</b> &middot; Sub Kategori: <b>' + AKTIVASI_SUB_KATEGORI + '</b></div>' +
      '<div style="margin-bottom:10px;"><b>Total: ' + items.length + ' produk</b> <span style="color:#888;">(' + pages + ' halaman dibaca)</span></div>';
    if (!items.length) {
      body.innerHTML = head + '<p style="margin:0;color:#888;">Tidak ada produk dengan filter ini.</p>' +
        (tebakKolom ? '<p style="margin:8px 0 0;color:#c25e00;">Header tabel ERZAP tidak terbaca, jadi posisi kolom memakai tebakan. Bila seharusnya ada produk, susunan kolom mungkin berubah.</p>' : '');
      return;
    }
    var rowsHtml = items.map(function (r, i) {
      return '<tr><td class="c">' + (i + 1) + '</td><td>' + escapeHtml(r.barcode) + '</td><td class="nm">' + escapeHtml(r.nama) + '</td></tr>';
    }).join('');
    body.innerHTML = head +
      '<div class="tm-scroll"><table class="tm-tbl">' +
      '<thead><tr><th class="c">No</th><th>Barcode</th><th>Nama Produk</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
  }

  // Posisi kolom dibaca dari header tabel supaya tidak rusak bila ERZAP menggeser kolom.
  // Bila header tidak bisa dipakai, kembali ke posisi tetap (dariHeader = false).
  function petaKolom(doc, trs) {
    var f = { barcode: 3, nama: 4, kategori: 11, sub: 12 };
    var ths = Array.prototype.slice.call(doc.querySelectorAll('thead th'));
    if (ths.length && trs.length && ths.length === trs[0].cells.length) {
      var t = ths.map(function (th) { return th.textContent.replace(/\s+/g, ' ').trim().toLowerCase(); });
      var cari = function (re) { return t.findIndex(function (x) { return re.test(x); }); };
      var g = { barcode: cari(/barcode/), nama: cari(/^nama/), kategori: cari(/^kategori/), sub: cari(/^sub\s*kategori/) };
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
        seen.set(bc + '|' + nm, { barcode: bc, nama: nm });
      });
    }
    return { items: Array.from(seen.values()), pages: pages, tebakKolom: !!peta && !peta.dariHeader };
  }

  // Popup Stok Terpesan: filter pencarian
  // Sumber data: statistik produk terpesan dari Pesanan Penjualan (SP)
  async function fetchStokTerpesan() {
    var out = [];
    var seen = {};
    for (var p = 1; p <= MAX_PAGES; p++) {
      var res = await fetch('/pesanan_penjualans/index_statistik_produk_terpesan/new?page=' + p, { credentials: 'include' });
      var doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      var trs = Array.from(doc.querySelectorAll('table tbody tr')).filter(function (tr) { return tr.querySelector('td') && tr.cells.length >= 6; });
      var added = 0;
      trs.forEach(function (tr) {
        var lines = tr.cells[1].innerText.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        var bc = lines[lines.length - 1] || '';
        var key = bc + '|' + tr.cells[2].innerText.trim();
        if (seen[key]) return;             // halaman berikutnya bisa berisi data yang sama
        seen[key] = true; added++;
        out.push({
          barcode: bc,
          nama: tr.cells[2].innerText.trim(),
          merek: tr.cells[3].innerText.trim(),
          kategori: tr.cells[4].innerText.trim(),
          jumlah: parseFloat(tr.cells[5].innerText.replace(/[^0-9.\-]/g, '')) || 0
        });
      });
      if (!added) break;
    }
    return out;
  }

  function openStokTerpesanPopup() {
    openPopup('Stok Terpesan', function (body) {
      body.innerHTML =
        '<div style="margin-bottom:10px;"><input id="tm-terpesan-cari" type="text" placeholder="Cari Barcode / Nama Produk" ' +
        'style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ccc;border-radius:4px;"></div>' +
        '<div id="tm-terpesan-info" style="margin-bottom:8px;color:#555;">Memuat data...</div>' +
        '<div id="tm-terpesan-list" class="tm-fill"></div>';
      var input = body.querySelector('#tm-terpesan-cari');
      var info = body.querySelector('#tm-terpesan-info');
      var list = body.querySelector('#tm-terpesan-list');
      var data = [];

      function render() {
        var q = input.value.trim().toLowerCase();
        var items = data.filter(function (r) {
          return !q || r.barcode.toLowerCase().indexOf(q) >= 0 || r.nama.toLowerCase().indexOf(q) >= 0;
        });
        info.innerHTML = '<b>' + items.length + ' produk</b> terpesan' + (q ? ' (sesuai pencarian)' : '') +
          ' &middot; dari total ' + data.length + ' produk';
        if (!items.length) { list.innerHTML = '<p style="margin:0;color:#888;">Tidak ada data.</p>'; return; }
        var rowsHtml = items.map(function (r, i) {
          return '<tr><td class="c">' + (i + 1) + '</td><td>' + escapeHtml(r.barcode) + '</td><td class="nm">' + escapeHtml(r.nama) + '</td><td class="n">' + r.jumlah + '</td></tr>';
        }).join('');
        list.innerHTML = '<div class="tm-scroll"><table class="tm-tbl"><thead><tr>' +
          '<th class="c">No</th><th>Barcode</th><th>Nama Produk</th><th class="c">Terpesan</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
      }

      input.addEventListener('input', render);
      fetchStokTerpesan().then(function (items) {
        data = items;
        render();
      }).catch(function () {
        info.textContent = 'Gagal mengambil data stok terpesan.';
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
      if (masihTampil()) renderResult(r.items, r.pages, r.tebakKolom);
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
