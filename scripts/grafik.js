// ==UserScript==
// @name         Erzap - Grafik Penjualan Home
// @namespace    http://tampermonkey.net/
// @version      2.2.4
// @description  Halaman Home: kotak "Penjualan per Jam" di ATAS panel AI Agent (Rekomendasi Marketing Produk Kurang Laku). Data dari Data Penjualan (/penjualans) berdasarkan tanggal HARI INI: form Pencarian diisi Periode = hari ini (Dasar Filter Periode = Tanggal Transaksi, filter lain dikosongkan), lalu SEMUA halaman hasil dibaca lewat tautan "Selanjutnya" (ukuran halaman tidak diasumsikan). Jalur cepat lewat fetch (cara ppob.js); kalau gagal (mis. tabel diisi lewat skrip) dipakai halaman Data Penjualan sungguhan di iframe tersembunyi. Nota dibatalkan tidak dihitung, dan jamnya diambil dari kolom "Diperbaharui Tanggal". Tipe Penjualan (bawaan Offline / Instore, atau Semua tipe) dan Outlet (bawaan Semua outlet) dipilih lewat dropdown di judul; daftar pilihannya diambil dari nota yang terbaca, dan ganti pilihan tidak membaca ulang karena disaring di browser. Kolom = penjualan (Rp) atau jumlah nota per jam hari ini, tooltip per jam, dan tampilan Tabel sebagai pasangan grafik. Hasil terakhir disimpan di localStorage (tampil langsung saat Home dibuka, lalu diperbarui tiap 10 menit atau lewat tombol Muat ulang). Digambar sendiri (SVG, tanpa library). Hanya di Home; tidak jalan di halaman Login / nota / popup.
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window) return;
    // Jendela cetak / nota / popup (layout=simple, /nota...) dilewati
    if (/[?&]layout=/.test(location.search) || /\/nota/i.test(location.pathname)) return;
    // Halaman Login (belum ada sesi) dilewati: fetch tanpa sesi dibalas 401 dan memicu modal Login bawaan Erzap
    if (document.querySelector('input[type="password"]')) return;
    if (location.pathname !== '/') return;   // grafik hanya di Home
    if (window.__aistimGrafik) return;
    window.__aistimGrafik = true;
    console.log('[grafik.js] v2.2.4 aktif di ' + location.pathname);

    const LIST_URL = '/penjualans';
    // Daftar Tipe Penjualan & Outlet diambil dari nota yang terbaca (kolom Tipe Penjualan, mis. "1. Offline / Instore").
    // Tipe yang terpilih pertama kali = yang cocok pola ini; sesudahnya mengikuti pilihan yang disimpan.
    const TIPE_BAWAAN = /offline/i;
    const TANPA_TIPE = '(tanpa tipe)';
    const HAL_MAKS = 200;                      // batas pengaman jumlah halaman yang dibaca
    const CEK_ASLI_JEDA_MS = 10 * 60 * 1000;   // hasil kosong dari jalur cepat: halaman asli dicek ulang paling cepat sekali per jeda ini (= jeda muat ulang, supaya nota pertama pagi tidak telat)
    const REFRESH_TIAP_MS = 10 * 60 * 1000;
    const ULANG_GALAT_MS = 60 * 1000;          // setelah gagal, coba lagi lebih cepat
    const MULAI_TUNDA_MS = 3000;               // beri waktu Home selesai memuat dulu
    const CEK_TIAP_MS = 2000;
    const K_CACHE = 'aistim_grafik_jam_v2';    // {tgl, data:{tipe:{outlet:{jam:[n,rp]}}}, tipes, outlets, adaTotal, baris, hal, t}
    const K_PREF = 'aistim_grafik_pref2';      // {metrik:'rp'|'nota', tampil:'grafik'|'tabel', tipe:''|'*'|<teks tipe>, outlet:''|<nama outlet>}
    const JAM_AWAL = 7, JAM_AKHIR = 21;        // rentang jam bawaan di sumbu X (melebar bila ada nota di luarnya)
    const TINGGI_PLOT = 200;
    const WARNA = '#2a78d6';                   // palet kategorikal slot 1 (lolos validate_palette, permukaan putih)
    const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const SVGNS = 'http://www.w3.org/2000/svg';
    const MULAI = Date.now();

    const dua = (n) => (n < 10 ? '0' : '') + n;
    const rapih = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const fmtRp = (n) => 'Rp ' + Math.round(n).toLocaleString('en-US');   // pemisah ribuan sama dengan tampilan Erzap
    const fmtJam = (h) => dua(h) + '.00';
    const tglHariIni = () => { const d = new Date(); return dua(d.getDate()) + '-' + dua(d.getMonth() + 1) + '-' + d.getFullYear(); };
    const tglLengkap = (d) => HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();

    // 12500000 -> "12,5 jt"; dipakai untuk sumbu & label puncak (angka lengkap ada di tooltip & tabel)
    function ringkas(n) {
        const a = Math.abs(n);
        const [bagi, satuan] = a >= 1e9 ? [1e9, ' M'] : a >= 1e6 ? [1e6, ' jt'] : a >= 1e3 ? [1e3, ' rb'] : [1, ''];
        const v = n / bagi;
        const t = Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
        return t.replace('.', ',') + satuan;
    }

    // "1,234,567.00" / "Rp 1.234.567" / "1234.5" -> angka; null bila tidak ada digit
    function parseUang(s) {
        let t = String(s || '').replace(/rp\.?/ig, '').replace(/\s+/g, '').replace(/[^0-9.,-]/g, '');
        if (!/\d/.test(t)) return null;
        const koma = t.lastIndexOf(','), titik = t.lastIndexOf('.');
        if (koma >= 0 && titik >= 0) t = koma > titik ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');   // pemisah desimal = yang terakhir
        else if (koma >= 0) t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
        else if (titik >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
        const n = parseFloat(t);
        return isNaN(n) ? null : n;
    }

    // ---------- preferensi & cache (localStorage; semua akses dibungkus try/catch) ----------
    // tipe: '' = bawaan (Offline), '*' = semua tipe, selain itu teks tipe persis; outlet: '' = semua outlet
    const pref = { metrik: 'rp', tampil: 'grafik', tipe: '', outlet: '' };
    try {
        const p = JSON.parse(localStorage.getItem(K_PREF) || 'null');
        if (p && (p.metrik === 'rp' || p.metrik === 'nota')) pref.metrik = p.metrik;
        if (p && (p.tampil === 'grafik' || p.tampil === 'tabel')) pref.tampil = p.tampil;
        if (p && typeof p.tipe === 'string') pref.tipe = p.tipe;
        if (p && typeof p.outlet === 'string') pref.outlet = p.outlet;
    } catch (e) { /* pakai bawaan */ }
    function simpanPref() { try { localStorage.setItem(K_PREF, JSON.stringify(pref)); } catch (e) { /* abaikan */ } }

    // hasil pemindaian: {tgl, data:{tipe:{outlet:{jam:[n,rp]}}}, tipes:[...], outlets:[...], adaTotal, baris, hal, t, error, selesai}
    // (data per tipe x outlet x jam; yang tampil = jumlah bagian yang cocok dengan pilihan, lihat lihat())
    let hasil = null;
    try {
        localStorage.removeItem('aistim_grafik_jam_v1');   // format lama (tanpa tipe/outlet)
        const c = JSON.parse(localStorage.getItem(K_CACHE) || 'null');
        // cache hanya berlaku untuk hari yang sama; t dibiarkan lama supaya langsung diperbarui di latar
        if (c && c.tgl === tglHariIni() && c.data && typeof c.data === 'object') hasil = { tgl: c.tgl, data: c.data, tipes: c.tipes || [], outlets: c.outlets || [], adaTotal: !!c.adaTotal, baris: c.baris || 0, hal: c.hal || 0, t: c.t || 0, sumber: c.sumber || '', diag: c.diag || null, error: '', selesai: true, dariCache: true };
    } catch (e) { /* cache rusak: abaikan */ }
    function simpanCache() {
        if (!hasil || hasil.error) return;
        try { localStorage.setItem(K_CACHE, JSON.stringify({ tgl: hasil.tgl, data: hasil.data, tipes: hasil.tipes, outlets: hasil.outlets, adaTotal: hasil.adaTotal, baris: hasil.baris, hal: hasil.hal, t: hasil.t, sumber: hasil.sumber, diag: hasil.diag })); } catch (e) { /* penuh/diblokir: abaikan */ }
    }

    // ---------- membaca tabel Data Penjualan ----------
    // Kolom dikenali dari teks header, lalu disejajarkan dengan isi sel: di HTML mentah hasil fetch kolom Lihat/Edit tidak
    // di depan (lihat pesanan_web.js), jadi indeks header bisa bergeser beberapa kolom dari indeks sel. Pergeseran dicari dari
    // kolom Tipe Penjualan ("1. Offline / Instore") dan dipakai untuk semua kolom lain.
    const RE_TIPE = /^\d+\.\s*\S/;
    const RE_OUTLET = /^[A-Z]\d{1,3}\s+\S/;   // kode outlet di awal nama, mis. "S06 PARTDISTRO JEMBER", "A1 PUSAT" (cadangan bila header Outlet tidak ketemu)
    const RE_WAKTU = /(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})/;
    const RE_DARI = /^pencarian\[tanggal[^\]]*(dari|awal|from|mulai)[^\]]*\]$/i;    // nama field Periode di form Pencarian (sama dengan ppob.js)
    const RE_SAMPAI = /^pencarian\[tanggal[^\]]*(sampai|akhir|to)[^\]]*\]$/i;
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
    // galat pembacaan; kosong = hasilnya "tidak ada baris hari ini" (bisa benar-benar kosong, bisa filter tidak berlaku)
    // fatal = galat server/jaringan: halaman asli di iframe tidak akan membantu, jadi tidak dicoba
    function galat(pesan, kosong, fatal) { const e = new Error(pesan); e.kosong = !!kosong; e.fatal = !!fatal; return e; }

    function bacaTabel(doc) {
        // baris header: di <thead>, atau baris ber-<th> pertama (tabel tanpa <thead>)
        const barisHeader = (t) => (t.tHead && t.tHead.rows[0]) || Array.from(t.rows).find((r) => r.querySelector('th')) || null;
        const punyaHeader = (t) => { const hr = barisHeader(t); return hr && /tipe\s*penjualan/i.test(hr.textContent); };
        // baris data milik tabel ini saja (bukan tabel bersarang di dalam sel), tanpa baris header
        const barisData = (t, hr) => Array.from(t.querySelectorAll('tbody tr')).filter((tr) => tr !== hr && tr.closest('table') === t);
        // tabel berheader Tipe Penjualan dengan baris terbanyak (tabel penggulung bisa punya salinan header tanpa baris)
        const tabel = Array.from(doc.querySelectorAll('table')).filter(punyaHeader).sort((a, b) => barisData(b, barisHeader(b)).length - barisData(a, barisHeader(a)).length)[0] || doc.getElementById('data_table');
        if (!tabel) return null;
        const hr = barisHeader(tabel) || tabel.querySelector('tr');
        if (!hr) return null;
        const head = Array.from(hr.children).map((th) => rapih(th.textContent).toLowerCase());
        const baris = barisData(tabel, hr)
            .map((tr) => Array.from(tr.children).filter((c) => /^t[dh]$/i.test(c.tagName)).map((c) => rapih(c.textContent)))
            .filter((c) => c.length >= 5);   // baris pesan kosong ("tidak ada data") dilewati
        return { head: head, baris: baris };
    }
    const sidikTabel = (doc) => { const t = bacaTabel(doc); return t ? t.baris.length + '|' + (t.baris[0] || []).join('|') + '|' + (t.baris[t.baris.length - 1] || []).join('|') : ''; };

    function cariGeser(head, baris) {
        const iTipe = head.findIndex((h) => /^tipe\s*penjualan$/.test(h));
        if (iTipe < 0) return null;
        const contoh = baris.slice(0, 15);
        let geser = null, skor = 0;
        [0, -1, -2, 1, 2, -3, 3, -4, 4].forEach((g) => {
            const n = contoh.filter((c) => RE_TIPE.test(c[iTipe + g] || '')).length;
            if (n > skor) { skor = n; geser = g; }
        });
        return geser;
    }

    function petaKolom(head, geser) {
        const kol = (re) => { const i = head.findIndex((h) => re.test(h)); return i < 0 ? -1 : i + geser; };
        let iTotal = head.findIndex((h) => /^(grand\s*)?total(\s*(faktur|bayar|penjualan|tagihan|transaksi))?$/.test(h));
        if (iTotal < 0) iTotal = head.findIndex((h) => /total|tagihan|grand/.test(h) && !/qty|item|jumlah|hpp|laba|diskon|ppn|biaya|ongkir|potongan|modal/.test(h));
        return {
            iTipe: kol(/^tipe\s*penjualan$/),
            iOutlet: kol(/^outlet(?:\s+penjual)?$/),
            iDiperbarui: kol(/^diperba(?:ha)?rui\s+tanggal$/),
            iDibuat: kol(/^dibuat\s+tanggal$/),
            iFaktur: kol(/^no\.?\s*faktur$/),
            iBatalOleh: kol(/^dibatalkan\s+oleh$/),
            iLog: kol(/^log\s+pembatalan$/),
            iTotal: iTotal < 0 ? -1 : iTotal + geser
        };
    }

    // satu baris sel -> {key, tipe, outlet, upd, dibuat, rp, batal}; upd/dibuat = {tgl:'dd-mm-yyyy', jam} atau null bila tidak terbaca
    function objekBaris(c, k) {
        const waktu = (i) => { const m = i >= 0 ? RE_WAKTU.exec(c[i] || '') : null; return m && parseInt(m[4], 10) <= 23 ? { tgl: m[1] + '-' + m[2] + '-' + m[3], jam: parseInt(m[4], 10) } : null; };
        const isi = (i) => i >= 0 && /[^\s\-–—]/.test(c[i] || '');   // sel berisi (bukan kosong / "-")
        return {
            key: (k.iFaktur >= 0 && c[k.iFaktur]) || c.join('|').slice(0, 200),
            tipe: c[k.iTipe] || '',
            outlet: k.iOutlet >= 0 ? (c[k.iOutlet] || '') : (c.find((x) => RE_OUTLET.test(x)) || ''),
            upd: waktu(k.iDiperbarui),    // jam dihitung dari Diperbaharui Tanggal
            dibuat: waktu(k.iDibuat),     // cadangan bila Diperbaharui Tanggal kosong / bukan hari ini
            rp: k.iTotal >= 0 ? parseUang(c[k.iTotal]) : null,
            batal: isi(k.iBatalOleh) || isi(k.iLog) || /-VOID-/i.test(c.join(' '))
        };
    }

    // tautan "Selanjutnya" di dokumen (halaman hasil fetch atau halaman asli di iframe): {el, href}; href null bila tautannya "#"/javascript
    const RE_NEXT_KATA = /^(?:selanjutnya|berikutnya|next)(?:\s*[›»→>]+)?$/i;
    // hal = nomor halaman yang sedang dibaca: tautan ke halaman hal+1 (href ...page=hal+1, atau angka hal+1 di penomoran) juga dihitung
    function cariNext(doc, base, hal) {
        let terbaik = null, skor = 0;
        const berikut = String((hal || 1) + 1);
        doc.querySelectorAll('a').forEach((a) => {
            const t = rapih(a.textContent);
            const mHal = /[?&]page=(\d+)(?:\D|$)/.exec(a.getAttribute('href') || '');
            let s = 0;
            if ((a.getAttribute('rel') || '').toLowerCase() === 'next') s = 5;
            else if (RE_NEXT_KATA.test(t)) s = 4;
            else if (mHal && mHal[1] === berikut && !/^(last|terakhir|akhir)/i.test(t)) s = 3.5;
            else if (t === berikut && a.closest('.pagination, [class*="pagin"], .pager, nav, [class*="paging"]')) s = 3.2;
            else if (t === '›') s = 3;
            else if (t === '→' || t === '>') s = 2;
            else if (t === '»') s = 1;
            if (!s) return;
            if (s < 4 && !a.closest('.pagination, [class*="pagin"], .pager, nav')) return;   // simbol saja hanya dihitung di blok penomoran halaman
            if (a.hasAttribute('disabled') || a.getAttribute('aria-disabled') === 'true' || a.closest('.disabled, [disabled]')) return;
            if (s > skor) { skor = s; terbaik = a; }
        });
        if (!terbaik) return null;
        const h = (terbaik.getAttribute('href') || '').trim();
        let href = null;
        if (h && h !== '#' && !/^javascript/i.test(h)) { try { href = new URL(h, base).href; } catch (e) { href = null; } }
        return { el: terbaik, href: href };
    }
    // "Menampilkan data 1 - 50 dari total data 804" -> 804 (null bila tidak ada)
    // Dibaca dari elemen pemilik teks itu saja: textContent seluruh halaman menempelkan angka penomoran halaman di belakangnya
    // ("...total data 300" + "1 2 3" -> "3001...") sehingga total jadi salah.
    function totalData(doc) {
        if (!doc.body) return null;
        const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
            if (!/menampilkan/i.test(n.nodeValue)) continue;
            const t = rapih(n.parentElement ? n.parentElement.textContent : n.nodeValue);
            const m = /menampilkan[^0-9]{0,30}[\d.,]+\s*(?:-|s\/d|sampai)\s*[\d.,]+\s*dari\s*(?:total\s*(?:data)?\s*)?([\d.,]+)/i.exec(t);
            if (m) return parseInt(m[1].replace(/[.,]/g, ''), 10);
        }
        return null;
    }

    // dokumen halaman Data Penjualan -> {jumlah, rows, adaTotal, next, total}
    function bacaDokumen(doc, base, hal) {
        const t = bacaTabel(doc);
        if (!t) throw galat('tabel Data Penjualan tidak terbaca (sesi habis?)');
        let rows = [], adaTotal = false;
        if (t.baris.length) {
            const g = cariGeser(t.head, t.baris);
            if (g === null) throw galat('kolom Tipe Penjualan tidak terbaca');
            const k = petaKolom(t.head, g);
            rows = t.baris.map((c) => objekBaris(c, k));
            adaTotal = k.iTotal >= 0;
        }
        return { jumlah: t.baris.length, rows: rows, adaTotal: adaTotal, next: cariNext(doc, base, hal), total: totalData(doc) };
    }

    // ---------- pengumpul: menjumlah nota per tipe x outlet x jam, hanya yang bertanggal hari ini ----------
    function buatPengumpul(hariIni) {
        const baru = { tgl: hariIni, data: {}, tipes: [], outlets: [], adaTotal: false, baris: 0, hal: 0, t: 0, error: '', selesai: false, sumber: '',
            diag: { hariIni: 0, batal: 0, bukanHariIni: 0, tanpaWaktu: 0, contoh: '' } };
        const dilihat = new Set(), tipeSemua = new Set(), outletSemua = new Set();
        const urut = (a, b) => a.localeCompare(b, 'id', { numeric: true });
        let kolomTotal = false, rpTerbaca = 0, terhitung = 0, kosong = 0;
        return {
            baru: baru,
            get terhitung() { return terhitung; },
            // 2 halaman beruntun tanpa nota hari ini: daftar tidak tersaring dan sisanya lebih lama
            get habis() { return kosong >= 2; },
            // satu halaman (hasil bacaDokumen) -> {barisBaru, adaHariIni}
            tambah: function (h) {
                baru.hal++;
                if (h.adaTotal) kolomTotal = true;
                let barisBaru = 0, adaHariIni = false;
                h.rows.forEach((r) => {
                    if (dilihat.has(r.key)) return;   // baris yang sama terbaca lagi (halaman bergeser / server mengulang halaman)
                    dilihat.add(r.key);
                    barisBaru++;
                    if (!r.upd && !r.dibuat) { baru.diag.tanpaWaktu++; return; }
                    // "berdasarkan tanggal hari ini": jam dari Diperbaharui Tanggal; kalau itu bukan hari ini, dari Dibuat Tanggal
                    const w = r.upd && r.upd.tgl === hariIni ? r.upd : (r.dibuat && r.dibuat.tgl === hariIni ? r.dibuat : null);
                    if (!w) { baru.diag.bukanHariIni++; if (!baru.diag.contoh) baru.diag.contoh = (r.upd || r.dibuat).tgl; return; }
                    baru.diag.hariIni++;
                    adaHariIni = true;
                    const tp = r.tipe || TANPA_TIPE;
                    tipeSemua.add(tp);                       // daftar pilihan dari semua nota hari ini (juga yang dibatalkan),
                    if (r.outlet) outletSemua.add(r.outlet); // supaya tidak berubah-ubah mengikuti pilihan tipe
                    if (r.batal) { baru.diag.batal++; return; }
                    terhitung++;
                    const perTipe = baru.data[tp] || (baru.data[tp] = {});
                    const perOutlet = perTipe[r.outlet] || (perTipe[r.outlet] = {});
                    const sel = perOutlet[w.jam] || (perOutlet[w.jam] = [0, 0]);
                    sel[0]++;
                    if (r.rp !== null) { sel[1] += r.rp; rpTerbaca++; }
                });
                baru.baris += barisBaru;
                kosong = adaHariIni ? 0 : kosong + 1;
                // kolom Total ada, dan (kalau sudah ada nota) angkanya terbaca; tanpa itu hanya jumlah nota yang ditampilkan
                baru.adaTotal = kolomTotal && (rpTerbaca > 0 || terhitung === 0);
                baru.tipes = Array.from(tipeSemua).sort(urut);
                baru.outlets = Array.from(outletSemua).sort(urut);
                return { barisBaru: barisBaru, adaHariIni: adaHariIni };
            }
        };
    }

    // ---------- form Pencarian Data Penjualan: Periode = hari ini, filter lain dikosongkan ----------
    // Dasar Filter Periode = Tanggal Transaksi (seperti di halaman); filter lain (Tipe, Outlet, dst) dikosongkan karena Erzap bisa
    // mengingat pencarian terakhir, dan pilihan Tipe / Outlet di grafik disaring di browser, bukan di server.
    function tglFormatSama(contoh, d) {
        const dd = dua(d.getDate()), mm = dua(d.getMonth() + 1), yy = d.getFullYear();
        if (/^\d{4}-\d{2}-\d{2}$/.test(contoh)) return yy + '-' + mm + '-' + dd;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(contoh)) return dd + '/' + mm + '/' + yy;
        return dd + '-' + mm + '-' + yy;
    }
    // teks label sebuah radio: <label for=id>, <label> pembungkus, atau teks setelah radio sampai input berikutnya
    function labelRadio(r) {
        const doc = r.ownerDocument;
        const lbl = (r.id && doc.querySelector('label[for="' + r.id + '"]')) || r.closest('label');
        if (lbl) return rapih(lbl.textContent);
        let t = '', n = r.nextSibling;
        while (n && !(n.nodeType === 1 && n.matches('input')) && t.length < 60) { t += n.textContent || ''; n = n.nextSibling; }
        return rapih(t);
    }
    const cariForm = (doc) => Array.from(doc.querySelectorAll('form')).find((f) => f.querySelector('[name^="pencarian["]')) || null;
    function setNilaiForm(el, nilai) {
        el.value = nilai;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // form di dokumen hasil fetch -> pasangan nama=nilai untuk dikirim
    function serialisasi(form, hariIni) {
        const p = new URLSearchParams();
        const radio = {};
        form.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => {
            const nama = el.name, tipe = (el.type || '').toLowerCase();
            if (el.disabled || /^(submit|button|image|reset|file)$/.test(tipe)) return;
            if (tipe === 'radio') { (radio[nama] = radio[nama] || []).push(el); return; }
            // checkbox Termin dicentang oleh skrip halaman saat siap ($('.check_box_idtermin').prop('checked', true)), di HTML mentah
            // masih kosong: tanpa ini pencarian terkirim "tanpa termin" dan hasilnya kosong
            if (tipe === 'checkbox') { if (el.checked || el.classList.contains('check_box_idtermin')) p.append(nama, el.value || 'on'); return; }
            if (/^pencarian\[/.test(nama)) {
                p.append(nama, RE_DARI.test(nama) || RE_SAMPAI.test(nama) ? tglFormatSama(rapih(el.value), hariIni) : '');
                return;
            }
            p.append(nama, el.tagName === 'SELECT' ? ((el.querySelector('option[selected]') || el.options[0] || {}).value || '') : el.value);   // token dll apa adanya
        });
        Object.keys(radio).forEach((nama) => {
            const r = radio[nama];
            const pilih = (/^pencarian\[/.test(nama) && r.find((x) => /tanggal\s*transaksi/i.test(labelRadio(x)))) || r.find((x) => x.checked);
            if (pilih) p.append(nama, pilih.value);
        });
        return p;
    }
    function kirimForm(form, params) {
        const aksi = new URL(form.getAttribute('action') || LIST_URL, location.origin);
        // tanpa header Accept/X-Requested-With (seperti ppob.js): form Erzap bersifat data-remote, dengan header ajax server bisa membalas skrip, bukan HTML
        const opsi = { credentials: 'same-origin', cache: 'no-store' };
        if ((form.getAttribute('method') || 'get').toLowerCase() === 'post') return fetch(aksi.href, Object.assign({ method: 'POST', body: params }, opsi));
        params.forEach((v, k) => aksi.searchParams.append(k, v));
        return fetch(aksi.href, opsi);
    }

    // form di halaman asli (iframe): isi seperti manual
    function isiFormLive(form, hariIni) {
        form.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => {
            const nama = el.name, tipe = (el.type || '').toLowerCase();
            if (el.disabled || /^(submit|button|image|reset|file|checkbox|radio)$/.test(tipe) || !/^pencarian\[/.test(nama)) return;
            if (RE_DARI.test(nama) || RE_SAMPAI.test(nama)) { setNilaiForm(el, tglFormatSama(rapih(el.value), hariIni)); return; }
            if (el.tagName === 'SELECT') {
                const kosong = Array.from(el.options).findIndex((o) => o.value === '');
                const i = kosong >= 0 ? kosong : 0;
                if (el.selectedIndex !== i) { el.selectedIndex = i; el.dispatchEvent(new Event('change', { bubbles: true })); }
                return;
            }
            if (el.value) setNilaiForm(el, '');   // termasuk hidden id milik kolom autocomplete (Outlet, Pelanggan)
        });
        const rTrx = Array.from(form.querySelectorAll('input[type="radio"]')).find((r) => /tanggal\s*transaksi/i.test(labelRadio(r)));
        if (rTrx && !rTrx.checked) rTrx.click();
    }

    // ---------- jalur 1 (cepat): kirim form lewat fetch (cara ppob.js), halaman berikutnya lewat tautan "Selanjutnya" ----------
    async function jalurFetch(kol, hariIni, tampil) {
        const res0 = await fetch(LIST_URL, { credentials: 'same-origin', cache: 'no-store' });
        if (!res0.ok) throw galat('HTTP ' + res0.status + ' saat membuka Data Penjualan', false, true);
        const doc0 = new DOMParser().parseFromString(await res0.text(), 'text/html');
        if (doc0.querySelector('input[type="password"]')) throw galat('sesi Erzap habis (halaman login), buka ulang / login lagi', false, true);
        const form = cariForm(doc0);
        if (!form) throw galat('form Pencarian Data Penjualan tidak ditemukan');
        let res = await kirimForm(form, serialisasi(form, new Date()));
        if (!res.ok) throw galat('HTTP ' + res.status + ' saat mencari Data Penjualan');
        let h = bacaDokumen(new DOMParser().parseFromString(await res.text(), 'text/html'), res.url);
        if (!h.jumlah) throw galat('hasil pencarian tanpa baris di HTML mentah (tabel diisi lewat skrip?)', true);
        kol.tambah(h);
        if (!kol.baru.diag.hariIni) throw galat('Periode hari ini tidak berlaku pada hasil pencarian (' + h.jumlah + ' baris bukan hari ini)', true);
        tampil(h.total ? kol.baru.baris + '/' + h.total + ' baris' : '');
        const sudah = new Set([res.url]);
        const ukuran = h.jumlah;
        let n = 1, next = h.next, jumlahTerakhir = h.jumlah;
        // Selama ada tautan halaman berikutnya, terus dibaca (angka "total data" TIDAK dipakai sebagai syarat berhenti: kalau
        // salah terbaca, pembacaan berhenti di halaman 1 dan yang tampil hanya jam terakhir). Tanpa tautan yang dikenali tapi
        // tampaknya masih ada halaman: coba ?page=N; kalau itu pun gagal, serahkan ke jalur 2.
        while (n < HAL_MAKS) {
            if (kol.habis) { kol.baru.diag.berhenti = 'baris berikutnya bukan hari ini'; break; }
            let url = next && next.href;
            const tebak = !url;
            if (tebak) {
                if (next) throw galat('tautan halaman berikutnya hanya lewat skrip');
                if (!masihAda(kol, h.total, ukuran, jumlahTerakhir)) break;
                url = urlHalaman(res.url, n + 1);
            }
            if (!url || sudah.has(url)) break;
            sudah.add(url);
            res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
            // tidak fatal: tautan halaman bisa saja hanya dilayani untuk permintaan ajax; halaman asli (iframe) bisa tetap berhasil
            if (!res.ok) throw galat((tebak ? 'tautan halaman ' + (n + 1) + ' tidak ditemukan, ' : '') + 'HTTP ' + res.status + ' (halaman ' + (n + 1) + ')');
            const hp = bacaDokumen(new DOMParser().parseFromString(await res.text(), 'text/html'), res.url, n + 1);
            if (!hp.jumlah) {
                if (tebak) break;   // ?page=N tebakan kosong: memang sudah halaman terakhir
                throw galat('halaman ' + (n + 1) + ' tanpa baris');
            }
            const t = kol.tambah(hp);
            n++;
            if (!t.barisBaru) throw galat('halaman ' + n + ' mengulang baris sebelumnya (tautan halaman tidak membawa hasil pencarian)');
            tampil(h.total ? kol.baru.baris + '/' + h.total + ' baris' : '');
            next = hp.next;
            jumlahTerakhir = hp.jumlah;
        }
    }

    // URL halaman ke-p dari URL halaman sekarang (?page=p)
    const urlHalaman = (u, p) => { try { const x = new URL(u, location.origin); x.searchParams.set('page', p); return x.href; } catch (e) { return null; } };
    // masih ada halaman berikutnya? "total data" (kalau masuk akal) belum tercapai, atau halaman terakhir yang dibaca sepenuh halaman 1
    function masihAda(kol, total, ukuran, jumlahTerakhir) {
        if (total && total > ukuran) return kol.baru.baris < total;
        return ukuran >= 10 && jumlahTerakhir >= ukuran;
    }

    // ---------- jalur 2 (cadangan): halaman Data Penjualan sungguhan di iframe tersembunyi, persis seperti manual ----------
    async function jalurIframe(kol, hariIni, tampil) {
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:1400px;border:0;opacity:0;pointer-events:none';
        fr.setAttribute('aria-hidden', 'true');
        document.body.appendChild(fr);
        // tunggu isi tabel berganti (submit/klik = dokumen baru, atau tabel diganti lewat ajax)
        const tungguBerganti = async (docAwal, sidikAwal, ms) => {
            await tungguDi(() => {
                const d = fr.contentDocument;
                if (!d || d.readyState !== 'complete') return false;
                return (d !== docAwal && bacaTabel(d)) || (d === docAwal && sidikTabel(d) !== sidikAwal);
            }, ms, '').catch(() => {});
            await tidur(500);
        };
        try {
            fr.src = LIST_URL;
            const form = await tungguDi(() => { const d = fr.contentDocument; return d && d.readyState === 'complete' && cariForm(d); }, 40000, 'halaman Data Penjualan tidak termuat');
            isiFormLive(form, new Date());
            const docAwal = fr.contentDocument, sidikAwal = sidikTabel(docAwal);
            // tombol Filter halaman asli = #bt_filter_penjualan (memvalidasi Periode lalu men-submit form ajax-nya); cadangan: tombol berteks Cari / Filter
            const tombol = form.querySelector('#bt_filter_penjualan') || docAwal.getElementById('bt_filter_penjualan') ||
                           Array.from(form.querySelectorAll('button, input[type="submit"], input[type="button"], a')).find((b) => /^(cari|filter|search)/i.test(rapih(b.textContent) || rapih(b.value || ''))) ||
                           form.querySelector('button[type="submit"], input[type="submit"]');
            if (tombol) tombol.click(); else if (form.requestSubmit) form.requestSubmit(); else form.submit();
            await tungguBerganti(docAwal, sidikAwal, 12000);
            // hasil ajax bisa lambat dan tabel awal bisa masih kosong: tunggu sampai ada baris sebelum menyimpulkan "kosong"
            await tungguDi(() => { const t = bacaTabel(fr.contentDocument); return t && t.baris.length > 0; }, 15000, '').catch(() => {});
            let ukuran = 0;
            for (let n = 1; n <= HAL_MAKS; n++) {
                const d = fr.contentDocument;
                const h = bacaDokumen(d, d.location.href, n);
                const t = kol.tambah(h);
                if (n === 1) ukuran = h.jumlah;
                if (n > 1 && !h.jumlah) break;   // halaman tebakan (?page=N) kosong: sudah halaman terakhir
                tampil(h.total ? kol.baru.baris + '/' + h.total + ' baris' : '');
                if (n > 1 && !t.barisBaru) { kol.baru.diag.berhenti = 'halaman ' + n + ' mengulang baris sebelumnya'; break; }
                if (kol.habis) { kol.baru.diag.berhenti = 'baris berikutnya bukan hari ini'; break; }
                if (!h.next && !masihAda(kol, h.total, ukuran, h.jumlah)) break;   // halaman terakhir
                const sidik = sidikTabel(d);
                if (h.next) h.next.el.click();
                else fr.src = urlHalaman(d.location.href, n + 1);   // tautan tidak dikenali tapi tampaknya masih ada halaman: buka ?page=N
                await tungguBerganti(d, sidik, 20000);
                if (fr.contentDocument === d && sidikTabel(d) === sidik) {   // tidak berpindah halaman
                    kol.baru.diag.berhenti = 'tidak bisa pindah ke halaman ' + (n + 1) + (h.next ? '' : ' (tautan halaman tidak dikenali)');
                    break;
                }
            }
        } finally {
            fr.remove();
        }
    }

    // data {tipe:{outlet:{jam:[n,rp]}}} lama + baru -> per sel dipakai yang notanya lebih banyak (salinan baru, data asli tidak diubah)
    function gabungMaks(a, b) {
        const out = JSON.parse(JSON.stringify(a || {}));
        Object.keys(b || {}).forEach((t) => {
            const perTipe = out[t] || (out[t] = {});
            Object.keys(b[t]).forEach((o) => {
                const perOutlet = perTipe[o] || (perTipe[o] = {});
                Object.keys(b[t][o]).forEach((h) => {
                    const x = b[t][o][h], y = perOutlet[h];
                    if (!y || x[0] >= y[0]) perOutlet[h] = x.slice();
                });
            });
        });
        return out;
    }
    const gabungDaftar = (a, b) => Array.from(new Set((a || []).concat(b || []))).sort((x, y) => x.localeCompare(y, 'id', { numeric: true }));

    // ---------- pemindaian: seluruh halaman hasil pencarian hari ini ----------
    let jalan = false, progres = '';
    let cobaTerakhir = 0, cobaGagal = false;   // jadwal muat ulang: tidak bergantung pada hasil yang sedang tampil
    let jalurIframeDulu = false;               // jalur cepat gagal sedangkan halaman asli berhasil: berikutnya langsung halaman asli
    let cekAsliTerakhir = 0;                   // waktu terakhir jalur 2 dicoba karena hasil kosong (jangan diulang tiap muat ulang)
    async function pindai() {
        if (jalan) return;
        jalan = true;
        cobaTerakhir = Date.now();
        progres = 'menyiapkan pencarian ...';
        gambar();
        const hariIni = tglHariIni();
        const sementara = !hasil || !hasil.selesai;   // belum ada hasil lengkap: tampilkan hasil sementara yang bertambah
        // Sudah ada hasil lengkap (muat ulang / cache): tiap halaman yang terbaca langsung masuk ke grafik, digabung dengan hasil
        // lama per sel tipe x outlet x jam (dipakai yang notanya lebih banyak). Daftar urut terbaru dulu, jadi jam-jam terbaru
        // langsung terisi data baru sedangkan jam lama tetap dari hasil lama -- grafik tidak turun dulu lalu naik lagi.
        // Setelah semua halaman terbaca, diganti penuh dengan hasil baru (nota yang dibatalkan / berpindah jam ikut terkoreksi).
        const lama = !sementara && hasil.tgl === hariIni ? hasil : null;
        let kol = buatPengumpul(hariIni);
        const t0 = Date.now();
        const tampil = (info) => {
            progres = 'memuat halaman ' + (kol.baru.hal + 1) + (info ? ' (' + info + ')' : '') + ' · ' + kol.terhitung + ' nota baru terbaca';
            if (sementara) hasil = kol.baru;
            else if (lama) hasil = Object.assign({}, lama, {
                data: gabungMaks(lama.data, kol.baru.data),
                tipes: gabungDaftar(lama.tipes, kol.baru.tipes),
                outlets: gabungDaftar(lama.outlets, kol.baru.outlets),
                adaTotal: lama.adaTotal || kol.baru.adaTotal
            });
            gambar();
        };
        try {
            let sumber = '', galatCepat = null;
            for (const j of (jalurIframeDulu ? ['iframe'] : ['fetch', 'iframe'])) {
                kol = buatPengumpul(hariIni);
                try {
                    await (j === 'fetch' ? jalurFetch : jalurIframe)(kol, hariIni, tampil);
                    sumber = j;
                    break;
                } catch (e) {
                    if (j === 'iframe' || e.fatal) throw e;
                    galatCepat = e;
                    console.warn('[grafik.js] jalur cepat gagal: ' + e.message + ' -> mencoba halaman asli');
                    // memang belum ada nota hari ini + halaman asli baru saja dicek: terima hasil kosong, jangan buka halaman asli lagi
                    if (e.kosong && Date.now() - cekAsliTerakhir < CEK_ASLI_JEDA_MS) { sumber = 'fetch'; break; }
                    if (e.kosong) cekAsliTerakhir = Date.now();
                }
            }
            const b = kol.baru;
            if (galatCepat && sumber === 'iframe' && b.diag.hariIni > 0) jalurIframeDulu = true;
            if (b.diag.tanpaWaktu > 0 && b.diag.tanpaWaktu === b.baris) throw new Error('kolom Diperbaharui / Dibuat Tanggal tidak terbaca di ' + b.diag.tanpaWaktu + ' baris');
            b.sumber = sumber;
            b.selesai = true;
            b.t = Date.now();
            hasil = b;
            cobaGagal = false;
            simpanCache();
            console.log('[grafik.js] ' + kol.terhitung + ' nota hari ini (' + b.diag.batal + ' batal dilewati; ' + b.tipes.length + ' tipe, ' + b.outlets.length + ' outlet), ' + b.baris + ' baris dari ' + b.hal + ' halaman, sumber ' + sumber + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' dtk');
        } catch (err) {
            const b = kol.baru;
            b.error = err.message;
            b.t = Date.now();
            cobaGagal = true;
            if (sementara) hasil = b;
            else {   // ada hasil lengkap sebelumnya: dipertahankan (bukan gabungan setengah jalan), galat hanya dicatat
                if (lama) hasil = lama;
                hasil.galat = err.message;
            }
            console.warn('[grafik.js] ' + err.message);
        } finally {
            jalan = false;
            progres = '';
            gambar();
        }
    }

    // ---------- pencarian elemen di halaman ----------
    // elemen (terlihat) pemilik teks pertama yang cocok `pola`; kotak grafik sendiri dilewati
    function cariTeks(pola) {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
            if (!pola.test(n.nodeValue)) continue;
            const e = n.parentElement;
            if (!e || e.closest('[data-aistim-grafik], script, style, noscript')) continue;
            if (e.offsetParent === null && getComputedStyle(e).position !== 'fixed') continue;   // tersembunyi
            return e;
        }
        return null;
    }

    // ---------- gaya ----------
    const gaya = document.createElement('style');
    gaya.textContent =
        '@keyframes aistim_grafik_putar{to{transform:rotate(360deg)}}' +
        '.aistim_grafik .ag_putar{display:inline-block;margin-right:5px;line-height:1;animation:aistim_grafik_putar .8s linear infinite}' +
        '.aistim_grafik{--surface:#fff;--ink:#0b0b0b;--ink2:#52514e;--muted:#767570;' +
        'box-sizing:border-box;position:relative;margin:0 0 16px;padding:14px 18px 10px;background:var(--surface);color:var(--ink);' +
        'border:1px solid #dcdfe4;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.06);font-family:inherit;text-decoration:none}' +
        '.aistim_grafik *{box-sizing:border-box;text-decoration:none}' +
        '.aistim_grafik .ag_kepala{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px}' +
        '.aistim_grafik .ag_judul{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:17px;color:#555}.aistim_grafik .ag_judul b{color:var(--ink)}' +
        '.aistim_grafik .ag_pilih{margin:0;padding:2px 6px;border:1px solid #cfd4dc;border-radius:4px;background:#fff;color:var(--ink);font:inherit;font-size:14px;line-height:1.4;max-width:min(260px,100%);cursor:pointer}' +
        '.aistim_grafik .ag_pilih:disabled{opacity:.6;cursor:default}.aistim_grafik .ag_pilih:focus-visible{outline:2px solid #0d6efd;outline-offset:1px}' +
        '.aistim_grafik .ag_kontrol{display:flex;flex-wrap:wrap;gap:8px}' +
        '.aistim_grafik .ag_seg{display:inline-flex;border:1px solid #0d6efd;border-radius:4px;overflow:hidden}' +
        '.aistim_grafik .ag_seg button{margin:0;padding:3px 12px;border:0;background:#fff;color:#0d6efd;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}' +
        '.aistim_grafik .ag_seg button+button{border-left:1px solid #0d6efd}' +
        '.aistim_grafik .ag_seg button[aria-pressed="true"]{background:#0d6efd;color:#fff}' +
        '.aistim_grafik .ag_seg button:disabled{opacity:.45;cursor:not-allowed}' +
        '.aistim_grafik .ag_seg button:focus-visible,.aistim_grafik .ag_segar:focus-visible{outline:2px solid #0d6efd;outline-offset:-2px}' +
        '.aistim_grafik .ag_segar{margin:0;padding:3px 12px;border:1px solid #b6d4fe;border-radius:4px;background:#fff;color:#0d6efd;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}' +
        '.aistim_grafik .ag_segar:disabled{opacity:.6;cursor:default}' +
        '.aistim_grafik .ag_ringkas{margin:6px 0 0;font-size:13px;color:var(--ink2)}.aistim_grafik .ag_ringkas b{color:var(--ink)}' +
        '.aistim_grafik .ag_badan{position:relative;margin-top:6px;transition:opacity .15s}' +
        '.aistim_grafik .ag_badan.memuat{opacity:.55}' +
        '.aistim_grafik .ag_badan svg{display:block;width:100%;overflow:visible}' +
        '.aistim_grafik .ag_badan svg text{font-family:inherit}' +
        '.aistim_grafik .ag_kosong{display:flex;align-items:center;justify-content:center;height:' + TINGGI_PLOT + 'px;color:var(--muted);font-size:14px;text-align:center;padding:0 16px}' +
        '.aistim_grafik .ag_kosong.galat{color:#b02a37}' +
        '.aistim_grafik .ag_tabel{width:100%;border-collapse:collapse;font-size:12px}' +
        '.aistim_grafik .ag_tabel th{position:sticky;top:0;padding:6px 8px;border-bottom:1px solid #cfd4dc;background:#eef0f4;text-align:left;white-space:nowrap}' +
        '.aistim_grafik .ag_tabel td{padding:5px 8px;border-bottom:1px solid #eceff3}' +
        '.aistim_grafik .ag_tabel .kanan{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}' +
        '.aistim_grafik .ag_tabel .kosong{color:var(--muted)}' +
        '.aistim_grafik .ag_tabel tfoot td{position:sticky;bottom:0;background:#fff;font-weight:700;border-top:1px solid #cfd4dc;border-bottom:0}' +
        '.aistim_grafik .ag_tip{position:absolute;z-index:5;display:none;min-width:190px;padding:8px 10px;background:#fff;color:var(--ink);' +
        'border:1px solid #dcdfe4;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.14);font-size:12px;line-height:1.45;pointer-events:none}' +
        '.aistim_grafik .ag_tip .tgl{color:var(--ink2);margin-bottom:4px}' +
        '.aistim_grafik .ag_tip .baris{display:flex;align-items:center;gap:8px;white-space:nowrap}' +
        '.aistim_grafik .ag_tip .nilai{font-weight:700;font-size:13px}.aistim_grafik .ag_tip .nama{color:var(--ink2)}' +
        '.aistim_grafik .ag_tip .kunci{flex:none;width:12px;height:0;border-top:3px solid}' +
        '.aistim_grafik .ag_catatan{margin:6px 0 0;font-size:12px;color:var(--muted)}';
    document.head.appendChild(gaya);

    // ---------- pembangun elemen ----------
    function el(tag, atribut, anak) {
        const e = document.createElement(tag);
        Object.keys(atribut || {}).forEach((k) => {
            if (k === 'teks') e.textContent = atribut[k];
            else e.setAttribute(k, atribut[k]);
        });
        (anak || []).forEach((a) => e.appendChild(a));
        return e;
    }
    function sv(tag, atribut, anak) {
        const e = document.createElementNS(SVGNS, tag);
        Object.keys(atribut || {}).forEach((k) => {
            if (k === 'teks') e.textContent = atribut[k];
            else e.setAttribute(k, atribut[k]);
        });
        (anak || []).forEach((a) => e.appendChild(a));
        return e;
    }
    const ikonPutar = () => el('span', { 'class': 'ag_putar', teks: '↻' });

    // ---------- kotak grafik ----------
    let kartu = null, ringkasEl = null, badan = null, catatanEl = null, tipEl = null, tombolSegar = null, pilihTipe = null, pilihOutlet = null;
    let lebarTerakhir = 0;   // lebar badan saat terakhir digambar (pembanding untuk ResizeObserver)
    const tombolMetrik = {}, tombolTampil = {};

    function bangunKartu() {
        const k = el('div', { 'class': 'aistim_grafik', 'data-aistim-grafik': '1' });
        const kepala = el('div', { 'class': 'ag_kepala' });
        pilihTipe = el('select', { 'class': 'ag_pilih', 'aria-label': 'Tipe Penjualan', title: 'Tipe Penjualan' });
        pilihOutlet = el('select', { 'class': 'ag_pilih', 'aria-label': 'Outlet', title: 'Outlet' });
        pilihTipe.addEventListener('change', () => { pref.tipe = pilihTipe.value; simpanPref(); gambar(); });
        pilihOutlet.addEventListener('change', () => { pref.outlet = pilihOutlet.value; simpanPref(); gambar(); });
        kepala.appendChild(el('div', { 'class': 'ag_judul' }, [el('b', { teks: 'Penjualan per Jam' }), document.createTextNode('|'), pilihTipe, pilihOutlet]));

        const segMetrik = el('div', { 'class': 'ag_seg', role: 'group', 'aria-label': 'Ukuran' });
        [['rp', 'Rupiah'], ['nota', 'Jumlah nota']].forEach((t) => {
            const b = el('button', { type: 'button', teks: t[1] });
            b.addEventListener('click', () => { pref.metrik = t[0]; simpanPref(); gambar(); });
            tombolMetrik[t[0]] = b;
            segMetrik.appendChild(b);
        });
        const segTampil = el('div', { 'class': 'ag_seg', role: 'group', 'aria-label': 'Tampilan' });
        [['grafik', 'Grafik'], ['tabel', 'Tabel']].forEach((t) => {
            const b = el('button', { type: 'button', teks: t[1] });
            b.addEventListener('click', () => { pref.tampil = t[0]; simpanPref(); gambar(); });
            tombolTampil[t[0]] = b;
            segTampil.appendChild(b);
        });
        tombolSegar = el('button', { type: 'button', 'class': 'ag_segar', title: 'Baca ulang Data Penjualan' });
        tombolSegar.addEventListener('click', () => pindai());
        kepala.appendChild(el('div', { 'class': 'ag_kontrol' }, [segMetrik, segTampil, tombolSegar]));
        k.appendChild(kepala);

        ringkasEl = el('div', { 'class': 'ag_ringkas' });
        k.appendChild(ringkasEl);
        badan = el('div', { 'class': 'ag_badan' });
        tipEl = el('div', { 'class': 'ag_tip', role: 'status' });
        badan.appendChild(tipEl);
        k.appendChild(badan);
        catatanEl = el('div', { 'class': 'ag_catatan' });
        k.appendChild(catatanEl);

        // lebar berubah (jendela / sidebar): gambar ulang supaya teks tidak ikut mengecil
        let menunggu = false;
        const ubahUkuran = () => {
            if (menunggu) return;
            menunggu = true;
            requestAnimationFrame(() => {
                menunggu = false;
                const w = badan.clientWidth;
                if (w && Math.abs(w - lebarTerakhir) > 1) gambar();
            });
        };
        if (window.ResizeObserver) new ResizeObserver(ubahUkuran).observe(badan);
        else window.addEventListener('resize', ubahUkuran);
        kartu = k;
        return k;
    }

    // skala sumbu dengan langkah 1-2-2,5-5
    function skala(maks, bulat) {
        if (!(maks > 0)) return { atas: 1, langkah: 1 };
        if (bulat && maks < 20) { const l = Math.ceil(maks / 4); return { atas: l * 4, langkah: l }; }   // jumlah nota kecil: tick bilangan bulat
        const kasar = maks / 4, p = Math.pow(10, Math.floor(Math.log10(kasar))), f = kasar / p;
        const langkah = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
        return { atas: Math.max(Math.ceil(maks / langkah), 1) * langkah, langkah: langkah };
    }

    // ---------- pilihan tipe & outlet; angka yang tampil = bagian data yang cocok ----------
    const labelTipe = (t) => t.replace(/^\d+\.\s*/, '');   // "1. Offline / Instore" -> "Offline / Instore"
    function tipeAktif(d) {
        if (pref.tipe === '*') return '*';
        if (pref.tipe && d.tipes.indexOf(pref.tipe) >= 0) return pref.tipe;
        return d.tipes.find((t) => TIPE_BAWAAN.test(t)) || '*';   // bawaan Offline; tidak ada nota offline: semua tipe
    }
    const outletAktif = (d) => (pref.outlet && d.outlets.indexOf(pref.outlet) >= 0 ? pref.outlet : '');

    // hasil pemindaian -> salinan dengan jam:[{n,rp}] x24 hasil saringan pilihan sekarang (+ label untuk teks)
    function lihat(d) {
        const tp = tipeAktif(d), ot = outletAktif(d);
        const jam = Array.from({ length: 24 }, () => ({ n: 0, rp: 0 }));
        Object.keys(d.data).forEach((t) => {
            if (tp !== '*' && t !== tp) return;
            Object.keys(d.data[t]).forEach((o) => {
                if (ot && o !== ot) return;
                const per = d.data[t][o];
                Object.keys(per).forEach((h) => { jam[h].n += per[h][0]; jam[h].rp += per[h][1]; });
            });
        });
        return Object.assign({}, d, { jam: jam, tipeAktif: tp, outletAktif: ot,
            labelTipe: tp === '*' ? 'semua tipe' : labelTipe(tp), labelOutlet: ot || 'semua outlet' });
    }

    // <option> hanya dibangun ulang kalau isinya berubah: dropdown yang sedang dibuka tidak boleh menutup sendiri saat grafik digambar ulang
    function isiPilihan(sel, opsi, nilai, nonaktif) {
        const sidik = opsi.map((o) => o[0] + '\u0001' + o[1]).join('\u0002');
        if (sel.dataset.sidik !== sidik) {
            sel.textContent = '';
            opsi.forEach((o) => sel.appendChild(el('option', { value: o[0], teks: o[1] })));
            sel.dataset.sidik = sidik;
        }
        if (sel.value !== nilai) sel.value = nilai;
        sel.disabled = !!nonaktif;
    }
    function gambarPilihan(d) {
        if (!d || !d.tipes.length) {
            isiPilihan(pilihTipe, [['', jalan || !d ? 'Memuat ...' : 'Tipe: tidak ada data']], '', true);
            pilihOutlet.style.display = 'none';
            return;
        }
        isiPilihan(pilihTipe, [['*', 'Semua tipe']].concat(d.tipes.map((t) => [t, labelTipe(t)])), d.tipeAktif, false);
        pilihOutlet.style.display = d.outlets.length ? '' : 'none';   // tabel tanpa kolom Outlet: pilihan outlet disembunyikan
        isiPilihan(pilihOutlet, [['', 'Semua outlet (' + d.outlets.length + ')']].concat(d.outlets.map((o) => [o, o])), d.outletAktif, false);
    }

    // ---------- gambar ----------
    function gambar() {
        if (!kartu) return;
        const d = hasil ? lihat(hasil) : null;
        gambarPilihan(d);
        const adaRp = !!(d && d.adaTotal);
        const metrik = adaRp || !d || !d.selesai ? pref.metrik : 'nota';   // tanpa kolom Total: hanya jumlah nota
        ['rp', 'nota'].forEach((m) => tombolMetrik[m].setAttribute('aria-pressed', m === metrik ? 'true' : 'false'));
        tombolMetrik.rp.disabled = !!d && d.selesai && !adaRp;
        tombolMetrik.rp.title = tombolMetrik.rp.disabled ? 'Kolom Total tidak ditemukan di tabel Data Penjualan' : '';
        ['grafik', 'tabel'].forEach((t) => tombolTampil[t].setAttribute('aria-pressed', t === pref.tampil ? 'true' : 'false'));
        tombolSegar.textContent = '';
        if (jalan) tombolSegar.appendChild(ikonPutar());
        tombolSegar.appendChild(document.createTextNode(jalan ? 'Memuat ...' : '↻ Muat ulang'));
        tombolSegar.disabled = jalan;
        sembunyiTip();

        Array.from(badan.children).forEach((c) => { if (c !== tipEl) c.remove(); });
        badan.classList.toggle('memuat', jalan && !!d);   // muat ulang: grafik lama tetap tampil, dipudarkan
        if (!d) {
            const m = el('div', { 'class': 'ag_kosong' });
            m.appendChild(ikonPutar());
            m.appendChild(document.createTextNode('Memuat penjualan hari ini dari Data Penjualan ...'));
            badan.appendChild(m);
        } else if (d.error && !d.baris) {
            badan.appendChild(el('div', { 'class': 'ag_kosong galat', teks: 'Gagal memuat Data Penjualan: ' + d.error }));
        } else if (pref.tampil === 'tabel') {
            badan.appendChild(bangunTabel(d));
        } else {
            badan.appendChild(bangunSvg(d, metrik));
        }
        gambarKeterangan(d);
    }

    const total = (d) => d.jam.reduce((a, x) => ({ n: a.n + x.n, rp: a.rp + x.rp }), { n: 0, rp: 0 });

    function gambarKeterangan(d) {
        ringkasEl.textContent = '';
        if (!d) { catatanEl.textContent = progres ? 'Data Penjualan: ' + progres : ''; return; }
        const t = total(d);
        let puncak = -1;
        d.jam.forEach((x, h) => { if (x.n > 0 && (puncak < 0 || (d.adaTotal ? x.rp > d.jam[puncak].rp : x.n > d.jam[puncak].n))) puncak = h; });
        ringkasEl.appendChild(document.createTextNode(tglLengkap(new Date())));
        if (!(d.error && !d.baris)) {   // gagal total: tidak ada angka yang bisa dikatakan
            ringkasEl.appendChild(document.createTextNode(' · '));
            ringkasEl.appendChild(el('b', { teks: t.n.toLocaleString('en-US') + ' nota' }));
            if (d.adaTotal) { ringkasEl.appendChild(document.createTextNode(' · ')); ringkasEl.appendChild(el('b', { teks: fmtRp(t.rp) })); }
            if (puncak >= 0) ringkasEl.appendChild(document.createTextNode(' · puncak jam ' + fmtJam(puncak)));
        }

        const bagian = [];
        if (jalan && progres) bagian.push('Data Penjualan: ' + progres);
        else if (d.galat || d.error) bagian.push('Gagal memperbarui: ' + (d.galat || d.error) + (d.baris ? ' (data yang tampil belum lengkap / dari pembacaan sebelumnya)' : ''));
        else if (d.t) bagian.push('Diperbarui ' + dua(new Date(d.t).getHours()) + ':' + dua(new Date(d.t).getMinutes()) + (d.dariCache ? ' (tersimpan; memperbarui ...)' : ''));
        bagian.push('jam dari Diperbaharui Tanggal · nota dibatalkan tidak dihitung' + (d.baris ? ' · ' + d.baris.toLocaleString('en-US') + ' baris dibaca (' + d.hal + ' halaman' + (d.sumber ? ', ' + (d.sumber === 'iframe' ? 'halaman asli' : 'fetch') : '') + ')' : ''));
        // rincian yang menjelaskan hasil: berapa baris bertanggal hari ini, dibatalkan, atau bertanggal lain (contoh tanggalnya)
        const g = d.diag;
        if (g && d.baris && !d.error) {
            bagian.push('bertanggal hari ini ' + g.hariIni.toLocaleString('en-US') + (g.batal ? ' (batal ' + g.batal + ')' : '') +
                (g.bukanHariIni ? ' · tanggal lain ' + g.bukanHariIni.toLocaleString('en-US') + (g.contoh ? ' (mis. ' + g.contoh + ')' : '') : '') +
                (g.tanpaWaktu ? ' · tanpa tanggal ' + g.tanpaWaktu : '') +
                (g.berhenti ? ' · berhenti: ' + g.berhenti : ''));
        }
        catatanEl.textContent = bagian.join(' · ');
    }

    // rentang jam yang ditampilkan: bawaan 07-21, melebar kalau ada nota di luarnya
    function rentangJam(d) {
        let a = JAM_AWAL, b = JAM_AKHIR;
        d.jam.forEach((x, h) => { if (x.n > 0) { a = Math.min(a, h); b = Math.max(b, h); } });
        return [a, b];
    }

    function bangunTabel(d) {
        const [a, b] = rentangJam(d);
        const kolom = ['Jam', 'Nota'].concat(d.adaTotal ? ['Penjualan', 'Rata-rata per nota'] : []);
        const tabel = el('table', { 'class': 'ag_tabel' }, [
            el('thead', {}, [el('tr', {}, kolom.map((t, i) => el('th', { teks: t, 'class': i ? 'kanan' : '' })))])
        ]);
        const tb = el('tbody');
        for (let h = a; h <= b; h++) {
            const x = d.jam[h];
            const sel = (t, kelas) => el('td', { teks: t, 'class': kelas || '' });
            tb.appendChild(el('tr', {}, [sel(fmtJam(h) + ' – ' + dua(h) + '.59'), sel(x.n ? x.n.toLocaleString('en-US') : '–', 'kanan' + (x.n ? '' : ' kosong'))]
                .concat(d.adaTotal ? [sel(x.n ? fmtRp(x.rp) : '–', 'kanan' + (x.n ? '' : ' kosong')), sel(x.n ? fmtRp(x.rp / x.n) : '–', 'kanan' + (x.n ? '' : ' kosong'))] : [])));
        }
        tabel.appendChild(tb);
        const t = total(d);
        tabel.appendChild(el('tfoot', {}, [el('tr', {}, [el('td', { teks: 'Total' }), el('td', { teks: t.n.toLocaleString('en-US'), 'class': 'kanan' })]
            .concat(d.adaTotal ? [el('td', { teks: fmtRp(t.rp), 'class': 'kanan' }), el('td', { teks: t.n ? fmtRp(t.rp / t.n) : '–', 'class': 'kanan' })] : []))]));
        return el('div', { style: 'max-height:460px;overflow:auto' }, [tabel]);
    }

    function bangunSvg(d, metrik) {
        const [ja, jb] = rentangJam(d);
        const n = jb - ja + 1;
        const W = Math.max(320, badan.clientWidth || 800);
        const m = { kiri: 46, kanan: 14, atas: 24, bawah: 28 };
        const H = m.atas + TINGGI_PLOT + m.bawah;
        const lebarPlot = W - m.kiri - m.kanan;
        const bw = lebarPlot / n;
        const lebarBatang = Math.max(4, Math.min(24, Math.floor(bw * 0.6 / 2) * 2));
        const nilai = (x) => (metrik === 'rp' ? x.rp : x.n);
        const nilaiJam = [];
        for (let h = ja; h <= jb; h++) nilaiJam.push(nilai(d.jam[h]));
        const maks = Math.max.apply(null, nilaiJam.concat([0]));
        const sk = skala(maks, metrik === 'nota');
        const y = (v) => m.atas + TINGGI_PLOT * (1 - v / sk.atas);
        const cx = (i) => m.kiri + bw * (i + 0.5);
        const y0 = y(0);
        const jamKini = d.tgl === tglHariIni() ? new Date().getHours() : -1;
        const fmtSumbu = (v) => ringkas(v);

        lebarTerakhir = badan.clientWidth;
        const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group',
            'aria-label': 'Grafik ' + (metrik === 'rp' ? 'penjualan (Rp)' : 'jumlah nota') + ' per jam hari ini, ' + d.labelTipe + ', ' + d.labelOutlet + '. Tabel tersedia lewat tombol Tabel.' });

        // gridline hairline + label sumbu Y
        for (let v = 0; v <= sk.atas + sk.langkah / 1000; v += sk.langkah) {
            const yy = Math.round(y(v)) + 0.5;
            svg.appendChild(sv('line', { x1: m.kiri, x2: m.kiri + lebarPlot, y1: yy, y2: yy, stroke: v === 0 ? '#c3c2b7' : '#e1e0d9', 'stroke-width': 1 }));
            svg.appendChild(sv('text', { x: m.kiri - 8, y: yy, dy: '0.32em', 'text-anchor': 'end', 'font-size': 11, fill: '#767570', teks: fmtSumbu(v) }));
        }

        // label sumbu X: jam (dijarangkan bila sempit); jam berjalan ditebalkan, dan jarak label diselaraskan ke jam berjalan
        // (kalau tidak, labelnya bisa menempel ke label tetangga)
        const langkahX = Math.max(1, Math.ceil(40 / bw));
        const jangkar = jamKini >= ja && jamKini <= jb ? jamKini - ja : 0;
        for (let i = 0; i < n; i++) {
            const h = ja + i;
            if ((((i - jangkar) % langkahX) + langkahX) % langkahX !== 0) continue;
            svg.appendChild(sv('text', { x: cx(i), y: m.atas + TINGGI_PLOT + 18, 'text-anchor': 'middle', 'font-size': 11,
                fill: h === jamKini ? '#0b0b0b' : '#767570', 'font-weight': h === jamKini ? 700 : 400, teks: fmtJam(h) }));
        }

        const lapisCuci = sv('g'), lapisKolom = sv('g'), lapisLabel = sv('g'), lapisHit = sv('g');
        [lapisCuci, lapisKolom, lapisLabel, lapisHit].forEach((g) => svg.appendChild(g));

        // kolom: ujung data membulat 4px, dasar rata
        const kolomEl = [];
        let puncak = -1;
        for (let i = 0; i < n; i++) {
            const v = nilaiJam[i];
            kolomEl[i] = null;
            if (!(v > 0)) continue;
            if (puncak < 0 || v > nilaiJam[puncak]) puncak = i;
            const x = cx(i) - lebarBatang / 2, tinggi = Math.max(1, y0 - y(v)), r = Math.min(4, lebarBatang / 2, tinggi);
            const p = sv('path', { d: 'M' + x + ',' + y0 + ' L' + x + ',' + (y0 - tinggi + r) + ' A' + r + ',' + r + ' 0 0 1 ' + (x + r) + ',' + (y0 - tinggi) +
                ' L' + (x + lebarBatang - r) + ',' + (y0 - tinggi) + ' A' + r + ',' + r + ' 0 0 1 ' + (x + lebarBatang) + ',' + (y0 - tinggi + r) +
                ' L' + (x + lebarBatang) + ',' + y0 + ' Z', fill: WARNA });
            kolomEl[i] = p;
            lapisKolom.appendChild(p);
        }
        // satu label saja: nilai puncak, di atas kolomnya (sisanya lewat sumbu, tooltip, dan tabel)
        if (puncak >= 0) {
            lapisLabel.appendChild(sv('text', { x: cx(puncak), y: y(nilaiJam[puncak]) - 6, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#0b0b0b', teks: ringkas(nilaiJam[puncak]) }));
        }
        if (!(maks > 0)) {
            svg.appendChild(sv('text', { x: m.kiri + lebarPlot / 2, y: m.atas + TINGGI_PLOT / 2, 'text-anchor': 'middle', 'font-size': 13, fill: '#767570',
                teks: d.selesai ? 'Belum ada nota (' + d.labelTipe + ', ' + d.labelOutlet + ') hari ini' : 'Memuat ...' }));
        }

        // area hover/fokus: satu kolom penuh per jam (jauh lebih besar dari batangnya)
        for (let i = 0; i < n; i++) {
            const h = ja + i, x = d.jam[h];
            const cuci = sv('rect', { x: cx(i) - bw / 2, y: m.atas, width: bw, height: TINGGI_PLOT, fill: '#0b0b0b', 'fill-opacity': 0, 'pointer-events': 'none' });
            lapisCuci.appendChild(cuci);
            const hit = sv('rect', { x: cx(i) - bw / 2, y: m.atas, width: bw, height: TINGGI_PLOT, fill: 'transparent', tabindex: 0, role: 'img',
                style: 'outline:none;cursor:default',
                'aria-label': 'Jam ' + fmtJam(h) + ': ' + x.n + ' nota' + (d.adaTotal ? ', ' + fmtRp(x.rp) : '') });
            const tampil = () => {
                lapisCuci.querySelectorAll('rect').forEach((r) => r.setAttribute('fill-opacity', 0));
                cuci.setAttribute('fill-opacity', 0.05);
                kolomEl.forEach((k, j) => { if (k) k.setAttribute('fill-opacity', j === i ? 1 : 0.55); });
                tampilTip(d, h, cx(i), bw, W, metrik);
            };
            const sembunyi = () => {
                cuci.setAttribute('fill-opacity', 0);
                kolomEl.forEach((k) => { if (k) k.setAttribute('fill-opacity', 1); });
                sembunyiTip();
            };
            hit.addEventListener('pointerenter', tampil);
            hit.addEventListener('pointerleave', sembunyi);
            hit.addEventListener('focus', tampil);
            hit.addEventListener('blur', sembunyi);
            lapisHit.appendChild(hit);
        }
        return svg;
    }

    // ---------- tooltip: nilai tebal di depan, keterangan sekunder; teks selalu lewat textContent ----------
    function tampilTip(d, h, x, bw, W, metrik) {
        const j = d.jam[h];
        tipEl.textContent = '';
        tipEl.appendChild(el('div', { 'class': 'tgl', teks: 'Jam ' + fmtJam(h) + ' – ' + dua(h) + '.59' + (d.tgl === tglHariIni() && h === new Date().getHours() ? ' · jam berjalan' : '') }));
        if (!j.n) {
            tipEl.appendChild(el('div', { 'class': 'nama', teks: 'Belum ada nota' }));
        } else {
            const utama = metrik === 'rp' ? fmtRp(j.rp) : j.n.toLocaleString('en-US') + ' nota';
            tipEl.appendChild(el('div', { 'class': 'baris' }, [
                el('i', { 'class': 'kunci', style: 'border-color:' + WARNA }),
                el('span', { 'class': 'nilai', teks: utama }), el('span', { 'class': 'nama', teks: metrik === 'rp' ? 'Penjualan' : 'Jumlah nota' })]));
            const lain = metrik === 'rp' ? j.n.toLocaleString('en-US') + ' nota' : (d.adaTotal ? fmtRp(j.rp) : '');
            const rata = d.adaTotal ? 'rata-rata ' + fmtRp(j.rp / j.n) + ' per nota' : '';
            const teks = [lain, metrik === 'rp' ? rata : (d.adaTotal ? rata : '')].filter(Boolean).join(' · ');
            if (teks) tipEl.appendChild(el('div', { 'class': 'nama', teks: teks }));
        }
        tipEl.style.display = 'block';
        const lebarTip = tipEl.offsetWidth;
        let kiri = x + bw / 2 + 6;
        if (kiri + lebarTip > W - 4) kiri = x - bw / 2 - 6 - lebarTip;
        tipEl.style.left = Math.max(4, kiri) + 'px';
        tipEl.style.top = '16px';
    }
    function sembunyiTip() { if (tipEl) tipEl.style.display = 'none'; }

    // ---------- pasang di atas panel AI Agent ----------
    let acuan = null, panelAi = null;
    // salah satu elemen kartu stats (di luar panel AI) dipakai sebagai batas: panel = blok judul AI yang tidak memuat acuan
    function cariAcuan() {
        if (acuan && acuan.isConnected) return acuan;
        acuan = cariTeks(/^\s*penjualan\s*\+\s*servis/i) || cariTeks(/Transaksi\s+Hari\s+Ini\s+Untuk/i) ||
            Array.from(document.querySelectorAll('.label_transaksi')).find((e) => e.offsetParent !== null) || null;
        return acuan;
    }
    // blok panel "AI Agent | Rekomendasi Marketing ...": dari teks judulnya naik sampai tepat sebelum induk yang juga memuat acuan
    function cariPanelAi() {
        const judul = cariTeks(/Rekomendasi\s+Marketing/i);
        const a = cariAcuan();
        if (!judul || !a) return null;   // tanpa acuan di luar panel, posisi tidak bisa dipastikan
        let p = judul;
        while (p.parentElement && p.parentElement !== document.body && !p.parentElement.contains(a)) p = p.parentElement;
        return p.contains(a) ? null : p;
    }

    function pasang() {
        if (kartu && kartu.isConnected && panelAi && panelAi.isConnected && kartu.nextElementSibling === panelAi) return true;
        const panel = cariPanelAi();
        if (!panel || !panel.parentNode) return false;
        panelAi = panel;
        if (!kartu) bangunKartu();
        panel.parentNode.insertBefore(kartu, panel);
        const cs = getComputedStyle(panel);   // lebar & jarak samping sama dengan panel AI Agent
        kartu.style.marginLeft = cs.marginLeft;
        kartu.style.marginRight = cs.marginRight;
        gambar();
        return true;
    }

    let sudahPeringatan = false;
    function putaran() {
        try {
            const terpasang = pasang();
            if (!terpasang) {
                if (!sudahPeringatan && Date.now() - MULAI > 30000) {
                    sudahPeringatan = true;
                    console.warn('[grafik.js] belum terpasang: ' + (cariAcuan() ? '' : 'kartu stats Home ') + (cariTeks(/Rekomendasi\s+Marketing/i) ? '' : 'panel "AI Agent | Rekomendasi Marketing" ') + 'tidak ditemukan di halaman');
                }
                return;
            }
            // lewat tengah malam: data kemarin dibuang, hari baru dibaca dari awal
            if (hasil && hasil.tgl !== tglHariIni()) { hasil = null; gambar(); }
            if (jalan || document.hidden || Date.now() - MULAI < MULAI_TUNDA_MS) return;
            if (Date.now() - cobaTerakhir > (cobaGagal ? ULANG_GALAT_MS : REFRESH_TIAP_MS)) pindai();   // cobaTerakhir=0: langsung baca (juga saat ada cache)
        } catch (err) {
            console.warn('[grafik.js] ' + err.message);
        }
    }

    putaran();
    setInterval(putaran, CEK_TIAP_MS);
})();
