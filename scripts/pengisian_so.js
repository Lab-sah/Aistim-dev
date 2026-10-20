// ==UserScript==
// @name         Erzap - Pengisian SO
// @namespace    http://tampermonkey.net/
// @version      1.4.0
// @description  Kolom "Stok Sistem" di tabel Pengisian Hasil SO: diisi otomatis dari Total Stok di Lihat Stok, dengan filter barcode + gudang + outlet SO yang sedang dibuka
// @match        https://*.erzap.com/stok_opnams/proses_pengisian_hasil_so*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Halaman ini hanya memuat #form_container kosong; isi tabelnya diambil lewat AJAX
    // (POST /stok_opnams/fetch_detail_pengisian_so/new) dan bisa diganti lagi saat pindah halaman.
    // Karena itu script memantau #form_container dan menambah kolom tiap kali tabel muncul.
    //
    // Isi kolom: tiap baris -> barcode -> cari di Lihat Stok (GET /produk_gudangs/lihat_stok/new
    // dengan filter "Barcode/Nama Produk/Kode Ref", sama seperti yang dilakukan rakstok.js) ->
    // ambil ID produk dari sel td.bt_dialog_aktifitas_stok -> rincian stok per outlet/gudang
    // (GET /produk_gudangs/detail_stok/new, popup yang muncul saat angka stok diklik, dibaca seperti
    // di rakstok.js) -> tampilkan stok di gudang SO yang sedang dibuka. Nama field filter dibaca dari
    // form Lihat Stok sendiri (lewat teks labelnya), jadi tidak ditulis mati di sini.

    const NAMA_KOLOM = 'Stok Sistem';
    const PENANDA = 'data-aistim-stok-sistem';
    const URL_STOK = '/produk_gudangs/lihat_stok/new';
    const URL_RINCIAN = '/produk_gudangs/detail_stok/new';
    const MAKS_PARALEL = 3;   // jumlah request Erzap (pencarian / rincian) yang jalan bersamaan

    function log(...a) { console.log('[Aistim] Pengisian SO:', ...a); }

    // "1.234,5" -> 1234.5 (format angka Erzap, sama dengan rakstok.js)
    function angka(t) {
        const m = String(t || '').match(/-?[\d.,]+/);
        if (!m) return NaN;
        return parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
    }

    // ---------- barcode dari baris tabel SO ----------
    const mirip = (s) => /^[0-9A-Za-z][0-9A-Za-z\-_.\/]{2,}$/.test(s);   // satu kata tanpa spasi, bukan nama produk
    function teksSel(td) {
        if (!td) return '';
        const t = (td.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) return t;
        const inp = td.querySelector('input');
        return inp ? String(inp.value || '').trim() : '';
    }

    // Urutan: span.barcode_produk -> sel di kolom "Barcode" -> sel di sebelahnya (kanan, lalu kiri)
    // -> sel mana pun yang isinya angka 6+ digit.
    function bacaBarcode(tr, header) {
        const sp = tr.querySelector('span.barcode_produk');
        if (sp && sp.textContent.trim()) return sp.textContent.trim();
        const idx = Array.from(header.cells).findIndex((th) => /barcode/i.test(th.textContent));
        if (idx >= 0) {
            for (const i of [idx, idx + 1, idx - 1]) {
                const t = teksSel(tr.cells[i]);
                if (mirip(t)) return t;
            }
        }
        for (const td of Array.from(tr.cells)) {
            const t = teksSel(td);
            if (/^\d{6,}$/.test(t)) return t;
        }
        return '';
    }

    // ---------- pencarian di Lihat Stok ----------
    let formLihatStok = null;   // Promise<{ aksi, nama, dasar }>

    function siapkanForm() {
        if (formLihatStok) return formLihatStok;
        formLihatStok = (async () => {
            const res = await fetch(URL_STOK, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
            if (!res.ok) throw new Error('Halaman Lihat Stok HTTP ' + res.status);
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const form = doc.getElementById('form_pencarian_lihat_stok');
            if (!form) throw new Error('Form pencarian Lihat Stok tidak ketemu (sesi habis?)');

            // input teks pertama setelah tulisan "Barcode/Nama Produk/Kode Ref"
            const bisaDiisi = (i) => !['hidden', 'checkbox', 'radio', 'submit', 'button'].includes(i.type);
            const penanda = Array.from(form.querySelectorAll('*'))
                .find((e) => !e.children.length && /barcode\s*\/\s*nama/i.test(e.textContent));
            let input = null;
            if (penanda && penanda.tagName === 'LABEL' && penanda.htmlFor) input = doc.getElementById(penanda.htmlFor);
            if (!input && penanda) {
                input = Array.from(form.querySelectorAll('input')).find(
                    (i) => bisaDiisi(i) && (penanda.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING));
            }
            if (!input) {
                input = Array.from(form.querySelectorAll('input')).find(
                    (i) => bisaDiisi(i) && /barcode|nama|cari|search|kode/i.test((i.name || '') + ' ' + (i.id || '')));
            }
            const nama = input && (input.name || input.id);
            if (!nama) throw new Error('Kolom filter Barcode/Nama Produk di form Lihat Stok tidak ketemu');

            // Filter dikirim BERSIH: hanya kolom barcode yang diisi. Form yang dibaca dari server bisa
            // membawa filter terakhir dari tab lain (Erzap menyimpan di sesi login yang sama), jadi nilai
            // bawaannya tidak dipakai: kolom teks dikosongkan, pilihan diatur ke "Semua", dan hidden input
            // pasangan filter (outlet, gudang, supplier, kategori, merek, warna, ...) dikosongkan.
            // Hidden input lain (konstanta form) dibiarkan.
            const dasar = new URLSearchParams();
            form.querySelectorAll('input[name], select[name], textarea[name]').forEach((e) => {
                if (e.name === nama || e.name === 'page') return;
                if (['checkbox', 'radio', 'submit', 'button', 'image', 'file'].includes(e.type)) return;
                let nilai = '';
                if (e.tagName === 'SELECT') {
                    const opsi = Array.from(e.options);
                    const semua = opsi.find((o) => /semua/i.test(o.textContent)) || opsi[0];
                    nilai = semua ? semua.value : '';
                } else if (e.type === 'hidden' && !/outlet|gudang|supplier|kategori|merek|warna|ukuran|satuan|rak/i.test(e.name)) {
                    nilai = e.value;
                }
                dasar.set(e.name, nilai);
            });
            // Filter Gudang (select) dan Outlet (kolom teks pencarian), dicari lewat tulisan labelnya.
            // Dipakai untuk membatasi hasil ke gudang & outlet SO (lihat cariStok).
            const labelDi = (re) => Array.from(form.querySelectorAll('*'))
                .find((e) => !e.children.length && e.tagName !== 'OPTION' && re.test(e.textContent));
            const sesudah = (p, daftar) => Array.from(daftar).find((x) => p.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
            const pGudang = labelDi(/^\s*gudang\s*:?\s*$/i);
            const selGudang = pGudang && sesudah(pGudang, form.querySelectorAll('select'));
            const gudangNama = selGudang && /semua/i.test(selGudang.textContent) ? (selGudang.name || selGudang.id) : '';
            const opsiGudang = gudangNama
                ? Array.from(selGudang.options).map((o) => ({ value: o.value, teks: o.textContent.replace(/\s+/g, ' ').trim() }))
                : [];
            const pOutlet = labelDi(/^\s*outlet\s*:?\s*$/i);
            const inpOutlet = pOutlet && sesudah(pOutlet, Array.from(form.querySelectorAll('input')).filter(bisaDiisi));
            const outletNama = inpOutlet ? (inpOutlet.name || inpOutlet.id) : '';

            log('filter Lihat Stok: field "' + nama + '", gudang "' + gudangNama + '" (' + opsiGudang.length + ' pilihan), outlet "' + outletNama +
                '", ' + Array.from(dasar.keys()).length + ' filter lain dikosongkan');
            return { aksi: form.getAttribute('action') || URL_STOK, nama: nama, dasar: dasar,
                gudangNama: gudangNama, opsiGudang: opsiGudang, outletNama: outletNama };
        })();
        formLihatStok.catch(() => { formLihatStok = null; });   // gagal -> boleh dicoba lagi
        return formLihatStok;
    }

    function barcodeBaris(tr) {
        const sp = tr.querySelector('span.barcode_produk');
        const sc = tr.querySelector('td.bt_dialog_aktifitas_stok');
        return ((sp && sp.textContent) || (sc && sc.dataset.barcode) || '').trim().toLowerCase();
    }

    // Nama gudang SO berbentuk "gudang - outlet": "TOKO SIDOARJO - P12 PARTDISTRO SIDOARJO"
    // -> gudang "TOKO SIDOARJO" (masuk filter Gudang), kode outlet "P12" (masuk filter Outlet)
    function pecahNamaSO(nama) {
        nama = String(nama || '').trim();
        const i = nama.lastIndexOf(' - ');
        if (i < 0) return { gudang: nama, outlet: '' };
        return { gudang: nama.slice(0, i).trim(), outlet: (nama.slice(i + 3).trim().match(/^\S+/) || [''])[0] };
    }

    // Pilihan filter Gudang yang sesuai gudang SO: ID dulu, lalu tulisan pilihan = nama gudang,
    // = nama SO lengkap, atau diawali "nama gudang - ". Kalau di satu tingkat ada lebih dari satu
    // pilihan, dipersempit dengan kode outlet; kalau tetap lebih dari satu -> null (jangan menebak).
    function pilihOpsiGudang(opsi, so) {
        const b = pecahNamaSO(so.nama);
        const gud = rapi(b.gudang), penuh = rapi(so.nama), kode = rapi(b.outlet);
        const tingkat = [
            (o) => !!so.id && o.value === so.id,
            (o) => !!gud && rapi(o.teks) === gud,
            (o) => !!penuh && rapi(o.teks) === penuh,
            (o) => !!gud && rapi(o.teks).startsWith(gud + ' - ')
        ];
        for (const cocokTingkat of tingkat) {
            let c = opsi.filter((o) => o.value !== '' && cocokTingkat(o));
            if (c.length > 1 && kode) {
                const sempit = c.filter((o) => rapi(o.teks).split(' ').indexOf(kode) !== -1);
                if (sempit.length === 1) c = sempit;
            }
            if (c.length === 1) return c[0];
            if (c.length > 1) return null;
        }
        return null;
    }

    // Cari barcode di Lihat Stok. Kalau filter Gudang SO bisa dipilih: hasil dibatasi ke gudang itu
    // (dan outlet-nya, kalau filter Outlet menerima kode; kalau hasil kosong, diulang tanpa filter outlet),
    // jadi Total Stok langsung = stok gudang SO ({ terfilter: true }). Kalau tidak bisa: tanpa filter,
    // stok per gudang diambil dari rincian stok (alur cadangan).
    async function cariStok(barcode, so) {
        const f = await siapkanForm();
        const opsi = f.gudangNama && so && (so.id || so.nama) ? pilihOpsiGudang(f.opsiGudang, so) : null;
        if (!opsi) return cari1(f, barcode, {});

        const kode = pecahNamaSO(so.nama).outlet;
        const percobaan = [];
        if (f.outletNama && kode) {
            const t = {}; t[f.gudangNama] = opsi.value; t[f.outletNama] = kode;
            percobaan.push({ tambahan: t, denganOutlet: true });
        }
        const g = {}; g[f.gudangNama] = opsi.value;
        percobaan.push({ tambahan: g, denganOutlet: false });

        let terakhir = null;
        for (const c of percobaan) {
            try {
                terakhir = await cari1(f, barcode, c.tambahan);
            } catch (e) {
                // server menolak filter outlet berupa teks: ulangi hanya dengan filter gudang
                if (c.denganOutlet) { log('filter outlet "' + kode + '" ditolak, coba gudang saja', e); continue; }
                throw e;
            }
            if (terakhir.ketemu) return Object.assign(terakhir, { terfilter: true, gudangTeks: opsi.teks, denganOutlet: c.denganOutlet, kodeOutlet: kode });
        }
        return Object.assign(terakhir, { terfilter: true, gudangTeks: opsi.teks });
    }

    // -> { ketemu: false } atau { ketemu: true, total: <angka>, produk: [...] }
    async function cari1(f, barcode, tambahan) {
        const p = new URLSearchParams(f.dasar);
        p.set(f.nama, barcode);
        Object.keys(tambahan).forEach((k) => p.set(k, tambahan[k]));
        const res = await fetch(f.aksi + (f.aksi.indexOf('?') === -1 ? '?' : '&') + p.toString(),
            { credentials: 'same-origin', headers: { Accept: 'text/html' } });
        if (!res.ok) throw new Error('Lihat Stok HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const tb = doc.querySelector('#data_table_produk tbody');
        if (!tb) throw new Error('Tabel hasil Lihat Stok tidak ada (sesi habis?)');

        const baris = Array.from(tb.querySelectorAll('tr')).filter((tr) => tr.querySelector('td.bt_dialog_aktifitas_stok'));
        const sama = baris.filter((tr) => barcodeBaris(tr) === barcode.toLowerCase());
        const pakai = sama.length ? sama : (baris.length === 1 ? baris : []);
        if (!pakai.length) return { ketemu: false, jumlahHasil: baris.length };

        // total = jumlah stok semua baris cocok (satu baris per produk/outlet/gudang, tanpa dobel);
        // produk = daftar {prd, otl} unik untuk meminta rincian per gudang
        const dilihat = new Set();
        const produk = [];
        let total = 0;
        for (const tr of pakai) {
            const sc = tr.querySelector('td.bt_dialog_aktifitas_stok');
            const kunci = (sc.dataset.prd || '') + '|' + (sc.dataset.otl || '') + '|' + (sc.dataset.gdn || '');
            if (dilihat.has(kunci)) continue;
            dilihat.add(kunci);
            const n = angka(sc.textContent);
            if (!isNaN(n)) total += n;
            const kp = (sc.dataset.prd || '') + '|' + (sc.dataset.otl || '');
            if (sc.dataset.prd && !produk.some((x) => x.kunci === kp)) produk.push({ kunci: kp, prd: sc.dataset.prd, otl: sc.dataset.otl || '' });
        }
        return { ketemu: true, total: total, produk: produk };
    }

    // Rincian stok satu produk: label tebal = outlet, label biasa = gudang, lalu
    // <a class="bt_detail_stok_aktifitas" data-gdn> = stok gudang itu (sama dengan popup "detail stok").
    // -> [{ id, nama, outlet, stok }]
    async function ambilRincian(prd, otl) {
        const qs = new URLSearchParams({ idproduk: prd, idgudang: '', idoutlet: otl });
        const res = await fetch(URL_RINCIAN + '?' + qs.toString(), {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'text/plain, */*; q=0.01' }
        });
        if (!res.ok) throw new Error('Rincian stok HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        doc.querySelectorAll('script, style').forEach((x) => x.remove());
        const list = [];
        let outlet = '', gudang = '';
        doc.querySelectorAll('label, a.bt_detail_stok_aktifitas').forEach((el) => {
            if (el.tagName === 'LABEL') {
                // buang titik dua di akhir ("GUDANG PUSAT :" -> "GUDANG PUSAT")
                const teks = el.textContent.replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim();
                const tebal = /bold|font-weight:\s*[6-9]00/i.test(el.getAttribute('style') || '') ||
                    /bold/i.test(el.className || '') || !!el.querySelector('b, strong');
                if (tebal) outlet = teks;   // judul outlet (tebal), mis. "P12 PARTDISTRO SIDOARJO"
                else gudang = teks;         // nama gudang, mis. "TOKO SIDOARJO"
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

    // antrean: maks MAKS_PARALEL request bersamaan; hasil di-cache per kunci (barcode / produk)
    const antre = [];
    let berjalan = 0;
    function pompa() {
        while (berjalan < MAKS_PARALEL && antre.length) {
            const t = antre.shift();
            berjalan++;
            t.kerja().then(t.ok, t.gagal).finally(() => { berjalan--; pompa(); });
        }
    }
    function dariCache(peta, kunci, kerja) {
        if (!peta.has(kunci)) {
            const p = new Promise((ok, gagal) => { antre.push({ kerja: kerja, ok: ok, gagal: gagal }); pompa(); });
            p.catch(() => peta.delete(kunci));   // gagal -> boleh dicoba lagi
            peta.set(kunci, p);
        }
        return peta.get(kunci);
    }
    const cachePencarian = new Map();
    const cacheRincian = new Map();
    const stokSistem = (barcode) => dariCache(cachePencarian, barcode, () => cariStok(barcode, bacaGudangSO()));
    const rincianProduk = (p) => dariCache(cacheRincian, p.kunci, () => ambilRincian(p.prd, p.otl));

    // ---------- gudang SO yang sedang dibuka ----------
    // ID dari input tersembunyi form SO (stok_opnam_idgudang) kalau ada; nama dari tulisan
    // "Gudang : <nama>" di atas tabel (mis. "TOKO SIDOARJO - P12 PARTDISTRO SIDOARJO").
    function bacaGudangSO() {
        const wadah = document.getElementById('form_container') || document.body;
        let id = '';
        const el = document.getElementById('stok_opnam_idgudang') || wadah.querySelector('[name$="[idgudang]"]');
        if (el && /^\d+$/.test(String(el.value || '').trim())) id = String(el.value).trim();
        let terkecil = '';
        wadah.querySelectorAll('*').forEach((e) => {
            const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
            if (t.length < 250 && /^gudang\s*:/i.test(t) && (!terkecil || t.length < terkecil.length)) terkecil = t;
        });
        return { id: id, nama: terkecil.replace(/^gudang\s*:\s*/i, '').trim() };
    }

    const rapi = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

    // Pilih baris rincian milik gudang SO: ID dulu, lalu nama. Nama gudang SO di Erzap berbentuk
    // "gudang - outlet" (mis. "TOKO SIDOARJO - P12 PARTDISTRO SIDOARJO"; di popup rincian: judul
    // outlet "P12 PARTDISTRO SIDOARJO", baris gudang "TOKO SIDOARJO"). -> { stok } atau null kalau tidak dikenali
    function stokDiGudang(rincian, so) {
        let cocok = [];
        if (so.id) cocok = rincian.filter((e) => e.id === so.id);
        if (!cocok.length && so.nama) {
            const n = rapi(so.nama);
            cocok = rincian.filter((e) => rapi(e.nama) === n ||
                rapi(e.nama + ' - ' + e.outlet) === n || rapi(e.outlet + ' - ' + e.nama) === n);
            // tulisan outlet beda / judul outlet tidak terbaca: terima kalau nama gudang menjadi awalan atau
            // akhiran dengan pemisah " - " ("GUDANG B" tidak sama dengan "GUDANG BARU"), asal hanya SATU
            // gudang yang cocok (kalau ada dua gudang bernama sama di outlet berbeda, jangan menebak)
            if (!cocok.length) {
                const kandidat = rincian.filter((e) => rapi(e.nama).length >= 3 &&
                    (n.startsWith(rapi(e.nama) + ' - ') || n.endsWith(' - ' + rapi(e.nama))));
                if (kandidat.length === 1) cocok = kandidat;
            }
        }
        if (cocok.length) return { stok: cocok.reduce((a, e) => a + (isNaN(e.stok) ? 0 : e.stok), 0) };
        // ID gudang pasti tapi tidak ada di rincian = produk tidak punya stok di gudang itu
        return so.id ? { stok: 0, kosong: true } : null;
    }

    // ---------- kolom di tabel ----------
    // alasan: kode singkat untuk ringkasan di atas tabel ('kosong' / 'beda' untuk "-", pesan galat untuk "?")
    function tampil(sel, teks, judul, warna, alasan) {
        sel.textContent = teks;
        sel.title = judul || '';
        sel.dataset.alasan = alasan || '';
        sel.style.color = warna || '#999';
        sel.style.cursor = warna === '#c00' ? 'pointer' : '';
        jadwalRingkas();
    }

    // Ringkasan di atas tabel (title tidak muncul di HP): berapa terisi / tidak ketemu / gagal + alasannya.
    // Ketuk ringkasan saat ada yang gagal = ulangi semua yang gagal.
    let timerRingkas = 0;
    function jadwalRingkas() {
        clearTimeout(timerRingkas);
        timerRingkas = setTimeout(ringkas, 300);
    }

    function ringkas() {
        const semuaSel = Array.from(document.querySelectorAll('td[' + PENANDA + ']'));
        const tabel = semuaSel.length ? semuaSel[0].closest('table') : null;
        if (!tabel || !tabel.parentNode) return;
        let bar = document.getElementById('aistim-stok-ringkas');
        if (!bar || bar.nextElementSibling !== tabel) {
            if (bar) bar.remove();
            bar = document.createElement('div');
            bar.id = 'aistim-stok-ringkas';
            bar.style.cssText = 'font-size:12px;margin:4px 0;padding:4px 8px;background:#f5f5f5;border-radius:4px;';
            bar.addEventListener('click', () => {
                document.querySelectorAll('td[' + PENANDA + ']').forEach((s) => { if (s.textContent === '?') s.click(); });
            });
            tabel.parentNode.insertBefore(bar, tabel);
        }
        let ada = 0, memuat = 0, kosong = 0, beda = 0, gagal = 0;
        const alasan = new Map();
        semuaSel.forEach((s) => {
            const t = s.textContent;
            if (t === '…') memuat++;
            else if (t === '-') { if (s.dataset.alasan === 'beda') beda++; else kosong++; }
            else if (t === '?') {
                gagal++;
                const a = (s.dataset.alasan || '?').slice(0, 160);
                alasan.set(a, (alasan.get(a) || 0) + 1);
            } else ada++;
        });
        const bagian = [ada + ' terisi'];
        if (memuat) bagian.push(memuat + ' memuat');
        if (kosong || beda) bagian.push((kosong + beda) + ' tidak ketemu (' + kosong + ' tanpa hasil, ' + beda + ' ada hasil tapi barcode beda)');
        if (gagal) bagian.push(gagal + ' gagal');
        let teks = 'Stok Sistem: ' + bagian.join(' · ');
        if (gagal) {
            teks += ' — ' + Array.from(alasan).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0] + ' (' + x[1] + '×)').join('; ') +
                ' — ketuk untuk ulangi yang gagal';
        }
        bar.textContent = teks;
        bar.style.color = gagal ? '#c00' : '#555';
        bar.style.cursor = gagal ? 'pointer' : '';
    }

    function isiSel(sel, tr, header) {
        const barcode = bacaBarcode(tr, header);
        if (!barcode) { tampil(sel, '?', 'Barcode baris ini tidak terbaca', '#c00', 'barcode baris tidak terbaca'); return; }
        tampil(sel, '…', 'Mengambil stok ' + barcode);
        stokSistem(barcode).then(async (r) => {
            if (!r.ketemu) {
                tampil(sel, '-', 'Barcode ' + barcode + (r.terfilter ? ' tidak ketemu di Lihat Stok untuk gudang ' + r.gudangTeks : ' tidak ketemu di Lihat Stok') +
                    ' (' + r.jumlahHasil + ' hasil, tidak ada yang barcodenya sama)', '', r.jumlahHasil ? 'beda' : 'kosong');
                return;
            }
            if (r.terfilter && r.ketemu) {
                // hasil Lihat Stok sudah dibatasi ke gudang SO: Total Stok = stok gudang itu
                tampil(sel, r.total.toLocaleString('id-ID'),
                    'Stok di gudang ' + r.gudangTeks + (r.denganOutlet ? ', outlet ' + r.kodeOutlet : '') +
                    ' (filter Lihat Stok)\nBarcode ' + barcode, '');
                return;
            }
            // cadangan: filter gudang tidak bisa dipilih -> rincian stok per gudang
            const so = bacaGudangSO();
            if (!so.id && !so.nama) throw new Error('Gudang SO tidak terbaca di halaman');
            if (!r.produk.length) throw new Error('ID produk tidak ada di hasil Lihat Stok');
            const rincian = [].concat(...await Promise.all(r.produk.map(rincianProduk)));
            const g = stokDiGudang(rincian, so);
            if (!g) {
                const daftar = rincian.map((e) => e.outlet + ' - ' + e.nama).join('; ') || 'kosong';
                log('gudang SO tidak cocok', so, 'rincian:', rincian);
                throw new Error('Gudang SO "' + so.nama + '" tidak dikenali di rincian stok: ' + daftar);
            }
            tampil(sel, g.stok.toLocaleString('id-ID'),
                'Stok di gudang ' + (so.nama || '#' + so.id) + (g.kosong ? ' (tidak ada di rincian, dianggap 0)' : '') +
                '\nTotal semua gudang: ' + r.total.toLocaleString('id-ID') + '\nBarcode ' + barcode, '');
        }).catch((e) => {
            log('gagal ambil stok', barcode, e);
            const pesan = String((e && e.message) || e);
            tampil(sel, '?', pesan + ' (klik untuk coba lagi)', '#c00', pesan);
        });
    }

    function buatSel(tr, header, tagContoh) {
        const sel = document.createElement('td');
        sel.setAttribute(PENANDA, '1');
        if (tagContoh && tagContoh.className) sel.className = tagContoh.className;
        sel.style.textAlign = 'center';
        sel.addEventListener('click', () => { if (sel.textContent === '?') isiSel(sel, tr, header); });
        isiSel(sel, tr, header);
        return sel;
    }

    function barisHeader(table) {
        if (table.tHead && table.tHead.rows.length) return table.tHead.rows[0];
        return Array.from(table.rows).find((tr) => tr.querySelector('th')) || null;
    }

    function olahTabel(table) {
        const header = barisHeader(table);
        if (!header) return;

        let thKita = header.querySelector('th[' + PENANDA + ']');
        if (!thKita) {
            const jumlah = header.cells.length;
            if (jumlah < 2) return;   // bukan tabel data
            const thContoh = header.cells[jumlah - 1];
            thKita = document.createElement(thContoh.tagName === 'TD' ? 'td' : 'th');
            thKita.setAttribute(PENANDA, '1');
            if (thContoh.className) thKita.className = thContoh.className;
            thKita.textContent = NAMA_KOLOM;
            header.appendChild(thKita);
        }

        // Kolom kita ada di paling kanan: baris data yang belum punya sel kita dan jumlah selnya
        // sama dengan posisi kolom kita adalah baris biasa. Baris dengan colspan (subjudul, total)
        // dilewati. Ini juga menangkap baris yang ditambahkan belakangan.
        const posisi = thKita.cellIndex;
        Array.from(table.rows).forEach((tr) => {
            if (tr === header || tr.querySelector('th')) return;
            if (tr.querySelector('td[' + PENANDA + ']')) return;
            if (tr.cells.length !== posisi) return;
            tr.appendChild(buatSel(tr, header, tr.cells[tr.cells.length - 1]));
        });
    }

    function olahSemua() {
        const wadah = document.getElementById('form_container') || document.body;
        wadah.querySelectorAll('table').forEach(olahTabel);
    }

    let timer = 0;
    function jadwalkan() {
        clearTimeout(timer);
        timer = setTimeout(olahSemua, 150);
    }

    olahSemua();
    new MutationObserver(jadwalkan).observe(
        document.getElementById('form_container') || document.body,
        { childList: true, subtree: true }
    );
})();
