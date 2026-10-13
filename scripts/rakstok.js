// ==UserScript==
// @name         Lihat Stok - Kolom Rak
// @namespace    http://tampermonkey.net/
// @version      1.17.14
// @description  Lihat Stok: kolom Rak (tulisan "Map rak", klik untuk popup daftar rak per toko/gudang dari Penempatan Rak), ikon logo PartDistro di kolom Nama (gambar produk baru dimuat & tampil di popup saat ikon diklik), tombol panah di kolom Harga Jual untuk melihat harga jual per pelanggan (Basic dst., diambil dari tab harga di detail produk), dan kolom Nama yang responsif (teks panjang turun ke bawah, tidak terpotong).
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/new*
// @match        https://*.erzap.com/produks/*/edit*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ---------- halaman edit produk (/produks/<id>/edit): tombol "Edit gambar" di popup membuka halaman ini dengan
    // alamat berakhiran #tab_produk_gambar -> tab "Gambar" langsung dibuka, tinggal pilih/unggah gambar ----------
    if (/^\/produks\/[^/]+\/edit\/?$/.test(location.pathname)) {
        // Tombol "Pilih Gambar untuk diunggah": browser TIDAK mengizinkan jendela pilih-file terbuka sendiri tanpa klik pengguna
        // (tab baru belum punya "aktivasi pengguna"), jadi tombolnya disorot dan diberi fokus; pengguna tinggal klik / tekan Enter.
        // Kalau halaman kebetulan masih punya aktivasi pengguna, jendela pilih-file dibuka langsung.
        const siapkanPilihGambar = (pane) => {
            const mulaiCari = Date.now();
            const cari = () => {
                const root = pane || document;
                const label = Array.from(root.querySelectorAll('label')).find((l) => /pilih\s+gambar/i.test(l.textContent)) ||
                    root.querySelector('label[for="fileupload"]');
                const input = document.getElementById('fileupload');
                if (!label && !input) {
                    if (Date.now() - mulaiCari < 8000) setTimeout(cari, 250);
                    return;
                }
                const st = document.createElement('style');
                st.textContent = '@keyframes rk_denyut { 0%,100% { box-shadow: 0 0 0 0 rgba(13,110,253,.55); } 50% { box-shadow: 0 0 0 10px rgba(13,110,253,0); } }' +
                    '.rk_sorot { outline: 3px solid #0d6efd !important; outline-offset: 2px; animation: rk_denyut 1.2s ease-in-out 5; }' +
                    '#rk_petunjuk_unggah { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 99999; background: #0d6efd; color: #fff;' +
                    ' padding: 8px 14px; border-radius: 6px; font-size: 13px; box-shadow: 0 4px 14px rgba(0,0,0,.3); }';
                document.head.appendChild(st);
                const sasaran = label || input;
                sasaran.classList.add('rk_sorot');
                if (sasaran.scrollIntoView) sasaran.scrollIntoView({ block: 'center' });
                const aktif = navigator.userActivation && navigator.userActivation.isActive;
                if (aktif && input) { try { input.click(); return; } catch (e) { /* lanjut ke petunjuk */ } }
                const tip = document.createElement('div');
                tip.id = 'rk_petunjuk_unggah';
                tip.textContent = 'Klik "Pilih Gambar" yang bergaris biru untuk memilih file gambar';
                document.body.appendChild(tip);
                setTimeout(() => tip.remove(), 8000);
                const hapus = () => { sasaran.classList.remove('rk_sorot'); tip.remove(); };
                sasaran.addEventListener('click', hapus, { once: true });
                if (input && input.focus) { try { input.focus({ preventScroll: true }); } catch (e) { /* input tersembunyi: abaikan */ } }
            };
            cari();
        };
        if (location.hash === '#tab_produk_gambar') {
            const mulai = Date.now();
            const coba = () => {
                const tab = document.getElementById('produk-gambar-tab');
                if (tab) {
                    if (!tab.classList.contains('active')) tab.click(); // tab Bootstrap (data-bs-toggle="tab")
                    const pane = document.getElementById('tab_produk_gambar');
                    if (pane && pane.scrollIntoView) pane.scrollIntoView({ block: 'start' });
                    siapkanPilihGambar(pane);
                    return;
                }
                if (Date.now() - mulai < 10000) setTimeout(coba, 200); // halaman belum selesai dirender
            };
            coba();
        }
        return; // sisa skrip hanya untuk halaman Lihat Stok
    }

    const TABLE_SEL = '#data_table_produk';
    const CACHE_KEY = 'aistim_rak_cache_v3';
    const CACHE_TTL = 60 * 60 * 1000; // 1 jam
    const MAKS_GUDANG = 8;            // batas request aktifitas per produk

    // ---------- cache (localStorage, aman kalau diblokir) ----------
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
    // buang entri kedaluwarsa saat dimuat (bukan hanya saat menyimpan)
    Object.keys(cache).forEach((k) => { if (!cache[k] || Date.now() - cache[k].t > CACHE_TTL) delete cache[k]; });
    let saveTimer = null;
    function saveCache() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                const now = Date.now();
                Object.keys(cache).forEach((k) => { if (now - cache[k].t > CACHE_TTL) delete cache[k]; });
                localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            } catch (e) { /* abaikan */ }
        }, 500);
    }

    // logo PartDistro sebagai ikon gambar produk (sebelum foto termuat / bila tanpa foto)
    const LOGO_IKON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAPFBMVEVHcEztHCT////sAATtHCTtHCTtHCTtHCTtHCTtHCTtEhzwTVH4ubruNDn6y8zzf4H83t/+8vLyaGz1m50cRTncAAAACnRSTlMA////pHz73ii9DsDuxAAAAnVJREFUWIXNl9uaoyAMgJW0ajkf3v9dN1i/kQhB3LnYzcWMRfMTIAnJNB2yvT/rPCjr571NVLZh5UOWlSBeD9V3eZ36T6c/ZB3Qlyi3BMZ+CQBSoUB+aH+zr2Jj1E2y4hCbDIPYmAVIcF4Q8a6JWNsGQAyikhChacK7Mb2t1bPo2ojlPX0qfdOY/jDCVIRPtQXScOpZKsI6PdJvEK4AYO0/VnHdyQsAdF8/72QPIOOdvhBRdgCXBeiY3ThSqy6LIABw1NjvuWNQEISTPKD0XwcM2QMHIEfoyGeEQI6yBEDiN7tcRQIOUMRA5bPyfGdZQGANICYEFnBOEmsLChdhAOUetpJHexdLgGrPUdun/g3gt0sY2cQuYOAYb5ZwvuQcqQsovZRz5R6ABBN5MwSQZZjx4cwApISZ3DSRSygEcIpx9KLybEorAR1RbFIdA3TS+hDAdy6WEUCYO1fbAKBxPT8C+EbF9QTQKDCeALxqJYlhgI1MnTYCCNbNXKVYFRhXMWbO/sx/cAeozv0x4E7+A8BS/ir3Cwv9vUz/DpzbSM9jIYUmJGv13iKgcozKWuvAm/w7me+wnC3JSCspdcF7F/TszKyM8jaKpEXUUjl0EWdMlMbJGEhW/5BiG3wC64UVmEN1CAkzm9fC4YAW+IBPXhhHIvJNyv29yIo4rUZVq9X+F2k2gTDaZ76nEbVspOHIr/EGUDj9AZhx1ugSDhlrcQgCuVX2rmmjAJntzBbgxDmIABEh4N2uLWCwBOqZW6PpAvNdJOTskU8VMzt8Dw9vCBoVr2bbJ3/8//r/KiONY09+9H/f+v5F8z2vVf+O7f9yr5dlKdv/P98nJyMLRjJkAAAAAElFTkSuQmCC';

    const style = document.createElement('style');
    style.textContent = `
        /* Kolom Rak sempit: lebar hanya sebesar tulisan "Map rak" */
        /* lebar dikunci hanya di tabel isi; header mengikuti lebar kolom isi lewat syncWidths supaya selalu sejajar */
        #data_table_produk .rk_th, #data_table_produk .rk_cell { width: 76px !important; min-width: 76px !important; max-width: 76px !important; white-space: nowrap; box-sizing: border-box; }
        .rk_th { white-space: nowrap; }
        .rk_cell { cursor: pointer; font-size: inherit; }
        /* Layar sempit (HP): lebar dibatasi */
        @media (max-width: 768px) {
            #data_table_produk .rk_th, #data_table_produk .rk_cell { width: 76px !important; max-width: 76px !important; }
        }
        /* Kolom Rak asli disembunyikan (bukan dihapus: filter & popup masih memakai datanya); "Map rak" kini di bawah barcode */
        #data_table_produk .rk_th, #data_table_produk .rk_cell, #rk_hasil .rk_th, #rk_hasil .rk_cell,
        .dataTables_scrollHead .rk_th { display: none !important; }
        .rk_bc_baris { margin-top: 3px; }
        .rk_bc_ikon { display: inline-block; width: 18px; margin-right: 5px; text-align: center; color: #444; }
        .rk_bc_rak { display: inline-flex; align-items: center; gap: 3px; color: #0d6efd; cursor: pointer; text-decoration: underline; white-space: nowrap; font-size: inherit; }
        .rk_bc_rak:hover { color: #0a58ca; }
        /* ikon "Map rak" berkedip pelan (warna asli, tanpa pendar); mati bila pengguna memilih "kurangi animasi" di sistemnya */
        @keyframes rk_kedip { 0%, 100% { opacity: 1; } 50% { opacity: .15; } }
        .rk_bc_rak .fa { animation: rk_kedip 2.4s ease-in-out infinite; }
        .rk_bc_rak:hover .fa { animation-play-state: paused; opacity: 1; }
        @media (prefers-reduced-motion: reduce) { .rk_bc_rak .fa { animation: none; } }
        .rk_cell .rk_muted { color: #aaa; }
        .rk_cell .rk_lihat { color: #0d6efd; text-decoration: underline; white-space: nowrap; }
        /* Hasil filter Status Rak: tabel sementara berisi baris yang sudah ketemu; tabel asli situs disembunyikan */
        .dataTables_wrapper.rk_mode_hasil .dataTables_scroll, .dataTables_wrapper.rk_mode_hasil #data_table_produk { display: none !important; }
        #rk_hasil .rk_hasil_bar { display: flex; align-items: center; gap: 10px; padding: 6px 8px; font-size: 13px; color: #555;
                                  background: #f7f9ff; border: 1px solid #e3e8f5; border-bottom: 0; }
        #rk_hasil .rk_hasil_bar .fa { color: #0d6efd; }
        #rk_hasil .rk_hasil_teks { flex: 1; }
        #rk_hasil .rk_hasil_tutup { font-size: 12px; padding: 2px 10px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; }
        #rk_hasil .rk_hasil_pager { display: none; align-items: center; justify-content: center; gap: 12px; padding: 6px; font-size: 13px; color: #555;
                                    background: #f7f9ff; border: 1px solid #e3e8f5; border-top: 0; }
        #rk_hasil .rk_hasil_pager button { font-size: 12px; padding: 3px 12px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; }
        #rk_hasil .rk_hasil_pager button:disabled { opacity: .45; cursor: not-allowed; }
        #rk_hasil .rk_hasil_scroll { overflow: auto; border: 1px solid #e3e8f5; }
        #rk_hasil table { width: 100% !important; margin: 0; }
        #rk_hasil thead th { position: sticky; top: 0; z-index: 2; background: #eef0f4; }
        #rk_hasil .rk_th, #rk_hasil .rk_cell { width: 76px; min-width: 76px; max-width: 76px; }
        /* Popup rak: melayang di area tabel, mirip popup detail stok */
        #gs_rak_pop { position: absolute; z-index: 99995; box-sizing: border-box; min-width: 150px; max-width: min(280px, 94vw);
                      display: flex; flex-direction: column; background: #fff; border: 1px solid #ccc; border-radius: 4px;
                      box-shadow: 0 4px 16px rgba(0,0,0,.25); font-size: 12px; text-align: left; }
        #gs_rak_pop .rk_head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 5px 8px; border-bottom: 1px solid #ddd; }
        #gs_rak_pop .rk_judul { font-size: 11px; font-weight: 600; color: #555; word-break: break-word; }
        #gs_rak_pop .rk_x { border: none; background: none; font-size: 16px; line-height: 1; cursor: pointer; color: #666; padding: 0 2px; }
        #gs_rak_pop .rk_isi { padding: 5px 8px; overflow-y: auto; min-height: 0; overscroll-behavior: contain; }
        #gs_rak_pop .rk_baris { padding: 3px 0; border-bottom: 1px solid #ddd; }
        #gs_rak_pop .rk_baris:first-child { padding-top: 0; }
        #gs_rak_pop .rk_baris:last-of-type { border-bottom: 0; }
        #gs_rak_pop .rk_gn { font-weight: 700; color: #444; }
        #gs_rak_pop .rk_rv { font-weight: 600; color: #0d9bdb; padding-left: 0; }
        #gs_rak_pop .rk_info { color: #777; font-size: 11px; padding: 4px 0; }
        #gs_rak_pop .rk_info.rk_err { color: #dc3545; }
        #gs_rak_pop .rk_tutup { display: block; padding: 3px 10px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; font-size: 11px; color: #444; }
        #gs_rak_pop .rk_tutup:hover { background: #f0f0f0; }
        #gs_rak_pop .rk_foot { flex: none; padding: 5px 8px; border-top: 1px solid #ddd; background: #fff; border-radius: 0 0 4px 4px; }
        #gs_rak_pop.rk_gambar .rk_foot { display: flex; gap: 6px; flex-wrap: wrap; }
        #gs_rak_pop .rk_edit { color: #0d6efd; border-color: #b6d4fe; }
        #gs_rak_pop .rk_edit:hover { background: #e7f1ff; }
        /* Popup gambar: tiap gambar dalam kotaknya sendiri, satu kotak terlihat sekaligus; kotak lain di-scroll (snap per kotak) */
        #gs_rak_pop.rk_gambar { width: min(340px, 94vw); max-width: min(340px, 94vw); }
        #gs_rak_pop.rk_gambar .rk_isi { scroll-snap-type: y mandatory; }
        #gs_rak_pop .rk_grid { display: grid; grid-template-columns: 1fr; gap: 6px; }
        #gs_rak_pop .rk_kotak { position: relative; aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center; overflow: hidden;
                                border: 1px solid #dfe3ee; border-radius: 6px; background: #fafafa; box-sizing: border-box; scroll-snap-align: start; }
        #gs_rak_pop .rk_kotak img { display: block; width: 100%; height: 100%; object-fit: contain;
                                    pointer-events: none; -webkit-touch-callout: none; -webkit-user-drag: none; user-select: none; }
        #gs_rak_pop .rk_kotak .rk_no { position: absolute; left: 4px; top: 4px; font-size: 10px; line-height: 1; padding: 2px 6px; border-radius: 8px;
                                       background: rgba(0,0,0,.55); color: #fff; pointer-events: none; }

        /* Ikon gambar (logo PartDistro) di kolom Nama */
        .gs_ikon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
                   margin: 0 5px 2px 0; border: 1px solid #ccd; border-radius: 4px; background: #f4f6ff;
                   cursor: pointer; font-size: 11px; line-height: 1; vertical-align: middle; user-select: none;
                   overflow: hidden; box-sizing: border-box; flex: none; max-width: 20px; max-height: 20px; }
        .gs_ikon:hover { background: #e3e8ff; }
        .gs_ikon.gs_logo { background: #fff url("${LOGO_IKON}") no-repeat 50% 50% / contain; border-color: #e3e3e8; }

        /* Harga jual per pelanggan: dibuka lewat panah merah bawaan situs (fa-angle-double-down) di sel Harga Jual */
        .hj_td i.fa-angle-double-down, .hj_td .hj_btn { cursor: pointer; padding: 0 4px; }
        .hj_td .hj_btn { color: red; font-style: normal; }
        #gs_rak_pop .hj_row { display: flex; justify-content: space-between; gap: 14px; padding: 3px 0; border-bottom: 1px solid #ddd; }
        #gs_rak_pop .hj_row:last-of-type { border-bottom: 0; }
        #gs_rak_pop .hj_nm { font-weight: 700; color: #444; }
        #gs_rak_pop .hj_hg { font-weight: 600; color: #0d9bdb; white-space: nowrap; }

        /* Kolom Nama responsif: teks panjang turun ke bawah, tidak terpotong */
        .rs_nama_th, .rs_nama { min-width: 220px; }
        .rs_nama { white-space: normal !important; overflow: visible !important; text-overflow: clip !important;
                   max-width: none !important; word-break: break-word; }
        .rs_nama *:not(.gs_ikon) { white-space: normal !important; overflow: visible !important; text-overflow: clip !important; }
        @media (max-width: 768px) { .rs_nama_th, .rs_nama { min-width: 160px; } }
    `;
    document.head.appendChild(style);

    // ---------- header (DataTables: header terpisah + thead tersembunyi di tabel isi) ----------
    function findIndexIn(tr, label) {
        const ths = tr.children;
        for (let i = 0; i < ths.length; i++) {
            if (ths[i].textContent.trim().toLowerCase() === label) return i;
        }
        return -1;
    }

    function setThText(th, txt) {
        const w = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
        let first = null, n;
        const rest = [];
        while ((n = w.nextNode())) {
            if (!n.nodeValue.trim()) continue;
            if (!first) first = n; else rest.push(n);
        }
        if (first) { first.nodeValue = txt; rest.forEach((x) => (x.nodeValue = '')); }
        else th.textContent = txt;
    }

    function enhanceHeaders(root) {
        let changed = false;
        root.querySelectorAll('thead tr').forEach((tr) => {
            const idx = findIndexIn(tr, 'nama');
            if (idx < 0) return;
            tr.children[idx].classList.add('rs_nama_th');
            if (tr.querySelector('.rk_th')) return;
            const th = tr.children[idx].cloneNode(true);
            th.className = (th.className || '').replace(/\bsorting\w*\b/g, '').replace(/\brs_nama_th\b/g, '').trim() + ' rk_th';
            th.removeAttribute('aria-sort');
            th.removeAttribute('aria-label');
            th.removeAttribute('tabindex');
            th.style.width = '';
            th.style.cursor = 'default';
            setThText(th, 'Rak');
            tr.children[idx].insertAdjacentElement('afterend', th);
            changed = true;
        });
        return changed;
    }

    function syncWidths(table) {
        const wrapper = table.closest('.dataTables_wrapper');
        if (!wrapper) return;
        const bodyThs = table.querySelectorAll('thead tr:first-child th');
        if (!bodyThs.length) return;
        const widths = Array.from(bodyThs).map((t) => t.getBoundingClientRect().width);
        if (widths.some((w, i) => !w && !bodyThs[i].classList.contains('rk_th'))) return; // kolom Rak disembunyikan -> lebar 0 wajar
        const total = table.getBoundingClientRect().width;
        wrapper.querySelectorAll('table').forEach((t) => {
            if (t === table) return;
            const ths = t.querySelectorAll('thead tr:first-child th');
            if (ths.length !== widths.length) return;
            t.style.width = total + 'px';
            const inner = t.closest('.dataTables_scrollHeadInner');
            if (inner) inner.style.width = total + 'px';
            ths.forEach((th, i) => {
                th.style.boxSizing = 'border-box';
                th.style.width = th.style.minWidth = th.style.maxWidth = widths[i] + 'px';
            });
        });
    }

    // ---------- ambil data rak ----------
    function angka(t) {
        const m = String(t || '').match(/-?[\d.,]+/);
        if (!m) return NaN;
        return parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
    }

    // Catatan ringkas tiap request (dibaca tombol Perekam lewat atribut dokumen)
    const rakLog = [];
    function catatLog(baris) {
        rakLog.push(new Date().toTimeString().slice(0, 8) + ' ' + baris);
        if (rakLog.length > 30) rakLog.shift();
        try { document.documentElement.setAttribute('data-aistim-rak-log', rakLog.join('\n')); } catch (e) { /* abaikan */ }
    }

    async function ambilHtml(url, params) {
        const qs = new URLSearchParams(params).toString();
        let res;
        try {
            res = await fetch(url + '?' + qs, {
                credentials: 'same-origin',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'text/plain, */*; q=0.01' // sama dengan $.ajax dataType:text milik situs
                }
            });
        } catch (e) {
            catatLog('FETCH ' + url + '?' + qs + ' -> ERROR ' + e);
            throw e;
        }
        catatLog('FETCH ' + url + '?' + qs + ' -> ' + res.status);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
    }

    function parseHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script, style').forEach((x) => x.remove());
        doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n')); // textContent tidak memuat <br>
        return doc;
    }

    // Sama dengan popup "detail stok": label tebal = outlet, label biasa = gudang,
    // lalu <a class="bt_detail_stok_aktifitas" data-gdn> = jumlah stok gudang itu.
    async function daftarGudang(idproduk, idoutlet) {
        const html = await ambilHtml('/produk_gudangs/detail_stok/new', {
            idproduk: idproduk, idgudang: '', idoutlet: idoutlet
        });
        const doc = parseHtml(html);
        const list = [];
        let outlet = '', gudang = '';
        doc.querySelectorAll('label, a.bt_detail_stok_aktifitas').forEach((el) => {
            if (el.tagName === 'LABEL') {
                const teks = el.textContent.trim();
                if (/bold|font-weight:\s*[6-9]00/i.test(el.getAttribute('style') || '')) outlet = teks;
                else gudang = teks;
                return;
            }
            list.push({
                id: el.getAttribute('data-gdn') || '',
                nama: gudang || el.getAttribute('data-gudang-nama') || '',
                outlet: outlet,
                stok: angka(el.textContent)
            });
            gudang = '';
        });
        return list;
    }

    // Dari dialog Aktifitas Stok: blok "Penempatan Rak :" lalu nama rak
    async function rakGudang(idproduk, idgudang, idoutlet) {
        const html = await ambilHtml('/produk_gudangs/aktifitas_stok/new', {
            idproduk: idproduk, idgudang: idgudang, idoutlet: idoutlet,
            idproduk_harga: '', hide_stok_awal_stok_akhir: 'false'
        });
        const teks = parseHtml(html).body.textContent || '';
        const m = teks.match(/Penempatan Rak\s*:?\s*([\s\S]*?)(?:Tabel ini dibaca|Tanggal\s+Kode|$)/i);
        if (!m) {
            catatLog('RAK tidak ketemu di respons (' + teks.length + ' char): ' + teks.replace(/\s+/g, ' ').trim().slice(0, 150));
            return '';
        }
        return m[1].split(/\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ');
    }

    async function ambilRakProduk(idproduk, idoutlet, idgudangCell) {
        let gudangs = [];
        try { gudangs = await daftarGudang(idproduk, idoutlet); } catch (e) { /* coba gudang dari sel */ }
        if (!gudangs.length) gudangs = [{ id: idgudangCell || '', nama: '', outlet: '', stok: NaN }];

        // utamakan gudang yang ada stoknya; kalau semua kosong, cek semua
        let target = gudangs.filter((g) => !isNaN(g.stok) && g.stok !== 0);
        if (!target.length) target = gudangs;
        target = target.slice(0, MAKS_GUDANG);

        const hasil = [];
        let errTerakhir = null;
        for (const g of target) {
            try {
                const rak = await rakGudang(idproduk, g.id, idoutlet);
                hasil.push({ g: g.nama, o: g.outlet, r: rak });
            } catch (e) {
                errTerakhir = e;
                console.error('[Rak] gudang', g.id, g.nama, e);
            }
        }
        if (!hasil.length && errTerakhir) throw errTerakhir;
        return hasil;
    }

    // ---------- tampilan sel ----------
    // Sel Rak hanya berisi tulisan "Map rak"; daftar rak tampil di popup saat diklik.
    function renderLihat(td) {
        td.textContent = '';
        const s = document.createElement('span');
        s.className = 'rk_lihat';
        s.textContent = 'Map rak';
        td.appendChild(s);
    }

    // data rak per gudang/toko untuk satu sel: dari cache (1 jam) atau diambil dari server.
    // paksa=true (klik "Map rak"): lewati cache, selalu ambil ulang dari server lalu perbarui cache.
    function dataRak(td, paksa) {
        const idproduk = td.dataset.prd;
        const idoutlet = td.dataset.otl || '';
        if (!idproduk) return Promise.resolve([]);
        const key = idproduk + '|' + idoutlet;
        const c = cache[key];
        if (!paksa && c && Date.now() - c.t < CACHE_TTL) return Promise.resolve(c.v);
        return ambilRakProduk(idproduk, idoutlet, td.dataset.gdn).then((v) => {
            cache[key] = { t: Date.now(), v: v };
            saveCache();
            return v;
        });
    }

    const GCACHE = {}; // id -> [url,...] selama halaman terbuka
    const HDIAG = {}; // id -> keterangan bila tab harga ditemukan tapi tabelnya kosong
    const HCACHE = {}; // id -> [{nama, harga},...] harga jual per pelanggan (dari halaman detail yang sama)

    // ---------- ambil harga jual per pelanggan dari tab harga di halaman detail produk ----------
    function teksBersih(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }

    function nilaiSel(td) {
        const inp = td.querySelector('input, select');
        if (inp) {
            if (inp.tagName === 'SELECT') {
                const o = inp.options[inp.selectedIndex];
                return o ? o.textContent.trim() : '';
            }
            return (inp.getAttribute('value') || inp.value || '').trim();
        }
        return teksBersih(td);
    }

    function cariPaneHarga(doc) {
        const panes = [];
        const tambah = (el) => { if (el && panes.indexOf(el) === -1) panes.push(el); };
        tambah(doc.querySelector('#tab_produk_harga_pelanggan')); // tab "Harga Jual" (dari hasil rekam)
        // 1) tab (link) yang judulnya mengandung "harga"
        doc.querySelectorAll('a[href^="#"], [data-bs-target^="#"], [data-target^="#"]').forEach((a) => {
            if (!/harga/i.test(a.textContent)) return;
            const ref = a.getAttribute('href') || a.getAttribute('data-bs-target') || a.getAttribute('data-target') || '';
            if (ref.length < 2) return;
            try { tambah(doc.querySelector(ref)); } catch (e) { /* selector tidak valid */ }
        });
        // 2) pane dengan id mengandung "harga"
        doc.querySelectorAll('[id*="harga" i]').forEach((el) => { if (el.querySelector('table')) tambah(el); });
        return panes;
    }

    // Tabel "Harga Jual per Jenis Pelanggan": kolom Jenis (Platinum, Gold, Silver, Basic, Marketplace) + Diskon (input)
    function formatAngka(t) {
        const n = Number(String(t).replace(/,/g, ''));
        return isFinite(n) && String(t).trim() !== '' ? n.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : String(t);
    }

    function ekstrakHarga(doc, id) {
        const hasil = [];
        const panes = cariPaneHarga(doc);
        if (!panes.length) { catatLog('produk ' + id + ': tab harga tidak ditemukan'); return null; }
        const judulTabel = [];
        let kolomJenis = '';
        panes.forEach((pane) => {
            pane.querySelectorAll('table').forEach((tb) => {
                const heads = Array.from(tb.querySelectorAll('thead th')).map(teksBersih);
                judulTabel.push(heads.slice(0, 3).join('/'));
                if (!heads.length || !/^jenis/i.test(heads[0])) return; // hanya tabel "per Jenis Pelanggan"
                // kolom harga jual (bukan Diskon): header mengandung "harga"
                const col = heads.findIndex((h, i) => i > 0 && /harga/i.test(h) && !/diskon/i.test(h));
                kolomJenis = heads.join(' | ');
                if (col < 0) return;
                tb.querySelectorAll('tbody tr').forEach((tr) => {
                    const cells = Array.from(tr.children);
                    if (cells.length <= col) return;
                    const nama = teksBersih(cells[0]);
                    const nilai = nilaiSel(cells[col]);
                    if (!nama || nilai === '') return;
                    if (hasil.some((x) => x.nama.toLowerCase() === nama.toLowerCase())) return; // hindari dobel (tabel jenis muncul lebih dari sekali)
                    const fa = formatAngka(nilai);
                    hasil.push({ nama: nama, harga: /^-?[\d.,]+$/.test(fa) ? 'Rp ' + fa : fa });
                });
            });
        });
        catatLog('produk ' + id + ': ' + hasil.length + ' jenis pelanggan ditemukan');
        if (!hasil.length) {
            HDIAG[id] = kolomJenis ? 'kolom tabel Jenis: ' + kolomJenis + ' (tidak ada kolom harga)' : 'tabel di tab: ' + (judulTabel.join(' ; ') || 'tidak ada');
            catatLog('produk ' + id + ' jenis pelanggan kosong: ' + HDIAG[id]);
        }
        return hasil;
    }

    // ---------- ambil semua gambar dari halaman detail produk ----------
    // (halaman yang sama juga dipakai untuk mengisi HCACHE / harga per pelanggan)
    const GPROMISE = {}; // id -> promise yang sedang berjalan (hindari fetch ganda)

    // Alamat halaman edit produk: dicari dari link "edit" di halaman detail produk; cadangannya /produks/<id>/edit
    // (pola Rails). Dibuka di tab baru dengan tab Gambar sebagai tujuan.
    const GEDIT = {};
    function cariLinkEdit(doc, id) {
        let href = '';
        const kandidat = Array.from(doc.querySelectorAll('a[href*="/produks/' + id + '/edit"], a[href$="/edit"]'));
        const pas = kandidat.find((a) => (a.getAttribute('href') || '').indexOf('/produks/' + id) >= 0) || kandidat[0];
        if (pas) href = pas.getAttribute('href') || '';
        if (!href) href = '/produks/' + encodeURIComponent(id) + '/edit';
        try { return new URL(href, location.origin).href; } catch (e) { return location.origin + '/produks/' + encodeURIComponent(id) + '/edit'; }
    }

    // tombol "Edit gambar" di footer popup gambar (di samping Tutup)
    function tambahEditGambar(m, id) {
        const foot = m.pop.querySelector('.rk_foot');
        if (!foot || foot.querySelector('.rk_edit')) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'rk_tutup rk_edit';
        b.textContent = '✎ Edit gambar';
        b.title = 'Buka halaman edit produk di tab baru';
        b.addEventListener('click', () => {
            const url = GEDIT[id] || (location.origin + '/produks/' + encodeURIComponent(id) + '/edit');
            window.open(url + (url.indexOf('#') < 0 ? '#tab_produk_gambar' : ''), '_blank', 'noopener');
        });
        foot.insertBefore(b, foot.firstChild);
    }
    function ambilGambar(id) {
        if (GCACHE[id]) return Promise.resolve(GCACHE[id]);
        if (!GPROMISE[id]) {
            GPROMISE[id] = ambilGambarFetch(id).finally(() => { delete GPROMISE[id]; });
        }
        return GPROMISE[id];
    }

    async function ambilGambarFetch(id) {
        const res = await fetch('/produks/' + encodeURIComponent(id), {
            credentials: 'same-origin',
            headers: { 'Accept': 'text/html' }
        });
        catatLog('GET /produks/' + id + ' -> ' + res.status);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        GEDIT[id] = cariLinkEdit(doc, id);
        try { HCACHE[id] = ekstrakHarga(doc, id); } catch (e) { catatLog('produk ' + id + ' harga error: ' + e.message); HCACHE[id] = null; }
        const pane = doc.querySelector('#tab_produk_gambar');
        if (!pane) { catatLog('produk ' + id + ': #tab_produk_gambar tidak ada'); GCACHE[id] = []; return []; }
        const urls = [];
        pane.querySelectorAll('img').forEach((im) => {
            const src = im.getAttribute('src') || im.getAttribute('data-src') || '';
            if (!src || /^data:/i.test(src)) return;
            try {
                const u = new URL(src, location.origin).href;
                if (urls.indexOf(u) === -1) urls.push(u);
            } catch (e) { /* lewati */ }
        });
        if (!urls.length) catatLog('produk ' + id + ': tidak ada <img> di tab Gambar');
        GCACHE[id] = urls;
        return urls;
    }

    // ---------- popup (melayang di area tabel, dekat elemen yang diklik) ----------
    function tutupModal() {
        const rp = document.getElementById('gs_rak_pop');
        if (rp) rp.remove();
    }

    // kerangka popup: judul + tombol x + isi yang bisa di-scroll. 'anchor' = elemen yang diklik.
    function bukaPop(anchor, judul, kelas) {
        tutupModal();
        const pop = document.createElement('div');
        pop.id = 'gs_rak_pop';
        if (kelas) pop.className = kelas;
        // blokir seret/seleksi (menu klik-kanan dibiarkan)
        ['dragstart', 'selectstart'].forEach((ev) => pop.addEventListener(ev, (e) => e.preventDefault()));

        const head = document.createElement('div');
        head.className = 'rk_head';
        const j = document.createElement('div');
        j.className = 'rk_judul';
        j.textContent = judul;
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'rk_x';
        x.innerHTML = '&times;';
        x.addEventListener('click', tutupModal);
        head.appendChild(j);
        head.appendChild(x);

        const isi = document.createElement('div');
        isi.className = 'rk_isi';
        pop.appendChild(head);
        pop.appendChild(isi);
        document.body.appendChild(pop);

        // posisi: di dalam area tabel (wrapper DataTables), mulai dari elemen yang diklik
        const area = () => (anchor.closest('.dataTables_wrapper') || anchor.closest('table') || document.body).getBoundingClientRect();
        const taruh = () => {
            if (!document.body.contains(pop)) return;
            const a = area();
            const c = anchor.getBoundingClientRect();
            const sx = window.pageXOffset, sy = window.pageYOffset;
            // Batas bawah = bawah tabel atau bawah layar (mana yang lebih jauh): tabel yang barisnya sedikit
            // (mis. 1 data) tidak lagi memampatkan popup sampai isinya harus di-scroll; tinggi mengikuti isi/gambar.
            const bawah = Math.max(a.bottom, window.innerHeight);
            const maxH = Math.max(160, Math.min(bawah - a.top - 8, window.innerHeight * 0.85));
            pop.style.maxHeight = maxH + 'px';
            const w = pop.offsetWidth, h = pop.offsetHeight;
            let left = c.left;
            if (left + w > a.right - 4) left = a.right - 4 - w;
            if (left < a.left + 4) left = a.left + 4;
            let top = c.top;
            if (top + h > bawah - 4) top = bawah - 4 - h;
            if (top < a.top + 4) top = a.top + 4;
            pop.style.left = (left + sx) + 'px';
            pop.style.top = (top + sy) + 'px';
        };
        // tombol Tutup di footer (di luar area scroll, jadi tidak ikut tergulung); dipasang sekali
        const tombolTutup = () => {
            if (pop.querySelector('.rk_foot')) return;
            const foot = document.createElement('div');
            foot.className = 'rk_foot';
            const tb = document.createElement('button');
            tb.type = 'button';
            tb.className = 'rk_tutup';
            tb.textContent = '\u2716 Tutup';
            tb.addEventListener('click', tutupModal);
            foot.appendChild(tb);
            pop.appendChild(foot);
        };
        tombolTutup();
        const info = (teks, err) => {
            isi.textContent = '';
            const t = document.createElement('div');
            t.className = 'rk_info' + (err ? ' rk_err' : '');
            t.textContent = teks;
            isi.appendChild(t);
            tombolTutup();
            taruh();
        };
        return { pop: pop, isi: isi, taruh: taruh, tombolTutup: tombolTutup, info: info };
    }

    // popup gambar produk (klik ikon logo di kolom Nama)
    function bukaModal(ikon, id, judul) {
        const m = bukaPop(ikon, judul || ('Produk ' + id), 'rk_gambar');
        m.info('Memuat gambar...');

        ambilGambar(id).then((urls) => {
            if (!document.body.contains(m.pop)) return; // popup sudah ditutup
            if (!urls.length) { m.info('Produk ini belum punya gambar.'); tambahEditGambar(m, id); m.taruh(); return; }
            m.isi.textContent = '';
            const grid = document.createElement('div');
            grid.className = 'rk_grid';
            urls.forEach((u, i) => {
                const kotak = document.createElement('div');
                kotak.className = 'rk_kotak';
                const img = document.createElement('img');
                img.alt = '';
                img.draggable = false;
                img.addEventListener('error', () => { img.alt = 'Gambar gagal dimuat'; });
                img.src = u;
                kotak.appendChild(img);
                if (urls.length > 1) {
                    const no = document.createElement('span');
                    no.className = 'rk_no';
                    no.textContent = (i + 1) + '/' + urls.length;
                    kotak.appendChild(no);
                }
                grid.appendChild(kotak);
            });
            m.isi.appendChild(grid);
            // tinggi area isi = tepat satu kotak: gambar pertama terlihat, sisanya di-scroll
            if (urls.length > 1) {
                const satuKotak = () => {
                    const k = grid.firstElementChild;
                    if (!k || !document.body.contains(m.pop)) return;
                    const cs = getComputedStyle(m.isi);
                    m.isi.style.maxHeight = Math.ceil(k.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) + 'px';
                    m.taruh();
                };
                satuKotak();
                window.addEventListener('resize', satuKotak);
                m.isi.title = 'Gulir untuk melihat gambar lainnya (' + urls.length + ' gambar)';
            }
            m.tombolTutup();
            tambahEditGambar(m, id);
            m.taruh();
        }).catch((e) => {
            console.error('[Gambar] gagal produk=', id, e);
            catatLog('produk ' + id + ' gagal: ' + e.message);
            if (document.body.contains(m.pop)) m.info('Gagal memuat gambar (' + e.message + ').', true);
        });
    }

    // popup daftar rak: toko/gudang tebal, nama rak di bawahnya, dipisah garis (klik "Map rak")
    function bukaModalRak(td, judul, anchor) {
        const m = bukaPop(anchor || td, judul || 'Rak produk'); // anchor = elemen yang diklik (kolom Rak asli disembunyikan, tidak punya posisi)
        m.info('Memuat rak...');

        dataRak(td, true).then((data) => { // true = selalu muat ulang data rak dari server tiap "Map rak" diklik
            if (!document.body.contains(m.pop)) return; // popup sudah ditutup
            data = data || [];
            if (!data.some((x) => x.r)) return m.info('Produk ini belum punya penempatan rak.');
            m.isi.textContent = '';
            // hanya toko/gudang yang punya rak; yang kosong tidak ditampilkan
            data.filter((x) => x.r).forEach((x) => {
                const baris = document.createElement('div');
                baris.className = 'rk_baris';
                const g = document.createElement('div');
                g.className = 'rk_gn';
                g.textContent = x.g || 'GUDANG';
                baris.appendChild(g);
                x.r.split(/\s*,\s*/).filter(Boolean).forEach((nama) => {
                    const r = document.createElement('div');
                    r.className = 'rk_rv';
                    r.textContent = nama;
                    baris.appendChild(r);
                });
                m.isi.appendChild(baris);
            });
            m.tombolTutup();
            m.taruh();
        }).catch((e) => {
            console.error('[Rak] gagal produk=', td.dataset.prd, e);
            if (document.body.contains(m.pop)) m.info('Gagal memuat rak (' + (e && e.message ? e.message : e) + ').', true);
        });
    }

    // klik di luar popup (bukan "Map rak"/ikon gambar) menutupnya
    document.addEventListener('mousedown', (e) => {
        if (!document.getElementById('gs_rak_pop')) return;
        if (e.target.closest && (e.target.closest('#gs_rak_pop') || e.target.closest('.rk_cell') || e.target.closest('.rk_bc_rak') || e.target.closest('.gs_ikon') || e.target.closest('.hj_td i'))) return;
        tutupModal();
    }, true);

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupModal(); });

    // Sel Barcode: ikon barcode di KIRI nomor barcode, dan di BAWAHNYA "Map rak" berikon (membuka popup rak yang sama
    // dengan kolom Rak, yang kini disembunyikan). Ikon gambar produk tetap di sel Nama. Dipasang sekali per sel.
    function pasangBarcode(bcTd, namaTd, prd) {
        if (!bcTd || !prd) return;
        // ikon gambar produk (logo PartDistro) TETAP di sel Nama, di depan nama barang
        if (namaTd && !namaTd.querySelector('.gs_ikon')) {
            const ikon = document.createElement('span');
            ikon.className = 'gs_ikon gs_logo'; // logo PartDistro sebagai ikon awal
            ikon.title = 'Lihat gambar produk';
            ikon.dataset.prd = prd;
            namaTd.insertBefore(ikon, namaTd.firstChild);
        }
        // sel Barcode: ikon barcode di kiri nomor barcode
        if (!bcTd.querySelector('.rk_bc_ikon')) {
            const ib = document.createElement('i');
            ib.className = 'fa fa-barcode rk_bc_ikon';
            ib.setAttribute('aria-hidden', 'true');
            bcTd.insertBefore(ib, bcTd.firstChild);
        }
        if (!bcTd.querySelector('.rk_bc_rak')) {
            const baris = document.createElement('div');
            baris.className = 'rk_bc_baris';
            const lihat = document.createElement('span');
            lihat.className = 'rk_bc_rak';
            lihat.title = 'Map rak';
            lihat.dataset.prd = prd;
            const i = document.createElement('i');
            i.className = 'fa fa-map-marker';
            i.setAttribute('aria-hidden', 'true');
            lihat.appendChild(i);
            lihat.appendChild(document.createTextNode(' Map rak'));
            baris.appendChild(lihat);
            bcTd.appendChild(baris);
        }
    }

    // ---------- pasang kolom ----------
    function enhance(table) {
        const headRow = table.querySelector('thead tr');
        if (!headRow) return;
        const namaIdx = findIndexIn(headRow, 'nama') >= 0
            ? findIndexIn(headRow, 'nama')
            : (headRow.querySelector('.rk_th') ? findIndexIn(headRow, 'rak') - 1 : -1);
        const barcodeIdx = findIndexIn(headRow, 'barcode');
        if (namaIdx < 0 || barcodeIdx < 0) return;

        const wrapper = table.closest('.dataTables_wrapper') || table.parentElement || document;
        const headChanged = enhanceHeaders(wrapper);

        table.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.querySelector('.rk_cell')) return;
            const tds = tr.children;
            if (tds.length <= Math.max(namaIdx, barcodeIdx)) return; // baris pesan kosong / loading
            if (!tds[barcodeIdx].textContent.trim()) return;

            const stokCell = tr.querySelector('td.bt_dialog_aktifitas_stok');
            const td = document.createElement('td');
            td.className = 'rk_cell';
            td.dataset.bc = tds[barcodeIdx].textContent.trim();
            if (stokCell) {
                td.dataset.prd = stokCell.dataset.prd || '';
                td.dataset.otl = stokCell.dataset.otl || '';
                td.dataset.gdn = stokCell.dataset.gdn || '';
            }
            renderLihat(td);
            const namaTd = tds[namaIdx];
            namaTd.classList.add('rs_nama');
            pasangBarcode(tds[barcodeIdx], namaTd, stokCell ? stokCell.dataset.prd : '');
            namaTd.insertAdjacentElement('afterend', td);
        });

        // Tombol panah Harga Jual: dipasang ulang tiap pass (situs bisa menulis ulang isi sel setelah tabel digambar)
        const hjNow = Array.from(headRow.children).findIndex((th) => /^harga\s*jual/i.test(th.textContent.trim()));
        if (hjNow >= 0) {
            table.querySelectorAll('tbody tr').forEach((tr) => {
                if (!tr.querySelector('.rk_cell')) return;
                const stok = tr.querySelector('td.bt_dialog_aktifitas_stok');
                const hd = tr.children[hjNow];
                if (!stok || !stok.dataset.prd || !hd || hd.classList.contains('rk_cell')) return;
                hd.classList.add('hj_td');
                hd.dataset.hjprd = stok.dataset.prd;
                // pemicu = panah merah bawaan situs; kalau sel tidak punya, pasang panah merah serupa
                if (hd.querySelector('i.fa-angle-double-down, .hj_btn')) return;
                const b = document.createElement('i');
                b.className = 'fa fa-angle-double-down hj_btn';
                b.title = 'Harga jual per pelanggan';
                hd.appendChild(b);
            });
        }

        if (headChanged) {
            window.dispatchEvent(new Event('resize'));
            [60, 300, 800].forEach((ms) => setTimeout(() => syncWidths(table), ms));
        }
        syncWidths(table);
        terapkanFilterRak();
    }

    // ---------- filter "Status Rak" (combobox di panel filter; menyaring baris tabel di halaman ini) ----------
    // '' = semua, 'ada' = sudah ada rak, 'kosong' = belum ada rak.
    // Disimpan di sessionStorage supaya tetap terpilih saat pindah halaman / halaman dimuat ulang.
    const FILTER_KEY = 'aistim_rak_filter';
    let filterRak = '';
    try { const f = sessionStorage.getItem(FILTER_KEY); if (f === 'ada' || f === 'kosong') filterRak = f; } catch (e) { /* abaikan */ }
    // Filter Status Gambar: '' = semua, 'ada' = sudah bergambar, 'kosong' = belum ada gambar (digabung dengan filter rak)
    const FILTER_GBR_KEY = 'aistim_gbr_filter';
    let filterGbr = '';
    try { const f = sessionStorage.getItem(FILTER_GBR_KEY); if (f === 'ada' || f === 'kosong') filterGbr = f; } catch (e) { /* abaikan */ }
    function aktifFilter() { return !!(filterRak || filterGbr); }
    function kunciFilter() { return filterRak + '|' + filterGbr; }

    const antreFilter = [];
    let jalanFilter = 0;
    const MAKS_FILTER = 3; // maks permintaan rak bersamaan saat memeriksa baris

    // 'ada' | 'kosong' | 'gagal' | null (belum diketahui)
    function statusRak(td) {
        if (!td.dataset.prd) return 'kosong';
        const c = cache[td.dataset.prd + '|' + (td.dataset.otl || '')];
        if (c && Date.now() - c.t < CACHE_TTL) return (c.v || []).some((x) => x.r) ? 'ada' : 'kosong';
        return td.dataset.rkgagal ? 'gagal' : null;
    }

    // 'ada' | 'kosong' | 'gagal' | null (belum diketahui); gambar diambil dari halaman detail produk (GCACHE)
    function statusGbr(td) {
        const id = td.dataset.prd;
        if (!id) return 'kosong';
        const u = GCACHE[id];
        if (u) return u.length ? 'ada' : 'kosong';
        return td.dataset.gbgagal ? 'gagal' : null;
    }

    // status gabungan semua filter aktif: 'cocok' | 'tidak' | 'gagal' (tetap tampil) | null (belum diketahui)
    function statusFilter(td) {
        let gagal = false;
        if (filterRak) {
            const s = statusRak(td);
            if (s === null) return null;
            if (s === 'gagal') gagal = true; else if (s !== filterRak) return 'tidak';
        }
        if (filterGbr) {
            const s = statusGbr(td);
            if (s === null) return null;
            if (s === 'gagal') gagal = true; else if (s !== filterGbr) return 'tidak';
        }
        return gagal ? 'gagal' : 'cocok';
    }

    function pompaFilter() {
        while (jalanFilter < MAKS_FILTER && antreFilter.length) {
            const td = antreFilter.shift();
            jalanFilter++;
            const kerja = [];
            if (filterRak) kerja.push(dataRak(td).catch((e) => { td.dataset.rkgagal = '1'; console.error('[Rak] filter gagal produk=', td.dataset.prd, e); }));
            if (filterGbr && td.dataset.prd) kerja.push(ambilGambar(td.dataset.prd).catch((e) => { td.dataset.gbgagal = '1'; console.error('[Gambar] filter gagal produk=', td.dataset.prd, e); }));
            Promise.all(kerja)
                .finally(() => { jalanFilter--; delete td.dataset.rkantri; terapkanFilterRak(); pompaFilter(); });
        }
    }

    // ---- jelajah halaman: saat filter aktif, buka halaman berikutnya (tombol "Selanjutnya" milik situs)
    // sampai terkumpul TARGET_FILTER baris yang cocok, lalu tampilkan hasilnya sekaligus ----
    const TARGET_FILTER = 50;
    const MAKS_HALAMAN = 20; // batas pengaman jumlah halaman situs yang dipindai sekali jalan (dulu 60: bisa ribuan permintaan ke server); "Selanjutnya" melanjutkan
    const jelajah = { aktif: false, pindah: false, baris: [], kunci: new Set(), halaman: 1, sig: null, dikumpul: null, sigSelesai: null, timer: null, ringkas: '', mode: 'klik', sesi: 0, hal: 1, fh: 0, awal: 0, habis: false, params: null };
    let fetchGagal = false; // true bila ambil halaman lewat fetch tidak berhasil (pakai cara klik tombol)

    // Tombol halaman situs bisa memuat ulang seluruh halaman (variabel skrip hilang), jadi keadaan penelusuran
    // disimpan di sessionStorage sebelum pindah halaman dan dipulihkan saat skrip dimuat lagi.
    const JEL_KEY = 'aistim_rak_jelajah';
    function simpanJelajah() {
        try {
            sessionStorage.setItem(JEL_KEY, JSON.stringify({
                filter: kunciFilter(), t: Date.now(), halaman: jelajah.halaman, sig: jelajah.sig,
                kunci: Array.from(jelajah.kunci), baris: jelajah.baris.map((tr) => tr.outerHTML)
            }));
            catatLog('jelajah: simpan hal.' + jelajah.halaman + ', terkumpul ' + jelajah.baris.length);
        } catch (e) { catatLog('jelajah: gagal menyimpan (' + e + ')'); }
    }
    function hapusSimpanJelajah() { try { sessionStorage.removeItem(JEL_KEY); } catch (e) { /* abaikan */ } }

    (function pulihkanJelajah() {
        try {
            const raw = sessionStorage.getItem(JEL_KEY);
            if (!raw) return;
            const s = JSON.parse(raw);
            if (!s || !aktifFilter() || s.filter !== kunciFilter() || Date.now() - s.t > 5 * 60 * 1000) { hapusSimpanJelajah(); return; }
            const tb = document.createElement('tbody');
            document.createElement('table').appendChild(tb);
            tb.innerHTML = s.baris.join('');
            jelajah.baris = Array.from(tb.children);
            jelajah.kunci = new Set(s.kunci);
            jelajah.halaman = s.halaman;
            jelajah.sig = s.sig;
            jelajah.aktif = true;
            jelajah.pindah = true;
            jelajah.timer = setTimeout(() => {
                const t = document.querySelector(TABLE_SEL);
                if (jelajah.pindah && t) { selesaiJelajah(t, 'halaman berikutnya tidak termuat'); terapkanFilterRak(); }
            }, 25000);
            catatLog('jelajah: pulih hal.' + s.halaman + ', terkumpul ' + jelajah.baris.length);
        } catch (e) { hapusSimpanJelajah(); }
    })();

    function kunciBaris(td) { return (td.dataset.prd || '') + '|' + (td.dataset.otl || '') + '|' + (td.dataset.gdn || ''); }
    function sigTabel(table) { return Array.from(table.querySelectorAll('tbody .rk_cell')).map(kunciBaris).join(';'); }

    function linkBerikut() {
        const mati = (a) => a.classList.contains('disabled') || a.getAttribute('aria-disabled') === 'true' ||
            (a.parentElement && a.parentElement.classList.contains('disabled'));
        let cand = Array.from(document.querySelectorAll('a[rel="next"], a.next_page, li.next > a, a.paginate_button.next'));
        if (!cand.length) {
            cand = Array.from(document.querySelectorAll('.pagination a, .dataTables_paginate a, .digg_pagination a, .apple_pagination a'))
                .filter((a) => /selanjutnya|next|\u203A|\u00BB/i.test(a.textContent));
        }
        return cand.find((a) => !mati(a)) || null;
    }

    function mulaiJelajah(table) {
        clearTimeout(jelajah.timer);
        jelajah.mode = fetchGagal ? 'klik' : 'fetch';
        jelajah.aktif = true;
        jelajah.pindah = false;
        jelajah.baris = [];
        jelajah.kunci = new Set();
        jelajah.halaman = 1;
        jelajah.sig = sigTabel(table);
        jelajah.dikumpul = null;
        jelajah.ringkas = '';
        jelajah.hal = 1; // halaman hasil (50 baris per halaman)
        jelajah.fh = 0; // nomor halaman situs berikutnya yang akan diambil
        jelajah.awal = 0;
        jelajah.habis = false;
        jelajah.params = null;
        const box = siapkanHasil(table);
        const tbody = box && box.querySelector('tbody');
        if (tbody) tbody.textContent = '';
    }

    function hentikanJelajah() {
        jelajah.sesi++; // membatalkan penelusuran fetch yang masih berjalan
        hapusSimpanJelajah();
        clearTimeout(jelajah.timer);
        jelajah.aktif = false;
        jelajah.pindah = false;
    }

    // tabel hasil sementara (di dalam wrapper tabel); dibuat dari struktur tabel situs
    function siapkanHasil(table) {
        const wrap = table.closest('.dataTables_wrapper') || table.parentElement;
        if (!wrap) return null;
        let box = document.getElementById('rk_hasil');
        if (box) return box;
        box = document.createElement('div');
        box.id = 'rk_hasil';

        const bar = document.createElement('div');
        bar.className = 'rk_hasil_bar';
        const ic = document.createElement('i');
        ic.className = 'fa fa-circle-o-notch fa-spin';
        const tx = document.createElement('span');
        tx.className = 'rk_hasil_teks';
        const tutup = document.createElement('button');
        tutup.type = 'button';
        tutup.className = 'rk_hasil_tutup';
        tutup.textContent = 'Tutup hasil';
        tutup.addEventListener('click', () => {
            const s = document.getElementById('rk_filter_status');
            const g = document.getElementById('rk_filter_gambar');
            if (g) g.value = '';
            filterGbr = '';
            try { sessionStorage.setItem(FILTER_GBR_KEY, ''); } catch (e) { /* abaikan */ }
            if (s) { s.value = ''; s.dispatchEvent(new Event('change')); }
        });
        bar.appendChild(ic);
        bar.appendChild(tx);
        bar.appendChild(tutup);

        const sc = document.createElement('div');
        sc.className = 'rk_hasil_scroll';
        const tb = table.cloneNode(false);
        tb.removeAttribute('id');
        tb.removeAttribute('style');
        const srcHead = wrap.querySelector('.dataTables_scrollHead thead') || table.querySelector('thead');
        if (srcHead) {
            const th = srcHead.cloneNode(true);
            th.querySelectorAll('th').forEach((x) => {
                x.removeAttribute('style');
                x.removeAttribute('aria-sort');
                x.removeAttribute('aria-controls');
                x.className = (x.className || '').replace(/\bsorting\w*\b/g, '').trim();
            });
            tb.appendChild(th);
        }
        tb.appendChild(document.createElement('tbody'));
        sc.appendChild(tb);
        box.appendChild(bar);
        box.appendChild(sc);

        const pg = document.createElement('div');
        pg.className = 'rk_hasil_pager';
        const prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'rk_pg_prev';
        prev.textContent = '\u2039 Sebelumnya';
        prev.addEventListener('click', () => halamanHasil(-1));
        const lbl = document.createElement('span');
        lbl.className = 'rk_pg_lbl';
        const nxt = document.createElement('button');
        nxt.type = 'button';
        nxt.className = 'rk_pg_next';
        nxt.textContent = 'Selanjutnya \u203A';
        nxt.addEventListener('click', () => halamanHasil(1));
        pg.appendChild(prev);
        pg.appendChild(lbl);
        pg.appendChild(nxt);
        box.appendChild(pg);

        const ref = wrap.querySelector('.dataTables_scroll') || table;
        ref.insertAdjacentElement('beforebegin', box);
        wrap.classList.add('rk_mode_hasil');
        return box;
    }

    function hapusHasil(table) {
        const box = document.getElementById('rk_hasil');
        if (box) box.remove();
        const wrap = table.closest('.dataTables_wrapper') || table.parentElement;
        if (wrap) wrap.classList.remove('rk_mode_hasil');
    }

    // teks status di bar tabel hasil (hanya menulis bila berubah) + ikon putar selama berjalan
    function setBar(teks, berjalan) {
        const box = document.getElementById('rk_hasil');
        if (!box) return;
        const tx = box.querySelector('.rk_hasil_teks');
        if (tx && tx.textContent !== teks) tx.textContent = teks;
        const ic = box.querySelector('.rk_hasil_bar .fa');
        if (ic) ic.style.display = berjalan ? '' : 'none';
        perbaruiPager();
        sesuaikanTinggiHasil();
    }

    // area tabel hasil menampilkan TAMPIL_BARIS baris sekaligus (tinggi dihitung dari baris sebenarnya); sisanya di-scroll
    const TAMPIL_BARIS = 8;
    function sesuaikanTinggiHasil() {
        const sc = document.querySelector('#rk_hasil .rk_hasil_scroll');
        if (!sc) return;
        const rows = sc.querySelectorAll('tbody tr');
        let mh = '';
        if (rows.length > TAMPIL_BARIS) {
            const thead = sc.querySelector('thead');
            let h = thead ? thead.offsetHeight : 0;
            for (let i = 0; i < TAMPIL_BARIS; i++) h += rows[i].offsetHeight;
            if (h > 0) mh = (h + 2) + 'px';
        }
        if (sc.style.maxHeight !== mh) sc.style.maxHeight = mh;
    }

    // tombol halaman hasil (hanya mode fetch): Sebelumnya / Selanjutnya (melanjutkan penelusuran bila perlu)
    function perbaruiPager() {
        const pg = document.querySelector('#rk_hasil .rk_hasil_pager');
        if (!pg) return;
        const tampil = jelajah.mode === 'fetch' && (jelajah.baris.length > 0 || jelajah.aktif);
        const disp = tampil ? 'flex' : 'none';
        if (pg.style.display !== disp) pg.style.display = disp;
        const lbl = pg.querySelector('.rk_pg_lbl');
        const teks = 'Hal. ' + jelajah.hal;
        if (lbl && lbl.textContent !== teks) lbl.textContent = teks;
        const prev = pg.querySelector('.rk_pg_prev');
        const nxt = pg.querySelector('.rk_pg_next');
        const adaLagi = jelajah.baris.length > jelajah.hal * TARGET_FILTER || !jelajah.habis;
        if (prev) prev.disabled = jelajah.aktif || jelajah.hal <= 1;
        if (nxt) nxt.disabled = jelajah.aktif || !adaLagi;
    }

    function renderHasilHalaman() {
        const hb = document.querySelector('#rk_hasil tbody');
        if (!hb) return;
        hb.textContent = '';
        const dari = (jelajah.hal - 1) * TARGET_FILTER;
        jelajah.baris.slice(dari, dari + TARGET_FILTER).forEach((tr) => hb.appendChild(tr.cloneNode(true)));
        const sc = document.querySelector('#rk_hasil .rk_hasil_scroll');
        if (sc) sc.scrollTop = 0;
        sesuaikanTinggiHasil();
    }

    function halamanHasil(arah) {
        if (jelajah.aktif || jelajah.mode !== 'fetch') return;
        const table = document.querySelector(TABLE_SEL);
        const baru = jelajah.hal + arah;
        if (!table || baru < 1) return;
        jelajah.hal = baru;
        renderHasilHalaman();
        if (jelajah.baris.length < jelajah.hal * TARGET_FILTER && !jelajah.habis) {
            jelajah.aktif = true; // lanjutkan penelusuran dari halaman situs berikutnya
            tulisStatus('Melanjutkan penelusuran...', true);
            lanjutkanFetch(table);
        } else {
            selesaiJelajah(table, '');
            tulisStatus(jelajah.ringkas, false);
        }
    }

    // penelusuran selesai / dijeda: baris yang ketemu sudah ada di tabel hasil
    function selesaiJelajah(table, alasan) {
        hentikanJelajah();
        jelajah.sigSelesai = sigTabel(table);
        jelajah.dikumpul = null;
        if (jelajah.mode === 'fetch') {
            const dari = (jelajah.hal - 1) * TARGET_FILTER;
            const n = Math.max(0, Math.min(jelajah.baris.length - dari, TARGET_FILTER));
            jelajah.ringkas = 'Hasil hal. ' + jelajah.hal + ': ' + n + ' baris (total ditemukan ' + jelajah.baris.length +
                ', dipindai ' + Math.max(0, jelajah.fh - jelajah.awal) + ' halaman situs' + (alasan ? ', ' + alasan : '') + ')';
        } else {
            const n = Math.min(jelajah.baris.length, TARGET_FILTER);
            jelajah.ringkas = (n ? 'Tampil ' + n + ' baris' : 'Tidak ada baris yang cocok') + ' (dipindai ' + jelajah.halaman + ' halaman' + (alasan ? ', ' + alasan : '') + ')';
        }
    }

    // ---- penelusuran lewat fetch: GET /produk_gudangs/lihat_stok/new?page=N (tanpa reload / klik tombol) ----
    function tulisStatus(teks, tombol) {
        const info = document.getElementById('rk_filter_info');
        const stop = document.getElementById('rk_filter_stop');
        if (info && info.textContent !== teks) info.textContent = teks;
        if (stop) stop.style.display = tombol ? '' : 'none';
        setBar(teks, tombol);
    }

    function halamanSekarang() {
        const cur = document.querySelector('.pagination .current, .pagination em, .pagination .active, .dataTables_paginate .current, .paginate_button.current');
        const n = cur ? parseInt(cur.textContent, 10) : NaN;
        if (n > 0) return n;
        const m = /[?&]page=(\d+)/.exec(location.search);
        return m ? parseInt(m[1], 10) : 1;
    }

    // ambil satu halaman tabel; null = respons tidak berisi tabel (mis. bukan HTML)
    async function ambilHalamanFetch(params, halaman) {
        const q = new URLSearchParams(params);
        q.set('page', String(halaman));
        const url = '/produk_gudangs/lihat_stok/new?' + q.toString();
        const res = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'text/html' } });
        catatLog('jelajah fetch hal.' + halaman + ' -> ' + res.status);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const tb = doc.querySelector(TABLE_SEL + ' tbody');
        if (!tb) return null;
        return Array.from(tb.querySelectorAll('tr')).filter((tr) => tr.querySelector('td.bt_dialog_aktifitas_stok'));
    }

    // lengkapi baris mentah (hasil fetch) seperti baris di tabel situs: sel Rak, ikon gambar, panah harga jual
    function pasangBarisHasil(tr) {
        const head = document.querySelector('#rk_hasil thead tr');
        if (!head) return;
        const namaIdx = findIndexIn(head, 'nama');
        const barcodeIdx = findIndexIn(head, 'barcode');
        const hjIdx = Array.from(head.children).findIndex((th) => /^harga\s*jual/i.test(th.textContent.trim()));
        const stokCell = tr.querySelector('td.bt_dialog_aktifitas_stok');
        const tds = tr.children;
        if (namaIdx < 0 || barcodeIdx < 0 || !stokCell || tds.length <= Math.max(namaIdx, barcodeIdx)) return;

        const td = document.createElement('td');
        td.className = 'rk_cell';
        td.dataset.bc = tds[barcodeIdx].textContent.trim();
        td.dataset.prd = stokCell.dataset.prd || '';
        td.dataset.otl = stokCell.dataset.otl || '';
        td.dataset.gdn = stokCell.dataset.gdn || '';
        renderLihat(td);
        const namaTd = tds[namaIdx];
        namaTd.classList.add('rs_nama');
        pasangBarcode(tds[barcodeIdx], namaTd, td.dataset.prd);
        namaTd.insertAdjacentElement('afterend', td);

        const hd = hjIdx >= 0 ? tr.children[hjIdx] : null;
        if (hd && td.dataset.prd) {
            hd.classList.add('hj_td');
            hd.dataset.hjprd = td.dataset.prd;
            if (!hd.querySelector('i.fa-angle-double-down, .hj_btn')) {
                const b = document.createElement('i');
                b.className = 'fa fa-angle-double-down hj_btn';
                b.title = 'Harga jual per pelanggan';
                hd.appendChild(b);
            }
        }
    }

    // awal penelusuran fetch: ambil parameter form & halaman awal, lalu kumpulkan untuk hasil halaman 1
    async function jalankanFetch(table) {
        const form = document.getElementById('form_pencarian_lihat_stok');
        jelajah.params = form ? new URLSearchParams(new FormData(form)) : new URLSearchParams();
        jelajah.params.delete('page');
        jelajah.awal = halamanSekarang();
        jelajah.fh = jelajah.awal;
        return lanjutkanFetch(table);
    }

    // kumpulkan baris cocok dari halaman situs berikutnya sampai halaman hasil saat ini penuh (50 baris)
    async function lanjutkanFetch(table) {
        const sesi = jelajah.sesi;
        const batasFh = jelajah.fh + MAKS_HALAMAN;
        let adaHalaman = jelajah.fh > jelajah.awal;
        const batal = () => sesi !== jelajah.sesi || !jelajah.aktif;
        const sasaran = () => jelajah.hal * TARGET_FILTER;
        const status = () => tulisStatus('Hasil hal. ' + jelajah.hal + ' (situs hal. ' + jelajah.fh + '): terkumpul ' +
            Math.min(jelajah.baris.length, sasaran()) + '/' + sasaran(), true);

        try {
            status();
            while (!batal() && jelajah.baris.length < sasaran() && !jelajah.habis && jelajah.fh < batasFh) {
                const rows = await ambilHalamanFetch(jelajah.params, jelajah.fh);
                if (batal()) return;
                if (rows === null) throw new Error('respons tidak berisi tabel');
                adaHalaman = true;
                if (!rows.length) { jelajah.habis = true; break; }

                // periksa rak tiap baris (maks MAKS_FILTER paralel); baris cocok tampil berurutan begitu siap
                const hasil = new Array(rows.length);
                let tampilIdx = 0;
                const antre = rows.map((tr, i) => i);
                const alirkan = () => {
                    while (tampilIdx < rows.length && hasil[tampilIdx] !== undefined) {
                        const tr = hasil[tampilIdx++];
                        if (!tr) continue;
                        const sc = tr.querySelector('td.bt_dialog_aktifitas_stok');
                        const k = (sc.dataset.prd || '') + '|' + (sc.dataset.otl || '') + '|' + (sc.dataset.gdn || '');
                        if (jelajah.kunci.has(k)) continue;
                        jelajah.kunci.add(k);
                        const salin = document.importNode(tr, true);
                        pasangBarisHasil(salin);
                        jelajah.baris.push(salin);
                        const idx = jelajah.baris.length - 1;
                        const hb = document.querySelector('#rk_hasil tbody');
                        // langsung tampil bila termasuk halaman hasil yang sedang dibuka
                        if (hb && idx >= (jelajah.hal - 1) * TARGET_FILTER && idx < sasaran()) hb.appendChild(salin.cloneNode(true));
                        status();
                    }
                };
                const kerja = async () => {
                    while (antre.length && !batal()) {
                        const i = antre.shift();
                        const sc = rows[i].querySelector('td.bt_dialog_aktifitas_stok');
                        let cocok = false;
                        try {
                            const pseudo = { dataset: { prd: sc.dataset.prd || '', otl: sc.dataset.otl || '', gdn: sc.dataset.gdn || '' } };
                            let okRak = true, okGbr = true;
                            if (filterRak) {
                                const data = pseudo.dataset.prd ? await dataRak(pseudo) : [];
                                okRak = ((data || []).some((x) => x.r) ? 'ada' : 'kosong') === filterRak;
                            }
                            if (okRak && filterGbr) {
                                const urls = pseudo.dataset.prd ? await ambilGambar(pseudo.dataset.prd) : [];
                                okGbr = ((urls || []).length ? 'ada' : 'kosong') === filterGbr;
                            }
                            cocok = okRak && okGbr;
                        } catch (e) { console.error('[Rak] fetch cek rak gagal', e); }
                        hasil[i] = cocok ? rows[i] : null;
                        alirkan();
                    }
                };
                status();
                await Promise.all([kerja(), kerja(), kerja()]);
                if (batal()) return;
                alirkan();
                jelajah.fh++;
            }
            if (batal()) return;
            const alasan = jelajah.habis ? 'halaman terakhir' : (jelajah.baris.length < sasaran() ? 'batas ' + MAKS_HALAMAN + ' halaman, tekan Selanjutnya untuk melanjutkan' : '');
            selesaiJelajah(table, alasan);
            tulisStatus(jelajah.ringkas, false);
        } catch (e) {
            if (batal()) return;
            catatLog('jelajah fetch gagal: ' + e.message);
            if (!adaHalaman) {
                // fetch tidak berhasil sama sekali: pakai cara klik tombol "Selanjutnya"
                fetchGagal = true;
                mulaiJelajah(table);
                terapkanFilterRak();
            } else {
                selesaiJelajah(table, 'berhenti: ' + e.message);
                tulisStatus(jelajah.ringkas, false);
            }
        }
    }

    function terapkanFilterRak() {
        const table = document.querySelector(TABLE_SEL);
        if (!table) return;
        const info = document.getElementById('rk_filter_info');
        const stop = document.getElementById('rk_filter_stop');
        const tulis = (teks, tombol) => {
            // hanya tulis bila berubah: menulis ulang memicu MutationObserver dan membuat putaran tak berujung
            if (info && info.textContent !== teks) info.textContent = teks;
            if (stop) stop.style.display = tombol ? '' : 'none';
            setBar(teks, jelajah.aktif || jelajah.pindah);
        };

        if (!aktifFilter()) {
            hentikanJelajah();
            jelajah.sigSelesai = null;
            jelajah.ringkas = '';
            hapusHasil(table);
            table.querySelectorAll('tbody tr').forEach((tr) => { if (tr.style.display) tr.style.display = ''; });
            tulis('', false);
            return;
        }

        const sig = sigTabel(table);
        let total = 0, menunggu = 0;
        if ((jelajah.aktif || jelajah.pindah) && !document.getElementById('rk_hasil')) {
            const box = siapkanHasil(table);
            const tbody = box && box.querySelector('tbody');
            if (tbody) jelajah.baris.slice(0, TARGET_FILTER).forEach((tr) => tbody.appendChild(tr.cloneNode(true)));
        }
        // Transisi halaman: setelah klik "Selanjutnya", tunggu sampai isi tabel benar-benar berganti
        if (jelajah.pindah) {
            if (!sig || sig === jelajah.sig) { tulis('Hal. ' + jelajah.halaman + ': memuat halaman berikutnya... terkumpul ' + jelajah.baris.length + '/' + TARGET_FILTER, true); return; }
            clearTimeout(jelajah.timer);
            jelajah.pindah = false;
            jelajah.sig = sig;
            jelajah.halaman++;
        } else if (!jelajah.aktif && sig && sig !== jelajah.sigSelesai) {
            mulaiJelajah(table); // tabel baru (filter baru dipilih / halaman baru dari situs): mulai kumpulkan
            if (jelajah.mode === 'fetch') jalankanFetch(table);
        }
        if (jelajah.aktif && jelajah.mode === 'fetch') return; // mode fetch: kemajuan ditulis oleh jalankanFetch

        table.querySelectorAll('tbody tr').forEach((tr) => {
            const td = tr.querySelector('.rk_cell');
            if (!td) return;
            total++;
            const st = statusFilter(td);
            if (st === null) {
                // belum diketahui: sembunyikan dulu, periksa rak/gambarnya, lalu saring ulang
                menunggu++;
                tr.style.display = 'none';
                if (!td.dataset.rkantri) { td.dataset.rkantri = '1'; antreFilter.push(td); }
                return;
            }
            tr.style.display = (st === 'gagal' || st === 'cocok') ? '' : 'none'; // yang gagal diperiksa tetap tampil
        });
        pompaFilter();

        if (!jelajah.aktif) { tulis(jelajah.ringkas, false); return; }
        if (menunggu) {
            tulis('Hal. ' + jelajah.halaman + ': memeriksa ' + (total - menunggu) + '/' + total + ' - terkumpul ' + jelajah.baris.length + '/' + TARGET_FILTER, true);
            return;
        }
        if (!total) { hentikanJelajah(); tulis(jelajah.ringkas, false); return; } // tabel kosong: jangan biarkan loading menggantung

        // semua baris halaman ini sudah diketahui statusnya: kumpulkan yang cocok (sekali per halaman)
        if (jelajah.dikumpul !== jelajah.sig) {
            jelajah.dikumpul = jelajah.sig;
            const hasilBody = document.querySelector('#rk_hasil tbody');
            table.querySelectorAll('tbody tr').forEach((tr) => {
                const td = tr.querySelector('.rk_cell');
                if (!td || statusFilter(td) !== 'cocok') return;
                if (jelajah.baris.length >= TARGET_FILTER) return;
                const k = kunciBaris(td);
                if (jelajah.kunci.has(k)) return;
                jelajah.kunci.add(k);
                const salin = tr.cloneNode(true);
                salin.style.display = '';
                jelajah.baris.push(salin);
                if (hasilBody) hasilBody.appendChild(salin.cloneNode(true)); // langsung tampil begitu ketemu
            });
        }
        if (jelajah.baris.length >= TARGET_FILTER) { selesaiJelajah(table, ''); tulis(jelajah.ringkas, false); return; }
        const next = linkBerikut();
        if (!next) { selesaiJelajah(table, 'tombol Selanjutnya tidak ditemukan / halaman terakhir'); tulis(jelajah.ringkas, false); return; }
        if (jelajah.halaman >= MAKS_HALAMAN) { selesaiJelajah(table, 'batas ' + MAKS_HALAMAN + ' halaman'); tulis(jelajah.ringkas, false); return; }
        jelajah.pindah = true;
        clearTimeout(jelajah.timer);
        jelajah.timer = setTimeout(() => {
            if (!jelajah.pindah) return;
            selesaiJelajah(table, 'halaman berikutnya tidak termuat');
            tulis(jelajah.ringkas, false);
        }, 20000);
        tulis('Hal. ' + jelajah.halaman + ': memuat halaman berikutnya... terkumpul ' + jelajah.baris.length + '/' + TARGET_FILTER, true);
        simpanJelajah();
        catatLog('jelajah: klik Selanjutnya dari hal.' + jelajah.halaman);
        next.click();
    }

    // pasang combobox tepat di bawah kolom Barcode/Nama Produk/Kode Ref pada panel filter (sekali; dipasang ulang bila panel digambar ulang)
    function pasangFilterRak() {
        const cari = document.getElementById('pencarian_nama');
        const field = cari && cari.closest('.field2');
        if (!field) return;
        const ada = document.getElementById('rk_filter_box');
        if (ada) {
            if (field.nextElementSibling !== ada) field.insertAdjacentElement('afterend', ada); // pindahkan bila posisinya belum benar
            return;
        }
        const box = document.createElement('div');
        box.className = 'field2';
        box.id = 'rk_filter_box';
        const lb = document.createElement('label');
        lb.htmlFor = 'rk_filter_status';
        lb.textContent = 'Status Rak / Gambar';
        const sel = document.createElement('select');
        sel.id = 'rk_filter_status'; // tanpa atribut name: tidak ikut terkirim ke server
        [['', '-- Semua --'], ['rak_ada', 'Sudah ada rak'], ['rak_kosong', 'Belum ada rak'], ['gbr_ada', 'Sudah bergambar'], ['gbr_kosong', 'Belum ada gambar']].forEach((o) => {
            const op = document.createElement('option');
            op.value = o[0];
            op.textContent = o[1];
            sel.appendChild(op);
        });
        sel.value = filterRak ? 'rak_' + filterRak : (filterGbr ? 'gbr_' + filterGbr : '');
        sel.addEventListener('change', () => {
            const v = sel.value;
            filterRak = v.indexOf('rak_') === 0 ? v.slice(4) : '';
            filterGbr = v.indexOf('gbr_') === 0 ? v.slice(4) : '';
            hentikanJelajah();
            jelajah.sigSelesai = null;
            try {
                sessionStorage.setItem(FILTER_KEY, filterRak);
                sessionStorage.setItem(FILTER_GBR_KEY, filterGbr);
            } catch (e) { /* abaikan */ }
            terapkanFilterRak();
        });
        const info = document.createElement('div');
        info.id = 'rk_filter_info';
        info.style.cssText = 'font-size:11px;color:#777;margin-top:3px';
        box.appendChild(lb);
        box.appendChild(document.createElement('br'));
        box.appendChild(sel);

        box.appendChild(info);
        const stop = document.createElement('button');
        stop.type = 'button';
        stop.id = 'rk_filter_stop';
        stop.textContent = 'Berhenti & tampilkan';
        stop.style.cssText = 'display:none;margin-top:4px;font-size:11px;padding:2px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer';
        stop.addEventListener('click', () => {
            const table = document.querySelector(TABLE_SEL);
            if (table && jelajah.aktif) { selesaiJelajah(table, 'dihentikan'); terapkanFilterRak(); }
        });
        box.appendChild(stop);
        field.insertAdjacentElement('afterend', box);
        terapkanFilterRak();
    }

    // judul popup untuk satu baris tabel: "barcode - nama"
    function judulBaris(td) {
        const namaTd = td.previousElementSibling;
        const ikon = namaTd && namaTd.querySelector('.gs_ikon');
        const nama = namaTd ? namaTd.textContent.replace(ikon ? ikon.textContent : '', '').replace(/\s+/g, ' ').trim() : '';
        return [td.dataset.bc, nama].filter(Boolean).join(' - ');
    }

    // popup harga jual per jenis pelanggan (klik panah merah di sel Harga Jual)
    function bukaModalHarga(panah, id, judul) {
        const m = bukaPop(panah, judul || ('Produk ' + id));
        m.info('Memuat harga...');

        ambilGambar(id).then(() => {
            if (!document.body.contains(m.pop)) return; // popup sudah ditutup
            const data = HCACHE[id];
            if (data === null || data === undefined) return m.info('Tab harga tidak ditemukan.', true);
            if (!data.length) return m.info('Tabel jenis pelanggan tidak terbaca. ' + (HDIAG[id] || ''), true);
            m.isi.textContent = '';
            const jd = document.createElement('div');
            jd.className = 'rk_info';
            jd.textContent = 'Harga jual per jenis pelanggan';
            m.isi.appendChild(jd);
            data.forEach((r) => {
                const row = document.createElement('div');
                row.className = 'hj_row';
                const n = document.createElement('span');
                n.className = 'hj_nm';
                n.textContent = r.nama;
                const h = document.createElement('span');
                h.className = 'hj_hg';
                h.textContent = r.harga;
                row.appendChild(n);
                row.appendChild(h);
                m.isi.appendChild(row);
            });
            m.tombolTutup();
            m.taruh();
        }).catch((err) => {
            catatLog('harga produk ' + id + ' gagal: ' + err.message);
            if (document.body.contains(m.pop)) m.info('Gagal memuat harga (' + err.message + ').', true);
        });
    }

    document.addEventListener('click', (e) => {
        const panah = e.target.closest && e.target.closest('i.fa-angle-double-down, .hj_btn');
        if (!panah) return;
        const td = panah.closest('td.hj_td');
        if (!td || !td.dataset.hjprd) return;
        e.preventDefault();
        e.stopPropagation();
        try {
            const rk = td.parentElement && td.parentElement.querySelector('.rk_cell');
            bukaModalHarga(panah, td.dataset.hjprd, rk ? judulBaris(rk) : '');
        } catch (err) {
            console.error('[Harga] gagal membuka popup', err);
        }
    }, true);

    // klik ikon gambar -> ambil & tampilkan gambar di popup
    document.addEventListener('click', (e) => {
        const ikon = e.target.closest && e.target.closest('.gs_ikon');
        if (!ikon) return;
        e.preventDefault();
        e.stopPropagation();
        // judul "barcode - nama" dari baris (ikon kini di sel Barcode, jadi teks selnya bukan nama produk)
        const rk = ikon.closest('tr') && ikon.closest('tr').querySelector('.rk_cell');
        bukaModal(ikon, ikon.dataset.prd, rk ? judulBaris(rk) : '');
    }, true);

    // klik "Map rak" di bawah barcode -> popup daftar rak yang sama dengan kolom Rak
    document.addEventListener('click', (e) => {
        const lihat = e.target.closest && e.target.closest('.rk_bc_rak');
        if (!lihat) return;
        e.preventDefault();
        e.stopPropagation();
        const rk = lihat.closest('tr') && lihat.closest('tr').querySelector('.rk_cell');
        if (!rk) return;
        try {
            catatLog('klik Map rak (bawah barcode) produk=' + (rk.dataset.prd || '?'));
            bukaModalRak(rk, judulBaris(rk), lihat);
        } catch (err) {
            console.error('[Rak] gagal membuka popup', err);
        }
    }, true);

    // klik "Map rak" -> popup daftar rak (capture + stopPropagation: tidak sampai ke handler situs)
    document.addEventListener('click', (e) => {
        const td = e.target.closest && e.target.closest('.rk_cell');
        if (!td) return;
        e.preventDefault();
        e.stopPropagation();
        try {
            catatLog('klik Map rak produk=' + (td.dataset.prd || '?'));
            bukaModalRak(td, judulBaris(td));
        } catch (err) {
            console.error('[Rak] gagal membuka popup', err);
        }
    }, true);

    let timer = null;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            pasangFilterRak();
            const table = document.querySelector(TABLE_SEL);
            if (table) enhance(table);
        }, 150);
    }

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', () => {
        const t = document.querySelector(TABLE_SEL);
        if (t) setTimeout(() => syncWidths(t), 100);
    });
    schedule();
})();
