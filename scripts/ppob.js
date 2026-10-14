// ==UserScript==
// @name         Erzap - PPOB (No Faktur + Outlet)
// @namespace    http://tampermonkey.net/
// @version      1.11.0
// @description  Mengaktifkan link No Faktur di tabel Aktifitas PPOB (bawaan disabled), membukanya ke halaman nota /penjualans/<id>, menampilkan outlet notanya di bawah No Faktur. Di /penjualans mengisi filter No Faktur otomatis lalu membuka nota (Lihat). Saldo PPOB tampil di atas tabel; saldo < Rp 1 juta: lonceng bersuara "Cek saldo bosku" + tulisan peringatan.
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
    console.log('[ppob.js] v1.11.0 aktif di ' + location.pathname);

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

    // Dari dokumen hasil pencarian: baris dengan No Faktur persis (atau bersufiks, mis. "...-VOID-14.16") -> {url, outlet, persis}
    function ekstrakHasil(doc, faktur) {
        const target = faktur.toUpperCase();
        let kena = null;
        for (const tabel of doc.querySelectorAll('table')) {
            const th = Array.from(tabel.querySelectorAll('thead th, thead td'));
            const idxOutlet = th.findIndex((x) => /^outlet$/i.test(rapih(x.textContent)));
            for (const tr of tabel.querySelectorAll('tbody tr')) {
                const sel = Array.from(tr.cells);
                const persis = sel.some((td) => rapih(td.textContent).toUpperCase() === target);
                const mirip = sel.some((td) => rapih(td.textContent).toUpperCase().indexOf(target) === 0);
                if (!persis && !mirip) continue;
                const a = Array.from(tr.querySelectorAll('a[href]')).find((x) => POLA_ID.test(x.getAttribute('href') || ''));
                if (!a) continue;
                const hit = { url: new URL(a.getAttribute('href'), location.origin).href, outlet: outletBaris(sel, idxOutlet) };
                if (persis) return hit;
                if (!kena) kena = hit;
            }
        }
        return kena;
    }

    // Cadangan: jalankan pencarian di halaman /penjualans asli (iframe tersembunyi, sama persis seperti dilakukan manual),
    // berguna kalau tabel hasil diisi lewat skrip/ajax sehingga tidak ada di HTML mentah. Satu per satu (antre).
    let rantaiIframe = Promise.resolve();
    function cariNotaIframe(faktur) {
        const p = rantaiIframe.then(() => jalankanIframe(faktur));
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
    async function jalankanIframe(faktur) {
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
            const r = rentangFaktur(faktur)[0];
            const dari = inputs.find((el) => /^pencarian\[tanggal[^\]]*(dari|awal|from|mulai)[^\]]*\]$/i.test(el.name));
            const sampai = inputs.find((el) => /^pencarian\[tanggal[^\]]*(sampai|akhir|to)[^\]]*\]$/i.test(el.name));
            setNilai(kode, faktur);
            if (r && dari) setNilai(dari, fmtTgl(r[0]));
            if (r && sampai) setNilai(sampai, fmtTgl(r[1]));
            const tombol = Array.from(form.querySelectorAll('button, input[type="submit"]')).find((b) => /cari|filter|search/i.test((b.textContent || '') + ' ' + (b.value || ''))) ||
                           form.querySelector('button[type="submit"], input[type="submit"]');
            if (tombol) tombol.click(); else if (form.requestSubmit) form.requestSubmit(); else form.submit();
            // hasil bisa berupa halaman baru (POST) atau tabel yang diperbarui lewat ajax: baca dokumen iframe saat ini berulang
            return await tungguDi(() => { const d = fr.contentDocument; return d && d.readyState === 'complete' && ekstrakHasil(d, faktur); }, 25000, 'hasil pencarian untuk ' + faktur + ' tidak muncul');
        } finally {
            fr.remove();
        }
    }

    // Varian GET: /penjualans?pencarian[kode]=<faktur>&pencarian[tanggal_dari]=...&pencarian[tanggal_sampai]=...
    async function cariNotaGet(faktur) {
        for (const r of rentangFaktur(faktur)) {
            const qs = new URLSearchParams();
            qs.set('pencarian[kode]', faktur);
            qs.set('pencarian[tanggal_dari]', fmtTgl(r[0]));
            qs.set('pencarian[tanggal_sampai]', fmtTgl(r[1]));
            const res = await fetch(LIST_URL + '?' + qs.toString(), { credentials: 'same-origin', cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status + ' saat mencari nota (GET)');
            const kena = ekstrakHasil(new DOMParser().parseFromString(await res.text(), 'text/html'), faktur);
            if (kena) return kena;
        }
        throw new Error('nota ' + faktur + ' tidak ditemukan (GET)');
    }

    async function cariNota(faktur) {
        const f = await ambilFormCari();
        const target = faktur.toUpperCase();
        for (const r of rentangFaktur(faktur)) {
            const body = new URLSearchParams(f.field);
            body.set(f.kode, faktur);
            if (f.dari) body.set(f.dari, fmtTgl(r[0]));
            if (f.sampai) body.set(f.sampai, fmtTgl(r[1]));
            const res = await fetch(f.action, { method: 'POST', credentials: 'same-origin', cache: 'no-store', body: body });
            if (!res.ok) throw new Error('HTTP ' + res.status + ' saat mencari nota');
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const kena = ekstrakHasil(doc, faktur);
            if (kena) return kena;
            if (!f.dari) break;   // tanpa kolom tanggal rentang tidak berpengaruh
        }
        throw new Error('nota ' + faktur + ' tidak ditemukan di daftar penjualan');
    }

    // Hasil pencarian per No Faktur (di-cache agar klik & outlet tidak mencari dua kali)
    // + disimpan di localStorage: muat ulang halaman / buka lagi tidak mencari ulang (nota tidak berpindah outlet)
    const K_CACHE = 'aistim_ppob_nota_v1', MAKS_CACHE = 3000;
    let simpanan = {};
    try { simpanan = JSON.parse(localStorage.getItem(K_CACHE) || '{}') || {}; } catch (e) { simpanan = {}; }
    function simpanCache(faktur, n) {
        if (!n || !n.url || !n.outlet) return;   // hanya hasil lengkap
        simpanan[faktur] = { url: n.url, outlet: n.outlet };
        const kunci = Object.keys(simpanan);
        if (kunci.length > MAKS_CACHE) kunci.slice(0, kunci.length - MAKS_CACHE).forEach((k) => delete simpanan[k]);
        try { localStorage.setItem(K_CACHE, JSON.stringify(simpanan)); } catch (e) { /* penuh/diblokir: abaikan */ }
    }
    const cacheNota = {};
    function notaDari(faktur) {
        if (!cacheNota[faktur] && simpanan[faktur]) cacheNota[faktur] = Promise.resolve(simpanan[faktur]);
        if (!cacheNota[faktur]) cacheNota[faktur] = cariNota(faktur)
            .catch((err) => { console.warn('[ppob.js] fetch POST gagal (' + err.message + '), mencoba fetch GET'); return cariNotaGet(faktur); })
            .catch((err) => { console.warn('[ppob.js] fetch GET gagal (' + err.message + '), mencoba lewat halaman /penjualans'); return cariNotaIframe(faktur); })
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

    function prosesAntriOutlet() {
        while (jalanOutlet < MAKS_SERENTAK && antriOutlet.length) {
            const it = antriOutlet.shift();
            jalanOutlet++;
            notaDari(it.faktur)
                .then((n) => { it.el.textContent = '🏪 ' + (n.outlet || '(tidak terbaca)'); })
                .catch((err) => { it.el.textContent = '🏪 (gagal)'; it.el.title = 'Outlet: ' + err.message; console.warn('[ppob.js] ' + it.faktur + ': ' + err.message); })
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
        antriOutlet.push({ a: a, faktur: a.textContent.trim(), el: el });
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
        '@keyframes aistim_spin{to{transform:rotate(360deg)}}' +
        '.aistim_spin{display:inline-block;width:10px;height:10px;margin-right:5px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:aistim_spin .7s linear infinite}' +
        '#aistim_ppob_saldo{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 8px;padding:8px 12px;border:1px solid #cfe2ff;border-left:4px solid #0d6efd;border-radius:4px;background:#f3f8ff;font-size:14px;color:#222}' +
        '#aistim_ppob_saldo .sp_nilai{font-size:18px;font-weight:700;color:#0d6efd}' +
        '#aistim_ppob_saldo .sp_info{font-size:11px;color:#777}' +
        '#aistim_ppob_saldo .sp_err{color:#dc3545}' +
        '#aistim_ppob_saldo.sp_rendah{border-color:#f5c2c7;border-left-color:#dc3545;background:#fff5f5}' +
        '#aistim_ppob_saldo.sp_rendah .sp_nilai{color:#dc3545}' +
        '#aistim_ppob_saldo .sp_warn{font-weight:700;color:#dc3545}' +
        '#aistim_ppob_saldo button.sp_bel{margin-left:0;padding:0 4px;border:0;background:transparent;font-size:20px;line-height:1}' +
        '@keyframes aistim_goyang{0%,100%{transform:rotate(0)}20%{transform:rotate(18deg)}40%{transform:rotate(-16deg)}60%{transform:rotate(10deg)}80%{transform:rotate(-8deg)}}' +
        '#aistim_ppob_saldo.sp_rendah button.sp_bel.sp_on{animation:aistim_goyang 1.2s ease-in-out infinite;transform-origin:50% 10%}' +
        '#aistim_ppob_saldo button{margin-left:auto;padding:2px 10px;border:1px solid #b6d4fe;border-radius:4px;background:#fff;color:#0d6efd;cursor:pointer;font-size:12px}';
    document.head.appendChild(st);

    // Klik No Faktur: tab baru dibuka dulu (agar tidak diblokir popup blocker), lalu diarahkan ke nota hasil pencarian.
    // Kalau pencarian di belakang layar gagal, tab dibuka ke /penjualans dan diisi/dicari/diklik "Lihat" otomatis (halamanCari).
    const PREFIX_NAMA = 'aistim_ppob_cari:';
    async function bukaNota(e) {
        e.preventDefault();
        e.stopPropagation();
        const faktur = e.currentTarget.textContent.trim();
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
            const n = await notaDari(faktur);
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
    const SALDO_TIAP_MS = 60 * 1000;
    const fmtRp = (n) => 'Rp ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let saldoBox = null, saldoJalan = false;

    // ---------- Peringatan saldo < Rp 1 juta: lonceng bersuara "Cek saldo bosku" (hidup/mati) ----------
    const BATAS_SALDO = 1000000;
    const KATA_SALDO = 'Cek saldo bosku';   // suara lonceng (diucapkan); tulisan peringatan di kotak tetap "Saldo kurang dari 1 juta"
    const ULANG_BUNYI_MS = 5 * 60 * 1000;   // selama saldo masih rendah, diulang tiap 5 menit
    const K_BUNYI_SALDO = 'aistim_ppob_bunyi_saldo';
    let bunyiAktif = true;
    try { bunyiAktif = localStorage.getItem(K_BUNYI_SALDO) !== '0'; } catch (e) { /* abaikan */ }
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
        if (menungguSentuh && saldoRendah && bunyiAktif) { menungguSentuh = false; bunyikanPeringatan(); }
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
    function ikonLonceng() {
        if (!saldoBox) return;
        const b = saldoBox.querySelector('.sp_bel');
        if (!b) return;
        b.textContent = bunyiAktif ? '\uD83D\uDD14' : '\uD83D\uDD15';
        b.classList.toggle('sp_on', bunyiAktif);
        b.title = bunyiAktif ? 'Suara peringatan saldo: HIDUP (klik untuk mematikan)' : 'Suara peringatan saldo: MATI (klik untuk menghidupkan)';
    }
    function periksaSaldo(saldo) {
        saldoRendah = saldo < BATAS_SALDO;
        if (saldoBox) {
            saldoBox.classList.toggle('sp_rendah', saldoRendah);
            const w = saldoBox.querySelector('.sp_warn');
            if (w) w.style.display = saldoRendah ? '' : 'none';
        }
        if (saldoRendah && bunyiAktif && Date.now() - terakhirBunyi > ULANG_BUNYI_MS) bunyikanPeringatan();
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
        saldoBox.appendChild(buat('button', { type: 'button', class: 'sp_bel' }));
        saldoBox.appendChild(buat('button', { type: 'button', class: 'sp_ulang', title: 'Muat ulang saldo', teks: '↻ Muat ulang' }));
        saldoBox.querySelector('.sp_ulang').addEventListener('click', muatSaldo);
        saldoBox.querySelector('.sp_bel').addEventListener('click', () => {
            bunyiAktif = !bunyiAktif;
            try { localStorage.setItem(K_BUNYI_SALDO, bunyiAktif ? '1' : '0'); } catch (e) { /* abaikan */ }
            ikonLonceng();
            if (bunyiAktif) { siapkanAudio(); if (saldoRendah) bunyikanPeringatan(); else bip(); }
            else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        });
        ikonLonceng();
        target.parentNode.insertBefore(saldoBox, target);
        muatSaldo();
    }
    setInterval(() => { if (!document.hidden) muatSaldo(); }, SALDO_TIAP_MS);

    function proses() {
        try { pasangSaldo(); } catch (e) { console.warn('[ppob.js] kotak saldo gagal dipasang: ' + e.message); }
        document.querySelectorAll(TABEL + ' tbody tr td:nth-child(' + KOLOM_FAKTUR + ') a').forEach((a) => {
            if (a.classList.contains('disabled') || a.hasAttribute('disabled')) aktifkan(a);
            tambahOutlet(a);
        });
        prosesAntriOutlet();
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
                setNilai(kode, faktur);
                const r = rentangFaktur(faktur)[0];
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
            for (const tr of document.querySelectorAll('tbody tr')) {
                if (rapih(tr.textContent).toUpperCase().indexOf(faktur.toUpperCase()) === -1) continue;
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
        halamanCari();
        return;
    }


    let tunda = 0;
    new MutationObserver(function () {
        clearTimeout(tunda);
        tunda = setTimeout(proses, 50);
    }).observe(document.body, { childList: true, subtree: true });

    proses();
})();
