# Audit reload dan fetch otomatis — 2026-11-20

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: 66bbf6d (`origin/main`, setelah PR #105 dan #106)
- Versi: ekstensi 2.10.8 (`manifest.json`). Versi tiap skrip ditulis di tabel inventaris.
- Auditor: agen Claude (Opus 5.5), atas permintaan pemilik repo
- Ruang lingkup: semua skrip aktif di `scripts/` (25 file, yaitu daftar `"scripts"` dikurangi `"hapus"` di `scripts/index.json`), ditambah `background/background.js`, `content/content.js`, dan `popup/popup.js`. Pertanyaannya: skrip mana yang me-reload atau memindah halaman sendiri, dan skrip mana yang mengirim request tanpa diklik user (saat halaman dibuka, berkala, atau berantai). Stub kosong (22 file) tidak dipindai. Checklist Web Store tidak diperiksa penuh. Hanya dua poin yang terkait langsung dengan temuan yang ditandai di bagian Checklist, sisanya tidak diperiksa di audit ini. Tidak diuji di browser dan tidak diuji dengan akun ERZAP sungguhan.

## Metode dan pengujian

- Pemindaian pola dengan [fixtures/2026-11-20-auto-reload-fetch.py](fixtures/2026-11-20-auto-reload-fetch.py) untuk tiga kategori:
  - RELOAD: `location.reload`, `location.href =`, `.submit()`, `requestSubmit`.
  - FETCH: `fetch(`, `XMLHttpRequest`, `$.ajax`, iframe tersembunyi, `x-fetch`.
  - TIMER: `setInterval`, `chrome.alarms`, `document.hidden`, `visibilitychange`.
- Baris lebih dari 400 karakter dilewati, yaitu library yang dibundel seperti SheetJS di `crm.js`. Hasil di commit 66bbf6d: RELOAD 13 baris, FETCH 86 baris, TIMER 37 baris.
- Setiap kandidat dibaca manual untuk menentukan pemicunya: otomatis (saat halaman dibuka, interval, atau berantai setelah aksi pertama) atau hanya saat diklik. Pemicu ditelusuri sampai ke pemanggilnya, misalnya `dataRak` → `segarkanStatusRak`/`pompaFilter` di `rakstok.js`.
- Riwayat dicek dengan `git log --follow -- scripts/erzap_trans_beban.js` (asal polling 30 detik ada di v1.2.9, `8411a11`) dan `git log -- scripts/olzap.js` (stub sejak `f5010ff`, 2026-10-31).
- Sintaks skrip yang diubah setelah audit dimulai (`erzap_trans_beban.js` 1.2.13, `ppob.js` stub 99.0.0) dicek dengan Node milik Visual Studio Code (v24.22.1, `--check`). Hasil: lulus. Check `cek` di PR #105 dan #106 juga lulus.
- Cara mengulang dari root repo: `python3 docs/audit/fixtures/2026-11-20-auto-reload-fetch.py` (atau dengan argumen `RELOAD`, `FETCH`, `TIMER`).
- Pengujian perilaku di browser belum dilakukan. Jumlah request di bawah adalah hasil membaca kode, bukan hasil pengukuran di tab Network.

## Koreksi terhadap audit sebelumnya

- [2026-11-06-audit.md](2026-11-06-audit.md) temuan 6 dan [2026-11-13-ekstensi.md](2026-11-13-ekstensi.md) (poin checklist jembatan `postMessage`): jembatan `x-fetch` diperlakukan sebagai fitur yang dipakai dan cukup dibatasi. Padahal satu-satunya pemakainya, `olzap.js`, sudah menjadi stub sejak `f5010ff` (2026-10-31), sebelum kedua audit itu dibuat. Di commit 66bbf6d tidak ada skrip yang mengirim `aistimFetch`. Jadi jembatan ini kode mati yang masih bisa dipanggil. Lihat temuan 2.
- [2026-11-08-tindak-lanjut.md](2026-11-08-tindak-lanjut.md) temuan 10 meminta `partdistro.com` dipindah ke izin opsional. Sebenarnya host itu tidak dibutuhkan sama sekali sejak `olzap.js` dihapus, karena satu-satunya pemakainya jembatan di atas. Lihat temuan 2.

## Inventaris

### Reload atau pindah halaman sendiri

| Skrip | Lokasi | Perilaku | Pemicu |
|---|---|---|---|
| `aistim_tool.js` 1.0.5 | `scripts/aistim_tool.js:648`–`:663` | `location.reload()` tiap 60 detik di `stok_opnams*` | Otomatis. Fitur `autoRefresh` hanya untuk role pusat (`:41`). Ditunda bila tab tidak aktif, menu atau popup terbuka, atau ada isian belum disimpan (`:631`–`:640`). Tidak aktif di halaman proses koreksi dan pengisian SO (`:21`). |
| `erzap_autokoreksi.js` 1.13.8 | `:1445` (klik halaman berikutnya), `:777`, `:1391` (reload saat selesai) | Berpindah halaman berantai lalu reload | Mulai dari klik START AUTO atau CEK SIMPAN. Setelah itu lanjut sendiri lewat `sessionStorage` `erzap_auto_running` (`:142`). |
| `crmrak.js` 1.2.1 | `:153` | Reload 700 ms setelah rak tersimpan | Klik user |
| `erzap_rak_barang.js` 1.2.3 | `:112`, `:148`, `:440` | Reload atau pindah setelah hapus, hapus massal, atau buat massal | Klik user |
| `crm.js` 1.4.4 | `:215` | Pindah ke `?rak=<id>` sebagai cadangan saat ganti rak | Proses impor yang dimulai user |

### Request tanpa klik

| Skrip | Lokasi | Perilaku | Frekuensi |
|---|---|---|---|
| `background.js` | `background/background.js:339`, `:345`, `:132`, `:186` | Sinkron skrip dari raw.githubusercontent.com: `index.json` + 25 skrip | **Tiap 1 menit**, sekitar 26 request per browser, juga saat tidak ada tab Erzap. Lihat temuan 1. |
| `home.js` 1.24.1 | `scripts/home.js:1027`, `:1028`–`:1032`, `:1001`–`:1002` | Saldo PPOB, pengeluaran PPOB (sampai 20 halaman), 3 kartu rekap lewat iframe tersembunyi yang men-submit form laporan | Saat Home dibuka, saldo tiap 60 detik, pengeluaran dan rekap tiap 5 menit. Hanya di `/` (`:20`), hanya role di `:828`, dilewati saat tab tidak aktif. |
| `erzap_trans_beban.js` 1.2.13 | `scripts/erzap_trans_beban.js:564`–`:569`, `:409` | Saldo perkiraan Kas/Bank | Saat form Beban dibuka, tiap 30 detik selama tab aktif, setelah isi kolom, dan saat tab dibuka lagi. Sudah diperbaiki, lihat temuan 3. |
| `pesanan_web.js` 1.26.4 | `scripts/pesanan_web.js:1118`, `:30` | `GET /penjualans` untuk lonceng pesanan web | Setiap halaman Erzap dibuka, kecuali cache lebih muda dari 90 detik. Polling 5 detik sudah dimatikan (`:1148`). Lihat temuan 4. |
| `pesanan_web.js` | `:783`, `:818` | Detail per baris pesanan untuk outlet pemesan (4 serentak, cache permanen di localStorage) | Di `/pesanan_penjualans`, baris baru dipindai tiap 1,5 detik |
| `pesanan_web.js` | `:1104`, `:1029`, `:826` | Pindai sampai 40 halaman `/penjualans` | Bila filter "Pesanan Web" tersimpan, otomatis setiap tabel berubah |
| `rakstok.js` 1.27.18 | `scripts/rakstok.js:1401`–`:1402`, `:1532`–`:1542` | Data rak atau gambar per baris (6 serentak, `:1407`, cache 1 jam `:75`) | Bila filter Rak atau Gambar aktif. Filter disimpan di `sessionStorage`, jadi tetap aktif setelah reload. |
| `piutanglain.js` 1.1.0 | `scripts/piutanglain.js:283`, `:149` | Halaman data piutang (sampai 10 baris), semua halaman saat mengetik di kolom cari | Saat halaman dibuka |
| `erzap_autokoreksi.js` | `:649`, `:672` | Baca halaman SO lewat fetch atau iframe tersembunyi | Selama proses auto berjalan |
| `content.js` | `content/content.js:105` (di dalam blok `FALLBACK-SCRIPT-TAG` `:65`–`:152`) | Fetch semua skrip aktif di setiap halaman | Hanya bila `chrome.userScripts` tidak tersedia. Blok ini dibuang dari ZIP Web Store. |

### Request hanya saat diklik

`tombol_so_list.js` (popup Hasil Koreksi SO, daftar outlet saat dropdown dibuka), `pengisian_so.js` (validasi "?"), `saldokas.js` (tombol saldo), `erzap_rak_barang.js`, `erzap_pemindahan_barang.js` (`$.ajax` saat modal dibuka), `barcode.js` (cetak ZPL), `crmrak.js` (daftar rak sampai 60 halaman saat popup dibuka, `:88`), `popup/popup.js` (cek rilis, cache 1 jam `:235`). `rekam.js` 1.9.8 nonaktif kecuali dibuka dengan `?rekam=1`. Bila aktif, skrip ini membungkus `fetch` dan XHR di semua halaman.

### Tanpa request jaringan

`auditanalisa.js`, `deposit.js`, `piutang.js`, `transkas.js`, `salespenjualan.js`, `repairv2.js`, `searchable_select.js`, `transpembelian.js`, `pelanggan.js` hanya memantau DOM lewat interval 300–500 ms atau MutationObserver.

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Sedang | `background/background.js:339`, `:345`, `:117`, `:132`, `:186` | Sinkron tiap 1 menit mengirim sekitar 26 request per browser (`index.json` + 25 skrip), sekitar 1.560 request per jam, termasuk saat tidak ada tab Erzap terbuka. `bust()` menambahkan `?t=<waktu>` sehingga cache CDN raw.githubusercontent.com selalu dilewati. ETag (`If-None-Match`) membuat sebagian besar balasan 304, jadi isinya kecil, tapi jumlah request tetap. Beberapa PC toko di satu IP berisiko kena pembatasan (429). | Perlu keputusan. File ekstensi: perubahan butuh rilis. Pilihan: jeda alarm dilonggarkan, `bust()` hanya untuk `index.json` atau sinkron manual (🔄), atau skrip hanya diambil bila hash di `index.json` berubah. |
| 2 | Sedang | `content/content.js:170`–`:192`, `background/background.js:2`, `:384`–`:412`, `tools/build-store.py:22` | Jembatan `x-fetch` (fetch berkredensial ke `partdistro.com`) tidak punya pemakai sejak `olzap.js` menjadi stub (`f5010ff`). Jembatan tetap aktif di setiap halaman `*.erzap.com` dan bisa dipanggil skrip apa pun di halaman itu. ZIP Web Store juga masih meminta izin host `https://partdistro.com/*` sebagai izin wajib, padahal tidak dipakai. | Perlu keputusan. File ekstensi: hapus jembatan, `X_FETCH_ALLOW`, dan `partdistro.com` dari `HOSTS`, lalu rilis. |
| 3 | Sedang | `scripts/erzap_trans_beban.js` (1.2.12: `:558`–`:563`, `:545`–`:553`) | Saldo diambil tiap 30 detik walaupun tab tidak aktif. Satu kali ganti Kas/Outlet/Tanggal mengirim sampai 4 request (listener elemen + listener dokumen, masing-masing untuk `change` dan `blur`/`focusout`). Listener elemen memegang tabel lama sehingga mati setelah tabel dibangun ulang. Teks peringatan ditulis ulang tiap detik dan memicu MutationObserver. | Diperbaiki (`b5dc1b2`, PR #105, versi 1.2.13): polling dilewati saat `document.hidden`, saldo diambil ulang saat tab dibuka lagi, listener elemen dihapus, hitungan 30 detik di-reset tiap pengambilan, teks hanya ditulis bila berubah. |
| 4 | Rendah | `scripts/pesanan_web.js:1118`, `:30` | `@match https://*.erzap.com/*` tanpa pembatasan role: semua user mengirim `GET /penjualans` setiap pindah halaman bila cache lebih dari 90 detik. Komentar `POLL_MS` (`:27`) masih menyebut "cek tiap 5 detik di latar", padahal polling dimatikan (`:1148`). `jadiPemimpin` dan `siklusCek` (`:1128`–`:1147`) tidak pernah dipanggil. | Terbuka |
| 5 | Rendah | `scripts/ppob.js` (1.21.1: `:653`, `:301`, `:374`–`:392`) | Saldo PPOB tiap 90 detik, dan pencarian nota per baris tabel (6 serentak, POST/GET/iframe) setiap tabel digambar ulang. | Diperbaiki (`66bbf6d`, PR #106): skrip dihapus atas permintaan pemilik (stub 99.0.0 + daftar `"hapus"`). |
| 6 | Rendah | `scripts/home.js:1027`–`:1032`, `:825` | Setelah `ppob.js` dihapus, fitur PPOB masih ada di Home (`kartuPpob`): saldo tiap 60 detik dan pengeluaran PPOB (sampai 20 halaman) tiap 5 menit. Kartu rekap memuat 3 halaman laporan lewat iframe tersembunyi tiap 5 menit. | Perlu keputusan: pertahankan, longgarkan jeda, atau hapus `kartuPpob` sejalan dengan `ppob.js`. |

## Checklist

Hanya poin yang terkait temuan. Poin lain tidak diperiksa di audit ini.

- [ ] Manifest: `permissions` / `host_permissions` hanya yang dipakai. **Belum**: `https://partdistro.com/*` di ZIP Store tidak dipakai (temuan 2).
- [ ] Kode dan keamanan: jembatan `postMessage` dibatasi asal dan tujuannya. **Belum**: pembatasannya ada (`content/content.js:175`–`:176`, `X_FETCH_ALLOW`), tapi jembatannya sendiri tidak lagi dibutuhkan (temuan 2).
- [x] Proses rilis: perubahan masuk `main` lewat PR dan check `cek` lulus (PR #105, #106).
- [x] Kualitas: ada cara menguji. Langkah manual ada di deskripsi PR #105 dan #106, pemindaian bisa diulang lewat fixture.

## Langkah berikutnya

- Temuan 1 dan 2 menyentuh file ekstensi (`background/`, `content/`, `tools/build-store.py`) dan butuh rilis. Keduanya menunggu keputusan pemilik dan sebaiknya digabung dalam satu rilis.
- Temuan 4 bisa diperbaiki tanpa rilis: batasi `pesanan_web.js` ke role tertentu atau perpanjang `CACHE_MS`, lalu bersihkan komentar dan kode polling yang mati.
- Temuan 6: tunggu keputusan pemilik soal fitur PPOB di Home.
- Uji di browser (tab Network) untuk `erzap_trans_beban.js` 1.2.13 sesuai langkah di PR #105.
