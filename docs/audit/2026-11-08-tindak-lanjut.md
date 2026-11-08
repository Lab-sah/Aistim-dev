# Tindak lanjut audit ekstensi — 2026-11-08

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: eb87b72
- Versi: 2.10.8 (`manifest.json`, belum dinaikkan)
- Auditor: agen Claude (Haiku 5.5), atas permintaan pemilik repo
- Ruang lingkup: pengecekan status temuan di [2026-11-08-ekstensi.md](2026-11-08-ekstensi.md) terhadap `main` pada eb87b72. Hanya temuan yang disebut di audit itu yang diperiksa ulang. Checklist [checklist-web-store.md](checklist-web-store.md) tidak diperiksa ulang.

## Metode dan pengujian

- Pemeriksaan kode dengan `git show origin/main:<path>` dan `grep`, tanpa mengubah working tree.
- Pengecekan manifest dengan `grep activeTab` pada `manifest.json` di `origin/main`.
- Node.js tidak tersedia di mesin ini, jadi sintaks `content/content.js` belum diuji dengan parser. Pengujian perilaku di browser tidak dilakukan.
- Cara mengulang: jalankan perintah `git show origin/main:content/content.js | grep -n "ev.origin"` dan `git show origin/main:manifest.json | grep -n activeTab`.

## Koreksi terhadap audit sebelumnya

- Tidak ada

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Tinggi | `background/background.js:109-113`, `:339-351` | Kode dari GitHub dijalankan lewat `chrome.userScripts` tanpa verifikasi hash atau tanda tangan | Perlu keputusan |
| 2 | Tinggi | Pengaturan branch protection `main` | `required_approving_review_count` = 0 dan `enforce_admins` = false | Perlu keputusan |
| 3 | Tinggi | Riwayat `main` | Commit langsung ke `main` tanpa PR. Pada tindak lanjut ini dua push dilakukan dengan melewati aturan PR dan check `cek`: `15d8da8` (salespenjualan.js 1.7.0 dan revert 1.7.1) dan `eb87b72` (perbaikan temuan 5, 7, 8) | Terbuka (proses) |
| 4 | Sedang | `content/content.js:78`, `tools/build-store.py:48` | Perbaikan `runDynamicScripts` ada di `main`, belum dirilis karena versi belum naik | Terbuka: menunggu kenaikan versi yang disetujui pemilik |
| 5 | Sedang | `content/content.js:176` | Pemeriksaan `event.origin` pada jembatan fetch | Diperbaiki (`eb87b72`) |
| 6 | Sedang | `privacy-policy.html` | Belum dicocokkan dengan `scripts/rekam.js` dan data yang dikirim. Placeholder `[NAMA PENGEMBANG]` dan `[ALAMAT KONTAK]` masih ada di `privacy-policy.html:97-98` | Terbuka |
| 7 | Rendah | `content/content.js:6` | Log URL lengkap yang bisa memuat query string | Diperbaiki (`eb87b72`) |
| 8 | Rendah | `manifest.json:11` | Izin `activeTab` tidak dipakai | Diperbaiki (`eb87b72`) |
| 9 | Rendah | `manifest.json:7` | Deskripsi manifest masih teknis | Terbuka |
| 10 | Rendah | `host_permissions` untuk `partdistro.com`, `raw.githubusercontent.com`, `api.github.com` | Masih diminta sebagai wajib, belum memakai `optional_host_permissions` | Terbuka |
| 11 | Info | `content/content.js` | `createElement('script')` hanya ada di repo dan dibuang oleh build Store | Tidak perlu tindakan |

## Langkah berikutnya

- Keputusan pemilik untuk temuan 1 dan 2, dan pengaturan branch protection di GitHub.
- Kenaikan versi ke 2.10.9 setelah disetujui, untuk merilis perbaikan temuan 4.
- Pengisian nama pengembang dan alamat kontak di `privacy-policy.html`, lalu pencocokan dengan `scripts/rekam.js` (temuan 6).
- Keputusan untuk deskripsi manifest dan `optional_host_permissions` (temuan 9 dan 10).
