// ==UserScript==
// @name         Smart Repair - Format Rp & Jumlah angka saja
// @namespace    devtim-lab
// @version      2.7.8
// @description  Format Rp pada Harga Jual Servis, Harga, Diskon, Total, Ongkos Kirim, dan Potongan (tampil Rp 2,000, sen tetap terbaca). Uang Muka menampilkan Informasi Saldo Kas/Bank. Kolom Jumlah hanya angka dan titik desimal. Tanggal Selesai di popup Pengambilan Servis otomatis hari ini. Status Servis tampil di daftar Kelola Servis.
// @match        https://*.erzap.com/servis_elektroniks/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user. Kosong = tidak ada fitur untuk umum.
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua).
  //              Nama fitur: formatRp (seluruh script ini).
  // "role"    -> "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil),
  //              "fitur" = fitur private yang boleh dipakai role itu.
  // Fitur yang tidak disebut di "public" maupun "private" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
  const AKSES_JSON = `{
        "public": [],
        "private": ["formatRp"],
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
            fitur: Array.isArray(r.fitur) ? r.fitur.map(String) : []
          };
        })
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

  // Seluruh fitur script dijalankan dalam mulai(), hanya jika akses formatRp diizinkan.
  function mulai() {
  // ===== Kolom berformat Rp =====
  const SEL = [
    'input.harga_jual_servis, input[name$="[harga_jual_servis]"]',
    'input.harga_pokok_servis, input[name$="[harga_pokok_servis]"]',
    'input.harga_jual, input[name$="[harga_jual]"]',
    'input.harga_jual_penyesuaian, input[name$="[harga_jual_penyesuaian]"]',
    'input.diskon, input[name$="[diskon]"]',
    'input[name$="[fake_beban_angkut]"], input[name$="[fake_potongan]"]',
    'input[name$="[uang_muka]"]'
  ].join(', ');
  const PREFIX = 'Rp ';

  // Akses langsung ke nilai asli input (tanpa patch)
  const NATIVE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const rawGet = (el) => NATIVE.get.call(el);
  const rawSet = (el, v) => NATIVE.set.call(el, v);

  // Pecah teks jadi bagian bulat (ip) dan desimal (dp, null jika tidak ada titik). Mengikuti erzap_trans_beban.js.
  function rpParts(text) {
    const t = String(text == null ? '' : text).replace(/Rp/gi, '').replace(/\s+/g, '').replace(/,/g, '');
    const i = t.indexOf('.');
    const ip = (i >= 0 ? t.slice(0, i) : t).replace(/\D/g, '').slice(0, 15);
    const dp = i >= 0 ? t.slice(i + 1).replace(/\D/g, '').slice(0, 2) : null;
    return { ip, dp };
  }

  // Tampilan: "Rp 2,000" / "Rp 2,000." / "Rp 2,000.50". Desimal hanya tampil kalau memang diketik.
  function rpFmt(p) {
    if (p.ip === '' && (p.dp === null || p.dp === '')) return '';
    const ip = p.ip === '' ? '0' : String(parseInt(p.ip, 10));
    let s = PREFIX + ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (p.dp !== null) s += '.' + p.dp;
    return s;
  }

  // Angka yang dibaca aplikasi dan dikirim ke server: "2000" atau "2000.50". Sen tidak dibuang.
  function rpRaw(p) {
    if (p.ip === '' && (p.dp === null || p.dp === '')) return '';
    const ip = p.ip === '' ? '0' : String(parseInt(p.ip, 10));
    return (p.dp !== null && p.dp !== '') ? ip + '.' + p.dp : ip;
  }

  // Tampilan selalu mengikuti rpFmt. Dipanggil saat mengetik, masuk, keluar kolom, dan saat halaman dibuka.
  const formatEl = (el) => {
    const cur = String(rawGet(el) || '');
    const out = rpFmt(rpParts(cur));
    if (cur !== out) rawSet(el, out);
  };

  const isTarget = (el) => !!(el && el.matches && el.matches(SEL));

  // Aplikasi membaca nilai input langsung (value / jQuery .val()).
  // Patch ini membuat pembacaan selalu mendapat angka murni, sementara tampilan tetap "Rp ...".
  const patch = (el) => {
    if (!isTarget(el) || el.__srepairPatched) return;
    el.__srepairPatched = true;
    Object.defineProperty(el, 'value', {
      configurable: true,
      get() { return rpRaw(rpParts(rawGet(this))); },
      set(v) { rawSet(this, v); formatEl(this); }
    });
  };

  // Patch juga untuk baris yang diisi lewat jQuery .val()
  if (window.jQuery && !jQuery.fn.__srepairHooked) {
    const origVal = jQuery.fn.val;
    jQuery.fn.val = function (...args) {
      const first = this[0];
      if (isTarget(first)) patch(first);
      return origVal.apply(this, args);
    };
    jQuery.fn.__srepairHooked = true;
  }

  // ===== Kolom Jumlah: hanya angka dan satu titik desimal =====
  const JUMLAH_SEL = 'input.jumlah_produk, input[name$="[jumlah]"]';
  const isJumlah = (el) => !!(el && el.matches && el.matches(JUMLAH_SEL));
  const cleanJumlah = (v) => {
    const s = String(v || '').replace(/[^\d.]/g, '');
    const i = s.indexOf('.');
    return i === -1 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  };

  // Huruf/simbol dan titik kedua diblokir sebelum masuk ke kolom
  document.addEventListener('beforeinput', (e) => {
    if (!isJumlah(e.target)) return;
    if (!e.inputType || !e.inputType.startsWith('insert') || !e.data) return;
    const hasDot = e.target.value.includes('.');
    if (/[^\d.]/.test(e.data) || (e.data.includes('.') && hasDot)) e.preventDefault();
  }, true);

  // Jika tetap ada (mis. lewat paste), buang karakter yang tidak valid
  document.addEventListener('input', (e) => {
    if (isJumlah(e.target)) {
      const clean = cleanJumlah(e.target.value);
      if (e.target.value !== clean) e.target.value = clean;
    }
  });

  // ===== Event kolom Rp =====
  document.addEventListener('input', (e) => {
    if (!isTarget(e.target)) return;
    const el = e.target;
    const sebelum = String(rawGet(el) || '');
    formatEl(el);
    // Tampilan berubah: kirim input supaya perhitungan ERZAP ikut berubah saat mengetik.
    // Tidak berulang: event kedua tidak mengubah tampilan lagi, jadi tidak dikirim ulang.
    if (String(rawGet(el) || '') !== sebelum) el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  document.addEventListener('focusin', (e) => {
    if (isTarget(e.target)) {
      patch(e.target);
      formatEl(e.target);
    }
  });

  document.addEventListener('focusout', (e) => {
    if (isTarget(e.target)) formatEl(e.target);
  });

  // Sebelum form dikirim, pastikan nilai asli berupa angka murni
  document.addEventListener('submit', (e) => {
    e.target.querySelectorAll(SEL).forEach((el) => {
      rawSet(el, rpRaw(rpParts(rawGet(el))));
    });
  }, true);

  // ===== Pengambilan Servis: Tanggal Selesai otomatis hari ini =====
  // Hanya diisi jika kosong, sehingga tanggal yang sudah tersimpan tidak tertimpa.
  const todayDMY = () => {
    const g = document.getElementById('global_current_date');
    if (g && g.value) return g.value;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(new Date()).replace(/\//g, '-');
  };
  const fillTanggalSelesai = () => {
    const el = document.getElementById('tanggal_ditutup');
    if (!el || el.value) return;
    el.value = todayDMY();
    if (window.jQuery) jQuery(el).trigger('change');
  };
  if (window.jQuery) {
    jQuery(document).on('shown.bs.modal', '#modal_pengembalian_servis', fillTanggalSelesai);
  }

  // ===== Uang Muka: Informasi Saldo Kas/Bank =====
  // Saldo diambil dengan fungsi check_saldo yang sudah ada di halaman (sama seperti halaman Beban).
  // Sebelum = saldo kas/bank, Sesudah = Sebelum + Jumlah Uang Muka.
  const KAS_UM_ID = 'servis_elektronik_idperkiraan_kas_bank_uang_muka';
  const UM_ID = 'servis_elektronik_uang_muka';
  const saldoCache = {};
  const fmtSaldo = (n) => PREFIX + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const getSaldo = (idPerkiraan, tanggal) => {
    const key = idPerkiraan + '|' + tanggal;
    if (saldoCache[key] !== undefined) return saldoCache[key];
    let v = 0;
    if (typeof window.check_saldo === 'function') {
      v = parseFloat(String(check_saldo(idPerkiraan, tanggal)).replace(/[^\d.\-]/g, '')) || 0;
    }
    saldoCache[key] = v;
    return v;
  };
  const saldoTable = (nama, sebelum, sesudah) => {
    const th = 'style="padding:3px 4px;text-align:right;font-weight:600;"';
    const td = 'style="padding:3px 4px;border-top:1px solid #e5e5e5;text-align:right;word-break:break-word;"';
    return '<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">' +
      '<thead><tr><th style="padding:3px 4px;text-align:left;font-weight:600;">Saldo Kas/Bank</th>' +
      '<th ' + th + '>Sebelum</th><th ' + th + '>Sesudah</th></tr></thead>' +
      '<tbody><tr><td style="padding:3px 4px;border-top:1px solid #e5e5e5;word-break:break-word;">' + escHtml(nama) + '</td>' +
      '<td ' + td + '>' + fmtSaldo(sebelum) + '</td>' +
      '<td ' + td + '>' + fmtSaldo(sesudah) + '</td></tr></tbody></table>';
  };
  const renderSaldoUM = () => {
    const sel = document.getElementById(KAS_UM_ID);
    if (!sel) return;
    // Tabel digabung ke kotak Uang Muka: tepat di bawahnya dengan lebar yang sama.
    const anchor = document.querySelector('.div_uang_muka') || sel;
    let panel = document.getElementById('srepair_saldo_um');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'srepair_saldo_um';
    }
    panel.style.cssText = 'width:100%;margin:6px 0 0;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;background:#fafafa;box-sizing:border-box;';
    if (panel.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement('afterend', panel);
    }
    if (!sel.value || !anchor.offsetParent) { panel.style.display = 'none'; return; }
    const tgl = (document.getElementById('servis_elektronik_tanggal_uang_muka') || {}).value || todayDMY();
    const sebelum = getSaldo(sel.value, tgl);
    const um = parseFloat(String((document.getElementById(UM_ID) || {}).value || '').replace(/[^\d.]/g, '')) || 0;
    const sesudah = sebelum + um;
    const nama = (sel.options[sel.selectedIndex] || {}).textContent || '';
    panel.style.display = '';
    panel.innerHTML = saldoTable(nama.trim(), sebelum, sesudah);
  };
  document.addEventListener('change', (e) => {
    if (e.target && (e.target.id === KAS_UM_ID || e.target.id === UM_ID)) renderSaldoUM();
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === UM_ID) renderSaldoUM();
  });
  // Pindah Rawat Inap / Quick Servis: tabel ikut tersembunyi bersama kotak Uang Muka.
  // Ditunda sedikit supaya dijalankan setelah aplikasi selesai menampilkan/menyembunyikan kotak.
  const onJenisServis = (e) => {
    if (e.target && e.target.name && e.target.name.indexOf('is_rawat_inap') !== -1) setTimeout(renderSaldoUM, 0);
  };
  document.addEventListener('change', onJenisServis);
  document.addEventListener('click', onJenisServis);

  // ===== Tanda wajib (*) merah pada Bukti Pembayaran =====
  const markRequired = () => {
    const inp = document.getElementById('servis_elektronik_detail1_bukti_pembayaran');
    const wrap = inp && inp.closest('.field');
    const lbl = wrap && wrap.querySelector('label');
    if (!lbl || lbl.querySelector('.srepair-req')) return;
    lbl.insertAdjacentHTML('afterbegin', '<span class="srepair-req" style="color:#d00;font-weight:bold;">*</span> ');
  };

  // ===== Daftar Kelola Servis: Status Servis (dari Proses Servis) di bawah Kode Servis tiap baris =====
  const STATUS_CACHE = {};
  // Batas permintaan bersamaan supaya daftar yang panjang tidak membebani server
  const STATUS_PARALEL = 4;
  let statusAktif = 0;
  const statusAntrian = [];
  const statusJalan = () => {
    while (statusAktif < STATUS_PARALEL && statusAntrian.length) {
      const kerja = statusAntrian.shift();
      statusAktif++;
      kerja().finally(() => { statusAktif--; statusJalan(); });
    }
  };
  const fetchStatusServis = (id) => {
    if (!STATUS_CACHE[id]) {
      STATUS_CACHE[id] = new Promise((resolve) => {
        statusAntrian.push(() => fetch('/servis_elektroniks/kelola_servis/' + id, { credentials: 'same-origin' })
          .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
          .then((html) => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const s = doc.getElementById('servis_elektronik_detail1_status_servis');
            return s && s.selectedIndex >= 0 ? s.options[s.selectedIndex].textContent.trim() : '';
          })
          .catch(() => { delete STATUS_CACHE[id]; return ''; })   // gagal: tidak disimpan, bisa dicoba lagi
          .then(resolve));
        statusJalan();
      });
    }
    return STATUS_CACHE[id];
  };
  const addStatusKode = () => {
    const table = document.getElementById('data_table');
    if (!table) return;
    const cari = [...table.querySelectorAll('thead th')].findIndex((th) => th.textContent.trim().toLowerCase() === 'kode servis');
    const idxKode = cari >= 0 ? cari : 4;   // cadangan: indeks lama kalau header tidak ketemu
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const kodeTd = tr.children[idxKode]; // kolom Kode Servis
      const link = tr.querySelector('a[href*="/servis_elektroniks/kelola_servis/"]');
      const m = link && link.getAttribute('href').match(/kelola_servis\/(\d+)/);
      if (!kodeTd || !m || kodeTd.querySelector('.srepair-status-servis')) return;
      const span = document.createElement('div');
      span.className = 'srepair-status-servis';
      span.style.cssText = 'display:block;width:100%;box-sizing:border-box;font-size:11px;line-height:1.3;color:#333;background:#fff176;padding:1px 4px;margin-top:2px;border-radius:3px;white-space:normal;word-break:break-word;';
      span.textContent = 'Status: memuat...';
      kodeTd.appendChild(span);
      fetchStatusServis(m[1]).then((st) => { span.textContent = 'Status: ' + (st || '-'); });
    });
  };
  const initStatusKode = () => {
    if (!document.getElementById('data_table')) return;
    addStatusKode();
    if (window.jQuery) jQuery('#data_table').on('draw.dt', addStatusKode);
  };

  // Format nilai yang sudah ada saat halaman dibuka (mis. "12500.00" dari database)
  const init = () => {
    document.querySelectorAll(SEL).forEach((el) => {
      patch(el);
      formatEl(el);
    });
    renderSaldoUM();
    markRequired();
    initStatusKode();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  }

  // Nama kasir di #info_kasir bisa dimuat belakangan, jadi tunggu dulu (maks 15 detik).
  // Kalau akses tidak cocok sampai batas waktu, script tidak dijalankan.
  const kasirSiap = () => (((document.getElementById('info_kasir') || {}).textContent) || '').trim() !== '';
  let coba = 0;
  const timer = setInterval(() => {
    coba++;
    if (!kasirSiap() && coba < 50) return;
    clearInterval(timer);
    if (bolehFitur('formatRp')) mulai();
  }, 300);
})();
