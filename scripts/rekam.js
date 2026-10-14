// ==UserScript==
// @name         devtool
// @namespace    http://tampermonkey.net/
// @version      1.5.0
// @description  [v1.5.0] Tombol testurl di bawah tombol Rekam: popup input link, fetch (GET) lalu tampilkan outputnya. [v1.4.1] Hasil rekaman memuat struktur halaman (tabel, filter, kata 'website'). Tombol merekam klik & request (fetch/XHR) di SEMUA halaman Erzap untuk dikirim ke developer. TERSEMBUNYI secara default: aktif hanya setelah buka halaman dengan ?rekam=1 (matikan lagi dengan ?rekam=0). Token/cookie tidak ikut direkam.
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
        const bSalin = document.createElement('button');
        bSalin.type = 'button'; bSalin.textContent = 'Salin'; bSalin.style.cssText = gaya('#28a745');
        const bTutup = document.createElement('button');
        bTutup.type = 'button'; bTutup.textContent = 'Tutup'; bTutup.style.cssText = gaya('#64748b');
        baris.appendChild(inp); baris.appendChild(bGo); baris.appendChild(bSalin); baris.appendChild(bTutup);
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
        async function ambil() {
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
                out.value = teks;
            } catch (err) {
                info.textContent = 'Gagal: ' + err.message + ' (link luar domain biasanya diblokir CORS)';
            }
        }
        bGo.onclick = ambil;
        bTutup.onclick = tutup;
        bSalin.onclick = async () => {
            try { await navigator.clipboard.writeText(out.value); } catch (e) { out.select(); document.execCommand('copy'); }
            info.textContent = 'Output disalin.';
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ambil(); if (e.key === 'Escape') tutup(); });
        bd.addEventListener('mousedown', (e) => { if (e.target === bd) tutup(); });
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
