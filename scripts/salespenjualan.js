// ==UserScript==
// @name         Erzap - Sales Penjualan
// @namespace    http://tampermonkey.net/
// @version      1.5.3
// @description  Halaman Data Penjualan (detail): tombol 'Batal' di samping 'Duplikasi Penjualan'. Form Pencatatan Penjualan: Pelanggan berisi 'shopee', 'tiktok', atau 'tokopedia' otomatis mengatur Tipe Penjualan ke Marketplace. Fitur hanya untuk role yang diatur di AKSES_JSON (SENTOT, SURYO, MANAJEMEN PUSAT, TIMORITEL).
// @match        https://*.erzap.com/penjualans*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @world        main
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ====== HAK AKSES & FITUR (JSON) ======
    // "public"  -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini. Kosong = tidak ada fitur untuk umum.
    // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua). Nama fitur: batal, tipeMarketplace.
    // "role"    -> nama-nama role: "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
    //              cukup sebagian nama; isi nama lengkap persis seperti di ERZAP), "fitur" = fitur private yang boleh dipakai role itu.
    // Fitur yang tidak disebut di "public" maupun "private" ditolak.
    // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
    // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
    const AKSES_JSON = `{
        "public": [],
        "private": ["batal", "tipeMarketplace"],
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
                        fitur: Array.isArray(r.fitur) ? r.fitur.map(String) : [],
                    };
                }),
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

    /* ========== Tombol Batal (halaman Data Penjualan detail) ========== */
    let btnBatal = null;

    function pasangTombolBatal() {
        if (!bolehFitur('batal')) return;
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

    /* ========== Pelanggan Shopee -> Tipe Penjualan Marketplace (form Pencatatan Penjualan) ========== */
    const KATA_MARKETPLACE = /shopee|tiktok|tokopedia/i;
    const TIPE_MARKETPLACE = '3';   // value "3. Marketplace" di select penjualan[idtipe_penjualan]

    function cekPelangganShopee() {
        if (!bolehFitur('tipeMarketplace')) return;
        const pel = document.querySelector('input[name="penjualan[nama_pelanggan]"]');
        const tipe = document.getElementById('penjualan_idtipe_penjualan');
        if (!pel || !tipe) return;
        if (!KATA_MARKETPLACE.test(pel.value) || tipe.value === TIPE_MARKETPLACE) return;
        if (window.jQuery) window.jQuery(tipe).val(TIPE_MARKETPLACE).trigger('change');   // select yang memakai plugin
        else { tipe.value = TIPE_MARKETPLACE; tipe.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    ['input', 'change', 'focusout'].forEach((t) => document.addEventListener(t, (e) => {
        if (e.target && e.target.name === 'penjualan[nama_pelanggan]') { try { cekPelangganShopee(); } catch (err) { /* abaikan */ } }
    }, true));

    function proses() {
        try { pasangTombolBatal(); } catch (e) { /* dicoba lagi saat halaman berubah */ }
        try { cekPelangganShopee(); } catch (e) { /* dicoba lagi saat halaman berubah */ }
    }

    proses();

    const observer = new MutationObserver(proses);
    observer.observe(document.body, { childList: true, subtree: true });
})();
