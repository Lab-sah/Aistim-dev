// ==UserScript==
// @name         ERZAP - Format Rp
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Halaman Transaksi Beban, Kas Masuk, dan Kas Keluar: kolom Jumlah / Nominal berformat "Rp 25,000" (angka polos yang dikirim ke server, boleh .00) dan Keterangan wajib diisi sebelum Simpan (Simpan, F2, dan submit diblokir bila ada baris berjumlah yang Keterangan-nya kosong). Fitur diatur lewat AKSES_JSON (public/private/role).
// @match        https://*.erzap.com/jurnals/transaksi_beban*
// @match        https://*.erzap.com/jurnals/form_transaksi_kas_masuk*
// @match        https://*.erzap.com/jurnals/form_transaksi_kas_keluar*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @run-at       document-idle
// @world        main
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__erzapBebanInit) return;
  window.__erzapBebanInit = true;

  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini. Nama fitur: formatJumlah (kolom Jumlah/Nominal), wajibKeterangan.
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua).
  // "role"    -> nama-nama role: "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
  //              cukup sebagian nama; isi nama lengkap persis seperti di ERZAP), "fitur" = fitur private yang boleh dipakai role itu.
  // Fitur yang tidak disebut di "public" maupun "private" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
  // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script dan muat ulang halaman ERZAP.
  const AKSES_JSON = `{
    "public": ["formatJumlah", "wajibKeterangan"],
    "private": [],
    "role": {
      "pusat": {
        "nama": ["SENTOT", "SURYO", "MANAJEMEN PUSAT"],
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
            fitur: Array.isArray(r.fitur) ? r.fitur.map(String) : [],
          };
        }),
      };
    } catch (err) {
      console.error('[beban] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { public: [], role: [] };
    }
  }
  const AKSES = bacaAkses();

  // dicek saat dipakai (bukan sekali di awal), karena nama kasir di pojok ERZAP bisa dimuat belakangan.
  // Role dicocokkan urut dari atas; role pertama yang namanya cocok yang menentukan.
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

  /* ========== 1. Format Rp kolom Jumlah (seperti Nominal Transfer, izinkan .00) ========== */
  (function () {
    // Kolom Jumlah per baris (Transaksi Beban) dan kolom Nominal (Kas Masuk / Kas Keluar)
    const SEL = 'input[id^="jurnal_detail"][id$="_debit"], #jurnal_nominal';
    const isJ = t => !!(t && t.matches && t.matches(SEL));
    const aktif = () => bolehFitur('formatJumlah');
    const hiddenOf = el => { const h = el.nextElementSibling; return h && h.classList.contains('rp_raw_jumlah') ? h : null; };

    // Pecah teks menjadi bagian bulat (ip) dan desimal (dp, null jika tidak ada titik)
    function parts(text) {
      const t = String(text == null ? '' : text).replace(/Rp/gi, '').replace(/\s+/g, '').replace(/,/g, '');
      const i = t.indexOf('.');
      const ip = (i >= 0 ? t.slice(0, i) : t).replace(/\D/g, '').slice(0, 15); // 15 digit: aman dari pembulatan parseInt
      const dp = i >= 0 ? t.slice(i + 1).replace(/\D/g, '').slice(0, 2) : null;
      return { ip, dp };
    }
    // Tampilan: "Rp 25,000" / "Rp 25,000." / "Rp 25,000.00"
    function fmt(p) {
      if (p.ip === '' && (p.dp === null || p.dp === '')) return '';
      const ip = p.ip === '' ? '0' : String(parseInt(p.ip, 10));
      let s = 'Rp ' + ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      if (p.dp !== null) s += '.' + p.dp;
      return s;
    }
    // Angka mentah yang dikirim ke server: "25000" atau "25000.00"
    function raw(p) {
      if (p.ip === '' && (p.dp === null || p.dp === '')) return '';
      const ip = p.ip === '' ? '0' : String(parseInt(p.ip, 10));
      return (p.dp !== null && p.dp !== '') ? ip + '.' + p.dp : ip;
    }
    function caretEnd(el) { const n = el.value.length; try { el.setSelectionRange(n, n); } catch (_) {} }

    // Nama field yang dikirim ke server. Diambil dari name asli input (apa pun polanya), lalu pola itu dipakai
    // untuk baris baru yang name-nya sudah dicopot. Cadangan terakhir: jurnal_detailN[debit].
    let polaNama = null; // mis. "jurnal_detail{n}[debit]"
    const nomorBaris = el => (el.id.match(/^jurnal_detail(\d+)_debit$/) || [])[1] || '';
    function namaHidden(el) {
      const n = nomorBaris(el);
      const asli = el.getAttribute('name');
      if (asli) {
        if (n) polaNama = asli.replace(new RegExp('(?<![0-9])' + n + '(?![0-9])'), '{n}');
        return asli;
      }
      if (polaNama && n && polaNama.indexOf('{n}') !== -1) return polaNama.replace('{n}', n);
      return el.id.replace(/^(jurnal_detail\d+)_debit$/, '$1[debit]');
    }

    // Ganti input tampilan (tanpa name) dengan hidden berisi angka mentah yang ikut dikirim ke server
    function setup(el) {
      const ada = hiddenOf(el);
      if (ada) {
        // Baris hasil salinan baris lain: hidden ikut tersalin dengan name baris asal, samakan dengan baris ini
        if (!el.getAttribute('name')) { const nm = namaHidden(el); if (ada.name !== nm) ada.name = nm; }
        return;
      }
      const p = parts(el.value);
      const h = document.createElement('input');
      h.type = 'hidden';
      h.className = 'rp_raw_jumlah';
      h.name = namaHidden(el);
      h.value = raw(p);
      el.removeAttribute('name');
      el.after(h);
      el.value = fmt(p);
    }
    function scan() { if (aktif()) document.querySelectorAll(SEL).forEach(setup); }
    function syncOne(el) { const h = hiddenOf(el); if (h) h.value = raw(parts(el.value)); }
    function syncAll() { if (aktif()) document.querySelectorAll(SEL).forEach(syncOne); }

    // Saat mengetik: format langsung
    document.addEventListener('input', e => {
      if (!isJ(e.target) || !aktif()) return;
      const el = e.target, h = hiddenOf(el); if (!h) return;
      const p = parts(el.value);
      h.value = raw(p);
      el.value = fmt(p);
      caretEnd(el);
    }, true);
    // Saat diklik/fokus: tampil format Rp, kursor di akhir
    document.addEventListener('focusin', e => {
      if (!isJ(e.target) || !aktif()) return;
      const el = e.target, h = hiddenOf(el); if (!h) return;
      // Dibaca dari kolom tampilan (bukan hidden), supaya nilai yang baru diisi script halaman tidak tertimpa nilai lama
      const p = parts(el.value);
      h.value = raw(p);
      el.value = fmt(p);
      setTimeout(() => caretEnd(el), 0);
    }, true);
    // Saat keluar fokus: titik tanpa angka dibuang, lalu simpan angka mentah
    document.addEventListener('focusout', e => {
      if (!isJ(e.target) || !aktif()) return;
      const el = e.target, h = hiddenOf(el); if (!h) return;
      const p = parts(el.value);
      if (p.dp === '') p.dp = null;
      h.value = raw(p);
      el.value = fmt(p);
    }, true);
    ['pointerdown', 'keydown', 'submit'].forEach(t => document.addEventListener(t, syncAll, true));
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });

    // Agar perhitungan PPN/PPh/total dan validasi jQuery tetap membaca angka mentah
    // (script ini jalan di @world main, jadi jQuery milik halaman bisa diakses)
    if (window.jQuery) {
      window.jQuery.valHooks.text = window.jQuery.valHooks.text || {};
      const prev = window.jQuery.valHooks.text.get;
      window.jQuery.valHooks.text.get = function (elem, name) {
        if (isJ(elem) && aktif()) return raw(parts(elem.value));
        return prev ? prev.call(this, elem, name) : undefined;
      };
    }
    scan();
  })();

  /* ========== 2. Wajib Keterangan sebelum Simpan ========== */
  (function () {
    const DEBIT_SEL = 'input[id^="jurnal_detail"][id$="_debit"]';
    const SAVE_SEL = '#bt_simpan, #simpan, #simpan_disable, #image_simpan, [title="Simpan"]';
    const aktif = () => bolehFitur('wajibKeterangan');

    // Baris yang Jumlah-nya terisi (selain 0) tetapi Keterangan-nya kosong
    function missingRows() {
      const out = [];
      if (!aktif()) return out;
      document.querySelectorAll(DEBIT_SEL).forEach(d => {
        const n = d.id.replace(/^jurnal_detail(\d+)_debit$/, '$1');
        const cleaned = String(d.value || '').replace(/Rp/gi, '').replace(/\s+/g, '').replace(/,/g, '');
        const num = parseFloat(cleaned);
        const filled = cleaned !== '' && !isNaN(num) && num !== 0;
        const ket = document.getElementById('jurnal_detail' + n + '_keterangan');
        if (filled && ket && ket.value.trim() === '') out.push({ n, ket });
      });
      return out;
    }

    // Peringatan di bawah tabel
    function warnEl() {
      let w = document.getElementById('ket_guard_warn');
      if (!w) {
        w = document.createElement('div');
        w.id = 'ket_guard_warn';
        w.setAttribute('role', 'alert');
        w.style.cssText = 'display:none;margin:8px 0;padding:8px 12px;border:1px solid #f5c2c7;background:#f8d7da;color:#842029;border-radius:4px;font-size:14px;';
        const table = document.querySelector('table');
        if (table) table.insertAdjacentElement('afterend', w);
      }
      return w;
    }

    function refresh() {
      const miss = missingRows();
      const w = warnEl();
      const bt = document.getElementById('bt_simpan');
      const icon = document.getElementById('image_simpan');
      if (miss.length) {
        const msg = 'Isi keterangan biar bisa disimpan (baris ' + miss.map(m => m.n).join(', ') + ')';
        if (w.dataset.msg !== msg) {
          w.dataset.msg = msg;
          w.textContent = '';
          const ic = document.createElement('i');
          ic.className = 'fa fa-exclamation-triangle';
          ic.style.marginRight = '6px';
          w.appendChild(ic);
          w.appendChild(document.createTextNode(msg));
        }
        w.style.display = 'block';
      } else {
        w.style.display = 'none';
      }
      const dim = miss.length ? '0.4' : '';
      if (bt) { bt.style.opacity = dim; bt.style.cursor = miss.length ? 'not-allowed' : ''; }
      if (icon) { icon.style.opacity = dim; }
      document.querySelectorAll('input[id^="jurnal_detail"][id$="_keterangan"]').forEach(k => {
        k.style.borderColor = miss.some(m => m.ket === k) ? '#dc3545' : '';
      });
      return miss;
    }

    // Blokir Simpan (klik ikon/tombol, F2, submit) bila ada Keterangan kosong
    function block(e) {
      const miss = missingRows();
      if (!miss.length) return;
      e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
      refresh();
      miss[0].ket.focus();
    }
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest(SAVE_SEL)) block(e); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'F2' || e.keyCode === 113) block(e); }, true);
    document.addEventListener('submit', e => block(e), true);
    ['input', 'focusout', 'keyup', 'change'].forEach(t => document.addEventListener(t, refresh, true));
    new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
    refresh();
  })();
})();
