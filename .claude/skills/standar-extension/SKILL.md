---
name: standar-extension
description: Standar publikasi dan struktur ekstensi browser (Chrome Web Store, Edge Add-ons, Firefox Add-ons) untuk repo Aistim Tool. Pakai saat mengubah manifest.json, background/, content/, popup/, icons/, menambah izin, menyiapkan rilis/zip store, atau mengecek apakah ekstensi sudah memenuhi standar publikasi.
---

# Standar extension (Chrome Web Store, Edge, Firefox)

## 1. Standar Chrome Web Store

| Aspek | Standar |
|---|---|
| Manifest | Manifest V3 (`"manifest_version": 3`) |
| Keamanan | Tidak ada malware atau kode berbahaya |
| Privasi | Transparan tentang penggunaan data |
| Permission | Hanya izin yang diperlukan |
| UI/UX | Antarmuka jelas dan konsisten |
| Kode | Tidak boleh menyamarkan (obfuscate) kode berbahaya |
| Identitas | Nama, ikon, deskripsi yang jelas |
| Publikasi | Mengikuti kebijakan Google |

## 2. Struktur standar

Contoh struktur minimal dari standar:

```
my-extension/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── popup.css
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── privacy-policy.html
```

Di repo ini strukturnya dikelompokkan per folder (`background/`, `content/`, `popup/`, `icons/`), dan `privacy-policy.html` belum ada. Pengelompokan folder itu sah selama path di `manifest.json` benar.

## 3. Manifest V3

Contoh minimal dari standar:

```json
{
  "manifest_version": 3,
  "name": "My Extension",
  "version": "1.0.0",
  "description": "My browser extension",
  "permissions": ["storage"],
  "action": { "default_popup": "popup.html" }
}
```

## 4. Standar publikasi

- Google Chrome: Chrome Web Store.
- Microsoft Edge: Edge Add-ons.
- Mozilla Firefox: Firefox Add-ons.

## Checklist saat mengubah atau merilis

1. **Manifest V3**: `manifest_version` tetap 3. Background harus `service_worker`, bukan `background.page`.
2. **Izin minimal**: setiap entri `permissions` dan `host_permissions` harus punya alasan. Cek apakah `<all_urls>` benar-benar perlu, atau bisa dipersempit (misalnya ke `*.erzap.com`). Izin yang tidak dipakai dihapus.
3. **Kode**: tidak ada kode yang disamarkan. Tidak ada `eval`, `new Function`, atau `document.write` untuk menjalankan kode dari luar paket, kecuali lewat `chrome.userScripts` yang sudah dibahas di `background/background.js`.
4. **Kode dari luar paket**: sinkron script dari GitHub lalu didaftarkan ke `chrome.userScripts` adalah area yang perlu dicek terhadap kebijakan Web Store (remote code). Jangan menambah jalur baru seperti itu tanpa membaca kebijakannya dulu.
5. **Privasi**: data apa yang dikumpulkan, disimpan, atau dikirim harus disebut. Pastikan `privacy-policy.html` ada dan sesuai.
6. **Ikon**: `icons/icon16.png`, `icon48.png`, dan `icon128.png` harus ada, dan di-referensikan di `manifest.json` (`icons` dan `action.default_icon`).
7. **Identitas**: `name` dan `description` di manifest harus jelas dan sesuai dengan fungsi ekstensi.
8. **Versi**: setiap perubahan di `background/`, `content/`, `popup/`, `manifest.json`, atau `icons/` menaikkan `version` di `manifest.json`. `VERSION` di `background/background.js` dan `content/content.js` harus sama dengan manifest. Ini juga diperiksa `tools/cek_pr.py`.
9. **Zip store**: `tools/build-store.py` membuat zip untuk Web Store. Ia membuang `key` dan `update_url`, mempersempit host, dan memindahkan izin CRM ke `optional_host_permissions`. Jangan mengunggah zip biasa ke Web Store.
10. **Script di `scripts/`** tidak masuk zip store. Perubahan di sana tidak butuh rilis ekstensi, tetapi tetap harus lolos `node --check` dan `tools/cek_pr.py`.

## Catatan spesifik repo ini

- `manifest.json` punya `key` dan `update_url`. Keduanya dipakai untuk paket mandiri, bukan untuk Web Store. Jangan dihapus dari versi repo. Versi store dibuat oleh `build-store.py`.
- `update_url` dan `REPO.owner` (di `background/background.js`) memakai `devtim-lab`. Nama itu dialihkan ke `Lab-sah`. Lihat `docs/chrome-web-store.md` untuk langkah rilis.
- Izin `activeTab` ada di manifest repo tetapi dibuang di zip store.

## Audit

Setiap kali diminta audit atau standarisasi repo ini:

1. Ikuti checklist di `docs/audit/checklist-web-store.md`. Checklist ini melengkapi bagian di atas, dan semua poin relevan harus diperiksa.
2. Simpan hasilnya sebagai file baru `docs/audit/YYYY-MM-DD-<ruang-lingkup>.md` memakai template di `docs/audit/README.md`. Jangan mengubah audit lama.
3. Tulis audit lewat branch dan Pull Request, karena `main` diproteksi (check `cek` wajib).
4. Temuan harus punya status: `Diperbaiki` (dengan hash commit), `Terbuka`, `Perlu keputusan`, atau `Dikoreksi` (dengan alasan).
