// ==UserScript==
// @name         Erzap - PPOB (No Faktur + Outlet)
// @namespace    http://tampermonkey.net/
// @version      1.21.0
// @description  Mengaktifkan link No Faktur di tabel Aktifitas PPOB (bawaan disabled), membukanya ke halaman nota /penjualans/<id>, menampilkan outlet notanya di bawah No Faktur. Di /penjualans mengisi filter No Faktur otomatis lalu membuka nota (Lihat). Filter Toko (outlet) ditambahkan di bagian paling atas form pencarian: tombol Toko membuka daftar outlet (diambil dari /outlets/list_nama_outlet/new hanya setelah diklik) dan menyaring baris tabel yang sedang tampil berdasarkan outlet notanya. Transaksi berstatus Error diberi keterangan "Sudah dibatalkan" / "Belum dibatalkan" di kolom Status (dicek dari status nota di /penjualans; bila belum dibatalkan, halaman nota dicek: peringatan "telah dibatalkan" lalu akun "Retur Penjualan" di rincian transaksi => "Sudah diretur"). Saldo PPOB tampil di atas tabel; saldo < Rp 1 juta: suara "Cek saldo bosku" + tulisan peringatan.
// @author       You
// @match        https://trial.erzap.com/penjualans*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Hanya di jendela utama, dan hanya sekali per halaman
    if (window.top !== window) return;
    // Satu @match lebar (/penjualans*); halaman yang bukan PPOB / daftar penjualan (mis. nota /penjualans/<id>) dilewati diam-diam
    if (!/^\/penjualans(\/aktifitas_ppob\/new|\/index\/new)?\/?$/.test(location.pathname)) return;
    if (window.__aistimPpob) return;
    window.__aistimPpob = true;
    console.log('[ppob.js] v1.21.0 aktif di ' + location.pathname);

    // ====== HAK AKSES & FITUR (JSON) ======
    // "admin"   -> daftar nama yang SELALU bisa memakai SEMUA fitur (public maupun private).
    // "private" -> nama fitur yang HANYA boleh dipakai "admin". Nama fitur: noFaktur (link nota), outlet, batal,
    //              filterToko, cariOtomatis (isi filter di /penjualans), saldo (kotak saldo PPOB + peringatan suara).
    // "public"  -> nama fitur yang boleh dipakai SEMUA user yang membuka halaman ini.
    // Fitur yang tidak disebut di keduanya dianggap private (hanya admin).
    // Nama di "admin" dibaca dari tulisan "NAMA (JABATAN)" di pojok kanan bawah ERZAP. Cukup sebagian nama
    // (tidak peduli huruf besar/kecil); isi nama lengkap persis seperti di ERZAP agar tidak salah cocok dengan user lain.
    // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
    // Jika JSON salah ketik, akses ditutup (fitur private ikut tertutup untuk semua orang).
    // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script dan muat ulang halaman ERZAP.
    const AKSES_JSON = `{
        "admin": ["SENTOT ARI HANDOKO", "DIMAS", "PUGUH", "MANAJEMEN PUSAT", "SURYO", "CEO TIMORITEL", "SILVI", "WIWIT", "ISA", "ANIK"],
        "private": ["noFaktur", "outlet", "batal", "filterToko", "cariOtomatis", "saldo"],
        "public": []
    }`;

    function bacaAkses() {
        try {
            const a = JSON.parse(AKSES_JSON) || {};
            return {
                admin: Array.isArray(a.admin) ? a.admin.map(String) : [],
                public: Array.isArray(a.public) ? a.public.map(String) : [],
            };
        } catch (err) {
            console.error('[ppob.js] AKSES_JSON tidak valid -> akses ditutup:', err.message);
            return { admin: [], public: [] };
        }
    }
    const AKSES = bacaAkses();

    // dicek saat dipakai (bukan sekali di awal), karena nama kasir di pojok ERZAP bisa dimuat belakangan
    function bolehFitur(fitur) {
        if (AKSES.public.indexOf(fitur) !== -1) return true;
        const nama = (((document.getElementById('info_kasir') || {}).textContent) || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return AKSES.admin.some(u => {
            u = u.replace(/\s+/g, ' ').trim().toLowerCase();
            return !!u && nama.indexOf(u) !== -1;
        });
    }

    const TABEL = '#data_table';
    const KOLOM_FAKTUR = 2;   // kolom ke-2 = "No Faktur" (No | No Faktur | Status | ...)

    const LIST_URL = '/penjualans';

    // ID nota (/penjualans/<id>) tidak ada di tabel PPOB: dicari lewat form Pencarian di daftar /penjualans
    // (cara Erzap: POST berisi pencarian[...] + token; nama field dibaca dari form aslinya, bukan ditebak).
    const dua = (n) => (n < 10 ? '0' : '') + n;
    const fmtTgl = (d) => dua(d.getDate()) + '-' + dua(d.getMonth() + 1) + '-' + d.getFullYear();

    // Faktur "PJddMMyy-..." memuat tanggal nota -> rentang pencarian: hari itu +-1 hari, cadangan: bulannya
    function rentangFaktur(faktur) {
        const hasil = [];
        const m = /^[A-Za-z]+(\d{2})(\d{2})(\d{2})-/.exec(faktur);
        if (m) {
            const tgl = new Date(2000 + parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
            if (!isNaN(tgl)) {
                hasil.push([new Date(tgl.getFullYear(), tgl.getMonth(), tgl.getDate() - 1), new Date(tgl.getFullYear(), tgl.getMonth(), tgl.getDate() + 1)]);
                hasil.push([new Date(tgl.getFullYear(), tgl.getMonth(), 1), new Date(tgl.getFullYear(), tgl.getMonth() + 1, 0)]);
            }
        }
        const sekarang = new Date();
        hasil.push([new Date(sekarang.getFullYear(), sekarang.getMonth() - 3, 1), sekarang]);
        return hasil;
    }

    let formCari = null;   // promise {action, field: {nama: nilai bawaan}, kode, dari, sampai}
    function ambilFormCari() {
        if (!formCari) formCari = bacaFormCari().catch((err) => { formCari = null; throw err; });
        return formCari;
    }
    async function bacaFormCari() {
        const res = await fetch(LIST_URL, { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' saat membuka daftar penjualan');
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const form = Array.from(doc.querySelectorAll('form')).find((f) => f.querySelector('[name^="pencarian["]'));
        if (!form) throw new Error('form pencarian penjualan tidak ditemukan');
        const field = {};
        form.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => {
            if (/^(checkbox|radio)$/i.test(el.type) && !el.checked) return;
            if (/^(file|submit|button)$/i.test(el.type) || !/^[A-Za-z]/.test(el.name)) return;
            field[el.name] = el.tagName === 'SELECT' ? ((el.querySelector('option[selected]') || {}).value || '') : el.value;
        });
        const nama = Object.keys(field);
        const kode = nama.find((n) => /^pencarian\[kode(_penjualan)?\]$/.test(n)) || nama.find((n) => /^pencarian\[[^\]]*kode[^\]]*\]$/.test(n));
        if (!kode) throw new Error('kolom kode di form pencarian tidak ditemukan');
        const dari = nama.find((n) => /^pencarian\[tanggal[^\]]*(dari|awal|from|mulai)[^\]]*\]$/i.test(n));
        const sampai = nama.find((n) => /^pencarian\[tanggal[^\]]*(sampai|akhir|to)[^\]]*\]$/i.test(n));
        return { action: new URL(form.getAttribute('action') || LIST_URL, location.origin).href, field: field, kode: kode, dari: dari, sampai: sampai };
    }

    // Cari nota lewat form Pencarian: hasilnya {url, outlet}. Tabel hasil punya kolom "Outlet" dan link "Lihat" (/penjualans/<id>).
    const POLA_ID = /\/penjualans\/\d+(?:[\/?#]|$)/;
    // Kolom "Outlet" dari header; cadangan: sel yang berpola kode outlet ("A1 PUSAT", "P09 PARTDISTRO WTC")
    function outletBaris(sel, idx) {
        const dariHeader = idx >= 0 && sel[idx] ? rapih(sel[idx].textContent) : '';
        if (dariHeader) return dariHeader;
        const td = sel.find((x) => /^(A|P)\d+\s+\S/.test(rapih(x.textContent)));
        return td ? rapih(td.textContent) : '';
    }

    // Nomor faktur ASLI: tanpa akhiran "-VOID-xx.xx" (faktur batal diberi nama baru). Sama dengan awalan Trx Id ("<faktur>_RZ...").
    // Pencarian di /penjualans memakai nomor asli; baris hasil dipilih: persis nomor yang tampil > persis nomor asli > berawalan nomor asli.
    const hapusVoid = (f) => String(f).replace(/-VOID-.*$/i, '');
    function nomorAsli(a, faktur) {
        let asli = '';
        const tr = a.closest && a.closest('tr');
        const tabel = tr && tr.closest('table');
        if (tabel) {
            const th = Array.from(tabel.querySelectorAll('thead th, thead td')).map((x) => rapih(x.textContent).toLowerCase());
            const i = th.indexOf('trx id');
            if (i >= 0 && tr.cells[i]) {
                const m = /^(.+?)_RZ/i.exec(rapih(tr.cells[i].textContent));
                if (m) asli = m[1];
            }
        }
        return asli || hapusVoid(faktur);
    }

    // Dari dokumen hasil pencarian -> {url, outlet}; urutan pilihan: persis nomor yang tampil (3) > persis nomor asli (2) > berawalan nomor asli, mis. "...-VOID-14.16" (1)
    function ekstrakHasil(doc, faktur, asli) {
        const tFak = faktur.toUpperCase(), tAsli = (asli || faktur).toUpperCase();
        let terbaik = null, skor = 0;
        for (const tabel of doc.querySelectorAll('table')) {
            const th = Array.from(tabel.querySelectorAll('thead th, thead td'));
            const idxOutlet = th.findIndex((x) => /^outlet$/i.test(rapih(x.textContent)));
            const idxStatus = th.findIndex((x) => /^status( transaksi)?$/i.test(rapih(x.textContent)));
            for (const tr of tabel.querySelectorAll('tbody tr')) {
                const sel = Array.from(tr.cells);
                const teks = sel.map((td) => rapih(td.textContent).toUpperCase());
                const sk = teks.some((t) => t === tFak) ? 3 : teks.some((t) => t === tAsli) ? 2 : teks.some((t) => t.indexOf(tAsli) === 0) ? 1 : 0;
                if (!sk || sk <= skor) continue;
                const a = Array.from(tr.querySelectorAll('a[href]')).find((x) => POLA_ID.test(x.getAttribute('href') || ''));
                if (!a) continue;
                // nota dibatalkan: kolom Status Transaksi berisi "Dibatalkan" (cadangan: sel "Dibatalkan" / nomor berakhiran -VOID-)
                const statusNota = idxStatus >= 0 && sel[idxStatus] ? rapih(sel[idxStatus].textContent) : (teks.indexOf('DIBATALKAN') >= 0 ? 'Dibatalkan' : '');
                const batal = /dibatalkan/i.test(statusNota) || teks.some((t) => /-VOID-/.test(t));
                terbaik = { url: new URL(a.getAttribute('href'), location.origin).href, outlet: outletBaris(sel, idxOutlet), batal: batal, statusNota: statusNota };
                skor = sk;
                if (sk === 3) return terbaik;
            }
        }
        return terbaik;
    }

    // Cadangan: jalankan pencarian di halaman /penjualans asli (iframe tersembunyi, sama persis seperti dilakukan manual),
    // berguna kalau tabel hasil diisi lewat skrip/ajax sehingga tidak ada di HTML mentah. Satu per satu (antre).
    let rantaiIframe = Promise.resolve();
    function cariNotaIframe(faktur, asli) {
        const p = rantaiIframe.then(() => jalankanIframe(faktur, asli));
        rantaiIframe = p.catch(() => {});
        return p;
    }
    const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
    async function tungguDi(fn, ms, pesan) {
        const mulai = Date.now();
        for (;;) {
            let v = null;
            try { v = fn(); } catch (e) { v = null; }
            if (v) return v;
            if (Date.now() - mulai > ms) throw new Error(pesan);
            await tidur(300);
        }
    }
    async function jalankanIframe(faktur, asli) {
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:900px;border:0;opacity:0;pointer-events:none';
        fr.setAttribute('aria-hidden', 'true');
        document.body.appendChild(fr);
        try {
            fr.src = LIST_URL;
            const form = await tungguDi(() => {
                const d = fr.contentDocument;
                return d && d.readyState === 'complete' && Array.from(d.querySelectorAll('form')).find((x) => x.querySelector('[name^="pencarian["]'));
            }, 20000, 'halaman /penjualans tidak termuat');
            const inputs = Array.from(form.querySelectorAll('input[name], select[name]'));
            const kode = inputs.find((el) => /^pencarian\[kode(_penjualan)?\]$/.test(el.name)) || inputs.find((el) => /^pencarian\[[^\]]*kode[^\]]*\]$/.test(el.name));
            if (!kode) throw new Error('kolom kode di filter tidak ditemukan');
            const r = rentangFaktur(asli)[0];
            const dari = inputs.find((el) => /^pencarian\[tanggal[^\]]*(dari|awal|from|mulai)[^\]]*\]$/i.test(el.name));
            const sampai = inputs.find((el) => /^pencarian\[tanggal[^\]]*(sampai|akhir|to)[^\]]*\]$/i.test(el.name));
            setNilai(kode, asli);
            if (r && dari) setNilai(dari, fmtTgl(r[0]));
            if (r && sampai) setNilai(sampai, fmtTgl(r[1]));
            const tombol = Array.from(form.querySelectorAll('button, input[type="submit"]')).find((b) => /cari|filter|search/i.test((b.textContent || '') + ' ' + (b.value || ''))) ||
                           form.querySelector('button[type="submit"], input[type="submit"]');
            if (tombol) tombol.click(); else if (form.requestSubmit) form.requestSubmit(); else form.submit();
            // hasil bisa berupa halaman baru (POST) atau tabel yang diperbarui lewat ajax: baca dokumen iframe saat ini berulang
            return await tungguDi(() => { const d = fr.contentDocument; return d && d.readyState === 'complete' && ekstrakHasil(d, faktur, asli); }, 25000, 'hasil pencarian untuk ' + asli + ' tidak muncul');
        } finally {
            fr.remove();
        }
    }

    // Varian GET: /penjualans?pencarian[kode]=<faktur>&pencarian[tanggal_dari]=...&pencarian[tanggal_sampai]=...
    async function cariNotaGet(faktur, asli) {
        for (const r of rentangFaktur(asli)) {
            const qs = new URLSearchParams();
            qs.set('pencarian[kode]', asli);
            qs.set('pencarian[tanggal_dari]', fmtTgl(r[0]));
            qs.set('pencarian[tanggal_sampai]', fmtTgl(r[1]));
            const res = await fetch(LIST_URL + '?' + qs.toString(), { credentials: 'same-origin', cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status + ' saat mencari nota (GET)');
            const kena = ekstrakHasil(new DOMParser().parseFromString(await res.text(), 'text/html'), faktur, asli);
            if (kena) return kena;
        }
        throw new Error('nota ' + asli + ' tidak ditemukan (GET)');
    }

    async function cariNota(faktur, asli) {
        const f = await ambilFormCari();
        for (const r of rentangFaktur(asli)) {
            const body = new URLSearchParams(f.field);
            body.set(f.kode, asli);
            if (f.dari) body.set(f.dari, fmtTgl(r[0]));
            if (f.sampai) body.set(f.sampai, fmtTgl(r[1]));
            const res = await fetch(f.action, { method: 'POST', credentials: 'same-origin', cache: 'no-store', body: body });
            if (!res.ok) throw new Error('HTTP ' + res.status + ' saat mencari nota');
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const kena = ekstrakHasil(doc, faktur, asli);
            if (kena) return kena;
            if (!f.dari) break;   // tanpa kolom tanggal rentang tidak berpengaruh
        }
        throw new Error('nota ' + asli + ' tidak ditemukan di daftar penjualan');
    }

    // Hasil pencarian per No Faktur (di-cache agar klik & outlet tidak mencari dua kali)
    // + disimpan di localStorage: muat ulang halaman / buka lagi tidak mencari ulang (nota tidak berpindah outlet)
    const K_CACHE = 'aistim_ppob_nota_v1', MAKS_CACHE = 3000;
    let simpanan = {};
    try { simpanan = JSON.parse(localStorage.getItem(K_CACHE) || '{}') || {}; } catch (e) { simpanan = {}; }
    function simpanCache(faktur, n) {
        if (!n || !n.url || !n.outlet) return;   // hanya hasil lengkap
        simpanan[faktur] = { url: n.url, outlet: n.outlet, batal: !!n.batal, retur: n.retur, statusNota: n.statusNota || '', waktu: Date.now() };
        const kunci = Object.keys(simpanan);
        if (kunci.length > MAKS_CACHE) kunci.slice(0, kunci.length - MAKS_CACHE).forEach((k) => delete simpanan[k]);
        try { localStorage.setItem(K_CACHE, JSON.stringify(simpanan)); } catch (e) { /* penuh/diblokir: abaikan */ }
    }
    const cacheNota = {};
    // perluBatal = baris berstatus Error: status pembatalan nota harus segar. "Sudah dibatalkan" final (boleh dari cache);
    // "Sudah diretur" juga final. "Belum dibatalkan" bisa berubah, jadi dari cache hanya dipakai 2 menit; cache lama tanpa data batal/retur dicari ulang.
    const BATAL_TTL_MS = 2 * 60 * 1000;
    function notaDari(faktur, asli, perluBatal) {
        asli = asli || hapusVoid(faktur);
        const c = simpanan[faktur];
        const pakaiCache = c && (!perluBatal || c.batal === true || c.retur === true || (c.batal === false && c.retur === false && Date.now() - (c.waktu || 0) < BATAL_TTL_MS));
        if (!cacheNota[faktur] && pakaiCache) cacheNota[faktur] = Promise.resolve(c);
        if (!cacheNota[faktur]) cacheNota[faktur] = cariNota(faktur, asli)
            .catch((err) => { console.warn('[ppob.js] fetch POST gagal (' + err.message + '), mencoba fetch GET'); return cariNotaGet(faktur, asli); })
            .catch((err) => { console.warn('[ppob.js] fetch GET gagal (' + err.message + '), mencoba lewat halaman /penjualans'); return cariNotaIframe(faktur, asli); })
            .then((n) => { simpanCache(faktur, n); return n; })
            .catch((err) => { delete cacheNota[faktur]; throw err; });
        return cacheNota[faktur];
    }

    // ---------- Outlet di bawah No Faktur ----------
    // Pembuat elemen tanpa innerHTML (kalau halaman memakai Trusted Types, innerHTML melempar error dan mematikan seluruh skrip)
    function buat(tag, atribut, anak) {
        const e = document.createElement(tag);
        Object.keys(atribut || {}).forEach((k) => {
            if (k === 'teks') e.textContent = atribut[k];
            else if (k === 'gaya') e.style.cssText = atribut[k];
            else e.setAttribute(k, atribut[k]);
        });
        (anak || []).forEach((a) => e.appendChild(a));
        return e;
    }
    const rapih = (t) => (t || '').replace(/\s+/g, ' ').trim();
    // teks "memuat" berikon putar (spinner) supaya jelas sedang loading
    function tampilMemuat(el, teks, awalan) {
        el.textContent = '';
        if (awalan) el.appendChild(document.createTextNode(awalan));
        const sp = document.createElement('span');
        sp.className = 'aistim_spin';
        el.appendChild(sp);
        el.appendChild(document.createTextNode(teks));
    }
    const MAKS_SERENTAK = 6;   // pencarian berjalan bersamaan
    const antriOutlet = [];
    let jalanOutlet = 0;

    // ---------- Cek halaman nota untuk transaksi Error yang belum terbukti dibatalkan ----------
    // 1) peringatan "Transaksi Penjualan ini telah dibatalkan" di halaman nota; 2) bila tidak ada, rincian transaksi (tabel berkolom "Akun")
    //    dicek apakah memuat akun "Retur Penjualan".
    function bacaDetailNota(doc) {
        const teksAlert = Array.from(doc.querySelectorAll('.alert, #error')).map((e) => rapih(e.textContent)).join(' ');
        const batal = /dibatalkan/i.test(teksAlert);
        let adaTabelAkun = false, retur = false;
        doc.querySelectorAll('table').forEach((tabel) => {
            const th = Array.from(tabel.querySelectorAll('thead th, thead td')).map((x) => rapih(x.textContent).toLowerCase());
            const i = th.indexOf('akun');
            if (i < 0) return;
            adaTabelAkun = true;
            tabel.querySelectorAll('tbody tr').forEach((tr) => {
                const c = tr.cells[i];
                if (c && /retur\s+penjualan/i.test(c.textContent)) retur = true;
            });
        });
        return { batal: batal, retur: retur, adaTabelAkun: adaTabelAkun };
    }

    // cadangan bila rincian transaksi diisi lewat skrip: muat halaman nota di iframe tersembunyi (antre bersama iframe pencarian)
    function detailLewatIframe(url) {
        const p = rantaiIframe.then(async () => {
            const fr = document.createElement('iframe');
            fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:900px;border:0;opacity:0;pointer-events:none';
            fr.setAttribute('aria-hidden', 'true');
            document.body.appendChild(fr);
            try {
                fr.src = url;
                return await tungguDi(() => {
                    const d = fr.contentDocument;
                    if (!d || d.readyState !== 'complete') return null;
                    const r = bacaDetailNota(d);
                    return (r.adaTabelAkun || r.batal) ? r : null;
                }, 20000, 'rincian transaksi nota tidak terbaca');
            } finally {
                fr.remove();
            }
        });
        rantaiIframe = p.catch(() => {});
        return p;
    }

    async function ambilDetailNota(url) {
        try {
            const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { 'Accept': 'text/html' } });
            if (res.ok) {
                const d = bacaDetailNota(new DOMParser().parseFromString(await res.text(), 'text/html'));
                if (d.adaTabelAkun || d.batal) return d;
            }
        } catch (e) { /* lanjut ke cadangan */ }
        return detailLewatIframe(url);
    }

    // hasil pencarian n (belum dibatalkan menurut daftar penjualan) dilengkapi dengan cek halaman nota -> n.batal / n.retur
    const cacheDetail = {};
    function lengkapiStatus(faktur, n) {
        if (n.batal || typeof n.retur === 'boolean') return Promise.resolve(n);   // sudah final / sudah dicek
        if (!cacheDetail[faktur]) {
            cacheDetail[faktur] = ambilDetailNota(n.url).then((d) => {
                const n2 = Object.assign({}, n, { batal: !!(n.batal || d.batal), retur: d.retur });
                cacheNota[faktur] = Promise.resolve(n2);
                simpanCache(faktur, n2);
                return n2;
            }).catch((err) => { delete cacheDetail[faktur]; throw err; });
        }
        return cacheDetail[faktur];
    }

    function prosesAntriOutlet() {
        while (jalanOutlet < MAKS_SERENTAK && antriOutlet.length) {
            const it = antriOutlet.shift();
            jalanOutlet++;
            notaDari(it.faktur, it.asli, it.perluBatal)
                .then((n) => {
                    if (it.jenis === 'batal') return lengkapiStatus(it.faktur, n).then((n2) => tulisBatal(it.el, n2));
                    it.el.textContent = '🏪 ' + (n.outlet || '(tidak terbaca)');
                    if (n.outlet) it.el.setAttribute('data-outlet', n.outlet);
                    terapkanFilterToko();
                })
                .catch((err) => {
                    if (it.jenis === 'batal') { it.el.textContent = '(cek pembatalan gagal)'; it.el.style.color = '#888'; it.el.title = err.message; }
                    else { it.el.textContent = '🏪 (gagal)'; it.el.title = 'Outlet: ' + err.message; }
                    console.warn('[ppob.js] ' + it.faktur + ': ' + err.message);
                })
                .then(() => { jalanOutlet--; prosesAntriOutlet(); });
        }
    }

    function tambahOutlet(a) {
        const td = a.closest('td');
        if (!td || td.querySelector('.aistim_ppob_outlet')) return;
        const el = document.createElement('div');
        el.className = 'aistim_ppob_outlet';
        el.title = 'Outlet';
        el.style.color = getComputedStyle(a).color;   // warna sama dengan link No Faktur
        tampilMemuat(el, 'Memuat outlet...', '🏪 ');
        td.insertBefore(el, td.firstChild);   // outlet di atas No Faktur
        antriOutlet.push({ a: a, faktur: a.textContent.trim(), asli: nomorAsli(a, a.textContent.trim()), el: el, jenis: 'outlet', perluBatal: !!selStatusError(a) });
    }

    // Sel Status bila transaksi di baris ini berstatus Error (kolom dikenali dari teks header "Status")
    function selStatusError(a) {
        const tr = a.closest && a.closest('tr');
        const tabel = tr && tr.closest('table');
        if (!tabel) return null;
        const th = Array.from(tabel.querySelectorAll('thead th, thead td')).map((x) => rapih(x.textContent).toLowerCase());
        const i = th.indexOf('status');
        if (i < 0 || !tr.cells[i]) return null;
        const td = tr.cells[i];
        const teksStatus = td.querySelector('.status_text') ? td.querySelector('.status_text').textContent : td.textContent;
        return /error|gagal/i.test(teksStatus) ? td : null;
    }

    // Transaksi Error: tambahkan keterangan "Sudah dibatalkan" / "Belum dibatalkan" di bawah status
    function tambahBatal(a) {
        const td = selStatusError(a);
        if (!td || td.querySelector('.aistim_ppob_batal')) return;
        const el = document.createElement('div');
        el.className = 'aistim_ppob_batal';
        tampilMemuat(el, 'Cek pembatalan...');
        td.appendChild(el);
        const faktur = a.textContent.trim();
        antriOutlet.push({ a: a, faktur: faktur, asli: nomorAsli(a, faktur), el: el, jenis: 'batal', perluBatal: true });
    }

    function tulisBatal(el, n) {
        const batal = !!(n && n.batal), retur = !batal && !!(n && n.retur);
        el.textContent = batal ? '\u2714 Sudah dibatalkan' : retur ? '\u2714 Sudah diretur' : '\u2716 Belum dibatalkan';
        el.style.color = retur ? '#000' : '#fff';                          // diretur: hitam di atas kuning; dibatalkan/belum: putih di atas hijau/merah
        el.style.background = batal ? '#198754' : retur ? '#ffd500' : '#dc3545';   // dibatalkan hijau, diretur kuning, belum dibatalkan merah
        el.style.textShadow = '';
        el.style.padding = '1px 6px';
        el.style.borderRadius = '3px';
        el.style.display = 'block';          // selalu baris baru di bawah status (bukan nempel di samping "Error")
        el.style.width = 'fit-content';       // badge menyesuaikan lebar teks, bukan melebar penuh
        el.title = retur ? 'Ada akun "Retur Penjualan" di rincian transaksi nota'
                         : 'Status nota di penjualan: ' + ((n && n.statusNota) || (batal ? 'Dibatalkan' : '-'));
    }

    // Warna link berubah saat baris di-hover (mis. jadi putih): teks outlet menyusul
    function samakanWarna(tr) {
        const a = tr.querySelector('td:nth-child(' + KOLOM_FAKTUR + ') a');
        const el = tr.querySelector('.aistim_ppob_outlet');
        if (a && el) el.style.color = getComputedStyle(a).color;
    }
    ['mouseover', 'mouseout'].forEach((ev) => {
        document.addEventListener(ev, (e) => {
            const tr = e.target.closest && e.target.closest(TABEL + ' tbody tr');
            if (!tr) return;
            samakanWarna(tr);
            setTimeout(() => samakanWarna(tr), 250);   // jaga-jaga kalau tema memakai transisi warna
        });
    });

    const st = document.createElement('style');
    st.textContent = '.aistim_ppob_outlet{margin-bottom:3px;font-size:12px;font-weight:600;white-space:normal;word-break:break-word}' +
        '.aistim_ppob_batal{margin-top:3px;font-size:12px;font-weight:400;white-space:normal}' +
        '.aistim_ppob_toko_info{margin-top:2px;font-size:11px;color:#666}' +
        '.aistim_ppob_toko_item{padding:6px 10px;cursor:pointer;border-bottom:1px solid #f1f1f1}.aistim_ppob_toko_item:hover{background:#eef4ff}' +
        '.aistim_ppob_toko_bar{display:flex;align-items:center;gap:8px;margin:0 0 8px}' +
        '@keyframes aistim_spin{to{transform:rotate(360deg)}}' +
        '.aistim_spin{display:inline-block;width:10px;height:10px;margin-right:5px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:aistim_spin .7s linear infinite}' +
        '#aistim_ppob_saldo{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 8px;padding:8px 12px;border:1px solid #cfe2ff;border-left:4px solid #0d6efd;border-radius:4px;background:#f3f8ff;font-size:14px;color:#222}' +
        '#aistim_ppob_saldo .sp_nilai{font-size:18px;font-weight:700;color:#0d6efd}' +
        '#aistim_ppob_saldo .sp_info{font-size:11px;color:#777}' +
        '#aistim_ppob_saldo .sp_err{color:#dc3545}' +
        '#aistim_ppob_saldo.sp_rendah{border-color:#f5c2c7;border-left-color:#dc3545;background:#fff5f5}' +
        '#aistim_ppob_saldo.sp_rendah .sp_nilai{color:#dc3545}' +
        '#aistim_ppob_saldo .sp_warn{font-weight:700;color:#dc3545}' +
        '#aistim_ppob_saldo button{margin-left:auto;padding:2px 10px;border:1px solid #b6d4fe;border-radius:4px;background:#fff;color:#0d6efd;cursor:pointer;font-size:12px}';
    document.head.appendChild(st);

    // ID nota kadang sudah ada di href link No Faktur: /penjualans/nota_a5/<id>?layout=simple -> nota = /penjualans/<id>
    function urlLangsung(a) {
        const m = /\/penjualans\/(?:nota[a-z0-9_]*|cetak[a-z0-9_]*)\/(\d{4,})/i.exec(a.getAttribute('href') || '');
        return m ? location.origin + '/penjualans/' + m[1] : null;
    }

    // Klik No Faktur: tab baru dibuka dulu (agar tidak diblokir popup blocker), lalu diarahkan ke nota hasil pencarian.
    // Kalau pencarian di belakang layar gagal, tab dibuka ke /penjualans dan diisi/dicari/diklik "Lihat" otomatis (halamanCari).
    const PREFIX_NAMA = 'aistim_ppob_cari:';
    async function bukaNota(e) {
        e.preventDefault();
        e.stopPropagation();
        const faktur = e.currentTarget.textContent.trim();
        const langsung = urlLangsung(e.currentTarget);
        if (langsung) {
            if (!window.open(langsung, '_blank')) alert('Tab baru diblokir browser. Izinkan popup untuk trial.erzap.com.');
            return;
        }
        // Nota sudah dikenal (tersimpan): langsung buka URL-nya, tanpa tab kosong
        if (simpanan[faktur] && simpanan[faktur].url) {
            if (!window.open(simpanan[faktur].url, '_blank')) alert('Tab baru diblokir browser. Izinkan popup untuk trial.erzap.com.');
            return;
        }
        const tab = window.open('', '_blank');
        if (!tab) { alert('Tab baru diblokir browser. Izinkan popup untuk trial.erzap.com.'); return; }
        // Tab sementara berisi tulisan "Memuat nota ..." (bukan about:blank kosong) selama pencarian berjalan
        try {
            tab.document.title = 'Memuat nota ' + faktur + ' ...';
            tab.document.body.style.cssText = 'margin:0;display:flex;align-items:center;justify-content:center;gap:12px;height:100vh;font:16px sans-serif;color:#475569';
            const gaya = tab.document.createElement('style');
            gaya.textContent = '@keyframes sp{to{transform:rotate(360deg)}}.sp{width:22px;height:22px;border:3px solid #94a3b8;border-right-color:transparent;border-radius:50%;animation:sp .8s linear infinite}';
            tab.document.head.appendChild(gaya);
            const pt = tab.document.createElement('div'); pt.className = 'sp';
            const tt = tab.document.createElement('span'); tt.textContent = 'Memuat nota ' + faktur + ' ...';
            tab.document.body.appendChild(pt);
            tab.document.body.appendChild(tt);
        } catch (x) { /* abaikan */ }
        try {
            const n = await notaDari(faktur, nomorAsli(e.currentTarget, faktur));
            tab.location.href = n.url;
        } catch (err) {
            console.warn('[ppob.js] cari di belakang layar gagal (' + err.message + '), pakai alur manual di /penjualans');
            try { tab.name = PREFIX_NAMA + faktur + '|0'; } catch (x) { /* abaikan */ }
            tab.location.href = location.origin + LIST_URL;
        }
    }

    function aktifkan(a) {
        a.classList.remove('disabled');
        a.removeAttribute('disabled');
        a.removeAttribute('aria-disabled');
        a.removeAttribute('tabindex');
        a.style.pointerEvents = 'auto';
        a.style.cursor = 'pointer';
        if (!a.__aistimPpob) {
            a.__aistimPpob = true;
            a.addEventListener('click', bukaNota, true);
        }
    }

    // ---------- Saldo PPOB di atas tabel (GET /main/check_balance_ppob/new -> {status, message, balance}) ----------
    const SALDO_URL = '/main/check_balance_ppob/new';
    const SALDO_TIAP_MS = 90 * 1000;
    const fmtRp = (n) => 'Rp ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let saldoBox = null, saldoJalan = false;

    // ---------- Peringatan saldo < Rp 1 juta: suara "Cek saldo bosku" (tanpa tombol lonceng) ----------
    const BATAS_SALDO = 1000000;
    const KATA_SALDO = 'Cek saldo bosku';   // suara lonceng (diucapkan); tulisan peringatan di kotak tetap "Saldo kurang dari 1 juta"
    const ULANG_BUNYI_MS = 5 * 60 * 1000;   // selama saldo masih rendah, diulang tiap 5 menit
    let saldoRendah = false, terakhirBunyi = 0, menungguSentuh = false, audioCtx = null;

    function siapkanAudio() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { /* tidak didukung */ }
    }
    // Browser hanya mengizinkan suara setelah halaman pernah diklik/disentuh; kalau tadi diblokir, diulang di sentuhan pertama
    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((ev) => document.addEventListener(ev, () => {
        siapkanAudio();
        if (menungguSentuh && saldoRendah) { menungguSentuh = false; bunyikanPeringatan(); }
    }, { passive: true }));

    function bip() {
        try {
            if (!audioCtx || audioCtx.state !== 'running') return;
            [[880, 0], [660, 0.2], [880, 0.4]].forEach(([f, t]) => {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'sine'; o.frequency.value = f;
                const m = audioCtx.currentTime + t;
                g.gain.setValueAtTime(0.0001, m);
                g.gain.exponentialRampToValueAtTime(0.4, m + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, m + 0.18);
                o.connect(g); g.connect(audioCtx.destination);
                o.start(m); o.stop(m + 0.2);
            });
        } catch (e) { /* abaikan */ }
    }
    function ucapkan(teks) {
        try {
            if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return false;
            const u = new SpeechSynthesisUtterance(teks);
            u.lang = 'id-ID';
            u.rate = 1;
            u.volume = 1;
            const v = (window.speechSynthesis.getVoices() || []).find((x) => /^id([-_]|$)/i.test(x.lang));
            if (v) u.voice = v;
            u.onerror = (e) => {
                if (e && e.error === 'not-allowed') menungguSentuh = true;   // belum ada sentuhan di halaman: ulangi nanti
                else bip();
            };
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
            return true;
        } catch (e) { return false; }
    }
    function bunyikanPeringatan() {
        terakhirBunyi = Date.now();
        siapkanAudio();
        if (!ucapkan(KATA_SALDO)) bip();
    }
    function periksaSaldo(saldo) {
        saldoRendah = saldo < BATAS_SALDO;
        if (saldoBox) {
            saldoBox.classList.toggle('sp_rendah', saldoRendah);
            const w = saldoBox.querySelector('.sp_warn');
            if (w) w.style.display = saldoRendah ? '' : 'none';
        }
        if (saldoRendah && Date.now() - terakhirBunyi > ULANG_BUNYI_MS) bunyikanPeringatan();
    }

    async function muatSaldo() {
        if (!saldoBox || saldoJalan) return;
        saldoJalan = true;
        const nilai = saldoBox.querySelector('.sp_nilai'), info = saldoBox.querySelector('.sp_info'), tombol = saldoBox.querySelector('.sp_ulang');
        info.classList.remove('sp_err');
        tampilMemuat(info, 'memuat saldo...');
        tombol.disabled = true;
        try {
            const res = await fetch(SALDO_URL, { credentials: 'same-origin', cache: 'no-store',
                headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const j = await res.json();
            if (!j || j.status === false || typeof j.balance !== 'number') throw new Error((j && j.message) || 'saldo tidak terbaca');
            nilai.textContent = fmtRp(j.balance);
            periksaSaldo(j.balance);
            const d = new Date();
            info.textContent = 'diperbarui ' + dua(d.getHours()) + ':' + dua(d.getMinutes()) + ':' + dua(d.getSeconds());
        } catch (err) {
            info.textContent = 'gagal memuat saldo (' + err.message + ')';
            info.classList.add('sp_err');
            console.warn('[ppob.js] saldo PPOB: ' + err.message);
        } finally {
            saldoJalan = false;
            tombol.disabled = false;
        }
    }

    function pasangSaldo() {
        if (saldoBox && document.body.contains(saldoBox)) return;
        const tabel = document.querySelector(TABEL);
        if (!tabel) return;
        const target = tabel.closest('.dataTables_wrapper') || tabel;
        saldoBox = document.createElement('div');
        saldoBox.id = 'aistim_ppob_saldo';
        saldoBox.appendChild(buat('span', { teks: 'Saldo PPOB' }));
        saldoBox.appendChild(buat('span', { class: 'sp_nilai', teks: '-' }));
        saldoBox.appendChild(buat('span', { class: 'sp_info' }));
        saldoBox.appendChild(buat('span', { class: 'sp_warn', gaya: 'display:none', teks: '⚠ Saldo kurang dari 1 juta' }));
        saldoBox.appendChild(buat('button', { type: 'button', class: 'sp_ulang', title: 'Muat ulang saldo', teks: '↻ Muat ulang' }));
        saldoBox.querySelector('.sp_ulang').addEventListener('click', muatSaldo);
        target.parentNode.insertBefore(saldoBox, target);
        muatSaldo();
    }
    setInterval(() => { if (!document.hidden && bolehFitur('saldo')) muatSaldo(); }, SALDO_TIAP_MS);

    // ---------- Filter Toko (outlet) ----------
    // Tombol "Toko" membuka daftar outlet. Daftar lengkap diambil dari /outlets/list_nama_outlet/new (endpoint pemilih outlet Erzap, seperti di halaman /penjualans)
    // HANYA setelah tombol diklik pertama kali, lalu disimpan selama halaman terbuka. Memilih outlet menyaring baris tabel yang sedang
    // tampil (berdasarkan outlet nota di atas No Faktur); tidak ikut terkirim ke server.
    // sama dengan pemilih outlet di halaman /penjualans (scope kosong = semua outlet)
    const TOKO_URL = '/outlets/list_nama_outlet/new?exclude=&term=&scope=';
    let filterToko = '';
    let kolomToko = null, btnToko = null, infoToko = null, panelToko = null, listToko = null, cariToko = null;
    let daftarToko = null, memuatToko = false, galatToko = '', tandaPanel = '';
    const hitungToko = {};   // nama outlet -> jumlah baris di halaman ini

    async function muatDaftarToko() {
        if (daftarToko || memuatToko) return;
        memuatToko = true;
        galatToko = '';
        renderPanelToko(true);
        try {
            const res = await fetch(TOKO_URL, { credentials: 'same-origin', cache: 'no-store', headers: { 'Accept': 'text/plain, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const nama = Array.from(doc.querySelectorAll('tr.data_outlet'))
                .map((tr) => rapih(tr.getAttribute('data-nama') || (tr.cells[1] ? tr.cells[1].textContent : '')))
                .filter(Boolean);
            if (!nama.length) throw new Error('daftar outlet kosong');
            daftarToko = nama;
        } catch (err) {
            galatToko = err.message;
            console.warn('[ppob.js] daftar toko gagal dimuat: ' + err.message);
        } finally {
            memuatToko = false;
            renderPanelToko(true);
        }
    }

    function pilihToko(nama) {
        filterToko = nama;
        tutupPanelToko();
        terapkanFilterToko();
    }

    function tutupPanelToko() { if (panelToko) panelToko.style.display = 'none'; }

    function bukaPanelToko() {
        panelToko.style.display = 'flex';
        cariToko.value = '';
        tandaPanel = '';
        renderPanelToko(true);
        muatDaftarToko();   // diambil dari server hanya saat pertama kali dibuka
        cariToko.focus();
    }

    // isi daftar: memuat / gagal (cadangan: outlet yang ada di baris) / semua outlet; dibangun ulang hanya bila ada yang berubah
    function renderPanelToko(paksa) {
        if (!panelToko || panelToko.style.display === 'none') return;
        const q = (cariToko.value || '').toLowerCase();
        const sumber = daftarToko ? daftarToko.slice() : Object.keys(hitungToko).sort();
        Object.keys(hitungToko).forEach((n) => { if (sumber.indexOf(n) < 0) sumber.push(n); });
        if (filterToko && sumber.indexOf(filterToko) < 0) sumber.push(filterToko);
        const tanda = [memuatToko, galatToko, q, filterToko, sumber.map((n) => n + '|' + (hitungToko[n] || 0)).join(';')].join('#');
        if (!paksa && tanda === tandaPanel) return;
        tandaPanel = tanda;
        listToko.textContent = '';
        const baris = (teks, klik, tebal, redup) => {
            const d = document.createElement('div');
            d.className = 'aistim_ppob_toko_item';
            d.textContent = teks;
            if (tebal) d.style.fontWeight = '700';
            if (redup) d.style.color = '#999';
            if (klik) d.addEventListener('click', klik); else d.style.cursor = 'default';
            listToko.appendChild(d);
            return d;
        };
        if (memuatToko) {
            const d = baris('', null);
            const sp = document.createElement('span');
            sp.className = 'aistim_spin';
            d.appendChild(sp);
            d.appendChild(document.createTextNode('Memuat daftar toko...'));
        } else if (galatToko) {
            baris('Gagal memuat daftar toko (' + galatToko + '). Menampilkan outlet yang ada di tabel.', null, false, true).style.whiteSpace = 'normal';
        }
        baris('-- Semua --', () => pilihToko(''), filterToko === '');
        sumber.filter((n) => !q || n.toLowerCase().indexOf(q) !== -1).forEach((n) => {
            const jml = hitungToko[n] || 0;
            baris(n + (jml ? ' (' + jml + ')' : ''), () => pilihToko(n), n === filterToko, !jml);
        });
    }

    function pasangFilterToko() {
        if (kolomToko && document.body.contains(kolomToko)) return;
        const tabel = document.querySelector(TABEL);
        if (!tabel) return;
        btnToko = document.createElement('button');
        btnToko.type = 'button';
        btnToko.id = 'aistim_ppob_filter_toko';
        btnToko.style.cssText = 'text-align:left;width:100%';
        btnToko.textContent = '-- Semua --';
        infoToko = document.createElement('div');
        infoToko.className = 'aistim_ppob_toko_info';
        const label = document.createElement('label');
        label.textContent = 'Toko';
        label.setAttribute('for', 'aistim_ppob_filter_toko');
        cariToko = document.createElement('input');
        cariToko.type = 'text';
        cariToko.placeholder = 'Cari toko...';
        cariToko.style.cssText = 'width:100%;box-sizing:border-box;padding:5px 8px;border:0;border-bottom:1px solid #ddd;outline:0';
        listToko = document.createElement('div');
        listToko.style.cssText = 'overflow:auto;flex:1';
        panelToko = document.createElement('div');
        panelToko.style.cssText = 'display:none;flex-direction:column;position:absolute;left:0;top:100%;z-index:2147483000;min-width:260px;max-height:340px;background:#fff;border:1px solid #ccc;border-radius:4px;box-shadow:0 6px 18px rgba(0,0,0,.25);font-size:13px;text-align:left';
        panelToko.appendChild(cariToko);
        panelToko.appendChild(listToko);
        kolomToko = document.createElement('div');
        kolomToko.style.position = 'relative';
        kolomToko.appendChild(label);
        kolomToko.appendChild(btnToko);
        kolomToko.appendChild(panelToko);
        kolomToko.appendChild(infoToko);
        const status = document.getElementById('pencarian_status');
        const asal = status && (status.closest('.field2') || status.parentNode);
        if (asal && asal.parentNode) {
            // di form pencarian, PALING ATAS (sebelum kolom Status); tampil seperti kolom lain (kelas kolom, label & kontrol disalin)
            kolomToko.className = asal.className || 'field2';
            const labelAsal = asal.querySelector('label');
            if (labelAsal && labelAsal.className) label.className = labelAsal.className;
            if (status.className) btnToko.className = status.className;
            asal.parentNode.insertBefore(kolomToko, asal.parentNode.firstElementChild || asal);   // kolom pertama form
        } else {
            // form pencarian tidak dikenali: pasang batang filter sendiri di atas tabel
            kolomToko.className = 'aistim_ppob_toko_bar';
            const target = tabel.closest('.dataTables_wrapper') || tabel;
            target.parentNode.insertBefore(kolomToko, target);
        }
        tandaPanel = '';
        btnToko.addEventListener('click', () => { if (panelToko.style.display === 'none') bukaPanelToko(); else tutupPanelToko(); });
        cariToko.addEventListener('input', () => renderPanelToko(false));
        cariToko.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupPanelToko(); });
        // klik di luar kolom Toko menutup daftar (dipasang sekali)
        if (!window.__aistimTokoLuar) {
            window.__aistimTokoLuar = true;
            document.addEventListener('mousedown', (e) => { if (kolomToko && !kolomToko.contains(e.target)) tutupPanelToko(); }, true);
        }
    }

    function terapkanFilterToko() {
        Object.keys(hitungToko).forEach((k) => { delete hitungToko[k]; });
        let belum = 0, tampil = 0, total = 0;
        document.querySelectorAll(TABEL + ' tbody tr').forEach((tr) => {
            const e = tr.querySelector('.aistim_ppob_outlet');
            if (!e) return;   // baris pesan kosong ("tidak ada data") tidak disentuh
            total++;
            const o = e.getAttribute('data-outlet') || '';
            if (o) hitungToko[o] = (hitungToko[o] || 0) + 1; else belum++;
            const cocok = !filterToko || o === filterToko;
            const tampilBaru = cocok ? '' : 'none';
            if (tr.style.display !== tampilBaru) tr.style.display = tampilBaru;
            if (cocok) tampil++;
        });
        if (!btnToko) return;
        const teksTombol = filterToko || '-- Semua --';
        if (btnToko.textContent !== teksTombol) btnToko.textContent = teksTombol;
        const teksInfo = (filterToko ? 'Menampilkan ' + tampil + ' dari ' + total + ' baris' : '') +
                         (belum ? (filterToko ? ' · ' : '') + belum + ' outlet masih dimuat...' : '');
        if (infoToko && infoToko.textContent !== teksInfo) infoToko.textContent = teksInfo;
        renderPanelToko(false);
    }

    function proses() {
        if (bolehFitur('saldo')) {
            try { pasangSaldo(); } catch (e) { console.warn('[ppob.js] kotak saldo gagal dipasang: ' + e.message); }
        }
        document.querySelectorAll(TABEL + ' tbody tr td:nth-child(' + KOLOM_FAKTUR + ') a').forEach((a) => {
            if ((a.classList.contains('disabled') || a.hasAttribute('disabled')) && bolehFitur('noFaktur')) aktifkan(a);
            if (bolehFitur('outlet')) tambahOutlet(a);
            if (bolehFitur('batal')) tambahBatal(a);
        });
        if (bolehFitur('filterToko')) {
            try { pasangFilterToko(); terapkanFilterToko(); } catch (e) { console.warn('[ppob.js] filter toko gagal: ' + e.message); }
        }
        if (bolehFitur('outlet')) prosesAntriOutlet();
    }

    // ---------- Di /penjualans: isi filter No Faktur -> Cari -> klik Lihat ----------
    function setNilai(el, nilai) {
        el.value = nilai;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function halamanCari() {
        const m = /^aistim_ppob_cari:(.+)\|(\d+)$/.exec(window.name || '');
        if (!m) return;
        const faktur = m[1];
        const tahap = parseInt(m[2], 10);   // 0 = belum mencari, 1 = sudah submit (halaman hasil)
        const selesai = () => { window.name = ''; };

        const tunggu = (fn, ms) => {
            const mulai = Date.now();
            const t = setInterval(() => { if (fn() || Date.now() - mulai > ms) clearInterval(t); }, 300);
        };

        if (tahap === 0) {
            tunggu(() => {
                const form = Array.from(document.querySelectorAll('form')).find((f) => f.querySelector('[name^="pencarian["]'));
                if (!form) return false;
                const inputs = Array.from(form.querySelectorAll('input[name], select[name]'));
                const kode = inputs.find((el) => /^pencarian\[kode(_penjualan)?\]$/.test(el.name)) ||
                             inputs.find((el) => /^pencarian\[[^\]]*kode[^\]]*\]$/.test(el.name));
                if (!kode) { selesai(); alert('Kolom No Faktur di filter /penjualans tidak ditemukan.'); return true; }
                const asliCari = hapusVoid(faktur);
                setNilai(kode, asliCari);
                const r = rentangFaktur(asliCari)[0];
                const dari = inputs.find((el) => /^pencarian\[tanggal[^\]]*(dari|awal|from|mulai)[^\]]*\]$/i.test(el.name));
                const sampai = inputs.find((el) => /^pencarian\[tanggal[^\]]*(sampai|akhir|to)[^\]]*\]$/i.test(el.name));
                if (r && dari) setNilai(dari, fmtTgl(r[0]));
                if (r && sampai) setNilai(sampai, fmtTgl(r[1]));
                window.name = PREFIX_NAMA + faktur + '|1';   // setelah submit, halaman hasil memuat ulang skrip ini
                const tombol = Array.from(form.querySelectorAll('button, input[type="submit"]')).find((b) => /cari|filter|search/i.test((b.textContent || '') + ' ' + (b.value || ''))) ||
                               form.querySelector('button[type="submit"], input[type="submit"]');
                if (tombol) tombol.click(); else if (form.requestSubmit) form.requestSubmit(); else form.submit();
                return true;
            }, 15000);
            return;
        }

        // tahap 1: halaman hasil -> cari baris yang memuat No Faktur, lalu klik tombol/link "Lihat" di baris itu
        const cariLihat = (tr) => {
            const els = Array.from(tr.querySelectorAll('a, button'));
            const label = (x) => rapih(x.textContent) + ' ' + (x.title || '') + ' ' + (x.getAttribute('aria-label') || '') + ' ' + (x.getAttribute('data-original-title') || '');
            return els.find((x) => /lihat|view|detail/i.test(label(x))) ||
                   els.find((x) => x.querySelector('.fa-eye, .glyphicon-eye-open, .fa-search, .icon-eye')) ||
                   els.find((x) => POLA_ID.test(x.getAttribute('href') || ''));
        };
        tunggu(() => {
            // pilih baris yang memuat nomor yang tampil di tabel PPOB; kalau tidak ada, baris berisi nomor asli (tanpa -VOID-...)
            const baris = Array.from(document.querySelectorAll('tbody tr'));
            const memuat = (tr, t) => rapih(tr.textContent).toUpperCase().indexOf(t.toUpperCase()) !== -1;
            const urut = baris.filter((tr) => memuat(tr, faktur)).concat(baris.filter((tr) => !memuat(tr, faktur) && memuat(tr, hapusVoid(faktur))));
            for (const tr of urut) {
                const lihat = cariLihat(tr);
                if (!lihat) continue;
                selesai();
                const href = lihat.getAttribute('href');
                if (href && href !== '#' && !/^javascript/i.test(href)) location.href = new URL(href, location.href).href;
                else lihat.click();
                return true;
            }
            return false;
        }, 8000);
        setTimeout(() => {
            if ((window.name || '').indexOf(PREFIX_NAMA) === 0) { selesai(); alert('Nota ' + faktur + ' tidak ditemukan di hasil pencarian /penjualans.'); }
        }, 8500);
    }

    // Baris tabel digambar ulang (DataTables: ganti halaman, cari, urut) -> proses lagi
    if (!/\/aktifitas_ppob\//.test(location.pathname)) {
        if (bolehFitur('cariOtomatis')) halamanCari();
        return;
    }


    let tunda = 0;
    new MutationObserver(function () {
        clearTimeout(tunda);
        tunda = setTimeout(proses, 50);
    }).observe(document.body, { childList: true, subtree: true });

    proses();
})();
