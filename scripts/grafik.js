// ==UserScript==
// @name         Erzap - Grafik Penjualan Home
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Halaman Home: kotak "Grafik Penjualan" di ATAS panel AI Agent (Rekomendasi Marketing Produk Kurang Laku). Kolom = Penjualan + Servis per hari, garis = Laba, rentang 7 / 14 / 30 hari, tooltip per hari, dan tampilan Tabel sebagai pasangan grafik. Angkanya dibaca dari kartu "Penjualan + Servis" di Home (nilai + "Laba : Rp ...") dan dicatat per hari di localStorage browser ini, jadi riwayat bertambah setiap Home dibuka / di-refresh (hari yang belum pernah dibuka kosong, bukan nol). Grafik digambar sendiri (SVG, tanpa library). Hanya di Home; tidak jalan di halaman Login / nota / popup.
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window) return;
    // Jendela cetak / nota / popup (layout=simple, /nota...) dilewati
    if (/[?&]layout=/.test(location.search) || /\/nota/i.test(location.pathname)) return;
    // Halaman Login (belum ada sesi) dilewati
    if (document.querySelector('input[type="password"]')) return;
    if (location.pathname !== '/') return;   // grafik hanya di Home
    if (window.__aistimGrafik) return;
    window.__aistimGrafik = true;
    console.log('[grafik.js] v1.0.0 aktif di ' + location.pathname);

    const K_DATA = 'aistim_grafik_v1';        // {v:1, scope:{<"49 Outlet">:{<"2026-10-17">:{j,l,t}}}}
    const K_PREF = 'aistim_grafik_pref';      // {rentang, tampil}
    const MAKS_HARI = 400;                    // riwayat lebih lama dari ini dibuang
    const MAKS_SCOPE = 12;                    // jumlah "Untuk N Outlet" berbeda yang disimpan
    const CEK_TIAP_MS = 2000;
    const RENTANG = [7, 14, 30];
    const TINGGI_PLOT = 200;
    const WARNA = { jual: '#2a78d6', laba: '#eb6834' };   // palet kategorikal slot 1 & 2 (lolos validate_palette, permukaan putih)
    const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const SVGNS = 'http://www.w3.org/2000/svg';

    const dua = (n) => (n < 10 ? '0' : '') + n;
    const rapih = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const kunciHari = (d) => d.getFullYear() + '-' + dua(d.getMonth() + 1) + '-' + dua(d.getDate());
    const fmtRp = (n) => 'Rp ' + Math.round(n).toLocaleString('en-US');   // pemisah ribuan sama dengan tampilan Erzap
    const angka = (s) => { const n = parseFloat(String(s).replace(/,/g, '')); return isNaN(n) ? null : n; };

    // 12500000 -> "12,5 jt"; dipakai untuk sumbu & label ujung (angka lengkap ada di tooltip & tabel)
    function ringkas(n) {
        const a = Math.abs(n);
        const [bagi, satuan] = a >= 1e9 ? [1e9, ' M'] : a >= 1e6 ? [1e6, ' jt'] : a >= 1e3 ? [1e3, ' rb'] : [1, ''];
        const v = n / bagi;
        const t = Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
        return t.replace('.', ',') + satuan;
    }

    // ---------- penyimpanan riwayat (localStorage; semua akses dibungkus try/catch) ----------
    let simpanan = { v: 1, scope: {} };
    function muatSimpanan() {
        try {
            const j = JSON.parse(localStorage.getItem(K_DATA) || 'null');
            if (j && j.v === 1 && j.scope && typeof j.scope === 'object') simpanan = j;
        } catch (e) { /* rusak/diblokir: pakai yang di memori */ }
    }
    function tulisSimpanan() {
        const nama = Object.keys(simpanan.scope);
        if (nama.length > MAKS_SCOPE) {
            nama.sort((a, b) => lastT(simpanan.scope[a]) - lastT(simpanan.scope[b]))
                .slice(0, nama.length - MAKS_SCOPE).forEach((n) => delete simpanan.scope[n]);
        }
        try { localStorage.setItem(K_DATA, JSON.stringify(simpanan)); } catch (e) { /* penuh/diblokir: abaikan */ }
    }
    const lastT = (data) => Object.keys(data).reduce((m, k) => Math.max(m, data[k].t || 0), 0);

    let pref = { rentang: 7, tampil: 'grafik' };
    try {
        const p = JSON.parse(localStorage.getItem(K_PREF) || 'null');
        if (p && RENTANG.indexOf(p.rentang) >= 0) pref.rentang = p.rentang;
        if (p && (p.tampil === 'grafik' || p.tampil === 'tabel')) pref.tampil = p.tampil;
    } catch (e) { /* pakai bawaan */ }
    function simpanPref() { try { localStorage.setItem(K_PREF, JSON.stringify(pref)); } catch (e) { /* abaikan */ } }

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

    // ---------- kartu "Penjualan + Servis" (sumber angka) ----------
    // label kartu; boleh diikuti persen perubahan bila menempel di teks yang sama ("Penjualan + Servis ↓(-48.5%)")
    const POLA_LABEL_JUAL = /^\s*penjualan\s*\+\s*servis\s*(?:[↓↑▼▲]?\s*\(?\s*[-+]?[\d.,]+\s*%\s*\)?)?\s*$/i;
    const POLA_KARTU_LAIN = /\bBeban\b|Dana\s+Masuk|Dana\s+Keluar|PPOB|Piutang|Hutang/i;
    let labelJual = null, kartuJual = null;

    // kartu = elemen terbesar di sekitar label yang belum memuat kartu lain (kelas CSS tidak diandalkan)
    function cariKartuJual() {
        if (kartuJual && labelJual && document.body.contains(kartuJual) && document.body.contains(labelJual)) return kartuJual;
        labelJual = cariTeks(POLA_LABEL_JUAL);
        if (!labelJual) return (kartuJual = null);
        let k = labelJual;
        while (k.parentElement && k.parentElement !== document.body && !POLA_KARTU_LAIN.test(k.parentElement.textContent)) k = k.parentElement;
        return (kartuJual = k);
    }

    // {jual, laba} dari teks kartu: "Penjualan + Servis (-48.5%) Rp 506,052,279.00 Laba : Rp 110,043,755.09 (28.74%)"
    function bacaKartu() {
        const k = cariKartuJual();
        if (!k) return null;
        const t = rapih(k.textContent);
        const mLaba = /laba\s*:?\s*(-?)\s*Rp\s*(-?[\d.,]+)/i.exec(t);
        const mJual = /Rp\s*(-?[\d.,]+)/i.exec(mLaba ? t.replace(mLaba[0], ' ') : t);
        const jual = mJual ? angka(mJual[1]) : null;
        if (jual === null) return null;
        let laba = mLaba ? angka(mLaba[2]) : null;
        if (laba !== null && mLaba[1]) laba = -laba;
        return { jual: jual, laba: laba };
    }

    // "Transaksi Hari Ini Untuk 49 Outlet" -> "49 Outlet": riwayat dipisah per cakupan (ganti outlet = riwayat lain)
    let judulHome = null;
    function cakupan() {
        if (!judulHome || !judulHome.isConnected) judulHome = cariTeks(/Transaksi\s+Hari\s+Ini\s+Untuk/i);
        const e = judulHome;
        // judul bisa terpecah ("Untuk " + <span>49 Outlet</span>): kalau elemen teksnya belum memuat angka, pakai induknya
        const m = e && (/Untuk\s+(\S.*)$/i.exec(rapih(e.textContent)) || (e.parentElement && /Untuk\s+(\S.*)$/i.exec(rapih(e.parentElement.textContent))));
        const s = m ? rapih(m[1]) : '';
        return /^0\b/.test(s) ? '' : s;   // "0 Outlet" = halaman belum selesai memuat
    }

    // ---------- pencatatan harian ----------
    // Riwayat tidak dicatat sebelum cakupan terbaca (judul "Untuk N Outlet" bisa muncul belakangan); kalau judulnya
    // tidak pernah ada (susunan halaman lain), setelah SABAR_CAKUPAN_MS dipakai cakupan umum.
    const CAKUPAN_UMUM = 'umum', SABAR_CAKUPAN_MS = 10000, MULAI = Date.now();
    let scopeAktif = '';
    function dataCakupan() {
        if (!simpanan.scope[scopeAktif]) simpanan.scope[scopeAktif] = {};
        return simpanan.scope[scopeAktif];
    }

    // true bila ada yang berubah
    function catat(nilai) {
        muatSimpanan();   // gabungkan dulu dengan tab Home lain yang mungkin menulis
        const data = dataCakupan();
        const hari = kunciHari(new Date());
        const ada = data[hari];
        // kartu sedang memuat ulang: tampil 0 padahal sudah ada penjualan hari ini
        if (nilai.jual === 0 && ada && ada.j > 0) return false;
        // lewat tengah malam kartu masih memuat angka kemarin sampai di-refresh: angka yang persis sama dengan catatan kemarin dilewati
        if (!ada && nilai.jual > 0) {
            const lalu = Object.keys(data).filter((k) => k < hari).sort().pop();
            if (lalu && data[lalu].j === nilai.jual) return false;
        }
        if (ada && ada.j === nilai.jual && ada.l === nilai.laba) return false;
        data[hari] = { j: nilai.jual, l: nilai.laba, t: Date.now() };
        const batas = kunciHari(new Date(Date.now() - MAKS_HARI * 86400000));
        Object.keys(data).forEach((k) => { if (k < batas) delete data[k]; });
        tulisSimpanan();
        return true;
    }

    // ---------- gaya ----------
    const gaya = document.createElement('style');
    gaya.textContent =
        '.aistim_grafik{--surface:#fff;--ink:#0b0b0b;--ink2:#52514e;--muted:#767570;--grid:#e1e0d9;--axis:#c3c2b7;' +
        'box-sizing:border-box;position:relative;margin:0 0 16px;padding:14px 18px 10px;background:var(--surface);color:var(--ink);' +
        'border:1px solid #dcdfe4;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.06);font-family:inherit;text-decoration:none}' +
        '.aistim_grafik *{box-sizing:border-box;text-decoration:none}' +
        '.aistim_grafik .ag_kepala{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px}' +
        '.aistim_grafik .ag_judul{font-size:17px;color:#555}.aistim_grafik .ag_judul b{color:var(--ink)}' +
        '.aistim_grafik .ag_kontrol{display:flex;flex-wrap:wrap;gap:8px}' +
        '.aistim_grafik .ag_seg{display:inline-flex;border:1px solid #0d6efd;border-radius:4px;overflow:hidden}' +
        '.aistim_grafik .ag_seg button{margin:0;padding:3px 12px;border:0;background:#fff;color:#0d6efd;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}' +
        '.aistim_grafik .ag_seg button+button{border-left:1px solid #0d6efd}' +
        '.aistim_grafik .ag_seg button[aria-pressed="true"]{background:#0d6efd;color:#fff}' +
        '.aistim_grafik .ag_seg button:focus-visible{outline:2px solid #0d6efd;outline-offset:-2px}' +
        '.aistim_grafik .ag_legenda{display:flex;flex-wrap:wrap;gap:4px 18px;margin:8px 0 0;font-size:12px;color:var(--ink2)}' +
        '.aistim_grafik .ag_legenda span{display:inline-flex;align-items:center;gap:6px}' +
        '.aistim_grafik .ag_badan{position:relative;margin-top:6px}' +
        '.aistim_grafik .ag_badan svg{display:block;width:100%;overflow:visible}' +
        '.aistim_grafik .ag_badan svg text{font-family:inherit}' +
        '.aistim_grafik .ag_tabel{width:100%;border-collapse:collapse;font-size:12px}' +
        '.aistim_grafik .ag_tabel th{padding:6px 8px;border-bottom:1px solid #cfd4dc;background:#eef0f4;text-align:left;white-space:nowrap}' +
        '.aistim_grafik .ag_tabel td{padding:5px 8px;border-bottom:1px solid #eceff3}' +
        '.aistim_grafik .ag_tabel .kanan{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}' +
        '.aistim_grafik .ag_tabel .kosong{color:var(--muted)}' +
        '.aistim_grafik .ag_tip{position:absolute;z-index:5;display:none;min-width:170px;padding:8px 10px;background:#fff;color:var(--ink);' +
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
    // penanda legenda: persegi untuk kolom, garis pendek untuk garis (mengikuti bentuk mark)
    function penandaLegenda(jenis, warna) {
        return jenis === 'kolom'
            ? el('i', { style: 'display:inline-block;width:10px;height:10px;border-radius:2px;background:' + warna })
            : el('i', { style: 'display:inline-block;width:16px;height:0;border-top:2px solid ' + warna });
    }

    // ---------- kotak grafik ----------
    let kartu = null, judulSub = null, badan = null, catatanEl = null, tipEl = null;
    let lebarTerakhir = 0;   // lebar badan saat terakhir digambar (pembanding untuk ResizeObserver)
    const tombolRentang = {}, tombolTampil = {};

    function bangunKartu() {
        const k = el('div', { 'class': 'aistim_grafik', 'data-aistim-grafik': '1' });
        judulSub = el('span', { teks: '| Penjualan + Servis' });
        const kepala = el('div', { 'class': 'ag_kepala' });
        kepala.appendChild(el('div', { 'class': 'ag_judul' }, [el('b', { teks: 'Grafik Penjualan' }), document.createTextNode(' '), judulSub]));

        const segRentang = el('div', { 'class': 'ag_seg', role: 'group', 'aria-label': 'Rentang hari' });
        RENTANG.forEach((n) => {
            const b = el('button', { type: 'button', teks: n + ' hari' });
            b.addEventListener('click', () => { pref.rentang = n; simpanPref(); gambar(); });
            tombolRentang[n] = b;
            segRentang.appendChild(b);
        });
        const segTampil = el('div', { 'class': 'ag_seg', role: 'group', 'aria-label': 'Tampilan' });
        [['grafik', 'Grafik'], ['tabel', 'Tabel']].forEach((t) => {
            const b = el('button', { type: 'button', teks: t[1] });
            b.addEventListener('click', () => { pref.tampil = t[0]; simpanPref(); gambar(); });
            tombolTampil[t[0]] = b;
            segTampil.appendChild(b);
        });
        kepala.appendChild(el('div', { 'class': 'ag_kontrol' }, [segRentang, segTampil]));
        k.appendChild(kepala);

        k.appendChild(el('div', { 'class': 'ag_legenda' }, [
            el('span', {}, [penandaLegenda('kolom', WARNA.jual), document.createTextNode('Penjualan + Servis')]),
            el('span', {}, [penandaLegenda('garis', WARNA.laba), document.createTextNode('Laba')])
        ]));
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

    // ---------- data rentang hari ----------
    function hariRentang(n) {
        const data = dataCakupan();
        const hasil = [];
        const sekarang = new Date();
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate() - i);
            const rec = data[kunciHari(d)] || null;
            hasil.push({ tgl: d, ini: i === 0, ada: !!rec, jual: rec ? rec.j : null, laba: rec ? rec.l : null });
        }
        return hasil;
    }
    const teksTgl = (d) => d.getDate() + ' ' + BULAN[d.getMonth()];
    const teksTglLengkap = (d) => HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
    const teksMargin = (b) => (b.jual > 0 && b.laba !== null ? (b.laba / b.jual * 100).toFixed(1).replace('.', ',') + '%' : '–');

    // skala sumbu dengan langkah 1-2-5; domain boleh turun di bawah 0 bila ada laba negatif
    function skala(maks, min) {
        const rentang = Math.max(maks, 0) - Math.min(min, 0);
        if (!(rentang > 0)) return { bawah: 0, atas: 1, langkah: 1 };
        const kasar = rentang / 4, p = Math.pow(10, Math.floor(Math.log10(kasar))), f = kasar / p;
        const langkah = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
        return { bawah: min < 0 ? Math.floor(min / langkah) * langkah : 0, atas: Math.max(Math.ceil(maks / langkah), 1) * langkah, langkah: langkah };
    }

    // ---------- gambar ----------
    function gambar() {
        if (!kartu) return;
        const n = pref.rentang;
        const hari = hariRentang(n);
        const tercatat = hari.filter((h) => h.ada);

        RENTANG.forEach((r) => tombolRentang[r].setAttribute('aria-pressed', r === n ? 'true' : 'false'));
        ['grafik', 'tabel'].forEach((t) => tombolTampil[t].setAttribute('aria-pressed', t === pref.tampil ? 'true' : 'false'));
        judulSub.textContent = '| Penjualan + Servis' + (scopeAktif && scopeAktif !== CAKUPAN_UMUM ? ' · ' + scopeAktif : '') + ' · ' + n + ' hari terakhir';
        sembunyiTip();

        Array.from(badan.children).forEach((c) => { if (c !== tipEl) c.remove(); });
        if (pref.tampil === 'tabel') badan.appendChild(bangunTabel(hari));
        else badan.appendChild(bangunSvg(hari));
        kartu.querySelector('.ag_legenda').style.display = pref.tampil === 'tabel' ? 'none' : '';

        const akhir = tercatat.length ? lastT(dataCakupan()) : 0;
        catatanEl.textContent = tercatat.length < n
            ? 'Riwayat dicatat otomatis dari kartu Penjualan + Servis tiap Home dibuka / di-refresh: ' + tercatat.length + ' dari ' + n + ' hari tercatat (hari kosong = belum pernah dibuka, bukan nol).'
            : (akhir ? 'Diperbarui ' + dua(new Date(akhir).getHours()) + ':' + dua(new Date(akhir).getMinutes()) : '');
    }

    function bangunTabel(hari) {
        const kolom = ['Tanggal', 'Penjualan + Servis', 'Laba', 'Margin'];
        const tabel = el('table', { 'class': 'ag_tabel' }, [
            el('thead', {}, [el('tr', {}, kolom.map((t, i) => el('th', { teks: t, 'class': i ? 'kanan' : '' })))])
        ]);
        const tb = el('tbody');
        hari.slice().reverse().forEach((h) => {
            const kosong = (t) => el('td', { teks: t, 'class': 'kanan kosong' });
            tb.appendChild(el('tr', {}, h.ada ? [
                el('td', { teks: teksTglLengkap(h.tgl) + (h.ini ? ' (hari ini)' : '') }),
                el('td', { teks: fmtRp(h.jual), 'class': 'kanan' }),
                h.laba !== null ? el('td', { teks: fmtRp(h.laba), 'class': 'kanan' }) : kosong('–'),
                el('td', { teks: teksMargin(h), 'class': 'kanan' })
            ] : [
                el('td', { teks: teksTglLengkap(h.tgl) + (h.ini ? ' (hari ini)' : '') }),
                kosong('belum tercatat'), kosong('–'), kosong('–')
            ]));
        });
        tabel.appendChild(tb);
        return el('div', { style: 'max-height:300px;overflow:auto' }, [tabel]);
    }

    function bangunSvg(hari) {
        const W = Math.max(320, badan.clientWidth || 800);
        const labelUjung = W >= 640;                     // sempit: label ujung pindah ke tooltip / legenda
        const m = { kiri: 46, kanan: labelUjung ? 132 : 14, atas: 14, bawah: 28 };
        const H = m.atas + TINGGI_PLOT + m.bawah;
        const lebarPlot = W - m.kiri - m.kanan;
        const bw = lebarPlot / hari.length;
        const lebarBatang = Math.max(4, Math.min(24, Math.floor(bw * 0.6 / 2) * 2));

        const nilai = [];
        hari.forEach((h) => { if (h.ada) { nilai.push(h.jual); if (h.laba !== null) nilai.push(h.laba); } });
        const sk = skala(nilai.length ? Math.max.apply(null, nilai) : 0, nilai.length ? Math.min.apply(null, nilai) : 0);
        const y = (v) => m.atas + TINGGI_PLOT * (1 - (v - sk.bawah) / (sk.atas - sk.bawah));
        const cx = (i) => m.kiri + bw * (i + 0.5);
        const y0 = y(0);

        lebarTerakhir = badan.clientWidth;
        const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group',
            'aria-label': 'Grafik Penjualan + Servis dan Laba per hari, ' + hari.length + ' hari terakhir. Tabel tersedia lewat tombol Tabel.' });

        // gridline hairline + label sumbu Y
        for (let v = sk.bawah; v <= sk.atas + sk.langkah / 1000; v += sk.langkah) {
            const yy = Math.round(y(v)) + 0.5;
            svg.appendChild(sv('line', { x1: m.kiri, x2: m.kiri + lebarPlot, y1: yy, y2: yy, stroke: Math.abs(v) < sk.langkah / 1000 ? '#c3c2b7' : '#e1e0d9', 'stroke-width': 1 }));
            svg.appendChild(sv('text', { x: m.kiri - 8, y: yy, dy: '0.32em', 'text-anchor': 'end', 'font-size': 11, fill: '#767570', teks: ringkas(v) }));
        }

        // label sumbu X (dijarangkan supaya tidak bertabrakan; hari ini selalu berlabel)
        const langkahX = Math.max(1, Math.ceil(46 / bw));
        hari.forEach((h, i) => {
            if ((hari.length - 1 - i) % langkahX !== 0) return;
            svg.appendChild(sv('text', { x: cx(i), y: m.atas + TINGGI_PLOT + 18, 'text-anchor': 'middle', 'font-size': 11,
                fill: h.ini ? '#0b0b0b' : '#767570', 'font-weight': h.ini ? 700 : 400, teks: teksTgl(h.tgl) }));
        });

        const lapisCuci = sv('g'), lapisKolom = sv('g'), lapisGaris = sv('g'), lapisLabel = sv('g'), lapisHit = sv('g');
        [lapisCuci, lapisKolom, lapisGaris, lapisLabel, lapisHit].forEach((g) => svg.appendChild(g));

        // kolom penjualan: ujung data membulat 4px, dasar rata
        const kolomEl = [];
        hari.forEach((h, i) => {
            kolomEl[i] = null;
            if (!h.ada || !(h.jual > 0)) return;
            const x = cx(i) - lebarBatang / 2, atas = y(h.jual), tinggi = Math.max(1, y0 - atas), r = Math.min(4, lebarBatang / 2, tinggi);
            const p = sv('path', { d: 'M' + x + ',' + y0 + ' L' + x + ',' + (y0 - tinggi + r) + ' A' + r + ',' + r + ' 0 0 1 ' + (x + r) + ',' + (y0 - tinggi) +
                ' L' + (x + lebarBatang - r) + ',' + (y0 - tinggi) + ' A' + r + ',' + r + ' 0 0 1 ' + (x + lebarBatang) + ',' + (y0 - tinggi + r) +
                ' L' + (x + lebarBatang) + ',' + y0 + ' Z', fill: WARNA.jual });
            kolomEl[i] = p;
            lapisKolom.appendChild(p);
        });

        // garis laba: putus di hari tanpa catatan (tidak diinterpolasi); titik 8px dengan cincin permukaan 2px
        let ruas = [];
        const tutupRuas = () => {
            if (ruas.length > 1) lapisGaris.appendChild(sv('path', { d: ruas.map((p, j) => (j ? 'L' : 'M') + p[0] + ',' + p[1]).join(' '),
                fill: 'none', stroke: WARNA.laba, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
            ruas = [];
        };
        const titik = [];
        hari.forEach((h, i) => {
            if (!h.ada || h.laba === null) { tutupRuas(); return; }
            ruas.push([cx(i), y(h.laba)]);
            titik.push([cx(i), y(h.laba)]);
        });
        tutupRuas();
        // terlalu rapat (30 hari di layar sempit): titik 8px saling menumpuk, jadi hanya garisnya; nilainya ada di tooltip & tabel
        if (bw >= 16) titik.forEach((p) => {
            lapisGaris.appendChild(sv('circle', { cx: p[0], cy: p[1], r: 6, fill: '#fff' }));
            lapisGaris.appendChild(sv('circle', { cx: p[0], cy: p[1], r: 4, fill: WARNA.laba }));
        });

        // label ujung: hanya hari terakhir yang tercatat (nilai + nama, teks pakai warna teks, penanda berwarna di sampingnya)
        const terakhir = hari.map((h, i) => ({ h: h, i: i })).filter((x) => x.h.ada).pop();
        if (labelUjung && terakhir) {
            const xl = m.kiri + lebarPlot + 12;
            const baris = [{ nilai: terakhir.h.jual, nama: 'Penjualan + Servis', jenis: 'kolom', warna: WARNA.jual }];
            if (terakhir.h.laba !== null) baris.push({ nilai: terakhir.h.laba, nama: 'Laba', jenis: 'garis', warna: WARNA.laba });
            baris.forEach((b, j) => {
                const yy = y(b.nilai);
                if (j && Math.abs(yy - y(baris[0].nilai)) < 34) return;   // terlalu dekat: legenda + tooltip yang membawa, label tidak digeser
                const penanda = b.jenis === 'kolom'
                    ? sv('rect', { x: xl, y: yy - 12, width: 10, height: 10, rx: 2, fill: b.warna })
                    : sv('line', { x1: xl, x2: xl + 14, y1: yy - 7, y2: yy - 7, stroke: b.warna, 'stroke-width': 2, 'stroke-linecap': 'round' });
                lapisLabel.appendChild(penanda);
                lapisLabel.appendChild(sv('text', { x: xl + 20, y: yy - 3, 'font-size': 12, 'font-weight': 700, fill: '#0b0b0b', teks: ringkas(b.nilai) }));
                lapisLabel.appendChild(sv('text', { x: xl, y: yy + 12, 'font-size': 11, fill: '#52514e', teks: b.nama }));
            });
        }

        if (!tercatatAda(hari)) {
            svg.appendChild(sv('text', { x: m.kiri + lebarPlot / 2, y: m.atas + TINGGI_PLOT / 2, 'text-anchor': 'middle', 'font-size': 13, fill: '#767570',
                teks: 'Menunggu angka kartu Penjualan + Servis ...' }));
        }

        // area hover/fokus: satu kolom penuh per hari (jauh lebih besar dari batangnya)
        hari.forEach((h, i) => {
            const cuci = sv('rect', { x: cx(i) - bw / 2, y: m.atas, width: bw, height: TINGGI_PLOT, fill: '#0b0b0b', 'fill-opacity': 0, 'pointer-events': 'none' });
            lapisCuci.appendChild(cuci);
            const hit = sv('rect', { x: cx(i) - bw / 2, y: m.atas, width: bw, height: TINGGI_PLOT, fill: 'transparent', tabindex: 0, role: 'img',
                style: 'outline:none;cursor:default',
                'aria-label': teksTglLengkap(h.tgl) + (h.ada ? ': penjualan ' + fmtRp(h.jual) + (h.laba !== null ? ', laba ' + fmtRp(h.laba) : '') : ': belum tercatat') });
            const tampil = () => {
                lapisCuci.querySelectorAll('rect').forEach((r) => r.setAttribute('fill-opacity', 0));
                cuci.setAttribute('fill-opacity', 0.05);
                kolomEl.forEach((k, j) => { if (k) k.setAttribute('fill-opacity', j === i ? 1 : 0.55); });
                tampilTip(h, cx(i), bw, W);
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
        });
        return svg;
    }
    const tercatatAda = (hari) => hari.some((h) => h.ada);

    // ---------- tooltip: nilai tebal di depan, nama seri sekunder; teks selalu lewat textContent ----------
    function tampilTip(h, x, bw, W) {
        tipEl.textContent = '';
        tipEl.appendChild(el('div', { 'class': 'tgl', teks: teksTglLengkap(h.tgl) + (h.ini ? ' · hari ini' : '') }));
        if (!h.ada) {
            tipEl.appendChild(el('div', { 'class': 'nama', teks: 'Belum tercatat (Home belum dibuka hari itu)' }));
        } else {
            const baris = (warna, nilai, nama) => el('div', { 'class': 'baris' }, [
                el('i', { 'class': 'kunci', style: 'border-color:' + warna }),
                el('span', { 'class': 'nilai', teks: nilai }), el('span', { 'class': 'nama', teks: nama })]);
            tipEl.appendChild(baris(WARNA.jual, fmtRp(h.jual), 'Penjualan + Servis'));
            if (h.laba !== null) tipEl.appendChild(baris(WARNA.laba, fmtRp(h.laba), 'Laba · margin ' + teksMargin(h)));
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
    let panelAi = null;
    // blok panel "AI Agent | Rekomendasi Marketing ...": dari teks judulnya naik sampai tepat sebelum induk yang juga memuat kartu stats
    function cariPanelAi() {
        const judul = cariTeks(/Rekomendasi\s+Marketing/i);
        const acuan = cariKartuJual();
        if (!judul || !acuan) return null;   // tanpa kartu stats sebagai batas, posisi tidak bisa dipastikan
        let p = judul;
        while (p.parentElement && p.parentElement !== document.body && !p.parentElement.contains(acuan)) p = p.parentElement;
        return p.contains(acuan) ? null : p;
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
            const s = cakupan();
            if (s && s !== scopeAktif) { scopeAktif = s; if (kartu) gambar(); }
            if (!scopeAktif) {
                if (Date.now() - MULAI < SABAR_CAKUPAN_MS) return;   // tunggu judul "Untuk N Outlet"
                scopeAktif = CAKUPAN_UMUM;
            }
            const nilai = bacaKartu();
            if (nilai && catat(nilai) && kartu) gambar();
            else if (kartu && kartu.dataset.hari !== kunciHari(new Date())) gambar();   // lewat tengah malam: geser rentang
            if (pasang() && kartu) kartu.dataset.hari = kunciHari(new Date());
            else if (!sudahPeringatan && Date.now() - MULAI > 30000) {
                sudahPeringatan = true;
                console.warn('[grafik.js] belum terpasang: ' + (cariKartuJual() ? '' : 'kartu "Penjualan + Servis" ') + (cariTeks(/Rekomendasi\s+Marketing/i) ? '' : 'panel "AI Agent | Rekomendasi Marketing" ') + 'tidak ditemukan di halaman');
            }
        } catch (err) {
            console.warn('[grafik.js] ' + err.message);
        }
    }

    muatSimpanan();
    putaran();
    setInterval(putaran, CEK_TIAP_MS);
})();
