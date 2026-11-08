// ==UserScript==
// @name         Erzap - Sales Penjualan
// @namespace    http://tampermonkey.net/
// @version      1.9.1
// @description  Halaman Data Penjualan (detail): tombol 'Batal' di samping 'Duplikasi Penjualan'. Form Pencatatan Penjualan: Tipe Penjualan otomatis dari nama Pelanggan (shopee/tiktok/tokopedia -> Marketplace, NON-MEMBERSHIP -> Offline/Instore, S+angka -> Antar Outlet). Popup Tukar Tambah: Barang Bekas dinonaktifkan, Dari/Tujuan Outlet, No Faktur setelah outlet diisi, peringatan outlet, tombol 'Retur Antar Outlet'. Popup Draf Penjualan yang kosong tidak ditampilkan. Fitur hanya untuk role yang diatur di AKSES_JSON.
// @match        https://*.erzap.com/penjualans*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @world        main
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ====== HAK AKSES & FITUR (JSON) ======
    // "public"  -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini. Kosong = tidak ada fitur untuk umum.
    // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua).
    //              Nama fitur: batal, tipeMarketplace, tipePelanggan, tukarTambah, drafKosong, jumlahAngka, peringatanStok, tipePartdistro.
    // "role"    -> nama-nama role: "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
    //              cukup sebagian nama; isi nama lengkap persis seperti di ERZAP), "fitur" = fitur private yang boleh dipakai role itu.
    // Fitur yang tidak disebut di "public" maupun "private" ditolak.
    // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
    // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
    const AKSES_JSON = `{
        "public": [],
        "private": ["batal", "tipeMarketplace", "tipePelanggan", "tukarTambah", "drafKosong", "jumlahAngka", "peringatanStok", "tipePartdistro"],
        "role": {
          "pusat": {
            "nama": ["SENTOT", "SURYO", "MANAJEMEN PUSAT", "TIMORITEL"],
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
            return { public: [], role: [] };
        }
    }
    const AKSES = bacaAkses();

    // dicek saat dipakai (bukan sekali di awal), karena nama kasir di pojok ERZAP bisa dimuat belakangan.
    function bolehFitur(fitur) {
        if (AKSES.public.indexOf(fitur) !== -1) return true;
        const nama = (((document.getElementById('info_kasir') || {}).textContent) || '').replace(/\s+/g, ' ').trim().toLowerCase();
        for (const r of AKSES.role) {
            const cocok = r.nama.some(u => {
                u = u.replace(/\s+/g, ' ').trim().toLowerCase();
                return !!u && nama.indexOf(u) !== -1;
            });
            if (cocok) return r.fitur.indexOf('*') !== -1 || r.fitur.indexOf(fitur) !== -1;
        }
        return false;
    }

    /* ========== Tombol Batal (halaman Data Penjualan detail) ========== */
    let btnBatal = null;

    function pasangTombolBatal() {
        if (!bolehFitur('batal')) return;
        if (btnBatal && document.body.contains(btnBatal)) return;

        const dup = document.querySelector('a.button[href*="copy_penjualan"]');
        if (!dup) return;
        const wrapper = dup.closest('div') || dup.parentNode;
        if (!wrapper || !wrapper.parentNode) return;

        btnBatal = document.createElement('a');
        btnBatal.className = dup.className || 'button';
        btnBatal.href = 'javascript:void(0)';
        btnBatal.style.cssText = 'background:#dc3545;color:#fff;border-color:#dc3545;';
        btnBatal.textContent = 'Batal';
        btnBatal.addEventListener('click', function (e) {
            e.preventDefault();

            const m = location.pathname.match(/\/penjualans\/(\d+)/);
            const id = m ? m[1] : '';
            if (!id) return;

            const asli = document.querySelector('a[href*="/void_penjualan/"]');
            if (asli) { asli.click(); return; }

            if (typeof window.show_popup_batal === 'function') {
                const h1 = document.querySelector('.left h1');
                const km = h1 && h1.textContent.match(/Data Penjualan\s*-\s*(\S+)/);
                const kode = km ? km[1] : '';
                window.show_popup_batal(id, kode);
                return;
            }

            alert('Transaksi ini tidak bisa dibatalkan dari sini.');
        });

        const kolom = document.createElement('div');
        kolom.setAttribute('style', wrapper.getAttribute('style') || 'float:left;margin-right:10px');
        kolom.className = wrapper.className || '';
        kolom.appendChild(btnBatal);

        wrapper.parentNode.insertBefore(kolom, wrapper.nextSibling);
    }

    /* ========== Tipe Penjualan otomatis dari Pelanggan (form Pencatatan Penjualan) ========== */
    // Urutan aturan penting: aturan pertama yang cocok yang dipakai.
    const TIPE_RULES = [
        { test: n => /shopee|tokopedia|tiktok/.test(n), tipe: '3', fitur: 'tipeMarketplace' },   // 3. Marketplace
        { test: n => n.includes('non-membership'),       tipe: '6', fitur: 'tipePelanggan' },    // 1. Offline / Instore
        { test: n => /^s\d{2,}\b/.test(n),               tipe: '8', fitur: 'tipePelanggan' }     // 4. Antar Outlet (Internal)
    ];

    function setTipePenjualan(nilai) {
        const tipe = document.getElementById('penjualan_idtipe_penjualan');
        if (!tipe || tipe.value === nilai) return;
        if (window.jQuery) window.jQuery(tipe).val(nilai).trigger('change');   // select yang memakai plugin
        else { tipe.value = nilai; tipe.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    function cekTipePelanggan() {
        const pel = document.querySelector('input[name="penjualan[nama_pelanggan]"]');
        if (!pel) return;
        const n = pel.value.trim().toLowerCase();
        const rule = TIPE_RULES.find(r => r.test(n));
        if (!rule || !bolehFitur(rule.fitur)) return;
        setTipePenjualan(rule.tipe);
    }
    ['input', 'change', 'focusout'].forEach((t) => document.addEventListener(t, (e) => {
        if (e.target && e.target.name === 'penjualan[nama_pelanggan]') { try { cekTipePelanggan(); } catch (err) { /* abaikan */ } }
    }, true));
    // pemilihan dari daftar autocomplete (jQuery UI)
    document.addEventListener('autocompleteselect', () => {
        setTimeout(() => { try { cekTipePelanggan(); } catch (err) { /* abaikan */ } }, 50);
    }, true);

    /* ========== Popup Tukar Tambah (fitur tukarTambah) ========== */
    // Barang Bekas: hanya informasi, pilihannya dinonaktifkan
    function disableBarangBekas() {
        document.querySelectorAll('.card').forEach(card => {
            const h5 = card.querySelector('h5');
            if (!h5 || !/Barang Bekas/.test(h5.textContent)) return;
            card.querySelectorAll('input').forEach(i => { i.disabled = true; });
            card.querySelectorAll('label, button, a').forEach(el => {
                if (el.textContent.trim() === 'Pilih') {
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0.45';
                    el.setAttribute('aria-disabled', 'true');
                }
            });
        });
    }

    // Dari Outlet & Tujuan Outlet di atas No Faktur
    function addOutletFields() {
        if (document.getElementById('erzap_outlet_block')) return;
        const heads = Array.from(document.querySelectorAll('*')).filter(e =>
            e.textContent.trim() === 'Informasi Penjualan' &&
            !Array.from(e.children).some(c => c.textContent.trim() === 'Informasi Penjualan') &&
            e.offsetParent !== null);
        const head = heads[heads.length - 1];
        if (!head) return;
        const src = document.querySelector('#penjualan_idoutlet_own');
        const opts = src ? Array.from(src.options).filter(o => o.value) : [];
        const block = document.createElement('div');
        block.id = 'erzap_outlet_block';
        block.style.cssText = 'display:flex;gap:12px;margin:8px 0 14px 0;';
        function field(label, id) {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'flex:1;';
            const lb = document.createElement('label');
            lb.textContent = label;
            lb.style.cssText = 'display:block;font-weight:600;margin-bottom:4px;';
            const sel = document.createElement('select');
            sel.id = id;
            sel.style.cssText = 'width:100%;padding:6px;';
            const ph = document.createElement('option');
            ph.value = ''; ph.textContent = 'Pilih Outlet';
            sel.appendChild(ph);
            opts.forEach(o => {
                const op = document.createElement('option');
                op.value = o.value; op.textContent = o.textContent;
                sel.appendChild(op);
            });
            wrap.appendChild(lb);
            wrap.appendChild(sel);
            return wrap;
        }
        block.appendChild(field('Dari Outlet', 'erzap_dari_outlet'));
        block.appendChild(field('Tujuan Outlet', 'erzap_ke_outlet'));
        head.parentNode.insertBefore(block, head);
    }

    // No Faktur baru tampil setelah Dari Outlet dan Tujuan Outlet terisi
    function gateNoFaktur() {
        const dari = document.getElementById('erzap_dari_outlet');
        const ke = document.getElementById('erzap_ke_outlet');
        if (!dari || !ke) return;
        const ready = !!dari.value && !!ke.value;
        const head = Array.from(document.querySelectorAll('h5, div, span, label, p, strong, b')).filter(x =>
            x.textContent.trim() === 'Informasi Penjualan' &&
            !Array.from(x.children).some(c => c.textContent.trim() === 'Informasi Penjualan') &&
            x.parentElement && x.parentElement.contains(dari)).pop();
        if (!head) return;
        let s = head;
        while (s) {
            if (s.textContent.trim().startsWith('Informasi Produk')) break;
            s.style.display = ready ? '' : 'none';
            s = s.nextElementSibling;
        }
    }

    // Peringatan di footer popup: outlet faktur harus sama dengan Dari Outlet, dan tidak boleh sama dengan tujuan
    function checkOutletMatch() {
        const dari = document.getElementById('erzap_dari_outlet');
        if (!dari) return;
        const footer = Array.from(document.querySelectorAll('.modal-footer')).filter(f =>
            f.offsetParent !== null && f.parentElement && f.parentElement.contains(dari)).pop();
        if (!footer) return;
        let warn = document.getElementById('erzap_outlet_warn');
        if (!warn) {
            warn = document.createElement('div');
            warn.id = 'erzap_outlet_warn';
            warn.style.cssText = 'color:#b45309;background:#fef3c7;border:1px solid #f59e0b;padding:6px 10px;border-radius:4px;font-size:13px;line-height:1.3;align-self:center;max-width:60%;margin-right:auto;flex:0 1 auto;display:none;';
            footer.style.alignItems = 'center';
            footer.insertBefore(warn, footer.firstChild);
        }
        if (warn.parentElement !== footer) footer.insertBefore(warn, footer.firstChild);
        const lab = Array.from(document.querySelectorAll('*')).filter(e =>
            e.children.length === 0 && /^Outlet\s*:?$/.test(e.textContent.trim()) && e.offsetParent !== null).pop();
        const faktur = lab && lab.nextElementSibling ? lab.nextElementSibling.textContent.trim() : '';
        const dariTxt = dari.options[dari.selectedIndex] ? dari.options[dari.selectedIndex].textContent.trim() : '';
        const ke = document.getElementById('erzap_ke_outlet');
        if (!dari.value || !ke || !ke.value) { warn.textContent = ''; warn.style.display = 'none'; return; }
        const tujuanTxt = ke.options[ke.selectedIndex] ? ke.options[ke.selectedIndex].textContent.trim() : '';
        const samaTujuan = !!faktur && faktur.toUpperCase() === tujuanTxt.toUpperCase();
        const beda = !!faktur && faktur.toUpperCase() !== dariTxt.toUpperCase();
        let msg = '';
        if (samaTujuan) msg = '⚠ Outlet Faktur tidak boleh sama dengan outlet tujuan';
        else if (beda) msg = '⚠ Outlet Faktur Harus sama dengan outlet dari';
        warn.textContent = msg;
        warn.style.display = msg ? '' : 'none';
    }

    // Tulisan tombol "Tukar Tambah" diganti "Retur Antar Outlet" (ikon tetap)
    function renameTukarTambahBtn() {
        const b = document.getElementById('btn_tukar_tambah');
        if (!b) return;
        const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
            if (/Tukar Tambah/i.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/Tukar Tambah/i, 'Retur Antar Outlet');
        }
    }

    /* ========== Popup Draf Penjualan kosong (fitur drafKosong) ========== */
    function hideEmptyDraftPopup() {
        document.querySelectorAll('.modal').forEach(m => {
            if (getComputedStyle(m).display === 'none') return;
            const t = m.querySelector('.modal-title, h3, h4, h5');
            if (!t || !/Draf Penjualan/i.test(t.textContent)) return;
            if (!/Belum ada draf/i.test(m.textContent)) return;
            const close = Array.from(m.querySelectorAll('button')).find(b => /Tutup|Close/i.test(b.textContent));
            if (close) close.click();
            else m.style.display = 'none';
        });
    }

    // Satu pengecekan ringan untuk semua popup di atas (tanpa request ke server); masing-masing dijaga aksesnya
    function tickPopup() {
        try {
            if (bolehFitur('tukarTambah')) {
                disableBarangBekas();
                addOutletFields();
                gateNoFaktur();
                checkOutletMatch();
                renameTukarTambahBtn();
            }
        } catch (e) { /* dicoba lagi di pengecekan berikutnya */ }
        try { if (bolehFitur('drafKosong')) hideEmptyDraftPopup(); } catch (e) { /* dicoba lagi */ }
    }
    setInterval(tickPopup, 300);

    /* ========== Kolom Jumlah hanya angka (fitur jumlahAngka) ========== */
    const SEL_JUMLAH = 'input.jumlah_produk';
    let jumlahAngkaAktif = false;

    function pasangJumlahAngka() {
        if (jumlahAngkaAktif) return;
        jumlahAngkaAktif = true;
        // Tombol yang diketik: tolak selain angka 0-9
        document.addEventListener('beforeinput', (e) => {
            const t = e.target;
            if (!t.matches || !t.matches(SEL_JUMLAH)) return;
            if (e.data && /[^0-9]/.test(e.data)) e.preventDefault();
        }, true);
        // Nilai yang ditempel atau masuk lewat input: sisakan angka saja
        document.addEventListener('input', (e) => {
            const t = e.target;
            if (!t.matches || !t.matches(SEL_JUMLAH)) return;
            const c = t.value.replace(/[^0-9]/g, '');
            if (c !== t.value) {
                const pos = Math.max(0, (t.selectionStart || c.length) - (t.value.length - c.length));
                t.value = c;
                try { t.setSelectionRange(pos, pos); } catch (_) { }
            }
        }, true);
        // Isian yang sudah ada saat fitur dipasang
        document.querySelectorAll(SEL_JUMLAH).forEach((el) => {
            const c = el.value.replace(/[^0-9]/g, '');
            if (c !== el.value) {
                el.value = c;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    /* ========== Peringatan stok minus di bawah Daftar Barang (fitur peringatanStok) ========== */
    let peringatanBox = null;
    let peringatanSig = '';

    function pasangPeringatanStok() {
        if (peringatanBox && peringatanBox.isConnected) return;
        const anchor = document.querySelector('.div_transaksi_table');
        if (!anchor) return;
        const box = document.createElement('div');
        box.id = 'warning_jumlah_merah';
        box.setAttribute('role', 'alert');
        box.style.cssText = 'display:none;margin:10px 0;padding:10px 14px;border:1px solid #d32f2f;border-left:5px solid #d32f2f;background:#fdecea;color:#b71c1c;font-size:14px;font-weight:600;border-radius:4px;';
        box.innerHTML =
            '<div style="display:inline-flex;align-items:center;gap:8px;">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style="flex:none"><path fill="#d32f2f" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>' +
                '<span>Peringatan : Ada produk stok tidak sesuai. Jika dilanjutkan akan terjadi stok minus</span>' +
            '</div>' +
            '<div style="margin-top:4px;font-weight:normal;">Mungkin bisa dilakukan pengecekan ulang.</div>' +
            '<ul style="margin:6px 0 0 18px;padding:0;font-weight:normal;"></ul>';
        anchor.insertAdjacentElement('afterend', box);
        peringatanBox = box;
        peringatanSig = '';
    }

    // Hanya mengubah DOM bila isinya berubah, supaya tidak memicu MutationObserver berulang.
    function cekPeringatanStok() {
        if (!peringatanBox || !peringatanBox.isConnected) { pasangPeringatanStok(); if (!peringatanBox) return; }
        const bad = Array.from(document.querySelectorAll(SEL_JUMLAH + '.error'));
        const baris = bad.map((el) => {
            const no = (el.id.match(/penjualan_detail(\d+)_jumlah/) || [])[1] || '?';
            const jumlah = parseFloat(el.value) || 0;
            const stok = parseFloat((el.title.match(/Jumlah stok\s*=\s*(-?[\d.]+)/) || [])[1]);
            return Number.isNaN(stok)
                ? 'Baris ' + no + ' : Jumlah melebihi stok'
                : 'Baris ' + no + ' : Akan terjadi stok -' + (jumlah - stok);
        });
        const sig = baris.join('\n');
        if (sig === peringatanSig) return;
        peringatanSig = sig;
        const list = peringatanBox.querySelector('ul');
        list.innerHTML = '';
        baris.forEach((teks) => {
            const li = document.createElement('li');
            li.textContent = teks;
            list.appendChild(li);
        });
        peringatanBox.style.display = baris.length ? 'block' : 'none';
    }

    /* ========== No Faktur diawali 1 -> Tipe Penjualan '5. PartDistro.com' (fitur tipePartdistro) ========== */
    const KODE_ID = 'penjualan_kode';
    const TIPE_PARTDISTRO = '5. PartDistro.com';
    let partdistroAktif = false;
    let tipeSebelum = '';         // nilai Tipe Penjualan sebelum No Faktur diawali 1
    let tipeDisimpan = null;      // nilai yang dikembalikan saat angka 1 dihapus
    let partdistroDiterapkan = false;

    function pasangTipePartdistro() {
        if (partdistroAktif) return;
        partdistroAktif = true;
        // Dicatat sebelum nilai No Faktur berubah, supaya Tipe Penjualan bisa dikembalikan
        document.addEventListener('beforeinput', (e) => {
            if (!e.target || e.target.id !== KODE_ID) return;
            const tipe = document.getElementById('penjualan_idtipe_penjualan');
            if (tipe && !partdistroDiterapkan) tipeSebelum = tipe.value;
        }, true);
        // Listener di level document, jadi tetap jalan walau elemen dirender ulang
        document.addEventListener('input', (e) => {
            if (!e.target || e.target.id !== KODE_ID) return;
            const tipe = document.getElementById('penjualan_idtipe_penjualan');
            if (!tipe) return;
            const opt = Array.from(tipe.options).find((o) => o.text.trim() === TIPE_PARTDISTRO);
            if (!opt) return;
            if (e.target.value.trim().charAt(0) === '1') {
                if (!partdistroDiterapkan) { tipeDisimpan = tipeSebelum; partdistroDiterapkan = true; }
                if (tipe.value !== opt.value) setTipePenjualan(opt.value);
            } else if (partdistroDiterapkan) {
                partdistroDiterapkan = false;
                if (tipe.value === opt.value && tipeDisimpan !== null) setTipePenjualan(tipeDisimpan);
                tipeDisimpan = null;
            }
        }, true);
    }

    function proses() {
        try { pasangTombolBatal(); } catch (e) { /* dicoba lagi saat halaman berubah */ }
        try { cekTipePelanggan(); } catch (e) { /* dicoba lagi saat halaman berubah */ }
        try { if (bolehFitur('tipePartdistro')) pasangTipePartdistro(); } catch (e) { /* dicoba lagi */ }
        try { if (bolehFitur('jumlahAngka')) pasangJumlahAngka(); } catch (e) { /* dicoba lagi */ }
        try { if (bolehFitur('peringatanStok')) cekPeringatanStok(); } catch (e) { /* dicoba lagi */ }
    }

    proses();

    const observer = new MutationObserver(proses);
    observer.observe(document.body, { childList: true, subtree: true });
    // Kelas .error dan title pada kolom Jumlah berubah tanpa mengubah DOM, jadi diamati terpisah.
    const observerStok = new MutationObserver(() => {
        try { if (bolehFitur('peringatanStok')) cekPeringatanStok(); } catch (e) { /* dicoba lagi */ }
    });
    observerStok.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'title'] });
    document.addEventListener('input', (e) => {
        if (e.target && e.target.matches && e.target.matches(SEL_JUMLAH)) {
            try { if (bolehFitur('peringatanStok')) cekPeringatanStok(); } catch (err) { /* dicoba lagi */ }
        }
    }, true);
})();
