# Aistim Tool — panduan untuk agen

Ekstensi Chrome (Manifest V3) untuk situs Erzap. Repo utama: `Lab-sah/Aistim-dev`.

## Sebelum mengubah atau mengaudit

- Standar publikasi dan checklist rilis: `.claude/skills/standar-extension/SKILL.md`.
- Checklist audit Web Store: `docs/audit/checklist-web-store.md`.
- Setiap audit disimpan sebagai file baru di `docs/audit/` (format di `docs/audit/README.md`). Jangan mengubah audit lama.
- Rilis ke Web Store: `docs/chrome-web-store.md`.

## Aturan kerja

- `main` diproteksi. Perubahan masuk lewat branch lalu Pull Request, dan check `cek` harus lulus. Jangan push langsung ke `main`.
- Jangan menaikkan `version` di `manifest.json` tanpa persetujuan pemilik. Kenaikan versi memicu rilis ke Web Store.
- Jangan menghapus stub di `scripts/` (`pengisianso.js`, `servisindex.js`, `rakstok_lama.js`). Stub itu sengaja dipertahankan.
- Jangan menghapus `key` dan `update_url` dari `manifest.json`.
- Zip Web Store dibuat dengan `python3 tools/build-store.py <folder>`. Jangan mengunggah zip biasa.
