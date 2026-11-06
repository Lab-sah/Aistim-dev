# Checklist standar Chrome Web Store

Dipakai di setiap audit sebelum unggah ZIP ke Web Store. Tandai tiap poin: `[x]` lulus, `[ ]` belum, `N/A` tidak berlaku (sebutkan alasannya).

## Manifest

- [ ] `manifest_version` 3.
- [ ] `version` dinaikkan dari versi yang sudah ada di Store (Store menolak versi yang sama atau lebih rendah).
- [ ] `key` dan `update_url` tidak ikut di ZIP Store (dibuang oleh `tools/build-store.py`).
- [ ] `permissions` hanya yang dipakai. `activeTab` tidak dipakai jika tidak ada pemanggilan terkait.
- [ ] `host_permissions` dan `content_scripts.matches` dipersempit ke situs yang dibutuhkan. Tidak ada `<all_urls>` di ZIP Store.
- [ ] Izin opsional (`optional_host_permissions`) dipakai untuk host yang tidak selalu dibutuhkan.
- [ ] `web_accessible_resources` tidak ada, kecuali benar-benar dipakai untuk `src`/`getURL` di halaman.
- [ ] Ikon 16, 48, dan 128 tersedia dan benar.
- [ ] `description` jelas dan sesuai fungsi ekstensi.

## Kode dan keamanan

- [ ] Tidak ada `eval`, `new Function`, atau `document.write` di kode ekstensi.
- [ ] Tidak ada kode yang diunduh lalu dijalankan tanpa mekanisme yang diizinkan Web Store. Kode dari luar paket hanya lewat `chrome.userScripts`, dan sumbernya dicatat di audit.
- [ ] Tidak ada `createElement('script')` berisi kode dari luar di build Store.
- [ ] Tidak ada kredensial, token, atau password di kode atau di `chrome.storage` yang tidak perlu.
- [ ] Data dari halaman atau server yang masuk ke `innerHTML` sudah di-escape. Jika belum, catat jumlah titik dan rencana perbaikannya.
- [ ] Jembatan `postMessage` dari halaman ke background dibatasi asalnya dan tujuannya (lihat `X_FETCH_ALLOW`).
- [ ] Tidak ada `console.log` yang mencetak data sensitif.

## Build Web Store

- [ ] `python3 tools/build-store.py <folder>` berhasil tanpa error.
- [ ] `content.js` hasil build tidak memanggil fungsi yang sudah dibuang. Cek dengan membuka ZIP dan mencari setiap pemanggilan di dalam blok `FALLBACK-SCRIPT-TAG`.
- [ ] Manifest di dalam ZIP sudah sesuai daftar di atas (dicek langsung, bukan dari repo).
- [ ] Isi ZIP tidak memuat file yang tidak dipakai (folder `docs/`, `tools/`, `.github/`).

## Proses rilis

- [ ] Perubahan masuk `main` lewat PR, dan check `cek` lulus.
- [ ] Kenaikan versi di `manifest.json` hanya dilakukan setelah keputusan rilis disetujui pemilik.
- [ ] Setelah rilis, `docs/chrome-web-store.md` tetap sesuai dengan langkah yang dijalankan.

## Kebijakan privasi dan kepatuhan

- [ ] `privacy-policy.html` ada dan sesuai data yang benar-benar dikumpulkan ekstensi.
- [ ] Pengungkapan data di dashboard Web Store sesuai dengan perilaku ekstensi.
- [ ] Ekstensi tidak mengumpulkan data yang tidak diungkapkan di privacy policy.

## Kualitas

- [ ] Ada cara untuk menguji perubahan (test otomatis atau langkah manual yang tertulis).
- [ ] File tidak terduplikasi tanpa alasan. Stub yang sengaja dipertahankan diberi komentar alasannya.
