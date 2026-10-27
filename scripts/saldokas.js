// ==UserScript==
// @name         ERZAP - Lihat Saldo Sistem (Hitung Saldo Kas)
// @namespace    https://trial.erzap.com/
// @version      1.14.5
// @description  Menambahkan tombol "Lihat saldo sistem" di sebelah kolom saldo (default: Kas Brankas) pada halaman Hitung Saldo Kas. Saldo diambil dari halaman Lihat Saldo untuk outlet yang dipilih dan hanya ditampilkan di samping tombol (TIDAK dimasukkan ke input). Script TIDAK menekan tombol Simpan.
// @match        https://trial.erzap.com/perkiraans/hitung_saldo_kas/*
// @match        https://*.erzap.com/perkiraans/hitung_saldo_kas/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ====== PENGATURAN ======
  const CONFIG = {
    // Kas yang diberi tombol. [] = SEMUA baris kas di tabel (termasuk "Kas Toko <nama outlet>"
    // yang namanya berbeda tiap outlet). Untuk membatasi, isi nama persis, contoh:
    // ['Kas Brankas', 'Kas GA (General Affairs)']
    kasList: [],
    label: 'Lihat saldo sistem',
    // null = pakai bulan & tahun hari ini
    bulan: null, // 1-12
    tahun: null, // contoh: 2026
  };

  // ====== HAK AKSES & FITUR (JSON) ======
  // "role": "public"  -> SEMUA user yang membuka halaman ini bisa melihat & memakai tombol.
  // "role": "private" -> HANYA user di daftar "private.users" (dan "admin") yang bisa melihat & memakai tombol.
  // "admin"           -> pengembang: SELALU punya akses penuh walau tidak ada di daftar "private.users".
  // "fitur"           -> true/false untuk menyalakan/mematikan tiap fitur.
  // "khusus"          -> membatasi SATU fitur hanya untuk nama tertentu (di luar "admin"). Fitur yang tidak
  //                      ada di "khusus" tetap bisa dipakai semua user yang lolos "role". Nama fitur: lihatSaldo,
  //                      edit, sembunyi, formatRp. Contoh sekarang: tombol "Lihat saldo sistem" untuk SENTOT dan SURYO.
  // Nama dibaca dari tulisan "NAMA (JABATAN)" di pojok kanan bawah ERZAP. Cukup sebagian nama
  // (tidak peduli huruf besar/kecil); isi nama lengkap persis seperti di ERZAP agar tidak
  // salah cocok dengan user lain (mis. ganti "SURYO" dengan nama lengkapnya).
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada yang melihat apa pun).
  // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script di Tampermonkey
  // dan muat ulang halaman ERZAP.
  const AKSES_JSON = `{
    "role": "private",
    "private": {
      "users": ["SENTOT ARI HANDOKO", "SURYO"]
    },
    "admin": ["SENTOT ARI HANDOKO", "DIMAS", "PUGUH", "MANAJEMEN PUSAT"],
    "khusus": {
      "lihatSaldo": ["SENTOT ARI HANDOKO", "SURYO"]
    },
    "fitur": {
      "lihatSaldo": true,
      "edit": true,
      "sembunyi": true,
      "formatRp": true
    }
  }`;
  // ========================

  const BTN_CLASS = 'tm-isi-saldo-sistem';
  const SALDO_AKSI_CLASS = 'tm-saldo-aksi';
  const PULIH_CLASS = 'tm-pulihkan-baris';
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const cache = new Map(); // "outletId|tahun" -> Document hasil Lihat Saldo
  let SETTINGS = null; // diisi saat start: { role, users, admin, fitur }

  // "Rp 48,580,500.00" -> 48580500
  function parseRupiah(text) {
    const n = parseFloat(String(text).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }

  const fmtRp = (n) =>
    'Rp ' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  async function getToken() {
    const res = await fetch('/jurnals/perkiraan_saldo/new', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Gagal membuka halaman Lihat Saldo (HTTP ' + res.status + ')');
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const tokenEl = doc.querySelector('input[name="authenticity_token"]');
    if (!tokenEl) throw new Error('Token tidak ditemukan. Coba login ulang.');
    return tokenEl.value;
  }

  // Sama seperti memilih Outlet + Akun "Kas dan Bank" lalu menekan Cari di Lihat Saldo
  async function fetchLihatSaldo(outletId, tahun) {
    const key = outletId + '|' + tahun;
    if (cache.has(key)) return cache.get(key);

    const fd = new FormData();
    fd.set('utf8', '✓');
    fd.set('authenticity_token', await getToken());
    fd.set('perkiraan_saldo[idperkiraan]', ''); // "Kas dan Bank" (semua akun kas & bank)
    fd.set('perkiraan_saldo[idoutlets]', outletId);
    fd.set('perkiraan_saldo[year]', String(tahun));

    const res = await fetch('/jurnals/perkiraan_saldo/new', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html, */*' },
    });
    if (!res.ok) throw new Error('Gagal mengambil saldo sistem (HTTP ' + res.status + ')');
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    cache.set(key, doc);
    return doc;
  }

  function findSaldo(doc, kasName, bulan) {
    const table = [...doc.querySelectorAll('table')].find((t) =>
      [...(t.rows[0]?.cells || [])].some((c) => norm(c.textContent) === 'bulan')
    );
    if (!table) throw new Error('Tabel saldo tidak ditemukan untuk outlet/tahun ini.');
    const headers = [...table.rows[0].cells].map((c) => norm(c.textContent));
    const col = headers.indexOf(norm(kasName));
    if (col < 0) throw new Error('Kolom "' + kasName + '" tidak ada di Lihat Saldo untuk outlet ini.');
    const row = [...table.rows].find((r) => r.cells[0] && r.cells[0].textContent.trim() === String(bulan));
    if (!row) throw new Error('Baris bulan ' + bulan + ' tidak ditemukan.');
    const val = parseRupiah(row.cells[col].textContent);
    if (Number.isNaN(val)) throw new Error('Nilai saldo tidak terbaca: ' + row.cells[col].textContent);
    return val;
  }

  // Tombol + teks hasil. Hasil hanya DITAMPILKAN, tidak dimasukkan ke kolom input.
  function makeButton(kasName) {
    const wrap = document.createElement('span');
    wrap.className = BTN_CLASS;
    // position:absolute -> tombol "melayang" di dalam sel sehingga TIDAK mengubah
    // lebar kolom / tinggi baris / ukuran asli tabel ERZAP.
    wrap.style.cssText =
      'position:absolute;right:8px;top:50%;transform:translateY(-50%);margin:0;padding:0;line-height:1;white-space:nowrap;';

    const btn = document.createElement('button');
    btn.type = 'button'; // penting: jangan submit form
    btn.textContent = CONFIG.label;
    btn.title = 'Tampilkan saldo sistem "' + kasName + '" bulan ini (tidak mengisi kolom, tidak menyimpan)';
    btn.style.cssText =
      'padding:3px 10px;background:#f5a800;color:#fff;border:0;margin:0;' +
      'border-radius:4px;cursor:pointer;font-size:12px;line-height:1.5;white-space:nowrap;';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const outletId = (document.getElementById('idoutlet_own') || {}).value;
      if (!outletId) return alert('Pilih Outlet terlebih dahulu.');

      const now = new Date();
      const bulan = CONFIG.bulan || now.getMonth() + 1;
      const tahun = CONFIG.tahun || now.getFullYear();

      btn.disabled = true;
      btn.style.background = '#f5a800';
      btn.textContent = 'Memuat...';
      try {
        const doc = await fetchLihatSaldo(outletId, tahun);
        const saldo = findSaldo(doc, kasName, bulan);
        // Hasil ditampilkan di tombol itu sendiri (klik lagi untuk memuat ulang)
        btn.textContent = fmtRp(saldo);
        btn.title = 'Saldo sistem "' + kasName + '" bulan ini. Klik untuk memuat ulang.';
        cache.clear();
      } catch (err) {
        btn.style.background = '#c0392b';
        btn.textContent = 'Gagal - coba lagi';
        btn.title = err.message;
      } finally {
        btn.disabled = false;
      }
    });

    wrap.append(btn);
    return wrap;
  }

  // Tombol "Tampilkan baris (n)" di header kolom Saldo: muncul hanya jika ada baris yang
  // disembunyikan dengan tombol X. Klik untuk menampilkan semua baris lagi.
  function updatePulihkan(table) {
    if (!table || !table.rows[0]) return;
    const th = table.rows[0].cells[table.rows[0].cells.length - 1];
    let btn = th.querySelector('.' + PULIH_CLASS);
    if (!btn) {
      th.style.position = 'relative';
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = PULIH_CLASS;
      btn.style.cssText =
        'position:absolute;right:8px;top:50%;transform:translateY(-50%);padding:3px 10px;border:0;margin:0;' +
        'border-radius:4px;cursor:pointer;font-size:12px;line-height:1.5;color:#fff;background:#2d8cf0;white-space:nowrap;';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        table.querySelectorAll('tr[data-tm-hidden="1"]').forEach((tr) => {
          tr.style.display = '';
          delete tr.dataset.tmHidden;
        });
        updatePulihkan(table);
      });
      th.appendChild(btn);
    }
    const n = table.querySelectorAll('tr[data-tm-hidden="1"]').length;
    btn.style.display = n ? '' : 'none';
    btn.textContent = 'Tampilkan baris (' + n + ')';
  }

  // ===== Format "Rp 1,234,567" pada kolom saldo =====
  // Yang tampil di kolom: "Rp 1,234,567" (otomatis saat mengetik / menerapkan hitungan pecahan).
  // Yang DIKIRIM ke server saat Simpan: angka polos ("1234567") lewat input hidden ber-name asli,
  // jadi proses di ERZAP tidak terganggu dan tetap jalan walau Simpan lewat shortcut F2.
  function formatRupiahText(str) {
    const s = String(str).replace(/[^\d.]/g, '');
    const dot = s.indexOf('.');
    let int = dot >= 0 ? s.slice(0, dot) : s;
    const dec = dot >= 0 ? s.slice(dot + 1).replace(/\./g, '').slice(0, 2) : '';
    int = int.replace(/^0+(?=\d)/, '');
    if (!int && dot < 0) return { text: '', raw: '' };
    if (!int) int = '0';
    const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return { text: 'Rp ' + intFmt + (dot >= 0 ? '.' + dec : ''), raw: int + (dec ? '.' + dec : '') };
  }

  function rawInputOf(input) {
    const n = input.nextElementSibling;
    return n && n.dataset && n.dataset.tmRaw ? n : null;
  }

  function setupFormat(input) {
    if (input.dataset.tmSaldo) return;
    const name = input.name;
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = name; // nilai angka polos yang dikirim saat Simpan
    hidden.dataset.tmRaw = '1';
    input.parentNode.insertBefore(hidden, input.nextSibling);
    input.removeAttribute('name'); // kolom tampilan tidak ikut terkirim
    input.dataset.tmSaldo = '1';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';

    const terapkanFormat = (keepCaret) => {
      const pos = input.selectionStart;
      const sig = input.value.slice(0, pos == null ? input.value.length : pos).replace(/[^\d.]/g, '').length;
      const r = formatRupiahText(input.value);
      input.value = r.text;
      hidden.value = r.raw;
      if (keepCaret && document.activeElement === input) {
        let np = r.text ? 3 : 0; // setelah awalan "Rp "
        let c = 0;
        if (sig > 0) {
          np = r.text.length;
          for (let i = 0; i < r.text.length; i++) {
            if (/[\d.]/.test(r.text[i])) c++;
            if (c === sig) {
              np = i + 1;
              break;
            }
          }
        }
        input.setSelectionRange(np, np);
      }
    };
    input.addEventListener('input', () => terapkanFormat(true));
    input.addEventListener('blur', () => {
      // rapikan, mis. "Rp 12." -> "Rp 12"
      const r = formatRupiahText(hidden.value);
      input.value = r.text;
      hidden.value = r.raw;
    });
    if (input.value) terapkanFormat(false);
  }

  // Isi kolom saldo (tampilan "Rp ..." + nilai angka polos untuk dikirim)
  function setSaldo(input, angka) {
    if (!SETTINGS.fitur.formatRp) {
      // Format Rp dimatikan: isi angka polos seperti biasa
      input.value = String(angka);
      ['input', 'change', 'keyup', 'blur'].forEach((ev) => input.dispatchEvent(new Event(ev, { bubbles: true })));
      return;
    }
    setupFormat(input);
    const r = formatRupiahText(String(angka));
    input.value = r.text;
    const hidden = rawInputOf(input);
    if (hidden) hidden.value = r.raw;
  }

  // ===== Popup hitung pecahan uang =====
  const PECAHAN = [
    { grup: 'Uang kertas', nilai: [100000, 75000, 50000, 20000, 10000, 5000, 2000, 1000] },
    { grup: 'Uang koin', nilai: [1000, 500, 200, 100] },
  ];
  const pecahanState = new WeakMap(); // input saldo -> jumlah lembar/keping terakhir (agar bisa diedit lagi)
  const fmtNum = (n) => n.toLocaleString('en-US');

  function h(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }

  function bukaPecahan(kasName, input) {
    if (document.getElementById('tm-pecahan-overlay')) return;
    const state = pecahanState.get(input) || { qty: {} };
    const qtyInputs = []; // { key, nilai, el, sub }

    const overlay = h(
      'div',
      'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.45);display:flex;' +
        'align-items:center;justify-content:center;padding:12px;box-sizing:border-box;'
    );
    overlay.id = 'tm-pecahan-overlay';

    const card = h(
      'div',
      'background:#fff;color:#222;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.35);' +
        'width:min(100%,420px);max-height:100%;display:flex;flex-direction:column;overflow:hidden;' +
        'font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
    );

    const head = h('div', 'padding:12px 16px;border-bottom:1px solid #e5e5e5;');
    head.append(h('div', 'font-size:16px;font-weight:700;', 'Hitung pecahan uang'), h('div', 'font-size:12px;color:#666;margin-top:2px;', kasName));

    const body = h('div', 'padding:8px 16px;overflow:auto;flex:1;');
    const totalEl = h('div', 'font-size:20px;font-weight:700;color:#222;');

    const hitung = () => {
      let total = 0;
      qtyInputs.forEach((q) => {
        const jml = parseInt(q.el.value || '0', 10) || 0;
        state.qty[q.key] = jml;
        const sub = jml * q.nilai;
        q.sub.textContent = sub ? fmtNum(sub) : '-';
        total += sub;
      });
      totalEl.textContent = 'Rp ' + fmtNum(total);
      return total;
    };

    const fieldCss =
      'width:100%;box-sizing:border-box;padding:5px 8px;border:1px solid #bbb;border-radius:6px;' +
      'font-size:14px;text-align:right;background:#fff;color:#222;';

    PECAHAN.forEach((g) => {
      body.append(h('div', 'margin:10px 0 4px;font-size:12px;font-weight:700;color:#888;text-transform:uppercase;', g.grup));
      g.nilai.forEach((n) => {
        const key = g.grup + '-' + n;
        const row = h('div', 'display:grid;grid-template-columns:84px 1fr 96px;gap:8px;align-items:center;margin:4px 0;');
        const lbl = h('div', 'font-weight:600;', 'Rp ' + fmtNum(n));
        const el = h('input', fieldCss);
        el.type = 'text';
        el.inputMode = 'numeric';
        el.placeholder = '0';
        el.value = state.qty[key] ? String(state.qty[key]) : '';
        el.addEventListener('input', () => {
          el.value = el.value.replace(/\D/g, '');
          hitung();
        });
        const sub = h('div', 'text-align:right;color:#555;font-variant-numeric:tabular-nums;', '-');
        row.append(lbl, el, sub);
        body.append(row);
        qtyInputs.push({ key, nilai: n, el, sub });
      });
    });

    const foot = h('div', 'padding:10px 16px;border-top:1px solid #e5e5e5;background:#fafafa;');
    const totalRow = h('div', 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;');
    totalRow.append(h('div', 'font-weight:600;', 'Total'), totalEl);

    const btnCss = 'border:0;border-radius:6px;padding:8px 14px;cursor:pointer;font-size:14px;font-weight:600;';
    const actions = h('div', 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;');
    const reset = h('button', btnCss + 'background:#eee;color:#444;margin-right:auto;', 'Reset');
    const batal = h('button', btnCss + 'background:#eee;color:#444;', 'Batal');
    const terapkan = h('button', btnCss + 'background:#f5a800;color:#fff;', 'Terapkan');
    [reset, batal, terapkan].forEach((b) => (b.type = 'button'));
    actions.append(reset, batal, terapkan);
    foot.append(totalRow, actions);

    card.append(head, body, foot);
    overlay.append(card);

    const tutup = () => overlay.remove();
    batal.addEventListener('click', tutup);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) tutup(); // klik area gelap = tutup
    });
    reset.addEventListener('click', () => {
      qtyInputs.forEach((q) => (q.el.value = ''));
      hitung();
      if (qtyInputs[0]) qtyInputs[0].el.focus();
    });
    terapkan.addEventListener('click', () => {
      const total = hitung();
      pecahanState.set(input, JSON.parse(JSON.stringify(state)));
      // Isi kolom saldo (hitungan fisik) -> tampil "Rp ...". TIDAK menekan Simpan.
      setSaldo(input, total);
      tutup();
    });

    // Enter = pindah ke kolom berikutnya (cepat saat menghitung); Esc = tutup.
    const urut = qtyInputs.map((q) => q.el);
    overlay.addEventListener('keydown', (e) => {
      e.stopPropagation(); // cegah shortcut ERZAP (mis. F2 = Simpan) saat popup terbuka
      if (e.key === 'F2') e.preventDefault();
      if (e.key === 'Escape') {
        e.preventDefault();
        tutup();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const i = urut.indexOf(e.target);
        if (i >= 0 && i < urut.length - 1) urut[i + 1].focus();
        else terapkan.focus();
      }
    });

    document.body.appendChild(overlay);
    hitung();
    if (qtyInputs[0]) qtyInputs[0].el.focus();
  }

  // Tombol "Edit" dan "X" di kolom Saldo.
  // X   : menyembunyikan SATU BARIS penuh (isi kolom tetap ikut terkirim saat Simpan).
  // Edit: membuka popup hitung pecahan uang; hasilnya diisikan ke kolom saldo baris itu.
  function makeSaldoAksi(input, kasName) {
    const wrap = document.createElement('span');
    wrap.className = SALDO_AKSI_CLASS;
    wrap.style.cssText =
      'position:absolute;right:8px;top:50%;transform:translateY(-50%);display:flex;gap:4px;margin:0;padding:0;line-height:1;';

    // Tombol berupa ikon saja (persegi kecil) supaya ringkas & tetap muat di layar sempit.
    const ICON_EDIT =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/>' +
      '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    const ICON_X =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

    const mk = (iconSvg, title, bg) => {
      const b = document.createElement('button');
      b.type = 'button'; // jangan submit form
      b.innerHTML = iconSvg;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.style.cssText =
        'display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;' +
        'border:0;margin:0;border-radius:4px;cursor:pointer;line-height:1;color:#fff;background:' + bg + ';';
      return b;
    };

    const edit = mk(ICON_EDIT, 'Edit: hitung pecahan uang', '#2d8cf0');
    const hide = mk(ICON_X, 'Sembunyikan baris ini (isi tetap ikut tersimpan)', '#7f8c8d');

    edit.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      bukaPecahan(kasName, input);
    });
    hide.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tr = input.closest('tr');
      tr.style.display = 'none'; // sembunyikan 1 baris penuh
      tr.dataset.tmHidden = '1';
      updatePulihkan(tr.closest('table'));
    });

    if (SETTINGS.fitur.edit) wrap.append(edit);
    if (SETTINGS.fitur.sembunyi) wrap.append(hide);
    return wrap.childNodes.length ? wrap : null;
  }

  function addButtons() {
    const wanted = CONFIG.kasList.map(norm);
    document.querySelectorAll('tr').forEach((tr) => {
      const input = tr.querySelector('input[data-tm-saldo], input[name$="[saldo_hitung]"]');
      if (!input) return;
      if (SETTINGS.fitur.formatRp) setupFormat(input); // format "Rp 1,234" otomatis (aman dipanggil berulang)
      const kasCell = tr.cells[0];

      // 1) Tombol "Lihat saldo sistem" di sel kiri (kolom "Kas"), rata kanan.
      if (bolehFitur(SETTINGS, 'lihatSaldo') && !kasCell.querySelector('.' + BTN_CLASS)) {
        const label = norm(kasCell.textContent);
        if (!wanted.length || wanted.includes(label)) {
          const kasName = kasCell.textContent.trim();
          kasCell.style.position = 'relative'; // acuan posisi; tidak mengubah ukuran sel
          kasCell.appendChild(makeButton(kasName));
        }
      }

      // 2) Tombol "Edit" dan "X" di sel Saldo (kanan), melayang di ujung kanan kolom input.
      const saldoCell = input.closest('td') || input.parentElement;
      if ((SETTINGS.fitur.edit || SETTINGS.fitur.sembunyi) && !saldoCell.querySelector('.' + SALDO_AKSI_CLASS)) {
        saldoCell.style.position = 'relative'; // input TIDAK diubah ukurannya (tombol hanya menumpang di ujung kanan)
        // Nama kas bersih (tanpa teks tombol yang sudah menempel di sel)
        const klon = kasCell.cloneNode(true);
        klon.querySelectorAll('.' + BTN_CLASS).forEach((x) => x.remove());
        const aksi = makeSaldoAksi(input, klon.textContent.trim());
        if (aksi) saldoCell.appendChild(aksi);
      }
    });
  }

  // ===== Pengaturan akses & fitur (dibaca dari AKSES_JSON di atas) =====
  const FITUR_LABEL = {
    lihatSaldo: 'Tombol "Lihat saldo sistem" (kolom Kas)',
    edit: 'Tombol Edit (popup hitung pecahan)',
    sembunyi: 'Tombol X (sembunyikan baris)',
    formatRp: 'Format otomatis "Rp 1,234" di kolom saldo',
  };

  function bacaDefault() {
    let a;
    try {
      a = JSON.parse(AKSES_JSON) || {};
    } catch (err) {
      console.error('[saldokas] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { role: 'tutup', users: [], admin: [], khusus: {}, fitur: { lihatSaldo: false, edit: false, sembunyi: false, formatRp: false } };
    }
    const role = ['public', 'private'].includes(norm(a.role)) ? norm(a.role) : 'tutup';
    const fitur = {};
    const khusus = {};
    Object.keys(FITUR_LABEL).forEach((k) => {
      fitur[k] = !(a.fitur && a.fitur[k] === false);
      // fitur ada di "khusus" = hanya nama di daftar itu (dan admin); daftar kosong = tidak ada yang boleh
      if (a.khusus && Array.isArray(a.khusus[k])) khusus[k] = a.khusus[k].map(String);
    });
    return {
      role,
      users: (a.private && Array.isArray(a.private.users) ? a.private.users : []).map(String),
      admin: Array.isArray(a.admin) ? a.admin.map(String) : [],
      khusus,
      fitur,
    };
  }

  const namaUser = () => norm((document.getElementById('info_kasir') || {}).textContent);
  const cocokNama = (daftar) => daftar.map(norm).filter(Boolean).some((u) => namaUser().includes(u));
  const isAdmin = (S) => cocokNama(S.admin);
  const userBoleh = (S) => isAdmin(S) || S.role === 'public' || (S.role === 'private' && cocokNama(S.users));
  // Fitur menyala DAN user boleh memakainya (fitur "khusus" hanya untuk nama tertentu atau admin)
  const bolehFitur = (S, f) => S.fitur[f] && (!S.khusus[f] || isAdmin(S) || cocokNama(S.khusus[f]));

  SETTINGS = bacaDefault(); // pengaturan hanya dari AKSES_JSON di atas
  if (!userBoleh(SETTINGS)) return; // bukan user yang diizinkan -> script berhenti, tombol fitur tidak muncul

  // Tabel kas dimuat ulang (AJAX) setiap outlet diganti -> pasang tombol lagi.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      addButtons();
    });
  }).observe(document.body, { childList: true, subtree: true });

  addButtons();
})();
