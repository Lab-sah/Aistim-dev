// Uji logika scripts/aistim_tool.js versi 1.0.4 (audit 2026-11-19).
// Bagian A: klasifikasi selisih, disalin dari addKoreksiColumn (baris 207-236).
// Bagian B: analyzeRows (baris 121-139) dan urutan baris setelah applyFilter (baris 319-341),
//           memakai tiruan DOM sederhana (bukan browser).
// Jalankan dari root repo:
// ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)" docs/audit/fixtures/2026-11-19-aistim-tool.js

// ---------- Bagian A: klasifikasi ----------
function klasifikasi(teks5, teks6) {
    let nilaiPerhitungan = NaN;
    let nilaiStokSO = NaN;
    let teksPerhitunganCell = '';
    if (teks5 !== undefined && teks6 !== undefined) {
        teksPerhitunganCell = teks5.trim();
        nilaiPerhitungan = parseFloat(teksPerhitunganCell.replace(/[^\d.-]/g, ''));
        nilaiStokSO = parseFloat(teks6.replace(/[^\d.-]/g, ''));
    }
    const isUncalculated = teksPerhitunganCell === 'PCS' || teksPerhitunganCell === '0.0 PCS';
    if (isUncalculated) return { status: 'uncalculated', tampil: '' };
    if (Number.isNaN(nilaiPerhitungan) || Number.isNaN(nilaiStokSO)) return { status: 'unknown', tampil: '?' };
    const hasilKoreksi = nilaiPerhitungan - nilaiStokSO;
    if (hasilKoreksi === 0) return { status: 'nol', tampil: '0' };
    return { status: hasilKoreksi < 0 ? 'negatif' : 'positif', tampil: String(hasilKoreksi) };
}

const kasusA = [
    ['12.0 PCS', '12.0 PCS', 'sama -> nol (Real)'],
    ['10.0 PCS', '12.0 PCS', 'kurang 2 -> negatif'],
    ['PCS', '5.0 PCS', 'belum dihitung -> uncalculated'],
    ['0.0 PCS', '5.0 PCS', 'dihitung 0, stok 5: uncalculated (selisih -5 tidak terlihat)'],
    ['0.0 UNIT', '5.0 UNIT', 'satuan lain, belum dihitung: -5 (dianggap selisih)'],
    ['UNIT', '5.0 UNIT', 'satuan lain kosong: unknown'],
    ['0.00 PCS', '5.00 PCS', 'dua desimal: -5 (dianggap selisih)'],
    ['1,234.0 PCS', '1,200.0 PCS', 'koma ribuan -> 34'],
    ['12.3 PCS', '12.1 PCS', 'desimal: tampilan angka float mentah'],
    ['0.3 PCS', '0.1 PCS', 'desimal: tampilan angka float mentah'],
    [undefined, undefined, 'sel 5/6 tidak ada -> unknown'],
];
console.log('== A. Klasifikasi selisih ==');
for (const [a, b, ket] of kasusA) {
    const r = klasifikasi(a, b);
    console.log(
        (JSON.stringify(a) || 'undefined').padEnd(14) + (JSON.stringify(b) || 'undefined').padEnd(14) +
        '-> ' + r.status.padEnd(13) + JSON.stringify(r.tampil).padEnd(24) + '| ' + ket
    );
}

// ---------- Bagian B: urutan baris dengan rowspan ----------
function analyzeRows(table) {
    const cover = [];
    const infos = [];
    for (const row of table.rows) {
        let covered = 0;
        for (let i = 0; i < cover.length; i++) if (cover[i] > 0) covered++;
        let col = 0;
        for (const cell of row.cells) {
            while (cover[col] > 0) col++;
            const rs = cell.rowSpan || 1;
            const cs = cell.colSpan || 1;
            for (let k = 0; k < cs; k++) cover[col + k] = rs;
            col += cs;
        }
        infos.push({ row, covered });
        for (let i = 0; i < cover.length; i++) if (cover[i] > 0) cover[i]--;
    }
    return infos;
}

// Tiruan tbody: hanya urutan anak yang penting.
function buatTbody(rows) {
    const tb = { children: rows.slice() };
    tb.removeChild = el => { tb.children.splice(tb.children.indexOf(el), 1); el.parentNode = null; };
    tb.appendChild = el => { tb.children.push(el); el.parentNode = tb; };
    rows.forEach(r => { r.parentNode = tb; });
    return tb;
}
const sel = (rowSpan = 1) => ({ rowSpan, colSpan: 1 });
// Barang A punya dua baris (sel nama rowspan=2), lalu barang B satu baris. Tujuh kolom.
const rA1 = { nama: 'A-baris1', cells: [sel(2), sel(), sel(), sel(), sel(), sel(), sel()] };
const rA2 = { nama: 'A-baris2', cells: [sel(), sel(), sel(), sel(), sel(), sel()] };
const rB = { nama: 'B', cells: [sel(), sel(), sel(), sel(), sel(), sel(), sel()] };
const tbody = buatTbody([rA1, rA2, rB]);
const infos = analyzeRows({ rows: [rA1, rA2, rB] });

// addKoreksiColumn: baris dengan covered > 0 dilewati (tidak masuk allRows).
const allRows = infos.filter(i => i.covered === 0).map(i => ({ element: i.row, status: 'nol' }));

// applyFilter dengan filter 'semua': cabut semua allRows, lalu tempel lagi di akhir tbody.
allRows.forEach(({ element }) => { if (element.parentNode === tbody) tbody.removeChild(element); });
allRows.forEach(({ element }) => tbody.appendChild(element));

console.log('\n== B. Urutan baris setelah applyFilter("semua") ==');
console.log('covered per baris :', infos.map(i => i.row.nama + '=' + i.covered).join(', '));
console.log('masuk allRows     :', allRows.map(r => r.element.nama).join(', '));
console.log('urutan awal       : A-baris1, A-baris2, B');
console.log('urutan akhir      :', tbody.children.map(r => r.nama).join(', '));
