# Audit skrip AISTIM TOOL (`aistim_tool.js`) — 2026-11-08

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: 35d584f
- Versi: 1.0.2 (`@version` di `scripts/aistim_tool.js`; N/A untuk manifest karena ruang lingkupnya userscript, bukan paket ekstensi)
- Auditor: agen Claude (Haiku 5.5), atas permintaan pemilik repo
- Ruang lingkup: seluruh isi `scripts/aistim_tool.js` (593 baris, `@match https://*.erzap.com/stok_opnams*`). Checklist yang dipakai: bagian **Kode dan keamanan** dari [checklist-web-store.md](checklist-web-store.md). Bagian manifest, build, rilis, dan privasi N/A karena di luar lingkup skrip. Tidak diuji di browser dan tidak diuji dengan akun ERZAP sungguhan.

## Metode dan pengujian

- Pembacaan kode baris demi baris dan pencarian pola dengan `grep`.
- Pemindaian pola: `eval`, `new Function`, `document.write`, `fetch`, `XMLHttpRequest`, `sendBeacon`, dan `createElement('script')` dengan skrip Python. Hasil: 0 kejadian untuk semua pola itu. `innerHTML` ditemukan 7 kali, dan semuanya diperiksa manual.
- Pemeriksaan sintaks: `ELECTRON_RUN_AS_NODE=1` dengan runtime Node milik Visual Studio Code, perintah `--check`. Hasil: lulus.
- Pengujian perilaku belum dilakukan. Cara mengulang: buka halaman `stok_opnams` di ERZAP dengan skrip aktif, lalu cek kolom Cek Selisih, filter, dan jumlah di dropdown.

## Koreksi terhadap audit sebelumnya

- Tidak ada

## Hasil checklist (Kode dan keamanan)

- [x] Tidak ada `eval`, `new Function`, atau `document.write`.
- [x] Tidak ada kode yang diunduh lalu dijalankan. Tidak ada `fetch` atau XHR.
- [x] Tidak ada `createElement('script')`.
- [x] Tidak ada kredensial, token, atau password. Hanya `localStorage` untuk dua kunci (`erzap_filter`, `erzap_panel_collapsed`).
- [x] Data yang masuk `innerHTML` aman. Nilai yang dimasukkan hanya string statis dan angka hasil hitungan (`hasilKoreksi`, dan warna yang dipilih dari dua nilai tetap). Tidak ada teks dari halaman yang dimasukkan sebagai HTML. Lihat `scripts/aistim_tool.js:115`, `:167`, `:172`.
- [x] Tidak memakai `postMessage`. Poin ini N/A.
- [x] `console.log` hanya mencetak path halaman (`:23`) dan nilai filter (`:60`), tanpa data sensitif.

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Sedang | `scripts/aistim_tool.js:152-155`, `:164-168` | Sel yang tidak terbaca dianggap nol. `parseFloat(...) \|\| 0` mengubah teks kosong atau tidak valid menjadi 0. Jika sel 5 atau 6 tidak ada, nilai keduanya 0, selisih 0, dan baris dicap `nol` (Real). Akibatnya baris yang datanya tidak lengkap tampil sebagai "Real" dan ikut dihitung di filter. | Terbuka |
| 2 | Sedang | `scripts/aistim_tool.js:183`, `:233-283` | `allRows` tidak pernah dibersihkan. Jika Erzap merender ulang tabel tanpa reload (misalnya paginasi AJAX), elemen lama tetap ada di `allRows`. `applyFilter()` kemudian menambahkan kembali elemen lama yang cocok ke `tbody` (`:277`), sehingga baris bisa muncul dua kali dan jumlah di dropdown salah. Dampak ini belum dipastikan. Perlu uji di halaman yang memakai paginasi. | Perlu verifikasi |
| 3 | Sedang | `scripts/aistim_tool.js:28`, `:501`, `:527-545` | Halaman dimuat ulang penuh setiap 60 detik (`location.reload()`), tanpa memeriksa apakah user sedang mengisi form atau filter di halaman. Isian yang belum dikirim bisa hilang. Skrip proses SO sudah dikecualikan dari masalah ini, tetapi halaman daftar belum. | Perlu keputusan |
| 4 | Sedang | `scripts/aistim_tool.js:153-155`, `:161` | Format angka diasumsikan titik sebagai desimal. Pembersihan `replace(/[^\d.-]/g,'')` membuang koma. Jika ERZAP menampilkan ribuan dengan titik (format Indonesia), `1.234` dibaca sebagai `1.234`, bukan `1234`. Masalah serupa sudah tercatat di [2026-11-06-userscripts.md](2026-11-06-userscripts.md) untuk `auditanalisa.js`. Format tampilan Erzap belum diverifikasi dari repo. | Perlu verifikasi |
| 5 | Rendah | `scripts/aistim_tool.js:588-591`, `:573-578` | `setInterval` berjalan setiap detik dan memanggil `addKoreksiColumn()`, yang memindai ulang seluruh tabel. `MutationObserver` di `document.body` juga memanggil fungsi yang sama untuk setiap perubahan DOM. Dampaknya terasa di halaman dengan tabel besar. | Terbuka |
| 6 | Rendah | `scripts/aistim_tool.js:563`, `:588-589` | Selama `initDone` masih false, setiap detik `waitAndInit()` dipanggil lagi dan membuat `setInterval` baru berumur sampai 15 detik. Interval yang menumpuk tidak dibersihkan semuanya. | Terbuka |
| 7 | Rendah | `scripts/aistim_tool.js:305-311` | Pencarian menu "Administrator" memindai semua elemen dengan `querySelectorAll('*')` dan membaca `textContent` tiap elemen. Hanya dijalankan sekali saat panel dibuat, tetapi tetap boros. | Terbuka |
| 8 | Rendah | `scripts/aistim_tool.js:29` | `CONFIG.version` (`v2026-09-05.20.5`) tidak dipakai dan tidak sama dengan `@version` 1.0.2. | Terbuka |
| 9 | Info | `scripts/aistim_tool.js:115`, `:166`, `:171`, `:222` | Sisa komentar `<-- GANTI: ...` dari perubahan sebelumnya. Tidak memengaruhi perilaku. | Terbuka |

## Langkah berikutnya

- Temuan 1: kembalikan status `unknown` untuk baris yang sel perhitungan atau stok SO-nya tidak terbaca, dan jangan menghitungnya sebagai Real.
- Temuan 2: uji di halaman yang memakai paginasi AJAX. Jika dipastikan terjadi, bersihkan `allRows` sebelum `applyFilter()`.
- Temuan 3: keputusan pemilik. Pilihannya mematikan auto refresh secara default, atau menundanya selama ada elemen input yang fokus.
- Temuan 4: ambil satu contoh nilai dari tabel Erzap dan pastikan format pemisah ribuannya.
- Temuan 5 sampai 9: perbaikan kecil yang bisa digabung dalam satu PR, dengan kenaikan `@version` setelah disetujui.
