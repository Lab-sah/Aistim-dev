# Audit skrip userscript Aistim Tool — 2026-11-06

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: `d681e7c` (commit terakhir yang menyentuh `scripts/`)
- Versi: manifest `2.10.8` (N/A untuk pemeriksaan ini, karena ruang lingkupnya userscript dan bukan paket ekstensi)
- Auditor: Copilot
- Ruang lingkup: 26 skrip aktif dan 15 stub di `scripts/`. Pemeriksaan statis mencakup parsing data, HTML dinamis, rekaman request, dan aksi yang mengubah data. Checklist Web Store: hanya poin kode dan keamanan yang relevan untuk skrip; poin manifest, build, rilis, dan privasi N/A karena di luar lingkup.
- Tidak diuji: akun aktif ERZAP, hasil API/server sebenarnya, perilaku route hapus di server, dan uji tampilan browser.

## Metode dan hasil pengujian

- `python3 tools/cek_pr.py HEAD` lulus. Pemeriksaan sintaks oleh alat tersebut dilewati karena Node.js tidak tersedia di shell.
- Sintaks 41 file JavaScript diperiksa dengan runtime Node bawaan Visual Studio Code; metadata 26 skrip aktif juga diperiksa.
- Uji fixture buatan mereproduksi pembacaan angka yang keliru, nilai nol untuk baris laporan yang hilang, dan peringatan persediaan/hutang yang tidak semestinya. Fixture ini **tidak disimpan di repo**, sehingga pengujian belum bisa diulang dari repo.
- Uji sensor pada `rekam.js` menunjukkan field JSON seperti `password` dan `token` masih utuh setelah disensor.
- Pencarian pola eksekusi kode dinamis tidak menemukan `eval`, `new Function`, `document.write`, atau pembuatan elemen `<script>` di folder skrip.
- Tidak ada file kode yang diubah sebagai bagian audit.

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Sedang | `scripts/auditanalisa.js:73-79` | `parseNum` salah membaca format angka Indonesia. Contoh `1.234.567` menjadi `1.234`; angka laporan dapat menghasilkan rasio dan kesimpulan audit yang salah. | Terbuka |
| 2 | Sedang | `scripts/auditanalisa.js:127-136`, `:243-272` | Data laporan yang tidak terbaca diganti atau diperlakukan sebagai nol. Ringkasan bisa menampilkan `Rp 0` untuk nilai yang hilang; fixture Neraca dengan hanya dua total tetap menghasilkan keterangan “Neraca seimbang” dan nilai nol untuk baris yang tidak tersedia. | Terbuka |
| 3 | Rendah | `scripts/auditanalisa.js:244-263` | Persediaan dan hutang dagang yang tidak ditemukan memakai nilai cadangan nol. Kondisi perbandingannya tetap menghasilkan temuan “hampir sebesar” untuk `Rp 0` dan `Rp 0`. | Terbuka |
| 4 | Sedang | `scripts/rekam.js:33-41`, `:88-89`, `:124-125` | Sensor hanya menangani beberapa bentuk token/CSRF dan input HTML; field JSON seperti `{"password":"abc","token":"xyz"}` tidak disamarkan. Snippet respons juga dapat memuat nama atau nomor telepon. Rekaman memang memerlukan aktivasi `?rekam=1` dan klik tombol Rekam, tetapi data sensitif masih bisa ikut tersalin/diekspor. | Terbuka |
| 5 | Sedang | `scripts/erzap_rak_barang.js:62-68`, `:95-106` | Operasi hapus massal dikirim sebagai HTTP GET ke `/rak_barangs/destroy/<id>?page=1`. Konfirmasi klik mengurangi salah tekan, tetapi GET yang mengubah data berisiko dipicu di luar alur konfirmasi jika route server memang menerima penghapusan melalui GET. Route server belum diperiksa. | Terbuka (menunggu verifikasi route server) |

## Catatan dan hubungan dengan audit sebelumnya

- Temuan 1–3 juga tercatat di [audit Audit Analisa sebelumnya](2026-11-06-auditanalisa.md) dan masih ada pada `auditanalisa.js` versi `1.1.0`.
- Pencarian terhadap penggunaan HTML dinamis menemukan beberapa titik. Pada bagian yang ditinjau, data tampak ditulis melalui `textContent` atau fungsi escape; audit statis ini bukan pembuktian menyeluruh bahwa seluruh jalur HTML aman.
- Temuan 5 adalah risiko desain yang perlu dikonfirmasi terhadap implementasi server ERZAP. Jangan menganggapnya kerentanan server yang sudah terbukti sebelum route diperiksa.
- Manifest dan build Chrome Web Store tidak menjadi fokus audit ini.

## Koreksi terhadap audit sebelumnya

- Tidak ada

## Langkah berikutnya

- Perbaiki parser agar menerima format angka yang benar-benar dipakai laporan ERZAP.
- Bedakan nilai kosong/tidak terbaca dari angka nol dan hindari kesimpulan yang bergantung pada data yang hilang.
- Samarkan field JSON sensitif serta kurangi data pribadi pada snippet Rekam.
- Pastikan penghapusan rak memakai metode perubahan data yang dilindungi CSRF; verifikasi route backend sebelum menyimpulkan risikonya.
- Uji lagi dengan laporan nyata yang datanya telah disamarkan, tanpa mengirim data pelanggan ke luar.
