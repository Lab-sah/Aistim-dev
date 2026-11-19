# Audit ulang skrip AISTIM TOOL (`aistim_tool.js`) — 2026-11-19

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: 99e1fad (`origin/main`)
- Versi: 1.0.4 (`@version` di `scripts/aistim_tool.js`; N/A untuk manifest karena ruang lingkupnya userscript, bukan paket ekstensi)
- Auditor: agen Claude (Opus 5.5), atas permintaan pemilik repo
- Ruang lingkup: seluruh isi `scripts/aistim_tool.js` (671 baris, `@match https://*.erzap.com/stok_opnams*`). Audit ini juga memeriksa status temuan [2026-11-08-aistim-tool.md](2026-11-08-aistim-tool.md) (versi 1.0.2) setelah commit `fb7461d` (1.0.3) dan `df89e9a` (1.0.4, hak akses). Ada pemeriksaan silang dengan skrip lain yang jalan di path yang sama: `tombol_so_list.js` 1.1.14, `pengisian_so.js` 1.5.3, `erzap_autokoreksi.js` 1.13.2. Checklist yang dipakai: bagian **Kode dan keamanan** dan **Kualitas** dari [checklist-web-store.md](checklist-web-store.md). Bagian manifest, build, rilis, dan privasi N/A karena di luar lingkup skrip. Tidak diuji di browser dan tidak diuji dengan akun ERZAP sungguhan.

## Metode dan pengujian

- Pembacaan kode baris demi baris, dan perbandingan dengan riwayat file (`git log -- scripts/aistim_tool.js`, `git show fb7461d`, `git show df89e9a`).
- Pemindaian pola dengan `grep`: `eval`, `new Function`, `document.write`, `fetch(`, `XMLHttpRequest`, `sendBeacon`, `createElement('script')`, `postMessage`, `chrome.`, `token`, `password`. Hasil: 0 kejadian. `innerHTML` ada 8 titik (baris 174, 183, 203, 221, 224, 229, 233, 394), dan semuanya diperiksa manual.
- Pemeriksaan sintaks: `ELECTRON_RUN_AS_NODE=1` dengan runtime Node milik Visual Studio Code (v24.22.1), perintah `--check`. Hasil: lulus. `node` tidak tersedia di shell.
- Uji logika: [fixtures/2026-11-19-aistim-tool.js](fixtures/2026-11-19-aistim-tool.js).
  - Bagian A menyalin klasifikasi selisih dari `addKoreksiColumn` (baris 207–236) dan menjalankan 11 kasus teks sel.
  - Bagian B menyalin `analyzeRows` (baris 121–139) dan urutan cabut/tempel baris di `applyFilter` (baris 319–341). Bagian ini memakai tiruan `tbody` sederhana, bukan DOM browser.
- Cara mengulang dari root repo: `ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)" docs/audit/fixtures/2026-11-19-aistim-tool.js`
- Pengujian perilaku di browser belum dilakukan. Temuan berstatus "Perlu verifikasi" butuh satu halaman `stok_opnams` asli yang memakai tabel `table.no_data_table.table`.

Hasil bagian A (dipotong):

```
"0.0 PCS"     "5.0 PCS"     -> uncalculated ""                      | dihitung 0, stok 5: selisih -5 tidak terlihat
"0.0 UNIT"    "5.0 UNIT"    -> negatif      "-5"                    | satuan lain, belum dihitung: dianggap selisih
"0.00 PCS"    "5.00 PCS"    -> negatif      "-5"                    | dua desimal: dianggap selisih
"1,234.0 PCS" "1,200.0 PCS" -> positif      "34"                    | koma ribuan terbaca benar
"12.3 PCS"    "12.1 PCS"    -> positif      "0.20000000000000107"   | tampilan angka float mentah
```

Hasil bagian B:

```
covered per baris : A-baris1=0, A-baris2=1, B=0
masuk allRows     : A-baris1, B
urutan awal       : A-baris1, A-baris2, B
urutan akhir      : A-baris2, A-baris1, B
```

## Koreksi terhadap audit sebelumnya

Status temuan [2026-11-08-aistim-tool.md](2026-11-08-aistim-tool.md), dengan nomor baris yang berlaku sekarang:

| # lama | Temuan lama | Status sekarang |
|---|---|---|
| 1 | Sel tidak terbaca dianggap nol (Real) | Diperbaiki (`fb7461d`). Nilai awal `NaN`, status `unknown`, tampil `?` (baris 207–225). |
| 2 | `allRows` tidak pernah dibersihkan | Masih terbuka. Dilanjutkan sebagai temuan 7 di bawah. |
| 3 | Auto refresh 60 detik tanpa melihat isian user | Masih perlu keputusan. Dilanjutkan sebagai temuan 2. Sejak `df89e9a`, fitur ini hanya jalan untuk role pusat. |
| 4 | Format angka (titik dianggap desimal) | Dikoreksi. `scripts/tombol_so_list.js:48-54` mencatat format Erzap "Rp 135,000.00": koma untuk ribuan, titik untuk desimal. Teks jumlah di tabel SO juga memakai titik desimal ("0.0 PCS", baris 218). Pembersihan `replace(/[^\d.-]/g,'')` sudah benar untuk format itu (fixture A: `1,234.0` - `1,200.0` = 34). Tidak ada bukti Erzap memakai titik sebagai pemisah ribuan. |
| 5 | Pemindaian ulang tabel setiap detik | Diperbaiki sebagian (`fb7461d`). `setInterval` berhenti setelah init (baris 664–670), tetapi pemindaian per detik masih terjadi lewat jalur lain. Lihat temuan 8. |
| 6 | `setInterval` penunggu tabel menumpuk | Diperbaiki (`fb7461d`). Sekarang ada flag `waitingTable` (baris 115, 627–646). Sisa masalah polling dicatat sebagai temuan 9. |
| 7 | `querySelectorAll('*')` untuk mencari menu Administrator | Masih terbuka. Lihat temuan 10. |
| 8 | `CONFIG.version` tidak dipakai | Diperbaiki (`fb7461d`). |
| 9 | Sisa komentar `<-- GANTI` | Diperbaiki (`fb7461d`). |

Keterangan tambahan: `@description` "hasil jadi text (tidak bisa diubah)" sudah sesuai kode. Maksudnya, hasil di kolom Cek Selisih ditampilkan sebagai `<span>`, bukan `<input>` (lihat komentar `GANTI: input number → span text` di versi `77fc5a7`). Ini bukan temuan.

Pengecualian halaman di baris 21 (`proses_koreksi_so/`, `proses_pengisian_hasil_so`) sudah sama dengan `@match` skrip proses SO yang aktif: `erzap_autokoreksi.js:9` dan `pengisian_so.js:6`. Ini juga bukan temuan.

## Hasil checklist (Kode dan keamanan)

- [x] Tidak ada `eval`, `new Function`, atau `document.write`.
- [x] Tidak ada kode yang diunduh lalu dijalankan. Tidak ada `fetch`, XHR, atau `sendBeacon`.
- [x] Tidak ada `createElement('script')`.
- [x] Tidak ada kredensial, token, atau password. `localStorage` hanya menyimpan nilai filter (`erzap_filter`). Kunci `erzap_panel_collapsed` didefinisikan tetapi tidak pernah ditulis (temuan 12).
- [x] `innerHTML` (8 titik) hanya berisi markup statis, atau angka hasil hitungan `hasilKoreksi` dengan warna yang dipilih dari dua nilai tetap (baris 232–233). Tidak ada teks dari halaman yang masuk sebagai HTML.
- N/A `postMessage`: tidak dipakai.
- [x] `console.log` hanya mencetak path halaman (baris 23), nilai filter, dan jumlah baris (baris 260, 296, 303, 343, 618). Tidak ada nama kasir atau data barang.

## Hasil checklist (Kualitas)

- [ ] Ada cara untuk menguji perubahan. Ada fixture logika di audit ini, tetapi belum ada langkah uji browser yang tertulis untuk kolom Cek Selisih, filter, dan auto refresh.
- [x] Tidak ada duplikasi. Duplikat lama `aistim_tool_v18.js` sudah dihapus (README.md:290).

## Hasil checklist (Manifest, build, rilis, privasi)

- N/A: ruang lingkupnya hanya userscript di `scripts/`, dan file ini tidak mengubah paket ZIP Store.

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Sedang | `scripts/aistim_tool.js:218-222` | Teks Perhitungan `"0.0 PCS"` diperlakukan sama dengan `"PCS"` (belum dihitung). Barang yang memang dihitung 0 tetapi stok SO-nya lebih dari 0 (barang hilang) masuk "Belum dicek", bukan "Ada Selisih". Barang itu tidak tampil di filter bawaan `koreksi` (baris 255), padahal ini selisih yang paling penting (fixture A baris 4). | Perlu verifikasi: apakah Erzap menampilkan `"PCS"` untuk barang yang belum dihitung dan `"0.0 PCS"` untuk hitungan 0? |
| 2 | Sedang | `scripts/aistim_tool.js:27-29`, `:589-609` | `location.reload()` jalan setiap 60 detik tanpa syarat. Reload terjadi walaupun dropdown filter sedang dibuka, user sedang memeriksa baris, atau tab sedang di latar belakang (`document.hidden` tidak dicek), sehingga setiap tab yang dibiarkan terbuka mengirim 60 permintaan per jam ke server. `tombol_so_list.js` juga jalan di `stok_opnams*` dan menelusuri sampai 200 halaman lewat popup (`tombol_so_list.js:178-217`). Jika kedua skrip aktif di halaman yang sama, reload memotong penelusuran itu. Sejak `df89e9a`, dampaknya terbatas pada role pusat. | Perlu keputusan |
| 3 | Sedang | `scripts/aistim_tool.js:166`, `:189`, `:319-341` | Baris lanjutan rowspan (`covered > 0`) dilewati dan tidak masuk `allRows`. `applyFilter` mencabut semua baris `allRows` lalu menempelkannya di akhir `tbody`, sehingga baris lanjutan tertinggal di atas dan terpisah dari baris induknya, bahkan dengan filter "Semua" (fixture B: `A-baris2, A-baris1, B`). Baris lanjutan juga tidak ikut disembunyikan oleh filter. | Perlu verifikasi: apakah `tbody` tabel SO di Erzap memakai rowspan? |
| 4 | Rendah | `scripts/aistim_tool.js:144`, `:305` | Hanya tabel `table.no_data_table.table` pertama yang diproses. `tombol_so_list.js:221-228` mencatat bahwa dokumen Stok Opnam yang panjang dipecah menjadi beberapa tabel dengan kelas yang sama. Jika halaman target aistim_tool juga dipecah, baris di tabel kedua dan seterusnya tidak mendapat kolom Cek Selisih dan tidak ikut difilter. | Perlu verifikasi |
| 5 | Rendah | `scripts/aistim_tool.js:218` | Pengenal "belum dihitung" hanya cocok untuk satuan `PCS` dengan satu desimal. Teks seperti `"0.0 UNIT"` atau `"0.00 PCS"` tidak dikenali, sehingga dihitung sebagai selisih negatif sebesar stok SO (fixture A baris 5 dan 7). | Perlu verifikasi: apakah ada satuan selain PCS di SO? |
| 6 | Rendah | `scripts/aistim_tool.js:227`, `:233` | Selisih desimal ditampilkan sebagai angka float mentah, misalnya `12.3 - 12.1` tampil `0.20000000000000107` (fixture A baris 9–10). Statusnya tetap benar, hanya tampilannya yang salah. Hanya berdampak jika jumlah SO bisa berisi desimal. | Terbuka |
| 7 | Rendah | `scripts/aistim_tool.js:107`, `:244`, `:319-341` | `allRows` hanya bertambah. Jika `tbody` dirender ulang tanpa reload, `applyFilter` menempelkan lagi baris lama yang sudah lepas dari DOM. Risikonya lebih rendah dari perkiraan audit lama: kelas `no_data_table` menandakan tabel tidak diolah DataTables, dan daftar SO memakai paginasi server (`a.pagination_next`, `tombol_so_list.js:120-123`). | Perlu verifikasi |
| 8 | Rendah | `scripts/aistim_tool.js:595-604`, `:648-651`, `:141-147` | Hitung mundur auto refresh mengubah `textContent` setiap detik. Perubahan itu membuat mutasi `childList` yang ditangkap `MutationObserver` di `document.body`, lalu `addKoreksiColumn()` memindai seluruh tabel (`analyzeRows`) setiap detik. Untuk user non-pusat, observer tetap aktif selamanya dan membaca `#info_kasir` di setiap mutasi. | Terbuka |
| 9 | Rendah | `scripts/aistim_tool.js:627-646`, `:664-670` | Jika tabel atau `#info_kasir` tidak pernah muncul (halaman `stok_opnams*` lain), `pollInit` tidak pernah berhenti. Setiap 15 detik dibuat penunggu baru yang memeriksa setiap 500 ms, sampai tab ditutup. | Terbuka |
| 10 | Rendah | `scripts/aistim_tool.js:366-373` | Menu "Administrator" dicari dengan `querySelectorAll('*')` dan membaca `textContent` setiap elemen. Hanya dijalankan sekali saat panel dibuat. (Temuan 7 audit lama.) | Terbuka |
| 11 | Info | `scripts/aistim_tool.js:44`, `:80-83` | Daftar role pusat (`SENTOT`, `SURYO`, `MANAJEMEN PUSAT`) tidak memuat `TIMORITEL`, padahal `salespenjualan.js:29`, `piutang.js:29`, dan `repairv2.js:29` memuatnya. Pencocokan nama memakai potongan teks (`indexOf`), sehingga nama kasir lain yang mengandung "SENTOT" atau "SURYO" juga lolos. Kode sudah menyatakan ini bukan pengamanan (baris 36). | Perlu keputusan |
| 12 | Info | `scripts/aistim_tool.js:90`, `:353-359`, `:108`, `:240` | Kode tidak terpakai: `PANEL_STATE_KEY`, `getPanelCollapsed`, `savePanelCollapsed`, dan atribut `data-row-idx` tidak pernah dibaca. | Terbuka |

## Langkah berikutnya

- Temuan 1, 3, 4, 5: buka satu halaman SO asli dengan skrip aktif, lalu catat:
  - teks sel Perhitungan untuk barang yang belum dihitung dan untuk barang yang dihitung 0;
  - satuan yang muncul;
  - ada tidaknya rowspan di `tbody`;
  - jumlah `table.no_data_table.table` di halaman itu.
- Temuan 2: keputusan pemilik. Pilihannya:
  - mematikan auto refresh secara default;
  - menunda reload selama tab tersembunyi, dropdown terbuka, atau ada popup `tombol_so_list.js`;
  - menaikkan interval.
- Temuan 6, 8, 9, 10, 12 bisa digabung dalam satu PR perbaikan kecil:
  - bulatkan tampilan selisih;
  - perbarui hitung mundur tanpa memicu observer, atau abaikan mutasi di dalam `#erzap-panel`;
  - hentikan `pollInit` setelah batas waktu;
  - cari menu lewat selektor yang lebih sempit;
  - hapus kode yang tidak terpakai.

  PR itu juga menaikkan `@version`.
- Temuan 11: keputusan pemilik soal penyamaan daftar role pusat antar skrip.
