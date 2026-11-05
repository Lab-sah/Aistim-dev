// ==UserScript==
// @name         Erzap - Tombol Buat Nota di Lacak Servis
// @namespace    http://tampermonkey.net/
// @version      1.13.32
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

  // Cari jendela "Lacak Servis" yang sedang tampil.
  // Memakai textContent (bukan innerText) agar tidak memaksa reflow setiap ada perubahan DOM.
  function findModal() {
    return [...document.querySelectorAll('.modal, [role="dialog"]')].find(
      (m) => isVisible(m) && m.textContent.includes('Lacak Servis')
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
        const snField = document.getElementById(SN_ID);
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

  function normHeader(x) {
    return (x || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // Ambil daftar judul kolom untuk baris ini. Judul bisa ada di <thead> tabel yang sama, atau di tabel
  // header terpisah (tabel dengan scroll horizontal) sehingga dicari juga di dalam jendela Lacak Servis.
  // Yang dipilih adalah baris judul yang jumlah kolomnya sama dengan jumlah sel pada baris data.
  function getHeaders(row) {
    const nCell = row.querySelectorAll('td').length;
    const table = row.closest('table');
    const scope = row.closest('.modal, [role="dialog"]') || document;
    const cari = (root) => [...root.querySelectorAll('thead tr')].find(
      (tr) => tr.querySelectorAll('th, td').length === nCell
    );
    let tr = (table && cari(table)) || cari(scope) || scope.querySelector('thead tr');
    if (!tr) return [];
    return [...tr.querySelectorAll('th, td')].map((th) => normHeader(th.innerText || th.textContent));
  }

  // Ambil nilai kolom berdasarkan judul header (Pelanggan, SN, ...). Judul dicocokkan tanpa membedakan
  // huruf besar/kecil dan spasi; kalau tidak persis sama, dipakai judul yang memuat kata tersebut.
  function getCell(row, headerName) {
    const headers = getHeaders(row);
    const target = normHeader(headerName);
    let idx = headers.indexOf(target);
    if (idx < 0) idx = headers.findIndex((h) => h.includes(target));
    if (idx < 0) return '';
    const cells = row.querySelectorAll('td');
    if (!cells[idx]) return '';
    return (cells[idx].innerText || cells[idx].textContent || '').trim();
  }

  // Isi kolom pencarian di atas jendela Lacak Servis dari baris yang dipilih:
  // Pelanggan, Kode Servis, Serial Number dari tabel; Nama Barang (dan SN bila kosong) dari nota.
  async function isiPencarianDariBaris(modal, tr) {
    const isi = (pilihan, val) => {
      if (!val) return;
      for (const q of pilihan) {
        const el = modal.querySelector(q);
        if (!el) continue;
        const $ = window.jQuery;
        if ($) $(el).val(val); else el.value = val;
        return;
      }
    };
    const pelanggan = getCellAny(tr, ['Pelanggan', 'Nama Pelanggan', 'Nama']) || cellText(tr, 2);
    const kode = getCellAny(tr, ['Kode Servis', 'Kode']) || cellText(tr, 1);
    let sn = getCellAny(tr, ['SN', 'Serial Number', 'Serial No', 'No Seri']) || cellText(tr, 3);
    isi(['#pencarian_nama_pelanggan', 'input[name="pencarian[nama_pelanggan]"]'], pelanggan);
    isi(['#pencarian_kode', 'input[name="pencarian[kode]"]'], kode);
    isi(['#pencarian_serial_number', 'input[name="pencarian[serial_number]"]'], sn);
    try {
      const info = await ambilDariNota(tr, sn);
      tampilKontak(modal, info.kontak);
      isi(['#pencarian_unit', 'input[name="pencarian[unit]"]'], info.unit);
      if (!sn && info.sn) isi(['#pencarian_serial_number', 'input[name="pencarian[serial_number]"]'], info.sn);
    } catch (err) { /* nama barang tetap kosong */ }
  }

  // Hasil pencarian yang baru muncul: baris pertama langsung dipilih (sama seperti diklik),
  // supaya kolom pencarian dan telp/alamat ikut terisi. Satu kali per hasil yang sama.
  function autoPilihBaris(modal) {
    const tr = modal.querySelector('tbody tr');
    if (!tr || tr.querySelectorAll('td').length < 3) return;
    const sig = tr.textContent.replace(/\s+/g, ' ').trim();
    if (!sig || modal.dataset.tmAutoSig === sig) return;
    modal.dataset.tmAutoSig = sig;
    tr.click();
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
      isiPencarianDariBaris(modal, tr);
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
  // Nama diambil dari kolom Pelanggan di tabel Lacak Servis. Kalau persis sama dengan hasil autocomplete,
  // dipilih lewat autocomplete (id pelanggan ikut terisi). Kalau tidak, nama tetap diisi sebagai teks.
  async function isiPelanggan(nama) {
    const $ = window.jQuery;
    const el = $ ? $('#' + PELANGGAN_ID) : null;
    if (!el || !el.length) return false;

    const t0 = Date.now();
    while (!el.data('ui-autocomplete') && Date.now() - t0 < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    // Instance widget (bukan opsi). Fungsi source ada di instance: inst.source
    const inst = el.data('ui-autocomplete');
    if (!inst) {
      el.val(nama).trigger('change');
      return true;
    }

    el.val('');
    const items = await new Promise((resolve) => {
      let selesai = false;
      const fin = (list) => {
        if (selesai) return;
        selesai = true;
        resolve(Array.isArray(list) ? list : []);
      };
      try { inst.source.call(inst, { term: nama }, fin); } catch (err) { fin([]); }
      setTimeout(() => fin([]), 3000);
    });

    const target = nama.trim().toUpperCase();
    const item = items.find((i) => (i.nama || '').trim().toUpperCase() === target);
    if (item) {
      el.val(item.nama);
      // Jalankan event select bawaan autocomplete supaya id pelanggan ikut terisi
      if (typeof inst._trigger === 'function') inst._trigger('select', null, { item });
      else if (inst.options && typeof inst.options.select === 'function') inst.options.select.call(el[0], null, { item });
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

  // Telp dan alamat pelanggan dari blok "Kepada Yth" di nota: alamat = baris setelah nama, telp = baris "Telp.".
  // Nilai dari label di nota: "No. Telepon / HP : ...", "Alamat : ..." (nota tutup, berupa tabel label | : | isi),
  // atau "Telp. : ..." di teks yang sama. Tidak mengambil teks dari label lain.
  function ambilNilaiLabel(doc, pola) {
    const rapi = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const el = [...doc.body.querySelectorAll('*')].find((e) => {
      const t = rapi(e.textContent);
      return pola.test(t) && t.length < 120 && ![...e.children].some((c) => pola.test(rapi(c.textContent)));
    });
    if (!el) return '';
    const sama = rapi(el.textContent).replace(pola, '').replace(/^[:\s]+/, '').trim();
    if (sama && /[a-z0-9]/i.test(sama) && sama.length <= 80) return sama;
    const sel = el.closest('td, th');
    if (sel) {
      let nx = sel.nextElementSibling;
      while (nx) {
        const t = rapi(nx.textContent).replace(/^[:\s]+/, '');
        if (t) return t;
        nx = nx.nextElementSibling;
      }
      return '';
    }
    let node = el;
    while (node && !node.nextElementSibling) node = node.parentElement;
    return node && node.nextElementSibling ? rapi(node.nextElementSibling.textContent) : '';
  }

  // Telp dan alamat dari nota: label (nota tutup) lebih dulu, lalu blok "Kepada Yth" (nota penerimaan).
  function ambilKontakNota(doc) {
    const kepada = ambilKontakKepadaYth(doc);
    const telp = ambilNilaiLabel(doc, /^(no\.?\s*)?(telp|telepon)[^:]*:?/i) || kepada.telp;
    const alamat = ambilNilaiLabel(doc, /^alamat[^:]*:?/i) || kepada.alamat;
    return { telp: telp, alamat: alamat };
  }

  // Telp dan alamat dari blok "Kepada Yth" di nota penerimaan.
  function ambilKontakKepadaYth(doc) {
    const rapi = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const label = [...doc.body.querySelectorAll('*')].find((el) =>
      /^kepada\s*yth\b/i.test(rapi(el.textContent)) &&
      ![...el.children].some((c) => /^kepada\s*yth\b/i.test(rapi(c.textContent))));
    if (!label) return { alamat: '', telp: '' };
    const teks = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let aktif = false;
    let n;
    while ((n = walker.nextNode()) && teks.length < 6) {
      if (!aktif) { if (label.contains(n)) aktif = true; continue; }
      if (label.contains(n)) continue;
      const t = rapi(n.textContent);
      if (t) teks.push(t);
    }
    const iTelp = teks.findIndex((t) => /^telp/i.test(t));
    // Nilai telp: sisa teks di baris "Telp." itu sendiri, atau teks berikutnya bila terpisah (":" lalu nomor)
    let telp = '';
    if (iTelp >= 0) {
      telp = teks[iTelp].replace(/^telp\.?\s*:?\s*/i, '').replace(/^:\s*/, '').trim();
      if (!telp && teks[iTelp + 1]) telp = teks[iTelp + 1].replace(/^:\s*/, '').trim();
      if (!/\d/.test(telp)) telp = '';
    }
    const alamat = teks.slice(1, iTelp > 0 ? iTelp : 2).join(' ').trim();
    return { alamat: alamat, telp: telp };
  }

  // Kolom pencarian (Pelanggan, Kode Servis, Nama Barang, Serial Number) disusun grid yang menyesuaikan lebar layar:
  // kolom baru otomatis turun ke baris berikutnya kalau layar sempit. Hanya untuk wadah yang tidak memuat tabel.
  function jadikanGridPencarian(modal) {
    if (modal.dataset.tmGrid) return;
    const p = modal.querySelector('#pencarian_nama_pelanggan') || modal.querySelector('input[name="pencarian[nama_pelanggan]"]');
    const q = modal.querySelector('#pencarian_serial_number') || modal.querySelector('input[name="pencarian[serial_number]"]');
    if (!p || !q) return;
    let c = p.parentElement;
    while (c && c !== modal && !c.contains(q)) c = c.parentElement;
    if (!c || c === modal || c.querySelector('table')) return;
    c.style.display = 'grid';
    c.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
    c.style.gap = '6px 12px';
    c.style.alignItems = 'end';
    modal.dataset.tmGrid = '1';
  }

  // Tampilkan telp dan alamat di jendela Lacak Servis, susunannya meniru kolom pencarian (label di atas,
  // kotak isian selebar kolom). Alamat diletakkan di bawah kolom Pelanggan, Telp di bawah kolom Kode Servis.
  // Kalau kolom itu tidak ketemu, ditaruh di bawah kolom Serial Number, lalu di atas tabel.
  function tampilKontak(modal, kontak) {
    const pelangganEl = modal.querySelector('#pencarian_nama_pelanggan') || modal.querySelector('input[name="pencarian[nama_pelanggan]"]');
    const kodeEl = modal.querySelector('#pencarian_kode') || modal.querySelector('input[name="pencarian[kode]"]');
    const snEl = modal.querySelector('#pencarian_serial_number') || modal.querySelector('input[name="pencarian[serial_number]"]');
    const tabel = modal.querySelector('table');
    // Hanya wadah di dalam jendela yang dipakai (bukan jendela itu sendiri)
    const dalam = (el) => (el && el !== modal && modal.contains(el) ? el : null);
    const grupPelanggan = pelangganEl ? dalam(pelangganEl.parentElement) : null;
    const grupKode = kodeEl ? dalam(kodeEl.parentElement) : null;
    const grupSn = snEl ? dalam(snEl.parentElement) : null;
    const contohGrup = grupKode || grupSn || grupPelanggan;
    const contohLabel = contohGrup ? contohGrup.querySelector('label') : null;
    const contohInput = kodeEl || snEl || pelangganEl;

    const bikin = (label, id) => {
      const grup = document.createElement('div');
      grup.className = contohGrup ? contohGrup.className : '';
      grup.classList.add('tm-kontak-baris');
      const lbl = document.createElement('label');
      lbl.className = contohLabel ? contohLabel.className : '';
      lbl.textContent = label; // titik dua sudah dari gaya label ERZAP (sama seperti kolom lain)
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.id = id;
      inp.className = contohInput ? contohInput.className : '';
      inp.style.cssText = 'width:100%;max-width:100%;box-sizing:border-box;';
      grup.appendChild(lbl);
      grup.appendChild(inp);
      return grup;
    };

    let grupAlamat = document.getElementById('tm-kontak-alamat') ? document.getElementById('tm-kontak-alamat').parentElement : null;
    let grupTelp = document.getElementById('tm-kontak-telp') ? document.getElementById('tm-kontak-telp').parentElement : null;
    if (!grupAlamat || !grupTelp) {
      grupAlamat = bikin('Alamat', 'tm-kontak-alamat');
      // Alamat selalu satu baris penuh di bawah Pelanggan (tidak menyempitkan kolom Pelanggan)
      grupAlamat.style.cssText = 'flex:0 0 100%;width:100%;max-width:100%;grid-column:1 / -1;';
      grupTelp = bikin('Telp', 'tm-kontak-telp');
      if (grupPelanggan) grupPelanggan.insertAdjacentElement('afterend', grupAlamat);
      else if (grupSn) grupSn.insertAdjacentElement('afterend', grupAlamat);
      else if (tabel && tabel.parentElement) tabel.parentElement.insertBefore(grupAlamat, tabel);
      else return;
      if (grupKode) grupKode.insertAdjacentElement('afterend', grupTelp);
      else if (grupSn) grupSn.insertAdjacentElement('afterend', grupTelp);
      else if (tabel && tabel.parentElement) tabel.parentElement.insertBefore(grupTelp, tabel);
      else return;
    }
    jadikanGridPencarian(modal);
    document.getElementById('tm-kontak-telp').value = kontak && kontak.telp ? kontak.telp : '';
    document.getElementById('tm-kontak-alamat').value = kontak && kontak.alamat ? kontak.alamat : '';
  }

  // Ambil dari nota servis: nama barang (kolom Unit / Nama Barang), SN bila di Lacak Servis kosong,
  // dan telp + alamat pelanggan. Nota penutupan (nota_tutup_servis) dipakai lebih dulu, kalau belum
  // ditutup nota penerimaan (nota_penerimaan).
  // Kalau SN diisi: baris dicocokkan dengan SN. Kalau SN kosong: hanya dipakai bila nota memuat tepat satu baris barang.
  async function ambilDariNota(row, sn) {
    const kosongKontak = { alamat: '', telp: '' };
    const link = row.querySelector('a[href*="nota_tutup_servis"]') || row.querySelector('a[href*="nota_penerimaan"]');
    if (!link) return { unit: getCellAny(row, ['Unit', 'Nama Barang', 'Barang']), sn: '', kontak: kosongKontak };
    const html = await (await fetch(link.getAttribute('href'), { credentials: 'same-origin' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const kontak = ambilKontakNota(doc);
    const kosong = { unit: '', sn: '', kontak: kontak };
    const target = (sn || '').replace(/\s+/g, '').toUpperCase();
    const norm = (t) => (t || '').replace(/\s+/g, '').toUpperCase();
    for (const t of doc.querySelectorAll('table')) {
      const headers = [...t.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td')].map((h) => h.textContent.trim().toUpperCase());
      const iUnit = headers.findIndex((h) => h === 'UNIT' || h === 'NAMA BARANG');
      const iSn = headers.findIndex((h) => h === 'SN' || h === 'SERIAL NUMBER');
      if (iUnit < 0) continue;
      const rows = [...t.querySelectorAll('tbody tr')].filter((r) => r.querySelectorAll('td').length > 0);
      if (target) {
        // Hanya baris yang punya nilai SN sama (di kolom SN, atau di kolom mana pun bila judul kolomnya beda,
        // mis. Nopol). Tidak diambil baris pertama sebagai cadangan, supaya nama barang tidak salah.
        const match = rows.find((r) => {
          const c = [...r.querySelectorAll('td')];
          if (iSn >= 0) return c[iSn] && norm(c[iSn].textContent) === target;
          return c.some((x) => norm(x.textContent) === target);
        });
        if (!match) return kosong;
        return { unit: cellText(match, iUnit), sn: '', kontak: kontak };
      }
      // SN kosong di Lacak Servis: ambil dari nota, hanya kalau jelas satu barang
      if (rows.length !== 1) return kosong;
      return { unit: cellText(rows[0], iUnit), sn: iSn >= 0 ? cellText(rows[0], iSn) : '', kontak: kontak };
    }
    return kosong;
  }

  function cellText(tr, idx) {
    const c = tr.querySelectorAll('td');
    return c[idx] ? c[idx].textContent.trim() : '';
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

  // Cek dan pasang ulang Termin, Tipe Penjualan, dan Outlet. Mengembalikan hasil tiap pengaturan.
  function pastikanPengaturanNota() {
    // Jenis Servis = Rawat Inap (radio), sama seperti di alur Buat Member
    const rawat = document.getElementById('servis_elektronik_is_rawat_inap_true');
    if (rawat && !rawat.checked) rawat.click();
    return {
      okTermin: pastikanOpsi('servis_elektronik_idtermin', 'Tunai'),
      okTipe: pastikanOpsi('servis_elektronik_idtipe_penjualan', 'SERVICE'),
      okOutlet: pastikanOpsi('servis_elektronik_idoutlet_own', 'OTOTECH JOMBANG'),
      okRawat: !!(rawat && rawat.checked),
    };
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
    const sel = row.querySelectorAll('td');
    // Pelanggan: dari judul kolom "Pelanggan". Kalau judul tidak terbaca, pakai kolom ke-3 (urutan tabel
    // Lacak Servis: Tanggal, Kode Servis, Pelanggan, SN, ...), lalu kolom pencarian Pelanggan.
    let pelanggan = getCellAny(row, ['Pelanggan', 'Nama Pelanggan', 'Nama']);
    if (!pelanggan && sel[2]) pelanggan = (sel[2].innerText || sel[2].textContent || '').trim();
    if (!pelanggan && namaCari) pelanggan = namaCari.value.trim();
    // SN: dari judul kolom "SN". Kalau judul tidak terbaca, pakai kolom ke-4 (SN).
    let sn = getCellAny(row, ['SN', 'Serial Number', 'Serial No', 'No Seri']);
    if (!sn && sel[3]) sn = (sel[3].innerText || sel[3].textContent || '').trim();

    if (!getCellAny(row, ['Pelanggan', 'Nama Pelanggan', 'Nama'])) {
      console.warn('[antrianservis] judul kolom Pelanggan tidak terbaca. Judul:', getHeaders(row), 'Pelanggan dipakai:', pelanggan);
    }

    // Data dari nota (Nama Barang dan SN). Diambil sebelum jendela Lacak Servis ditutup.
    let info = { unit: '', sn: '' };
    try {
      info = await ambilDariNota(row, sn);
    } catch (err) {
      info = { unit: '', sn: '' };
    }
    if (!sn && info.sn) sn = info.sn;
    const unit = info.unit;

    // Tutup jendela Lacak Servis dulu
    const closeBtn = [...modal.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tutup');
    if (closeBtn) closeBtn.click();

    const okPelanggan = pelanggan ? await isiPelanggan(pelanggan) : false;
    const okSn = sn ? isiSerialNumber(sn) : false;
    const okUnit = unit ? isiNamaBarang(unit) : false;

    // Termin, Tipe, dan Outlet diisi terakhir, setelah semua ajax dari Pelanggan selesai,
    // karena bisa ter-reset oleh halaman. Dicek ulang beberapa kali supaya tidak hilang.
    await tungguAjax();
    let hasil = pastikanPengaturanNota();
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      hasil = pastikanPengaturanNota();
    }

    if (!okPelanggan || !okSn || !okUnit || !hasil.okTermin || !hasil.okTipe || !hasil.okOutlet || !hasil.okRawat) {
      alert(
        'Sebagian data belum terisi. Pelanggan: ' + (okPelanggan ? 'OK' : 'gagal') +
        ', Serial Number: ' + (okSn ? 'OK' : 'gagal') +
        ', Nama Barang: ' + (okUnit ? 'OK' : 'gagal') +
        ', Termin: ' + (hasil.okTermin ? 'OK' : 'gagal') +
        ', Tipe Penjualan: ' + (hasil.okTipe ? 'OK' : 'gagal') +
        ', Outlet: ' + (hasil.okOutlet ? 'OK' : 'gagal') +
        ', Jenis Servis (Rawat Inap): ' + (hasil.okRawat ? 'OK' : 'gagal')
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
    modal.classList.add('tm-lacak');
    bindRowSelection(modal);
    autoPilihBaris(modal);
    // Saat Lacak Servis dibuka, Jenis Servis langsung Rawat Inap (sekali per jendela)
    if (!modal.dataset.tmRawat) {
      modal.dataset.tmRawat = '1';
      const rawat = document.getElementById('servis_elektronik_is_rawat_inap_true');
      if (rawat && !rawat.checked) rawat.click();
    }

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
  style.textContent = '.' + SEL_CLASS + ' td { background: #fff3b0 !important; }' +
    ' .tm-lacak table thead th, .tm-lacak table thead td { position: sticky; top: 0; z-index: 2; background: #e9ecef; }' +
    ' .tm-lacak .modal-dialog { max-width: min(96vw, 980px); margin: 1rem auto; }' +
    ' .tm-lacak .modal-content { max-height: 92vh; }' +
    ' .tm-lacak .modal-body { max-height: calc(92vh - 130px); overflow: auto; }' +
    ' .tm-lacak .modal-body .row { display: flex; flex-wrap: wrap; }' +
    ' .tm-lacak .modal-body .row > [class*="col"] { flex: 1 1 200px; min-width: 0; max-width: 100%; }' +
    ' .tm-lacak .modal-body input, .tm-lacak .modal-body select { max-width: 100%; }' +
    ' .tm-lacak table { max-width: 100%; }';
  document.head.appendChild(style);

  // Panggilan ensureButton digabung per frame supaya tidak dijalankan ratusan kali saat DOM berubah banyak
  let ensureQueued = false;
  const observer = new MutationObserver(() => {
    if (ensureQueued) return;
    ensureQueued = true;
    requestAnimationFrame(() => {
      ensureQueued = false;
      ensureButton();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  ensureButton();
})();
