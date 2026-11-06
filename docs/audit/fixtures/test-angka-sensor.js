// Uji fixture untuk audit auditanalisa (parseNum) dan rekam (sensor JSON).
// Dijalankan dengan runtime Node. Di mesin yang punya `node` cukup: node docs/audit/fixtures/test-angka-sensor.js
// Di mesin tanpa `node` (contoh: Mac dengan VS Code), pakai runtime VS Code:
//   ELECTRON_RUN_AS_NODE=1 "<Code Helper (Plugin)>" docs/audit/fixtures/test-angka-sensor.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..', '..');

function ambilFungsi(file, awal) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const i = src.indexOf(awal);
  if (i < 0) throw new Error('tidak menemukan ' + awal + ' di ' + file);
  return src;
}

// parseNum (scripts/auditanalisa.js)
const srcAudit = ambilFungsi('scripts/auditanalisa.js', 'const parseNum = s => {');
const parseNum = eval('(' + srcAudit.match(/const parseNum = (s => \{[\s\S]*?\n  \});/)[1] + ')');

// sensor (scripts/rekam.js)
const srcRekam = ambilFungsi('scripts/rekam.js', 'const sensor = (s) => String(s || \'\')');
const sensorBody = srcRekam.match(/const sensor = \(s\) => String\(s \|\| ''\)([\s\S]*?);\n/)[1];
const sensor = eval('(s => String(s || \'\')' + sensorBody + ')');

const kasusAngka = [
  ['1.234.567', 1234567],
  ['1.234.567,89', 1234567.89],
  ['12,5', 12.5],
  ['1,234,567.89', 1234567.89],
  ['(1.500.000)', -1500000],
  ['-250.000', -250000],
  ['Rp 0', 0],
  ['', null],
  ['abc', null],
  ['1234', 1234],
];

let gagal = 0;
for (const [masukan, harapan] of kasusAngka) {
  const hasil = parseNum(masukan);
  const lulus = hasil === harapan;
  if (!lulus) gagal++;
  console.log(lulus ? 'PASS' : 'FAIL', JSON.stringify(masukan), '->', hasil, '(harap', harapan + ')');
}

const jsonMasuk = '{"username":"budi","password":"abc","token":"xyz","nama":"Siti"}';
const jsonKeluar = sensor(jsonMasuk);
const lulusJson = jsonKeluar.includes('"password":"***"') && jsonKeluar.includes('"token":"***"') && jsonKeluar.includes('"nama":"Siti"');
if (!lulusJson) gagal++;
console.log(lulusJson ? 'PASS' : 'FAIL', 'sensor JSON ->', jsonKeluar);

console.log(gagal === 0 ? 'SEMUA LULUS' : gagal + ' kasus GAGAL');
process.exitCode = gagal === 0 ? 0 : 1;
