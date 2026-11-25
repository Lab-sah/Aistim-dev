# Audit Stok Opnams — 2026-11-18

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: `063fcd2`
- Versi: `1.1.14` (`scripts/tombol_so_list.js`), `1.5.3` (`scripts/pengisian_so.js`), dan `1.13.2` (`scripts/erzap_autokoreksi.js`); manifest `2.10.8` tidak diubah.
- Auditor: Codex
- Ruang lingkup: pemeriksaan statis tiga userscript Stok Opnam aktif — daftar/ekspor, pengisian hasil, dan auto-koreksi — termasuk alur pagination, filter tanggal, ekspor, request same-origin, serta pengamanan aksi simpan. Checklist yang dipakai: bagian **Kode dan keamanan** dan **Kualitas** dari `checklist-web-store.md`. Manifest, build ZIP, proses rilis, dan privacy policy N/A karena skrip ini tidak menjadi bagian ZIP Store. Pengujian browser maupun akun ERZAP nyata tidak dilakukan.

## Metode dan pengujian

- Membaca kode dan menelusuri titik request, input DOM, pagination, penyimpanan, serta ekspor pada `scripts/tombol_so_list.js`, `scripts/pengisian_so.js`, dan `scripts/erzap_autokoreksi.js`.
- Pemindaian pola `eval`, `new Function`, `document.write`, pembuatan elemen script, dan `postMessage` pada ketiga skrip: tidak ada hasil.
- Pemeriksaan sintaks lulus memakai runtime Node milik Visual Studio Code:

  ```sh
  RUNTIME='/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)'
  for f in scripts/tombol_so_list.js scripts/pengisian_so.js scripts/erzap_autokoreksi.js; do
    ELECTRON_RUN_AS_NODE=1 "$RUNTIME" --check "$f"
  done
  ```

- `python3 tools/cek_pr.py HEAD` lulus; alat melaporkan pemeriksaan sintaksnya sendiri dilewati karena `node` tidak tersedia di shell.
- Tidak ada fixture browser karena masalah pagination dan filter dapat diverifikasi langsung dari kondisi pada lokasi temuan. Uji browser tetap diperlukan sebelum perbaikan di-merge.

## Koreksi terhadap audit sebelumnya

- Tidak ada audit khusus Stok Opnams sebelumnya.

## Hasil checklist (Kode dan keamanan)

- [x] Tidak ada `eval`, `new Function`, atau `document.write` pada tiga skrip yang diperiksa.
- [x] Request data memakai `fetch` same-origin dengan `credentials: 'same-origin'`; tidak ada kode yang diunduh lalu dijalankan oleh ketiga skrip. Library SheetJS pada `tombol_so_list.js` dibundel di repo, bukan diambil saat jalan.
- [x] Tidak ada `createElement('script')`.
- [x] Tidak ada kredensial, password, atau token yang disimpan. Token CSRF hanya dibaca dari form lalu dikirim kembali ke endpoint same-origin untuk filter outlet (`scripts/tombol_so_list.js:1018`).
- [x] Data dari halaman yang ditampilkan kembali memakai `textContent`; `innerHTML` yang ada hanya markup konstan milik skrip.
- [x] `postMessage` tidak dipakai.
- [x] Log konsol tidak mencetak kredensial atau token. Log diagnosis dapat memuat barcode dan nama gudang di konsol, sehingga hanya cocok untuk operator yang memang berhak melihat data SO.

## Hasil checklist (Kualitas)

- [ ] Ada cara untuk menguji perubahan. Belum ada pengujian otomatis atau langkah uji browser yang tersimpan untuk tiga skrip ini; pemeriksaan sintaks saja tidak membuktikan selector dan alur ERZAP aktual.
- [x] Stub lama `pengisianso.js` dan `koreksiso.js` tetap ada, sedangkan implementasi aktif ada pada nama skrip baru; tidak ditemukan duplikasi implementasi aktif.

## Hasil checklist (Manifest, build, rilis, privasi)

- N/A — ruang lingkup hanya userscript `scripts/`; file tersebut tidak masuk ZIP Store.

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Sedang | `scripts/tombol_so_list.js:197` | Penelusuran berhenti ketika `dikunjungi.size` mencapai 200, tetapi keluar normal dengan `error = null`. Jika daftar memiliki lebih dari 200 halaman, tabel, total, dan XLSX tampak lengkap padahal halaman tersisa tidak ikut. | Terbuka |
| 2 | Sedang | `scripts/tombol_so_list.js:179` | Saat filter tanggal dipakai, item tanpa `data-order` menghasilkan `tanggalISO` kosong dan selalu lolos `dalamRentang`. Perubahan markup ERZAP atau data tanggal yang tidak terbaca dapat memasukkan SO di luar rentang ke tampilan, total, dan XLSX tanpa penanda. | Terbuka |
| 3 | Rendah | `scripts/erzap_autokoreksi.js:24` | Pembatasan fitur auto-koreksi mencocokkan substring teks `#info_kasir` di DOM. Kode sudah menyatakan ini bukan mekanisme keamanan; ia tidak boleh dijadikan dasar otorisasi. Akses simpan wajib tetap ditolak server ERZAP untuk pengguna yang tidak berwenang. | Perlu keputusan (verifikasi otorisasi server) |
| 4 | Rendah | `scripts/tombol_so_list.js:739` | SheetJS 0.18.5 dibundel sebagai satu baris minified hampir 937 KB bersama logika aplikasi. Ini menyulitkan review perubahan dan pembaruan dependensi; belum ada lockfile/SBOM atau uji ekspor terotomasi khusus fitur ini. | Terbuka |

## Langkah berikutnya

- Ubah batas 200 halaman menjadi penghentian dengan pesan galat yang jelas, atau izinkan pengguna memilih lanjut setelah peringatan.
- Untuk item tanpa `tanggalISO`, tandai sebagai tidak dapat difilter dan jangan ikut ekspor rentang tanggal sampai pengguna mengonfirmasi.
- Tambahkan uji browser tersimpan untuk pagination lebih dari 200 halaman, tanggal tanpa `data-order`, filter outlet, ekspor XLSX, dan satu halaman auto-koreksi dengan data tersamarkan.
- Konfirmasi bahwa endpoint simpan ERZAP melakukan otorisasi di server; jangan mengandalkan `AKSES_JSON`.
