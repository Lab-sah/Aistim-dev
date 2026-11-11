// ==UserScript==
// @name ERZAP - Faktur Pembelian (fitur)
// @namespace claude
// @version 1.3.0
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
  // Fitur 1: termin_pembelian
  // Opsi KONSINASI dan Tempo Marketplace di dropdown Termin tetap tampil,
  // tetapi redup dan tidak bisa dipilih.
  // ------------------------------------------------------------
  const termin_pembelian = {
    id: '1.termin_pembelian',
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
        const li = e.target.closest && e.target.closest(this.popupItem);
        if (li && this.blocked.test(li.textContent)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          e.stopPropagation();
        }
      }, true);
    },

    apply() {
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
