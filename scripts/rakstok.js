// ==UserScript==
// @name         Erzap - Lihat Stok
// @namespace    http://tampermonkey.net/
// @version      1.27.10
// @description  Lihat Stok: tabel & kolom bawaan Erzap tidak diubah. Menambah "Map rak" di bawah barcode, dengan ikon QR di sebelah kirinya yang membuka popup gambar barcode (Code 128) + tombol "Penentuan Rak" (popup besar tanpa pindah tab, outlet/gudang otomatis untuk layout single maupun multi outlet, rak berupa combobox yang bisa dicari), ikon logo di kolom Nama (popup gambar + Edit gambar di popup), panah di kolom Harga Jual (harga jual per jenis pelanggan), dan filter Status Rak / Gambar.
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @world        main
// @grant        none
// ==/UserScript==

// ====== HAK AKSES & FITUR (JSON) ======
// "public"  -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini.
// "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua). Nama fitur: editGambar, penentuanRak.
// "role"    -> nama-nama role: "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
//              cukup sebagian nama), "fitur" = fitur private yang boleh dipakai role itu.
// Fitur yang tidak disebut di "public" maupun "private" ditolak.
// Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
var RK_AKSES_JSON = `{
    "public": ["mapRak", "barcode", "gambar", "hargaJual", "filter", "editGambar", "penentuanRak"],
    "private": [],
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
var rkAkses = (function () {
    try {
        var a = JSON.parse(RK_AKSES_JSON) || {};
        var role = a.role && typeof a.role === 'object' ? a.role : {};
        return {
            public: Array.isArray(a.public) ? a.public.map(String) : [],
            role: Object.keys(role).map(function (k) {
                var r = role[k] || {};
                return {
                    nama: Array.isArray(r.nama) ? r.nama.map(String) : [],
                    fitur: Array.isArray(r.fitur) ? r.fitur.map(String) : []
                };
            })
        };
    } catch (err) {
        console.error('[rakstok] RK_AKSES_JSON tidak valid -> akses ditutup:', err.message);
        return { public: [], role: [] };
    }
})();
// true bila fitur boleh dipakai user yang sedang login (dicek saat dipakai, karena nama kasir dimuat belakangan).
function rkBoleh(fitur) {
    if (rkAkses.public.indexOf(fitur) !== -1) return true;
    var nama = String((document.getElementById('info_kasir') || {}).textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    for (var i = 0; i < rkAkses.role.length; i++) {
        var r = rkAkses.role[i];
        var cocok = r.nama.some(function (u) { u = u.replace(/\s+/g, ' ').trim().toLowerCase(); return !!u && nama.indexOf(u) !== -1; });
        if (cocok) return r.fitur.indexOf('*') !== -1 || r.fitur.indexOf(fitur) !== -1;
    }
    return false;
}

// =====================================================================================================
// Bagian 1: tabel Lihat Stok (Map rak, barcode, gambar, harga jual, filter)
// =====================================================================================================
(function () {
    'use strict';

    const TABLE_SEL = '#data_table_produk';
    const STOK_SEL = 'td.bt_dialog_aktifitas_stok';
    const CACHE_KEY = 'aistim_rak_cache_v4';
    const CACHE_TTL = 60 * 60 * 1000;
    const MAKS_GUDANG = 8;

    try { sessionStorage.removeItem('aistim_rak_jelajah'); } catch (e) { }

    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
    Object.keys(cache).forEach((k) => { if (!cache[k] || Date.now() - cache[k].t > CACHE_TTL) delete cache[k]; });
    let saveTimer = null;
    function saveCache() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                const now = Date.now();
                Object.keys(cache).forEach((k) => { if (now - cache[k].t > CACHE_TTL) delete cache[k]; });
                localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            } catch (e) { }
        }, 500);
    }

    const FILTER_TTL = 30 * 60 * 1000;
    function muatCache(key) {
        try {
            const o = JSON.parse(localStorage.getItem(key) || '{}') || {};
            Object.keys(o).forEach((k) => { if (!o[k] || Date.now() - o[k].t > FILTER_TTL) delete o[k]; });
            return o;
        } catch (e) { return {}; }
    }
    const RAKF = muatCache('aistim_rakf_cache_v1');
    const GBOOL = muatCache('aistim_gbool_cache_v1');
    let simpanFTimer = null;
    function simpanFilterCache() {
        clearTimeout(simpanFTimer);
        simpanFTimer = setTimeout(() => {
            try {
                localStorage.setItem('aistim_rakf_cache_v1', JSON.stringify(RAKF));
                localStorage.setItem('aistim_gbool_cache_v1', JSON.stringify(GBOOL));
            } catch (e) { }
        }, 800);
    }
    function segar(c) { return !!c && Date.now() - c.t < FILTER_TTL; }

    const LOGO_IKON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAPFBMVEVHcEztHCT////sAATtHCTtHCTtHCTtHCTtHCTtHCTtEhzwTVH4ubruNDn6y8zzf4H83t/+8vLyaGz1m50cRTncAAAACnRSTlMA////pHz73ii9DsDuxAAAAnVJREFUWIXNl9uaoyAMgJW0ajkf3v9dN1i/kQhB3LnYzcWMRfMTIAnJNB2yvT/rPCjr571NVLZh5UOWlSBeD9V3eZ36T6c/ZB3Qlyi3BMZ+CQBSoUB+aH+zr2Jj1E2y4hCbDIPYmAVIcF4Q8a6JWNsGQAyikhChacK7Mb2t1bPo2ojlPX0qfdOY/jDCVIRPtQXScOpZKsI6PdJvEK4AYO0/VnHdyQsAdF8/72QPIOOdvhBRdgCXBeiY3ThSqy6LIABw1NjvuWNQEISTPKD0XwcM2QMHIEfoyGeEQI6yBEDiN7tcRQIOUMRA5bPyfGdZQGANICYEFnBOEmsLChdhAOUetpJHexdLgGrPUdun/g3gt0sY2cQuYOAYb5ZwvuQcqQsovZRz5R6ABBN5MwSQZZjx4cwApISZ3DSRSygEcIpx9KLybEorAR1RbFIdA3TS+hDAdy6WEUCYO1fbAKBxPT8C+EbF9QTQKDCeALxqJYlhgI1MnTYCCNbNXKVYFRhXMWbO/sx/cAeozv0x4E7+A8BS/ir3Cwv9vUz/DpzbSM9jIYUmJGv13iKgcozKWuvAm/w7me+wnC3JSCspdcF7F/TszKyM8jaKpEXUUjl0EWdMlMbJGEhW/5BiG3wC64UVmEN1CAkzm9fC4YAW+IBPXhhHIvJNyv29yIo4rUZVq9X+F2k2gTDaZ76nEbVspOHIr/EGUDj9AZhx1ugSDhlrcQgCuVX2rmmjAJntzBbgxDmIABEh4N2uLWCwBOqZW6PpAvNdJOTskU8VMzt8Dw9vCBoVr2bbJ3/8//r/KiONY09+9H/f+v5F8z2vVf+O7f9yr5dlKdv/P98nJyMLRjJkAAAAAElFTkSuQmCC';

    const style = document.createElement('style');
    style.textContent = `
        .rk_bc_baris { margin-top: 3px; }
        td.rk_nama_td { min-width: 300px; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; overflow-wrap: anywhere; }
        .rk_bc_ikon { display: inline-block; width: 18px; margin-right: 6px; text-align: center; color: #444; cursor: pointer; }
        .rk_bc_ikon:hover { color: #0d6efd; }
        #gs_rak_pop.rk_barcode { width: min(320px, 94vw); max-width: min(320px, 94vw); }
        #gs_rak_pop .rk_bcbox { text-align: center; background: #fff; padding: 6px 2px 2px; }
        #gs_rak_pop .rk_bcsvg { display: block; width: 100%; height: auto; }
        #gs_rak_pop .rk_bcteks { margin-top: 2px; font: 600 15px/1.3 ui-monospace, Consolas, monospace; letter-spacing: .12em; color: #111; word-break: break-all; }
        .rk_bc_rak { display: inline-flex; align-items: center; gap: 3px; color: #0d6efd; cursor: pointer; text-decoration: underline; white-space: nowrap; font-size: inherit; }
        .rk_bc_rak:hover { color: #0a58ca; }
        .rk_bc_rak .fa-map-marker { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; box-sizing: border-box; border: 1.5px solid currentColor; border-radius: 4px; font-size: 12px; line-height: 1; text-decoration: none; }
        @keyframes rk_kedip { 0%, 100% { opacity: 1; } 50% { opacity: .15; } }
        .rk_bc_rak .fa { animation: rk_kedip 2.4s ease-in-out infinite; }
        .rk_bc_rak:hover .fa { animation-play-state: paused; opacity: 1; }
        @media (prefers-reduced-motion: reduce) { .rk_bc_rak .fa { animation: none; } }
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
        #gs_rak_pop.rk_gambar { width: min(340px, 94vw); max-width: min(340px, 94vw); }
        #gs_rak_pop.rk_gambar .rk_isi { scroll-snap-type: y mandatory; }
        #gs_rak_pop .rk_grid { display: grid; grid-template-columns: 1fr; gap: 6px; }
        #gs_rak_pop .rk_kotak { position: relative; aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center; overflow: hidden;
                                border: 1px solid #dfe3ee; border-radius: 6px; background: #fafafa; box-sizing: border-box; scroll-snap-align: start; }
        #gs_rak_pop .rk_kotak img { display: block; width: 100%; height: 100%; object-fit: contain;
                                    pointer-events: none; -webkit-touch-callout: none; -webkit-user-drag: none; user-select: none; }
        #gs_rak_pop .rk_kotak .rk_no { position: absolute; left: 4px; top: 4px; font-size: 10px; line-height: 1; padding: 2px 6px; border-radius: 8px;
                                       background: rgba(0,0,0,.55); color: #fff; pointer-events: none; }
        .gs_ikon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
                   margin: 0 5px 2px 0; border: 1px solid #ccd; border-radius: 4px; background: #f4f6ff;
                   cursor: pointer; font-size: 11px; line-height: 1; vertical-align: middle; user-select: none;
                   overflow: hidden; box-sizing: border-box; flex: none; max-width: 20px; max-height: 20px; }
        .gs_ikon:hover { background: #e3e8ff; }
        .gs_ikon.gs_logo { background: #fff url("${LOGO_IKON}") no-repeat 50% 50% / contain; border-color: #e3e3e8; }
        .hj_td i.fa-angle-double-down, .hj_td .hj_btn { cursor: pointer; padding: 0 4px; }
        .hj_td .hj_btn { color: red; font-style: normal; }
        #gs_rak_pop .hj_row { display: flex; justify-content: space-between; gap: 14px; padding: 3px 0; border-bottom: 1px solid #ddd; }
        #gs_rak_pop .hj_row:last-of-type { border-bottom: 0; }
        #gs_rak_pop .hj_nm { font-weight: 700; color: #444; }
        #gs_rak_pop .hj_hg { font-weight: 600; color: #0d9bdb; white-space: nowrap; }
    `;
    document.head.appendChild(style);

    function findIndexIn(tr, label) {
        const ths = tr.children;
        for (let i = 0; i < ths.length; i++) {
            if (ths[i].textContent.trim().toLowerCase() === label) return i;
        }
        return -1;
    }

    function angka(t) {
        const m = String(t || '').match(/-?[\d.,]+/);
        if (!m) return NaN;
        return parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
    }

    const rakLog = [];
    function catatLog(baris) {
        rakLog.push(new Date().toTimeString().slice(0, 8) + ' ' + baris);
        if (rakLog.length > 30) rakLog.shift();
        try { document.documentElement.setAttribute('data-aistim-rak-log', rakLog.join('\n')); } catch (e) { }
    }

    async function ambilHtml(url, params) {
        const qs = new URLSearchParams(params).toString();
        let res;
        try {
            res = await fetch(url + '?' + qs, {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'text/plain, */*; q=0.01' }
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
        doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
        return doc;
    }

    async function daftarGudang(idproduk, idoutlet) {
        const html = await ambilHtml('/produk_gudangs/detail_stok/new', { idproduk: idproduk, idgudang: '', idoutlet: idoutlet });
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

    async function rakGudang(idproduk, idgudang, idoutlet) {
        const html = await ambilHtml('/produk_gudangs/aktifitas_stok/new', {
            idproduk: idproduk, idgudang: idgudang, idoutlet: idoutlet,
            idproduk_harga: '', hide_stok_awal_stok_akhir: 'false'
        });
        const teks = parseHtml(html).body.textContent || '';
        const m = teks.match(/Penempatan Rak\s*:?\s*([\s\S]*?)(?:Tabel ini dibaca|Tanggal\s+Kode|$)/i);
        if (!m) {
            catatLog('RAK tidak ketemu di respons (' + teks.length + ' char): ' + teks.replace(/\s+/g, ' ').trim().slice(0, 150));
            // Respons yang bukan halaman aktivitas stok (halaman login/galat dengan status 200) jangan dianggap
            // "belum ada rak": dilempar sebagai galat supaya baris itu ditandai gagal, bukan salah masuk filter.
            if (!/Tanggal\s*Kode|Tabel ini dibaca/i.test(teks)) throw new Error('respons aktivitas stok tidak valid');
            return '';
        }
        // Tanda strip / "belum ada" bukan nama rak
        return m[1].split(/\n+/).map((s) => s.replace(/\s+/g, ' ').trim())
            .filter((s) => s && !/^[-–—.]+$|^(n\/a|tidak ada|belum ada.*|kosong)$/i.test(s)).join(', ');
    }

    async function ambilRakProduk(idproduk, idoutlet, idgudangCell) {
        let gudangs = [];
        try { gudangs = await daftarGudang(idproduk, idoutlet); } catch (e) { }
        if (!gudangs.length) gudangs = [{ id: idgudangCell || '', nama: '', outlet: '', stok: NaN }];
        const target = gudangs.slice(0, MAKS_GUDANG);
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

    const GCACHE = {};
    const HDIAG = {};
    const HCACHE = {};

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
        tambah(doc.querySelector('#tab_produk_harga_pelanggan'));
        doc.querySelectorAll('a[href^="#"], [data-bs-target^="#"], [data-target^="#"]').forEach((a) => {
            if (!/harga/i.test(a.textContent)) return;
            const ref = a.getAttribute('href') || a.getAttribute('data-bs-target') || a.getAttribute('data-target') || '';
            if (ref.length < 2) return;
            try { tambah(doc.querySelector(ref)); } catch (e) { }
        });
        doc.querySelectorAll('[id*="harga" i]').forEach((el) => { if (el.querySelector('table')) tambah(el); });
        return panes;
    }

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
                if (!heads.length || !/^jenis/i.test(heads[0])) return;
                const col = heads.findIndex((h, i) => i > 0 && /harga/i.test(h) && !/diskon/i.test(h));
                kolomJenis = heads.join(' | ');
                if (col < 0) return;
                tb.querySelectorAll('tbody tr').forEach((tr) => {
                    const cells = Array.from(tr.children);
                    if (cells.length <= col) return;
                    const nama = teksBersih(cells[0]);
                    const nilai = nilaiSel(cells[col]);
                    if (!nama || nilai === '') return;
                    if (hasil.some((x) => x.nama.toLowerCase() === nama.toLowerCase())) return;
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

    const GPROMISE = {};
    const RE_PANE = /id\s*=\s*["']tab_produk_gambar["']/;
    function urlEdit(id) { return location.origin + '/produks/' + encodeURIComponent(id) + '/edit'; }

    function tambahEditGambar(m, id) {
        const foot = m.pop.querySelector('.rk_foot');
        if (!foot || foot.querySelector('.rk_edit') || !rkBoleh('editGambar')) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'rk_tutup rk_edit';
        b.textContent = '✎ Edit gambar';
        b.title = 'Edit gambar produk di popup';
        b.addEventListener('click', () => bukaEditGambar(id, m.judul));
        foot.insertBefore(b, foot.firstChild);
    }

    const CSS_EDIT_IFRAME =
        '#header,#wrapper_menu_mobile,#wrapper_sidebar_mobile,#footer,#menu_action,#sidebar,#extra_notice,#produkTab,#floating-buttons-group,#mcp-float,' +
        '#content_full_page_target > .d-flex,#produkTabContent > .tab-pane:not(#tab_produk_gambar){display:none!important}' +
        '#tab_produk_gambar{display:block!important;opacity:1!important}' +
        'html,body{background:#fff!important;margin:0!important;padding:0!important}' +
        '#wrapper,#container,#content_full_page,#content_full_page_target{margin:0!important;padding:0!important;width:100%!important;max-width:none!important;min-height:0!important;position:static!important;float:none!important}' +
        '[id^="edit_produk_"],#produkTabContent{margin:0!important;padding:0!important;border:0!important;box-shadow:none!important;background:none!important;width:auto!important;max-width:none!important}' +
        '#tabs_produk{margin:0!important;padding:12px!important;border:0!important}' +
        'html{overflow:hidden!important}' +
        'body{position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:62px!important;overflow-x:hidden!important;overflow-y:auto!important;padding-bottom:80px!important}' +
        '#rk_aksi{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;align-items:center;justify-content:flex-end;gap:8px;box-sizing:border-box;padding:12px 16px;background:#f7f8fa;border-top:1px solid #d5d9e0;box-shadow:0 -3px 8px rgba(0,0,0,.06)}' +
        'label.btn[for="fileupload"]{position:static!important;width:auto!important;margin:0!important;' +
        'padding:9px 18px!important;font-size:13px!important;font-weight:600;line-height:1.2;color:#fff!important;background:#0d6efd!important;border:0!important;' +
        'border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,.35);cursor:pointer}' +
        'label.btn[for="fileupload"]:hover{background:#0b5ed7!important}' +
        'label.btn[for="fileupload"] .fa-image{display:none!important}' +
        '#rk_batal{padding:9px 18px;font-size:13px;font-weight:600;line-height:1.2;color:#444;background:#fff;border:1px solid #bbb;border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,.25);cursor:pointer}' +
        '#rk_batal:hover{background:#f0f0f0}' +
        '#rk_simpan{padding:9px 18px;font-size:13px;font-weight:600;line-height:1.2;color:#fff;background:#198754;border:0;border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,.35);cursor:pointer}' +
        '#rk_simpan:hover{background:#157347}' +
        '#rk_simpan:disabled{background:#9dbfae;box-shadow:none;cursor:not-allowed}' +
        '#rk_pending{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),340px));gap:12px;justify-content:center;margin:0 0 12px}' +
        '#rk_pending:empty{display:none}' +
        '#rk_pending .rk_p{position:relative;width:100%;max-width:340px;box-sizing:border-box;border:2px dashed #f0ad4e;border-radius:8px;background:#fffaf0;overflow:hidden}' +
        '#rk_pending .rk_p img{display:block;width:100%;aspect-ratio:1/1;object-fit:contain;background:#fafafa}' +
        '#rk_pending .rk_pc{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;font-size:12px;color:#7a5a12}' +
        '#rk_pending .rk_pc b{display:block;color:#333;word-break:break-all}' +
        '#rk_pending .rk_pc .rk_gagal{color:#dc3545;font-weight:600}' +
        '#rk_pending .rk_px{border:0;background:#fff;border-radius:50%;width:26px;height:26px;line-height:24px;font-size:18px;color:#dc3545;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.3);flex:none}' +
        'body.rk_ada_pending #rk_kosong{display:none!important}' +
        '#tab_produk_gambar .row.row-gap-3{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),340px));gap:12px!important;justify-content:center;margin:0!important}' +
        '#tab_produk_gambar .row.row-gap-3 > *{width:100%!important;max-width:340px;min-width:0;flex:none!important;padding:0!important;margin:0!important}' +
        '#tab_produk_gambar .row.row-gap-3 > #new_photo{display:none!important}' +
        '#tab_produk_gambar .card{border:1px solid #ccc!important;border-radius:6px!important;box-shadow:0 2px 8px rgba(0,0,0,.08)!important;overflow:hidden!important}' +
        '#tab_produk_gambar .card-img-top{height:200px!important;max-height:none!important;display:flex!important;align-items:center!important;justify-content:center!important;background:#f7f8fa!important;border-bottom:1px solid #eee!important}' +
        '#tab_produk_gambar .card-img-top a{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;height:100%!important}' +
        '#tab_produk_gambar img.card-img-top{display:block;width:100%!important;height:200px!important;object-fit:contain!important;background:#fafafa}' +
        '#tab_produk_gambar .produk-gambar-informasi{padding:10px 12px!important}' +
        '#tab_produk_gambar .card-title{font-size:12px!important;font-weight:600!important;color:#444!important;margin:0 0 8px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}' +
        '#tab_produk_gambar .produk-gambar-informasi .btn{font-size:11px!important;line-height:1.2!important;padding:3px 10px!important;height:25px!important;border-radius:4px!important}' +
        '#rk_aksi > button,#rk_aksi > label{font-size:11px!important;font-weight:400!important;padding:3px 10px!important;height:25px!important;line-height:1.2!important;border-radius:4px!important}' +
        'label.btn[for="fileupload"]{display:inline-flex!important;align-items:center!important;justify-content:center!important}' +
        '#rk_kosong{display:none;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:340px;max-width:100%;aspect-ratio:1/1;margin:12px auto 0;' +
        'border:2px dashed #cfd6e4;border-radius:8px;background:#fafafa;color:#9aa4b5;font-size:13px}' +
        '#rk_kosong .fa{font-size:64px;line-height:1}' +
        '#tab_produk_gambar .row.row-gap-3:not(:has(> :not(#new_photo))) + #rk_kosong{display:flex}' +
        '@media (max-width:560px){' +
        '#tabs_produk{padding:8px!important}' +
        '#rk_aksi{padding:10px 12px}' +
        '#rk_aksi > *{flex:1 1 0;min-width:0;box-sizing:border-box;text-align:center;white-space:nowrap;box-shadow:none!important}' +
        '#rk_pending .rk_p,#rk_kosong,#tab_produk_gambar .row.row-gap-3 > *{max-width:none}' +
        '}';

    function tutupEditGambar() {
        const ov = document.getElementById('rk_edit_ov');
        if (!ov) return;
        if (ov._rkAdaPending && ov._rkAdaPending() && !window.confirm('Ada gambar yang sudah dipilih tapi belum disimpan. Tutup tanpa menyimpan?')) return;
        if (ov._rkTimer) clearInterval(ov._rkTimer);
        const id = ov.dataset.prd;
        ov.remove();
        if (id) { delete GCACHE[id]; delete GBOOL[id]; simpanFilterCache(); }
    }

    function pasangSimpanGambar(ov, w, doc, aksi) {
        const $ = w.jQuery;
        const inp = doc.getElementById('fileupload');
        if (!$) { ov._rkAlasan = 'jQuery di halaman edit belum ada'; return false; }
        if (!$.fn || !$.fn.fileupload) { ov._rkAlasan = 'plugin fileupload belum dimuat'; return false; }
        if (!inp) { ov._rkAlasan = 'input #fileupload belum ada'; return false; }
        const fu = $(inp);
        if (!(fu.data('blueimp-fileupload') || fu.data('fileupload'))) { ov._rkAlasan = 'plugin fileupload belum diinisialisasi pada #fileupload'; return false; }
        if (ov._rkSimpanOK) return true;
        const pane = doc.getElementById('tab_produk_gambar');
        const daftar = doc.querySelector('#tab_produk_gambar .row.row-gap-3');
        if (!daftar && !pane) { ov._rkAlasan = 'tab gambar tidak ditemukan'; return false; }
        ov._rkSimpanOK = true;
        try { fu.fileupload('option', 'autoUpload', false); } catch (e) { ov._rkSimpanOK = false; ov._rkAlasan = 'gagal mematikan autoUpload: ' + e.message; return false; }
        inp.multiple = true;
        inp.accept = 'image/jpeg,image/png';
        const pending = [];
        let menyimpan = false;
        ov._rkAdaPending = () => pending.length;
        const wadah = doc.createElement('div');
        wadah.id = 'rk_pending';
        if (daftar) daftar.insertAdjacentElement('beforebegin', wadah); else pane.insertBefore(wadah, pane.firstChild);
        let simpan = doc.getElementById('rk_simpan');
        if (!simpan) {
            simpan = doc.createElement('button');
            simpan.type = 'button';
            simpan.id = 'rk_simpan';
            const lblGambar = aksi.querySelector('label[for="fileupload"]');
            if (lblGambar) aksi.insertBefore(simpan, lblGambar); else aksi.appendChild(simpan);
        }
        simpan.title = 'Simpan gambar yang dipilih';
        const hapusItem = (item) => {
            const i = pending.indexOf(item);
            if (i >= 0) pending.splice(i, 1);
        };
        const render = () => {
            wadah.textContent = '';
            pending.forEach((item) => {
                const kotak = doc.createElement('div');
                kotak.className = 'rk_p';
                const im = doc.createElement('img');
                im.alt = '';
                if (item.url) im.src = item.url;
                const cap = doc.createElement('div');
                cap.className = 'rk_pc';
                const tk = doc.createElement('div');
                const nm = doc.createElement('b');
                nm.textContent = item.nama;
                const st = doc.createElement('span');
                if (item.gagal) { st.className = 'rk_gagal'; st.textContent = 'Gagal disimpan, coba Simpan lagi'; } else st.textContent = item.proses ? 'Menyimpan...' : (menyimpan ? 'Menunggu giliran...' : 'Belum disimpan');
                tk.appendChild(nm);
                tk.appendChild(st);
                const x = doc.createElement('button');
                x.type = 'button';
                x.className = 'rk_px';
                x.title = 'Batalkan gambar ini';
                x.textContent = '×';
                x.disabled = menyimpan;
                x.addEventListener('click', () => { hapusItem(item); render(); });
                cap.appendChild(tk);
                cap.appendChild(x);
                kotak.appendChild(im);
                kotak.appendChild(cap);
                wadah.appendChild(kotak);
            });
            doc.body.classList.toggle('rk_ada_pending', pending.length > 0);
            simpan.disabled = !pending.length || menyimpan;
            simpan.textContent = menyimpan ? 'Menyimpan...' : (pending.length > 1 ? 'Simpan (' + pending.length + ')' : 'Simpan');
        };
        fu.on('fileuploadadd', (e, data) => {
            (data.files || []).forEach((file) => {
                // Kalau MIME type kosong, pakai ekstensi nama file. Tipe yang tidak cocok ditolak.
                const cocok = file.type
                    ? /^image\/(jpeg|png)$/i.test(file.type)
                    : /\.(jpe?g|png)$/i.test(file.name || '');
                if (!cocok) return;
                if (pending.some((p) => p.file.name === file.name && p.file.size === file.size && p.file.lastModified === file.lastModified)) return;
                const item = { data: data, file: file, nama: file.name || 'gambar', url: '', gagal: false, proses: false };
                pending.push(item);
                try {
                    const fr = new w.FileReader();
                    fr.onload = () => { item.url = String(fr.result || ''); render(); };
                    fr.readAsDataURL(file);
                } catch (err) { }
            });
            render();
        });
        simpan.addEventListener('click', () => {
            if (!pending.length || menyimpan) return;
            menyimpan = true;
            const antre = pending.slice();
            render();
            const lanjut = () => {
                const item = antre.shift();
                if (!item) { menyimpan = false; render(); return; }
                item.gagal = false;
                item.proses = true;
                render();
                let xhr = null;
                try { xhr = item.data.submit(); } catch (err) { xhr = null; }
                if (!xhr || !xhr.then) { item.gagal = true; item.proses = false; lanjut(); return; }
                xhr.done(() => hapusItem(item)).fail(() => { item.gagal = true; }).always(() => { item.proses = false; lanjut(); });
            };
            lanjut();
        });
        render();
        return true;
    }

    // Notifikasi kecil di dalam popup edit gambar (textContent, bukan HTML).
    function tampilNotifEdit(ov, teks) {
        let n = ov.querySelector('#rk_notif');
        if (!n) {
            n = document.createElement('div');
            n.id = 'rk_notif';
            n.setAttribute('role', 'status');
            n.style.cssText = 'position:absolute;left:50%;bottom:16px;transform:translateX(-50%);max-width:92%;background:#343a40;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;line-height:1.4;z-index:6;box-shadow:0 2px 8px rgba(0,0,0,.3);text-align:center';
            ov.appendChild(n);
        }
        n.textContent = teks;
    }

    function bukaEditGambar(id, judul) {
        tutupModal();
        tutupEditGambar();
        delete GCACHE[id];
        delete GBOOL[id];
        simpanFilterCache();
        if (!document.getElementById('rk_edit_css')) {
            const st = document.createElement('style');
            st.id = 'rk_edit_css';
            st.textContent =
                '#rk_edit_ov{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:2vh 2vw;box-sizing:border-box}' +
                '#rk_edit_box{display:flex;flex-direction:column;width:min(760px,96vw);height:min(88vh,820px);height:min(88dvh,820px);background:#fff;border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,.4);overflow:hidden}' +
                '#rk_edit_box .rk_eh{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border-bottom:1px solid #ddd;background:#f7f8fa;flex:none}' +
                '#rk_edit_box .rk_et{font-size:13px;font-weight:600;color:#333;word-break:break-word;min-width:0}' +
                '#rk_edit_box .rk_ex{border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#555;padding:0 4px;flex:none}' +
                '@media (max-width:600px),(max-height:520px){#rk_edit_ov{padding:0}#rk_edit_box{width:100vw;height:100vh;height:100dvh;border-radius:0}' +
                '#rk_edit_box .rk_ex{font-size:28px;padding:0 10px}}' +
                '#rk_edit_box .rk_ex:hover{color:#000}' +
                '#rk_edit_box .rk_eb{position:relative;flex:1;min-height:0}' +
                '#rk_edit_box iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}' +
                '#rk_edit_box .rk_em,#rk_edit_box .rk_load{position:absolute;inset:0;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;color:#555;font-size:12px;background:#fff;text-align:center;padding:12px}' +
                '#rk_edit_box .rk_load{display:none;background:rgba(255,255,255,.8);z-index:5}' +
                '#rk_edit_box .rk_load.rk_on{display:flex}' +
                '@keyframes rk_putar{to{transform:rotate(360deg)}}' +
                '#rk_edit_box .rk_spin{width:34px;height:34px;border:4px solid #d7e3fb;border-top-color:#0d6efd;border-radius:50%;animation:rk_putar .8s linear infinite}';
            document.head.appendChild(st);
        }
        const ov = document.createElement('div');
        ov.id = 'rk_edit_ov';
        ov.dataset.prd = id;
        const box = document.createElement('div');
        box.id = 'rk_edit_box';
        const head = document.createElement('div');
        head.className = 'rk_eh';
        const t = document.createElement('div');
        t.className = 'rk_et';
        t.textContent = 'Edit gambar' + (judul ? ' - ' + judul : '');
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'rk_ex';
        x.title = 'Tutup (Esc)';
        x.innerHTML = '&times;';
        x.addEventListener('click', tutupEditGambar);
        head.appendChild(t);
        head.appendChild(x);
        const body = document.createElement('div');
        body.className = 'rk_eb';
        const f = document.createElement('iframe');
        f.style.visibility = 'hidden';
        const msg = document.createElement('div');
        msg.className = 'rk_em';
        const sp0 = document.createElement('div');
        sp0.className = 'rk_spin';
        const tx0 = document.createElement('div');
        tx0.textContent = 'Memuat halaman edit gambar...';
        msg.appendChild(sp0);
        msg.appendChild(tx0);
        const proses = document.createElement('div');
        proses.className = 'rk_load';
        const sp1 = document.createElement('div');
        sp1.className = 'rk_spin';
        const tx1 = document.createElement('div');
        tx1.textContent = 'Memproses...';
        proses.appendChild(sp1);
        proses.appendChild(tx1);
        body.appendChild(f);
        body.appendChild(proses);
        body.appendChild(msg);
        box.appendChild(head);
        box.appendChild(body);
        ov.appendChild(box);
        document.body.appendChild(ov);
        f.src = urlEdit(id);

        const mulai = Date.now();
        let siapSejak = 0;
        let escPasang = false;
        let ajaxPasang = false;
        let ajaxAktif = 0;
        let prosesTimer = 0;
        ov._rkTimer = setInterval(() => {
            if (!document.body.contains(ov)) { clearInterval(ov._rkTimer); return; }
            const lama = Date.now() - mulai;
            try {
                const w = f.contentWindow;
                const doc = f.contentDocument;
                const edit = w.location.pathname === '/produks/' + id + '/edit';
                const tab = edit && doc.getElementById('produk-gambar-tab');
                const pane = edit && doc.getElementById('tab_produk_gambar');
                if (tab && pane) {
                    if (!doc.getElementById('rk_if_css')) {
                        const s = doc.createElement('style');
                        s.id = 'rk_if_css';
                        s.textContent = CSS_EDIT_IFRAME;
                        doc.head.appendChild(s);
                    }
                    const lbl = doc.querySelector('label[for="fileupload"]');
                    if (lbl) {
                        const tw = doc.createTreeWalker(lbl, NodeFilter.SHOW_TEXT);
                        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
                            if (/pilih\s+gambar/i.test(n.nodeValue) && n.nodeValue !== 'Pilih Gambar') n.nodeValue = 'Pilih Gambar';
                        }
                    }
                    const daftar = pane.querySelector('.row.row-gap-3');
                    if (daftar && !doc.getElementById('rk_kosong')) {
                        const kosong = doc.createElement('div');
                        kosong.id = 'rk_kosong';
                        const ik = doc.createElement('i');
                        ik.className = 'fa fa-image';
                        ik.setAttribute('aria-hidden', 'true');
                        const tk = doc.createElement('span');
                        tk.textContent = 'Belum ada gambar';
                        kosong.appendChild(ik);
                        kosong.appendChild(tk);
                        daftar.insertAdjacentElement('afterend', kosong);
                    }
                    if (lbl && !doc.getElementById('rk_aksi')) {
                        const aksi = doc.createElement('div');
                        aksi.id = 'rk_aksi';
                        const batal = doc.createElement('button');
                        batal.type = 'button';
                        batal.id = 'rk_batal';
                        batal.textContent = 'Tutup';
                        batal.title = 'Tutup popup (Esc)';
                        batal.addEventListener('click', tutupEditGambar);
                        const simpanBtn = doc.createElement('button');
                        simpanBtn.type = 'button';
                        simpanBtn.id = 'rk_simpan';
                        simpanBtn.textContent = 'Simpan';
                        simpanBtn.disabled = true;
                        simpanBtn.title = 'Menyiapkan unggahan...';
                        aksi.appendChild(batal);
                        aksi.appendChild(simpanBtn);
                        aksi.appendChild(lbl);
                        doc.body.appendChild(aksi);
                        if (!ov._rkTahan) {
                            ov._rkTahan = [];
                            doc.addEventListener('change', (ev) => {
                                try {
                                    const t = ev.target;
                                    if (!t || t.id !== 'fileupload' || ov._rkSimpanOK || Date.now() - mulai > 15000) return;
                                    if (!t.files || !t.files.length) return;
                                    ev.stopImmediatePropagation();
                                    Array.prototype.push.apply(ov._rkTahan, Array.from(t.files));
                                    try { t.value = ''; } catch (e2) { }
                                    const sb = doc.getElementById('rk_simpan');
                                    if (sb) sb.textContent = 'Menyiapkan ' + ov._rkTahan.length + ' gambar...';
                                } catch (e3) { }
                            }, true);
                        }
                    }
                    if (!ajaxPasang && w.jQuery) {
                        ajaxPasang = true;
                        const naik = () => { ajaxAktif++; clearTimeout(prosesTimer); prosesTimer = setTimeout(() => proses.classList.add('rk_on'), 150); };
                        const turun = () => { ajaxAktif = Math.max(0, ajaxAktif - 1); if (!ajaxAktif) { clearTimeout(prosesTimer); proses.classList.remove('rk_on'); } };
                        w.jQuery(doc).on('ajaxSend.rk', naik).on('ajaxComplete.rk', turun);
                    }
                    if (!escPasang) {
                        escPasang = true;
                        doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupEditGambar(); });
                    }
                    if (!(tab.classList.contains('active') && pane.classList.contains('active'))) {
                        try {
                            const BT = w.bootstrap && w.bootstrap.Tab;
                            if (BT) (BT.getOrCreateInstance ? BT.getOrCreateInstance(tab) : new BT(tab)).show();
                            else { tab.classList.add('active'); pane.classList.add('show', 'active'); }
                        } catch (e) { tab.classList.add('active'); pane.classList.add('show', 'active'); }
                    }
                    const aksiEl = doc.getElementById('rk_aksi');
                    if (aksiEl && !ov._rkSimpanOK) pasangSimpanGambar(ov, w, doc, aksiEl);
                    try {
                        if (ov._rkTahan && ov._rkTahan.length) {
                            const inpEl = doc.getElementById('fileupload');
                            if (ov._rkSimpanOK) {
                                const fl = ov._rkTahan.splice(0);
                                w.jQuery(inpEl).fileupload('add', { files: fl });
                            } else if (lama > 15000) {
                                const fl = ov._rkTahan.splice(0);
                                const dt = new w.DataTransfer();
                                fl.forEach((x) => dt.items.add(x));
                                inpEl.files = dt.files;
                                inpEl.dispatchEvent(new w.Event('change', { bubbles: true }));
                                const sb = doc.getElementById('rk_simpan');
                                if (sb) { sb.textContent = 'Simpan'; sb.title = 'Mode bawaan Erzap: gambar langsung terkirim saat dipilih (tahap Simpan belum siap)'; }
                                ov._rkKirimLangsung = true;
                                tampilNotifEdit(ov, 'Tombol Simpan belum siap, jadi gambar yang dipilih langsung dikirim. Tidak perlu klik Simpan.');
                            }
                        }
                    } catch (err) { console.warn('[Edit gambar] gagal memproses gambar yang ditahan', err); }
                    if (!siapSejak) siapSejak = Date.now();
                    f.style.visibility = 'visible';
                    msg.remove();
                    if (!ov._rkSimpanOK && lama > 15000 && !ov._rkLapor) {
                        ov._rkLapor = true;
                        console.warn('[Edit gambar] Simpan belum bisa dipasang: ' + (ov._rkAlasan || 'belum diketahui') + ' (masih dicoba)');
                        if (!ov._rkKirimLangsung) tampilNotifEdit(ov, 'Tombol Simpan gambar belum bisa dipasang (' + (ov._rkAlasan || 'belum diketahui') + '). Tutup lalu buka lagi popup ini.');
                    }
                    if (ov._rkSimpanOK ? Date.now() - siapSejak > 3000 : lama > 180000) clearInterval(ov._rkTimer);
                    return;
                }
            } catch (e) { }
            if (lama > 20000 && !siapSejak) {
                f.style.visibility = 'visible';
                msg.remove();
                clearInterval(ov._rkTimer);
            }
        }, 200);
    }

    function ambilGambar(id) {
        if (GCACHE[id]) return Promise.resolve(GCACHE[id]);
        if (!GPROMISE[id]) {
            GPROMISE[id] = ambilGambarFetch(id).finally(() => { delete GPROMISE[id]; });
        }
        return GPROMISE[id];
    }

    function urlDariBagian(html) {
        const urls = [];
        (html.match(/<img\b[^>]*>/gi) || []).forEach((tag) => {
            const m = /\b(?:src|data-src)\s*=\s*["']([^"']+)["']/i.exec(tag);
            if (!m || /^data:/i.test(m[1])) return;
            try {
                const u = new URL(m[1].replace(/&amp;/g, '&'), location.origin).href;
                if (urls.indexOf(u) === -1) urls.push(u);
            } catch (e) { }
        });
        return urls;
    }

    async function ambilGambarFetch(id) {
        const ac = new AbortController();
        const res = await fetch('/produks/' + encodeURIComponent(id), {
            credentials: 'same-origin',
            headers: { 'Accept': 'text/html' },
            signal: ac.signal
        });
        catatLog('GET /produks/' + id + ' -> ' + res.status);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const rd = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '', bagian = null;
        while (true) {
            const { done, value } = await rd.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const m = RE_PANE.exec(buf);
            if (m) {
                const e = buf.indexOf('new_photo', m.index);
                if (e >= 0) { bagian = buf.slice(m.index, e); ac.abort(); break; }
            }
        }
        if (bagian === null) {
            const pane = new DOMParser().parseFromString(buf, 'text/html').querySelector('#tab_produk_gambar');
            bagian = pane ? pane.innerHTML : '';
        }
        const urls = urlDariBagian(bagian);
        if (!urls.length) catatLog('produk ' + id + ': tidak ada gambar');
        GCACHE[id] = urls;
        GBOOL[id] = { t: Date.now(), ada: urls.length > 0 };
        simpanFilterCache();
        return urls;
    }

    const HPROMISE = {};
    function ambilHarga(id) {
        if (HCACHE[id] !== undefined) return Promise.resolve(HCACHE[id]);
        if (!HPROMISE[id]) {
            HPROMISE[id] = (async () => {
                const res = await fetch('/produks/' + encodeURIComponent(id), { credentials: 'same-origin', headers: { 'Accept': 'text/html' } });
                catatLog('GET harga /produks/' + id + ' -> ' + res.status);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                try { HCACHE[id] = ekstrakHarga(doc, id); } catch (e) { catatLog('produk ' + id + ' harga error: ' + e.message); HCACHE[id] = null; }
                return HCACHE[id];
            })().finally(() => { delete HPROMISE[id]; });
        }
        return HPROMISE[id];
    }

    function tutupModal() {
        const rp = document.getElementById('gs_rak_pop');
        if (rp) rp.remove();
    }

    function bukaPop(anchor, judul, kelas) {
        tutupModal();
        const pop = document.createElement('div');
        pop.id = 'gs_rak_pop';
        if (kelas) pop.className = kelas;
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

        const area = () => (anchor.closest('.dataTables_wrapper') || anchor.closest('table') || document.body).getBoundingClientRect();
        const taruh = () => {
            if (!document.body.contains(pop)) return;
            const a = area();
            const c = anchor.getBoundingClientRect();
            const sx = window.pageXOffset, sy = window.pageYOffset;
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
        const tombolTutup = () => {
            if (pop.querySelector('.rk_foot')) return;
            const foot = document.createElement('div');
            foot.className = 'rk_foot';
            const tb = document.createElement('button');
            tb.type = 'button';
            tb.className = 'rk_tutup';
            tb.textContent = '✖ Tutup';
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
        return { pop: pop, judul: judul, isi: isi, taruh: taruh, tombolTutup: tombolTutup, info: info };
    }

    function bukaModal(ikon, id, judul) {
        const m = bukaPop(ikon, judul || ('Produk ' + id), 'rk_gambar');
        m.info('Memuat gambar...');

        ambilGambar(id).then((urls) => {
            if (!document.body.contains(m.pop)) return;
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

    function bukaModalRak(td, judul, anchor) {
        const m = bukaPop(anchor || td, judul || 'Rak produk');
        m.pop.dataset.tipe = 'rak';
        m.info('Memuat rak...');

        dataRak(td, true).then((data) => {
            segarkanStatusRak(td, true);
            if (!document.body.contains(m.pop)) return;
            data = data || [];
            if (!data.some((x) => x.r)) return m.info('Produk ini belum punya penempatan rak.');
            m.isi.textContent = '';
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

    document.addEventListener('mousedown', (e) => {
        if (!document.getElementById('gs_rak_pop')) return;
        if (e.target.closest && (e.target.closest('#gs_rak_pop') || e.target.closest('.rk_bc_rak') || e.target.closest('.gs_ikon') || e.target.closest('.rk_bc_ikon') || e.target.closest('.hj_td i'))) return;
        tutupModal();
    }, true);

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (document.getElementById('rk_edit_ov')) tutupEditGambar(); else tutupModal(); } });

    const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');

    function lebarCode128(teks) {
        const s = String(teks);
        if (!s || !/^[\x20-\x7e]+$/.test(s)) return null;
        const runAngka = (i) => { let n = 0; while (i + n < s.length && s[i + n] >= '0' && s[i + n] <= '9') n++; return n; };
        const kode = [];
        let mode;
        const r0 = runAngka(0);
        if (r0 >= 4 || (r0 === s.length && r0 >= 2)) { mode = 'C'; kode.push(105); } else { mode = 'B'; kode.push(104); }
        let i = 0;
        while (i < s.length) {
            if (mode === 'C') {
                if (runAngka(i) >= 2) { kode.push(parseInt(s.substr(i, 2), 10)); i += 2; } else { kode.push(100); mode = 'B'; }
            } else {
                const r = runAngka(i);
                if (r >= 4) {
                    if (r % 2 === 1) { kode.push(s.charCodeAt(i) - 32); i++; }
                    kode.push(99); mode = 'C';
                } else { kode.push(s.charCodeAt(i) - 32); i++; }
            }
        }
        let sum = kode[0];
        for (let k = 1; k < kode.length; k++) sum += kode[k] * k;
        kode.push(sum % 103);
        kode.push(106);
        return kode.map((c) => C128[c]).join('');
    }

    function svgBarcode(teks) {
        const lebar = lebarCode128(teks);
        if (!lebar) return null;
        const NS = 'http://www.w3.org/2000/svg';
        const tinggi = 70, quiet = 10;
        let x = quiet, bar = true, d = '';
        for (const ch of lebar) {
            const w = +ch;
            if (bar) d += 'M' + x + ' 0h' + w + 'v' + tinggi + 'h-' + w + 'z';
            x += w;
            bar = !bar;
        }
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + (x + quiet) + ' ' + tinggi);
        svg.setAttribute('class', 'rk_bcsvg');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Barcode ' + teks);
        const bg = document.createElementNS(NS, 'rect');
        bg.setAttribute('width', '100%');
        bg.setAttribute('height', '100%');
        bg.setAttribute('fill', '#fff');
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', '#000');
        p.setAttribute('shape-rendering', 'crispEdges');
        svg.appendChild(bg);
        svg.appendChild(p);
        return svg;
    }

    function teksBarcodeSel(td) {
        const c = td.cloneNode(true);
        c.querySelectorAll('.rk_bc_baris, .rk_bc_ikon, .gs_ikon').forEach((x) => x.remove());
        return c.textContent.replace(/\s+/g, ' ').trim();
    }

    function bukaModalBarcode(ikon, teks, judul) {
        const m = bukaPop(ikon, judul || teks, 'rk_barcode');
        m.isi.textContent = '';
        const svg = svgBarcode(teks);
        if (!svg) return m.info('Barcode ini berisi karakter yang tidak bisa dibuat gambarnya.', true);
        const kotak = document.createElement('div');
        kotak.className = 'rk_bcbox';
        const t = document.createElement('div');
        t.className = 'rk_bcteks';
        t.textContent = teks;
        kotak.appendChild(svg);
        kotak.appendChild(t);
        m.isi.appendChild(kotak);
        m.tombolTutup();
        m.taruh();
    }

    function judulBaris(tr) {
        const table = tr.closest('table');
        const head = table && table.querySelector('thead tr');
        if (!head) return '';
        const bersih = (td) => {
            if (!td) return '';
            const c = td.cloneNode(true);
            c.querySelectorAll('.rk_bc_baris, .rk_bc_ikon, .gs_ikon').forEach((x) => x.remove());
            return c.textContent.replace(/\s+/g, ' ').trim();
        };
        return [bersih(tr.children[findIndexIn(head, 'barcode')]), bersih(tr.children[findIndexIn(head, 'nama')])].filter(Boolean).join(' - ');
    }

    function pasangBarcode(bcTd, namaTd, prd) {
        if (!bcTd || !prd) return;
        if (namaTd) namaTd.classList.add('rk_nama_td');
        if (namaTd && !namaTd.querySelector('.gs_ikon')) {
            const ikon = document.createElement('span');
            ikon.className = 'gs_ikon gs_logo';
            ikon.title = 'Lihat gambar produk';
            ikon.dataset.prd = prd;
            namaTd.insertBefore(ikon, namaTd.firstChild);
        }
        const lama = bcTd.querySelector('.rk_bc_ikon');
        if (lama && !lama.closest('.rk_bc_baris')) lama.remove();
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
        const baris2 = bcTd.querySelector('.rk_bc_baris');
        if (baris2) {
            let ib = baris2.querySelector('.rk_bc_ikon');
            if (!ib) {
                ib = document.createElement('i');
                ib.className = 'fa fa-qrcode rk_bc_ikon';
                ib.title = 'Lihat barcode';
                ib.setAttribute('aria-hidden', 'true');
            }
            if (baris2.firstChild !== ib) baris2.insertBefore(ib, baris2.firstChild);
        }
    }

    function enhance(table) {
        const headRow = table.querySelector('thead tr');
        if (!headRow) return;
        const namaIdx = findIndexIn(headRow, 'nama');
        const barcodeIdx = findIndexIn(headRow, 'barcode');
        if (namaIdx < 0 || barcodeIdx < 0) return;
        const hjIdx = Array.from(headRow.children).findIndex((th) => /^harga\s*jual/i.test(th.textContent.trim()));

        table.querySelectorAll('tbody tr').forEach((tr) => {
            const tds = tr.children;
            if (tds.length <= Math.max(namaIdx, barcodeIdx)) return;
            const stok = tr.querySelector(STOK_SEL);
            if (!stok || !stok.dataset.prd || !tds[barcodeIdx].textContent.trim()) return;
            pasangBarcode(tds[barcodeIdx], tds[namaIdx], stok.dataset.prd);

            const hd = hjIdx >= 0 ? tds[hjIdx] : null;
            if (!hd) return;
            hd.classList.add('hj_td');
            hd.dataset.hjprd = stok.dataset.prd;
            if (hd.querySelector('i.fa-angle-double-down, .hj_btn')) return;
            const b = document.createElement('i');
            b.className = 'fa fa-angle-double-down hj_btn';
            b.title = 'Harga jual per pelanggan';
            hd.appendChild(b);
        });
        terapkanFilter();
        sesuaikanKolom(table);
    }

    function sesuaikanKolom(table) {
        try {
            const wrap = table.closest('.dataTables_scroll');
            const headTbl = wrap && wrap.querySelector('.dataTables_scrollHead table');
            const row = Array.from(table.querySelectorAll('tbody tr')).find((tr) => tr.children.length > 1);
            if (!headTbl || !row) return;
            const ths = headTbl.querySelectorAll('thead tr:first-child th');
            const tds = row.children;
            let geser = ths.length !== tds.length;
            for (let i = 0; !geser && i < ths.length; i++) {
                if (Math.abs(ths[i].getBoundingClientRect().width - tds[i].getBoundingClientRect().width) > 1.5) geser = true;
            }
            if (!geser) { delete table.dataset.rkAdj; return; }
            const jq = window.jQuery;
            if (jq && jq.fn && jq.fn.dataTable && jq.fn.dataTable.isDataTable(table)) {
                const api = jq(table).DataTable();
                if (api && api.columns && api.columns.adjust) api.columns.adjust();
                return;
            }
            // Script berjalan di dunia terpisah, jadi jQuery halaman tidak terlihat. DataTables sendiri menyesuaikan
            // kolom saat jendela di-resize, maka event resize dikirim. Dibatasi 3 kali berturut-turut (jeda 1 detik) dan
            // 20 kali seumur halaman, supaya tidak berulang kalau kolom tidak bisa disejajarkan.
            const n = +(table.dataset.rkAdj || 0);
            const t = +(table.dataset.rkAdjT || 0);
            const total = +(table.dataset.rkAdjTot || 0);
            if (n >= 3 || total >= 20 || Date.now() - t < 1000) return;
            table.dataset.rkAdj = String(n + 1);
            table.dataset.rkAdjTot = String(total + 1);
            table.dataset.rkAdjT = String(Date.now());
            window.dispatchEvent(new Event('resize'));
        } catch (err) {
            console.warn('[Rak] gagal menyejajarkan kolom header', err);
        }
    }

    const FILTER_KEY = 'aistim_rak_filter';
    const FILTER_GBR_KEY = 'aistim_gbr_filter';
    let filterRak = '';
    let filterGbr = '';

    // Filter aktif: 50 baris cocok per klik, lintas halaman. Semua baris tabel dimuat sekali (panjang "Semua"),
    // blok ke-N = cocok ke-(50*(N-1)+1) sampai 50*N. Baris yang sudah lewat disembunyikan.
    const BLOK_FILTER = 50;
    const PER_PUTARAN = 40;    // maks. baris yang diminta statusnya per putaran (sisanya di putaran berikutnya)
    let blokFilter = 0;        // indeks blok yang sedang tampil (0 = 1-50)
    let lenAsli = null;        // panjang halaman DataTables sebelum filter memaksa "Semua"
    let lenSudahDiset = false; // panjang sudah dipaksa untuk filter yang sedang aktif
    let navRef = null;         // tombol Sebelumnya / Berikutnya
    try { const f = sessionStorage.getItem(FILTER_KEY); if (f === 'ada' || f === 'kosong' || f === 'multi') filterRak = f; } catch (e) { }
    try { const f = sessionStorage.getItem(FILTER_GBR_KEY); if (f === 'ada' || f === 'kosong') filterGbr = f; } catch (e) { }
    function aktifFilter() { return !!(filterRak || filterGbr); }

    const antreFilter = [];
    let jalanFilter = 0;
    const MAKS_FILTER = 6;

    // "RKS-001, RKS-002" -> 2
    function hitungRak(rak) {
        return rak ? String(rak).split(/\s*,\s*/).filter(Boolean).length : 0;
    }

    function rakAdaCepat(td) {
        const prd = td.dataset.prd;
        if (!prd) return Promise.resolve(false);
        const gdn = td.dataset.gdn || '';
        if (!gdn) return dataRak(td).then((d) => (d || []).some((x) => x.r));
        const key = prd + '|' + gdn;
        // Filter "Rak lebih dari 1" butuh jumlah rak (n); entri cache lama tanpa n diambil ulang.
        if (segar(RAKF[key]) && (filterRak !== 'multi' || RAKF[key].n !== undefined)) return Promise.resolve(RAKF[key].ada);
        return rakGudang(prd, gdn, td.dataset.otl || '').then((rak) => {
            RAKF[key] = { t: Date.now(), ada: !!rak, n: hitungRak(rak) };
            simpanFilterCache();
            return !!rak;
        });
    }

    // Status rak sebuah produk berubah (rak baru disimpan atau popup Map rak dibuka): status "ada/kosong" di cache
    // diperbarui DI TEMPAT (nilai lama tetap dipakai sampai nilai baru datang), jadi baris tidak sempat
    // tersembunyi dan popup yang menempel di baris itu tidak berpindah posisi.
    // sudahSegar: data rak produk ini baru saja diambil ulang (dataRak paksa).
    function segarkanStatusRak(td, sudahSegar) {
        const prd = td.dataset.prd;
        if (!prd) return;
        const gdn = td.dataset.gdn || '';
        const terapkan = () => { if (aktifFilter()) terapkanFilter(); };
        if (gdn) {
            rakGudang(prd, gdn, td.dataset.otl || '').then((rak) => {
                RAKF[prd + '|' + gdn] = { t: Date.now(), ada: !!rak, n: hitungRak(rak) };
                simpanFilterCache();
                terapkan();
            }).catch(() => { });
        } else if (sudahSegar) {
            terapkan();
        } else {
            dataRak(td, true).then(terapkan).catch(() => { });
        }
    }
    document.addEventListener('rk:rakberubah', (e) => {
        const prd = e.detail && e.detail.prd;
        if (!prd) return;
        const awal = prd + '|';
        const tampak = Array.from(document.querySelectorAll(STOK_SEL)).filter((td) => td.dataset.prd === prd);
        const kunciRakf = {}, kunciCache = {};
        tampak.forEach((td) => {
            kunciRakf[prd + '|' + (td.dataset.gdn || '')] = 1;
            kunciCache[prd + '|' + (td.dataset.otl || '')] = 1;
            segarkanStatusRak(td, false);
        });
        // Entri produk ini yang tidak sedang tampil di tabel: dibuang saja (diambil ulang saat dibutuhkan)
        Object.keys(RAKF).forEach((k) => { if (k.indexOf(awal) === 0 && !kunciRakf[k]) delete RAKF[k]; });
        Object.keys(cache).forEach((k) => { if (k.indexOf(awal) === 0 && !kunciCache[k]) delete cache[k]; });
        simpanFilterCache();
        saveCache();
    });

    function statusRak(td) {
        const prd = td.dataset.prd;
        if (!prd) return 'kosong';
        const gdn = td.dataset.gdn || '';
        if (gdn) {
            const c = RAKF[prd + '|' + gdn];
            if (segar(c)) return c.ada ? 'ada' : 'kosong';
        } else {
            const c = cache[prd + '|' + (td.dataset.otl || '')];
            if (c && Date.now() - c.t < CACHE_TTL) return (c.v || []).some((x) => x.r) ? 'ada' : 'kosong';
        }
        return td.dataset.rkgagal ? 'gagal' : null;
    }

    // Filter "Rak lebih dari 1": 'ada' bila jumlah rak > 1. Dengan filter gudang = rak di gudang itu;
    // tanpa filter gudang = jumlah semua rak produk di seluruh gudangnya.
    function statusRakMulti(td) {
        const prd = td.dataset.prd;
        if (!prd) return 'kosong';
        const gdn = td.dataset.gdn || '';
        if (gdn) {
            const c = RAKF[prd + '|' + gdn];
            if (segar(c) && c.n !== undefined) return c.n > 1 ? 'ada' : 'kosong';
        } else {
            const c = cache[prd + '|' + (td.dataset.otl || '')];
            if (c && Date.now() - c.t < CACHE_TTL) {
                const n = (c.v || []).reduce((jml, x) => jml + hitungRak(x.r), 0);
                return n > 1 ? 'ada' : 'kosong';
            }
        }
        return td.dataset.rkgagal ? 'gagal' : null;
    }

    function statusGbr(td) {
        const id = td.dataset.prd;
        if (!id) return 'kosong';
        const u = GCACHE[id];
        if (u) return u.length ? 'ada' : 'kosong';
        if (segar(GBOOL[id])) return GBOOL[id].ada ? 'ada' : 'kosong';
        return td.dataset.gbgagal ? 'gagal' : null;
    }

    function statusFilter(td) {
        let gagal = false;
        if (filterRak) {
            const multi = filterRak === 'multi';
            const s = multi ? statusRakMulti(td) : statusRak(td);
            if (s === null) return null;
            if (s === 'gagal') gagal = true; else if (s !== (multi ? 'ada' : filterRak)) return 'tidak';
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
            if (filterRak) kerja.push(rakAdaCepat(td).catch((e) => { td.dataset.rkgagal = '1'; console.error('[Rak] filter gagal produk=', td.dataset.prd, e); }));
            if (filterGbr && td.dataset.prd) kerja.push(ambilGambar(td.dataset.prd).catch((e) => { td.dataset.gbgagal = '1'; console.error('[Gambar] filter gagal produk=', td.dataset.prd, e); }));
            Promise.all(kerja)
                .finally(() => { jalanFilter--; delete td.dataset.rkantri; terapkanFilter(); pompaFilter(); });
        }
    }

    // DataTables API (tersedia karena script berjalan di @world main). Null bila tabel bukan DataTables.
    function dtApi(table) {
        const jq = window.jQuery;
        try {
            if (table && jq && jq.fn && jq.fn.dataTable && jq.fn.dataTable.isDataTable(table)) return jq(table).DataTable();
        } catch (e) { }
        return null;
    }

    // Kotak "tampilkan N data" DataTables
    function cariSelPanjang(table) {
        const wrap = table && table.closest('.dataTables_wrapper');
        return (wrap && wrap.querySelector('.dataTables_length select')) || document.querySelector('.dataTables_length select');
    }
    // Pilihan terbesar: "Semua" (-1) kalau ada, kalau tidak angka terbesar
    function panjangTerbesar(sel) {
        const nilai = Array.from(sel.options).map((o) => o.value);
        if (nilai.indexOf('-1') !== -1) return '-1';
        let best = null, bestN = -Infinity;
        nilai.forEach((v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > bestN) { bestN = n; best = v; } });
        return best;
    }
    function gantiPanjang(table, nilai) {
        const sel = cariSelPanjang(table);
        const tuju = String(nilai);
        if (!sel || sel.value === tuju || !Array.prototype.some.call(sel.options, (o) => o.value === tuju)) return false;
        sel.value = tuju;
        sel.dispatchEvent(new Event('change', { bubbles: true })); // DataTables menggambar ulang halamannya
        return true;
    }
    function paksaPanjang(table) {
        const sel = cariSelPanjang(table);
        if (!sel) return false;
        const tuju = panjangTerbesar(sel);
        if (tuju === null || sel.value === tuju) return false;
        if (lenAsli === null) lenAsli = sel.value;
        return gantiPanjang(table, tuju);
    }
    function pulihkanPanjang(table) {
        if (lenAsli === null) return false;
        const nilai = lenAsli;
        lenAsli = null;
        return gantiPanjang(table, nilai);
    }

    // Kolom "No": nomor baris yang tampil. Tanpa filter: nomor dari teks "Showing 26 to 50" (seperti bawaan).
    // Dengan filter: nomor lanjut dari 'offset' (jumlah cocok sebelum blok ini).
    function nomorUrut(table, rows, offset) {
        const headRow = table.querySelector('thead tr');
        if (!headRow) return;
        const idx = Array.from(headRow.children).findIndex((th) => /^no\.?$/i.test(th.textContent.trim()));
        if (idx < 0) return;
        const sel = (tr) => (tr.children.length > idx ? tr.children[idx] : null);
        rows.forEach((tr) => {
            const c = sel(tr);
            if (c && c.dataset.rkNoAsli === undefined) c.dataset.rkNoAsli = c.textContent.trim();
        });
        let mulai = NaN;
        if (typeof offset === 'number') {
            mulai = offset + 1;
        } else {
            const infoDT = document.querySelector('.dataTables_info');
            const mi = infoDT && /(\d[\d.,]*)/.exec(infoDT.textContent);
            if (mi) mulai = parseInt(mi[1].replace(/[.,]/g, ''), 10);
            if (isNaN(mulai) && rows[0]) { const c0 = sel(rows[0]); mulai = c0 ? parseInt(c0.dataset.rkNoAsli, 10) : NaN; }
        }
        if (isNaN(mulai) || mulai < 1) mulai = 1;
        let n = mulai;
        rows.forEach((tr) => {
            if (tr.style.display === 'none') return;
            const c = sel(tr);
            if (!c || c.children.length) return; // sel berisi elemen lain: jangan ditimpa
            const teks = String(n++);
            if (c.textContent !== teks) c.textContent = teks;
        });
    }

    // adaLanjut: masih ada cocok (atau pemeriksaan belum selesai) setelah blok ini
    function segarkanNav(adaLanjut) {
        if (!navRef) return;
        navRef.wrap.style.display = aktifFilter() ? 'flex' : 'none';
        navRef.prev.disabled = blokFilter <= 0;
        navRef.next.disabled = !adaLanjut;
    }

    function terapkanFilter() {
        const table = document.querySelector(TABLE_SEL);
        if (!table) return;
        const info = document.getElementById('rk_filter_info');
        const tulis = (teks) => { if (info && info.textContent !== teks) info.textContent = teks; };
        const tampilkan = (tr, nilai) => { if (tr.style.display !== nilai) tr.style.display = nilai; };
        const rows = Array.from(table.querySelectorAll('tbody tr')).filter((tr) => tr.querySelector(STOK_SEL));

        if (!aktifFilter()) {
            if (lenSudahDiset) { lenSudahDiset = false; if (pulihkanPanjang(table)) return; } // digambar ulang, lalu dihitung lagi
            blokFilter = 0;
            rows.forEach((tr) => tampilkan(tr, ''));
            tulis('');
            nomorUrut(table, rows, null);
            segarkanNav(false);
            return;
        }
        if (!lenSudahDiset) {
            lenSudahDiset = true;
            if (paksaPanjang(table)) return; // tabel digambar ulang dengan semua baris, lalu dihitung lagi
        }

        // Cocok dikumpulkan berurutan sampai cukup untuk blok ini ditambah satu (untuk tahu ada blok berikutnya).
        // Status baris yang belum ada diminta sebagian per putaran; sisanya diperiksa setelah putaran ini selesai.
        const batas = (blokFilter + 1) * BLOK_FILTER;
        const cocok = [];
        let menunggu = 0, habis = true;
        for (let i = 0; i < rows.length; i++) {
            const td = rows[i].querySelector(STOK_SEL);
            const st = statusFilter(td);
            if (st === null) {
                menunggu++;
                if (!td.dataset.rkantri) { td.dataset.rkantri = '1'; antreFilter.push(td); }
                if (menunggu >= PER_PUTARAN) { habis = false; break; }
                continue;
            }
            if (st === 'cocok' || st === 'gagal') {
                cocok.push(rows[i]);
                if (cocok.length > batas) { habis = false; break; }
            }
        }

        const mulai = blokFilter * BLOK_FILTER;
        const tampil = new Set(cocok.slice(mulai, mulai + BLOK_FILTER));
        rows.forEach((tr) => tampilkan(tr, tampil.has(tr) ? '' : 'none'));
        nomorUrut(table, rows, mulai);

        const adaLanjut = cocok.length > batas || !habis;
        segarkanNav(adaLanjut);
        pompaFilter();
        const sampai = Math.min(mulai + BLOK_FILTER, cocok.length);
        const totalTeks = (habis && menunggu === 0) ? String(cocok.length) : cocok.length + '+';
        tulis(menunggu
            ? 'Memeriksa ' + (rows.length - menunggu) + '/' + rows.length + ' baris...' + (cocok.length ? ' (' + cocok.length + ' cocok sejauh ini)' : '')
            : 'Menampilkan ' + (cocok.length ? mulai + 1 : 0) + '–' + sampai + ' dari ' + totalTeks + ' yang cocok');
    }

    // Tombol Sebelumnya (-1) / Berikutnya (+1): pindah blok 50 cocok. Halaman tabel tidak berpindah.
    function navFilter(arah) {
        if (arah > 0) blokFilter++;
        else if (blokFilter > 0) blokFilter--;
        else return;
        terapkanFilter();
    }

    function pasangFilter() {
        const cari = document.getElementById('pencarian_nama');
        const field = cari && cari.closest('.field2');
        if (!field) return;
        const ada = document.getElementById('rk_filter_box');
        if (ada) {
            if (field.nextElementSibling !== ada) field.insertAdjacentElement('afterend', ada);
            return;
        }
        const box = document.createElement('div');
        box.className = 'field2';
        box.id = 'rk_filter_box';
        const lb = document.createElement('label');
        lb.htmlFor = 'rk_filter_status';
        lb.textContent = 'Status Rak / Gambar';
        const sel = document.createElement('select');
        sel.id = 'rk_filter_status';
        [['', '-- Semua --'], ['rak_ada', 'Sudah ada rak'], ['rak_kosong', 'Belum ada rak'], ['rak_multi', 'Rak lebih dari 1'], ['gbr_ada', 'Sudah bergambar'], ['gbr_kosong', 'Belum ada gambar']].forEach((o) => {
            const op = document.createElement('option');
            op.value = o[0];
            op.textContent = o[1];
            sel.appendChild(op);
        });
        sel.value = filterRak ? 'rak_' + filterRak : (filterGbr ? 'gbr_' + filterGbr : '');
        sel.addEventListener('change', () => {
            const v = sel.value;
            blokFilter = 0;
            filterRak = v.indexOf('rak_') === 0 ? v.slice(4) : '';
            filterGbr = v.indexOf('gbr_') === 0 ? v.slice(4) : '';
            try {
                sessionStorage.setItem(FILTER_KEY, filterRak);
                sessionStorage.setItem(FILTER_GBR_KEY, filterGbr);
            } catch (e) { }
            terapkanFilter();
        });
        const nav = document.createElement('div');
        nav.id = 'rk_filter_nav';
        nav.style.cssText = 'display:none;gap:6px;margin-top:4px';
        const tombolNav = (teks, arah) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = teks;
            b.style.cssText = 'font-size:11px;padding:2px 8px;border:1px solid #bbb;border-radius:4px;background:#fff;cursor:pointer';
            b.addEventListener('click', () => navFilter(arah));
            return b;
        };
        const bPrev = tombolNav('‹ ' + BLOK_FILTER + ' sebelumnya', -1);
        const bNext = tombolNav(BLOK_FILTER + ' berikutnya ›', 1);
        nav.appendChild(bPrev);
        nav.appendChild(bNext);
        navRef = { wrap: nav, prev: bPrev, next: bNext };
        const info = document.createElement('div');
        info.id = 'rk_filter_info';
        info.style.cssText = 'font-size:11px;color:#777;margin-top:3px';
        box.appendChild(lb);
        box.appendChild(document.createElement('br'));
        box.appendChild(sel);
        box.appendChild(nav);
        box.appendChild(info);
        field.insertAdjacentElement('afterend', box);
        terapkanFilter();
    }

    function bukaModalHarga(panah, id, judul) {
        const m = bukaPop(panah, judul || ('Produk ' + id));
        m.info('Memuat harga...');

        ambilHarga(id).then((data) => {
            if (!document.body.contains(m.pop)) return;
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
            bukaModalHarga(panah, td.dataset.hjprd, judulBaris(td.parentElement));
        } catch (err) {
            console.error('[Harga] gagal membuka popup', err);
        }
    }, true);

    document.addEventListener('click', (e) => {
        const ikon = e.target.closest && e.target.closest('.gs_ikon');
        if (!ikon) return;
        e.preventDefault();
        e.stopPropagation();
        const tr = ikon.closest('tr');
        bukaModal(ikon, ikon.dataset.prd, tr ? judulBaris(tr) : '');
    }, true);

    document.addEventListener('click', (e) => {
        const lihat = e.target.closest && e.target.closest('.rk_bc_rak');
        if (!lihat) return;
        e.preventDefault();
        e.stopPropagation();
        const tr = lihat.closest('tr');
        const stok = tr && tr.querySelector(STOK_SEL);
        if (!stok) return;
        try {
            catatLog('klik Map rak produk=' + (stok.dataset.prd || '?'));
            bukaModalRak(stok, judulBaris(tr), lihat);
        } catch (err) {
            console.error('[Rak] gagal membuka popup', err);
        }
    }, true);

    document.addEventListener('click', (e) => {
        const ikon = e.target.closest && e.target.closest('.rk_bc_ikon');
        if (!ikon) return;
        const td = ikon.closest('td');
        const tr = td && td.closest('tr');
        if (!td || !tr) return;
        const teks = teksBarcodeSel(td);
        if (!teks) return;
        e.preventDefault();
        e.stopPropagation();
        try {
            bukaModalBarcode(ikon, teks, judulBaris(tr));
        } catch (err) {
            console.error('[Barcode] gagal membuka popup', err);
        }
    }, true);

    let timer = null;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            pasangFilter();
            const table = document.querySelector(TABLE_SEL);
            if (table) enhance(table);
        }, 150);
    }

    function cepat() {
        const table = document.querySelector(TABLE_SEL);
        if (!table) return;
        const baru = Array.from(table.querySelectorAll('tbody tr')).some((tr) => tr.querySelector(STOK_SEL) && !tr.querySelector('.rk_bc_ikon'));
        if (baru) enhance(table);
    }
    // cepat() memeriksa semua baris tabel, jadi digabung per frame (DataTables bisa mengubah DOM ratusan kali sekaligus)
    let cepatAntre = false;
    new MutationObserver(() => {
        if (!cepatAntre) {
            cepatAntre = true;
            requestAnimationFrame(() => { cepatAntre = false; cepat(); });
        }
        schedule();
    }).observe(document.body, { childList: true, subtree: true });
    cepat();
    schedule();
})();


// =====================================================================================================
// Bagian 2: Penentuan Rak dari popup Map rak.
// Perbaikan v1.23.1: outlet multi/single (ambilOutlet), syarat outlet >= 1, dan menunggu pengaturan gudang
// sampai #selected_idgudang sama dengan gudang (bukan jeda tetap).
// =====================================================================================================
(function () {
  if (window.__rkCleanup) { try { window.__rkCleanup(); } catch (e) {} }

  var PAGE_URL = '/produk_gudangs/penentuan_rak_single/new';
  var ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M2 9h20l-2 11H4L2 9z"/><path d="M7 9l4-6"/><path d="M17 9l-4-6"/><line x1="9" y1="13" x2="9" y2="17"/><line x1="12" y1="13" x2="12" y2="17"/><line x1="15" y1="13" x2="15" y2="17"/></svg>';
  var IFRAME_CSS = [
    '#header,#footer{display:none!important}',
    'html,body{background:#fff!important}',
    '#wrapper{padding:0!important}',
    '#content_wrapper,#content,.container_fluid,.col-md-8{margin:0!important;padding-left:0!important;padding-right:0!important;max-width:none!important;width:100%!important;flex:0 0 100%!important}',
    '#content_produk{padding:18px 20px 18px!important;margin:0!important}',
    '#content_produk h6{margin:0 0 2px!important;font-size:12px;letter-spacing:.06em;color:#7b8794;font-weight:600}',
    '#content_produk p.mb-2{font-size:18px;font-weight:700;color:#1f2d3d;line-height:1.3;margin:0 0 12px!important}',
    '#content_produk strong:not(.callout strong){display:none}',
    '#content_produk .callout{margin:0!important;padding:10px 14px!important;background:#f2f8fd!important;border:1px solid #d6e8f6!important;border-left:4px solid #3498db!important;border-radius:8px!important;font-size:14px;line-height:1.6;color:#33475b}',
    '#content_produk .callout strong{display:inline;color:#0b5c8a}',
    '#content_produk h4{margin:18px 0 8px!important;font-size:12px!important;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#7b8794}',
    '#rk_inp{height:24.5px!important;min-height:24.5px!important;box-sizing:border-box!important;font-size:12px!important;line-height:18px!important;padding:2px 8px 2px 30px!important;border:1px solid #ccc!important;border-radius:3px!important;width:100%!important;max-width:100%!important;outline:0;transition:border-color .15s,box-shadow .15s}',
    '#rk_inp:focus{border-color:#3498db!important;box-shadow:0 0 0 3px rgba(52,152,219,.2)}',
    '#rk_chips > span{display:inline-flex!important;align-items:center!important;gap:4px!important;height:22px!important;padding:0 3px 0 8px!important;margin:0 6px 6px 0!important;background:#e3f2fd!important;border:1px solid #b6dcf5!important;border-radius:4px!important;color:#0b5c8a!important;font-size:11px!important;line-height:16px!important;font-weight:500!important;box-sizing:border-box!important;white-space:nowrap!important;vertical-align:middle!important}',
    '#rk_chips > span > span{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:14px!important;height:14px!important;flex:0 0 14px!important;margin-left:0!important;border-radius:3px!important;font-size:11px!important;line-height:1!important;font-weight:600!important;color:#0b5c8a!important;cursor:pointer}',
    '#rk_chips > span > span:hover{background:#b6dcf5!important}',
    '#rk_list{border:1px solid #cfd8e3!important;border-radius:8px!important;margin-top:4px;box-shadow:0 8px 20px rgba(0,0,0,.15)!important}',
    '#rk_list div:hover{background:#eef6fd}',
    '#rk_aksi_rak{margin-top:18px!important;padding-top:16px;border-top:1px solid #e9eef3}',
    '#rk_aksi_rak{flex-wrap:wrap!important;justify-content:flex-start!important}',
    '#btn_update_rak.btn.w-100{width:120px!important;min-width:0!important;flex:0 0 auto!important}',
    '#btn_update_rak{background:#fff!important;border:1px solid #337ab7!important;color:#337ab7!important;font-size:12px!important;line-height:18px!important;font-weight:400!important;padding:2px 8px!important;height:24.5px!important;border-radius:3px!important;box-shadow:none!important}',
    '#rk_batal_rak{background:#fff!important;border:1px solid #ccc!important;color:#444!important;font-size:12px!important;line-height:18px!important;font-weight:400!important;padding:3px 10px!important;height:24.5px!important;border-radius:4px!important;box-shadow:none!important;flex:0 0 auto!important;cursor:pointer}',
    '#rk_batal_rak::before{content:"✖ "}',
    '@media (max-width: 480px){#btn_update_rak.btn.w-100,#rk_batal_rak{flex:1 1 0!important;width:auto!important}}',
    '#rk_batal_rak:hover{background:#f3f6f9!important}',
    // Hanya nama produk: yang panjang turun ke baris berikutnya (juga kata tanpa spasi). Sengaja tidak menyentuh
    // overflow halaman, combobox, atau daftar rak, supaya dropdown rak tidak terpotong.
    '#content_produk p.mb-2{white-space:normal!important;overflow-wrap:anywhere;word-break:break-word;max-width:100%}'
  ].join('');

  var mode = 'other';
  var lastLihat = null;
  var timers = [];

  function toast(msg, jenis) {
    if (!msg) return;
    var t = document.createElement('div');
    t.className = 'rk_toast';
    t.textContent = String(msg);
    var warna = jenis === 'ok' ? '#2e7d32' : (jenis === 'err' ? '#c62828' : '#37474f');
    t.style.cssText = 'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:2147483600;background:' + warna +
      ';color:#fff;padding:10px 18px;border-radius:8px;font:600 14px Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3);max-width:90vw';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, jenis === 'err' ? 5000 : 2500);
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var waitFor = async function (fn, t) {
    t = t || 10000; var s = Date.now();
    while (Date.now() - s < t) { try { var v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    return null;
  };
  var fire = function (w, el) {
    if (w.jQuery) w.jQuery(el).trigger('change');
    el.dispatchEvent(new w.Event('change', { bubbles: true }));
  };

  // outlet: layout multi (.searching_multi_outlet) dulu, lalu layout single (#pencarian_idoutlet_own)
  function ambilOutlet() {
    var multi = document.querySelector('.searching_multi_outlet [data-idoutlet]');
    if (multi && multi.dataset.idoutlet) return multi.dataset.idoutlet;
    var own = document.getElementById('pencarian_idoutlet_own');
    if (own && own.value) return own.value;
    var sel = document.getElementById('pencarian_idoutlet');
    return (sel && sel.value) || '';
  }

  function syncPopupButton() {
    var foot = document.querySelector('#gs_rak_pop .rk_foot');
    if (!foot) return;
    var ex = foot.querySelector('.rk_btn_rak');
    if (foot.parentNode.dataset.tipe !== 'rak' || !rkBoleh('penentuanRak')) { if (ex) ex.remove(); return; }
    if (ex) return;
    foot.style.display = 'flex'; foot.style.gap = '6px'; foot.style.flexWrap = 'nowrap';
    foot.querySelectorAll('button').forEach(function (x) { x.style.whiteSpace = 'nowrap'; });
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'rk_btn_rak'; b.title = 'Penentuan Rak';
    b.innerHTML = ICON + ' Penentuan Rak';
    b.style.cssText = 'padding:2px 8px;border:1px solid #337ab7;border-radius:3px;background:#fff;color:#337ab7;cursor:pointer;white-space:nowrap';
    foot.insertBefore(b, foot.firstChild);
  }
  var popupObs = new MutationObserver(syncPopupButton);
  popupObs.observe(document.documentElement, { childList: true, subtree: true });

  function closeOverlay() {
    var o = document.getElementById('rk_overlay'); if (o) o.remove();
    document.removeEventListener('keydown', onEsc, true);
  }
  function onEsc(e) { if (e.key === 'Escape') closeOverlay(); }

  // Semua tabel yang memuat daftar rak disembunyikan (digantikan combobox), bukan hanya tabel pertama.
  function sembunyikanSemua(d) {
    Array.prototype.forEach.call(d.querySelectorAll('.check_box_rak_barangs'), function (c) {
      var t = c.closest('table');
      if (t && t.style.display !== 'none') t.style.display = 'none';
    });
  }

  // Kalau daftar rak berupa DataTables yang berhalaman (mis. 10 baris per halaman), baris di luar halaman aktif
  // tidak ada di halaman sehingga combobox hanya memuat sebagian rak. Panjang halaman diubah ke "Semua".
  function semuaBaris(d, jumlah) {
    var sel = d.querySelector('.dataTables_length select, select[name$="_length"]');
    var info = '[Penentuan Rak] rak terbaca: ' + jumlah + (sel ? ' (DataTables, panjang halaman ' + sel.value + ')' : ' (tanpa DataTables)');
    if (sel && !sel.dataset.rkSemua) {
      sel.dataset.rkSemua = '1';
      var opts = Array.prototype.slice.call(sel.options);
      var pil = opts.filter(function (o) { return o.value === '-1' || /all|semua/i.test(o.textContent); })[0];
      if (!pil) pil = opts.slice().sort(function (a, b) { return (+b.value || 0) - (+a.value || 0); })[0];
      if (pil && sel.value !== pil.value) {
        sel.value = pil.value;
        sel.dispatchEvent(new (d.defaultView.Event)('change', { bubbles: true }));
        info += ' -> panjang halaman diubah ke ' + pil.value;
      }
    }
    console.log(info);
  }

  function buildCombo(d) {
    var first = d.querySelector('.check_box_rak_barangs'); if (!first) return;
    var table = first.closest('table'); if (!table) return;
    sembunyikanSemua(d);
    if (table.dataset.rkc === '2' && d.getElementById('rk_combo')) return;
    d.querySelectorAll('#rk_combo').forEach(function (x) { x.remove(); });
    table.dataset.rkc = '2'; table.style.display = 'none';
    // Daftar rak dibaca ulang setiap kali ditampilkan (baris bisa bertambah setelah combobox dibuat, mis. saat
    // DataTables menggambar ulang atau data dimuat belakangan), dan mencakup semua tabel rak di halaman.
    var ambilCb = function () { return Array.prototype.slice.call(d.querySelectorAll('.check_box_rak_barangs')); };
    var cbs = ambilCb();
    semuaBaris(d, cbs.length);
    var label = function (cb) {
      var tr = cb.closest('tr'), td = tr.querySelector('td');
      return (td ? td.textContent : tr.textContent).replace(/\s+/g, ' ').trim();
    };
    var box = d.createElement('div'); box.id = 'rk_combo'; box.style.cssText = 'margin:4px 0 14px;position:relative';
    box.innerHTML =
      '<div id="rk_chips" style="margin-bottom:8px"></div>' +
      '<input id="rk_inp" type="text" autocomplete="off" placeholder="Ketik nama rak..." style="width:100%;padding:8px 10px;font-size:16px;border:1px solid #ced4da;border-radius:4px;background:#fff;box-sizing:border-box">' +
      '<div id="rk_list" style="display:none;position:absolute;left:0;right:0;z-index:50;background:#fff;border:1px solid #ced4da;border-top:0;border-radius:0 0 4px 4px;box-shadow:0 4px 10px rgba(0,0,0,.15);max-height:240px;overflow:auto"></div>';
    table.parentNode.insertBefore(box, table);
    var chips = box.querySelector('#rk_chips'), inp = box.querySelector('#rk_inp'), list = box.querySelector('#rk_list');
    var hi = 0, shown = [];

    function renderChips() {
      cbs = ambilCb();
      chips.innerHTML = '';
      cbs.filter(function (c) { return c.checked; }).forEach(function (c) {
        var s = d.createElement('span');
        s.style.cssText = 'display:inline-block;background:#d1ecf1;color:#0c5460;border-radius:14px;padding:3px 10px;margin:0 6px 6px 0;font-size:14px';
        s.textContent = label(c) + ' ';
        var x = d.createElement('span'); x.textContent = '×';
        x.style.cssText = 'cursor:pointer;font-weight:700;margin-left:4px';
        x.onclick = function () { c.click(); renderChips(); renderList(); };
        s.appendChild(x); chips.appendChild(s);
      });
    }
    function renderList() {
      cbs = ambilCb();
      var q = inp.value.trim().toLowerCase();
      shown = cbs.filter(function (c) { return !c.checked && label(c).toLowerCase().indexOf(q) > -1; });
      if (hi >= shown.length) hi = Math.max(0, shown.length - 1);
      list.innerHTML = '';
      if (!shown.length) {
        var e = d.createElement('div'); e.textContent = 'Rak tidak ditemukan';
        e.style.cssText = 'padding:8px 10px;color:#888'; list.appendChild(e); return;
      }
      shown.forEach(function (c, i) {
        var it = d.createElement('div'); it.textContent = label(c);
        it.style.cssText = 'padding:8px 10px;cursor:pointer;font-size:15px;' + (i === hi ? 'background:#e7f1ff' : '');
        it.onmouseenter = function () { hi = i; Array.prototype.forEach.call(list.children, function (ch, j) { if (j < shown.length) ch.style.background = j === i ? '#e7f1ff' : ''; }); };
        it.onmousedown = function (ev) { ev.preventDefault(); pick(c); };
        list.appendChild(it);
      });
      var ft = d.createElement('div');
      ft.textContent = 'Menampilkan ' + shown.length + ' dari ' + cbs.length + ' rak' + (q ? ' (disaring)' : '');
      ft.style.cssText = 'padding:6px 10px;font-size:11px;color:#888;border-top:1px solid #eee;background:#fafafa;position:sticky;bottom:0';
      list.appendChild(ft);
    }
    function pick(c) { if (!c.checked) c.click(); inp.value = ''; hi = 0; renderChips(); renderList(); inp.focus(); }
    function open() { list.style.display = 'block'; renderList(); }
    function scrollHi() { var el = list.children[hi]; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }

    inp.addEventListener('focus', open);
    inp.addEventListener('click', open);
    inp.addEventListener('input', function () { hi = 0; open(); });
    inp.addEventListener('blur', function () { list.style.display = 'none'; });
    inp.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); open(); hi = Math.min(hi + 1, shown.length - 1); renderList(); scrollHi(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); hi = Math.max(hi - 1, 0); renderList(); scrollHi(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); if (shown[hi]) pick(shown[hi]); }
      else if (ev.key === 'Escape') { list.style.display = 'none'; }
    });
    renderChips();
  }

  function tick(ov, fr, state) {
    var d, w;
    try { d = fr.contentDocument; w = fr.contentWindow; } catch (e) { return; }
    if (!d || !d.body || !d.head) return;

    if (!d.getElementById('rk_css')) {
      var st = d.createElement('style'); st.id = 'rk_css'; st.textContent = IFRAME_CSS; d.head.appendChild(st);
    }
    if (!d.__rkFocusFix) {
      d.__rkFocusFix = 1;
      ['blur', 'focusout'].forEach(function (t) {
        d.addEventListener(t, function (e) {
          if (e.target && e.target.id === 'barcode_barang') {
            var n = e.relatedTarget, a = d.activeElement;
            if ((n && n.closest && n.closest('#rk_combo')) || (a && a.closest && a.closest('#rk_combo'))) e.stopImmediatePropagation();
          }
        }, true);
      });
    }

    if (!d.__rkSaveHook && w.jQuery) {
      d.__rkSaveHook = 1;
      console.log('[Penentuan Rak] hook simpan terpasang');
      w.alert = function (m) { state.msg = m; if (!state.saving) toast(m, 'info'); };
      // Klik "Simpan" menandai jendela 20 detik: permintaan ajax non-GET sesudahnya dianggap penyimpanan rak,
      // walau alamatnya berbeda dari yang diperkirakan.
      d.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('#btn_update_rak')) state.klik = Date.now();
      }, true);
      var simpanReq = function (o) {
        if (!o) return false;
        if (String(o.url || '').indexOf('update_rak_barang') > -1) return true;
        return !!state.klik && Date.now() - state.klik < 20000 && /^(post|put|patch|delete)$/i.test(o.type || o.method || '');
      };
      w.jQuery(d).ajaxSend(function (ev, xhr, o) { if (simpanReq(o)) { state.saving = true; state.msg = ''; } });
      w.jQuery(d).ajaxComplete(function (ev, xhr, o) {
        if (!simpanReq(o)) return;
        state.saving = false;
        state.klik = 0;
        var r = xhr && xhr.responseJSON;
        if (!r) { try { r = JSON.parse(xhr.responseText); } catch (e) { r = null; } }
        console.log('[Penentuan Rak] simpan selesai:', o && o.url, 'HTTP', xhr && xhr.status, r);
        var http = xhr && xhr.status;
        var httpOk = http >= 200 && http < 300;
        // Berhasil: status "1"/true/success, atau respons tanpa penanda status tetapi HTTP 2xx
        var ok = r
          ? (String(r.status) === '1' || r.status === true || r.success === true ||
             (r.status === undefined && r.success === undefined && httpOk))
          : httpOk;
        var msg = state.msg || (r && r.message) || '';
        if (ok) {
          try { document.dispatchEvent(new CustomEvent('rk:rakberubah', { detail: { prd: lastLihat && lastLihat.dataset ? lastLihat.dataset.prd : '' } })); } catch (e) { }
          closeOverlay();
          toast(msg || 'Rak tersimpan', 'ok');
          if (lastLihat && document.body.contains(lastLihat)) setTimeout(function () { lastLihat.click(); }, 50);
        } else {
          toast(msg || 'Gagal menyimpan rak', 'err');
        }
      });
    }

    buildCombo(d);
    var ready = !!d.getElementById('rk_combo');

    var form = d.getElementById('barcode_form');
    var al = d.querySelector('.alert.alert-success');
    if (form) form.style.display = ready ? 'none' : '';
    if (al && /Penentuan Rak untuk Gudang/.test(al.textContent)) al.style.display = ready ? 'none' : '';

    d.querySelectorAll('#content_produk img').forEach(function (im) {
      var b = im.closest('.mb-3') || im;
      if (b.textContent.trim() === '') b.style.display = 'none'; else im.style.display = 'none';
    });

    var btn = d.getElementById('btn_update_rak');
    if (ready && btn && !d.getElementById('rk_batal_rak')) {
      var row = d.createElement('div'); row.id = 'rk_aksi_rak'; row.style.cssText = 'display:flex;gap:8px;align-items:stretch';
      var bt = d.createElement('button'); bt.type = 'button'; bt.id = 'rk_batal_rak'; bt.textContent = 'Tutup'; bt.title = 'Tutup tanpa menyimpan (Esc)';
      bt.style.cssText = 'flex:0 0 auto';
      bt.onclick = closeOverlay;
      btn.parentNode.insertBefore(row, btn);
      row.appendChild(btn); row.appendChild(bt);
      btn.style.flex = '1 1 auto'; btn.style.width = 'auto';
    }

    // Label "Manajemen Rak" dari Erzap diganti "Nama Rak" (istilah yang dipakai di Penentuan Rak).
    // NodeFilter.SHOW_TEXT = 4 (dipakai langsung karena NodeFilter milik jendela utama).
    if (d.body) {
      var walkerRak = d.createTreeWalker(d.body, 4);
      var nodeRak;
      while ((nodeRak = walkerRak.nextNode())) {
        if (nodeRak.nodeValue && nodeRak.nodeValue.indexOf('Manajemen Rak') !== -1) {
          nodeRak.nodeValue = nodeRak.nodeValue.replace(/Manajemen Rak/g, 'Nama Rak');
        }
      }
    }

    // Ikon disket di tombol Update (sama dengan desain fixrak).
    if (btn && !btn.querySelector('.rk_ikon_simpan')) {
      var NSS = 'http://www.w3.org/2000/svg';
      var ikon = d.createElementNS(NSS, 'svg');
      ikon.setAttribute('class', 'rk_ikon_simpan');
      ikon.setAttribute('width', '14');
      ikon.setAttribute('height', '14');
      ikon.setAttribute('viewBox', '0 0 24 24');
      ikon.setAttribute('fill', 'none');
      ikon.setAttribute('stroke', 'currentColor');
      ikon.setAttribute('stroke-width', '2');
      ikon.setAttribute('stroke-linecap', 'round');
      ikon.setAttribute('stroke-linejoin', 'round');
      ikon.style.verticalAlign = '-2px';
      ikon.style.marginRight = '6px';
      [['path', 'd', 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z'],
       ['polyline', 'points', '17 21 17 13 7 13 7 21'],
       ['polyline', 'points', '7 3 7 8 15 8']].forEach(function (s) {
        var el = d.createElementNS(NSS, s[0]);
        el.setAttribute(s[1], s[2]);
        ikon.appendChild(el);
      });
      btn.insertBefore(ikon, btn.firstChild);
    }

    if (ready && btn && btn.offsetParent !== null) {
      var bottom = btn.getBoundingClientRect().bottom;
      var lst = d.getElementById('rk_list');
      if (lst && lst.style.display === 'block') bottom = Math.max(bottom, lst.getBoundingClientRect().bottom);
      var h = Math.ceil(bottom + w.scrollY + 14);
      var target = Math.min(48 + h, Math.round(window.innerHeight * 0.92));
      var box = ov.firstElementChild;
      if (Math.abs(parseInt(box.style.height || 0, 10) - target) > 2) box.style.height = target + 'px';
    }

    if (!state.revealed && (ready || Date.now() - state.t0 > 30000)) {
      state.revealed = true;
      setTimeout(function () {
        fr.style.visibility = 'visible';
        var ld = ov.querySelector('#rk_loader'); if (ld) ld.remove();
      }, 150);
    }
  }

  function openPenentuan(btn) {
    var pop = btn.closest('#gs_rak_pop'); if (!pop) return;
    if (!rkBoleh('penentuanRak')) return;
    var bc = ((pop.querySelector('.rk_judul') || {}).textContent || '').split(' - ')[0].trim();
    var outlet = ambilOutlet();
    var gSel = document.getElementById('pencarian_idgudang');
    var gudang = gSel && gSel.value;
    if (!bc) { toast('Barcode tidak terbaca', 'err'); return; }
    if (!outlet || !gudang) { toast('Outlet/Gudang di filter belum dipilih', 'err'); return; }

    closeOverlay();
    if (!document.getElementById('rk_spin_css')) {
      var sp = document.createElement('style'); sp.id = 'rk_spin_css';
      sp.textContent = '@keyframes rkspin{to{transform:rotate(360deg)}}'; document.head.appendChild(sp);
    }
    var ov = document.createElement('div'); ov.id = 'rk_overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center';
    ov.innerHTML =
      '<div style="position:relative;background:#fff;width:min(560px,96vw);height:340px;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.4);overflow:hidden;border-radius:12px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:48px;box-sizing:border-box;flex:none;background:linear-gradient(135deg,#2f86c9,#3aa0e0);color:#fff;font-weight:600;font-size:15px"><span>Penentuan Rak</span>' +
        '<button type="button" id="rk_ov_x" style="background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer">×</button></div>' +
        '<iframe id="rk_iframe" style="flex:1;border:0;width:100%;visibility:hidden"></iframe>' +
        '<div id="rk_loader" style="position:absolute;left:0;right:0;bottom:0;top:48px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#555;font-size:15px">' +
          '<div style="width:34px;height:34px;border:4px solid #d9e8f5;border-top-color:#3498db;border-radius:50%;animation:rkspin .8s linear infinite"></div><div>Memuat data rak...</div></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('mousedown', function (ev) { if (ev.target === ov) closeOverlay(); });
    ov.querySelector('#rk_ov_x').onclick = closeOverlay;
    document.addEventListener('keydown', onEsc, true);

    var fr = ov.querySelector('#rk_iframe');
    fr.src = PAGE_URL;

    var state = { t0: Date.now(), revealed: false };
    var iv = setInterval(function () {
      if (!document.body.contains(ov)) { clearInterval(iv); return; }
      tick(ov, fr, state);
    }, 120);
    timers.push(iv);

    var gagalOtomatis = function (alasan) {
      console.warn('[Penentuan Rak] otomatisasi berhenti: ' + alasan);
      if (document.body.contains(ov)) toast('Outlet/gudang belum terisi otomatis (' + alasan + '). Pilih manual di popup.', 'err');
    };
    (async function () {
      var D = function () { return fr.contentWindow.document; };
      await sleep(500);
      var o = await waitFor(function () { var s = D().getElementById('setting_idoutlet'); return s && s.options.length >= 1 && s; }, 15000);
      if (!o) { gagalOtomatis('pilihan outlet tidak muncul'); return; }
      var W = fr.contentWindow, start = Date.now(), done = false;
      while (!done && Date.now() - start < 30000) {
        if (o.value !== outlet) { o.value = outlet; fire(W, o); await sleep(800); }
        var g = D().getElementById('setting_idgudang');
        if (g && Array.prototype.some.call(g.options, function (x) { return x.value === gudang; })) {
          if (g.value !== gudang) { g.value = gudang; fire(W, g); await sleep(300); }
          if (g.value === gudang) {
            D().getElementById('update_settings').click();
            for (var k = 0; k < 25 && D().getElementById('selected_idgudang').value !== gudang; k++) await sleep(300);
            if (D().getElementById('selected_idgudang').value === gudang) done = true;
          }
        } else await sleep(300);
      }
      if (!done) { gagalOtomatis('gudang tidak bisa dipasang'); return; }
      await sleep(500);
      var inp = D().getElementById('barcode_barang'); inp.focus(); inp.value = bc;
      if (W.jQuery && W.jQuery.ui) { try { W.jQuery(inp).autocomplete('search', bc); } catch (err) {} }
      inp.dispatchEvent(new W.Event('input', { bubbles: true }));
      ['keydown', 'keyup'].forEach(function (t) { inp.dispatchEvent(new W.KeyboardEvent(t, { key: 'a', bubbles: true })); });
      var li = await waitFor(function () {
        return Array.prototype.slice.call(D().querySelectorAll('ul.ui-autocomplete li')).filter(function (x) { return x.offsetParent !== null; })[0];
      }, 8000);
      if (li) { var t = li.querySelector('.ui-menu-item-wrapper') || li; t.dispatchEvent(new W.MouseEvent('mouseover', { bubbles: true })); t.click(); }
    })().catch(function (err) {
      console.warn('[Penentuan Rak] galat otomatisasi:', err);
      gagalOtomatis('halaman Penentuan Rak berubah');
    });
  }

  function onClick(e) {
    var t = e.target; if (!t || !t.closest) return;
    var btn = t.closest('.rk_btn_rak');
    if (btn) { e.preventDefault(); e.stopPropagation(); openPenentuan(btn); return; }
    if (t.closest('.rk_bc_rak')) { mode = 'rak'; lastLihat = t.closest('.rk_bc_rak'); }
    else if (!t.closest('#gs_rak_pop') && !t.closest('#rk_overlay')) mode = 'other';
  }
  document.addEventListener('click', onClick, true);

  window.__rkCleanup = function () {
    document.removeEventListener('click', onClick, true);
    popupObs.disconnect();
    timers.forEach(clearInterval);
    closeOverlay();
    document.querySelectorAll('.rk_btn_rak').forEach(function (b) { b.remove(); });
  };
  syncPopupButton();
  console.log('[ERZAP] Tombol Penentuan Rak aktif. Buka popup "Map rak" lalu klik "Penentuan Rak".');
})();