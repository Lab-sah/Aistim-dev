# Audit

Setiap audit repo ini disimpan di folder ini, supaya bisa dijadikan acuan audit berikutnya dan untuk menyamakan standar sebelum unggah ke Chrome Web Store.

## Aturan wajib

1. **Nama file** `YYYY-MM-DD-<ruang-lingkup>.md`. Ruang lingkup ditulis singkat dan tidak mengulang kata "audit". Contoh: `2026-11-06-auditanalisa.md`, bukan `2026-11-06-audit-auditanalisa.md`.
2. **Field wajib di header**: Repo, Commit saat audit (hash penuh atau 7 karakter, bukan nama branch), Versi (versi `manifest.json` untuk audit ekstensi, atau `@version` skrip untuk audit skrip), dan Ruang lingkup. Field yang tidak berlaku ditulis `N/A` dengan alasan singkat.
3. **Bagian "Koreksi terhadap audit sebelumnya" wajib ada.** Kalau tidak ada koreksi, tulis "Tidak ada".
4. **Checklist**: setiap poin di [checklist-web-store.md](checklist-web-store.md) harus ditandai `lulus`, `belum`, atau `N/A` (dengan alasan). Audit yang tidak memeriksa checklist harus menyebutkan itu di Ruang lingkup.
5. **Setiap temuan** punya lokasi `path:baris` yang bisa dicek ulang, serta status: `Diperbaiki` (dengan hash commit), `Terbuka`, `Perlu keputusan`, atau `Dikoreksi` (dengan alasan).
6. **Hasil pengujian harus bisa diulang**. Data uji buatan disimpan di `docs/audit/fixtures/` dengan nama yang menunjuk ke audit terkait. Kalau alat tidak tersedia (misalnya Node.js), tulis alat yang dipakai sebagai gantinya dan batasan pengujiannya.
7. **Tidak mengubah kode** dalam audit. Perbaikan dibuat sebagai PR terpisah dan dirujuk di status temuan.
8. **Audit yang sudah dibuat tidak diubah lagi.** Audit baru dibuat sebagai file baru dan merujuk audit sebelumnya.
9. **Disimpan lewat Pull Request**, karena `main` diproteksi (check `cek` wajib).

## Template

```markdown
# Audit <ruang lingkup> — YYYY-MM-DD

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: <hash>
- Versi: <versi manifest, atau @version skrip; N/A jika tidak berlaku>
- Auditor: <nama agen atau orang>
- Ruang lingkup: <apa yang diperiksa dan apa yang tidak, termasuk checklist yang dipakai>

## Metode dan pengujian

- <alat yang dipakai, dan alat yang tidak tersedia beserta gantinya>
- <data uji di docs/audit/fixtures/ jika ada>
- <cara menjalankan ulang pengujian>

## Koreksi terhadap audit sebelumnya

- Tidak ada / <uraian>

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Tinggi/Sedang/Rendah | path:baris | ... | Diperbaiki (hash) / Terbuka / Perlu keputusan / Dikoreksi |

## Langkah berikutnya
- ...
```

## Daftar audit

- [2026-11-06-audit.md](2026-11-06-audit.md): audit awal (keamanan, build Web Store, struktur repo).
- [2026-11-06-auditanalisa.md](2026-11-06-auditanalisa.md): audit skrip `scripts/auditanalisa.js` 1.1.0 (perhitungan angka, Laba Rugi dan Neraca).
- [2026-11-06-userscripts.md](2026-11-06-userscripts.md): audit semua skrip di `scripts/` (parsing, HTML dinamis, rekaman, aksi yang mengubah data).
- [2026-11-08-ekstensi.md](2026-11-08-ekstensi.md): audit ekstensi terhadap checklist Web Store (manifest, kode, build ZIP, privasi), commit e643774.
