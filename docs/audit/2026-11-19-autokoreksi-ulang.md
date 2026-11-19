# Audit ulang skrip Erzap - Auto Koreksi (`erzap_autokoreksi.js`) — 2026-11-19

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: 0fa4276
- Versi: 1.13.5 (`@version` di `scripts/erzap_autokoreksi.js`). Manifest N/A, karena ruang lingkupnya hanya userscript.
- Auditor: agen Claude (Opus 5.5), dibantu satu sub-agen peninjau independen. Sub-agen membaca kode 1.13.4 tanpa diberi kesimpulan auditor. Semua temuannya yang bisa diuji sudah diulang auditor pada 1.13.5. Audit dilakukan atas permintaan pemilik repo.
- Ruang lingkup:
  - Seluruh `scripts/erzap_autokoreksi.js` 1.13.5 (1479 baris), terutama alur isi, simpan, pindah halaman, CEK SIMPAN, dan cek akhir. Perubahan 1.13.3–1.13.5 ikut diperiksa (penjaga Hasil SO, penjaga simpan berulang, jeda 4 dtk sebelum Simpan, jeda 3 dtk sesudahnya).
  - Checklist yang dipakai: bagian **Kode dan keamanan** dari [checklist-web-store.md](checklist-web-store.md). Bagian manifest, build, rilis, dan privasi N/A, karena skrip ini tidak masuk ZIP Store.
  - Tidak diuji dengan akun ERZAP sungguhan.

## Metode dan pengujian

- Pembacaan kode seluruh file oleh auditor dan oleh sub-agen. Temuan sub-agen yang tidak bisa diuji ditelusuri ulang di kode oleh auditor.
- Perilaku `KeyboardEvent` buatan di Chrome headless 150. Halaman uji berisi `new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13 })`, dan hasilnya `keyCode=13 which=13` untuk keydown, keypress, dan keyup. Jadi komentar di `:286-289` ("konstruktor KeyboardEvent MENGABAIKAN keyCode/which") tidak berlaku lagi.
- Uji perilaku dengan [fixtures/2026-11-19-autokoreksi-ulang.py](fixtures/2026-11-19-autokoreksi-ulang.py). Ini server tiruan halaman koreksi plus Chrome headless, dengan 12 skenario untuk perilaku ERZAP yang belum pasti. Hasil pada 1.13.5:

  | Skenario | Hasil 1.13.5 | Temuan |
  |---|---|---|
  | `dasar` (jQuery ada, tanpa handler Enter) | tiap halaman disimpan sekali, SO SELESAI | — |
  | `jqkeydown` (handler jQuery keydown `e.which === 13`) | **4 simpan untuk 2 halaman**, berpasangan pada milidetik yang sama, SO SELESAI | 1 |
  | `jqkeypress` | **2 simpan untuk 1 halaman** | 1 |
  | `inline` (`onkeypress` dengan `event.keyCode==13`) | **2 simpan untuk 1 halaman** | 1 |
  | `jqkeyup` (pembanding) | 1 simpan | — |
  | `campur` (sel Hasil SO produk ke-2 tanpa `id="so…"`, nilai 9) | tersimpan `['5', '0']`: **produk ke-2 jadi 0**, SO SELESAI | 2 |
  | `formpost` (simpan lewat `form.submit()`, server menjawab 1 dtk) | **4 simpan untuk 2 halaman**, selang ±0,36 dtk | 3 |
  | `rerender` (tabel digambar ulang AJAX, Simpan tetap ada, halaman berikutnya 6 dtk) | **halaman 1 disimpan 2 kali** | 4 |
  | `cekbalik` (simpan hal 1 gagal HTTP 500, lalu CEK SIMPAN) | rangkuman "Belum selesai (Hal 1)", lalu CEK SIMPAN: "**Semua halaman sudah tersimpan ✓** Dari Hal 2 sampai Hal 2" | 5 |
  | `lambat` (tabel dirender 1,5 dtk setelah load) | normal | — |
  | `lambat3` (tabel dirender 3 dtk setelah load) | hal 2 **tidak disimpan**, tercatat "Sudah tersimpan"; cek akhir menangkapnya ("Belum selesai Hal 2") | 6 |
  | `tanpareload` (3 halaman, simpan tanpa muat ulang) | tiap halaman disimpan sekali | — |

- Fixture audit sebelumnya ([fixtures/2026-11-19-autokoreksi.py](fixtures/2026-11-19-autokoreksi.py)) dijalankan dengan 35 dtk per skenario dan tetap lulus pada 1.13.5. Urutan tulisan tombol yang tercatat: `SIMPAN 4… 3… 2… 1…`, `SIMPAN...`, `JEDA 3… 2… 1…`.
- Cara mengulang (macOS dengan Google Chrome), dari root repo: `python3 docs/audit/fixtures/2026-11-19-autokoreksi-ulang.py [skrip.js] [skenario ...]`. jQuery 3.7.1 resmi diunduh dari cdnjs dan dicek SHA-256-nya.
- Pemeriksaan sintaks (runtime Node milik VS Code, `--check`) dan `python3 tools/cek_pr.py origin/main`: lulus.
- Batasan:
  - Halaman tiruan bukan markup ERZAP asli. Temuan bertanda "tergantung ERZAP" baru berdampak kalau ERZAP memang berperilaku seperti skenarionya.
  - Pagination AJAX tidak diuji.
  - Temuan 10–16 hanya ditelusuri di kode.

## Koreksi terhadap audit sebelumnya

Terhadap [2026-11-19-autokoreksi.md](2026-11-19-autokoreksi.md):

- Bagian Metode audit itu menyebut halaman tiruannya tidak memicu simpan lewat Enter, jadi yang teruji hanya jalur cadangan. Jalur Enter ternyata bisa menyimpan dua kali per halaman (temuan 1).
- Perbaikan temuan 1 audit itu (964ad04) hanya menangkap input yang tidak masuk grup produk mana pun. Kalau hanya sebagian sel Hasil SO kehilangan `id`, input produk itu ikut masuk grup produk sebelumnya dan tetap diisi 0 (temuan 2).
- Penjaga simpan berulang dari temuan 2 audit itu (964ad04) bisa terlewati kalau ERZAP menggambar ulang tabel lewat AJAX (temuan 4).
- Temuan 5 audit itu (cek akhir hanya mundur) diperluas di temuan 5 dan 9 di bawah.
- Temuan 3 dan 4 audit itu masih terbuka. Lokasinya sekarang menjadi temuan 7 dan 8.

## Hasil checklist (Kode dan keamanan) — versi 1.13.5

- [x] Tidak ada `eval`, `new Function`, atau `document.write` (0 kejadian).
- [x] Tidak ada kode yang diunduh lalu dijalankan. `fetch` dan iframe hanya ke URL same-origin (`bersihkanUrl`, `:601-608`).
- [x] Tidak ada `createElement('script')`.
- [x] Tidak ada kredensial, token, atau password. Penyimpanan hanya `sessionStorage`, tanpa `localStorage`.
- [x] `innerHTML` hanya berisi markup statis (`:367`, `:399`, `:406`). Status dan nomor halaman memakai `textContent`.
- [x] `postMessage` tidak dipakai (N/A).
- [x] `console.*` tidak mencetak data pribadi. Isinya ID SO, nomor halaman, URL pagination, pesan galat, dan potongan teks sel Hasil SO yang tidak terbaca (maksimal 30 karakter).

## Temuan

Lokasi baris mengacu ke 1.13.5 (commit 0fa4276).

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Tinggi | `scripts/erzap_autokoreksi.js:284-302`, dipanggil `:1185` | `tekanEnter` mengirim Enter dua kali ke handler halaman: sekali lewat event native (di Chrome 150 sudah membawa `keyCode`/`which` 13), lalu sekali lagi lewat `$.Event` jQuery. Handler Enter jQuery keydown/keypress atau inline `onkeypress` yang memanggil simpan akan jalan dua kali secara serentak, dan deteksi simpan tidak bisa mencegahnya. Terbukti di `jqkeydown`, `jqkeypress`, dan `inline`. Tergantung ERZAP: hanya berdampak kalau handler Enter halaman koreksi berjenis itu. | Terbuka. Usul: kirim event native saja, dan pakai `$.Event` hanya kalau browser mengabaikan `keyCode` (`new KeyboardEvent('keydown', ev).keyCode !== 13`). |
| 2 | Sedang | `scripts/erzap_autokoreksi.js:1091-1101`, `:1116` | Produk tanpa `rowspan` mengambil input dari baris-baris berikutnya yang tidak punya `td[id^="so"]`. Kalau sel Hasil SO produk berikutnya berganti `id`, input produk itu masuk grup produk sebelumnya dan diisi 0. Pemeriksaan `lepas` tidak menangkap kasus ini. Terbukti di `campur`. Tergantung ERZAP (perubahan markup sebagian). | Terbuka. Usul: gabungkan baris lanjutan hanya kalau sel di kolom Hasil SO (indeks kolom sama dengan `soCell`) kosong atau tidak ada. Kalau tidak begitu, hentikan proses seperti pada Hasil SO yang tidak terbaca. |
| 3 | Sedang | `scripts/erzap_autokoreksi.js:252-277`, `:1189-1201` | Simpan lewat `form.submit()` terprogram tidak memicu event `submit`, XHR, maupun fetch. Akibatnya setelah 400 ms simpan dianggap belum jalan, cadangan `submit_form_koreksi_so()` dipanggil, dan POST kedua terkirim. Terbukti di `formpost`. Tergantung ERZAP: simpan berupa form POST penuh dan server menjawab lebih dari ±0,4 dtk. | Terbuka. Usul: anggap `beforeunload`/`pagehide` sebagai tanda simpan sudah jalan, dan jangan memanggil cadangan selama halaman sedang berpindah. |
| 4 | Sedang | `scripts/erzap_autokoreksi.js:1304-1317` | `tungguHalamanBaru` menganggap tabel apa pun yang belum bertanda `data-aistim-done` sebagai halaman baru, lalu menghapus `TANDA_SIMPAN`. Kalau simpan AJAX menggambar ulang tabel halaman yang sama (dengan Simpan masih tampil) dan halaman berikutnya lambat dimuat, halaman yang sama diisi dan disimpan lagi. Di 1.13.5, jeda 4 dtk menutupi kasus ini selama halaman berikutnya termuat dalam ±4,5 dtk. Terbukti di `rerender` (halaman berikutnya 6 dtk). Tergantung ERZAP. | Terbuka. Usul: anggap halaman berganti hanya kalau URL atau nomor halamannya berubah. |
| 5 | Sedang | `scripts/erzap_autokoreksi.js:1376`, `:722-797` | Pesan "⚠️ Belum selesai … Klik CEK SIMPAN untuk melanjutkan" muncul di halaman terakhir, padahal CEK SIMPAN hanya mencari ke depan dari halaman yang sedang dibuka. Akibatnya CEK SIMPAN menjawab "Semua halaman sudah tersimpan ✓" padahal Hal 1 belum. Terbukti di `cekbalik`. Tidak tergantung ERZAP. | Terbuka. Usul: CEK SIMPAN mulai dari halaman 1, atau pesannya diganti menjadi "buka Hal X lalu klik CEK SIMPAN". |
| 6 | Sedang | `scripts/erzap_autokoreksi.js:976-1003`, `:694` | Kalau tabel dan tombol Simpan dirender JavaScript lambat, halaman tanpa Simpan dianggap sudah tersimpan setelah 10 percobaan (±2 dtk). Di jalur muat ulang setelah simpan, status "Tidak Pasti" bahkan berubah menjadi "Berhasil" walau simpannya gagal. Pembacaan lewat iframe di cek akhir punya batas serupa (4 dtk). Terbukti di `lambat3`: hal 2 terlewat, dan baru tertangkap oleh cek akhir. Tergantung ERZAP. | Terbuka. Usul: perpanjang waktu tunggu, atau pastikan dulu lewat `bacaHalaman` sebelum menganggap halaman sudah tersimpan. |
| 7 | Sedang | `scripts/erzap_autokoreksi.js:189-192`, `:1104` | (Audit sebelumnya, temuan 3) Teks Hasil SO berformat id-ID (`1.200`, `-1,5`) disalin apa adanya ke input koreksi. | Perlu verifikasi di browser |
| 8 | Sedang | `scripts/erzap_autokoreksi.js:612-623` | (Audit sebelumnya, temuan 4) `nomorHalaman` bisa salah membaca nomor halaman lewat `.page_num`. | Perlu verifikasi di browser |
| 9 | Rendah | `scripts/erzap_autokoreksi.js:1331-1352`, `:601-608`, `:744` | (Audit sebelumnya, temuan 5, diperluas) Cek akhir hanya berjalan mundur lewat link "sebelumnya". Kalau link pagination berupa `href="#"` atau `javascript:` (pagination AJAX), `bersihkanUrl` mengembalikan `null`, sehingga CEK SIMPAN dan cek akhir hanya membaca 1 halaman tetapi tetap melaporkan semua tersimpan. | Terbuka |
| 10 | Rendah | `scripts/erzap_autokoreksi.js:1139`, `:878-887`, `:972`, `:1009` | (Baru di 1.13.5) STOP saat hitung mundur `SIMPAN 4…` meninggalkan tabel yang sudah terisi dan bertanda `data-aistim-done` tetapi belum disimpan. START di halaman yang sama lalu berhenti dengan pesan "Halaman tidak berganti" sampai halaman di-F5. Ditelusuri di kode. | Terbuka. Usul: STOP menghapus tanda `data-aistim-done` kalau halaman itu belum sempat disimpan. |
| 11 | Rendah | `scripts/erzap_autokoreksi.js:1407-1421`, `:878-887` | Timer hitung mundur dan jeda hanya mengecek `erzap_auto_running`. STOP lalu START sebelum timer habis membuat timer lama hidup lagi di samping rantai baru. Tanda `data-aistim-done` mencegah tabel terisi dua kali, tetapi akibatnya bisa klik "berikutnya" ganda atau proses berhenti dengan "Halaman tidak berganti". Ditelusuri di kode. | Terbuka. Usul: token generasi alur yang dinaikkan di START dan STOP. |
| 12 | Rendah | `scripts/erzap_autokoreksi.js:241-250`, `:1193`, `:1226-1230` | XHR atau fetch apa pun dalam 400 ms setelah Enter dianggap sebagai simpan. Kalau saat itu ada request latar ERZAP, cadangan tidak dipanggil, dan halaman yang tidak tersimpan tercatat "Berhasil"; hanya cek akhir yang bisa menangkapnya. Ditelusuri di kode. Tergantung ERZAP. | Terbuka |
| 13 | Rendah | `scripts/erzap_autokoreksi.js:209-221`, `:767` | CEK SIMPAN membaca Nama Pengkoreksi dan Tanggal dari halaman yang sudah tersimpan. Kalau field itu tidak ada di sana, isian kosong disimpan tanpa peringatan, sehingga halaman tujuan memakai nilai bawaan ERZAP (misalnya tanggal hari ini). Ditelusuri di kode. Tergantung markup. | Terbuka |
| 14 | Rendah | `scripts/erzap_autokoreksi.js:648-649` | `fetch` di `bacaHalaman` tidak punya batas waktu (jalur iframe punya batas 15 dtk). Kalau request menggantung, `cekJalan` tetap `true`, sehingga START dan CEK SIMPAN diabaikan dan STOP tidak bisa melepasnya sampai halaman di-F5. Ditelusuri di kode. | Terbuka |
| 15 | Rendah | `scripts/erzap_autokoreksi.js:101-140` | Fitur "Duplikat tab" di Chrome menyalin `sessionStorage`, termasuk status jalan dan tanda lanjut yang belum lewat 60 dtk. Tab salinan bisa ikut melanjutkan proses, sehingga dua tab menyimpan halaman yang sama. Ditelusuri di kode. Butuh aksi pengguna. | Terbuka |
| 16 | Rendah | `scripts/erzap_autokoreksi.js:1391` | `location.reload()` di akhir proses memunculkan dialog kirim ulang form kalau halaman terakhir adalah hasil POST tanpa redirect. Kalau dialog itu dikonfirmasi, simpan terakhir terkirim ulang. Tergantung ERZAP. | Terbuka |

## Yang sudah diperiksa dan aman

- Penjaga simpan berulang (`TANDA_SIMPAN`, `:107-127`, `:1016`) bekerja: simpan gagal yang dimuat ulang berhenti setelah 1 kali simpan (`gagal`). Tanda dibuang di halaman lain dan saat START/CEK SIMPAN.
- `angkaHasilSO` dan penyusunan `rencana`: sel kosong, `-`, dan `N.A.` menghentikan halaman sebelum ada input yang diubah. Input tanpa kolom Hasil SO sama sekali juga terdeteksi.
- Tanda `data-aistim-done` mencegah dua rantai proses mengisi tabel yang sama di semua balapan STOP/START yang ditelusuri.
- Tanda lanjut (`TANDA_LANJUT`, 60 dtk) dan reset saat ID SO berganti: membuka halaman secara manual tidak pernah menjalankan proses otomatis.
- Semua perulangan berakhir: CEK SIMPAN dan cek akhir (batas 500 halaman plus set URL/nomor), tunggu tabel, dan `tungguHalamanBaru` (60 dtk).
- Hitung mundur 1.13.5 mencari ulang tombol START setiap tik, sehingga tulisannya tetap tampil walau tombol dibuat ulang.
- Iframe pemeriksa tidak menjalankan skrip ini (ekstensi tanpa `allFrames`, plus `@noframes`).

## Langkah berikutnya

- **Prioritas: temuan 1.** Cek di ERZAP apakah halaman koreksi punya handler Enter. Buka halaman koreksi, lalu jalankan di console: `jQuery._data(document, 'events')`, `jQuery._data(document.querySelector('input[name*="jumlah_koreksi"]'), 'events')`, dan `document.querySelector('input[name*="jumlah_koreksi"]').outerHTML`. Kalau ada handler `keydown`/`keypress` atau atribut `onkeypress`, temuan 1 berlaku dan perlu segera diperbaiki. Perbaikannya kecil dan aman dilakukan walau handler itu ternyata tidak ada.
- Temuan 3: di tab Network, periksa apakah Simpan berupa XHR/fetch atau form POST penuh.
- Temuan 2, 4, 5, 6, 10: perbaiki dalam PR terpisah dengan kenaikan `@version`, lalu ulangi fixture audit ini.
- Temuan 7 dan 8: masih menunggu cek browser seperti di audit sebelumnya.
