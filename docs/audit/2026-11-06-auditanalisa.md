# Audit skrip Audit Analisa — 2026-11-06

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: `5d56ae4` (commit terakhir yang menyentuh `scripts/auditanalisa.js`)
- Versi: `@version 1.1.0` (skrip `scripts/auditanalisa.js`); versi manifest N/A karena audit ini hanya untuk skrip
- Auditor: Copilot
- Ruang lingkup: pemeriksaan sintaks, alur pemasangan tombol, dan simulasi perhitungan Laba Rugi serta Neraca dengan data buatan. Checklist Web Store: hanya poin kode dan keamanan yang relevan untuk skrip; poin manifest, build, rilis, dan privasi N/A karena di luar lingkup skrip.
- Tidak diuji: laporan aktif dengan sesi login ERZAP, kecocokan setiap label dengan data produksi, dan pengujian visual di browser.

## Metode dan hasil pengujian

- `node --check` tidak dapat dijalankan karena Node.js tidak tersedia di shell. Sintaks diperiksa menggunakan runtime Node bawaan Visual Studio Code dan lolos.
- `python3 tools/cek_pr.py HEAD` lulus. Pemeriksaan sintaks oleh skrip tersebut dilewati karena Node.js tidak tersedia.
- Fungsi audit diuji dengan fixture tabel buatan. Pengujian berhasil mereproduksi tiga masalah di bawah.
- Tidak ada file kode yang diubah sebagai bagian audit ini.
- Fixture tabel buatan yang dipakai untuk simulasi **tidak disimpan di repo**, sehingga pengujian ini belum bisa diulang dari repo. Untuk melengkapinya, fixture perlu disimpan di `docs/audit/fixtures/`.

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Sedang | `scripts/auditanalisa.js:73-79` | `parseNum` tidak menangani pemisah ribuan Indonesia. Contoh `1.234.567` dibaca sebagai `1.234`, sehingga nilai dan hasil audit yang memakai angka tersebut dapat keliru. | Terbuka |
| 2 | Sedang | `scripts/auditanalisa.js:127-136` | Baris yang tidak ditemukan diberi nilai pengganti nol melalui `g()`. Akibatnya ringkasan dapat menampilkan `Rp 0` untuk data yang sebenarnya tidak terbaca, dan perhitungan turunan dapat menyesatkan walaupun ada pemberitahuan data hilang. | Terbuka |
| 3 | Rendah | `scripts/auditanalisa.js:258-263` | Jika hutang dagang dan persediaan sama-sama tidak terbaca, keduanya menjadi nol. Kondisi `HD >= PS * 0.9` tetap benar dan menampilkan temuan bahwa hutang dagang hampir sebesar persediaan `Rp 0`. | Terbuka |

## Catatan

Hasil ini berasal dari simulasi lokal, bukan dari data perusahaan atau halaman ERZAP yang sedang login. Temuan menunjukkan potensi hasil yang salah pada kondisi input terkait dan perlu diverifikasi terhadap format angka serta tabel laporan aktual sebelum perubahan diterapkan.

## Koreksi terhadap audit sebelumnya

- Tidak ada

## Langkah berikutnya

- Perbaiki pembacaan angka agar mendukung format angka ERZAP yang sebenarnya.
- Jangan mengganti data yang tidak terbaca dengan angka nol pada ringkasan atau perhitungan.
- Jalankan pemeriksaan hutang dagang/persediaan hanya bila kedua nilai tersedia.
- Uji kembali dengan contoh laporan Laba Rugi dan Neraca ERZAP yang representatif.
