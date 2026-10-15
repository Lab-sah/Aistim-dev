// ==UserScript==
// @name         Erzap - Penjualan
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Halaman Data Penjualan (detail): tombol 'Batal' ditambahkan di samping 'Duplikasi Penjualan' -- memicu tombol 'Batalkan' bawaan Erzap (show_popup_batal) yang aslinya ada di tempat lain di halaman, supaya lebih gampang dijangkau.
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

        const asli = document.querySelector('a[href*="/void_penjualan/"]');
        if (!asli) return;

        btnBatal = document.createElement('a');
        btnBatal.className = dup.className || 'button';
        btnBatal.href = 'javascript:void(0)';
        btnBatal.style.cssText = 'background:#dc3545;color:#fff;border-color:#dc3545;';
        btnBatal.textContent = 'Batal';
        btnBatal.addEventListener('click', function (e) {
            e.preventDefault();
            asli.click();
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

    console.log('[penjualan.js] v1.0.0 aktif');
    proses();

    const observer = new MutationObserver(proses);
    observer.observe(document.body, { childList: true, subtree: true });
})();
