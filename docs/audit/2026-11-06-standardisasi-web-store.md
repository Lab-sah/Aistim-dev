# Audit dan standardisasi Chrome Web Store — 2026-11-06

- Auditor: Copilot
- Repo: Lab-sah/Aistim-dev
- Snapshot yang diaudit: branch `fix/audit-angka-sensor`, commit `54d1e53`
- Versi manifest: `2.10.8`
- Ruang lingkup: manifest, izin, build ZIP Web Store, workflow release, privasi, background/content script, dan inventaris 26 userscript aktif serta 15 stub.
- Catatan kondisi saat audit: `scripts/auditanalisa.js` memiliki perubahan lokal yang belum di-commit. Perubahan itu tidak diubah oleh audit ini.
- Tidak diperiksa: setelan Dashboard Web Store, versi yang sedang dipublikasikan, privacy disclosure di Dashboard, route backend ERZAP, dan uji browser/login langsung.

## Ringkasan

ZIP Web Store berhasil dibuat dan pemeriksaan teknis paket lulus. Namun, paket belum bisa dinyatakan siap diajukan: ekstensi mengunduh JavaScript dari GitHub dan mendaftarkannya untuk dieksekusi; kebijakan privasi juga masih memiliki placeholder kontak. Keduanya perlu dibereskan atau dikonfirmasi sebelum publikasi. Lihat [kebijakan program Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies/policies/).

## Pemeriksaan standardisasi

| Area | Hasil | Catatan |
|---|---|---|
| Manifest V3, versi, dan ikon | Lulus secara lokal | Manifest v3, versi `2.10.8`; ikon 16, 48, dan 128 piksel tersedia. Versi di Dashboard tidak dapat diperiksa. |
| Izin paket Web Store | Lulus secara teknis | Paket menggunakan `storage`, `userScripts`, `alarms`; `activeTab` dihapus. |
| Host paket Web Store | Lulus secara teknis | Host wajib dibatasi ke ERZAP, GitHub, dan partdistro; CRM Aistim menjadi host opsional. Tidak ada `<all_urls>` di manifest hasil build. |
| Identitas paket | Lulus secara teknis | `key`, `update_url`, dan `web_accessible_resources` tidak ada dalam manifest ZIP. |
| Fallback eksekusi kode | Lulus secara teknis | Blok inject `<script>` dibuang dari `content.js`; fungsi `runDynamicScripts()` tetap tersedia sebagai stub. |
| Isi ZIP | Lulus secara teknis | ZIP berisi 51 file; `docs/`, `tools/`, dan `.github/` tidak ikut. |
| Sintaks dan metadata | Lulus | 44 file JavaScript berhasil diparse; `tools/cek_pr.py HEAD` lulus untuk pemeriksaan repo. |
| Kebijakan privasi | Belum siap | `privacy-policy.html` masih memuat `[NAMA PENGEMBANG]` dan `[ALAMAT KONTAK]`. URL publik dan data declaration Dashboard belum diverifikasi. |
| Kode yang dimuat dari luar paket | Perlu keputusan sebelum rilis | Lihat temuan 1. |
| Uji perilaku langsung | Belum diuji | Tidak dilakukan pada akun ERZAP atau Dashboard Web Store. |

## Temuan

| # | Tingkat | Lokasi | Temuan | Status |
|---|---|---|---|---|
| 1 | Tinggi | `background/background.js:108-110`, `:175-199`, `:316-321` | Ekstensi mengambil JavaScript dari `raw.githubusercontent.com` saat sinkronisasi lalu menjalankannya melalui `chrome.userScripts.register`. Sumber dan isi dapat berubah setelah ekstensi disetujui di Web Store; paket tidak memverifikasi hash atau tanda tangan. Ini berisiko bertentangan dengan persyaratan Chrome Web Store mengenai kode yang dijalankan dari luar paket. | Perlu keputusan arsitektur dan konfirmasi kebijakan sebelum rilis |
| 2 | Tinggi | `privacy-policy.html:97-98` | Nama pengembang dan alamat kontak masih berupa placeholder. Kebijakan privasi tidak siap dipublikasikan; alamat URL publik dan kecocokannya dengan Dashboard juga belum diverifikasi. | Terbuka |
| 3 | Sedang | `scripts/rekam.js:33-45`, `:88-89`, `:124-125`; `privacy-policy.html:69-71` | Sensor versi saat ini sudah menyamarkan password/token JSON, tetapi data pribadi lain dalam cuplikan respons, seperti nama pelanggan atau nomor telepon, tetap terlihat. Fitur hanya aktif setelah opt-in, tetapi keluaran dapat disalin atau diekspor pengguna. Kebijakan menyebut rekaman dan masking token/password, namun belum menjelaskan dengan tegas bahwa informasi pribadi lain dapat ikut tampil. | Terbuka |
| 4 | Sedang | `scripts/auditanalisa.js:127-136`, `:243-272` | Nilai baris yang tidak terbaca masih dapat ditampilkan sebagai nol di ringkasan. Perubahan lokal yang sedang menunggu commit mencegah beberapa pemeriksaan tertentu berjalan jika datanya hilang, tetapi tidak menghilangkan seluruh nilai nol palsu atau seluruh perhitungan dengan data tidak lengkap. | Terbuka; ada perbaikan parsial di worktree |
| 5 | Sedang | `scripts/erzap_rak_barang.js:62-68`, `:95-106` | Penghapusan rak massal memakai HTTP GET ke route `destroy`. Konfirmasi tersedia di UI, tetapi cara ini hanya aman bila perilaku server dan perlindungan CSRF sudah dipastikan. Kode backend tidak tersedia di repo ini. | Perlu verifikasi route server |

## Rekomendasi sebelum pengajuan Web Store

1. Putuskan model distribusi kode: pilihan paling aman untuk review adalah memasukkan kode yang akan dijalankan ke paket dan merilis perubahan lewat versi ekstensi. Sinkronisasi kode yang dapat berubah dari GitHub perlu dihapus atau mendapat konfirmasi resmi bahwa desain tersebut diterima untuk item ini.
2. Lengkapi kontak pengembang pada kebijakan privasi, publikasikan kebijakan di URL yang stabil, lalu cocokkan URL dan data declaration pada Dashboard.
3. Pertimbangkan penyamaran atau pengurangan data pribadi di cuplikan `rekam.js`; perbarui pengungkapan privasi agar sesuai dengan perilaku aktual.
4. Pastikan laporan Audit Analisa tidak mengganti data yang hilang dengan nol dan tidak menyimpulkan hasil dari tabel yang tidak lengkap.
5. Verifikasi endpoint penghapusan rak di backend; gunakan metode perubahan data yang sesuai dan perlindungan CSRF.
6. Setelah perubahan disetujui, bangun ulang ZIP dan periksa isi manifest serta `content.js` di paket hasil akhir. Jangan mengunggah ZIP CRX/unpacked biasa sebagai paket Web Store.

## Catatan pengujian

- `python3 tools/build-store.py /tmp/aistim-store-audit` berhasil. Hasil diperiksa langsung dari ZIP, lalu file sementara dibersihkan.
- Semua 44 file JavaScript di `background/`, `content/`, `popup/`, dan `scripts/` lolos parse melalui runtime Node bawaan Visual Studio Code.
- `python3 tools/cek_pr.py HEAD` lulus; catatan skrip tersebut adalah `node` tidak tersedia di shell sehingga langkah `node --check` internal dilewati.
- Uji sensor sintetis memastikan `password` dan `token` diganti `***`, sementara nama dan nomor telepon tetap terbaca.
- Pemeriksaan ini tidak mengubah kode aplikasi atau perubahan lokal yang sudah ada.
