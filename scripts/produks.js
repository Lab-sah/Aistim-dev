// ==UserScript==
// @name         ERZAP - Audit Stok (Daftar Data Produk)
// @namespace    partdistro.erzap.produks
// @version      1.1.0
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
  var SCAN_KEY = 'tm-aktivasi-scan';   // status scan disimpan di sessionStorage (bertahan saat halaman dimuat ulang)
  var MAX_PAGES = 200;

  // Pilihan yang muncul setelah tombol Audit Stok diklik (ubah url sesuai kebutuhan)
  var MENU_ITEMS = [
    {
      label: 'Stok Negatif',
      url: '/laporans/rekap_stok/new',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 18l-9.5-9.5-5 5L1 6"/><polyline points="17 18 23 18 23 12"/></svg>'
    },
    {
      label: 'Cek Pemindahan',
      url: '/pemindahan_barangs',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>'
    },
    {
      label: 'Digital Aktivasi',
      popup: true,   // tampilkan popup, bukan pindah halaman
      action: 'aktivasi',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>'
    },
    {
      label: 'Stok Terpesan',
      popup: true,
      action: 'terpesan',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="16" x2="13" y2="16"/></svg>'
    },
    {
      label: 'Analisa Stok',
      popup: true,
      action: 'analisa',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
    }
  ];

  var BUTTON_ID = 'tm-btn-audit-stok';

  // ===== Helper umum =====
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function findAnchorButton() {
    var candidates = document.querySelectorAll('a, button');
    for (var i = 0; i < candidates.length; i++) {
      if ((candidates[i].textContent || '').replace(/\s+/g, ' ').trim() === ANCHOR_TEXT) {
        return candidates[i];
      }
    }
    return null;
  }

  // ===== Tombol & menu Audit Stok =====
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
      if (idx > 0) li.style.borderTop = '1px solid rgba(255,255,255,.4)';

      var a = document.createElement('a');
      a.href = item.popup ? '#' : item.url;
      if (item.popup) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          menu.style.display = 'none';
          btn.style.background = BUTTON_COLOR;
          btn.style.borderColor = BUTTON_COLOR;
          if (item.action === 'analisa') {
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
      menu.style.display = open ? 'none' : 'block';
      btn.style.background = open ? BUTTON_COLOR : BUTTON_COLOR_HOVER;
      btn.style.borderColor = btn.style.background;
    });

    // Tutup menu jika klik di luar
    document.addEventListener('click', function () {
      if (menu.style.display === 'block') {
        menu.style.display = 'none';
        btn.style.background = BUTTON_COLOR;
        btn.style.borderColor = BUTTON_COLOR;
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    anchor.insertAdjacentElement('afterend', wrap);
    return true;
  }

  // ===== Popup umum =====
  function openPopup(title, fillBody) {
    var overlay = document.getElementById('tm-popup-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'tm-popup-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;' +
      'display:flex;align-items:center;justify-content:center;';

    var box = document.createElement('div');
    box.style.cssText =
      'background:#fff;border-radius:8px;width:min(560px,92vw);max-height:80vh;overflow:auto;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.3);font-family:system-ui,sans-serif;';

    var head = document.createElement('div');
    head.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;' +
      'background:' + BUTTON_COLOR + ';color:#fff;border-radius:8px 8px 0 0;';
    head.innerHTML = '<strong>' + escapeHtml(title) + '</strong>';

    var closeX = document.createElement('button');
    closeX.type = 'button';
    closeX.textContent = '×';
    closeX.style.cssText = 'background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;';
    head.appendChild(closeX);

    var body = document.createElement('div');
    body.id = 'tm-popup-body';
    body.style.cssText = 'padding:16px;color:#333;font-size:14px;';

    var foot = document.createElement('div');
    foot.style.cssText = 'padding:0 16px 16px;text-align:right;';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-default';
    closeBtn.textContent = 'Tutup';
    foot.appendChild(closeBtn);

    box.appendChild(head);
    box.appendChild(body);
    box.appendChild(foot);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close() { overlay.remove(); }
    closeX.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    if (typeof fillBody === 'function') fillBody(body);
    return body;
  }

  // ===== Digital Aktivasi: Barcode & Nama Produk dengan Kategori TOOLS + Sub Kategori AKTIVASI =====

  // Membaca baris tabel produk yang sedang tampil di halaman
  function readTableRows() {
    var out = [];
    document.querySelectorAll('table.dataTable tbody tr').forEach(function (tr) {
      var c = tr.cells;
      if (!c || c.length < 15) return;
      out.push({
        barcode: c[5].innerText.trim(),
        nama: c[6].innerText.trim(),
        kategori: c[13].innerText.trim().toUpperCase(),
        sub: c[14].innerText.trim().toUpperCase()
      });
    });
    return out;
  }

  function findNextButton() {
    var el = document.querySelector('a.pagination_next');
    if (el && /Berikutnya/.test(el.textContent || '')) return el;
    var els = document.querySelectorAll('a, button');
    for (var i = 0; i < els.length; i++) {
      if (/Berikutnya/.test(els[i].textContent || '')) return els[i];
    }
    return null;
  }

  function isDisabled(el) {
    var li = el.closest('li');
    return el.classList.contains('disabled') || (li && li.classList.contains('disabled'));
  }

  function loadState() {
    try { return JSON.parse(sessionStorage.getItem(SCAN_KEY)) || null; } catch (e) { return null; }
  }
  function saveState(st) {
    try { sessionStorage.setItem(SCAN_KEY, JSON.stringify(st)); } catch (e) {}
  }
  function clearState() {
    try { sessionStorage.removeItem(SCAN_KEY); } catch (e) {}
  }

  function renderResult(items, pages) {
    var body = openPopup('Digital Aktivasi', null);
    var head =
      '<div style="margin-bottom:10px;color:#555;">Kategori: <b>' + AKTIVASI_KATEGORI +
      '</b> &middot; Sub Kategori: <b>' + AKTIVASI_SUB_KATEGORI + '</b></div>' +
      '<div style="margin-bottom:10px;"><b>Total: ' + items.length + ' produk</b> <span style="color:#888;">(' + pages + ' halaman dibaca)</span></div>';
    if (!items.length) {
      body.innerHTML = head + '<p style="margin:0;color:#888;">Tidak ada produk dengan filter ini.</p>';
      return;
    }
    var rowsHtml = items.map(function (r, i) {
      return '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">' + (i + 1) + '</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;">' + escapeHtml(r.barcode) + '</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;">' + escapeHtml(r.nama) + '</td></tr>';
    }).join('');
    body.innerHTML = head +
      '<div style="max-height:380px;overflow:auto;border:1px solid #eee;border-radius:4px;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead><tr style="background:#f5f5f5;text-align:left;">' +
      '<th style="padding:6px 8px;">No</th><th style="padding:6px 8px;">Barcode</th><th style="padding:6px 8px;">Nama Produk</th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
  }

  // Membaca halaman yang sedang tampil, lalu lanjut ke halaman berikutnya.
  // Halaman bisa dimuat ulang saat pindah halaman, jadi status disimpan di sessionStorage
  // dan proses dilanjutkan otomatis setelah halaman dimuat ulang.
  async function scanStep() {
    var st = loadState();
    if (!st || !st.active) return;

    var rows = readTableRows();
    if (!rows.length) { await sleep(800); rows = readTableRows(); }
    var firstBefore = rows.length ? rows[0].barcode : null;

    var seen = new Map();
    st.rows.forEach(function (r) { seen.set(r.barcode + '|' + r.nama, r); });
    rows.forEach(function (r) {
      if (r.kategori === AKTIVASI_KATEGORI && r.sub === AKTIVASI_SUB_KATEGORI) {
        seen.set(r.barcode + '|' + r.nama, { barcode: r.barcode, nama: r.nama });
      }
    });
    st.rows = Array.from(seen.values());
    st.pages = (st.pages || 0) + 1;
    saveState(st);

    var next = findNextButton();
    if (!next || isDisabled(next) || st.pages >= MAX_PAGES) {
      clearState();
      renderResult(st.rows, st.pages);
      return;
    }

    next.click();

    // Jika tabel berubah tanpa muat ulang, lanjutkan langsung
    for (var k = 0; k < 10; k++) {
      await sleep(300);
      var now = readTableRows();
      if (now.length && now[0].barcode !== firstBefore) {
        return scanStep();
      }
    }
    // Jika tidak berubah, halaman kemungkinan dimuat ulang; scanStep dijalankan lagi saat load berikutnya
  }

  // Mengambil semua halaman langsung dari server (fetch), tanpa pindah halaman
  async function fetchAllAktivasi() {
    var base = 'produk_simple[idproduk_kategori]=' + KATEGORI_ID +
      '&produk_simple[idproduk_sub_kategori]=' + SUB_KATEGORI_ID;
    var seen = new Map();
    var pages = 0;
    for (var p = 1; p <= MAX_PAGES; p++) {
      var res = await fetch('/produks/index/new?page=' + p + '&' + base, { credentials: 'include' });
      var doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      var trs = Array.from(doc.querySelectorAll('tr')).filter(function (tr) {
        return tr.querySelector('td') && tr.cells.length >= 20;
      });
      if (!trs.length) break;
      pages++;
      trs.forEach(function (tr) {
        if (tr.cells[11].innerText.trim().toUpperCase() !== AKTIVASI_KATEGORI) return;
        if (tr.cells[12].innerText.trim().toUpperCase() !== AKTIVASI_SUB_KATEGORI) return;
        var lines = tr.cells[3].innerText.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        var bc = lines[lines.length - 1];
        var nm = tr.cells[4].innerText.trim();
        seen.set(bc + '|' + nm, { barcode: bc, nama: nm });
      });
    }
    return { items: Array.from(seen.values()), pages: pages };
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
        '<div id="tm-terpesan-list"></div>';
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
          return '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">' + (i + 1) + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;">' + escapeHtml(r.barcode) + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:normal;word-break:break-word;min-width:260px;">' + escapeHtml(r.nama) + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">' + r.jumlah + '</td></tr>';
        }).join('');
        // Header tetap (sticky) saat tabel di-scroll; nama produk turun ke bawah (wrap)
        list.innerHTML = '<div style="max-height:380px;overflow:auto;border:1px solid #eee;border-radius:4px;">' +
          '<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f5f5f5;text-align:left;">' +
          '<th style="padding:6px 8px;position:sticky;top:0;background:#fff;box-shadow:0 1px 0 #dee2e6;z-index:2;">No</th>' +
          '<th style="padding:6px 8px;position:sticky;top:0;background:#fff;box-shadow:0 1px 0 #dee2e6;z-index:2;">Barcode</th>' +
          '<th style="padding:6px 8px;position:sticky;top:0;background:#fff;box-shadow:0 1px 0 #dee2e6;z-index:2;">Nama Produk</th>' +
          '<th style="padding:6px 8px;text-align:center;position:sticky;top:0;background:#fff;box-shadow:0 1px 0 #dee2e6;z-index:2;">Terpesan</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
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
    clearState();
    openPopup('Digital Aktivasi', function (body) {
      body.innerHTML = '<div>Memuat seluruh data, mohon tunggu...</div>';
    });
    fetchAllAktivasi().then(function (r) {
      renderResult(r.items, r.pages);
    }).catch(function () {
      openPopup('Digital Aktivasi', function (body) {
        body.innerHTML = '<div>Gagal mengambil data dari server.</div>';
      });
    });
  }

  // ===== Inisialisasi =====
  function init() {
    addAuditStokButton();

    // Lanjutkan scan jika halaman dimuat ulang di tengah proses
    var st = loadState();
    if (st && st.active) {
      openPopup('Digital Aktivasi', function (body) {
        body.innerHTML = '<div>Memuat seluruh data, mohon tunggu...</div>';
      });
      scanStep();
    }

    if (!document.getElementById(BUTTON_ID)) {
      // Tombol bisa dirender belakangan (AJAX), pantau DOM sampai tombol tersedia
      var observer = new MutationObserver(function () {
        if (addAuditStokButton()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { observer.disconnect(); }, 15000);
    }
  }

  init();
})();
