// Uji perilaku scripts/aistim_tool.js (1.0.5, perbaikan audit 2026-11-19) dengan tiruan DOM sederhana.
// File skrip asli dijalankan apa adanya di vm; yang ditiru hanya DOM, timer, dan localStorage.
// Bukan pengganti uji browser: selector dan tata letak Erzap asli tidak diperiksa di sini.
// Jalankan dari root repo:
// ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)" docs/audit/fixtures/2026-11-19-aistim-tool-dom.js [path skrip]
// Tanpa argumen, yang diuji scripts/aistim_tool.js. Dengan versi 1.0.4 (git show 99e1fad:scripts/aistim_tool.js), 16 dari 24 tes gagal.
'use strict';
const fs = require('fs');
const vm = require('vm');
const SRC = fs.readFileSync(process.argv[2] || 'scripts/aistim_tool.js', 'utf8');

// ---------- tiruan DOM ----------
global.__catat = () => {};
class Teks {
    constructor(v) { this.nodeType = 3; this.nodeValue = v; this.parentNode = null; }
    get parentElement() { return this.parentNode; }
    get textContent() { return this.nodeValue; }
}
function cocok(el, selGabung) {
    return selGabung.split(',').some(s => {
        s = s.trim();
        if (s === '*') return true;
        const m = s.match(/^([a-zA-Z]*)((?:[#.][\w-]+)*)((?:\[[^\]]+\])*)$/);
        if (!m) throw new Error('selector tidak didukung: ' + s);
        if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
        for (const p of (m[2].match(/[#.][\w-]+/g) || [])) {
            if (p[0] === '#' && el.id !== p.slice(1)) return false;
            if (p[0] === '.' && !el.classList().includes(p.slice(1))) return false;
        }
        for (const a of (m[3].match(/\[[^\]]+\]/g) || [])) {
            const am = a.match(/^\[(\w+)\*="([^"]*)"\]$/);
            if (!am) throw new Error('atribut tidak didukung: ' + a);
            const v = am[1] === 'class' ? el.className : (el.getAttribute(am[1]) || '');
            if (!v.includes(am[2])) return false;
        }
        return true;
    });
}
class El {
    constructor(tag) {
        this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = []; this.parentNode = null;
        this.attrs = {}; this.id = ''; this.className = ''; this.listeners = {};
        this.style = { display: '' }; this.rowSpan = 1; this.colSpan = 1;
        this.value = ''; this.defaultValue = ''; this.checked = false; this.defaultChecked = false; this.type = 'text';
        this.isContentEditable = false;
    }
    classList() { return this.className.split(/\s+/).filter(Boolean); }
    get children() { return this.childNodes.filter(n => n.nodeType === 1); }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
    set textContent(v) { this.childNodes.forEach(n => n.parentNode = null); this.childNodes = []; if (v !== '') this.appendChild(new Teks(String(v))); }
    set innerHTML(v) { this._html = v; this.textContent = String(v).replace(/<[^>]*>/g, ''); }
    get innerHTML() { return this._html || ''; }
    get nextSibling() { const s = this.parentNode.childNodes; return s[s.indexOf(this) + 1] || null; }
    get cells() { return this.children.filter(c => c.tagName === 'TD' || c.tagName === 'TH'); }
    get rows() { global.__rowsDibaca = (global.__rowsDibaca || 0) + 1; const r = []; this.children.forEach(s => s.children.forEach(tr => { if (tr.tagName === 'TR') r.push(tr); })); return r; }
    get options() { return this.children.filter(c => c.tagName === 'OPTION'); }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === global.__doc; }
    appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); global.__catat(this, n); return n; }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i < 0) throw new Error('bukan anak'); this.childNodes.splice(i, 1); n.parentNode = null; return n; }
    insertBefore(n, ref) { if (!ref) return this.appendChild(n); if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, n); global.__catat(this, n); return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    fire(t, e) { (this.listeners[t] || []).forEach(f => f(Object.assign({ target: this, stopPropagation() {} }, e))); }
    *semua() { for (const c of this.children) { yield c; yield* c.semua(); } }
    querySelectorAll(s) { return [...this.semua()].filter(e => cocok(e, s)); }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    closest(s) { let e = this; while (e && e.nodeType === 1) { if (cocok(e, s)) return e; e = e.parentNode; } return null; }
    contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
}
function h(tag, props, ...anak) {
    const e = new El(tag);
    Object.assign(e, props || {});
    anak.forEach(a => e.appendChild(typeof a === 'string' ? new Teks(a) : a));
    return e;
}

// ---------- lingkungan ----------
function buatLingkungan({ kasir, tabel, path = '/stok_opnams/123' }) {
    let sekarang = 1000000;
    const interval = new Map(); let idInterval = 0;
    const hasil = { reload: 0, log: [], mutasiDicatat: [], observerAktif: false, observerCb: null };
    global.__catat = (target, n) => { if (hasil.observerAktif) hasil.mutasiDicatat.push({ target, addedNodes: [n] }); };

    const doc = new El('#document');
    global.__doc = doc;
    const html = h('html'); doc.appendChild(html);
    const head = h('head'); html.appendChild(head);
    const body = h('body'); html.appendChild(body);
    const navUl = h('ul', { className: 'navbar-nav' },
        h('li', { className: 'nav-item dropdown' }, h('a', { className: 'nav-link' }, h('span', {}, 'Administrator'))),
        h('li', { className: 'nav-item' }, h('a', { className: 'nav-link' }, 'Logout')));
    body.appendChild(navUl);
    if (kasir) body.appendChild(h('div', { id: 'info_kasir' }, kasir));
    if (tabel) body.appendChild(tabel);
    const cari = h('input', { id: 'cari' }); body.appendChild(cari);

    Object.assign(doc, {
        readyState: 'complete', hidden: false, body, head, activeElement: body,
        createElement: t => new El(t),
        getElementById: id => doc.querySelector('#' + id),
        createTreeWalker(root) {
            const teks = []; (function jalan(n) { n.childNodes.forEach(c => c.nodeType === 3 ? teks.push(c) : jalan(c)); })(root);
            let i = 0; return { nextNode: () => teks[i++] || null };
        },
    });
    class MO {
        constructor(cb) { hasil.observerCb = cb; }
        observe() { hasil.observerAktif = true; }
        disconnect() { hasil.observerAktif = false; hasil.mutasiDicatat = []; }
    }
    const penyimpanan = {};
    const ctx = {
        document: doc, NodeFilter: { SHOW_TEXT: 4 }, MutationObserver: MO,
        location: { pathname: path, reload: () => { hasil.reload++; } },
        localStorage: { getItem: k => (k in penyimpanan ? penyimpanan[k] : null), setItem: (k, v) => { penyimpanan[k] = String(v); } },
        console: { log: (...a) => hasil.log.push(a.join(' ')), error: () => {} },
        setInterval: (f, ms) => { interval.set(++idInterval, { f, ms, next: sekarang + ms }); return idInterval; },
        clearInterval: id => interval.delete(id),
        setTimeout: (f, ms) => { const id = ++idInterval; interval.set(id, { f, ms, next: sekarang + ms, sekali: true }); return id; },
        Date: { now: () => sekarang }, Math, JSON, Array, Object, String, Number, WeakMap, Map, Set, RegExp, parseFloat,
    };
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx);
    hasil.maju = ms => {
        const akhir = sekarang + ms;
        for (;;) {
            let min = null;
            for (const [id, t] of interval) if (t.next <= akhir && (!min || t.next < min[1].next)) min = [id, t];
            if (!min) break;
            sekarang = min[1].next;
            if (min[1].sekali) interval.delete(min[0]); else min[1].next += min[1].ms;
            min[1].f();
        }
        sekarang = akhir;
    };
    hasil.jumlahInterval = () => interval.size;
    hasil.picuObserver = () => { const m = hasil.mutasiDicatat; hasil.mutasiDicatat = []; if (m.length && hasil.observerCb) hasil.observerCb(m); };
    return { doc, body, cari, hasil, penyimpanan };
}

// ---------- tabel SO tiruan ----------
const td = (t, p) => h('td', p, t);
function barisData(nama, hitung, stok, opsi = {}) {
    const sel = [td(nama, opsi.rowSpan ? { rowSpan: opsi.rowSpan } : {}), td('k'), td('b'), td('x'), td('y'), td(hitung), td(stok)];
    return h('tr', { nama }, ...sel);
}
function buatTabel() {
    const thead = h('thead', {}, h('tr', {}, ...['Nama', 'K', 'B', 'X', 'Y', 'Perhitungan', 'Stok SO'].map(t => h('th', {}, t))));
    const lanjut = h('tr', { nama: 'A-lanjut' }, td('k2'), td('b2'), td('x2'), td('y2'), td('3.0 PCS'), td('3.0 PCS'));
    const baris = [
        barisData('A', '10.0 PCS', '12.0 PCS', { rowSpan: 2 }), lanjut,
        barisData('B-real', '12.0 PCS', '12.0 PCS'),
        barisData('C-unit', '0.0 UNIT', '5.0 UNIT'),
        barisData('D-desimal', '12.3 PCS', '12.1 PCS'),
        barisData('E-nol-pcs', '0.0 PCS', '5.0 PCS'),
        h('tr', { nama: 'F-kosong' }, td(''), td(''), td(''), td(''), td(''), td(''), td('')),
    ];
    const tbody = h('tbody', {}, ...baris);
    return { tabel: h('table', { className: 'no_data_table table' }, thead, tbody), tbody };
}
const urutan = tb => tb.children.map(r => r.nama).join(', ');
const selisih = tb => tb.children.map(r => { const c = r.querySelector('.koreksi-col'); return r.nama + '=' + (c ? JSON.stringify(c.textContent) : '-'); }).join(', ');

let gagal = 0;
function cek(nama, nyata, harap) {
    const ok = JSON.stringify(nyata) === JSON.stringify(harap);
    if (!ok) gagal++;
    console.log((ok ? 'LULUS ' : 'GAGAL ') + nama + (ok ? '' : '\n   dapat: ' + JSON.stringify(nyata) + '\n   harap: ' + JSON.stringify(harap)));
}

// 1. User pusat, filter bawaan "Ada Selisih"
{
    const { tabel, tbody } = buatTabel();
    const L = buatLingkungan({ kasir: 'Kasir: SENTOT ARI HANDOKO', tabel });
    cek('1a kolom header ditambahkan', tabel.querySelectorAll('th.koreksi-col').length, 1);
    cek('1b nilai kolom Cek Selisih', selisih(tbody), 'A="-2", A-lanjut=-, D-desimal="0.2"');
    cek('1c filter bawaan koreksi: baris lanjutan tetap di bawah induknya', urutan(tbody), 'A, A-lanjut, D-desimal');
    const select = L.doc.getElementById('erzap-filter-select');
    cek('1d jumlah di dropdown', select.options.map(o => o.textContent),
        ['Semua (6)', 'Ada Selisih (-/+) (2)', 'Negatif (-) (1)', 'Positif (+) (1)', 'Real (1)', 'Belum dicek (3)']);
    select.value = 'semua'; select.fire('change');
    cek('1e filter Semua: urutan asli', urutan(tbody), 'A, A-lanjut, B-real, C-unit, D-desimal, E-nol-pcs, F-kosong');
    cek('1f status satuan lain & nol', ['C-unit', 'E-nol-pcs'].map(n => tbody.children.find(r => r.nama === n).getAttribute('data-koreksi-status')), ['uncalculated', 'uncalculated']);
    const wrap = L.doc.getElementById('erzap-wrapper');
    cek('1g menu dipasang setelah li Administrator', wrap.parentNode.children.indexOf(wrap), 1);
    cek('1h observer aktif untuk pusat', L.hasil.observerAktif, true);

    // 2. Hitung mundur tiap detik tidak memicu pemindaian
    L.hasil.maju(1000);
    const dibaca = () => { const a = global.__rowsDibaca || 0; L.hasil.picuObserver(); return (global.__rowsDibaca || 0) - a; };
    cek('2a mutasi hitung mundur tidak memindai tabel', dibaca(), 0);
    tbody.children[0].appendChild(td('sel tambahan'));
    cek('2b sel (td) baru tidak memindai tabel', dibaca(), 0);
    tbody.children[0].removeChild(tbody.children[0].children[tbody.children[0].children.length - 1]);

    // 3. Erzap mengganti baris B-real dengan baris G baru (tanpa reload)
    const b = tbody.children.find(r => r.nama === 'B-real');
    tbody.removeChild(b);
    tbody.appendChild(barisData('G-baru', '1.0 PCS', '4.0 PCS'));
    L.hasil.picuObserver();
    cek('3a baris lama tidak muncul lagi, baris baru diproses', urutan(tbody), 'A, A-lanjut, C-unit, D-desimal, E-nol-pcs, F-kosong, G-baru');
    select.value = 'koreksi'; select.fire('change');
    select.value = 'semua'; select.fire('change');
    cek('3b setelah ganti filter dua kali tetap tanpa B-real', urutan(tbody), 'A, A-lanjut, C-unit, D-desimal, E-nol-pcs, F-kosong, G-baru');

    // 4. Auto refresh
    L.hasil.maju(55000);
    cek('4a belum 60 detik: belum reload', L.hasil.reload, 0);
    L.doc.hidden = true; L.hasil.maju(10000);
    cek('4b tab tidak aktif: ditunda', [L.hasil.reload, L.doc.getElementById('erzap-refresh-countdown').textContent], [0, 'Ditunda: tab tidak aktif']);
    L.doc.hidden = false; L.doc.getElementById('erzap-panel').style.display = 'block'; L.hasil.maju(2000);
    cek('4c menu terbuka: ditunda', L.hasil.reload, 0);
    L.doc.getElementById('erzap-panel').style.display = 'none';
    const pop = h('div', { id: 'popupHasilKoreksiSO' }); L.body.appendChild(pop); L.hasil.maju(2000);
    cek('4d popup tombol_so_list terbuka: ditunda', L.hasil.reload, 0);
    pop.remove();
    L.cari.value = 'oli'; L.doc.activeElement = L.cari; L.hasil.maju(2000);
    cek('4e isian cari belum dikirim: ditunda', [L.hasil.reload, L.doc.getElementById('erzap-refresh-countdown').textContent], [0, 'Ditunda: isian belum disimpan']);
    L.cari.value = ''; L.hasil.maju(2000);
    cek('4f kotak cari fokus tapi kosong: reload sekali', L.hasil.reload, 1);
    L.hasil.maju(10000);
    cek('4g tidak reload berulang', L.hasil.reload, 1);
}

// 5. User bukan pusat
{
    const { tabel, tbody } = buatTabel();
    const L = buatLingkungan({ kasir: 'Kasir: BUDI', tabel });
    L.hasil.maju(120000);
    cek('5a tanpa kolom, tanpa menu, tanpa reload, observer mati, tidak ada interval',
        [tabel.querySelectorAll('.koreksi-col').length, !!L.doc.getElementById('erzap-wrapper'), L.hasil.reload, L.hasil.observerAktif, L.hasil.jumlahInterval()],
        [0, false, 0, false, 0]);
    cek('5b urutan tabel tidak berubah', urutan(tbody), 'A, A-lanjut, B-real, C-unit, D-desimal, E-nol-pcs, F-kosong');
}

// 6. Halaman stok_opnams tanpa tabel: berhenti menunggu
{
    const L = buatLingkungan({ kasir: 'Kasir: SENTOT', tabel: null });
    L.hasil.maju(30000);
    const masihMenunggu = L.hasil.jumlahInterval();
    L.hasil.maju(40000);
    cek('6a menunggu di 30 detik, berhenti setelah 60 detik', [masihMenunggu, L.hasil.jumlahInterval()], [1, 0]);
}

// 7. Tabel muncul belakangan (dalam 60 detik)
{
    const { tabel, tbody } = buatTabel();
    const L = buatLingkungan({ kasir: 'Kasir: SURYO', tabel: null });
    L.hasil.maju(5000);
    L.body.appendChild(tabel);
    L.hasil.maju(1000);
    cek('7a init setelah tabel muncul', urutan(tbody), 'A, A-lanjut, D-desimal');
}

// 8. Halaman proses SO dikecualikan
{
    const { tabel } = buatTabel();
    const L = buatLingkungan({ kasir: 'Kasir: SENTOT', tabel, path: '/stok_opnams/proses_koreksi_so/9' });
    L.hasil.maju(120000);
    cek('8a proses_koreksi_so: tidak ada apa pun', [tabel.querySelectorAll('.koreksi-col').length, L.hasil.reload, L.hasil.jumlahInterval()], [0, 0, 0]);
}

console.log(gagal ? '\n' + gagal + ' GAGAL' : '\nSemua lulus');
process.exitCode = gagal ? 1 : 0;
