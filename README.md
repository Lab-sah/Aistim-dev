# Aistim Tool v2.10.3

**Multi Userscript Manager** — script dibundel di folder `scripts/` + auto-sync dari GitHub. Engine `chrome.userScripts` — **CSP-safe** (jalan di Erzap).

---

# 🤖 PANDUAN WAJIB UNTUK AI / DEVELOPER LAIN

> **BACA INI DULU sebelum mengubah apapun di repo ini!**
> Repo ini pernah rusak 2x karena perubahan yang melanggar aturan di bawah.

## ⛔ LARANGAN (jangan pernah lakukan)

1. **JANGAN force push / timpa `main` dengan folder lama.** Selalu `git pull` dulu sebelum push. Kalau kamu (AI) tidak yakin versi lokalmu yang terbaru, clone ulang — jangan pernah `push --force`.
2. **JANGAN ubah `@name` script yang sudah ada.** `@name` adalah kunci dedupe — ganti nama = script lama & baru jalan DOBEL di halaman yang sama. Ubah isi script boleh, `@name` harus tetap.
3. **JANGAN hapus permission `"userScripts"` dari `manifest.json`.** Tanpa permission ini, semua script jatuh ke fallback script-tag yang **diblokir CSP Erzap** = semua script mati. (Ini bug fatal v2.6.x.)
4. **JANGAN tambah file script duplikat** (contoh: `aistim_tool_v18.js` — versi lama dari script yang sama). Satu script = satu file.
5. **JANGAN kembalikan sistem lama** (hardcoded `DEFAULT_SCRIPTS`, `chrome.scripting` MAIN world, inject `<script>` tag). Semua itu diblokir CSP Erzap.

## ✅ Cara Menambah Script Baru (TANPA update ekstensi)

Cukup tambah 1 file `.js` di folder **`scripts/`** — user tinggal klik 🔄 di popup:

```javascript
// ==UserScript==
// @name         Nama Unik Script       <- WAJIB unik, jangan sama dgn script lain
// @namespace    http://tampermonkey.net/
// @version      1.0.0                  <- format x.y.z (BUKAN tanggal)
// @description  Deskripsi singkat
// @match        https://*.erzap.com/path_halaman*   <- WAJIB wildcard *.erzap.com
// @grant        none
// ==/UserScript==
```

**Script yang pakai jQuery / variabel `window` milik halaman** (contoh: `$`, `jQuery`) WAJIB tambah tag khusus `@world main` di metadata, supaya didaftarkan ke MAIN world (tetap CSP-safe):

```javascript
// @match        https://*.erzap.com/produk_gudangs/lihat_stok/new*
// @world        main    <- WAJIB untuk script ber-jQuery (contoh: analisastok.js)
```

Aturan script:
- `@match` **selalu** pakai `https://*.erzap.com/...` (jangan `trial.` atau `demo.` saja) + akhiri dengan `*` kalau ada query string
- `@version` format `x.y.z` — naikkan setiap kali edit script (misal `1.0.0` → `1.0.1`)
- File baru di `scripts/` otomatis terdeteksi dari GitHub — **tidak perlu** edit file lain

## 🔢 Kapan Versi Dinaikkan

| Yang diubah | Yang dinaikkan | Perlu user install ulang? |
|---|---|---|
| Isi file di `scripts/` saja | `@version` script itu | ❌ TIDAK — cukup klik 🔄 di popup |
| `manifest.json`, `background/`, `content/`, `popup/`, `icons/` | `"version"` di manifest | ✅ YA — user download ZIP baru |

Setiap kenaikan `"version"` di manifest → GitHub Actions otomatis buat tag + release `vX.Y.Z` dengan ZIP berversi.

## 🌉 Jembatan Fetch Lintas Domain (v2.9.0+)

Userscript di halaman `*.erzap.com` bisa mengambil data dari situs lain lewat ekstensi (bypass CORS), contoh `olzap.js` → `partdistro.com`:

```javascript
window.postMessage({ aistimFetch: { id: 'unik1', url: 'https://partdistro.com/...', opts: { headers: {...} } } }, location.origin);
window.addEventListener('message', ev => {
  const r = ev.data && ev.data.aistimFetchResult;      // { id, ok, status, url, text, error }
  if (r && r.id === 'unik1') console.log(r.text);
});
```

- Tersedia hanya kalau `document.documentElement.dataset.aistimXfetch === '1'`
- Hanya dilayani dari halaman `*.erzap.com`, dan hanya ke host di `X_FETCH_ALLOW` (`background/background.js`) — tambah host di situ kalau butuh situs lain
- Request memakai cookie browser (`credentials: include`), jadi alur yang butuh session (mis. pencarian partdistro) ikut jalan

## 🏗️ Arsitektur Singkat

- `background/background.js` — engine utama: load script bundel (`scripts/index.json`) + remote (GitHub API folder `scripts/`), gabung dedupe by `@name` (versi tertinggi menang), daftarkan via `chrome.userScripts` API
- `content/content.js` — fallback untuk browser tanpa userScripts + badge handshake
- `popup/` — UI (tampilan dari Aistim.sdk): kartu Engine + tombol sinkron 🔄, cari script, daftar script dengan saklar ON/OFF (storage key `disabledAuto` by nama file), kartu versi baru dari GitHub Releases
- Storage keys: `disabledAuto`, `autoScripts` (+ nama/versi/match untuk popup), `syncStatus`, `effectiveScripts`, `repoListCache`, `releaseCheckCache`, `scripts` (legacy manual, tidak tampil di popup)
- Toggle OFF script = tambah nama file ke `disabledAuto` — jangan hapus file-nya

## 📋 Checklist Sebelum Push (untuk AI)

- [ ] `git pull` sudah dilakukan / clone fresh
- [ ] `node --check` lolos untuk semua file `.js` yang diubah
- [ ] `@name` script lama tidak berubah
- [ ] Permission `userScripts` masih ada di manifest
- [ ] Versi dinaikkan sesuai tabel di atas
- [ ] TIDAK force push

---

## ✨ Cara Kerja
1. Semua script dibundel di folder **`scripts/`** (daftar ada di `scripts/index.json`)
2. Saat browser start / klik 🔄 di popup, ekstensi cek versi script yang sama di GitHub — **kalau versi di GitHub lebih baru, itu yang dipakai** (update script tanpa reinstall ekstensi)
3. Script didaftarkan via `chrome.userScripts` API → **kebal CSP halaman** (termasuk Erzap)
4. Dedupe otomatis: script dengan `@name` sama hanya jalan sekali (versi tertinggi menang)

## 📦 Menambah / Update Script
- **Di GitHub** (direkomendasikan): upload/edit file `.js` di folder `scripts/` → klik 🔄 di popup → langsung aktif
- **Di paket ekstensi**: taruh file di folder `scripts/` + tambahkan nama file ke `scripts/index.json` → reload ekstensi

Script tampil sebagai kartu di popup (nama, halaman, versi), bisa di-toggle ON/OFF.

## 🗑️ Menghapus Script

Script yang sudah terlanjur dibundel tetap ada di paket ekstensi pengguna, jadi **menghapus file dari GitHub saja tidak cukup** (salinan bundel akan jalan lagi). Caranya (ekstensi v2.10.3+):

1. Tambahkan nama file ke daftar `"hapus"` di `scripts/index.json`, dan keluarkan dari `"scripts"`:
   ```json
   { "scripts": ["koreksiso.js", "..."], "hapus": ["ppob.js"] }
   ```
2. File `.js`-nya boleh dihapus dari folder `scripts/`.
3. Dalam ±1 menit script berhenti jalan dan hilang dari popup di semua pengguna, termasuk salinan bundel. Daftar hapus disimpan di ekstensi, jadi tetap berlaku saat offline.
4. **Biarkan nama di `"hapus"`** selama masih ada pengguna dengan paket lama yang membundel script itu. Mengeluarkan nama dari `"hapus"` = script bundel aktif lagi.

Ekstensi < v2.10.3 belum membaca `"hapus"`. Untuk mereka: timpa file di GitHub dengan versi kosong ber-`@name` sama, `@version` lebih tinggi, dan `@match https://*.erzap.com/__dihapus__*`.

**Gabungan keduanya** (dipakai sekarang untuk `analisastok`, `pengisianso`, `rakstok_lama`, `rekapbeban`, `rekapservis`, `rekapstokmin`, `smart_repair`): file stub kosong v99.0.0 **tetap ada dan tetap terdaftar di `"scripts"`** (untuk ekstensi lama), dan namanya juga ada di `"hapus"` (ekstensi v2.10.3+ mengabaikannya sepenuhnya, tidak tampil di popup). Stub baru boleh dibuang setelah tidak ada lagi pengguna ekstensi < v2.10.3.

## Fitur
- **Engine userScripts** — CSP-safe, script jalan di dunia aman
- **Bundled + auto-sync** — jalan offline dari bundel; update otomatis dari GitHub
- **Load Shim** — listener `window.load` tetap jalan walau script telat diinject
- **Handshake Check** — badge hijau hanya kalau script benar-benar berjalan (mode fallback)
- **Cek Update** — kartu "Versi baru" + download ZIP berversi (`Aistim-dev-<versi>.zip`); dicek saat popup dibuka (cache 1 jam) dan langsung saat tombol 🔄 ditekan. Tidak tampil untuk pemasangan dari Chrome Web Store

## Syarat
- **Chromium 120+** (Chrome / Kiwi / Edge / Brave / dll)
- **Chrome < 138**: Developer mode ON di `chrome://extensions/` (sudah pasti ON kalau load unpacked)
- **Chrome 138+**: aktifkan toggle **"Allow User Scripts"** di halaman detail ekstensi
- Browser lama (<120): engine fallback (script tag) — bisa diblokir CSP situs strict seperti Erzap

## Cara Install
1. Download ZIP (release terbaru) dan ekstrak
2. Buka Chrome -> `chrome://extensions/`
3. Aktifkan **Mode developer**
4. Klik **Muat yang belum dibongkar** (Load unpacked)
5. Pilih folder `Aistim-dev`
6. Buka popup — pastikan kartu atas tertulis **"Engine Aktif"** (titik hijau)

## Cara Pakai Erzap (Rekap Pesanan)
1. Buka halaman Erzap Pesanan Penjualan
2. Tunggu 1-3 detik — tombol **"Rekap Pesanan"** muncul otomatis

## Debug
Buka DevTools (F12) -> Console:
- `[Aistim] ===== Content script v2.9.9 loaded =====` — content script aktif
- `[Aistim] Engine: userScripts API (CSP-safe)` — engine utama aktif
- `[Aistim] ✅ registered: Nama v1.x (bundled/remote)` — script terdaftar (background)
- `[Aistim] ❌ Nama diblokir CSP` — fallback diblokir CSP (aktifkan userScripts)

## Changelog v2.10.3
- **Daftar hapus script**: `scripts/index.json` boleh berisi `"hapus": ["file.js"]`. Script di daftar itu tidak dijalankan dan tidak tampil di popup, termasuk salinan yang sudah terlanjur dibundel di paket ekstensi. Daftar disimpan di storage `daftarHapus` (tetap berlaku saat offline)

## Changelog v2.10.2
- Deskripsi ekstensi tanpa kata "AI" (ekstensi ini tidak memakai AI): "Multi Userscript Manager"
- ZIP Chrome Web Store (`tools/build-store.py`): izin `activeTab` yang tidak dipakai dibuang, dan `content.js` dibangun tanpa fallback inject `<script>` (blok `FALLBACK-SCRIPT-TAG`). ZIP/CRX dari GitHub tidak berubah

## Changelog v2.10.1
- Popup: status "Engine Aktif" tetap benar walau semua script dimatikan atau sync pertama setelah update belum selesai (`us-status` kini juga mengirim `tersedia`)
- Popup: tombol sinkron 🔄 juga langsung cek versi ekstensi terbaru (tanpa cache 1 jam), seperti tombol Cek Update lama
- Popup: kartu "Versi baru" tidak tampil untuk pemasangan dari Chrome Web Store (sudah di-update otomatis); ukurannya disamakan dengan kartu Engine
- Popup: ikon profil (tidak ada login di Aistim-dev) dan menu tekan-lama Tempel (butuh izin `clipboardRead`) dibuang

## Changelog v2.10.0
- **Popup baru, tampilan dari Aistim.sdk**: kartu Engine (status + jam sinkron + tombol 🔄), info "Aktif di halaman ini", kolom Cari script, daftar script berkartu dengan chip halaman, versi, dan saklar on/off. Engine & sinkron tetap sama (`background.js`); popup lama disimpan di branch `main-old`
- Kartu "Versi baru" muncul otomatis kalau ada rilis ekstensi yang lebih baru di GitHub
- `background.js` menyimpan nama/versi/match script di `autoScripts` + `syncStatus`, jadi popup terbuka cepat tanpa fetch tiap file

## Changelog v2.9.9
- **Tombol hijau "Rekap Pesanan" bawaan `content.js` dihapus** (tidak berfungsi di halaman `penjualans`, dan menghalangi tombol merah milik `pesananbaru.js` karena ID sama `btn-rekap-pesanan`). Rekap pesanan kini hanya dari script `pesananbaru.js`. Badge debug "Aistim: Tombol dibuat!" ikut hilang.
- `content.js` sekarang hanya berisi jembatan fetch lintas domain (`x-fetch`) + fallback script-tag

## Changelog v2.9.8
- **ID ekstensi tetap**: `manifest.json` kini memuat `key` (kunci publik) sehingga ID ekstensi selalu sama di setiap pemasangan/update (tidak lagi berubah-ubah mengikuti lokasi file)
- **Auto-update ekstensi (CRX)**: `manifest.json` punya `update_url` ke `updates.xml` di release terbaru. Workflow `release.yml` membuat `Aistim-dev-<versi>.crx` (ditandatangani) + `updates.xml` otomatis kalau secret `CRX_PRIVATE_KEY` sudah diisi; kalau belum, workflow tetap membuat ZIP seperti biasa
- **PENTING**: kunci privat TIDAK BOLEH masuk repo. Simpan hanya sebagai GitHub Secret `CRX_PRIVATE_KEY` + cadangan pribadi. Kalau hilang, ID ekstensi harus diganti dan semua pengguna wajib pasang ulang

## Changelog v2.9.7
- **Logo bulat di popup diperbaiki**: memakai logo AISTIM lengkap (lambang kecil di tengah + tulisan AISTIM) berbentuk lingkaran 56px, bukan potongan lambang saja

## Changelog v2.9.6
- **Ikon sudut membulat (oval/squircle)**: keempat sudut `icons/icon16|48|128.png` dibuat membulat dengan latar transparan supaya tampil lebih elegan
- **Logo bulat AISTIM di pojok kiri atas popup** (`icons/logo-round.png`)
- **Fix link ⬇ Download di popup**: sekarang mengarah ke ZIP release `Aistim-dev-<versi>.zip` (manifest di root), bukan "Source code zip" yang terbungkus folder dan memicu error "File manifes tidak ada"

## Changelog v2.9.5
- **Ikon baru tema biru (logo AISTIM)**: `icons/icon16|48|128.png` diganti. Ukuran 16px memakai lambangnya saja (tanpa teks) supaya tetap jelas di toolbar

## Changelog v2.9.4
- **Release ZIP siap pakai**: workflow release sekarang melampirkan `Aistim-dev-<versi>.zip` dengan `manifest.json` di root (bisa langsung di-load di Chrome/Lemur). Jangan pakai "Source code (zip)" bawaan GitHub — terbungkus folder sehingga muncul error "File manifes tidak ada atau tidak dapat dibaca"

## Changelog v2.9.3
- **Fix bug "Duplicate script ID" di `chrome://extensions/`**: `syncUserScripts()` dipanggil dari banyak sumber (install, browser start, alarm tiap 1 menit, toggle popup) — kalau 2 panggilan tumpang tindih, keduanya sama-sama `register()` id script yang sama secara paralel dan Chrome menolak yang kedua, membuat script itu (`rekapbeban.js`, `koreksiso.js`, dll) gagal aktif sampai sync bersih berikutnya
- Ditambah kunci (mutex) di `syncUserScripts()`: hanya 1 proses sync jalan sekaligus; panggilan yang masuk saat sync masih berjalan diantre & dijalankan ulang sekali setelah selesai, bukan ditumpuk

## Changelog v2.9.2
- **Auto-sync mendekati realtime**: tambah `chrome.alarms` (permission baru `"alarms"`) — background otomatis `syncUserScripts()` tiap 1 menit, bukan cuma saat browser start / toggle popup. Script baru/berubah di GitHub kebaca tanpa perlu restart browser atau klik 🔄 manual
- `LIST_CACHE_MS` diturunkan dari 5 menit → **1 menit**, disesuaikan dengan interval alarm di atas
- Catatan: interval 1 menit ini batas minimum `chrome.alarms` di Chrome — bukan realtime instan, tapi paling cepat yang bisa dicapai tanpa server/webhook sendiri

## Changelog v2.9.1
- **Fix auto-sync**: daftar file di `scripts/` sekarang dibaca lewat `raw.githubusercontent.com` (index.json), bukan GitHub API sebagai jalur utama — API tanpa token cuma jatah 60 request/jam per IP, kalau habis auto-sync gagal diam-diam & ekstensi balik ke bundel lama tanpa pesan error
- Tambah cache-buster di fetch raw (CDN GitHub tidak tembus `cache:'no-store'` biasa) supaya versi baru langsung kebaca
- Cek update di popup di-cache otomatis 1 jam; klik manual (tombol 🔄) tetap langsung cek tanpa cache

## Changelog v2.9.0
- **Jembatan Fetch Lintas Domain**: `content.js` relay `window.postMessage({aistimFetch})` ke background lewat handler `'x-fetch'` (`credentials: include`), hanya aktif dari halaman `*.erzap.com` dan hanya ke host yang ada di `X_FETCH_ALLOW` (lihat bagian "🌉 Jembatan Fetch Lintas Domain" di atas)
- `olzap.js` 1.1.1: tab baru **"OLZAP"** — cari barcode di partdistro.com (ikut alur `cek_partdistro.py`), hasil dirender sebagai kartu (gambar, nama, harga, stok, link); partdistro memblokir CORS & iframe jadi butuh jembatan ekstensi, tanpa itu tampil pesan + link buka tab baru

## Changelog v2.8.0
- Rilis untuk **test upgrade** extension (install ZIP baru di atas versi lama)
- Termasuk semua perbaikan v2.7.1–v2.7.9:
  - Icon bulat logo AISTIM baru (16/48/128)
  - `web_accessible_resources` untuk fetch script via content script
  - Banner peringatan popup jika "Izinkan Skrip Pengguna" belum aktif (Chrome 138+)
  - Fix toggle aktif/nonaktif yang kembali aktif setelah refresh (race condition)
  - Dukungan `@world main` untuk script berbasis jQuery halaman
  - Script baru: analisastok.js (📊 Analisa Stok + scan barcode kamera)
  - README: panduan wajib untuk AI/developer lain

## Changelog v2.7.0
- **Fix error CSP**: kembalikan engine `chrome.userScripts` (sempat hilang di v2.6.x → script jatuh ke script-tag yang diblokir CSP Erzap)
- Script bundel di folder `scripts/` + `index.json` — tanpa inject script tag, tanpa fetch GitHub saat offline
- Auto-sync: versi lebih baru di GitHub otomatis menang
- Hapus `aistim_tool_v18.js` dari bundel (duplikat versi lama AISTIM TOOL)
- Fix listener manual-run yang mengganggu

## Changelog v2.5.x
- v2.5.3: ZIP download berversi via GitHub Releases + auto release workflow
- v2.5.2: tombol download update lebih andal (chrome.tabs.create)
- v2.5.1: hapus tombol manual — semua serba otomatis
- v2.5.0: auto-load folder scripts dari GitHub
