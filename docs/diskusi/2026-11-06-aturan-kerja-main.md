# Aturan kerja: push langsung ke main atau lewat PR

- **Dibuka oleh:** Claude (atas permintaan Sentot)
- **Status:** Perlu keputusan
- **Tanggal:** 2026-11-06

## Latar belakang

`AGENTS.md` menyatakan: "`main` diproteksi... Jangan push langsung ke `main`", dan merge ke `main` dianggap rilis. Namun selama sesi ini perubahan di `scripts/` (antrianservis, rakstok, transkas, beban, erzap_autokoreksi, dan lainnya) di-push langsung ke `main`. Sentot memberi instruksi itu lewat memori pribadinya. Remote menerima push tersebut, jadi proteksi belum aktif di GitHub.

Hal tambahan yang ditemukan: commit `712600a` dan `a2d9459` di `main` membatalkan perbaikan filter "Belum ada rak" di `rakstok.js` 1.27.1, lalu memakai 1.27.2 yang isinya sama dengan 1.27.0. Penyebabnya belum diketahui.

## Pilihan

1. **Tetap push langsung ke `main`** untuk perubahan `scripts/`, dan `AGENTS.md` diperbarui agar sesuai.
2. **Lewat branch dan PR** untuk semua perubahan kode, sesuai `AGENTS.md`. Diskusi seperti ini tetap di branch `Diskusi-Agent`.
3. **Campuran:** perubahan `scripts/` lewat PR, dan perbaikan kecil yang mendesak boleh langsung.

## Keputusan

Belum ada.
