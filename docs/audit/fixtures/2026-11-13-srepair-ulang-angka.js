// Uji fungsi angka format Rp di scripts/srepair.js versi 2.7.5 (audit 2026-11-13 ulang).
// Blok rpParts, rpFmt, rpRaw di bawah disalin langsung dari scripts/srepair.js (baris 88-112).
// Jalankan: ELECTRON_RUN_AS_NODE=1 "<Code Helper (Plugin)>" docs/audit/fixtures/2026-11-13-srepair-ulang-angka.js
const PREFIX = 'Rp ';
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


const kasus = ['2000', 'Rp 2,000', 'Rp 2,000.', 'Rp 2,000.5', 'Rp 2,000.50', '12500.50', '1500.125', '', 'Rp 0', '0002000'];
for (const k of kasus) {
  const p = rpParts(k);
  console.log(JSON.stringify(k).padEnd(14) + ' -> tampil ' + JSON.stringify(rpFmt(p)).padEnd(16) + ' raw ' + JSON.stringify(rpRaw(p)));
}
