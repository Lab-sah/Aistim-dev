#!/usr/bin/env python3
"""Pemindai pola reload, navigasi, request jaringan, dan timer untuk audit
docs/audit/2026-11-20-auto-reload-fetch.md.

Jalankan dari root repo:  python3 docs/audit/fixtures/2026-11-20-auto-reload-fetch.py [RELOAD|FETCH|TIMER]
Tanpa argumen: ketiga kategori.

- Script yang dipindai: daftar "scripts" di scripts/index.json dikurangi daftar "hapus"
  (stub kosong tidak dipindai), ditambah background/, content/, popup/.
- Baris lebih dari 400 karakter dilewati (library yang dibundel/minified, mis. SheetJS di crm.js).
- Nomor baris dihitung per karakter LF, sama dengan editor dan GitHub.
- Hasil pemindaian hanya daftar kandidat. Pemicu tiap kandidat (otomatis atau klik) tetap dibaca manual.
"""
import json
import re
import sys

POLA = {
    'RELOAD': r'location\.reload|location\.(assign|replace)\(|location\.href\s*=[^=]|window\.location\s*=[^=]'
              r'|history\.go\(|tabs\.reload|\.submit\(\)|requestSubmit\(',
    'FETCH': r'\bfetch\(|XMLHttpRequest|\$\.(ajax|get|post|getJSON)\(|GM_xmlhttpRequest|sendBeacon|EventSource'
             r'|WebSocket|createElement\([\'"]iframe|\.src\s*=|x-fetch|aistimFetch',
    'TIMER': r'setInterval\(|chrome\.alarms|visibilitychange|document\.hidden',
}


def berkas():
    idx = json.load(open('scripts/index.json', encoding='utf-8'))
    hapus = set(idx.get('hapus', []))
    aktif = sorted(f for f in idx.get('scripts', []) if f not in hapus)
    return ['scripts/' + f for f in aktif] + [
        'background/background.js', 'content/content.js', 'popup/popup.js']


def pindai(kategori):
    pola = re.compile(POLA[kategori])
    jumlah = 0
    for f in berkas():
        with open(f, 'rb') as fh:
            for i, baris in enumerate(fh.read().split(b'\n'), 1):
                if len(baris) > 400:
                    continue
                teks = baris.decode('utf-8', 'replace')
                if pola.search(teks):
                    jumlah += 1
                    print('%s:%d: %s' % (f, i, teks.strip()[:150]))
    return jumlah


if __name__ == '__main__':
    kat = [a.upper() for a in sys.argv[1:]] or list(POLA)
    for k in kat:
        print('### ' + k)
        n = pindai(k)
        print('(%d baris)\n' % n)
