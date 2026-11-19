#!/usr/bin/env python3
"""Uji perilaku scripts/erzap_autokoreksi.js di Chrome headless dengan halaman koreksi SO tiruan.

Server lokal meniru halaman /stok_opnams/proses_koreksi_so/<skenario>?page=N: tabel dengan sel Hasil SO
(td id="so..."), input jumlah_koreksi, tombol #simpan, pagination, dan fungsi submit_form_koreksi_so()
yang mengirim nilai input ke server lalu memuat ulang halaman (seperti Erzap). Halaman uji mengisi
Nama Pengkoreksi & Tanggal lalu menekan START AUTO, dan mengirim teks modal rangkuman ke server.

Skenario:
  ok       2 halaman, simpan berhasil (tombol Simpan hilang setelah disimpan)
  gagal    1 halaman, simpan selalu gagal (tombol Simpan tetap ada setelah dimuat ulang)
  strip    sel Hasil SO berisi "-"
  tanpaid  sel Hasil SO tanpa id="so..." (struktur tabel berubah)

Pemakaian (dari root repo):
  python3 docs/audit/fixtures/2026-11-19-autokoreksi.py [path erzap_autokoreksi.js] [detik_per_skenario]
  Default: scripts/erzap_autokoreksi.js di repo ini, 14 detik per skenario.
  Membandingkan dengan versi lama: git show 45c834c:scripts/erzap_autokoreksi.js > /tmp/lama.js, lalu
  jalankan dengan argumen /tmp/lama.js.
Butuh Google Chrome di /Applications (macOS). Tidak ada data ERZAP asli yang dipakai.
"""
import json, os, shutil, subprocess, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SCRIPT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, 'scripts', 'erzap_autokoreksi.js')
DETIK = float(sys.argv[2]) if len(sys.argv) > 2 else 14

# skenario -> {halaman: [(id produk, teks sel Hasil SO, jumlah input koreksi)]}
SKENARIO = {
    'ok': {1: [(1, '5', 2), (2, '1.200', 1)], 2: [(3, '-2', 1)]},
    'gagal': {1: [(1, '4', 1)]},
    'strip': {1: [(1, '5', 1), (2, '-', 1)]},
    'tanpaid': {1: [(1, '5', 1)]},
}
HARAPAN = {
    'ok': 'halaman 1 disimpan [5, 0, 1.200], halaman 2 disimpan [-2], masing-masing sekali; rangkuman SO SELESAI',
    'gagal': 'halaman 1 disimpan sekali, lalu berhenti: masih ada tombol Simpan setelah disimpan',
    'strip': 'tidak ada simpan; berhenti: Hasil SO tidak terbaca',
    'tanpaid': 'tidak ada simpan; berhenti: input koreksi tidak punya kolom Hasil SO',
}

state = {'tersimpan': set(), 'simpan': [], 'hasil': []}
kunci = threading.Lock()


def halaman(sk, no):
    produk = SKENARIO[sk][no]
    baris = []
    for pid, teks, n in produk:
        idsel = ('hasil%d' if sk == 'tanpaid' else 'so%d') % pid
        for k in range(n):
            sel = '<td id="%s" rowspan="%d">%s</td>' % (idsel, n, teks) if k == 0 else ''
            baris.append('<tr>%s<td><input type="text" name="koreksi[%d][%d][jumlah_koreksi]" value="7"></td></tr>'
                         % (sel, pid, k))
    jumlah = len(SKENARIO[sk])
    pag = '<li><a rel="prev" href="?page=%d">&lsaquo;</a></li>' % (no - 1) if no > 1 else ''
    pag += ''.join('<li class="%s"><a href="?page=%d">%d</a></li>' % ('active' if i == no else '', i, i)
                  for i in range(1, jumlah + 1))
    if no < jumlah:
        pag += '<li><a rel="next" href="?page=%d">&rsaquo;</a></li>' % (no + 1)
    simpan = '' if (sk, no) in state['tersimpan'] else '<div id="simpan" class="btn btn-primary">Simpan</div>'
    return """<!doctype html><html><head><meta charset="utf-8"><title>Koreksi SO uji</title></head><body>
<div id="info_kasir">SENTOT UJI</div>
<form onsubmit="return false">
<input id="stok_opnam_pengkoreksi" type="text"> <input id="stok_opnam_tanggal_koreksi" type="text">
<div class="btn-group"><a class="btn btn-default" href="#">FIFO</a><a class="btn btn-default" href="#">DETAIL</a></div>
<table><tbody>%s</tbody></table>
%s
</form>
<ul class="pagination">%s</ul>
<script>
function submit_form_koreksi_so() {
  var nilai = Array.prototype.map.call(document.querySelectorAll('input[name*="jumlah_koreksi"]'), function (i) { return i.value; });
  fetch('/simpan/%s/%d', { method: 'POST', body: JSON.stringify(nilai) }).then(function () { location.reload(); });
}
(function () {
  new MutationObserver(function () {
    var m = document.getElementById('customAlertModal');
    if (m && !m.dataset.terkirim) { m.dataset.terkirim = '1'; fetch('/hasil', { method: 'POST', body: m.querySelector('p').textContent }); }
  }).observe(document.body, { childList: true, subtree: true });
  if (sessionStorage.getItem('uji_mulai')) return;
  sessionStorage.setItem('uji_mulai', '1');
  setTimeout(function () {
    document.getElementById('stok_opnam_pengkoreksi').value = 'UJI';
    document.getElementById('stok_opnam_tanggal_koreksi').value = '19-11-2026';
    document.getElementById('startAutoBtn').click();
  }, 1000);
})();
</script>
<script src="/autokoreksi.js"></script>
</body></html>""" % ('\n'.join(baris), simpan, pag, sk, no)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def kirim(self, body, tipe='text/html; charset=utf-8'):
        b = body.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', tipe)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/autokoreksi.js':
            with open(SCRIPT, encoding='utf-8') as f:
                return self.kirim(f.read(), 'text/javascript; charset=utf-8')
        bag = u.path.strip('/').split('/')
        if len(bag) == 3 and bag[:2] == ['stok_opnams', 'proses_koreksi_so'] and bag[2] in SKENARIO:
            no = int((parse_qs(u.query).get('page') or ['1'])[0])
            with kunci:
                return self.kirim(halaman(bag[2], no))
        self.send_error(404)

    def do_POST(self):
        isi = self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode('utf-8')
        bag = self.path.strip('/').split('/')
        with kunci:
            if bag[0] == 'simpan':
                sk, no = bag[1], int(bag[2])
                state['simpan'].append((no, json.loads(isi)))
                if sk != 'gagal':
                    state['tersimpan'].add((sk, no))
            elif bag[0] == 'hasil':
                state['hasil'].append(isi)
        self.kirim('{}', 'application/json')


def main():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), H)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print('Script:', SCRIPT)
    for sk in SKENARIO:
        with kunci:
            state.update({'tersimpan': set(), 'simpan': [], 'hasil': []})
        profil = tempfile.mkdtemp(prefix='uji-autokoreksi-')
        url = 'http://127.0.0.1:%d/stok_opnams/proses_koreksi_so/%s' % (port, sk)
        p = subprocess.Popen([CHROME, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
                              '--user-data-dir=' + profil, '--remote-debugging-port=0', url],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(DETIK)
        p.terminate()
        try:
            p.wait(10)
        except subprocess.TimeoutExpired:
            p.kill()
        shutil.rmtree(profil, ignore_errors=True)
        with kunci:
            print('\n[%s] harapan: %s' % (sk, HARAPAN[sk]))
            print('  simpan (%d kali): %s' % (len(state['simpan']), state['simpan'][:6]))
            print('  rangkuman: %s' % (state['hasil'] or ['(tidak ada)']))
    srv.shutdown()


if __name__ == '__main__':
    main()
