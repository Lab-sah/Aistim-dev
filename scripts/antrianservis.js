// ==UserScript==
// @name         Erzap - Tombol Buat Nota di Lacak Servis
// @namespace    http://tampermonkey.net/
// @version      1.13.5
// @description  Menambah tombol "Buat Nota" di sebelah tombol "Tutup" pada jendela Lacak Servis (jika ada data servis) atau "Buat Member" (jika tidak ada data, membuka form Tambah Pelanggan). Buat Nota mengisi Pelanggan, Serial Number, Nama Barang, Termin = Tunai, Tipe Penjualan = SERVICE, dan Outlet = OTOTECH JOMBANG.
// @match        https://ototech.erzap.com/servis_elektroniks/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini. Nama fitur: buatNota, buatMember.
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua).
  // "role"    -> nama-nama role: "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
  //              cukup sebagian nama; isi nama lengkap persis seperti di ERZAP), "fitur" = fitur private yang boleh dipakai role itu.
  // Fitur yang tidak disebut di "public" maupun "private" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
  // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script dan muat ulang halaman ERZAP.
  const AKSES_JSON = `{
    "public": [],
    "private": ["buatNota", "buatMember"],
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
      console.error('[antrianservis] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { public: [], role: [] };
    }
  }
  const AKSES = bacaAkses();

  // dicek saat dipakai (bukan sekali di awal), karena nama kasir bisa dimuat belakangan.
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

  const BTN_ID = 'tm-buat-nota-btn';
  const BTN_MEMBER_ID = 'tm-buat-member-btn';
  const SEL_CLASS = 'tm-selected-row';
  const PELANGGAN_ID = 'servis_elektronik_nama_pelanggan';
  const SN_ID = 'servis_elektronik_detail1_serial_number';
  let selectedRow = null;

  function isVisible(el) {
    return getComputedStyle(el).display !== 'none';
  }

  // Cari jendela "Lacak Servis" yang sedang tampil
  function findModal() {
    return [...document.querySelectorAll('.modal, [role="dialog"]')].find(
      (m) => isVisible(m) && m.innerText.includes('Lacak Servis')
    ) || null;
  }

  // Tunggu elemen muncul dan terlihat (maksimal maxMs)
  function tungguElemen(id, maxMs) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const cek = () => {
        const el = document.getElementById(id);
        if (el && el.getClientRects().length > 0) return resolve(el);
        if (Date.now() - t0 > maxMs) return resolve(null);
        setTimeout(cek, 200);
      };
      cek();
    });
  }

  // Kode diawali tanggal hari ini (DDMMYY, zona Asia/Jakarta)
  function tanggalKode() {
    const s = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(new Date());
    return s.replace(/\D/g, '');
  }

  // Salin nama ke kolom Pelanggan pada form servis (tanpa memicu pencarian autocomplete)
  function salinNamaKePelanggan(nama) {
    const el = document.getElementById(PELANGGAN_ID);
    if (!el) return;
    const $ = window.jQuery;
    if ($) $(el).val(nama);
    else el.value = nama;
  }

  // Isi Nama pelanggan di form Tambah Pelanggan (tanpa memicu pencarian autocomplete)
  function isiNamaPelanggan(nama) {
    const el = document.getElementById('pelanggan_nama');
    if (!el) return;
    const $ = window.jQuery;
    if ($) {
      const j = $(el);
      j.val(nama).trigger('change');
      if (j.data('ui-autocomplete')) j.autocomplete('close');
    } else {
      el.value = nama;
    }
    salinNamaKePelanggan(nama);
  }

  // Tutup Lacak Servis lalu buka form Tambah Pelanggan (tombol +)
  function bukaTambahPelanggan(modal) {
    // Serial Number di kolom pencarian wajib diisi sebelum Buat Member
    const snInput = modal.querySelector('#pencarian_serial_number') ||
      modal.querySelector('input[name*="serial_number"]');
    const snRaw = snInput ? snInput.value.trim() : '';
    if (!snRaw) {
      alert('Serial Number harus diisi');
      return;
    }
    const snText = snRaw.replace(/\s+/g, '').toUpperCase();
    // Nama pelanggan = teks yang diketik di kolom Pelanggan pada Lacak Servis
    const namaInput = modal.querySelector('#pencarian_nama_pelanggan');
    const namaRaw = namaInput ? namaInput.value.trim() : '';

    const closeBtn = [...modal.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tutup');
    if (closeBtn) closeBtn.click();
    setTimeout(async () => {
      const plus = document.getElementById('tambah_pelanggan');
      if (!plus) {
        alert('Tombol Tambah Pelanggan (+) tidak ditemukan.');
        return;
      }
      plus.click();
      // Termin, Tipe Penjualan, Jenis Servis, dan Outlet servis sudah diset sebelum data disimpan
      jagaPengaturan(6000);
      // Form pelanggan baru: Jenis Pelanggan = ECER, Outlet pelanggan = OTOTECH JOMBANG
      const form = await tungguElemen('pelanggan_idjenis_pelanggan', 5000);
      if (form) {
        pilihOpsi('pelanggan_idjenis_pelanggan', 'ECER');
        // Mengetik Nama di form pelanggan langsung menyalin ke kolom Pelanggan pada form servis
        const namaField = document.getElementById('pelanggan_nama');
        if (namaField && !namaField.dataset.tmMirror) {
          namaField.dataset.tmMirror = '1';
          namaField.addEventListener('input', () => salinNamaKePelanggan(namaField.value.trim()));
        }
        if (namaRaw) isiNamaPelanggan(namaRaw);
        const outlet = document.getElementById('outlet1');
        if (outlet && !outlet.checked) outlet.click();

        // Serial Number di Data Servis = sama dengan yang diinput saat Buat Member
        const snField = document.getElementById('servis_elektronik_detail1_serial_number');
        if (snField) {
          const $ = window.jQuery;
          if ($) {
            $(snField).val(snRaw).trigger('input').trigger('change').trigger('blur');
          } else {
            snField.value = snRaw;
          }
        }

        // Kode pelanggan: Serial Number tanpa spasi + tanggal hari ini (DDMMYY)
        if (snText) {
          const kode = document.getElementById('pelanggan_kode');
          if (kode) {
            kode.value = snText + tanggalKode();
            const $ = window.jQuery;
            if ($) $(kode).trigger('input').trigger('change');
          }
        }
      }
    }, 500);
  }

  function getSnSearchInput(modal) {
    return modal.querySelector('#pencarian_serial_number') ||
      modal.querySelector('input[name*="serial_number"]');
  }

  function bindSearchValidation(modal) {
    if (modal.dataset.tmSearchBound) return;
    modal.dataset.tmSearchBound = '1';

    const tolak = (e, input) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      alert('Serial Number harus diisi');
      if (input) input.focus();
    };

    // Tombol Pencarian (capture: dicek sebelum handler bawaan halaman)
    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.textContent.trim() !== 'Pencarian') return;
      const input = getSnSearchInput(modal);
      if (input && !input.value.trim()) tolak(e, input);
    }, true);

    // Tekan Enter di kolom Serial Number juga dicek
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const input = getSnSearchInput(modal);
      if (input && e.target === input && !input.value.trim()) tolak(e, input);
    }, true);
  }

  // Ambil nilai kolom berdasarkan judul header (Pelanggan, SN, ...)
  // Ambil nilai kolom berdasarkan judul header (Pelanggan, SN, ...). Judul dicocokkan tanpa membedakan
  // huruf besar/kecil dan spasi; kalau tidak persis sama, dipakai judul yang memuat kata tersebut.
  function getCell(row, headerName) {
    const table = row.closest('table');
    if (!table) return '';
    const norm = (x) => x.replace(/\s+/g, ' ').trim().toLowerCase();
    const headers = [...table.querySelectorAll('thead th, thead td')].map((th) => norm(th.innerText));
    const target = norm(headerName);
    let idx = headers.indexOf(target);
    if (idx < 0) idx = headers.findIndex((h) => h.includes(target));
    if (idx < 0) return '';
    const cells = row.querySelectorAll('td');
    return cells[idx] ? cells[idx].innerText.trim() : '';
  }

  // Klik baris tabel untuk memilih servis (klik link di dalam baris tidak mengubah pilihan)
  function bindRowSelection(modal) {
    if (modal.dataset.tmBound) return;
    modal.dataset.tmBound = '1';
    modal.addEventListener('click', (e) => {
      const tr = e.target.closest('tbody tr');
      if (!tr || !modal.contains(tr) || e.target.closest('a')) return;
      modal.querySelectorAll('.' + SEL_CLASS).forEach((r) => r.classList.remove(SEL_CLASS));
      tr.classList.add(SEL_CLASS);
      selectedRow = tr;
    });
  }

  // Ambil nilai kolom dari daftar kemungkinan judul (urutan prioritas)
  function getCellAny(row, names) {
    for (const n of names) {
      const v = getCell(row, n);
      if (v) return v;
    }
    return '';
  }

  // Isi Pelanggan lewat autocomplete bawaan form (jQuery UI). Kalau autocomplete belum siap, ditunggu dulu.
  // Kalau nama tidak ditemukan di hasil autocomplete, nilainya tetap diisi langsung.
  async function isiPelanggan(nama) {
    const $ = window.jQuery;
    const el = $ ? $('#' + PELANGGAN_ID) : null;
    if (!el || !el.length) return false;

    const t0 = Date.now();
    while (!el.data('ui-autocomplete') && Date.now() - t0 < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!el.data('ui-autocomplete')) {
      el.val(nama).trigger('change');
      return true;
    }

    const opt = el.autocomplete('option');
    el.val('');
    const items = await new Promise((resolve) => {
      let selesai = false;
      const fin = (list) => {
        if (selesai) return;
        selesai = true;
        resolve(Array.isArray(list) ? list : []);
      };
      try { opt.source({ term: nama }, fin); } catch (err) { fin([]); }
      setTimeout(() => fin([]), 3000);
    });

    const target = nama.trim().toUpperCase();
    const item = items.find((i) => (i.nama || '').toUpperCase() === target) || items[0];
    if (item) {
      el.val(item.nama);
      if (typeof opt.select === 'function') opt.select.call(el[0], null, { item });
    } else {
      el.val(nama).trigger('change');
    }
    el.autocomplete('close');
    return true;
  }

  // Isi Serial Number dan picu event supaya form ikut membaca nilainya
  function isiSerialNumber(sn) {
    const $ = window.jQuery;
    const el = $ ? $('#' + SN_ID) : null;
    if (el && el.length) {
      el.val(sn);
      el.trigger('input').trigger('change').trigger('blur');
    } else {
      const input = document.getElementById(SN_ID);
      if (!input) return false;
      input.value = sn;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  // Pilih opsi dropdown berdasarkan teks (Tunai, SERVICE, ...)
  function pilihOpsi(selectId, teks) {
    const $ = window.jQuery;
    const sel = document.getElementById(selectId);
    if (!sel) return false;
    const opt = [...sel.options].find((o) => o.text.trim().toUpperCase() === teks.toUpperCase());
    if (!opt) return false;
    if ($) {
      $(sel).val(opt.value).trigger('change');
    } else {
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return sel.value === opt.value;
  }

  // Cek apakah dropdown sudah memilih teks yang diminta
  function cekOpsi(selectId, teks) {
    const sel = document.getElementById(selectId);
    if (!sel || sel.selectedIndex < 0) return false;
    return sel.options[sel.selectedIndex].text.trim().toUpperCase() === teks.toUpperCase();
  }

  // Pilih opsi hanya jika belum terpilih (hindari trigger change berulang)
  function pastikanOpsi(selectId, teks) {
    if (cekOpsi(selectId, teks)) return true;
    return pilihOpsi(selectId, teks);
  }

  let timerJaga = null;

  // Termin, Tipe Penjualan, Jenis Servis, dan Outlet kadang di-reset oleh form
  // setelah Pelanggan terpilih (lewat ajax). Pantau dan pasang ulang selama durasiMs.
  function jagaPengaturan(durasiMs) {
    if (timerJaga) clearInterval(timerJaga);
    const t0 = Date.now();
    const terapkan = () => {
      pastikanOpsi('servis_elektronik_idtermin', 'Tunai');
      pastikanOpsi('servis_elektronik_idtipe_penjualan', 'SERVICE');
      const rawat = document.getElementById('servis_elektronik_is_rawat_inap_true');
      if (rawat && !rawat.checked) rawat.click();
      pastikanOpsi('servis_elektronik_idoutlet_own', 'OTOTECH JOMBANG');
    };
    terapkan();
    timerJaga = setInterval(() => {
      terapkan();
      if (Date.now() - t0 > durasiMs) {
        clearInterval(timerJaga);
        timerJaga = null;
      }
    }, 300);
  }

  // Ambil nama unit dari halaman nota servis (kolom Unit pada tabel, dicocokkan dengan SN)
  async function ambilUnitDariRow(row, sn) {
    // Nota bisa berupa nota_penerimaan (tanda terima) atau nota_tutup_servis
    const link = row.querySelector('a[href*="/nota_"]');
    if (!link) return getCellAny(row, ['Unit', 'Nama Barang', 'Barang']);
    const html = await (await fetch(link.getAttribute('href'), { credentials: 'same-origin' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const target = (sn || '').replace(/\s+/g, '').toUpperCase();
    for (const t of doc.querySelectorAll('table')) {
      const headers = [...t.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td')].map((h) => h.textContent.trim().toUpperCase());
      const iUnit = headers.findIndex((h) => h === 'UNIT' || h === 'NAMA BARANG');
      const iSn = headers.findIndex((h) => h === 'SN' || h === 'SERIAL NUMBER');
      if (iUnit < 0 || iSn < 0) continue;
      const rows = [...t.querySelectorAll('tbody tr')];
      const match = rows.find((r) => {
        const c = r.querySelectorAll('td');
        return c[iSn] && c[iSn].textContent.replace(/\s+/g, '').toUpperCase() === target;
      }) || rows[0];
      if (!match) return '';
      const c = match.querySelectorAll('td');
      return c[iUnit] ? c[iUnit].textContent.trim() : '';
    }
    return '';
  }

  // Isi Nama Barang (unit) di form
  function isiNamaBarang(unit) {
    const $ = window.jQuery;
    const el = $ ? $('#servis_elektronik_detail1_unit') : null;
    if (!el || !el.length) return false;
    el.val(unit);
    el.trigger('change');
    if (el.data('ui-autocomplete')) el.autocomplete('close');
    return true;
  }

  // Tunggu sampai tidak ada request ajax yang berjalan (maksimal 5 detik)
  function tungguAjax() {
    const $ = window.jQuery;
    return new Promise((resolve) => {
      let selesai = false;
      const fin = () => {
        if (selesai) return;
        selesai = true;
        setTimeout(resolve, 400);
      };
      if (!$ || !$.active) return fin();
      $(document).one('ajaxStop', fin);
      setTimeout(fin, 5000);
    });
  }

  async function buatNota(modal) {
    let row = selectedRow && selectedRow.isConnected && modal.contains(selectedRow) ? selectedRow : null;
    if (!row) {
      const rows = modal.querySelectorAll('tbody tr');
      if (rows.length === 1) row = rows[0];
    }
    if (!row) {
      alert('Pilih dulu satu baris servis di tabel.');
      return;
    }

    const namaCari = modal.querySelector('#pencarian_nama_pelanggan');
    const pelanggan = getCellAny(row, ['Pelanggan', 'Nama Pelanggan', 'Nama']) ||
      (namaCari ? namaCari.value.trim() : '');
    const sn = getCellAny(row, ['SN', 'Serial Number', 'Serial No', 'No Seri']);

    // Tutup jendela Lacak Servis dulu
    const closeBtn = [...modal.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tutup');
    if (closeBtn) closeBtn.click();

    const okPelanggan = pelanggan ? await isiPelanggan(pelanggan) : false;
    const okSn = sn ? isiSerialNumber(sn) : false;
    let okUnit = false;
    try {
      const unit = await ambilUnitDariRow(row, sn);
      okUnit = unit ? isiNamaBarang(unit) : false;
    } catch (err) {
      okUnit = false;
    }
    const okTermin = pilihOpsi('servis_elektronik_idtermin', 'Tunai');
    const okTipe = pilihOpsi('servis_elektronik_idtipe_penjualan', 'SERVICE');

    // Outlet diisi terakhir, setelah semua ajax dari Pelanggan selesai, karena bisa ter-reset oleh halaman
    await tungguAjax();
    let okOutlet = pilihOpsi('servis_elektronik_idoutlet_own', 'OTOTECH JOMBANG');
    if (okOutlet) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      okOutlet = pilihOpsi('servis_elektronik_idoutlet_own', 'OTOTECH JOMBANG');
    }

    if (!okPelanggan || !okSn || !okUnit || !okTermin || !okTipe || !okOutlet) {
      alert(
        'Sebagian data belum terisi. Pelanggan: ' + (okPelanggan ? 'OK' : 'gagal') +
        ', Serial Number: ' + (okSn ? 'OK' : 'gagal') +
        ', Nama Barang: ' + (okUnit ? 'OK' : 'gagal') +
        ', Termin: ' + (okTermin ? 'OK' : 'gagal') +
        ', Tipe Penjualan: ' + (okTipe ? 'OK' : 'gagal') +
        ', Outlet: ' + (okOutlet ? 'OK' : 'gagal')
      );
    }
  }

  function makeButton(id, label, closeBtn, color, onClick) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.type = 'button';
    btn.textContent = label;
    btn.className = closeBtn.className;
    btn.style.marginLeft = '8px';
    btn.style.background = color;
    btn.style.borderColor = color;
    btn.style.color = '#fff';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      onClick();
    });
    closeBtn.insertAdjacentElement('afterend', btn);
  }

  function ensureButton() {
    const modal = findModal();
    if (!modal) return;
    bindRowSelection(modal);
    bindSearchValidation(modal);

    const closeBtn = [...modal.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Tutup'
    );
    if (!closeBtn) return;

    // Ada data servis: tampilkan Buat Nota. Tidak ada: tampilkan Buat Member.
    const adaData = modal.querySelectorAll('table tbody tr').length > 0;
    const btnNota = modal.querySelector('#' + BTN_ID);
    const btnMember = modal.querySelector('#' + BTN_MEMBER_ID);

    if (adaData) {
      if (btnMember) btnMember.remove();
      if (!btnNota && bolehFitur('buatNota')) {
        makeButton(BTN_ID, 'Buat Nota', closeBtn, '#28a745', () => buatNota(modal));
      }
    } else {
      if (btnNota) btnNota.remove();
      if (!btnMember && bolehFitur('buatMember')) {
        makeButton(BTN_MEMBER_ID, 'Buat Member', closeBtn, '#0d6efd', () => bukaTambahPelanggan(modal));
      }
    }
  }

  // Highlight untuk baris yang dipilih
  const style = document.createElement('style');
  style.textContent = '.' + SEL_CLASS + ' td { background: #fff3b0 !important; }';
  document.head.appendChild(style);

  const observer = new MutationObserver(ensureButton);
  observer.observe(document.body, { childList: true, subtree: true });
  ensureButton();
})();
