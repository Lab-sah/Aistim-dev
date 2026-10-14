// ==UserScript==
// @name         Erzap - Home (Stats Saldo PPOB)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Halaman Home (Transaksi Hari Ini): menambah kartu stats "SALDO PPOB" di samping kartu Penjualan + Servis / Beban / Dana Masuk / Dana Keluar. Saldo diambil dari /main/check_balance_ppob/new dan diperbarui tiap 60 detik; merah bila di bawah Rp 1 juta.
// @match        https://*.erzap.com/
// @match        https://*.erzap.com/?*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window) return;
    if (location.pathname !== '/') return;
    if (window.__aistimHome) return;
    window.__aistimHome = true;

    const SALDO_URL = '/main/check_balance_ppob/new';
    const BATAS_RENDAH = 1000000;
    const TIAP_MS = 60 * 1000;
    const MAKS_TUNGGU_MS = 20 * 1000;   // kartu stats bisa baru muncul setelah ajax selesai
    const LABEL = 'SALDO PPOB';
    const fmtRp = (n) => 'Rp ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let nilaiEl = null;   // elemen yang menampung angka saldo
    let infoEl = null;    // keterangan kecil (waktu / error)
    let kartu = null;

    // ---------- ambil saldo ----------
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

    let jalan = false;
    async function muat() {
        if (!kartu || !document.body.contains(kartu) || jalan) return;
        jalan = true;
        try {
            const saldo = await ambilSaldo();
            nilaiEl.textContent = fmtRp(saldo);
            const rendah = saldo < BATAS_RENDAH;
            nilaiEl.style.color = rendah ? '#dc3545' : '';
            kartu.title = rendah ? 'Saldo PPOB kurang dari Rp 1 juta' : 'Saldo PPOB';
            if (infoEl) infoEl.textContent = '';
        } catch (err) {
            if (nilaiEl.textContent === '' || nilaiEl.textContent === '...') nilaiEl.textContent = '-';
            kartu.title = 'Gagal memuat saldo PPOB: ' + err.message;
            console.warn('[home.js] saldo PPOB: ' + err.message);
        } finally {
            jalan = false;
        }
    }

    // ---------- cari kartu stats yang sudah ada (label_transaksi) ----------
    // Kartu = elemen anak dari baris yang sama dengan kartu lain; tiap kartu memuat satu .label_transaksi
    function cariKartuAsli() {
        const labels = Array.from(document.querySelectorAll('.label_transaksi'));
        if (!labels.length) return null;
        let el = labels[labels.length - 1];
        while (el && el.parentElement && el.parentElement !== document.body) {
            const induk = el.parentElement;
            const saudara = Array.from(induk.children).filter((c) => c.querySelector('.label_transaksi') || c.classList.contains('label_transaksi'));
            if (saudara.length >= 2) return { kartu: el, induk: induk, daftar: saudara };
            el = induk;
        }
        return null;
    }

    function daunTeks(root) {
        // elemen paling dalam yang berisi teks (tanpa anak elemen)
        return Array.from(root.querySelectorAll('*')).filter((e) => e.children.length === 0 && (e.textContent || '').trim() !== '');
    }

    // ---------- bangun kartu: salin kartu asli supaya tampilannya sama ----------
    function bangunDariSalinan(asal) {
        const salinan = asal.kartu.cloneNode(true);
        salinan.removeAttribute('id');
        salinan.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));   // hindari id ganda
        salinan.querySelectorAll('canvas, svg, img').forEach((e) => e.remove());      // grafik/ikon milik kartu asli
        salinan.setAttribute('data-aistim-saldo-ppob', '1');

        const label = salinan.matches('.label_transaksi') ? salinan : salinan.querySelector('.label_transaksi');
        if (!label) return null;
        label.textContent = LABEL;

        // angka: daun teks terbesar yang memuat digit; daun angka lain (persen/keterangan) dikosongkan
        const angka = daunTeks(salinan).filter((e) => e !== label && !label.contains(e) && /\d/.test(e.textContent));
        let utama = angka[0] || null;
        angka.slice(1).forEach((e) => { e.textContent = ''; });
        if (!utama) {
            utama = document.createElement('div');
            utama.style.cssText = 'font-weight:700;font-size:1.4em;';
            label.parentNode.insertBefore(utama, label.nextSibling);
        }
        utama.textContent = '...';
        return { kartu: salinan, nilai: utama };
    }

    // ---------- cadangan: kartu sederhana bila susunan halaman tidak dikenali ----------
    function bangunSederhana() {
        const k = document.createElement('div');
        k.setAttribute('data-aistim-saldo-ppob', '1');
        k.style.cssText = 'display:inline-block;margin:8px;padding:10px 16px;border:1px solid #cfe2ff;border-left:4px solid #0d6efd;border-radius:4px;background:#f3f8ff;font-family:inherit;';
        const l = document.createElement('div');
        l.textContent = LABEL;
        l.style.cssText = 'font-size:12px;font-weight:600;color:#555;';
        const n = document.createElement('div');
        n.textContent = '...';
        n.style.cssText = 'font-size:20px;font-weight:700;';
        k.appendChild(l);
        k.appendChild(n);
        return { kartu: k, nilai: n };
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
        nilaiEl = hasil.nilai;
        muat();
        return true;
    }

    // tunggu kartu stats muncul; kalau sampai batas waktu tidak ada, pakai kartu sederhana
    const mulai = Date.now();
    const pemeriksa = setInterval(() => {
        const habis = Date.now() - mulai > MAKS_TUNGGU_MS;
        if (pasang(habis)) clearInterval(pemeriksa);
        else if (habis) clearInterval(pemeriksa);
    }, 400);

    setInterval(() => { if (!document.hidden) muat(); }, TIAP_MS);
    // kartu stats bisa digambar ulang oleh halaman (ganti outlet/periode): pasang lagi bila kartu kita hilang
    setInterval(() => {
        if (kartu && !document.body.contains(kartu)) { kartu = null; pasang(false); }
    }, 2000);
})();
