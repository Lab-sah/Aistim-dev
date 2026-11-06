// ==UserScript==
// @name         Erzap - Sales Penjualan
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Halaman Data Penjualan (detail): tombol 'Batal' di samping 'Duplikasi Penjualan'. Halaman Pencatatan Penjualan baru (/penjualans/new): popup Draf Penjualan langsung terbuka, hanya menampilkan draf hari ini (centang bisa dimatikan). Fitur Batal dipindahkan dari penjualan.js (v1.0.3). Jika tombol Batalkan asli atau show_popup_batal tidak ada, tampil alert bahwa transaksi ini tidak bisa dibatalkan dari sini.
// @match        https://*.erzap.com/penjualans*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @world        main
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

            const m = location.pathname.match(/\/penjualans\/(\d+)/);
            const id = m ? m[1] : '';
            if (!id) return;

            const asli = document.querySelector('a[href*="/void_penjualan/"]');
            if (asli) { asli.click(); return; }

            if (typeof window.show_popup_batal === 'function') {
                const h1 = document.querySelector('.left h1');
                const km = h1 && h1.textContent.match(/Data Penjualan\s*-\s*(\S+)/);
                const kode = km ? km[1] : '';
                window.show_popup_batal(id, kode);
                return;
            }

            alert('Transaksi ini tidak bisa dibatalkan dari sini.');
        });

        const kolom = document.createElement('div');
        kolom.setAttribute('style', wrapper.getAttribute('style') || 'float:left;margin-right:10px');
        kolom.className = wrapper.className || '';
        kolom.appendChild(btnBatal);

        wrapper.parentNode.insertBefore(kolom, wrapper.nextSibling);
    }

    // Halaman Pencatatan Penjualan baru (/penjualans/new): popup Draf Penjualan langsung dibuka, sekali per buka halaman
    let drafDibuka = false;
    function bukaDrafOtomatis() {
        if (drafDibuka || !/\/penjualans\/new\/?$/.test(location.pathname)) return;
        const tombol = document.getElementById('btnDrafPenjualan');
        if (!tombol) return;
        drafDibuka = true;
        setTimeout(() => tombol.click(), 300);   // beri waktu halaman mengikat event tombolnya
    }

    // Popup Draf Penjualan: hanya baris bertanggal hari ini yang tampil (bisa dimatikan lewat centang di atas tabel)
    let hanyaHariIni = true;
    function tanggalHariIni() {
        const d = new Date();
        const dua = (n) => String(n).padStart(2, '0');
        return dua(d.getDate()) + '-' + dua(d.getMonth() + 1) + '-' + d.getFullYear();
    }
    function filterDraf() {
        document.querySelectorAll('table').forEach((tbl) => {
            const head = Array.from(tbl.querySelectorAll('thead th, thead td')).map((c) => c.textContent.trim());
            const iTgl = head.indexOf('Tanggal');
            if (iTgl < 0 || head.indexOf('No Faktur') < 0) return;      // hanya tabel draf
            if (!tbl.closest('.modal, [role="dialog"]')) return;        // hanya yang ada di popup
            const induk = tbl.parentElement;
            if (!induk) return;
            if (!induk.querySelector(':scope > .draf-hari-ini')) {
                const kotak = document.createElement('label');
                kotak.className = 'draf-hari-ini';
                kotak.style.cssText = 'display:block;margin:6px 0;font-size:13px;';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = hanyaHariIni;
                cb.addEventListener('change', () => { hanyaHariIni = cb.checked; filterDraf(); });
                kotak.appendChild(cb);
                kotak.appendChild(document.createTextNode(' Hanya tanggal hari ini (' + tanggalHariIni() + ')'));
                induk.insertBefore(kotak, tbl);
            }
            const hari = tanggalHariIni();
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                const sel = tr.children[iTgl];
                const tgl = sel ? sel.textContent.trim() : '';
                tr.style.display = (!hanyaHariIni || tgl === hari) ? '' : 'none';
            });
        });
    }

    function proses() {
        try { pasangTombolBatal(); } catch (e) { /* dicoba lagi saat halaman berubah */ }
        try { bukaDrafOtomatis(); } catch (e) { /* dicoba lagi saat halaman berubah */ }
        try { filterDraf(); } catch (e) { /* dicoba lagi saat halaman berubah */ }
    }

    proses();

    const observer = new MutationObserver(proses);
    observer.observe(document.body, { childList: true, subtree: true });
})();
