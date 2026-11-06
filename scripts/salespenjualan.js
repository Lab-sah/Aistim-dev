// ==UserScript==
// @name         Erzap - Sales Penjualan
// @namespace    http://tampermonkey.net/
// @version      1.4.0
// @description  Halaman Data Penjualan (detail): tombol 'Batal' di samping 'Duplikasi Penjualan'. Halaman Pencatatan Penjualan baru (/penjualans/new): popup Draf Penjualan langsung terbuka, dengan filter outlet dan sembunyikan draf hari ini; popup ditutup lagi kalau tidak ada draf yang tampil. Fitur hanya untuk role yang diatur di AKSES_JSON (SENTOT, SURYO, MANAJEMEN PUSAT).
// @match        https://*.erzap.com/penjualans*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @world        main
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ====== HAK AKSES & FITUR (JSON) ======
    // "public"  -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini. Kosong = tidak ada fitur untuk umum.
    // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua). Nama fitur: batal, drafOtomatis.
    // "role"    -> nama-nama role: "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
    //              cukup sebagian nama; isi nama lengkap persis seperti di ERZAP), "fitur" = fitur private yang boleh dipakai role itu.
    // Fitur yang tidak disebut di "public" maupun "private" ditolak.
    // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
    // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
    const AKSES_JSON = `{
        "public": [],
        "private": ["batal", "drafOtomatis"],
        "role": {
          "pusat": {
            "nama": ["SENTOT", "SURYO", "MANAJEMEN PUSAT"],
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

    /* ========== Popup Draf Penjualan (halaman Pencatatan Penjualan baru) ========== */
    let drafDibuka = false;
    let tabelDraf = null;      // tabel draf di popup terakhir yang ditemukan
    let kolomTgl = -1;         // indeks kolom Tanggal di tabel draf
    let sembunyikanHariIni = true;
    let outletPilih = '';      // '' = Semua outlet
    const RE_TGL = /^\d{2}-\d{2}-\d{4}$/;

    function bukaDrafOtomatis() {
        if (!bolehFitur('drafOtomatis')) return;
        if (drafDibuka || !/\/penjualans\/new\/?$/.test(location.pathname)) return;
        const tombol = document.getElementById('btnDrafPenjualan');
        if (!tombol) return;
        drafDibuka = true;
        setTimeout(() => {
            tombol.click();
            setTimeout(() => cekDrafKosong(Date.now()), 600);
        }, 300);
    }

    // Popup ditutup lagi kalau tidak ada draf yang tampil (kosong, atau semuanya disembunyikan).
    // Menunggu tabel selesai dimuat (maks. 6 detik) supaya tidak menutup saat masih loading.
    function cekDrafKosong(mulai) {
        const tbl = tabelDraf;
        const sudahMuat = tbl && tbl.isConnected && tbl.querySelectorAll('tbody tr').length > 0;
        if (!sudahMuat && Date.now() - mulai < 6000) { setTimeout(() => cekDrafKosong(mulai), 300); return; }
        if (!tbl || !tbl.isConnected) return;
        const adaDraf = Array.from(tbl.querySelectorAll('tbody tr')).some((tr) => {
            if (tr.style.display === 'none') return false;
            const sel = tr.children[kolomTgl];
            return !!sel && RE_TGL.test(sel.textContent.trim());
        });
        if (adaDraf) return;
        const modal = tbl.closest('.modal, [role="dialog"]');
        const tutup = modal && modal.querySelector('[data-bs-dismiss="modal"]');
        if (tutup) tutup.click();
    }

    function tanggalHariIni() {
        const d = new Date();
        const dua = (n) => String(n).padStart(2, '0');
        return dua(d.getDate()) + '-' + dua(d.getMonth() + 1) + '-' + d.getFullYear();
    }

    // Kotak kontrol di atas tabel draf: centang sembunyikan hari ini + dropdown outlet
    function buatKotakFilter(induk, tbl) {
        const kotak = document.createElement('div');
        kotak.className = 'draf-filter';
        kotak.style.cssText = 'margin:6px 0;font-size:13px;';

        const label = document.createElement('label');
        label.style.cssText = 'display:inline-block;margin-right:12px;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'draf-cb';
        cb.checked = sembunyikanHariIni;
        cb.addEventListener('change', () => { sembunyikanHariIni = cb.checked; filterDraf(); });
        const teks = document.createElement('span');
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' '));
        label.appendChild(teks);

        const sel = document.createElement('select');
        sel.className = 'draf-outlet';
        sel.style.cssText = 'font-size:13px;';
        sel.addEventListener('change', () => { outletPilih = sel.value; filterDraf(); });

        kotak.appendChild(label);
        kotak.appendChild(sel);
        induk.insertBefore(kotak, tbl);
        return kotak;
    }

    function filterDraf() {
        if (!bolehFitur('drafOtomatis')) return;
        document.querySelectorAll('table').forEach((tbl) => {
            const head = Array.from(tbl.querySelectorAll('thead th, thead td')).map((c) => c.textContent.trim());
            const iTgl = head.indexOf('Tanggal');
            const iOutlet = head.indexOf('Outlet');
            if (iTgl < 0 || head.indexOf('No Faktur') < 0) return;      // hanya tabel draf
            if (!tbl.closest('.modal, [role="dialog"]')) return;        // hanya yang ada di popup
            tabelDraf = tbl;
            kolomTgl = iTgl;
            const induk = tbl.parentElement;
            if (!induk) return;

            let kotak = induk.querySelector(':scope > .draf-filter');
            if (!kotak) kotak = buatKotakFilter(induk, tbl);
            const hari = tanggalHariIni();
            kotak.querySelector('label span').textContent = 'Sembunyikan draf tanggal hari ini (' + hari + ')';
            kotak.querySelector('.draf-cb').checked = sembunyikanHariIni;

            const rows = Array.from(tbl.querySelectorAll('tbody tr'));
            const sel = kotak.querySelector('.draf-outlet');
            if (iOutlet >= 0) {
                const daftar = Array.from(new Set(rows.map((tr) => (tr.children[iOutlet] ? tr.children[iOutlet].textContent.trim() : '')).filter(Boolean))).sort();
                const kunci = daftar.join('|');
                if (sel.dataset.kunci !== kunci) {
                    sel.dataset.kunci = kunci;
                    sel.textContent = '';
                    const semua = document.createElement('option');
                    semua.value = '';
                    semua.textContent = 'Semua outlet';
                    sel.appendChild(semua);
                    daftar.forEach((o) => {
                        const op = document.createElement('option');
                        op.value = o;
                        op.textContent = o;
                        sel.appendChild(op);
                    });
                }
                if (daftar.indexOf(outletPilih) === -1) outletPilih = '';
                sel.value = outletPilih;
                sel.style.display = '';
            } else {
                sel.style.display = 'none';
                outletPilih = '';
            }

            rows.forEach((tr) => {
                const tgl = tr.children[iTgl] ? tr.children[iTgl].textContent.trim() : '';
                const outlet = iOutlet >= 0 && tr.children[iOutlet] ? tr.children[iOutlet].textContent.trim() : '';
                const sembunyi = (sembunyikanHariIni && tgl === hari) || (outletPilih !== '' && outlet !== outletPilih);
                tr.style.display = sembunyi ? 'none' : '';
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
