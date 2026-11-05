// ==UserScript==
// @name         ERZAP - Transfer Kas/Bank (Dropdown Cari & Format Nominal)
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  Halaman Transfer Kas/Bank: kolom Nominal berformat "Rp 3,000" (angka polos yang dikirim saat Rekam/Simpan); tampilan responsive untuk layar sempit; error field wajib hanya muncul saat Simpan ditekan. Fitur diatur lewat AKSES_JSON (admin/private/public).
// @match        https://*.erzap.com/jurnals/form_transfer_kas_bank*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (!/\/jurnals\/form_transfer_kas_bank/.test(location.pathname)) return;
  if (window.__trankasLoaded) return;
  window.__trankasLoaded = true;

  // ====== HAK AKSES & FITUR (JSON) ======
  // "admin"   -> daftar nama yang SELALU bisa memakai SEMUA fitur (public maupun private).
  // "private" -> nama fitur yang HANYA boleh dipakai "admin". Nama fitur: formatNominal, responsive, validasiSimpan.
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
    "public": ["formatNominal", "responsive", "validasiSimpan"]
  }`;

  function bacaAkses() {
    try {
      const a = JSON.parse(AKSES_JSON) || {};
      return {
        admin: Array.isArray(a.admin) ? a.admin.map(String) : [],
        public: Array.isArray(a.public) ? a.public.map(String) : [],
      };
    } catch (err) {
      console.error('[transkas] AKSES_JSON tidak valid -> akses ditutup:', err.message);
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

  /* ---------- Util ---------- */

  function formatRupiah(digits) {
    if (!digits) return '';
    return 'Rp ' + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /* ---------- CSS ---------- */

  const CSS_RESPONSIVE = `
    @media (max-width: 768px) {
      form.new_jurnal { width: 100% !important; max-width: 100% !important; box-sizing: border-box; padding: 0 12px !important; }
      .transaksi_header { display: block !important; width: 100% !important; }
      .transaksi_header > div { float: none !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
      .transaksi_header .field { width: 100% !important; float: none !important; margin-bottom: 10px; }
      .transaksi_header input, .transaksi_header select, .transaksi_header textarea { width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
    }
  `;

  function injectCss() {
    if (document.getElementById('trk-style')) return;
    const st = document.createElement('style');
    st.id = 'trk-style';
    st.textContent = bolehFitur('responsive') ? CSS_RESPONSIVE : '';
    document.head.appendChild(st);
  }

  /* ---------- Nominal Rp ---------- */

  function nominalEl() {
    return document.getElementById('jurnal_nominal');
  }

  // Tampilan: Rp 3,000,000.5 (ribuan pakai koma, desimal pakai titik, maks 2 digit desimal)
  // Nilai yang dikirim saat submit: 3000000.5 (tanpa pemisah ribuan)
  function fmtNominal(el) {
    const v = el.value.replace(/[^\d.]/g, '');
    const dot = v.indexOf('.');
    let intPart = dot >= 0 ? v.slice(0, dot).replace(/\./g, '') : v;
    let decPart = dot >= 0 ? v.slice(dot + 1).replace(/\./g, '').slice(0, 2) : null;
    intPart = intPart.replace(/^0+(?=\d)/, '');
    if (dot >= 0 && intPart === '') intPart = '0';
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    let shown = grouped;
    if (decPart !== null) shown += '.' + decPart;
    el.value = shown ? 'Rp ' + shown : '';
    el.dataset.raw = intPart ? (decPart !== null ? intPart + '.' + decPart : intPart) : '';
  }

  // Didaftarkan di window (capture) dan menghentikan event, supaya format bawaan ERZAP
  // tidak ikut mengubah nilai (itulah penyebab "Rp 300" berubah jadi "Rp 3.00")
  window.addEventListener('input', e => {
    if (e.target && e.target.id === 'jurnal_nominal' && bolehFitur('formatNominal')) { fmtNominal(e.target); e.stopImmediatePropagation(); }
  }, true);

  window.addEventListener('blur', e => {
    if (e.target && e.target.id === 'jurnal_nominal' && bolehFitur('formatNominal')) { fmtNominal(e.target); e.stopImmediatePropagation(); }
  }, true);

  // Kirim angka mentah saat form disubmit, tombol Simpan, atau tombol Rekam ditekan
  function stripForSubmit() {
    const el = nominalEl();
    if (el && bolehFitur('formatNominal')) el.value = el.dataset.raw || '';
  }

  const SAVE_SEL = '#bt_simpan,#image_simpan,#simpan_new_produk_simple';
  document.addEventListener('submit', stripForSubmit, true);
  ['pointerdown', 'mousedown', 'click'].forEach(t => {
    window.addEventListener(t, e => {
      if (e.target && e.target.closest && e.target.closest(SAVE_SEL)) stripForSubmit();
    }, true);
  });
  document.addEventListener('click', e => {
    const btn = e.target.closest && e.target.closest('button');
    if (btn && /rekam/i.test(btn.textContent)) stripForSubmit();
  }, true);

  /* ---------- Validasi: jangan tampilkan error saat field wajib masih kosong ---------- */
  // Error "Diperlukan" / "Angka harus > 0" hanya boleh muncul saat Simpan ditekan.
  // Saat pindah field, blur/focusout pada field wajib yang masih kosong dihentikan.
  function isEmptyRequired(t) {
    const f = t && t.closest && t.closest('form.new_jurnal');
    if (!f || !(t.classList.contains('required') || t.required)) return false;
    if (t.tagName === 'SELECT') return t.selectedIndex <= 0 || t.value === '';
    return (t.value || '').trim() === '' || /^Rp\s*0?$/.test(t.value || '');
  }
  ['blur', 'focusout'].forEach(type => {
    window.addEventListener(type, e => {
      if (bolehFitur('validasiSimpan') && isEmptyRequired(e.target)) e.stopImmediatePropagation();
    }, true);
  });

  /* ---------- Init ---------- */

  function init() {
    injectCss();
    const el = nominalEl();
    if (el && el.value && bolehFitur('formatNominal')) fmtNominal(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
