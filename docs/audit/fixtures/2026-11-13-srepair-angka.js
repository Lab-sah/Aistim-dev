// Uji fungsi angka di scripts/srepair.js (2026-11-13).
// Fungsi disalin dari scripts/srepair.js (baris digitsOnly dan formatRp, DECIMAL_TAIL) supaya bisa dijalankan tanpa DOM.
// Jalankan: ELECTRON_RUN_AS_NODE=1 "<Code Helper (Plugin)>" docs/audit/fixtures/2026-11-13-srepair-angka.js
const PREFIX = 'Rp ';
const DECIMAL_TAIL = /\.\d{0,2}$/;
const digitsOnly = (v) => String(v || '').replace(DECIMAL_TAIL, '').replace(/\D/g, '');
const formatRp = (digits) => {
  if (!digits) return '';
  const n = digits.replace(/^0+(?=\d)/, '');
  return PREFIX + n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
// Nilai uji: hasil digitsOnly = angka yang dibaca aplikasi saat simpan (nilai input di-set ulang ke hasil ini).
const kasus = [
  '12500',
  '12500.00',         // normal dari database
  '12500.50',         // ada sen: sen hilang
  '1500.125',         // 3 digit desimal: titik ikut terbaca sebagai angka
  'Rp 1,500,000.00',  // tampilan normal
];
for (const masuk of kasus) {
  console.log(JSON.stringify(masuk) + ' -> dibaca sebagai ' + JSON.stringify(digitsOnly(masuk)));
}
console.log('format: ' + formatRp('1500000') + ' | ' + formatRp('0002000'));
