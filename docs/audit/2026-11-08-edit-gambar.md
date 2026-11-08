# Audit fitur Edit gambar di Lihat Stok (`rakstok.js`) — 2026-11-08

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: c03ac24
- Versi: 1.27.3 (`@version` di `scripts/rakstok.js`; N/A untuk manifest karena ruang lingkupnya fitur userscript)
- Auditor: agen Claude (Haiku 5.5), atas permintaan pemilik repo
- Ruang lingkup: fitur **Edit gambar** di `scripts/rakstok.js`, yaitu `tambahEditGambar` (`:374-386`), `bukaEditGambar` (`:547` dan seterusnya), dan `pasangSimpanGambar` (`:442-546`), termasuk pemilihan, pratinjau, dan pengiriman gambar. Checklist yang dipakai: bagian **Kode dan keamanan** dari [checklist-web-store.md](checklist-web-store.md). Bagian lain di luar lingkup. Tidak diuji di browser dan tidak diuji dengan akun ERZAP sungguhan. Fitur lain di `rakstok.js` tidak diperiksa.

## Metode dan pengujian

- Pembacaan kode untuk alur buka, pilih, pratinjau, simpan, dan batal.
- Pemindaian pola dengan `grep` untuk seluruh `rakstok.js`: `eval`, `new Function`, `document.write`, `createElement('script')`, `postMessage`, dan `innerHTML`. Di dalam bagian Edit gambar, `innerHTML` hanya dipakai untuk `'&times;'` statis (`:588`).
- Pemeriksaan sintaks: `ELECTRON_RUN_AS_NODE=1` dengan runtime Node milik Visual Studio Code, perintah `--check` pada salinan `origin/main`. Hasil: lulus.
- Pengujian perilaku belum dilakukan. Cara mengulang: buka popup gambar produk di Lihat Stok dengan akun non-pusat, klik ✎ Edit gambar, pilih file gambar, dan cek apakah tombol Simpan muncul dan apakah gambar terkirim hanya setelah Simpan.

## Koreksi terhadap audit sebelumnya

- Tidak ada

## Hasil checklist (Kode dan keamanan)

- [x] Tidak ada `eval`, `new Function`, atau `document.write` di `rakstok.js`.
- [x] Tidak ada kode yang diunduh lalu dijalankan. Iframe memuat halaman edit milik Erzap sendiri, dengan URL `location.origin + '/produks/<id>/edit'` (`:372`). Pengambilan gambar memakai `fetch` ke path relatif yang sama origin.
- [x] Tidak ada `createElement('script')`.
- [x] Tidak ada kredensial, token, atau password. `localStorage` dan `sessionStorage` dipakai untuk cache daftar stok dan filter, bukan untuk kredensial.
- [x] `innerHTML` di bagian Edit gambar hanya `'&times;'` statis (`:588`). Nama file dimasukkan lewat `textContent` (`:489`).
- [x] `postMessage` tidak dipakai. Poin ini N/A.
- [x] `console.warn` di bagian ini hanya mencetak alasan teknis (`:737`) dan kesalahan pemrosesan. Nama file tidak dicetak.

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Sedang | `scripts/rakstok.js:20`, `:376` | `editGambar` ada di daftar `public`, sehingga semua user bisa mengunggah gambar produk. Sesuai commit `b7fc9a3`, tetapi dampaknya langsung ke data produk. | Perlu keputusan pemilik |
| 2 | Sedang | `scripts/rakstok.js:723-731` | Kalau tombol Simpan belum bisa dipasang dalam 15 detik, gambar yang sudah dipilih dikirim langsung saat dipilih, tanpa klik Simpan. Ada keterangan "Mode bawaan Erzap" di tombol, tetapi user bisa tidak sadar gambarnya sudah terkirim. | Perlu keputusan dan perbaikan |
| 3 | Sedang | `scripts/rakstok.js:513` | Filter tipe file hanya di klien dan dilewati kalau `file.type` kosong, jadi file tanpa MIME type diterima. Atribut `accept` juga hanya di klien. Validasi di server tidak bisa diperiksa dari repo. | Terbuka |
| 4 | Rendah | `scripts/rakstok.js:520` | Tidak ada batas ukuran file di klien. Setiap gambar dibaca penuh sebagai data URL untuk pratinjau, sehingga file besar memakai banyak memori. | Terbuka |
| 5 | Rendah | `scripts/rakstok.js:706` | Listener `keydown` untuk Escape ditambahkan ke dokumen iframe setiap kali popup dibuka, dan tidak dilepas. Dampaknya kecil. | Terbuka |
| 6 | Sedang | `scripts/rakstok.js:372-386`, `:442-454`, `:547-745` | Fitur bergantung pada id DOM Erzap (`fileupload`, `rk_aksi`, `tab_produk_gambar`, `produk-gambar-tab`) dan plugin jQuery `fileupload`. Kalau Erzap berubah, tombol Simpan tidak terpasang. Kegagalannya hanya tercatat di console (`:737`), tanpa pesan kepada user. | Perlu verifikasi di browser |

## Langkah berikutnya

- Temuan 1 dan 2: keputusan pemilik. Apakah `editGambar` tetap public, dan apakah jalur kirim-langsung (`:723-731`) dihapus atau diberi konfirmasi.
- Temuan 3 dan 4: tambahkan pengecekan ekstensi nama file, dan batas ukuran, dalam perubahan kecil berikutnya. Konfirmasi juga bahwa server Erzap memvalidasi tipe dan ukuran file.
- Temuan 5: lepas listener Escape saat popup ditutup.
- Temuan 6: uji di browser. Pertimbangkan pesan yang terlihat oleh user kalau tombol Simpan gagal dipasang, bukan hanya di console.
