// ==UserScript==
// @name         ERZAP - Searchable select (combobox dengan pencarian)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Dropdown select di ERZAP dapat dicari (gaya seperti Transfer Kas/Bank). Fitur diatur lewat AKSES_JSON (public/private/role).
// @match        https://*.erzap.com/*
// @match        https://erzap.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  // ====== HAK AKSES & FITUR (JSON) ======
  // "public"  -> fitur yang boleh dipakai SEMUA user yang membuka halaman ini. Nama fitur: searchableSelect.
  // "private" -> fitur yang HANYA boleh dipakai role yang punya fitur itu (atau "*" = semua).
  // "role"    -> nama-nama role: "nama" = teks yang dicocokkan dengan #info_kasir (tanpa membedakan huruf besar/kecil,
  //              cukup sebagian nama; isi nama lengkap persis seperti di ERZAP), "fitur" = fitur private yang boleh dipakai role itu.
  // Fitur yang tidak disebut di "public" maupun "private" ditolak.
  // Catatan: ini hanya pengaturan tampilan di browser, BUKAN pengamanan.
  // Jika JSON salah ketik, akses ditutup (tidak ada fitur yang tampil untuk siapa pun).
  // Untuk mengubah akses/fitur: edit JSON di bawah ini lalu simpan script dan muat ulang halaman ERZAP.
  const AKSES_JSON = `{
    "public": ["searchableSelect"],
    "private": [],
    "role": {
      "pusat": {
        "nama": ["SENTOT", "SURYO", "MANAJEMEN PUSAT"],
        "fitur": ["*"]
      }
    }
  }`;

  function bacaAkses() {
    try {
      const a = JSON.parse(AKSES_JSON) || {};
      const role = a.role && typeof a.role === 'object' ? a.role : {};
      return {
        public: Array.isArray(a.public) ? a.public.map(String) : [],
        role: Object.keys(role).map(k => {
          const r = role[k] || {};
          return {
            nama: Array.isArray(r.nama) ? r.nama.map(String) : [],
            fitur: Array.isArray(r.fitur) ? r.fitur.map(String) : [],
          };
        }),
      };
    } catch (err) {
      console.error('[searchable_select] AKSES_JSON tidak valid -> akses ditutup:', err.message);
      return { public: [], role: [] };
    }
  }
  const AKSES = bacaAkses();

  // dicek saat dipakai (bukan sekali di awal), karena nama kasir di pojok ERZAP bisa dimuat belakangan.
  // Role dicocokkan urut dari atas; role pertama yang namanya cocok yang menentukan.
  function bolehFitur(fitur) {
    if (AKSES.public.indexOf(fitur) !== -1) return true;
    const nama = (((document.getElementById('info_kasir') || {}).textContent) || '').replace(/\s+/g, ' ').trim().toLowerCase();
    for (const r of AKSES.role) {
      const cocok = r.nama.some(u => {
        u = u.replace(/\s+/g, ' ').trim().toLowerCase();
        return !!u && nama.indexOf(u) !== -1;
      });
      if (cocok) return r.fitur.indexOf('*') !== -1 || r.fitur.indexOf(fitur) !== -1;
    }
    return false;
  }

  if (window.__trkV5) return;
  window.__trkV5 = true;
  if (!bolehFitur('searchableSelect')) return;

  const css = `
.trk5-pop{position:fixed;z-index:99999;background:#fff;border:1px solid #bbb;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,.15);font:13px system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;box-sizing:border-box;padding:4px;display:none}
.trk5-pop input{display:block;width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #bbb;border-radius:4px;outline:none;font:inherit;margin:0 0 2px 0}
.trk5-pop input:focus{border-color:#8ab4f8;box-shadow:0 0 0 2px rgba(138,180,248,.35)}
.trk5-pop ul{list-style:none;margin:0;padding:0;max-height:240px;overflow:auto}
.trk5-pop li{padding:8px 10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:3px;font-weight:400}
.trk5-pop li:hover,.trk5-pop li.act{background:#e8f0fe}
.trk5-pop .none{padding:8px 10px;color:#888}`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  const pop = document.createElement('div');
  pop.className = 'trk5-pop';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'Ketik untuk mencari...';
  inp.autocomplete = 'off';
  const ul = document.createElement('ul');
  pop.appendChild(inp);
  pop.appendChild(ul);
  document.body.appendChild(pop);

  let cur = null, act = -1, items = [];
  const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();

  const place = () => {
    if (!cur) return;
    const r = cur.getBoundingClientRect();
    const h = pop.offsetHeight, below = window.innerHeight - r.bottom;
    pop.style.left = Math.max(4, r.left) + 'px';
    pop.style.width = r.width + 'px';
    pop.style.top = (below < h + 8 && r.top > h ? r.top - h - 2 : r.bottom + 2) + 'px';
  };
  const close = () => { pop.style.display = 'none'; cur = null; act = -1; };
  const setAct = i => {
    if (!items.length) return;
    items.forEach(x => x.classList.remove('act'));
    act = (i + items.length) % items.length;
    items[act].classList.add('act');
    items[act].scrollIntoView({block: 'nearest'});
  };
  const choose = v => {
    if (!cur) return;
    const sel = cur;
    sel.value = v;
    sel.dispatchEvent(new Event('change', {bubbles: true}));
    close();
    sel.focus();
  };
  const filter = () => {
    const q = norm(inp.value);
    items = [];
    ul.innerHTML = '';
    [...cur.options].forEach(o => {
      if (!norm(o.text).includes(q)) return;
      const li = document.createElement('li');
      li.textContent = o.text;
      li.dataset.value = o.value;
      li.addEventListener('pointerdown', e => { e.preventDefault(); choose(o.value); });
      ul.appendChild(li);
      items.push(li);
    });
    if (!items.length) {
      const d = document.createElement('div');
      d.className = 'none';
      d.textContent = 'Tidak ada hasil';
      ul.appendChild(d);
    }
    act = -1;
    place();
  };
  const openFor = sel => {
    cur = sel;
    inp.value = '';
    pop.style.display = 'block';
    filter();
    inp.focus();
  };

  document.addEventListener('pointerdown', e => {
    const sel = e.target.closest && e.target.closest('select');
    if (sel) {
      if (sel.disabled) return;
      e.preventDefault();
      if (cur === sel) close(); else openFor(sel);
      return;
    }
    if (!pop.contains(e.target)) close();
  }, true);

  document.addEventListener('keydown', e => {
    const a = document.activeElement;
    if (a && a.tagName === 'SELECT' && !a.disabled && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openFor(a);
    }
  }, true);

  inp.addEventListener('input', filter);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct(act + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(act - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[act]) choose(items[act].dataset.value);
      else if (items.length) choose(items[0].dataset.value);
    }
    else if (e.key === 'Escape') { e.preventDefault(); const s = cur; close(); if (s) s.focus(); }
    else if (e.key === 'Tab') { close(); }
  });

  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
})();
