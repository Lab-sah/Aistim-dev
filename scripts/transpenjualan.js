// ==UserScript==
// @name         ERZAP - Penjualan (fitur)
// @namespace    claude
// @version      5.0.0
// @description  Kumpulan fitur halaman penjualan. Fitur 1: termin_penjualan (KONSINASI nonaktif). Fitur 2: tipe_penjualan (aturan tergantung outlet). Fitur 3: meja_penjualan (hanya aktif untuk REST UP CAFE)
// @match        https://ototech.erzap.com/penjualans/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.__erzapPenjualan) return;
  window.__erzapPenjualan = true;

  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user. Kosong = tidak ada fitur untuk umum.
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua).
  //              Nama fitur: termin, tipePenjualan, mejaPenjualan.
  // "role"    -> "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil),
  //              "fitur" = fitur private yang boleh dipakai role itu.
  // Fitur yang tidak disebut di "public" maupun "private" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
  const AKSES_JSON = `{
        "public": [],
        "private": ["termin", "tipePenjualan", "mejaPenjualan"],
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

  // ------------------------------------------------------------
  // Fitur 1: termin_penjualan
  // Opsi KONSINASI di dropdown Termin dinonaktifkan.
  // ------------------------------------------------------------
  const termin_penjualan = {
    id: '1.termin_penjualan',
    enabled: true,
    fitur: 'termin',
    select: 'penjualan_idtermin',
    blocked: /^\s*(KONSINASI)\s*$/i,
    styleId: 'erzap-termin-penjualan-style',

    disableNativeOptions() {
      const sel = document.getElementById(this.select);
      if (!sel) return;
      for (const opt of sel.options) {
        if (this.blocked.test(opt.text) && !opt.disabled) {
          opt.disabled = true;
          opt.title = 'Tidak tersedia';
        }
      }
    },

    injectStyle() {
      if (document.getElementById(this.styleId)) return;
      const st = document.createElement('style');
      st.id = this.styleId;
      st.textContent = '#' + this.select + ' option:disabled{color:#8a8a8a}';
      document.head.appendChild(st);
    },

    apply() {
      if (!bolehFitur(this.fitur)) return;
      this.disableNativeOptions();
    },

    start() {
      this.injectStyle();
      this.apply();
    }
  };

  // ------------------------------------------------------------
  // Fitur 2: tipe_penjualan
  // Aturan tergantung outlet (value di select Outlet):
  // - Outlet umum (OTOTECH JOMBANG dll.): 4. Service Regular, 5. Pit Express,
  //   Bawa pulang, dan Makan di tempat nonaktif.
  // - PANDERMAN MALANG (8): hanya 1. Offline/Instore, 2. WhatsApp/Media Sosial,
  //   dan 3. Marketplace yang aktif.
  // - REST UP CAFE (9): hanya Bawa pulang dan Makan di tempat yang aktif.
  // Nilai di sini adalah value opsi Tipe Penjualan:
  // 1 Offline, 2 WhatsApp, 9 Marketplace, 3 Service Regular, 10 Pit Express,
  // 4 Bawa pulang, 5 Makan di tempat, 6 Pesan antar.
  // ------------------------------------------------------------
  const tipe_penjualan = {
    id: '2.tipe_penjualan',
    enabled: true,
    fitur: 'tipePenjualan',
    select: 'penjualan_idtipe_penjualan',
    outlet: 'penjualan_idoutlet_own',
    outletAllow: {
      '8': ['1', '2', '9'],   // PANDERMAN MALANG
      '9': ['4', '5']         // REST UP CAFE
    },
    defaultBlock: ['3', '10', '4', '5'],
    popupItem: '.trk5-pop li',
    mark: 'data-erzap-blokir',
    styleId: 'erzap-tipe-penjualan-style',

    blockedValues() {
      const sel = document.getElementById(this.select);
      const out = document.getElementById(this.outlet);
      if (!sel) return [];
      const allow = out && this.outletAllow[out.value];
      if (allow) {
        return [...sel.options].map(o => o.value).filter(v => v !== '' && !allow.includes(v));
      }
      return this.defaultBlock;
    },

    apply() {
      if (!bolehFitur(this.fitur)) return;
      const sel = document.getElementById(this.select);
      if (!sel) return;
      const blocked = this.blockedValues();

      // Dropdown bawaan browser
      for (const o of sel.options) {
        const d = blocked.includes(o.value);
        if (o.disabled !== d) o.disabled = d;
        o.title = d ? 'Tidak tersedia' : '';
      }

      // Popup dropdown kustom yang tampil saat dibuka
      const textToVal = {};
      for (const o of sel.options) textToVal[o.text.trim()] = o.value;
      document.querySelectorAll(this.popupItem).forEach(li => {
        const v = textToVal[li.textContent.trim()];
        if (v === undefined || v === '') return;
        if (blocked.includes(v)) {
          li.setAttribute(this.mark, '1');
          li.setAttribute('aria-disabled', 'true');
          li.title = 'Tidak tersedia';
        } else {
          li.removeAttribute(this.mark);
          li.removeAttribute('aria-disabled');
          li.removeAttribute('title');
        }
      });
    },

    injectStyle() {
      if (document.getElementById(this.styleId)) return;
      const st = document.createElement('style');
      st.id = this.styleId;
      st.textContent = '.trk5-pop li[' + this.mark + ']{opacity:.45 !important;color:#8a8a8a !important;cursor:not-allowed !important;background:transparent !important}';
      document.head.appendChild(st);
    },

    blockClicks() {
      document.addEventListener('click', e => {
        const li = e.target.closest && e.target.closest(this.popupItem);
        if (li && li.hasAttribute(this.mark)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          e.stopPropagation();
        }
      }, true);
    },

    // Outlet atau tipe diganti, atau dropdown dibuka: terapkan aturan ulang
    watchChanges() {
      document.addEventListener('change', e => {
        if (e.target && (e.target.id === this.outlet || e.target.id === this.select)) this.apply();
    }, true);
    document.addEventListener('mousedown', () => setTimeout(() => this.apply(), 0), true);
    },

    start() {
      this.injectStyle();
      this.blockClicks();
      this.watchChanges();
      this.apply();
    }
  };

  // ------------------------------------------------------------
  // Fitur 3: meja_penjualan
  // Dropdown Meja hanya aktif jika outlet REST UP CAFE (value 9).
  // ------------------------------------------------------------
  const meja_penjualan = {
    id: '3.meja_penjualan',
    enabled: true,
    fitur: 'mejaPenjualan',
    outlet: 'penjualan_idoutlet_own',
    meja: 'penjualan_idmeja',
    outletAllowMeja: '9', // REST UP CAFE

    apply() {
      if (!bolehFitur(this.fitur)) return;
      const out = document.getElementById(this.outlet);
      const meja = document.getElementById(this.meja);
      if (!out || !meja) return;
      const enable = out.value === this.outletAllowMeja;
      if (meja.disabled === enable) meja.disabled = !enable;
      meja.title = enable ? '' : 'Hanya untuk REST UP CAFE';
    },

    watchChanges() {
      document.addEventListener('change', e => {
        if (e.target && e.target.id === this.outlet) setTimeout(() => this.apply(), 0);
      }, true);
    },

    start() {
      this.watchChanges();
      this.apply();
    }
  };

  // ------------------------------------------------------------
  // Daftar fitur. Fitur baru ditambahkan di sini dengan nomor berikutnya.
  // -------------------------------------------------------------
  const FEATURES = [termin_penjualan, tipe_penjualan, meja_penjualan];

  const active = FEATURES.filter(f => f.enabled);
  active.forEach(f => f.start());

  // Halaman bisa me-render ulang elemen (misalnya setelah AJAX atau saat popup dibuka),
  // jadi semua fitur diterapkan ulang setiap ada perubahan DOM
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
  scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      active.forEach(f => f.apply());
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
