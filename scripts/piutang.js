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

  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user. Kosong = tidak ada fitur untuk umum.
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua).
  //              Nama fitur: potonganPiutang (seluruh script ini).
  // "role"    -> "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil),
  //              "fitur" = fitur private yang boleh dipakai role itu.
  // Fitur yang tidak disebut di "public" maupun "private" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
  const AKSES_JSON = `{
        "public": [],
        "private": ["potonganPiutang"],
        "role": {
          "pusat": {
            "nama": ["SENTOT", "SURYO", "MANAJEMEN PUSAT", "TIMORITEL"],
            "fitur": ["*"]
          }
        }
    }`;

  function bacaAkses() {
    try {
      const a = JSON.parse(AKSES_JSON) || {};
      const role = a.role && typeof a.role === 'object' ? a.role : {};
      return {
        public: Array.isArray(a.public) ? a.public.map(String) : [],
        role: Object.keys(role).map(k => {
          const r = role[k] || {};
          return {
            nama: Array.isArray(r.nama) ? r.nama.map(String) : [],
            fitur: Array.isArray(r.fitur) ? r.fitur.map(String) : []
          };
        })
      };
    } catch (err) {
      return { public: [], role: [] };
    }
  }
  const AKSES = bacaAkses();

  // dicek saat dipakai (bukan sekali di awal), karena nama kasir di pojok ERZAP bisa dimuat belakangan.
  function bolehFitur(fitur) {
    if (AKSES.public.indexOf(fitur) !== -1) return true;
    const nama = (((document.getElementById('info_kasir') || {}).textContent) || '').replace(/\s+/g, ' ').trim().toLowerCase();
    for (const r of AKSES.role) {
      const cocok = r.nama.some(u => {
        u = u.replace(/\s+/g, ' ').trim().toLowerCase();
        return !!u && nama.indexOf(u) !== -1;
      });
      if (cocok) return r.fitur.indexOf('*') !== -1 || r.fitur.indexOf(fitur) !== -1;
    }
    return false;
  }

  // Seluruh fitur script dijalankan dalam mulai(), hanya jika akses potonganPiutang diizinkan.
  function mulai() {
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
  }

  // Nama kasir di #info_kasir bisa dimuat belakangan, jadi tunggu dulu (maks 15 detik).
  // Kalau akses tidak cocok sampai batas waktu, script tidak dijalankan.
  const kasirSiap = () => (((document.getElementById('info_kasir') || {}).textContent) || '').trim() !== '';
  let coba = 0;
  const timer = setInterval(() => {
    coba++;
    if (!kasirSiap() && coba < 50) return;
    clearInterval(timer);
    if (bolehFitur('potonganPiutang')) mulai();
  }, 300);
})();
