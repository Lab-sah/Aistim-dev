// ==UserScript==
// @name ERZAP - Faktur Pembelian (fitur)
// @namespace claude
// @version 1.3.1
// @description Kumpulan fitur halaman faktur pembelian. Fitur 1: termin_pembelian (KONSINASI & Tempo Marketplace tampil redup, tidak bisa dipilih)
// @match https://trial.erzap.com/faktur_pembelians/*
// @grant none
// @run-at document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.__erzapFakturPembelian) return;
  window.__erzapFakturPembelian = true;

  // ------------------------------------------------------------
  // Sistem Akses JSON (sama dengan script lain di repo ini).
  // "public"  -> fitur yang boleh dipakai SEMUA user.
  // "private" -> fitur yang dibatasi; hanya role yang "fitur"-nya berisi nama fitur itu (atau "*") yang boleh.
  // "role"    -> "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
  //              cukup sebagian nama), "fitur" = fitur private yang boleh dipakai role itu.
  // Fitur yang tidak disebut di "public" maupun "private" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // ------------------------------------------------------------
  const AKSES_JSON = `{
    "public": [],
    "private": ["termin_pembelian"],
    "role": {
        "pusat": {
            "nama": ["SENTOT ARI HANDOKO", "DIMAS", "PUGUH", "MANAJEMEN PUSAT", "SURYO", "CEO TIMORITEL", "SILVI", "WIWIT", "ISA", "ANIK"],
            "fitur": ["*"]
        },
        "cabang": {
            "nama": ["PRAMUTECH", "ADMINTECH"],
            "fitur": ["penentuanRak"]
        }
    }
  }`;
  const akses = (function () {
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
      console.error('[transpembelian] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { public: [], role: [] };
    }
  })();
  // true bila fitur boleh dipakai user yang sedang login (dicek saat dipakai, karena nama kasir dimuat belakangan)
  function bolehFitur(fitur) {
    if (akses.public.indexOf(fitur) !== -1) return true;
    const nama = String((document.getElementById('info_kasir') || {}).textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    for (const r of akses.role) {
      const cocok = r.nama.some(u => { u = u.replace(/\s+/g, ' ').trim().toLowerCase(); return !!u && nama.indexOf(u) !== -1; });
      if (cocok) return r.fitur.indexOf('*') !== -1 || r.fitur.indexOf(fitur) !== -1;
    }
    return false;
  }

  // ------------------------------------------------------------
  // Fitur 1: termin_pembelian
  // Opsi KONSINASI dan Tempo Marketplace di dropdown Termin tetap tampil,
  // tetapi redup dan tidak bisa dipilih.
  // ------------------------------------------------------------
  const termin_pembelian = {
    id: '1.termin_pembelian',
    fitur: 'termin_pembelian',
    enabled: true,
    select: 'faktur_pembelian_idtermin',
    blocked: /^\s*(KONSINASI|Tempo Marketplace)\s*$/i,
    popupItem: '.trk5-pop li',
    mark: 'data-erzap-blokir',
    styleId: 'erzap-termin-pembelian-style',

    disableNativeOptions() {
      const sel = document.getElementById(this.select);
      if (!sel) return;
      for (const opt of sel.options) {
        if (this.blocked.test(opt.text) && !opt.disabled) opt.disabled = true;
      }
    },

    markPopupItems() {
      document.querySelectorAll(this.popupItem).forEach(li => {
        if (this.blocked.test(li.textContent) && !li.hasAttribute(this.mark)) {
          li.setAttribute(this.mark, '1');
          li.setAttribute('aria-disabled', 'true');
          li.title = 'Tidak tersedia';
        }
      });
    },

    injectStyle() {
      if (document.getElementById(this.styleId)) return;
      const st = document.createElement('style');
      st.id = this.styleId;
      st.textContent = '.trk5-pop li[' + this.mark + ']{display:list-item !important;opacity:.45 !important;color:#8a8a8a !important;cursor:not-allowed !important;background:transparent !important}';
      document.head.appendChild(st);
    },

    blockClicks() {
      document.addEventListener('click', e => {
        if (!bolehFitur(this.fitur)) return;
        const li = e.target.closest && e.target.closest(this.popupItem);
        if (li && this.blocked.test(li.textContent)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          e.stopPropagation();
        }
      }, true);
    },

    apply() {
      if (!bolehFitur(this.fitur)) return;
      this.disableNativeOptions();
      this.markPopupItems();
    },

    start() {
      this.injectStyle();
      this.blockClicks();
      this.apply();
    }
  };

  // ------------------------------------------------------------
  // Daftar fitur. Fitur baru ditambahkan di sini dengan nomor berikutnya.
  // ------------------------------------------------------------
  const FEATURES = [termin_pembelian];

  const active = FEATURES.filter(f => f.enabled);
  active.forEach(f => f.start());

  // Halaman bisa me-render ulang elemen (misalnya setelah AJAX atau saat dropdown dibuka),
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
