// ==UserScript==
// @name         Erzap - Pengisian SO
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Kolom "Stok Sistem" di tabel Pengisian Hasil SO: diisi otomatis dari total stok di halaman Lihat Stok (cari per barcode)
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
    // ambil stok dari sel td.bt_dialog_aktifitas_stok. Nama field filter dibaca dari form Lihat Stok
    // sendiri (lewat teks labelnya), jadi tidak ditulis mati di sini.

    const NAMA_KOLOM = 'Stok Sistem';
    const PENANDA = 'data-aistim-stok-sistem';
    const URL_STOK = '/produk_gudangs/lihat_stok/new';
    const MAKS_PARALEL = 3;   // jumlah pencarian Lihat Stok yang jalan bersamaan

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

            const dasar = new URLSearchParams(new FormData(form));
            dasar.delete('page');
            log('filter Lihat Stok: field "' + nama + '"');
            return { aksi: form.getAttribute('action') || URL_STOK, nama: nama, dasar: dasar };
        })();
        formLihatStok.catch(() => { formLihatStok = null; });   // gagal -> boleh dicoba lagi
        return formLihatStok;
    }

    function barcodeBaris(tr) {
        const sp = tr.querySelector('span.barcode_produk');
        const sc = tr.querySelector('td.bt_dialog_aktifitas_stok');
        return ((sp && sp.textContent) || (sc && sc.dataset.barcode) || '').trim().toLowerCase();
    }

    // -> { ketemu: false } atau { ketemu: true, total: <angka> }
    async function cariStok(barcode) {
        const f = await siapkanForm();
        const p = new URLSearchParams(f.dasar);
        p.set(f.nama, barcode);
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

        // total = jumlah stok semua baris cocok (satu baris per produk/outlet/gudang, tanpa dobel)
        const dilihat = new Set();
        let total = 0;
        for (const tr of pakai) {
            const sc = tr.querySelector('td.bt_dialog_aktifitas_stok');
            const kunci = (sc.dataset.prd || '') + '|' + (sc.dataset.otl || '') + '|' + (sc.dataset.gdn || '');
            if (dilihat.has(kunci)) continue;
            dilihat.add(kunci);
            const n = angka(sc.textContent);
            if (!isNaN(n)) total += n;
        }
        return { ketemu: true, total: total };
    }

    // antrean: maks MAKS_PARALEL pencarian bersamaan, satu pencarian per barcode (hasil di-cache)
    const antre = [];
    let berjalan = 0;
    function pompa() {
        while (berjalan < MAKS_PARALEL && antre.length) {
            const t = antre.shift();
            berjalan++;
            cariStok(t.barcode).then(t.ok, t.gagal).finally(() => { berjalan--; pompa(); });
        }
    }
    const cache = new Map();
    function stokSistem(barcode) {
        if (!cache.has(barcode)) {
            const p = new Promise((ok, gagal) => { antre.push({ barcode: barcode, ok: ok, gagal: gagal }); pompa(); });
            p.catch(() => cache.delete(barcode));   // gagal -> boleh dicoba lagi
            cache.set(barcode, p);
        }
        return cache.get(barcode);
    }

    // ---------- kolom di tabel ----------
    function tampil(sel, teks, judul, warna) {
        sel.textContent = teks;
        sel.title = judul || '';
        sel.style.color = warna || '#999';
        sel.style.cursor = warna === '#c00' ? 'pointer' : '';
    }

    function isiSel(sel, tr, header) {
        const barcode = bacaBarcode(tr, header);
        if (!barcode) { tampil(sel, '?', 'Barcode baris ini tidak terbaca', '#c00'); return; }
        tampil(sel, '…', 'Mengambil stok ' + barcode);
        stokSistem(barcode).then((r) => {
            if (r.ketemu) tampil(sel, r.total.toLocaleString('id-ID'), 'Total stok sistem ' + barcode + ' (dari Lihat Stok)', '');
            else tampil(sel, '-', 'Barcode ' + barcode + ' tidak ketemu di Lihat Stok (' + r.jumlahHasil + ' hasil, tidak ada yang barcodenya sama)');
        }).catch((e) => {
            log('gagal ambil stok', barcode, e);
            tampil(sel, '?', String((e && e.message) || e) + ' (klik untuk coba lagi)', '#c00');
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
