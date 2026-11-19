# Audit skrip Erzap - Auto Koreksi (`erzap_autokoreksi.js`) — 2026-11-19

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: 45c834c (isi `scripts/erzap_autokoreksi.js` sama sampai be10224)
- Versi: 1.13.2 (`@version` di `scripts/erzap_autokoreksi.js`); manifest N/A karena ruang lingkupnya userscript
- Auditor: agen Claude (Opus 5.5), atas permintaan pemilik repo
- Ruang lingkup: kebenaran alur isi, simpan, pindah halaman, CEK SIMPAN, dan cek akhir di seluruh `scripts/erzap_autokoreksi.js` (1369 baris, `@match https://*.erzap.com/stok_opnams/proses_koreksi_so/*`). Stub `scripts/koreksiso.js` hanya dicek bahwa isinya kosong. Cara ekstensi mendaftarkan userscript (`background/background.js:316-322`) diperiksa untuk perilaku di iframe. Checklist yang dipakai: bagian **Kode dan keamanan** dari [checklist-web-store.md](checklist-web-store.md), diperiksa pada versi hasil perbaikan 1.13.3. Bagian manifest, build, rilis, dan privasi N/A karena skrip ini tidak masuk ZIP Store. Tidak diuji dengan akun ERZAP sungguhan. Line number di tabel temuan merujuk ke versi 1.13.2 di commit 45c834c.

## Metode dan pengujian

- Pembacaan kode seluruh file, termasuk alur antarhalaman lewat `sessionStorage`.
- Pemeriksaan sintaks dengan runtime Node milik Visual Studio Code (`ELECTRON_RUN_AS_NODE=1 ... --check`): lulus untuk 1.13.2 dan 1.13.3.
- `python3 tools/cek_pr.py origin/main`: lulus. Alat melewati cek sintaksnya sendiri karena `node` tidak ada di shell.
- Uji perilaku dengan [fixtures/2026-11-19-autokoreksi.py](fixtures/2026-11-19-autokoreksi.py). Server lokal meniru halaman koreksi SO (sel Hasil SO, input `jumlah_koreksi`, `#simpan`, pagination, `submit_form_koreksi_so()` yang mengirim nilai lalu memuat ulang halaman). Chrome headless menekan START AUTO. Hasil:

  | Skenario | 1.13.2 (45c834c) | 1.13.3 (964ad04) |
  |---|---|---|
  | `ok`: 2 halaman, simpan berhasil | simpan `[5, 0, 1.200]` dan `[-2]`, masing-masing sekali; "SO SELESAI — semua 2 halaman" | sama |
  | `gagal`: simpan selalu gagal | halaman 1 disimpan **13 kali** dalam 14 detik, tanpa rangkuman | disimpan 1 kali, berhenti: "masih ada tombol Simpan setelah disimpan" |
  | `strip`: sel Hasil SO berisi `-` | tersimpan `[5, 0]`: produk kedua jadi **0**; "SO SELESAI" | tidak disimpan, berhenti: "Hasil SO-nya tidak terbaca" |
  | `tanpaid`: sel Hasil SO tanpa `id="so…"` | tersimpan `[0]`: semua jadi **0**; "SO SELESAI" | tidak disimpan, berhenti: "input koreksi tidak punya kolom Hasil SO" |

- Cara mengulang (macOS dengan Google Chrome), dari root repo: `python3 docs/audit/fixtures/2026-11-19-autokoreksi.py`. Untuk versi lama: `git show 45c834c:scripts/erzap_autokoreksi.js > /tmp/lama.js`, lalu jalankan dengan argumen `/tmp/lama.js`.
- Batasan uji: halaman tiruan bukan markup ERZAP asli. Enter tidak memicu simpan di halaman tiruan, jadi yang teruji adalah jalur cadangan `submit_form_koreksi_so()`. Pagination AJAX tidak diuji. Temuan 3 dan 4 tidak bisa diuji tanpa halaman ERZAP asli.
- Iframe tersembunyi yang dipakai CEK SIMPAN dan cek akhir (`bacaLewatIframe`) tidak menjalankan skrip ini. Ekstensi mendaftarkan userscript tanpa `allFrames` (default `false`, `background/background.js:316-322`), dan skrip juga memakai `@noframes`. Jadi status di `sessionStorage` (yang dipakai bersama iframe same-origin) tidak bisa direset dari dalam iframe.

## Koreksi terhadap audit sebelumnya

Terhadap [2026-11-08-autokoreksi.md](2026-11-08-autokoreksi.md):

- Temuan 5 (`status` masuk `innerHTML`): sudah diperbaiki di a3d20e0 (1.13.1). Baris tabel rangkuman sekarang memakai `textContent`.
- Temuan 1 (status `Tidak Pasti` tetap lanjut dan mengandalkan cek akhir): cek akhir ternyata hanya berjalan mundur lewat link "sebelumnya", sehingga tidak selalu mencakup semua halaman. Lihat temuan 5 di bawah.
- Temuan 4 (pembatasan akses hanya di klien): tambahan. Nama dicocokkan sebagai bagian teks `#info_kasir`, jadi `"SURYO"` juga cocok untuk nama seperti "Suryono". Ini memperluas akses tampilan di luar yang dimaksud. Status tetap Perlu keputusan pemilik.
- Lokasi baris di audit tersebut bergeser karena perubahan 1.13.1 sampai 1.13.3.

## Hasil checklist (Kode dan keamanan) — versi 1.13.3

- [x] Tidak ada `eval`, `new Function`, atau `document.write` (0 kejadian).
- [x] Tidak ada kode yang diunduh lalu dijalankan. `fetch` dan iframe hanya ke URL same-origin (`bersihkanUrl`).
- [x] Tidak ada `createElement('script')`.
- [x] Tidak ada kredensial, token, atau password. Penyimpanan hanya `sessionStorage`, dan tidak ada `localStorage`.
- [x] `innerHTML` hanya berisi markup statis (`:357`, `:389`, `:396`). Status dan nomor halaman memakai `textContent`.
- [x] `postMessage` tidak dipakai. Poin ini N/A.
- [x] `console.*` hanya mencetak ID SO, nomor halaman, URL link pagination, pesan galat, dan potongan teks sel Hasil SO yang tidak terbaca (maksimal 30 karakter). Tidak ada data pribadi.

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Tinggi | `scripts/erzap_autokoreksi.js:1050-1057`, `:1010-1011` | Input koreksi yang tidak masuk grup produk mana pun diisi `0` lalu disimpan. Kalau sel Hasil SO berganti `id` (`td[id^="so"]` tidak ketemu), semua input di semua halaman tersimpan 0 dengan status "Berhasil". Sel Hasil SO tanpa angka (kosong, `-`) juga menjadi `0`, dan `N.A.` menjadi `.`. Terbukti di skenario `strip` dan `tanpaid`. | Diperbaiki (964ad04): rencana isian disusun dulu; kalau ada Hasil SO tidak terbaca atau input tanpa kolom Hasil SO, halaman tidak diisi dan tidak disimpan, proses berhenti dengan pesan. |
| 2 | Sedang | `scripts/erzap_autokoreksi.js:932-954`, `:1101-1104` | Hanya kasus "tombol Simpan hilang setelah dimuat ulang" yang ditangani. Kalau setelah simpan ERZAP memuat ulang halaman dan tombol Simpan masih ada, halaman diisi dan disimpan lagi tanpa batas sampai STOP. Terbukti di skenario `gagal`: 13 kali dalam 14 detik. | Diperbaiki (964ad04): halaman yang disimpan dicatat (SO, URL, nomor halaman); kalau terbuka lagi dengan tombol Simpan masih ada, proses berhenti dengan status `Gagal Save`. |
| 3 | Sedang | `scripts/erzap_autokoreksi.js:1008-1011` | Teks Hasil SO disalin apa adanya ke input koreksi. ERZAP menampilkan angka dalam format id-ID (`1.234,5`, lihat `scripts/pengisian_so.js:35-40`). Kalau input koreksi dibaca sebagai angka biasa, `1.200` bisa tersimpan sebagai 1,2 dan `-1,5` sebagai -1. Tidak diubah di 1.13.3. | Perlu verifikasi di browser |
| 4 | Sedang | `scripts/erzap_autokoreksi.js:570-575` | `nomorHalaman` memakai elemen pertama (urutan dokumen) yang cocok dengan salah satu selector, termasuk `[class*="paginat"] .page_num`. Kalau `.page_num` ada di setiap nomor halaman, semua halaman terbaca sebagai halaman 1. Akibatnya CEK SIMPAN berhenti setelah satu halaman ("Semua halaman sudah tersimpan"), cek akhir bisa menyatakan SO selesai terlalu cepat, dan log per halaman saling menimpa. Teks seperti "Halaman 3" juga tidak terbaca (`parseInt` menghasilkan `NaN`). | Perlu verifikasi di browser |
| 5 | Rendah | `scripts/erzap_autokoreksi.js:1247-1267`, `:1331` | Cek akhir hanya berjalan mundur lewat link "sebelumnya" dari halaman tempat link "berikutnya" tidak ditemukan. Link "berikutnya" dicari dengan syarat tampil (`offsetParent`). Kalau link itu tersembunyi, halaman sesudahnya tidak dicek. Kalau pagination tidak punya link "sebelumnya", hanya halaman terakhir yang dicek. Pesannya tetap "semua N halaman sudah tersimpan" (di fixture tanpa link "‹", 1 dari 2 halaman). | Terbuka |

## Langkah berikutnya

- Temuan 3: di ERZAP, jalankan auto koreksi pada barang dengan Hasil SO ≥ 1.000 atau berdesimal, lalu cek nilai yang tersimpan. Kalau salah, ubah nilai ke angka mentah dengan pola `angka()` di `scripts/pengisian_so.js:35-40`.
- Temuan 4: di halaman koreksi halaman 2 atau lebih, jalankan di console: `[...document.querySelectorAll('.pagination .active, .pagination .current, [class*="paginat"] .active, [class*="paginat"] .current, [class*="paginat"] .page_num')].map(e => e.className + ' = ' + e.textContent.trim())`. Kalau item pertama bukan nomor halaman yang sedang dibuka, buang `.page_num` dari selector atau pilih elemen yang aktif saja.
- Temuan 5: di `cekAkhirSO`, ikuti juga `next` dari halaman pertama yang dibaca. Kalau masih ada halaman sesudahnya, cek juga atau laporkan bahwa jumlah halaman belum pasti.
- Setelah cek browser, catat hasilnya di audit baru yang merujuk audit ini.
