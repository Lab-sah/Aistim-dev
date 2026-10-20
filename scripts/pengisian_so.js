// ==UserScript==
// @name         Erzap - Pengisian SO
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Tambah kolom "Stok Sistem" di tabel Pengisian Hasil SO (isi kolom menyusul)
// @match        https://*.erzap.com/stok_opnams/proses_pengisian_hasil_so*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Halaman ini hanya memuat #form_container kosong; isi tabelnya diambil lewat AJAX
    // (POST /stok_opnams/fetch_detail_pengisian_so/new) dan bisa diganti lagi saat pindah halaman.
    // Karena itu script memantau #form_container dan menambah kolom tiap kali tabel muncul.

    const NAMA_KOLOM = 'Stok Sistem';
    const PENANDA = 'data-aistim-stok-sistem';

    // TODO: isi nanti. Terima baris <tr> data, kembalikan nilai stok sistem (angka / teks).
    // Selama masih mengembalikan null, sel tampil "-".
    function ambilStokSistem(tr) {
        return null;
    }

    function buatSel(tr, tagContoh) {
        const sel = document.createElement('td');
        sel.setAttribute(PENANDA, '1');
        if (tagContoh && tagContoh.className) sel.className = tagContoh.className;
        const nilai = ambilStokSistem(tr);
        const kosong = nilai === null || nilai === undefined || nilai === '';
        sel.textContent = kosong ? '-' : String(nilai);
        sel.style.textAlign = 'center';
        if (kosong) sel.style.color = '#999';
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
            tr.appendChild(buatSel(tr, tr.cells[tr.cells.length - 1]));
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
