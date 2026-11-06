# Aistim Tool — instruksi untuk agen (Claude, Copilot, dan lainnya)

Ekstensi Chrome (Manifest V3) untuk situs Erzap. Repo: `Lab-sah/Aistim-dev`.

Wajib dibaca sebelum mengaudit atau mengubah repo ini:

- Aturan audit: `docs/audit/README.md`
- Checklist Web Store: `docs/audit/checklist-web-store.md`
- Standar publikasi: `.claude/skills/standar-extension/SKILL.md`
- Rilis ke Web Store: `docs/chrome-web-store.md`

## Aturan audit (ringkasan, detail di docs/audit/README.md)

- Simpan hasil audit sebagai file baru `docs/audit/YYYY-MM-DD-<ruang-lingkup>.md`. Ruang lingkup singkat, dan jangan mengulang kata "audit" di nama file.
- Header wajib: Repo, Commit saat audit (hash, bukan nama branch), Versi, Auditor, Ruang lingkup.
- Ruang lingkup menyebut checklist yang dipakai. Setiap poin ditandai lulus, belum, atau N/A dengan alasan.
- Bagian "Koreksi terhadap audit sebelumnya" wajib ada, isinya "Tidak ada" bila tidak ada koreksi.
- Setiap temuan punya lokasi `path:baris` dan status: Diperbaiki (dengan hash), Terbuka, Perlu keputusan, atau Dikoreksi (dengan alasan).
- Pengujian harus bisa diulang. Data uji disimpan di `docs/audit/fixtures/`.
- Audit tidak mengubah kode. Perbaikan dibuat sebagai PR terpisah.
- Audit yang sudah ada tidak diubah. Audit baru dibuat sebagai file baru.

## Aturan kerja

- `main` diproteksi. Perubahan lewat branch dan Pull Request, dengan check `cek` lulus. Jangan push langsung ke `main`.
- Jangan menaikkan `version` di `manifest.json` tanpa persetujuan pemilik. Kenaikan versi memicu rilis Web Store.
- Skrip di `scripts/` langsung berlaku untuk pengguna setelah merge. Perlakukan merge ke `main` sebagai rilis.
- Jangan menghapus stub di `scripts/` (`pengisianso.js`, `servisindex.js`, `rakstok_lama.js`).
- Jangan menghapus `key` dan `update_url` dari `manifest.json`.
- Zip Web Store dibuat dengan `python3 tools/build-store.py <folder>`. Jangan unggah zip biasa.
