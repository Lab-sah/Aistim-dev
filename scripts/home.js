// ==UserScript==
// @name         Erzap - Home & Peringatan Saldo PPOB
// @namespace    http://tampermonkey.net/
// @version      1.16.0
// @description  Halaman Home (Transaksi Hari Ini): kartu stats "PPOB" di samping kartu Penjualan + Servis / Beban / Dana Masuk / Dana Keluar, berisi "Saldo (nilai)" (dari /main/check_balance_ppob/new, merah bila Rp 5 juta ke bawah) dan di bawahnya "Transaksi hari ini" (jumlah Saldo Digunakan transaksi PPOB sukses hari ini, dibaca dari Aktifitas PPOB); klik baris transaksi = popup daftar transaksi PPOB hari ini + tombol ke Aktifitas PPOB. Di sebelah kanan kartu PPOB: kartu "Penerima Piutang" (total "Total Diterima" hari ini dari Laporan Rekap Piutang Penerimaan /laporans/rekap_piutang/new, form pencariannya dibaca lalu tanggal di-set ke hari ini); klik baris "N transaksi hari ini" = popup log (Pelanggan, Outlet, No Faktur, Log Transaksi, Total Diterima) + tombol ke Rekap Piutang. Saldo Rp 5 juta ke bawah: popup peringatan muncul di SEMUA halaman Erzap (saat halaman dibuka, lalu diulang tiap 5 menit sampai saldo diisi) HANYA untuk user SURYO/SENTOT/MANAJEMEN PUSAT (dibaca dari label nama+jabatan user login); kartu PPOB & Penerima Piutang hanya di Home. Tidak jalan di halaman Login.
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window) return;
    // Jendela cetak / nota / popup (layout=simple, /nota...) dilewati: peringatan tidak boleh muncul di sana
    if (/[?&]layout=/.test(location.search) || /\/nota/i.test(location.pathname)) return;
    // Halaman Login (belum ada sesi): jangan cek saldo PPOB dulu. Fetch ke endpoint yang butuh login akan
    // dibalas 401 oleh server, dan itu memicu modal "Login" bawaan Erzap muncul sendiri di atas halaman login.
    if (document.querySelector('input[type="password"]')) return;
    const DI_HOME = location.pathname === '/';   // kartu PPOB hanya di Home; popup peringatan saldo di semua halaman
    if (window.__aistimHome) return;
    window.__aistimHome = true;
    console.log('[home.js] v1.16.0 aktif di ' + location.pathname);

    const SALDO_URL = '/main/check_balance_ppob/new';
    const PPOB_URL = '/penjualans/aktifitas_ppob/new';
    const SALDO_TIAP_MS = 60 * 1000;
    const PENGELUARAN_TIAP_MS = 5 * 60 * 1000;
    const MAKS_HALAMAN = 20;              // batas halaman Aktifitas PPOB yang dibaca (50 baris per halaman)
    const MAKS_TUNGGU_MS = 20 * 1000;     // kartu stats bisa baru muncul setelah ajax selesai
    const LABEL = 'PPOB';
    const fmtRp = (n) => 'Rp ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dua = (n) => (n < 10 ? '0' : '') + n;
    const rapih = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

    let kartu = null;
    let saldoEl = null;         // baris nominal saldo
    let keluarEl = null;        // baris "Transaksi hari ini : ..."
    let teksKeluar = 'Transaksi hari ini : ...';

    // ikon sync (\u21BB) berputar untuk keadaan "memuat"
    const gayaHome = document.createElement('style');
    gayaHome.textContent = '@keyframes aistim_home_putar{to{transform:rotate(360deg)}}' +
        '.aistim_home_sync{display:inline-block;margin-right:5px;line-height:1;animation:aistim_home_putar .8s linear infinite}';
    document.head.appendChild(gayaHome);
    function ikonSync() {
        const e = document.createElement('span');
        e.className = 'aistim_home_sync';
        e.textContent = '\u21BB';
        return e;
    }
    // baris pengeluaran di kartu: ikon sync berputar di depan teks selama data dimuat
    function gambarKeluar() {
        if (!keluarEl) return;
        keluarEl.textContent = '';
        if (jalanKeluar) keluarEl.appendChild(ikonSync());
        keluarEl.appendChild(document.createTextNode(teksKeluar));
    }

    // ---------- saldo ----------
    async function ambilSaldo() {
        const res = await fetch(SALDO_URL, {
            credentials: 'same-origin', cache: 'no-store',
            headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        if (!j || j.status === false || typeof j.balance !== 'number') throw new Error((j && j.message) || 'saldo tidak terbaca');
        return j.balance;
    }

    let jalanSaldo = false, saldoTerbaca = false;
    async function muatSaldo() {
        if (jalanSaldo) return;
        if (DI_HOME && (!kartu || !document.body.contains(kartu))) return;   // di Home tunggu kartu terpasang dulu
        jalanSaldo = true;
        try {
            const saldo = await ambilSaldo();
            saldoTerbaca = true;
            periksaNotif(saldo);
            if (kartu && document.body.contains(kartu)) {
                saldoEl.textContent = 'Saldo (' + fmtRp(saldo) + ')';
                const rendah = saldo <= NOTIF_BATAS;
                saldoEl.style.color = rendah ? '#dc3545' : '';
                kartu.title = rendah ? 'Saldo PPOB Rp ' + (NOTIF_BATAS / 1000000) + ' juta ke bawah' : 'Saldo PPOB';
            }
        } catch (err) {
            if (kartu && document.body.contains(kartu)) {
                if (!saldoTerbaca) saldoEl.textContent = 'Saldo (-)';
                kartu.title = 'Gagal memuat saldo PPOB: ' + err.message;
            }
            console.warn('[home.js] saldo PPOB: ' + err.message);
        } finally {
            jalanSaldo = false;
        }
    }

    // ---------- pengeluaran hari ini: jumlah "Saldo Digunakan" transaksi sukses hari ini (tabel Aktifitas PPOB) ----------
    const tglHariIni = () => { const d = new Date(); return dua(d.getDate()) + '-' + dua(d.getMonth() + 1) + '-' + d.getFullYear(); };
    const keAngka = (t) => { const n = parseFloat(String(t || '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };

    // dokumen halaman Aktifitas PPOB -> baris {tgl, sukses, pakai}; kolom dikenali dari teks header (bukan urutan tetap)
    function barisDariDokumen(doc) {
        const tabel = doc.querySelector('#data_table');
        if (!tabel) return null;
        const th = Array.from(tabel.querySelectorAll('thead th, thead td')).map((x) => rapih(x.textContent).toLowerCase());
        const iStatus = th.findIndex((t) => t === 'status');
        const iPakai = th.findIndex((t) => /saldo digunakan/.test(t));
        const iLog = th.findIndex((t) => t === 'log');
        const iTrx = th.findIndex((t) => t === 'trx id');
        const iFaktur = th.findIndex((t) => t === 'no faktur');
        const iNomor = th.findIndex((t) => t === 'nomor transaksi');
        const iBarang = th.findIndex((t) => t === 'nama barang');
        if (iStatus < 0 || iPakai < 0 || iLog < 0) return null;
        const hasil = [];
        tabel.querySelectorAll('tbody tr').forEach((tr) => {
            const c = Array.from(tr.cells);
            if (c.length <= Math.max(iStatus, iPakai, iLog)) return;   // baris pesan kosong ("tidak ada data")
            const m = /(\d{2}-\d{2}-\d{4})/.exec(rapih(c[iLog].textContent));
            if (!m) return;
            // kunci unik baris: Trx Id (cadangan: No Faktur + LOG) -> dipakai membuang baris yang sama bila halaman terbaca berulang
            const kunci = iTrx >= 0 && c[iTrx] ? rapih(c[iTrx].textContent) : (iFaktur >= 0 && c[iFaktur] ? rapih(c[iFaktur].textContent) : '') + '|' + rapih(c[iLog].textContent);
            const sel = (i) => (i >= 0 && c[i] ? rapih(c[i].textContent) : '');
            const jam = /\d{2}-\d{2}-\d{4}\s+(\d{2}:\d{2}(?::\d{2})?)/.exec(rapih(c[iLog].textContent));
            // nomor faktur: teks link saja (sel faktur bisa memuat tulisan outlet dari skrip PPOB)
            const linkFaktur = iFaktur >= 0 && c[iFaktur] ? c[iFaktur].querySelector('a') : null;
            hasil.push({
                kunci: kunci, tgl: m[1], jam: jam ? jam[1] : '',
                sukses: /sukses/i.test(c[iStatus].textContent), status: sel(iStatus), pakai: keAngka(c[iPakai].textContent),
                faktur: linkFaktur ? rapih(linkFaktur.textContent) : sel(iFaktur), barang: sel(iBarang), nomor: sel(iNomor)
            });
        });
        return hasil;
    }

    // cadangan bila tabel diisi lewat skrip (tidak ada di HTML mentah): muat halamannya di iframe tersembunyi
    async function barisLewatIframe(halaman) {
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:900px;border:0;opacity:0;pointer-events:none';
        fr.setAttribute('aria-hidden', 'true');
        document.body.appendChild(fr);
        try {
            fr.src = PPOB_URL + '?page=' + halaman;
            const mulai = Date.now();
            for (;;) {
                let b = null;
                try { const d = fr.contentDocument; if (d && d.readyState === 'complete') b = barisDariDokumen(d); } catch (e) { b = null; }
                if (b && b.length) return b;
                if (Date.now() - mulai > 20000) return b || [];
                await tidur(400);
            }
        } finally {
            fr.remove();
        }
    }

    async function halamanPpob(n) {
        const res = await fetch(PPOB_URL + '?page=' + n, { credentials: 'same-origin', cache: 'no-store', headers: { 'Accept': 'text/html' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        let b = barisDariDokumen(doc);
        if ((!b || !b.length) && n === 1) b = await barisLewatIframe(1);   // HTML mentah tanpa baris: coba lewat halaman sungguhan
        return b || [];
    }

    async function hitungPengeluaran() {
        const hariIni = tglHariIni();
        const terlihat = new Set();
        let total = 0, jumlah = 0;
        const daftar = [];
        for (let n = 1; n <= MAKS_HALAMAN; n++) {
            const baris = await halamanPpob(n);
            if (!baris.length) break;
            let baru = 0, adaHariIni = false;
            baris.forEach((b) => {
                if (terlihat.has(b.kunci)) return;   // baris yang sudah dihitung (server mengabaikan ?page / halaman berulang)
                terlihat.add(b.kunci);
                baru++;
                if (b.tgl !== hariIni) return;
                adaHariIni = true;
                daftar.push(b);
                if (b.sukses) { total += b.pakai; jumlah++; }
            });
            if (!baru) break;          // halaman ini tidak membawa baris baru: sudah habis
            if (!adaHariIni) break;    // daftar urut terbaru -> halaman tanpa transaksi hari ini = sisanya lebih lama
        }
        return { total: total, jumlah: jumlah, daftar: daftar };
    }

    let jalanKeluar = false, keluarTerbaca = false;
    async function muatPengeluaran() {
        if (!kartu || !document.body.contains(kartu) || jalanKeluar) return;
        jalanKeluar = true;
        gambarKeluar();
        perbaruiSegar();
        try {
            const h = await hitungPengeluaran();
            keluarTerbaca = true;
            dataKeluar = h;
            if (popupBuka) isiPopup();
            teksKeluar = 'Transaksi hari ini : ' + fmtRp(h.total);
            keluarEl.title = h.jumlah + ' transaksi PPOB sukses hari ini (klik untuk melihat daftar transaksi)';
        } catch (err) {
            if (!keluarTerbaca) teksKeluar = 'Transaksi hari ini : -';
            keluarEl.title = 'Gagal memuat pengeluaran: ' + err.message;
            galatKeluar = err.message;
            if (popupBuka) isiPopup();
            console.warn('[home.js] pengeluaran PPOB: ' + err.message);
        } finally {
            jalanKeluar = false;
            gambarKeluar();
            perbaruiSegar();
        }
    }

    // ---------- kartu "Penerima Piutang": total "Total Diterima" hari ini dari Laporan Rekap Piutang (Penerimaan) ----------
    // /laporans/rekap_piutang/new — tidak otomatis "hari ini" begitu dibuka polos (dikonfirmasi manual), jadi form
    // pencariannya dibaca dulu (field lain dibiarkan default persis seperti form aslinya, sama seperti ppob.js baca
    // form pencarian /penjualans), lalu tanggal_dari/tanggal_sampai di-set ke hari ini saja sebelum di-submit (POST).
    // Tabel kolom: No | Voucher No | Tanggal Jurnal | No Faktur | Outlet | Pelanggan | Total Diterima | Log Transaksi.
    const REKAP_PIUTANG_URL = '/laporans/rekap_piutang/new';
    let piutangKartu = null, piutangUtama = null, piutangKedua = null;
    let jalanPiutang = false, piutangTerbaca = false;
    let dataPiutang = null, galatPiutang = '';   // dataPiutang.daftar dipakai popup log (klik baris "N transaksi hari ini")

    // "Total Diterima" cell: "Rp 493,000.00 Bank Transfer - BCA ..." (nominal + keterangan metode bayar nempel) -> ambil nominalnya saja
    const angkaDariRp = (t) => { const m = /Rp\s*([\d.,]+)/.exec(String(t || '')); return m ? (parseFloat(m[1].replace(/,/g, '')) || 0) : keAngka(t); };

    // Blok "Rekapitulasi" (Total Piutang Diterima / Total Potongan) dihitung oleh javascript Erzap setelah filter
    // dijalankan, jadi dibaca dari iframe tersembunyi yang beneran memuat halaman & klik Filter (bukan fetch HTML mentah).
    // Angkanya dicari di teks halaman yang sudah di-render (innerText, tanpa isi <script>), tidak tergantung markup:
    // "Total Piutang Diterima: Rp 136,702,063.00" -> 136702063.
    function angkaRekap(doc, labelPola) {
        const teks = rapih((doc.body && (doc.body.innerText || doc.body.textContent)) || '');
        const m = new RegExp(labelPola + '[^0-9]{0,40}?([0-9][0-9.,]*)', 'i').exec(teks);
        return m ? (parseFloat(m[1].replace(/,/g, '')) || 0) : null;
    }

    // tanggal hari ini dalam format yang sama dengan isi bawaan kolom tanggal (datepicker)
    function tglFormatSama(contoh) {
        const d = new Date(), dd = dua(d.getDate()), mm = dua(d.getMonth() + 1), yy = d.getFullYear();
        if (/^\d{4}-\d{2}-\d{2}$/.test(contoh)) return yy + '-' + mm + '-' + dd;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(contoh)) return dd + '/' + mm + '/' + yy;
        return dd + '-' + mm + '-' + yy;
    }

    function setNilaiForm(el, nilai) {
        el.value = nilai;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
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

    // teks label sebuah radio: <label for=id>, <label> pembungkus, atau teks setelah radio sampai input berikutnya
    function labelRadio(r) {
        const doc = r.ownerDocument;
        const lbl = (r.id && doc.querySelector('label[for="' + r.id + '"]')) || r.closest('label');
        if (lbl) return rapih(lbl.textContent);
        let t = '', n = r.nextSibling;
        while (n && !(n.nodeType === 1 && n.matches('input')) && t.length < 60) { t += n.textContent || ''; n = n.nextSibling; }
        return rapih(t);
    }
    // pilih radio bernama `nama` yang labelnya cocok `pola` (nilai radio tidak diketahui, jadi dicari dari labelnya)
    function pilihRadio(form, nama, pola) {
        const r = Array.from(form.querySelectorAll('input[type="radio"]')).find((x) => x.name === nama && pola.test(labelRadio(x)));
        if (!r) return false;
        if (!r.checked) r.click();
        return true;
    }

    // bolehTanpaRekap: setelah beberapa detik di halaman hasil, terima walau blok Rekapitulasi tidak ada (mis. tidak ada transaksi)
    function ekstrakRekapPiutang(doc, bolehTanpaRekap) {
        const teks = rapih((doc.body && (doc.body.innerText || doc.body.textContent)) || '');
        if (!/rekap\s*piutang\s*penerimaan/i.test(teks)) return null;   // hasil harus mode Tipe Rekap = Penerimaan Piutang
        const tabel = Array.from(doc.querySelectorAll('table')).find((t) => Array.from(t.querySelectorAll('thead th, thead td')).some((x) => /^total diterima$/i.test(rapih(x.textContent))));
        const totalResmi = angkaRekap(doc, 'total\\s*piutang\\s*diterima');
        if (!tabel || (totalResmi == null && !bolehTanpaRekap)) return null;   // belum halaman hasil -> tungguDi coba lagi
        // tabel dipaging 50 baris/halaman ("Menampilkan data 1 - 50 dari total data 804 Nota"): jumlah nota diambil dari situ
        const mJumlah = /total\s*data\s*([\d.,]+)/i.exec(teks);
        const jumlahNota = mJumlah ? parseInt(mJumlah[1].replace(/[.,]/g, ''), 10) : null;
        const th = Array.from(tabel.querySelectorAll('thead th, thead td')).map((x) => rapih(x.textContent).toLowerCase());
        const iFaktur = th.indexOf('no faktur');
        const iOutlet = th.indexOf('outlet');
        const iPelanggan = th.indexOf('pelanggan');
        const iTotal = th.indexOf('total diterima');
        const iLog = th.indexOf('log transaksi');
        if (iTotal < 0) return null;
        let totalBaris = 0;
        const daftar = [];
        tabel.querySelectorAll('tbody tr').forEach((tr) => {
            const c = Array.from(tr.cells);
            if (c.length <= Math.max(iTotal, iFaktur, iOutlet, iPelanggan, iLog)) return;   // baris pesan kosong ("tidak ada data")
            const sel = (i) => (i >= 0 && c[i] ? rapih(c[i].textContent) : '');
            const nilai = angkaDariRp(sel(iTotal));
            totalBaris += nilai;
            daftar.push({ faktur: sel(iFaktur), outlet: sel(iOutlet), pelanggan: sel(iPelanggan), total: nilai, log: sel(iLog) });
        });
        const potongan = angkaRekap(doc, 'total\\s*potongan');
        return { total: totalResmi != null ? totalResmi : totalBaris, totalBaris: totalBaris, potongan: potongan, jumlah: jumlahNota != null ? jumlahNota : daftar.length, daftar: daftar };
    }

    async function ambilPiutang() {
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:1400px;border:0;opacity:0;pointer-events:none';
        fr.setAttribute('aria-hidden', 'true');
        document.body.appendChild(fr);
        try {
            fr.src = REKAP_PIUTANG_URL;
            const form = await tungguDi(() => {
                const d = fr.contentDocument;
                return d && d.readyState === 'complete' && d.getElementById('pencarian_rekap_piutang');
            }, 40000, 'halaman Rekap Piutang tidak termuat');
            const kolomDari = form.querySelector('[name="laporan[tanggal_dari]"]') || Array.from(form.querySelectorAll('input[name]')).find((el) => /^laporan\[tanggal[^\]]*(dari|awal|mulai)/i.test(el.name));
            const kolomSampai = form.querySelector('[name="laporan[tanggal_sampai]"]') || Array.from(form.querySelectorAll('input[name]')).find((el) => /^laporan\[tanggal[^\]]*(sampai|akhir)/i.test(el.name));
            if (!kolomDari) throw new Error('kolom tanggal dari tidak ditemukan');
            // setelan sesuai halaman asli: Tipe Rekap = Penerimaan Piutang, Dasar Filter Periode = Tanggal Jurnal
            if (!pilihRadio(form, 'laporan[jenis_rekap]', /penerimaan/i)) throw new Error('pilihan Tipe Rekap "Penerimaan Piutang" tidak ditemukan');
            pilihRadio(form, 'laporan[jenis_tanggal]', /jurnal/i);
            const hariIni = tglFormatSama(rapih(kolomDari.value));
            setNilaiForm(kolomDari, hariIni);
            if (kolomSampai) setNilaiForm(kolomSampai, hariIni);
            // tombol "Filter" (tombol biru di bawah form); cadangan: pembungkus .bt_filter / submit form
            const docAwal = fr.contentDocument;
            const teksTombol = (b) => rapih(b.textContent) || rapih(b.value || '');
            const tombol = Array.from(docAwal.querySelectorAll('button, input[type="submit"], input[type="button"]')).find((b) => /^filter$/i.test(teksTombol(b))) ||
                           Array.from(docAwal.querySelectorAll('a, .bt_filter')).find((b) => /^filter$/i.test(teksTombol(b))) ||
                           docAwal.querySelector('.bt_filter') ||
                           form.querySelector('button[type="submit"], input[type="submit"]');
            if (tombol) tombol.click(); else if (form.requestSubmit) form.requestSubmit(); else form.submit();
            // Filter = submit POST -> dokumen baru di iframe. Tunggu dokumen berganti (maks 10 dtk; kalau ternyata ajax, lanjut saja),
            // lalu baca hasilnya berulang sampai Rekapitulasi terbaca.
            await tungguDi(() => fr.contentDocument && fr.contentDocument !== docAwal && fr.contentDocument.readyState === 'complete', 10000, '').catch(() => {});
            const mulaiHasil = Date.now();
            return await tungguDi(() => {
                const d = fr.contentDocument;
                return d && d.readyState === 'complete' && ekstrakRekapPiutang(d, Date.now() - mulaiHasil > 5000);
            }, 40000, 'hasil Rekap Piutang tidak muncul');
        } finally {
            fr.remove();
        }
    }

    async function muatPiutang() {
        if (!piutangKartu || !document.body.contains(piutangKartu) || jalanPiutang) return;
        jalanPiutang = true;
        if (popupPiutangBuka) isiPopupPiutang();
        perbaruiSegarPiutang();
        try {
            const h = await ambilPiutang();
            piutangTerbaca = true;
            dataPiutang = h;
            galatPiutang = '';
            if (popupPiutangBuka) isiPopupPiutang();
            piutangUtama.textContent = fmtRp(h.total);
            piutangKedua.textContent = h.jumlah + ' nota hari ini';
            piutangKartu.title = h.jumlah + ' transaksi penerimaan piutang hari ini' + (h.potongan ? ' · Total Potongan ' + fmtRp(h.potongan) : '') + ' (klik untuk melihat daftar)';
        } catch (err) {
            if (!piutangTerbaca) {
                piutangUtama.textContent = 'Rp -';
                piutangKedua.textContent = 'Gagal: ' + err.message;   // tampil langsung di kartu supaya penyebabnya kelihatan
            }
            piutangKartu.title = 'Gagal memuat Penerima Piutang: ' + err.message;
            galatPiutang = err.message;
            if (popupPiutangBuka) isiPopupPiutang();
            console.warn('[home.js] penerima piutang: ' + err.message);
        } finally {
            jalanPiutang = false;
            perbaruiSegarPiutang();
        }
    }

    // kartu disisipkan tepat di sebelah kanan kartu PPOB; butuh kartu PPOB sudah terpasang dulu
    function pasangPiutang() {
        if (document.querySelector('[data-aistim-piutang]')) return true;
        if (!kartu || !document.body.contains(kartu)) return false;
        const asal = cariKartuAsli();
        const opsi = { label: 'Penerima Piutang', attr: 'data-aistim-piutang', placeholder: 'Rp ...' };
        let hasil = asal ? bangunDariSalinan(asal, opsi) : null;
        if (!hasil) hasil = bangunSederhana(opsi);
        if (!hasil) return false;
        kartu.parentNode.insertBefore(hasil.kartu, kartu.nextSibling);
        hasil.kartu.style.textDecoration = 'none';
        hasil.kartu.querySelectorAll('*').forEach((e) => { e.style.textDecoration = 'none'; });
        piutangKartu = hasil.kartu;
        piutangUtama = hasil.saldo;
        piutangKedua = hasil.keluar;
        piutangKedua.style.cursor = 'pointer';
        piutangKedua.style.textDecoration = 'underline dotted';
        muatPiutang();
        return true;
    }

    // ---------- kartu tambahan di kanan Penerima Piutang (berurutan); sumber datanya belum diatur ----------
    const KARTU_TAMBAHAN = [
        { label: 'Pembayaran Hutang', attr: 'data-aistim-hutang' },
        { label: 'Pendapatan Lain-Lain', attr: 'data-aistim-pendapatan-lain' }
    ];
    function pasangKartuTambahan() {
        let sebelum = piutangKartu;
        if (!sebelum || !document.body.contains(sebelum)) return false;
        for (const k of KARTU_TAMBAHAN) {
            let ada = document.querySelector('[' + k.attr + ']');
            if (!ada) {
                const asal = cariKartuAsli();
                const opsi = { label: k.label, attr: k.attr, placeholder: 'Rp -' };
                const hasil = (asal && bangunDariSalinan(asal, opsi)) || bangunSederhana(opsi);
                hasil.keluar.textContent = 'sumber data belum diatur';
                hasil.kartu.title = k.label + ': sumber data belum diatur';
                sebelum.parentNode.insertBefore(hasil.kartu, sebelum.nextSibling);
                hasil.kartu.style.textDecoration = 'none';
                hasil.kartu.querySelectorAll('*').forEach((e) => { e.style.textDecoration = 'none'; });
                ada = hasil.kartu;
            }
            sebelum = ada;
        }
        return true;
    }

    // ---------- popup: daftar transaksi PPOB hari ini (klik baris "Transaksi hari ini") ----------
    let dataKeluar = null, galatKeluar = '', popupBuka = null;   // popupBuka = {lapisan, isi}

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

    function isiPopup() {
        if (!popupBuka) return;
        const isi = popupBuka.isi;
        isi.textContent = '';
        if (!dataKeluar) {
            if (galatKeluar) {
                isi.appendChild(el('div', { teks: 'Gagal memuat: ' + galatKeluar, gaya: 'padding:18px;color:#dc3545' }));
            } else {
                const memuat = el('div', { gaya: 'padding:22px 18px;color:#555;display:flex;align-items:center;font-size:14px' });
                const ik = ikonSync();
                ik.style.fontSize = '20px';
                ik.style.marginRight = '10px';
                memuat.appendChild(ik);
                memuat.appendChild(document.createTextNode('Memuat transaksi PPOB hari ini ...'));
                isi.appendChild(memuat);
            }
            return;
        }
        const d = dataKeluar;
        isi.appendChild(el('div', { gaya: 'padding:8px 12px;background:#f3f8ff;border-bottom:1px solid #dbe7f7;font-size:13px', teks: d.jumlah + ' transaksi sukses, pengeluaran ' + fmtRp(d.total) + ' (dari ' + d.daftar.length + ' transaksi hari ini)' }));
        if (!d.daftar.length) {
            isi.appendChild(el('div', { teks: 'Belum ada transaksi PPOB hari ini.', gaya: 'padding:18px;color:#555' }));
            return;
        }
        const th = (t, kanan) => el('th', { teks: t, gaya: 'position:sticky;top:0;background:#eef0f4;padding:6px 8px;border-bottom:1px solid #cfd4dc;text-align:' + (kanan ? 'right' : 'left') + ';white-space:nowrap' });
        const tabel = el('table', { gaya: 'width:100%;border-collapse:collapse;font-size:12px' }, [
            el('thead', {}, [el('tr', {}, [th('Jam'), th('No Faktur'), th('Barang'), th('Nomor'), th('Status'), th('Saldo Digunakan', true)])])
        ]);
        const tb = el('tbody');
        d.daftar.forEach((b) => {
            const warna = b.sukses ? '#198754' : (/error|gagal/i.test(b.status) ? '#dc3545' : '#0b7285');
            const td = (t, extra) => el('td', { teks: t, gaya: 'padding:5px 8px;border-bottom:1px solid #eceff3;' + (extra || '') });
            tb.appendChild(el('tr', {}, [
                td(b.jam), td(b.faktur, 'white-space:nowrap'), td(b.barang), td(b.nomor, 'white-space:nowrap'),
                td(b.status.replace(/^Transaksi\s+/i, ''), 'font-weight:600;color:' + warna),
                td(fmtRp(b.pakai), 'text-align:right;white-space:nowrap;' + (b.sukses ? '' : 'color:#999;text-decoration:line-through'))
            ]));
        });
        tabel.appendChild(tb);
        isi.appendChild(tabel);
    }

    // tombol Muat ulang: ikon sync berputar dan tombol nonaktif selama data dimuat
    function perbaruiSegar() {
        if (!popupBuka) return;
        const b = popupBuka.segar;
        b.textContent = '';
        if (jalanKeluar) b.appendChild(ikonSync());
        b.appendChild(document.createTextNode(jalanKeluar ? 'Memuat ...' : '\u21BB Muat ulang'));
        b.disabled = jalanKeluar;
        b.style.opacity = jalanKeluar ? '.6' : '';
        b.style.cursor = jalanKeluar ? 'default' : 'pointer';
    }

    function tutupPopup() {
        if (popupBuka) { popupBuka.lapisan.remove(); popupBuka = null; }
        document.removeEventListener('keydown', tekanTombol, true);
    }
    function tekanTombol(e) { if (e.key === 'Escape') tutupPopup(); }

    function bukaPopup() {
        if (popupBuka) return;
        const lapisan = el('div', { gaya: 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px' });
        const kotak = el('div', { gaya: 'background:#fff;color:#222;width:min(900px,100%);max-height:88vh;display:flex;flex-direction:column;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.4);font:13px sans-serif;overflow:hidden' });
        const bTutup = el('button', { type: 'button', teks: '×', gaya: 'border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#666' });
        const judul = el('div', { gaya: 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #ddd' }, [
            el('b', { teks: 'Transaksi PPOB hari ini (' + tglHariIni() + ')' }), bTutup
        ]);
        const isi = el('div', { gaya: 'overflow:auto;flex:1;min-height:80px' });
        const bBuka = el('a', { href: PPOB_URL, target: '_blank', rel: 'noopener', teks: 'Buka Aktifitas PPOB', gaya: 'padding:6px 14px;border-radius:4px;background:#0d6efd;color:#fff;text-decoration:none;cursor:pointer' });
        const bSegar = el('button', { type: 'button', teks: '↻ Muat ulang', gaya: 'padding:6px 14px;border:1px solid #b6d4fe;border-radius:4px;background:#fff;color:#0d6efd;cursor:pointer' });
        const bTutup2 = el('button', { type: 'button', teks: 'Tutup', gaya: 'padding:6px 14px;border:0;border-radius:4px;background:#64748b;color:#fff;cursor:pointer' });
        const kaki = el('div', { gaya: 'display:flex;gap:8px;justify-content:flex-end;padding:10px 12px;border-top:1px solid #ddd' }, [bSegar, bBuka, bTutup2]);
        kotak.appendChild(judul); kotak.appendChild(isi); kotak.appendChild(kaki);
        lapisan.appendChild(kotak);
        document.body.appendChild(lapisan);
        popupBuka = { lapisan: lapisan, isi: isi, segar: bSegar };
        bTutup.addEventListener('click', tutupPopup);
        bTutup2.addEventListener('click', tutupPopup);
        bSegar.addEventListener('click', () => { dataKeluar = null; galatKeluar = ''; isiPopup(); muatPengeluaran(); });
        lapisan.addEventListener('mousedown', (e) => { if (e.target === lapisan) tutupPopup(); });
        document.addEventListener('keydown', tekanTombol, true);
        isiPopup();
        if (!dataKeluar && !jalanKeluar) muatPengeluaran();
        perbaruiSegar();
    }

    // ---------- popup: log Penerima Piutang hari ini (klik baris "N transaksi hari ini") ----------
    let popupPiutangBuka = null;   // {lapisan, isi, segar}

    function isiPopupPiutang() {
        if (!popupPiutangBuka) return;
        const isi = popupPiutangBuka.isi;
        isi.textContent = '';
        if (!dataPiutang) {
            if (galatPiutang) {
                isi.appendChild(el('div', { teks: 'Gagal memuat: ' + galatPiutang, gaya: 'padding:18px;color:#dc3545' }));
            } else {
                const memuat = el('div', { gaya: 'padding:22px 18px;color:#555;display:flex;align-items:center;font-size:14px' });
                const ik = ikonSync();
                ik.style.fontSize = '20px';
                ik.style.marginRight = '10px';
                memuat.appendChild(ik);
                memuat.appendChild(document.createTextNode('Memuat penerimaan piutang hari ini ...'));
                isi.appendChild(memuat);
            }
            return;
        }
        const d = dataPiutang;
        isi.appendChild(el('div', { gaya: 'padding:8px 12px;background:#f3f8ff;border-bottom:1px solid #dbe7f7;font-size:13px', teks: d.jumlah + ' nota, Total Piutang Diterima ' + fmtRp(d.total) + (d.potongan ? ' · Total Potongan ' + fmtRp(d.potongan) : '') +
            (d.daftar.length < d.jumlah ? ' (daftar di bawah: ' + d.daftar.length + ' terbaru, selengkapnya di Rekap Piutang)' : '') }));
        if (!d.daftar.length) {
            isi.appendChild(el('div', { teks: 'Belum ada penerimaan piutang hari ini.', gaya: 'padding:18px;color:#555' }));
            return;
        }
        const th = (t, kanan) => el('th', { teks: t, gaya: 'position:sticky;top:0;background:#eef0f4;padding:6px 8px;border-bottom:1px solid #cfd4dc;text-align:' + (kanan ? 'right' : 'left') + ';white-space:nowrap' });
        const tabel = el('table', { gaya: 'width:100%;border-collapse:collapse;font-size:12px' }, [
            el('thead', {}, [el('tr', {}, [th('Pelanggan'), th('Outlet'), th('No Faktur'), th('Log Transaksi'), th('Total Diterima', true)])])
        ]);
        const tb = el('tbody');
        d.daftar.forEach((b) => {
            const td = (t, extra) => el('td', { teks: t, gaya: 'padding:5px 8px;border-bottom:1px solid #eceff3;' + (extra || '') });
            tb.appendChild(el('tr', {}, [
                td(b.pelanggan), td(b.outlet, 'white-space:nowrap'), td(b.faktur, 'white-space:nowrap'), td(b.log, 'white-space:nowrap'),
                td(fmtRp(b.total), 'text-align:right;white-space:nowrap')
            ]));
        });
        tabel.appendChild(tb);
        isi.appendChild(tabel);
    }

    function perbaruiSegarPiutang() {
        if (!popupPiutangBuka) return;
        const b = popupPiutangBuka.segar;
        b.textContent = '';
        if (jalanPiutang) b.appendChild(ikonSync());
        b.appendChild(document.createTextNode(jalanPiutang ? 'Memuat ...' : '↻ Muat ulang'));
        b.disabled = jalanPiutang;
        b.style.opacity = jalanPiutang ? '.6' : '';
        b.style.cursor = jalanPiutang ? 'default' : 'pointer';
    }

    function tutupPopupPiutang() {
        if (popupPiutangBuka) { popupPiutangBuka.lapisan.remove(); popupPiutangBuka = null; }
        document.removeEventListener('keydown', tekanTombolPiutang, true);
    }
    function tekanTombolPiutang(e) { if (e.key === 'Escape') tutupPopupPiutang(); }

    function bukaPopupPiutang() {
        if (popupPiutangBuka) return;
        const lapisan = el('div', { gaya: 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px' });
        const kotak = el('div', { gaya: 'background:#fff;color:#222;width:min(900px,100%);max-height:88vh;display:flex;flex-direction:column;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.4);font:13px sans-serif;overflow:hidden' });
        const bTutup = el('button', { type: 'button', teks: '×', gaya: 'border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#666' });
        const judul = el('div', { gaya: 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #ddd' }, [
            el('b', { teks: 'Penerima Piutang hari ini (' + tglHariIni() + ')' }), bTutup
        ]);
        const isi = el('div', { gaya: 'overflow:auto;flex:1;min-height:80px' });
        const bBuka = el('a', { href: REKAP_PIUTANG_URL, target: '_blank', rel: 'noopener', teks: 'Buka Rekap Piutang', gaya: 'padding:6px 14px;border-radius:4px;background:#0d6efd;color:#fff;text-decoration:none;cursor:pointer' });
        const bSegar = el('button', { type: 'button', teks: '↻ Muat ulang', gaya: 'padding:6px 14px;border:1px solid #b6d4fe;border-radius:4px;background:#fff;color:#0d6efd;cursor:pointer' });
        const bTutup2 = el('button', { type: 'button', teks: 'Tutup', gaya: 'padding:6px 14px;border:0;border-radius:4px;background:#64748b;color:#fff;cursor:pointer' });
        const kaki = el('div', { gaya: 'display:flex;gap:8px;justify-content:flex-end;padding:10px 12px;border-top:1px solid #ddd' }, [bSegar, bBuka, bTutup2]);
        kotak.appendChild(judul); kotak.appendChild(isi); kotak.appendChild(kaki);
        lapisan.appendChild(kotak);
        document.body.appendChild(lapisan);
        popupPiutangBuka = { lapisan: lapisan, isi: isi, segar: bSegar };
        bTutup.addEventListener('click', tutupPopupPiutang);
        bTutup2.addEventListener('click', tutupPopupPiutang);
        bSegar.addEventListener('click', () => { dataPiutang = null; galatPiutang = ''; isiPopupPiutang(); muatPiutang(); });
        lapisan.addEventListener('mousedown', (e) => { if (e.target === lapisan) tutupPopupPiutang(); });
        document.addEventListener('keydown', tekanTombolPiutang, true);
        isiPopupPiutang();
        if (!dataPiutang && !jalanPiutang) muatPiutang();
        perbaruiSegarPiutang();
    }

    // ---------- popup peringatan: saldo PPOB Rp 5 juta ke bawah ----------
    // Muncul saat Home pertama dibuka, lalu diulang tiap 5 menit selama saldo masih di bawah batas; berhenti (dan popup ditutup) setelah saldo diisi.
    // Hanya untuk user tertentu: nama/jabatan user yang login (label "NAMA (JABATAN)" di header) memuat salah satu kata ini.
    const NAMA_IZIN_NOTIF = ['SURYO', 'SENTOT', 'MANAJEMEN PUSAT'];
    // Label user login: elemen daun (tanpa anak) berpola "NAMA (JABATAN)", mis. "SENTOT ARI HANDOKO (STAF IT)"
    const RE_LABEL_USER = /^[A-Z][A-Z.' -]{2,60}\([^()]{2,40}\)$/;
    function labelUserAktif() {
        const semua = document.querySelectorAll('label, a, span, div, button');
        for (const e of semua) {
            if (e.children.length) continue;
            const t = rapih(e.textContent);
            if (RE_LABEL_USER.test(t)) return t;
        }
        return '';
    }
    function bolehNotifSaldo() {
        const label = labelUserAktif().toUpperCase();
        return !!label && NAMA_IZIN_NOTIF.some((n) => label.indexOf(n) !== -1);
    }
    const NOTIF_BATAS = 5000000;   // peringatan bila saldo sama dengan atau di bawah batas ini (5 juta ke bawah)
    const NOTIF_ULANG_MS = 5 * 60 * 1000;
    let notifTerakhir = 0;      // waktu popup terakhir ditampilkan (0 = belum pernah di halaman ini)
    let notifBuka = null;       // {lapisan, nilai}

    function tutupNotif() {
        if (notifBuka) { notifBuka.lapisan.remove(); notifBuka = null; }
        document.removeEventListener('keydown', tekanTombolNotif, true);
    }
    function tekanTombolNotif(e) { if (e.key === 'Escape') tutupNotif(); }

    function tampilNotif(saldo) {
        if (notifBuka) { notifBuka.nilai.textContent = fmtRp(saldo); return; }   // sudah terbuka: cukup perbarui angkanya
        const lapisan = el('div', { gaya: 'position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px' });
        const kotak = el('div', { gaya: 'background:#fff;color:#222;width:min(440px,100%);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.45);font:14px sans-serif;overflow:hidden;border-top:6px solid #dc3545' });
        const nilai = el('div', { teks: fmtRp(saldo), gaya: 'font-size:26px;font-weight:700;color:#dc3545;margin:6px 0' });
        const bTutup = el('button', { type: 'button', teks: 'Tutup', gaya: 'padding:7px 22px;border:0;border-radius:4px;background:#dc3545;color:#fff;font-size:14px;cursor:pointer' });
        kotak.appendChild(el('div', { gaya: 'padding:16px 18px 6px' }, [
            el('div', { teks: '⚠ Saldo PPOB Hampir Habis', gaya: 'font-size:17px;font-weight:700;color:#dc3545;margin-bottom:8px' }),
            el('div', { teks: 'Saldo PPOB saat ini:' }),
            nilai,
            el('div', { teks: 'Rp ' + NOTIF_BATAS.toLocaleString('en-US') + ' atau kurang. Segera isi saldo PPOB.', gaya: 'color:#555' }),
            el('div', { teks: 'Peringatan ini muncul lagi tiap 5 menit sampai saldo diisi.', gaya: 'color:#888;font-size:12px;margin-top:8px' })
        ]));
        kotak.appendChild(el('div', { gaya: 'display:flex;justify-content:flex-end;padding:10px 18px 16px' }, [bTutup]));
        lapisan.appendChild(kotak);
        document.body.appendChild(lapisan);
        notifBuka = { lapisan: lapisan, nilai: nilai };
        bTutup.addEventListener('click', tutupNotif);
        lapisan.addEventListener('mousedown', (e) => { if (e.target === lapisan) tutupNotif(); });
        document.addEventListener('keydown', tekanTombolNotif, true);
        bTutup.focus();
    }

    // dipanggil setiap saldo terbaca
    function periksaNotif(saldo) {
        if (saldo > NOTIF_BATAS) {        // saldo sudah diisi: berhenti mengingatkan
            notifTerakhir = 0;
            tutupNotif();
            return;
        }
        if (!bolehNotifSaldo()) return;   // bukan user yang diizinkan lihat popup peringatan saldo
        if (Date.now() - notifTerakhir >= NOTIF_ULANG_MS) {   // pertama terbaca (notifTerakhir = 0) langsung tampil
            notifTerakhir = Date.now();
            tampilNotif(saldo);
        } else if (notifBuka) {
            notifBuka.nilai.textContent = fmtRp(saldo);
        }
    }

    // ---------- cari kartu stats yang sudah ada (label_transaksi) ----------
    // Kartu = elemen anak dari baris yang sama dengan kartu lain; tiap kartu memuat satu .label_transaksi
    // Kartu buatan kita sendiri (PPOB / Penerima Piutang) punya class label_transaksi juga (hasil clone) -> disisihkan,
    // supaya tidak ikut ter-"temukan" sebagai kartu asli dan ter-clone ulang.
    const BUATAN_SENDIRI = '[data-aistim-saldo-ppob], [data-aistim-piutang], [data-aistim-hutang], [data-aistim-pendapatan-lain]';
    function cariKartuAsli() {
        const labels = Array.from(document.querySelectorAll('.label_transaksi')).filter((e) => !e.closest(BUATAN_SENDIRI));
        if (!labels.length) return null;
        let el = labels[labels.length - 1];
        while (el && el.parentElement && el.parentElement !== document.body) {
            const induk = el.parentElement;
            const saudara = Array.from(induk.children).filter((c) => !c.matches(BUATAN_SENDIRI) && (c.querySelector('.label_transaksi') || c.classList.contains('label_transaksi')));
            if (saudara.length >= 2) return { kartu: el, induk: induk, daftar: saudara };
            el = induk;
        }
        return null;
    }

    function daunTeks(root) {
        // elemen paling dalam yang berisi teks (tanpa anak elemen)
        return Array.from(root.querySelectorAll('*')).filter((e) => e.children.length === 0 && (e.textContent || '').trim() !== '');
    }

    // baris kedua (pengeluaran) memakai kelas yang sama dengan baris saldo, tapi lebih kecil
    function buatBarisKeluar(contoh) {
        const e = contoh.cloneNode(false);
        e.removeAttribute('id');
        e.textContent = 'Transaksi hari ini : ...';
        e.style.fontSize = '13px';
        e.style.fontWeight = '600';
        e.style.color = '#666';
        e.style.marginTop = '2px';
        e.style.display = 'block';
        return e;
    }

    // Salinan kartu ikut membawa pemicu klik bawaan Erzap (onclick, data-*, href) yang membuka popup
    // /main/table_data_transaksi_hari_ini/new?layout=simple&target=N. Pemicu itu dibuang dari salinan.
    function bersihkanPemicu(root) {
        [root].concat(Array.from(root.querySelectorAll('*'))).forEach((e) => {
            Array.from(e.attributes).forEach((a) => {
                const n = a.name.toLowerCase();
                if (/^on/.test(n) || n === 'href' || n === 'target' || n === 'role' || /^data-(toggle|target|url|remote|href|link|bs-|dialog|popup|modal)/.test(n)) e.removeAttribute(a.name);
            });
        });
    }

    // ---------- bangun kartu: salin kartu asli supaya tampilannya sama ----------
    // opsi: {label, attr, placeholder} — dipakai juga untuk kartu "Penerima Piutang" di samping kartu PPOB
    function bangunDariSalinan(asal, opsi) {
        opsi = opsi || {};
        const labelTeks = opsi.label || LABEL;
        const attr = opsi.attr || 'data-aistim-saldo-ppob';
        const placeholder = opsi.placeholder || 'Saldo (...)';
        const salinan = asal.kartu.cloneNode(true);
        bersihkanPemicu(salinan);
        salinan.removeAttribute('id');
        salinan.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));   // hindari id ganda
        salinan.querySelectorAll('canvas, svg, img').forEach((e) => e.remove());      // grafik/ikon milik kartu asli
        salinan.setAttribute(attr, '1');

        const lbl = salinan.matches('.label_transaksi') ? salinan : salinan.querySelector('.label_transaksi');
        if (!lbl) return null;
        lbl.textContent = labelTeks;

        // angka: daun teks pertama yang memuat digit; daun angka lain (persen/keterangan) dikosongkan
        const angka = daunTeks(salinan).filter((e) => e !== lbl && !lbl.contains(e) && /\d/.test(e.textContent));
        let utama = angka[0] || null;
        angka.slice(1).forEach((e) => { e.textContent = ''; });
        if (!utama) {
            utama = document.createElement('div');
            utama.style.cssText = 'font-weight:700;font-size:1.4em;';
            lbl.parentNode.insertBefore(utama, lbl.nextSibling);
        }
        utama.textContent = placeholder;
        const kedua = buatBarisKeluar(utama);
        utama.parentNode.insertBefore(kedua, utama.nextSibling);
        return { kartu: salinan, saldo: utama, keluar: kedua };
    }

    // ---------- cadangan: kartu sederhana bila susunan halaman tidak dikenali ----------
    function bangunSederhana(opsi) {
        opsi = opsi || {};
        const labelTeks = opsi.label || LABEL;
        const attr = opsi.attr || 'data-aistim-saldo-ppob';
        const placeholder = opsi.placeholder || 'Saldo (...)';
        const k = document.createElement('div');
        k.setAttribute(attr, '1');
        k.style.cssText = 'display:inline-block;margin:8px;padding:10px 16px;border:1px solid #cfe2ff;border-left:4px solid #0d6efd;border-radius:4px;background:#f3f8ff;font-family:inherit;';
        const l = document.createElement('div');
        l.textContent = labelTeks;
        l.style.cssText = 'font-size:12px;font-weight:600;color:#555;';
        const n = document.createElement('div');
        n.textContent = placeholder;
        n.style.cssText = 'font-size:20px;font-weight:700;';
        const kedua = buatBarisKeluar(n);
        k.appendChild(l);
        k.appendChild(n);
        k.appendChild(kedua);
        return { kartu: k, saldo: n, keluar: kedua };
    }

    function pasang(sederhana) {
        if (document.querySelector('[data-aistim-saldo-ppob]')) return true;
        const asal = cariKartuAsli();
        let hasil = null;
        if (asal && !sederhana) {
            hasil = bangunDariSalinan(asal);
            if (hasil) asal.induk.insertBefore(hasil.kartu, asal.daftar[asal.daftar.length - 1].nextSibling);
        }
        if (!hasil && sederhana) {
            hasil = bangunSederhana();
            if (asal) asal.induk.parentNode.insertBefore(hasil.kartu, asal.induk);
            else document.body.insertBefore(hasil.kartu, document.body.firstChild);
        }
        if (!hasil) return false;
        kartu = hasil.kartu;
        // tanpa garis bawah di seluruh kartu (CSS Erzap bisa menggarisbawahi elemen <a> salinan); hanya baris transaksi diberi garis titik-titik di bawah
        kartu.style.textDecoration = 'none';
        kartu.querySelectorAll('*').forEach((e) => { e.style.textDecoration = 'none'; });
        saldoEl = hasil.saldo;
        keluarEl = hasil.keluar;
        keluarEl.style.cursor = 'pointer';
        keluarEl.style.textDecoration = 'underline dotted';
        muatSaldo();
        muatPengeluaran();
        return true;
    }

    if (DI_HOME) {
        // Penangkap klik (fase capture, paling awal): klik di dalam kartu PPOB tidak boleh sampai ke penanganan klik bawaan Erzap
        // (yang akan memuat /main/table_data_transaksi_hari_ini/new?layout=simple&target=N). Hanya baris "Transaksi hari ini" membuka popup kita.
        document.addEventListener('click', (e) => {
            const k = e.target && e.target.closest && e.target.closest(BUATAN_SENDIRI);
            if (!k) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            if (keluarEl && keluarEl.contains(e.target)) bukaPopup();
            else if (piutangKedua && piutangKedua.contains(e.target)) bukaPopupPiutang();
        }, true);

        // tunggu kartu stats muncul; kalau sampai batas waktu tidak ada, pakai kartu sederhana
        const mulai = Date.now();
        const pemeriksa = setInterval(() => {
            const habis = Date.now() - mulai > MAKS_TUNGGU_MS;
            const siap = pasang(habis);
            if (siap) { pasangPiutang(); pasangKartuTambahan(); }   // disisipkan berurutan di sebelah kanan kartu PPOB
            if (siap || habis) clearInterval(pemeriksa);
        }, 400);
    }

    // saldo dicek di semua halaman (popup peringatan); kartu & pengeluaran hanya di Home
    setInterval(() => { if (!document.hidden) muatSaldo(); }, SALDO_TIAP_MS);
    if (!DI_HOME) muatSaldo();   // halaman lain: cek langsung saat dibuka (popup "pertama dibuka")
    if (DI_HOME) {
        setInterval(() => { if (!document.hidden) { muatPengeluaran(); muatPiutang(); } }, PENGELUARAN_TIAP_MS);
        // kartu stats bisa digambar ulang oleh halaman (ganti outlet/periode): pasang lagi bila kartu kita hilang
        setInterval(() => {
            if (kartu && !document.body.contains(kartu)) { kartu = null; piutangKartu = null; pasang(false); pasangPiutang(); }
            else if (!piutangKartu || !document.body.contains(piutangKartu)) { piutangKartu = null; pasangPiutang(); }
            pasangKartuTambahan();
        }, 2000);
    }
})();
