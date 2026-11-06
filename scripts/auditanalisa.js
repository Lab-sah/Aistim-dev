// ==UserScript==
// @name         ERZAP - Audit Analisa (Laba Rugi & Neraca)
// @namespace    http://tampermonkey.net/
// @version      1.1.1
// @description  Tombol "Audit Analisa" di sebelah AI Insight pada Laporan Laba Rugi dan Neraca ERZAP. Dihitung dari angka tabel (tanpa AI). Fitur diatur lewat AKSES_JSON (admin/private/public).
// @match        https://*.erzap.com/laporans/laporan_laba_rugi/*
// @match        https://*.erzap.com/laporans/neraca/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini.
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua). Nama fitur: auditLabaRugi (tombol Audit Analisa di Laba Rugi), auditNeraca (tombol Audit Analisa di Neraca).
  // "role"    -> nama-nama role: "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
  //              cukup sebagian nama; isi nama lengkap persis seperti di ERZAP), "fitur" = fitur private yang boleh dipakai role itu.
  // Fitur yang tidak disebut di "public" maupun "private" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
  // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script dan muat ulang halaman ERZAP.
  const AKSES_JSON = `{
    "public": [],
    "private": ["auditLabaRugi", "auditNeraca"],
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
      console.error('[auditanalisa] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { public: [], role: [] };
    }
  }
  const AKSES = bacaAkses();

  // dicek saat dipakai (bukan sekali di awal), karena nama kasir di pojok ERZAP bisa dimuat belakangan
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

  // ==========================================================
  // [BAGIAN 1 - UTILITAS] fungsi bantu umum: parsing angka, format, escape
  // ==========================================================
  const parseNum = s => {
    s = (s || '').trim();
    if (!/\d/.test(s)) return null;
    const neg = /\(|^-/.test(s);
    let t = s.replace(/[^0-9.,]/g, '');
    // format Indonesia: titik sebagai pemisah ribuan, koma sebagai desimal (1.234.567 / 1.234.567,89)
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    // koma desimal tanpa titik ribuan (12,5)
    else if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.');
    // format Inggris: koma sebagai pemisah ribuan (1,234,567.89)
    else t = t.replace(/,/g, '');
    const v = parseFloat(t);
    if (isNaN(v)) return null;
    return neg ? -v : v;
  };
  const fmt = n => (n < 0 ? '-' : '') + 'Rp ' + Math.round(Math.abs(n)).toLocaleString('en-US');
  const dec = (x, d) => x.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = x => (isFinite(x) ? dec(x * 100, 1) + '%' : '-');
  const sPct = x => (isFinite(x) ? (x >= 0 ? '+' : '') + dec(x * 100, 1) + '%' : '-');
  const rat = x => (isFinite(x) ? dec(x, 2) + ' kali' : '-');
  const dirTxt = x => (x >= 0 ? 'naik' : 'turun');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const colorOf = { warn: '#b45309', info: '#1d4ed8', ok: '#15803d' };

  // ==========================================================
  // [BAGIAN 2 - AUDIT LABA RUGI] membaca tabel laba rugi & menghitung temuan
  // Keluaran: { title, summary (HTML), flags: [{l, t}], extra (HTML) }
  // ==========================================================
  function auditLabaRugi() {
    // Tabel laporan = tabel yang baris headernya diakhiri "Total" (bukan sembarang tabel di halaman)
    const readTable = () => {
      const out = { cols: [], R: {} };
      for (const t of document.querySelectorAll('table')) {
        let hdr = null;
        for (const r of t.rows) {
          const c = [...r.cells].map(x => x.textContent.trim());
          if (c.length >= 3 && c[c.length - 1] === 'Total' && c.slice(1).every(x => !/\d/.test(x))) { hdr = c; break; }
        }
        if (!hdr) continue;
        out.cols = hdr.slice(1);
        const n = out.cols.length;
        for (const r of t.rows) {
          const c = [...r.cells].map(x => x.textContent.trim());
          if (c.length !== n + 1) continue;
          const vals = c.slice(1).map(parseNum);
          if (vals.some(v => v === null)) continue;
          if (!out.R[c[0]]) out.R[c[0]] = { label: c[0], v: vals };
        }
        return out;
      }
      return out;
    };

    const { cols, R } = readTable();
    const n = cols.length;
    if (!n) return { empty: true, title: 'Audit Analisa Laba Rugi' };
    const T = n - 1;
    const bulan = cols.slice(0, T);
    // baris yang dipakai pemeriksaan; yang tidak terbaca dicatat, pemeriksaan yang memakainya dilewati (bukan dianggap Rp 0)
    const KUNCI = ['Penjualan', 'Penjualan Bersih', 'Harga Pokok Penjualan', 'Laba Kotor Penjualan', 'Total Beban', 'Laba/Rugi Operasional',
      'Total Pendapatan (Beban) Lain-lain', 'Laba/Rugi Bersih Sebelum Pajak', 'Pajak Penghasilan (PPh)', 'Laba/Rugi Bersih Setelah Pajak', 'Retur Penjualan'];
    const kurang = KUNCI.filter(k => !R[k]);
    const ada = (...names) => names.every(k => R[k]);
    const g = name => (R[name] ? R[name].v : new Array(n).fill(0));
    const pb = g('Penjualan Bersih'), pk = g('Penjualan'), hpp = g('Harga Pokok Penjualan');
    const lk = g('Laba Kotor Penjualan'), beban = g('Total Beban'), lo = g('Laba/Rugi Operasional');
    const lain = g('Total Pendapatan (Beban) Lain-lain'), sp = g('Laba/Rugi Bersih Sebelum Pajak');
    const pph = g('Pajak Penghasilan (PPh)'), lb = g('Laba/Rugi Bersih Setelah Pajak'), retur = g('Retur Penjualan');
    const missing = kurang.length > 0;

    const idx = [...Array(n).keys()];
    const metrics = idx.map(i => ({
      pb: pb[i], lk: lk[i], lo: lo[i], lb: lb[i],
      gm: lk[i] / pb[i], br: beban[i] / pb[i], om: lo[i] / pb[i], nm: lb[i] / pb[i],
      rr: Math.abs(retur[i]) / pk[i]
    }));
    // perubahan vs bulan lalu hanya dihitung bila bulan lalu tidak nol (hindari "naik -" / tak hingga)
    const pbMom = idx.map(i => (i >= 1 && i < T && pb[i - 1] !== 0 ? (pb[i] - pb[i - 1]) / Math.abs(pb[i - 1]) : NaN));
    const loMom = idx.map(i => (i >= 1 && i < T && lo[i - 1] !== 0 ? (lo[i] - lo[i - 1]) / Math.abs(lo[i - 1]) : NaN));

    const flags = [];
    if (missing) flags.push({ l: 'warn', t: 'Baris tidak terbaca di tabel: ' + kurang.join(', ') + '. Pemeriksaan yang memakai baris ini dilewati. Pastikan laporan sudah selesai dimuat.' });

    let cek = 0, gagal = 0;
    for (let i = 0; i < n; i++) {
      const nm = cols[i];
      if (ada('Penjualan Bersih', 'Harga Pokok Penjualan', 'Laba Kotor Penjualan')) {
        cek++;
        if (Math.abs(pb[i] + hpp[i] - lk[i]) > 1) { gagal++; flags.push({ l: 'warn', t: `Laba kotor ${nm} tidak sama dengan penjualan bersih dikurangi HPP.` }); }
      }
      if (ada('Laba Kotor Penjualan', 'Total Beban', 'Laba/Rugi Operasional')) {
        cek++;
        if (Math.abs(lk[i] - beban[i] - lo[i]) > 1) { gagal++; flags.push({ l: 'warn', t: `Laba operasional ${nm} tidak sama dengan laba kotor dikurangi total beban.` }); }
      }
      if (ada('Laba/Rugi Operasional', 'Total Pendapatan (Beban) Lain-lain', 'Laba/Rugi Bersih Sebelum Pajak')) {
        cek++;
        if (Math.abs(lo[i] + lain[i] - sp[i]) > 1) { gagal++; flags.push({ l: 'warn', t: `Laba sebelum pajak ${nm} tidak cocok dengan laba operasional ditambah lain-lain.` }); }
      }
      if (ada('Laba/Rugi Bersih Sebelum Pajak', 'Pajak Penghasilan (PPh)', 'Laba/Rugi Bersih Setelah Pajak')) {
        cek++;
        if (Math.abs(sp[i] - pph[i] - lb[i]) > 1) { gagal++; flags.push({ l: 'warn', t: `Laba bersih ${nm} tidak sama dengan laba sebelum pajak dikurangi PPh.` }); }
      }
    }
    if (cek && !gagal) flags.push({ l: 'ok', t: 'Semua subtotal yang bisa diperiksa cocok dengan komponennya.' });

    if (ada('Pajak Penghasilan (PPh)', 'Laba/Rugi Bersih Sebelum Pajak')) {
      const pphNol = bulan.filter((b, i) => pph[i] === 0 && sp[i] > 0);
      if (pphNol.length) flags.push({ l: 'warn', t: `PPh Rp 0 pada ${pphNol.join(', ')}, padahal laba sebelum pajaknya positif. Pastikan pajak sudah dicatat.` });
    }
    if (ada('Retur Penjualan', 'Penjualan') && metrics[T].rr > 0.05) flags.push({ l: 'warn', t: `Retur penjualan total ${pct(metrics[T].rr)} dari penjualan kotor (di atas 5%). Perlu ditelusuri penyebabnya.` });

    for (let i = 1; i < T; i++) {
      if (isFinite(pbMom[i]) && Math.abs(pbMom[i]) >= 0.10) flags.push({ l: 'info', t: `Penjualan bersih ${bulan[i]} vs ${bulan[i - 1]} ${dirTxt(pbMom[i])} ${pct(Math.abs(pbMom[i]))}.` });
      if (isFinite(loMom[i]) && Math.abs(loMom[i]) >= 0.10) flags.push({ l: loMom[i] < 0 ? 'warn' : 'info', t: `Laba operasional ${bulan[i]} vs ${bulan[i - 1]} ${dirTxt(loMom[i])} ${pct(Math.abs(loMom[i]))}.` });
    }

    const expenses = Object.values(R).filter(r => /^Beban/.test(r.label) && !/^Total/.test(r.label));
    for (const r of expenses) {
      for (let i = 1; i < T; i++) {
        const a = r.v[i - 1], b = r.v[i];
        if (a > 0 && (b - a) / a > 0.5 && Math.abs(b - a) > 10000000) flags.push({ l: 'warn', t: `${r.label} naik ${pct((b - a) / a)} di ${bulan[i]} (${fmt(a)} ke ${fmt(b)}).` });
      }
    }
    for (const r of expenses) {
      if (/Sanksi|Denda/i.test(r.label) && r.v[T] !== 0) flags.push({ l: 'info', t: `${r.label} total ${fmt(r.v[T])}. Pos ini sebaiknya ditelusuri.` });
    }

    const isKey = label => /^(Laba kotor|Laba operasional|Laba bersih|Penjualan bersih)/.test(label);
    const row = (label, vals) => {
      const b = isKey(label) ? 'font-weight:700;' : '';
      return `<tr><td class="ajs-lbl" style="padding:5px 8px;${b}">${esc(label)}</td>` +
        vals.map(v => `<td style="padding:5px 8px;text-align:right;white-space:nowrap;${b}">${v}</td>`).join('') + '</tr>';
    };
    const momVals = arr => arr.map((v, i) => (i === T ? '' : (isNaN(v) ? '-' : sPct(v))));
    const hdrCells = cols.map(c => `<th style="padding:4px 8px;text-align:right;white-space:nowrap">${esc(c)}</th>`).join('');
    const summary = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="border-bottom:1px solid #ddd"><th class="ajs-corner" style="text-align:left;padding:4px 8px"></th>${hdrCells}</tr>
      ${row('Penjualan bersih', metrics.map(m => fmt(m.pb)))}
      ${row('Penjualan vs bulan lalu', momVals(pbMom))}
      ${row('Laba kotor', metrics.map(m => fmt(m.lk)))}
      ${row('Margin laba kotor', metrics.map(m => pct(m.gm)))}
      ${row('Total beban / penjualan bersih', metrics.map(m => pct(m.br)))}
      ${row('Laba operasional', metrics.map(m => fmt(m.lo)))}
      ${row('Laba operasional vs bulan lalu', momVals(loMom))}
      ${row('Margin operasional', metrics.map(m => pct(m.om)))}
      ${row('Laba bersih setelah pajak', metrics.map(m => fmt(m.lb)))}
      ${row('Margin laba bersih', metrics.map(m => pct(m.nm)))}
      ${row('Retur / penjualan kotor', metrics.map(m => pct(m.rr)))}
      </table></div>`;

    const topExp = expenses.slice().sort((x, y) => Math.abs(y.v[T]) - Math.abs(x.v[T])).slice(0, 7);
    const extra = `<h4 style="margin:16px 0 4px">Beban terbesar (total periode)</h4>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="border-bottom:1px solid #ddd"><th class="ajs-corner" style="text-align:left;padding:4px 8px">Pos</th>${hdrCells}</tr>
      ${topExp.map(r => row(r.label, r.v.map(fmt))).join('')}
      </table></div>`;

    return { title: 'Audit Analisa Laba Rugi', summary, flags, extra, missing, empty: false };
  }

  // ==========================================================
  // [BAGIAN 3 - AUDIT NERACA] membaca tabel neraca & menghitung temuan
  // Keluaran: { title, summary (HTML), flags: [{l, t}], extra (HTML) }
  // ==========================================================
  function auditNeraca() {
    const rows = [];
    // tabel neraca = tabel yang punya baris "Total Harta" (bukan sembarang tabel di halaman)
    const t = [...document.querySelectorAll('table')].find(tb => [...tb.rows].some(r => r.cells[0] && r.cells[0].textContent.trim() === 'Total Harta'));
    if (t) {
      for (const r of t.rows) {
        const c = [...r.cells].map(x => x.textContent.trim());
        if (!c[0]) continue;
        const nums = c.slice(1).map(parseNum).filter(v => v !== null);
        rows.push({ label: c[0], v: nums.length ? nums[nums.length - 1] : null });
      }
    }
    const find = name => { const r = rows.find(x => x.label === name); return (r && r.v !== null) ? r.v : null; };
    const TH = find('Total Harta'), TKM = find('Total Kewajiban dan Modal'), TK = find('Total Kewajiban'), TM = find('Total Modal');
    const HL = find('Total Harta Lancar'), HT = find('Total Harta Tetap'), HLn = find('Total Harta Lainnya') || 0;
    const PS = find('Persediaan Barang Dagang') || 0, HD = find('Hutang Dagang') || 0, HP = find('Hutang Pajak');
    // pemeriksaan yang memakai nilai cadangan nol hanya jalan bila barisnya benar-benar terbaca
    const PS_ada = find('Persediaan Barang Dagang') !== null, HD_ada = find('Hutang Dagang') !== null, HLn_ada = find('Total Harta Lainnya') !== null;
    const PL = find('Piutang Lain') || 0;
    if (TH === null || TKM === null) return { empty: true, title: 'Audit Analisa Neraca' };

    const flags = [];
    const kurangN = ['Total Harta', 'Total Kewajiban dan Modal', 'Total Kewajiban', 'Total Modal', 'Total Harta Lancar', 'Total Harta Tetap'].filter(k => find(k) === null);
    if (kurangN.length) flags.push({ l: 'warn', t: 'Baris tidak terbaca di tabel: ' + kurangN.join(', ') + '. Pemeriksaan yang memakai baris ini dilewati.' });
    const selisih = TH - TKM;
    const bal = Math.abs(selisih) < 1;
    flags.push(bal ? { l: 'ok', t: 'Neraca seimbang: total harta sama dengan total kewajiban dan modal.' } : { l: 'warn', t: `Neraca TIDAK seimbang. Selisih ${fmt(selisih)}.` });
    if (HL !== null && HT !== null && HLn_ada && Math.abs(TH - (HL + HT + HLn)) > 1) flags.push({ l: 'warn', t: 'Total harta tidak sama dengan harta lancar ditambah harta tetap dan harta lainnya.' });
    if (TK !== null && TM !== null && Math.abs(TK + TM - TKM) > 1) flags.push({ l: 'warn', t: 'Total kewajiban ditambah total modal tidak sama dengan total kewajiban dan modal.' });

    // rasio hanya dihitung bila penyebutnya tidak nol; yang tidak bisa dihitung tampil "-"
    const cr = TK ? HL / TK : NaN, quick = (TK && PS_ada) ? (HL - PS) / TK : NaN, der = TM ? TK / TM : NaN, eq = TH ? TM / TH : NaN, psShare = HL ? PS / HL : NaN;
    if (cr < 1) flags.push({ l: 'warn', t: `Rasio lancar ${rat(cr)}, di bawah 1. Harta lancar tidak cukup menutup kewajiban.` });
    if (quick < 1) flags.push({ l: 'warn', t: `Rasio cepat (tanpa persediaan) ${rat(quick)}, di bawah 1.` });
    if (psShare > 0.5) flags.push({ l: 'info', t: `Persediaan barang dagang ${pct(psShare)} dari harta lancar.` });
    if (HD_ada && PS_ada && HD >= PS * 0.9) flags.push({ l: 'info', t: `Hutang dagang ${fmt(HD)} hampir sebesar persediaan ${fmt(PS)}. Perputaran persediaan perlu dicek agar bisa membayar pemasok.` });
    if (HL && PL / HL > 0.05) flags.push({ l: 'info', t: `Piutang lain ${fmt(PL)} (${pct(PL / HL)} dari harta lancar). Pos ini perlu ditelusuri.` });
    if (HP === 0) flags.push({ l: 'info', t: 'Hutang pajak Rp 0. Pastikan kewajiban pajak sudah dicatat, terutama bila PPh di laba rugi juga nol.' });
    rows.filter(r => /^(Bank|Kas)/.test(r.label) && r.v !== null && r.v < 0)
      .forEach(r => flags.push({ l: 'warn', t: `${r.label} saldo negatif ${fmt(r.v)}.` }));
    rows.filter(r => /^Piutang/.test(r.label) && r.v !== null && r.v < 0)
      .forEach(r => flags.push({ l: 'warn', t: `${r.label} saldo negatif ${fmt(r.v)}.` }));

    const line = (l, v) => `<tr><td style="padding:4px 8px">${esc(l)}</td><td style="padding:4px 8px;text-align:right;white-space:nowrap">${v}</td></tr>`;
    const summary = `<table style="width:100%;border-collapse:collapse;font-size:13px">
      ${line('Total harta', fmt(TH))}
      ${line('Total kewajiban', fmt(TK))}
      ${line('Total modal', fmt(TM))}
      ${line('Total kewajiban dan modal', fmt(TKM))}
      ${line('Selisih harta dan kewajiban+modal', fmt(selisih))}
      ${line('Rasio lancar', rat(cr))}
      ${line('Rasio cepat (tanpa persediaan)', rat(quick))}
      ${line('Utang terhadap modal (DER)', rat(der))}
      ${line('Modal terhadap total harta', pct(eq))}
      ${line('Persediaan / harta lancar', pct(psShare))}
      </table>`;
    return { title: 'Audit Analisa Neraca', summary, flags, extra: '', empty: false };
  }

  // ==========================================================
  // [BAGIAN 4 - PANEL & TOMBOL] tampilan popup dan tombol di sebelah AI Insight
  // Dipakai bersama oleh semua laporan. Ubah tampilan di sini saja.
  // ==========================================================
  const BTN_ID = 'btn_audit_analisa';
  const PANEL_ID = 'audit_analisa_panel';

  // Teks penjelasan yang tampil saat tombol "Penjelasan" ditekan
  const HELP_HTML = `
    <b>Warna temuan</b>
    <ul style="margin:6px 0 10px;padding-left:20px">
      <li><span style="color:#b45309;font-weight:bold">Oranye/cokelat</span>: perlu dicek. Bisa berarti kesalahan pencatatan atau kondisi berisiko, misalnya PPh Rp 0 padahal laba positif.</li>
      <li><span style="color:#1d4ed8;font-weight:bold">Biru</span>: informasi atau catatan perubahan. Tidak otomatis salah, tapi layak ditelusuri, misalnya penjualan naik 10% atau lebih.</li>
      <li><span style="color:#15803d;font-weight:bold">Hijau</span>: pemeriksaan lolos, misalnya subtotal sudah cocok.</li>
    </ul>
    <b>Istilah laba rugi</b>
    <ul style="margin:6px 0 10px;padding-left:20px">
      <li><b>Penjualan bersih</b>: penjualan setelah dikurangi potongan dan retur.</li>
      <li><b>Laba kotor</b>: penjualan bersih dikurangi harga pokok penjualan (HPP).</li>
      <li><b>Margin laba kotor</b>: persentase laba kotor dari penjualan bersih. Contoh 23,5% berarti dari setiap Rp 100 penjualan, Rp 23,5 tersisa setelah HPP.</li>
      <li><b>Total beban / penjualan bersih</b>: seberapa besar biaya operasional dibanding penjualan.</li>
      <li><b>Laba operasional</b>: laba kotor dikurangi total beban.</li>
      <li><b>Margin operasional / laba bersih</b>: persentase laba operasional atau laba bersih dari penjualan bersih.</li>
      <li><b>Retur / penjualan kotor</b>: persentase barang yang dikembalikan pembeli. Di atas 5% perlu ditelusuri.</li>
      <li><b>vs bulan lalu</b>: perubahan dibanding bulan sebelumnya. Tanda + berarti naik, tanda - berarti turun.</li>
    </ul>
    <b>Istilah neraca</b>
    <ul style="margin:6px 0 10px;padding-left:20px">
      <li><b>Selisih</b>: total harta dikurangi (kewajiban + modal). Nol berarti seimbang.</li>
      <li><b>Rasio lancar</b>: harta lancar dibagi kewajiban. Contoh 1,38 kali: setiap Rp 1 kewajiban ditutup oleh Rp 1,38 harta lancar. Di atas 1 umumnya berarti masih mampu membayar utang jangka pendek.</li>
      <li><b>Rasio cepat</b>: sama seperti rasio lancar, tapi persediaan dikeluarkan karena paling lambat dicairkan. Contoh 0,44 kali berarti tanpa persediaan, harta lancar hanya menutup 44% kewajiban.</li>
      <li><b>DER (utang terhadap modal)</b>: total kewajiban dibagi total modal. Contoh 1,27 kali: setiap Rp 1 modal dibiayai Rp 1,27 utang.</li>
      <li><b>Modal terhadap total harta</b>: bagian aset yang dibiayai modal sendiri. Contoh 44% berarti sisanya dibiayai utang.</li>
      <li><b>Persediaan / harta lancar</b>: seberapa besar harta lancar berbentuk barang dagangan.</li>
    </ul>
    <p style="color:#666;font-size:12px;margin:0">Penjelasan ini bersifat umum dan dihitung dari angka tabel. Keputusan tetap perlu dicek dengan data sumbernya.</p>`;

  function ensureStyle() {
    if (document.getElementById('audit_analisa_style')) return;
    const st = document.createElement('style');
    st.id = 'audit_analisa_style';
    st.textContent = `
      #${PANEL_ID} .ajs-body div[style*="overflow-x"] { -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; position: relative; border: 1px solid #e5e7eb; border-radius: 10px; margin: 8px 0 12px; }
      #${PANEL_ID} .ajs-body div[style*="overflow-x"] > table { width: 100%; min-width: max-content; }
      #${PANEL_ID} .ajs-body table { table-layout: auto; }
      #${PANEL_ID} .ajs-body td.ajs-lbl, #${PANEL_ID} .ajs-body th.ajs-corner { min-width: 150px; white-space: normal; line-height: 1.3; }
      #${PANEL_ID} .ajs-body tr:nth-child(even) td { background-color: #f8fafc; }
      #${PANEL_ID} .ajs-body tr:nth-child(even) td.ajs-lbl { background-color: #f8fafc; }
      #${PANEL_ID} .ajs-body tr:hover td { background-color: #fef2f2; }
      #${PANEL_ID} .ajs-body h4 { color: #7f1d1d; }
      #${PANEL_ID} .ajs-body table tr:first-child th { position: sticky; top: 0; z-index: 4; background: #fff; box-shadow: 0 2px 3px -2px rgba(0,0,0,.2); }
      #${PANEL_ID} .ajs-body table tr:first-child th.ajs-corner { z-index: 6; }
      #${PANEL_ID} .ajs-body th.ajs-corner { z-index: 3; }
      #${PANEL_ID} .ajs-body td:not(.ajs-lbl), #${PANEL_ID} .ajs-body th:not(.ajs-corner) { white-space: nowrap; }
      @media (min-width: 641px) and (max-width: 1024px) { #${PANEL_ID} .ajs-box { max-width: 92vw !important; } }
      @media (min-width: 1025px) { #${PANEL_ID} .ajs-box { max-width: 900px; } #${PANEL_ID} .ajs-body table { font-size: 13px; } }
      @media (max-width: 640px) {
        #${PANEL_ID} { padding: 0 !important; }
        #${PANEL_ID} .ajs-box { max-width: none !important; height: 100vh !important; border-radius: 0 !important; }
        #${PANEL_ID} .ajs-head { padding: 12px !important; }
        #${PANEL_ID} .ajs-head h3 { font-size: 16px !important; }
        #${PANEL_ID} .ajs-body { padding: 0 12px 16px !important; font-size: 12px; }
        #${PANEL_ID} .ajs-body h4 { font-size: 14px; }
        #${PANEL_ID} .ajs-body table { font-size: 11px !important; }
        #${PANEL_ID} .ajs-body td, #${PANEL_ID} .ajs-body th { padding: 3px 5px !important; }
        #${PANEL_ID} .ajs-body td.ajs-lbl, #${PANEL_ID} .ajs-body th.ajs-corner { min-width: 96px; max-width: 120px; }
        #${PANEL_ID} .ajs-head { flex-wrap: wrap; gap: 8px; }
        #${PANEL_ID} .ajs-head > div { width: 100%; justify-content: flex-end; }
        #${PANEL_ID} .ajs-head button { padding: 8px 12px !important; font-size: 13px; min-height: 36px; }
      }`;
    document.head.appendChild(st);
  }

  function showPanel(result) {
    document.getElementById(PANEL_ID)?.remove();
    ensureStyle();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue","Noto Sans","Liberation Sans",Arial,sans-serif;font-size:13px;line-height:1.5;';

    if (result.empty) {
      panel.innerHTML = `<div style="background:#fff;color:#222;padding:20px;border-radius:8px">Tabel belum ditemukan. Klik "Filter dan Lihat" atau tunggu halaman selesai dimuat, lalu coba lagi. <button id="audit_analisa_close">Tutup</button></div>`;
    } else {
      const flagHtml = result.flags.map(f => `<li style="margin:4px 0;color:${colorOf[f.l]}">${esc(f.t)}</li>`).join('') || '<li>Tidak ada temuan.</li>';
      panel.innerHTML = `<div class="ajs-box" style="position:relative;perspective:1400px;width:100%;max-width:900px;height:90vh;">
        <div class="ajs-inner" id="audit_analisa_inner" style="position:relative;height:100%;border-radius:8px;box-shadow:0 10px 30px rgba(185,28,28,.45);transition:transform .9s ease;transform-style:preserve-3d;-webkit-transform-style:preserve-3d">
          <div class="ajs-front" style="position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;color:#222;border-radius:8px;backface-visibility:hidden;-webkit-backface-visibility:hidden">
            <div class="ajs-head" style="flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee">
              <h3 style="margin:0;font-size:18px">${esc(result.title)}</h3>
              <div style="display:flex;gap:8px">
                <button id="audit_analisa_help" style="border:0;background:#b91c1c;color:#fff;padding:6px 12px;border-radius:4px;cursor:pointer">Penjelasan</button>
                <button id="audit_analisa_close" style="border:0;background:#7f1d1d;color:#fff;padding:6px 12px;border-radius:4px;cursor:pointer">Tutup</button>
              </div>
            </div>
            <div class="ajs-body" style="flex:1;overflow:auto;min-height:0;padding:0 20px 20px">
              <p style="font-size:12px;color:#666;margin:12px 0">Dihitung langsung dari angka di tabel, bukan dari AI.</p>
              ${result.missing ? '<p style="color:#b45309">Sebagian data belum termuat. Hasil mungkin tidak lengkap.</p>' : ''}
              <h4 style="margin:12px 0 4px">Ringkasan</h4>
              ${result.summary}
              <h4 style="margin:16px 0 4px">Temuan</h4>
              <ul style="margin:0;padding-left:20px;font-size:13px">${flagHtml}</ul>
              ${result.extra || ''}
            </div>
          </div>
          <div class="ajs-back" style="position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;color:#222;border-radius:8px;transform:rotateY(180deg);backface-visibility:hidden;-webkit-backface-visibility:hidden">
            <div class="ajs-head" style="flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee">
              <h3 style="margin:0;font-size:18px">Penjelasan</h3>
              <button id="audit_analisa_back" style="border:0;background:#b91c1c;color:#fff;padding:6px 12px;border-radius:4px;cursor:pointer">Kembali</button>
            </div>
            <div class="ajs-body" style="flex:1;overflow:auto;min-height:0;padding:12px 20px 20px;font-size:13px;line-height:1.5">${HELP_HTML}</div>
          </div>
        </div>
      </div>`;
    }
    document.body.appendChild(panel);
    const inner = document.getElementById('audit_analisa_inner');
    const flipTo = back => { if (inner) inner.style.transform = back ? 'rotateY(180deg)' : ''; };
    document.getElementById('audit_analisa_close').onclick = () => panel.remove();
    const helpBtn = document.getElementById('audit_analisa_help');
    const backBtn = document.getElementById('audit_analisa_back');
    if (helpBtn) helpBtn.onclick = () => flipTo(true);
    if (backBtn) backBtn.onclick = () => flipTo(false);
    panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });
    const tutupEsc = e => {
      if (!panel.isConnected) { document.removeEventListener('keydown', tutupEsc); return; }
      if (e.key === 'Escape') { panel.remove(); document.removeEventListener('keydown', tutupEsc); }
    };
    document.addEventListener('keydown', tutupEsc);
  }

  // ==========================================================
  // [BAGIAN 5 - ROUTING] pilih audit sesuai halaman yang sedang dibuka
  // Tambah halaman baru: tambahkan @match di header, lalu satu baris di sini.
  // ==========================================================
  function currentAudit() {
    const p = location.pathname;
    if (/laporan_laba_rugi/.test(p)) return { jalankan: auditLabaRugi, fitur: 'auditLabaRugi' };
    if (/\/laporans\/neraca/.test(p)) return { jalankan: auditNeraca, fitur: 'auditNeraca' };
    return null;
  }

  function injectButton() {
    const cur = currentAudit();
    const src = document.getElementById('btn_ai_insight');
    if (!cur || !src) return;
    if (!bolehFitur(cur.fitur)) return;   // user yang tidak diizinkan: tombol tidak dipasang
    if (document.getElementById(BTN_ID)) return;
    const btn = src.cloneNode(true);
    btn.id = BTN_ID;
    btn.removeAttribute('onclick');
    const icon = btn.querySelector('i');
    if (icon) icon.className = 'fa fa-calculator';
    const label = btn.querySelector('span');
    if (label) label.textContent = 'Audit Analisa';
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (!bolehFitur(cur.fitur)) return; showPanel(cur.jalankan()); });
    src.insertAdjacentElement('afterend', btn);
  }

  // ==========================================================
  // [BAGIAN 6 - JALANKAN]
  // ==========================================================
  // #info_kasir dan tombol AI Insight bisa muncul belakangan: pantau DOM sampai tombol terpasang (maks. 60 detik)
  const pasang = () => { injectButton(); return !!document.getElementById(BTN_ID); };
  document.getElementById(BTN_ID)?.remove();
  if (!pasang()) {
    const pantau = new MutationObserver(() => { if (pasang()) pantau.disconnect(); });
    pantau.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => pantau.disconnect(), 60000);
  }
})();
