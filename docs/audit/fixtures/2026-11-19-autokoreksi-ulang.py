#!/usr/bin/env python3
"""Uji perilaku scripts/erzap_autokoreksi.js (audit ulang 2026-11-19, versi 1.13.5) di Chrome headless.

Server lokal meniru halaman /stok_opnams/proses_koreksi_so/<skenario>?page=N dengan beberapa variasi
perilaku Erzap yang belum diketahui pasti: handler Enter jQuery/inline, simpan lewat form POST, tabel
yang digambar ulang lewat AJAX, tabel yang dirender lambat, dan simpan yang gagal. Halaman uji mengisi
Nama Pengkoreksi & Tanggal lalu menekan START AUTO, dan melaporkan rangkuman ke server.

Skenario (hasil di 1.13.5):
  dasar        jQuery ada, tanpa handler Enter (jalur cadangan)       -> tiap halaman disimpan sekali
  jqkeydown    handler $(document).on('keydown') e.which === 13      -> tiap halaman disimpan DUA kali (temuan 1)
  jqkeypress   sama, event keypress                                  -> disimpan dua kali (temuan 1)
  inline       onkeypress="if(event.keyCode==13) ..."                 -> disimpan dua kali (temuan 1)
  jqkeyup      handler keyup (pembanding)                            -> disimpan sekali
  campur       sel Hasil SO produk ke-2 tanpa id="so..."             -> produk ke-2 tersimpan 0 (temuan 2)
  formpost     simpan = form.submit() (tanpa event submit), server 1 dtk -> disimpan dua kali (temuan 3)
  rerender     simpan AJAX menggambar ulang tabel, Simpan tetap ada,
               halaman berikutnya lambat 6 dtk                        -> halaman 1 disimpan dua kali (temuan 4)
  cekbalik     simpan hal 1 gagal (HTTP 500), lalu CEK SIMPAN dari
               halaman terakhir                                       -> "Semua halaman sudah tersimpan" (temuan 5)
  lambat       tabel & Simpan dirender JS 1,5 dtk setelah load        -> normal
  lambat3      sama, 3 dtk                                            -> hal 2 dilewati "Sudah tersimpan" (temuan 6)
  tanpareload  3 halaman, simpan tanpa muat ulang                     -> tiap halaman disimpan sekali

Pemakaian (dari root repo, macOS + Google Chrome):
  python3 docs/audit/fixtures/2026-11-19-autokoreksi-ulang.py [path erzap_autokoreksi.js] [skenario ...]
  Default: scripts/erzap_autokoreksi.js di repo ini, semua skenario (±7 menit).
jQuery 3.7.1 resmi diunduh sekali dari cdnjs ke folder temp dan dicek SHA-256-nya. Tidak ada data ERZAP asli.
Skrip uji hanya dimuat di frame teratas, sama seperti ekstensi (tanpa allFrames, @noframes).
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ARG = sys.argv[1:]
SCRIPT = os.path.abspath(ARG.pop(0)) if ARG and ARG[0].endswith('.js') else os.path.join(ROOT, 'scripts', 'erzap_autokoreksi.js')
JQ_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js'
JQ_SHA256 = 'fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a'
JQ = os.path.join(tempfile.gettempdir(), 'aistim-uji-jquery-3.7.1.min.js')


def siapkan_jquery():
    def cocok():
        with open(JQ, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest() == JQ_SHA256
    if os.path.exists(JQ) and cocok():
        return
    # curl bawaan macOS memakai sertifikat sistem (Python dari python.org sering belum punya CA)
    subprocess.run(['curl', '-sSfL', '--max-time', '60', '-o', JQ, JQ_URL], check=True)
    if not cocok():
        os.remove(JQ)
        sys.exit('jQuery hasil unduhan tidak cocok dengan SHA-256 yang diharapkan')


# produk: (id, teks sel Hasil SO, jumlah input koreksi, awalan id sel)
def P(pid, teks, n=1, pref='so'):
    return (pid, teks, n, pref)


SKENARIO = {
    'dasar': dict(pages={1: [P(1, '5', 2), P(2, '12')], 2: [P(3, '-2')]}, jq=True, detik=31),
    'jqkeydown': dict(pages={1: [P(1, '5', 2)], 2: [P(3, '7')]}, jq=True, enter='jqkeydown', detik=31),
    'jqkeypress': dict(pages={1: [P(1, '5', 2)]}, jq=True, enter='jqkeypress', detik=27),
    'inline': dict(pages={1: [P(1, '5', 2)]}, jq=True, enter='inline', detik=27),
    'jqkeyup': dict(pages={1: [P(1, '5', 2)]}, jq=True, enter='jqkeyup', detik=27),
    'campur': dict(pages={1: [P(1, '5'), P(2, '9', 1, 'hasil')]}, detik=27),
    'formpost': dict(pages={1: [P(1, '5')], 2: [P(2, '6')]}, jq=True, enter='jqkeyup', formpost=1.0, detik=35),
    'rerender': dict(pages={1: [P(1, '5')], 2: [P(2, '6')]}, reload=False, rerender=True, delay=6.0, detik=40),
    'cekbalik': dict(pages={1: [P(1, '5')], 2: [P(2, '6')]}, fail={1}, cek=True, detik=40),
    'lambat': dict(pages={1: [P(1, '5')], 2: [P(2, '6')]}, lambat=1.5, detik=45),
    'lambat3': dict(pages={1: [P(1, '5')], 2: [P(2, '6')]}, lambat=3.0, detik=50),
    'tanpareload': dict(pages={1: [P(1, '5')], 2: [P(2, '6')], 3: [P(3, '8')]}, reload=False, delay=0.8, detik=39),
}

state = {'tersimpan': set(), 'simpan': [], 'hasil': [], 'get': []}
kunci = threading.Lock()
T0 = [time.time()]


def halaman(sk, no):
    cfg = SKENARIO[sk]
    produk = cfg['pages'][no]
    baris = []
    enter = cfg.get('enter')
    for pid, teks, n, pref in produk:
        idsel = '%s%d' % (pref, pid)
        for k in range(n):
            sel = '<td id="%s" rowspan="%d">%s</td>' % (idsel, n, teks) if k == 0 else ''
            extra = ' onkeypress="if(event.keyCode==13){submit_form_koreksi_so();}"' if enter == 'inline' else ''
            baris.append('<tr>%s<td><input type="text" name="koreksi[%d][%d][jumlah_koreksi]" value="7"%s></td></tr>'
                         % (sel, pid, k, extra))
    jumlah = len(cfg['pages'])
    pag = '<li><a rel="prev" href="?page=%d">&lsaquo;</a></li>' % (no - 1) if no > 1 else ''
    pag += ''.join('<li class="%s"><a href="?page=%d">%d</a></li>' % ('active' if i == no else '', i, i)
                   for i in range(1, jumlah + 1))
    if no < jumlah:
        pag += '<li><a rel="next" href="?page=%d">&rsaquo;</a></li>' % (no + 1)
    simpan = '' if (sk, no) in state['tersimpan'] else '<div id="simpan" class="btn btn-primary">Simpan</div>'
    tbody = '\n'.join(baris)
    lambat = cfg.get('lambat')
    handler = ''
    if enter in ('jqkeydown', 'jqkeypress', 'jqkeyup'):
        handler = """$(document).on('%s', 'input[name*="jumlah_koreksi"]', function (e) {
  if (e.which === 13) { e.preventDefault(); submit_form_koreksi_so(); }
});""" % enter[2:]
    formtag = ('<form id="f" method="post" action="/simpanform/%s/%d" onsubmit="return false">' % (sk, no)
               if cfg.get('formpost') else '<form onsubmit="return false">')
    return """<!doctype html><html><head><meta charset="utf-8"><title>Koreksi SO uji</title>%(jq)s</head><body>
<div id="info_kasir">SENTOT UJI</div>
%(formtag)s
<input id="stok_opnam_pengkoreksi" type="text"> <input id="stok_opnam_tanggal_koreksi" type="text">
<div class="btn-group"><a class="btn btn-default" href="#">FIFO</a><a class="btn btn-default" href="#">DETAIL</a></div>
<table><tbody id="tb">%(tbody_html)s</tbody></table>
%(simpan_html)s
</form>
<ul class="pagination">%(pag)s</ul>
<script>
var TBODY = %(tbody_js)s, SIMPAN = %(simpan_js)s, LAMBAT = %(lambat)s, RELOAD = %(reload)s, RERENDER = %(rerender)s;
if (LAMBAT) setTimeout(function () { document.getElementById('tb').innerHTML = TBODY; document.getElementById('tempatSimpan').outerHTML = SIMPAN; }, LAMBAT * 1000);
function lapor(s) { fetch('/hasil', { method: 'POST', body: s }); }
function submit_form_koreksi_so() {
  if (%(formpost)s) { document.getElementById('f').submit(); return; }
  var nilai = Array.prototype.map.call(document.querySelectorAll('input[name*="jumlah_koreksi"]'), function (i) { return i.value; });
  fetch('/simpan/%(sk)s/%(no)d', { method: 'POST', body: JSON.stringify(nilai) }).then(function (r) {
    if (RELOAD && r.ok) location.reload();
    else if (RERENDER) document.getElementById('tb').innerHTML = TBODY;
  });
}
%(handler)s
if (window.top === window) (function () {
  new MutationObserver(function () {
    var m = document.getElementById('customAlertModal');
    if (m && !m.dataset.terkirim) {
      m.dataset.terkirim = '1';
      lapor('[rangkuman @' + location.search + '] ' + m.querySelector('p').textContent);
      if (%(cek)s && !sessionStorage.getItem('uji_cek') && /SO SELESAI|Belum selesai/.test(m.textContent)) {
        sessionStorage.setItem('uji_cek', '1');
        setTimeout(function () { m.querySelector('button.btn-success').click(); document.getElementById('cekSimpanBtn').click(); }, 500);
      }
    }
    var c = document.getElementById('cekSimpanModal');
    if (c && !c.dataset.terkirim) { c.dataset.terkirim = '1'; lapor('[cek simpan @' + location.search + '] ' + c.textContent); }
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
<script>if (window.top === window) document.write('<script src="/autokoreksi.js"><\\/script>');</script>
</body></html>""" % dict(jq='<script src="/jquery.js"></script>' if cfg.get('jq') else '',
                         formtag=formtag, tbody_html='' if lambat else tbody,
                         simpan_html='<span id="tempatSimpan"></span>' if lambat else simpan, pag=pag,
                         tbody_js=json.dumps(tbody), simpan_js=json.dumps(simpan), lambat=json.dumps(lambat or 0),
                         reload=json.dumps(cfg.get('reload', True)), rerender=json.dumps(bool(cfg.get('rerender'))),
                         sk=sk, no=no, handler=handler, formpost=json.dumps(bool(cfg.get('formpost'))),
                         cek=json.dumps(bool(cfg.get('cek'))))


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def kirim(self, body, tipe='text/html; charset=utf-8', code=200):
        b = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', tipe)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path in ('/autokoreksi.js', '/jquery.js'):
            with open(SCRIPT if u.path == '/autokoreksi.js' else JQ, encoding='utf-8') as f:
                return self.kirim(f.read(), 'text/javascript; charset=utf-8')
        bag = u.path.strip('/').split('/')
        if len(bag) == 3 and bag[:2] == ['stok_opnams', 'proses_koreksi_so'] and bag[2] in SKENARIO:
            no = int((parse_qs(u.query).get('page') or ['1'])[0])
            cfg = SKENARIO[bag[2]]
            with kunci:
                state['get'].append((round(time.time() - T0[0], 1), no))
            if cfg.get('delay') and no >= 2:
                time.sleep(cfg['delay'])
            with kunci:
                return self.kirim(halaman(bag[2], no))
        self.send_error(404)

    def do_POST(self):
        isi = self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode('utf-8')
        bag = self.path.strip('/').split('/')
        code = 200
        with kunci:
            if bag[0] == 'simpanform':
                sk, no = bag[1], int(bag[2])
                nilai = [v[0] for k, v in sorted(parse_qs(isi).items())]
                state['simpan'].append((round(time.time() - T0[0], 2), no, nilai))
                state['tersimpan'].add((sk, no))
            elif bag[0] == 'simpan':
                sk, no = bag[1], int(bag[2])
                state['simpan'].append((round(time.time() - T0[0], 2), no, json.loads(isi)))
                if no in SKENARIO[sk].get('fail', set()):
                    code = 500
                else:
                    state['tersimpan'].add((sk, no))
            elif bag[0] == 'hasil':
                state['hasil'].append(isi)
        if bag[0] == 'simpanform':
            time.sleep(SKENARIO[bag[1]]['formpost'])
            self.send_response(303)
            self.send_header('Location', '/stok_opnams/proses_koreksi_so/%s?page=%s' % (bag[1], bag[2]))
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        self.kirim('{}', 'application/json', code)


def main():
    pilih = ARG or list(SKENARIO)
    if any(SKENARIO[sk].get('jq') for sk in pilih):
        siapkan_jquery()
    srv = ThreadingHTTPServer(('127.0.0.1', 0), H)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print('Script:', SCRIPT)
    for sk in pilih:
        with kunci:
            state.update({'tersimpan': set(), 'simpan': [], 'hasil': [], 'get': []})
        T0[0] = time.time()
        profil = tempfile.mkdtemp(prefix='uji-autokoreksi-')
        url = 'http://127.0.0.1:%d/stok_opnams/proses_koreksi_so/%s' % (port, sk)
        p = subprocess.Popen([CHROME, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
                              '--user-data-dir=' + profil, '--remote-debugging-port=0', url],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(SKENARIO[sk]['detik'])
        p.terminate()
        try:
            p.wait(10)
        except subprocess.TimeoutExpired:
            p.kill()
        shutil.rmtree(profil, ignore_errors=True)
        with kunci:
            print('\n[%s]' % sk)
            print('  simpan (%d kali, [detik, halaman, nilai]): %s' % (len(state['simpan']), state['simpan']))
            for h in state['hasil'] or ['(tidak ada rangkuman)']:
                print('  ' + h[:300])
        sys.stdout.flush()
    srv.shutdown()


if __name__ == '__main__':
    main()
