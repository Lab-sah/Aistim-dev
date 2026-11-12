# Audit ulang skrip Smart Repair - Format Rp & Jumlah angka saja (`srepair.js`) — 2026-11-13

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: fd752a7 (branch `feat/srepair-fitur`, PR #68)
- Versi: 2.7.5 (`@version` di `scripts/srepair.js`; N/A untuk manifest karena ruang lingkupnya userscript)
- Auditor: agen Claude (Haiku 5.5), atas permintaan pemilik repo
- Ruang lingkup: seluruh isi `scripts/srepair.js` pada 2.7.5, termasuk akses `formatRp` (`AKSES_JSON`, baris 23–68). Audit ini memeriksa perubahan sejak audit [2026-11-13-srepair.md](2026-11-13-srepair.md) (versi 2.7.3): format Rp baru (baris 88–118), event `input` yang dikirim (baris 177), dan status temuan lama. Checklist yang dipakai: bagian **Kode dan keamanan** dan **Kualitas** dari [checklist-web-store.md](checklist-web-store.md). Bagian manifest, build, rilis, dan privasi N/A karena di luar lingkup skrip. Tidak diuji di browser dan tidak diuji dengan akun ERZAP sungguhan.

## Metode dan pengujian

- Pembacaan kode baris demi baris, khusus blok format Rp (`rpParts`, `rpFmt`, `rpRaw`, `formatEl`), listener `input`, `focusin`, `focusout`, dan `submit`, serta patch properti `value` dan `jQuery.fn.val`.
- Pemindaian pola dengan `grep`: `eval`, `new Function`, `document.write`, `createElement('script')`, `postMessage`, `console.`, `localStorage`, `sessionStorage`, `password`, `token`, `secret`, `XMLHttpRequest`, `sendBeacon`, `userScripts`. Hasil: 0 kejadian. `innerHTML` 1 kali (baris 266, dari `saldoTable`, nama di-escape), `insertAdjacentHTML` 1 kali (baris 288, markup statis), `fetch(` 1 kali (baris 295), `dispatchEvent` 1 kali (baris 177), `defineProperty` 1 kali (baris 126).
- Pemeriksaan sintaks: `ELECTRON_RUN_AS_NODE=1` dengan runtime Node milik Visual Studio Code, perintah `--check`. Hasil: lulus.
- Uji fungsi angka: [fixtures/2026-11-13-srepair-ulang-angka.js](fixtures/2026-11-13-srepair-ulang-angka.js). Blok `rpParts`, `rpFmt`, dan `rpRaw` disalin dari `scripts/srepair.js` (baris 88–112) dan dijalankan dengan runtime yang sama.
- Pengujian perilaku di browser belum dilakukan.
- Cara mengulang: `ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)" docs/audit/fixtures/2026-11-13-srepair-ulang-angka.js` dari root repo.

## Koreksi terhadap audit sebelumnya

- Tidak ada kesalahan fakta di [2026-11-13-srepair.md](2026-11-13-srepair.md). Nomor baris di audit itu sudah bergeser setelah penambahan akses dan format Rp. Nomor baris yang berlaku sekarang tercantum di tabel temuan di bawah.
- Temuan 1 audit sebelumnya (sen hilang) diperbaiki sebagian oleh commit `eefe33d`. Sen dua digit tidak lagi dibuang, dan `init()` tidak lagi memaksa `.00`. Sisa masalahnya (desimal lebih dari dua digit) dicatat sebagai temuan 5.

## Hasil checklist (Kode dan keamanan)

- [x] Tidak ada `eval`, `new Function`, atau `document.write`.
- [x] Tidak ada kode yang diunduh lalu dijalankan. Satu `fetch` ke path relatif yang sama origin (baris 295), id diambil dari `href` dengan regex `\d+`.
- [x] Tidak ada `createElement('script')`.
- [x] Tidak ada kredensial, token, atau password. Tidak ada `localStorage` atau `sessionStorage`.
- [x] Data yang masuk `innerHTML` sudah di-escape (baris 266 memakai `saldoTable`, yang memanggil `escHtml(nama)`). Baris 288 memakai markup statis.
- [x] `postMessage` tidak dipakai. Poin ini N/A.
- [x] Tidak ada `console.*`.

## Hasil checklist (Kualitas)

- [ ] Ada cara untuk menguji perubahan. Belum: langkah tes manual hanya ada di deskripsi PR #68. Fixture hanya menguji fungsi angka, bukan perilaku di browser.
- [x] File tidak terduplikasi. `srepair.js` adalah file baru, dan stub `smart_repair.js` tetap utuh.

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Sedang | `scripts/srepair.js:177` | Event `input` dikirim setiap kali tampilan berubah, jadi setiap ketikan memanggil semua handler `input` di halaman, termasuk handler ERZAP dan script lain. Efeknya pada perhitungan belum diuji, dan efek samping (mis. pencarian atau pengiriman otomatis) belum diketahui. Tidak berulang: event kedua tidak mengubah tampilan lagi. | Perlu verifikasi di browser |
| 2 | Sedang | `scripts/srepair.js:126`–`:131`, `:134`–`:141` | Properti `value` pada input dan `jQuery.fn.val` masih diganti secara global. Pembacaan nilai oleh halaman lain mendapat angka tanpa desimal format. Ini masih sama dengan audit sebelumnya. | Terbuka |
| 3 | Sedang | `scripts/srepair.js:310` | `tr.children[4]` memakai indeks kolom tetap untuk Kode Servis. Kalau urutan kolom di ERZAP berubah, status servis tampil di kolom yang salah. | Perlu verifikasi di browser |
| 4 | Sedang | `scripts/srepair.js:6` | `@match` `*.erzap.com/servis_elektroniks/*` mencakup semua tenant. Selector dan indeks kolom hanya diperiksa lewat kode, belum di tenant lain. | Perlu verifikasi di browser |
| 5 | Rendah | `scripts/srepair.js:91`–`:92` | Desimal dipotong ke dua digit. `1500.125` menjadi `1500.12`, digit ketiga dibuang tanpa pembulatan. Fixture menunjukkan hasilnya. Sama dengan `erzap_trans_beban.js`. | Terbuka |
| 6 | Rendah | `scripts/srepair.js:329`–`:331` | `patch()` dipanggil saat `init()` dan saat `focusin`. Baris baru yang ditambahkan ERZAP setelah halaman dibuka belum diformat sampai kolom difokus. Dibaca dari kode, belum diuji di browser. | Perlu verifikasi di browser |
| 7 | Rendah | `scripts/srepair.js:295`–`:302` | Setiap baris Kelola Servis memicu satu `fetch`, tanpa batas paralel. Kegagalan `fetch` (`.catch(() => '')`) disimpan di cache, jadi status tetap `-` sampai halaman dimuat ulang. | Terbuka |
| 8 | Rendah | `scripts/srepair.js:5` (`@description`) | Kalimat "Kolom Jumlah hanya angka dan titik desimal. Tanggal Selesai otomatis hari ini." masih muncul dua kali. | Terbuka |
| 9 | Rendah | `scripts/srepair.js:23`–`:68` | Akses `formatRp` hanya di sisi klien dan bisa dilewati lewat DevTools. Ini sama dengan pola di skrip lain. | Perlu keputusan pemilik |
| 10 | Info | `scripts/srepair.js:347`–`:355` | Script menunggu nama kasir sampai 15 detik. Kalau `#info_kasir` belum terisi dalam waktu itu, script tidak jalan. | Dikoreksi: sesuai desain, tidak perlu tindakan |

## Langkah berikutnya

- Temuan 1 dan 3–4: uji di browser pada tenant trial dan satu tenant lain. Untuk temuan 1, ketik di kolom harga dan lihat apakah total berubah tanpa efek samping lain.
- Temuan 2 dan 9: keputusan pemilik apakah patch global dan akses sisi klien tetap dipertahankan.
- Temuan 5–8: perbaikan kecil dalam PR berikutnya, dengan kenaikan `@version`.
- Sebelum merge PR #68: jalankan langkah tes di deskripsi PR di browser dan catat hasilnya.
