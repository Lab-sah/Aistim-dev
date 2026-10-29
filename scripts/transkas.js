// ==UserScript==
// @name         ERZAP - Transfer Kas/Bank (Dropdown Cari & Format Nominal)
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Halaman Transfer Kas/Bank: dropdown bisa dicari (ketik untuk filter) dan kolom Nominal berformat "Rp 3,000" (angka polos yang dikirim saat Rekam/Simpan); tampilan responsive untuk layar sempit. Fitur diatur lewat AKSES_JSON (admin/private/public).
// @match        https://*.erzap.com/jurnals/form_transfer_kas_bank*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (!/\/jurnals\/form_transfer_kas_bank/.test(location.pathname)) return;
  if (window.__trankasLoaded) return;
  window.__trankasLoaded = true;

  // ====== HAK AKSES & FITUR (JSON) ======
  // "admin"   -> daftar nama yang SELALU bisa memakai SEMUA fitur (public maupun private).
  // "private" -> nama fitur yang HANYA boleh dipakai "admin". Nama fitur: dropdownCari, formatNominal, responsive.
  // "public"  -> nama fitur yang boleh dipakai SEMUA user yang membuka halaman ini.
  // Fitur yang tidak disebut di keduanya dianggap private (hanya admin).
  // Nama di "admin" dibaca dari tulisan "NAMA (JABATAN)" di pojok kanan bawah ERZAP. Cukup sebagian nama
  // (tidak peduli huruf besar/kecil); isi nama lengkap persis seperti di ERZAP agar tidak salah cocok dengan user lain.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada yang memakai fitur apa pun).
  // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script dan muat ulang halaman ERZAP.
  const AKSES_JSON = `{
    "admin": ["SENTOT ARI HANDOKO", "DIMAS", "PUGUH", "MANAJEMEN PUSAT", "SURYO", "CEO TIMORITEL", "SILVI", "WIWIT", "ISA", "ANIK"],
    "private": [],
    "public": ["dropdownCari", "formatNominal", "responsive"]
  }`;

  function bacaAkses() {
    try {
      const a = JSON.parse(AKSES_JSON) || {};
      return {
        admin: Array.isArray(a.admin) ? a.admin.map(String) : [],
        public: Array.isArray(a.public) ? a.public.map(String) : [],
      };
    } catch (err) {
      console.error('[transkas] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { admin: [], public: [] };
    }
  }
  const AKSES = bacaAkses();

  // dicek saat dipakai (bukan sekali di awal), karena nama kasir di pojok ERZAP bisa dimuat belakangan
  function bolehFitur(fitur) {
    if (AKSES.public.indexOf(fitur) !== -1) return true;
    const nama = (((document.getElementById('info_kasir') || {}).textContent) || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return AKSES.admin.some(u => {
      u = u.replace(/\s+/g, ' ').trim().toLowerCase();
      return !!u && nama.indexOf(u) !== -1;
    });
  }

  /* ---------- Util ---------- */

  function norm(s) {
    return (s || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function formatRupiah(digits) {
    if (!digits) return '';
    return 'Rp ' + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /* ---------- CSS ---------- */

  const CSS = `
    .trk-pop {
      position: fixed; z-index: 2147483000; background: #fff; color: #222;
      border: 1px solid #bbb; border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,.15); font-size: 13px;
      display: flex; flex-direction: column; box-sizing: border-box;
    }
    .trk-pop input { margin: 4px; padding: 6px 8px; border: 1px solid #ccc; border-radius: 3px; box-sizing: border-box; font-size: 13px; }
    .trk-pop ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
    .trk-pop li { padding: 6px 10px; cursor: pointer; }
    .trk-pop li.trk-active, .trk-pop li:hover { background: #2f80ed; color: #fff; }
    .trk-pop li.trk-empty { cursor: default; color: #888; }
  `;

  const CSS_RESPONSIVE = `
    @media (max-width: 768px) {
      form.new_jurnal { width: 100% !important; max-width: 100% !important; box-sizing: border-box; padding: 0 12px !important; }
      .transaksi_header { display: block !important; width: 100% !important; }
      .transaksi_header > div { float: none !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
      .transaksi_header .field { width: 100% !important; float: none !important; margin-bottom: 10px; }
      .transaksi_header input, .transaksi_header select, .transaksi_header textarea { width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
    }
  `;

  function injectCss() {
    if (document.getElementById('trk-style')) return;
    const st = document.createElement('style');
    st.id = 'trk-style';
    st.textContent = CSS + (bolehFitur('responsive') ? CSS_RESPONSIVE : '');
    document.head.appendChild(st);
  }

  /* ---------- Dropdown pencarian (delegasi, tanpa membungkus select) ---------- */

  let pop = null;        // elemen popup
  let popSelect = null;  // select yang sedang dibuka
  let suppressOpen = false; // cegah popup terbuka lagi karena fokus dikembalikan setelah pilih
  let items = [];        // {value,label}
  let activeIdx = -1;

  function isTargetSelect(el) {
    return el && el.tagName === 'SELECT' && !el.closest('.trk-pop') && bolehFitur('dropdownCari');
  }

  function openPopup(select) {
    closePopup(false);
    popSelect = select;
    items = Array.from(select.options)
      .filter(o => !o.disabled)
      .map(o => ({ value: o.value, label: o.textContent.trim() }));

    pop = document.createElement('div');
    pop.className = 'trk-pop';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ketik untuk mencari...';
    input.autocomplete = 'off';
    const list = document.createElement('ul');
    pop.appendChild(input);
    pop.appendChild(list);
    document.body.appendChild(pop);

    input.addEventListener('input', () => render(input.value, list));
    input.addEventListener('keydown', onKey);
    render('', list);
    place();
    input.focus();
  }

  function place() {
    if (!pop || !popSelect) return;
    const r = popSelect.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 220), vw - 16);
    let left = Math.max(8, Math.min(r.left, vw - width - 8));
    pop.style.width = width + 'px';
    pop.style.left = left + 'px';
    const below = vh - r.bottom;
    const maxH = Math.min(300, Math.max(120, below - 12));
    pop.style.maxHeight = maxH + 'px';
    if (below < 160 && r.top > 160) {
      pop.style.top = '';
      pop.style.bottom = (vh - r.top + 2) + 'px';
    } else {
      pop.style.bottom = '';
      pop.style.top = (r.bottom + 2) + 'px';
    }
    const ul = pop.querySelector('ul');
    if (ul) ul.style.maxHeight = (maxH - 40) + 'px';
  }

  function render(query, list) {
    const q = norm(query);
    const m = items.filter(it => q === '' || norm(it.label).includes(q));
    list.innerHTML = '';
    activeIdx = -1;
    if (!m.length) {
      const li = document.createElement('li');
      li.className = 'trk-empty';
      li.textContent = 'Tidak ada hasil';
      list.appendChild(li);
      return;
    }
    m.slice(0, 300).forEach(it => {
      const li = document.createElement('li');
      li.textContent = it.label;
      li.dataset.value = it.value;
      // pointerdown: berlaku untuk mouse maupun sentuhan (HP/tablet)
      li.addEventListener('pointerdown', e => { e.preventDefault(); choose(it.value); });
      list.appendChild(li);
    });
  }

  function moveActive(d) {
    const lis = Array.from(pop.querySelectorAll('li[data-value]'));
    if (!lis.length) return;
    activeIdx = (activeIdx + d + lis.length) % lis.length;
    lis.forEach((li, i) => li.classList.toggle('trk-active', i === activeIdx));
    lis[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Enter') {
      const lis = Array.from(pop.querySelectorAll('li[data-value]'));
      const t = lis[activeIdx] || lis[0] || null; // tanpa panah: pilih hasil pertama
      if (t) { e.preventDefault(); choose(t.dataset.value); }
    }
    else if (e.key === 'Escape') { e.preventDefault(); closePopup(true); }
    else if (e.key === 'Tab') { closePopup(false); }
  }

  function choose(value) {
    const sel = popSelect;
    if (sel) {
      sel.value = value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery) window.jQuery(sel).trigger('change');
    }
    closePopup(false);
    // Tutup dulu, lalu buang klik susulan (touch/mouse) yang jatuh ke elemen di bawah daftar
    suppressOpen = true;
    const swallow = e => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', swallow, true);
    setTimeout(() => {
      window.removeEventListener('click', swallow, true);
      suppressOpen = false;
    }, 600);
  }

  function closePopup(refocus) {
    const sel = popSelect;
    if (pop) pop.remove();
    pop = null;
    popSelect = null;
    if (refocus && sel && document.contains(sel)) {
      suppressOpen = true;
      try { sel.focus(); } catch (_) {}
      setTimeout(() => { suppressOpen = false; }, 300);
    }
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.trk-pop')) {
      try { document.activeElement.blur(); } catch (_) {}
    }
  }

  document.addEventListener('mousedown', e => {
    const sel = e.target.closest && e.target.closest('select');
    if (suppressOpen) {          // baru saja memilih: jangan buka lagi
      if (isTargetSelect(sel)) e.preventDefault();
      return;
    }
    if (isTargetSelect(sel)) {
      e.preventDefault();          // cegah dropdown native
      if (popSelect === sel && pop) { closePopup(true); return; }
      sel.focus();
      openPopup(sel);
      return;
    }
    if (pop && !(e.target.closest && e.target.closest('.trk-pop'))) closePopup(false);
  }, true);

  document.addEventListener('focusin', e => {
    if (suppressOpen) return;
    if (isTargetSelect(e.target) && popSelect !== e.target) openPopup(e.target);
  }, true);

  // Pilihan select dari keyboard (Tab ke select) juga pakai popup; blur tidak mengubah nilai
  window.addEventListener('scroll', () => { if (pop) place(); }, true);
  window.addEventListener('resize', () => { if (pop) place(); });

  /* ---------- Nominal Rp (sistem sama dengan saldokas.js) ---------- */

  // Yang tampil di kolom: "Rp 1,234,567" (otomatis saat mengetik).
  // Yang DIKIRIM ke server saat Rekam/Simpan: angka polos ("1234567") lewat input hidden ber-name asli,
  // jadi proses di ERZAP tidak terganggu dan tetap jalan walau Rekam lewat shortcut.

  function nominalEl() {
    return document.getElementById('jurnal_nominal');
  }

  function formatRupiahText(str) {
    const s = String(str).replace(/[^\d.]/g, '');
    const dot = s.indexOf('.');
    let int = dot >= 0 ? s.slice(0, dot) : s;
    const dec = dot >= 0 ? s.slice(dot + 1).replace(/\./g, '').slice(0, 2) : '';
    int = int.replace(/^0+(?=\d)/, '');
    if (!int && dot < 0) return { text: '', raw: '' };
    if (!int) int = '0';
    const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return { text: 'Rp ' + intFmt + (dot >= 0 ? '.' + dec : ''), raw: int + (dec ? '.' + dec : '') };
  }

  function setupNominal(input) {
    if (input.dataset.tmNominal || !input.name) return;
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = input.name; // nilai angka polos yang dikirim saat Rekam
    hidden.dataset.tmRaw = '1';
    input.parentNode.insertBefore(hidden, input.nextSibling);
    input.removeAttribute('name'); // kolom tampilan tidak ikut terkirim
    input.dataset.tmNominal = '1';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    // ERZAP memvalidasi input ber-class "number" sebagai angka; teks "Rp 1,000" akan ditolak
    // ("Masukan angka"). Class dilepas agar tampilan tetap "Rp 1,000" dan nilai terkirim lewat input hidden.
    input.classList.remove('number');

    input._tmTerapkan = (keepCaret) => {
      const pos = input.selectionStart;
      const sig = input.value.slice(0, pos == null ? input.value.length : pos).replace(/[^\d.]/g, '').length;
      const r = formatRupiahText(input.value);
      input.value = r.text;
      hidden.value = r.raw;
      if (keepCaret && document.activeElement === input) {
        let np = r.text ? 3 : 0; // setelah awalan "Rp "
        let c = 0;
        if (sig > 0) {
          np = r.text.length;
          for (let i = 0; i < r.text.length; i++) {
            if (/[\d.]/.test(r.text[i])) c++;
            if (c === sig) {
              np = i + 1;
              break;
            }
          }
        }
        input.setSelectionRange(np, np);
      }
    };
    input._tmRapikan = () => {
      // rapikan, mis. "Rp 12." -> "Rp 12"
      const r = formatRupiahText(hidden.value);
      input.value = r.text;
      hidden.value = r.raw;
    };
    if (input.value) input._tmTerapkan(false);
  }

  // Didaftarkan di window (capture) dan menghentikan event, supaya format bawaan ERZAP
  // tidak ikut mengubah nilai (itulah penyebab "Rp 300" berubah jadi "Rp 3.00")
  window.addEventListener('input', e => {
    const t = e.target;
    if (!t || t.id !== 'jurnal_nominal' || !t._tmTerapkan || !bolehFitur('formatNominal')) return;
    t._tmTerapkan(true);
    e.stopImmediatePropagation();
  }, true);

  window.addEventListener('blur', e => {
    const t = e.target;
    if (!t || t.id !== 'jurnal_nominal' || !t._tmRapikan || !bolehFitur('formatNominal')) return;
    t._tmRapikan();
    e.stopImmediatePropagation();
  }, true);

  /* ---------- Init ---------- */

  function init() {
    injectCss();
    const el = nominalEl();
    if (el && bolehFitur('formatNominal')) setupNominal(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
