// ==UserScript==
// @name         Erzap - Home & Peringatan Saldo PPOB
// @namespace    http://tampermonkey.net/
// @version      1.27.3
// @description  Home: kartu Penerimaan Piutang Servis (Dana Masuk, Pembayaran Piutang Usaha, hari ini), Penerimaan Piutang Penjualan, Pembayaran Hutang, Pendapatan Lain-Lain; tombol Aistim Audit (Cek Pemindahan, Stok Negatif) khusus role pusat; tombol menu tambahan.
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window) return;
    if (/[?&]layout=/.test(location.search) || /\/nota/i.test(location.pathname)) return;
    if (document.querySelector('input[type="password"]')) return;
    if (location.pathname !== '/') return;
    if (window.__aistimHome) return;
    window.__aistimHome = true;
    console.log('[home.js] v1.27.3 aktif di ' + location.pathname);

    const DANA_MASUK_URL = '/main/table_data_transaksi_hari_ini/new?layout=simple&target=2';
    const MAKS_TUNGGU_MS = 20 * 1000;
    const fmtRp = (n) => 'Rp ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dua = (n) => (n < 10 ? '0' : '') + n;
    const rapih = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
    const angkaRp = (s) => parseFloat(String(s).replace(/,/g, '')) || 0;
    const detik = (ms) => (ms / 1000).toFixed(1) + ' dtk';

    const gayaHome = document.createElement('style');
    gayaHome.textContent = '@keyframes aistim_home_putar{to{transform:rotate(360deg)}}' +
        '.aistim_home_sync{display:inline-block;margin-right:5px;line-height:1;animation:aistim_home_putar .8s linear infinite}' +
        '.aistim_home_segar{display:inline-block;margin-left:6px;line-height:1;cursor:pointer;opacity:.7;font-weight:400}' +
        '.aistim_home_segar:hover,.aistim_home_segar:focus{opacity:1}' +
        '.aistim_home_segar.memuat{cursor:default;opacity:1;animation:aistim_home_putar .8s linear infinite}';
    document.head.appendChild(gayaHome);
    function ikonSync() {
        const e = document.createElement('span');
        e.className = 'aistim_home_sync';
        e.textContent = '↻';
        return e;
    }
    function buatTombolSegar(judulKartu) {
        const b = document.createElement('span');
        b.className = 'aistim_home_segar';
        b.setAttribute('role', 'button');
        b.setAttribute('tabindex', '0');
        b.title = 'Muat ulang';
        b.textContent = '↻';
        judulKartu.appendChild(b);
        return b;
    }
    function el(tag, atribut, anak) {
        const e = document.createElement(tag);
        Object.keys(atribut || {}).forEach((k) => {
            if (k === 'teks') e.textContent = atribut[k];
            else if (k === 'gaya') e.style.cssText = atribut[k];
            else e.setAttribute(k, atribut[k]);
        });
        (anak || []).forEach((a) => e.appendChild(a));
        return e;
    }

    const KARTU_REKAP = [
        { id: 'servis', label: 'Penerimaan Piutang Servis', attr: 'data-aistim-servis', ambil: ambilServisPiutang, satuan: 'nota' },
        { id: 'piutang', label: 'Penerimaan Piutang Penjualan', attr: 'data-aistim-piutang', url: '/laporans/rekap_piutang/new',
          form: 'pencarian_rekap_piutang', tipe: /penerimaan/i, judul: /rekap\s*piutang\s*penerimaan/i },
        { id: 'hutang', label: 'Pembayaran Hutang', attr: 'data-aistim-hutang', url: '/laporans/rekap_hutang/new',
          form: 'pencarian_rekap_hutang', tipe: /pembayaran/i, judul: /rekap\s*pembayaran\s*hutang/i },
        { id: 'pendapatan_lain', label: 'Pendapatan Lain-Lain', attr: 'data-aistim-pendapatan-lain', url: '/jurnals?id=new',
          ambil: ambilPendapatanLain, satuan: 'jurnal' }
    ];
    const kartuRekap = {};

    // ---------- Penerimaan Piutang Servis: Detail Dana Masuk hari ini, baris "Pembayaran Piutang Usaha", kolom Debit ----------
    const MAKS_MUAT_LEBIH = 300;            // batas klik "Muat Lebih Banyak"
    const MAKS_MUAT_MS = 3 * 60 * 1000;     // batas waktu total memuat daftar Dana Masuk
    async function ambilServisPiutang() {
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:1400px;border:0;opacity:0;pointer-events:none';
        fr.setAttribute('aria-hidden', 'true');
        document.body.appendChild(fr);
        try {
            fr.src = DANA_MASUK_URL;
            await tungguDi(() => {
                const d = fr.contentDocument;
                return d && d.readyState === 'complete' && d.querySelector('table tbody tr');
            }, 40000, 'halaman Dana Masuk tidak termuat');
            // Muat Lebih Banyak: klik sampai tombolnya hilang; tunggu jumlah baris bertambah di tiap klik
            // Tombol di iframe tersembunyi tidak punya offsetParent, jadi jangan dicek visibilitasnya.
            // Berhenti bila tombol hilang atau klik tidak menambah baris (berarti sudah habis).
            // Kalau berhenti karena batas waktu / batas klik, daftar belum lengkap: dicatat di kartu (bukan angka yang dianggap pasti).
            let lengkap = true;
            const batasWaktu = Date.now() + MAKS_MUAT_MS;
            for (let i = 0; ; i++) {
                const d = fr.contentDocument;
                const btn = d.getElementById('load_more_manual');
                if (!btn) break;
                if (i >= MAKS_MUAT_LEBIH || Date.now() > batasWaktu) { lengkap = false; break; }
                const sebelum = d.querySelectorAll('table tbody tr').length;
                btn.click();
                try {
                    await tungguDi(() => fr.contentDocument.querySelectorAll('table tbody tr').length > sebelum,
                        15000, 'Muat Lebih Banyak tidak berjalan');
                } catch (e) { break; }
                await tidur(300);
            }
            const d = fr.contentDocument;
            const tabel = Array.from(d.querySelectorAll('table')).filter((t) =>
                Array.from(t.querySelectorAll('thead th, thead td')).some((x) => /^keterangan$/i.test(rapih(x.textContent))))
                .sort((a, b) => b.querySelectorAll('tbody tr').length - a.querySelectorAll('tbody tr').length)[0];
            if (!tabel) throw new Error('tabel Dana Masuk tidak ditemukan');
            const hdr = Array.from(tabel.querySelectorAll('thead th, thead td')).map((x) => rapih(x.textContent));
            const iJurnal = hdr.findIndex((h) => /^no jurnal$/i.test(h));
            const iTgl = hdr.findIndex((h) => /^tanggal transaksi$/i.test(h));
            const iKet = hdr.findIndex((h) => /^keterangan$/i.test(h));
            const iDebit = hdr.findIndex((h) => /^debit$/i.test(h));
            if (iKet < 0 || iDebit < 0) throw new Error('kolom Keterangan/Debit tidak ditemukan');
            let total = 0;
            const baris = [];
            tabel.querySelectorAll('tbody tr').forEach((tr) => {
                const c = tr.cells;
                if (c.length <= Math.max(iKet, iDebit)) return;
                const ket = rapih(c[iKet].textContent);
                if (!/^pembayaran piutang usaha/i.test(ket)) return;
                const dbt = angkaRp(rapih(c[iDebit].textContent).replace(/Rp/i, ''));
                total += dbt;
                baris.push([iJurnal >= 0 ? rapih(c[iJurnal].textContent) : '', iTgl >= 0 ? rapih(c[iTgl].textContent) : '', ket, fmtRp(dbt)]);
            });
            // Urutkan: nota terbaru di atas (format tanggal dd-mm-yyyy hh:mm:ss)
            const waktu = (s) => {
                const m = /(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/.exec(s || '');
                return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime() : 0;
            };
            baris.sort((a, b) => waktu(b[1]) - waktu(a[1]));
            return {
                total: total, labelTotal: 'Total Pembayaran Piutang Usaha', potongan: 0, jumlah: baris.length,
                kolom: ['No Jurnal', 'Tanggal Transaksi', 'Keterangan', 'Debit'], baris: baris,
                catatan: lengkap ? [] : ['daftar Dana Masuk belum termuat semua (batas waktu/klik "Muat Lebih Banyak"), total bisa kurang; klik ↻ untuk coba lagi']
            };
        } finally {
            fr.remove();
        }
    }

    // ---------- kartu laporan rekap — semuanya hari ini ----------
    const awalHariIni = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
    const tglHariIni = () => { const d = new Date(); return dua(d.getDate()) + '-' + dua(d.getMonth() + 1) + '-' + d.getFullYear(); };
    function tglFormatSama(contoh, d) {
        const dd = dua(d.getDate()), mm = dua(d.getMonth() + 1), yy = d.getFullYear();
        if (/^\d{4}-\d{2}-\d{2}$/.test(contoh)) return yy + '-' + mm + '-' + dd;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(contoh)) return dd + '/' + mm + '/' + yy;
        return dd + '-' + mm + '-' + yy;
    }

    function setNilaiForm(e, nilai) {
        e.value = nilai;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
    }
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

    function labelRadio(r) {
        const doc = r.ownerDocument;
        const lbl = (r.id && doc.querySelector('label[for="' + r.id + '"]')) || r.closest('label');
        if (lbl) return rapih(lbl.textContent);
        let t = '', n = r.nextSibling;
        while (n && !(n.nodeType === 1 && n.matches('input')) && t.length < 60) { t += n.textContent || ''; n = n.nextSibling; }
        return rapih(t);
    }
    function pilihRadio(form, nama, pola) {
        const r = Array.from(form.querySelectorAll('input[type="radio"]')).find((x) => x.name === nama && pola.test(labelRadio(x)));
        if (!r) return false;
        if (!r.checked) r.click();
        return true;
    }

    const teksHalaman = (doc) => rapih((doc.body && (doc.body.innerText || doc.body.textContent)) || '');
    const POLA_KOSONG = /total\s*data\s*0(?!\d)|tidak\s*ada\s*data|data\s*tidak\s*(ada|ditemukan)|no\s*data\s*available|belum\s*ada\s*(data|transaksi)/i;

    function ekstrakRekap(doc, cfg, bolehTanpaRekap, segar) {
        const teks = teksHalaman(doc);
        const rekap = Array.from(teks.matchAll(/rekapitulasi\s*([^:]{3,60}?)\s*:\s*Rp\s*([\d.,]+)/gi)).pop();
        const tabel = Array.from(doc.querySelectorAll('table'))
            .filter((t) => Array.from(t.querySelectorAll('thead th, thead td')).some((x) => /^no faktur$/i.test(rapih(x.textContent))))
            .sort((a, b) => b.querySelectorAll('tbody tr').length - a.querySelectorAll('tbody tr').length)[0];
        const kolom = tabel ? Array.from(tabel.querySelectorAll('thead th, thead td')).map((x) => rapih(x.textContent)) : [];
        const baris = [];
        if (tabel) tabel.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.cells.length < Math.max(3, kolom.length - 1)) return;
            baris.push(Array.from(tr.cells).map((c) => rapih(c.textContent)));
        });
        if ((!rekap || angkaRp(rekap[2]) === 0) && !baris.length) {
            return segar && (POLA_KOSONG.test(teks) || bolehTanpaRekap) ? { total: 0, labelTotal: 'Total', potongan: 0, jumlah: 0, kolom: kolom, baris: [] } : null;
        }
        if (!cfg.judul.test(teks)) return null;
        if (!rekap && !bolehTanpaRekap) return null;
        const mPot = /total\s*potongan\s*:\s*Rp\s*([\d.,]+)/i.exec(teks);
        const mJml = /total\s*data\s*([\d.,]+)/i.exec(teks);
        return {
            total: rekap ? angkaRp(rekap[2]) : 0,
            labelTotal: rekap ? rapih(rekap[1]) : 'Total',
            potongan: mPot ? angkaRp(mPot[1]) : 0,
            jumlah: mJml ? parseInt(mJml[1].replace(/[.,]/g, ''), 10) : baris.length,
            kolom: kolom,
            baris: baris
        };
    }

    function adaJudulHariIni(teks) {
        const BULAN_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const d = awalHariIni();
        const t = '0?' + d.getDate() + '\\s*-\\s*' + BULAN_EN[d.getMonth()] + '\\s*-\\s*' + d.getFullYear();
        return new RegExp('(^|\\D)' + t + '\\s*s\\s*/\\s*d\\s*' + t + '(\\D|$)', 'i').test(teks);
    }

    async function ambilRekap(cfg) {
        const tMulai = Date.now();
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:1400px;border:0;opacity:0;pointer-events:none';
        fr.setAttribute('aria-hidden', 'true');
        document.body.appendChild(fr);
        try {
            fr.src = cfg.url;
            const form = await tungguDi(() => {
                const d = fr.contentDocument;
                return d && d.readyState === 'complete' && d.getElementById(cfg.form);
            }, 40000, 'halaman laporan tidak termuat');
            if (!pilihRadio(form, 'laporan[jenis_rekap]', cfg.tipe)) throw new Error('pilihan Tipe Rekap tidak ditemukan');
            pilihRadio(form, 'laporan[jenis_tanggal]', /jurnal/i);
            const kolomDari = form.querySelector('[name="laporan[tanggal_dari]"]') || Array.from(form.querySelectorAll('input[name]')).find((x) => /^laporan\[tanggal[^\]]*(dari|awal|mulai)/i.test(x.name));
            const kolomSampai = form.querySelector('[name="laporan[tanggal_sampai]"]') || Array.from(form.querySelectorAll('input[name]')).find((x) => /^laporan\[tanggal[^\]]*(sampai|akhir)/i.test(x.name));
            if (!kolomDari) throw new Error('kolom Dari Periode tidak ditemukan');
            const hariIni = tglFormatSama(rapih(kolomDari.value), awalHariIni());
            setNilaiForm(kolomDari, hariIni);
            if (kolomSampai) setNilaiForm(kolomSampai, hariIni);
            const docAwal = fr.contentDocument;
            const teksTombol = (b) => rapih(b.textContent) || rapih(b.value || '');
            const tombol = docAwal.getElementById('bt_filter') ||
                           Array.from(docAwal.querySelectorAll('button, input[type="submit"], input[type="button"], a')).find((b) => /^filter$/i.test(teksTombol(b))) ||
                           docAwal.querySelector('.bt_filter') ||
                           form.querySelector('button[type="submit"], input[type="submit"]');
            const tHalaman = Date.now();
            if (tombol) tombol.click(); else if (form.requestSubmit) form.requestSubmit(); else form.submit();
            const hasil = await tungguDi(() => {
                const d = fr.contentDocument;
                if (!d || d.readyState !== 'complete') return null;
                const lama = Date.now() - tHalaman;
                const segar = d !== docAwal || adaJudulHariIni(teksHalaman(d));
                if (!segar && lama < 10000) return null;
                return ekstrakRekap(d, cfg, lama > 12000, segar);
            }, 45000, 'hasil laporan tidak muncul');
            console.log('[home.js] ' + cfg.label + ': halaman ' + detik(tHalaman - tMulai) + ', filter+hasil ' + detik(Date.now() - tHalaman));
            return hasil;
        } finally {
            fr.remove();
        }
    }

    const AKUN_PENDAPATAN = [
        { nama: 'Pendapatan Lain', cari: 'Pendapatan Lain', cocok: (t) => /pendapatan\s*lain/i.test(t), cadanganKet: 'Pendapatan Lain-lain', wajib: true },
        { nama: 'Pendapatan Bunga', cari: 'Bunga', cocok: (t) => /bunga/i.test(t) && !/beban|biaya/i.test(t) },
        { nama: 'Pendapatan Sewa', cari: 'Sewa', cocok: (t) => /sewa/i.test(t) && !/beban|biaya/i.test(t) }
    ];

    function inputSetelahLabel(root, pola) {
        const lbl = Array.from(root.querySelectorAll('label, span, div, td, th, b, p')).find((e) => e.children.length === 0 && pola.test(rapih(e.textContent)));
        if (!lbl) return null;
        return Array.from(root.querySelectorAll('input[type="text"], input:not([type]), textarea'))
            .find((x) => lbl.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) || null;
    }

    async function pilihAutocomplete(input, teks, polaItem) {
        const doc = input.ownerDocument;
        const cocok = typeof polaItem === 'function' ? polaItem : (t) => polaItem.test(t);
        input.focus();
        input.value = teks;
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'n' }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'n' }));
        const item = await tungguDi(() => Array.from(doc.querySelectorAll('.ui-autocomplete .ui-menu-item'))
            .find((li) => li.offsetParent !== null && cocok(rapih(li.textContent))), 8000, 'pilihan Akun tidak muncul');
        const target = item.querySelector('a, div') || item;
        ['mouseover', 'mouseenter', 'mousemove'].forEach((t) => target.dispatchEvent(new MouseEvent(t, { bubbles: true })));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await tidur(400);
    }

    function bacaTabelJurnal(doc) {
        const tabel = Array.from(doc.querySelectorAll('table')).filter((t) => {
            const th = Array.from(t.querySelectorAll('thead th, thead td')).map((x) => rapih(x.textContent).toLowerCase());
            return th.indexOf('no voucher') >= 0 && th.indexOf('keterangan') >= 0;
        }).sort((a, b) => b.querySelectorAll('tbody tr').length - a.querySelectorAll('tbody tr').length)[0];
        if (!tabel) return null;
        const kolom = Array.from(tabel.querySelectorAll('thead th, thead td')).map((x) => rapih(x.textContent));
        const baris = [];
        tabel.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.cells.length < Math.max(3, kolom.length - 1)) return;
            baris.push(Array.from(tr.cells).map((c) => rapih(c.textContent)));
        });
        return { kolom: kolom, baris: baris };
    }
    const sidikTabel = (doc) => { const t = bacaTabelJurnal(doc); return t ? t.baris.length + '|' + (t.baris[0] || []).join('|') : ''; };

    async function ambilPendapatanLain(cfg) {
        // berurutan seperti manual (Pendapatan Lain, lalu Bunga, lalu Sewa): filter Daftar Jurnal bisa disimpan di sesi
        // server, jadi kalau dijalankan bersamaan hasil satu akun bisa tertimpa filter akun lain
        const hasil = [];
        for (const akun of AKUN_PENDAPATAN) {
            try { hasil.push({ status: 'fulfilled', value: await ambilJurnalAkun(cfg, akun) }); }
            catch (e) { hasil.push({ status: 'rejected', reason: e }); }
        }
        let kolom = null;
        const baris = [], catatan = [], dilihat = new Set();
        hasil.forEach((h, i) => {
            const akun = AKUN_PENDAPATAN[i];
            if (h.status === 'rejected') {
                if (akun.wajib) throw h.reason;
                catatan.push(akun.nama + ': ' + h.reason.message);
                return;
            }
            kolom = kolom || h.value.kolom;
            const iVoucher = h.value.kolom.findIndex((k) => /^no voucher$/i.test(k));
            h.value.baris.forEach((b) => {
                const k = b[iVoucher] || b.join('|');
                if (dilihat.has(k)) return;
                dilihat.add(k);
                baris.push([akun.nama].concat(b));
            });
        });
        kolom = ['Akun'].concat(kolom || []);
        const iTotal = kolom.findIndex((k) => /^total$/i.test(k));
        const total = baris.reduce((n, b) => { const m = /Rp\s*([\d.,]+)/.exec(b[iTotal] || ''); return n + (m ? angkaRp(m[1]) : 0); }, 0);
        if (catatan.length) console.warn('[home.js] Pendapatan Lain-Lain tidak lengkap: ' + catatan.join('; '));
        return { total: total, labelTotal: 'Total Pendapatan Lain-Lain (Lain + Bunga + Sewa)', potongan: 0, jumlah: baris.length, kolom: kolom, baris: baris, catatan: catatan };
    }

    async function ambilJurnalAkun(cfg, akun) {
        const tMulai = Date.now();
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:1400px;border:0;opacity:0;pointer-events:none';
        fr.setAttribute('aria-hidden', 'true');
        document.body.appendChild(fr);
        const tungguBerganti = async (docAwal, sidikAwal, ms) => {
            await tungguDi(() => {
                const d = fr.contentDocument;
                if (!d || d.readyState !== 'complete') return false;
                return (d !== docAwal && bacaTabelJurnal(d)) || (d === docAwal && sidikTabel(d) !== sidikAwal);
            }, ms, '').catch(() => {});
            await tidur(500);
        };
        try {
            fr.src = cfg.url;
            const tombol = await tungguDi(() => {
                const d = fr.contentDocument;
                return d && d.readyState === 'complete' && d.getElementById('bt_filter_pencarian_jurnal');
            }, 40000, 'halaman Daftar Jurnal tidak termuat');
            const doc = fr.contentDocument;
            const form = tombol.closest('form') || doc.body;
            const rTrx = Array.from(form.querySelectorAll('input[type="radio"]')).find((x) => /tanggal\s*transaksi/i.test(labelRadio(x)));
            if (rTrx && !rTrx.checked) rTrx.click();
            const kolomTgl = Array.from(form.querySelectorAll('input')).filter((x) =>
                /hasDatepicker|tanggal/i.test(x.className) || /^\d{2}[-\/]\d{2}[-\/]\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(rapih(x.value)));
            if (kolomTgl.length < 2) throw new Error('kolom Periode tidak ditemukan');
            const hariIni = tglFormatSama(rapih(kolomTgl[0].value), awalHariIni());
            setNilaiForm(kolomTgl[0], hariIni);
            setNilaiForm(kolomTgl[1], hariIni);
            const kolomAkun = inputSetelahLabel(form, /^akun\s*:?$/i);
            let lewatAkun = false, galatAkun = 'kolom Akun tidak ditemukan';
            if (kolomAkun) {
                try { await pilihAutocomplete(kolomAkun, akun.cari, akun.cocok); lewatAkun = true; } catch (e) { galatAkun = 'akun tidak ditemukan di pilihan Akun'; kolomAkun.value = ''; }
            }
            if (!lewatAkun) {
                const kolomKet = akun.cadanganKet && inputSetelahLabel(form, /^keterangan\s*:?$/i);
                if (!kolomKet) throw new Error(galatAkun);
                setNilaiForm(kolomKet, akun.cadanganKet);
            }
            const docAwal = fr.contentDocument, sidikAwal = sidikTabel(docAwal);
            const tFilter = Date.now();
            tombol.click();
            await tungguBerganti(docAwal, sidikAwal, 15000);
            const daftar = [], dilihat = new Set();
            let kolom = [], jumlahData = null;
            for (let hal = 0; hal < 60; hal++) {
                const d = fr.contentDocument;
                const t = bacaTabelJurnal(d);
                if (!t) throw new Error('tabel Daftar Jurnal tidak ditemukan');
                kolom = t.kolom;
                const iVoucher = kolom.findIndex((k) => /^no voucher$/i.test(k));
                t.baris.forEach((b) => { const k = b[iVoucher] || b.join('|'); if (!dilihat.has(k)) { dilihat.add(k); daftar.push(b); } });
                const teks = teksHalaman(d);
                const mJml = /menampilkan/i.test(teks) ? /dari\s*(?:total\s*data\s*)?([\d.,]+)/i.exec(teks.replace(/.*menampilkan/i, '')) : null;
                if (mJml) jumlahData = parseInt(mJml[1].replace(/[.,]/g, ''), 10);
                if (jumlahData != null && daftar.length >= jumlahData) break;
                const elTabel = Array.from(d.querySelectorAll('table')).find((x) => x.contains(d.querySelector('tbody tr')) && bacaTabelJurnal(d));
                const setelahTabel = (x) => !elTabel || (elTabel.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
                const cocokLanjut = (x) => /^(selanjutnya|next|›|»|→)/i.test(rapih(x.textContent)) && setelahTabel(x) &&
                    !/disabled/i.test(x.className + ' ' + (x.parentElement ? x.parentElement.className : ''));
                const lanjut = Array.from(d.querySelectorAll('a, button')).find(cocokLanjut) || Array.from(d.querySelectorAll('li, span')).find(cocokLanjut);
                if (!lanjut) break;
                const sidik = sidikTabel(d);
                lanjut.click();
                await tungguBerganti(d, sidik, 15000);
                if (fr.contentDocument === d && sidikTabel(d) === sidik) break;
            }
            const iKet = kolom.findIndex((k) => /^keterangan$/i.test(k));
            if (kolom.findIndex((k) => /^total$/i.test(k)) < 0) throw new Error('kolom Total tidak ditemukan');
            const bukan = iKet < 0 ? 0 : daftar.filter((b) => !/pendapatan|bunga|sewa/i.test(b[iKet] || '')).length;
            if (bukan > Math.max(2, daftar.length * 0.2)) throw new Error('filter Akun ' + akun.nama + ' tidak jalan (' + bukan + ' jurnal lain ikut di hasil)');
            console.log('[home.js] ' + akun.nama + ': halaman ' + detik(tFilter - tMulai) + ', filter+baca ' + detik(Date.now() - tFilter) + ', ' + daftar.length + ' jurnal');
            return { kolom: kolom, baris: daftar };
        } finally {
            fr.remove();
        }
    }

    function tampilRekap(s) {
        const d = s.data;
        s.utama.textContent = fmtRp(d.total);
        s.kedua.textContent = d.jumlah ? d.jumlah + ' ' + (s.cfg.satuan || 'nota') + ' hari ini' : 'Tidak ada ' + (s.cfg.satuan || 'nota') + ' hari ini';
        s.kartu.title = d.labelTotal + ' hari ini (' + tglHariIni() + ')' +
            (d.potongan ? ' · Total Potongan ' + fmtRp(d.potongan) : '') + ' — klik baris ' + (s.cfg.satuan || 'nota') + ' untuk melihat daftar' +
            (d.catatan && d.catatan.length ? '\nCatatan: ' + d.catatan.join('; ') : '');
        // angka belum lengkap diberi tanda ⚠ supaya tidak dikira pasti
        if (d.catatan && d.catatan.length) s.kedua.textContent += ' ⚠';
    }

    function tandaMemuat(s) {
        if (s.segar) {
            s.segar.classList.toggle('memuat', s.jalan);
            s.segar.title = s.jalan ? 'Memuat ...' : 'Muat ulang ' + s.cfg.label + ' hari ini';
        }
        s.utama.style.opacity = s.jalan ? '.5' : '';
    }

    async function muatRekap(s) {
        if (!s.kartu || !document.body.contains(s.kartu) || s.jalan) return;
        s.jalan = true;
        if (!s.data) s.kedua.textContent = 'memuat hari ini ...';
        tandaMemuat(s);
        if (s.popup) isiPopupRekap(s);
        perbaruiSegarRekap(s);
        const t0 = Date.now();
        try {
            s.data = await (s.cfg.ambil || ambilRekap)(s.cfg);
            s.galat = '';
            tampilRekap(s);
            console.log('[home.js] ' + s.cfg.label + ' selesai dalam ' + detik(Date.now() - t0));
        } catch (err) {
            s.galat = err.message;
            if (!s.data) { s.utama.textContent = 'Rp -'; s.kedua.textContent = 'Gagal: ' + err.message; }
            s.kartu.title = 'Gagal memuat ' + s.cfg.label + ': ' + err.message;
            console.warn('[home.js] ' + s.cfg.label + ': ' + err.message);
        } finally {
            s.jalan = false;
            tandaMemuat(s);
            if (s.popup) isiPopupRekap(s);
            perbaruiSegarRekap(s);
        }
    }

    function rapikanKartu(k) {
        k.style.textDecoration = 'none';
        k.querySelectorAll('*').forEach((e) => { e.style.textDecoration = 'none'; });
    }

    const BUATAN_SENDIRI = '[data-aistim-servis], [data-aistim-piutang], [data-aistim-hutang], [data-aistim-pendapatan-lain]';
    function cariKartuAsli() {
        const labels = Array.from(document.querySelectorAll('.label_transaksi')).filter((e) => !e.closest(BUATAN_SENDIRI));
        if (!labels.length) return null;
        let x = labels[labels.length - 1];
        while (x && x.parentElement && x.parentElement !== document.body) {
            const induk = x.parentElement;
            const saudara = Array.from(induk.children).filter((c) => !c.matches(BUATAN_SENDIRI) && (c.querySelector('.label_transaksi') || c.classList.contains('label_transaksi')));
            if (saudara.length >= 2) return { kartu: x, induk: induk, daftar: saudara };
            x = induk;
        }
        return null;
    }

    function daunTeks(root) {
        return Array.from(root.querySelectorAll('*')).filter((e) => e.children.length === 0 && (e.textContent || '').trim() !== '');
    }

    function bersihkanPemicu(root) {
        [root].concat(Array.from(root.querySelectorAll('*'))).forEach((e) => {
            Array.from(e.attributes).forEach((a) => {
                const n = a.name.toLowerCase();
                if (/^on/.test(n) || n === 'href' || n === 'target' || n === 'role' || /^data-(toggle|target|url|remote|href|link|bs-|dialog|popup|modal)/.test(n)) e.removeAttribute(a.name);
            });
        });
    }

    function bangunDariSalinan(asal, opsi) {
        const salinan = asal.kartu.cloneNode(true);
        bersihkanPemicu(salinan);
        salinan.removeAttribute('id');
        salinan.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
        salinan.querySelectorAll('canvas, svg, img').forEach((e) => e.remove());
        salinan.setAttribute(opsi.attr, '1');
        const lbl = salinan.matches('.label_transaksi') ? salinan : salinan.querySelector('.label_transaksi');
        if (!lbl) return null;
        lbl.textContent = opsi.label;
        const angka = daunTeks(salinan).filter((e) => e !== lbl && !lbl.contains(e) && /\d/.test(e.textContent));
        let utama = angka[0] || null;
        angka.slice(1).forEach((e) => { e.textContent = ''; });
        if (!utama) {
            utama = document.createElement('div');
            utama.style.cssText = 'font-weight:700;font-size:1.4em;';
            lbl.parentNode.insertBefore(utama, lbl.nextSibling);
        }
        utama.textContent = opsi.placeholder;
        const kedua = document.createElement('div');
        kedua.style.cssText = 'font-size:13px;font-weight:600;color:#666;margin-top:2px;display:block;';
        kedua.textContent = 'memuat hari ini ...';
        utama.parentNode.insertBefore(kedua, utama.nextSibling);
        const segar = buatTombolSegar(lbl);
        return { kartu: salinan, saldo: utama, keluar: kedua, segar: segar };
    }

    function bangunSederhana(opsi) {
        const k = document.createElement('div');
        k.setAttribute(opsi.attr, '1');
        k.style.cssText = 'display:inline-block;margin:8px;padding:10px 16px;border:1px solid #cfe2ff;border-left:4px solid #0d6efd;border-radius:4px;background:#f3f8ff;font-family:inherit;';
        const l = document.createElement('div');
        l.textContent = opsi.label;
        l.style.cssText = 'font-size:12px;font-weight:600;color:#555;';
        const n = document.createElement('div');
        n.textContent = opsi.placeholder;
        n.style.cssText = 'font-size:20px;font-weight:700;';
        const kedua = document.createElement('div');
        kedua.style.cssText = 'font-size:13px;font-weight:600;color:#666;margin-top:2px;display:block;';
        kedua.textContent = 'memuat hari ini ...';
        const segar = buatTombolSegar(l);
        k.appendChild(l);
        k.appendChild(n);
        k.appendChild(kedua);
        return { kartu: k, saldo: n, keluar: kedua, segar: segar };
    }

    // Kartu rekap disisipkan berurutan; kartu pertama menggantikan posisi kartu PPOB lama
    function pasangKartuRekap() {
        const asal = cariKartuAsli();
        if (!asal) return false;
        let sebelum = null;
        for (const cfg of KARTU_REKAP) {
            let s = kartuRekap[cfg.id];
            if (!s || !s.kartu || !document.body.contains(s.kartu)) {
                const opsi = { label: cfg.label, attr: cfg.attr, placeholder: 'Rp ...' };
                const hasil = bangunDariSalinan(asal, opsi) || bangunSederhana(opsi);
                if (sebelum) sebelum.parentNode.insertBefore(hasil.kartu, sebelum.nextSibling);
                else asal.induk.insertBefore(hasil.kartu, asal.daftar[asal.daftar.length - 1].nextSibling);
                rapikanKartu(hasil.kartu);
                hasil.keluar.style.cursor = 'pointer';
                hasil.keluar.style.textDecoration = 'underline dotted';
                s = s || { cfg: cfg, data: null, galat: '', jalan: false, popup: null };
                s.kartu = hasil.kartu;
                s.utama = hasil.saldo;
                s.kedua = hasil.keluar;
                s.segar = hasil.segar;
                kartuRekap[cfg.id] = s;
                if (s.data) tampilRekap(s);
                else if (s.jalan) s.kedua.textContent = 'memuat hari ini ...';
                else muatRekap(s);
                tandaMemuat(s);
            }
            sebelum = s.kartu;
        }
        return true;
    }

    function isiPopupRekap(s) {
        if (!s.popup) return;
        s.popup.judul.textContent = s.cfg.label + ' — hari ini (' + tglHariIni() + ')';
        const isi = s.popup.isi;
        isi.textContent = '';
        if (!s.data) {
            if (s.galat && !s.jalan) {
                isi.appendChild(el('div', { teks: 'Gagal memuat: ' + s.galat, gaya: 'padding:18px;color:#dc3545' }));
            } else {
                const memuat = el('div', { gaya: 'padding:22px 18px;color:#555;display:flex;align-items:center;font-size:14px' });
                const ik = ikonSync();
                ik.style.fontSize = '20px';
                ik.style.marginRight = '10px';
                memuat.appendChild(ik);
                memuat.appendChild(document.createTextNode('Memuat ' + s.cfg.label.toLowerCase() + ' ...'));
                isi.appendChild(memuat);
            }
            return;
        }
        const d = s.data;
        isi.appendChild(el('div', { gaya: 'padding:8px 12px;background:#f3f8ff;border-bottom:1px solid #dbe7f7;font-size:13px', teks:
            d.jumlah + ' ' + (s.cfg.satuan || 'nota') + ' · ' + d.labelTotal + ' ' + fmtRp(d.total) + (d.potongan ? ' · Total Potongan ' + fmtRp(d.potongan) : '') +
            (d.baris.length < d.jumlah ? ' (daftar di bawah: ' + d.baris.length + ' teratas, selengkapnya di halaman laporan)' : '') }));
        if (d.catatan && d.catatan.length) {
            isi.appendChild(el('div', { gaya: 'padding:6px 12px;background:#fff8e1;border-bottom:1px solid #f3e1a6;font-size:12px;color:#7a5b00', teks: 'Catatan: ' + d.catatan.join('; ') }));
        }
        if (!d.baris.length) {
            isi.appendChild(el('div', { teks: 'Tidak ada ' + (s.cfg.satuan || 'nota') + ' hari ini.', gaya: 'padding:18px;color:#555' }));
            return;
        }
        const idx = d.kolom.map((k, i) => i).filter((i) => d.kolom[i] && !/^no$/i.test(d.kolom[i]));
        const kanan = (k) => /total|diterima|dibayar|nominal|jumlah|debit/i.test(k);
        const tabel = el('table', { gaya: 'width:100%;border-collapse:collapse;font-size:12px' }, [
            el('thead', {}, [el('tr', {}, idx.map((i) => el('th', { teks: d.kolom[i], gaya: 'position:sticky;top:0;background:#eef0f4;padding:6px 8px;border-bottom:1px solid #cfd4dc;white-space:nowrap;text-align:' + (kanan(d.kolom[i]) ? 'right' : 'left') })))])
        ]);
        const tb = el('tbody');
        d.baris.forEach((b) => {
            tb.appendChild(el('tr', {}, idx.map((i) => el('td', { teks: b[i] || '', gaya: 'padding:5px 8px;border-bottom:1px solid #eceff3;vertical-align:top;' + (kanan(d.kolom[i]) ? 'text-align:right;' : '') }))));
        });
        tabel.appendChild(tb);
        isi.appendChild(tabel);
    }

    function perbaruiSegarRekap(s) {
        if (!s.popup) return;
        const b = s.popup.segar;
        b.textContent = '';
        if (s.jalan) b.appendChild(ikonSync());
        b.appendChild(document.createTextNode(s.jalan ? 'Memuat ...' : '↻ Muat ulang'));
        b.disabled = s.jalan;
        b.style.opacity = s.jalan ? '.6' : '';
        b.style.cursor = s.jalan ? 'default' : 'pointer';
    }

    function tutupPopupRekap(s) {
        if (s.popup) { s.popup.lapisan.remove(); s.popup = null; }
        document.removeEventListener('keydown', s.tekan, true);
    }

    function bukaPopupRekap(s) {
        if (s.popup) return;
        const lapisan = el('div', { gaya: 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px' });
        const kotak = el('div', { gaya: 'background:#fff;color:#222;width:min(1100px,100%);max-height:88vh;display:flex;flex-direction:column;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.4);font:13px sans-serif;overflow:hidden' });
        const bTutup = el('button', { type: 'button', teks: '×', gaya: 'border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#666' });
        const judul = el('b');
        const kepala = el('div', { gaya: 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #ddd' }, [judul, bTutup]);
        const isi = el('div', { gaya: 'overflow:auto;flex:1;min-height:80px' });
        const sumber = s.cfg.url || DANA_MASUK_URL;
        const bBuka = el('a', { href: sumber, target: '_blank', rel: 'noopener', teks: 'Buka Laporan', gaya: 'padding:6px 14px;border-radius:4px;background:#0d6efd;color:#fff;text-decoration:none;cursor:pointer' });
        const bSegar = el('button', { type: 'button', teks: '↻ Muat ulang', gaya: 'padding:6px 14px;border:1px solid #b6d4fe;border-radius:4px;background:#fff;color:#0d6efd;cursor:pointer' });
        const bTutup2 = el('button', { type: 'button', teks: 'Tutup', gaya: 'padding:6px 14px;border:0;border-radius:4px;background:#64748b;color:#fff;cursor:pointer' });
        const kaki = el('div', { gaya: 'display:flex;gap:8px;justify-content:flex-end;padding:10px 12px;border-top:1px solid #ddd' }, [bSegar, bBuka, bTutup2]);
        kotak.appendChild(kepala); kotak.appendChild(isi); kotak.appendChild(kaki);
        lapisan.appendChild(kotak);
        document.body.appendChild(lapisan);
        s.popup = { lapisan: lapisan, isi: isi, segar: bSegar, judul: judul };
        s.tekan = s.tekan || ((e) => { if (e.key === 'Escape') tutupPopupRekap(s); });
        bTutup.addEventListener('click', () => tutupPopupRekap(s));
        bTutup2.addEventListener('click', () => tutupPopupRekap(s));
        bSegar.addEventListener('click', () => { s.data = null; s.galat = ''; isiPopupRekap(s); muatRekap(s); });
        lapisan.addEventListener('mousedown', (e) => { if (e.target === lapisan) tutupPopupRekap(s); });
        document.addEventListener('keydown', s.tekan, true);
        isiPopupRekap(s);
        if (!s.data && !s.jalan) muatRekap(s);
        perbaruiSegarRekap(s);
    }

    // ====== HAK AKSES & FITUR (JSON) ======
    // public  = semua user. private = hanya role yang punya fitur itu ("*" = semua).
    // Fitur private: kartuRekap (4 kartu rekap), auditAistim (tombol Aistim Audit).
    const AKSES_JSON = `{
        "public": ["tombolMenu"],
        "private": ["kartuRekap", "auditAistim"],
        "role": {
            "pusat": {
                "nama": ["SURYO", "SENTOT", "PUGUH", "DIMAS", "MANAJEMEN PUSAT"],
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
            console.error('[home.js] AKSES_JSON tidak valid -> akses ditutup:', err.message);
            return { public: [], role: [] };
        }
    }
    const AKSES = bacaAkses();
    const RE_LABEL_USER = /^[A-Z][A-Z.' -]{2,60}\([^()]{2,40}\)$/;
    function namaUser() {
        const kasir = document.getElementById('info_kasir');
        if (kasir) return rapih(kasir.textContent).toLowerCase();
        const semua = document.querySelectorAll('label, a, span, div, button');
        for (const e of semua) {
            if (e.children.length) continue;
            const t = rapih(e.textContent);
            if (RE_LABEL_USER.test(t)) return t.toLowerCase();
        }
        return '';
    }
    const cocokNama = (daftar) => { const n = namaUser(); return !!n && daftar.some((u) => n.indexOf(u.toLowerCase()) !== -1); };
    function bolehFitur(fitur) {
        if (AKSES.public.indexOf(fitur) !== -1) return true;
        for (const r of AKSES.role) {
            if (cocokNama(r.nama)) return r.fitur.indexOf('*') !== -1 || r.fitur.indexOf(fitur) !== -1;
        }
        return false;
    }

    function segarkanKartu(k) {
        if (!k) return;
        const s = Object.values(kartuRekap).find((x) => x.kartu === k);
        if (s) muatRekap(s);
    }

    document.addEventListener('click', (e) => {
        const k = e.target && e.target.closest && e.target.closest(BUATAN_SENDIRI);
        if (!k) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.target.closest('.aistim_home_segar')) { segarkanKartu(k); return; }
        const s = Object.values(kartuRekap).find((x) => x.kedua && x.kedua.contains(e.target));
        if (s) bukaPopupRekap(s);
    }, true);
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const b = e.target && e.target.closest && e.target.closest('.aistim_home_segar');
        if (!b) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        segarkanKartu(b.closest(BUATAN_SENDIRI));
    }, true);

    const mulai = Date.now();
    const pemeriksa = setInterval(() => {
        const habis = Date.now() - mulai > MAKS_TUNGGU_MS;
        const siap = bolehFitur('kartuRekap') && pasangKartuRekap();
        if (siap || habis) clearInterval(pemeriksa);
    }, 400);
    setInterval(() => {
        if (bolehFitur('kartuRekap')) pasangKartuRekap();
    }, 2000);

    // ====== TOMBOL MENU BERANDA ======
    if (bolehFitur('tombolMenu')) {
      const EXTRA = [
        { after: 'Produk',       icon: 'fa-archive',        text: 'Lihat stok',        href: '/produk_gudangs/lihat_stok/new' },
        { after: 'Pembelian',    icon: 'fa-file-text',      text: 'Data PO',           href: '/pemesanans' },
        { after: 'Penjualan',    icon: 'fa-check-square-o', text: 'Proses Pesanan',    href: '/pesanan_penjualans/index_proses_pesanan_start/new' },
        { after: 'POS',          icon: 'fa-wrench',         text: 'Smart Repair',      href: '/servis_elektroniks/new' },
        { after: 'Laba Rugi',    icon: 'fa-balance-scale',  text: 'Neraca',            href: '/laporans/neraca/new' },
        { after: 'Hitung Kas',   icon: 'fa-exchange',       text: 'Transfer Kas/Bank', href: '/jurnals/form_transfer_kas_bank/new' }
      ];
      const ALL_TILES = ['Produk', 'Pembelian', 'Penjualan', 'POS', 'Laba Rugi', 'Hitung Kas',
        'Lihat stok', 'Data PO', 'Proses Pesanan', 'Smart Repair', 'Neraca', 'Transfer Kas/Bank'];
      const findLink = (text) =>
        [...document.querySelectorAll('a')].find(a => a.querySelector('span')?.textContent.trim() === text);
      function addButtons() {
        EXTRA.forEach(item => {
          const id = 'erzap-btn-' + item.text.toLowerCase().replace(/[^a-z]+/g, '-');
          if (document.getElementById(id)) return;
          const anchor = findLink(item.after);
          if (!anchor) return;
          const panel = anchor.closest('.panel');
          if (!panel) return;
          const clone = panel.cloneNode(true);
          const a = clone.querySelector('a');
          a.id = id;
          a.href = item.href;
          a.querySelector('i').className = 'fa ' + item.icon;
          a.querySelector('span').textContent = item.text;
          panel.insertAdjacentElement('afterend', clone);
        });
      }
      function normalizeTiles() {
        ALL_TILES.forEach(t => {
          const a = findLink(t);
          if (!a) return;
          const panel = a.closest('.panel');
          const body = panel.querySelector('.panel-body');
          body.style.cssText = 'height:98px;box-sizing:border-box;padding:0 6px;overflow:hidden;display:flex;align-items:center;justify-content:center;';
          a.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;text-align:center;';
          const s = a.querySelector('span');
          if (t === 'Transfer Kas/Bank') {
            s.style.cssText = 'font-size:13px;line-height:16px;white-space:normal;word-break:break-word;display:block;margin-top:4px;padding:0 4px;';
          } else {
            s.style.cssText = 'font-size:14px;line-height:20px;white-space:nowrap;display:block;margin-top:4px;';
          }
          a.querySelector('i').style.fontSize = '25px';
        });
      }
      function run() { addButtons(); normalizeTiles(); }
      run();
      document.addEventListener('click', () => {
        setTimeout(() => { if (!document.getElementById('erzap-btn-lihat-stok')) run(); }, 300);
      }, true);
    }

    // ====== TOMBOL AISTIM AUDIT (daftar: Cek Pemindahan, Stok Negatif) — fitur private "auditAistim" ======
    // Tombol asli Cek Pemindahan (.cg-bulk) dan Stok Negatif (#sm-bar) dibuat skrip lain; di sini keduanya disembunyikan
    // dan dipanggil lewat menu. Hanya dipasang untuk role yang boleh, supaya user lain tetap memakai tombol aslinya.
    function pasangAudit() {
        const refresh = document.getElementById('bt_load_informasi_hari_ini');
        if (!refresh) return false;
        if (document.getElementById('aistim-audit-btn')) return true;
        const induk = refresh.parentElement;
        const asli = () => ({ neg: induk.querySelector('#sm-bar'), pem: induk.querySelector('.cg-bulk') });
        const sembunyi = () => Object.values(asli()).forEach((t) => { if (t) t.style.display = 'none'; });
        sembunyi();
        new MutationObserver(() => {
            if (Object.values(asli()).some((t) => t && t.style.display !== 'none')) sembunyi();
        }).observe(induk, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        const a = refresh.cloneNode(true);
        a.id = 'aistim-audit-btn';
        a.querySelector('i').className = 'fa fa-3x fa-fw fa-search';
        a.querySelector('.load_text').textContent = 'Aistim Audit';
        a.style.position = 'relative';
        a.style.marginLeft = '6px';
        a.insertAdjacentHTML('beforeend', '<span class="fa fa-caret-down" style="margin-left:6px"></span>');
        const menu = document.createElement('div');
        menu.id = 'aistim-audit-menu';
        menu.style.cssText = 'display:none;position:absolute;top:100%;right:0;margin-top:4px;min-width:190px;background:#fff;border:1px solid #cfd4dc;border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.18);z-index:2000;text-align:left;overflow:hidden';
        const item = (ikon, teks, aksi) => {
            const d = document.createElement('div');
            d.style.cssText = 'padding:9px 14px;cursor:pointer;font-size:13px;color:#212529;white-space:nowrap';
            d.innerHTML = '<i class="fa fa-fw ' + ikon + '" style="margin-right:8px;color:#0d6efd"></i>' + teks;
            d.onmouseenter = () => { d.style.background = '#eef4ff'; };
            d.onmouseleave = () => { d.style.background = ''; };
            d.addEventListener('click', (e) => { e.stopPropagation(); menu.style.display = 'none'; aksi(); });
            return d;
        };
        const klik = (t) => { if (!t) return; const b = t.querySelector('button'); (b || t).click(); };
        menu.appendChild(item('fa-exchange', 'Cek Pemindahan', () => klik(asli().pem)));
        menu.appendChild(item('fa-exclamation-triangle', 'Stok Negatif', () => klik(asli().neg)));
        a.appendChild(menu);
        a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; });
        document.addEventListener('click', (e) => { if (!a.contains(e.target)) menu.style.display = 'none'; });
        refresh.insertAdjacentElement('afterend', a);
        return true;
    }
    const mulaiAudit = Date.now();
    const pemeriksaAudit = setInterval(() => {
        if (Date.now() - mulaiAudit > 30000) { clearInterval(pemeriksaAudit); return; }
        // nama kasir bisa dimuat belakangan, jadi akses dicek ulang tiap putaran
        if (bolehFitur('auditAistim') && pasangAudit()) clearInterval(pemeriksaAudit);
    }, 500);
})();
