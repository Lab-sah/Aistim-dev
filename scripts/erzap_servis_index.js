// ==UserScript==
// @name         Erzap - Servis index
// @namespace    http://tampermonkey.net/
// @version      1.0.9
// @description  [v1.0.9] Nama diganti jadi 'Erzap - Servis index' (pindah dari servisindex.js). [v1.0.8] Halaman daftar Servis Elektronik (/servis_elektroniks): nama outlet dan teknisi/mekanik (ikon kotak biru) ditampilkan di dalam sel Tanggal Terima, di bawah tanggal; tipe HP/motor (kotak biru) di sel Pelanggan, di bawah nama dan telepon. Nomor HP tetap jadi ikon WhatsApp. Datanya diambil dari halaman detail tiap servis. Tabel Erzap tidak diubah
// @author       You
// @match        https://*.erzap.com/servis_elektroniks
// @match        https://*.erzap.com/servis_elektroniks?*
// @match        https://*.erzap.com/servis_elektroniks/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CACHE_KEY = 'si_detail_cache_v2'; // v2: ada field tipe
    const PARALEL = 4;
    const TANDA = 'si_tgl_ok';
    const MASA_SEMENTARA = 2 * 60 * 1000;
    // Istilah mengikuti nama toko (bagian depan alamat Erzap): ototech.erzap.com -> "Mekanik", selain itu "Teknisi"
    const OTOTECH = /(^|[.-])ototech([.-]|$)/i.test(location.hostname.replace(/\.erzap\.com$/i, ''));
    const IST_TEKNISI = OTOTECH ? 'Mekanik' : 'Teknisi';
    const RE_JUDUL_TANGGAL = /^tanggal\s+(penerimaan|terima)$/i;

    let cache = {};
    try { cache = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { cache = {}; }
    function simpanCache() {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* abaikan */ }
    }

    function teksBersih(el) {
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    // ===== Baca halaman detail servis =====
    function cariOutlet(doc) {
        const kandidat = doc.querySelectorAll('th, dt, label, strong, b, td, span, div.col-form-label');
        for (const k of kandidat) {
            const t = teksBersih(k).replace(/:$/, '').trim().toLowerCase();
            if (t !== 'outlet') continue;
            if (k.closest('nav, aside, header, footer, .sidebar, .main-sidebar, .navbar, .nav, [class*="menu"]')) continue;
            let nilai = k.nextElementSibling;
            if (!nilai && k.parentElement) nilai = k.parentElement.nextElementSibling;
            const v = teksBersih(nilai);
            if (v) return v;
        }
        const sel = doc.querySelector('select[id*="outlet"] option[selected]') || doc.querySelector('select[id*="outlet"] option:checked');
        if (sel && teksBersih(sel)) return teksBersih(sel);
        return '';
    }

    function cariTeknisi(doc) {
        const nama = [];
        doc.querySelectorAll('input[name*="[user_teknisi_nama]"]').forEach(inp => {
            const t = (inp.getAttribute('value') || '').replace(/\s+/g, ' ').trim();
            if (t && !nama.includes(t)) nama.push(t);
        });
        if (!nama.length) { // cadangan: Penanggung Jawab yang terpilih
            doc.querySelectorAll('select[name*="[iduser_penanggung_jawab]"]').forEach(sel => {
                const o = sel.querySelector('option[selected]');
                const t = o && o.value ? teksBersih(o) : '';
                if (t && !/^please select/i.test(t) && !nama.includes(t)) nama.push(t);
            });
        }
        return nama.join(', ');
    }

    // Tipe HP = judul <h1> halaman detail (mis. "REDMI 10 2022 - SEA BLUE"), bukan judul "Kelola Servis Elektronik - SRxxxx" / judul modal
    const BUKAN_TIPE = /^(kelola servis|pembayaran|verifikasi|konfirmasi|pengambilan|pembatalan|penambahan|registrasi|peringatan|serial number)/i;
    const BATAS_NILAI = /^(STRONG|B|BR|P|DIV|TABLE|UL|OL|HR|LABEL|H[1-6])$/;
    function cariTipe(doc) {
        // 1) Label "Nama Unit:" (bisa lebih dari satu unit per servis) -> teks sesudahnya, digabung koma
        const unit = [];
        for (const s of doc.querySelectorAll('strong, b, label')) {
            if (teksBersih(s).replace(/:$/, '').trim().toLowerCase() !== 'nama unit') continue;
            let v = '';
            for (let n = s.nextSibling; n && !(n.nodeType === 1 && BATAS_NILAI.test(n.tagName)); n = n.nextSibling) v += n.textContent;
            v = v.replace(/\s+/g, ' ').trim();
            if (!v) v = teksBersih(s.nextElementSibling) || teksBersih(s.parentElement && s.parentElement.nextElementSibling);
            if (v && !unit.includes(v)) unit.push(v);
        }
        if (unit.length) return unit.length === 1 ? unit[0] : unit.map((u, i) => (i + 1) + '. ' + u).join('\n'); // >1 unit: bernomor, tiap unit di baris sendiri
        // 2) Cadangan: judul <h1>
        for (const h of doc.querySelectorAll('h1')) {
            const t = teksBersih(h);
            if (t && !BUKAN_TIPE.test(t)) return t;
        }
        return '';
    }

    async function ambilDetail(url) {
        const c = cache[url];
        if (c && (!c.sementara || c.sementara > Date.now())) return c;
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const hasil = { outlet: cariOutlet(doc) || '', teknisi: cariTeknisi(doc), tipe: cariTipe(doc) || '' };
        // belum lengkap (mungkin belum ditugaskan): simpan sebentar saja supaya tidak diambil ulang tiap tabel digambar ulang
        if (!hasil.outlet || !hasil.teknisi) hasil.sementara = Date.now() + MASA_SEMENTARA;
        cache[url] = hasil;
        simpanCache();
        return hasil;
    }

    // ===== Alamat detail servis dari link di baris =====
    // Dikenali: /servis_elektroniks/kelola_servis/ID, /servis_elektroniks/ID/edit, /servis_elektroniks/nota_penerimaan/ID.
    // nota_tutup_servis/ID sengaja TIDAK dipakai (itu nota servis REFERENSI/garansi, ID-nya servis lain).
    function alamatDetail(tr) {
        const tautan = Array.from(tr.querySelectorAll('a[href]')).map(a => a.getAttribute('href') || '');
        const cari = (re) => { for (const h of tautan) { const m = h.match(re); if (m) return m[1]; } return ''; };
        const id = cari(/\/servis_elektroniks\/kelola_servis\/(\d+)/) ||
                   cari(/\/servis_elektroniks\/(\d+)\/edit/) ||
                   cari(/\/servis_elektroniks\/nota_penerimaan\/(\d+)/);
        return id ? location.origin + '/servis_elektroniks/kelola_servis/' + id : '';
    }

    // ===== Ikon kotak berpojok oval (sama dengan halaman Kelola Servis) =====
    let ukIkon = 0;
    function ukuranIkon(acuan) {
        if (!ukIkon) {
            const fs = parseFloat(getComputedStyle(acuan).fontSize) || 13;
            ukIkon = Math.max(14, Math.round(fs * 1.25));
        }
        return ukIkon;
    }
    function ikonKotak(kelasGambar, warna, px) {
        const w = document.createElement('span');
        w.setAttribute('aria-hidden', 'true');
        w.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;' +
            'width:' + px + 'px;height:' + px + 'px;border-radius:' + Math.max(3, Math.round(px * 0.3)) + 'px;vertical-align:middle;background:' + warna;
        const i = document.createElement('i');
        i.className = 'fa ' + kelasGambar;
        i.style.cssText = 'font-size:' + Math.round(px * 0.58) + 'px;line-height:1;color:#fff !important;margin:0';
        w.appendChild(i);
        return w;
    }

    // ===== Tambahan tampil sekaligus (tabel tidak bergerak) + DataTables diminta hitung ulang kolom =====
    const tertunda = [];
    let timerPaksa = null, timerUkur = null, timerUkur2 = null;
    function ukurUlangTabel() {
        clearTimeout(timerUkur);
        clearTimeout(timerUkur2);
        timerUkur = setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
        timerUkur2 = setTimeout(() => window.dispatchEvent(new Event('resize')), 1200);
    }
    function tundaTampil(el) {
        el.classList.add('si_tunda');
        tertunda.push(el);
        if (!timerPaksa) timerPaksa = setTimeout(tampilkanSemua, 15000);
    }
    function tampilkanSemua() {
        clearTimeout(timerPaksa);
        timerPaksa = null;
        if (!tertunda.length) return;
        while (tertunda.length) tertunda.shift().classList.remove('si_tunda');
        ukurUlangTabel();
    }

    function pasangStyle() {
        if (document.getElementById('si_style')) return;
        const st = document.createElement('style');
        st.id = 'si_style';
        st.textContent = '.si_tunda { display: none !important; }' +
            '.si_tipe { transition: color .15s ease, background-color .15s ease; }' +
            '.si_tipe:hover { color: #fff !important; background-color: #0d6efd !important; }' +
            '.si_wa svg { width: 15px; height: 15px; vertical-align: middle; }' +
            '@media (max-width: 768px) { .si_wa { display: inline-block; padding: 3px 0; } .si_wa svg { width: 18px; height: 18px; } }';
        document.head.appendChild(st);
    }

    // ===== Cari tabel + kolom tanggal penerimaan dari JUDUL header =====
    function temukanTabel() {
        // DataTables memecah tabel: tabel header terpisah (tanpa isi) + tabel isi. Yang dicari tabel yang BERISI baris.
        const kandidat = Array.from(document.querySelectorAll('table#data_table, table')).filter((t, i, a) => a.indexOf(t) === i)
            .filter(t => t.querySelector('tbody tr'));
        for (const tabel of kandidat) {
            const ths = tabel.querySelectorAll('thead tr:last-child th');
            for (let i = 0; i < ths.length; i++) {
                if (RE_JUDUL_TANGGAL.test(teksBersih(ths[i]))) {
                    let ip = -1;
                    for (let k = 0; k < ths.length; k++) if (teksBersih(ths[k]).toLowerCase() === 'pelanggan') { ip = k; break; }
                    return { tabel, idx: i, ip };
                }
            }
        }
        return null;
    }

    // ===== Kolom Pelanggan: nomor HP diganti ikon WhatsApp (>1 nomor -> daftar) =====
    const RE_HP = /(?:\+?62[\s-]?|0)8[\d\s.-]{7,16}\d/g;
    const IKON_WA = '<svg viewBox="0 0 24 24" width="15" height="15" style="vertical-align:middle"><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';

    function nomorWA(mentah) {
        let d = mentah.replace(/\D/g, '');
        if (d.startsWith('0')) d = '62' + d.slice(1);
        else if (d.startsWith('8')) d = '62' + d;
        return d;
    }

    function linkWA(mentah, denganTeks) {
        const a = document.createElement('a');
        a.href = 'https://wa.me/' + nomorWA(mentah);
        a.target = '_blank';
        a.rel = 'noopener';
        a.title = 'Chat WhatsApp ' + mentah;
        a.className = 'si_wa';
        a.style.cssText = 'text-decoration:none;white-space:nowrap;color:inherit';
        a.innerHTML = IKON_WA;
        if (denganTeks) a.appendChild(document.createTextNode(' ' + mentah));
        return a;
    }

    function telpJadiWA(tabel) {
        // posisi kolom Pelanggan di baris yang SUDAH disisipi kolom buatan skrip (hitung semua th)
        const ths = tabel.querySelectorAll('thead tr:last-child th');
        let ipPenuh = -1;
        for (let i = 0; i < ths.length; i++) if (teksBersih(ths[i]).toLowerCase() === 'pelanggan') { ipPenuh = i; break; }
        if (ipPenuh < 0) return;
        tabel.querySelectorAll('tbody tr').forEach(tr => {
            const td = tr.children[ipPenuh];
            if (!td || td.dataset.siWa || td.colSpan > 1) return;
            td.dataset.siWa = '1';
            const nomor = []; // kunci nomor yang sudah dipakai (tanpa duplikat)
            const simpul = [];
            const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const tn = walker.currentNode;
                if (tn.parentElement && tn.parentElement.closest('.si_tipe, .si_baris')) continue; // teks tambahan kita bukan nomor telepon
                simpul.push(tn);
            }
            simpul.forEach(n => {
                // Nomor diganti di tempatnya: "Telp. 0812..." -> "Telp. [ikon] 0812...". "0812.../0856..." = 2 nomor
                // (pola tidak melewati "/" "," ";"); nomor ke-2 dst sebaris, dipisah "/".
                const teks = n.nodeValue;
                const frag = document.createDocumentFragment();
                let akhir = 0, ada = false;
                for (const m of teks.matchAll(RE_HP)) {
                    const k = nomorWA(m[0]);
                    if (k.length < 11 || k.length > 15) continue; // bukan nomor HP
                    ada = true;
                    const sebelum = teks.slice(akhir, m.index);
                    akhir = m.index + m[0].length;
                    if (nomor.includes(k)) { if (sebelum.trim().replace(/[/,;|-]/g, '')) frag.appendChild(document.createTextNode(sebelum)); continue; } // nomor dobel
                    if (nomor.length) { // nomor ke-2 dst: tetap sebaris, dipisah " / " (atau pemisah aslinya)
                        const pisah = sebelum.trim();
                        frag.appendChild(document.createTextNode(' ' + (pisah || '/') + ' '));
                    } else if (sebelum) frag.appendChild(document.createTextNode(sebelum));
                    nomor.push(k);
                    frag.appendChild(linkWA(m[0].trim(), true));
                }
                if (!ada) return;
                const sisa = teks.slice(akhir);
                if (sisa.trim().replace(/[/,;|-]/g, '')) frag.appendChild(document.createTextNode(sisa));
                // link tel:/wa lama yang membungkus teks ini dibuang bungkusnya (diganti link ikon)
                const lama = n.parentElement && n.parentElement.closest('a');
                if (lama && td.contains(lama) && lama.textContent.trim() === teks.trim()) lama.replaceWith(frag);
                else n.replaceWith(frag);
            });
        });
    }

    // ===== Isi sel =====
    const antrian = [];
    let aktif = 0;

    // Ukuran huruf teks pertama yang tampil di sel (tanggal): dari elemen yang memuat teks itu; cadangan: ukuran sel
    function ukuranTeksSel(sel) {
        const w = document.createTreeWalker(sel, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
            if (n.nodeValue.trim() && n.parentElement) return getComputedStyle(n.parentElement).fontSize;
        }
        return getComputedStyle(sel).fontSize;
    }

    function buatBaris(sel, kelasGambar, teksAwal, ukuran, judul) {
        const baris = document.createElement('div');
        baris.className = 'si_baris';
        baris.style.cssText = 'display:flex;align-items:flex-start;justify-content:flex-start;gap:4px;text-align:left;margin-top:4px;' +
            'color:#000 !important;white-space:normal;overflow-wrap:anywhere;contain:inline-size;line-height:1.25;font-size:' + ukuran + 'px';
        if (judul) baris.title = judul;
        const tr = sel.closest('tr');
        const tautan = sel.querySelector('a') || (tr && tr.querySelector('a')); // warna ikon = warna link bawaan Erzap (sel tanggal biasanya tanpa link -> pakai link pertama di baris)
        const warna = tautan ? getComputedStyle(tautan).color : '#0d6efd';
        const teks = document.createElement('span');
        teks.style.cssText = 'min-width:0;flex:1 1 auto';
        teks.textContent = teksAwal;
        baris.append(ikonKotak(kelasGambar, warna, ukuranIkon(tautan || sel)), teks);
        return { baris, teks };
    }

    // Ukuran huruf baris "Telp. ..." di sel Pelanggan (dibaca dari elemen yang memuat tulisan "Telp"). Bila sel tidak punya baris
    // telepon, dipakai ukuran huruf sel itu sendiri (ukuran nama pelanggan). Dibaca SEBELUM tipe ditambahkan.
    function ukuranTelp(sel) {
        const w = document.createTreeWalker(sel, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
            if (/telp/i.test(n.nodeValue) && n.parentElement) return getComputedStyle(n.parentElement).fontSize;
        }
        return getComputedStyle(sel).fontSize;
    }

    // Tipe HP/motor di bawah nama pelanggan: kotak biru muda berpojok membulat, ukuran huruf = ukuran huruf nama pelanggan
    function buatTipe(selPelanggan) {
        const el = document.createElement('div');
        el.className = 'si_tipe';
        const ukuranNama = ukuranTelp(selPelanggan); // = ukuran huruf baris "Telp." (cadangan: ukuran sel)
        el.style.cssText = 'display:block;width:fit-content;max-width:100%;margin-top:8px;padding:2px 10px;border-radius:6px;' +
            'color:#0d6efd;background:rgba(13,110,253,.12);white-space:pre-line;font-size:' + ukuranNama;
        el.textContent = '...';
        return el;
    }

    function jalankanAntrian() {
        while (aktif < PARALEL && antrian.length) {
            const { url, outlet, teknisi, tipe } = antrian.shift();
            if (!outlet.teks.isConnected) continue; // baris sudah hilang karena tabel digambar ulang
            aktif++;
            ambilDetail(url)
                .then(d => { outlet.teks.textContent = d.outlet || '-'; teknisi.teks.textContent = d.teknisi || '-'; if (tipe) tipe.textContent = d.tipe || '-'; })
                .catch(e => { outlet.teks.textContent = '?'; teknisi.teks.textContent = '?'; if (tipe) tipe.textContent = '?'; outlet.baris.title = String(e && e.message || e); })
                .finally(() => { aktif--; if (!aktif && !antrian.length) tampilkanSemua(); jalankanAntrian(); });
        }
    }

    function proses() {
        const ketemu = temukanTabel();
        if (!ketemu) return;
        const { tabel, idx, ip } = ketemu;
        pasangStyle();
        let baru = 0;
        tabel.querySelectorAll('tbody tr').forEach(tr => {
            const sel = tr.children[idx];
            if (!sel || sel.colSpan > 1 || sel.classList.contains(TANDA)) return;
            const url = alamatDetail(tr);
            if (!url) return; // baris tanpa link servis (mis. baris "tidak ada data")
            sel.classList.add(TANDA);
            baru++;
            // ukuran huruf outlet/teknisi = ukuran huruf teks tanggal di sel itu (dibaca SEBELUM keduanya ditambahkan)
            const ukuran = parseFloat(ukuranTeksSel(sel)) || 13;
            const outlet = buatBaris(sel, 'fa-building', '...', ukuran, 'Outlet');
            const teknisi = buatBaris(sel, 'fa-user', '...', ukuran, IST_TEKNISI);
            tundaTampil(outlet.baris);
            tundaTampil(teknisi.baris);
            // Susunan: sel Tanggal Terima = tanggal / estimasi / [outlet] / [teknisi]; sel Pelanggan = nama / telepon (ikon WhatsApp) / [tipe].
            const selPelanggan = ip >= 0 ? tr.children[ip] : null;
            // ukuran huruf tipe = ukuran huruf baris "Telp." asli di sel Pelanggan (cadangan: ukuran sel tanggal)
            const tipe = buatTipe(selPelanggan || sel);
            tundaTampil(tipe);
            sel.append(outlet.baris, teknisi.baris);
            (selPelanggan || sel).appendChild(tipe); // tipe di sel Pelanggan (cadangan bila kolom Pelanggan tidak ada: sel Tanggal)
            antrian.push({ url, outlet, teknisi, tipe });
        });
        // Nomor HP di kolom Pelanggan tetap jadi ikon WhatsApp (sama dengan halaman Kelola Servis)
        const sebelumWa = tabel.querySelectorAll('[data-si-wa]').length;
        telpJadiWA(tabel);
        if (tabel.querySelectorAll('[data-si-wa]').length > sebelumWa) ukurUlangTabel();
        if (baru) {
            ukurUlangTabel();
            jalankanAntrian();
            if (!aktif && !antrian.length) tampilkanSemua();
        }
    }

    let timerProses = null;
    function jadwalkanProses() {
        clearTimeout(timerProses);
        timerProses = setTimeout(proses, 50);
    }
    proses();
    new MutationObserver(jadwalkanProses).observe(document.body, { childList: true, subtree: true });
})();
