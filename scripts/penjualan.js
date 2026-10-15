// ==UserScript==
// @name         Erzap - Penjualan
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  [v1.0.1] Tombol 'Batal' kini selalu dipasang begitu 'Duplikasi Penjualan' ketemu (sebelumnya butuh tombol 'Batalkan' asli ketemu dulu di halaman, sehingga kadang tidak muncul). Klik: coba tombol 'Batalkan' asli dulu, kalau tidak ada baru panggil show_popup_batal() langsung. [v1.0.0] Halaman Data Penjualan (detail): tombol 'Batal' di samping 'Duplikasi Penjualan'.
// @match        https://*.erzap.com/penjualans*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let btnBatal = null;

    function pasangTombolBatal() {
        if (btnBatal && document.body.contains(btnBatal)) return;

        const dup = document.querySelector('a.button[href*="copy_penjualan"]');
        if (!dup) return;
        const wrapper = dup.closest('div') || dup.parentNode;
        if (!wrapper || !wrapper.parentNode) return;

        btnBatal = document.createElement('a');
        btnBatal.className = dup.className || 'button';
        btnBatal.href = 'javascript:void(0)';
        btnBatal.style.cssText = 'background:#dc3545;color:#fff;border-color:#dc3545;';
        btnBatal.textContent = 'Batal';
        btnBatal.addEventListener('click', function (e) {
            e.preventDefault();

            const asli = document.querySelector('a[href*="/void_penjualan/"]');
            if (asli) { asli.click(); return; }

            if (typeof window.show_popup_batal === 'function') {
                const m = location.pathname.match(/\/penjualans\/(\d+)/);
                const id = m ? m[1] : '';
                const h1 = document.querySelector('.left h1');
                const km = h1 && h1.textContent.match(/Data Penjualan\s*-\s*(\S+)/);
                const kode = km ? km[1] : '';
                window.show_popup_batal(id, kode);
                return;
            }

            console.warn('[penjualan.js] tidak menemukan cara memicu Pembatalan Penjualan di halaman ini');
        });

        const kolom = document.createElement('div');
        kolom.setAttribute('style', wrapper.getAttribute('style') || 'float:left;margin-right:10px');
        kolom.className = wrapper.className || '';
        kolom.appendChild(btnBatal);

        wrapper.parentNode.insertBefore(kolom, wrapper.nextSibling);
        console.log('[penjualan.js] tombol Batal dipasang di samping Duplikasi Penjualan');
    }

    function proses() {
        try { pasangTombolBatal(); } catch (e) { console.warn('[penjualan.js] gagal pasang tombol Batal: ' + e.message); }
    }

    console.log('[penjualan.js] v1.0.1 aktif');
    proses();

    const observer = new MutationObserver(proses);
    observer.observe(document.body, { childList: true, subtree: true });
})();
