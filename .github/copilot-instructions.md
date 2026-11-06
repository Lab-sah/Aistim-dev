# Instruksi untuk GitHub Copilot

Repo ini adalah ekstensi Chrome Aistim Tool. Sebelum mengaudit atau mengubah apa pun, baca `docs/audit/README.md` dan `docs/audit/checklist-web-store.md`.

Untuk audit:

- Simpan hasilnya sebagai file baru `docs/audit/YYYY-MM-DD-<ruang-lingkup>.md`, dengan nama tanpa mengulang kata "audit".
- Isi header (Repo, Commit saat audit berupa hash, Versi, Auditor, Ruang lingkup yang menyebut checklist yang dipakai), bagian "Koreksi terhadap audit sebelumnya", dan status setiap temuan sesuai `docs/audit/README.md`.
- Simpan data uji di `docs/audit/fixtures/` agar pengujian bisa diulang.
- Jangan mengubah kode di dalam audit. Perbaikan dibuat sebagai PR terpisah.

Untuk perubahan kode: `main` diproteksi, jadi kerjakan lewat branch dan Pull Request. Jangan menaikkan `version` di `manifest.json` tanpa persetujuan pemilik.
