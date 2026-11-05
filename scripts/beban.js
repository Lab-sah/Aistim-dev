// ==UserScript==
// @name         ERZAP - Beban Trans
// @namespace    http://tampermonkey.net/
// @version      1.2.2
// @description  Halaman Transaksi Beban, Kas Masuk, dan Kas Keluar: tabel Informasi Saldo Kas/Bank (saldo sebelum dan sesudah dipotong beban, di form Beban baru); kolom Jumlah / Nominal berformat "Rp 25,000" (angka polos yang dikirim ke server, boleh .00) dan Keterangan wajib diisi sebelum Simpan (Simpan, F2, dan submit diblokir bila ada baris berjumlah yang Keterangan-nya kosong). Fitur diatur lewat AKSES_JSON (public/private/role).
// @match        https://*.erzap.com/jurnals/transaksi_beban*
// @match        https://*.erzap.com/jurnals/form_transaksi_kas_masuk*
// @match        https://*.erzap.com/jurnals/form_transaksi_kas_keluar*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @run-at       document-idle
// @world        main
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__erzapBebanInit) return;
  window.__erzapBebanInit = true;

  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini. Nama fitur: formatJumlah (kolom Jumlah/Nominal), wajibKeterangan, infoSaldo (tabel Informasi Saldo Kas/Bank di form Beban baru).
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua).
  // "role"    -> nama-nama role: "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
  //              cukup sebagian nama; isi nama lengkap persis seperti di ERZAP), "fitur" = fitur private yang boleh dipakai role itu.
  // Fitur yang tidak disebut di "public" maupun "private" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
  // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script dan muat ulang halaman ERZAP.
  const AKSES_JSON = `{
    "public": ["formatJumlah", "wajibKeterangan", "infoSaldo"],
    "private": [],
    "role": {
      "pusat": {
        "nama": ["SENTOT", "SURYO", "MANAJEMEN PUSAT"],
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
      console.error('[beban] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { public: [], role: [] };
    }
  }
  const AKSES = bacaAkses();

  // dicek saat dipakai (bukan sekali di awal), karena nama kasir di pojok ERZAP bisa dimuat belakangan.
  // Role dicocokkan urut dari atas; role pertama yang namanya cocok yang menentukan.
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

  /* ========== 1. Format Rp kolom Jumlah (seperti Nominal Transfer, izinkan .00) ========== */
  (function () {
    // Kolom Jumlah per baris (Transaksi Beban) dan kolom Nominal (Kas Masuk / Kas Keluar)
    const SEL = 'input[id^="jurnal_detail"][id$="_debit"], #jurnal_nominal';
    const isJ = t => !!(t && t.matches && t.matches(SEL));
    const aktif = () => bolehFitur('formatJumlah');
    const hiddenOf = el => { const h = el.nextElementSibling; return h && h.classList.contains('rp_raw_jumlah') ? h : null; };

    // Pecah teks menjadi bagian bulat (ip) dan desimal (dp, null jika tidak ada titik)
    function parts(text) {
      const t = String(text == null ? '' : text).replace(/Rp/gi, '').replace(/\s+/g, '').replace(/,/g, '');
      const i = t.indexOf('.');
      const ip = (i >= 0 ? t.slice(0, i) : t).replace(/\D/g, '').slice(0, 15); // 15 digit: aman dari pembulatan parseInt
      const dp = i >= 0 ? t.slice(i + 1).replace(/\D/g, '').slice(0, 2) : null;
      return { ip, dp };
    }
    // Tampilan: "Rp 25,000" / "Rp 25,000." / "Rp 25,000.00"
    function fmt(p) {
      if (p.ip === '' && (p.dp === null || p.dp === '')) return '';
      const ip = p.ip === '' ? '0' : String(parseInt(p.ip, 10));
      let s = 'Rp ' + ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      if (p.dp !== null) s += '.' + p.dp;
      return s;
    }
    // Angka mentah yang dikirim ke server: "25000" atau "25000.00"
    function raw(p) {
      if (p.ip === '' && (p.dp === null || p.dp === '')) return '';
      const ip = p.ip === '' ? '0' : String(parseInt(p.ip, 10));
      return (p.dp !== null && p.dp !== '') ? ip + '.' + p.dp : ip;
    }
    function caretEnd(el) { const n = el.value.length; try { el.setSelectionRange(n, n); } catch (_) {} }

    // Nama field yang dikirim ke server. Diambil dari name asli input (apa pun polanya), lalu pola itu dipakai
    // untuk baris baru yang name-nya sudah dicopot. Cadangan terakhir: jurnal_detailN[debit].
    let polaNama = null; // mis. "jurnal_detail{n}[debit]"
    const nomorBaris = el => (el.id.match(/^jurnal_detail(\d+)_debit$/) || [])[1] || '';
    function namaHidden(el) {
      const n = nomorBaris(el);
      const asli = el.getAttribute('name');
      if (asli) {
        if (n) polaNama = asli.replace(new RegExp('(?<![0-9])' + n + '(?![0-9])'), '{n}');
        return asli;
      }
      if (polaNama && n && polaNama.indexOf('{n}') !== -1) return polaNama.replace('{n}', n);
      return el.id.replace(/^(jurnal_detail\d+)_debit$/, '$1[debit]');
    }

    // Ganti input tampilan (tanpa name) dengan hidden berisi angka mentah yang ikut dikirim ke server
    function setup(el) {
      const ada = hiddenOf(el);
      if (ada) {
        // Baris hasil salinan baris lain: hidden ikut tersalin dengan name baris asal, samakan dengan baris ini.
        // Hanya untuk baris bernomor dan bila polanya sudah dipelajari; name yang sudah benar tidak disentuh.
        const n = nomorBaris(el);
        if (!el.getAttribute('name') && n && polaNama && polaNama.indexOf('{n}') !== -1) {
          const nm = polaNama.replace('{n}', n);
          if (ada.name !== nm) ada.name = nm;
        }
        return;
      }
      const p = parts(el.value);
      const h = document.createElement('input');
      h.type = 'hidden';
      h.className = 'rp_raw_jumlah';
      h.name = namaHidden(el);
      h.value = raw(p);
      el.removeAttribute('name');
      el.after(h);
      el.value = fmt(p);
    }
    function scan() { if (aktif()) document.querySelectorAll(SEL).forEach(setup); }
    function syncOne(el) { const h = hiddenOf(el); if (h) h.value = raw(parts(el.value)); }
    function syncAll() { if (aktif()) document.querySelectorAll(SEL).forEach(syncOne); }

    // Saat mengetik: format langsung
    document.addEventListener('input', e => {
      if (!isJ(e.target) || !aktif()) return;
      const el = e.target, h = hiddenOf(el); if (!h) return;
      const p = parts(el.value);
      h.value = raw(p);
      el.value = fmt(p);
      caretEnd(el);
    }, true);
    // Saat diklik/fokus: tampil format Rp, kursor di akhir
    document.addEventListener('focusin', e => {
      if (!isJ(e.target) || !aktif()) return;
      const el = e.target, h = hiddenOf(el); if (!h) return;
      // Dibaca dari kolom tampilan (bukan hidden), supaya nilai yang baru diisi script halaman tidak tertimpa nilai lama
      const p = parts(el.value);
      h.value = raw(p);
      el.value = fmt(p);
      setTimeout(() => caretEnd(el), 0);
    }, true);
    // Saat keluar fokus: titik tanpa angka dibuang, lalu simpan angka mentah
    document.addEventListener('focusout', e => {
      if (!isJ(e.target) || !aktif()) return;
      const el = e.target, h = hiddenOf(el); if (!h) return;
      const p = parts(el.value);
      if (p.dp === '') p.dp = null;
      h.value = raw(p);
      el.value = fmt(p);
    }, true);
    ['pointerdown', 'keydown', 'submit'].forEach(t => document.addEventListener(t, syncAll, true));
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });

    // Agar perhitungan PPN/PPh/total dan validasi jQuery tetap membaca angka mentah
    // (script ini jalan di @world main, jadi jQuery milik halaman bisa diakses).
    // Kalau jQuery halaman baru termuat belakangan, dicoba lagi tiap 300 ms (maks. 15 detik).
    let hookTerpasang = false;
    function pasangHook() {
      const jq = window.jQuery;
      if (hookTerpasang || !jq || !jq.valHooks) return hookTerpasang;
      hookTerpasang = true;
      jq.valHooks.text = jq.valHooks.text || {};
      const prev = jq.valHooks.text.get;
      jq.valHooks.text.get = function (elem, name) {
        if (isJ(elem) && aktif()) return raw(parts(elem.value));
        return prev ? prev.call(this, elem, name) : undefined;
      };
      return true;
    }
    if (!pasangHook()) {
      let coba = 0;
      const iv = setInterval(() => { if (pasangHook() || ++coba > 50) clearInterval(iv); }, 300);
    }
    scan();
  })();

  /* ========== 2. Wajib Keterangan sebelum Simpan ========== */
  (function () {
    const DEBIT_SEL = 'input[id^="jurnal_detail"][id$="_debit"]';
    const SAVE_SEL = '#bt_simpan, #simpan, #simpan_disable, #image_simpan, [title="Simpan"]';
    const aktif = () => bolehFitur('wajibKeterangan');

    // Baris yang Jumlah-nya terisi (selain 0) tetapi Keterangan-nya kosong
    function missingRows() {
      const out = [];
      if (!aktif()) return out;
      document.querySelectorAll(DEBIT_SEL).forEach(d => {
        const n = d.id.replace(/^jurnal_detail(\d+)_debit$/, '$1');
        const cleaned = String(d.value || '').replace(/Rp/gi, '').replace(/\s+/g, '').replace(/,/g, '');
        const num = parseFloat(cleaned);
        const filled = cleaned !== '' && !isNaN(num) && num !== 0;
        const ket = document.getElementById('jurnal_detail' + n + '_keterangan');
        if (filled && ket && ket.value.trim() === '') out.push({ n, ket });
      });
      return out;
    }

    // Peringatan di bawah tabel yang memuat kolom Jumlah. Null bila halaman belum punya kolom itu
    // (tidak membuat elemen yang tidak pernah dipasang).
    function warnEl() {
      let w = document.getElementById('ket_guard_warn');
      if (w) return w;
      const d = document.querySelector(DEBIT_SEL);
      const tabel = d && d.closest('table');
      if (!tabel) return null;
      w = document.createElement('div');
      w.id = 'ket_guard_warn';
      w.setAttribute('role', 'alert');
      w.style.cssText = 'display:none;margin:8px 0;padding:8px 12px;border:1px solid #f5c2c7;background:#f8d7da;color:#842029;border-radius:4px;font-size:14px;';
      tabel.insertAdjacentElement('afterend', w);
      return w;
    }

    function refresh() {
      const miss = missingRows();
      const w = miss.length ? warnEl() : document.getElementById('ket_guard_warn');
      const bt = document.getElementById('bt_simpan');
      const icon = document.getElementById('image_simpan');
      if (miss.length && w) {
        const msg = 'Isi keterangan biar bisa disimpan (baris ' + miss.map(m => m.n).join(', ') + ')';
        if (w.dataset.msg !== msg) {
          w.dataset.msg = msg;
          w.textContent = '';
          const ic = document.createElement('i');
          ic.className = 'fa fa-exclamation-triangle';
          ic.style.marginRight = '6px';
          w.appendChild(ic);
          w.appendChild(document.createTextNode(msg));
        }
        w.style.display = 'block';
      } else if (w) {
        w.style.display = 'none';
      }
      const dim = miss.length ? '0.4' : '';
      if (bt) { bt.style.opacity = dim; bt.style.cursor = miss.length ? 'not-allowed' : ''; }
      if (icon) { icon.style.opacity = dim; }
      document.querySelectorAll('input[id^="jurnal_detail"][id$="_keterangan"]').forEach(k => {
        k.style.borderColor = miss.some(m => m.ket === k) ? '#dc3545' : '';
      });
      return miss;
    }

    // Blokir Simpan (klik ikon/tombol, F2, submit) bila ada Keterangan kosong
    function block(e) {
      const miss = missingRows();
      if (!miss.length) return;
      e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
      refresh();
      miss[0].ket.focus();
    }
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest(SAVE_SEL)) block(e); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'F2' || e.keyCode === 113) block(e); }, true);
    // Hanya form yang memuat kolom Jumlah (form lain di halaman, mis. pencarian, tidak ikut tertahan)
    document.addEventListener('submit', e => {
      const f = e.target;
      if (f && f.querySelector && f.querySelector(DEBIT_SEL)) block(e);
    }, true);
    ['input', 'focusout', 'keyup', 'change'].forEach(t => document.addEventListener(t, refresh, true));
    new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
    refresh();
  })();

  /* ========== 3. Informasi Saldo Kas/Bank (form Beban baru) ========== */
  // Tabel "Informasi Saldo Kas/Bank" di kiri kotak DPP: saldo Kas/Bank asal sebelum dan sesudah dipotong beban.
  // Saldo diambil dari /perkiraans/saldo_perkiraan_per_outlet/new, total dari "Total Pembayaran" di kotak DPP.
  (function () {
    if (!/\/jurnals\/transaksi_beban(\/|$|\?)/.test(location.pathname)) return;
    const aktif = () => bolehFitur('infoSaldo');
    const WRAP_ID = 'info-saldo-kas-bank';
    const STYLE_ID = 'info-saldo-kas-bank-style';

    const fmtRp = n => 'Rp ' + (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const num = t => parseFloat(String(t).replace(/Rp/g, '').replace(/,/g, '').trim()) || 0;

    function addStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent =
        '#' + WRAP_ID + ' { width: 100%; overflow-x: auto; }' +
        '#' + WRAP_ID + ' .isk-title { font-size: 1.1rem; margin-bottom: 6px; color: #555; }' +
        '#' + WRAP_ID + ' table { width: 100%; border-collapse: collapse; border: 1px solid #bbb; background: #fff; }' +
        '#' + WRAP_ID + ' th, #' + WRAP_ID + ' td { border: 1px solid #bbb; padding: 5px 8px; line-height: 1.3; white-space: nowrap; }' +
        '#' + WRAP_ID + ' th { background: #ececec; font-weight: bold; text-align: left; }' +
        '@media (max-width: 767px) {' +
        '  #' + WRAP_ID + ' .isk-title { font-size: 1rem; }' +
        '  #' + WRAP_ID + ' table { font-size: 0.85rem; }' +
        '}';
      document.head.appendChild(st);
    }

    function findHost() {
      const box = document.querySelector('.box_highlight');
      if (!box || !box.parentElement) return null;
      return box.parentElement.querySelector(':scope > .field.flex-grow-1');
    }

    function build(host) {
      const old = document.getElementById(WRAP_ID);
      if (old) old.remove();
      const wrap = document.createElement('div');
      wrap.id = WRAP_ID;
      const title = document.createElement('div');
      title.className = 'isk-title';
      title.textContent = 'Informasi Saldo Kas/Bank';
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      ['', 'Sebelum', 'Sesudah dipotong beban'].forEach(t => {
        const th = document.createElement('th');
        th.textContent = t;
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      const tbody = document.createElement('tbody');
      const tr = document.createElement('tr');
      const label = document.createElement('td');
      label.textContent = 'Kas/Bank (Asal)';
      const sebelum = document.createElement('td');
      sebelum.textContent = '-';
      const sesudah = document.createElement('td');
      sesudah.textContent = '-';
      tr.appendChild(label);
      tr.appendChild(sebelum);
      tr.appendChild(sesudah);
      tbody.appendChild(tr);
      table.appendChild(thead);
      table.appendChild(tbody);
      wrap.appendChild(title);
      wrap.appendChild(table);
      host.appendChild(wrap);
      return { wrap: wrap, label: label, sebelum: sebelum, sesudah: sesudah };
    }

    function bacaForm() {
      const o = document.getElementById('jurnal_idoutlet_own');
      const k = document.getElementById('jurnal_idperkiraan_kas_bank');
      const t = document.getElementById('jurnal_tanggal');
      const tot = Array.prototype.find.call(
        document.querySelectorAll('.box_highlight .field3'),
        d => d.textContent.indexOf('Total Pembayaran') !== -1
      );
      return {
        outlet: o ? o.value : '',
        kas: k ? k.value : '',
        kasName: k && k.selectedIndex >= 0 ? k.options[k.selectedIndex].text.trim() : '',
        tanggal: t ? t.value : '',
        total: tot ? num(tot.textContent.replace('Total Pembayaran', '')) : 0
      };
    }

    function mulai(ui) {
      let reqId = 0;
      let lastKey = null;
      const kosong = () => {
        ui.sebelum.textContent = '-';
        ui.sesudah.textContent = '-';
        ui.sesudah.style.color = '';
        ui.sesudah.style.fontWeight = '';
      };

      function update() {
        const f = bacaForm();
        const generik = !f.kasName || /Tentukan|Please|Silakan/i.test(f.kasName);
        ui.label.textContent = (generik ? 'Kas/Bank' : f.kasName) + ' (Asal)';
        if (!f.outlet || !f.kas) { kosong(); return; }

        // Tanggal di form: DD-MM-YYYY (kalau sudah YYYY-MM-DD dipakai apa adanya)
        const bagian = f.tanggal.split('-');
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(f.tanggal) ? f.tanggal : (bagian.length === 3 ? bagian[2] + '-' + bagian[1] + '-' + bagian[0] : '');
        const id = ++reqId;
        const url = '/perkiraans/saldo_perkiraan_per_outlet/new?idperkiraan=' + encodeURIComponent(f.kas) +
          '&tanggal=' + encodeURIComponent(iso) +
          '&idoutlet_own=' + encodeURIComponent(f.outlet) + '&idkasir=';

        fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'text/html, */*; q=0.01' } })
          .then(res => res.text())
          .then(txt => {
            if (id !== reqId) return;
            // "1,500,000.00" (koma ribuan) dibaca utuh, bukan terpotong di koma pertama
            let teksSaldo = String(txt).trim();
            if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(teksSaldo)) teksSaldo = teksSaldo.replace(/,/g, '');
            const saldo = parseFloat(teksSaldo);
            if (isNaN(saldo)) { kosong(); return; }
            const sesudah = saldo - f.total;
            ui.sebelum.textContent = fmtRp(saldo);
            ui.sesudah.textContent = fmtRp(sesudah);
            ui.sesudah.style.color = sesudah < 0 ? '#b00020' : '';
            ui.sesudah.style.fontWeight = sesudah < 0 ? 'bold' : 'normal';
          })
          .catch(() => { if (id === reqId) kosong(); });
      }

      const kunci = () => { const f = bacaForm(); return [f.outlet, f.kas, f.tanggal, f.total].join('|'); };
      ['jurnal_idoutlet_own', 'jurnal_idperkiraan_kas_bank', 'jurnal_tanggal'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.iskTerpasang) {
          el.dataset.iskTerpasang = '1';
          // memakai tabel yang sedang aktif (ui bisa diganti saat tabel dibangun ulang)
          el.addEventListener('change', () => { if (aktif() && ui.wrap.isConnected) update(); });
          el.addEventListener('blur', () => { if (aktif() && ui.wrap.isConnected) update(); });
        }
      });
      // Dicek tiap detik: total berubah saat Jumlah diketik. Kalau tabelnya hilang (halaman menggambar ulang
      // area itu), pencarian tempat dipasang diulang dari awal.
      const iv = setInterval(() => {
        if (!document.body.contains(ui.wrap)) { clearInterval(iv); pasang(); return; }
        if (!aktif()) return;
        const k = kunci();
        if (k !== lastKey) { lastKey = k; update(); }
      }, 1000);
      lastKey = kunci();
      update();
    }

    // Menunggu kotak DPP muncul (maks. 30 detik), lalu pasang tabelnya
    function pasang() {
      let coba = 0;
      const timer = setInterval(() => {
        coba++;
        if (!aktif()) { if (coba > 60) clearInterval(timer); return; }
        const host = findHost();
        if (host) {
          clearInterval(timer);
          addStyle();
          mulai(build(host));
        } else if (coba > 60) {
          clearInterval(timer);
        }
      }, 500);
    }
    pasang();
  })();
})();
