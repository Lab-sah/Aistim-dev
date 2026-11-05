// ==UserScript==
// @name         Erzap - Tombol Buat Nota di Lacak Servis
// @namespace    http://tampermonkey.net/
// @version      1.13.69
// @description  Menambah tombol "Buat Nota" (jika ada data servis) atau "Buat Data" (jika tidak ada data) di baris pencarian Lacak Servis, serta tombol Reset. Buat Nota mengisi Pelanggan, Serial Number, Nama Barang, Termin = Tunai, Tipe Penjualan = SERVICE, dan Outlet = OTOTECH JOMBANG. Buat Data mengisi form servis dari kolom pencarian dengan pengaturan yang sama. Fitur diatur lewat AKSES_JSON.
// @match        https://ototech.erzap.com/servis_elektroniks/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @run-at       document-idle
// @world        main
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini.
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua).
  //              Nama fitur:
  //                buatNota     = tombol Buat Nota (ada data servis)
  //                buatData     = tombol Buat Data (tanpa data servis)
  //                lacakOtomatis = perilaku otomatis di jendela Lacak Servis: tombol Reset, kolom pencarian terisi
  //                                dari baris yang dipilih, baris pertama otomatis dipilih, Telp dan Alamat dari nota,
  //                                Jenis Servis = Rawat Inap saat jendela dibuka, dan penyesuaian tampilan.
  // "role"    -> nama-nama role: "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
  //              cukup sebagian nama; isi nama lengkap persis seperti di ERZAP), "fitur" = fitur private yang boleh dipakai role itu.
  // Fitur yang tidak disebut di "public" maupun "private" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
  // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script dan muat ulang halaman ERZAP.
  const AKSES_JSON = `{
    "public": [],
    "private": ["buatNota", "buatData", "lacakOtomatis"],
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
  const BTN_RESET_ID = 'tm-reset-btn';
  const BTN_DATA_ID = 'tm-buat-data-btn';
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
    const tr = (table && cari(table)) || cari(scope) || scope.querySelector('thead tr');
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
    const sn = getCellAny(tr, ['SN', 'Serial Number', 'Serial No', 'No Seri']) || cellText(tr, 3);
    isi(['#pencarian_nama_pelanggan', 'input[name="pencarian[nama_pelanggan]"]'], pelanggan);
    isi(['#pencarian_kode', 'input[name="pencarian[kode]"]'], kode);
    isi(['#pencarian_serial_number', 'input[name="pencarian[serial_number]"]'], sn);
    try {
      const info = await ambilDariNota(tr, sn);
      // Baris lain sudah dipilih selama nota dibaca: hasil ini dibuang supaya tidak salah baris
      if (selectedRow !== tr) return;
      tampilKontak(modal, info.kontak);
      isi(['#pencarian_unit', 'input[name="pencarian[unit]"]'], info.unit);
      if (!sn && info.sn) isi(['#pencarian_serial_number', 'input[name="pencarian[serial_number]"]'], info.sn);
    } catch (err) { console.warn('[antrianservis] nota tidak bisa dibaca:', err.message); }
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

  // Klik baris tabel untuk memilih servis (klik link di dalam baris tidak mengubah pilihan).
  // Pengisian kolom pencarian dan pembacaan nota hanya untuk yang punya fitur lacakOtomatis.
  function bindRowSelection(modal) {
    if (modal.dataset.tmBound) return;
    modal.dataset.tmBound = '1';
    modal.addEventListener('click', (e) => {
      const tr = e.target.closest('tbody tr');
      if (!tr || !modal.contains(tr) || e.target.closest('a')) return;
      modal.querySelectorAll('.' + SEL_CLASS).forEach((r) => r.classList.remove(SEL_CLASS));
      tr.classList.add(SEL_CLASS);
      selectedRow = tr;
      if (bolehFitur('lacakOtomatis')) isiPencarianDariBaris(modal, tr);
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
  // dipilih lewat autocomplete (id pelanggan ikut terisi). Kalau tidak, nama hanya diisi sebagai teks dan
  // id pelanggan TIDAK terisi.
  // Hasil: 'ok' = dipilih lewat autocomplete (id terisi), 'teks' = hanya teks, false = gagal.
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
      console.warn('[antrianservis] autocomplete Pelanggan belum siap: nama diisi sebagai teks, id tidak terisi.');
      el.val(nama).trigger('change');
      return 'teks';
    }

    el.val('');
    const items = await new Promise((resolve) => {
      let selesai = false;
      const fin = (list) => {
        if (selesai) return;
        selesai = true;
        resolve(Array.isArray(list) ? list : []);
      };
      try { inst.source.call(inst, { term: nama }, fin); } catch (err) {
        console.warn('[antrianservis] pencarian autocomplete Pelanggan gagal:', err.message);
        fin([]);
      }
      setTimeout(() => fin([]), 3000);
    });

    const target = nama.trim().toUpperCase();
    const item = items.find((i) => (i.nama || '').trim().toUpperCase() === target);
    let hasil = 'teks';
    if (item) {
      el.val(item.nama);
      // Jalankan event select bawaan autocomplete supaya id pelanggan ikut terisi
      if (typeof inst._trigger === 'function') inst._trigger('select', null, { item });
      else if (inst.options && typeof inst.options.select === 'function') inst.options.select.call(el[0], null, { item });
      hasil = 'ok';
    } else {
      console.warn('[antrianservis] nama Pelanggan tidak ada di hasil autocomplete: diisi sebagai teks, id tidak terisi:', nama);
      el.val(nama).trigger('change');
    }
    el.autocomplete('close');
    return hasil;
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

  // Telp dan alamat dari nota: label "Telp"/"Alamat" (nota tutup, berupa tabel label | : | isi),
  // atau blok "Kepada Yth" (nota penerimaan). Nilai dibersihkan dari titik dua di depan.
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
    return node && node.nextElementSibling ? rapi(node.nextElementSibling.textContent).replace(/^[:\s]+/, '') : '';
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
    // Alamat hanya diambil bila ada label Telp sesudah nama. Tanpa label Telp, teks berikutnya
    // biasanya nama barang (bukan alamat), jadi alamat dikosongkan.
    const alamat = iTelp >= 2 ? teks.slice(1, iTelp).join(' ').trim() : '';
    return { alamat: alamat, telp: telp };
  }

  // Tampilkan Telp dan Alamat di jendela Lacak Servis.
  // Susunan (desktop): Pelanggan, Kode Servis, Nama Barang, Serial Number dalam satu baris;
  // di bawahnya Telp (selebar kolom Pelanggan) dan Alamat (dari kolom Kode Servis sampai Nama Barang).
  // Di layar kecil (<= 640 px) semua kolom ditumpuk satu per satu. Lebar dan susunan diatur lewat CSS
  // (class tm-kontak-*), bukan gaya inline, supaya responsif.
  function tampilKontak(modal, kontak) {
    const pelInput = modal.querySelector('#pencarian_nama_pelanggan') || modal.querySelector('input[name="pencarian[nama_pelanggan]"]');
    const snInput = modal.querySelector('#pencarian_serial_number') || modal.querySelector('input[name="pencarian[serial_number]"]');
    if (!pelInput || !snInput) return;
    const grupSn = snInput.parentElement;

    // Baris induk yang memuat semua kolom pencarian (Pelanggan sampai Serial Number)
    let row = pelInput.parentElement.parentElement;
    while (row && row !== modal && !row.contains(grupSn)) row = row.parentElement;
    if (!row || row === modal) return;
    row.classList.add('tm-kontak-row');

    if (!document.getElementById('tm-kontak-wrap')) {
      const contohLabel = grupSn.querySelector('label');
      const bikin = (label, id, kelas) => {
        const grup = document.createElement('div');
        grup.className = 'tm-kontak-baris ' + kelas;
        const lbl = document.createElement('label');
        lbl.className = contohLabel ? contohLabel.className : '';
        lbl.textContent = label;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = id;
        inp.className = snInput.className;
        grup.appendChild(lbl);
        grup.appendChild(inp);
        return grup;
      };
      const wrap = document.createElement('div');
      wrap.id = 'tm-kontak-wrap';
      wrap.className = 'tm-kontak-wrap';
      wrap.appendChild(bikin('Telp :', 'tm-kontak-telp', 'tm-kontak-telp-grup'));
      wrap.appendChild(bikin('Alamat :', 'tm-kontak-alamat', 'tm-kontak-alamat-grup'));
      row.appendChild(wrap);
    }
    pasangCariTelp(modal);
    document.getElementById('tm-kontak-telp').value = kontak && kontak.telp ? kontak.telp : '';
    document.getElementById('tm-kontak-alamat').value = kontak && kontak.alamat ? kontak.alamat : '';
    sejajarkanKontak(modal);
  }

  // Kolom Telp bisa dipakai mencari pelanggan: ketik nomor (min. 3 karakter), daftar saran muncul dari
  // sumber autocomplete Pelanggan milik halaman (jQuery UI). Pilih salah satu: nama pelanggan masuk ke
  // kolom Pelanggan, lalu klik Pencarian. Enter memilih saran pertama.
  function pasangCariTelp(modal) {
    const telp = document.getElementById('tm-kontak-telp');
    if (!telp || telp.dataset.tmCari) return;
    telp.dataset.tmCari = '1';
    telp.autocomplete = 'off';
    telp.placeholder = 'Ketik no. telp untuk cari pelanggan';
    const daftar = document.createElement('div');
    daftar.className = 'tm-telp-saran';
    daftar.style.display = 'none';
    document.body.appendChild(daftar);
    let nomor = 0, timer = null, saran = [], logSekali = false;

    const tutup = () => { daftar.style.display = 'none'; saran = []; };
    const noTelp = (i) => String(i.telepon || i.telp || i.no_telp || i.no_telepon || i.hp || i.no_hp || '').trim();
    const pilih = (item) => {
      tutup();
      const $ = window.jQuery;
      const pel = modal.querySelector('#pencarian_nama_pelanggan');
      if (pel) {
        // Hanya isi nilainya. Event input tidak dikirim, supaya autocomplete milik kolom Pelanggan tidak
        // menjalankan pencarian sendiri (kolom jadi loading terus). Pencarian sisa dibatalkan dan ditutup.
        if ($) {
          const j = $(pel);
          const w = j.data('ui-autocomplete');
          if (w) { clearTimeout(w.searching); w.cancelSearch = true; }
          j.val(item.nama || '');
          if (w) j.autocomplete('close');
          j.removeClass('ui-autocomplete-loading');
          setTimeout(() => j.removeClass('ui-autocomplete-loading'), 500);
        } else {
          pel.value = item.nama || '';
        }
      }
      if (noTelp(item)) telp.value = noTelp(item);
      if (item.alamat) {
        const al = document.getElementById('tm-kontak-alamat');
        if (al) al.value = item.alamat;
      }
    };
    const tampil = () => {
      daftar.innerHTML = '';
      if (!saran.length) { daftar.style.display = 'none'; return; }
      saran.slice(0, 15).forEach((item) => {
        const d = document.createElement('div');
        d.className = 'tm-telp-item';
        const t = noTelp(item);
        d.textContent = (item.nama || '(tanpa nama)') + (t ? ' - ' + t : '');
        d.addEventListener('mousedown', (e) => { e.preventDefault(); pilih(item); });
        daftar.appendChild(d);
      });
      const r = telp.getBoundingClientRect();
      daftar.style.left = r.left + 'px';
      daftar.style.top = (r.bottom + 2) + 'px';
      daftar.style.width = Math.max(r.width, 220) + 'px';
      daftar.style.display = 'block';
    };
    const cari = async () => {
      const term = telp.value.trim();
      if (term.length < 3) { tutup(); return; }
      const $ = window.jQuery;
      const el = $ && ($('#pencarian_nama_pelanggan').data('ui-autocomplete') ? $('#pencarian_nama_pelanggan') : $('#' + PELANGGAN_ID));
      const inst = el && el.data('ui-autocomplete');
      if (!inst) {
        console.warn('[antrianservis] autocomplete Pelanggan tidak ditemukan: cari lewat Telp tidak bisa.');
        return;
      }
      const saya = ++nomor;
      const items = await new Promise((resolve) => {
        let selesai = false;
        const fin = (list) => { if (!selesai) { selesai = true; resolve(Array.isArray(list) ? list : []); } };
        try { inst.source.call(inst, { term: term }, fin); } catch (err) {
          console.warn('[antrianservis] pencarian Telp gagal:', err.message);
          fin([]);
        }
        setTimeout(() => fin([]), 3000);
      });
      if (saya !== nomor) return;
      if (!logSekali && items.length) { logSekali = true; console.log('[antrianservis] contoh data autocomplete Pelanggan:', items[0]); }
      saran = items;
      tampil();
    };

    telp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(cari, 300); });
    telp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && saran.length) { e.preventDefault(); e.stopPropagation(); pilih(saran[0]); }
      else if (e.key === 'Escape') tutup();
    });
    telp.addEventListener('blur', () => setTimeout(tutup, 150));
  }

  // Menyejajarkan Telp dan Alamat dengan kolom di atasnya: Telp selebar kolom Pelanggan, dan Alamat dimulai
  // dari kolom Kode Servis sampai ujung kanan Nama Barang. Di layar kecil, posisi ini dilepas (susunan tumpuk).
  function sejajarkanKontak(modal) {
    const telp = document.getElementById('tm-kontak-telp');
    const alamat = document.getElementById('tm-kontak-alamat');
    const pel = modal.querySelector('#pencarian_nama_pelanggan');
    const kode = modal.querySelector('#pencarian_kode');
    const unit = modal.querySelector('#pencarian_unit');
    if (!telp || !alamat || !pel || !kode) return;
    const tg = telp.parentElement;
    const ag = alamat.parentElement;
    if (window.matchMedia('(max-width: 640px)').matches || !unit) {
      tg.style.cssText = '';
      ag.style.cssText = '';
      const grupTombolReset = modal.querySelector('.tm-kontak-tombol');
      if (grupTombolReset) grupTombolReset.style.cssText = '';
      // Di layar kecil grup tombol juga dipindah ke baris Telp/Alamat (susunan tumpuk, diatur CSS)
      const wrapKecil = document.getElementById('tm-kontak-wrap');
      const cariKecil = modal.querySelector('#lacak_servis_cari');
      if (wrapKecil && cariKecil && cariKecil.parentElement && cariKecil.parentElement.parentElement !== wrapKecil) {
        cariKecil.parentElement.classList.add('tm-kontak-tombol');
        wrapKecil.appendChild(cariKecil.parentElement);
      }
      return;
    }
    // Layar lebar < 1100 px: susunan bertumpuk (Telp, Alamat, tombol) rata kiri. Tidak diukur-ukur lagi,
    // sehingga tidak berubah-ubah saat muncul/hilang scroll tabel.
    if (window.innerWidth < 1100) {
      tg.style.cssText = 'display:block;margin-left:0px;width:' + Math.round(pel.getBoundingClientRect().width) + 'px;';
      ag.style.cssText = 'display:block;margin-left:0px;width:100%;';
      const wrapBertumpuk = document.getElementById('tm-kontak-wrap');
      const cariBertumpuk = modal.querySelector('#lacak_servis_cari');
      if (wrapBertumpuk && cariBertumpuk && cariBertumpuk.parentElement) {
        const grupBertumpuk = cariBertumpuk.parentElement;
        grupBertumpuk.classList.add('tm-kontak-tombol', 'tm-tombol-baris');
        wrapBertumpuk.appendChild(grupBertumpuk);
        grupBertumpuk.style.cssText = 'margin-left:0px;width:auto;';
      }
      return;
    }
    const pelW = Math.round(pel.getBoundingClientRect().width);
    const kodeL = kode.getBoundingClientRect().left;
    const unitR = unit.getBoundingClientRect().right;
    tg.style.cssText = 'display:block;margin-left:0px;width:' + pelW + 'px;';
    ag.style.cssText = 'display:block;margin-left:0px;width:' + Math.round(unitR - kodeL) + 'px;';
    // Posisi diukur ulang dua kali, karena menggeser Telp ikut menggeser Alamat
    // Kalau Alamat turun ke baris sendiri (layar sempit), Alamat rata kiri dan selebar baris
    const alamatSebaris = () => ag.getBoundingClientRect().top - tg.getBoundingClientRect().top < 5;
    for (let i = 0; i < 2; i++) {
      const dTelp = telp.getBoundingClientRect().left - pel.getBoundingClientRect().left;
      tg.style.marginLeft = (parseFloat(tg.style.marginLeft) - dTelp) + 'px';
      if (alamatSebaris()) {
        const dAlamat = alamat.getBoundingClientRect().left - kode.getBoundingClientRect().left;
        ag.style.marginLeft = (parseFloat(ag.style.marginLeft) - dAlamat) + 'px';
      }
    }
    if (!alamatSebaris()) ag.style.cssText = 'display:block;margin-left:0px;width:100%;';
    // Tombol Reset dan Pencarian dipindah ke baris Telp/Alamat, di kanan kotak Alamat,
    // dengan ujung kanan sejajar Serial Number
    const cari = modal.querySelector('#lacak_servis_cari');
    const sn = modal.querySelector('#pencarian_serial_number');
    const wrap = document.getElementById('tm-kontak-wrap');
    if (cari && sn && wrap && cari.parentElement) {
      const grupTombol = cari.parentElement;
      grupTombol.classList.add('tm-kontak-tombol');
      wrap.appendChild(grupTombol);
      // Grup tombol ditempel ke kanan baris (margin-left:auto) dengan lebar Serial Number, jadi kirinya sejajar SN
      grupTombol.style.cssText = 'margin-left:auto;width:' + Math.round(sn.getBoundingClientRect().width) + 'px;';
      // Kalau layar terlalu sempit, grup tombol pindah ke baris bawah (flex-wrap): lebar mengikuti isi, rata kiri
      const sebaris = () => grupTombol.getBoundingClientRect().top - telp.getBoundingClientRect().top < 5;
      if (sebaris()) {
        grupTombol.classList.remove('tm-tombol-baris');
      } else {
        grupTombol.classList.add('tm-tombol-baris');
        grupTombol.style.marginLeft = '0px';
        grupTombol.style.width = 'auto';
      }
    }
  }

  // Ambil dari nota servis: nama barang (kolom Unit / Nama Barang), SN bila di Lacak Servis kosong,
  // dan telp + alamat pelanggan. Nota penutupan (nota_tutup_servis) dipakai lebih dulu, kalau belum
  // ditutup nota penerimaan (nota_penerimaan).
  // Kalau SN diisi: baris dicocokkan dengan SN. Kalau SN kosong: hanya dipakai bila nota memuat tepat satu baris barang.
  async function ambilDariNota(row, sn) {
    const kosongKontak = { alamat: '', telp: '' };
    const link = row.querySelector('a[href*="nota_tutup_servis"]') || row.querySelector('a[href*="nota_penerimaan"]');
    if (!link) return { unit: getCellAny(row, ['Unit', 'Nama Barang', 'Barang']), sn: '', kontak: kosongKontak };
    const res = await fetch(link.getAttribute('href'), { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
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
    // Jenis Servis = Rawat Inap (radio)
    const rawat = document.getElementById('servis_elektronik_is_rawat_inap_true');
    if (rawat && !rawat.checked) rawat.click();
    return {
      okTermin: pastikanOpsi('servis_elektronik_idtermin', 'Tunai'),
      okTipe: pastikanOpsi('servis_elektronik_idtipe_penjualan', 'SERVICE'),
      okOutlet: pastikanOpsi('servis_elektronik_idoutlet_own', 'OTOTECH JOMBANG'),
      okRawat: !!(rawat && rawat.checked),
    };
  }

  // Teks hasil Pelanggan untuk alert: OK / hanya teks (id tidak terisi) / gagal
  function teksPelanggan(hasil) {
    if (hasil === 'ok') return 'OK';
    if (hasil === 'teks') return 'hanya teks (ID pelanggan tidak terisi, pilih dari daftar)';
    return 'gagal';
  }

  async function buatNota(modal) {
    if (!bolehFitur('buatNota')) return;
    let row = selectedRow && selectedRow.isConnected && modal.contains(selectedRow) ? selectedRow : null;
    if (!row) {
      const rows = modal.querySelectorAll('tbody tr');
      if (rows.length === 1) row = rows[0];
    }
    if (!row) {
      alert('Pilih dulu satu baris servis di tabel.');
      return;
    }

    // Pelanggan, Serial Number, dan Nama Barang diambil dari kolom isian di popup Lacak Servis
    // (kolom itu sudah terisi otomatis saat baris dipilih dan boleh diedit). Hanya yang kosong
    // dicari dari tabel / nota servis.
    const nilai = (q) => {
      const el = modal.querySelector(q);
      return el ? el.value.trim() : '';
    };
    let pelanggan = nilai('#pencarian_nama_pelanggan');
    let sn = nilai('#pencarian_serial_number');
    let unit = nilai('#pencarian_unit');
    if (!pelanggan || !sn || !unit) {
      const sel = row.querySelectorAll('td');
      if (!pelanggan) {
        pelanggan = getCellAny(row, ['Pelanggan', 'Nama Pelanggan', 'Nama']);
        if (!pelanggan && sel[2]) pelanggan = (sel[2].innerText || sel[2].textContent || '').trim();
      }
      if (!sn) {
        sn = getCellAny(row, ['SN', 'Serial Number', 'Serial No', 'No Seri']);
        if (!sn && sel[3]) sn = (sel[3].innerText || sel[3].textContent || '').trim();
      }
      if (!unit) {
        try {
          const info = await ambilDariNota(row, sn);
          unit = info.unit;
          if (!sn && info.sn) sn = info.sn;
        } catch (err) {
          console.warn('[antrianservis] nota tidak bisa dibaca, Nama Barang tidak terisi:', err.message);
        }
      }
    }

    // Tutup jendela Lacak Servis dulu
    const closeBtn = [...modal.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tutup');
    if (closeBtn) closeBtn.click();

    const hasilPelanggan = pelanggan ? await isiPelanggan(pelanggan) : false;
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

    if (hasilPelanggan !== 'ok' || !okSn || !okUnit || !hasil.okTermin || !hasil.okTipe || !hasil.okOutlet || !hasil.okRawat) {
      alert(
        'Sebagian data belum terisi. Pelanggan: ' + teksPelanggan(hasilPelanggan) +
        ', Serial Number: ' + (okSn ? 'OK' : 'gagal') +
        ', Nama Barang: ' + (okUnit ? 'OK' : 'gagal') +
        ', Termin: ' + (hasil.okTermin ? 'OK' : 'gagal') +
        ', Tipe Penjualan: ' + (hasil.okTipe ? 'OK' : 'gagal') +
        ', Outlet: ' + (hasil.okOutlet ? 'OK' : 'gagal') +
        ', Jenis Servis (Rawat Inap): ' + (hasil.okRawat ? 'OK' : 'gagal')
      );
    }
  }

  // Tanpa data servis (Buat Data): isi form servis dari kolom pencarian
  // (Pelanggan, Serial Number, Nama Barang), lalu Termin, Tipe Penjualan, dan Outlet diatur seperti Buat Nota.
  // Tidak ada nota yang dibaca, karena memang belum ada data servis.
  async function buatData(modal) {
    if (!bolehFitur('buatData')) return;
    const nilai = (q) => {
      const el = modal.querySelector(q);
      return el ? el.value.trim() : '';
    };
    const pelanggan = nilai('#pencarian_nama_pelanggan');
    const sn = nilai('#pencarian_serial_number');
    const unit = nilai('#pencarian_unit');
    if (!pelanggan && !sn && !unit) {
      alert('Isi dulu Pelanggan, Serial Number, atau Nama Barang.');
      return;
    }
    const closeBtn = [...modal.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tutup');
    if (closeBtn) closeBtn.click();

    const hasilPelanggan = pelanggan ? await isiPelanggan(pelanggan) : 'ok';
    const okSn = sn ? isiSerialNumber(sn) : true;
    const okUnit = unit ? isiNamaBarang(unit) : true;

    await tungguAjax();
    let hasil = pastikanPengaturanNota();
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      hasil = pastikanPengaturanNota();
    }

    const gagal = [];
    if (hasilPelanggan !== 'ok') gagal.push('Pelanggan: ' + teksPelanggan(hasilPelanggan));
    if (!okSn) gagal.push('Serial Number');
    if (!okUnit) gagal.push('Nama Barang');
    if (!hasil.okTermin) gagal.push('Termin');
    if (!hasil.okTipe) gagal.push('Tipe Penjualan');
    if (!hasil.okOutlet) gagal.push('Outlet');
    if (!hasil.okRawat) gagal.push('Jenis Servis (Rawat Inap)');
    if (gagal.length) alert('Sebagian data belum terisi: ' + gagal.join(', '));
  }

  // Mengosongkan kolom pencarian (Pelanggan, Kode Servis, Nama Barang, Serial Number) beserta Telp dan Alamat,
  // lalu menyembunyikan tabel hasil. Tabel muncul lagi saat Pencarian diklik atau Enter ditekan di kolom pencarian.
  function resetPencarian(modal) {
    const $ = window.jQuery;
    ['#pencarian_nama_pelanggan', '#pencarian_kode', '#pencarian_unit', '#pencarian_serial_number', '#tm-kontak-telp', '#tm-kontak-alamat'].forEach((q) => {
      const el = modal.querySelector(q);
      if (!el) return;
      if ($) $(el).val(''); else el.value = '';
    });
    modal.querySelectorAll('.' + SEL_CLASS).forEach((r) => r.classList.remove(SEL_CLASS));
    selectedRow = null;
    modal.classList.add('tm-tabel-sembunyi');
    ensureButton();
  }

  // Tabel hasil ditampilkan lagi (setelah Reset) begitu pencarian baru dijalankan
  function bindTampilTabel(modal) {
    if (modal.dataset.tmTampil) return;
    modal.dataset.tmTampil = '1';
    const tampil = () => {
      if (!modal.classList.contains('tm-tabel-sembunyi')) return;
      modal.classList.remove('tm-tabel-sembunyi');
      delete modal.dataset.tmAutoSig; // hasil yang sama setelah Reset tetap dipilih otomatis
    };
    modal.addEventListener('click', (e) => { if (e.target.closest('#lacak_servis_cari')) tampil(); }, true);
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('input')) tampil();
    }, true);
  }

  // Menandai kolom (lewat judul kolom) untuk pengaturan lebar, dan kolom opsional (Tindakan, Garansi)
  // yang disembunyikan di layar kecil. Tombol "Tampilkan semua kolom" hanya tampil di layar kecil.
  function tandaiKolom(modal) {
    const t = [...modal.querySelectorAll('table')].find((tb) =>
      [...tb.querySelectorAll('thead th')].some((th) => th.textContent.trim().toUpperCase() === 'KELUHAN'));
    if (!t) return;
    if (t.parentElement) t.parentElement.classList.add('tm-tabel-wadah');
    const kelas = {
      KELUHAN: ['tm-kol-keluhan'],
      TINDAKAN: ['tm-kol-tindakan', 'tm-kol-opsional'],
      GARANSI: ['tm-kol-opsional'],
      PELANGGAN: ['tm-kol-pelanggan'],
    };
    const peta = [...t.querySelectorAll('thead th')].map((th) => kelas[th.textContent.trim().toUpperCase()] || []);
    for (const tr of t.rows) {
      [...tr.cells].forEach((c, i) => (peta[i] || []).forEach((k) => c.classList.add(k)));
    }
    if (!modal.querySelector('#tm-kolom-btn')) {
      const btn = document.createElement('button');
      btn.id = 'tm-kolom-btn';
      btn.type = 'button';
      btn.className = 'btn btn-outline-secondary btn-sm tm-kolom-btn';
      btn.textContent = 'Tampilkan semua kolom';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        modal.classList.toggle('tm-kolom-penuh');
        btn.textContent = modal.classList.contains('tm-kolom-penuh') ? 'Sembunyikan kolom' : 'Tampilkan semua kolom';
      });
      const wadah = t.parentElement;
      wadah.parentElement.insertBefore(btn, wadah);
    }
  }

  function ensureButton() {
    const modal = findModal();
    if (!modal) return;

    // Perilaku otomatis hanya untuk yang punya fitur lacakOtomatis
    const otomatis = bolehFitur('lacakOtomatis');
    if (otomatis) {
      modal.classList.add('tm-lacak');
      tandaiKolom(modal);
    }
    bindRowSelection(modal);
    if (otomatis) {
      bindTampilTabel(modal);
      // Kolom Telp / Alamat langsung ada sejak jendela dibuka (supaya Telp bisa dipakai mencari pelanggan)
      if (!document.getElementById('tm-kontak-wrap')) tampilKontak(modal, null);
      autoPilihBaris(modal);
      // Saat Lacak Servis dibuka, Jenis Servis langsung Rawat Inap (sekali per jendela)
      if (!modal.dataset.tmRawat) {
        modal.dataset.tmRawat = '1';
        const rawat = document.getElementById('servis_elektronik_is_rawat_inap_true');
        if (rawat && !rawat.checked) rawat.click();
      }
    }

    const closeBtn = [...modal.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Tutup'
    );
    // Tombol Reset di sebelah kiri tombol Pencarian: mengosongkan kolom pencarian dan Telp/Alamat
    const btnCari = modal.querySelector('#lacak_servis_cari');
    if (otomatis && btnCari && !modal.querySelector('#' + BTN_RESET_ID)) {
      const btnReset = document.createElement('button');
      btnReset.id = BTN_RESET_ID;
      btnReset.type = 'button';
      // Ikon reset (panah melingkar), dengan title dan aria-label supaya tetap jelas artinya
      btnReset.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 9 9 9"/></svg>';
      btnReset.title = 'Reset';
      btnReset.setAttribute('aria-label', 'Reset');
      btnReset.style.width = '30px';
      btnReset.className = btnCari.className;
      btnReset.style.marginRight = '8px';
      btnReset.style.background = '#ffc107';
      btnReset.style.borderColor = '#ffc107';
      btnReset.style.color = '#212529';
      btnReset.addEventListener('click', (e) => {
        e.preventDefault();
        resetPencarian(modal);
      });
      btnCari.insertAdjacentElement('beforebegin', btnReset);
    }

    if (!closeBtn) return;

    // Ada data servis: tampilkan Buat Nota. Tidak ada: tampilkan Buat Data.
    const adaData = modal.querySelectorAll('table tbody tr').length > 0 && !modal.classList.contains('tm-tabel-sembunyi');
    const btnNota = modal.querySelector('#' + BTN_ID);
    const btnDataAda = modal.querySelector('#' + BTN_DATA_ID);

    if (adaData) {
      if (btnDataAda) btnDataAda.remove();
      if (!btnNota && bolehFitur('buatNota')) {
        // Tombol Buat Nota ditaruh di baris pencarian, tepat di sebelah kiri tombol Pencarian (sesudah Reset)
        if (btnCari) {
          const btnNotaBaru = document.createElement('button');
          btnNotaBaru.id = BTN_ID;
          btnNotaBaru.type = 'button';
          btnNotaBaru.textContent = 'Buat Nota';
          btnNotaBaru.className = btnCari.className;
          btnNotaBaru.style.marginRight = '8px';
          btnNotaBaru.style.background = '#28a745';
          btnNotaBaru.style.borderColor = '#28a745';
          btnNotaBaru.style.color = '#fff';
          btnNotaBaru.addEventListener('click', (e) => {
            e.preventDefault();
            buatNota(modal);
          });
          btnCari.insertAdjacentElement('beforebegin', btnNotaBaru);
        }
      }
    } else {
      if (btnNota) btnNota.remove();
      // Tanpa data servis: tombol Buat Data di baris pencarian, sebelah kiri Pencarian
      if (!btnDataAda && btnCari && bolehFitur('buatData')) {
        const btnDataBaru = document.createElement('button');
        btnDataBaru.id = BTN_DATA_ID;
        btnDataBaru.type = 'button';
        btnDataBaru.textContent = 'Buat Data';
        btnDataBaru.className = btnCari.className;
        btnDataBaru.style.marginRight = '8px';
        btnDataBaru.style.background = '#0d6efd';
        btnDataBaru.style.borderColor = '#0d6efd';
        btnDataBaru.style.color = '#fff';
        btnDataBaru.addEventListener('click', (e) => {
          e.preventDefault();
          buatData(modal);
        });
        btnCari.insertAdjacentElement('beforebegin', btnDataBaru);
      }
    }
  }

  // Gaya tampilan. Semua aturan memakai kelas .tm-lacak (hanya dipasang untuk yang punya fitur lacakOtomatis),
  // kecuali penanda baris terpilih. Bagian tm-kontak-* mengatur susunan Telp dan Alamat, dan ditumpuk di layar kecil.
  const style = document.createElement('style');
  style.textContent = '.' + SEL_CLASS + ' td { background: #fff3b0 !important; }' +
    ' .tm-lacak table thead th, .tm-lacak table thead td { position: sticky; top: 0; z-index: 2; background: #e9ecef; }' +
    ' .tm-lacak { overflow-x: hidden; }' +
    ' .tm-lacak .modal-dialog { width: min(96vw, 1040px); max-width: min(96vw, 1040px); margin: 1rem auto; }' +
    ' .tm-lacak .modal-content { max-height: 92vh; }' +
    ' .tm-lacak .modal-body { max-height: calc(92vh - 130px); overflow: auto; }' +
    ' .tm-lacak .modal-body .row { display: flex; flex-wrap: wrap; }' +
    ' .tm-lacak .modal-body .row > [class*="col"] { flex: 1 1 200px; min-width: 0; max-width: 100%; }' +
    ' .tm-lacak .modal-body input, .tm-lacak .modal-body select { max-width: 100%; }' +
    ' .tm-lacak table { max-width: 100%; }' +
    ' .tm-telp-saran { position: fixed; z-index: 2000; background: #fff; border: 1px solid #bbb; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,.15); max-height: 260px; overflow: auto; font-size: 13px; }' +
    ' .tm-telp-item { padding: 6px 10px; cursor: pointer; }' +
    ' .tm-telp-item:hover { background: #e8f0fe; }' +
    ' .tm-lacak.tm-tabel-sembunyi .tm-tabel-wadah, .tm-lacak.tm-tabel-sembunyi #tm-kolom-btn { display: none !important; }' +
    ' .tm-lacak .modal-body { overflow-x: hidden !important; overflow-y: auto !important; }' +
    ' .tm-lacak .modal-body table { width: 100%; border-collapse: collapse; }' +
    ' .tm-lacak .modal-body table th, .tm-lacak .modal-body table td { border: 1px solid #dee2e6 !important; }' +
    ' .tm-lacak .modal-body table th, .tm-lacak .modal-body table td { white-space: nowrap; }' +
    ' .tm-lacak .modal-body table .tm-kol-keluhan, .tm-lacak .modal-body table .tm-kol-tindakan { white-space: normal !important; width: 200px; }' +
    ' .tm-lacak .modal-body table .tm-kol-pelanggan { white-space: normal !important; width: 150px; }' +
    ' .tm-kolom-btn { display: none; }' +
    ' .tm-kontak-tombol.tm-tombol-baris > * { flex: 0 0 auto !important; }' +
    ' .tm-kontak-wrap > * { flex-shrink: 0; }' +
    ' .tm-lacak .tm-kontak-row { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: end; }' +
    ' .tm-lacak .tm-kontak-row > * { flex: 1 1 200px !important; min-width: 0 !important; max-width: 100% !important; width: auto !important; }' +
    ' .tm-lacak .tm-kontak-row > .tm-kontak-wrap { flex: 0 0 100% !important; }' +
    ' .tm-kontak-wrap { display: flex; flex-wrap: wrap; align-items: flex-end; row-gap: 8px; }' +
    ' .tm-kontak-baris { flex: 0 0 auto; }' +
    ' .tm-kontak-tombol { display: flex; justify-content: flex-end; align-items: flex-end; flex: 0 0 auto; gap: 6px; }' +
    ' .tm-kontak-tombol > * { margin: 0 !important; flex: 1 1 0; min-width: 0; }' +
    ' .tm-kontak-tombol > #tm-reset-btn { flex: 0 0 30px; }' +
    ' .tm-lacak #pencarian_nama_pelanggan, .tm-lacak #pencarian_kode, .tm-lacak #pencarian_unit, .tm-lacak #pencarian_serial_number, .tm-lacak #tm-kontak-telp, .tm-lacak #tm-kontak-alamat { height: 30px !important; font-size: 13px !important; box-sizing: border-box !important; }' +
    ' .tm-lacak #tm-buat-nota-btn, .tm-lacak #tm-buat-data-btn, .tm-lacak #lacak_servis_cari { height: 30px !important; padding: 0 8px !important; font-size: 13px !important; white-space: nowrap !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; box-sizing: border-box !important; }' +
    ' .tm-lacak #tm-reset-btn { width: 30px !important; height: 30px !important; padding: 0 !important; font-size: 13px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; box-sizing: border-box !important; }' +
    ' .tm-lacak #tm-reset-btn svg { flex: 0 0 18px; width: 18px; height: 18px; }' +
    ' .tm-kontak-baris { box-sizing: border-box; min-width: 0; }' +
    ' .tm-kontak-baris input { width: 100%; max-width: 100%; box-sizing: border-box; }' +
    ' @media (max-width: 640px) {' +
    '  .tm-lacak .modal-dialog { width: calc(100vw - 16px); max-width: calc(100vw - 16px); margin: 8px auto; }' +
    '  .tm-lacak .modal-content { max-height: 94vh; }' +
    '  .tm-lacak .modal-body { max-height: calc(94vh - 120px); padding: 12px; overflow: auto; }' +
    '  .tm-lacak .modal-body .row { display: grid; grid-template-columns: 1fr; gap: 8px; }' +
    '  .tm-lacak .modal-body .row > div { min-width: 0; max-width: 100%; }' +
    '  .tm-lacak .modal-body table { font-size: 12px; }' +
    '  .tm-lacak .modal-body table th, .tm-lacak .modal-body table td { padding: 4px 5px; }' +
    '  .tm-kolom-btn { display: inline-block !important; margin: 0 0 6px 0; }' +
    '  .tm-lacak .modal-body table .tm-kol-opsional { display: none !important; }' +
    '  .tm-lacak.tm-kolom-penuh .modal-body table .tm-kol-opsional { display: table-cell !important; }' +
    '  .tm-lacak .modal-body table .tm-kol-keluhan { width: 150px; }' +
    '  .tm-lacak .modal-body table .tm-kol-pelanggan { width: 100px; }' +
    '  .tm-lacak .tm-kontak-row { display: grid; grid-template-columns: 1fr; gap: 8px; }' +
    '  .tm-lacak .tm-kontak-row > * { flex: none !important; width: 100% !important; }' +
    '  .tm-kontak-wrap { display: block; }' +
    '  .tm-kontak-baris { width: 100% !important; margin: 0 0 8px 0 !important; }' +
    '  .tm-kontak-tombol { width: 100% !important; margin: 0 0 8px 0 !important; justify-content: flex-start !important; }' +
    ' }';
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
  // Posisi Telp dan Alamat dihitung ulang saat ukuran layar berubah
  window.addEventListener('resize', () => {
    const modal = findModal();
    if (modal && bolehFitur('lacakOtomatis')) sejajarkanKontak(modal);
  });
  console.log('[antrianservis.js] v1.13.69 aktif');
  ensureButton();
})();
