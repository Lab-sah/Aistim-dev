// ==UserScript==
// @name         jualpiutang - Potongan Piutang (Jenis Potongan & format Rp)
// @namespace    claude
// @version      1.0.0
// @description  Form Potongan Piutang ERZAP: (1) Jenis Potongan hanya bisa memilih "Potongan Penjualan" dan "Beban Admin Marketplace"; (2) kolom Potongan tampil dengan format "Rp 1,000".
// @match        https://trial.erzap.com/penjualans/form_potongan_piutang_usaha/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- 1. Jenis Potongan: hanya opsi tertentu yang bisa dipilih ---------- */

  var JENIS_SEL = '#jurnal_jenis_potongan';
  // '' = placeholder, '11' = Potongan Penjualan, '258' = Beban Admin Marketplace
  var JENIS_ALLOWED = ['', '11', '258'];

  function jenisAllowed(v) {
    return JENIS_ALLOWED.indexOf(String(v)) !== -1;
  }

  // Kunci opsi yang tidak diizinkan (abu-abu, tidak bisa diklik).
  function lockJenis() {
    var s = document.querySelector(JENIS_SEL);
    if (s) {
      for (var i = 0; i < s.options.length; i++) {
        var o = s.options[i];
        if (jenisAllowed(o.value)) {
          o.disabled = false;
          o.removeAttribute('disabled');
        } else {
          o.disabled = true;
          o.setAttribute('disabled', 'disabled');
        }
      }
    }
    var items = document.querySelectorAll('.trk5-pop li');
    for (var j = 0; j < items.length; j++) {
      var li = items[j];
      var v = li.getAttribute('data-value');
      if (v === null) continue;
      if (jenisAllowed(v)) {
        li.style.pointerEvents = 'auto';
        li.style.cursor = 'pointer';
        li.style.opacity = '';
        li.style.color = '';
      } else {
        li.style.pointerEvents = 'none';
        li.style.cursor = 'not-allowed';
        li.style.color = '#9e9e9e';
      }
    }
  }

  // Blokir klik pada opsi yang tidak diizinkan; untuk yang diizinkan,
  // pastikan nilai select asli ikut berubah dan event change terpicu.
  document.addEventListener('click', function (e) {
    var li = e.target && e.target.closest ? e.target.closest('.trk5-pop li') : null;
    if (!li) return;
    var val = li.getAttribute('data-value');
    if (val === null) return;
    if (!jenisAllowed(val)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    setTimeout(function () {
      var s = document.querySelector(JENIS_SEL);
      if (!s) return;
      if (s.value !== val) {
        var opt = Array.prototype.find.call(s.options, function (o) { return o.value === val; });
        if (!opt) return;
        s.value = val;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 0);
  }, true);

  /* ---------- 2. Kolom Potongan: tampil "Rp 1,000" ---------- */

  var DEBIT_ID = 'jurnal_debit';

  // 1000 -> "Rp 1,000"
  function fmtRp(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    return 'Rp ' + d.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function initRp() {
    var orig = document.getElementById(DEBIT_ID);
    if (!orig || orig.getAttribute('data-rp-applied')) return;
    orig.setAttribute('data-rp-applied', '1');

    // Kolom tampilan (tanpa name, sehingga tidak ikut dikirim ke server).
    var disp = document.createElement('input');
    disp.type = 'text';
    disp.autocomplete = 'off';
    disp.id = DEBIT_ID + '_rp';
    disp.className = orig.className.replace(/\bnumber\b/, '').trim();
    disp.required = orig.required;
    orig.required = false;
    orig.style.display = 'none';
    orig.parentNode.insertBefore(disp, orig);
    disp.value = fmtRp(orig.value);

    // Saat diketik: tampilkan Rp, salin angka murni ke kolom asli,
    // lalu picu keyup/change agar hitung_saldo() di halaman berjalan.
    disp.addEventListener('input', function () {
      var digits = disp.value.replace(/\D/g, '');
      disp.value = fmtRp(digits);
      orig.value = digits;
      orig.dispatchEvent(new Event('keyup', { bubbles: true }));
      orig.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Jika nilai asli diubah oleh halaman (misal saat reset), perbarui tampilan.
    var last = orig.value;
    setInterval(function () {
      if (orig.value !== last) {
        last = orig.value;
        if (document.activeElement !== disp) disp.value = fmtRp(orig.value);
      }
    }, 300);
  }

  /* ---------- Jalankan ---------- */

  // Dropdown Jenis Potongan dibuat ulang setiap dibuka, jadi kunci ulang saat DOM berubah.
  var pending = false;
  var observer = new MutationObserver(function () {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; lockJenis(); }, 50);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  lockJenis();
  initRp();
})();
