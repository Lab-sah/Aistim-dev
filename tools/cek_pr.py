#!/usr/bin/env python3
"""Cek perubahan sebelum merge ke main (dipakai workflow "Cek PR", bisa juga dijalankan lokal).

  - sintaks semua file .js (node --check; dilewati kalau node tidak ada)
  - scripts/index.json: file terdaftar ada, semua .js terdaftar, "hapus" bagian dari "scripts", tanpa duplikat
  - script aktif: header ==UserScript== dengan @name, @version x.y.z, @match; @name tidak ganda
  - stub (di "hapus"): @version 99.0.0, isi kosong
  - dibanding base: @version script yang diubah naik, @name script lama tidak diganti,
    "version" ekstensi naik bila file ekstensi berubah, VERSION di background/content = manifest

Pemakaian: python3 tools/cek_pr.py [base_ref]   (default: origin/main)
Ringkasan Markdown ditulis ke $GITHUB_STEP_SUMMARY bila ada (tampil di halaman PR -> Checks).
"""
import json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = sys.argv[1] if len(sys.argv) > 1 else 'origin/main'
EKSTENSI = ('manifest.json', 'background/', 'content/', 'popup/', 'icons/')
galat, catatan = [], []


def git(*args):
    return subprocess.run(['git', '-C', ROOT] + list(args), capture_output=True, text=True).stdout


def baca(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()


def meta(code):
    m = re.search(r'//\s*==UserScript==([\s\S]*?)//\s*==/UserScript==', code or '')
    if not m:
        return None
    ambil = lambda k: [v.strip() for v in re.findall(r'//\s*@' + k + r'\s+(.*)', m.group(1))]
    return {'name': (ambil('name') or [''])[0], 'version': (ambil('version') or [''])[0],
            'match': ambil('match') + ambil('include'), 'isi': code[m.end():]}


def angka(v):
    return [int(x) for x in re.findall(r'\d+', v)]


# 1. Sintaks JS
js = [os.path.join(d, f) for d in ('scripts', 'background', 'content', 'popup')
      for f in sorted(os.listdir(os.path.join(ROOT, d))) if f.endswith('.js')]
if shutil.which('node'):
    for f in js:
        r = subprocess.run(['node', '--check', os.path.join(ROOT, f)], capture_output=True, text=True)
        if r.returncode:
            galat.append('Sintaks `%s`: %s' % (f, (r.stderr.strip().splitlines() or ['?'])[-1]))
else:
    catatan.append('node tidak ada — cek sintaks dilewati')

# 2. index.json
try:
    idx = json.loads(baca('scripts/index.json'))
except ValueError as e:
    idx = {'scripts': [], 'hapus': []}
    galat.append('`scripts/index.json` bukan JSON valid: %s' % e)
S, H = idx.get('scripts', []), idx.get('hapus', [])
ada = sorted(f for f in os.listdir(os.path.join(ROOT, 'scripts')) if f.endswith('.js'))
for f in S:
    if f not in ada:
        galat.append('`%s` terdaftar di index.json tapi filenya tidak ada' % f)
for f in ada:
    if f not in S:
        galat.append('`scripts/%s` belum terdaftar di "scripts" index.json' % f)
for f in H:
    if f not in S:
        galat.append('`%s` ada di "hapus" tapi tidak di "scripts" (stub harus tetap terdaftar)' % f)
for daftar, nama in ((S, 'scripts'), (H, 'hapus')):
    for f in sorted({f for f in daftar if daftar.count(f) > 1}):
        galat.append('`%s` ganda di "%s"' % (f, nama))

# 3. Script aktif & stub
nama_aktif = {}
for f in S:
    if f not in ada:
        continue
    m = meta(baca('scripts/' + f))
    if not m:
        galat.append('`%s` tanpa header ==UserScript==' % f)
        continue
    if f in H:
        if m['version'] != '99.0.0':
            galat.append('Stub `%s` harus @version 99.0.0 (sekarang %s)' % (f, m['version']))
        if re.sub(r'//.*', '', m['isi']).strip():
            galat.append('Stub `%s` tidak kosong' % f)
        continue
    if not m['name']:
        galat.append('`%s` tanpa @name' % f)
    if not re.fullmatch(r'\d+\.\d+\.\d+', m['version']):
        galat.append('`%s` @version harus x.y.z (sekarang "%s")' % (f, m['version']))
    if not m['match']:
        galat.append('`%s` tanpa @match' % f)
    nama_aktif.setdefault(m['name'].lower(), []).append(f)
for n, fs in nama_aktif.items():
    if len(fs) > 1:
        galat.append('@name "%s" dipakai %s' % (n, ', '.join('`%s`' % f for f in fs)))

# 4. Dibanding base
if not git('rev-parse', '--verify', '--quiet', BASE).strip():
    catatan.append('base `%s` tidak ditemukan — cek perubahan dilewati' % BASE)
    ubah = []
else:
    ubah = [f for f in git('diff', '--name-only', BASE + '...HEAD').split('\n') if f]
baris = []
for f in ubah:
    if not (f.startswith('scripts/') and f.endswith('.js')) or not os.path.exists(os.path.join(ROOT, f)):
        continue
    baru = meta(baca(f))
    lama = meta(git('show', BASE + ':' + f))
    if not baru:
        continue
    file = f[len('scripts/'):]
    if not lama:
        baris.append('| `%s` | baru | `%s` — %s |' % (f, baru['version'], baru['name']))
        continue
    baris.append('| `%s` | `%s` → `%s` | %s |' % (f, lama['version'], baru['version'], baru['name']))
    if file in H:
        continue
    if lama['name'] != baru['name']:
        galat.append('`%s`: @name diganti ("%s" → "%s"). Ganti nama harus lewat file baru + stub (lihat README)'
                     % (f, lama['name'], baru['name']))
    if angka(baru['version']) <= angka(lama['version']):
        galat.append('`%s`: @version belum dinaikkan (%s)' % (f, baru['version']))

v_baru = json.loads(baca('manifest.json')).get('version', '')
try:
    v_lama = json.loads(git('show', BASE + ':manifest.json')).get('version', '')
except ValueError:
    v_lama = ''
perlu_rilis = [f for f in ubah if f.startswith(EKSTENSI)]
if perlu_rilis and v_lama and angka(v_baru) <= angka(v_lama):
    galat.append('File ekstensi berubah (%s) tapi "version" di manifest.json belum naik (%s)'
                 % (', '.join('`%s`' % f for f in perlu_rilis[:5]), v_baru))
for f, pola in (('background/background.js', r"const VERSION = '([^']+)'"), ('content/content.js', r"var VERSION = '([^']+)'")):
    m = re.search(pola, baca(f))
    if m and m.group(1) != v_baru:
        galat.append('VERSION di `%s` (%s) beda dengan manifest.json (%s)' % (f, m.group(1), v_baru))

# Ringkasan
out = ['## %s Cek PR' % ('❌' if galat else '✅'), '']
out.append('**Ekstensi:** `%s`%s' % (v_baru, (' (dari `%s`)' % v_lama) if v_lama and v_lama != v_baru else ''))
out.append('**Perlu update ekstensi:** %s' % ('ya — rilis baru, zip store diunggah ke Web Store' if perlu_rilis
                                             else 'tidak — hanya script, berlaku ±1 menit setelah merge'))
out.append('**Script aktif:** %d, stub: %d' % (len([f for f in S if f not in H]), len(H)))
if baris:
    out += ['', '| Script | Versi | Nama |', '|---|---|---|'] + baris
if galat:
    out += ['', '### Perlu diperbaiki'] + ['- ' + g for g in galat]
if catatan:
    out += ['', '### Catatan'] + ['- ' + c for c in catatan]
teks = '\n'.join(out) + '\n'
print(teks)
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
        f.write(teks)
sys.exit(1 if galat else 0)
