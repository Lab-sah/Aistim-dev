#!/usr/bin/env python3
"""Bangun ZIP untuk Chrome Web Store dari manifest.json repo ini.

Beda dengan ZIP biasa (jalur "Load unpacked"/CRX):
  - buang "key" dan "update_url" (Web Store memakai kunci & mekanisme update sendiri -> update otomatis)
  - host/izin dipersempit: hanya Erzap (+ partdistro untuk jembatan fetch, + GitHub untuk sinkronisasi script)
  - izin yang tidak dipakai (activeTab) dibuang
  - tanpa web_accessible_resources: hanya dipakai fallback inject <script> yang ikut dibuang
  - content.js tanpa fallback inject <script> (blok FALLBACK-SCRIPT-TAG): Web Store tidak mengizinkan
    kode dari luar paket dijalankan selain lewat chrome.userScripts

Pemakaian: python3 tools/build-store.py [folder_output]
Hasil    : <folder_output>/Aistim-dev-store-<versi>.zip   (manifest.json di root zip)
"""
import json, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else ROOT
ERZAP = 'https://*.erzap.com/*'
HOSTS = [ERZAP, 'https://partdistro.com/*', 'https://raw.githubusercontent.com/*', 'https://api.github.com/*']

m = json.load(open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))
for k in ('key', 'update_url'):
    m.pop(k, None)
m['host_permissions'] = HOSTS
m['permissions'] = [p for p in m.get('permissions', []) if p != 'activeTab']
for cs in m.get('content_scripts', []):
    cs['matches'] = [ERZAP]
m.pop('web_accessible_resources', None)

assert 'key' not in m and 'update_url' not in m
assert '<all_urls>' not in json.dumps(m), 'masih ada <all_urls>'

# content.js: ganti blok fallback inject <script> dengan versi yang hanya memberi log
CONTENT = os.path.join('content', 'content.js')
src = open(os.path.join(ROOT, CONTENT), encoding='utf-8').read()
POLA = re.compile(r'  // ===== FALLBACK-SCRIPT-TAG MULAI =====\n.*?  // ===== FALLBACK-SCRIPT-TAG SELESAI =====\n', re.S)
assert len(POLA.findall(src)) == 1, 'penanda FALLBACK-SCRIPT-TAG di content.js tidak ditemukan'
content_store = POLA.sub(lambda _: (
    "  function fallbackDynamic() {\n"
    "    console.warn('[Aistim] Engine userScripts belum aktif. Nyalakan \"Izinkan skrip pengguna\" untuk Aistim Tool.');\n"
    "  }\n"), src)
assert 'createElement(\'script\')' not in content_store

zpath = os.path.join(OUT, 'Aistim-dev-store-%s.zip' % m['version'])
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json', json.dumps(m, indent=2, ensure_ascii=False) + '\n')
    for d in ('background', 'content', 'popup', 'icons', 'scripts'):
        for base, _, files in os.walk(os.path.join(ROOT, d)):
            for f in sorted(files):
                full = os.path.join(base, f)
                rel = os.path.relpath(full, ROOT)
                if rel == CONTENT:
                    z.writestr(rel, content_store)
                else:
                    z.write(full, rel)
print(zpath)
