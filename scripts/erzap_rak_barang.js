// ==UserScript==
// @name         Erzap - crud rak barangs
// @namespace    http://tampermonkey.net/
// @version      1.2.3
// @description  [v1.2.3] Tambah Rak Massal melewati rak yang sudah ada (dicek dari semua halaman daftar Rak Barang; kalau tabel punya kolom Gudang, hanya rak di gudang terpilih). [v1.2.2] Tambah Rak Massal dari halaman daftar: pilihan Gudang diambil langsung dari form Tambah Rak di Erzap (dulu daftar tetap OTOTECH, salah di toko lain); daftar tetap hanya cadangan di ototech. Tambah tombol hapus (per-baris & massal) & tambah rak massal (by range) di halaman Rak Barang
// @match        https://*.erzap.com/rak_barangs*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Cadangan daftar Gudang KHUSUS ototech.erzap.com, dipakai hanya kalau form Tambah Rak
    // tidak bisa dibaca. Toko lain punya ID gudang sendiri, jadi daftar ini tidak boleh
    // dipakai di sana (rak bisa terbuat di gudang yang salah).
    const OTOTECH = /(^|[.-])ototech([.-]|$)/i.test(location.hostname.replace(/\.erzap\.com$/i, ''));
    const GUDANG_OPTIONS_FALLBACK = `
        <option value="">-- Pilih Gudang --</option>
        <option value="2">RETUR OTOTECH</option>
        <option value="3">TOKO OTOTECH</option>
        <option value="9">TOKO PANDERMAN</option>
        <option value="10">REST UP CAFE</option>
    `;
    const GUDANG_SELECT = '#rak_barang_idgudang, select[name="rak_barang[idgudang]"]';
    let gudangTermuat = false;

    let overlayEl = null;

    function showLoading(text) {
        if (!overlayEl) {
            overlayEl = document.createElement('div');
            overlayEl.id = 'hapus_rak_overlay';
            overlayEl.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
            overlayEl.innerHTML = `
                <div style="background:#fff;padding:20px 28px;border-radius:8px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,0.2);">
                    <div style="width:20px;height:20px;border:3px solid #ddd;border-top-color:#dc3545;border-radius:50%;animation:hapus_rak_spin 0.7s linear infinite;"></div>
                    <span id="hapus_rak_overlay_text" style="font-size:14px;color:#333;">${text}</span>
                </div>
                <style>@keyframes hapus_rak_spin { to { transform: rotate(360deg); } }</style>
            `;
            document.body.appendChild(overlayEl);
        }
        const label = overlayEl.querySelector('#hapus_rak_overlay_text');
        if (label) label.textContent = text;
        overlayEl.style.display = 'flex';
    }

    function hideLoading() {
        if (overlayEl) overlayEl.style.display = 'none';
    }

    function getIdFromRow(tr) {
        const links = tr.querySelectorAll('a[href*="/rak_barangs/"]');
        for (const a of links) {
            const m = a.getAttribute('href').match(/^\/rak_barangs\/(\d+)$/);
            if (m) return m[1];
        }
        return null;
    }

    function destroyUrl(id) {
        return `/rak_barangs/destroy/${id}?page=1`;
    }

    async function deleteRakBarang(id) {
        const res = await fetch(destroyUrl(id), { credentials: 'same-origin' });
        if (!res.ok) {
            console.error('[HapusRak] gagal id=', id, 'status=', res.status);
        }
        return res.ok;
    }

    function ensureToolbar() {
        if (document.getElementById('hapus_rak_toolbar')) return;
        const h1 = document.querySelector('#ajax_target h1');
        if (!h1) return;

        const bar = document.createElement('div');
        bar.id = 'hapus_rak_toolbar';
        bar.style.cssText = 'margin:10px 0;display:flex;gap:8px;align-items:center;';
        bar.innerHTML = `
            <button id="btn_pilih_semua_rak" type="button" style="padding:5px 12px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:#fff;">Pilih Semua</button>
            <button id="btn_hapus_terpilih_rak" type="button" style="padding:5px 12px;border:none;border-radius:4px;cursor:pointer;background:#dc3545;color:#fff;">Hapus Terpilih</button>
            <button id="btn_tambah_rak_massal" type="button" style="padding:5px 12px;border:none;border-radius:4px;cursor:pointer;background:#28a745;color:#fff;">+ Tambah Rak Massal</button>
        `;
        h1.insertAdjacentElement('afterend', bar);

        document.getElementById('btn_pilih_semua_rak').addEventListener('click', () => {
            const boxes = document.querySelectorAll('.chk_rak');
            const allChecked = Array.from(boxes).every((c) => c.checked);
            boxes.forEach((c) => (c.checked = !allChecked));
        });

        document.getElementById('btn_hapus_terpilih_rak').addEventListener('click', async () => {
            const selected = Array.from(document.querySelectorAll('.chk_rak:checked')).map((c) => c.value);
            if (!selected.length) {
                alert('Pilih minimal 1 data dulu.');
                return;
            }
            if (!confirm(`Apakah anda yakin ingin menghapus ${selected.length} data terpilih?`)) return;

            let success = 0;
            showLoading(`Menghapus 0/${selected.length}...`);
            for (const [i, id] of selected.entries()) {
                const ok = await deleteRakBarang(id);
                if (ok) success++;
                showLoading(`Menghapus ${i + 1}/${selected.length}...`);
            }
            hideLoading();
            alert(`${success} dari ${selected.length} data berhasil dihapus.`);
            location.reload();
        });

        document.getElementById('btn_tambah_rak_massal').addEventListener('click', openBulkRakModal);
    }

    function injectRowControls() {
        const rows = document.querySelectorAll('#data_table tbody tr');
        rows.forEach((tr) => {
            if (tr.querySelector('.chk_rak')) return;

            const id = getIdFromRow(tr);
            if (!id) return;

            const tds = tr.querySelectorAll('td');
            const lihatTd = tds[1];
            const editTd = tds[2];
            if (!lihatTd || !editTd) return;

            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.className = 'chk_rak';
            chk.value = id;
            chk.style.marginRight = '6px';
            lihatTd.insertBefore(chk, lihatTd.firstChild);

            const sep = document.createTextNode(' | ');
            const hapusLink = document.createElement('a');
            hapusLink.href = destroyUrl(id);
            hapusLink.textContent = 'Hapus';
            hapusLink.style.color = '#dc3545';
            hapusLink.addEventListener('click', (e) => {
                e.preventDefault();
                const r = confirm('Apakah anda yakin ingin menghapus data ini?');
                if (!r) return;
                showLoading('Menghapus data...');
                window.location = destroyUrl(id);
            });
            editTd.appendChild(sep);
            editTd.appendChild(hapusLink);
        });
    }

    function parseNameParts(name) {
        const m = name.match(/^(.*?)(\d+)$/);
        if (!m) return null;
        return { prefix: m[1], digits: m[2] };
    }

    function generateRakNames(startName, endName) {
        const s = parseNameParts(startName.trim());
        const e = parseNameParts(endName.trim());
        if (!s || !e) throw new Error('Format nama harus diakhiri angka, contoh: RKB-001');
        if (s.prefix !== e.prefix) throw new Error('Bagian awal nama (sebelum angka) harus sama, contoh: RKB-001 sampai RKB-020');
        const startNum = parseInt(s.digits, 10);
        const endNum = parseInt(e.digits, 10);
        if (endNum < startNum) throw new Error('Nama akhir harus lebih besar atau sama dengan nama awal');
        const pad = Math.max(s.digits.length, e.digits.length);
        const names = [];
        for (let n = startNum; n <= endNum; n++) {
            names.push(s.prefix + String(n).padStart(pad, '0'));
        }
        return names;
    }

    // ===== Rak yang sudah ada: dibaca dari semua halaman daftar Rak Barang =====
    function norm(s) {
        return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    // Hasil: Set nama rak (huruf kecil) yang sudah ada. Kalau tabel punya kolom Gudang, hanya rak di
    // gudang terpilih yang dihitung (nama sama di gudang lain tetap dibuat); tanpa kolom Gudang, semua rak.
    async function muatRakAda(namaGudang) {
        const gudang = norm(namaGudang);
        const ada = new Set();
        const idTerlihat = new Set();
        for (let page = 1; page <= 200; page++) {
            const res = await fetch(`/rak_barangs/index/new?page=${page}`, { credentials: 'same-origin' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const tabel = doc.querySelector('#data_table');
            if (!tabel) throw new Error('tabel daftar rak tidak ditemukan');
            const judul = Array.from(tabel.querySelectorAll('thead tr:last-child th')).map((th) => norm(th.textContent));
            const iNama = judul.findIndex((t) => /^nama/.test(t));
            const iGudang = judul.findIndex((t) => /gudang/.test(t));
            let baru = 0;
            for (const tr of tabel.querySelectorAll('tbody tr')) {
                const id = getIdFromRow(tr);
                if (!id || idTerlihat.has(id)) continue;
                idTerlihat.add(id);
                baru++;
                const sel = Array.from(tr.children).map((td) => norm(td.textContent));
                if (iGudang >= 0 && gudang && !(sel[iGudang] || '').includes(gudang)) continue;
                if (iNama >= 0) {
                    if (sel[iNama]) ada.add(sel[iNama]);
                } else {
                    sel.forEach((t) => t && ada.add(t)); // kolom Nama tidak dikenali: cocokkan dengan isi sel mana pun
                }
            }
            if (!baru) break; // halaman kosong, atau server mengulang halaman yang sama
        }
        return ada;
    }

    function getAuthToken() {
        return document.querySelector('#new_rak_barang input[name="authenticity_token"]')?.value
            || document.querySelector('meta[name="csrf-token"]')?.content
            || document.querySelector('input[name="authenticity_token"]')?.value
            || '';
    }

    async function createRakBarang({ nama, idgudang, keterangan, isActive }) {
        const body = new URLSearchParams();
        body.append('utf8', '✓');
        body.append('authenticity_token', getAuthToken());
        body.append('rak_barang[nama]', nama);
        body.append('rak_barang[idgudang]', idgudang);
        body.append('rak_barang[keterangan]', keterangan || '');
        body.append('rak_barang[is_active]', isActive ? '1' : '0');

        const res = await fetch('/rak_barangs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            credentials: 'same-origin',
        });

        const text = await res.text();
        const failed = !res.ok || text.includes('id="new_rak_barang"');
        if (failed) {
            console.error('[TambahRak] gagal nama=', nama, 'status=', res.status);
        }
        return !failed;
    }

    function closeBulkRakModal() {
        const backdrop = document.getElementById('bulk_rak_modal_backdrop');
        if (backdrop) backdrop.style.display = 'none';
    }

    // Salin pilihan Gudang dari <select> asli Erzap (dibuat ulang sebagai Option, bukan innerHTML)
    function salinGudang(target, sumber) {
        target.innerHTML = '';
        for (const o of sumber.options) target.appendChild(new Option(o.textContent.trim(), o.value));
        target.value = '';
    }

    function pesanGudang(target, teks) {
        target.innerHTML = '';
        target.appendChild(new Option(teks, ''));
    }

    // Alamat form Tambah Rak: dari link di halaman (kalau ada), lalu alamat bawaan /rak_barangs/new
    function alamatFormTambah() {
        const dariLink = Array.from(document.querySelectorAll('a[href]'))
            .map((a) => a.getAttribute('href'))
            .filter((h) => /\/rak_barangs\/new(?:[?#]|$)/.test(h));
        return Array.from(new Set(dariLink.concat('/rak_barangs/new')));
    }

    async function muatGudangDariErzap(target) {
        pesanGudang(target, '-- Memuat daftar Gudang... --');
        for (const url of alamatFormTambah()) {
            try {
                const res = await fetch(url, { credentials: 'same-origin' });
                if (!res.ok) continue;
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                const sel = doc.querySelector(GUDANG_SELECT);
                if (sel && Array.from(sel.options).some((o) => o.value)) {
                    salinGudang(target, sel);
                    return true;
                }
            } catch (e) {
                console.error('[TambahRak] gagal membaca form Tambah Rak', url, e);
            }
        }
        return false;
    }

    async function openBulkRakModal() {
        const backdrop = document.getElementById('bulk_rak_modal_backdrop');
        if (!backdrop) return;
        const target = backdrop.querySelector('#bulk_rak_gudang');
        backdrop.style.display = 'flex';

        // Di halaman form tambah rak: ambil dari select aslinya
        const form = document.querySelector('#new_rak_barang');
        const liveGudangSelect = form && form.querySelector(GUDANG_SELECT);
        if (liveGudangSelect) {
            salinGudang(target, liveGudangSelect);
            gudangTermuat = true;
            return;
        }
        if (gudangTermuat) return;

        // Di halaman daftar: baca form Tambah Rak dari Erzap
        if (await muatGudangDariErzap(target)) {
            gudangTermuat = true;
        } else if (OTOTECH) {
            target.innerHTML = GUDANG_OPTIONS_FALLBACK;
            gudangTermuat = true;
        } else {
            pesanGudang(target, '-- Daftar Gudang tidak terbaca --');
            alert('Daftar Gudang tidak bisa dibaca dari Erzap.\nBuka halaman Tambah Rak, lalu klik "+ Tambah Rak Massal" di sana.');
        }
    }

    function injectBulkCreateButtonOnFormPage() {
        const form = document.querySelector('#new_rak_barang');
        if (!form || document.getElementById('bulk_rak_open_btn')) return;

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.id = 'bulk_rak_open_btn';
        openBtn.textContent = '+ Tambah Rak Massal';
        openBtn.style.cssText = 'margin-top:16px;padding:6px 16px;border:none;border-radius:4px;cursor:pointer;background:#28a745;color:#fff;';
        form.insertAdjacentElement('afterend', openBtn);
        openBtn.addEventListener('click', openBulkRakModal);
    }

    function buildBulkRakModal() {
        if (document.getElementById('bulk_rak_modal_backdrop')) return;

        const backdrop = document.createElement('div');
        backdrop.id = 'bulk_rak_modal_backdrop';
        backdrop.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.45);display:none;align-items:center;justify-content:center;';
        backdrop.innerHTML = `
            <div style="background:#fff;padding:20px 24px;border-radius:8px;max-width:420px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.25);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;">Tambah Rak Massal (Range)</h3>
                    <span id="bulk_rak_close_btn" style="cursor:pointer;font-size:20px;line-height:1;color:#666;">&times;</span>
                </div>
                <div class="field" style="margin-top:14px;">
                    <label>Gudang</label><br>
                    <select id="bulk_rak_gudang" style="width:100%;"><option value="">-- Pilih Gudang --</option></select>
                </div>
                <div class="field" style="margin-top:10px;">
                    <label>Nama Rak Mulai</label><br>
                    <input type="text" id="bulk_rak_start" placeholder="contoh: RKB-001" style="width:100%;">
                </div>
                <div class="field" style="margin-top:10px;">
                    <label>Nama Rak Sampai</label><br>
                    <input type="text" id="bulk_rak_end" placeholder="contoh: RKB-020" style="width:100%;">
                </div>
                <div class="field" style="margin-top:10px;">
                    <label>Keterangan (opsional, berlaku untuk semua)</label><br>
                    <textarea id="bulk_rak_keterangan" style="width:100%;"></textarea>
                </div>
                <div class="field" style="margin-top:10px;">
                    <label><input type="checkbox" id="bulk_rak_active" checked> Aktifkan</label>
                </div>
                <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
                    <button type="button" id="bulk_rak_cancel_btn" style="padding:6px 16px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:#fff;">Batal</button>
                    <button type="button" id="bulk_rak_submit" style="padding:6px 16px;border:none;border-radius:4px;cursor:pointer;background:#28a745;color:#fff;">Buat Rak</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeBulkRakModal();
        });
        backdrop.querySelector('#bulk_rak_close_btn').addEventListener('click', closeBulkRakModal);
        backdrop.querySelector('#bulk_rak_cancel_btn').addEventListener('click', closeBulkRakModal);

        backdrop.querySelector('#bulk_rak_submit').addEventListener('click', async () => {
            const idgudang = backdrop.querySelector('#bulk_rak_gudang').value;
            const startName = backdrop.querySelector('#bulk_rak_start').value;
            const endName = backdrop.querySelector('#bulk_rak_end').value;
            const keterangan = backdrop.querySelector('#bulk_rak_keterangan').value;
            const isActive = backdrop.querySelector('#bulk_rak_active').checked;

            if (!idgudang) {
                alert('Pilih Gudang dulu.');
                return;
            }

            let names;
            try {
                names = generateRakNames(startName, endName);
            } catch (err) {
                alert(err.message);
                return;
            }

            if (names.length > 500) {
                alert(`Rentang terlalu besar (${names.length} rak). Cek lagi nama awal/akhir.`);
                return;
            }

            // Rak yang sudah ada dilewati
            const selGudang = backdrop.querySelector('#bulk_rak_gudang');
            const namaGudang = (selGudang.options[selGudang.selectedIndex] || {}).textContent || '';
            showLoading('Mengecek rak yang sudah ada...');
            let ada = null;
            try {
                ada = await muatRakAda(namaGudang);
            } catch (err) {
                console.error('[TambahRak] gagal membaca daftar rak yang sudah ada', err);
            }
            hideLoading();
            if (!ada && !confirm('Daftar rak yang sudah ada tidak bisa dibaca, jadi rak yang sudah ada tidak bisa dilewati (bisa dobel).\nTetap lanjutkan?')) return;
            const dilewati = ada ? names.filter((n) => ada.has(norm(n))) : [];
            const dibuat = names.filter((n) => !dilewati.includes(n));
            if (!dibuat.length) {
                alert(`Semua ${names.length} rak sudah ada, tidak ada yang dibuat.`);
                return;
            }

            const ringkas = (arr) => arr.length <= 8
                ? arr.join(', ')
                : `${arr.slice(0, 3).join(', ')}, ..., ${arr.slice(-3).join(', ')}`;
            if (!confirm(`Akan membuat ${dibuat.length} rak: ${ringkas(dibuat)}`
                + (dilewati.length ? `\nDilewati karena sudah ada (${dilewati.length}): ${ringkas(dilewati)}` : '')
                + '\nLanjutkan?')) return;

            let success = 0;
            showLoading(`Membuat 0/${dibuat.length}...`);
            for (const [i, nama] of dibuat.entries()) {
                const ok = await createRakBarang({ nama, idgudang, keterangan, isActive });
                if (ok) success++;
                showLoading(`Membuat ${i + 1}/${dibuat.length}...`);
            }
            hideLoading();
            closeBulkRakModal();
            alert(`${success} dari ${dibuat.length} rak berhasil dibuat.`
                + (dilewati.length ? `\n${dilewati.length} rak dilewati karena sudah ada.` : '')
                + (success < dibuat.length ? '\nCek console (F12) untuk detail yang gagal.' : ''));
            location.href = '/rak_barangs/index/new?page=1';
        });
    }

    function init() {
        buildBulkRakModal();
        if (document.querySelector('#data_table tbody tr')) {
            ensureToolbar();
            injectRowControls();
        }
        injectBulkCreateButtonOnFormPage();
    }

    const observer = new MutationObserver(() => init());
    observer.observe(document.body, { childList: true, subtree: true });
    init();
})();
