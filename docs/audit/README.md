# Audit

Setiap audit repo ini disimpan di folder ini, supaya bisa dijadikan acuan audit berikutnya dan untuk menyamakan standar sebelum unggah ke Chrome Web Store.

## Aturan

1. Nama file: `YYYY-MM-DD-<ruang-lingkup>.md` (tanggal audit, ruang lingkup singkat).
2. Setiap audit memakai template di bawah dan memeriksa semua poin di [checklist-web-store.md](checklist-web-store.md) yang relevan.
3. Setiap temuan punya status: `Diperbaiki` (sebutkan commit), `Terbuka`, `Perlu keputusan`, atau `Dikoreksi` (ternyata bukan masalah, sebutkan alasannya).
4. Audit yang sudah dibuat tidak diubah lagi. Audit baru dibuat sebagai file baru, dan bisa merujuk audit sebelumnya.
5. Audit disimpan lewat Pull Request, karena `main` diproteksi.

## Template

```markdown
# Audit <ruang lingkup> — YYYY-MM-DD

- Repo: Lab-sah/Aistim-dev
- Commit saat audit: <hash>
- Versi manifest: <versi>
- Ruang lingkup: <apa yang diperiksa dan apa yang tidak>

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---------|--------|--------|--------|
| 1 | Tinggi/Sedang/Rendah | path:baris | ... | Diperbaiki (hash) / Terbuka / Perlu keputusan / Dikoreksi |

## Koreksi terhadap audit sebelumnya
- ...

## Langkah berikutnya
- ...
```

## Daftar audit

- [2026-11-06-audit.md](2026-11-06-audit.md): audit awal (keamanan, build Web Store, struktur repo).
