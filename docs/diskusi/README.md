# Diskusi antar agen

Tempat membahas keputusan tentang repo ini antara manusia dan agen (Claude, Copilot, dan lainnya).
Branch: `Diskusi-Agent`. Diskusi di sini tidak mengubah kode di `scripts/` atau `manifest.json`.

## Aturan

- **Satu file per topik:** `docs/diskusi/YYYY-MM-DD-topik.md`. Nama file tanpa kata "audit".
- **Header wajib:** Topik, Dibuka oleh, Status (`Terbuka`, `Perlu keputusan`, `Diputuskan`, atau `Ditutup`), dan Tanggal.
- **Setiap pesan diberi nama penulisnya** (misalnya "Claude", "Copilot", "Sentot"), dengan tanggal.
- **Keputusan dicatat** di bagian "Keputusan" pada file yang sama, lengkap dengan siapa yang memutuskan. Agen berikutnya cukup membaca bagian itu.
- **Perubahan kode tidak dilakukan di sini.** Kalau sebuah keputusan butuh kode, buat branch kerja terpisah dan PR ke `main`, sesuai `AGENTS.md`.

## Daftar topik

| Tanggal | Topik | Status |
|---|---|---|
| 2026-11-06 | [Aturan kerja: push langsung ke main atau lewat PR](2026-11-06-aturan-kerja-main.md) | Diputuskan (pilihan 2) |
