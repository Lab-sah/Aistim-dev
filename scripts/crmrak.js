// ==UserScript==
// @name         CRM Setrak - Pilih Rak per Produk
// @namespace    http://tampermonkey.net/
// @version      1.2.1
// @description  Tambah tombol "Setrak" di tiap baris Master Produk; klik untuk memilih rak lewat popup.
// @match        https://crm.aistim.icu/penentuan-rak/gudang/*/produk*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=aistim.icu
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ====== HAK AKSES & FITUR (JSON) ======
  // "public" -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini. Nama fitur: setrakRak (tombol Setrak per produk).
  // Fitur yang tidak disebut di "public" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
  // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script dan muat ulang halaman CRM.
  const AKSES_JSON = `{
    "public": ["setrakRak"]
  }`;

  function bacaAkses() {
    try {
      const a = JSON.parse(AKSES_JSON) || {};
      return { public: Array.isArray(a.public) ? a.public.map(String) : [] };
    } catch (err) {
      console.error('[crmrak] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { public: [] };
    }
  }
  const AKSES = bacaAkses();

  function bolehFitur(fitur) {
    return AKSES.public.indexOf(fitur) !== -1;
  }

  const m = location.pathname.match(/\/penentuan-rak\/gudang\/(\d+)\/produk/);
  if (!m) return;
  const GUDANG = m[1];
  const BASE = '/penentuan-rak';
  let racks = null;

  // Warna & font mengikuti tampilan CRM (Inter, merah #E60023 untuk tombol utama)
  const C = {
    text: '#344054',
    muted: '#667085',
    border: '#D0D5DD',
    line: '#EAECF0',
    primary: '#E60023',
    primaryHover: '#C4001E',
    white: '#FFFFFF',
    hover: '#F9FAFB',
    msgOk: '#039855',
    msgErr: '#D92D20',
  };
  const FONT = 'Inter, sans-serif';

  // Responsif: desktop = popup di tengah; mobile = popup jadi bottom sheet layar penuh
  function injectStyle() {
    if (document.getElementById('setrak-style')) return;
    const st = document.createElement('style');
    st.id = 'setrak-style';
    st.textContent = `
      #setrak-ov .sr-box { width: min(420px, 92vw); }
      #setrak-ov .sr-list { max-height: 50vh; }
      .btn-setrak { min-height: 32px; min-width: 56px; }
      @media (max-width: 640px) {
        #setrak-ov { align-items: flex-end !important; }
        #setrak-ov .sr-box { width: 100vw !important; max-width: 100vw; max-height: 85vh !important; border-radius: 16px 16px 0 0 !important; }
        #setrak-ov .sr-list { max-height: none; flex: 1; }
        #setrak-ov input { font-size: 16px !important; }
        #setrak-ov button { min-height: 40px; }
        .btn-setrak { min-height: 36px; min-width: 64px; font-size: 12px !important; }
      }
    `;
    document.head.appendChild(st);
  }
  injectStyle();

  const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

  async function loadRacks() {
    if (racks) return racks;
    const all = [];
    for (let p = 1; p <= 60; p++) {
      const html = await fetch(`${BASE}/rak?gudang=${GUDANG}&page=${p}`, { credentials: 'same-origin' }).then(r => r.text());
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const rows = [...doc.querySelectorAll('main table tbody tr[data-id]')];
      if (!rows.length) break;
      rows.forEach(tr => all.push({
        id: tr.dataset.id,
        kode: tr.querySelector('.so-nama')?.textContent.trim() || '',
        n: (tr.querySelector('.ba-hp')?.textContent.match(/(\d+) produk/) || [])[1] || '0',
      }));
    }
    racks = all;
    return racks;
  }

  function closePopup() {
    document.getElementById('setrak-ov')?.remove();
  }

  function openPopup(produkId, label) {
    closePopup();
    const ov = document.createElement('div');
    ov.id = 'setrak-ov';
    ov.style.cssText = `position:fixed;inset:0;background:rgba(16,24,40,.6);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:${FONT}`;
    ov.innerHTML =
      `<div class="sr-box" style="background:${C.white};color:${C.text};border-radius:12px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 24px -4px rgba(16,24,40,.08),0 8px 8px -4px rgba(16,24,40,.03);font-size:14px">` +
      `<div style="padding:16px 20px;border-bottom:1px solid ${C.line}"><div style="font-weight:600;font-size:16px">Pilih Rak</div><div id="sr-sub" style="font-size:12px;color:${C.muted};margin-top:2px"></div></div>` +
      `<input id="sr-q" placeholder="Cari kode rak…" style="margin:12px 20px;padding:8px 12px;border:1px solid ${C.border};border-radius:8px;font-size:14px;font-family:${FONT};color:${C.text};outline:none">` +
      `<div id="sr-list" class="sr-list" style="overflow:auto;padding:0 10px 8px;flex:1;color:${C.muted}">Memuat rak…</div>` +
      `<div id="sr-msg" style="padding:8px 20px;font-size:12px;min-height:18px"></div>` +
      `<div style="padding:12px 20px;border-top:1px solid ${C.line};text-align:right"><button id="sr-close" style="padding:8px 14px;border-radius:8px;border:1px solid ${C.border};background:${C.white};color:${C.text};font-family:${FONT};font-size:12px;font-weight:600;cursor:pointer">Tutup</button></div>` +
      `</div>`;
    document.body.appendChild(ov);
    ov.querySelector('#sr-sub').textContent = label;
    ov.addEventListener('click', e => { if (e.target === ov) closePopup(); });
    ov.querySelector('#sr-close').onclick = closePopup;

    const list = ov.querySelector('#sr-list');
    const msg = ov.querySelector('#sr-msg');

    const render = (all, q) => {
      list.innerHTML = '';
      all.filter(r => !q || r.kode.toLowerCase().includes(q.toLowerCase())).slice(0, 200).forEach(r => {
        const b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = `display:flex;justify-content:space-between;align-items:center;width:100%;padding:8px 10px;border:0;background:none;border-radius:6px;cursor:pointer;font-size:12px;font-family:${FONT};font-weight:600;color:${C.text}`;
        b.innerHTML = `<span></span><small style="font-weight:400;color:${C.muted}"></small>`;
        b.firstChild.textContent = r.kode;
        b.lastChild.textContent = r.n + ' produk';
        b.onmouseenter = () => (b.style.background = C.hover);
        b.onmouseleave = () => (b.style.background = 'none');
        b.onclick = async () => {
          msg.style.color = C.text;
          msg.textContent = 'Menyimpan…';
          try {
            const res = await fetch(`${BASE}/gudang/${GUDANG}/scan`, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrf() },
              body: JSON.stringify({ rak_id: Number(r.id), produk_id: Number(produkId) }),
            });
            const j = await res.json().catch(() => ({}));
            if (res.ok) {
              msg.style.color = C.msgOk;
              msg.textContent = 'Tersimpan ke ' + r.kode;
              setTimeout(() => location.reload(), 700);
            } else {
              msg.style.color = C.msgErr;
              msg.textContent = 'Gagal (' + res.status + '): ' + (j.message || 'coba lagi');
            }
          } catch (err) {
            msg.style.color = C.msgErr;
            msg.textContent = 'Error: ' + err.message;
          }
        };
        list.appendChild(b);
      });
      if (!list.children.length) list.textContent = 'Rak tidak ditemukan';
    };

    loadRacks().then(all => {
      render(all, '');
      ov.querySelector('#sr-q').oninput = e => render(all, e.target.value);
      ov.querySelector('#sr-q').focus();
    }).catch(err => {
      list.textContent = 'Gagal memuat rak: ' + err.message;
    });
  }

  function addButtons() {
    const thead = document.querySelector('main table thead tr');
    if (thead && !thead.querySelector('.th-setrak')) {
      const th = document.createElement('th');
      th.className = 'th-setrak';
      th.textContent = 'Aksi';
      th.style.cssText = thead.querySelector('th')?.getAttribute('style') || '';
      thead.appendChild(th);
    }
    document.querySelectorAll('main table tbody tr[data-id]').forEach(tr => {
      if (tr.querySelector('.btn-setrak')) return;
      const td = document.createElement('td');
      td.style.whiteSpace = 'nowrap';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-setrak';
      b.textContent = 'Setrak';
      b.style.cssText = `padding:5px 10px;border-radius:6px;border:0;background:${C.primary};color:${C.white};cursor:pointer;font-family:${FONT};font-size:11px;font-weight:600`;
      b.onmouseenter = () => (b.style.background = C.primaryHover);
      b.onmouseleave = () => (b.style.background = C.primary);
      b.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openPopup(tr.dataset.id, (tr.querySelector('.so-nama')?.textContent || '').trim());
      });
      td.appendChild(b);
      tr.appendChild(td);
    });
  }

  if (bolehFitur('setrakRak')) addButtons();
  // Tabel diganti saat pindah halaman / filter (AJAX), jadi pasang ulang tombolnya.
  new MutationObserver(() => { if (bolehFitur('setrakRak')) addButtons(); }).observe(document.body, { childList: true, subtree: true });
})();
