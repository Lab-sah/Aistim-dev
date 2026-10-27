// ==UserScript==
// @name         devtool
// @namespace    http://tampermonkey.net/
// @version      1.8.0
// @description  [v1.8.0] Form tiruan: tombol Cari (GET, hanya membaca, tanpa konfirmasi) dengan alamat yang bisa dipilih dari skrip halaman, opsi 'sebagai AJAX', laporan komponen hasil, dan 'Pakai input hasil' untuk mengisi field tambahan. Simpan/Enter di form tiruan sekarang menjalankan Cari (bukan POST); Kirim POST tetap terpisah dan dikonfirmasi. [v1.7.0] testurl > Analisa: di bawah laporan muncul FORM TIRUAN (tampilan mengikuti CSS halaman) yang bisa diisi lalu dikirim (GET/POST, selalu dikonfirmasi, hanya ke domain ini) beserta payload dan ringkasan respons; laporan juga memuat proses submit/AJAX di skrip inline dan pencarian id/nama form di skrip eksternal. [v1.6.1] testurl > Analisa: bagian LINK hanya menampilkan link yang sesuai path halaman yang diambil (menu/link path lain tidak ikut, jumlahnya disebut). [v1.6.0] testurl: tombol Analisa - link di-fetch lalu HTML-nya di-parse dan ditampilkan komponennya (form, input/select/textarea beserta name/id/label/nilai, tombol, tabel, modal, link, library). [v1.5.0] Tombol testurl di bawah tombol Rekam: popup input link, fetch (GET) lalu tampilkan outputnya. [v1.4.1] Hasil rekaman memuat struktur halaman (tabel, filter, kata 'website'). Tombol merekam klik & request (fetch/XHR) di SEMUA halaman Erzap untuk dikirim ke developer. TERSEMBUNYI secara default: aktif hanya setelah buka halaman dengan ?rekam=1 (matikan lagi dengan ?rekam=0). Token/cookie tidak ikut direkam.
// @match        https://*.erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @world        main
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    if (window.__aistimRekam) return;
    window.__aistimRekam = true;

    // Default tersembunyi & tidak mengubah fetch/XHR. Aktifkan: tambahkan ?rekam=1 di URL
    // halaman (disimpan di browser), matikan: ?rekam=0.
    const FLAG = 'aistim_rekam_aktif';
    try {
        const q = new URLSearchParams(location.search).get('rekam');
        if (q === '1') localStorage.setItem(FLAG, '1');
        else if (q === '0') localStorage.removeItem(FLAG);
        if (localStorage.getItem(FLAG) !== '1') return;
    } catch (e) { return; }

    let merekam = false;
    let log = [];
    const MAKS_SNIPPET = 300;

    const t0 = () => new Date().toTimeString().slice(0, 8);
    const rapih = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const sensor = (s) => String(s || '')
        .replace(/(authenticity_token=)[^&\s"']*/gi, '$1***')
        .replace(/(csrf[-_]?token["']?\s*[:=]\s*["']?)[^&\s"']*/gi, '$1***')
        .replace(/(<meta[^>]*name=["']csrf-token["'][^>]*content=["'])[^"']*/gi, '$1***')
        .replace(/(<meta[^>]*content=["'])[^"']*(["'][^>]*name=["']csrf-token["'])/gi, '$1***$2');

    function snippet(teks) {
        const t = rapih(teks);
        const i = t.search(/Penempatan Rak/i);
        if (i >= 0) return '...' + t.slice(Math.max(0, i - 40), i + 160) + '...';
        return t.slice(0, MAKS_SNIPPET);
    }

    function catat(baris) {
        if (!merekam) return;
        log.push(t0() + ' ' + baris);
        perbaruiTombol();
    }

    // ----- fetch -----
    const asliFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = (init && init.method) || (input && input.method) || 'GET';
        const body = init && typeof init.body === 'string' ? sensor(init.body).slice(0, 300) : '';
        const p = asliFetch.apply(this, arguments);
        if (merekam && sama_origin(url)) {
            p.then((res) => {
                res.clone().text().then((txt) => {
                    catat('FETCH ' + method + ' ' + sensor(url) + (body ? ' body=' + body : '') +
                        ' -> ' + res.status + ' [' + (res.headers.get('content-type') || '') + '] ' + txt.length + ' char | ' + snippet(txt));
                }).catch(() => {});
            }).catch((e) => catat('FETCH ' + method + ' ' + sensor(url) + ' -> ERROR ' + e));
        }
        return p;
    };

    // ----- XHR (jQuery $.ajax milik situs) -----
    const asliOpen = XMLHttpRequest.prototype.open;
    const asliSend = XMLHttpRequest.prototype.send;
    const asliSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__rk = { method: method, url: url, headers: [] };
        return asliOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
        if (this.__rk && /^(accept|content-type|x-requested-with)$/i.test(k)) this.__rk.headers.push(k + ': ' + v);
        return asliSetHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
        const info = this.__rk;
        if (merekam && info && sama_origin(info.url)) {
            const b = typeof body === 'string' ? sensor(body).slice(0, 300) : '';
            this.addEventListener('loadend', function () {
                let txt = '';
                try { txt = typeof this.responseText === 'string' ? this.responseText : ''; } catch (e) { /* abaikan */ }
                catat('XHR ' + info.method + ' ' + sensor(info.url) + (b ? ' body=' + b : '') +
                    ' hdr{' + info.headers.join('; ') + '} -> ' + this.status + ' ' + txt.length + ' char | ' + snippet(txt));
            });
        }
        return asliSend.apply(this, arguments);
    };

    function sama_origin(url) {
        try { return new URL(url, location.href).origin === location.origin; } catch (e) { return false; }
    }

    // ----- klik -----
    document.addEventListener('click', (e) => {
        if (!merekam) return;
        const el = e.target;
        if (!el || !el.closest || el.closest('#rk_rekam_ui')) return;
        const dasar = el.closest('a, button, td, th, input, label') || el;
        const data = Array.from(dasar.attributes || [])
            .filter((a) => /^data-/.test(a.name)).map((a) => a.name + '=' + a.value).join(' ');
        catat('KLIK <' + dasar.tagName.toLowerCase() + (dasar.className ? ' class="' + rapih(dasar.className).slice(0, 80) + '"' : '') +
            (dasar.id ? ' id="' + dasar.id + '"' : '') + '> ' + (data ? '{' + data.slice(0, 200) + '} ' : '') + '"' + rapih(dasar.textContent).slice(0, 40) + '"');
    }, true);

    // ----- UI -----
    const ui = document.createElement('div');
    ui.id = 'rk_rekam_ui';
    ui.style.cssText = 'position:fixed;left:8px;bottom:70px;z-index:99990;font-family:sans-serif;';
    ui.innerHTML = '<button id="rk_btn" type="button" style="padding:8px 12px;border:none;border-radius:20px;background:#343a40;color:#fff;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.4);">&#9210; Rekam</button>';
    const btn = ui.firstChild;
    // tombol testurl tepat di bawah tombol Rekam (Rekam tidak bergeser)
    const btnUrl = document.createElement('button');
    btnUrl.id = 'rk_testurl';
    btnUrl.type = 'button';
    btnUrl.textContent = 'testurl';
    btnUrl.style.cssText = 'position:absolute;top:100%;left:0;margin-top:6px;padding:6px 12px;border:none;border-radius:20px;background:#343a40;color:#fff;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.4);';
    btnUrl.addEventListener('click', tampilTestUrl);
    ui.appendChild(btnUrl);

    function perbaruiTombol() {
        btn.innerHTML = merekam ? '&#9209; Stop (' + log.length + ')' : '&#9210; Rekam';
        btn.style.background = merekam ? '#dc3545' : '#343a40';
    }

    function logRak() {
        const v = document.documentElement.getAttribute('data-aistim-rak-log');
        return 'LOG SCRIPT LIHAT STOK (rakstok.js: rak & gambar):\n' + (v || '(kosong)');
    }

    // Ringkasan gambar di tabel halaman (untuk mencari asal gambar produk)
    function laporanGambar() {
        const out = ['== GAMBAR DI HALAMAN =='];
        const semua = document.querySelectorAll('img');
        out.push('Total <img> di halaman: ' + semua.length);
        let n = 0;
        document.querySelectorAll('tbody tr').forEach((tr) => {
            if (n >= 8) return;
            const imgs = tr.querySelectorAll('img');
            if (!imgs.length) return;
            n++;
            const sel = Array.from(tr.children).slice(0, 4).map((td) => rapih(td.textContent).slice(0, 30)).join(' | ');
            const src = Array.from(imgs).slice(0, 3).map((im) =>
                'src=' + (im.getAttribute('src') || '') + (im.getAttribute('data-src') ? ' data-src=' + im.getAttribute('data-src') : '') +
                (im.className ? ' class=' + rapih(im.className).slice(0, 40) : '')).join(' ; ');
            out.push('BARIS: ' + sel + '\n   ' + src);
        });
        if (!n) out.push('(tidak ada <img> di baris tabel)');
        return out.join('\n');
    }

    function tampilModal(teks, judul) {
        const bd = document.createElement('div');
        bd.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
        bd.innerHTML = '<div style="background:#fff;width:94%;max-width:640px;border-radius:8px;padding:12px;display:flex;flex-direction:column;max-height:88vh;">' +
            '<div id="rk_judul" style="font-weight:bold;margin-bottom:6px;"></div>' +
            '<textarea id="rk_out" readonly style="flex:1;min-height:260px;font:11px monospace;"></textarea>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">' +
            '<button id="rk_tutup" type="button" style="padding:6px 14px;">Tutup</button>' +
            '<button id="rk_salin" type="button" style="padding:6px 14px;background:#28a745;color:#fff;border:none;border-radius:4px;">Salin</button></div></div>';
        document.body.appendChild(bd);
        bd.querySelector('#rk_judul').textContent = judul;
        const ta = bd.querySelector('#rk_out');
        ta.value = teks;
        bd.querySelector('#rk_tutup').onclick = () => bd.remove();
        bd.querySelector('#rk_salin').onclick = async () => {
            try { await navigator.clipboard.writeText(teks); }
            catch (e) { ta.select(); document.execCommand('copy'); }
            bd.querySelector('#rk_salin').textContent = 'Tersalin ✓';
        };
    }

    // ----- testurl: popup input link -> fetch (GET, sesi login) -> tampilkan outputnya -----
    function tampilTestUrl() {
        if (document.getElementById('rk_testurl_pop')) return;
        const gaya = (b) => 'padding:6px 14px;border:0;border-radius:4px;background:' + b + ';color:#fff;cursor:pointer;';
        const bd = document.createElement('div');
        bd.id = 'rk_testurl_pop';
        bd.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
        const kotak = document.createElement('div');
        kotak.style.cssText = 'background:#fff;color:#111;width:94%;max-width:900px;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;max-height:90vh;overflow:auto;font:13px sans-serif;';
        const judul = document.createElement('div');
        judul.style.cssText = 'font-weight:bold;';
        judul.textContent = 'testurl';
        const baris = document.createElement('div');
        baris.style.cssText = 'display:flex;gap:6px;';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = 'Link, mis. /penjualans?pencarian[kode]=PJ131026-PMRA1-0001';
        inp.style.cssText = 'flex:1;padding:6px;border:1px solid #94a3b8;border-radius:4px;';
        const bGo = document.createElement('button');
        bGo.type = 'button'; bGo.textContent = 'Ambil'; bGo.style.cssText = gaya('#2563eb');
        const bAnalisa = document.createElement('button');
        bAnalisa.type = 'button'; bAnalisa.textContent = 'Analisa'; bAnalisa.style.cssText = gaya('#7c3aed');
        bAnalisa.title = 'Ambil link, parse HTML-nya, tampilkan komponen & input';
        const bSalin = document.createElement('button');
        bSalin.type = 'button'; bSalin.textContent = 'Salin'; bSalin.style.cssText = gaya('#28a745');
        const bTutup = document.createElement('button');
        bTutup.type = 'button'; bTutup.textContent = 'Tutup'; bTutup.style.cssText = gaya('#64748b');
        baris.appendChild(inp); baris.appendChild(bGo); baris.appendChild(bAnalisa); baris.appendChild(bSalin); baris.appendChild(bTutup);
        const info = document.createElement('div');
        info.style.cssText = 'color:#475569;';
        const out = document.createElement('textarea');
        out.readOnly = true;
        out.style.cssText = 'flex:1;min-height:320px;width:100%;box-sizing:border-box;padding:6px;border:1px solid #cbd5e1;border-radius:4px;font:12px monospace;white-space:pre;';
        const panelForm = document.createElement('div');   // form tiruan hasil Analisa (di bawah laporan)
        let urutan = 0;                                     // penanda analisa terakhir (hasil telusur skrip yang telat dibuang)
        kotak.appendChild(judul); kotak.appendChild(baris); kotak.appendChild(info); kotak.appendChild(out); kotak.appendChild(panelForm);
        bd.appendChild(kotak);
        document.body.appendChild(bd);
        inp.focus();

        const tutup = () => bd.remove();
        async function ambil(analisa) {
            const v = inp.value.trim();
            if (!v) { info.textContent = 'Isi link dulu.'; return; }
            let url;
            try { url = new URL(v, location.origin).href; } catch (e) { info.textContent = 'Link tidak valid.'; return; }
            info.textContent = 'Mengambil ' + url + ' ...';
            out.value = '';
            panelForm.textContent = '';
            const no = ++urutan;
            const mulai = Date.now();
            try {
                const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
                const teks = await res.text();
                info.textContent = 'HTTP ' + res.status + ' ' + res.statusText + ' | ' + (res.headers.get('content-type') || '-') + ' | ' + teks.length + ' karakter | ' + (Date.now() - mulai) + ' ms' + (res.redirected ? ' | dialihkan ke ' + res.url : '');
                if (!analisa) { out.value = teks; return; }
                try {
                    const doc = new DOMParser().parseFromString(teks, 'text/html');
                    const urlAkhir = res.url || url;
                    out.value = analisaDoc(doc, urlAkhir, teks.length);
                    buatPanelForm(doc, urlAkhir, panelForm);
                    telusuriSkrip(doc, urlAkhir).then((t) => { if (no === urutan && t) out.value += '\n\n' + t; }).catch(() => {});
                } catch (err) {
                    out.value = 'Analisa gagal: ' + err.message + '\n\nHTML mentah:\n' + teks;
                }
            } catch (err) {
                info.textContent = 'Gagal: ' + err.message + ' (link luar domain biasanya diblokir CORS)';
            }
        }
        bGo.onclick = () => ambil(false);
        bAnalisa.onclick = () => ambil(true);
        bTutup.onclick = tutup;
        bSalin.onclick = async () => {
            try { await navigator.clipboard.writeText(out.value); } catch (e) { out.select(); document.execCommand('copy'); }
            info.textContent = 'Output disalin.';
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ambil(e.shiftKey); if (e.key === 'Escape') tutup(); });
        bd.addEventListener('mousedown', (e) => { if (e.target === bd) tutup(); });
        info.textContent = 'Ambil = HTML mentah (Enter). Analisa = komponen & input hasil parse (Shift+Enter).';
    }

    // ----- Analisa: komponen & input halaman dari HTML hasil fetch (HTML mentah dari server) -----
    function analisaDoc(doc, url, panjang) {
        const out = [];
        const ptg = (s, n) => rapih(s).slice(0, n);
        const SENSITIF = /token|csrf|authenticity|passw|secret/i;
        const forms = Array.from(doc.querySelectorAll('form'));
        const tersembunyi = (el) => !!el.closest('[hidden], [style*="display:none"], [style*="display: none"]');

        const labelDari = (el) => {
            let teks = '';
            if (el.id) {
                const l = Array.from(doc.querySelectorAll('label[for]')).find((x) => x.getAttribute('for') === el.id);
                if (l) teks = l.textContent;
            }
            if (!teks && el.closest('label')) teks = el.closest('label').textContent;
            for (let p = el.previousElementSibling; !teks && p; p = p.previousElementSibling) {
                if (/^(label|b|strong|span)$/i.test(p.tagName) && !p.querySelector('input,select,textarea')) teks = p.textContent;
            }
            if (!teks && el.parentElement) {
                const l = Array.from(el.parentElement.children).find((c) => c.tagName === 'LABEL' && !c.contains(el));
                if (l) teks = l.textContent;
            }
            return ptg(teks, 40).replace(/\s*:$/, '');
        };

        const BOOL = ['required', 'readonly', 'disabled', 'multiple', 'checked', 'autofocus'];
        const NILAI = ['maxlength', 'min', 'max', 'step', 'pattern', 'accept', 'autocomplete'];
        const sifat = (el) => BOOL.filter((a) => el.hasAttribute(a))
            .concat(NILAI.filter((a) => el.hasAttribute(a)).map((a) => a + '=' + ptg(el.getAttribute(a), 30)));

        const medan = (el) => {
            const tag = el.tagName.toLowerCase();
            const tipe = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag;
            const nama = el.getAttribute('name') || '';
            const p = ['[' + tipe + ']'];
            if (nama) p.push('name=' + nama);
            if (el.id) p.push('id=' + el.id);
            const lbl = labelDari(el);
            if (lbl) p.push('label="' + lbl + '"');
            if (el.getAttribute('placeholder')) p.push('placeholder="' + ptg(el.getAttribute('placeholder'), 30) + '"');
            if (tag === 'select') {
                const opsi = Array.from(el.options);
                p.push('opsi=' + opsi.length + ': ' + opsi.slice(0, 8)
                    .map((o) => (o.hasAttribute('selected') ? '*' : '') + ptg(o.textContent, 22) + '=' + String(o.value).slice(0, 18)).join(' ; ')
                    + (opsi.length > 8 ? ' ; ...' : ''));
            } else {
                const v = tag === 'textarea' ? el.textContent : el.getAttribute('value');
                if (v) p.push('value="' + (tipe === 'password' || SENSITIF.test(nama + ' ' + el.id) ? '***' : ptg(v, 40)) + '"');
            }
            Array.prototype.push.apply(p, sifat(el));
            if (el.className) p.push('class="' + ptg(el.className, 40) + '"');
            if (tipe === 'hidden' || tersembunyi(el)) p.push('(tersembunyi)');
            return p.join(' ');
        };

        const tombol = (el) => {
            const tag = el.tagName.toLowerCase();
            const teks = ptg(tag === 'input' ? el.getAttribute('value') : el.textContent, 40)
                || ptg(el.getAttribute('title') || el.getAttribute('aria-label') || '', 40);
            const p = ['"' + teks + '"', '<' + tag + (tag === 'a' ? '' : ' type=' + (el.getAttribute('type') || (tag === 'button' ? 'submit' : 'button'))) + '>'];
            if (el.id) p.push('id=' + el.id);
            if (el.className) p.push('class="' + ptg(el.className, 40) + '"');
            if (tag === 'a' && el.getAttribute('href')) p.push('href=' + sensor(el.getAttribute('href')).slice(0, 80));
            Array.from(el.attributes).filter((a) => /^(data-|on[a-z]+$)/.test(a.name)).slice(0, 4)
                .forEach((a) => p.push(a.name + '=' + ptg(a.value, 40)));
            if (el.hasAttribute('disabled')) p.push('disabled');
            if (tersembunyi(el)) p.push('(tersembunyi)');
            return p.join(' ');
        };

        const semuaMedan = Array.from(doc.querySelectorAll('input, select, textarea'))
            .filter((el) => !(el.tagName === 'INPUT' && /^(submit|button|reset|image)$/i.test(el.getAttribute('type') || '')));
        const semuaTombol = Array.from(doc.querySelectorAll('button, input[type=submit], input[type=button], input[type=reset], input[type=image], a.btn, a[role=button], [role=button]'));
        const tabel = Array.from(doc.querySelectorAll('table'));
        const modal = Array.from(doc.querySelectorAll('.modal, [role=dialog], dialog'));
        const iframe = Array.from(doc.querySelectorAll('iframe'));
        const skripSrc = Array.from(doc.querySelectorAll('script[src]')).map((s) => s.getAttribute('src') || '');
        const tabelJenis = {};
        semuaMedan.forEach((el) => {
            const k = el.tagName === 'INPUT' ? (el.getAttribute('type') || 'text').toLowerCase() : el.tagName.toLowerCase();
            tabelJenis[k] = (tabelJenis[k] || 0) + 1;
        });

        out.push('== ANALISA HALAMAN ==');
        out.push('URL: ' + sensor(url));
        out.push('Judul: ' + (rapih(doc.title) || '-'));
        out.push('Ukuran HTML: ' + panjang + ' karakter | elemen: ' + doc.querySelectorAll('*').length);
        const hs = Array.from(doc.querySelectorAll('h1,h2,h3,h4')).map((h) => rapih(h.textContent)).filter(Boolean).slice(0, 12);
        out.push('Heading: ' + (hs.join(' | ') || '-'));
        if (doc.querySelector('input[type=password]')) {
            out.push(tabel.length || forms.length > 2
                ? 'Catatan: ada kolom password (nilainya disamarkan).'
                : '!! Tampaknya HALAMAN LOGIN (ada kolom password) - sesi mungkin habis.');
        }
        if (!forms.length && !semuaMedan.length && doc.querySelectorAll('script').length) {
            out.push('!! Tidak ada form/input di HTML mentah. Komponen yang dibuat lewat JavaScript/AJAX tidak ikut terbaca (analisa memakai HTML dari server).');
        }

        out.push('', '== RINGKASAN KOMPONEN ==');
        out.push('form: ' + forms.length + ' | input/select/textarea: ' + semuaMedan.length + ' | tombol: ' + semuaTombol.length +
            ' | tabel: ' + tabel.length + ' | modal/dialog: ' + modal.length + ' | iframe: ' + iframe.length + ' | link: ' + doc.querySelectorAll('a[href]').length);
        out.push('jenis input: ' + (Object.keys(tabelJenis).map((k) => k + ' ' + tabelJenis[k]).join(', ') || '-'));

        const MAKS = 80;
        const tulisMedan = (daftar, indent) => {
            daftar.slice(0, MAKS).forEach((el) => out.push(indent + medan(el)));
            if (daftar.length > MAKS) out.push(indent + '... (' + (daftar.length - MAKS) + ' lagi)');
        };
        const tulisTombol = (daftar, indent) => {
            daftar.slice(0, 30).forEach((el) => out.push(indent + 'tombol ' + tombol(el)));
            if (daftar.length > 30) out.push(indent + '... (' + (daftar.length - 30) + ' tombol lagi)');
        };

        forms.slice(0, 12).forEach((f, i) => {
            out.push('', '== FORM ' + (i + 1) + ' ==');
            out.push('id=' + (f.id || '-') + ' method=' + (f.getAttribute('method') || 'get') + ' action=' + (sensor(f.getAttribute('action') || '').slice(0, 100) || '-') +
                (f.getAttribute('enctype') ? ' enctype=' + f.getAttribute('enctype') : '') + (f.className ? ' class="' + ptg(f.className, 40) + '"' : ''));
            const m = semuaMedan.filter((el) => el.closest('form') === f);
            out.push('Input (' + m.length + '):');
            tulisMedan(m, '  ');
            const t = semuaTombol.filter((el) => el.closest('form') === f);
            if (t.length) { out.push('Tombol (' + t.length + '):'); tulisTombol(t, '  '); }
        });
        if (forms.length > 12) out.push('', '... (' + (forms.length - 12) + ' form lagi tidak ditampilkan)');

        const luarMedan = semuaMedan.filter((el) => !el.closest('form'));
        if (luarMedan.length) { out.push('', '== INPUT DI LUAR FORM (' + luarMedan.length + ') =='); tulisMedan(luarMedan, '  '); }
        const luarTombol = semuaTombol.filter((el) => !el.closest('form'));
        if (luarTombol.length) { out.push('', '== TOMBOL / AKSI DI LUAR FORM (' + luarTombol.length + ') =='); tulisTombol(luarTombol, '  '); }

        out.push('', '== TABEL (' + tabel.length + ') ==');
        tabel.slice(0, 6).forEach((t, i) => {
            const th = Array.from(t.querySelectorAll('th')).map((x) => ptg(x.textContent, 25));
            out.push('TABEL ' + (i + 1) + ' id=' + (t.id || '-') + ' class="' + ptg(t.className, 50) + '" baris=' + t.querySelectorAll('tbody tr').length +
                ' kotak-centang=' + t.querySelectorAll('input[type=checkbox]').length);
            out.push('  kolom: ' + (th.join(' | ') || '-'));
        });

        if (modal.length) {
            out.push('', '== MODAL / DIALOG (' + modal.length + ') ==');
            modal.slice(0, 10).forEach((m) => {
                const jd = m.querySelector('.modal-title, h1, h2, h3, h4, h5');
                out.push('<' + m.tagName.toLowerCase() + (m.id ? ' id=' + m.id : '') + (m.className ? ' class="' + ptg(m.className, 40) + '"' : '') + '> judul="' +
                    (jd ? ptg(jd.textContent, 40) : '-') + '" input=' + m.querySelectorAll('input,select,textarea').length + ' tombol=' + m.querySelectorAll('button').length);
            });
        }
        if (iframe.length) {
            out.push('', '== IFRAME (' + iframe.length + ') ==');
            iframe.slice(0, 5).forEach((f) => out.push('src=' + (sensor(f.getAttribute('src') || '').slice(0, 100) || '-') + (f.id ? ' id=' + f.id : '')));
        }

        // Link: hanya yang sesuai path halaman yang diambil (segmen pertama, mis. /rak_barangs/...),
        // supaya menu & link halaman lain tidak ikut. Path "/" (tanpa segmen) = semua link ditampilkan.
        let dasar = null;
        try { dasar = new URL(url); } catch (e) { /* url tidak valid: tampilkan semua */ }
        const segmen = dasar ? dasar.pathname.split('/').filter(Boolean)[0] : '';
        const sesuai = (h) => {
            if (!segmen) return true;
            try {
                const u = new URL(h, dasar);
                return u.origin === dasar.origin && (u.pathname.split('/').filter(Boolean)[0] || '') === segmen;
            } catch (e) { return false; }
        };
        const seen = {};
        const links = [];
        let lain = 0;
        doc.querySelectorAll('a[href]').forEach((a) => {
            const t = ptg(a.textContent, 40);
            const h = a.getAttribute('href') || '';
            if (!t || !h || h.charAt(0) === '#' || /^javascript/i.test(h)) return;
            const k = t + '>' + h;
            if (seen[k]) return;
            seen[k] = 1;
            if (!sesuai(h)) { lain++; return; }
            links.push(t + ' -> ' + sensor(h).slice(0, 100));
        });
        out.push('', '== LINK ' + (segmen ? 'DI PATH /' + segmen + ' ' : '') + '(' + links.length + ' unik, 40 pertama) ==');
        links.slice(0, 40).forEach((l) => out.push('  ' + l));
        if (lain) out.push('(' + lain + ' link ke path lain tidak ditampilkan)');
        const hal = doc.querySelectorAll('.pagination a, [class*=paginat] a').length;
        if (hal) out.push('Paginasi: ' + hal + ' link');

        // Proses submit/AJAX di skrip inline: baris yang memanggil ajax/fetch/submit/serialize atau menyebut id/nama form
        const kunciForm = kunciPencarian(doc);
        const POLA_PROSES = /\$\.(ajax|get|post|getJSON)\b|\.ajax\(|\bfetch\(|XMLHttpRequest|\.submit\(|\.serialize\(|FormData|\bon\(\s*['"](submit|change)|addEventListener\(\s*['"](submit|change)|\burl\s*:|\.load\(/;
        const prosesBaris = [];
        Array.from(doc.querySelectorAll('script:not([src])')).forEach((s, i) => {
            (s.textContent || '').split('\n').forEach((ln) => {
                const t = rapih(ln);
                if (!t) return;
                const idxKunci = kunciForm.map((k) => t.indexOf(k)).filter((x) => x >= 0);
                const m = t.search(POLA_PROSES);
                if (m < 0 && !idxKunci.length) return;
                const pos = m >= 0 ? m : idxKunci[0];
                prosesBaris.push('#' + (i + 1) + ': ' + sensor(t.length > 200 ? '...' + t.slice(Math.max(0, pos - 60), pos + 120) + '...' : t));
            });
        });
        out.push('', '== PROSES SUBMIT / AJAX DI SKRIP INLINE (' + prosesBaris.length + ' baris cocok, 40 pertama) ==');
        prosesBaris.slice(0, 40).forEach((b) => out.push('  ' + b));
        if (!prosesBaris.length) out.push('  (tidak ada; logikanya mungkin di skrip eksternal, lihat pencarian skrip eksternal di bawah)');

        const PUSTAKA = [['jQuery', /jquery/i], ['DataTables', /datatables/i], ['Bootstrap', /bootstrap/i], ['Select2', /select2/i], ['Chosen', /chosen/i],
            ['Datepicker', /date(time)?picker|flatpickr|pikaday/i], ['Moment', /moment/i], ['SweetAlert', /sweetalert/i], ['Chart.js', /chart/i], ['Vue', /vue/i], ['React', /react/i]];
        const pustaka = PUSTAKA.filter((p) => skripSrc.some((s) => p[1].test(s))).map((p) => p[0]);
        if (doc.querySelector('meta[name=csrf-param]')) pustaka.push('Rails (token CSRF)');
        out.push('', '== SKRIP & LIBRARY ==');
        out.push('Library terdeteksi: ' + (pustaka.join(', ') || '-'));
        out.push('Skrip eksternal: ' + skripSrc.length + ' | skrip inline: ' + doc.querySelectorAll('script:not([src])').length + ' | stylesheet: ' + doc.querySelectorAll('link[rel=stylesheet]').length);
        skripSrc.slice(0, 15).forEach((s) => out.push('  ' + sensor(s).slice(0, 110)));
        return out.join('\n');
    }

    // Kata kunci pencarian di skrip: id form, bagian terakhir alamat aksi, dan id kolom form (mis. idoutlet_own)
    function kunciPencarian(doc) {
        const k = new Set();
        doc.querySelectorAll('form').forEach((f) => {
            if (f.id) k.add(f.id);
            const a = (f.getAttribute('action') || '').split('?')[0].split('/').filter(Boolean).pop();
            if (a && !/^\d+$/.test(a)) k.add(a);
        });
        doc.querySelectorAll('form select, form input:not([type=hidden]), form textarea, form button').forEach((e) => { if (e.id) k.add(e.id); });
        return Array.from(k).filter((s) => s.length >= 4).slice(0, 12);
    }

    // Cari kata kunci di skrip eksternal satu domain (sudah ada di cache browser karena halaman memuatnya juga)
    async function telusuriSkrip(doc, url) {
        const kunci = kunciPencarian(doc);
        if (!kunci.length) return '';
        const seen = {};
        const daftar = [];
        doc.querySelectorAll('script[src]').forEach((s) => {
            try {
                const u = new URL(s.getAttribute('src'), url);
                if (u.origin === location.origin && !seen[u.href]) { seen[u.href] = 1; daftar.push(u); }
            } catch (e) { /* abaikan */ }
        });
        const out = ['== PENCARIAN DI SKRIP EKSTERNAL (kunci: ' + kunci.join(', ') + ') =='];
        let hit = 0;
        for (const u of daftar.slice(0, 8)) {
            const nama = u.pathname.split('/').pop() || u.pathname;
            let teks = '';
            try {
                const r = await fetch(u.href, { credentials: 'same-origin' });
                if (!r.ok) continue;
                teks = await r.text();
            } catch (e) { continue; }
            if (teks.length > 4000000) { out.push('  ' + nama + ': terlalu besar, dilewati'); continue; }
            for (const k of kunci) {
                let i = teks.indexOf(k), n = 0;
                while (i >= 0 && n < 3 && hit < 30) {
                    out.push('  ' + nama + ' [' + k + ']: ...' + sensor(rapih(teks.slice(Math.max(0, i - 100), i + 160))) + '...');
                    n++; hit++;
                    i = teks.indexOf(k, i + k.length + 160);
                }
            }
        }
        if (!hit) out.push('  (kunci tidak ditemukan di ' + Math.min(daftar.length, 8) + ' skrip eksternal satu domain)');
        return out.join('\n');
    }

    // ----- Form tiruan: replika form hasil fetch (tampilan mengikuti CSS halaman), bisa diisi & dikirim dengan konfirmasi -----
    const SENSITIF_NAMA = /token|csrf|authenticity|passw|secret/i;

    // Salinan form dibuat "mati": tanpa skrip, atribut on*/data-* (Rails UJS, Bootstrap), link javascript:, id diberi awalan rkc_
    function bersihkanSalinan(root) {
        root.querySelectorAll('script, iframe, object, embed, link, base, meta, style').forEach((e) => e.remove());
        [root].concat(Array.from(root.querySelectorAll('*'))).forEach((el) => {
            Array.from(el.attributes).forEach((a) => {
                if (/^(on|data-)/i.test(a.name) || /^form(action|target|method|enctype)$/i.test(a.name) ||
                    (/^(href|src|action)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
            });
            if (el.id) el.id = 'rkc_' + el.id;
            if (el.tagName === 'LABEL' && el.getAttribute('for')) el.setAttribute('for', 'rkc_' + el.getAttribute('for'));
            if (el.tagName === 'A') { el.removeAttribute('href'); el.removeAttribute('target'); }
        });
    }

    // Alamat (path) di string skrip inline, mis. '/perkiraans/saldo_tabel?outlet=' - jadi pilihan alamat Cari
    function alamatDariSkrip(doc, url) {
        const hasil = [];
        const tambah = (a) => { if (a && hasil.indexOf(a) < 0 && hasil.length < 16) hasil.push(a); };
        try { tambah(new URL(url).pathname); } catch (e) { /* abaikan */ }
        doc.querySelectorAll('script:not([src])').forEach((s) => {
            (s.textContent || '').replace(/['"`](\/[A-Za-z0-9_\-\/.]*[A-Za-z0-9_](?:\?[^'"`\s]*)?)['"`]/g, (m, a) => {
                if (!/^\/(assets|packs|images|fonts)\b|\.(js|css|png|jpe?g|gif|svg|ico|woff2?)(\?|$)/i.test(a)) tambah(a);
                return m;
            });
        });
        return hasil;
    }

    function tampilPayload(p) {
        return p.map((x) => x[0] + '=' + (SENSITIF_NAMA.test(x[0]) ? '***' : String(x[1]).slice(0, 200))).join('\n');
    }

    function ringkasRespons(res, teks, ms, ringkasReq) {
        const l = ['== REQUEST ==', ringkasReq, '', '== RESPONS =='];
        const tipe = res.headers.get('content-type') || '';
        l.push('HTTP ' + res.status + ' ' + res.statusText + ' | ' + ms + ' ms | ' + teks.length + ' karakter');
        l.push('Content-Type: ' + (tipe || '-'));
        l.push('URL akhir: ' + sensor(res.url) + (res.redirected ? '  (DIALIHKAN setelah kirim)' : ''));
        if (/html/i.test(tipe)) {
            const d = new DOMParser().parseFromString(teks, 'text/html');
            l.push('Judul: ' + (rapih(d.title) || '-'));
            l.push('Heading: ' + (Array.from(d.querySelectorAll('h1,h2')).map((h) => rapih(h.textContent)).filter(Boolean).slice(0, 5).join(' | ') || '-'));
            const pesan = [];
            d.querySelectorAll('.alert, .notice, .flash, #notice, #alert, #error_explanation, .error, .help-block, .field_with_errors, [class*=error], [class*=success]').forEach((e) => {
                const t = rapih(e.textContent).slice(0, 160);
                if (t && pesan.indexOf(t) < 0 && pesan.length < 10) pesan.push(t);
            });
            l.push('Pesan di halaman respons: ' + (pesan.length ? '' : '-'));
            pesan.forEach((p) => l.push('  ' + p));
            l.push('Form di halaman respons: ' + d.querySelectorAll('form').length);
        }
        l.push('Awal respons: ' + sensor(rapih(teks)).slice(0, 1200));
        return l.join('\n');
    }

    function buatPanelForm(doc, url, panel) {
        panel.textContent = '';
        const forms = Array.from(doc.querySelectorAll('form'));
        const el = (tag, css, teks) => {
            const e = document.createElement(tag);
            if (css) e.style.cssText = css;
            if (teks != null) e.textContent = teks;
            return e;
        };
        const gaya = (b) => 'padding:6px 14px;border:0;border-radius:4px;background:' + b + ';color:#fff;cursor:pointer;';
        panel.appendChild(el('div', 'font-weight:bold;margin-top:6px;', 'Form tiruan' + (forms.length ? ' (' + forms.length + ' form di halaman)' : '')));
        if (!forms.length) {
            panel.appendChild(el('div', 'color:#475569;', 'Tidak ada <form> di HTML mentah, jadi tidak ada yang bisa ditiru (form yang dibuat lewat JavaScript tidak terbaca).'));
            return;
        }
        const tokenMeta = (doc.querySelector('meta[name=csrf-token]') || el('i')).getAttribute('content') || '';
        const isi = el('div');
        let awal = forms.findIndex((f) => /^post$/i.test(f.getAttribute('method') || ''));
        if (awal < 0) awal = 0;
        if (forms.length > 1) {
            const pilih = el('select', 'padding:4px;margin:4px 0;max-width:100%;');
            forms.forEach((f, i) => pilih.appendChild(new Option((i + 1) + '. ' + (f.id || '-') + '  ' + (f.getAttribute('method') || 'get').toUpperCase() + '  ' + sensor(f.getAttribute('action') || '').slice(0, 60), String(i))));
            pilih.value = String(awal);
            pilih.addEventListener('change', () => tampil(forms[Number(pilih.value)]));
            panel.appendChild(pilih);
        }
        panel.appendChild(isi);

        function tampil(f) {
            isi.textContent = '';
            const salinan = document.importNode(f, true);
            bersihkanSalinan(salinan);
            const method = /^post$/i.test(f.getAttribute('method') || '') ? 'POST' : 'GET';
            let aksi = '';
            try { aksi = new URL(f.getAttribute('action') || '', url).href; } catch (e) { aksi = ''; }
            isi.appendChild(el('div', 'color:#475569;margin:4px 0;', 'Dikirim ke: ' + method + ' ' + sensor(aksi || url) +
                (f.getAttribute('enctype') ? '  (' + f.getAttribute('enctype') + ': file tidak ikut dikirim)' : '')));
            const wadah = el('div', 'border:1px dashed #94a3b8;border-radius:6px;padding:10px;background:#fff;color:#111;overflow:auto;');
            wadah.appendChild(salinan);
            isi.appendChild(wadah);

            const ekstra = el('textarea', 'width:100%;box-sizing:border-box;min-height:48px;margin-top:6px;font:12px monospace;');
            ekstra.id = 'rkf_ekstra';
            ekstra.placeholder = 'Field tambahan (tidak ada di HTML, mis. baris saldo dari AJAX), satu per baris: nama=nilai';
            const cbWrap = el('label', 'display:block;margin-top:4px;');
            const cbToken = el('input');
            cbToken.type = 'checkbox'; cbToken.checked = true; cbToken.id = 'rkf_token';
            cbWrap.appendChild(cbToken);
            cbWrap.appendChild(document.createTextNode(' Sertakan token CSRF otomatis' + (tokenMeta ? '' : ' (halaman ini tidak punya meta csrf-token)')));
            const pay = el('textarea', 'width:100%;box-sizing:border-box;min-height:90px;margin-top:4px;font:12px monospace;');
            pay.id = 'rkf_payload'; pay.readOnly = true;
            // Cari = GET (hanya membaca, tanpa konfirmasi, tanpa token): isian form jadi query string ke alamat yang bisa diubah
            const barisCari = el('div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;');
            const alamat = el('input', 'flex:1;min-width:220px;padding:6px;border:1px solid #94a3b8;border-radius:4px;');
            alamat.type = 'text'; alamat.id = 'rkf_alamat';
            alamat.value = new URL(url).pathname;
            alamat.setAttribute('list', 'rkf_alamat_daftar');
            alamat.title = 'Alamat untuk Cari (GET). Pilihan di daftar diambil dari skrip halaman.';
            const daftarAlamat = el('datalist');
            daftarAlamat.id = 'rkf_alamat_daftar';
            alamatDariSkrip(doc, url).forEach((a) => daftarAlamat.appendChild(new Option(a, a)));
            const cbAjax = el('input');
            cbAjax.type = 'checkbox'; cbAjax.id = 'rkf_ajax';
            const lblAjax = el('label', 'white-space:nowrap;');
            lblAjax.appendChild(cbAjax);
            lblAjax.appendChild(document.createTextNode(' sebagai AJAX'));
            lblAjax.title = 'Tambah header X-Requested-With: XMLHttpRequest (Rails membalas potongan halaman)';
            const bCari = el('button', gaya('#2563eb'), 'Cari (GET)');
            bCari.type = 'button'; bCari.id = 'rkf_cari';
            const bPakai = el('button', gaya('#7c3aed') + 'display:none;', 'Pakai input hasil');
            bPakai.type = 'button'; bPakai.id = 'rkf_pakai';
            barisCari.append(alamat, daftarAlamat, lblAjax, bCari, bPakai);
            const barisKirim = el('div', 'display:flex;gap:8px;align-items:center;margin-top:6px;');
            const bKirim = el('button', gaya('#dc2626'), 'Kirim ' + method);
            bKirim.type = 'button'; bKirim.id = 'rkf_kirim';
            barisKirim.appendChild(bKirim);
            barisKirim.appendChild(el('span', 'color:#475569;', 'Kirim ' + method + ' selalu minta konfirmasi dan hanya ke domain ini. Simpan/Enter di dalam form tiruan menjalankan Cari, bukan kirim.'));
            const hasil = el('textarea', 'width:100%;box-sizing:border-box;min-height:200px;margin-top:6px;font:12px monospace;white-space:pre;display:none;');
            hasil.id = 'rkf_hasil'; hasil.readOnly = true;
            isi.append(ekstra, cbWrap, el('div', 'margin-top:4px;color:#475569;', 'Payload (token & password disamarkan di tampilan; Cari tidak menyertakan token/password):'), pay, barisCari, barisKirim, hasil);

            function kumpul() {
                const p = [];
                new FormData(salinan).forEach((v, k) => { if (typeof v === 'string') p.push([k, v]); });
                ekstra.value.split('\n').forEach((l) => {
                    const i = l.indexOf('=');
                    if (i > 0) p.push([l.slice(0, i).trim(), l.slice(i + 1)]);
                });
                if (cbToken.checked && tokenMeta && !p.some((x) => x[0] === 'authenticity_token')) p.push(['authenticity_token', tokenMeta]);
                return p;
            }
            const perbarui = () => { const p = kumpul(); pay.value = p.length + ' field:\n' + tampilPayload(p); };
            wadah.addEventListener('input', perbarui);
            wadah.addEventListener('change', perbarui);
            ekstra.addEventListener('input', perbarui);
            cbToken.addEventListener('change', perbarui);
            perbarui();

            async function kirim() {
                const p = kumpul();
                let u;
                try { u = new URL(aksi || url); } catch (e) { alert('Alamat form tidak valid.'); return; }
                if (u.origin !== location.origin) { alert('Alamat form di luar domain ini, tidak dikirim: ' + u.origin); return; }
                const ringkasReq = method + ' ' + u.pathname + u.search + '\n' + (method === 'POST' ? 'Content-Type: application/x-www-form-urlencoded\n' : '') +
                    (cbToken.checked && tokenMeta ? 'X-CSRF-Token: ***\n' : '') + tampilPayload(p).slice(0, 3000);
                hasil.style.display = '';
                if (!confirm('KIRIM ' + ringkasReq.slice(0, 1500) + '\n\nIni MENGIRIM data sungguhan ke Erzap. Lanjutkan?')) {
                    hasil.value = '(dibatalkan, tidak ada yang dikirim)';
                    return;
                }
                const opsi = { method: method, credentials: 'same-origin', headers: {} };
                if (cbToken.checked && tokenMeta) opsi.headers['X-CSRF-Token'] = tokenMeta;
                if (method === 'GET') p.forEach((x) => u.searchParams.append(x[0], x[1]));
                else opsi.body = new URLSearchParams(p);
                bKirim.disabled = true;
                hasil.value = 'Mengirim ...';
                const mulai = Date.now();
                try {
                    const res = await fetch(u.href, opsi);
                    hasil.value = ringkasRespons(res, await res.text(), Date.now() - mulai, ringkasReq);
                } catch (err) {
                    hasil.value = 'Gagal mengirim: ' + err.message;
                } finally {
                    bKirim.disabled = false;
                }
            }
            let inputHasil = [];
            async function cari() {
                let u;
                try { u = new URL(alamat.value.trim() || url, url); } catch (e) { alert('Alamat cari tidak valid.'); return; }
                if (u.origin !== location.origin) { alert('Alamat di luar domain ini, tidak dikirim: ' + u.origin); return; }
                // GET hanya membaca: token CSRF, password, dan utf8 tidak dimasukkan ke URL
                kumpul().filter((x) => x[0] !== 'utf8' && !SENSITIF_NAMA.test(x[0])).forEach((x) => u.searchParams.append(x[0], x[1]));
                const ringkasReq = 'GET ' + sensor(u.pathname + u.search) + (cbAjax.checked ? '\nX-Requested-With: XMLHttpRequest' : '');
                hasil.style.display = '';
                hasil.value = 'Mencari ...';
                bPakai.style.display = 'none';
                bCari.disabled = true;
                const mulai = Date.now();
                try {
                    const res = await fetch(u.href, { method: 'GET', credentials: 'same-origin', headers: cbAjax.checked ? { 'X-Requested-With': 'XMLHttpRequest' } : {} });
                    const teks = await res.text();
                    let laporan = ringkasRespons(res, teks, Date.now() - mulai, ringkasReq);
                    inputHasil = [];
                    if (/html/i.test(res.headers.get('content-type') || '')) {
                        const d = new DOMParser().parseFromString(teks, 'text/html');
                        laporan += '\n\n' + analisaDoc(d, res.url || u.href, teks.length);
                        const sudah = new Set(Array.from(salinan.elements).map((e) => e.name).filter(Boolean));
                        d.querySelectorAll('input[name], select[name], textarea[name]').forEach((e) => {
                            const t = (e.getAttribute('type') || '').toLowerCase();
                            const n = e.getAttribute('name');
                            if (/^(submit|button|reset|image|file|password)$/.test(t) || n === 'utf8' || SENSITIF_NAMA.test(n) || sudah.has(n)) return;
                            if (/^(checkbox|radio)$/.test(t) && !e.hasAttribute('checked')) return;
                            let v = e.tagName === 'SELECT' ? ((e.querySelector('option[selected]') || {}).value || '') : (e.tagName === 'TEXTAREA' ? e.textContent : (e.getAttribute('value') || ''));
                            inputHasil.push(n + '=' + v);
                        });
                    }
                    hasil.value = laporan;
                    if (inputHasil.length) {
                        bPakai.textContent = 'Pakai ' + inputHasil.length + ' input hasil sebagai field tambahan';
                        bPakai.style.display = '';
                    }
                } catch (err) {
                    hasil.value = 'Gagal mencari: ' + err.message;
                } finally {
                    bCari.disabled = false;
                }
            }
            bPakai.addEventListener('click', () => {
                ekstra.value = (ekstra.value.trim() ? ekstra.value.replace(/\s+$/, '') + '\n' : '') + inputHasil.join('\n');
                perbarui();
                bPakai.style.display = 'none';
            });
            bCari.addEventListener('click', cari);
            bKirim.addEventListener('click', kirim);
            salinan.addEventListener('submit', (e) => { e.preventDefault(); e.stopPropagation(); cari(); }, true);
        }
        tampil(forms[awal]);
    }

    function tampilkanHasil() {
        const teks = ['PEREKAM AISTIM ' + location.href, 'Waktu: ' + new Date().toString(), '', '== KLIK & REQUEST HALAMAN ==']
            .concat(log.length ? log : ['(tidak ada yang terekam)'])
            .concat(['', laporanGambar(), '', logRak(), '', '== STRUKTUR HALAMAN INI ==', ringkasDoc(document)]).join('\n');
        tampilModal(teks, 'Hasil rekaman (' + log.length + ' baris)');
    }

    function ringkasDoc(doc) {
        const out = [];
        out.push('Judul: ' + rapih(doc.title));
        if (doc.querySelector('input[type=password]')) out.push('!! Tampaknya HALAMAN LOGIN (ada kolom password). Login dulu di partdistro.com, lalu ulangi.');
        const hs = Array.from(doc.querySelectorAll('h1,h2,h3,h4')).map((h) => rapih(h.textContent)).filter(Boolean).slice(0, 12);
        out.push('Heading: ' + (hs.join(' | ') || '-'));

        const seen = {};
        const links = [];
        doc.querySelectorAll('a[href]').forEach((a) => {
            const t = rapih(a.textContent).slice(0, 40);
            const h = a.getAttribute('href') || '';
            if (!t || !h || h.charAt(0) === '#' || /^javascript/i.test(h)) return;
            const k = t + '>' + h;
            if (seen[k]) return;
            seen[k] = 1;
            links.push(t + ' -> ' + sensor(h).slice(0, 110));
        });
        out.push('Link menu/halaman (' + links.length + ' unik, 45 pertama):');
        links.slice(0, 45).forEach((l) => out.push('  ' + l));

        const tabel = Array.from(doc.querySelectorAll('table'));
        out.push('Jumlah tabel: ' + tabel.length);
        tabel.slice(0, 4).forEach((t, i) => {
            const th = Array.from(t.querySelectorAll('th')).map((x) => rapih(x.textContent).slice(0, 25));
            const rows = Array.from(t.querySelectorAll('tbody tr'));
            out.push('TABEL ' + (i + 1) + ' id=' + (t.id || '-') + ' class=' + rapih(t.className).slice(0, 50) + ' baris=' + rows.length);
            out.push('  header: ' + th.join(' | '));
            rows.slice(0, 3).forEach((r) => {
                out.push('  baris: ' + Array.from(r.children).map((td) => rapih(td.textContent).slice(0, 30)).join(' | '));
                const a = r.querySelector('a[href]');
                if (a) out.push('    link: ' + sensor(a.getAttribute('href')).slice(0, 110));
            });
        });

        const st = Array.from(doc.querySelectorAll('[class*=badge],[class*=label],[class*=status],[class*=notif],[class*=count]'))
            .map((e) => rapih(e.className).slice(0, 30) + '="' + rapih(e.textContent).slice(0, 30) + '"')
            .filter((v, i, a) => a.indexOf(v) === i).slice(0, 15);
        out.push('Badge/status: ' + (st.join(' ; ') || '-'));

        // Form pencarian/filter: kolom & pilihan (mis. filter sumber/via/website)
        const forms = Array.from(doc.querySelectorAll('form'));
        out.push('Jumlah form: ' + forms.length);
        forms.slice(0, 4).forEach((f, i) => {
            out.push('FORM ' + (i + 1) + ' id=' + (f.id || '-') + ' method=' + (f.getAttribute('method') || 'get') + ' action=' + sensor(f.getAttribute('action') || '').slice(0, 80));
            f.querySelectorAll('select').forEach((sel) => {
                const opsi = Array.from(sel.options).slice(0, 15).map((o) => rapih(o.text).slice(0, 22) + '=' + String(o.value).slice(0, 18)).join(' ; ');
                out.push('  select name=' + (sel.name || '-') + ' id=' + (sel.id || '-') + ' opsi: ' + opsi);
            });
            Array.from(f.querySelectorAll('input:not([type=hidden]):not([type=password]):not([type=submit])')).slice(0, 15).forEach((inp) => {
                out.push('  input name=' + (inp.name || '-') + ' type=' + (inp.type || 'text') + (inp.placeholder ? ' placeholder=' + rapih(inp.placeholder).slice(0, 25) : ''));
            });
        });

        // Di mana kata "website"/"partdistro" muncul (cara nota dari web dibedakan)
        const cocok = [];
        doc.querySelectorAll('body *').forEach((el) => {
            if (cocok.length >= 12 || /^(script|style|noscript|option)$/i.test(el.tagName) || (el.closest && el.closest('#rk_rekam_ui'))) return;
            const t = rapih(el.textContent);
            if (t.length > 0 && t.length <= 60 && /website|partdistro|olzap/i.test(t) && !Array.from(el.children).some((c) => /website|partdistro|olzap/i.test(c.textContent || ''))) {
                cocok.push('<' + el.tagName.toLowerCase() + (el.className ? ' class="' + rapih(el.className).slice(0, 40) + '"' : '') + (el.id ? ' id="' + el.id + '"' : '') + '> "' + t + '"');
            }
        });
        out.push('Kata website/partdistro/olzap muncul di: ' + (cocok.length ? '' : '-'));
        cocok.forEach((c) => out.push('  ' + c));
        return out.join('\n');
    }


    btn.addEventListener('click', () => {
        if (!merekam) {
            log = [];
            merekam = true;
            perbaruiTombol();
        } else {
            merekam = false;
            perbaruiTombol();
            tampilkanHasil();
        }
    });

    function pasang() {
        if (document.body && !document.getElementById('rk_rekam_ui')) document.body.appendChild(ui);
    }
    new MutationObserver(pasang).observe(document.documentElement, { childList: true, subtree: true });
    pasang();
})();
