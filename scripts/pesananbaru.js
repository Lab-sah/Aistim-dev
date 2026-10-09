// ==UserScript==
// @name         Erzap - Rekap Pesanan Baru per Outlet (Tema Merah)
// @namespace    http://tampermonkey.net/
// @version      1.6.0
// @description  [v1.6.0] Pembersih tombol lama diperluas: tombol (warna apa pun) berteks 'Rekap Pesanan Baru' / 'Rekap Pesanan' dihapus dan dijaga terus selama halaman terbuka. [v1.5.0] Tombol 'Rekap Pesanan Baru' DIHAPUS (script kini hanya: pencarian otomatis saat outlet berubah + bersihkan tombol/badge lama). [v1.4.0] Rekap Pesanan Baru kini membaca semua halaman daftar pesanan dan menghitung pesanan yang tombol Edit-nya aktif (Edit nonaktif = bukan pesanan baru), per outlet + daftar invoice. [v1.3.1] Sembunyikan badge debug 'Aistim: ...' di pojok kanan bawah (dari content.js ekstensi). [v1.3.0] Sekaligus menghapus tombol hijau 'Rekap Pesanan' lama bawaan ekstensi di halaman Erzap mana pun (menggantikan script bersihkan_tombol_lama.js). [v1.2.6] Fix: cegah error tak jelas kalau elemen outlet bukan <select> lagi (perubahan tampilan filter outlet ERZAP)
// @author       You
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Tombol "Rekap Pesanan Baru" / "Rekap Pesanan" (merah atau hijau, sisa versi lama) dibuang. Hanya <button>/<a> yang
    // seluruh teksnya persis itu (boleh berikon/angka di belakang), sehingga elemen lain tidak tersentuh.
    const RE_TOMBOL_LAMA = /^[^a-z0-9]*rekap\s+pesanan(\s+baru)?\s*(\(\d+\))?$/i;
    function hapusTombolLama() {
        document.querySelectorAll('#btn-rekap-pesanan, button, a.btn, a[role="button"], input[type="button"]').forEach(b => {
            const teks = (b.textContent || b.value || '').replace(/\s+/g, ' ').trim();
            if (RE_TOMBOL_LAMA.test(teks)) b.remove();
        });
    }
    // Dijaga terus (ringan, maksimal 1x per 500 ms) karena script lama bisa membuat ulang tombolnya.
    let jadwalBersih = 0;
    function jagaTombolLama() {
        hapusTombolLama();
        new MutationObserver(() => {
            if (jadwalBersih) return;
            jadwalBersih = setTimeout(() => { jadwalBersih = 0; hapusTombolLama(); }, 500);
        }).observe(document.documentElement, { childList: true, subtree: true });
    }

    // Badge debug "Aistim: ..." di pojok kanan bawah (dibuat content.js ekstensi <= v2.9.8): sembunyikan lewat CSS
    // supaya tetap tersembunyi walau dibuat ulang belakangan.
    if (!document.getElementById('aistim_sembunyi_badge')) {
        const sb = document.createElement('style');
        sb.id = 'aistim_sembunyi_badge';
        sb.textContent = '#aistim-debug { display: none !important; }';
        (document.head || document.documentElement).appendChild(sb);
    }

    // @match mencakup semua halaman Erzap karena tombol lama bisa muncul di halaman mana pun.
    jagaTombolLama();
    // Di luar daftar pesanan, tugas script ini hanya membersihkan tombol lama.
    if (!/^\/pesanan_penjualans/.test(location.pathname)) return;

    // 1. Fitur Auto Search saat Outlet Berubah
    setInterval(() => {
        const outletSelect = document.querySelector('#pencarian_idoutlet_own');
        if (outletSelect && !outletSelect.hasAttribute('data-auto-search')) {
            outletSelect.setAttribute('data-auto-search', 'true');
            outletSelect.addEventListener('change', function() {
                const form = outletSelect.closest('form');
                if (form) {
                    form.submit();
                } else {
                    outletSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }
    }, 1000);
})();
