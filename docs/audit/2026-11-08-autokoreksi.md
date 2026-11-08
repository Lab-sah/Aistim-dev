# Audit skrip Erzap - Auto Koreksi (`erzap_autokoreksi.js`) — 2026-11-08

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: f1be137
- Versi: 1.13.0 (`@version` di `scripts/erzap_autokoreksi.js`; N/A untuk manifest karena ruang lingkupnya userscript)
- Auditor: agen Claude (Haiku 5.5), atas permintaan pemilik repo
- Ruang lingkup: seluruh isi `scripts/erzap_autokoreksi.js` (1362 baris, `@match https://*.erzap.com/stok_opnams/proses_koreksi_so/*`). Checklist yang dipakai: bagian **Kode dan keamanan** dari [checklist-web-store.md](checklist-web-store.md). Bagian manifest, build, rilis, dan privasi N/A karena di luar lingkup skrip. Tidak diuji di browser dan tidak diuji dengan akun ERZAP sungguhan.

## Metode dan pengujian

- Pembacaan kode untuk alur START, CEK SIMPAN, penyimpanan, pindah halaman, dan ringkasan.
- Pemindaian pola dengan `grep`: `eval`, `new Function`, `document.write`, `createElement('script')`, `postMessage`, `localStorage`, `password`/`token`/`secret`, `innerHTML`, dan `console.*`. Hasil: 0 kejadian untuk pola berbahaya, lihat checklist di bawah.
- Pemeriksaan sintaks: `ELECTRON_RUN_AS_NODE=1` dengan runtime Node milik Visual Studio Code, perintah `--check`. Hasil: lulus.
- Pengujian perilaku belum dilakukan. Cara mengulang: buka halaman proses koreksi SO di ERZAP dengan akun pusat, jalankan START AUTO pada SO uji dengan beberapa halaman, lalu cek status per halaman dan hasil di tabel server.

## Koreksi terhadap audit sebelumnya

- Tidak ada

## Hasil checklist (Kode dan keamanan)

- [x] Tidak ada `eval`, `new Function`, atau `document.write`.
- [x] Tidak ada kode yang diunduh lalu dijalankan. Permintaan `fetch` hanya ke URL same-origin (`bersihkanUrl`, `:552-558`).
- [x] Tidak ada `createElement('script')`.
- [x] Tidak ada kredensial, token, atau password. Penyimpanan hanya `sessionStorage` (45 pemakaian), dan tidak ada `localStorage`.
- [x] `innerHTML` dengan data dari luar: tidak ada. Empat pemakaian `innerHTML` memakai template statis, dan nilai dinamis yang masuk hanya `pageNum` (angka) dan `status` dari log sessionStorage yang ditulis script sendiri (`:374`). Lihat temuan 5 untuk catatan.
- [x] `postMessage` tidak dipakai. Poin ini N/A.
- [x] `console.*` hanya mencetak ID SO, status, dan URL link di halaman (`:92`, `:114`, `:725`, `:944`, `:1325`). Tidak ada data pribadi atau isian pengkoreksi yang dicetak.

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Sedang | `scripts/erzap_autokoreksi.js:1080`, `:1085-1087`, `:1141-1143` | Simpan yang tidak terpantau sebagai `Tidak Pasti` (tidak ada tanda simpan dalam 1,5 detik, atau belum selesai dalam 8 detik) tetap dicatat dan proses langsung pindah ke halaman berikutnya. Halaman yang belum tersimpan bisa terlewat. Pengecekan akhir (`cariHalamanBelumSimpan`, `:673`) seharusnya menangkapnya, tetapi itu belum diuji. | Perlu verifikasi di browser |
| 2 | Sedang | `scripts/erzap_autokoreksi.js:248`, `:1096`, `:1111-1113` | Setelah START, setiap halaman disimpan otomatis (Enter, lalu klik tombol Simpan kalau Enter gagal) tanpa konfirmasi tambahan. Satu-satunya penjaga adalah akses role dan pemeriksaan tanda lanjut (`:106-118`). Ini sesuai desain, tetapi dampaknya langsung ke data koreksi. | Perlu keputusan pemilik |
| 3 | Sedang | `scripts/erzap_autokoreksi.js:210-236` | Fungsi `XMLHttpRequest.prototype.send` dan `window.fetch` di halaman dibungkus. Pembungkus meneruskan panggilan asli, tetapi fitur ERZAP lain di halaman yang sama bisa terpengaruh dan itu belum diuji. | Perlu verifikasi di browser |
| 4 | Sedang | `scripts/erzap_autokoreksi.js:30`, `:64-76` | Pembatasan fitur `autoKoreksi` hanya di sisi klien, dan tombolnya hanya disembunyikan. Pembatasan di server ERZAP tidak bisa diperiksa dari repo. | Perlu keputusan pemilik |
| 5 | Rendah | `scripts/erzap_autokoreksi.js:374` | `status` masuk `innerHTML` tanpa escape. Sumbernya log sessionStorage yang ditulis script sendiri, jadi risikonya kecil. Mengganti dengan `textContent` akan menghilangkan keraguan. | Terbuka |
| 6 | Info | `scripts/erzap_autokoreksi.js:92`, `:114`, `:725`, `:944`, `:1325` | Beberapa `console.log` mencetak ID SO dan URL halaman. Tidak ada data pribadi di sana. | Dikoreksi: tidak berisiko, tidak perlu tindakan |

## Langkah berikutnya

- Temuan 1 dan 3: uji di browser dengan SO uji beberapa halaman. Pastikan status `Tidak Pasti` tertangkap oleh pengecekan akhir, dan fitur ERZAP lain di halaman tetap berjalan.
- Temuan 2 dan 4: keputusan pemilik. Apakah simpan otomatis tanpa konfirmasi tetap dipertahankan, dan apakah pembatasan role juga dipasang di server.
- Temuan 5: ganti `innerHTML` pada baris 374 dengan `textContent` atau escape, dalam perubahan kecil berikutnya dengan kenaikan `@version`.
