// ==UserScript==
// @name         ERZAP - Data Deposit Pelanggan
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  Pengurangan Deposit: tombol Proses nonaktif bila Nominal lebih besar dari Total Deposit. Penambahan Deposit: tombol Proses nonaktif bila Nominal 0 atau kosong. Nominal otomatis berformat Rp 1,000.00
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window.__depositGuardLoaded) return;
  window.__depositGuardLoaded = true;

  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini.
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua). Nama fitur: penguranganDeposit, penambahanDeposit.
  // "role"    -> nama-nama role: "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
  //              cukup sebagian nama; isi nama lengkap persis seperti di ERZAP), "fitur" = fitur private yang boleh dipakai role itu.
  // Fitur yang tidak disebut di "public" maupun "private" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
  // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script dan muat ulang halaman ERZAP.
  const AKSES_JSON = `{
    "public": [],
    "private": ["penguranganDeposit", "penambahanDeposit"],
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
      console.error('[deposit] AKSES_JSON tidak valid -> akses ditutup:', err.message);
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

  // ---------- helpers ----------
  function getTotalDeposit() {
    const m = document.body.innerText.match(/Total Deposit:\s*Rp\s*([\d.,]+)/);
    return m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
  }

  // Nominal berformat "1,000.00": ambil angka sebelum suffix ".00"
  function parseNominal(raw) {
    return parseFloat(String(raw || '').replace(/\.\d*$/, '').replace(/\D/g, '')) || 0;
  }

  // Mode ditentukan dari judul modal yang sedang tampil, bukan dari elemen input.
  // Modal bisa memakai ulang elemen input yang sama, jadi aturan tidak boleh terkunci di sana.
  function getOpenModalMode() {
    const modals = document.querySelectorAll('.modal.show');
    for (let i = 0; i < modals.length; i++) {
      const text = modals[i].innerText;
      if (text.indexOf('Pengurangan Deposit Pelanggan') !== -1) return { modal: modals[i], mode: 'pengurangan' };
      if (text.indexOf('Penambahan Deposit Pelanggan') !== -1) return { modal: modals[i], mode: 'penambahan' };
    }
    return null;
  }

  function findField(modal, labelText) {
    const labels = modal.querySelectorAll('label, span, div');
    for (let i = 0; i < labels.length; i++) {
      const el = labels[i];
      if (el.childElementCount === 0 && el.textContent.trim() === labelText) {
        return el.parentElement.querySelector('input') || el.nextElementSibling;
      }
    }
    return null;
  }

  function findProsesButton(modal) {
    const buttons = modal.querySelectorAll('button');
    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i].textContent.trim() === 'Proses') return buttons[i];
    }
    return null;
  }

  function setButtonState(btn, disabled) {
    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.5' : '';
    btn.style.cursor = disabled ? 'not-allowed' : '';
  }

  // ---------- nilai yang dikirim ke server harus angka polos ----------
  // Tampilan "10,000.00" dipotong jadi "10.00" oleh aplikasi, jadi sebelum Proses
  // (atau submit form) value diubah ke "10000.00" tanpa pemisah ribuan.
  function toPlainNominal(nom) {
    if (!nom || !nom.__depositFormat) return;
    nom.value = String(parseNominal(nom.value)) + '.00';
  }

  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!btn || btn.disabled || btn.textContent.trim() !== 'Proses') return;
    const modal = btn.closest('.modal');
    if (!modal) return;
    toPlainNominal(findField(modal, 'Nominal'));
  }, true);

  // ---------- format input Nominal saat diketik ----------
  function formatNominalField(nom) {
    if (nom.__depositFormat) return;
    nom.__depositFormat = true;
    if (nom.form) nom.form.addEventListener('submit', () => toPlainNominal(nom), true);

    // Prefix "Rp" ditampilkan sebagai label di luar input, bukan di dalam value.
    // Validasi angka bawaan aplikasi menolak huruf, jadi value hanya berisi "1,000.00".
    const wrap = nom.parentElement;
    if (wrap && getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    const prefix = document.createElement('span');
    prefix.textContent = 'Rp';
    prefix.style.cssText = 'position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:#555;';
    nom.style.paddingLeft = '34px';
    if (wrap) wrap.insertBefore(prefix, nom);

    // minus dan huruf tidak bisa masuk
    nom.addEventListener('keydown', (e) => {
      if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
    });

    nom.addEventListener('input', () => {
      // suffix ".00" dianggap bagian format; angka diketik sebelum suffix tersebut
      const raw = nom.value;
      const base = /\.00$/.test(raw) ? raw.slice(0, -3) : raw;
      const digits = base.replace(/\D/g, '');
      const formatted = digits === '' ? '' : Number(digits).toLocaleString('en-US') + '.00';
      if (nom.value !== formatted) nom.value = formatted;
      const pos = formatted === '' ? 0 : formatted.length - 3;
      nom.setSelectionRange(pos, pos);
    });
  }

  // ---------- aturan Proses sesuai mode modal yang aktif ----------
  function applyRule(nom, btn, mode, showPopup) {
    if (mode === 'pengurangan') {
      const total = getTotalDeposit();
      const value = parseNominal(nom.value);
      const over = value > total;
      setButtonState(btn, over);
    } else if (mode === 'penambahan') {
      setButtonState(btn, parseNominal(nom.value) <= 0);
    }
  }

  // Pasang listener sekali per elemen; aturan yang dipakai dibaca ulang setiap kejadian.
  function bindOnce(nom, btn) {
    if (!nom.__depositBound) {
      nom.__depositBound = true;
      const current = () => {
        const open = getOpenModalMode();
        return open ? open.mode : null;
      };
      nom.addEventListener('input', () => { const m = current(); if (m) applyRule(nom, findProsesButton(nom.closest('.modal')) || btn, m, false); });
      nom.addEventListener('change', () => { const m = current(); if (m) applyRule(nom, findProsesButton(nom.closest('.modal')) || btn, m, true); });
      nom.addEventListener('blur', () => { const m = current(); if (m) applyRule(nom, findProsesButton(nom.closest('.modal')) || btn, m, true); });
    }
    if (!btn.__depositBound) {
      btn.__depositBound = true;
      btn.addEventListener('click', (e) => {
        const open = getOpenModalMode();
        if (open) applyRule(nom, btn, open.mode, false);
        if (btn.disabled) {
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      }, true);
    }
  }

  // ---------- polling: sinkronkan tombol dengan modal yang tampil (hanya bila fitur diizinkan) ----------
  setInterval(() => {
    const open = getOpenModalMode();
    if (!open) return;
    if (!bolehFitur(open.mode === 'pengurangan' ? 'penguranganDeposit' : 'penambahanDeposit')) return;
    const nom = findField(open.modal, 'Nominal');
    const btn = findProsesButton(open.modal);
    if (!nom || !btn) return;
    formatNominalField(nom);
    bindOnce(nom, btn);
    applyRule(nom, btn, open.mode, false);
  }, 300);
})();
