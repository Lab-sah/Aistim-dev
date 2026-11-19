// Uji logika scripts/rakstok.js versi 1.27.14 (audit 2026-11-19).
// Fungsi diambil langsung dari file skrip (bukan disalin), lalu dijalankan dengan tiruan sederhana (bukan browser).
// A: rapiNamaGudang + gudangCocok (filter gudang di popup Map rak)
// B: lebarCode128 (barcode di popup QR), dicek dengan mendekode ulang hasilnya
// C: rakGudang (pembacaan "Penempatan Rak" dari respons aktivitas stok), dengan ambilHtml/parseHtml tiruan
// D: rkBoleh (hak akses), dengan document tiruan
// Jalankan dari root repo (argumen kedua opsional = path skrip lain, mis. hasil git show):
// ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)" docs/audit/fixtures/2026-11-19-rakstok.js

const fs = require('fs');
const path = process.argv[2] || 'scripts/rakstok.js';
const src = fs.readFileSync(path, 'utf8');
const ambil = (re, nama) => { const m = src.match(re); if (!m) throw new Error('bagian tidak ditemukan: ' + nama); return m[0]; };
console.log('Skrip: ' + path + ' (' + (src.match(/@version\s+(\S+)/) || [])[1] + ')');

// cek: perilaku yang benar. GAGAL menaikkan kode keluar.
// temuan: perilaku bermasalah yang dicatat di audit. TEMUAN = masih terjadi; BERUBAH = perilaku sudah lain
// (mungkin sudah diperbaiki, cek ulang temuan terkait). Keduanya tidak menaikkan kode keluar.
let gagal = 0;
function cek(nama, dapat, harap, ket) {
    const ok = JSON.stringify(dapat) === JSON.stringify(harap);
    if (!ok) gagal++;
    console.log((ok ? 'OK      ' : 'GAGAL   ') + nama + ' -> ' + JSON.stringify(dapat) + (ok ? '' : ' (harap ' + JSON.stringify(harap) + ')') + (ket ? '  | ' + ket : ''));
}
function temuan(nama, dapat, bermasalah, ket) {
    const masih = JSON.stringify(dapat) === JSON.stringify(bermasalah);
    console.log((masih ? 'TEMUAN  ' : 'BERUBAH ') + nama + ' -> ' + JSON.stringify(dapat) + '  | ' + ket);
}

// ---------- A: filter gudang popup Map rak ----------
console.log('\n== A. Pencocokan gudang (filterRakPerGudang) ==');
{
    const kode = [
        ambil(/function rapiNamaGudang\(t\) \{[\s\S]*?\n    \}/, 'rapiNamaGudang'),
        ambil(/const kunciGudang = .*;/, 'kunciGudang'),
        ambil(/function gudangCocok\(baris, idPilih, want\) \{[\s\S]*?\n    \}/, 'gudangCocok'),
    ].join('\n');
    const { rapiNamaGudang, kunciGudang, gudangCocok } = new Function(kode + '\nreturn { rapiNamaGudang, kunciGudang, gudangCocok };')();
    const baris = (id, nama, outlet) => ({ dataset: { gdn: id, outlet: outlet || '' }, querySelector: () => ({ textContent: nama }) });
    cek('label "GUDANG PUSAT :"', rapiNamaGudang('  GUDANG   PUSAT :  '), 'GUDANG PUSAT');
    cek('ID sama', gudangCocok(baris('12', 'GUDANG PUSAT'), '12', 'NAMA LAIN'), true);
    cek('ID beda, nama sama (bertitik dua)', gudangCocok(baris('9', 'Toko Sidoarjo :'), '12', kunciGudang('TOKO SIDOARJO')), true);
    cek('pilihan "gudang - outlet"', gudangCocok(baris('', 'TOKO SIDOARJO', 'P12 PARTDISTRO SIDOARJO'), '12', kunciGudang('TOKO SIDOARJO - P12 PARTDISTRO SIDOARJO')), true);
    cek('pilihan "outlet - gudang"', gudangCocok(baris('', 'TOKO SIDOARJO', 'P12'), '12', kunciGudang('P12 - TOKO SIDOARJO')), true);
    cek('"GUDANG B" vs "GUDANG BARU"', gudangCocok(baris('', 'GUDANG B'), '12', kunciGudang('GUDANG BARU')), false);
    cek('gudang lain', gudangCocok(baris('7', 'GUDANG SERVIS'), '12', kunciGudang('GUDANG PUSAT')), false);
    cek('nama cadangan "GUDANG"', gudangCocok(baris('', 'GUDANG'), '12', kunciGudang('GUDANG')), false);
    temuan('ID beda, nama sama, outlet lain', gudangCocok(baris('31', 'TOKO', 'OUTLET B'), '12', kunciGudang('TOKO')), true,
        'temuan 7: gudang bernama sama di outlet lain ikut tampil walau ID-nya beda');
}

// ---------- B: Code 128 ----------
console.log('\n== B. Barcode Code 128 (lebarCode128), didekode ulang ==');
{
    const kode = [
        ambil(/const C128 = '[^']+'\.split\(' '\);/, 'C128'),
        ambil(/function lebarCode128\(teks\) \{[\s\S]*?\n    \}/, 'lebarCode128'),
    ].join('\n');
    const { C128, lebarCode128 } = new Function(kode + '\nreturn { C128, lebarCode128 };')();
    function dekode(lebar) {
        const simbol = [];
        for (let i = 0; i < lebar.length - 7; i += 6) simbol.push(lebar.slice(i, i + 6));
        const stop = lebar.slice(lebar.length - 7);
        const kodeAngka = simbol.map((s) => C128.indexOf(s));
        if (kodeAngka.some((k) => k < 0) || C128.indexOf(stop) !== 106) return { galat: 'simbol tidak dikenal' };
        if (simbol.some((s) => s.split('').reduce((a, c) => a + +c, 0) !== 11)) return { galat: 'lebar simbol bukan 11' };
        const cek = kodeAngka.pop();
        let sum = kodeAngka[0];
        for (let k = 1; k < kodeAngka.length; k++) sum += kodeAngka[k] * k;
        if (sum % 103 !== cek) return { galat: 'checksum salah' };
        let mode = kodeAngka[0] === 105 ? 'C' : (kodeAngka[0] === 104 ? 'B' : '?');
        let teks = '';
        for (let k = 1; k < kodeAngka.length; k++) {
            const c = kodeAngka[k];
            if (mode === 'C') { if (c === 100) mode = 'B'; else if (c < 100) teks += String(c).padStart(2, '0'); else return { galat: 'kode C ' + c }; }
            else { if (c === 99) mode = 'C'; else if (c < 95) teks += String.fromCharCode(c + 32); else return { galat: 'kode B ' + c }; }
        }
        return { teks: teks };
    }
    ['8991234567890', '899123456789', 'ABC-123', 'ABC12345', '12', '1', '123', 'RK-0001', 'ab 12 cd'].forEach((s) => {
        const l = lebarCode128(s);
        cek('"' + s + '"', l ? dekode(l) : null, { teks: s });
    });
    cek('karakter non-ASCII ditolak', lebarCode128('ÄBC'), null);
}

// ---------- C: pembacaan Penempatan Rak ----------
console.log('\n== C. rakGudang (teks respons aktivitas stok) ==');
(async () => {
    const fnTeks = ambil(/async function rakGudang\(idproduk, idgudang, idoutlet\) \{[\s\S]*?\n    \}/, 'rakGudang');
    let respons = '';
    const rakGudang = new Function('ambilHtml', 'parseHtml', 'catatLog', fnTeks + '\nreturn rakGudang;')(
        async () => respons,
        (html) => ({ body: { textContent: html } }),
        () => { }
    );
    const jalan = async (teks) => {
        respons = teks;
        try { return await rakGudang('1', '2', '3'); } catch (e) { return 'GALAT: ' + e.message; }
    };
    const uji = async (nama, teks, harap, ket) => cek(nama, await jalan(teks), harap, ket);
    await uji('dua rak, lalu tabel', 'Produk X\nPenempatan Rak :\nRAK A1\nRAK B2\n\nTanggal\n Kode\n2026-11-01 SO-001', 'RAK A1, RAK B2');
    await uji('tanda strip = belum ada rak', 'Penempatan Rak :\n-\nTabel ini dibaca dari ...', '');
    await uji('"Belum ada rak" dibuang', 'Penempatan Rak :\nBelum ada rak\nTanggal Kode', '');
    await uji('halaman login (status 200)', '<form>Login Email Password</form>', 'GALAT: respons aktivitas stok tidak valid');
    await uji('tabel tanpa bagian Penempatan Rak', 'Tanggal Kode Keterangan', '');
    temuan('"TanggalKode" tanpa spasi', await jalan('Penempatan Rak :\nRAK A1\nTanggalKodeKeterangan\n2026-11-01 SO-001'),
        'RAK A1, TanggalKodeKeterangan, 2026-11-01 SO-001',
        'temuan 4: regex utama butuh spasi (\\s+) sehingga isi tabel ikut terbaca sebagai nama rak; yang benar "RAK A1"');
    temuan('nama rak "KOSONG"', await jalan('Penempatan Rak :\nKOSONG\nRAK B2\nTanggal Kode'), 'RAK B2',
        'temuan 4: rak yang namanya persis "kosong"/"tidak ada"/"n/a" ikut dibuang');

    // ---------- D: hak akses ----------
    console.log('\n== D. rkBoleh (RK_AKSES_JSON) ==');
    const aksesKode = [
        ambil(/var RK_AKSES_JSON = `[\s\S]*?`;/, 'RK_AKSES_JSON'),
        ambil(/var rkAkses = \(function \(\) \{[\s\S]*?\n\}\)\(\);/, 'rkAkses'),
        ambil(/function rkBoleh\(fitur\) \{[\s\S]*?\n\}/, 'rkBoleh'),
    ].join('\n');
    const bolehUntuk = (kasir, fitur) => {
        const doc = { getElementById: (id) => (id === 'info_kasir' ? { textContent: kasir } : null) };
        return new Function('document', aksesKode + '\nreturn rkBoleh;')(doc)(fitur);
    };
    cek('fitur public, kasir siapa pun', bolehUntuk('BUDI', 'penentuanRak'), true);
    cek('fitur di luar public, kasir "BUDI"', bolehUntuk('BUDI', 'fiturBaru'), false);
    cek('fitur di luar public, kasir "SENTOT ARI HANDOKO"', bolehUntuk('Kasir: SENTOT ARI HANDOKO', 'fiturBaru'), true);
    temuan('fitur di luar public, kasir "LISA"', bolehUntuk('LISA', 'fiturBaru'), true, 'temuan 9: "ISA" cocok sebagai potongan nama, dapat "*"');
    temuan('fitur di luar public, kasir "ANIKA"', bolehUntuk('ANIKA', 'fiturBaru'), true, 'temuan 9: "ANIK" cocok sebagai potongan nama, dapat "*"');

    console.log('\n' + (gagal ? gagal + ' kasus GAGAL' : 'Semua kasus sesuai harapan'));
    process.exit(gagal ? 1 : 0);
})();
