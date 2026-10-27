// ==UserScript==
// @name         devtool
// @namespace    http://tampermonkey.net/
// @version      1.6.0
// @description  [v1.6.0] testurl: tombol Analisa - link di-fetch lalu HTML-nya di-parse dan ditampilkan komponennya (form, input/select/textarea beserta name/id/label/nilai, tombol, tabel, modal, link, library). [v1.5.0] Tombol testurl di bawah tombol Rekam: popup input link, fetch (GET) lalu tampilkan outputnya. [v1.4.1] Hasil rekaman memuat struktur halaman (tabel, filter, kata 'website'). Tombol merekam klik & request (fetch/XHR) di SEMUA halaman Erzap untuk dikirim ke developer. TERSEMBUNYI secara default: aktif hanya setelah buka halaman dengan ?rekam=1 (matikan lagi dengan ?rekam=0). Token/cookie tidak ikut direkam.
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
        .replace(/(csrf[-_]?token["']?\s*[:=]\s*["']?)[^&\s"']*/gi, '$1***');

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
        kotak.style.cssText = 'background:#fff;color:#111;width:94%;max-width:900px;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;max-height:90vh;font:13px sans-serif;';
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
        kotak.appendChild(judul); kotak.appendChild(baris); kotak.appendChild(info); kotak.appendChild(out);
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
            const mulai = Date.now();
            try {
                const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
                const teks = await res.text();
                info.textContent = 'HTTP ' + res.status + ' ' + res.statusText + ' | ' + (res.headers.get('content-type') || '-') + ' | ' + teks.length + ' karakter | ' + (Date.now() - mulai) + ' ms' + (res.redirected ? ' | dialihkan ke ' + res.url : '');
                if (!analisa) { out.value = teks; return; }
                try {
                    out.value = analisaDoc(new DOMParser().parseFromString(teks, 'text/html'), res.url || url, teks.length);
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

        const seen = {};
        const links = [];
        doc.querySelectorAll('a[href]').forEach((a) => {
            const t = ptg(a.textContent, 40);
            const h = a.getAttribute('href') || '';
            if (!t || !h || h.charAt(0) === '#' || /^javascript/i.test(h)) return;
            const k = t + '>' + h;
            if (seen[k]) return;
            seen[k] = 1;
            links.push(t + ' -> ' + sensor(h).slice(0, 100));
        });
        out.push('', '== LINK (' + links.length + ' unik, 25 pertama) ==');
        links.slice(0, 25).forEach((l) => out.push('  ' + l));
        const hal = doc.querySelectorAll('.pagination a, [class*=paginat] a').length;
        if (hal) out.push('Paginasi: ' + hal + ' link');

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
