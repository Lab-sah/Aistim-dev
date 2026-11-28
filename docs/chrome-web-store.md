# Chrome Web Store

Update otomatis = lewat Web Store (Chrome memperbarui sendiri begitu versi baru disetujui).

1. Naikkan `version` di `manifest.json`, push ke `main`.
2. Workflow Release membuat `Aistim-dev-store-<versi>.zip` (manifest tanpa `key`/`update_url`, izin hanya Erzap, partdistro, GitHub (+ CRM `*.aistim.icu` sebagai izin opsional yang diminta lewat popup), tanpa `activeTab`;
   `content.js` tanpa fallback inject `<script>` yang tidak diizinkan Web Store).
3. Unggah zip itu di Dashboard -> Paket -> "Upload paket baru" -> kirim untuk review.
4. Perubahan **script** (folder `scripts/`) tidak perlu review: tersinkron otomatis dari GitHub `main`.

Bangun manual: `python3 tools/build-store.py <folder_output>`.

Jangan aktifkan "Upload CRX terverifikasi" (memaksa semua upload berikutnya bertanda tangan kunci pribadi).

## Unggah otomatis (GitHub Actions)

Workflow `Release` mengunggah zip store dan mengirimnya untuk review **setiap kali versi di `manifest.json` naik**
(hanya jika secret di bawah terisi: `CWS_PUBLISHER_ID` + service account, atau + tiga secret OAuth). Review dari Google tetap berjalan. Versi harus lebih tinggi dari yang sudah ada di store.

### Cara 1 (disarankan): service account
Tanpa OAuth Playground, tanpa refresh token, tidak kedaluwarsa.
1. Google Cloud Console -> project yang sama -> pastikan "Chrome Web Store API" sudah **Enable**.
2. IAM & Admin -> **Service Accounts** -> *Create service account* (tanpa role/izin apa pun) -> salin emailnya (`...@<project>.iam.gserviceaccount.com`).
3. Klik service account itu -> tab **Keys** -> *Add key* -> *Create new key* -> **JSON** -> file `.json` terunduh.
4. Dashboard Web Store -> **Account** -> bagian *Service accounts* -> tambahkan email dari langkah 2 (hanya 1 service account per publisher).
5. GitHub secret `CWS_SERVICE_ACCOUNT` = **seluruh isi** file JSON:
   `gh secret set CWS_SERVICE_ACCOUNT -R devtim-lab/Aistim-dev < file-kunci.json` lalu hapus file JSON-nya.
6. `CWS_PUBLISHER_ID` tetap diperlukan. Kalau `CWS_SERVICE_ACCOUNT` terisi, `CWS_CLIENT_ID/SECRET/REFRESH_TOKEN` tidak dipakai.

### Cara 2: OAuth client + refresh token (sekali saja)
1. Google Cloud Console -> buat/pilih project -> **Enable** "Chrome Web Store API".
2. OAuth consent screen: tipe External, tambahkan email penerbit sebagai *Test user*.
3. Credentials -> Create **OAuth client ID** tipe *Web application*, redirect URI `https://developers.google.com/oauthplayground`.
   Catat Client ID dan Client Secret.
4. Buka https://developers.google.com/oauthplayground -> roda gigi -> centang *Use your own OAuth credentials* -> isi Client ID/Secret ->
   masukkan scope `https://www.googleapis.com/auth/chromewebstore` -> Authorize (login dengan akun pemilik item) -> *Exchange authorization code for tokens* -> salin **Refresh token**.
5. Dashboard Web Store -> Publisher -> Settings -> salin **Publisher ID**.
6. GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret:
   `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_PUBLISHER_ID`.

### Catatan
- Unggahan pertama (dan setelah mengubah visibilitas/Privasi di dashboard) lakukan manual sekali lewat dashboard; API memakai pengaturan visibilitas yang ada.
- Uji manual kapan saja: Actions -> Release -> *Run workflow* -> centang `publish_store`.
- Perubahan hanya di folder `scripts/` tidak butuh Web Store: tersinkron otomatis dari GitHub.

## Aistim Board (repo terpisah, diunggah dari sini)

Aistim Board (`Lab-sah/Aistim.board`) adalah extension tab baru dengan item Web Store sendiri. Kodenya tetap di repo Aistim.board, karena file `main.json` / `quotes.json` dan alamat GitHub yang tertanam di extension yang sudah terpasang dilayani repo itu. Unggah ke toko dilakukan dari repo ini supaya cukup satu tempat:

1. Naikkan `version` di `extension/manifest.json` repo Aistim.board dan merge di sana (toko menolak versi yang sama atau lebih rendah).
2. Actions -> **Web Store Board** -> *Run workflow* (isi `ref` bila bukan `main`; centang `terbitkan` bila langsung dikirim review).
3. Workflow mengambil repo Aistim.board, menjalankan tesnya, membuat zip Web Store (`tools/build-webstore.py`: tanpa `key`, tanpa pemeriksa pembaruan GitHub), menyimpannya sebagai artifact, lalu mengunggahnya.

Secret repo Aistim-dev yang dibutuhkan (isinya sama dengan secret `CWS_*` di repo Aistim.board): `BOARD_CWS_EXTENSION_ID`, `BOARD_CWS_CLIENT_ID`, `BOARD_CWS_CLIENT_SECRET`, `BOARD_CWS_REFRESH_TOKEN`. Bila belum lengkap, job hanya membuat zip untuk diunggah manual di Developer Dashboard.

Workflow ini hanya mengunggah ke Web Store: tidak membuat rilis GitHub, CRX, atau `updates.xml`, dan tidak menyentuh rilis Aistim Tool (`release.yml`).
