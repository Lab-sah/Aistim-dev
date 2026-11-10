// ==UserScript==
// @name         ERZAP - Transfer Kas/Bank (Dropdown Cari & Format Nominal)
// @namespace    http://tampermonkey.net/
// @version      1.6.0
// @description  Halaman Transfer Kas/Bank dan Kas Masuk/Keluar (kolom Sesudah, Keterangan wajib diisi, Simpan nonaktif bila saldo minus): kolom Nominal berformat "Rp 3,000" (angka polos yang dikirim saat Rekam/Simpan); saldo sesudah Kas Asal (sebelum - nominal) dan Kas Tujuan (sebelum + nominal) dihitung, dengan info penambahan Kas Tujuan; Simpan dan Rekam diblokir bila saldo Kas Asal minus; tampilan responsive untuk layar sempit; error field wajib hanya muncul saat Simpan ditekan. Fitur diatur lewat AKSES_JSON (admin/private/public).
// @match        https://*.erzap.com/jurnals/form_transfer_kas_bank*
// @match        https://*.erzap.com/jurnals/form_transaksi_kas_masuk*
// @match        https://*.erzap.com/jurnals/form_transaksi_kas_keluar*
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
  // "private" -> nama fitur yang HANYA boleh dipakai "admin". Nama fitur: formatNominal, responsive, validasiSimpan, cekSaldoMinus.
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
    "public": ["formatNominal", "responsive", "validasiSimpan", "cekSaldoMinus"]
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
    if (e.target && e.target.id === 'jurnal_nominal') hitungSaldoKas();
  }, true);

  window.addEventListener('blur', e => {
    if (e.target && e.target.id === 'jurnal_nominal' && bolehFitur('formatNominal')) { fmtNominal(e.target); e.stopImmediatePropagation(); }
  }, true);

  // Kirim angka mentah saat form disubmit, tombol Simpan, atau tombol Rekam ditekan
  function stripForSubmit() {
    // Saat diblokir (saldo Kas Asal minus) tidak ada yang terkirim, jadi kolom Nominal tetap berformat
    if (simpanDiblokir()) return;
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

  /* ---------- Saldo Kas Asal & Kas Tujuan ---------- */
  // Kas Asal:   saldo sesudah = saldo sebelum - nominal. Kalau minus: merah, ada peringatan, dan Simpan
  //             (klik, F2, Enter/submit) serta Rekam diblokir.
  // Kas Tujuan: saldo sesudah = saldo sebelum + nominal. Hanya info penambahan; kalau masih minus cuma diberi
  //             peringatan (transfer yang mengurangi minus tetap boleh disimpan).
  // Peringatan dan blokir hanya kalau Nominal > 0 dan Kas-nya sudah dipilih (saldo sebelum terisi).
  // Di tabel Informasi Saldo hanya ANGKA di kolom "Sesudah" yang ditulis (struktur tabel dan kolom "Sebelum"
  // tidak diubah). Angka itu dijaga stabil: script halaman ERZAP ikut menulis kolom ini, jadi setiap kali
  // ditimpa langsung ditulis ulang sebelum layar digambar (tidak berkedip).
  const KAS = { sebelum: 'asal_sebelum', sesudah: 'asal_sesudah_tampil', simpan: 'bt_simpan' };
  const TUJ = { sebelum: 'tujuan_sebelum', sesudah: 'tujuan_sesudah_tampil' };
  const KAS_WARNING_ID = 'kasupdate_warning';
  const TUJ_BOX_ID = 'kastujuan_box';

  const byId = id => document.getElementById(id);
  // "Rp 1,500.00" / "1500000.0" / "-13000.0" -> angka (dibulatkan 2 desimal, menghindari selisih pecahan)
  const angka = t => Math.round((parseFloat(String(t || '').replace(/[^0-9.\-]/g, '')) || 0) * 100) / 100;
  const rpFmt = n => 'Rp ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const setTeks = (el, teks) => { if (el.textContent !== teks) el.textContent = teks; };

  function nominalNum() {
    const el = nominalEl();
    if (!el) return 0;
    return angka(el.dataset.raw != null && el.dataset.raw !== '' ? el.dataset.raw : el.value);
  }

  // Hasil hitung satu kas, atau null kalau kas belum dipilih atau Nominal belum > 0
  // semua=true: tetap dihitung walau Nominal kosong/0 (untuk angka di tabel; hasilnya sama dengan saldo sebelum)
  function hitungKas(def, tanda, semua) {
    const s = byId(def.sebelum);
    const nominal = nominalNum();
    if (!s || !/\d/.test(s.textContent || '') || (!semua && !(nominal > 0))) return null;
    const sebelum = angka(s.textContent);
    return { sebelum: sebelum, nominal: nominal, sesudah: Math.round((sebelum + tanda * nominal) * 100) / 100 };
  }

  const hitungAsal = () => hitungKas(KAS, -1);
  const hitungTujuan = () => hitungKas(TUJ, 1);

  // Dicek saat dipakai (bukan dari state tombol), supaya tidak tergantung urutan timer.
  // Hanya Kas Asal yang memblokir.
  function simpanDiblokir() {
    if (!bolehFitur('cekSaldoMinus')) return false;
    const r = hitungAsal();
    return !!r && r.sesudah < 0;
  }

  function sisipSetelah(el, anchorEl) {
    const anchor = anchorEl && (anchorEl.closest('table') || anchorEl.parentElement);
    if (anchor) anchor.insertAdjacentElement('afterend', el);
  }

  function kasWarning() {
    let w = byId(KAS_WARNING_ID);
    if (!w) {
      w = document.createElement('div');
      w.id = KAS_WARNING_ID;
      w.setAttribute('role', 'alert');
      w.style.cssText = 'display:none;margin:10px 0;padding:10px 14px;border:1px solid #b91c1c;' +
        'background:#fee2e2;color:#991b1b;border-radius:6px;font-weight:600;font-size:14px;';
      sisipSetelah(w, byId(KAS.sesudah));
    }
    return w;
  }

  // Kotak info Kas Tujuan. Null kalau labelnya tidak ada di halaman (tidak membuat elemen sia-sia).
  function tujuanBox() {
    let b = byId(TUJ_BOX_ID);
    if (!b) {
      const lbl = byId(TUJ.sesudah);
      if (!lbl) return null;
      b = document.createElement('div');
      b.id = TUJ_BOX_ID;
      b.style.cssText = 'margin:10px 0;font-size:14px;';
      sisipSetelah(b, lbl);
    }
    return b;
  }

  function warnaLabel(lbl, minus) {
    lbl.style.color = minus ? '#b91c1c' : '';
    lbl.style.fontWeight = minus ? '700' : '';
  }

  // Tulis angka "Sesudah" Kas Asal dan Kas Tujuan di tabel (hanya teks angkanya)
  function tulisAngkaSesudah() {
    [[KAS, -1], [TUJ, 1]].forEach(([def, tanda]) => {
      const lbl = byId(def.sesudah);
      const r = hitungKas(def, tanda, true);
      if (lbl && r) { setTeks(lbl, rpFmt(r.sesudah)); warnaLabel(lbl, r.sesudah < 0); }
    });
  }

  // Dipantau supaya kalau ERZAP menimpa angka Sesudah, langsung ditulis ulang (observer jalan sebelum layar digambar)
  const labelDipantau = {};
  function pantauLabel() {
    [KAS.sesudah, TUJ.sesudah].forEach(id => {
      const lbl = byId(id);
      if (!lbl || labelDipantau[id] === lbl) return;
      labelDipantau[id] = lbl;
      new MutationObserver(() => { if (bolehFitur('cekSaldoMinus')) tulisAngkaSesudah(); })
        .observe(lbl, { childList: true, characterData: true, subtree: true });
    });
  }

  function renderAsal() {
    const r = hitungAsal();
    const w = byId(KAS_WARNING_ID);
    if (r && r.sesudah < 0) {
      const ww = kasWarning();
      ww.style.display = 'block';
      setTeks(ww, '⚠ Peringatan: saldo Kas Asal akan minus ' + rpFmt(r.sesudah) + '. Tombol Simpan dinonaktifkan.');
    } else if (w) {
      w.style.display = 'none';
    }
  }

  // Isi kotak Kas Tujuan hanya dibangun ulang kalau isinya berubah (tidak berkedip, alert tidak dibacakan berulang)
  function renderTujuan() {
    const r = hitungTujuan();
    const b = tujuanBox();
    if (!b) return;
    const kunci = r ? r.nominal + '|' + r.sesudah : '';
    if (b.dataset.kunci === kunci) return;
    b.dataset.kunci = kunci;
    b.innerHTML = '';
    if (!r) return;

    const info = document.createElement('div');
    info.textContent = 'ℹ Kas Tujuan bertambah +' + rpFmt(r.nominal);
    info.style.cssText = 'color:#1d4ed8;font-weight:600;';
    b.appendChild(info);
    if (r.sesudah < 0) {
      const w = document.createElement('div');
      w.textContent = '⚠ Saldo Kas Tujuan masih minus ' + rpFmt(r.sesudah) + ' setelah transfer ini (Simpan tetap bisa).';
      w.style.cssText = 'margin-top:6px;padding:10px 14px;border:1px solid #b45309;background:#fef3c7;color:#92400e;border-radius:6px;font-weight:600;';
      b.appendChild(w);
    }
  }

  function setBlokSimpan(blok) {
    const btn = byId(KAS.simpan);
    if (!btn) return;
    btn.dataset.kasupdateBlok = blok ? '1' : '';
    btn.style.pointerEvents = blok ? 'none' : '';
    btn.style.opacity = blok ? '0.35' : '';
    btn.style.cursor = blok ? 'not-allowed' : '';
    btn.title = blok ? 'Saldo Kas Asal minus, tidak bisa disimpan' : 'Simpan';
  }

  // Sekali saja di console: elemen saldo yang tidak ditemukan di halaman (ID berbeda), supaya mudah dilacak
  let sudahLapor = false;
  function laporElemen() {
    if (sudahLapor) return;
    sudahLapor = true;
    const hilang = [KAS.sebelum, KAS.sesudah, KAS.simpan, TUJ.sebelum, TUJ.sesudah, 'jurnal_nominal'].filter(id => !byId(id));
    console.log('[transkas] v1.5.4 cekSaldoMinus aktif.' + (hilang.length ? ' Elemen tidak ditemukan: ' + hilang.join(', ') : ' Semua elemen saldo ditemukan.'));
  }

  function hitungSaldoKas() {
    if (!bolehFitur('cekSaldoMinus')) return;
    laporElemen();
    pantauLabel();
    tulisAngkaSesudah();
    renderAsal();
    renderTujuan();
    setBlokSimpan(simpanDiblokir());
  }

  // Cegah simpan lewat klik Simpan, tombol Rekam, F2, atau submit (Enter) saat saldo Kas Asal minus
  document.addEventListener('click', e => {
    if (!e.target || !e.target.closest) return;
    const saveBtn = e.target.closest(SAVE_SEL);
    const btn = e.target.closest('button');
    const isRekam = btn && /rekam/i.test(btn.textContent);
    if ((saveBtn || isRekam) && simpanDiblokir()) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'F2' && simpanDiblokir()) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
  document.addEventListener('submit', e => {
    if (simpanDiblokir()) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);

  /* ---------- Init ---------- */

  function init() {
    injectCss();
    const el = nominalEl();
    if (el && el.value && bolehFitur('formatNominal')) fmtNominal(el);
    // Dihitung ulang berkala: saldo sebelum berubah saat Kas Asal dipilih, dan script halaman bisa menimpa tampilan
    setInterval(hitungSaldoKas, 300);
    hitungSaldoKas();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ===== Kas Masuk & Kas Keluar: kolom Sesudah, Keterangan wajib, Simpan nonaktif bila saldo minus =====
// Dipindah dari script terpisah (v2.0.0). Berjalan hanya di halaman Kas Masuk / Kas Keluar.
(function () {
  'use strict';
  if (!/\/jurnals\/form_transaksi_kas_(masuk|keluar)/.test(location.pathname)) return;

  var IS_KELUAR = /form_transaksi_kas_keluar/.test(location.pathname);
  var IS_MASUK = !IS_KELUAR;

  var SELECT_ID = 'jurnal_idperkiraan_kas_bank';
  var NOMINAL_ID = 'jurnal_nominal';
  var KET_ID = 'jurnal_keterangan';
  var FORM_ID = 'new_jurnal';
  var HEAD_CLASS = 'erzap-saldo-sesudah-head';
  var CELL_CLASS = 'erzap-saldo-sesudah-cell';
  var WARN_ID = 'erzap-saldo-minus-warning';
  var SAVE_ID = 'simpan';
  var SAVE_DISABLE_ID = 'simpan_disable';

  var COLOR_PLUS = '#1a7f37';
  var COLOR_MINUS = '#c0392b';

  var blocked = false;   // Kas Keluar: saldo akan minus
  var blockMsg = '';

  function parseRp(s) {
    if (s === null || s === undefined) return NaN;
    var t = String(s).replace(/Rp/i, '').replace(/\s/g, '').replace(/,/g, '');
    var n = parseFloat(t);
    return isNaN(n) ? NaN : n;
  }

  function fmtRp(n) {
    return 'Rp ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function inDialog(el) {
    return !!(el && el.closest && el.closest('.modal, dialog, [role=dialog]'));
  }

  function findSaldoTable() {
    var tables = document.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
      // Abaikan kolom "Sesudah" buatan script ini saat mencari header asli
      var ths = Array.prototype.filter.call(tables[i].querySelectorAll('thead th'),
                  function (th) { return !th.classList.contains(HEAD_CLASS); });
      if (ths.length >= 5 &&
          ths[1].textContent.trim() === 'Nama Perkiraan' &&
          ths[ths.length - 1].textContent.trim() === 'Saldo') {
        return tables[i];
      }
    }
    return null;
  }

  // Peringatan (Kas Keluar) tepat di atas tabel Saldo, di bawah judul "Saldo"
  function placeWarning(table) {
    var warn = document.getElementById(WARN_ID);
    if (!warn) {
      warn = document.createElement('div');
      warn.id = WARN_ID;
      warn.setAttribute('role', 'alert');
      warn.style.cssText = 'display:none;box-sizing:border-box;width:100%;clear:both;' +
                           'background:#fdecea;border:1px solid #e74c3c;color:#c0392b;' +
                           'padding:10px 14px;margin:0 0 10px 0;border-radius:4px;font-weight:600;text-align:left;';
    }
    if (table && warn.nextElementSibling !== table) {
      table.parentNode.insertBefore(warn, table);
    }
    return warn;
  }

  function setSaveBlocked(on) {
    var save = document.getElementById(SAVE_ID);
    var saveDis = document.getElementById(SAVE_DISABLE_ID);
    if (save) save.style.display = on ? 'none' : '';
    if (saveDis) saveDis.style.display = on ? 'block' : 'none';
    var create = document.querySelector('input[type=submit][value="Create Jurnal"]');
    if (create) create.disabled = on;
  }

  // Alasan simpan ditolak; kosong berarti boleh disimpan
  function saveIssue() {
    if (IS_KELUAR && blocked) return blockMsg;
    if (IS_MASUK) {
      var k = document.getElementById(KET_ID);
      if (k && k.value.trim() === '') return 'Keterangan wajib diisi.';
    }
    return '';
  }

  function guard(e) {
    var msg = saveIssue();
    if (!msg) return true;
    if (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    alert(msg);
    if (IS_MASUK) {
      var k = document.getElementById(KET_ID);
      if (k) k.focus();
    }
    return false;
  }

  function hookForm() {
    var form = document.getElementById(FORM_ID);
    if (!form || form.__erzapSaldoHooked) return;
    form.__erzapSaldoHooked = true;

    form.addEventListener('submit', function (e) { guard(e); }, true);

    var origSubmit = form.submit;
    form.submit = function () {
      if (!guard(null)) return;
      return origSubmit.apply(form, arguments);
    };
  }

  // Kas Masuk: Keterangan wajib diisi (tanda * merah di label)
  function markKeterangan() {
    var el = document.getElementById(KET_ID);
    if (!el) return;
    el.required = true;
    el.setAttribute('aria-required', 'true');
    var label = document.querySelector('label[for="' + KET_ID + '"]');
    if (label && !label.querySelector('.erzap-req-star')) {
      var star = document.createElement('span');
      star.className = 'erzap-req-star';
      star.textContent = '*';
      star.style.color = 'red';
      star.style.marginRight = '2px';
      label.insertBefore(star, label.firstChild);
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#simpan, input[type=submit], button');
    if (!btn || inDialog(btn)) return;
    if (btn.id === 'simpan' || btn.value === 'Create Jurnal' || /^\s*simpan\s*$/i.test(btn.textContent || '')) {
      guard(e);
    }
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'F2' && !inDialog(document.activeElement) && saveIssue()) guard(e);
  }, true);

  function renderTable() {
    var table = findSaldoTable();
    var warn = IS_KELUAR ? placeWarning(table) : null;

    if (!table) {
      if (warn) warn.style.display = 'none';
      blocked = false;
      if (IS_KELUAR) setSaveBlocked(false);
      return;
    }

    var headRow = table.querySelector('thead tr');
    if (headRow && !headRow.querySelector('.' + HEAD_CLASS)) {
      var th = document.createElement('th');
      th.className = HEAD_CLASS;
      th.textContent = 'Sesudah';
      th.style.width = 'auto';
      headRow.appendChild(th);
    }

    var sel = document.getElementById(SELECT_ID);
    var targetName = (sel && sel.selectedIndex >= 0) ? sel.options[sel.selectedIndex].text.trim() : '';
    var nominalEl = document.getElementById(NOMINAL_ID);
    var sub = parseRp(nominalEl ? nominalEl.value : '');
    if (isNaN(sub)) sub = 0;

    var sign = IS_KELUAR ? -1 : 1;
    var color = IS_KELUAR ? COLOR_MINUS : COLOR_PLUS;
    var minusValue = null;
    var minusName = '';

    var rows = table.querySelectorAll('tbody tr');
    for (var r = 0; r < rows.length; r++) {
      var tds = rows[r].children;
      if (tds.length < 5) continue;

      var nameCell = tds[1];
      var saldoCell = tds[4];
      var cell = rows[r].querySelector('.' + CELL_CLASS);
      if (!cell) {
        cell = document.createElement('td');
        cell.className = CELL_CLASS;
        rows[r].appendChild(cell);
      }

      var base = parseRp(saldoCell.textContent);
      var name = nameCell.textContent.trim();
      var isTarget = targetName !== '' && name === targetName;

      if (!isTarget) {
        // Hanya akun Asal Kas/Bank (keluar) atau Kas/Bank penerima (masuk) yang dipilih
        cell.textContent = '';
        cell.style.fontWeight = '';
        cell.style.color = '';
      } else if (isNaN(base)) {
        cell.textContent = '-';
        cell.style.fontWeight = '';
        cell.style.color = '';
      } else {
        var after = base + sign * sub;
        cell.textContent = fmtRp(after);
        cell.style.fontWeight = sub !== 0 ? 'bold' : '';
        cell.style.color = sub !== 0 ? color : '';
        if (IS_KELUAR && sub > 0 && after < 0) {
          minusValue = after;
          minusName = name;
        }
      }
    }

    if (IS_KELUAR) {
      if (minusValue !== null) {
        blocked = true;
        blockMsg = 'Saldo ' + minusName + ' tidak mencukupi. Hasil ' + fmtRp(minusValue) + ' (minus). Transaksi tidak dapat disimpan.';
        warn.textContent = 'Peringatan: saldo ' + minusName + ' tidak mencukupi. Saldo sesudah transaksi minus (' +
                           fmtRp(minusValue) + '). Tombol Simpan dinonaktifkan.';
        warn.style.display = 'block';
      } else {
        blocked = false;
        warn.style.display = 'none';
      }
      setSaveBlocked(blocked);
    }
  }

  function tick() {
    renderTable();
    hookForm();
    if (IS_MASUK) markKeterangan();
  }

  document.addEventListener('input', tick, true);
  document.addEventListener('change', tick, true);
  setInterval(tick, 500);
  tick();
})();
